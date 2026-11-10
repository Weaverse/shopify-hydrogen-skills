# Weaverse API Reference

> Complete reference for Weaverse hooks, components, and utilities.

## Core Imports

Hydrogen themes import everything from `@weaverse/hydrogen/react-router`, which re-exports the framework-free core (`@weaverse/hydrogen`) and the React hooks (`@weaverse/hydrogen/react`). `@weaverse/hydrogen/internal` is reserved for Weaverse's Builder and CLI; never import it in a theme.

```tsx
// Main imports
import {
  createSchema,
  WeaverseClient,
  WeaverseHydrogenRoot,
  withWeaverse,
  useWeaverse,
  useThemeSettings,
  useItemInstance,
  useParentInstance,
  useChildInstances,
  useTranslation,
  getSelectedProductOptions,
  getWeaverseSeoMeta,
  IMAGES_PLACEHOLDERS,
  WeaverseLoadError,
} from '@weaverse/hydrogen/react-router';

// Type imports
import type {
  WeaverseComponent,
  WeaverseComponentProps,
  WeaverseComponentSchema,
  WeaverseThemeSchema,
  WeaverseComponentLoaderArgs,
  WeaverseThemeSettings,
  WeaverseLoaderData,
  WeaverseEnv,
  WeaverseImage,
  WeaverseVideo,
} from '@weaverse/hydrogen/react-router';
```

`@weaverse/hydrogen` 6 renamed the v5 `Hydrogen*` types (`HydrogenComponentProps` → `WeaverseComponentProps`, `ComponentLoaderArgs` → `WeaverseComponentLoaderArgs`, `ThemeSettingsResponse` → `WeaverseThemeSettingsResponse`, ...) and removed `useThemeText`/`ThemeTextProvider` (use `useTranslation`/`TranslationProvider`). `CachingStrategy` comes from `@shopify/hydrogen`. See [15-migration-v6.md](15-migration-v6.md).

---

## WeaverseClient

Server-side, request-scoped class for loading Weaverse content. Created in `app/.server/context.ts` and exposed to loaders as `context.weaverse`.

### Initialization

```tsx
// app/.server/context.ts (inside createAppContext)
import { WeaverseClient } from '@weaverse/hydrogen/react-router';
import { components } from '~/weaverse/components';
import { themeSchema } from '~/weaverse/schema.server';

const weaverse = new WeaverseClient({
  storefront,          // request-scoped Hydrogen 2026.10 Storefront client (required)
  env,                 // Env, which extends WeaverseEnv
  cache,               // await caches.open('hydrogen')
  waitUntil,           // executionContext.waitUntil.bind(executionContext)
  request,
  themeSchema,
  components,
  customerAccount,     // optional; available to section loaders as weaverse.customerAccount
  locale,              // optional (6.1+): { language, country, pathPrefix } for the market
  throwPageLoadFailures: true, // optional: loadPage() rejects with WeaverseLoadError on outages
});
```

- `WeaverseClient` no longer takes a spread classic Hydrogen context (`createHydrogenContext()` is gone in 2026.10).
- Without `locale`, Weaverse reads `storefront.i18n` (`language`, `country`, `pathPrefix`). Pass `locale` when the market's Shopify `LanguageCode` differs from the locale Weaverse keys translations by (e.g. `ZH_TW` for a Hong Kong market): it sets the Translation Manager locale, the locale sent with page requests and `requestInfo.i18n`, while the Storefront API keeps its own `i18n`. Pilot passes `resolveRequestLocale(request)`.
- `projectId` and `fetchTimeoutMs` are also accepted.

### loadPage()

Load a Weaverse page's data including component loaders.

```tsx
weaverse.loadPage({
  type?: PageType,       // 'INDEX' | 'PRODUCT' | 'COLLECTION' | 'PAGE' | 'BLOG' | 'ARTICLE' | 'CUSTOM'
  handle?: string,       // Page/product/collection handle
  locale?: string,       // e.g., 'en-us', 'fr-ca'
  projectId?: string,    // For multi-project setups
  strategy?: CachingStrategy, // Caching strategy (from @shopify/hydrogen)
}): Promise<WeaverseLoaderData | null>
```

**Usage in routes:**

```tsx
// Homepage
let weaverseData = await context.weaverse.loadPage({ type: 'INDEX' });

// Product page
let weaverseData = await context.weaverse.loadPage({ type: 'PRODUCT', handle: params.handle });

// Collection page
let weaverseData = await context.weaverse.loadPage({ type: 'COLLECTION', handle: params.handle });

// Custom page
let weaverseData = await context.weaverse.loadPage({ type: 'PAGE', handle: params.handle });

// Blog
let weaverseData = await context.weaverse.loadPage({ type: 'BLOG', handle: params.blogHandle });

// Article
let weaverseData = await context.weaverse.loadPage({ type: 'ARTICLE', handle: params.articleHandle });
```

