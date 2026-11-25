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

Hydrogen 2026.10.3 builds the policy (`createContentSecurityPolicy`); the theme only supplies extra directives, and the Weaverse SDK supplies Studio's. Pilot's `app/weaverse/csp.ts`:

```tsx
import type { ContentSecurityPolicyDirectives } from '@shopify/hydrogen';
import { getWeaverseStudioCspDirectives } from '@weaverse/hydrogen/react-router';

/** Third-party origins the theme's sections and integrations load from. */
const THEME_SOURCES = [
  'data:',
  '*.youtube.com',
  '*.youtu.be',
  '*.vimeo.com',
  '*.google.com',
  '*.google-analytics.com',
  '*.googletagmanager.com',
  'cdn.jsdelivr.net',
];

/** Each array extends Hydrogen's default for that directive. */
const THEME_DIRECTIVES = {
  // Hydrogen sets image, media and frame sources apart from default-src
  defaultSrc: THEME_SOURCES,
  imgSrc: THEME_SOURCES,
  mediaSrc: THEME_SOURCES,
  frameSrc: THEME_SOURCES,
  connectSrc: ['vimeo.com', '*.google-analytics.com'],
  styleSrc: ['https://fonts.googleapis.com'],
  fontSrc: ['data:', 'https://fonts.gstatic.com'],
  // No nonce (the document is full-page cached) and React Router's streamed
  // hydration scripts can't be hashed, so inline scripts are allowed.
  scriptSrc: [
    "'unsafe-inline'",
    'https://www.youtube.com',
    'https://unpkg.com', // 3D model viewer
    '*.googletagmanager.com',
    '*.google-analytics.com',
  ],
} satisfies ContentSecurityPolicyDirectives;

export function getCspDirectives(
  request: Request,
  checkoutDomain?: string,
): ContentSecurityPolicyDirectives {
  const directives: ContentSecurityPolicyDirectives = { ...THEME_DIRECTIVES };
  if (checkoutDomain) {
    // A custom domain serves Shopify-hosted videos from /cdn/shop/videos/
    directives.mediaSrc = [
      ...(directives.mediaSrc ?? []),
      `https://${checkoutDomain.replace(/^https?:\/\//, '')}`,
    ];
  }
  const studio = getWeaverseStudioCspDirectives(request);
  for (const key of Object.keys(studio) as (keyof typeof studio)[]) {
    directives[key] = [...(directives[key] ?? []), ...(studio[key] ?? [])];
  }
  return directives;
}
```

`getWeaverseStudioCspDirectives(request)` (`@weaverse/hydrogen/react-router` 6.3+) returns nothing for live visitors. Inside Studio it adds the Studio origin to `connectSrc`, `fontSrc`, `frameAncestors` (which replaces Hydrogen's `'none'`), `imgSrc`, `scriptSrc` and `styleSrc`, plus `'unsafe-eval'` in design mode (the bridge rebuilds schema `condition` functions from strings). It adds them only for a trusted `weaverseHost`, so `?weaverseHost=<anything>` can't widen the policy. Don't add `*.weaverse.io`, `*.shopify.com` or `*.myshopify.com` by hand; merchant uploads on `cdn.shopify.com` are already a Hydrogen default.

`entry.server.tsx`:

```tsx
import { createContentSecurityPolicy } from '@shopify/hydrogen';
import { getCspDirectives } from '~/weaverse/csp';

const csp = createContentSecurityPolicy({
  nonce: false, // a nonce would make the document uncacheable
  shop: {
    checkoutDomain: context.env?.PUBLIC_CHECKOUT_DOMAIN || undefined,
    storeDomain: context.env?.PUBLIC_STORE_DOMAIN || undefined,
  },
  directives: getCspDirectives(request, context.env?.PUBLIC_CHECKOUT_DOMAIN || undefined),
});
// Report-only until the store is ready; then csp.applyResponseHeaders(responseHeaders)
responseHeaders.set('Content-Security-Policy-Report-Only', csp.header);
```

A store that wants a nonce CSP drops `nonce: false` and `'unsafe-inline'`, passes `csp.nonce` to `renderToReadableStream`, `ServerRouter`, `Scripts`, `ScrollRestoration` and `ShopifyScripts`, and loses Oxygen's full-page cache (`applyResponseHeaders` marks nonce documents `private, no-store`). The trade-offs are in the `shopify-hydrogen` skill, `references/05-storefront-contracts.md`.
