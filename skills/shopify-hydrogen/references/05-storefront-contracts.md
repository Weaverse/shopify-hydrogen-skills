# Storefront Contracts: Routes, Agents, Actions, Locale and CSP

What a Hydrogen 2026.10 storefront must expose to Shopify, apps and agents, as `@shopify/hydrogen` **2026.10.3** ships it and [Pilot](https://github.com/Weaverse/pilot) `main` implements it. For the Next.js version of the same contracts, see the `weaverse-nextjs` skill.

Shopify's guides: [Request handlers](https://shopify.dev/docs/storefronts/hydrogen/request-handlers), [Routing](https://shopify.dev/docs/storefronts/hydrogen/routing), [Cart drawer](https://shopify.dev/docs/storefronts/hydrogen/cart/cart-drawer), [Analytics and consent](https://shopify.dev/docs/storefronts/hydrogen/analytics), [Markets](https://shopify.dev/docs/storefronts/hydrogen/markets), [Oxygen runtime](https://shopify.dev/docs/storefronts/hydrogen/deploy/oxygen/runtime), [Production checklist](https://shopify.dev/docs/storefronts/hydrogen/production-checklist). shopify.dev does not cover the 2026.10.3 CSP and `defineShopifyI18n` APIs yet; for those, read the packaged skills (below) and the [2026.10.3 release notes](https://github.com/Shopify/hydrogen/releases/tag/%40shopify/hydrogen%402026.10.3).

## Hydrogen's Packaged Skills

`@shopify/hydrogen` ships version-matched agent skills in `node_modules/@shopify/hydrogen/skills/` (`hydrogen-request-handlers`, `hydrogen-routing`, `hydrogen-cart-drawer`, `hydrogen-markets`, `hydrogen-robots-txt`, `hydrogen-smoke-test`, `migrate-to-hydrogen-2026-10`, ...). Copy them into the project so every agent finds them:

```bash
npx @shopify/hydrogen skills sync   # writes .agents/skills/ and .claude/skills/
npx @shopify/hydrogen skills check  # exits non-zero when the copies are stale (use in CI)
```

- Re-run `skills sync` after every `@shopify/hydrogen` upgrade. Pilot's `dev` and `dev:https` scripts start with `hydrogen skills check --mode=warn`, which prints the resync command without blocking the dev server.
- Treat the synced folders as generated: don't edit them (Pilot's `AGENTS.md` says the same).
- Use them together with these Weaverse skills: Hydrogen's skills own the framework-neutral API contract; these skills own the Weaverse and Pilot specifics (`server.ts`, markets, Studio). When they disagree on a Hydrogen API, check the installed package (`node_modules/@shopify/hydrogen/dist/**/*.d.mts`).

## Routes Hydrogen Owns

`handleShopifyRoutes()` runs before React Router and answers these paths. They must not get route files (a route file for one of them is dead code or shadows nothing; a narrowed call misses the rest):

