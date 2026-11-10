# Hydrogen Fundamentals

> Shopify Hydrogen 2026.10 essentials for Weaverse theme development.

## What is Hydrogen 2026.10?

Hydrogen is Shopify's toolkit for custom headless storefronts. Since 2026.10 it is a **library of server handlers and client stores**, not a framework: the app's `server.ts` composes the request lifecycle and calls into Hydrogen where it needs Shopify (see [01-project-structure.md](01-project-structure.md)). React Router 7 renders the app.

**Key packages and entries:**
- `@shopify/hydrogen` — `gql`, `Cache`, `createShopifyRequestContext`, `createStorefrontClient`, `handleShopifyRoutes`, `handleShopifyRedirects`, `createCartServerHandlers`, `flattenConnection`, ...
- `@shopify/hydrogen/react` — client stores and components: `createCartComponents`, `createProductComponents`, `ShopifyScripts`, `useCartAnalytics`, `ShopPayButton`
- `@shopify/hydrogen/customer-account` — `createCustomerSession`, `createCustomerAccountServerHandlers`, `createCustomerAccountClient`, `gql` for Customer Account documents
- `@shopify/hydrogen/vite` — `localHttps()`; `oxygen()` comes from `@shopify/mini-oxygen/vite`

Gone in 2026.10: `createHydrogenContext`, `storefront.query()`/`mutate()`, `CartForm`, `Analytics.*`, `Image`, `Money`, `Pagination`, `getPaginationVariables`, `getSeoMeta`, the CSP helpers, `@shopify/remix-oxygen`, the `hydrogen()` Vite plugin and GraphQL codegen. `@shopify/hydrogen` 2026.10 also ships agent skills in `node_modules/@shopify/hydrogen/skills/`.

## Storefront API

### Query Pattern

```tsx
// In route loaders
import { gql, type StorefrontApi } from '@shopify/hydrogen';
import type { LoaderFunctionArgs } from 'react-router';
import { CACHE_DEFAULT } from '~/utils/cache';
import { unwrapStorefront } from '~/utils/storefront';

const PRODUCTS_QUERY = gql(`
  query Products($first: Int!, $country: CountryCode, $language: LanguageCode)
  @inContext(country: $country, language: $language) {
    products(first: $first) {
      nodes {
        id
        title
        handle
        priceRange { minVariantPrice { amount currencyCode } }
        featuredImage { url altText width height }
      }
    }
  }
`);

export type ProductsQuery = StorefrontApi.ResultOf<typeof PRODUCTS_QUERY>;

export async function loader({ context }: LoaderFunctionArgs) {
  const { products } = await context.storefront
    .graphql(PRODUCTS_QUERY, { variables: { first: 10 }, cache: CACHE_DEFAULT })
    .then(unwrapStorefront);
  return { products };
}
```

- `graphql()` returns `{ data, errors, headers }`; it never throws on GraphQL errors. `unwrapStorefront` is Pilot's helper that throws like classic `query()` did.
- Always pass `cache`: there is no default cache.
- `$country`/`$language` are filled from the request; don't pass them.
- Fragments go in `gql()`'s second argument. `npm run typecheck` validates every document with `hydrogen gql check --fail-on-warn`.

Mutations use the same `graphql()` call with a `gql()` mutation document (and `CACHE_NONE` or no cache).

### In Weaverse Component Loaders

```tsx
import type { WeaverseComponentLoaderArgs } from '@weaverse/hydrogen/react-router';
import { CACHE_DEFAULT } from '~/utils/cache';
import { unwrapStorefront } from '~/utils/storefront';

type LoaderData = { productHandle: string };

export let loader = async ({ weaverse, data }: WeaverseComponentLoaderArgs<LoaderData>) => {
  if (!data?.productHandle) return null;
  return unwrapStorefront(
    await weaverse.storefront.graphql(PRODUCT_QUERY, {
      variables: { handle: data.productHandle },
      cache: CACHE_DEFAULT,
    }),
  );
};
```

## Cart

`context.cart` and `CartForm` are gone. The cart is a server handler at `/api/cart` plus a client store:

```ts
// app/.server/cart.ts — registered in handleShopifyRoutes() in server.ts
import { createCartServerHandlers, gql } from '@shopify/hydrogen';

const CART_FRAGMENT = gql(`
  fragment CartFragment on Cart {
    buyerIdentity { countryCode }
    # ... the extra fields your cart UI renders
  }
`);

export const cartHandlers = createCartServerHandlers({ fragment: CART_FRAGMENT });
```

```ts
// app/components/cart/cart-store.ts
import type { CartDataFromHandlers } from '@shopify/hydrogen';
import { createCartComponents } from '@shopify/hydrogen/react';
import type { cartHandlers } from '~/.server/cart';

export type CartData = CartDataFromHandlers<typeof cartHandlers>;
export const { CartProvider, useCart, useCartActions, useCartForm } =
  createCartComponents<typeof cartHandlers>();
```

Render `<CartProvider>` once in `root.tsx` (Pilot passes no server `initialData`, so documents stay anonymous and full-page cacheable). Forms post to `/api/cart` and work without JavaScript:

```tsx
function RemoveButton({ lineId }: { lineId: string }) {
  const { formProps, register } = useCartForm();
  return (
    <form {...formProps()}>
      <input type="hidden" {...register('lineId', { value: lineId })} />
      <button type="submit" {...register('remove')}>Remove</button>
    </form>
  );
}
```

