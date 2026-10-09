---
name: weaverse-content-api
description: Use when reading or updating live Weaverse content programmatically — pulling projects/pages/theme settings, bulk-editing page content, pushing AI-generated copy, managing page drafts, scheduled publications, version restore, translations, creating/copying projects, deleting pages, or uploading media to Shopify for use in Weaverse. Triggers on requests to update a Weaverse project via API, push content to a live project, run bulk content edits, publish/restore content, apply translations, or upload images/assets to Shopify from automation.
---

# Weaverse Content API

Read and edit Weaverse content (projects, pages, theme settings, translations) outside the Studio editor, over an authenticated REST API. Use it for bulk edits, AI/automation content pipelines, staged draft→publish flows, and scheduled or versioned content changes.

- **Base URL:** `https://studio.weaverse.io/api/v1/content`
- **Machine spec:** `GET https://studio.weaverse.io/api/v1/content/openapi.json` (OpenAPI 3.1, no auth) — the authoritative contract. Fetch it for exact field-level schemas; this skill is the workflow guide.
- Full endpoint details: `references/endpoints.md`. Rich-text/Portable Text details: `references/portable-text.md`.
- Helper script: `scripts/weaverse_content_api.mjs` (zero-dependency, Node 18+).

## The one thing you must understand first

**Not every write goes live. The API has three write models:**

1. **Live edits** — `PATCH .../pages/:type/*handle` (item data), `PATCH .../theme-settings`, and translation writes apply immediately and invalidate caches, going live through `api.weaverse.io` — the same path a Studio save takes.
2. **Staged writes + explicit promotion** — page drafts (`GET/PUT/DELETE .../page-drafts/:pageId`), global-section drafts (`op=save-draft`/`discard-draft`), and pending-version replacement (`PUT /versions/{versionId}`, CAS-fenced; drafts refused) don't change live by themselves. Promotion is a live write: `POST /publish-versions/{versionId}` (publish a saved draft), `POST /versions/{versionId}/publish-now` (publish a scheduled version **immediately**), or `POST /versions/{versionId}/restore` (**immediately overwrites live content** — a confirm-gated rollback). `POST /versions/{versionId}/schedule` is **not** inert either: it commits an automatic live change at `publishAt` with no further call — so a `PUT` replacement of an already-scheduled version also goes live at that time. All of these need `content:publish` (restore also `content:delete`).
3. **Project lifecycle** — `POST /projects` with `op=create|copy|delete|set-settings|purge-cache` (scope `project:manage`; delete also needs `content:delete` + `confirm`). Projects **can** be created through the API — a blank or theme-seeded project, or a background copy of this shop's own or a public demo-store project.

So the lifecycle is:

```
Create project        →  POST /projects (op=create) — or start from Weaverse Builder / demo store
Create initial pages  →  import a project JSON into Studio (generating-weaverse-project-json)
                          OR create pages one by one via POST /projects/:projectId/pages
Update content        →  live PATCH (item edits, theme settings) when immediacy is wanted
                          OR draft → review → publish / schedule when it must be gated
Fix a bad publish     →  restore a version (confirm-gated) or re-PATCH
```

## When to Use

- Push AI-generated or translated copy into an existing live project
- Bulk-edit content across many pages/items
- Read current page content/items to diff or round-trip
- Add a new typed item to a page (via `PATCH` with a `type` on the new id) or relink `children`
- Create a `CUSTOM` page or a resource-backed template page (`POST /projects/:projectId/pages`)
- Stage edits as a draft, then publish now, on a schedule, or discard
- Restore a previous page/theme version, or inspect publish history
- Read/write per-locale translations for a page, or project-wide translation units
- Create/copy/delete a project or change its name/default locale (`POST /projects` lifecycle ops)
- Delete pages in bulk
- Upload an image/video to Shopify and reference its CDN URL in a Weaverse item

## Authentication

Every endpoint except `openapi.json` needs a bearer token:

```
Authorization: Bearer <WEAVERSE_API_KEY>
```

- Get a shop key from **Weaverse Studio → Dashboard → Account/Settings → API Keys**. Store it in an env var (`WEAVERSE_API_KEY`); never hardcode it, never pass it as a `?apiKey=` query param outside local testing — query params leak into server/CDN logs.
- A shop key is scoped to one shop. Requests for a project owned by another shop fail (403/404 — the API never discloses other tenants).
- The same token also authorizes the Shopify proxy (see "Upload resources to Shopify").

### Scopes and token kinds