| Path | What answers it |
|------|-----------------|
| `/api/{version}/graphql.json`, `/__shopify/*` | Storefront API and Shopify API proxies for browser scripts |
| `/checkout` | Redirect to the current cart's checkout, or `/` without a cart |
| `/cart/{variantId}:{qty}` | Cart permalinks (default `payment=shop_pay`; an incoming `payment` overrides it) |
| `/buy/{itemId}:{qty}` | UCP buy permalinks for agentic commerce (`303` to the store's domain) |
| `/cart.js`, `/cart/add.js`, `/cart/update.js`, `/cart/change.js`, `/cart/clear.js` | AJAX cart proxy that theme apps call |
| `/api/mcp`, `/api/ucp/mcp` | The storefront's MCP endpoints for agents (`/api/ucp/mcp` is `POST` only) |
| `GET`/`HEAD /.well-known/ucp` | Shopify's UCP business profile (public cache, no shopper cookies) |
| `/.well-known/apple-developer-merchantid-domain-association`, `/.well-known/shopify/fec/produce` | Allowlisted Online Store resources |
| `/products/{handle}?variant={id}` | Liquid-style variant links → option params (needs `routeTemplates`) |
| `/graphiql` | GraphiQL, development only |
| Registered handler groups | `/api/cart`, `/api/predictive-search`, `/account/login\|authorize\|refresh\|logout`, plus app handlers |

`handleShopifyRedirects()` runs only after the app answers `404`: `/admin`, Shopify's standard paths mapped by `routeTemplates`, the merchant's URL redirects, and same-origin `return_to`/`redirect` params.

Rules:

- Call `handleShopifyRoutes()` for **every** request and let it return `null`. Never whitelist its paths: Hydrogen adds handlers between releases.
- Registered handlers match with the locale prefix stripped (`/fr-ca/api/cart` reaches `/api/cart`). The built-in paths above are matched unprefixed: `/fr-ca/buy/...` is a `404` in Pilot, so share `/buy/...` links without a market prefix.
- **On Oxygen**, Shopify answers `/.well-known/ucp`, `/api/mcp`, `/api/ucp/mcp` and the Apple Pay file before the request reaches the Worker. MiniOxygen does not, so locally `handleShopifyRoutes()` answers them. Any other host (Vercel, Node, Workers) depends on `handleShopifyRoutes()` alone.
- `robots.txt` disallows `/checkout`, `/buy/`, `/api/`, `/__shopify`, `/admin` and the cart paths, and keeps `/.well-known/` reachable (Pilot: `app/routes/seo/robots.ts`; Hydrogen's `hydrogen-robots-txt` skill has the reasons).
- Pilot intercepts one of them on purpose: a cart permalink **without** `payment` goes to its own `/cart/:lines` route (market-aware cart, `?discount=`, attribution); with `payment` (the Shop Pay button) it stays Hydrogen's. Copy that pattern only if you need the same behavior.

## Agent Commerce (UCP, MCP, WebMCP)

A storefront that runs `handleShopifyRoutes()` broadly and renders `ShopifyScripts` is agent-ready without app code:

- **Discovery:** agents read `/.well-known/ucp` on the storefront's own domain.
- **MCP:** `/api/ucp/mcp` (UCP catalog, cart and checkout tools such as `search_catalog`; the caller sends its own authorization and agent profile) and `/api/mcp` are proxied to the store's Shopify endpoints. Don't build these as app routes.
- **Buy links:** `/buy/{itemId}:{qty}` links open checkout for agent-built carts.
- **WebMCP:** `ShopifyScripts` registers Shopify's WebMCP tools in browsers that support WebMCP (`webMcp` defaults to `true`). The tools drive the cart through Standard Actions, so `openCart` and `updateCart` must reach your UI (next section).

Check them with `curl` against a dev server and a production build (on Oxygen, against the deployed URL):

```bash
curl -i http://localhost:3456/.well-known/ucp                    # 200 JSON profile
curl -i -X POST http://localhost:3456/api/ucp/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'           # 200 JSON-RPC
curl -i http://localhost:3456/buy/<variantId>:1                  # 303 to checkout
```

## `ShopifyScripts` and Route Templates

```ts
// app/utils/route-templates.ts
import { defineShopifyRouteTemplates } from "@shopify/hydrogen";

// How Shopify resources map to your routes. Used by handleShopifyRoutes
// (`?variant=` links), handleShopifyRedirects and ShopifyScripts. Never
// include a market prefix; Hydrogen adds `locale.pathPrefix` itself.
export const routeTemplates = defineShopifyRouteTemplates({
  productInCollection: "/products/:productHandle",
});
```

`createShopifyRouteTemplates` is the deprecated 2026.10.0-2 name of the same function. Pass the **same** object to `handleShopifyRoutes`, `handleShopifyRedirects` and `ShopifyScripts`.

```tsx
// app/root.tsx (Pilot, trimmed): first thing in <head>
import { ShopifyScripts } from "@shopify/hydrogen/react";

<ShopifyScripts
  shop={data.shopifyScripts.shop} // { shopId, storefrontId, myshopifyDomain }
  i18n={data.shopifyScripts.i18n} // { country, language, pathPrefix, currency } from storefront.locale
  analytics={{ channel: data.shopifyScripts.channel }}
  shopifyAnalytics={data.shopifyScripts.shopifyAnalytics}
  consent={{ mode: data.consent.mode }}
  routes={routeTemplates}
  navigate={navigate} // useNavigate(): client-side navigation for resolved URLs
/>
```

It loads Shopify's storefront runtime: `window.Shopify.analytics`, consent, Standard Actions and WebMCP. Build `shop` and `i18n` per market, never per shopper, so the document stays cacheable. Pass `nonce` only when the document uses a nonce CSP. `ShopifyScripts` does not publish `PAGE_VIEWED`; the app does, on the first load and every navigation (Pilot: `app/components/root/analytics-views.tsx`).

## Standard Actions (`openCart`, `updateCart`, `getCart`)

Standard storefront actions are the contract that Liquid themes, Hydrogen, theme apps and WebMCP agents share. After `ShopifyScripts` loads `standard-actions.js`, `window.Shopify.actions` exposes:

| Action | Signature | Default behavior |
|--------|-----------|------------------|
| `getCart(payload?, options?)` | `{ cartId? }` → `{ cart }` | Reads the cart from the cart cookie |
| `updateCart(payload, options?)` | `{ lines?, note?, discountCodes?, attributes? }` → `{ cart, userErrors?, warnings? }` | Mutates the cart; emits `shopify:cart:lines-update`, `shopify:cart:note-update`, `shopify:cart:attributes-update`, `shopify:cart:discount-update`, `shopify:cart:error` |
| `openCart()` | `() => Promise<void>` | Navigates to `/cart` until a handler is configured |

`updateCart` and `openCart` also have `configure({ handler })` (returns `false` when it couldn't be configured) and `isDefault()`. Hydrogen's cart store already configures `updateCart` and sends its own mutations through it, so app code keeps using the cart store; apps and agents that call `updateCart` update the same cart.

**The app must configure `openCart`**, or apps and agents that call it skip your cart drawer. Pilot (`app/components/cart/cart-drawer.tsx`):

```ts
function configureOpenCartAction() {
  const openCart = window.Shopify?.actions?.openCart;
  if (openCart) {
    openCart.configure({ handler: async () => openCartDrawer() });
  } else if (document.readyState === "loading") {
    // standard-actions.js is a module script and may run after this module
    document.addEventListener("DOMContentLoaded", configureOpenCartAction, { once: true });
  }
}

if (typeof document !== "undefined") configureOpenCartAction();

// Open the drawer for every add, including adds from apps and agents
document.addEventListener("shopify:cart:lines-update", (event) => {
  if ((event as Event & { action?: string }).action === "add") openCartDrawer();
});
```

Keep the header cart link a real `<a href="/cart">` (it works without JavaScript) and open the drawer from its click handler after hydration. Hydrogen's `hydrogen-cart-drawer` skill has the accessible `<dialog>` version.

## Locale: `defineShopifyI18n`

2026.10.3 replaces the fixed per-request `i18n` object with a module-scope definition. `createShopifyRequestContext({ request, i18n })` matches the locale from the URL; the resolved market is `requestContext.locale` / `storefront.locale` (`{ language, country, pathPrefix, ... }`). `storefront.i18n`, a fixed `{ language, country, pathPrefix }` as `i18n`, and the `I18nConfig` type are deprecated.

```ts
// app/utils/locale.ts (Pilot, trimmed)
import { defineShopifyI18n } from "@shopify/hydrogen";

export const i18n = defineShopifyI18n({
  defaultLocale: providerLocaleFor(DEFAULT_LOCALE), // served unprefixed
  routing: {
    type: "pathname",
    locales: SUPPORTED_LOCALES.filter((locale) => locale.pathPrefix).map((locale) => ({
      ...providerLocaleFor(locale), // Shopify's LanguageCode, e.g. ZH_TW, not ZH
      pathSegment: locale.pathPrefix.slice(1), // keep the existing prefix
    })),
  },
});
```

- Without `pathSegment`, Hydrogen derives the prefix as `/{language}-{country}` in lowercase. Pin it when your URLs differ, or when the provider language (`ZH_TW`) differs from the URL language (`zh`).
- Pass `locale` to `createShopifyRequestContext` only when the URL is not enough. Pilot passes it because Hydrogen-owned endpoints (`/api/cart`, `/account/login`) are unprefixed and their market comes from the `Referer` or `return_to` (`resolveRequestLocale` in `app/.server/storefront.ts`).
- Other helpers: `matchLocale`, `resolveSupportedLocale`, `getSupportedLocales(i18n)`, `getLocalizedHref`, `isSameLocale`, `UnsupportedLocaleError`.
- `routing.type: "domain"` maps one hostname per locale instead.

## Content Security Policy

2026.10.3 brings the CSP helpers back as framework-neutral functions in `@shopify/hydrogen`: `createContentSecurityPolicy`, `getShopifyCspDirectives` and `getShopifyScriptHashes`. They are not the classic API: no `NonceProvider`, `useNonce` or `Script`, and directives sit under `directives`.

```ts
const csp = createContentSecurityPolicy({
  shop: { storeDomain, checkoutDomain },
  nonce: false, // or omit for a per-response nonce
  directives: { connectSrc: ["https://analytics.example.com"] }, // arrays extend the defaults
});
csp.header; // the policy string
csp.nonce; // string in nonce mode, undefined with nonce: false
csp.applyResponseHeaders(headers); // sets Content-Security-Policy; in nonce mode also private, no-store
```

Defaults: `default-src 'self'`; scripts from `'self'` and `cdn.shopify.com`; inline styles allowed; images, fonts and media from `'self'` and `cdn.shopify.com` (images also `data:`); Shopify frame and connect origins plus the shop and checkout domains; `object-src 'none'`, `script-src-attr 'none'`, `frame-ancestors 'none'`. A `defaultSrc` customization no longer covers images, media, fonts or frames: extend each directive.

Choose one of three modes:

| Mode | Inline scripts | Cacheable HTML | Use when |
|------|----------------|----------------|----------|
| `nonce: false` + `scriptSrc: ["'unsafe-inline'"]` | Allowed | Yes | **Pilot's default.** Oxygen full-page cache, React Router streaming |
| Nonce (default) | Only nonced | No (`private, no-store`) | You give up full-page caching for a strict policy |
| `nonce: false` + `getShopifyScriptHashes()` | Only Hydrogen's bootstraps | Yes | Only if the framework authorizes **all** its own inline scripts; React Router's streamed hydration scripts can't be hashed, so not for Pilot |

Pilot (`app/entry.server.tsx`) uses the first mode, report-only:

```tsx
import { createContentSecurityPolicy } from "@shopify/hydrogen";
import { getCspDirectives } from "~/weaverse/csp";

const csp = createContentSecurityPolicy({
  nonce: false, // a nonce would make the document uncacheable
  shop: {
    checkoutDomain: context.env?.PUBLIC_CHECKOUT_DOMAIN || undefined,
    storeDomain: context.env?.PUBLIC_STORE_DOMAIN || undefined,
  },
  directives: getCspDirectives(request, context.env?.PUBLIC_CHECKOUT_DOMAIN || undefined),
});
// ... renderToReadableStream(<ServerRouter context={reactRouterContext} url={request.url} />)
// Switch to csp.applyResponseHeaders(responseHeaders) when the store is ready to enforce.
responseHeaders.set("Content-Security-Policy-Report-Only", csp.header);
```

`getCspDirectives` (`app/weaverse/csp.ts`) adds the theme's third-party sources to `defaultSrc`, `imgSrc`, `mediaSrc` and `frameSrc`, `'unsafe-inline'` and the script hosts to `scriptSrc`, the checkout domain to `mediaSrc`, and merges `getWeaverseStudioCspDirectives(request)` from `@weaverse/hydrogen/react-router` (6.3+). The SDK adds the Studio origin (and `'unsafe-eval'` in design mode) only for a trusted `weaverseHost`, so a crafted `?weaverseHost=` can't widen the policy, and live visitors get no Weaverse sources. The full file is in the `weaverse-hydrogen` skill, `09-deployment.md`.

In nonce mode, pass `csp.nonce` to `renderToReadableStream`, `ServerRouter`, `Scripts`, `ScrollRestoration` and `ShopifyScripts`, keep the React context for it in the app, and don't add `'unsafe-inline'` (browsers ignore it next to a nonce). Hydrogen's `hydrogen-request-handlers` skill, `references/content-security-policy.md`, covers nonce mode and Next.js.

## `server.ts` vs Shopify's Root-Middleware Template

Shopify's React Router template and Hydrogen's skills wire the request lifecycle in a `middleware` export on the root route (`future.v8_middleware: true`): the middleware creates the request context and client, calls `handleShopifyRoutes()`, stores the client with `context.set()`, calls `next()`, runs `handleShopifyRedirects()` on a `404`, then applies the response headers. A final splat route makes unknown paths reach it.

Pilot does the same work in the Oxygen Worker entry (`server.ts`) before React Router runs. The phases map one to one:

| Phase | Shopify template (root middleware) | Pilot (`server.ts`) |
|-------|------------------------------------|---------------------|
| Request context and clients | In the middleware | `createAppContext()` (`app/.server/context.ts`): session, storefront, customer account, Weaverse |
| Hydrogen routes | `handleShopifyRoutes()`, return the promise | Same, plus Pilot's cart handlers first and the cart permalink override |
| Hand the client to loaders | `context.set(storefrontContext, client)` + `context.get()` | `Object.assign(new RouterContextProvider(), appContext)`; loaders read `context.storefront` |
| Render | `next()` | `createRequestHandler(serverBuild)(request, routerContext)` |
| Redirects after 404 | `handleShopifyRedirects()` | Same, through `marketAwareRedirect()` (delocalized lookup, `.data` navigations) and skipped for unsupported markets |
| Response headers | `requestContext.applyResponseHeaders()` | Session commit, then `applyResponseHeaders()` |

Why Pilot keeps `server.ts`: it needs the session and market before any route runs (Hydrogen-owned endpoints are unprefixed), it intercepts cart permalinks, and its redirect lookup is market-aware. Pilot still enables `v8_middleware` and uses route middleware for the market guard on resource routes. When a Hydrogen skill or doc shows the root-middleware shape, apply its rules inside `server.ts` instead; don't add a second `handleShopifyRoutes()` call in root middleware.

## Production Checklist

Run Shopify's [production checklist](https://shopify.dev/docs/storefronts/hydrogen/production-checklist) (also Hydrogen's `hydrogen-smoke-test` skill) after wiring changes and before each production deploy, first against `npm run dev`, then against `npm run preview` (the built Worker in MiniOxygen):

- **Static:** format, lint, `npm run typecheck` (includes `hydrogen gql check`), build, tests.
- **Request handlers:** `POST /api/{version}/graphql.json` returns Storefront API JSON; `GET /api/cart` without a cookie returns `{"cart":null}`; `GET /admin` redirects to the store; an unknown path returns the app's 404; `?variant=<id>` returns `302`. Add the UCP, MCP and `/buy` checks above.
- **Navigation:** every header and footer link returns `200` (`/collections/all` only exists if the store has that collection).
- **Customer accounts:** `GET /account/login` redirects to Shopify's login; the sign-out control is a native `<form method="post" action="/account/logout">`.
- **Cart:** `/cart` works without JavaScript; `window.Shopify.actions.openCart()` opens the drawer; adding a product sets the cart cookie.
- **Analytics:** `PAGE_VIEWED` fires on the first load and every navigation; resource and cart events fire once per data change; destinations wait for consent.
- **Markets:** market-specific queries declare `$country`/`$language` with `@inContext`; prices come from Storefront API money fields.

Then follow [Take your storefront live](https://shopify.dev/docs/storefronts/hydrogen/deploy/go-live).
