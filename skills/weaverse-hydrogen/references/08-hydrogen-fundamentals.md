# Hydrogen Fundamentals

> Shopify Hydrogen framework essentials for Weaverse theme development.

## What is Hydrogen?

Hydrogen is Shopify's React-based framework for building custom headless storefronts. Built on React Router v7 (formerly Remix), it provides server-side rendering, streaming, and Shopify-optimized utilities.

**Key packages:**
- `@shopify/hydrogen` — Components, hooks, utilities
- `@shopify/remix-oxygen` — Shopify's deployment runtime
- `@shopify/hydrogen-react` — Client-side React hooks and components

## Storefront API

Hydrogen communicates with Shopify through the **Storefront API** (GraphQL).

### Query Pattern

```tsx
// In route loaders
export async function loader({ context }: LoaderFunctionArgs) {
  const { storefront } = context;

  const { products } = await storefront.query(PRODUCTS_QUERY, {
    variables: { first: 10 },
  });

  return { products };
}

const PRODUCTS_QUERY = `#graphql
  query Products($first: Int!) {
    products(first: $first) {
      nodes {
        id
        title
        handle
        priceRange {
          minVariantPrice {
            amount
            currencyCode
          }
        }
        featuredImage {
          url
          altText
          width
          height
        }
      }
    }
  }
` as const;
```

### In Weaverse Component Loaders

```tsx
import type { ComponentLoaderArgs } from '@weaverse/hydrogen';

type LoaderData = { productHandle: string };

export let loader = async ({ weaverse, data }: ComponentLoaderArgs<LoaderData>) => {
  const { storefront } = weaverse;

  if (!data?.productHandle) return null;

  return await storefront.query(PRODUCT_QUERY, {
    variables: {
      handle: data.productHandle,
      language: storefront.i18n.language,
      country: storefront.i18n.country,
    },
  });
};
```

### Mutation Pattern

```tsx
export async function action({ context }: ActionFunctionArgs) {
  const { storefront } = context;

  const result = await storefront.mutate(CREATE_CART_MUTATION, {
    variables: {
      input: {
        lines: [{ merchandiseId: 'gid://shopify/ProductVariant/123', quantity: 1 }],
      },
    },
  });

  return result;
}
```

## Cart

Hydrogen provides built-in cart management:

```tsx
import { CartForm } from '@shopify/hydrogen';

// Add to cart
function AddToCartButton({ variantId }: { variantId: string }) {
  return (
    <CartForm route="/cart" action={CartForm.ACTIONS.LinesAdd}>
      <input type="hidden" name="lines" value={JSON.stringify([
        { merchandiseId: variantId, quantity: 1 }
      ])} />
      <button type="submit">Add to Cart</button>
    </CartForm>
  );
}
```

### Cart Query Fragment

Used in `server.ts` context setup:

```tsx
const CART_QUERY_FRAGMENT = `#graphql
  fragment CartApiQuery on Cart {
    id
    totalQuantity
    checkoutUrl
    cost {
      subtotalAmount { amount currencyCode }
      totalAmount { amount currencyCode }
    }
    lines(first: 100) {
      nodes {
        id
        quantity
        merchandise {
          ... on ProductVariant {
            id
            title
            image { url altText width height }
            price { amount currencyCode }
            product { title handle }
          }
        }
      }
    }
  }
` as const;
```

## Customer Accounts

Hydrogen supports Shopify's Customer Account API:

```tsx
// Check if customer is logged in
export async function loader({ context, request }: LoaderFunctionArgs) {
  const isLoggedIn = await context.customerAccount.isLoggedIn();

  if (!isLoggedIn) {
    return redirect(localizedPathForRequest(request, '/account/login'));
  }

  const { data } = await context.customerAccount.query(CUSTOMER_QUERY);
  return { customer: data.customer };
}
```

## Internationalization (i18n)

Market localization crosses request parsing, Hydrogen context, Weaverse,
navigation, cart, accounts, SEO, and production configuration. Use the
[`hydrogen-markets-localization`](../../hydrogen-markets-localization/SKILL.md)
skill for the canonical end-to-end procedure and verification matrix.

Do not accept arbitrary locale-shaped route segments or maintain a second
locale map in this reference. Derive `storefront.i18n` from the storefront's
merchant-specific market allowlist. Hydrogen then applies that context to
Storefront API queries; pass explicit language/country variables only when the
query intentionally overrides the active request market.

## Hydrogen Components

### Image

```tsx
import { Image } from '@shopify/hydrogen';

<Image
  data={product.featuredImage}
  aspectRatio="1/1"
  sizes="(min-width: 45em) 20vw, 50vw"
/>
```

### Money

```tsx
import { Money } from '@shopify/hydrogen';

<Money data={product.priceRange.minVariantPrice} />
```

### ShopPayButton

```tsx
import { ShopPayButton } from '@shopify/hydrogen';

<ShopPayButton
  storeDomain="your-store.myshopify.com"
  variantIds={[selectedVariant.id]}
/>
```

### Analytics

```tsx
import { Analytics } from '@shopify/hydrogen';

<Analytics.ProductView
  data={{
    products: [{ id: product.id, title: product.title, price: product.price }],
  }}
/>
```

## Caching

Hydrogen provides caching utilities for Storefront API and custom requests:

```tsx
import { CacheShort, CacheLong, CacheNone, CacheCustom } from '@shopify/hydrogen';

// Short cache (1 second, stale-while-revalidate 9 seconds)
await storefront.query(QUERY, { cache: CacheShort() });

// Long cache (1 hour, stale-while-revalidate 23 hours)
await storefront.query(QUERY, { cache: CacheLong() });

// No cache
await storefront.query(QUERY, { cache: CacheNone() });

// Custom cache
await storefront.query(QUERY, {
  cache: CacheCustom({ maxAge: 60, staleWhileRevalidate: 600 }),
});
```

## SEO

Hydrogen provides SEO utilities:

```tsx
import { getSeoMeta } from '@shopify/hydrogen';

export function meta({ data }: MetaArgs) {
  return getSeoMeta({
    title: data.product.seo.title ?? data.product.title,
    description: data.product.seo.description ?? data.product.description,
    media: data.product.featuredImage,
  });
}
```

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
```