The `bearerAuth` scheme accepts a shop API key, a **scoped API key**, a **delegated MCP OAuth token**, or (translation-unit routes only) a project-bound translation agent token. Scopes:

| Scope | Grants |
|---|---|
| `content:read` | Read projects, pages, theme settings, versions, drafts, translation units |
| `content:write` | Save drafts and non-destructive edits (items, metadata, SEO, assignments, languages, glossary). Cannot call the explicit publish/schedule/restore/delete endpoints — **but its live edits (`PATCH .../pages/...`, page create) reach the storefront immediately** |
| `content:publish` | Publish drafts, schedule/reschedule/cancel publications, restore versions, publish global sections |
| `content:delete` | Delete pages/global sections/languages/static keys, override reverts; required *with* `project:manage` for project deletion |
| `project:manage` | Create/copy/delete projects, settings, variants, hierarchy, backups, previews, hostname policy |
| `translations:read` / `translations:write` | Translation-unit routes only; never general content access |

- A missing scope on a scoped credential returns `403 INSUFFICIENT_SCOPE` with nothing written.
- A **legacy unscoped key** keeps read/write/translation baseline access and every pre-scope endpoint, but never gains publish/delete/project-manage implicitly — **except its historical bulk page-delete access** (`DELETE .../pages` still works for keys minted before scopes existed). Treat such a key as destructive-capable and replace it with a scoped key.
- **Delegated (MCP OAuth) tokens must send revision tokens on writes**: `expectedUpdatedAt` on page patches, `expectedRevision` on theme-settings — omitted → `428 PRECONDITION_REQUIRED`. API keys may omit them, but sending them is still the safe default.
- A scoped key can be minted task-tight (e.g. `content:read` + `translations:write` for a translation agent) so a leaked or runaway script cannot delete or publish. Prefer that for automation.

> The spec accepting delegated MCP OAuth tokens is an auth fact only. Hosting an MCP server or listing a Claude/ChatGPT connector is a separate activation this skill pack does not perform.

## Core live-update workflow

**Read before you edit.** To change existing content you must target real item ids, so read the page first — you cannot patch blindly. New items are the one exception: they use a fresh id plus a `type`, and must fit the page tree (a `children` reference must point at an id already on the page or created in the same request).

1. **Find the project** — `GET /projects`, match by name, keep its `id`.
2. **Pick a locale** — `GET /projects/:projectId/languages`. Keep the `isDefault: true` code (e.g. `en-us`). An empty `data: []` is a valid state: the project has no configured languages, everything lives on the base locale — don't guess or invent a code; an explicit `locale=en-us` read reaches the base page through the fallback chain.
3. **Read the page** — `GET /projects/:projectId/pages/:type/*handle?locale=<code>`. **Always pass `locale`.** Resolution falls back requested locale → project default → `en-default`, so a missing locale can still *succeed* while returning a different locale's page — the edit then lands on the wrong page. The default `weaverse` format already returns **every item with its `id`** — that id is exactly what the patch needs (`?meta=true` only matters for `portable-text` reads). Keep the response's `updatedAt`; it is the optimistic-concurrency token for the patch.
4. **Build the patch** — for each item, send only the fields that change inside `data` (it shallow-merges; nested objects are replaced wholesale). Every entry needs **both `id` and `data`** — `data` is not optional, even for a topology-only relink; use `"data": {}`. To **create** a new item, give it a fresh `id` and supply its `type`. Include the **same `locale`** you read with, and the read's `updatedAt` as `expectedUpdatedAt`:
   ```json
   {
     "locale": "en-us",
     "expectedUpdatedAt": "2026-10-21T12:00:00.000Z",
     "items": [
       { "id": "itm1", "data": { "heading": "New heading" } },
       { "id": "itm-new", "type": "Hero", "data": { "heading": "Fresh section" }, "children": [{ "id": "itm1" }] }
     ]
   }
   ```
