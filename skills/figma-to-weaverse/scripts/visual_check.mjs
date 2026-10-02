#!/usr/bin/env node
// Visual + structural check of a rendered Weaverse page against its Figma design.
//
// Usage (run from the storefront repo so Playwright resolves from its node_modules):
//   node <skill>/scripts/visual_check.mjs <spec.json> [--only <block,...>] [--out <dir>] [--url <page url>]
//   (--url re-runs the same spec against another host, e.g. the deployed storefront)
//
// The spec (see references/visual-check.md) lists the page URL, viewports, the
// expected section order, and per-block selectors with Figma reference images.
// For every viewport the script:
//   - loads the page, dismisses popups, scrolls to trigger lazy content
//   - runs hard checks: JS errors, broken images, horizontal overflow, H1 count,
//     section order, missing blocks, rounded elements clipped by an ancestor
//   - screenshots each block and, when a reference image exists, scores it:
//     aspect-ratio drift + perceptual pixel mismatch, and writes a diff heatmap
// Writes <out>/report.json and <out>/report.md; exits 1 when anything fails.
//
// Needs Playwright with Chromium. If it is missing:
//   npm i --no-save playwright && npx playwright install chromium

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const specPath = args.find((a) => !a.startsWith("--"));
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
if (!specPath) {
  console.error("Usage: visual_check.mjs <spec.json> [--only block,...] [--out dir]");
  process.exit(2);
}

async function loadPlaywright() {
  const roots = [join(process.cwd(), "package.json"), import.meta.url];
  for (const root of roots) {
    try {
      const require = createRequire(root);
      const resolved = require.resolve("playwright");
      const mod = await import(pathToFileURL(resolved).href);
      return mod.chromium ? mod : mod.default;
    } catch {}
  }
  console.error(
    "Playwright not found. From the storefront repo run:\n" +
      "  npm i --no-save playwright && npx playwright install chromium",
  );
  process.exit(2);
}

const spec = JSON.parse(await readFile(specPath, "utf8"));
const specDir = dirname(resolve(specPath));
const only = flag("only")?.split(",").map((s) => s.trim());
const url = flag("url") ?? spec.url;
const outDir = resolve(
  flag("out") ?? spec.out ?? join(specDir, "visual", flag("url") ? `${spec.name ?? "page"}-remote` : (spec.name ?? "page")),
);
const DEFAULT_THRESHOLD = spec.threshold ?? 0.12;
const DEFAULT_ASPECT_TOLERANCE = spec.aspectTolerance ?? 0.08;
const viewports = spec.viewports ?? [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];
const hideSelectors = spec.hide ?? ["[role=dialog]", "[data-radix-portal]"];

const { chromium } = await loadPlaywright();
const browser = await chromium.launch().catch((error) => {
  console.error(
    `${String(error.message).split("\n")[0]}\n` +
      "Install the browser for the resolved Playwright version:\n  npx playwright install chromium",
  );
  process.exit(2);
});
const report = { url, createdAt: new Date().toISOString(), viewports: [] };
let failed = false;

