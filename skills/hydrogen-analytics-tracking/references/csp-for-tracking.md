# Content Security Policy for Tracking

CSP is the most common blocker for "my tracking works locally but not in prod". A wrong directive silently drops requests, the browser console fills with violations, and Tag Assistant reports an empty container.

## Hydrogen's CSP — where it lives

Hydrogen 2026.10 removed `createContentSecurityPolicy`, `NonceProvider` and `useNonce` from `@shopify/hydrogen`. Pilot ports them to `app/utils/csp.ts` with the same header semantics: `generateNonce()`, `createContentSecurityPolicy(nonce, directives, { checkoutDomain, storeDomain })` (returns the header string; each directive you pass extends the defaults, and the nonce goes into `scriptSrc`), `NonceProvider` and `useNonce()`. `entry.server.tsx` builds the header; in a Weaverse project the extra directives come from `getWeaverseCsp()` in `app/weaverse/csp.ts`:

```tsx
// app/entry.server.tsx (Pilot, trimmed)
import { createContentSecurityPolicy, generateNonce, NonceProvider } from "~/utils/csp";
import { getWeaverseCsp } from "~/weaverse/csp";

const nonce = generateNonce();
const header = createContentSecurityPolicy(nonce, getWeaverseCsp(request, context.env), {
  checkoutDomain: context.env?.PUBLIC_CHECKOUT_DOMAIN || context.env?.PUBLIC_STORE_DOMAIN,
  storeDomain: context.env?.PUBLIC_STORE_DOMAIN,
});
// render <NonceProvider value={nonce}><ServerRouter … nonce={nonce} /></NonceProvider>
```

The defaults already cover `'self'`, `cdn.shopify.com`, `monorail-edge.shopifysvc.com` and the checkout/store domains in `connectSrc`. Pass the same nonce to `<ShopifyScripts nonce={nonce}>` in `app/root.tsx`.

The default config is too restrictive for any storefront with ads/analytics. You'll need to allow at minimum:

- Google Tag Manager (`*.googletagmanager.com`)
- Google Analytics 4 (`*.google-analytics.com`, `analytics.google.com`)
- Google Ads (`*.googleadservices.com`, `*.googlesyndication.com`, `*.google.com`, `*.doubleclick.net`)
- Meta (`*.facebook.com`, `*.facebook.net` — but Meta CAPI is server-side so usually only the Pixel needs browser-side allowance)
- Shopify storefront APIs (`https://cdn.shopify.com`, `*.shopify.com`, `*.myshopify.com`, `*.shopifysvc.com`)
- Hotjar / Clarity / similar (`*.hotjar.com`, `static.hotjar.com`, `script.hotjar.com`, `wss://*.hotjar.com`)

## Minimum working config (Weaverse Hydrogen)

```ts
// app/weaverse/csp.ts
export function getWeaverseCsp(request: Request, env: { WEAVERSE_HOST?: string }) {
  const weaverseHost = new URL(request.url).searchParams.get("weaverseHost") ?? env.WEAVERSE_HOST;
  const weaverseHosts = ["*.weaverse.io", "*.shopify.com", "*.myshopify.com"];
  if (weaverseHost) weaverseHosts.push(weaverseHost);

  return {
    defaultSrc: [
      "data:",
      "*.youtube.com",
      "*.vimeo.com",
      "*.google.com",
      "*.google-analytics.com",
      "*.googletagmanager.com",
      "*.googleadservices.com",
      "*.googlesyndication.com",
      ...weaverseHosts,
    ],
    scriptSrc: [
      // CSP3 strict-dynamic: trust whatever the nonced root scripts
      // (gtm.js, our inline blocks) dynamically load. GTM Custom HTML tags
      // (Hotjar, AliReviews) cannot carry the page nonce themselves but
      // they're loaded by gtm.js, so strict-dynamic trusts them.
      //
      // When strict-dynamic is set, domain allowlists and 'unsafe-inline'
      // are IGNORED by CSP3-compliant browsers. The domain entries below
      // remain as fallback for older browsers.
      "'strict-dynamic'",
      "https://cdn.shopify.com",
      "*.googletagmanager.com",
      "*.google-analytics.com",
      "*.googleadservices.com",
      "*.googlesyndication.com",
      "*.google.com",
      "*.doubleclick.net",
      "https://static.hotjar.com",
      "https://script.hotjar.com",
      "'unsafe-inline'",  // fallback for non-strict-dynamic browsers
      "'unsafe-eval'",
    ],
    connectSrc: [
      "vimeo.com",
      "*.google-analytics.com",
      "analytics.google.com",
      "*.googletagmanager.com",
      "*.googleadservices.com",
      "*.googlesyndication.com",
      "*.google.com",
      "*.doubleclick.net",
      "*.hotjar.com",
      "content.hotjar.io",
      "wss://*.hotjar.com",
      "*.shopifysvc.com",
      // cdn.shopify.com, monorail-edge and the checkout/store domains come
      // from createContentSecurityPolicy()'s defaults (app/utils/csp.ts)
      ...weaverseHosts,
    ],
    styleSrc: [...weaverseHosts, "https://static.hotjar.com"],
  };
}
```