5. **Patch** — `PATCH /projects/:projectId/pages/:type/*handle` (POST accepted if your client/proxy can't send a `PATCH` body). Max **100 items** per request — chunk larger edits. Add `"exact": true` to refuse locale/handle fallback and write only the assignment whose stored `(type, handle, locale)` is exactly the one addressed (delegated writes are always exact).
6. **Check the response** — `{ object: "page_update", requested, updated, created, notFound, failed, updatedIds, createdIds, notFoundIds, failedIds }`. Non-empty `notFoundIds` = ids not on the resolved page (wrong page/locale, stale ids, or a new id sent without `type`) — re-read with the right locale, don't retry blind. `failedIds` = items whose outcome is unconfirmed after a mid-request stale detection — re-read and reapply those; don't assume they applied.

**Stale refusal:** if the page changed since your read (e.g. a concurrent Studio save), the whole request is rejected `409 STALE_PAGE` before anything is written. Re-read and reapply on top of the newer content — never retry the same patch. Theme settings behave the same with `expectedRevision` (`409 STALE_PROJECT`).

A successful live patch invalidates caches and is served through `api.weaverse.io` — the same path a Studio save takes. When the response is ambiguous (`failedIds`, `cacheDelivery: "degraded"` on publish/delete), re-read the resource to confirm the actual state before reporting success.

### Populate a new or empty page in one request

A page created with `POST /pages` (or an empty template) has only a root `main` item. To build the whole page from an import-style JSON:

1. Read the page and take the root `main` item id.
2. Send one PATCH (≤100 items) with: the root `{ "id": <rootId>, "data": {}, "children": [...] }` (`data` required, even empty), plus every section/block as a new item with `id`, `type`, `data`, `children`.
3. Expect `updated: 1, created: N, notFound: 0`.

Use fresh ids per page (don't reuse ids from another page or an earlier test render). Content sent this way skips Studio's import, so schema **presets are not applied** — every non-default value must be in `data`.

### Theme settings

`PATCH /projects/:projectId/theme-settings` with `{ "theme": { ...changedKeys } }` shallow-merges top-level theme keys (nested objects replaced wholesale — read them first), writes the project's own config only, and records a restorable ThemeVersion. Send the GET response's `revision` as `expectedRevision`. Theme keys are global: a product-card key restyles every product card on the site. The response returns the full merged theme and `updatedKeys`.

### Page metadata (name, SEO)

`GET/POST /projects/:projectId/page-settings/:pageId` — `op=rename` (name/prefix), `op=rename-custom` (name + handle, `assignmentId`), `op=set-seo` (`seo` object). SEO **is** writable here; it is not part of the page-content PATCH.

## Draft → publish workflow

When an edit must be reviewed or gated instead of going live immediately, use drafts. Addressing is by **`pageId`** — no locale/handle fallback, so a draft can never land on another assignment.

1. **Read the basis** — `GET /projects/:projectId/page-drafts/:pageId`. Returns the current draft head when one exists, else live content, plus the revision tokens a save must replay: `headVersionId`, `pageUpdatedAt`, `projectUpdatedAt`. With a draft head, the page/project tokens are the revisions that draft was built on — a save is refused once live moved past them.
2. **Save the draft** — `PUT .../page-drafts/:pageId` with the **full item list** (≤200 items, each `id` + optional `type`/`data`/`children`; malformed graphs are 400) plus the three `expected*` tokens exactly as GET returned them (`null` included verbatim). Refused `409 STALE_PAGE` when the draft head, live page, or project moved — nothing saved, re-read. **Never touches live.**
3. **Publish** — `POST /publish-versions/:versionId` with `{ "projectId", "pageId" }` (optionally `replaceScheduledVersionId` to atomically replace an existing scheduled version). Same promotion and cache fan-out as the Studio publish; needs `content:publish`. A failed cache invalidation after a committed publish reports `cacheDelivery: "degraded"` — content changed, delivery queued.
4. **Or discard** — `DELETE .../page-drafts/:pageId` by exact CAS on the head.

### Global sections

`GET /projects/:projectId/global-sections` lists sections with usages. `POST .../global-sections` creates one (`{ itemId, name }`). Per section: `GET .../global-sections/:sectionId` reads the draft head (null when none); `POST .../global-sections/:sectionId` runs `op=save-draft` / `discard-draft` / `publish-draft` / `rename` / `delete`. `save-draft`/`discard-draft` are `content:write`; `publish-draft` needs `content:publish`; `delete` needs `content:delete` + `confirm="<sectionId>"`. `save-draft` takes the full item list and the `expectedHeadVersionId` CAS token.

## Versions: history, schedule, restore

- **List** — `GET /projects/:projectId/versions?pageId=<id>` (that page's versions), `?kind=theme` (theme versions), `?kind=retired-pages` (retired page versions, recovery), default `?kind=scheduled` (current schedule, page + theme).
- **Read one** — `GET /versions/:versionId?type=page|theme&projectId=<id>`.
- **Schedule** — `POST /versions/:versionId/schedule` `{ projectId, type, publishAt }` (+ `replaceScheduledVersionId` for page versions; rejected 400 for theme). The version **goes live automatically at `publishAt`** — no further call; treat scheduling as approving a live change. `publishAt` must be future; a page/project already having a scheduled version is `409`, nothing changed.
- **Move / cancel** — `PATCH /versions/:versionId` (reschedule) and `DELETE /versions/:versionId` (cancel) on scheduled publications only — a version no longer scheduled is `409`/404.
- **Publish now** — `POST /versions/:versionId/publish-now` `{ projectId, type }`.
- **Restore** — `POST /versions/:versionId/restore` `{ projectId, type, confirm: "<versionId>" }`. **Restoring overwrites live content**, so it needs both `content:publish` and `content:delete` plus the confirm string. Treat it as a merchant-approved rollback, not a routine edit. On `409` (concurrent claim, nothing changed) never replay: re-read the version and live target, and reconfirm with the merchant for the current state first.

## Translations

Two protocols; both write only `Translation` rows — base page content, items, and every other locale stay untouched, and the project default language is rejected as a target (it is the source others translate from).

- **Per page** — `GET /projects/:projectId/page-translations/:pageId?locale=<code>` returns every translatable key with its `source`, current `translation`, and the `targetGeneration` a writeback must replay. `POST` the same URL with entries echoed verbatim except `translation` (≤250 per request). Each entry is compare-and-set on **both** the `source` it answers for and the `targetGeneration` it read — a delayed agent can never overwrite a merchant's newer source text or another writer's newer translation; refused entries come back in `stale` and were **not** written. `translation: ""` clears a key (kept distinct from never-translated). After writing, GET again to read back.
- **Project-wide units** — `GET /projects/:projectId/translation-units?targetLocale=<code>` (`kind=text|image`, `status`, cursor paging) inventories every unit the stored project schema approves — components without a stored schema or fields of other input types are never listed or writable. `POST /projects/:projectId/translations/validate` runs every check with zero writes (dry run); `POST .../translations/apply` writes the batch atomically under the project lock. Any stale source/target refuses the whole batch (`409 STALE_TRANSLATION`) and writes nothing; an identical retry converges to unchanged. These routes also accept project-bound translation agent tokens (`translations:read`/`translations:write` only).

## Project lifecycle

`POST /projects` with an `op` (scope `project:manage`):

| `op` | Body | Effect |
|---|---|---|
| `create` | `name?`, `projectId?`, `config.themeName?` | Blank or theme-seeded project |
| `copy` | `sourceProjectId`, `name?` | Background clone (202 + `targetProjectId`); source must be this shop's own or a public demo-store project; completion observed by listing the target's pages |
| `delete` | `projectId`, `confirm` (= projectId) | Soft-delete with a pre-delete backup; also needs `content:delete` |
| `set-settings` | `projectId`, `expectedUpdatedAt`, `name?`, `defaultLocale?` | Revision-fenced non-secret settings |
| `purge-cache` | `projectId` | Studio "Clear cache" |

`PATCH /projects/:projectId` renames a project (`name` only, unknown fields 400). Ask the merchant before create/copy/delete — these change account-level state, not just one page's content.

### What the Content API cannot do

- Publish Shopify resources to a sales channel — the proxy token lacks `read_publications`/`write_publications`.
- Set market settings over an API key — `PATCH /projects/:projectId` accepts `name` only. (Hierarchy — variants, parent link/detach, page overrides — is writable through the dedicated `POST /projects/:projectId/hierarchy` route under `project:manage`, destructive ops confirm-gated; see `references/endpoints.md`.)

### Page addressing

Pages are addressed by page type + handle:

```
INDEX, PRODUCT, ALL_PRODUCTS, COLLECTION, COLLECTION_LIST, PAGE, BLOG,
ARTICLE, CART, CUSTOMER, NOT_FOUND, PASSWORD, SEARCH, CUSTOM
```

- **Singletons** (`INDEX`, `ALL_PRODUCTS`, `COLLECTION_LIST`, `CART`, `CUSTOMER`, `NOT_FOUND`, `PASSWORD`, `SEARCH`) — one page per project, **omit the handle**.
- **CUSTOM** — addressed by its path (the splat may contain slashes, e.g. `blogs/news`).
- **Templated** (`PRODUCT`, `COLLECTION`, `PAGE`, `BLOG`, `ARTICLE`) — keep a shared default template at the empty handle, so a **missing handle is rejected** (it won't silently edit the template). Pass the real handle.
- **A real handle does not guarantee a per-resource page.** Reading `…/pages/PRODUCT/<real-handle>` **succeeds (200)** even when no per-resource override exists — the resolver falls back to the type's shared default template, and the returned `id` identifies that shared page. A PATCH then edits the template every resource of that type renders. Inspect the returned `id` before patching; create the per-resource override first (`POST /pages` clones the shared default) when the change is meant for one resource. Deliberate shared-template edits are fine — make them knowingly.

**Locale always matters.** On reads/updates, always pass a real `locale` code (from List languages). In list-pages responses, a row's `locale` may be `null` for market-first projects (rows are keyed by market, not locale) — don't echo `null` back; pass a real code and let resolution map it to the market (e.g. `locale=en-us` resolves market `us`).

See `references/endpoints.md` for the full endpoint list, query params, and response shapes.

## Upload resources to Shopify

The Content API itself has no upload endpoint. To get media into a Weaverse item, upload it to Shopify first, then reference the returned CDN URL.

Upload goes through the **Weaverse Shopify proxy**, which accepts the same Weaverse token:

```
POST https://studio.weaverse.io/api/admin-graphql
Authorization: Bearer <WEAVERSE_API_KEY>
Content-Type: application/json
```

The body is a normal Shopify Admin GraphQL request (`{ "query": "...", "variables": {...} }`). Upload is the standard two-step Shopify flow:

1. `stagedUploadsCreate` → get a `url` + `parameters` (a presigned target) and a `resourceUrl`.
2. Upload the file bytes to that staged `url` with the returned `parameters` (multipart POST, not through the proxy).
3. `fileCreate` with `originalSource: <resourceUrl>` → Shopify ingests it and returns the permanent CDN file.
4. Read back the file's `image.url` / `sources` and put that CDN URL into the Weaverse item `data` via the update workflow above.

Reference implementation in the builder repo: `app/backend/admin/file.server.ts` (`generateStagedUploadLinks` → `stagedUploadsCreate`, then `fileCreate`). When in doubt, mirror its mutations and field selections.

> Alternatively, when a connected Shopify MCP is available, its image-upload / `graphql_mutation` tools do the same job without the proxy. Use whichever is connected.

The helper script's `upload` command runs all four steps and prints the CDN URL, id and size per file. Send a `User-Agent` header on proxy calls — requests without one are rejected with `403`. The proxy is a normal Admin GraphQL endpoint, so other admin mutations the token allows (e.g. `menuUpdate` for navigation menus, `fileDelete`) also work through it.

## Helper script

`scripts/weaverse_content_api.mjs` wraps auth and the common calls. It reads `WEAVERSE_API_KEY` from the environment.

```bash
export WEAVERSE_API_KEY=...

node scripts/weaverse_content_api.mjs projects
node scripts/weaverse_content_api.mjs languages <projectId>
node scripts/weaverse_content_api.mjs theme <projectId>
node scripts/weaverse_content_api.mjs theme-update <projectId> <theme.json>     # flat { "key": value }; the script wraps it in { theme } and replays the current revision as expectedRevision (409 STALE_PROJECT on a concurrent change)
node scripts/weaverse_content_api.mjs pages <projectId> [type]
node scripts/weaverse_content_api.mjs page <projectId> <type> [handle] [locale]   # reads with ?locale
node scripts/weaverse_content_api.mjs create-page <projectId> <type> <handle> [name]
node scripts/weaverse_content_api.mjs update <projectId> <type> [handle] <patch.json>   # omit handle for INDEX & other singletons
node scripts/weaverse_content_api.mjs delete <projectId> <type> <handle...>
node scripts/weaverse_content_api.mjs delete-ids <projectId> <pageId...>      # projects without languages
node scripts/weaverse_content_api.mjs upload <file...>                        # → Shopify Files, prints CDN URLs
```

Use it to inspect a project quickly and to apply patch files. For anything the script doesn't cover — drafts, publishing, versions, translations, lifecycle ops — call the REST endpoints directly (see `references/endpoints.md`) or read `openapi.json`.

## Red Flags

- **Assuming a write is staged** — only draft saves (`PUT page-drafts`, global-section `save-draft`) and pending-version `PUT /versions/{id}` stay off live by themselves (a replaced *scheduled* version still goes live at its `publishAt`). Live item `PATCH` and `POST /pages` under plain `content:write` change the storefront immediately; `schedule` goes live automatically at `publishAt`; `publish-versions`/`publish-now`/`restore` go live at once.
- **Creating/copying/deleting a project without the merchant's go-ahead** — lifecycle ops (`project:manage`, delete + `content:delete` + `confirm`) change account-level state. `op=copy` returns `202` and keeps running in the background; observe completion by listing the target's pages.
- **Restoring a version casually** — `POST /versions/:id/restore` overwrites live content (needs `content:publish` + `content:delete` + `confirm="<versionId>"`). Merchant-approved rollback only.
- **Retrying a `409 STALE_PAGE`/`STALE_PROJECT`/`STALE_TRANSLATION` refusal verbatim** — the resource moved. Re-read, rebuild the edit on top of the newer content, then write. `failedIds` in a `page_update` means unconfirmed outcomes — re-read those items before assuming anything.
- **A delegated (MCP OAuth) token omitting `expectedUpdatedAt`/`expectedRevision`** — `428 PRECONDITION_REQUIRED`. API keys may omit them; sending them anyway is the safe default.
- **Omitting `locale` on a page read/update** — resolution falls back requested → default → `en-default`, so the request can *succeed* on a different locale's page and the edit looks "missing" (distinct from `PAGE_NOT_FOUND`). Always pass a real code from List languages; use `"exact": true` on writes when fallback must be impossible.
- **Sending a new item id without a `type` in a PATCH** — unknown ids are created only when `type` is supplied; otherwise they land in `notFoundIds`. `children` ids must already be on the page or be created in the same request.
- **Patching an existing item without reading its id first** — you must target a real item id. Read the page first (with the right `locale`); the `weaverse` read already includes every item `id` (`?meta=true` not needed).
- **Sending a children-only entry without `data`** — every `items` entry must carry a `data` object; topology-only changes must still send `"data": {}` (`item.data must be an object`).
- **Reading `data: []` from List languages as an error (or guessing a language)** — an empty list means no configured languages (base-locale layout). Don't invent a locale; explicit `en-us` reaches the base page through the fallback chain.
- **Echoing back `locale: null`** — list-pages rows can be `null` for market-first projects. Don't send `null`; pass a real code and let resolution map it to the market.
- **Adding `?meta=true` for normal edits** — it only affects `portable-text` reads. On a `weaverse`-format read it changes nothing.
- **Ignoring `notFoundIds`/`stale` in a response** — your ids aren't on the resolved page, or the source/target moved. Re-read with the right locale / re-run GET; don't retry the same payload.
- **Sending more than 100 items in one update** (200 in a draft save, 250 translations, 500 delete targets) — chunk the request.
- **Editing a templated type with an empty handle** — rejected by design. Pass the real handle.
- **Hardcoding the token or using `?apiKey=`** — use `Authorization: Bearer` from an env var; mint a task-scoped key for automation instead of a full shop key.
- **Replacing whole `data` objects** — updates shallow-merge. Send only changed fields; don't resend the entire `data` and risk wiping nested values you didn't read.
- **Putting a non-Shopify URL into a media field after "upload"** — finish the `fileCreate` step and use the returned Shopify CDN URL, not the staged/temporary `resourceUrl`.
- **Sending `locale: ""` to bulk delete** — rejected (`"locale" cannot be an empty string`). For a project with no languages, delete by `pageIds` (`delete-ids`).
- **Trusting a local dev render right after a PATCH** — a running Hydrogen dev server can keep a cached copy of an item id it rendered before, so the page still shows old data. Restart the dev server (or verify on the deployed storefront) before concluding the patch didn't apply.
- **Patching a live page with sections the deployed code doesn't have yet** — new section types or settings render broken on production until the code is deployed. Deploy first, or patch right before deploying and say so.
- **Changing global theme keys without a backup** — save the current values from `GET theme-settings` before a `theme-update` (its `revision` doubles as the CAS token). ThemeVersions are restorable in Studio / via version restore.
- **Wrapping the theme-update file in `{ "theme": … }`** — the script already wraps it, so this writes a stray `theme` key instead of your settings. Check `updatedKeys` in the response.

## Related skills

- `generating-weaverse-project-json` — creates the import JSON that establishes the structure this API then updates. The item ids you patch here come from that JSON (or from a page read back with the right `locale`).
- `cloning-websites-to-weaverse` / `figma-to-weaverse` — produce the section plan that feeds the JSON generator.
- `hydrogen-markets-localization` — end-to-end markets/localization workflow this API's translation routes serve.
