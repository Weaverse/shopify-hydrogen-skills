---
name: weaverse-hydrogen
description: "Build Shopify Hydrogen 2026.10 storefronts with Weaverse (@weaverse/hydrogen 6) — components, schemas, loaders, theming, data fetching, React Router v7, deployment, and advanced features."
---

# Weaverse Hydrogen — Agent Skill

> Build Shopify Hydrogen storefronts with Weaverse visual page builder.
> Docs: https://docs.weaverse.io | GitHub: https://github.com/Weaverse

## Live Documentation

Run these from this skill's own folder. The helpers ship inside the sibling
`shopify-hydrogen` skill, so `../shopify-hydrogen/scripts/` exists whenever the
whole pack is installed.

If you installed this skill on its own, that folder is absent and the commands
below fail with `MODULE_NOT_FOUND`. Add the helpers once:

```bash
npx skills add Weaverse/shopify-hydrogen-skills --skill shopify-hydrogen
```

The `references/` files in this skill remain a usable offline fallback if you
would rather not install it.

For the most up-to-date Weaverse documentation, use these scripts:

- `node ../shopify-hydrogen/scripts/search_weaverse_docs.mjs "<query>"` — search Weaverse docs
- `node ../shopify-hydrogen/scripts/get_weaverse_page.mjs "<page-path>"` — fetch a specific page (use paths from search results)
- Weaverse docs: https://docs.weaverse.io

**Examples:**
```bash
node ../shopify-hydrogen/scripts/search_weaverse_docs.mjs "component schema"
node ../shopify-hydrogen/scripts/search_weaverse_docs.mjs "data fetching"
node ../shopify-hydrogen/scripts/get_weaverse_page.mjs "development-guide/component-schema"
node ../shopify-hydrogen/scripts/get_weaverse_page.mjs "api-reference/weaverse-client"
```

The reference files below provide offline context but may not reflect the latest changes.

---

## What is Weaverse?

Weaverse is a visual page builder for Shopify Hydrogen. It lets merchants customize storefronts via a drag-and-drop Studio while developers build type-safe React components with schemas that define the editor UI.

**Stack:** React 19 · React Router 7 · Shopify Hydrogen 2026.10 · `@weaverse/hydrogen` 6 · TypeScript · Tailwind CSS · Vite

