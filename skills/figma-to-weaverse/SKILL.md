---
name: figma-to-weaverse
description: Use when recreating a Figma design as Hydrogen + Weaverse pages in this repo — turning a Figma file, frame, or flow into reusable Weaverse sections. Triggers on a figma.com URL, "build this design", "implement this Figma", or "create the storefront from the design". The Figma counterpart of cloning-websites-to-weaverse.
---

# Figma to Weaverse

Turn a Figma design into maintainable Weaverse pages. This is the **Figma input adapter** — the sibling of `cloning-websites-to-weaverse`, but the source is a Figma file instead of a live URL. Both adapters converge on the same downstream skill, `generating-weaverse-project-json`.

```
Figma file / frame ─→ figma-to-weaverse ─→ generating-weaverse-project-json ─→ import / content API
   (Figma MCP)        (tokens + manifest + preview)        (project JSON)
```

The two adapters share the same downstream rules. Section matching, deep schema verification, the content manifest, the clone preview route, and the brand-guideline conflict rule are **identical** to `cloning-websites-to-weaverse` — read that skill for the full matching logic. This skill only replaces the **extraction layer** (Figma MCP instead of Firecrawl) and adds Figma-specific gotchas.

## When to Use

- A figma.com URL (file, frame, or selection) is the source of a page or storefront
- "Implement this design in Weaverse", "build the homepage from Figma"
- Multi-frame flows that map to multiple Weaverse pages

Do not use it for live-website cloning (use `cloning-websites-to-weaverse`) or tiny copy edits.

## Required Inputs

- Figma URL **with a `node-id`** (a page/frame), or the current selection. A file-only URL is not enough — ask for a node link.
- `.guides/brand-guideline.md`
- `sections.md`
- `app/weaverse/components.ts`
- Target page type and route (see Preflight)
- For delivery: Weaverse project id + `WEAVERSE_API_KEY` (see `weaverse-content-api`)

## Preflight (before extracting anything)

Each of these cost a full rework loop when skipped:

1. **Page type and route.** Ask whether the design becomes the homepage (`INDEX`), a landing page (`CUSTOM`, e.g. `/disney`), or a per-resource template (`COLLECTION`/`PRODUCT` for one handle). It decides which sections are allowed (`enabledOn`) and how data loads. Don't infer it from the nav link.
2. **Right storefront.** `PUBLIC_STOREFRONT_ID` in `.env` must match the storefront in `.shopify/project.json`. A mismatched `.env` renders another brand's sales channel locally, and published collections look missing. Fix with `npx shopify hydrogen env pull`.
3. **Right brand guideline.** Confirm `.guides/brand-guideline.md` describes this brand (repos are often cloned from a sibling brand). If it doesn't, follow the Figma tokens, say so in the spec, and ask the user to replace the guideline.
4. **Weaverse project state.** Read the project's pages (`pages <projectId>`): empty `COLLECTION`/`PRODUCT` templates render header + footer only on those routes — flag it, it is not caused by your page.
5. **Existing notes.** Read prior `.figma/*.md` specs in the repo; header/footer/menu work and token decisions may already exist.

## Required Outputs

Same three deliverables as the website cloning skill, plus the live page:

1. **Content manifest** — per-section table of real asset URLs (from Figma asset export, later replaced by Shopify CDN URLs), text, links, Shopify refs, media types.
2. **Clone preview route** — a `$page` branch in `app/routes/clone-preview.$page.tsx` rendering the full design as React + Tailwind, section-marked, brand-adjusted. **User must approve this before section decomposition.**
3. **Design spec** — section mapping, annotation table, schema boundaries, interaction model, token mapping.
4. **Live Weaverse page** — pushed through the Content API and verified on the deployed storefront, with the page JSON kept in `.clone/<page>/`.
5. **Visual check PASS** — `.figma/<page>.visual.json` + Figma reference screenshots in `.figma/ref/<page>/`, and a final `scripts/visual_check.mjs` report that says `Result: PASS` (exceptions listed). The page is not done without it.

## Extraction with Figma MCP (MCP-first)

Use the Figma MCP tools. They return **structured** design data — more precise than scraped HTML for tokens and layout, but weaker on real interaction (a static design has no runtime behavior).

> Load `figma-design-to-code` before `get_design_context`, and `figma-use` before any `use_figma` write call.