for (const vp of viewports) {
  const vpDir = join(outDir, vp.name);
  await mkdir(vpDir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message ?? e).slice(0, 300)));
  const badResponses = [];
  page.on("response", (r) => {
    if (r.request().resourceType() === "image" && r.status() >= 400) {
      badResponses.push(`${r.status()} ${r.url()}`);
    }
  });

  await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
  // Scroll through the page so lazy images and scroll-reveal sections render.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 400) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(spec.settleMs ?? 1500);
  await page.addStyleTag({
    content: `${hideSelectors.join(",")}{display:none!important}
      *,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}`,
  });

  const page_ = await page.evaluate(
    ({ sectionSelector }) => {
      const doc = document.documentElement;
      const isClipped = (el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) return null;
        const radius = Number.parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
        if (radius < 2) return null;
        let p = el.parentElement;
        while (p && p !== document.body) {
          const cs = getComputedStyle(p);
          // A scroll container (rail/carousel) clips on purpose: items past the
          // edge are reachable by scrolling, so stop looking further up.
          if (/(auto|scroll)/.test(cs.overflowX)) {
            return null;
          }
          if (/(hidden|clip)/.test(cs.overflowX + cs.overflowY)) {
            const pr = p.getBoundingClientRect();
            const cut = Math.max(pr.left - r.left, r.right - pr.right, 0);
            // Partly visible and cut: the rounded edge is lost. Fully hidden
            // items (e.g. inactive slides) are not reported.
            if (cut > 1 && r.right > pr.left && r.left < pr.right) {
              return Math.round(cut);
            }
          }
          p = p.parentElement;
        }
        return null;
      };
      const sections = [...document.querySelectorAll(sectionSelector)].map(
        (s) => s.getAttribute("data-wv-type") ?? s.tagName.toLowerCase(),
      );
      const clipped = [];
      for (const el of document.querySelectorAll("main *")) {
        const cut = isClipped(el);
        if (cut) {
          const owner = el.closest("[data-wv-id]");
          clipped.push({
            cut,
            element: `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`,
            section: owner?.getAttribute("data-wv-type"),
            id: owner?.getAttribute("data-wv-id"),
          });
        }
      }
      return {
        overflowX: doc.scrollWidth - window.innerWidth,
        h1: [...document.querySelectorAll("h1")].map((h) => h.innerText.trim()),
        brokenImages: [...document.querySelectorAll("main img")]
          .filter((i) => i.complete && i.naturalWidth === 0)
          .map((i) => i.currentSrc || i.src),
        sections,
        clipped: clipped.slice(0, 20),
      };
    },
    { sectionSelector: spec.sectionSelector ?? "main [data-wv-type='main'] > [data-wv-type]" },
  );

  const checks = [];
  const check = (name, ok, detail) => {
    checks.push({ name, ok, detail });
    if (!ok) failed = true;
  };
  check("no JS errors", errors.length === 0, errors);
  check("no broken images", page_.brokenImages.length === 0 && badResponses.length === 0, [
    ...page_.brokenImages,
    ...badResponses,
  ]);
  check("no horizontal overflow", page_.overflowX <= 1, `${page_.overflowX}px`);
  if (spec.expect?.h1 !== undefined) {
    check(`exactly ${spec.expect.h1} H1`, page_.h1.length === spec.expect.h1, page_.h1);
  }
  if (spec.expect?.sections) {
    check(
      "section order",
      JSON.stringify(page_.sections) === JSON.stringify(spec.expect.sections),
      { expected: spec.expect.sections, actual: page_.sections },
    );
  }
  check("no clipped rounded elements", page_.clipped.length === 0, page_.clipped);

  const blocks = [];
  for (const block of spec.blocks ?? []) {
    if (only && !only.includes(block.name)) continue;
    if (block.viewports && !block.viewports.includes(vp.name)) continue;
    const locator = page.locator(block.selector).first();
    const result = { name: block.name, selector: block.selector };
    blocks.push(result);
    if ((await locator.count()) === 0) {
      result.ok = false;
      result.error = "selector matched nothing";
      failed = true;
      continue;
    }
    await locator.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const shotPath = join(vpDir, `${block.name}.png`);
    await locator.screenshot({ path: shotPath, animations: "disabled" });
    result.screenshot = shotPath;
    const box = await locator.boundingBox();
    result.size = box ? [Math.round(box.width), Math.round(box.height)] : null;

    const refKey = vp.name === "desktop" ? "reference" : `reference${vp.name[0].toUpperCase()}${vp.name.slice(1)}`;
    const refFile = block[refKey];
    if (!refFile) {
      result.ok = true;
      result.mode = "structure";
      continue;
    }
    if (block.mode === "structure") {
      // Content is data (live feed, products), so pixels can't match — but the
      // block must still occupy the designed footprint. An empty feed or a
      // collapsed grid shows up as aspect drift.
      const png = await readFile(resolve(specDir, refFile));
      const refAspect = png.readUInt32BE(20) / png.readUInt32BE(16);
      const aspectDrift = box ? Math.abs(box.height / box.width - refAspect) / refAspect : 1;
      const aspectTolerance = block.aspectTolerance ?? DEFAULT_ASPECT_TOLERANCE;
      Object.assign(result, {
        mode: "structure",
        aspectDrift: Number(aspectDrift.toFixed(3)),
        aspectTolerance,
        ok: aspectDrift <= aspectTolerance,
      });
      if (!result.ok) {
        failed = true;
      }
      continue;
    }
    const refPath = resolve(specDir, refFile);
    const [actual, reference] = await Promise.all([readFile(shotPath), readFile(refPath)]);
    const score = await page.evaluate(
      async ({ a, b }) => {
        const load = (src) =>
          new Promise((res, rej) => {
            const img = new Image();
            img.onload = () => res(img);
            img.onerror = rej;
            img.src = src;
          });
        const [ia, ib] = await Promise.all([load(a), load(b)]);
        // Compare at a common small width; blur absorbs anti-aliasing and
        // minor font rendering differences so layout/colour/content dominate.
        const W = 320;
        const H = Math.max(1, Math.round((ib.height / ib.width) * W));
        const draw = (img) => {
          const c = document.createElement("canvas");
          c.width = W;
          c.height = H;
          const ctx = c.getContext("2d");
          ctx.filter = "blur(1.5px)";
          ctx.drawImage(img, 0, 0, W, H);
          return { c, d: ctx.getImageData(0, 0, W, H).data };
        };
        const A = draw(ia);
        const B = draw(ib);
        const diff = document.createElement("canvas");
        diff.width = W;
        diff.height = H;
        const dctx = diff.getContext("2d");
        const out = dctx.createImageData(W, H);
        let bad = 0;
        for (let i = 0; i < A.d.length; i += 4) {
          const delta =
            (Math.abs(A.d[i] - B.d[i]) + Math.abs(A.d[i + 1] - B.d[i + 1]) + Math.abs(A.d[i + 2] - B.d[i + 2])) / 3;
          const isBad = delta > 48;
          if (isBad) bad++;
          out.data[i] = isBad ? 255 : B.d[i] * 0.3;
          out.data[i + 1] = isBad ? 0 : B.d[i + 1] * 0.3;
          out.data[i + 2] = isBad ? 0 : B.d[i + 2] * 0.3;
          out.data[i + 3] = 255;
        }
        dctx.putImageData(out, 0, 0);
        return {
          mismatch: bad / (W * H),
          aspectActual: ia.height / ia.width,
          aspectReference: ib.height / ib.width,
          diffPng: diff.toDataURL("image/png"),
        };
      },
      {
        a: `data:image/png;base64,${actual.toString("base64")}`,
        b: `data:image/png;base64,${reference.toString("base64")}`,
      },
    );
    const diffPath = join(vpDir, `${block.name}.diff.png`);
    await writeFile(diffPath, Buffer.from(score.diffPng.split(",")[1], "base64"));
    const aspectDrift = Math.abs(score.aspectActual - score.aspectReference) / score.aspectReference;
    const threshold = block.threshold ?? DEFAULT_THRESHOLD;
    const aspectTolerance = block.aspectTolerance ?? DEFAULT_ASPECT_TOLERANCE;
    Object.assign(result, {
      mode: "visual",
      reference: refPath,
      diff: diffPath,
      mismatch: Number(score.mismatch.toFixed(3)),
      threshold,
      aspectDrift: Number(aspectDrift.toFixed(3)),
      aspectTolerance,
      ok: score.mismatch <= threshold && aspectDrift <= aspectTolerance,
    });
    if (!result.ok) failed = true;
  }

  await page.screenshot({ path: join(vpDir, "full.png"), fullPage: true });
  report.viewports.push({ ...vp, checks, blocks, fullPage: join(vpDir, "full.png") });
  await context.close();
}
await browser.close();

