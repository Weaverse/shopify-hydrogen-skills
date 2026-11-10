# Deployment

> Deploy your Weaverse Hydrogen storefront to production.

## Shopify Oxygen (Recommended)

Oxygen is Shopify's official hosting platform for Hydrogen storefronts.

### Setup

1. **Connect GitHub repo** to your Shopify store
2. **Set environment variables** in Shopify admin → Hydrogen → your storefront → Settings
3. **Push to main branch** → automatic deployment

### Required Environment Variables

```bash
SESSION_SECRET="your-session-secret"
PUBLIC_STORE_DOMAIN=your-store.myshopify.com
PUBLIC_STOREFRONT_API_TOKEN=your-storefront-api-token
WEAVERSE_PROJECT_ID=your-weaverse-project-id
PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID=your-client-id
PUBLIC_CHECKOUT_DOMAIN=your-checkout-domain
SHOP_ID=your-shop-id
```

Oxygen injects `PRIVATE_STOREFRONT_API_TOKEN` for a linked storefront; Pilot's storefront client uses it (with the buyer IP) when present and the public token otherwise.

### Server Entry

`server.ts` exports a module-format fetch handler (`export default { async fetch(request, env, executionContext) { ... } }`) that builds the app context, runs `handleShopifyRoutes()`, then React Router's `createRequestHandler(serverBuild)`. `@shopify/remix-oxygen` and Hydrogen's `createRequestHandler` are gone in 2026.10. Full file: [01-project-structure.md](01-project-structure.md#serverts).

### Oxygen Deployment Commands

```bash
# Pilot's deploy script (dist/ comes from `buildDirectory: "dist"` in react-router.config.ts)
npm run build
npm run deploy   # shopify hydrogen deploy --assets-dir dist/client --worker-dir dist/server
```

`@shopify/cli` (4.4.0 or later; Pilot uses `^4.9.4`) stays a dev dependency for `deploy`, `link` and `env pull`. Older versions don't support `--assets-dir`/`--worker-dir`.

### Weaverse Studio Connection

After deploying to Oxygen:
1. Go to Weaverse Studio → your project → Settings
2. Set the **Production URL** to your Oxygen URL
3. Test the preview connection

## Other Hosts

The build output is a Workers-format server (`dist/server`) plus static assets (`dist/client`), and the app reads `caches.open()` and `executionContext.waitUntil()`. Host it on Oxygen or another Workers-compatible runtime; `npm run start` (`vite preview`) is for local verification only.

## Production Checklist

Before deploying:

- [ ] All environment variables are set
- [ ] `npm run build` completes without errors
- [ ] `npm run typecheck` passes
- [ ] Weaverse Studio preview connection works
- [ ] Core Web Vitals (LCP < 2.5s, CLS < 0.1, INP < 200ms)
- [ ] SEO: meta tags, sitemap, structured data
- [ ] SSL certificate configured
- [ ] Content Security Policy includes Weaverse domains
- [ ] Analytics and tracking configured

## Build Commands

```bash
# Development (vite dev on port 3456)
npm run dev

# Development over HTTPS (needed for Customer Account login)
npm run dev:https

# Build for production (react-router build → dist/client, dist/server)
npm run build

# Preview production build locally
npm run preview

# Type checking: react-router typegen, tsc, hydrogen gql check --fail-on-warn
npm run typecheck
```

There is no `codegen` script in Hydrogen 2026.10: `@shopify/hydrogen/ts-plugin` infers GraphQL result types from `gql()` documents, and `typecheck` validates them.

## Content Security Policy (CSP)

Weaverse needs its hosts in the CSP, and Studio must be allowed to frame the storefront in design mode. Pilot's helper:

```tsx
// app/weaverse/csp.ts (trimmed)
export function getWeaverseCsp(request: Request, env: { WEAVERSE_HOST?: string }) {
  const url = new URL(request.url);
  const weaverseHost = url.searchParams.get('weaverseHost') || env.WEAVERSE_HOST;
  const isDesignMode = url.searchParams.get('weaverseHost');
  const weaverseHosts = ['*.weaverse.io', '*.shopify.com', '*.myshopify.com'];
  if (weaverseHost) weaverseHosts.push(weaverseHost);

  const csp: Record<string, string[] | string | boolean> = {
    defaultSrc: ['data:', ...weaverseHosts],
    connectSrc: [...weaverseHosts],
    styleSrc: [...weaverseHosts],
    scriptSrc: ["'self'", 'https://cdn.shopify.com', ...weaverseHosts],
  };
  if (isDesignMode) {
    csp.frameAncestors = ['*'];
    // The Studio bridge rebuilds schema `condition` functions from strings
    (csp.scriptSrc as string[]).push("'unsafe-eval'");
  }
  return csp;
}
```

Hydrogen 2026.10 removed `createContentSecurityPolicy`, so `entry.server.tsx` uses Pilot's port in `app/utils/csp.ts`:

```tsx
import { createContentSecurityPolicy, generateNonce, NonceProvider } from '~/utils/csp';
import { getWeaverseCsp } from '~/weaverse/csp';

const nonce = generateNonce();
const header = createContentSecurityPolicy(nonce, getWeaverseCsp(request, context.env), {
  checkoutDomain: context.env?.PUBLIC_CHECKOUT_DOMAIN || context.env?.PUBLIC_STORE_DOMAIN,
  storeDomain: context.env?.PUBLIC_STORE_DOMAIN,
});
```
