# Caching

Reference implementation: Pilot's `app/utils/cache.ts`, on `@shopify/hydrogen` 2026.10.

## No Default Cache

In Hydrogen 2026.10, `storefront.graphql()` has **no implicit cache**. A query without a `cache` option hits the Storefront API on every request. Pass a strategy on every call.

`CacheShort`, `CacheLong`, `CacheNone`, `CacheCustom` and `generateCacheControlHeader` are gone. Strategies come from the `Cache` export:

```ts
import { Cache, type CachingStrategy } from "@shopify/hydrogen";

Cache({ mode: "public", maxAge: 60, staleWhileRevalidate: 3600 }) // custom
Cache.short()
Cache.long()
Cache.none()
```

> Classic Hydrogen (2026.4 and earlier) strategies are covered in the `hydrogen-upgrades` skill.

## Shared Constants

Define the strategies once and import them everywhere. Pilot maps the classic behavior:

```ts
// app/utils/cache.ts
import { Cache, type CachingStrategy } from "@shopify/hydrogen";

// Classic Hydrogen's implicit default: fresh for a second, stale for a day
export const CACHE_DEFAULT = Cache({
  mode: "public",
  maxAge: 1,
  staleWhileRevalidate: 86_399,
});
export const CACHE_SHORT = Cache.short();
export const CACHE_LONG = Cache.long();
export const CACHE_NONE = Cache.none();
```

```ts
const { shop } = await storefront
  .graphql(SHOP_QUERY, { cache: CACHE_LONG })
  .then(unwrapStorefront);
```

Section loaders in a Weaverse theme do the same through `weaverse.storefront.graphql(doc, { variables, cache })`.

## CachingStrategy Fields

| Field | Meaning |
|-------|---------|
| `mode` | `"public"`, `"private"` or `"no-store"` |
| `maxAge` | `max-age` in seconds |
| `staleWhileRevalidate` | `stale-while-revalidate` in seconds |
| `sMaxAge` | `s-maxage` in seconds (shared caches only) |
| `staleIfError` | `stale-if-error` in seconds |

## `Cache-Control` Headers

`generateCacheControlHeader` no longer exists. Pilot builds header values from a strategy with a local helper:

```ts
const CACHE_CONTROL_DIRECTIVES = {
  maxAge: "max-age",
  staleWhileRevalidate: "stale-while-revalidate",
  sMaxAge: "s-maxage",
  staleIfError: "stale-if-error",
} as const;

export function cacheControlHeader(strategy: CachingStrategy): string {
  const directives: string[] = [];
  for (const [key, value] of Object.entries(strategy)) {
    if (key === "mode") {
      directives.push(String(value));
    } else if (key in CACHE_CONTROL_DIRECTIVES && value !== undefined) {
      directives.push(
        `${CACHE_CONTROL_DIRECTIVES[key as keyof typeof CACHE_CONTROL_DIRECTIVES]}=${value}`,
      );
    }
  }
  return directives.join(", ");
}

// cacheControlHeader(CACHE_SHORT) → "public, max-age=1, stale-while-revalidate=9"
```

Route `headers` exports then forward the loader's `Cache-Control` (Pilot's `routeHeaders` in `app/utils/cache.ts`, falling back to `CACHE_SHORT`).

## What to Cache

| Data | Strategy | Reasoning |
|------|----------|-----------|
| Shop info, menus, policies | `CACHE_LONG` | Rarely changes |
| Collections, blogs | `CACHE_LONG` or `CACHE_DEFAULT` | Rarely changes |
| Product pages | `CACHE_DEFAULT` / `CACHE_SHORT` | Price/availability can change |
| Search results | `CACHE_SHORT` | Dynamic but acceptable lag |
| Cart | Hydrogen's `/api/cart` handlers | Never in a route loader |
| Account / orders | `context.customerAccount.graphql()` | Always user-specific |

## Keep Documents Anonymous

Oxygen's full-page cache only stores responses without personalization. In Hydrogen 2026.10 that means:

- Don't load the cart in the root loader: render `CartProvider` without `initialData` and let it fetch `/api/cart` after hydration.
- Commit the session only when it changed (no `Set-Cookie` on anonymous pages).
- Keep the `ShopifyScripts` props per market, never per shopper.
- Fetch customer tokens from a private, `no-store` endpoint after hydration (Pilot: `GET /api/account/token`).