### loadThemeSettings()

Load global theme settings.

```tsx
let themeSettings = await context.weaverse.loadThemeSettings();
// Returns WeaverseThemeSettings with all values from schema.server.ts
```

`loadThemeSettings()` never throws: when settings can't be loaded it returns schema defaults with `_loadFailed: true`.

### Handling load failures

With `throwPageLoadFailures: true`, `loadPage()` rejects with a `WeaverseLoadError` whose `kind` is `unavailable`, `invalid-response` or `configuration`, so a route can answer an outage with a retryable 503 instead of a 404. A missing project still resolves to `null`.

```tsx
import { WeaverseLoadError } from '@weaverse/hydrogen/react-router';

try {
  weaverseData = await weaverse.loadPage({ type: 'INDEX' });
} catch (error) {
  if (error instanceof WeaverseLoadError && error.kind === 'unavailable') {
    throw new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  throw error;
}
```

### fetchWithCache()

Fetch external APIs with Hydrogen caching.

```tsx
let data = await weaverse.fetchWithCache<T>(url, {
  method: 'GET',
  headers: { 'API-Key': env.MY_API_KEY },
  strategy: Cache({ mode: 'public', maxAge: 60, staleWhileRevalidate: 600 }), // Cache from @shopify/hydrogen
});
```

---

## withWeaverse()

Higher-order component that wraps the root layout to enable Weaverse theming and the component system. Pilot wraps the `Layout` export:

```tsx
// app/root.tsx
import { withWeaverse } from '@weaverse/hydrogen/react-router';

export const Layout = withWeaverse(function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>{/* Meta, Links, GlobalStyle */}</head>
      <body>{children}{/* ScrollRestoration, Scripts */}</body>
    </html>
  );
});

export default function App() {
  return <Outlet />;
}
```

**Must be used in `root.tsx`.** This is required for Weaverse Studio to function.

---

## WeaverseHydrogenRoot

Renders Weaverse page content. Used in route components.

```tsx
// app/weaverse/index.tsx
import { WeaverseHydrogenRoot } from '@weaverse/hydrogen/react-router';
import { GenericError } from '~/components/root/generic-error';
import { components } from './components';

export function WeaverseContent() {
  return <WeaverseHydrogenRoot components={components} errorComponent={GenericError} />;
}

// In a route
export default function Homepage() {
  return <WeaverseContent />;
}
```

The component:
1. Reads `weaverseData` from the route's loader data
2. Creates the Weaverse context
3. Renders all sections configured for this page in Weaverse Studio
4. Handles component tree rendering (parent-child relationships)

---

## Hooks

### useWeaverse()

Access the global Weaverse instance with page data, theme settings, and component registry.

```tsx
import { useWeaverse } from '@weaverse/hydrogen/react-router';

function MyComponent() {
  let { themeSettings, itemInstances, page, eventBus } = useWeaverse();

  // themeSettings — global theme settings object
  // itemInstances — Map<string, WeaverseItemStore> of all component instances
  // page — current page data (type, handle, sections)
  // eventBus — publish-subscribe for cross-component communication
}
```

### useThemeSettings()

Shortcut to access global theme settings.

```tsx
import { useThemeSettings } from '@weaverse/hydrogen/react-router';

function Header() {
  let { headerBgColor, logoWidth, stickyHeader } = useThemeSettings();

  return (
    <header style={{ backgroundColor: headerBgColor }}>
      <img src="/logo.png" style={{ width: `${logoWidth}px` }} />
    </header>
  );
}
```

### useTranslation()

Theme text from the Translation Manager, resolved per locale: Studio overrides win over the theme's `staticContent` defaults (`themeSchema.i18n`). Replaces the removed v5 aliases `useThemeText`/`ThemeTextProvider`.

```tsx
import { useTranslation } from '@weaverse/hydrogen/react-router';

function CartTitle() {
  const { t } = useTranslation();
  return <h2>{t('cart.title')}</h2>;
}
```

`t(key, variables?)` interpolates `{{variable}}` placeholders, e.g. `t('badge.sale', { percentage: 15 })`.

### useItemInstance()

Access a specific component instance by ID.

```tsx
import { useItemInstance } from '@weaverse/hydrogen/react-router';

function SomeComponent() {
  let headerInstance = useItemInstance('site-header');

  if (headerInstance) {
    console.log(headerInstance.data); // component data
    headerInstance.updateData({ isSticky: true }); // update data
  }
}
```

