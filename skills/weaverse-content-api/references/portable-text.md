# Rich-text formats: `weaverse` vs `portable-text`

Page and theme-settings **reads** return rich-text fields in one of two formats.
Pick with `?format=` (query param wins) or an `Accept` header.

| `format`        | Shape                                              | Use for                              |
|-----------------|----------------------------------------------------|--------------------------------------|
| `weaverse` (default) | rich text as **HTML strings**                 | round-tripping back into Weaverse    |
| `portable-text` | structured [Portable Text](https://portabletext.org) blocks | multi-channel rendering, AI consumption |

- `?format=portable-text` or `Accept: application/portable-text+json`.
- An invalid `?format=` value returns `400 INVALID_PARAMS`.
- With `format=portable-text`, the page response replaces `items` with a
  `content` array of Portable Text blocks, and the `Content-Type` is
  `application/portable-text+json`.

## `?meta=true` is portable-text-only

`?meta=true` matters **only** for `portable-text` reads. Portable Text blocks
drop the original Weaverse item id, so `meta=true` restores it on each custom
block:

```json
{ "_weaverse": { "id": "itm1", "schemaVersion": 3 } }
```

You need that id to map a Portable Text block back to the item you patch.

On a **`weaverse`-format read it does nothing** — that format already returns
every item with its `id`. Don't add `?meta=true` for normal edits.

## Practical guidance

- **Updating content?** Read with the **default `weaverse` format** and the
  right **`locale`** — no `meta` needed; the ids are already there. You patch
  `data` fields by id; you do not patch Portable Text directly. The update
  endpoint takes Weaverse-shaped `data`, not Portable Text.
- **Feeding an AI pipeline or another channel?** Read with
  `format=portable-text` (add `meta=true` so you keep the item ids), generate
  new copy, then map it back onto the Weaverse `data` fields (by id) for the
  patch.
- The update endpoint always accepts Weaverse-shaped `data`. Portable Text is a
  **read/representation format**, not a write format.
