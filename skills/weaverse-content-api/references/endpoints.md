# Weaverse Content API — endpoints

Companion to `SKILL.md`. The authoritative machine contract is
`GET https://studio.weaverse.io/api/v1/content/openapi.json` (no auth) — fetch
it when you need exact field-level schemas, scopes, and error semantics. This
file is the quick reference.

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
| `page_create`    | page creation                                |
| `page_delete`    | bulk page delete                             |
| `page_translations` / `page_translations_update` | per-page translation read/write |
| `error`          | any failure                                  |

## Errors

```json
{ "object": "error", "code": "PROJECT_NOT_FOUND", "message": "Project not found", "status": 404 }
```

| `code` | Status | Meaning |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Token's shop does not own this project |
| `INSUFFICIENT_SCOPE` | 403 | Credential lacks the scope this operation needs; nothing written |
| `PROJECT_NOT_FOUND` | 404 | Project missing or deleted (never discloses other tenants) |
| `PAGE_NOT_FOUND` | 404 | Page could not be resolved |
| `STALE_PAGE` | 409 | Page changed since your read (`expectedUpdatedAt` / draft CAS mismatch) |
| `STALE_PROJECT` | 409 | Project/theme settings changed since your read (`expectedRevision` mismatch) |
| `STALE_TRANSLATION` | 409 | Translation batch source/target moved since read; nothing written |
| `CONFLICT` | 409 | Live assignment already exists, inherited page, version no longer scheduled/draft, … |
| `PRECONDITION_REQUIRED` | 428 | Delegated (MCP OAuth) token omitted `expectedUpdatedAt`/`expectedRevision`. API keys never get this |
| `INVALID_PARAMS` | 400 | Bad query param, body, or cursor (405 on method) |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

## Pagination

Cursor-based on list endpoints:

- `limit` — items per page. Default `50`, max `100`.
- `after` — opaque cursor (base64 id of the previous page's last row).
- Response returns `nextCursor`; pass it back as `after`. `null` = no more results.

## Projects

### List / read projects
```
GET /projects?limit=&after=
GET /projects/{projectId}
```
```json
{ "object": "list",
  "data": [{ "id": "clm123", "name": "My Store", "parentProjectId": null, "createdAt": "..." }],
  "nextCursor": null }
```

### Project lifecycle
```
POST /projects
```
Shop-scoped operations requiring `project:manage` (delete also `content:delete` + `confirm`):

| `op` | Required body | Notes |
|---|---|---|
| `create` | `op` | Optional `name`, client-chosen `projectId`, `config.themeName` |
| `copy` | `op`, `sourceProjectId` | Background clone → `202` + target id; source must be this shop's own or a public demo-store project (any other shop's project is 404); completion observed via listPages |
| `delete` | `op`, `projectId`, `confirm` (= projectId) | Soft-delete with pre-delete backup |
| `set-settings` | `op`, `projectId`, `expectedUpdatedAt` | Non-secret settings: `name`, `defaultLocale` (full Hydrogen i18n shape) — revision-fenced |
| `purge-cache` | `op`, `projectId` | Studio "Clear cache" |

Responses: 200 result, 201 created, 202 copy started, 409 `STALE_PROJECT`/`HAS_VARIANTS`.

### Update project metadata
```
PATCH /projects/{projectId}      (POST also accepted)
```
`name` only (1–191 chars, required); unknown fields are 400. No cache invalidation — the name does not affect rendered content.

## Pages

### List pages
```
GET /projects/{projectId}/pages?type=&locale=&limit=&after=
```
`locale` is an **exact match — no fallback**. `type` filters by page type. Each
row carries `updatedAt` (the owning Page's revision timestamp — detect changed
pages without one request per page; list responses are cached, so it may be
stale) and `isTemplateMarker` (`true` for internal template-alias rows — filter
client-side; a bulk delete naming a marker handle is rejected 400 and deletes
nothing). A row's `locale` may be `null` for **market-first** projects — don't
pass `null` back; use a real code from List languages.
```json
{ "object": "list",
  "data": [{ "id": "asg1", "type": "CUSTOM", "handle": "about", "locale": "en-us", "pageId": "pg1", "updatedAt": "...", "isTemplateMarker": false }],
  "nextCursor": null }
```

