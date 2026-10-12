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
//   - runs every spec interaction (hover / click) on a freshly loaded page and
//     asserts its outcome: elements shown/hidden, computed styles, URL, and the
//     after-state screenshot against the Figma state variant when one is given
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
  console.error("Usage: visual_check.mjs <spec.json> [--only block|interaction,...] [--out dir] [--url url]");
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
const refKeyFor = (vpName) => (vpName === "desktop" ? "reference" : `reference${vpName[0].toUpperCase()}${vpName.slice(1)}`);

async function openPage(page) {
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
  // Transitions are off, so a hover/click lands on its final state at once.
  await page.addStyleTag({
    content: `${hideSelectors.join(",")}{display:none!important}
      *,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}`,
  });
}

// Blurred perceptual mismatch + aspect drift of a screenshot against a Figma
// reference; writes a red diff heatmap next to the screenshot.
async function compareImages(page, shotPath, refPath, diffPath) {
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
  await writeFile(diffPath, Buffer.from(score.diffPng.split(",")[1], "base64"));
  return {
    mismatch: score.mismatch,
    aspectDrift: Math.abs(score.aspectActual - score.aspectReference) / score.aspectReference,
  };
}

// Figma hands out hex; computed styles come back as rgb()/rgba(). Colours are
// compared per channel, everything else as trimmed strings.
function parseColor(value) {
  const v = String(value).trim().toLowerCase();
  const hex = v.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if (hex) {
    let h = hex[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join("");
    const n = (i) => Number.parseInt(h.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  const fn = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/);
  if (fn) return [Number(fn[1]), Number(fn[2]), Number(fn[3]), fn[4] === undefined ? 1 : Number(fn[4])];
  return null;
}
function sameStyle(actual, expected) {
  const a = parseColor(actual);
  const e = parseColor(expected);
  if (a && e) return a.slice(0, 3).every((c, i) => Math.abs(c - e[i]) <= 2) && Math.abs(a[3] - e[3]) <= 0.02;
  return String(actual).trim() === String(expected).trim();
}

const SOURCES = ["variant:", "annotation:", "user:"];

async function runInteraction(page, it, vp, vpDir) {
  const problems = [];
  const result = { name: it.name, action: it.action, source: it.source };
  if (!SOURCES.some((s) => String(it.source ?? "").startsWith(s))) {
    problems.push(`source must start with ${SOURCES.join(" / ")} — behaviour needs evidence, not a layer name`);
  }
  try {
    const target = page.locator(it.target).first();
    if ((await target.count()) === 0) throw new Error(`target ${it.target} matched nothing`);
    await target.scrollIntoViewIfNeeded();
    const exp = it.expect ?? {};
    const styleSelector = exp.styleSelector ?? it.target;
    const styleProps = [...Object.keys(exp.style ?? {}), ...(exp.changed ?? [])];
    const readStyles = () =>
      page
        .locator(styleSelector)
        .first()
        .evaluate((el, props) => Object.fromEntries(props.map((p) => [p, getComputedStyle(el).getPropertyValue(p)])), styleProps);
    const isVisible = (sel) => page.locator(sel).first().isVisible().catch(() => false);

    const before = { styles: styleProps.length ? await readStyles() : {}, visible: {} };
    for (const sel of exp.visible ?? []) before.visible[sel] = await isVisible(sel);

    if (it.action === "hover") await target.hover({ timeout: 10_000 });
    else if (it.action === "click") await target.click({ timeout: 10_000 });
    else throw new Error(`unknown action "${it.action}" (hover | click)`);

    if (exp.url) {
      await page.waitForURL((u) => u.href.includes(exp.url), { timeout: 10_000 }).catch(() => {});
      if (!page.url().includes(exp.url)) problems.push(`URL ${page.url()} does not contain ${exp.url}`);
    }
    await page.waitForTimeout(it.settleMs ?? 400);

    // An expectation that already held before the action proves nothing.
    for (const sel of exp.visible ?? []) {
      if (!(await isVisible(sel))) problems.push(`${sel} not visible after ${it.action}`);
      else if (before.visible[sel]) problems.push(`${sel} was already visible before ${it.action}`);
    }
    for (const sel of exp.hidden ?? []) {
      if (await isVisible(sel)) problems.push(`${sel} still visible after ${it.action}`);
    }
    if (styleProps.length && !exp.url) {
      const after = await readStyles();
      result.styles = { before: before.styles, after };
      for (const [prop, want] of Object.entries(exp.style ?? {})) {
        if (!sameStyle(after[prop], want)) problems.push(`${prop} is ${after[prop]}, expected ${want}`);
        else if (sameStyle(before.styles[prop], want)) problems.push(`${prop} was already ${want} before ${it.action}`);
      }
      for (const prop of exp.changed ?? []) {
        if (after[prop] === before.styles[prop]) problems.push(`${prop} unchanged (${after[prop]})`);
      }
    }

    const refFile = it[refKeyFor(vp.name)];
    if (refFile) {
      const capture = page.locator(it.capture ?? it.target).first();
      const shotPath = join(vpDir, `interaction-${it.name}.png`);
      await capture.screenshot({ path: shotPath, animations: "disabled" });
      const refPath = resolve(specDir, refFile);
      const diffPath = join(vpDir, `interaction-${it.name}.diff.png`);
      const { mismatch, aspectDrift } = await compareImages(page, shotPath, refPath, diffPath);
      const threshold = it.threshold ?? DEFAULT_THRESHOLD;
      const aspectTolerance = it.aspectTolerance ?? DEFAULT_ASPECT_TOLERANCE;
      Object.assign(result, {
        reference: refPath,
        screenshot: shotPath,
        diff: diffPath,
        mismatch: Number(mismatch.toFixed(3)),
        threshold,
        aspectDrift: Number(aspectDrift.toFixed(3)),
      });
      if (mismatch > threshold) problems.push(`after-state mismatch ${result.mismatch} > ${threshold}`);
      if (aspectDrift > aspectTolerance) problems.push(`after-state aspect drift ${result.aspectDrift} > ${aspectTolerance}`);
    }
  } catch (error) {
    problems.push(String(error.message ?? error).split("\n")[0]);
  }
  result.problems = problems;
  result.ok = problems.length === 0;
  return result;
}

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

  await openPage(page);

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

    const refKey = refKeyFor(vp.name);
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
    const diffPath = join(vpDir, `${block.name}.diff.png`);
    const { mismatch, aspectDrift } = await compareImages(page, shotPath, refPath, diffPath);
    const threshold = block.threshold ?? DEFAULT_THRESHOLD;
    const aspectTolerance = block.aspectTolerance ?? DEFAULT_ASPECT_TOLERANCE;
    Object.assign(result, {
      mode: "visual",
      reference: refPath,
      diff: diffPath,
      mismatch: Number(mismatch.toFixed(3)),
      threshold,
      aspectDrift: Number(aspectDrift.toFixed(3)),
      aspectTolerance,
      ok: mismatch <= threshold && aspectDrift <= aspectTolerance,
    });
    if (!result.ok) failed = true;
  }

  await page.screenshot({ path: join(vpDir, "full.png"), fullPage: true });

  // Each interaction runs in a fresh tab: no menu left open, no mouse position
  // still hovering something, no navigation from the previous one.
  const interactions = [];
  for (const it of spec.interactions ?? []) {
    if (only && !only.includes(it.name) && !(it.block && only.includes(it.block))) continue;
    if (it.viewports && !it.viewports.includes(vp.name)) continue;
    const tab = await context.newPage();
    const tabErrors = [];
    tab.on("pageerror", (e) => tabErrors.push(String(e.message ?? e).slice(0, 300)));
    await openPage(tab);
    const result = await runInteraction(tab, it, vp, vpDir);
    for (const e of tabErrors) result.problems.push(`JS error: ${e}`);
    result.ok = result.problems.length === 0;
    await tab.close();
    interactions.push(result);
    if (!result.ok) failed = true;
  }

  report.viewports.push({ ...vp, checks, blocks, interactions, fullPage: join(vpDir, "full.png") });
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
  if (vp.interactions.length) {
    lines.push("", "| Interaction | Action | Source | Result | Detail |", "| --- | --- | --- | --- | --- |");
    for (const it of vp.interactions) {
      const detail = it.ok ? (it.diff ?? "") : it.problems.join("; ").replaceAll("|", "\\|");
      lines.push(`| ${it.name} | ${it.action} | ${it.source ?? "—"} | ${it.ok ? "✅" : "❌"} | ${detail} |`);
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