const lines = [`# Visual check — ${url}`, "", `Result: **${failed ? "FAIL" : "PASS"}**`, ""];
for (const vp of report.viewports) {
  lines.push(`## ${vp.name} (${vp.width}×${vp.height})`, "");
  for (const c of vp.checks) {
    lines.push(`- ${c.ok ? "✅" : "❌"} ${c.name}${c.ok ? "" : ` — ${JSON.stringify(c.detail).slice(0, 400)}`}`);
  }
  if (vp.blocks.length) {
    lines.push("", "| Block | Result | Mismatch | Aspect drift | Size | Diff |", "| --- | --- | --- | --- | --- | --- |");
    for (const b of vp.blocks) {
      lines.push(
        `| ${b.name} | ${b.ok ? "✅" : "❌"}${b.error ? ` ${b.error}` : ""} | ${b.mismatch ?? "—"}${b.threshold ? ` / ${b.threshold}` : ""} | ${b.aspectDrift ?? "—"} | ${b.size?.join("×") ?? "—"} | ${b.diff ?? b.screenshot ?? ""} |`,
      );
    }
  }
  lines.push("");
}
report.pass = !failed;
await writeFile(join(outDir, "report.json"), JSON.stringify(report, null, 2));
await writeFile(join(outDir, "report.md"), lines.join("\n"));
console.log(lines.join("\n"));
console.log(`\nReport: ${join(outDir, "report.md")}`);
process.exit(failed ? 1 : 0);