### useParentInstance()

Access the parent component instance from a child.

```tsx
import { useParentInstance } from '@weaverse/hydrogen/react-router';

function ChildComponent() {
  let parent = useParentInstance();

  if (parent) {
    let parentLayout = parent.data.layout;
    // Adapt child rendering based on parent settings
  }
}
```

### useChildInstances()

Access child component instances.

```tsx
import { useChildInstances } from '@weaverse/hydrogen/react-router';

function ParentComponent() {
  let children = useChildInstances();

  // children is an array of WeaverseItemStore instances
  children.forEach(child => {
    console.log(child.data);
  });
}
```

---

## createSchema()

Define component schemas with Zod validation at build/dev time. Since `@weaverse/hydrogen` 5.16.0 the Zod runtime is dev-only — `createSchema()` is an identity pass-through in production and Zod tree-shakes out of the bundle.

```tsx
import { createSchema } from '@weaverse/hydrogen/react-router';

export let schema = createSchema({
  type: 'my-component',
  title: 'My Component',
  limit: 1,
  enabled: ({ page, group }) =>
    page.type === 'PRODUCT' && group === 'body',
  settings: [
    {
      group: 'Content',
      inputs: [
        { type: 'text', name: 'title', label: 'Title', defaultValue: 'Hello' },
      ],
    },
  ],
  childTypes: ['heading', 'paragraph'],
  presets: {
    title: 'Hello',
    children: [{ type: 'heading', content: 'Default Heading' }],
  },
});
```

`enabled` accepts a boolean or synchronous callback with `{ page: { id, type, handle, locale }, group }`. The callback runs in the storefront preview and must return a boolean immediately. Errors, Promises, and invalid results fail closed for new insertion; existing instances remain editable. `enabledOn` is deprecated and can be migrated by moving its page/group checks into the callback.

See [03-component-schema.md](03-component-schema.md) for full schema reference.

---

## Types

### WeaverseComponentProps

Base props interface for all Weaverse components.

```tsx
interface WeaverseComponentProps<LoaderData = unknown> {
  children?: React.ReactNode;
  loaderData?: LoaderData;
  className?: string;
  style?: React.CSSProperties;
  // ... other HTML attributes
}
```

### WeaverseComponentProps with Loader Data

```tsx
type Props = WeaverseComponentProps<Awaited<ReturnType<typeof loader>>> & {
  // component-specific props from schema
  heading: string;
  layout: 'grid' | 'list';
};
```

### WeaverseComponentLoaderArgs

```tsx
type WeaverseComponentLoaderArgs<T = any> = {
  data: T;                  // Component settings from schema, merged with defaults
  weaverse: WeaverseClient; // storefront, customerAccount, env, fetchWithCache, ...
};
```

### WeaverseImage

```tsx
interface WeaverseImage {
  id?: string;
  url: string;
  altText?: string;
  width?: number;
  height?: number;
}
```

### WeaverseThemeSchema

```tsx
interface WeaverseThemeSchema {
  info: {
    version: string;
    author: string;
    name: string;
    documentationUrl?: string;
    supportUrl?: string;
  };
  settings: InspectorGroup[];
}
```

---

## Utility Functions

### getSelectedProductOptions()

Extract selected product options from URL search parameters. In v6 it wraps Hydrogen 2026.10's helper with the same signature and still drops Weaverse Studio's query params.

```tsx
import { getSelectedProductOptions } from '@weaverse/hydrogen/react-router';

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const selectedOptions = getSelectedProductOptions(request);

  const { product } = await context.storefront
    .graphql(PRODUCT_QUERY, {
      variables: { handle: params.productHandle, selectedOptions },
      cache: CACHE_DEFAULT,
    })
    .then(unwrapStorefront);

  return { product };
}
```

### IMAGES_PLACEHOLDERS

Placeholder images for development.

```tsx
import { IMAGES_PLACEHOLDERS } from '@weaverse/hydrogen/react-router';

// Use in component presets or default values
export let schema = createSchema({
  type: 'hero',
  title: 'Hero',
  settings: [
    {
      group: 'Content',
      inputs: [
        {
          type: 'image',
          name: 'backgroundImage',
          label: 'Background',
          defaultValue: IMAGES_PLACEHOLDERS.banner_1,
        },
      ],
    },
  ],
});
```

Available placeholders: `image`, `logo_white`, `logo_black`, `banner_1`–`banner_2`, `collection_1`–`collection_6`, `product_1`–`product_18`.
