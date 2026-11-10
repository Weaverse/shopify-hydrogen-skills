# Setup: `server.ts` and the App Context

Reference implementation: [Pilot](https://github.com/Weaverse/pilot) `main` (`server.ts`, `app/.server/*`), on `@shopify/hydrogen` 2026.10.

## Overview

Hydrogen 2026.10 has no `createHydrogenContext()` and no Hydrogen `createRequestHandler`. The app builds its own context and composes the request lifecycle in `server.ts`:

1. Build the app context (session, storefront client, customer account, CMS client).
2. Let Hydrogen answer the routes it owns with `handleShopifyRoutes()`.
3. Render the app with React Router's `createRequestHandler`.
4. Commit the session and apply Shopify's response headers.
5. On a 404, look the path up in Shopify's URL redirects with `handleShopifyRedirects()`.

> Upgrading from classic Hydrogen (2026.4 and earlier)? See the `hydrogen-upgrades` skill, `upgrade-2026.4.7-to-2026.10.2.md`.

## Env Vars

```bash
SESSION_SECRET=                         # signs the session cookie
PUBLIC_STORE_DOMAIN=                    # e.g. mystore.myshopify.com
PUBLIC_STOREFRONT_API_TOKEN=            # public token
PRIVATE_STOREFRONT_API_TOKEN=           # injected by Oxygen for a linked storefront
PUBLIC_STOREFRONT_ID=                   # storefront ID
PUBLIC_CHECKOUT_DOMAIN=                 # checkout domain for CSP
SHOP_ID=                                # numeric shop ID (Customer Accounts)
PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID=  # Customer Account API client ID
```

Declare them on the global `Env` interface in `env.d.ts`. In a Weaverse theme, `Env extends WeaverseEnv` (from `@weaverse/hydrogen/react-router`).

## `server.ts`

```ts
import { handleShopifyRedirects, handleShopifyRoutes } from "@shopify/hydrogen";
import { createRequestHandler, RouterContextProvider } from "react-router";
import * as serverBuild from "virtual:react-router/server-build";
import { cartHandlers, createPilotCartHandlers } from "~/.server/cart";
import { createAppContext } from "~/.server/context";
import { getCustomerAccountHandlers } from "~/.server/customer-account";
import { predictiveSearchHandlers } from "~/.server/predictive-search";
import { routeTemplates } from "~/utils/route-templates";

const handleRequest = createRequestHandler(serverBuild, process.env.NODE_ENV);

export default {
  async fetch(request: Request, env: Env, executionContext: ExecutionContext) {
    try {
      // 1. The request context and clients
      const appContext = await createAppContext(request, env, executionContext);
      const { session, storefront } = appContext;
      const requestContext = storefront.requestContext;

      // 2. Routes Hydrogen owns: /api/cart, predictive search, /account/login, ...
      const shopifyRoute = handleShopifyRoutes({
        request,
        requestContext,
        sessionManager: session,
        storefrontClient: storefront,
        routeTemplates,
        handlers: [
          // App handlers that wrap a library handler go first
          createPilotCartHandlers({
            getCustomerAccessToken: appContext.customerAccount.getAccessToken,
          }),
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

      // 3. Render the app; loaders read `context.storefront`, `context.session`, ...
      const routerContext = Object.assign(new RouterContextProvider(), appContext);
      const response = await handleRequest(request, routerContext);

      // 4. On a 404, look the path up in Shopify's URL redirects
      if (response.status === 404) {
        const redirect = await handleShopifyRedirects({
          request,
          storefrontClient: storefront,
          routeTemplates,
        });
        if (redirect) return redirect;
      }

      // 5. Commit the session, then apply Shopify's response headers
      await commitSession(response, appContext);
      requestContext.applyResponseHeaders(response.headers);
      return response;
    } catch (error) {
      console.error(error);
      return new Response("An unexpected error occurred", { status: 500 });
    }
  },
};

/** Appends the session cookie when the request changed the session. */
async function commitSession(
  response: Response,
  { session }: Awaited<ReturnType<typeof createAppContext>>,
) {
  const headers = new Headers((await session.commit()) ?? undefined);
  for (const [name, value] of headers) response.headers.append(name, value);
}
```

Notes:

- `handleShopifyRoutes` decides synchronously: a `Promise<Response>` for a path a handler owns, otherwise `null`.
- Handlers match in order. Pilot's `POST /api/cart` syncs the cart's market and customer, then delegates to `cartHandlers`, so it is listed first.
- Hydrogen-owned paths are exact and never carry a market prefix. Pilot resolves their market from the same-origin `Referer` (and from `return_to` for `/account/login`).
- Pilot's real `server.ts` also rejects a `GET`/`HEAD` with a body, collapses `//` in paths, rewrites `http:` to `https:` behind a TLS-terminating proxy (`x-forwarded-proto`), makes the redirect lookup market-aware, and routes cart permalinks without a `payment` param to its own `/cart/:lines` route.

## Route Templates

```ts
// app/utils/route-templates.ts
import { createShopifyRouteTemplates } from "@shopify/hydrogen";

// Maps Shopify resources to your routes: `?variant=` product links, URL
// redirects and `ShopifyScripts` links. Never include a market prefix.
export const routeTemplates = createShopifyRouteTemplates({
  productInCollection: "/products/:productHandle",
});
```

## `createAppContext()`

```ts
// app/.server/context.ts
export async function createAppContext(
  request: Request,
  env: Env,
  executionContext: ExecutionContext,
) {
  if (!env?.SESSION_SECRET) {
    throw new Error("SESSION_SECRET environment variable is not set");
  }

  const waitUntil = executionContext.waitUntil.bind(executionContext);
  const [cache, session] = await Promise.all([
    caches.open("hydrogen"),
    AppSession.init(request, [env.SESSION_SECRET]),
  ]);
  const storefront = createRequestStorefront({ request, env, cache, waitUntil });
  const customerAccount = createCustomerAccount({ env, request, session, storefront });
  // A CMS client goes here too, e.g. Weaverse's `new WeaverseClient({ storefront, env, cache, waitUntil, request, ... })`

  return { env, cache, waitUntil, session, storefront, customerAccount };
}

export type AppContext = Awaited<ReturnType<typeof createAppContext>>;
```

Type it onto React Router's context in `env.d.ts`, so loaders keep reading `context.storefront` and friends:

```ts
declare module "react-router" {
  interface AppLoadContext extends AppContext {}
  interface RouterContextProvider extends AppContext {}
}
```

## The Storefront Client

```ts
// app/.server/storefront.ts
import {
  type CacheInstance,
  type CachingStrategy,
  createShopifyRequestContext,
  createStorefrontClient,
  type PublicStorefrontClient,
  type RequestScopedPrivateStorefrontClient,
} from "@shopify/hydrogen";

// The bare client types drop `cache` from `graphql()` options; carry it.
type StorefrontCallOptions = { cache?: CachingStrategy };

export type Storefront = (
  | RequestScopedPrivateStorefrontClient<StorefrontCallOptions>
  | PublicStorefrontClient<StorefrontCallOptions>
) & { i18n: StorefrontI18n }; // StorefrontI18n: your market shape plus `pathPrefix`

export function createRequestStorefront({
  request,
  env,
  cache,
  waitUntil,
}: {
  request: Request;
  env: Env;
  cache: CacheInstance;
  waitUntil: ExecutionContext["waitUntil"];
}): Storefront {
  const i18n = getRequestI18n(request); // your market resolver: { country, language, pathPrefix, ... }
  const buyerIp = getBuyerIp(request.headers); // `oxygen-buyer-ip`, then proxy headers
  const config = {
    storeDomain: env.PUBLIC_STORE_DOMAIN,
    storefrontId: env.PUBLIC_STOREFRONT_ID || undefined,
    cache,
    waitUntil,
  };

  // Oxygen injects the private token for a linked storefront; the private
  // client forwards the buyer IP for Shopify's bot protection.
  if (env.PRIVATE_STOREFRONT_API_TOKEN && buyerIp) {
    return createStorefrontClient({
      type: "private",
      requestContext: createShopifyRequestContext({ request, i18n, buyerIp }),
      config: { ...config, privateStorefrontToken: env.PRIVATE_STOREFRONT_API_TOKEN },
    }) as Storefront;
  }

  return createStorefrontClient({
    type: "public",
    requestContext: createShopifyRequestContext({ request, i18n }),
    config: { ...config, publicStorefrontToken: env.PUBLIC_STOREFRONT_API_TOKEN || undefined },
  }) as Storefront;
}
```

The client exposes `storefront.graphql(doc, { variables, cache })`, `storefront.i18n` and `storefront.requestContext`. See Pilot's `app/.server/storefront.ts` for the market resolver and buyer-IP lookup.

## Querying in Routes

```ts
import { gql, type StorefrontApi } from "@shopify/hydrogen";
import { CACHE_DEFAULT } from "~/utils/cache";
import { unwrapStorefront } from "~/utils/storefront";

export const PRODUCT_QUERY = gql(
  `
  query product($country: CountryCode, $language: LanguageCode, $handle: String!)
  @inContext(country: $country, language: $language) {
    product(handle: $handle) { ...ProductDetails }
  }
`,
  [PRODUCT_FRAGMENT], // fragments are passed, not interpolated
);
export type ProductQuery = StorefrontApi.ResultOf<typeof PRODUCT_QUERY>;

export async function loader({ context, params }: LoaderFunctionArgs) {
  const { product } = await context.storefront
    .graphql(PRODUCT_QUERY, {
      variables: { handle: params.productHandle }, // no country/language
      cache: CACHE_DEFAULT,
    })
    .then(unwrapStorefront);
  if (!product) throw new Response(null, { status: 404 });
  return { product };
}
```

`graphql()` returns `{ data, errors, headers }` and doesn't throw on GraphQL errors. Pilot keeps the throwing contract with a helper:

```ts
// app/utils/storefront.ts
import type { GraphQLFormattedError } from "@shopify/hydrogen";

export function unwrapStorefront<T>(result: {
  data: T | null;
  errors?: GraphQLFormattedError[];
}): T {
  if (result.errors?.length || !result.data) {
    const messages = result.errors?.map(({ message }) => message) ?? ["No data returned"];
    throw new Error(`[storefront.graphql] ${messages.join("\n")}`);
  }
  return result.data;
}
```

Customer Account documents use `gql` from `@shopify/hydrogen/customer-account`.

## Session

The session implements Hydrogen's `WritableCustomerSessionManager` (from `@shopify/hydrogen/customer-account`) on React Router's cookie storage, and `commit()` returns headers only when something changed, so anonymous pages get no `Set-Cookie` and stay full-page cacheable:

```ts
import type { WritableCustomerSessionManager } from "@shopify/hydrogen/customer-account";
import { createCookieSessionStorage, type Session, type SessionStorage } from "react-router";

export class AppSession implements WritableCustomerSessionManager {
  isPending = false;
  readonly #storage: SessionStorage;
  readonly #session: Session;
  readonly #origin: string;

  constructor(storage: SessionStorage, session: Session, origin: string) {
    this.#storage = storage;
    this.#session = session;
    this.#origin = origin;
  }

  static async init(request: Request, secrets: string[]) {
    const storage = createCookieSessionStorage({
      cookie: {
        name: "session",
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        secure: new URL(request.url).protocol === "https:",
        secrets,
      },
    });
    const session = await storage
      .getSession(request.headers.get("Cookie"))
      .catch(() => storage.getSession());
    return new AppSession(storage, session, new URL(request.url).origin);
  }

  getSessionOrigin() { return this.#origin; }
  getSessionItem(key: string) { return this.#session.get(key); }
  setSessionItem(key: string, value: unknown) {
    this.isPending = true;
    this.#session.set(key, value);
  }
  removeSessionItem(key: string) {
    this.isPending = true;
    this.#session.unset(key);
  }
  async commit() {
    if (!this.isPending) return;
    this.isPending = false;
    return { "Set-Cookie": await this.#storage.commitSession(this.#session) };
  }
}
```

## Customer Accounts

```ts
import {
  createCustomerAccountServerHandlers,
  createCustomerSession,
} from "@shopify/hydrogen/customer-account";

const customerSession = createCustomerSession({
  shopId: env.SHOP_ID,
  customerAccountApiClientId: env.PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID,
});

// Registered in handleShopifyRoutes: /account/login|authorize|refresh|logout
const handlers = createCustomerAccountServerHandlers({
  customerSession,
  defaultPostLoginRedirectPathname: "/account",
});
```

- `createCustomerSession()` throws when `SHOP_ID` or the client ID is missing or invalid. Create it only when both are set, so a store without accounts keeps serving pages.
- Account loaders call the Customer Account API with `createCustomerAccountClient()` and the session's token. Pilot wraps this as `context.customerAccount` (`graphql`, `isLoggedIn`, `getAccessToken`, `handleAuthStatus`, `logout`); see `app/.server/customer-account.ts`.
- Link to the handler paths with a plain `<a>`/`<form>`. Local login needs HTTPS (`npm run dev:https`).

## Build Configuration

```ts
// vite.config.ts
import { reactRouter } from "@react-router/dev/vite";
import { localHttps } from "@shopify/hydrogen/vite";
import { oxygen } from "@shopify/mini-oxygen/vite";

plugins: [
  localHttps({ enabled: process.env.npm_lifecycle_event === "dev:https" }),
  ...oxygen(), // returns an array: spread it
  reactRouter(),
],
ssr: {
  optimizeDeps: {
    // React and React Router must be pre-bundled for the workerd SSR runtime
    include: [
      "react", "react/jsx-runtime", "react/jsx-dev-runtime", "react-dom",
      "react-dom/server", "react-router", "react-router > cookie",
      "react-router > set-cookie-parser",
    ],
  },
},
```

```ts
// react-router.config.ts: no Hydrogen preset anymore
import type { Config } from "@react-router/dev/config";

export default {
  appDirectory: "app",
  buildDirectory: "dist", // read by `shopify hydrogen deploy`
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

- `tsconfig.json`: add `{ "name": "@shopify/hydrogen/ts-plugin" }` to `compilerOptions.plugins`; no `*.generated` paths. Ignore the generated `storefront-graphql-env.d.ts` and `customer-account-graphql-env.d.ts` in `.gitignore`.

```json
{
  "scripts": {
    "build": "react-router build",
    "dev": "hydrogen skills check --mode=warn && vite dev --port 3456",
    "dev:https": "hydrogen skills check --mode=warn && vite dev --port 3456",
    "preview": "react-router build && vite preview --port 3456",
    "typecheck": "react-router typegen && tsc --noEmit && hydrogen gql check --fail-on-warn",
    "deploy": "shopify hydrogen deploy --assets-dir dist/client --worker-dir dist/server"
  }
}
```

The `hydrogen` binary ships with `@shopify/hydrogen`. `@shopify/cli` stays a dev dependency for `deploy`, `link` and `env pull`.
