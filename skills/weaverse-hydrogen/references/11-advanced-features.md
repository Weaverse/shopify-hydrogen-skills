# Advanced Features

> Localization, custom routing, templates, global sections, data connectors, and CSP.

## Data Connectors

Data connectors let merchants bind dynamic data (product titles, prices, etc.) to component settings in Weaverse Studio — no code required.

### How It Works

1. Data comes from React Router **loader functions** (route loaders)
2. Studio shows a database icon (🔗) above text, textarea, and richtext fields
3. Merchants click to browse and select data paths
4. Template syntax `{{path}}` is generated automatically

### Template Syntax

```
{{root.shop.name}}                              → Shop name
{{routes/product.product.title}}                → Product title
{{routes/product.product.priceRange.minVariantPrice.amount}}  → Price
{{routes/collection.collection.title}}          → Collection title
{{current.product.description}}                 → Current page product
```

### Data Source Patterns

| Pattern | Source | Example |
|---------|--------|---------|
| `root.*` | Root loader (global) | `{{root.shop.name}}` |
| `routes/[route].*` | Specific route loader | `{{routes/product.product.title}}` |
| `current.*` | Current page context | `{{current.product.price}}` |

### Adding Custom Data Sources

Any data returned from a route loader automatically appears in Studio:

```tsx
// app/routes/($locale).products.$handle.tsx
export async function loader({ params, context }: LoaderFunctionArgs) {
  let product = await getProduct(params.handle);

  // Custom API data → automatically available in Studio
  let reviews = await fetch(`https://reviews-api.com/product/${params.handle}`)
    .then(res => res.json());

  return { product, reviews };
}
// Merchants can now bind {{routes/product.reviews.average}}
```

### Using in Schema Defaults

```tsx
export let schema = createSchema({
  type: 'product-info',
  title: 'Product Info',
  settings: [
    {
      group: 'Content',
      inputs: [
        {
          type: 'text',
          name: 'title',
          label: 'Title',
          defaultValue: '{{routes/product.product.title}}',
        },
        {
          type: 'text',
          name: 'price',
          label: 'Price',
          defaultValue: '${{routes/product.product.priceRange.minVariantPrice.amount}}',
        },
      ],
    },
  ],
});
```

---

## Localization (i18n)

Weaverse supports multi-locale storefronts via Shopify Markets.

### Locale in loadPage()

```tsx
// Route loader
export async function loader({ context, params }: LoaderFunctionArgs) {
  let locale = params.locale ? `${params.locale.toLowerCase()}` : 'en-us';

  let weaverseData = await context.weaverse.loadPage({
    type: 'PRODUCT',
    handle: params.handle,
    locale,  // e.g., 'sv-se', 'fr-ca'
  });

  return { weaverseData };
}
```

### Locale Format

- Format: `language-country` (lowercase, hyphen-separated)
- Language: ISO 639-1 (2 letters) — `en`, `fr`, `de`, `sv`
- Country: ISO 3166-1 alpha-2 (2 letters) — `us`, `ca`, `de`, `se`
- Examples: `en-us`, `fr-ca`, `sv-se`, `de-de`

### Fallback Behavior

If the specified locale doesn't have content configured in Weaverse Studio, it falls back to `en-us` (default locale).

### Route Structure

```
app/routes/
├── ($locale)._index.tsx              # Homepage
├── ($locale).products.$handle.tsx     # Product page
├── ($locale).collections.$handle.tsx  # Collection page
└── ($locale).pages.$handle.tsx        # Custom page
```

---

## Custom Routing

Create custom URL structures mapped to Weaverse page types.

### Custom Page Type

```tsx
// app/routes/($locale).custom.$slug.tsx
export async function loader({ context, params }: LoaderFunctionArgs) {
  let weaverseData = await context.weaverse.loadPage({
    type: 'CUSTOM',
    handle: params.slug,
  });

  return { weaverseData };
}

export default function CustomPage() {
  return <WeaverseHydrogenRoot />;
}
```

### Multiple Templates per Type

Different products can use different templates:

```tsx
// app/routes/($locale).products.$handle.tsx
export async function loader({ context, params }: LoaderFunctionArgs) {
  let { product } = await context.storefront.query(PRODUCT_QUERY, {
    variables: { handle: params.handle },
  });

  // Load Weaverse data — Weaverse Studio handles template assignment
  let weaverseData = await context.weaverse.loadPage({
    type: 'PRODUCT',
    handle: params.handle,
  });

  return { product, weaverseData };
}
```

In Weaverse Studio, merchants assign templates to specific products/collections.

---

## Custom Templates

Weaverse supports multiple templates per page type:

1. Create a template in Weaverse Studio
2. Design sections for that template
3. Assign the template to specific products/collections/pages
4. The `loadPage()` call automatically resolves the correct template

This is similar to Shopify Liquid's template system but built for Hydrogen.

---

## Global Sections

Reusable content blocks that appear across multiple pages.

### Creating in Studio

1. Create a section
2. Select it → click "Save as Global Section" in toolbar
3. Name and save

### Using Global Sections

1. Open Global Sections modal (top-left of page editor)
2. Select desired global section
3. Click "Add to Page"

**Note:** Only one global section per page.

### Code Implications

No special code needed — global sections use the same component system. Changes to a global section automatically propagate to all pages using it.

---

## Content Security Policy (CSP)

Weaverse Studio requires specific CSP directives for the live preview to work.

### CSP Helper

```tsx
// app/weaverse/csp.ts
export function getWeaverseCsp(request: Request, context: AppLoadContext) {
  return {
    connectSrc: [
      "'self'",
      'https://weaverse.io',
      'https://studio.weaverse.io',
      'https://*.weaverse.io',
    ],
    imgSrc: [
      "'self'",
      'https://cdn.shopify.com',
      'https://ucarecdn.com',
    ],
    frameSrc: [
      'https://studio.weaverse.io',
    ],
    scriptSrc: [
      "'self'",
      'https://cdn.weaverse.io',
    ],
  };
}
```

### Integration in entry.server.tsx

```tsx
import { createContentSecurityPolicy } from '@shopify/hydrogen';
import { getWeaverseCsp } from '~/weaverse/csp';