1. **`get_design_context` on the page frame is the primary call.** One call returns reference code, a screenshot, asset URLs, the text/color styles used, and component descriptions. If the response is truncated, read the elided middle from the saved output before writing anything. If it asks about Code Connect, ask the user verbatim and follow the answer.
2. **Harvest annotations.** Designer notes come back as `data-development-annotations` (semantics: H1/H2/H3, "not a heading, it's a link") and `data-interaction-annotations` (menus, link targets, hover behavior). Extract every one into an annotation table in the spec and map each to a requirement — they are easy to lose in a long response. Figma **comments** are not readable through MCP; ask the user for them if they matter.
3. **Tokens.** `get_variable_defs` when the file uses variables; otherwise use the style list at the end of the `get_design_context` response. Map them into `project.config.theme` only for sitewide values; page-specific colors stay as section settings.
4. **Structure.** `get_metadata` only to orient (pick nodes, find frames). Section boundaries are the top-level frames in the design context.
5. **Interaction hints.** Layer names carry intent (e.g. `Grows Upward — Demo (hover to test)`, `Carousel Demo`, `Sort Dropdown (Grows Downwards)`). Record them; don't invent motion beyond them.
6. **Assets.** The design context lists asset URLs (`figma.com/api/mcp/asset/...`). They **expire after ~7 days**. Download the bytes early; inspect them (some are flat color SVGs, decorative masks, or images meant to be shown flipped/cropped).
7. **Global parts.** Header, nav, menu dropdowns and footer usually sit inside every frame. Treat them as layout/theme work (theme settings, Shopify menus, layout components), not as page sections.
8. **Placeholders.** Designers leave gray boxes, sample product cards with `$00.00`, stray labels outside the canvas. Mark them `MISSING`/placeholder in the manifest and map the block to real data (collection products, Instagram feed) instead of reproducing the placeholders.

### Plugin fallback

If the MCP can't reach the file or can't export a specific asset (e.g. a flattened group, an unusual export setting), fall back to a Figma agent plugin export and read its output file. MCP is the primary path; use the plugin only to fill a concrete gap, and note in the manifest which assets came from the fallback.

## Workflow

1. **Preflight** (above). Read `.guides/brand-guideline.md`; ensure `sections.md` is current.
2. **Extract** the design (steps above). Save the spec + manifest as `.figma/<brand>-<page>.md` (token table, annotation table, content manifest, gaps). While the node ids are at hand, save a Figma screenshot of every block frame to `.figma/ref/<page>/<block>.png` (`get_screenshot` → `curl`; the URLs are short-lived). These are the visual-check references.
3. **Build the content manifest** — same columns and rules as the cloning skill.
4. **Generate the clone preview route** at `app/routes/clone-preview.$page.tsx` — one `$page` branch per page, React + Tailwind, real Figma assets, `{/* === BLOCK NAME === */}` markers. Header/footer are not part of it.
5. **User approval checkpoint — STOP and wait.** Present the preview URL (the dev server port printed by `npm run dev`, not a guessed one) + block count, brand overrides, gaps. Iterate until the user approves.
6. **Move assets to Shopify right after approval.** Crop responsive variants (desktop/mobile) and flip/rotate where the design does, then upload with `weaverse-content-api` → `upload`. Keep the returned media objects in `.clone/<page>/shopify-assets.json`. Never ship Figma asset URLs.
7. **Decompose & match.** Classify every block (media type, composition, layout mechanism, interaction) and match it with the cloning skill's priority + deep structural verification. Also check each candidate's `enabledOn` against the page type from preflight.
   - Parallelise the audit: one read-only scout per candidate section reporting SUPPORTED/GAP per requirement with file:line.
   - Then one implementer per section, all under the same contract: every new setting defaults to the current rendering, no edits to the registry/`sections.md`/shared files outside their task, no build/format runs; the integrator owns registration, docs, lint and build.
   - Prefer a small shared block (e.g. a heading + link header) over adding the same header to many sections by hand.
8. **Integrate.** Register new sections, update `sections.md`, run the formatter on changed files only, typecheck and compare against the pre-change error baseline, build the way CI builds.
9. **Generate the page JSON** with `generating-weaverse-project-json` (Shopify media objects, no default values, presets written explicitly), validate it.
10. **Deliver through the Content API** (`weaverse-content-api`): `create-page` for CUSTOM/template pages (INDEX already exists), then one PATCH that relinks the root `main` and creates every item. Sitewide values go through `theme-update` (back up the old values first); menus go through the admin proxy (`menuUpdate`, back up the old menu). If the page needs code that isn't deployed yet, deploy right after (or tell the user the live page is broken until then).
11. **Verify on the real route with Playwright — loop until PASS.** Write `.figma/<page>.visual.json` (one block per section: `[data-wv-id]` selector + reference image; `mode: "structure"` with a `note` only for data-driven or placeholder blocks) and run `node <this skill>/scripts/visual_check.mjs .figma/<page>.visual.json` from the storefront repo. Spec format, setup and the fix playbook: `references/visual-check.md`.
    - Read `report.md`; for every ❌ open the block screenshot, the reference and the `.diff.png`, fix **one** cause (section settings via Content API, or section code), re-run with `--only <block>`. Repeat until the full run prints `Result: PASS` on desktop and mobile.
    - Never pass by raising thresholds or switching a block to `structure` to hide a real design difference.
    - Escalate to the user with the diff images when a block makes no progress for three iterations or needs a decision/asset you don't have.
    - The script covers JS errors, broken images, overflow, H1 count, section order and clipped rounded elements. Still exercise interactions by hand: hover effects, filters change the URL and the result count, sort, load more, menu links resolve; count products in the rendered DOM, not in loader JSON.
    - After deploy, re-run the same spec against the deployed URL (`--url https://<storefront>/<path>`).