Add to cart goes through the product form store (`createProductComponents()` → `ProductProvider`, `useProduct`, `useProductForm`). See Pilot's `app/components/product/product-form.tsx` and the `shopify-hydrogen` skill.

## Customer Accounts

Hydrogen's handlers own the OAuth paths `/account/login`, `/account/authorize`, `/account/refresh` and `/account/logout` (`createCustomerAccountServerHandlers` from `@shopify/hydrogen/customer-account`, registered in `server.ts`). Pilot wraps the token and client in `context.customerAccount`:

```tsx
export async function loader({ context }: LoaderFunctionArgs) {
  // Redirects to /account/login when signed out
  await context.customerAccount.handleAuthStatus();
  const { data } = await context.customerAccount.graphql(CUSTOMER_DETAILS_QUERY, { variables: {} });
  return { customer: data?.customer };
}
```

Customer Account documents use `gql` from `@shopify/hydrogen/customer-account`. Link to the handler paths with a plain `<a>`/`<form>`, never `<Link>`/`<Form>`. Local login needs HTTPS (`npm run dev:https`).

## Internationalization (i18n)

Market localization crosses request parsing, Hydrogen context, Weaverse,
navigation, cart, accounts, SEO, and production configuration. Use the
[`hydrogen-markets-localization`](../../hydrogen-markets-localization/SKILL.md)
skill for the canonical end-to-end procedure and verification matrix.

Do not accept arbitrary locale-shaped route segments or maintain a second
locale map in this reference. Derive the request's `i18n` from the storefront's
merchant-specific market allowlist and pass it to `createShopifyRequestContext()`.
`storefront.graphql()` then fills `$country`/`$language` from it; don't pass them
in `variables`. When the market's Shopify `LanguageCode` differs from the locale
Weaverse keys translations by, pass the market to `WeaverseClient` as `locale`
(`@weaverse/hydrogen` 6.1+).

## Removed Components and Their Replacements

Hydrogen 2026.10 removed the classic UI helpers. Pilot ports them as local files:

| Removed from `@shopify/hydrogen` | Pilot replacement |
|---|---|
| `Image` | `~/components/image` (CDN `srcset` via `~/components/shopify-image`) |
| `Money`, `useMoney` | `~/components/money` |
| `Pagination`, `getPaginationVariables` | `~/components/pagination`, `~/utils/pagination` |
| `getSeoMeta`, `SeoConfig` | `~/utils/seo-meta` |
| `createContentSecurityPolicy`, `NonceProvider`, `useNonce` | `~/utils/csp` |
| `ExternalVideo`, `ModelViewer` | `~/components/product-media/` |
| `ShopPayButton` | `ShopPayButton` from `@shopify/hydrogen/react` |
| `Analytics.*` | `ShopifyScripts` and `useCartAnalytics` from `@shopify/hydrogen/react`, plus route trackers |
| `CacheShort`, `CacheLong`, `CacheNone`, `CacheCustom` | `Cache` from `@shopify/hydrogen` (`~/utils/cache`) |

```tsx
import { Image } from '~/components/image';
import { Money } from '~/components/money';

<Image data={product.featuredImage} aspectRatio="1/1" sizes="(min-width: 45em) 20vw, 50vw" />
<Money data={product.priceRange.minVariantPrice} />
```

## Caching

There is no implicit cache in Hydrogen 2026.10. Build strategies with `Cache` from `@shopify/hydrogen` and pass one on every query:

```tsx
// app/utils/cache.ts (Pilot)
import { Cache } from '@shopify/hydrogen';

export const CACHE_DEFAULT = Cache({ mode: 'public', maxAge: 1, staleWhileRevalidate: 86_399 });
export const CACHE_SHORT = Cache.short();
export const CACHE_LONG = Cache.long();
export const CACHE_NONE = Cache.none();

// Usage
await storefront.graphql(QUERY, { variables, cache: CACHE_LONG });
await storefront.graphql(QUERY, { variables, cache: Cache({ mode: 'public', maxAge: 60, staleWhileRevalidate: 600 }) });
```

`generateCacheControlHeader` is gone too; Pilot builds `Cache-Control` values with a local `cacheControlHeader()` in the same file.

## SEO

```tsx
import type { MetaArgs } from 'react-router';
import { getSeoMeta } from '~/utils/seo-meta'; // Pilot's port of the removed Hydrogen helper

export function meta({ data }: MetaArgs<typeof loader>) {
  return getSeoMeta({
    title: data?.product.seo.title ?? data?.product.title,
    description: data?.product.seo.description ?? data?.product.description,
    media: data?.product.featuredImage,
  });
}
```

For Weaverse-managed SEO, `getWeaverseSeoMeta(weaverseData)` from `@weaverse/hydrogen/react-router` returns the page's meta descriptors.

## Environment Variables

Required for all Hydrogen projects:

```bash
SESSION_SECRET="your-session-secret"
PUBLIC_STORE_DOMAIN=your-store.myshopify.com
PUBLIC_STOREFRONT_API_TOKEN=your-storefront-api-token
WEAVERSE_PROJECT_ID=your-weaverse-project-id

# Optional
PUBLIC_STOREFRONT_ID=your-storefront-id
PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID=your-client-id
PUBLIC_CHECKOUT_DOMAIN=your-checkout-domain
SHOP_ID=your-shop-id
```

Oxygen injects `PRIVATE_STOREFRONT_API_TOKEN` for a linked storefront. Type them on `Env`, which extends `WeaverseEnv` from `@weaverse/hydrogen/react-router`.
