# SDK Caching, Diagnostics & Multi-Instance Pages (5.15.x–5.16.x)

Verified against `@weaverse/hydrogen` 5.16.1 source and live production probes (June 2026). 5.16.0 (schema 0.10.0) additionally moves the Zod validation runtime to a dev-only boundary so it tree-shakes out of the production storefront bundle (~20KB gzip off client + SSR).

## How the SDK caches Builder API responses

`weaverse.loadPage()` and theme-settings fetches go through Hydrogen's `withCache.fetch` (Oxygen sub-request cache). The cache key is composed from:

- request URL + method + **POST body** + projectId + cache target

Because the body is in the key, anything volatile in the body fragments the cache. Since **5.15.1** the SDK normalizes the storefront URL it sends: only the pathname plus `__revisionId`, `isDesignMode`, and `weaverse*` params survive — `utm_*`, `fbclid`, `gclid` etc. no longer cause cache misses. On 5.15.0 and earlier, every distinct ad-click URL was a guaranteed Builder round-trip.

Default cache windows (5.15+):

| Target | Shared freshness | SWR |
|---|---|---|
| page content (`project`) | 300s | 86400s |
| theme settings | 300s | 86400s |
| custom pages (sitemap) | 3600s | 86400s |

Implications:

- **Publish-to-live latency is up to 5 minutes** on cached storefronts. The Oxygen sub-request cache cannot be purged remotely by the Builder — only a redeploy clears it. Tell merchants this is expected, not a bug.
- SWR means warm requests are served instantly even after freshness expires (revalidation happens in the background), so the freshness window mostly controls Builder origin load, not storefront TTFB.
- **Design mode and revision previews (`?__revisionId=`) bypass this cache entirely** — Studio always sees the latest state.

## Builder API diagnostics headers

The Builder's public endpoints (`/api/public/project`, `/api/public/project_configs`) return timing headers. Use them to attribute storefront TTFB:

```bash
curl -s -D - -o /dev/null -X POST https://studio.weaverse.io/api/public/project_configs \
  -H 'Content-Type: application/json' \
  -d '{"projectId":"<PROJECT_ID>"}' | grep -iE 'server-timing|x-weaverse-cache'
```

| Header | Meaning |
|---|---|
| `server-timing: weaverse-total;dur=…` | Total Builder handler time (ms) |
| `server-timing: weaverse-fresh;dur=…` | Present only when the Builder rebuilt the payload (cache miss) |
| `x-weaverse-cache: cached \| fresh` | Whether the Builder served from its in-process cache |

Healthy numbers: `cached` hits are **sub-millisecond to single-digit ms**. A `fresh` rebuild costs 300–900ms+ depending on page size. If you see `cached` with high `weaverse-total`, something synchronous is in the hot path — report it.

Note: `/api/public/project` requires `i18n` in the body (`{"language":"EN","country":"US","pathPrefix":""}`) or it 500s — keep that in synthetic probes.

## Nested Weaverse pages: the multi-instance model

A route tree may render **multiple `<WeaverseContent />` instances on one URL** (e.g. a layout route with its own Weaverse page wrapping a child route's page). Facts that matter:

- Each instance resolves its own data via a 3-tier policy: explicit `weaverseData` prop → the rendering route's own `useLoaderData()` → ancestor-walk fallback (back-compat).
- **Caveat:** a leaf route that renders `<WeaverseContent />` *without* its own `weaverseData` falls through to the ancestor walk and re-renders its layout's page — duplicated content. Give every `WeaverseContent` route a loader that returns `weaverseData`.
- Client instances live in `window.__weaverses`, keyed by pageId. Instance identity follows the **browser URL** (not React Router's `.data` endpoints), so cart mutations / `revalidate()` reuse the instance and sync fresh loader data instead of resetting section state (5.15.0+).
- Studio binding for co-located instances requires SDK ≥5.15.0 **and** a Builder deployed after June 2026: the bridge binds the page the merchant opened (editor RPC), falling back to the leaf instance deterministically. On older versions Studio binds by mount-order race — "Studio cannot detect the page" symptoms.
- `loadPage({ type, handle })` with an explicit `handle` wins over URL-derived resolution on the Builder, so a layout can load `handle: "help"` while the browser is on `/help/contact`.

## Upgrading client themes across 5.x

Process that separates real breakage from noise:

1. **Baseline first**: run `npx react-router typegen && tsc --noEmit` on the *current* version and record the errors. Client forks usually have pre-existing failures; you only own the delta.
2. Check peers: `npm view @weaverse/hydrogen@<version> peerDependencies` — 5.15/5.16 need `@shopify/hydrogen >=2025.5`, react 19, react-router 7.
3. Bump, reinstall, re-run typecheck; diff against the baseline.
4. Known break at **5.15**: `errorComponent` is now `FC<{ error: unknown }>` (was an Error-like shape). Port the upstream Pilot `GenericError` which narrows `error` at runtime (`typeof error === "object" && "message" in error`).
5. Finish with a full `shopify hydrogen build --codegen`.

## Pilot template release/deploy flow (Weaverse-internal)

- Pilot lives inside the Weaverse pnpm monorepo but ships an **npm** lockfile. Refresh it with `npm i --package-lock-only --workspaces=false` (plain `npm i` chokes on the monorepo's `catalog:` protocol).
- Deploying the demo (`pilot.weaverse.dev`): merge to `Weaverse/pilot` `main` → `gh repo sync Weaverse/pilot-demo --source Weaverse/pilot` → the fork's Oxygen GitHub Action deploys automatically (~1 min).
