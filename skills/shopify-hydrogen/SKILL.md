---
name: shopify-hydrogen
description: "Core Shopify Hydrogen 2026.10 APIs — the server.ts request lifecycle (handleShopifyRoutes, handleShopifyRedirects), request-scoped Storefront client with gql() + graphql(), explicit caching, the /api/cart handlers and cart store, and the classic helpers you now port locally."
---

# Shopify Hydrogen

Hydrogen 2026.10 is a **library of server handlers and client stores**, not a framework. Your app owns the request lifecycle in `server.ts` and calls into Hydrogen where it needs Shopify. React Router 7 renders the app.

Imports come from `@shopify/hydrogen` (server handlers, `gql`, `Cache`, types), `@shopify/hydrogen/react` (client stores and components such as `createCartComponents`, `ShopifyScripts`, `ShopPayButton`), `@shopify/hydrogen/customer-account` and `@shopify/hydrogen/vite`.

> This skill describes Hydrogen 2026.10 as [Pilot](https://github.com/Weaverse/pilot) `main` implements it. Classic Hydrogen (2026.4 and earlier: `createHydrogenContext`, `storefront.query()`, `CartForm`, `Analytics.Provider`) is covered by the `hydrogen-upgrades` skill, including the `2026.4.7 → 2026.10.2` migration guide.

`@shopify/hydrogen` 2026.10 also ships its own agent skills in `node_modules/@shopify/hydrogen/skills/` (for example `migrate-to-hydrogen-2026-10/`). Read them in the project when they exist.

## Live Documentation

Run these from this skill's own folder; the paths below are relative to the skill root.

For the most up-to-date Hydrogen API docs, use the search script:

```bash
node scripts/search_shopify_docs.mjs "<query>"
```

This queries Shopify's developer docs (`shopify.dev`) directly and returns the latest API references, code examples, and guides for Hydrogen.

**Examples:**
```bash
node scripts/search_shopify_docs.mjs "handleShopifyRoutes"
node scripts/search_shopify_docs.mjs "createCartServerHandlers"
node scripts/search_shopify_docs.mjs "createStorefrontClient graphql cache"
node scripts/search_shopify_docs.mjs "createCustomerAccountServerHandlers"
node scripts/search_shopify_docs.mjs "ShopifyScripts analytics"
```

For offline/cached reference, see the [references/](#references) folder below.

---

## Key Concepts (Quick Reference)

### Request lifecycle (`server.ts`)

`createHydrogenContext()` and Hydrogen's `createRequestHandler` are gone. A module-format fetch handler composes:

1. `createAppContext()` — your own function building the session, the request-scoped storefront client, the customer account wrapper and any CMS client (Weaverse).
2. `handleShopifyRoutes({ request, requestContext, sessionManager, storefrontClient, routeTemplates, handlers })` — answers the paths Hydrogen owns (`/api/cart`, `/api/predictive-search`, the Storefront API proxy, checkout and cart permalinks, `/account/login|authorize|refresh|logout`). Returns a `Promise<Response>` or `null`; check it without `await`.
3. React Router's `createRequestHandler(serverBuild, mode)` with the app context copied onto a `RouterContextProvider`.
4. Session commit, then `requestContext.applyResponseHeaders(response.headers)`.
5. On a 404, `handleShopifyRedirects({ request, storefrontClient, routeTemplates })` for Shopify URL redirects.

`routeTemplates` comes from `createShopifyRouteTemplates()`. Omitting it, or `applyResponseHeaders`, fails silently.

### Storefront client

`createStorefrontClient({ type: "private" | "public", requestContext: createShopifyRequestContext({ request, i18n, buyerIp }), config })`. Use the private token when Oxygen injects `PRIVATE_STOREFRONT_API_TOKEN` (with the buyer IP), the public one otherwise.

### Queries

```ts
import { gql, type StorefrontApi } from "@shopify/hydrogen";

export const PRODUCT_QUERY = gql(`query product(...) { ... }`, [MEDIA_FRAGMENT]);
export type ProductQuery = StorefrontApi.ResultOf<typeof PRODUCT_QUERY>;

const { product } = await storefront
  .graphql(PRODUCT_QUERY, { variables: { handle }, cache: CACHE_DEFAULT })
  .then(unwrapStorefront);
```

- `graphql()` returns `{ data, errors, headers }` and does **not** throw on GraphQL errors.
- Fragments compose through `gql()`'s second argument, never `${}` interpolation.
- `$country` / `$language` are filled from the request context; don't pass them.
- Types come from `@shopify/hydrogen/ts-plugin` (no codegen). `hydrogen gql check --fail-on-warn` validates every document, including deprecated fields.

### Caching

There is **no default cache**. Pass `cache` on every query: `Cache({...})`, `Cache.short()`, `Cache.long()`, `Cache.none()` from `@shopify/hydrogen`. `CacheShort`/`CacheLong`/`CacheNone`/`CacheCustom` and `generateCacheControlHeader` are gone.

### Cart

`createCartServerHandlers({ fragment })` serves `/api/cart`. `createCartComponents<typeof cartHandlers>()` from `@shopify/hydrogen/react` gives `CartProvider`, `useCart`, `useCartForm`, `useCartActions`. `CartForm`, `context.cart`, `useOptimisticCart` and the `/cart` action are gone.

### Customer accounts

`createCustomerSession()` + `createCustomerAccountServerHandlers()` from `@shopify/hydrogen/customer-account` own the fixed, unprefixed `/account/login`, `/account/authorize`, `/account/refresh` and `/account/logout`. Link to them with a plain `<a>`/`<form>`, not `<Link>`/`<Form>`. Local login needs HTTPS (`localHttps()` Vite plugin).

### Analytics

`ShopifyScripts` from `@shopify/hydrogen/react` (first in `<head>`) replaces `Analytics.Provider`. Publish route events to `window.Shopify.analytics`; `useCartAnalytics()` publishes cart events from the cart store.

### Removed helpers (port them locally)

| Removed from `@shopify/hydrogen` | Replacement |
|-----------------------------------|-------------|
| `Image`, `Money`, `ExternalVideo`, `ModelViewer` | Local components (Pilot: `app/components/`) |
| `Pagination`, `getPaginationVariables` | Local ports (Pilot: `app/components/pagination.tsx`, `app/utils/pagination.ts`) |
| `getSeoMeta`, `SeoConfig`, sitemap helpers | Local ports (Pilot: `app/utils/seo-meta.ts`, `app/.server/sitemap.ts`) |
| `createContentSecurityPolicy`, `NonceProvider`, `useNonce` | Local port (Pilot: `app/utils/csp.ts`) |
| `ShopPayButton` | `@shopify/hydrogen/react` |
| `getSelectedProductOptions` | `@weaverse/hydrogen/react-router` in Weaverse themes |

`flattenConnection` is still exported by `@shopify/hydrogen`.

### Tooling

`vite dev`, `react-router build`, `vite preview`; Vite plugins `localHttps()` (`@shopify/hydrogen/vite`) and `...oxygen()` (`@shopify/mini-oxygen/vite`), no `hydrogen()` plugin; no React Router preset; deploy with `shopify hydrogen deploy --assets-dir dist/client --worker-dir dist/server`.

---

## References

For offline/cached reference when the search script is unavailable:

| File | Contents |
|------|----------|
| [references/01-setup.md](references/01-setup.md) | `server.ts` lifecycle, `createAppContext`, storefront client, session, env vars, build config |
| [references/02-caching.md](references/02-caching.md) | `Cache` strategies, `CACHE_*` constants, `Cache-Control` headers, what to cache |
| [references/03-cart.md](references/03-cart.md) | `/api/cart` handlers, cart fragment, `createCartComponents`, cart forms, app-owned cart handlers |
| [references/04-ssr-performance.md](references/04-ssr-performance.md) | SSR bundle diet (worker inlines dynamic imports — `resolveId` stub pattern), bundle audit, TTFB measurement methodology |
