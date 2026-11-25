# Content Security Policy for Tracking

CSP is the most common blocker for "my tracking works locally but not in prod". A wrong directive silently drops requests, the browser console fills with violations, and Tag Assistant reports an empty container.

## Hydrogen's CSP — where it lives

`@shopify/hydrogen` 2026.10.3 ships `createContentSecurityPolicy({ shop, nonce, directives })` again (2026.10.0-2 didn't, and some projects carried a local `app/utils/csp.ts` port; delete it when you upgrade). It returns `{ header, nonce, applyResponseHeaders(headers) }`; each array under `directives` extends Hydrogen's defaults. There is no `NonceProvider` or `useNonce`. The full API and the three modes are in the `shopify-hydrogen` skill, [`05-storefront-contracts.md`](../../shopify-hydrogen/references/05-storefront-contracts.md#content-security-policy).

Pilot builds a **nonce-free** policy in `entry.server.tsx`, so documents stay eligible for Oxygen's full-page cache, and sends it report-only:

```tsx
// app/entry.server.tsx (Pilot, trimmed)
import { createContentSecurityPolicy } from "@shopify/hydrogen";
import { getCspDirectives } from "~/weaverse/csp";

const csp = createContentSecurityPolicy({
  nonce: false, // a nonce would make the HTML uncacheable
  shop: {
    checkoutDomain: context.env?.PUBLIC_CHECKOUT_DOMAIN || undefined,
    storeDomain: context.env?.PUBLIC_STORE_DOMAIN || undefined,
  },
  directives: getCspDirectives(request, context.env?.PUBLIC_CHECKOUT_DOMAIN || undefined),
});
// ... render <ServerRouter context={reactRouterContext} url={request.url} />
responseHeaders.set("Content-Security-Policy-Report-Only", csp.header);
```

Hydrogen's defaults cover `'self'`, `cdn.shopify.com`, inline styles, `data:` images, Shopify's frame and connect origins (`*.shopifysvc.com` included) and the store and checkout domains. They allow **no** inline scripts, set `default-src 'self'`, and define images, media, fonts and frames separately, so a vendor added only to `defaultSrc` is still blocked for those types.

The defaults are too restrictive for any storefront with ads/analytics. You'll need to allow at minimum:

- Google Tag Manager (`*.googletagmanager.com`)
- Google Analytics 4 (`*.google-analytics.com`, `analytics.google.com`)
- Google Ads (`*.googleadservices.com`, `*.googlesyndication.com`, `*.google.com`, `*.doubleclick.net`)
- Meta (`*.facebook.com`, `*.facebook.net` — but Meta CAPI is server-side so usually only the Pixel needs browser-side allowance)
- Hotjar / Clarity / similar (`*.hotjar.com`, `static.hotjar.com`, `script.hotjar.com`, `wss://*.hotjar.com`)
- Inline scripts: `'unsafe-inline'` in nonce-free mode (the Consent Mode bootstrap, GTM Custom HTML tags, React Router's streamed hydration scripts)

## Minimum working config (Weaverse Hydrogen, nonce-free)

Pilot's `app/weaverse/csp.ts` extended with the ad and analytics vendors. Weaverse Studio's origins come from the SDK, only inside Studio:

```ts
// app/weaverse/csp.ts
import type { ContentSecurityPolicyDirectives } from "@shopify/hydrogen";
import { getWeaverseStudioCspDirectives } from "@weaverse/hydrogen/react-router";

const VENDOR_SOURCES = [
  "data:",
  "*.youtube.com",
  "*.vimeo.com",
  "*.google.com",
  "*.google-analytics.com",
  "*.googletagmanager.com",
  "*.googleadservices.com",
  "*.googlesyndication.com",
  "*.doubleclick.net",
  "*.facebook.com",
];

const THEME_DIRECTIVES = {
  // Hydrogen sets these apart from default-src, so extend each one
  defaultSrc: VENDOR_SOURCES,
  imgSrc: VENDOR_SOURCES,
  mediaSrc: VENDOR_SOURCES,
  frameSrc: VENDOR_SOURCES,
  scriptSrc: [
    // No nonce in the document, so inline scripts need 'unsafe-inline'.
    // Don't add 'strict-dynamic', hashes or getShopifyScriptHashes() here:
    // each one makes browsers ignore 'unsafe-inline'.
    "'unsafe-inline'",
    "*.googletagmanager.com",
    "*.google-analytics.com",
    "*.googleadservices.com",
    "*.googlesyndication.com",
    "*.google.com",
    "*.doubleclick.net",
    "https://connect.facebook.net",
    "https://static.hotjar.com",
    "https://script.hotjar.com",
  ],
  connectSrc: [
    "*.google-analytics.com",
    "analytics.google.com",
    "*.googletagmanager.com",
    "*.googleadservices.com",
    "*.googlesyndication.com",
    "*.google.com",
    "*.doubleclick.net",
    "*.facebook.com",
    "*.hotjar.com",
    "content.hotjar.io",
    "wss://*.hotjar.com",
    // cdn.shopify.com, *.shopifysvc.com and the shop/checkout domains are Hydrogen defaults
  ],
  styleSrc: ["https://static.hotjar.com"],
  fontSrc: ["data:"],
} satisfies ContentSecurityPolicyDirectives;

export function getCspDirectives(
  request: Request,
  checkoutDomain?: string,
): ContentSecurityPolicyDirectives {
  const directives: ContentSecurityPolicyDirectives = { ...THEME_DIRECTIVES };
  if (checkoutDomain) {
    // Shopify serves a custom domain's video uploads from that domain
    directives.mediaSrc = [
      ...(directives.mediaSrc ?? []),
      `https://${checkoutDomain.replace(/^https?:\/\//, "")}`,
    ];
  }
  // Studio origins (and 'unsafe-eval' in design mode) only for a trusted
  // weaverseHost; a crafted ?weaverseHost= can't widen the policy.
  const studio = getWeaverseStudioCspDirectives(request);
  for (const key of Object.keys(studio) as (keyof typeof studio)[]) {
    directives[key] = [...(directives[key] ?? []), ...(studio[key] ?? [])];
  }
  return directives;
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

## Nonce-free vs nonce + strict-dynamic

| | Nonce-free (Pilot default) | Nonce + `'strict-dynamic'` |
|---|---|---|
| `createContentSecurityPolicy` | `nonce: false`, `scriptSrc: ["'unsafe-inline'", ...hosts]` | default (a fresh nonce per response) |
| Oxygen full-page cache | Works | Lost: `csp.applyResponseHeaders()` marks the document `private, no-store` |
| Inline scripts (Consent Mode bootstrap, GTM Custom HTML, React Router hydration) | Allowed by `'unsafe-inline'` | Only nonced ones, plus whatever nonced scripts load (`'strict-dynamic'`) |
| External script hosts | Domain allowlist enforced | Domain allowlist ignored by CSP3 browsers |
| GTM loaded after hydration | Fine (Pilot's intent-based loader) | Must set `script.nonce` on the injected script |

The CSP3 `'strict-dynamic'` source expression says: *trust any script loaded by a script we already trust (because it has the page nonce or matches a hash)*. When set, it **disables** domain-based allowlists and `'unsafe-inline'` in `script-src`.

### Why strict-dynamic is the answer for GTM under a nonce CSP

GTM Custom HTML tags (Hotjar pixel snippet, AliReviews widget, third-party affiliate scripts) inject `<script>` blocks at runtime via `document.write` or DOM appendChild. These scripts **cannot carry the page nonce** because GTM doesn't know what the nonce is. With a nonce-only CSP they'd be blocked.

Options once the document has a nonce:

1. **`'strict-dynamic'`** — gtm.js itself has the nonce → strict-dynamic trusts everything it loads → Custom HTML tags fire correctly. ✅ recommended.

2. **`'unsafe-inline'` next to the nonce** — doesn't work. Per CSP3 spec, when a nonce (or hash) AND `'unsafe-inline'` are both present, the nonce wins and `'unsafe-inline'` is IGNORED. To rely on `'unsafe-inline'`, drop the nonce entirely (Pilot's mode).

3. **Hash list** — `getShopifyScriptHashes()` authorizes only Hydrogen's own inline bootstraps. Every other inline script (GTM tags, React Router's per-response hydration scripts) would need its own hash, which isn't possible for streamed React Router output. Not viable for Pilot.

