# Hydrogen upgrade guide: 2026.1.0 to 2026.4.7

This upgrade spans **12 releases**: 2026.1.1 → 2026.1.2 → 2026.1.3 → 2026.1.4 → 2026.4.0 → 2026.4.1 → 2026.4.2 → 2026.4.3 → 2026.4.4 → 2026.4.5 → 2026.4.6 → 2026.4.7.

`2026.4.7` (published 2026-10-02) is the current `latest` on npm. `2026.10.0-preview.4` is a preview tag and is **not** covered by this guide.

> Every change below is backed by the official
> [`@shopify/hydrogen` changelog](https://github.com/Shopify/hydrogen/blob/main/packages/hydrogen/CHANGELOG.md)
> and [skeleton changelog](https://github.com/Shopify/hydrogen/blob/main/templates/skeleton/CHANGELOG.md)
> plus the packages' published `package.json`/peer dependencies. Do not invent extra breaking changes.

----

## Summary of changes

| Version | Type | Key Changes |
|---------|------|-------------|
| **2026.1.1** | Patch | Dependency security updates only |
| **2026.1.2** | Patch | Skeleton: `handleAuthStatus()` is now async — `await` it in custom loaders |
| **2026.1.3** | Patch | `@xstate/react` dependency inlined (removed from your tree) |
| **2026.1.4** | Minor | `/api/mcp` Storefront MCP proxy (automatic with the default `proxyStandardRoutes`); `useCustomAuthDomain` option for custom HTTPS tunnels |
| **2026.4.0** | **Major** | Storefront API + Customer Account API **2026-01 → 2026-04**; JSON metafield writes capped at 128KB on 2026-04+; **Storefront API proxy mandatory** — `proxyStandardRoutes` removed from `createRequestHandler`; new cart error code `MERCHANDISE_LINE_TRANSFORMERS_RUN_ERROR`; React Router peer widened to `^7.12.0` |
| **2026.4.1** | Patch | Cart ops fixed on stores without `VisitorConsent` schema type |
| **2026.4.2** | Minor | Vite 7/8 support (Vite Environment API dev server); skeleton defaults to Vite 8 |
| **2026.4.3** | Patch | Cart/Image/redirect fixes; React Router peer `~7.16.0`, skeleton defaults to 7.16.0 |
| **2026.4.4** | Patch | PerfKit resource-timing sampling 100 → 10 |
| **2026.4.5** | Patch | Customer-account login/session resilience fixes |
| **2026.4.6** | Patch (behavioral) | **Consent/analytics move to the Customer Privacy API** — requires the same-origin Storefront API proxy; deprecated consent/cookie options become no-ops; `og:image:type` fallback fix for query-string URLs. See the [tracking-cookie deprecation notice](https://shopify.dev/changelog/posts/tracking-cookie-deprecation-hydrogen) |
| **2026.4.7** | Patch | Hydration fix for `Analytics.Provider` deferred state updates; `publish()` from `useAnalytics()` re-checks consent (revoked-consent events no longer reach subscribers) |

**Mandatory work concentrates in 2026.4.0 (proxy + API version) and 2026.4.6 (consent/analytics).** Everything else rides along as framework patches.

### Node.js floor

The skeleton's `engines` moved from `node >=18` to `node ^22 || ^24` at **2026.1.1**. Also note `@shopify/cli` 4.x requires Node `>=22.12.0` (the skeleton still pins CLI 3.93.2, which needs `>=20.10.0`). Check `node --version` before upgrading.

----

## Package version changes

Peer dependencies of `@shopify/hydrogen@2026.4.7` (from its published `package.json`):

| Package | 2026.1.0 requires | 2026.4.7 requires |
|---|---|---|
| `react-router` | `7.12.0` (exact) | `~7.16.0` |
| `@react-router/dev` | `7.12.0` (exact) | `~7.16.0` |
| `vite` | `^5.1.0 \|\| ^6.2.1` | `^5.1.0 \|\| ^6.2.1 \|\| ^7.0.0 \|\| ^8.0.0` |
| `react` | `^18.3.1 \|\| ~19.0.3 \|\| ~19.1.4 \|\| ^19.2.3` | unchanged |

- **React Router must move 7.12 → ~7.16.** Hydrogen widened its peers to caret ranges in 2026.4.0/2026.4.3 specifically so minor React Router updates stop breaking npm installs.
- `@shopify/mini-oxygen` 4.1+ peers `vite ^6.2.1 || ^7 || ^8` — if you use mini-oxygen (dev/preview), Vite 5 is effectively dropped even though `@shopify/hydrogen` itself still lists it. The skeleton defaults to Vite 8 since 2026.4.2.
- Skeleton (reference target `skeleton@2026.4.8`) runs: `react-router` 7.16.0, `vite` `^8.0.1`, `@shopify/cli` 3.93.2, `@shopify/mini-oxygen` 4.x (workspace-pinned upstream), TypeScript `^5.9.2`, Node `^22 || ^24`.

### Step 1: Update package.json

```diff
// dependencies
- "@shopify/hydrogen": "^2026.1.0",
+ "@shopify/hydrogen": "^2026.4.7",
- "react-router": "7.12.0",
+ "react-router": "7.16.0",
- "react-router-dom": "7.12.0",
+ "react-router-dom": "7.16.0",

// devDependencies
- "@react-router/dev": "7.12.0",
+ "@react-router/dev": "7.16.0",
- "@react-router/fs-routes": "7.12.0",
+ "@react-router/fs-routes": "7.16.0",
```

Then `npm install` (or your package manager's install). `@shopify/hydrogen-react` is a direct dependency of `@shopify/hydrogen` — it moves to 2026.4.4 automatically; don't pin it yourself unless you import it directly.

### Step 2: Make the Storefront API proxy unconditional (2026.4.0 — mandatory)

`proxyStandardRoutes` was **removed** from `createRequestHandler`. The proxy for `/api/:version/graphql.json` (and `/api/mcp`, 2026.1.4) is always on, and the handler now **throws** when the load context has no `storefront` instance instead of logging a warning.

Check your server entry (`server.ts` / `entry.server` wiring):

```ts
// Correct for 2026.4.x — import from '@shopify/hydrogen' (or '@shopify/hydrogen/oxygen')
import {createRequestHandler} from '@shopify/hydrogen';

const handleRequest = createRequestHandler({
  build: serverBuild,
  mode: process.env.NODE_ENV,
  getLoadContext: () => hydrogenContext, // must include `storefront`
});
```

- Delete any `proxyStandardRoutes: false` / `true` option — it no longer exists.
- If you still import `createRequestHandler` from the deprecated **`@shopify/remix-oxygen`**, or run a custom server without the proxy, switch to Hydrogen's handler. Without the same-origin proxy, consent cannot load (2026.4.6): analytics stay off and the privacy banner does not show.
- If you had a manual `app/routes/api.$version.[graphql.json].tsx` proxy route, the skeleton deleted it in 2026.1.4 — the server-level proxy replaces it (better cookie forwarding). Removing it is optional but recommended.

### Step 3: Storefront API 2026-04 changes (2026.4.0 — mandatory review)

Hydrogen's built-in queries now target Storefront API / Customer Account API **2026-04**.

- **JSON metafield writes ≤128KB** on API 2026-04+. Apps that used JSON metafields before April 1, 2026 are grandfathered at 2MB; large values remain readable by all versions. If your app or cart attributes write large JSON metafields, check sizes.
- **New cart error code** `MERCHANDISE_LINE_TRANSFORMERS_RUN_ERROR` (Cart Transform Function runtime failure) replaces the generic `INVALID` for that case. If you branch on cart error codes, add handling.
- Review the official changelogs for anything your custom queries touch:
  [Storefront API 2026-04](https://shopify.dev/changelog?filter=api&api_version=2026-04&api_type=storefront-graphql) ·
  [Customer Account API 2026-04](https://shopify.dev/changelog?filter=api&api_version=2026-04&api_type=customer-account-graphql)

### Step 4: Consent & analytics migration (2026.4.6 — mandatory if you track analytics)

Shopify's `_shopify_y`/`_shopify_s` (and `_tracking_consent`) cookies are deprecated in favour of server-set cookies through the Customer Privacy API; **the cutoff was April 30, 2026** — if you are only migrating now, visitor analytics and session attribution for your integration have been at risk since that date.

After upgrading to ≥2026.4.6:

- Consent initialization is asynchronous and handled by Hydrogen; Hydrogen no longer runs its own consent query/cache writes, and `Server-Timing` headers are no longer collected for tracking.
- The deprecated `_shopify_y`/`_shopify_s` cookies are no longer created; migration/expiry of legacy cookies is left to the Customer Privacy API.
- These become **deprecated no-ops** — remove them rather than relying on them:
  - `consent.sameDomainForStorefrontApi` (ignored, treated as `true`; `false` logs a warning)
  - `<AnalyticsProvider cookieDomain=…>`
  - `useShopifyCookies({hasUserConsent, domain, ignoreDeprecatedCookies})`
- `useCustomerPrivacy`'s `onReady` now also waits for consent; on consent-load failure analytics and PerfKit stay blocked until a successful consent update.
- Standalone `@shopify/hydrogen-react` integrations: cart keeps working cross-domain, but visitor analytics need the same-origin Storefront API proxy **and** the Customer Privacy API initialized on the page.
- Full migration guide: [Migrate Hydrogen analytics tracking](https://shopify.dev/docs/storefronts/headless/hydrogen/migrate/cookies).

### Step 5: Code-level fixes you may need

- **`await customerAccount.handleAuthStatus()`** (2026.1.2): it is now typed as async (`Promise<void>`) matching runtime behavior, and the skeleton updated its loaders to `await` it. Update any custom loader that calls it without `await`.
- **`@xstate/react` removed** (2026.1.3): the React binding is inlined into Hydrogen. If your own code imported `@xstate/react` transitively, add it as a direct dependency or refactor.
- Custom cart logic: `cart.get()` honors a provided `cartId` before falling back to `getCartId()` (2026.4.3 fix) — relevant only if you relied on the old fallback order.
- `createCartHandler` is now generic over your cart fragment types (2026.4.3) — custom fragments can use their generated types directly.

### Step 6: Optional template improvements (not required by the upgrade)

Separate from the mandatory changes above — adopt only when touching that area anyway:

- **Vite 8** (skeleton since 2026.4.2): `vite ^8.0.1`, drop `vite-tsconfig-paths` (Vite 8 resolves `tsconfig` paths natively; keep an explicit `~` alias for `jsconfig.json` projects — skeleton 2026.4.5).
- **`ssr.optimizeDeps.include`**: `'react-router > set-cookie-parser'`, `'react-router > cookie'`, `'react-router'` (skeleton 2026.4.1) — fixes pnpm/strict-package-manager resolution warnings in dev.
- Skeleton `robots.txt` defaults no longer carry Shopify-theme-specific disallow rules (2026.1.2).
- Skeleton accessibility fixes (2026.1.3): pagination arrows hidden from screen readers, territory-code `aria-label`, `ProductPrice` aria-label.
- Skeleton cart query includes line-item children recursively (2026.4.3).
- New skeletons recommend the Shopify AI Toolkit (2026.4.6).

### Weaverse projects

No additional Weaverse-specific migration was identified in the reviewed sources (the official Hydrogen and skeleton changelogs); that is not a compatibility guarantee. Weaverse storefronts still must do Steps 1–4 — the mandatory proxy especially, since the handler now throws without a `storefront` in the load context — and must verify their own Weaverse integration (SDK version's peer ranges, loaders, preview/editor) with the baseline and build sequence below before deploying.

### Step 7: Verify

Run the baseline **before** changing anything, then again after each mandatory step:

```bash
# Before (baseline) and after:
npm run typecheck        # react-router typegen + tsc --noEmit
npm run codegen          # regenerate Storefront API types (never edit .d.ts by hand)
npm run build

# Runtime smoke:
npm run dev              # add a product to cart, log in via customer account,
                         # check the privacy banner renders and analytics events fire
```

Also verify in the built app that `/api/2026-04/graphql.json` (same-origin Storefront API proxy) responds — consent and analytics depend on it (2026.4.6).

### Upgrade tool

Prefer the official CLI to hand-editing:

```bash
npx shopify hydrogen upgrade --version 2026.4.7
```

Pin `--version` so the run matches this guide — without it the command targets the latest release, which may be newer than what is documented here. It bumps and installs the required dependencies automatically, then generates a Markdown file listing the required source changes — it does **not** edit your source files. Apply Steps 2–5 yourself (the generated file is a good checklist and can be fed to your agent); without the Step 2 proxy migration, consent and analytics stay off after deploy.

### Rollback

If the upgrade fails verification, revert `package.json` + lockfile to the previous versions and redeploy; there are no irreversible data migrations in this jump. Do not partially keep 2026.4.x packages with a pre-2026.4.0 server setup — the proxy requirement and API version move together.
