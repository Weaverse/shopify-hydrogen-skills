# Visual check (Playwright) — spec and loop

`scripts/visual_check.mjs` renders the real Weaverse page in Chromium and
compares it with the Figma design. It is the exit gate of `figma-to-weaverse`:
the page is done only when the report says **PASS**.

## Setup

Run it from the storefront repo, so Playwright resolves from its `node_modules`
(Hydrogen projects usually have it already):

```bash
node <skills>/figma-to-weaverse/scripts/visual_check.mjs .figma/<page>.visual.json
```

If Playwright or its browser is missing:

```bash
npm i --no-save playwright        # only if the repo doesn't have it
npx playwright install chromium   # browser matching the resolved version
```

Options: `--only block,block` to re-check a subset while iterating,
`--out <dir>` to write elsewhere (default `.figma/visual/<name>/`),
`--url <page url>` to run the same spec against another host such as the
deployed storefront (output goes to `.figma/visual/<name>-remote/`).

## Reference images

For each block, take a Figma screenshot of its frame node and save it **right
away** (the URL expires):

1. `get_screenshot` with the block's `nodeId` (the frame you mapped to one
   Weaverse section — the same ids as in the design context).
2. `curl -L -o .figma/ref/<page>/<block>.png "<image_url>"`.

Screenshots come back downscaled (e.g. 1024 wide); that's fine, the comparison
normalises size. Mobile references only exist if the designer made mobile
frames — add them as `referenceMobile`. Without one, mobile gets the hard
checks only.

## Spec file — `.figma/<page>.visual.json`

```json
{
  "name": "disney",
  "url": "http://localhost:3459/disney",
  "viewports": [
    { "name": "desktop", "width": 1440, "height": 900 },
    { "name": "mobile", "width": 390, "height": 844 }
  ],
  "expect": {
    "h1": 1,
    "sections": ["single-image", "spacer", "grow-tile-grid", "rich-text"]
  },
  "threshold": 0.12,
  "aspectTolerance": 0.08,
  "hide": ["[role=dialog]"],
  "blocks": [
    {
      "name": "characters",
      "figmaNode": "1057:6618",
      "selector": "[data-wv-id='d0057fe6-...']",
      "reference": "ref/disney/characters.png"
    },
    {
      "name": "product-grid",
      "selector": "[data-wv-id='df52132e-...']",
      "mode": "structure",
      "note": "Figma grid is placeholder cards; products come from the collection."
    }
  ]
}
```

- `url` — the real route (local dev server port as printed by `npm run dev`, or
  the deployed storefront).
- `selector` — use `[data-wv-id='<item id>']` from the page read
  (`weaverse_content_api.mjs page …`); ids are stable, nth-child selectors are not.
- `expect.sections` — top-level section types in order (defaults to the
  children of the Weaverse `main` item).
- `threshold` — max share of mismatching pixels (default 0.12);
  `aspectTolerance` — max relative height/width drift (default 0.08). Both can
  be set per block.
- `mode: "structure"` — no pixel comparison. Use it only for blocks whose
  content is data, not design: product grids/rails fed by a collection, live
  Instagram feeds, blocks where Figma shows placeholders. Always add a `note`
  saying why. Keep the `reference` when the block has a fixed footprint: the
  aspect-ratio check still runs, which catches an empty feed or a collapsed
  rail (a production Instagram feed with a missing token rendered only its
  header and failed this way). Drop the reference only for blocks whose height
  depends on the data, such as a paginated product grid.
- `hide` — selectors removed before screenshots (newsletter popups, cookie
  banners, chat widgets).

## What it checks

Hard checks per viewport (any failure → FAIL):

| Check | Catches |
| --- | --- |
| No JS errors | hydration errors, runtime crashes |
| No broken images | expired Figma URLs, wrong CDN paths |
| No horizontal overflow | rails/cards wider than the screen |
| H1 count | missing or duplicated page title |
| Section order | wrong or missing sections |
| No clipped rounded elements | tiles/cards cut by an `overflow:hidden` parent so they lose their corners (scroll rails are ignored) |

Visual score per block with a reference: blurred perceptual pixel mismatch
and aspect-ratio drift. Each scored block gets `<block>.png` (actual) and
`<block>.diff.png` (red = mismatch) in the output folder.

Outputs: `report.md` (read this first), `report.json`, `full.png` per viewport.

## Fix loop

```
run → read report.md → for each ❌: open <block>.png, the reference and <block>.diff.png
    → name the cause → fix one cause → re-run (--only that block) → repeat
→ final full run must be PASS
```

Where a cause usually lives:

| Symptom in the diff | Typical fix |
| --- | --- |
| Whole block shifted / aspect drift | section padding, gap, content width, image aspect ratio (section settings via Content API) |
| Text wraps differently | content max width, font size; brand font metrics differ from Figma's font — adjust width rather than letter-spacing |
| Colour blocks wrong | background/border colour settings, theme tokens |
| Elements missing | child block not created, wrong image, setting off |
| Clipped edges | container too narrow for the tiles — section code (fit-to-width) or tile sizes |
| Layout impossible with current settings | section code change (keep new settings default-compatible), then deploy |
| Photo framed differently (zoomed, shifted) though the image is the same | Figma crops image fills: `get_design_context` shows `<img class="absolute w-[149%] h-[143%] left-[-12%] top-[-30%]">`. Visible source rect = `x: -left/w … (100-left)/w`, `y: -top/h … (100-top)/h`. Crop the original to that rect (`sips -c H W --cropOffset Y X`), upload it, and keep the uncropped image as the mobile image where the mobile ratio differs |
| Setting has no visible effect | value off the schema's step/options (e.g. a `gap` of 31 on a 4px-step select renders nothing) — snap to a valid value; or the dev server is serving stale section code — restart it |
| Rail doesn't reach the viewport edge | an ancestor with `overflow:hidden` at content width clips the bleed — let the content box overflow when the rail bleeds and keep the outer section clipping; check `cn()` merges conflicting width classes |
| Third-party overlay in the screenshot (purchase pop, chat, cookie bar) | add its selector to `hide`; if it shows wrong content (e.g. another brand's product), report it |

Rules:

- **Never pass by loosening.** Don't raise `threshold`/`aspectTolerance` or
  switch a block to `structure` to make a real design difference disappear.
  Allowed exceptions: data-driven content, designer placeholders, a documented
  brand-guideline override, and font-metric wrapping you've already minimised.
  Write the reason in the block's `note` and list it in the final report.
- **One cause per iteration**, then re-run, so you know what moved the score.
- **Re-read data after Content API patches**: restart the dev server or test the
  deployed URL; a running dev server can serve stale item data and, after
  code edits, stale section modules too.
- **Escalate instead of looping** when a block makes no progress for three
  iterations, or the fix needs a decision or asset you don't have (missing
  image, conflicting design, impossible layout). Report the diff images and the
  options.
- **Done** = a full run (all blocks, all viewports) prints `Result: PASS`, with
  the exceptions listed. Re-run on the deployed storefront after deploy.