12. **Clean up and hand over.** Remove the page's preview branch, commit (with the visual spec and references; the generated `.figma/visual/` output can stay untracked), push, watch the deploy workflow of *this* storefront (sibling-brand workflows in the same repo may fail for unrelated reasons). Report the final visual-check result, the accepted exceptions, and what Studio still needs (page SEO, missing collections/links, unpublished resources).

## Figma-specific differences from website cloning

| Aspect | Website (Firecrawl) | Figma (MCP) |
|--------|---------------------|-------------|
| Design tokens | inferred from CSS/computed styles | **explicit** via `get_variable_defs` — map directly to theme |
| Section boundaries | HTML section markers, slider/grid classes | top-level frames / auto-layout containers from `get_metadata` |
| Composition | read from HTML positioning | read from **auto-layout** direction/wrap/spacing |
| Assets | image/video URLs in HTML | `download_assets` exports; no real video `src` |
| Interaction | real runtime behavior in HTML | **none at runtime** — infer from frame names, prototype links, designer notes; do not invent interactions the design doesn't imply |
| Responsive variants | `<picture>` / breakpoint classes | separate desktop/mobile **frames** if the designer made them; otherwise one frame |

## Red Flags

- **Skipping the approval checkpoint** — same rule as website cloning: the user must approve the clone preview before section decomposition.
- **Inventing interactions** — a static Figma frame has no carousel autoplay or scroll behavior unless the prototype or notes say so. Don't classify a frame as a slider just because it shows multiple cards. Confirm from prototype links or frame naming.
- **Ignoring Figma variables** — `get_variable_defs` is the cleanest token source you'll ever get. Hardcoding colors/sizes when variables exist throws away the main Figma advantage.
- **Guessing asset URLs** — export real assets with `download_assets`; mark `MISSING — [describe]` in the manifest when an export fails, don't substitute a placeholder.
- **One giant bespoke section per frame** — decompose into reusable sections; reuse the registry first.
- **Re-deriving the matching rules** — the section-matching priority and deep schema verification live in `cloning-websites-to-weaverse`. Follow them; don't reinvent a looser version.
- **Treating mobile/desktop frames as two pages** — they're responsive variants of the same section; map to `imageMobile`/`imageDesktop` or breakpoint logic, not separate pages.
- **Leaving the preview route in the repo** — delete it after the Weaverse page is verified.
- **Building before asking the page type** — a page built as a COLLECTION template had to be rebuilt as a CUSTOM page; the product grid section also had to change because the collection-only section can't run elsewhere.
- **Debugging data with the wrong storefront in `.env`** — "collection not found" may just mean the local token belongs to another brand's channel. Check preflight item 2 before blaming publishing.
- **Letting Figma asset URLs reach Weaverse** — they expire within days and some image transforms block them. Upload to Shopify first.
- **Dropping annotations** — designer notes about heading levels, link targets, menus and hover behavior are requirements; keep the annotation table and tick it off at the end.
- **Reproducing designer placeholders** — gray boxes and sample cards are stand-ins for real data, not content.
- **Declaring success from a stale dev server** — after a PATCH, restart `npm run dev`; the old process can keep serving previous item data under the same ids.
- **Declaring the page done without a PASS visual check** — eyeballing a screenshot missed clipped tile corners that the check reports as `no clipped rounded elements ❌`. Run the loop to PASS, desktop and mobile.
- **Loosening the check instead of fixing the page** — raising `threshold`, deleting a block, or marking it `structure` to make a real difference go away.

## Related skills

- `cloning-websites-to-weaverse` — the website input adapter; owns the shared section-matching, manifest, and preview rules this skill reuses.
- `generating-weaverse-project-json` — downstream; turns this skill's spec + manifest + token table into import-ready JSON.
- `weaverse-content-api` — push or update content into the live project after import.
- `figma-use` / `figma-generate-design` — Figma MCP plugin skills; load `figma-use` before any `use_figma` write call.
