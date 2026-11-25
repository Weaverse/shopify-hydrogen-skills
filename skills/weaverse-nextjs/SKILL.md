---
name: weaverse-nextjs
description: "Weaverse on Next.js App Router with Shopify Hydrogen 2026.10 — @weaverse/hydrogen/next and /next/server, Hydrogen's handleShopifyRoutes in proxy.ts, handleShopifyRedirects after a 404, defineShopifyI18n markets, private_no_buyer_context catalog clients, Next data-cache caching, ShopifyScripts with openCart, createContentSecurityPolicy without nonces, Studio revalidation. Use for Forward or any Next.js storefront built with Weaverse."
---

# Weaverse on Next.js (App Router)

Next.js is Shopify's second official Hydrogen stack: `@shopify/hydrogen` 2026.10 is framework-agnostic, and Weaverse ships its Next.js adapter as entry points of `@weaverse/hydrogen`. The reference implementation is [Forward](https://github.com/Weaverse/forward) `main` (Next.js 16, `@shopify/hydrogen` 2026.10.3, `@weaverse/hydrogen` 6.6). Every API below exists in those versions; check `node_modules` when a project pins others.

For React Router themes (Pilot), use `weaverse-hydrogen` and `shopify-hydrogen` instead. The Hydrogen contracts this skill relies on (the routes Hydrogen owns, Standard Actions, CSP modes, the production checklist) are explained in `shopify-hydrogen`'s `references/05-storefront-contracts.md`.

## First: Sync Hydrogen's Skills

```bash
npx @shopify/hydrogen skills sync   # writes .agents/skills/ and .claude/skills/
```

They carry Shopify's Next.js references for this exact version: `hydrogen-request-handlers/references/nextjs.md` (`proxy.ts`, `not-found.tsx`, CSP), `hydrogen-storefront-client/references/nextjs.md`, `hydrogen-markets/references/nextjs.md`, `hydrogen-cart-ui/references/nextjs.md`. Read the matching one before changing that layer, and re-run the sync after every `@shopify/hydrogen` bump. Don't edit the copies.

## Live Documentation

```bash
node ../shopify-hydrogen/scripts/search_shopify_docs.mjs "handleShopifyRoutes Next.js proxy"
node ../shopify-hydrogen/scripts/search_weaverse_docs.mjs "Next.js"
```

The helpers ship in the sibling `shopify-hydrogen` skill. If you installed this skill alone, add it: `npx skills add Weaverse/shopify-hydrogen-skills --skill shopify-hydrogen`. Shopify's guides: [Request handlers → Next.js](https://shopify.dev/docs/storefronts/hydrogen/request-handlers#framework-wiring), [Caching → Next.js](https://shopify.dev/docs/storefronts/hydrogen/data-fetching/caching#step-4-cache-in-nextjs), [Production checklist](https://shopify.dev/docs/storefronts/hydrogen/production-checklist).

## Packages and Imports

```bash
npm install @shopify/hydrogen @weaverse/hydrogen   # exact versions; never @weaverse/next
```

| Import | Where | What |
|--------|-------|------|
| `@weaverse/hydrogen/next` | Client Components | `createWeaverseNextClient`, `WeaverseNextProvider`, `WeaverseNextRenderer`, `WeaverseNextRootProvider`, `WeaverseNextStudioConnect`, `useThemeSettings`, `useTranslation`, `createTranslate`, types (`WeaverseNextComponent`, `WeaverseNextLoaderData`, `WeaverseNextRequestContext`, `PageType`) |
| `@weaverse/hydrogen/next/server` | Server only | `createWeaverseNextServerClient`, `createWeaverseNextRevalidateHandler`, `getWeaverseStudioCspDirectives`, `getWeaverseNextSeoMetadata`, `WeaverseLoadError` |
| `@shopify/hydrogen` | Server (and shared helpers) | `handleShopifyRoutes`, `handleShopifyRedirects`, `createShopifyRequestContext`, `createStorefrontClient`, `createCartServerHandlers`, `defineShopifyI18n`, `defineShopifyRouteTemplates`, `createContentSecurityPolicy`, `gql` |
| `@shopify/hydrogen/react` | Client Components | `ShopifyScripts`, cart and product components |
| `@shopify/hydrogen/customer-account` | Server | `createCustomerSession`, `createCustomerAccountServerHandlers` |

`@weaverse/next` is deprecated: it only re-exports these entries. `npx @weaverse/cli@latest migrate v6` rewrites its imports. Never import `@weaverse/hydrogen/react-router` in a Next.js app.

