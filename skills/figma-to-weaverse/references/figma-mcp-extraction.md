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
| `get_screenshot` | rendered image of a frame/node | approval checkpoint + preview verification |
| `search_design_system` / `get_libraries` | library components in use | understanding reusable component intent |

Read order for a page: `get_metadata` (structure) → `get_variable_defs` (tokens)
→ `get_design_context` per frame (content/layout) → `download_assets` (assets)
→ `get_screenshot` (visual check).

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

## Interaction — infer, don't invent

A static frame has no runtime behavior. Determine interaction from:

- **Prototype links** between frames (arrow/auto-advance hints a carousel)
- **Frame/layer names** (`Slider`, `Marquee`, `Carousel`, `Hover`)
- **Designer notes / FigJam** alongside the design

If none of these signal motion, classify the block as `static`. Do not map a
multi-card frame to a Swiper-based section just because several cards are shown —
that mismatch is the Figma equivalent of the website skill's "basically a grid"
mistake.

## Assets

- Prefer `download_assets` for real exported files; record the returned URL in
  the content manifest.
- For images placed via image fills, export the node with `get_screenshot` only
  as a fallback — a screenshot is not a production asset.
- Figma has no runtime video. If a frame represents a video block (poster image,
  play button, frame named `Video`), record the intent in the manifest's Notes
  column and source the actual video URL from the brand/asset library, not from
  Figma.
- When an export fails, mark the manifest cell `MISSING — [describe]`. Never
  substitute a placeholder.