### Get a page
```
GET /projects/{projectId}/pages/{type}/{handle}?locale=&format=&meta=&includeDefaults=
```
- `handle` is a splat — may contain slashes (`pages/gift-shop`). Omit for singletons; required for `CUSTOM` and per-resource templated types, whose empty handle is the shared default template.
- **Always pass `locale`.** Resolution: requested locale → project default → `en-default`. A no-locale read can *succeed* on a different locale's page — the base-locale assignment — so an edit can look "missing" even though it went live. Use a `code` from List languages (the `isDefault` entry is safe); a market-first read needs a locale whose country resolves the market (`?locale=en-us` → market `us`).
- A real templated handle **resolves even when no per-resource override exists** — the read falls back to the type's shared default template and returns 200 with the shared page's `id`/`meta`. A PATCH then edits that shared template for every resource of the type. Inspect the returned `id` before patching; create a per-resource override first when the change is meant for one resource.
- The default `weaverse` format returns every item **with its `id`** — feed those ids straight into an update. `?meta=true` is **portable-text-only**; on a `weaverse` read it changes nothing.
- `includeDefaults=true` completes each item's `data` with the component schema `defaultValue` for unset settings (stored values win; only missing keys are filled). Only the literal string `true` enables it.
- `format=portable-text` replaces `items` with a `content` array of Portable Text blocks (see `portable-text.md`).

```json
{ "object": "page", "id": "pg1", "type": "CUSTOM", "handle": "about",
  "locale": "en-us", "updatedAt": "...", "meta": { "inherited": false },
  "items": [{ "id": "itm1", "type": "Hero", "data": { "heading": "Hello" }, "children": [] }] }
```

### Update page content (live)
```
PATCH /projects/{projectId}/pages/{type}/{handle}      (POST also accepted)
```
Shallow-merges `data` into items of the page resolved for `type`/`handle`/`locale` (same fallback as GET; `locale` in the body defaults to the stored default locale). Every `items` entry requires **both `id` and `data`** (`"data": {}` for topology-only relinks — omitting it rejects the request). Existing ids update; an unknown id is **created** only when its entry supplies `type`; otherwise `notFound`. `children` relinks must point at ids already on the page or created in the same request. Max **100 items**. A page inherited from a parent project returns 409 — edit it on the source project. On success the edit goes live via `api.weaverse.io` like a Studio save.

Body:
```json
{ "locale": "en-us",
  "expectedUpdatedAt": "2026-10-21T12:00:00.000Z",
  "exact": true,
  "items": [{ "id": "itm1", "data": { "heading": "Updated heading" } }] }
```
- `expectedUpdatedAt` — the GET read's `updatedAt`. Required for delegated (MCP OAuth) tokens (omitted → 428); optional for API keys. Stale → `409 STALE_PAGE`, nothing written (mid-request detection reports unconfirmed items as `failed`).
- `exact: true` — refuse locale/handle fallback; 404 instead. Delegated writes are always exact.

Response:
```json
{ "object": "page_update", "requested": 2, "updated": 1, "created": 1, "notFound": 0, "failed": 0,
  "updatedIds": ["itm1"], "createdIds": ["itm2"], "notFoundIds": [], "failedIds": [] }
```