## Project Shape (Forward)

```
src/
├── proxy.ts                        # handleShopifyRoutes, markets, account boundary, CSP
├── app/
│   ├── [locale]/layout.tsx         # <html>, ShopifyScripts, WeaverseRoot, header/footer
│   ├── [locale]/**/page.tsx        # Server Components: storefront reads + loadWeaversePage()
│   ├── api/weaverse/revalidate/route.ts  # Studio per-item revalidation
│   ├── robots.ts, sitemap.ts
├── lib/
│   ├── i18n/shopify-i18n.ts        # defineShopifyI18n
│   ├── routes/shopify-routes.ts    # route templates, request context, findShopifyRedirect()
│   ├── routes/not-found.ts         # shopifyRedirectOrNotFound()
│   ├── security/content-security-policy.ts
│   ├── shopify-scripts.tsx         # "use client" ShopifyScripts + openCart
│   ├── storefront/shopify/client.ts  # private_no_buyer_context catalog client + cache
│   └── weaverse/
│       ├── components.ts           # "use client" registry (rendering)
│       ├── server-components.ts    # "server-only" registry (schemas + loaders)
│       ├── server.ts               # createWeaverseNextServerClient, loadWeaversePage, theme settings
│       ├── page.tsx                # "use client" WeaversePage boundary
│       └── root.tsx                # "use client" WeaverseNextRootProvider
└── sections/                       # Weaverse sections (default export + schema)
```

## Request Gate: `proxy.ts`

Next 16 runs `proxy.ts` (exported `proxy`; older Next: `middleware.ts`/`middleware`) before routing, so `handleShopifyRoutes()` goes there. It can short-circuit, but it can't see the routed response, so redirects after a 404 happen in the route.

```ts
// src/proxy.ts (Forward, trimmed)
import { handleShopifyRoutes } from "@shopify/hydrogen";
import { type NextRequest, NextResponse } from "next/server";
import { createShopifyRouteContext, ROUTE_TEMPLATES } from "@/lib/routes/shopify-routes";

export async function proxy(request: NextRequest): Promise<Response> {
  const context = createShopifyRouteContext(request); // null when Shopify isn't configured
  const shopify = context
    ? handleShopifyRoutes({
        request,
        requestContext: context.requestContext,
        storefrontClient: context.storefrontClient,
        routeTemplates: ROUTE_TEMPLATES,
      })
    : null;
  if (shopify !== null) return shopify;

  // ... market routing (rewrite unprefixed paths to /en-us/*), account
  // boundary, x-storefront-url header, CSP (below)
  return NextResponse.next();
}

// Every request but Next's build output. Hydrogen's routes include
// /api/{version}/graphql.json, /cart.js, /.well-known/ucp and /admin.
export const config = {
  matcher: ["/((?!_next/static|_next/image|_next/data).*)"],
};
```

Rules:

