# Weaverse Content API — endpoints

Companion to `SKILL.md`. The authoritative machine contract is
`GET https://studio.weaverse.io/api/v1/content/openapi.json` (no auth) — fetch
it when you need exact field-level schemas. This file is the quick reference.

Base URL: `https://studio.weaverse.io/api/v1/content`
Auth: `Authorization: Bearer <WEAVERSE_API_KEY>` on every endpoint except `openapi.json`.

## Response envelope

Every success carries an `object` field:

| `object`         | Returned by                                  |
|------------------|----------------------------------------------|
| `list`           | list endpoints (`data` array + `nextCursor`) |
| `page`           | single page read                             |
| `theme_settings` | theme settings read                          |
| `page_update`    | page content update                          |
| `page_delete`    | bulk page delete                             |
| `error`          | any failure                                  |

## Errors

```json
{ "object": "error", "code": "PROJECT_NOT_FOUND", "message": "Project not found", "status": 404 }
```

| `code`              | Status | Meaning                                          |
|---------------------|--------|--------------------------------------------------|
| `UNAUTHORIZED`      | 401    | Missing or invalid token                         |
| `FORBIDDEN`         | 403    | Token's shop does not own this project           |
| `PROJECT_NOT_FOUND` | 404    | Project missing or deleted                       |
| `PAGE_NOT_FOUND`    | 404    | Page could not be resolved                       |
| `INVALID_PARAMS`    | 400    | Bad query param, body, or cursor (405 on method) |
| `INTERNAL_ERROR`    | 500    | Unexpected server error                          |

## Pagination

Cursor-based on list endpoints:

- `limit` — items per page. Default `50`, max `100`.
- `after` — opaque cursor (base64 id of the previous page's last row).
- Response returns `nextCursor`; pass it back as `after`. `null` = no more results.

## Endpoints

### List projects
```
GET /projects?limit=&after=
```
Returns all non-deleted projects for the shop:
```json
{ "object": "list",
  "data": [{ "id": "clm123", "name": "My Store", "parentProjectId": null, "createdAt": "..." }],
  "nextCursor": null }
```

### List languages
```
GET /projects/:projectId/languages
```
Configured locales, default first:
```json
{ "object": "list",
  "data": [{ "code": "en-us", "name": "English", "isDefault": true },
           { "code": "fr-fr", "name": "French", "isDefault": false }] }
```

### Theme settings
```
GET /projects/:projectId/theme-settings?locale=&format=
```
With `locale`, also returns `staticTranslations` (merged static keys for that locale):
```json
{ "object": "theme_settings", "projectId": "clm123",
  "theme": { "colorPrimary": "#111111" },
  "staticTranslations": { "cart.title": "Panier" } }
```

### List pages
```
GET /projects/:projectId/pages?type=&locale=&limit=&after=
```
`locale` is an **exact match — no fallback**. `type` filters by page type. A
row's `locale` may be `null` for **market-first** projects (rows keyed by
market, not locale) — don't pass `null` back on later reads/updates; use a real
code from List languages.
```json
{ "object": "list",
  "data": [{ "id": "asg1", "type": "CUSTOM", "handle": "about", "locale": "en-us", "pageId": "pg1" }],
  "nextCursor": null }
```

### Get a page
```
GET /projects/:projectId/pages/:type/*handle?locale=&format=&meta=
```
- `*handle` is a splat — may contain slashes (`blogs/news`). Omit for singletons.
- **Always pass `locale`.** With no `locale`, resolution only tries the empty
  locale (`""`) and the legacy default `en-us` — it does **not** auto-discover
  the project's configured default. So pages stored under any other locale
  (non-`en-us` default projects, or market-first CUSTOM pages stored per-market
  with `locale=null`) return `PAGE_NOT_FOUND` on a no-locale read even though
  they exist. Use a `code` from List languages (the `isDefault` entry is safe);
  a market-first read needs a locale whose country resolves the market
  (`?locale=en-us` → market `us`).
- The default `weaverse` format returns every item **with its `id`** — feed
  those ids straight into an update. `?meta=true` is **portable-text-only**
  (it restores `_weaverse.id` on Portable Text blocks); on a `weaverse` read it
  changes nothing.
- `format=portable-text` replaces `items` with a `content` array of Portable Text blocks (see `portable-text.md`).

```json
{ "object": "page", "id": "pg1", "type": "CUSTOM", "handle": "about",
  "locale": "en-us", "updatedAt": "...", "meta": {}, "seo": {},
  "items": [{ "id": "itm1", "type": "Hero", "data": { "heading": "Hello" }, "children": [] }] }
```

### Update page content
```
PATCH /projects/:projectId/pages/:type/*handle      (POST also accepted)
```
Shallow-merges `data` into items **already on the page**. Unknown ids → `notFound`, never created. Max **100 items** per request. Goes live via `api.weaverse.io`. The page is resolved with the **same locale rules as Get a page** — send the matching `locale` in the body, or the update may hit `PAGE_NOT_FOUND` (or the wrong locale's page) for market-first / non-`en-us` projects.

Body:
```json
{ "locale": "en-us",
  "items": [{ "id": "itm1", "data": { "heading": "Updated heading" } }] }
```
Response:
```json
{ "object": "page_update", "updated": 1, "notFound": 0,
  "updatedIds": ["itm1"], "notFoundIds": [] }
```

### Bulk-delete pages
```
DELETE /projects/:projectId/pages      (POST also accepted)
```
Soft-deletes pages. Provide **either** `pageIds` **or** `handles` (with `type`; `locale` optional, defaults to the project's stored default locale). Max **500** targets.

By id:
```json
{ "pageIds": ["pg1", "pg2"] }
```
By handle:
```json
{ "handles": ["about", "contact"], "type": "CUSTOM", "locale": "en-us" }
```
Response:
```json
{ "object": "page_delete", "requested": 2, "deleted": 2, "notFound": 0,
  "deletedHandles": ["about", "contact"], "notFoundHandles": [] }
```

## Notes

- Writes (`PATCH`/`POST`/`DELETE`) run on the primary region; read-replica requests are transparently replayed.
- Token auth is cached ~5 minutes — a freshly revoked token may keep working briefly.
- `POST` is accepted for update and delete because some clients/CDNs strip `PATCH`/`DELETE` bodies.