4. **Drop CSP for inline scripts** — works, eliminates the protection. Compliance teams will be unhappy.

### Loading gtm.js with a nonce (nonce mode only)

```tsx
// app/root.tsx — `nonce` is csp.nonce from entry.server.tsx, passed through
// an app-owned React context (Hydrogen 2026.10 has no useNonce())
const nonce = useCspNonce();

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

In nonce mode also pass `csp.nonce` to `renderToReadableStream`, `ServerRouter`, `<Scripts>`, `<ScrollRestoration>` and `<ShopifyScripts nonce>`, and call `csp.applyResponseHeaders(responseHeaders)`. **Do NOT inject GTM with a nonce-less, post-hydration script loader** in this mode (classic Hydrogen's `<Script waitForHydration>` was the usual culprit): `'strict-dynamic'` can't trust it.

## Report-only vs enforced CSP

- **`Content-Security-Policy-Report-Only`** — violations are logged in the console and reported to your endpoint, but nothing is actually blocked. Use this during initial rollout while you iron out the directive list.
- **`Content-Security-Policy`** — enforced. Violating scripts are blocked.

`csp.applyResponseHeaders(headers)` always sets the **enforcing** header. Pilot ships report-only and leaves enforcement to each store:

```ts
// During rollout — report only, nothing blocked
responseHeaders.set("Content-Security-Policy-Report-Only", csp.header);

// After 1 week of clean reports — enforce
csp.applyResponseHeaders(responseHeaders);
```

Graduate from report-only to enforced only after a sustained period (a week+) of zero unexpected violations in production logs. Check inside Weaverse Studio too (design and preview mode), where the SDK adds the Studio origin.

## CSP for the Shopify Storefront Web Components

The new (2025+) Shopify Storefront Web Components (`<shopify-store>`, `<shopify-account>`, `<shopify-product>`, etc.) load from `https://cdn.shopify.com/storefront/web-components.js` and connect to your store's myshopify domain.

```
script-src:  https://cdn.shopify.com (a Hydrogen default)
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
  />
  {/* registers shopify-account; uses already-defined shopify-store */}
  <script
    type="module"
    src="https://cdn.shopify.com/storefront/web-components/account.js"
    defer
  />
</head>
```

**Use `defer`, not `async`.** (Add `nonce={nonce}` to both in nonce mode.) Module scripts are deferred by default, and
the two scripts must execute in document order — if `account.js` runs
before `web-components.js`, the same warning fires. `async` breaks that
guarantee.

If you only need `<shopify-store>` (e.g. data fetching, no account widget),
`web-components.js` alone is sufficient. If you only need `<shopify-account>`
standalone without a `<shopify-store>` parent (rare, but Pilot does this for
a sign-in icon that uses Shopify's hosted account flow), `account.js` alone
works but emits the console warning per page load.
