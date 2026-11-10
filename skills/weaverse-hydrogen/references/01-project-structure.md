# 01 — Project Structure

> Anatomy of a Weaverse Hydrogen theme.

## Directory Layout

Pilot `main` on Hydrogen 2026.10 and `@weaverse/hydrogen` 6:

```
my-theme/
├── app/
│   ├── .server/             # Server-only modules
│   │   ├── context.ts       # createAppContext(): session, storefront, customerAccount, WeaverseClient
│   │   ├── storefront.ts    # Request-scoped Storefront API client
│   │   ├── session.ts       # Cookie session
│   │   ├── cart.ts          # Cart server handlers (/api/cart)
│   │   └── customer-account.ts  # Customer Account OAuth handlers + context.customerAccount
│   ├── components/          # Reusable UI components (Button, Icon, etc.)
│   ├── graphql/             # gql() queries and fragments
│   ├── hooks/               # Custom React hooks
│   ├── routes/              # Route modules
│   ├── sections/            # Weaverse section components
│   ├── styles/              # Global CSS, Tailwind base
│   ├── types/               # TypeScript type definitions
│   ├── utils/               # Helpers (cache.ts, storefront.ts, csp.ts, ...)
│   ├── weaverse/
│   │   ├── components.ts    # Component registry
│   │   ├── schema.server.ts # Theme schema (global settings)
│   │   ├── csp.ts           # CSP directives for Weaverse
│   │   ├── index.tsx        # <WeaverseContent /> (WeaverseHydrogenRoot)
│   │   └── style.tsx        # Global CSS variables from theme settings
│   ├── entry.client.tsx     # Client entry point
│   ├── entry.server.tsx     # Server entry (ServerRouter + CSP)
│   ├── routes.ts            # Route config
│   └── root.tsx             # Root layout (wrapped with withWeaverse)
├── public/                  # Static assets
├── server.ts                # Fetch handler composing the request lifecycle
├── env.d.ts                 # Env + React Router context types
├── vite.config.ts           # Vite build config (oxygen() + localHttps() plugins)
├── react-router.config.ts   # React Router config
├── tsconfig.json            # TypeScript config (@shopify/hydrogen/ts-plugin)
└── .env                     # Environment variables
```

There is no GraphQL codegen in Hydrogen 2026.10: `@shopify/hydrogen/ts-plugin` infers result types from `gql()` documents, and `npm run typecheck` runs `hydrogen gql check --fail-on-warn`.

## Key Directories

### `app/sections/`

This is where all Weaverse section components live. Each section is either:

- A **single file**: `app/sections/hero-banner.tsx`
- A **directory**: `app/sections/hero-banner/index.tsx` (for complex components with sub-files)

Every section exports:
1. **`default`** — The React component
2. **`schema`** — The `createSchema()` configuration
3. **`loader`** (optional) — Server-side data fetching function

### `app/weaverse/`

Core Weaverse configuration:

- **`components.ts`** — Registers all section components:
  ```tsx
  import type { WeaverseComponent } from '@weaverse/hydrogen/react-router';
  import * as HeroBanner from '~/sections/hero-banner';
  export let components: WeaverseComponent[] = [HeroBanner];
  ```

- **`schema.server.ts`** — Defines global theme settings (colors, typography, layout):
  ```tsx
  import type { WeaverseThemeSchema } from '@weaverse/hydrogen/react-router';
  export let themeSchema: WeaverseThemeSchema = {
    info: { version: '1.0.0', author: 'Weaverse', name: 'My Theme' },
    settings: [
      {
        group: 'Colors',
        inputs: [
          { type: 'color', name: 'colorPrimary', label: 'Primary', defaultValue: '#000000' },
        ],
      },
    ],
  };
  ```

- **`csp.ts`** — Content Security Policy directives for Weaverse:
  ```tsx
  // Pilot's signature: (request, env). Studio's host is read from `?weaverseHost=`.
  export function getWeaverseCsp(request: Request, env: { WEAVERSE_HOST?: string }) {
    const isDesignMode = new URL(request.url).searchParams.get('weaverseHost');
    const directives: Record<string, string[] | string | boolean> = {
      defaultSrc: ['data:', '*.weaverse.io', '*.shopify.com', '*.myshopify.com'],
      // ... connectSrc, styleSrc, fontSrc, scriptSrc
    };
    if (isDesignMode) directives.frameAncestors = ['*'];
    return directives;
  }
  ```