## Common CSP failures and what they mean

| Console warning | What's broken | Fix |
|---|---|---|
| `Refused to load the script 'https://pagead2.googlesyndication.com/...'` | Google Ads conversion measurement | Add `*.googlesyndication.com` to `scriptSrc` AND `connectSrc` |
| `Refused to connect to 'https://www.googleadservices.com/...'` | Google Ads server collect | Add `*.googleadservices.com` to `connectSrc` |
| `Refused to load the script 'https://www.googletagmanager.com/gtm.js'` | GTM itself | Add `*.googletagmanager.com` to `scriptSrc` |
| `Refused to connect to 'https://your-shop.myshopify.com/api/...'` | Shopify Storefront API | Add the bare myshopify domain to `connectSrc` (with `https://` prefix) |
| `Refused to connect to 'https://.your-domain.com/...'` (malformed URL) | Storefront web component `<shopify-store store-domain>` missing the `https://` prefix on `PUBLIC_STORE_DOMAIN` | Normalize the prop: `store-domain={domain.startsWith("http") ? domain : "https://" + domain}` |

## strict-dynamic vs domain allowlist

The CSP3 `'strict-dynamic'` source expression says: *trust any script loaded by a script we already trust (because it has the page nonce or matches a hash)*. When set, it **disables** domain-based allowlists in `script-src`.

### Why strict-dynamic is the right answer for GTM

GTM Custom HTML tags (Hotjar pixel snippet, AliReviews widget, third-party affiliate scripts) inject `<script>` blocks at runtime via `document.write` or DOM appendChild. These scripts **cannot carry the page nonce** because GTM doesn't know what the nonce is. With a nonce-only CSP they'd be blocked.

Solutions:

1. **`'strict-dynamic'`** — gtm.js itself has the nonce → strict-dynamic trusts everything it loads → Custom HTML tags fire correctly. ✅ recommended.

2. **`'unsafe-inline'` without nonce** — works but disables CSP's main protection. Per CSP3 spec, when both a nonce AND `'unsafe-inline'` are present, the nonce wins and `'unsafe-inline'` is IGNORED. So you can't just "add both" — the browser ignores unsafe-inline.

3. **Hash list** — generate a SHA-256 hash for each inline script your GTM fires. Maintenance hell — every script update breaks CSP until you regenerate the hash.

4. **Drop CSP for inline scripts** — works, eliminates the protection. Compliance teams will be unhappy.

### Loading gtm.js with a nonce

```tsx
// app/root.tsx
import { useNonce } from "~/utils/csp";

const nonce = useNonce();

return (
  <head>
    {/* Inline bootstrap MUST run first, synchronously, nonced */}
    <script
      nonce={nonce}
      dangerouslySetInnerHTML={{
        __html: `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('consent', 'default', { /* defaults */ });
          window.dataLayer.push({'gtm.start': Date.now(), event: 'gtm.js'});
        `,
      }}
    />

    {/* gtm.js external — nonced, async */}
    {googleGtmID && (
      <script
        src={`https://www.googletagmanager.com/gtm.js?id=${googleGtmID}`}
        async
        nonce={nonce}
      />
    )}
  </head>
);
```

**Do NOT inject GTM with a nonce-less, post-hydration script loader** (classic Hydrogen's `<Script waitForHydration>` was the usual culprit). Without the nonce, `'strict-dynamic'` can't trust gtm.js, and a post-hydration injection hides GTM from Tag Assistant standalone scans (which detect GTM by reading the initial HTML).

## Report-only vs enforced CSP

- **`Content-Security-Policy-Report-Only`** — violations are logged in the console and reported to your endpoint, but nothing is actually blocked. Use this during initial rollout while you iron out the directive list.
- **`Content-Security-Policy`** — enforced. Violating scripts are blocked.

`createContentSecurityPolicy()` (`app/utils/csp.ts`) returns the header but doesn't set the response header — you choose which to use in `entry.server.tsx`. Pilot ships report-only:

```ts
// During rollout — report only, nothing blocked
responseHeaders.set("Content-Security-Policy-Report-Only", header);