### Create a page
```
POST /projects/{projectId}/pages
```
Creates one page per call. `type` is `CUSTOM` (bespoke merchant page, blank root) or a resource-backed template type (`PRODUCT`/`COLLECTION`/`PAGE`/`BLOG`/`ARTICLE` — a per-resource override that clones the project's shared default template for that type, or the `basedOn` page when given). For `CUSTOM`, slashes in `handle` are normalized; for resource-backed types `handle` is the exact Shopify resource handle. `shopifyResourceId` (gid) is persisted only for resource-backed types. To share one template page across many resources without copying, use `POST /template-assignments/{pageId}` instead.

Body — optional fields (`name`, `locale`, `basedOn`, `shopifyResourceId`) are strings when present; **omit** them rather than sending `null`:
```json
{ "type": "CUSTOM", "handle": "about", "name": "About" }
```
Response:
```json
{ "object": "page_create", "page": { "id": "pg9", "type": "CUSTOM", "handle": "about" } }
```
A live assignment already existing for this handle/type/locale returns `409 CONFLICT` and mutates nothing. A POST body containing `pageIds`/`handles` is treated as the legacy bulk-delete fallback — use `DELETE` for that.

### Assign resources to a template page
```
POST /projects/{projectId}/template-assignments/{pageId}
```
Adds assignment rows pointing many Shopify resources at ONE existing template page (shared-template model — no page is created or cloned). Target must be a live, resource-backed page of this project. All-or-nothing: a resource already on this page is an idempotent `existing`; any handle already on a DIFFERENT live page rejects the whole request with `409` (`details.conflicts`) and writes nothing.

### Page metadata (name / handle / SEO)
```
GET  /projects/{projectId}/page-settings/{pageId}
POST /projects/{projectId}/page-settings/{pageId}      (content:write)
```
`GET` returns the page row, assignments and SEO. `POST` ops: `rename` (`name`, optional `prefix`), `rename-custom` (`name` + `handle` + `assignmentId`; 409 on handle collision), `set-seo` (`seo` object).

### Bulk-delete pages
```
DELETE /projects/{projectId}/pages      (POST also accepted)
```
Soft-deletes pages. Provide **either** `pageIds` **or** `handles` (with `type`; `locale` optional, defaults to the project's stored default locale). Max **500** targets. Requires `content:delete` for every scoped credential (delegated grants and keys minted with a grant list get `403 INSUFFICIENT_SCOPE`, nothing deleted); only pre-scope shop keys keep historical delete access. A `handles` request naming a template-marker handle is rejected 400 and deletes nothing — delete such templates by `pageIds`.

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

## Page drafts → publish

Addressed by **`pageId`** — no locale/handle fallback.

```
GET    /projects/{projectId}/page-drafts/{pageId}
PUT    /projects/{projectId}/page-drafts/{pageId}      (content:write — never touches live)
DELETE /projects/{projectId}/page-drafts/{pageId}      (content:write — discard by exact CAS)
POST   /publish-versions/{versionId}                   (content:publish)
```

- **GET** returns the draft head when one exists, else live content, plus the tokens a save must replay: `headVersionId`, `pageUpdatedAt`, `projectUpdatedAt` (page/project tokens are the revisions the draft was *built on*; `null` for legacy rows — replay verbatim).
- **PUT** saves a draft from a **full item list** (≤200 items, each `id` + optional `type`/`data`/`children`; malformed graphs are 400) plus `expectedHeadVersionId` / `expectedPageUpdatedAt` / `expectedProjectUpdatedAt` exactly as GET returned. Stale → `409 STALE_PAGE`, nothing saved. Returns the new head version id.
- **DELETE** discards the draft head by exact CAS (`409 STALE_PAGE` when the head moved).
- **POST /publish-versions/{versionId}** body `{ "projectId", "pageId" }` (+ optional `replaceScheduledVersionId`). Same promotion + cache fan-out as the Studio publish. `409` when head or live base moved, or the replacement id no longer names the page's scheduled version — nothing published. A failed invalidation after a committed publish reports `cacheDelivery: "degraded"` (content changed; delivery queued).

## Global sections

```
GET  /projects/{projectId}/global-sections
POST /projects/{projectId}/global-sections                    { itemId, name }
GET  /projects/{projectId}/global-sections/{sectionId}        draft head or null
POST /projects/{projectId}/global-sections/{sectionId}        op-based
```

Ops on a section: `save-draft` (full item list + `expectedHeadVersionId` CAS; `content:write`), `discard-draft` (`versionId`), `publish-draft` (`versionId`; `content:publish`), `rename` (`name`), `delete` (`confirm="<sectionId>"`; `content:delete`; may report `cacheDelivery: "degraded"` — do not repeat the delete).

## Versions: history, schedule, restore

```
GET    /projects/{projectId}/versions?pageId=|kind=theme|retired-pages|scheduled&limit=
GET    /versions/{versionId}?type=page|theme&projectId=
POST   /versions/{versionId}/schedule        { projectId, type, publishAt, replaceScheduledVersionId? }
PATCH  /versions/{versionId}                 { projectId, type, publishAt }   (move a scheduled one)
DELETE /versions/{versionId}                 cancel a scheduled publication
POST   /versions/{versionId}/publish-now     { projectId, type }
POST   /versions/{versionId}/restore         { projectId, type, confirm: "<versionId>" }
PUT    /versions/{versionId}                 replace a pending version's content
```

- Default listing (`kind=scheduled`) is the current schedule (page + theme); `pageId=` lists that page's versions; `kind=theme` / `kind=retired-pages` (recovery) for the others.
- `publishAt` must be in the future; a page/project already having a scheduled version, or a lost replacement race, is `409` with nothing changed. Theme versions have no atomic replacement — cancel first (400 otherwise).
- `restore` overwrites live content: needs `content:publish` + `content:delete` and `confirm` equal to the versionId. A concurrent claim is `409` — retry.
- `PUT` replaces a pending (non-draft) version's content: `type=page` full snapshot fenced on the page revision inside it; `type=theme` fenced on `expectedProjectUpdatedAt`; `type=deferred-page` recaptures a catch-all version with `expectedScheduleRevision`. Draft versions are refused `409 CONFLICT`.

## Translations

### Per page
```
GET  /projects/{projectId}/page-translations/{pageId}?locale=<code>
POST /projects/{projectId}/page-translations/{pageId}
```
`locale` must be a configured, **non-default** language (the default is the source others translate from — POST refuses it). GET returns entries `{ itemId, key, source, translation, targetGeneration }` (`key` like `data.title`, used verbatim; sources are resolved server-side — client-supplied schemas are never trusted; not cached). POST replays entries with `translation` replaced (≤250 per request); each entry is compare-and-set on **both** `source` and `targetGeneration` — stale entries return in `stale`, were **not** written; `translation: ""` clears a key. Response `{ requested, applied, stale }`; read back with GET.

### Project-wide translation units
```
GET  /projects/{projectId}/translation-units?targetLocale=&kind=text|image&status=&limit=&after=
POST /projects/{projectId}/translations/validate        (dry run, zero writes)
POST /projects/{projectId}/translations/apply            (atomic under the project lock)
```
Batch: `{ targetLocale, units: [{ id, sourceGeneration, targetGeneration, translatedValue }] }` (≤50 units). Units are limited to what the stored project schema approves (text/richtext/textarea inputs; image units only at declared image inputs — image values take `{ url, alt?, width?, height? }`). `translatedValue: null` clears the overlay. Any stale source/target refuses the whole batch (`409 STALE_TRANSLATION`), nothing written; an identical retry converges to unchanged. These routes also accept project-bound translation agent tokens (`translations:read`/`translations:write` only — no general content access).

## Theme settings

```
GET   /projects/{projectId}/theme-settings?locale=&format=&view=
PATCH /projects/{projectId}/theme-settings      (POST also accepted)
```
GET returns the published theme JSON; with `locale` it also returns `staticTranslations` (resolved static text for that locale) and a `revision` — the project revision captured with the theme snapshot. PATCH shallow-merges top-level keys (nested objects replaced wholesale — GET first), writes the project's own config only, records a restorable ThemeVersion, and invalidates caches. Send the GET's `revision` as `expectedRevision` (required for delegated tokens — 428 otherwise; `null` when GET returned null, compared null-safely). Stale → `409 STALE_PROJECT`, nothing written.

```json
{ "theme": { "headerText": "#1d1b20", "footerBgColor": "#ed7623" } }
```
Response (`updatedKeys` empty when nothing changed — no cache invalidation then):
```json
{ "object": "theme_settings_update", "projectId": "clm123",
  "updatedKeys": ["headerText", "footerBgColor"], "theme": { "...": "full merged theme" } }
```
Theme rollback: restore the recorded ThemeVersion in Studio, or via version restore (`type=theme`).

## Languages / localization

```
GET  /projects/{projectId}/languages
GET  /projects/{projectId}/localization?kind=languages|glossary|static&locale=
POST /projects/{projectId}/localization        (op-based)
```
Languages: configured locales, default first — `data: []` means no configured languages (base-locale layout; an explicit `locale=en-us` read reaches the base page via the fallback chain). Localization ops: `add-language`, `delete-language` (`content:delete` + `confirm`=languageId), `glossary-upsert`/`glossary-delete` (+`confirm`), `static-save`, `static-key-default`, `static-key-delete` (+`confirm`).

## Portability & ops

```
GET  /projects/{projectId}/export                     (project:manage)
POST /projects/{projectId}/import                     (project:manage + content:publish + content:delete)
POST /backup-restores                                 (project:manage)
GET/POST /projects/{projectId}/backups                (project:manage)
GET/POST /projects/{projectId}/hierarchy              (project:manage)
GET/POST /projects/{projectId}/previews               (project:manage)
GET/POST /projects/{projectId}/hostnames              (project:manage)
GET/POST /projects/{projectId}/assignments            (mixed; destructive ops need content:delete + confirm)
```

- `export` is the versioned import/export JSON (ids regenerated) — the dashboard Export file; not a backup. `import` overwrites live content in place: multipart `file` (≤50MB), `options` (JSON string: `importTheme`, `importPages`, `pagesImportMode` override|skip, `selectedPageIds`), `confirm` = projectId. Every key issued since scopes exist must use this route (the legacy `/api/projects/import` admits only pre-scope keys and merchant sessions).
- `backups`: list / download (`?backupId=`) / diff (`?diff=`) / `op=create` (deduped) / `op=restore` → restores as a **new** project, never overwrites. `POST /backup-restores` uploads a backup file (≤50MB upload, ≤256MB decompressed) as a new project.
- `assignments`: `op=update`/`localize` are `content:write`; `unassign`/`reset-localized` confirm the exact id, `rename-locale` confirms the projectId — destructive (`content:delete`).
- `hostnames`: setting a policy changes edge serving — `canonical-hostname` validated, `confirm="<hostname>"`, desired-state write.

## Notes

- Live writes (`PATCH` pages, theme-settings, applied translations) run on the primary region and invalidate caches; read-replica requests are transparently replayed.
- Drafts and schedules only stage content (`content:write`, never live). The promotion calls — `publish-versions`, `publish-now`, `restore` — are themselves immediate live writes gated on `content:publish` (restore and project delete additionally `content:delete`); lifecycle ops need `project:manage`.
- Token auth is cached ~5 minutes — a freshly revoked token may keep working briefly.
- `POST` is accepted for update and delete because some clients/CDNs strip `PATCH`/`DELETE` bodies.