### `app/routes/` and `app/routes.ts`

Routes are registered in `app/routes.ts` with `route()`, `index()`, `layout()` and `prefix()` from `@react-router/dev/routes`, under a `:locale?` prefix. Weaverse pages are loaded in route loaders:

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

Paths Hydrogen's handlers own never get route files: `/api/cart`, `/api/predictive-search`, the Storefront API proxy, and Customer Account OAuth at `/account/login|authorize|refresh|logout`.

## Essential Files

### `app/.server/context.ts`

Hydrogen 2026.10 has no `createHydrogenContext()`. The app builds the per-request values itself, including the `WeaverseClient`:

```tsx
import { WeaverseClient } from '@weaverse/hydrogen/react-router';
import { createCustomerAccount } from '~/.server/customer-account';
import { AppSession } from '~/.server/session';
import { createRequestStorefront, resolveRequestLocale } from '~/.server/storefront';
import { components } from '~/weaverse/components';
import { themeSchema } from '~/weaverse/schema.server';

export async function createAppContext(request: Request, env: Env, executionContext: ExecutionContext) {
  if (!env?.SESSION_SECRET) throw new Error('SESSION_SECRET environment variable is not set');

  const waitUntil = executionContext.waitUntil.bind(executionContext);
  const [cache, session] = await Promise.all([
    caches.open('hydrogen'),
    AppSession.init(request, [env.SESSION_SECRET]),
  ]);
  const storefront = createRequestStorefront({ request, env, cache, waitUntil });
  const customerAccount = createCustomerAccount({ env, request, session, storefront });

  const weaverse = new WeaverseClient({
    storefront,
    locale: resolveRequestLocale(request), // optional, @weaverse/hydrogen 6.1+
    env,
    cache,
    waitUntil,
    request,
    customerAccount,
    themeSchema,
    components,
    throwPageLoadFailures: true,
  });

  return { env, cache, waitUntil, session, storefront, customerAccount, weaverse };
}

export type AppContext = Awaited<ReturnType<typeof createAppContext>>;
```

`createRequestStorefront()` wraps `createShopifyRequestContext()` and `createStorefrontClient()` from `@shopify/hydrogen` (private token when Oxygen injects `PRIVATE_STOREFRONT_API_TOKEN`, public otherwise). See Pilot's `app/.server/storefront.ts`.

### `server.ts`

A module-format fetch handler that composes the request lifecycle (trimmed from Pilot):

```tsx
import { handleShopifyRedirects, handleShopifyRoutes } from '@shopify/hydrogen';
import { createRequestHandler, RouterContextProvider } from 'react-router';
import * as serverBuild from 'virtual:react-router/server-build';
import { cartHandlers, createPilotCartHandlers } from '~/.server/cart';
import { createAppContext } from '~/.server/context';
import { getCustomerAccountHandlers } from '~/.server/customer-account';
import { predictiveSearchHandlers } from '~/.server/predictive-search';
import { routeTemplates } from '~/utils/route-templates';

const handleRequest = createRequestHandler(serverBuild, process.env.NODE_ENV);

export default {
  async fetch(request: Request, env: Env, executionContext: ExecutionContext) {
    try {
      // 1. Request context and clients
      const appContext = await createAppContext(request, env, executionContext);
      const { session, storefront } = appContext;
      const requestContext = storefront.requestContext;

      // 2. Routes Hydrogen owns (returns null for any other path)
      const shopifyRoute = handleShopifyRoutes({
        request,
        requestContext,
        sessionManager: session,
        storefrontClient: storefront,
        routeTemplates,
        handlers: [
          createPilotCartHandlers({ getCustomerAccessToken: appContext.customerAccount.getAccessToken }),
          cartHandlers,
          predictiveSearchHandlers,
          getCustomerAccountHandlers(env),
        ],
      });
      if (shopifyRoute) {
        const response = await shopifyRoute;
        await commitSession(response, appContext);
        return response;
      }

      // 3. Render the app; loaders read context.storefront, context.weaverse, ...
      const routerContext = Object.assign(new RouterContextProvider(), appContext);
      const response = await handleRequest(request, routerContext);

      // 4. On a 404, look the path up in Shopify's URL redirects
      if (response.status === 404) {
        const redirect = await handleShopifyRedirects({ request, storefrontClient: storefront, routeTemplates });
        if (redirect) return redirect;
      }

      // 5. Commit the session, then apply Shopify's response headers
      await commitSession(response, appContext);
      requestContext.applyResponseHeaders(response.headers);
      return response;
    } catch (error) {
      console.error(error);
      return new Response('An unexpected error occurred', { status: 500 });
    }
  },
};

async function commitSession(response: Response, { session }: Awaited<ReturnType<typeof createAppContext>>) {
  const headers = new Headers((await session.commit()) ?? undefined);
  for (const [name, value] of headers) response.headers.append(name, value);
}
```

