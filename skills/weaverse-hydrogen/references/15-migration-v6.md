# Migration Guide: `@weaverse/hydrogen` 5 → 6 (Hydrogen 2026.10)

> Move a Weaverse theme from classic Hydrogen (2026.4 and earlier) with `@weaverse/hydrogen` 5.x to Hydrogen 2026.10 with `@weaverse/hydrogen` 6.

`@weaverse/hydrogen` 6 requires `@shopify/hydrogen` 2026.10 or later, the release where Hydrogen became a library of server handlers and client stores. The Weaverse part of the upgrade is small; the Hydrogen part rewrites the request wiring, data layer, cart, product form, customer account and analytics.

Full walkthroughs (read them, don't guess):

- [Weaverse v6 & Hydrogen 2026.10 migration guide](https://docs.weaverse.io/migration-advanced/v6-migration) (`node ../../shopify-hydrogen/scripts/get_weaverse_page.mjs "migration-advanced/v6-migration"`)
- [Hydrogen 2026.4.7 → 2026.10.2 upgrade guide](../../hydrogen-upgrades/references/upgrade-2026.4.7-to-2026.10.2.md) (Pilot's steps)
- Shopify's packaged skill: `node_modules/@shopify/hydrogen/skills/migrate-to-hydrogen-2026-10/SKILL.md`
- Reference implementation: [Pilot](https://github.com/Weaverse/pilot) `main` ([Weaverse/pilot#209](https://github.com/Weaverse/pilot/pull/209), released as v2026.11.7)

Themes close to Pilot usually migrate fastest by creating a new project from the current Pilot (`npx @weaverse/cli@latest create --template=pilot`) and moving their sections over. Weaverse projects, pages and theme settings are not affected.

## Versions

| Package | Version |
|---|---|
| `@shopify/hydrogen` | `^2026.10.2` |
| `@weaverse/hydrogen` | `^6.1.0` (6.0.0 pins `@weaverse/react` 6.0.0 and `@weaverse/next` 1.1.0; align them if your `package.json` lists them) |
| `react-router`, `@react-router/dev` | Same 7.x version (Pilot: `7.18.5`); React Router 8 is not supported yet |

Classic projects that are not migrating yet should pin `@shopify/hydrogen` to `~2026.4.x` and stay on `@weaverse/hydrogen` 5.x.

## 1. Run the codemod

```bash
npx @weaverse/cli@latest migrate v6 --dry-run   # list files it would change
npx @weaverse/cli@latest migrate v6
git diff
```

It only touches files that import `@weaverse/hydrogen` or `@weaverse/next`:

- Imports move to the new entry points: `@weaverse/hydrogen` → `@weaverse/hydrogen/react-router` (Hydrogen/React Router themes import everything from there).
- Types are renamed as whole words in each file that imports Weaverse, so a local type with the same name is renamed too. Review the diff.

| v5 | v6 |
|---|---|
| `HydrogenComponent` | `WeaverseComponent` |
| `HydrogenComponentProps` | `WeaverseComponentProps` |
| `HydrogenComponentSchema` | `WeaverseComponentSchema` |
| `HydrogenComponentData` | `WeaverseComponentData` |
| `HydrogenChildComponentReference` | `WeaverseChildComponentReference` |
| `HydrogenThemeSchema` | `WeaverseThemeSchema` |
| `HydrogenThemeSettings` | `WeaverseThemeSettings` |
| `HydrogenPageData` | `WeaversePageData` |
| `HydrogenPageAssignment` | `WeaversePageAssignment` |
| `HydrogenProjectType` | `WeaverseProjectType` |
| `ThemeSettingsResponse` | `WeaverseThemeSettingsResponse` |
| `ComponentLoaderArgs` | `WeaverseComponentLoaderArgs` |

## 2. Fix what the codemod doesn't

- **Removed exports:** `useThemeText`, `ThemeTextProvider`, `ThemeTextStore` → `useTranslation`, `TranslationProvider`, `TranslationStore`. `interpolate`, `createWeaverseDataContext`, `useWeaverseDataContext` and `WeaverseArticle` are gone (`WeaverseBlog` has the same shape as `WeaverseArticle`). Import `CachingStrategy` from `@shopify/hydrogen`.
- **`Env`** extends `WeaverseEnv` (from `@weaverse/hydrogen/react-router`) instead of Hydrogen's removed `HydrogenEnv`.
- **`WeaverseClient`** takes the request's Storefront client instead of a spread classic Hydrogen context:

```ts
// Before (v5)
import { WeaverseClient } from '@weaverse/hydrogen';

const weaverse = new WeaverseClient({ ...hydrogenContext, request, cache, themeSchema, components });

// After (v6), in app/.server/context.ts
import { WeaverseClient } from '@weaverse/hydrogen/react-router';

const weaverse = new WeaverseClient({
  storefront, // request-scoped Hydrogen 2026.10 Storefront client
  env,
  cache,
  waitUntil,
  request,
  customerAccount, // optional
  themeSchema,
  components,
  locale, // optional (6.1+): the market's { language, country, pathPrefix }
});
```

  `projectId`, `fetchTimeoutMs` and `throwPageLoadFailures` work as before.

- **Section loaders** query with `weaverse.storefront.graphql()`; there is no `query()` shim:

```ts
// Before (v5)
export const loader = async ({ data, weaverse }: ComponentLoaderArgs<Data>) => {
  return await weaverse.storefront.query<CollectionQuery>(COLLECTION_QUERY, { variables: { handle: data.handle } });
};

// After (v6)
export const loader = async ({ data, weaverse }: WeaverseComponentLoaderArgs<Data>) => {
  return unwrapStorefront(
    await weaverse.storefront.graphql(COLLECTION_QUERY, { // a gql() document
      variables: { handle: data.handle },
      cache: CACHE_DEFAULT,
    }),
  );
};
```

- Unchanged apart from the import path: `withWeaverse`, `WeaverseHydrogenRoot`, `useThemeSettings`, `loadPage()`, `loadThemeSettings()`, `createSchema`. `getSelectedProductOptions(request)` keeps its signature and still drops Studio's query params.
- Weaverse content caching: 60 seconds fresh, then up to a day stale while it revalidates or when the API fails.

## 3. Migrate the Hydrogen side

Follow the upgrade guide for the rest; in short:

- `server.ts` composes the lifecycle: `createAppContext()` → `handleShopifyRoutes()` → React Router → session commit + `applyResponseHeaders()` → `handleShopifyRedirects()` on 404. `createHydrogenContext()` is gone.
- Tooling: `vite dev` / `react-router build`, `oxygen()` + `localHttps()` Vite plugins, no `hydrogen()` plugin, no React Router preset, no codegen (`gql()` + `@shopify/hydrogen/ts-plugin`).
- Queries: `storefront.graphql(gql(...), { variables, cache })` with an explicit cache everywhere.
- Cart: `createCartServerHandlers()` at `/api/cart` + `createCartComponents()` store (no `CartForm`, no `context.cart`).
- Product: `createProductComponents()` (`ProductProvider`, `useProduct`, `useProductForm`).
- Customer Account: `createCustomerAccountServerHandlers()` at `/account/login|authorize|refresh|logout`.
- Analytics: `ShopifyScripts` + `useCartAnalytics` (no `Analytics.Provider`).
- Removed helpers (`Image`, `Money`, `Pagination`, `getPaginationVariables`, `getSeoMeta`, CSP helpers, ...) become local ports.

## 4. Verify

```bash
npm run typecheck   # react-router typegen && tsc && hydrogen gql check --fail-on-warn
npm run build
npm run preview
```

Then open the storefront in Weaverse Studio and check design mode, section loaders, theme settings and translations.
