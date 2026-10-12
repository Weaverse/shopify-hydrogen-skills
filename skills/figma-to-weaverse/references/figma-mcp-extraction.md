# Figma MCP extraction cheat-sheet

How to pull the design DNA out of a Figma file with the Figma MCP, and how it
maps onto the Weaverse JSON generator. Companion to this skill's `SKILL.md`.

## Tool-by-tool

| Tool | What it gives you | Used for |
|------|-------------------|----------|
| `get_metadata` | node/frame tree of the file or a frame | section boundaries; one top-level frame ≈ one section block |
| `get_variable_defs` | design variables (color, type, spacing, radius) | theme token mapping (see below) |
| `get_design_context` | layout, auto-layout, text content, component usage of a frame | composition + content per section |
| `download_assets` | exported image/icon files + URLs | content manifest asset columns |
| `get_screenshot` | rendered image of a frame/node | approval checkpoint, block and interaction-state references |
| `search_design_system` / `get_libraries` | library components in use | locating the component set behind an instance |
| `get_context_for_code_connect` | variant properties and options of a component set | interaction states (`State=Default\|Hover\|Pressed`) |

Read order for a page: `get_design_context` on the page frame (content, layout,
assets, styles, annotations — the primary call) → `get_variable_defs` when the
file uses variables → `get_metadata` / `get_screenshot` only to orient or to
check a single node.

## Token mapping → `project.config.theme`

`get_variable_defs` returns the design system's variables. Map them onto the
theme keys the JSON generator accepts (see
`generating-weaverse-project-json` → `project.config.theme`). Common mappings:

| Figma variable kind | Weaverse theme key(s) |
|---------------------|------------------------|
| Primary / brand color | `colorPrimary`, `buttonPrimaryBg` |
| Text / foreground color | `colorText`, `colorForeground`, `buttonPrimaryColor` |
| Background / surface color | `colorBackground`, `headerBgColor`, `footerBgColor` |
| Border / divider color | `colorLine`, `colorLineSubtle` |
| Muted / subtle text | `colorTextSubtle` |
| Body font size | `bodyBaseSize`, `bodyBaseLineHeight`, `bodyBaseSpacing` |
| Heading scale (H1) | `h1BaseSize`, `headingBaseLineHeight`, `headingBaseSpacing` |
| Corner radius | `btnCornerRadius`, `pcardBorderRadius` |
| Container / max width | `pageWidth`, `headerWidth`, `footerWidth` |

Only set theme keys you can back with an actual Figma variable or a clear value
from the design. Don't copy a full demo theme blindly.

## Reading composition from auto-layout

Figma auto-layout encodes composition directly — read it instead of guessing:

- **Horizontal** auto-layout with media + text children → `side-by-side`
- **Vertical** auto-layout, text above/below media → `stacked`
- Repeated child instances in a wrap/grid → `card-grid`
- Absolute-positioned text over a full-bleed image fill → `background-overlay`
- A single visible card in a frame named like a carousel / with prototype
  links between frames → `card-slider` (confirm from the prototype, not from
  the static frame alone)

## Interaction — evidence first, never from names

A static frame has no runtime behavior. Collect evidence for each element that
can react, in this order, and stop at the first source that answers it:

1. **Component states (instances).** An instance shows one variant of its
   component. Locate the component set and list its variant properties with
   `get_context_for_code_connect`. Read the **Default** variant, then **Hover**,
   then click states (`Pressed`, `Active`, `Open`, `Selected`):
   `get_design_context` on each variant node gives the exact delta to implement
   and to assert (`background-color #FF6600`, underline, child revealed), and
   `get_screenshot` gives the state reference image. Prototype reactions on the
   instance (`ON_HOVER → CHANGE_TO Hover`, `ON_CLICK → OPEN_OVERLAY`) confirm the
   trigger; read them with a read-only `use_figma` script when MCP doesn't
   surface them (load `figma-use` first).
2. **Annotations.** `data-interaction-annotations` and development annotations
   (below).
3. **Ask the user.** No state variant and no annotation → the element is
   `UNCONFIRMED`. Ask, offering "static" as an option; don't build behaviour
   until answered.

Frame and layer names (`Slider`, `Marquee`, `Carousel Demo`, `hover to test`)
are pointers to where evidence may live, not evidence. Do not map a multi-card
frame to a Swiper-based section because several cards are shown, or add a
hover because a layer says so — that mismatch is the Figma equivalent of the
website skill's "basically a grid" mistake.

Record each element in the spec's interaction table with its evidence
(`variant: …` / `annotation: …` / `user: …`); each confirmed row becomes a
`hover` or `click` entry in the visual check (`references/visual-check.md`).

## Annotations

`get_design_context` returns designer notes as data attributes on the nodes:

- `data-development-annotations` — semantics: which text is the page `<h1>`,
  section `<h2>`, card `<h3>`, and which heading-styled text is really a link.
- `data-interaction-annotations` — behavior: hover menus and their full item
  lists, link destinations ("Go directly to Disney page").

Grep the saved response for both attributes and copy every one into the spec's
annotation table. Figma comments are not exposed through MCP.

## Assets

- Asset URLs in `get_design_context` (`figma.com/api/mcp/asset/<id>/<hash>.<ext>`)
  and `download_assets` exports **expire after ~7 days**. Download the bytes,
  then upload them to Shopify (`weaverse-content-api` → `upload`) before they
  go into any Weaverse data.
- Inspect what you downloaded: a "photo" may be a flat-color SVG ring, a
  decorative mask, or an image the design shows flipped or cropped. Prepare
  those variants (desktop/mobile crops, flipped arcs) before uploading rather
  than adding transform settings to sections.
- For images placed via image fills, export the node with `get_screenshot` only
  as a fallback — a screenshot is not a production asset.
- Figma has no runtime video. If a frame represents a video block (poster image,
  play button, frame named `Video`), record the intent in the manifest's Notes
  column and source the actual video URL from the brand/asset library, not from
  Figma.
- When an export fails, mark the manifest cell `MISSING — [describe]`. Never
  substitute a placeholder.