### `env.d.ts`

```ts
import type { WeaverseEnv } from '@weaverse/hydrogen/react-router';
import type { AppContext } from './app/.server/context';

declare global {
  interface Env extends WeaverseEnv {
    SESSION_SECRET: string;
    PUBLIC_STORE_DOMAIN: string;
    PUBLIC_STOREFRONT_API_TOKEN?: string;
    PRIVATE_STOREFRONT_API_TOKEN?: string;
    // ...
  }
}

declare module 'react-router' {
  interface AppLoadContext extends AppContext {}
  interface RouterContextProvider extends AppContext {}
}
```

### `root.tsx`

The root `Layout` is wrapped with `withWeaverse`:

```tsx
import { withWeaverse } from '@weaverse/hydrogen/react-router';
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';

export const Layout = withWeaverse(function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
});

export default function App() {
  return <Outlet />;
}
```

Pilot's real root also renders `ShopifyScripts` (from `@shopify/hydrogen/react`) first in `<head>` and wraps the body in its `CartProvider`.

### `entry.server.tsx`

Uses `ServerRouter` from React Router. Hydrogen 2026.10 removed `createContentSecurityPolicy`, `NonceProvider` and `useNonce`; Pilot ports them to `app/utils/csp.ts`:

```tsx
import { renderToReadableStream } from 'react-dom/server';
import type { EntryContext, RouterContextProvider } from 'react-router';
import { ServerRouter } from 'react-router';
import { createContentSecurityPolicy, generateNonce, NonceProvider } from '~/utils/csp';
import { getWeaverseCsp } from '~/weaverse/csp';

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
  context: RouterContextProvider,
) {
  const nonce = generateNonce();
  const header = createContentSecurityPolicy(nonce, getWeaverseCsp(request, context.env), {
    checkoutDomain: context.env?.PUBLIC_CHECKOUT_DOMAIN || context.env?.PUBLIC_STORE_DOMAIN,
    storeDomain: context.env?.PUBLIC_STORE_DOMAIN,
  });

  const body = await renderToReadableStream(
    <NonceProvider value={nonce}>
      <ServerRouter context={reactRouterContext} url={request.url} nonce={nonce} />
    </NonceProvider>,
    { nonce, signal: request.signal },
  );

  responseHeaders.set('Content-Type', 'text/html');
  responseHeaders.set('Content-Security-Policy-Report-Only', header);
  return new Response(body, { headers: responseHeaders, status: responseStatusCode });
}
```

### `.env`

Required environment variables:

```bash
SESSION_SECRET="your-secret"
PUBLIC_STORE_DOMAIN=your-store.myshopify.com
PUBLIC_STOREFRONT_API_TOKEN=your-token
WEAVERSE_PROJECT_ID=your-project-id

# Optional
PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID=your-client-id
PUBLIC_CHECKOUT_DOMAIN=your-checkout-domain
SHOP_ID=your-shop-id
```

Oxygen injects `PRIVATE_STOREFRONT_API_TOKEN` for a linked storefront.

### `react-router.config.ts`

Hydrogen 2026.10 has no React Router preset (`hydrogenPreset()` is gone). Pilot sets the values it applied:

```tsx
import type { Config } from '@react-router/dev/config';

export default {
  appDirectory: 'app',
  buildDirectory: 'dist', // `shopify hydrogen deploy` reads dist/client and dist/server
  ssr: true,
  subResourceIntegrity: false,
  future: {
    v8_middleware: true,
    v8_splitRouteModules: true,
    v8_viteEnvironmentApi: false,
    unstable_optimizeDeps: true,
    v8_passThroughRequests: true,
    v8_trailingSlashAwareDataRequests: true,
  },
} satisfies Config;
```

### `.gitignore` (must include)

```
.react-router/
node_modules/
dist/
# Generated by @shopify/hydrogen/ts-plugin
storefront-graphql-env.d.ts
customer-account-graphql-env.d.ts
```
