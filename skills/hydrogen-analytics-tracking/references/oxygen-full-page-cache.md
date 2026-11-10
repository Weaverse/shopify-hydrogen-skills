# Oxygen Full-Page Cache (FPC) for Hydrogen

Tracking-adjacent because both touch the document response headers (`entry.server.tsx` and `server.ts`), and because the FPC contract is finicky enough that most teams fail to enable it on the first try.

## What FPC does

Oxygen's edge intercepts incoming requests. If a cached version of the HTML response is available and fresh, it's served directly without executing the Hydrogen worker. **TTFB on a Hit drops from ~1–2s to ~50ms.**

This is the single largest LCP improvement available for a marketing-style Hydrogen storefront where the HTML is mostly composed of CMS-managed sections (Weaverse) and product catalog data (Storefront API), with no per-visitor personalisation in the HTML itself.

## The cache contract

A response is **cacheable** if ALL of these are true:

1. Method is `GET`.
2. Response has `Oxygen-Cache-Control` header.
3. That header includes the `public` directive.
4. Status is 2xx or 3xx.
5. Response has **no `Set-Cookie` header**.
6. Response has a `Vary` header.
7. `Vary` is NOT `*` (Cloudflare's auto-`vary: Accept-Encoding` is fine).

Source: [shopify.dev — Oxygen full-page cache](https://shopify.dev/docs/storefronts/headless/hydrogen/caching/full-page-cache).

If any of the above fails, the response includes the header `oxygen-full-page-cache: uncacheable` and the next request is also served fresh (no caching).

## The two surprises that bite

### Surprise 1 — it's `Oxygen-Cache-Control`, NOT `Cache-Control`

These are **independent headers**. `Cache-Control` controls the browser cache (and Cloudflare's downstream cache). `Oxygen-Cache-Control` controls Oxygen's edge cache.

If you set only `Cache-Control: public, max-age=60`, Oxygen ignores it and your HTML stays uncached at the edge.

```ts
// app/routes/_index.tsx
import { data } from "react-router";

export async function loader({ context }: LoaderFunctionArgs) {
  const payload = await loadHomepageData(context);
  return data(payload, {
    headers: {
      // Edge cache — THIS is the FPC opt-in
      "Oxygen-Cache-Control": "public, max-age=60, stale-while-revalidate=86400",
      // Browser cache — must-revalidate so returning visitors pick up edge updates
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
```

Pair this with a `routeHeaders` export that forwards both headers:

```ts
// app/utils/cache.ts
export function routeHeaders({ loaderHeaders }: { loaderHeaders: Headers }) {
  const headers: Record<string, string> = {};
  const cacheControl = loaderHeaders.get("Cache-Control");
  if (cacheControl) headers["Cache-Control"] = cacheControl;
  const oxygenCacheControl = loaderHeaders.get("Oxygen-Cache-Control");
  if (oxygenCacheControl) headers["Oxygen-Cache-Control"] = oxygenCacheControl;
  return headers;
}
```

### Surprise 2 — any `Set-Cookie` disables FPC

Condition (5) is the one that bites. On classic Hydrogen (2026.4 and earlier) the Storefront API client attached `Set-Cookie: _shopify_essential=...` to responses that called `storefront.query()`, and teams stripped `Set-Cookie` in `entry.server.tsx` to get any hits at all.

On Hydrogen 2026.10 don't strip cookies by hand. `server.ts` owns the response boundary: it commits the session only when the request changed it, then calls `requestContext.applyResponseHeaders(response.headers)`, which applies the eligible Storefront API cookies and keeps personalized responses out of shared caches. A response that still carries `Set-Cookie` is simply not cached by Oxygen, which is the correct outcome. Pilot opts anonymous documents in from `entry.server.tsx` and leaves the cookie decision to that boundary:

```ts
// app/entry.server.tsx (Pilot, trimmed)
import { getFullPageCacheControl } from "~/utils/full-page-cache";

// … render with the nonce, then:
responseHeaders.set("Content-Type", "text/html");
responseHeaders.set("Content-Security-Policy-Report-Only", header);

const fullPageCacheControl = getFullPageCacheControl(
  request,
  responseStatusCode,
  responseHeaders.get("Cache-Control"),
);
if (fullPageCacheControl) {
  responseHeaders.set("Oxygen-Cache-Control", fullPageCacheControl);
  if (!responseHeaders.has("Vary")) {
    responseHeaders.set("Vary", "Accept-Encoding");
  }
}
```

`getFullPageCacheControl()` (`app/utils/full-page-cache.ts`) returns `public, max-age=300, stale-while-revalidate=86400` only for a `GET` with status 200 that the app didn't mark `no-store`, outside `account`, `api`, `cart` and `discount` (after an optional market prefix), and without Weaverse Studio preview params (`isDesignMode`, `weaverseHost`, `weaverseProjectId`, `weaverseVersion`, `__revisionId`). Everything else gets no `Oxygen-Cache-Control`.

## Verification recipe
After deploying FPC for the first time:
```bash
# GET, not HEAD: `curl -I` sends HEAD, which fails the method condition and
# always reports uncacheable — a classic false negative.
for i in 1 2; do
  curl -s -D - -o /dev/null -H "Accept-Encoding: gzip" https://your-store.com/ \
    | grep -iE "oxygen-|set-cookie"
  sleep 3
done
# Expected: miss (stored), then hit. Two more gotchas observed in production:
#
# 1. INTERMITTENT uncacheable: Hydrogen forwards eligible Shopify cookies
#    from Storefront API subrequests on some responses, so the same URL can
#    alternate between `miss` and `uncacheable`. The uncacheable responses
#    are CORRECT (they carry Set-Cookie); don't chase them.
#
# 2. NO HIT from a single client: the FPC appears replica/colo-local. Curl
#    probes from one machine may show `miss` forever even though everything
#    is configured right. `uncacheable → miss` proves eligibility; confirm
#    actual hits via the hit ratio under real traffic, not synthetic probes.
# TTFB sanity check
for i in 1 2 3; do
  curl -sS -o /dev/null -w "ttfb=%{time_starttransfer}s\n" https://your-store.com/
done
```
If you see `uncacheable` on every GET, dump the full response headers and check against the 7-condition contract above. The most common systematic failure is `Set-Cookie` (some code path on the route writes the session).
## Personalized data in the document blocks FPC at the root
Before touching headers, audit the **root loader's data**. Classic Hydrogen templates (and Pilot ≤2026.5) returned `cart: cart.get()` and `customerAccount.getAccessToken()` from the root loader. Deferred values **stream into the HTML document**, so every page is personalized and caching it would serve one visitor's cart or token to another.

On Hydrogen 2026.10 the fix is built into the cart store. Pilot renders `<CartProvider>` (from `createCartComponents()`) in `app/root.tsx` with **no** `initialData`, so the cart loads from Hydrogen's `/api/cart` handler after hydration; the header's account button reads the customer token from `GET /api/account/token` the same way. The root loader returns only per-market data (shop, menus, theme settings, `ShopifyScripts` `shop`/`i18n`), never per-shopper data. Don't reintroduce personalized data into root or route loaders without revisiting the FPC gate; until the document is anonymous, FPC headers are actively dangerous.

Also note: **FPC cannot be purged without a redeploy.** Keep `max-age` short for CMS-driven pages (Pilot uses 300s, matching the Weaverse SDK's content freshness); SWR does the heavy lifting.

## Per-route cache strategy

| Route | Recommended | Reason |
|---|---|---|
| `_index` (home) | `max-age=60, swr=86400` | Editorial updates from Weaverse Studio should appear fast |
| `/products/{handle}` | `max-age=300, swr=86400` | Product data changes infrequently; 5-min staleness is fine |
| `/collections/{handle}` | `max-age=300, swr=86400` | Same |
| `/blogs/*`, `/pages/{handle}` | `max-age=3600, swr=86400` | Mostly static content |
| `/cart`, `/account/*` | (no `Oxygen-Cache-Control`) | Per-user state, never cache |
| `/api/*` | (no `Oxygen-Cache-Control`) | Mutations + per-user reads |

Always pair with a **stale-while-revalidate** that exceeds your editorial-update tolerance. `swr=86400` means "serve stale up to 24h while regenerating in the background" — visitors after the `max-age` window get the cached version instantly AND the worker runs to update the cache for the next batch. Net effect: ~all traffic hits cache, origin sees ~0.1% of request volume.

## What never goes in cacheable HTML

Audit each cacheable route's loader chain for:

- **`session.set` / `session.commit` calls** — these write Set-Cookie. Either remove from cacheable routes or move them to a deferred sub-fetch the cached HTML hydrates from.
- **Customer-specific data inlined in the HTML** — customer name, "Welcome back, X", per-customer pricing, etc. If you need any of this, fetch it post-hydration via a client-side fetch (won't be cached) and render after.
- **CSRF tokens** — these MUST be per-request, can't be cached. If your forms use CSRF, that token comes via a separate non-cached endpoint, never inlined in cacheable HTML.

CSP nonces are OK to cache — they're per-RESPONSE (not per-user), and the inline scripts referring to the nonce are part of the same response, so cached nonce + cached inline scripts stay consistent.

## When NOT to enable FPC

- The route renders any customer-specific data in HTML.
- The route writes a session cookie that's required for downstream functionality (and you can't easily move the write elsewhere).
- The route's data has tighter freshness requirements than your `max-age` (e.g. live inventory < 30s, real-time pricing for a stock chart).

For these cases, lean on Hydrogen's **sub-request caching** instead: pass an explicit `cache` to every `storefront.graphql(doc, { variables, cache })` call (Hydrogen 2026.10 has no default; Pilot uses `CACHE_DEFAULT`/`CACHE_SHORT`/`CACHE_LONG` from `app/utils/cache.ts`, built on `Cache` from `@shopify/hydrogen`). Sub-request cache reduces the worker's Storefront API roundtrips even when the rendered HTML itself can't be edge-cached. Read [`hydrogen-cookbooks/performance-best-practices`](../../hydrogen-cookbooks/references/performance-best-practices.md) for that pattern.

## Debugging headers
The status header observed live on Oxygen (June 2026) is **`oxygen-full-page-cache`**, not `oxygen-cache-status` — grep for both if tooling disagrees.
| Header | Values | Meaning |
|---|---|---|
| `oxygen-full-page-cache: hit` | — | Served from edge cache, no worker run |
| `oxygen-full-page-cache: miss` | — | Worker ran, response stored for next time |
| `oxygen-full-page-cache: stale` | — | Stale served, worker ran in background to refresh |
| `oxygen-full-page-cache: uncacheable` | — | One of the 7 conditions failed — see body of this doc |
| `oxygen-cache-control` | what you set | The cache directive Oxygen evaluated |
| `server-timing: cfRequestDuration;dur=...` | float ms | How long the worker took (only on miss/stale) |
