---
name: shopify-hydrogen
description: "Core Shopify Hydrogen 2026.10 APIs — the server.ts request lifecycle (handleShopifyRoutes, handleShopifyRedirects), the routes Hydrogen owns (UCP, MCP, /buy, AJAX cart), defineShopifyI18n, request-scoped Storefront client with gql() + graphql(), explicit caching, the /api/cart handlers and cart store, ShopifyScripts and Standard Actions (openCart), createContentSecurityPolicy, the production checklist, and the classic helpers you now port locally."
---

# Shopify Hydrogen

Hydrogen 2026.10 is a **library of server handlers and client stores**, not a framework. Your app owns the request lifecycle in `server.ts` and calls into Hydrogen where it needs Shopify. React Router 7 renders the app.

Imports come from `@shopify/hydrogen` (server handlers, `gql`, `Cache`, types), `@shopify/hydrogen/react` (client stores and components such as `createCartComponents`, `ShopifyScripts`, `ShopPayButton`), `@shopify/hydrogen/customer-account` and `@shopify/hydrogen/vite`.

> This skill describes Hydrogen 2026.10 as [Pilot](https://github.com/Weaverse/pilot) `main` implements it. Classic Hydrogen (2026.4 and earlier: `createHydrogenContext`, `storefront.query()`, `CartForm`, `Analytics.Provider`) is covered by the `hydrogen-upgrades` skill, including the `2026.4.7 → 2026.10.2` migration guide.

`@shopify/hydrogen` 2026.10 also ships its own version-matched agent skills (`hydrogen-request-handlers`, `hydrogen-cart-drawer`, `hydrogen-markets`, `migrate-to-hydrogen-2026-10`, ...). Sync them into the project and use them alongside this skill:

```bash
npx @shopify/hydrogen skills sync   # copies them to .agents/skills/ and .claude/skills/
```

Re-run the sync after every `@shopify/hydrogen` upgrade, and don't edit the copies. Prefix `dev` with `hydrogen skills check --mode=warn` so a stale copy prints the resync command. Every API in this skill is checked against **2026.10.3**; if the installed version differs, trust `node_modules/@shopify/hydrogen` and its synced skills.

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
2. `handleShopifyRoutes({ request, requestContext, sessionManager, storefrontClient, routeTemplates, handlers })` — answers the paths Hydrogen owns (`/api/cart`, `/api/predictive-search`, the Storefront API proxy, `/checkout`, cart and `/buy` permalinks, the AJAX cart, `/.well-known/ucp`, `/api/mcp`, `/api/ucp/mcp`, `?variant=` links, `/account/login|authorize|refresh|logout`). Returns a `Promise<Response>` or `null`; check it without `await`. Call it for every request; never whitelist its paths.
3. React Router's `createRequestHandler(serverBuild, mode)` with the app context copied onto a `RouterContextProvider`.
4. Session commit, then `requestContext.applyResponseHeaders(response.headers)`.
5. On a 404, `handleShopifyRedirects({ request, storefrontClient, routeTemplates })` for Shopify URL redirects.

`routeTemplates` comes from `defineShopifyRouteTemplates()` (`createShopifyRouteTemplates` is its deprecated alias). Omitting it, or `applyResponseHeaders`, fails silently.

Shopify's React Router template runs the same phases in a root-route `middleware` export instead of `server.ts`. Pilot keeps `server.ts`; see [05-storefront-contracts.md](references/05-storefront-contracts.md#serverts-vs-shopifys-root-middleware-template) for the mapping before you follow a Hydrogen doc or skill that shows the middleware shape.

### Storefront client

`createStorefrontClient({ type: "private" | "public", requestContext: createShopifyRequestContext({ request, i18n, buyerIp }), config })`. Use the private token when Oxygen injects `PRIVATE_STOREFRONT_API_TOKEN` (with the buyer IP), the public one otherwise.

### Locale

`i18n` is a module-scope `defineShopifyI18n({ defaultLocale, routing: { type: "pathname", locales } })` definition. The request's market is `storefront.locale` (`{ language, country, pathPrefix, ... }`). `storefront.i18n`, a fixed `{ language, country, pathPrefix }` passed as `i18n`, and `I18nConfig` are deprecated in 2026.10.3. Pass `locale` to `createShopifyRequestContext` only when the URL can't tell the market (Pilot does, for unprefixed Hydrogen endpoints).

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

`ShopifyScripts` from `@shopify/hydrogen/react` (first in `<head>`, with `shop`, `i18n`, `analytics`, `consent`, `routes={routeTemplates}` and `navigate`) replaces `Analytics.Provider`. It also loads Standard Actions and WebMCP. Publish `PAGE_VIEWED` and route events to `window.Shopify.analytics` yourself; `useCartAnalytics()` publishes cart events from the cart store.

### Standard Actions and agents

`window.Shopify.actions` exposes `getCart`, `updateCart` and `openCart`, the contract shared with theme apps and WebMCP agents. Hydrogen's cart store configures `updateCart`; the app must configure `openCart` to open its drawer (`openCart.configure({ handler })`). UCP discovery (`/.well-known/ucp`), MCP (`/api/mcp`, `/api/ucp/mcp`) and `/buy` links come from `handleShopifyRoutes()`. Details: [05-storefront-contracts.md](references/05-storefront-contracts.md).

### Content Security Policy

`createContentSecurityPolicy({ shop, nonce, directives })`, `getShopifyCspDirectives()` and `getShopifyScriptHashes()` are back in 2026.10.3 as framework-neutral functions (no `NonceProvider`/`useNonce`). Pilot calls `createContentSecurityPolicy({ nonce: false, ... })` with `'unsafe-inline'` scripts in `entry.server.tsx`, so the document stays full-page cacheable, and sends the header report-only.

### Removed helpers (port them locally)

| Removed from `@shopify/hydrogen` | Replacement |
|-----------------------------------|-------------|
| `Image`, `Money`, `ExternalVideo`, `ModelViewer` | Local components (Pilot: `app/components/`) |
| `Pagination`, `getPaginationVariables` | Local ports (Pilot: `app/components/pagination.tsx`, `app/utils/pagination.ts`) |
| `getSeoMeta`, `SeoConfig`, sitemap helpers | Local ports (Pilot: `app/utils/seo-meta.ts`, `app/.server/sitemap.ts`) |
| `NonceProvider`, `useNonce`, `Script` | None needed with `nonce: false`; in nonce mode, an app-owned React context for `csp.nonce` |
| `ShopPayButton` | `@shopify/hydrogen/react` |
| `getSelectedProductOptions` | `@weaverse/hydrogen/react-router` in Weaverse themes |

`flattenConnection` is still exported by `@shopify/hydrogen`. `createContentSecurityPolicy` was missing in 2026.10.0-2 and is back in 2026.10.3, with a new signature; delete any local `app/utils/csp.ts` port when you upgrade.

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
| [references/05-storefront-contracts.md](references/05-storefront-contracts.md) | Syncing Hydrogen's packaged skills, the routes Hydrogen owns (UCP, MCP, `/buy`, AJAX cart), `ShopifyScripts` and Standard Actions (`openCart`), `defineShopifyI18n`, `createContentSecurityPolicy` modes, `server.ts` vs root middleware, production checklist |
