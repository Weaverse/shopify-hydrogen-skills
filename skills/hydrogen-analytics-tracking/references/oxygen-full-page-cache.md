# Oxygen Full-Page Cache (FPC) for Hydrogen

Tracking-adjacent because both touch `entry.server.tsx` response headers, and because the FPC contract is finicky enough that most teams fail to enable it on the first try.

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

### Surprise 2 — Shopify's `_shopify_essential` cookie disables FPC

Hydrogen's Storefront API client attaches `Set-Cookie: _shopify_essential=...` to every response that called `storefront.query()`. This is session affinity for the Storefront API backend. **And it's enough on its own to mark every page response as `Uncacheable`** per condition (5) above.

You'll observe:
- `Oxygen-Cache-Control: public, max-age=60, ...` ✅ in response
- `Set-Cookie: _shopify_essential=...` ❌ also in response
- `Oxygen-Cache-Status: Uncacheable` ❌ blocked

The fix: **strip `Set-Cookie` from responses that opted into FPC**, in `entry.server.tsx`:

```ts
// app/entry.server.tsx
export default async function handleRequest(
  request,
  responseStatusCode,
  responseHeaders,
  reactRouterContext,
  context,
) {
  // … existing render code …

  responseHeaders.set("Content-Type", "text/html");
  responseHeaders.set("Content-Security-Policy-Report-Only", cspHeader);

  // FPC contract: strip Set-Cookie when the route opted into edge caching.
  // Routes that DIDN'T opt in (cart, account, /api/*) keep their Set-Cookie
  // writes intact, so the storefront session is still established on the
  // first cart/account interaction.
  const oxygenCacheControl = responseHeaders.get("Oxygen-Cache-Control");
  if (
    oxygenCacheControl &&
    /\bpublic\b/.test(oxygenCacheControl) &&
    responseHeaders.has("Set-Cookie")
  ) {
    responseHeaders.delete("Set-Cookie");
  }

  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
```

The check is conditional: only strip when the route declared `Oxygen-Cache-Control: public, ...`. Cart, account, checkout, `/api/*` etc. don't set that header and keep their `Set-Cookie` semantics intact.

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
# 1. INTERMITTENT uncacheable: Hydrogen forwards Shopify tracking cookies
#    (_shopify_y / _shopify_essential / …) from Storefront API subrequests —
#    but only when the shop-analytics subrequest misses its own cache. So the
#    same URL alternates between `miss` and `uncacheable`. The uncacheable
#    responses are CORRECT (they carry Set-Cookie); don't chase them.
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
Before touching headers, audit the **root loader's deferred data**. Skeleton Hydrogen (and Pilot ≤2026.5) returns `cart: cart.get()` and `customerAccount.getAccessToken()` from the root loader — deferred values **stream into the HTML document**, so every page is personalized and caching it would serve one visitor's cart/token to another.
The fix is a client-side bootstrap (reference implementation: [Weaverse/pilot#401](https://github.com/Weaverse/pilot/pull/401)):
1. New `GET /api/cart` route returning `{ cart, customerAccessToken }` with `Cache-Control: no-store`.
2. A client store (zustand) hydrated from that endpoint after mount; header cart badge, account button, and `Analytics.Provider` read the store.
3. Root loader keeps only non-personalized data.
Same pattern as Shopify's "Render a cart from client side" recipe. Until this is done, FPC headers are actively dangerous — do not enable them.
Also note: **FPC cannot be purged without a redeploy.** Keep `max-age` short (60s) for CMS-driven pages; SWR does the heavy lifting.

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
- **CSRF tokens** — these MUST be per-request, can't be cached. If your forms use CSRF, that token comes via a separate non-cached endpoint or via cookies (which the strip would remove — incompatible with FPC).

CSP nonces are OK to cache — they're per-RESPONSE (not per-user), and the inline scripts referring to the nonce are part of the same response, so cached nonce + cached inline scripts stay consistent.

## When NOT to enable FPC

- The route renders any customer-specific data in HTML.
- The route writes a session cookie that's required for downstream functionality (and you can't easily move the write elsewhere).
- The route's data has tighter freshness requirements than your `max-age` (e.g. live inventory < 30s, real-time pricing for a stock chart).

For these cases, lean on Hydrogen's **sub-request caching** (`storefront.CacheLong()`, `CacheShort()`) instead. Sub-request cache reduces the worker's Storefront API roundtrips even when the rendered HTML itself can't be edge-cached. Read [`hydrogen-cookbooks/performance-best-practices`](../../hydrogen-cookbooks/references/performance-best-practices.md) for that pattern.

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