const { nonce, header, NonceProvider } = createContentSecurityPolicy({
  ...getWeaverseCsp(request, context),
  shop: {
    checkoutDomain: context.env?.PUBLIC_CHECKOUT_DOMAIN,
    storeDomain: context.env?.PUBLIC_STORE_DOMAIN,
  },
});
```

---

## Multi-Project Architecture

Use different Weaverse projects for different purposes: multi-market, multi-brand, and A/B testing. Each project is an independent theme/content set sharing one Shopify backend; route traffic by setting `projectId` (client-level function or per-route `loadPage({ projectId })`).

### Domain-Based Selection

```tsx
export async function loader({ request, context }: LoaderFunctionArgs) {
  let url = new URL(request.url);
  let projectId = url.origin === 'https://store.se'
    ? 'project-sweden'
    : 'project-default';

  let weaverseData = await context.weaverse.loadPage({
    type: 'INDEX',
    projectId,
  });

  return { weaverseData };
}
```

### A/B Testing — `@weaverse/experiments`

For experiments, use the optional [`@weaverse/experiments`](https://www.npmjs.com/package/@weaverse/experiments) package rather than hand-rolling cookie logic. It assigns each visitor to a variant **deterministically** (sticky without a per-experiment cookie — no flicker) and maps the variant to a `projectId`. The engine + `/server` adapter are framework-agnostic (web `Request`/`Headers`/`crypto`, zero deps); `/react` is an optional `react` peer.

```tsx
// app/lib/weaverse/weaverse.server.ts
import { getExperiments } from '@weaverse/experiments/server';
import { WeaverseClient } from '@weaverse/hydrogen';

export function createWeaverseClient(args: CreateWeaverseClientArgs) {
  let { hydrogenContext, request, cache, themeSchema, components } = args;

  // Deterministic, sticky assignment — no manual cookie handling.
  let { projectId, assignments, headers } = getExperiments(request, {
    experiments: [
      {
        id: 'green-theme-test',
        variants: [
          { id: 'control', projectId: args.env.WEAVERSE_PROJECT_CONTROL },
          { id: 'b', weight: 0.2, projectId: args.env.WEAVERSE_PROJECT_VARIANT_B }, // ~17%
        ],
      },
    ],
  });

  let weaverse = new WeaverseClient({
    ...hydrogenContext, request, cache, themeSchema, components,
    projectId, // winning variant's project
  });

  return { weaverse, assignments, headers }; // merge `headers` into the response
}
```

**Analytics:** pass `assignments` to `<Analytics.Provider customData>` so every event is segmented by variant, and fire exposure via `useAnalytics().publish('custom_experiment_viewed', …)` gated on `canTrack()`. See the `hydrogen-analytics-tracking` skill → "Experiment exposure".

> **Caching caveat (FPC):** Variant choice depends on the `_wv_vid` cookie, but Oxygen/CDN full-page caching keys on the URL and skips the worker on a cache hit — and a returning visitor's response carries no `Set-Cookie`. A cached page can therefore pin one variant for *every* visitor and corrupt the split. On experiment-driven routes, disable full-page caching or add `_wv_vid` to the cache key (`Vary`).

### Use Cases

- **Multi-market:** Different designs per country/locale (domain/locale switch above)
- **A/B testing:** `@weaverse/experiments` — deterministic variant → `projectId` mapping
- **Multi-brand:** Different projects per brand on shared infrastructure

See the [Multi-Project Architecture Guide](https://docs.weaverse.io/guides/multi-project-architecture) for full details.

---


## Third-Party Integration

### Judge.me Reviews

```tsx
export let loader = async ({ weaverse, data }: ComponentLoaderArgs) => {
  let { fetchWithCache, env } = weaverse;

  return await fetchWithCache(
    `https://judge.me/api/v1/reviews?shop_domain=${env.PUBLIC_STORE_DOMAIN}`,
    {
      headers: { 'Authorization': `Bearer ${env.JUDGEME_PRIVATE_API_TOKEN}` },
    }
  );
};
```

### Google GTM

Add to your root layout:

```tsx
function Layout({ children }: { children: React.ReactNode }) {
  let { publicGoogleGtmId } = useThemeSettings();

  return (
    <html>
      <head>
        {publicGoogleGtmId && (
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(w,d,s,l,i){...})(window,document,'script','dataLayer','${publicGoogleGtmId}');`,
            }}
          />
        )}
      </head>
      <body>{children}</body>
    </html>
  );
}
```

### Shopify Inbox

Add the Shopify Inbox chat widget via theme settings and include it in your layout.

```tsx
// In theme schema (schema.server.ts)
{
  type: 'text',
  name: 'shopifyInboxShopId',
  label: 'Shopify Inbox Shop ID',
  helpText: 'Found in Shopify admin → Inbox → Settings',
}
```