- **Keep the matcher broad and call `handleShopifyRoutes()` for every request.** Never exclude `/api/*` or paths with an extension, and never whitelist Hydrogen paths. On Vercel nothing answers `/.well-known/ucp`, `/api/mcp`, `/api/ucp/mcp`, `/buy/*`, `/checkout`, `/cart.js`, the Storefront API proxy or `/admin` unless `handleShopifyRoutes()` does (Oxygen answers some of them before the Worker; Vercel doesn't).
- Run it **before** market rewrites, so Hydrogen sees the shopper's URL. Forward skips it for requests the proxy already rewrote (`x-forward-locale-rewrite`) and for account paths, which its account boundary handles.
- Return the matched promise directly so Next owns rejections; inside a request-level `try/catch`, `return await` it.
- Register handler groups (`createCustomerAccountServerHandlers`, cart handlers created with `customerSession`) with a request-scoped `sessionManager`. The session manager in `proxy.ts` may only do local cookie work; token refresh belongs to the registered `/account/refresh` handler.
- For pages, forward the original URL so the route can look up redirects: Forward sets `x-storefront-url` (the header name Hydrogen's `getForwardedRequestHeaders()` uses). When you pass Hydrogen's `requestContext.getForwardedRequestHeaders()` to `NextResponse.next({ request: { headers } })`, the header is already there.
- If edge code calls the Storefront client, install an `AbortSignal.any` polyfill: the Next.js edge sandbox lacks it. Forward runs its routes on Node.

## Redirects After a 404

`handleShopifyRedirects()` (`/admin`, Shopify's standard paths mapped by route templates, the merchant's URL redirects) must run only when the app has no page. Forward calls it where a route would call `notFound()`, not in `not-found.tsx` (Next has already set the 404 status there, so a redirect only happens in the browser):

```ts
// src/lib/routes/not-found.ts
export async function shopifyRedirectOrNotFound(): Promise<never> {
  const url = (await headers()).get(STOREFRONT_URL_HEADER); // "x-storefront-url"
  const target = url === null ? null : await findShopifyRedirect(url);
  if (target === null) notFound();
  if (target.permanent) permanentRedirect(target.location); // keeps 301/308
  redirect(target.location);
}

// In a page: if (product === null || page === null) return shopifyRedirectOrNotFound();
```

`findShopifyRedirect(url)` builds a request context and client for `new Request(url)` and calls `handleShopifyRedirects({ request, storefrontClient, routeTemplates })`. Shopify's own `not-found.tsx` pattern (an async child under `<Suspense>`, `connection()` before `headers()`) also works; choose one. Next's `redirect()` doesn't keep a `301`, so map permanent statuses to `permanentRedirect()`.

## Markets: `defineShopifyI18n`

```ts
// src/lib/i18n/shopify-i18n.ts — server-only; client code imports the plain locale list
import { defineShopifyI18n } from "@shopify/hydrogen";
import { DEFAULT_LOCALE, LOCALE_IDS, localeI18n } from "./locales";

export const SHOPIFY_I18N = defineShopifyI18n({
  defaultLocale: localeI18n(DEFAULT_LOCALE), // { language: "EN", country: "US" }
  routing: {
    type: "pathname",
    // Hydrogen derives /{language}-{country}; pin pathSegment if your ids differ
    locales: LOCALE_IDS.filter((id) => id !== DEFAULT_LOCALE).map(localeI18n),
  },
});
```

- Rendered routes live under `app/[locale]/`. The default market is unprefixed: `proxy.ts` redirects `/en-us/*` to the bare path and rewrites bare paths to `/en-us/*`.
- `createShopifyRequestContext({ request, i18n: SHOPIFY_I18N })` matches the market from the URL (or from `x-storefront-url` for a headers-only request). Pass `locale` explicitly for contexts with no meaningful URL: module-scope catalog clients, and handlers that serve no page (Forward reads the last page's market from a cookie for `/api/cart` and account protocol paths).
- Read the resolved market as `requestContext.locale` / `storefront.locale`; `.i18n` is deprecated.
- A market has three identities: the URL id (`de-de`), BCP-47 (`de-DE`, for `<html lang>` and Weaverse's `i18n.locale`), and Shopify's enums (`{ language: "DE", country: "DE" }`). Never interchange them. The `hydrogen-markets-localization` skill covers the full market contract.

## Storefront Clients and Caching

Next.js storefronts cache with Next's data cache, not Hydrogen's `Cache.*` strategies (those need a cache store such as Oxygen's).

| Read | Client | Cache |
|------|--------|-------|
| Catalog, navigation, content (same for every visitor) | Module-scope `type: "private_no_buyer_context"` with a static request context and explicit `locale` | Next data cache, keyed by store and market |
| Cart, customer, anything personalized | Request-scoped `type: "private"` (with a trusted `buyerIp`) or `"public"` | Never cached |

```ts
// Catalog client (Forward: src/lib/storefront/shopify/client.ts)
const requestContext = createShopifyRequestContext({
  request: { headers: new Headers() }, // no request: nothing per-visitor leaks in
  i18n: SHOPIFY_I18N,
  locale, // the market this cached read is for
});
const client = createStorefrontClient({
  type: "private_no_buyer_context",
  requestContext,
  config: { storeDomain, privateStorefrontToken },
});
```

Two ways to cache the read:

- **`"use cache"` + `cacheLife()` + `cacheTag()`** (Shopify's guide; needs `cacheComponents: true` in `next.config.ts`). Pass serializable arguments: send a search string, not a `URLSearchParams`.
- **`unstable_cache(fn, [key, storeDomain, market], { revalidate })`** plus a route-level `export const revalidate = 3600` (Forward today). Throw on GraphQL errors **inside** the cached function: a returned `{ data, errors }` would be cached as a success and turn a transient error into an hour-long outage.

Never put the cart inside a cached function. With Cache Components, put request-time reads (`headers()`, cookies, the customer session) in an async child under `<Suspense>` after `connection()`, and don't add `dynamic`/`revalidate` route config. `@weaverse/hydrogen/next` hasn't been validated under `cacheComponents` yet; test Studio (design and preview mode) before turning it on.

The Weaverse server client caches its own API calls with `fetch`'s `next: { revalidate, tags }` from its `cache` option (`createWeaverseNextServerClient({ cache: { revalidate: 60, tags: ["weaverse"] } })`), and always uses `no-store` in design mode and revision previews.

## Weaverse Server Client and Pages

```ts
// src/lib/weaverse/server.ts (Forward, trimmed)
import "server-only";
import { createWeaverseNextServerClient } from "@weaverse/hydrogen/next/server";

function createClient(requestContext: WeaverseNextRequestContext) {
  const config = readWeaverseConfig(process.env); // null → Weaverse disabled
  if (config === null) return null;
  return createWeaverseNextServerClient({
    components: WEAVERSE_SERVER_COMPONENTS, // schemas + loaders, no rendering
    env: config.sdkEnv, // an explicit object; missing keys fall back to process.env
    projectId: config.projectId,
    themeSchema,
    requestContext, // { headers, pathname, searchParams, pageType, handle, i18n }
    throwPageLoadFailures: true, // outages reject with WeaverseLoadError instead of 404
  });
}

// Per request, memoized with React cache(): page + generateMetadata share one call
const page = await client.loadPage({ type: "PRODUCT", handle });
const theme = await client.loadThemeSettings(); // { theme, merchantOverrides, ... }
```

- Pass the route's own `pathname` in the request context. `CUSTOM` pages resolve by pathname, and the SDK falls back to `/` without one.
- `loadPage()` returns a fallback page (`isFallback: true`) when a route has no composition. Render it only in design mode (`page.configs?.isDesignMode`), so the merchant can compose it; otherwise answer `shopifyRedirectOrNotFound()`.
- Two registries, because a Client Component can't import a Server Component: `components.ts` (`"use client"`, rendering) and `server-components.ts` (`"server-only"`, schemas and loaders). Keep their schemas from one shared list.
- Hand the payload to one client boundary:

```tsx
// src/lib/weaverse/page.tsx
"use client";
export function WeaversePage({ data, dataContext, projectId }: WeaversePageProps) {
  const client = createWeaverseNextClient({
    components: WEAVERSE_COMPONENTS,
    projectId: (data.configs?.projectId as string | undefined) ?? projectId,
    requestContext: clientRequestContext(data), // rebuilt from data.configs.requestInfo
  });
  return (
    <WeaverseNextProvider client={client}>
      <WeaverseNextRenderer data={data} dataContext={{ current: dataContext ?? {} }} />
    </WeaverseNextProvider>
  );
}
```

- The layout mounts `WeaverseNextRootProvider` once (theme settings, `staticContent`, Translation Manager overrides) and `WeaverseNextStudioConnect` when Weaverse is configured.
- Studio re-runs one section's loader with draft settings through a revalidation route:

```ts
// src/app/api/weaverse/revalidate/route.ts
export const dynamic = "force-dynamic";
export const { POST } = createWeaverseNextRevalidateHandler({
  getClient: async (_request, requestContext) => {
    if (!requestContext) throw new Error("Studio sent no valid route context.");
    const client = await revalidateServerClient(requestContext);
    if (!client) throw new Error("Weaverse is not configured.");
    return client;
  },
});
```

## `ShopifyScripts` and `openCart`

`ShopifyScripts` loads Shopify's analytics, consent, Standard Actions and WebMCP. In Next it's a Client Component, so wrap it to pass the App Router's navigation and configure `openCart`:

```tsx
// src/lib/shopify-scripts.tsx
"use client";
import { ShopifyScripts as HydrogenShopifyScripts } from "@shopify/hydrogen/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

function configureOpenCart(openCart: () => void): () => void {
  function configure(): boolean {
    const action = window.Shopify?.actions?.openCart;
    action?.configure({ handler: async () => openCart() });
    return action !== undefined;
  }
  // standard-actions.js is a module script: it can run after hydration
  if (configure() || document.readyState === "complete") return () => {};
  window.addEventListener("load", configure, { once: true });
  return () => window.removeEventListener("load", configure);
}

export function ShopifyScripts({ shop, i18n, analytics, routes, cartPath }: Props) {
  const router = useRouter();
  useEffect(() => configureOpenCart(() => router.push(cartPath)), [router, cartPath]);
  return (
    <HydrogenShopifyScripts
      shop={shop} // { shopId, storefrontId ("0" for Headless), myshopifyDomain }
      i18n={i18n} // { country, language, currency, pathPrefix }
      analytics={analytics} // { channel: "hydrogen" | "headless" }
      routes={routes}
      navigate={(url) => router.push(url)}
    />
  );
}
```

Render it in `<head>` of `app/[locale]/layout.tsx` with the market's values. Point `openCart` at the cart drawer if the theme has one (Forward has only the cart page). `ShopifyScripts` doesn't publish `PAGE_VIEWED`: publish it on the first load and every client-side navigation.

## Route Templates

```ts
import { defineShopifyRouteTemplates } from "@shopify/hydrogen";

// Only where your paths differ from Shopify's; never a market prefix
export const ROUTE_TEMPLATES = defineShopifyRouteTemplates({
  collection: "/shop/:collectionHandle",
  collectionList: "/categories",
  blog: "/archive/:blogHandle",
});
```

Pass the same object to `handleShopifyRoutes`, `handleShopifyRedirects` and `ShopifyScripts`. Forward still calls the deprecated alias `createShopifyRouteTemplates`; use `defineShopifyRouteTemplates` in new code.

## Content Security Policy

Prerendered or cached pages can't carry a per-response nonce, so Forward follows Hydrogen's nonce-free guidance and builds the policy in `proxy.ts` for every page response:

```ts
// src/lib/security/content-security-policy.ts (Forward, trimmed)
import { createContentSecurityPolicy } from "@shopify/hydrogen";
import { getWeaverseStudioCspDirectives } from "@weaverse/hydrogen/next/server";

const THEME_DIRECTIVES = {
  imgSrc: ["https://cdn.jsdelivr.net"],
  scriptSrc: [
    "'unsafe-inline'",
    ...(process.env.NODE_ENV === "development" ? ["'unsafe-eval'"] : []), // Next dev runtime
  ],
};

export function applyContentSecurityPolicy(request: Request, headers: Headers) {
  const csp = createContentSecurityPolicy({
    shop: { storeDomain: process.env.PUBLIC_STORE_DOMAIN, checkoutDomain },
    nonce: false,
    directives: mergeCspDirectives(THEME_DIRECTIVES, getWeaverseStudioCspDirectives(request)),
  });
  if (mode === "enforce") csp.applyResponseHeaders(headers);
  else headers.set("Content-Security-Policy-Report-Only", csp.header); // default
}
```

- Delete incoming `content-security-policy` and `content-security-policy-report-only` request headers before forwarding the request, so a client can't hand Next a nonce.
- Merge Studio's directives last; skip `upgradeInsecureRequests` when merging (it's a boolean).
- For a nonce CSP the documents must render dynamically: create the policy in `proxy.ts`, set `Content-Security-Policy` on the forwarded request headers, forward `csp.nonce` in an app-owned header (`x-nonce`), and pass it to `ShopifyScripts`. Hydrogen's `hydrogen-request-handlers/references/content-security-policy.md` has the details.

## Cart and Customer Accounts

- Hydrogen's cart handlers serve `/api/cart`. Register them in `handleShopifyRoutes` (Shopify's template), or call them from a Route Handler (Forward: `app/api/cart/route.ts` → `handleShopifyCartRequest`, which syncs the cart's country to the market, then calls `shopifyCartHandlers.get/post` from `createCartServerHandlers()`; `dynamic = "force-dynamic"`, `runtime = "nodejs"`).
- `createCustomerAccountServerHandlers()` owns `/account/login|authorize|refresh|logout`; don't write Route Handlers for them. Link with plain `<a>`/`<form>`, never `next/link`. Server Components only read the session (`isLoggedIn()`, `getAccessToken()`); when the token is stale, redirect once to `/account/refresh?return_to=...`.
- Sign-out lands on one registered logout URI (Forward: `/account/signed-out`), which redirects to the market's home.

## Verify

Run Shopify's [production checklist](https://shopify.dev/docs/storefronts/hydrogen/production-checklist) against `next dev`, then against `next build && next start`. Replace `3333` (Forward's dev port) with your app's port:

```bash
curl -i http://localhost:3333/.well-known/ucp                 # 200, Shopify's UCP profile
curl -i -X POST http://localhost:3333/api/ucp/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'        # 200
curl -i http://localhost:3333/api/cart                        # {"cart":null}
curl -i http://localhost:3333/cart.js                         # 200
curl -i http://localhost:3333/admin                           # redirect to the store admin
curl -i "http://localhost:3333/products/<handle>?variant=<id>" # 302 to option params
curl -i http://localhost:3333/this-does-not-exist             # 404, or the store's URL redirect
```

Then check `window.Shopify.actions.openCart()` in the browser, every header and footer link, prefixed markets, and Weaverse Studio (design mode, a section edit that revalidates, theme settings, translations).
