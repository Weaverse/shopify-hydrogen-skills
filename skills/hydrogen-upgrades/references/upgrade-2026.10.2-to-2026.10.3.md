# Hydrogen upgrade guide: 2026.10.2 to 2026.10.3

A patch release with new APIs and deprecations, not a rewrite. It brings Hydrogen's CSP helpers back, replaces the fixed per-request locale with `defineShopifyI18n`, renames `createShopifyRouteTemplates`, and tightens several response-header defaults. Classic projects first follow [2026.4.7 → 2026.10.2](./upgrade-2026.4.7-to-2026.10.2.md).

Pilot made this move in [Weaverse/pilot#228](https://github.com/Weaverse/pilot/pull/228), released as [v2026.11.13](https://github.com/Weaverse/pilot/releases/tag/v2026.11.13), with the contract in [`.weaverse/specs/2026-11-12-hydrogen-locale-and-csp.md`](https://github.com/Weaverse/pilot/blob/main/.weaverse/specs/2026-11-12-hydrogen-locale-and-csp.md). Shopify's notes: [`@shopify/hydrogen@2026.10.3`](https://github.com/Shopify/hydrogen/releases/tag/%40shopify/hydrogen%402026.10.3). shopify.dev doesn't document the new CSP and locale APIs yet; read the packaged skills after step 1.

----

## Summary of changes

| Area | 2026.10.2 | 2026.10.3 |
|------|-----------|-----------|
| CSP | Not exported; Pilot ported the classic helper to `app/utils/csp.ts` (`generateNonce`, `NonceProvider`, `useNonce`) | `createContentSecurityPolicy({ shop, nonce, directives })`, `getShopifyCspDirectives()`, `getShopifyScriptHashes()` from `@shopify/hydrogen` |
| Locale | A fixed `{ language, country, pathPrefix }` passed as `i18n`; `storefront.i18n`; `I18nConfig` | A module-scope `defineShopifyI18n()` definition as `i18n` (`locale` optional); `storefront.locale`. The old forms still work but are deprecated |
| Route templates | `createShopifyRouteTemplates` | `defineShopifyRouteTemplates` (old name is a deprecated alias) |
| Registered handlers | Matched on the exact path | Matched with the locale prefix stripped (`/fr-ca/api/cart` → `/api/cart`) |
| Response headers | — | `requestContext.markResponseAsPersonalized()` is public; private responses drop vendor `*-Cache-Control` headers; the Storefront client doesn't cache `private`/`no-store` responses or follow redirects; proxies stop forwarding client-IP headers; bare `/__shopify` returns 404 |
| Packaged skills | 20 skills | Adds `hydrogen-robots-txt` |
| Weaverse | `@weaverse/hydrogen` 6.1+ | 6.3+ for `getWeaverseStudioCspDirectives` |

----

## Package version changes

| Package | Current | Target | Notes |
|---------|---------|--------|-------|
| `@shopify/hydrogen` | `^2026.10.2` | `^2026.10.3` | |
| `@weaverse/hydrogen` | `^6.1.0` | `^6.3.0` | Exports `getWeaverseStudioCspDirectives` from `@weaverse/hydrogen/react-router` |

----

## Step 1: Dependencies and Hydrogen's skills

```bash
npm install @shopify/hydrogen@^2026.10.3 @weaverse/hydrogen@^6.3.0
npx @shopify/hydrogen skills sync   # refresh .agents/skills/ and .claude/skills/
```

Keep `hydrogen skills check --mode=warn` in front of `dev` so the next bump prints the resync command.

----

## Step 2: Content Security Policy

### Files to modify
- `app/utils/csp.ts`: delete.
- `app/entry.server.tsx`: build the policy with Hydrogen's helper.
- `app/weaverse/csp.ts`: return directives only, with Studio's from the SDK.
- `app/root.tsx` and any component that called `useNonce()`: drop the nonce (nonce-free policy) or read it from an app-owned context (nonce policy).

```diff
// app/entry.server.tsx
- import { createContentSecurityPolicy, generateNonce, NonceProvider } from "~/utils/csp";
- import { getWeaverseCsp } from "~/weaverse/csp";
+ import { createContentSecurityPolicy } from "@shopify/hydrogen";
+ import { getCspDirectives } from "~/weaverse/csp";

- const nonce = generateNonce();
- const header = createContentSecurityPolicy(nonce, getWeaverseCsp(request, context.env), {
-   checkoutDomain: context.env?.PUBLIC_CHECKOUT_DOMAIN || context.env?.PUBLIC_STORE_DOMAIN,
-   storeDomain: context.env?.PUBLIC_STORE_DOMAIN,
- });
+ const csp = createContentSecurityPolicy({
+   nonce: false, // keeps the document cacheable by Oxygen's full-page cache
+   shop: {
+     checkoutDomain: context.env?.PUBLIC_CHECKOUT_DOMAIN || undefined,
+     storeDomain: context.env?.PUBLIC_STORE_DOMAIN || undefined,
+   },
+   directives: getCspDirectives(request, context.env?.PUBLIC_CHECKOUT_DOMAIN || undefined),
+ });

  const body = await renderToReadableStream(
-   <NonceProvider value={nonce}>
-     <ServerRouter context={reactRouterContext} url={request.url} nonce={nonce} />
-   </NonceProvider>,
-   { nonce, signal: request.signal, ... },
+   <ServerRouter context={reactRouterContext} url={request.url} />,
+   { signal: request.signal, ... },
  );

- responseHeaders.set("Content-Security-Policy-Report-Only", header);
+ responseHeaders.set("Content-Security-Policy-Report-Only", csp.header);
```

What changes in the policy itself:

- Directives move under `directives`; each array still extends the defaults. Source arrays and `null` only (booleans only for `upgradeInsecureRequests`).
- Hydrogen's defaults set images, media, fonts and frames apart from `default-src`. Sources you only listed in `defaultSrc` must be added to `imgSrc`, `mediaSrc` and `frameSrc` too.
- Inline scripts are not allowed by default. Pilot adds `'unsafe-inline'` to `scriptSrc`: the document has no nonce, and React Router's streamed hydration scripts can't be hashed. Don't add `getShopifyScriptHashes()` next to it; hashes make browsers ignore `'unsafe-inline'`.
- Replace hand-written Weaverse hosts (`*.weaverse.io`, `*.shopify.com`, `*.myshopify.com`, the `?weaverseHost=` value, `frameAncestors: ['*']`) with `getWeaverseStudioCspDirectives(request)`. It adds the Studio origin, and `'unsafe-eval'` in design mode, only for a trusted Studio host.
- Pilot also adds the checkout domain to `mediaSrc` (Shopify serves a custom domain's video uploads from it).

The full `getCspDirectives` is in the `weaverse-hydrogen` skill, `references/09-deployment.md`; the nonce and hash modes are in the `shopify-hydrogen` skill, `references/05-storefront-contracts.md`.

----

## Step 3: Locale definition

### Files to modify
- `app/utils/locale.ts`: export a `defineShopifyI18n` definition; drop the `I18nConfig` type.
- `app/.server/storefront.ts`: pass the definition as `i18n` and the resolved market as `locale`.
- Every `storefront.i18n` / `context.storefront.i18n` read: `storefront.locale`.

```ts
// app/utils/locale.ts
import { defineShopifyI18n } from "@shopify/hydrogen";

export const i18n = defineShopifyI18n({
  defaultLocale: providerLocaleFor(DEFAULT_LOCALE),
  routing: {
    type: "pathname",
    locales: SUPPORTED_LOCALES.filter((locale) => locale.pathPrefix).map((locale) => ({
      ...providerLocaleFor(locale), // Shopify's provider language (ZH_CN, ZH_TW)
      pathSegment: locale.pathPrefix.slice(1), // keep every existing URL
    })),
  },
});
```

```diff
// app/.server/storefront.ts
- const i18n = getRequestI18n(request);
- createShopifyRequestContext({ request, i18n, buyerIp })
+ const locale = providerLocaleFor(resolveRequestLocale(request));
+ createShopifyRequestContext({ request, i18n, locale, buyerIp })
```

- Without `pathSegment`, Hydrogen derives `/{language}-{country}`; pin it wherever your prefix differs, or URLs change.
- `locale` is only needed when the URL can't tell the market. Pilot passes it because Hydrogen-owned endpoints are unprefixed and their market comes from the `Referer` or `return_to`.
- `WeaverseClient` reads `storefront.locale` when no `locale` option is passed.

----

## Step 4: Route templates

```diff
- import { createShopifyRouteTemplates } from "@shopify/hydrogen";
- export const routeTemplates = createShopifyRouteTemplates({ ... });
+ import { defineShopifyRouteTemplates } from "@shopify/hydrogen";
+ export const routeTemplates = defineShopifyRouteTemplates({ ... });
```

----

## Step 5: Review app handlers and headers

- App handlers registered in `handleShopifyRoutes` now also answer prefixed paths. Remove any per-market duplicates you registered by hand.
- Code that relied on vendor `*-Cache-Control` headers surviving on private responses, or on the Storefront client caching a `no-store` response, now gets the stricter behavior.
- Use `requestContext.markResponseAsPersonalized(reason)` for app responses that carry customer data, before `applyResponseHeaders()`.

----

## Step 6: Related Pilot changes (optional)

Not required by Hydrogen, but shipped by Pilot around the same release:

- **Sign-out:** every sign-out lands on the fixed `/account/signed-out`, which redirects to the market remembered in the session. Register `<origin>/account/signed-out` as a logout URI in the Customer Account API settings ([#228](https://github.com/Weaverse/pilot/pull/228)).
- **Standard Actions:** `window.Shopify.actions.openCart` is configured to open the cart drawer ([#251](https://github.com/Weaverse/pilot/pull/251)). Shopify's production checklist expects it. See the `shopify-hydrogen` skill, `references/05-storefront-contracts.md`.

----

## Step 7: Verify

```bash
npm run typecheck
npm run build
```

- [ ] Every market still resolves to its existing prefix, and Storefront API queries get the provider language
- [ ] A normal visitor's CSP names no Weaverse origin; `?weaverseHost=<untrusted>` doesn't change it
- [ ] Inside Studio (design and preview) the page frames and the bridge loads; the console shows no CSP report-only violations
- [ ] Anonymous documents keep `Oxygen-Cache-Control` and no `Set-Cookie` or `no-store` from the CSP
- [ ] `/api/cart`, `/.well-known/ucp`, `/admin` and `?variant=` behave as in Shopify's [production checklist](https://shopify.dev/docs/storefronts/hydrogen/production-checklist)