// After 1 week of clean reports — enforce
responseHeaders.set("Content-Security-Policy", header);
```

Graduate from report-only to enforced only after a sustained period (a week+) of zero unexpected violations in production logs.

## CSP for the Shopify Storefront Web Components

The new (2025+) Shopify Storefront Web Components (`<shopify-store>`, `<shopify-account>`, `<shopify-product>`, etc.) load from `https://cdn.shopify.com/storefront/web-components.js` and connect to your store's myshopify domain.

```
script-src:  https://cdn.shopify.com (already covered above)
connect-src: https://{shop}.myshopify.com  (e.g. https://your-shop.myshopify.com)
```

**Important:** the `<shopify-store store-domain>` attribute requires the **full URL with protocol**. Shopify Oxygen injects `PUBLIC_STORE_DOMAIN` as a **bare hostname** (no `https://`). Normalize before passing:

```tsx
const storeDomainUrl = publicStoreDomain
  ? publicStoreDomain.startsWith("http")
    ? publicStoreDomain
    : `https://${publicStoreDomain}`
  : undefined;

if (!storeDomainUrl) return <UserIconPlaceholder />;

return (
  <shopify-store store-domain={storeDomainUrl} public-access-token={publicAccessToken}>
    <shopify-account sign-in-url="/account/login" />
  </shopify-store>
);
```

Without the protocol the bundle constructs a malformed URL like `https://.your-domain.com/api/unstable/graphql.json` → DNS fails with `ERR_NAME_NOT_RESOLVED` + CSP violation on the `connect-src` directive.

Storefront Web Components ship as **multiple feature bundles** — not an
umbrella/per-component pair. Verified by fetching each bundle and listing
the `customElements.define` calls (the registration uses a template-literal
pattern, so plain literal-string grep misses it — search instead for
`customElements.define\(\`shopify-${t}\`` then trace the helper that takes
the `t` argument):

| Bundle URL | Registers | Size |
|---|---|---|
| `cdn.shopify.com/storefront/web-components.js` | `shopify-store`, `shopify-cart`, `shopify-catalog`, `shopify-context`, `shopify-data`, `shopify-list-context`, `shopify-media`, `shopify-money`, `shopify-variant-selector` | ~92 KB |
| `cdn.shopify.com/storefront/web-components/account.js` | `shopify-account`, `shopify-customer-account-data`, `shopify-render`, `shopify-element-wrapper` | ~31 KB |

Key trap: `account.js` does NOT synchronously register `<shopify-store>`. It
dynamic-imports a chunked `./account/store-*.js`, but the chunk arrives
**after** `<shopify-account>`'s `connectedCallback` runs, hitting a race that
emits the console warning:

```
[shopify-account] <shopify-store> custom element is not registered.
  Ensure the storefront-components bundle is loaded so <shopify-account>
  can fetch data.
```

When using `<shopify-account>` nested inside `<shopify-store>` (the pattern
in Shopify's getting-started docs), load BOTH bundles:

```tsx
<head>
  {/* registers shopify-store, shopify-cart, shopify-catalog, ... */}
  <script
    type="module"
    src="https://cdn.shopify.com/storefront/web-components.js"
    defer
    nonce={nonce}
  />
  {/* registers shopify-account; uses already-defined shopify-store */}
  <script
    type="module"
    src="https://cdn.shopify.com/storefront/web-components/account.js"
    defer
    nonce={nonce}
  />
</head>
```

**Use `defer`, not `async`.** Module scripts are deferred by default, and
the two scripts must execute in document order — if `account.js` runs
before `web-components.js`, the same warning fires. `async` breaks that
guarantee.

If you only need `<shopify-store>` (e.g. data fetching, no account widget),
`web-components.js` alone is sufficient. If you only need `<shopify-account>`
standalone without a `<shopify-store>` parent (rare, but Pilot does this for
a sign-in icon that uses Shopify's hosted account flow), `account.js` alone
works but emits the console warning per page load.