> **Check the version first.** Before writing any Weaverse code, read `@weaverse/hydrogen` in the project's `package.json`. The two majors import from different entries and use different type names, so code for one does not build on the other.
>
> | | `@weaverse/hydrogen` 6.x (Hydrogen 2026.10+) | `@weaverse/hydrogen` 5.x (Hydrogen 2026.4 and earlier) |
> | --- | --- | --- |
> | Imports | `@weaverse/hydrogen/react-router` | `@weaverse/hydrogen` |
> | Component props | `WeaverseComponentProps` | `HydrogenComponentProps` |
> | Loader args | `WeaverseComponentLoaderArgs` | `ComponentLoaderArgs` |
> | Schema / theme types | `WeaverseComponentSchema`, `WeaverseThemeSchema`, `WeaverseThemeSettings` | `HydrogenComponentSchema`, `HydrogenThemeSchema`, `HydrogenThemeSettings` |
>
> This skill, its references and [Pilot](https://github.com/Weaverse/pilot) `main` use 6.x. On a 5.x project, write the 5.x names from the table (the full map is in [references/15-migration-v6.md](references/15-migration-v6.md)) and never mix majors in one project. Upgrade a 5.x theme to 6.x only when asked: it also needs the Hydrogen 2026.10 upgrade. Never import from `@weaverse/hydrogen/internal`, which is reserved for Weaverse's own tooling.

---

## 1. Project Structure

```
app/
├── .server/
│   └── context.ts     # createAppContext(): storefront, session, customerAccount, WeaverseClient
├── components/        # Reusable UI components
├── graphql/           # gql() queries & fragments
├── hooks/             # Custom React hooks
├── routes/            # React Router v7 route files
├── sections/          # Weaverse section components ← YOUR WORK GOES HERE
├── styles/            # Global styles + Tailwind
├── weaverse/
│   ├── components.ts  # Component registry
│   ├── schema.server.ts  # Theme schema (global settings)
│   └── csp.ts         # Content Security Policy for Weaverse
├── entry.client.tsx
├── entry.server.tsx
├── routes.ts          # Route config (`@react-router/dev/routes`)
└── root.tsx           # Layout wrapped with withWeaverse(...)
server.ts              # Fetch handler: createAppContext → handleShopifyRoutes → React Router
env.d.ts               # `Env extends WeaverseEnv`, React Router context typing
vite.config.ts
react-router.config.ts
.env
```

---

## 2. Component Anatomy

Every Weaverse component has up to 3 exports from a single file (or directory):

```tsx
// app/sections/my-section/index.tsx

// 1. Default export — React component
function MySection(props: MySectionProps) { ... }
export default MySection;

// 2. Schema export — editor configuration
export let schema = createSchema({ ... });

// 3. Loader export (optional) — server-side data fetching
export let loader = async (args: WeaverseComponentLoaderArgs<DataType>) => { ... };
```

### Minimal Example

```tsx
import { createSchema } from '@weaverse/hydrogen/react-router';
import type { WeaverseComponentProps } from '@weaverse/hydrogen/react-router';

interface BannerProps extends WeaverseComponentProps {
  heading: string;
  description: string;
}

function Banner({ heading, description, children, ...rest }: BannerProps) {
  return (
    <section {...rest} className="py-16 px-4 text-center">
      <h2 className="text-3xl font-bold">{heading}</h2>
      <p className="mt-4 text-lg text-gray-600">{description}</p>
      {children}
    </section>
  );
}

export default Banner;

export let schema = createSchema({
  type: 'banner',
  title: 'Banner',
  settings: [
    {
      group: 'Content',
      inputs: [
        { type: 'text', name: 'heading', label: 'Heading', defaultValue: 'Hello World' },
        { type: 'textarea', name: 'description', label: 'Description', defaultValue: 'Welcome to our store.' },
      ],
    },
  ],
  presets: {
    heading: 'Hello World',
    description: 'Welcome to our store.',
  },
});
```

### Key Rules

- **Spread `{...rest}`** on the root element — required for Weaverse Studio interaction.
- **Render `{children}`** if the component accepts child components (`childTypes`).
- **React 19: take `ref` as a regular prop** and attach it to the root element. `forwardRef` is deprecated.
- **`type` must be unique** across all components, use kebab-case (e.g., `hero-banner`).

---

## 3. Component Registration

Components must be registered in `app/weaverse/components.ts`:

```tsx
import type { WeaverseComponent } from '@weaverse/hydrogen/react-router';

// MUST use namespace imports (import * as X), NOT default imports
import * as HeroBanner from '~/sections/hero-banner';
import * as FeaturedCollection from '~/sections/featured-collection';
import * as ProductCard from '~/sections/product-card';

export let components: WeaverseComponent[] = [
  HeroBanner,
  FeaturedCollection,
  ProductCard,
];
```

**Common mistake:** Using `import HeroBanner from ...` — this won't work. Always `import * as HeroBanner from ...`.

---

## 4. Schema with `createSchema()`

```tsx
import { createSchema } from '@weaverse/hydrogen/react-router';

export let schema = createSchema({
  type: 'my-component',          // Unique kebab-case identifier
  title: 'My Component',         // Display name in Studio
  limit: 1,                      // Max instances per page (optional)
  enabled: ({ page, group }) =>  // Dynamic insertion availability (optional)
    ['PRODUCT', 'COLLECTION'].includes(page.type) && group === 'body',
  settings: [                    // Editor UI groups
    {
      group: 'Content',
      inputs: [
        { type: 'text', name: 'heading', label: 'Heading', defaultValue: 'Title' },
        { type: 'richtext', name: 'body', label: 'Body' },
        { type: 'image', name: 'image', label: 'Image' },
        {
          type: 'select', name: 'layout', label: 'Layout',
          configs: {
            options: [
              { value: 'grid', label: 'Grid' },
              { value: 'list', label: 'List' },
            ],
          },
          defaultValue: 'grid',
        },
      ],
    },
  ],
  childTypes: ['product-card', 'button'],  // Allowed child component types
  presets: {                     // Defaults when component is added to page
    heading: 'Title',
    layout: 'grid',
    children: [
      { type: 'product-card' },
      { type: 'product-card' },
    ],
  },
});
```

**`inspector` is deprecated** — always use `settings`.

**`enabledOn` is deprecated** — move page/group checks into `enabled`. The callback is synchronous, runs in the storefront preview, and receives `{ page: { id, type, handle, locale }, group }`. Errors, Promises, and non-boolean results hide the component from new insertion without affecting existing instances. Studio currently evaluates the `body` group.

**Page types for `enabled`:** `INDEX`, `PRODUCT`, `ALL_PRODUCTS`, `COLLECTION`, `COLLECTION_LIST`, `PAGE`, `BLOG`, `ARTICLE`, `CUSTOM`

---

## 5. Input Types (Quick Reference)

| Type | Returns | Use For |
|------|---------|---------|
| `text` | `string` | Single-line text |
| `textarea` | `string` | Multi-line text |
| `richtext` | `string` (HTML) | Rich text with formatting |
| `url` | `string` | URLs/links |
| `image` | `WeaverseImage` object | Image picker from Shopify Files |
| `video` | `WeaverseVideo` object | Video picker from Shopify Files |
| `color` | `string` (#hex) | Color picker |
| `range` | `number` | Slider (requires `configs: { min, max, step }`) |
| `switch` | `boolean` | Toggle on/off |
| `select` | `string` | Dropdown (requires `configs: { options }`) |
| `toggle-group` | `string` | Button group (requires `configs: { options }`) |
| `heading` | — | Section header in settings panel (no data) |
| `datepicker` | `number` (timestamp) | Date/time picker |
| `product` | Shopify product | Product picker |
| `collection` | Shopify collection | Collection picker |
| `blog` | Shopify blog | Blog picker |
| `article` | Shopify article | Article picker |
| `metaobject` | Shopify metaobject | Metaobject picker |
| `product-list` | Shopify products[] | Multi-product picker |
| `collection-list` | Shopify collections[] | Multi-collection picker |

→ Full details: [references/04-input-settings.md](references/04-input-settings.md)

---

## 6. Data Fetching

```tsx
import { gql } from '@shopify/hydrogen';
import type { WeaverseComponentLoaderArgs, WeaverseComponentProps } from '@weaverse/hydrogen/react-router';
import { CACHE_DEFAULT } from '~/utils/cache';
import { unwrapStorefront } from '~/utils/storefront';

const COLLECTION_QUERY = gql(`
  query collection($country: CountryCode, $language: LanguageCode, $handle: String!)
  @inContext(country: $country, language: $language) {
    collection(handle: $handle) { id title }
  }
`);

type MyData = { collectionHandle: string };

export let loader = async ({ weaverse, data }: WeaverseComponentLoaderArgs<MyData>) => {
  let { storefront } = weaverse;
  return unwrapStorefront(
    await storefront.graphql(COLLECTION_QUERY, {
      variables: { handle: data.collectionHandle },
      cache: CACHE_DEFAULT,
    }),
  );
};

// Derive props type from loader return
type Props = WeaverseComponentProps<Awaited<ReturnType<typeof loader>>> & MyData;

function MyComponent({ loaderData, ...rest }: Props) {
  let collection = loaderData?.collection;
  return <section {...rest}>{collection?.title}</section>;
}
export default MyComponent;
```

**Key patterns:**
- `weaverse.storefront.graphql(doc, { variables, cache })` — Shopify Storefront API. Returns `{ data, errors }` and never throws on GraphQL errors; Pilot unwraps with `unwrapStorefront` (`~/utils/storefront`)
- Always pass `cache` (`CACHE_DEFAULT`, `CACHE_SHORT`, `CACHE_LONG`, `CACHE_NONE` from `~/utils/cache`): Hydrogen 2026.10 has no default cache
- Never pass `country`/`language` in `variables`: the client fills `$country`/`$language` from the request
- Documents are `gql()` from `@shopify/hydrogen`; fragments go in its second argument, never `${}` interpolation. Result types come from `StorefrontApi.ResultOf<typeof QUERY>` (no codegen)
- `weaverse.fetchWithCache(url, options)` — External APIs with caching
- `Promise.all([...])` — Parallel fetching
- `shouldRevalidate: true` on schema inputs that affect the loader

→ Full details: [references/05-data-fetching.md](references/05-data-fetching.md)

---

## 7. Styling & Theming

**Tailwind CSS** is the primary styling approach.

**Global theme settings** are defined in `app/weaverse/schema.server.ts` and applied via CSS variables:

```tsx
// app/components/GlobalStyle.tsx
import { useThemeSettings } from '@weaverse/hydrogen/react-router';

export function GlobalStyle() {
  let settings = useThemeSettings();
  if (!settings) return null;
  return (
    <style dangerouslySetInnerHTML={{ __html: `
      :root {
        --color-primary: ${settings.colorPrimary};
        --body-base-size: ${settings.bodyBaseSize}px;
        --heading-base-size: ${settings.headingBaseSize}px;
      }
    `}} />
  );
}
```

**CVA (Class Variance Authority)** for component variants:

```tsx
import { cva } from 'class-variance-authority';
let buttonVariants = cva('inline-flex items-center rounded font-medium', {
  variants: {
    variant: { primary: 'bg-blue-600 text-white', secondary: 'bg-gray-200' },
    size: { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4', lg: 'h-12 px-6' },
  },
  defaultVariants: { variant: 'primary', size: 'md' },
});
```

→ Full details: [references/06-styling-theming.md](references/06-styling-theming.md)

---

## 8. Weaverse API (Key Hooks & Utilities)

| API | Purpose |
|-----|---------|
| `createSchema()` | Define component schema with Zod validation |
| `WeaverseClient` | Server-side client (created in `app/.server/context.ts`) |
| `weaverse.loadPage({ type, handle })` | Load page data in route loaders |
| `weaverse.loadThemeSettings()` | Load global theme settings |
| `weaverse.fetchWithCache(url)` | Cached external API fetching |
| `withWeaverse(App)` | HOC wrapping root `App` in `root.tsx` |
| `useWeaverse()` | Access global Weaverse instance |
| `useThemeSettings()` | Access global theme settings |
| `useItemInstance()` | Access a specific component instance |
| `useParentInstance()` | Access parent component instance |
| `useChildInstances()` | Access child component instances |
| `useTranslation()` | Theme text from the Translation Manager (replaces the removed `useThemeText`) |
| `getSelectedProductOptions(request)` | Selected options from the URL, without Studio query params |

→ Full details: [references/10-weaverse-api.md](references/10-weaverse-api.md)

---

## 9. Server Setup

Hydrogen 2026.10 has no `createHydrogenContext()`. The app builds its own request context in `app/.server/context.ts`, and `server.ts` copies it onto React Router's context, so loaders read `context.storefront`, `context.weaverse` and friends. Trimmed from Pilot:

```ts
// app/.server/context.ts
import { WeaverseClient } from '@weaverse/hydrogen/react-router';
import { createCustomerAccount } from '~/.server/customer-account';
import { AppSession } from '~/.server/session';
import { createRequestStorefront, resolveRequestLocale } from '~/.server/storefront';
import { components } from '~/weaverse/components';
import { themeSchema } from '~/weaverse/schema.server';

export async function createAppContext(request: Request, env: Env, executionContext: ExecutionContext) {
  const waitUntil = executionContext.waitUntil.bind(executionContext);
  const [cache, session] = await Promise.all([
    caches.open('hydrogen'),
    AppSession.init(request, [env.SESSION_SECRET]),
  ]);
  const storefront = createRequestStorefront({ request, env, cache, waitUntil });
  const customerAccount = createCustomerAccount({ env, request, session, storefront });

  const weaverse = new WeaverseClient({
    storefront, // the request-scoped Hydrogen 2026.10 Storefront client
    locale: resolveRequestLocale(request), // optional (6.1): the market's { language, country, pathPrefix }
    env,
    cache,
    waitUntil,
    request,
    customerAccount, // optional; passed through to section loaders
    themeSchema,
    components,
    throwPageLoadFailures: true, // optional: loadPage() rejects with WeaverseLoadError on outages
  });

  return { env, cache, waitUntil, session, storefront, customerAccount, weaverse };
}

export type AppContext = Awaited<ReturnType<typeof createAppContext>>;
```

`locale` is only needed when the market's Shopify `LanguageCode` differs from the locale Weaverse keys translations by (e.g. `ZH_TW` for a Hong Kong market); without it Weaverse reads `storefront.i18n`. `Env` extends `WeaverseEnv` from `@weaverse/hydrogen/react-router` in `env.d.ts`.

`server.ts` is a module-format fetch handler: `createAppContext()` → `handleShopifyRoutes()` (cart, predictive search, Customer Account OAuth, Storefront API proxy) → React Router's `createRequestHandler(serverBuild)` with the context copied onto a `RouterContextProvider` → session commit and `requestContext.applyResponseHeaders()` → `handleShopifyRedirects()` on a 404. See [references/01-project-structure.md](references/01-project-structure.md).

---

## 10. Route Integration

```tsx
// app/weaverse/index.tsx
import { WeaverseHydrogenRoot } from '@weaverse/hydrogen/react-router';
import { GenericError } from '~/components/root/generic-error';
import { components } from './components';

export function WeaverseContent() {
  return <WeaverseHydrogenRoot components={components} errorComponent={GenericError} />;
}

// app/routes/home.tsx
import type { LoaderFunctionArgs } from 'react-router';
import { WeaverseContent } from '~/weaverse';

export async function loader({ context }: LoaderFunctionArgs) {
  // The key must be `weaverseData`
  let weaverseData = await context.weaverse.loadPage({ type: 'INDEX' });
  return { weaverseData };
}

export default function Homepage() {
  return <WeaverseContent />;
}
```

For product pages:

```tsx
export async function loader({ context, params }: LoaderFunctionArgs) {
  const { storefront, weaverse } = context;
  const [{ product }, weaverseData] = await Promise.all([
    storefront
      .graphql(PRODUCT_QUERY, {
        variables: { handle: params.productHandle },
        cache: CACHE_DEFAULT,
      })
      .then(unwrapStorefront),
    weaverse.loadPage({ type: 'PRODUCT', handle: params.productHandle }),
  ]);
  if (!product) throw new Response('Not found', { status: 404 });
  return { product, weaverseData };
}
```

---

## Reference Index

For detailed information on specific topics, read these reference files:

| # | File | Topic |
|---|------|-------|
| 01 | [references/01-project-structure.md](references/01-project-structure.md) | Project structure & file anatomy |
| 02 | [references/02-creating-components.md](references/02-creating-components.md) | Component creation & registration |
| 03 | [references/03-component-schema.md](references/03-component-schema.md) | createSchema(), settings, childTypes, presets, enabled |
| 04 | [references/04-input-settings.md](references/04-input-settings.md) | All input types & configurations |
| 05 | [references/05-data-fetching.md](references/05-data-fetching.md) | Loaders, Storefront API, caching |
| 06 | [references/06-styling-theming.md](references/06-styling-theming.md) | Tailwind, theme settings, CVA, CSS variables |
| 07 | [references/07-react-router-7.md](references/07-react-router-7.md) | React Router v7 conventions |
| 08 | [references/08-hydrogen-fundamentals.md](references/08-hydrogen-fundamentals.md) | Hydrogen framework essentials |
| 09 | [references/09-deployment.md](references/09-deployment.md) | Oxygen, Docker, env vars |
| 10 | [references/10-weaverse-api.md](references/10-weaverse-api.md) | All hooks & WeaverseClient API |
| 11 | [references/11-advanced-features.md](references/11-advanced-features.md) | Localization, data connectors, CSP |
| 12 | [references/12-pilot-theme.md](references/12-pilot-theme.md) | Pilot theme patterns & conventions |
| 13 | [references/13-migration-v5.md](references/13-migration-v5.md) | v5 (historical): Remix → React Router v7 migration |
| 14 | [references/14-sdk-caching-and-diagnostics.md](references/14-sdk-caching-and-diagnostics.md) | SDK content caching, Builder diagnostics headers, nested multi-instance pages, client upgrades |
| 15 | [references/15-migration-v6.md](references/15-migration-v6.md) | `@weaverse/hydrogen` 5 → 6 on Hydrogen 2026.10: codemod, renamed types, `WeaverseClient`, loaders |

## Examples

| File | Shows |
|------|-------|
| [examples/hero-banner.tsx](examples/hero-banner.tsx) | Complete section with schema, settings groups, childTypes, presets |
| [examples/featured-collection.tsx](examples/featured-collection.tsx) | Section with loader, `gql()` + `storefront.graphql()` |
| [examples/product-card.tsx](examples/product-card.tsx) | Child component example |
| [examples/components-registry.ts](examples/components-registry.ts) | Registration pattern |
