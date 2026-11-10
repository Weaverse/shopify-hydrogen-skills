# 07 — React Router 7

> Routes, layouts, loaders/actions, conventions, imports.

## Imports

Weaverse Hydrogen themes run on React Router 7 (Pilot pins `react-router` and `@react-router/dev` to the same 7.x version; React Router 8 is not supported yet). All router imports come from `react-router`:

```tsx
// ✅ React Router 7
import { useLoaderData, useNavigate, Link, Outlet } from 'react-router';
import type { LoaderFunctionArgs, ActionFunctionArgs } from 'react-router';

// ❌ Remix / classic Hydrogen (removed)
import { useLoaderData } from '@remix-run/react';
import type { LoaderFunctionArgs } from '@shopify/remix-oxygen';
```

## Configuration

### `react-router.config.ts`

Hydrogen 2026.10 has no React Router preset. Set the values the old `hydrogenPreset()` applied (see [01-project-structure.md](01-project-structure.md#react-routerconfigts) for the full file):

```tsx
import type { Config } from '@react-router/dev/config';

export default {
  appDirectory: 'app',
  buildDirectory: 'dist',
  ssr: true,
  future: { v8_middleware: true, v8_splitRouteModules: true /* ... */ },
} satisfies Config;
```

### TypeScript

```jsonc
// tsconfig.json (trimmed from Pilot)
{
  "include": ["./**/*.d.ts", "./**/*.ts", "./**/*.tsx", ".react-router/types/**/*"],
  "compilerOptions": {
    "rootDirs": [".", "./.react-router/types"],
    "types": ["@shopify/oxygen-workers-types", "node", "react-router", "vite/client"],
    "paths": { "~/*": ["./app/*"] },
    "plugins": [{ "name": "@shopify/hydrogen/ts-plugin" }]
  }
}
```

### `.gitignore`

```
.react-router/
storefront-graphql-env.d.ts
customer-account-graphql-env.d.ts
```

### `env.d.ts`

`server.ts` copies the object returned by `createAppContext()` onto React Router's context, so the context types extend it:

```tsx
import type { AppContext } from './app/.server/context';

declare module 'react-router' {
  interface AppLoadContext extends AppContext {}
  interface RouterContextProvider extends AppContext {}
}
```

## Route Config (`app/routes.ts`)

Pilot registers routes programmatically with `@react-router/dev/routes` (no flat file routing; `hydrogenRoutes()` is gone in Hydrogen 2026.10). Every page sits under an optional `:locale?` prefix:

```tsx
// app/routes.ts (trimmed)
import { index, layout, prefix, type RouteConfig, route } from '@react-router/dev/routes';

export default [
  route('robots.txt', 'routes/seo/robots.ts'),
  layout('routes/market-guard-resources.ts', [
    ...prefix(':locale?', [
      route('sitemap.xml', 'routes/seo/sitemap.ts'),
      route('cart/checkout', 'routes/cart/checkout.tsx'),
      // ... other resource routes
    ]),
  ]),
  layout('routes/market-guard.ts', [
    ...prefix(':locale?', [
      index('routes/home.tsx'),
      route('products/:productHandle', 'routes/products/product.tsx'),
      route('collections/:collectionHandle', 'routes/collections/collection.tsx'),
      route('pages/:pageHandle', 'routes/pages/regular-page.tsx'),
      // ... other pages
      route('*', 'routes/catch-all.tsx'), // Weaverse custom pages
    ]),
  ]),
] satisfies RouteConfig;
```

Don't add route files for paths Hydrogen's handlers own in `server.ts`: `/api/cart`, `/api/predictive-search`, the Storefront API proxy and `/account/login|authorize|refresh|logout`. Link to the account paths with a plain `<a>`/`<form>`, not `<Link>`/`<Form>`.

## Route Structure with Weaverse

Pilot renders Weaverse content through a small wrapper:

```tsx
// app/weaverse/index.tsx
import { WeaverseHydrogenRoot } from '@weaverse/hydrogen/react-router';
import { GenericError } from '~/components/root/generic-error';
import { components } from './components';

export function WeaverseContent() {
  return <WeaverseHydrogenRoot components={components} errorComponent={GenericError} />;
}
```

### Homepage

```tsx
// app/routes/home.tsx
import type { LoaderFunctionArgs } from 'react-router';
import { WeaverseContent } from '~/weaverse';

export async function loader({ context }: LoaderFunctionArgs) {
  let weaverseData = await context.weaverse.loadPage({ type: 'INDEX' });
  return { weaverseData };
}

export default function Homepage() {
  return <WeaverseContent />;
}
```

### Product Page

```tsx
// app/routes/products/product.tsx
import { getSelectedProductOptions } from '@weaverse/hydrogen/react-router';
import type { LoaderFunctionArgs } from 'react-router';
import { PRODUCT_QUERY } from '~/graphql/queries';
import { CACHE_DEFAULT } from '~/utils/cache';
import { unwrapStorefront } from '~/utils/storefront';
import { WeaverseContent } from '~/weaverse';

export async function loader({ context, params, request }: LoaderFunctionArgs) {
  let { productHandle: handle } = params;
  let { storefront, weaverse } = context;
  if (!handle) throw new Response(null, { status: 404 });

  // Shopify and Weaverse data in parallel
  let [{ product }, weaverseData] = await Promise.all([
    storefront
      .graphql(PRODUCT_QUERY, {
        variables: { handle, selectedOptions: getSelectedProductOptions(request) },
        cache: CACHE_DEFAULT,
      })
      .then(unwrapStorefront),
    weaverse.loadPage({ type: 'PRODUCT', handle }),
  ]);

  if (!product) throw new Response('Product not found', { status: 404 });
  return { product, weaverseData };
}

export default function ProductPage() {
  return <WeaverseContent />;
}
```

Pilot's real product route also wraps `<WeaverseContent />` in Hydrogen's `ProductProvider` (from `createProductComponents()` in `@shopify/hydrogen/react`) so every section reads the same variant selection.

### Collection Page

```tsx
// app/routes/collections/collection.tsx
export async function loader({ context, params }: LoaderFunctionArgs) {
  let weaverseData = await context.weaverse.loadPage({
    type: 'COLLECTION',
    handle: params.collectionHandle,
  });
  return { weaverseData };
}

export default function CollectionPage() {
  return <WeaverseContent />;
}
```

### Regular Page

```tsx
// app/routes/pages/regular-page.tsx
export async function loader({ context, params }: LoaderFunctionArgs) {
  let weaverseData = await context.weaverse.loadPage({
    type: 'PAGE',
    handle: params.pageHandle,
  });
  return { weaverseData };
}
```

## Entry Server

Uses `ServerRouter`. Hydrogen 2026.10 removed its CSP helpers, so `NonceProvider` and `createContentSecurityPolicy` come from the theme (`app/utils/csp.ts` in Pilot). Full file: [01-project-structure.md](01-project-structure.md#entryservertsx).

## Loader Patterns

### Return data directly (RR7 style)

```tsx
export async function loader({ context }: LoaderFunctionArgs) {
  let data = await context.weaverse.loadPage({ type: 'INDEX' });
  return { weaverseData: data };  // No json() wrapper needed in RR7
}
```

### Actions

```tsx
export async function action({ request, context }: ActionFunctionArgs) {
  let formData = await request.formData();
  // Process form data
  return { success: true };
}
```

### Meta

```tsx
export function meta({ data }: { data: LoaderData }) {
  return [
    { title: data.page?.title || 'My Store' },
    { name: 'description', content: data.page?.description || '' },
  ];
}
```

## Key Hooks

```tsx
import {
  useLoaderData,    // Access loader data in components
  useActionData,    // Access action return data
  useNavigate,      // Programmatic navigation
  useParams,        // URL params
  useSearchParams,  // Query string params
  useLocation,      // Current location
  Link,             // Navigation link
  NavLink,          // Navigation link with active state
  Form,             // Form with action
  Outlet,           // Render child routes
} from 'react-router';
```
