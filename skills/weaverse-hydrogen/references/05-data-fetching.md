# 05 — Data Fetching

> Loaders, Storefront API, caching, parallel fetching, fetchWithCache.

## Core Concept

Weaverse components fetch their own data via **loader functions**. The loader runs on the server, and its return value is passed to the component as `props.loaderData`.

```tsx
import { gql } from '@shopify/hydrogen';
import type { WeaverseComponentLoaderArgs, WeaverseComponentProps } from '@weaverse/hydrogen/react-router';
import { CACHE_DEFAULT } from '~/utils/cache';
import { unwrapStorefront } from '~/utils/storefront';

const PRODUCT_QUERY = gql(`
  query product($country: CountryCode, $language: LanguageCode, $handle: String!)
  @inContext(country: $country, language: $language) {
    product(handle: $handle) { id title handle }
  }
`);

type InputData = { productHandle: string };

// Server-side data fetching
export let loader = async ({ weaverse, data }: WeaverseComponentLoaderArgs<InputData>) => {
  let { storefront } = weaverse;
  if (!data.productHandle) return null;
  return unwrapStorefront(
    await storefront.graphql(PRODUCT_QUERY, {
      variables: { handle: data.productHandle },
      cache: CACHE_DEFAULT,
    }),
  );
};

// Typed props from loader
type Props = WeaverseComponentProps<Awaited<ReturnType<typeof loader>>> & InputData;

function MyComponent({ loaderData, ...rest }: Props) {
  let product = loaderData?.product;
  if (!product) return <div {...rest}>Select a product</div>;
  return <div {...rest}><h2>{product.title}</h2></div>;
}

export default MyComponent;
```

## WeaverseComponentLoaderArgs

```tsx
type WeaverseComponentLoaderArgs<T> = {
  data: T;                   // Component's current settings data
  weaverse: WeaverseClient;  // Access to storefront, fetchWithCache, env
};
```

### `weaverse` Properties

| Property | Usage |
|----------|-------|
| `weaverse.storefront` | The request-scoped Hydrogen 2026.10 Storefront API client |
| `weaverse.storefront.graphql(doc, { variables, cache })` | Run a `gql()` document; returns `{ data, errors, headers }` |
| `weaverse.storefront.i18n` | The request's market (`language`, `country`, `pathPrefix`) |
| `weaverse.customerAccount` | The Customer Account client, when the app passes one to `WeaverseClient` |
| `weaverse.fetchWithCache()` | Fetch external APIs with caching |
| `weaverse.env` | Environment variables |

### `data` Properties

The `data` object contains the component's current settings as configured by the merchant in Studio. Its shape matches the `name` fields in your schema inputs.

---

## Shopify Storefront API

Hydrogen 2026.10 replaces `storefront.query()` with `storefront.graphql()`. Rules that apply to every call:

- Write documents with `gql()` from `@shopify/hydrogen`. Compose fragments through its second argument, never `${}` interpolation.
- Result types come from the document: `type CollectionQuery = StorefrontApi.ResultOf<typeof COLLECTION_QUERY>`. There is no codegen; `@shopify/hydrogen/ts-plugin` infers them and `hydrogen gql check --fail-on-warn` (in `npm run typecheck`) validates every document.
- `graphql()` returns `{ data, errors, headers }` and does **not** throw on GraphQL errors. Pilot unwraps with `unwrapStorefront()` (`app/utils/storefront.ts`) to keep the throwing behavior.
- There is **no default cache**. Pass `cache` on every call, or the query hits the API on every request. Pilot defines `CACHE_DEFAULT`, `CACHE_SHORT`, `CACHE_LONG` and `CACHE_NONE` in `app/utils/cache.ts`.
- Don't pass `country`/`language`: the client fills `$country`/`$language` from the request context.

```tsx
import { gql, type StorefrontApi } from '@shopify/hydrogen';
import type { WeaverseComponentLoaderArgs } from '@weaverse/hydrogen/react-router';
import { CACHE_DEFAULT } from '~/utils/cache';
import { unwrapStorefront } from '~/utils/storefront';

const PRODUCT_CARD_FRAGMENT = gql(`
  fragment ProductCard on Product {
    id
    title
    handle
    priceRange { minVariantPrice { amount currencyCode } }
    featuredImage { url altText width height }
  }
`);

const COLLECTION_QUERY = gql(
  `
  query CollectionProducts(
    $handle: String!
    $first: Int!
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    collection(handle: $handle) {
      id
      title
      handle
      products(first: $first) {
        nodes { ...ProductCard }
      }
    }
  }
`,
  [PRODUCT_CARD_FRAGMENT], // fragments are passed, not interpolated
);

export type CollectionQuery = StorefrontApi.ResultOf<typeof COLLECTION_QUERY>;

export let loader = async ({ weaverse, data }: WeaverseComponentLoaderArgs<CollectionData>) => {
  if (!data.collection?.handle) return null;
  return unwrapStorefront(
    await weaverse.storefront.graphql(COLLECTION_QUERY, {
      variables: { handle: data.collection.handle, first: data.productsCount || 4 },
      cache: CACHE_DEFAULT,
    }),
  );
};
```

```ts
// app/utils/cache.ts (Pilot)
import { Cache } from '@shopify/hydrogen';

// Classic Hydrogen's implicit default: fresh for a second, stale for a day
export const CACHE_DEFAULT = Cache({ mode: 'public', maxAge: 1, staleWhileRevalidate: 86_399 });
export const CACHE_SHORT = Cache.short();
export const CACHE_LONG = Cache.long();
export const CACHE_NONE = Cache.none();
```

```ts
// app/utils/storefront.ts (Pilot)
import type { GraphQLFormattedError } from '@shopify/hydrogen';

export function unwrapStorefront<T>(result: { data: T | null; errors?: GraphQLFormattedError[] }): T {
  if (result.errors?.length || !result.data) {
    const messages = result.errors?.map(({ message }) => message) ?? ['No data returned'];
    throw new Error(`[storefront.graphql] ${messages.join('\n')}`);
  }
  return result.data;
}
```

`gql()` results are typed precisely, including nullable and union fields such as `nodes(ids:)`. Narrow them where you read them instead of casting to `any`.

---

## External APIs with fetchWithCache

For non-Shopify APIs, use `weaverse.fetchWithCache()`:

```tsx
export let loader = async ({ weaverse, data }: WeaverseComponentLoaderArgs<WeatherData>) => {
  let { fetchWithCache, env } = weaverse;

  return await fetchWithCache<WeatherResponse>(
    `https://api.weather.example/forecast?city=${data.city}`,
    {
      headers: { 'API-Key': env.WEATHER_API_KEY },
      // A Hydrogen CachingStrategy (`Cache` / `CachingStrategy` from `@shopify/hydrogen`)
      strategy: Cache({ mode: 'public', maxAge: 300, staleWhileRevalidate: 3600 }),
    }
  );
};
```

---

## Parallel Fetching

Fetch from multiple sources simultaneously for better performance:

```tsx
export let loader = async ({ weaverse, data }: WeaverseComponentLoaderArgs<ProductDetailData>) => {
  let { storefront, fetchWithCache, env } = weaverse;

  let [productData, reviewsData] = await Promise.all([
    storefront
      .graphql(PRODUCT_QUERY, { variables: { handle: data.productHandle }, cache: CACHE_DEFAULT })
      .then(unwrapStorefront),
    fetchWithCache(`https://api.reviews.example/product/${data.productHandle}`, {
      headers: { Authorization: `Bearer ${env.REVIEWS_API_KEY}` },
    }),
  ]);

  return {
    product: productData.product,
    reviews: reviewsData.reviews || [],
  };
};
```

---

## Conditional Fetching

```tsx
export let loader = async ({ weaverse, data }: WeaverseComponentLoaderArgs<DataSourceData>) => {
  let { storefront, fetchWithCache, env } = weaverse;

  switch (data.source) {
    case 'collection':
      return unwrapStorefront(
        await storefront.graphql(COLLECTION_QUERY, {
          variables: { handle: data.collectionHandle },
          cache: CACHE_DEFAULT,
        }),
      );
    case 'external':
      return await fetchWithCache(`https://api.example.com/products`, {
        headers: { 'API-Key': env.EXTERNAL_API_KEY },
      });
    default:
      return { products: [] };
  }
};
```

---

## Dependent Queries

When one query depends on another:

```tsx
export let loader = async ({ weaverse, data }: WeaverseComponentLoaderArgs<RelatedProductsData>) => {
  let { storefront } = weaverse;

  // Step 1: Get the product type
  let { product } = unwrapStorefront(
    await storefront.graphql(PRODUCT_BASIC_QUERY, {
      variables: { handle: data.productHandle },
      cache: CACHE_DEFAULT,
    }),
  );

  if (!product) return { relatedProducts: [] };

  // Step 2: Find related products by type
  let { products } = unwrapStorefront(
    await storefront.graphql(RELATED_PRODUCTS_QUERY, {
      variables: {
        productType: product.productType,
        excludeId: product.id,
        first: 4,
      },
      cache: CACHE_DEFAULT,
    }),
  );

  return { relatedProducts: products.nodes };
};
```

---

## Error Handling

```tsx
export let loader = async ({ weaverse, data }: WeaverseComponentLoaderArgs<ApiData>) => {
  try {
    let result = await weaverse.fetchWithCache(data.apiUrl);
    if (!result || !Array.isArray(result.items)) {
      console.warn('Invalid API response format');
      return { items: [], error: 'invalid_format' };
    }
    return { items: result.items, error: null };
  } catch (error) {
    console.error('API fetch error:', error);
    return { items: [], error: error instanceof Error ? error.message : 'unknown' };
  }
};
```

---

## Data Revalidation

Mark inputs with `shouldRevalidate: true` to re-run the loader when they change in Studio:

```tsx
settings: [
  {
    group: 'Settings',
    inputs: [
      {
        type: 'select',
        name: 'sortBy',
        label: 'Sort By',
        shouldRevalidate: true,  // ← Triggers loader re-run
        defaultValue: 'BEST_SELLING',
        configs: {
          options: [
            { value: 'BEST_SELLING', label: 'Best Selling' },
            { value: 'CREATED_AT', label: 'Newest' },
            { value: 'PRICE', label: 'Price' },
          ],
        },
      },
      {
        type: 'range',
        name: 'productsCount',
        label: 'Products to Show',
        shouldRevalidate: true,  // ← Also triggers loader re-run
        defaultValue: 4,
        configs: { min: 1, max: 12, step: 1 },
      },
      {
        type: 'select',
        name: 'viewStyle',
        label: 'View Style',
        // No shouldRevalidate — UI-only, no loader needed
      },
    ],
  },
],
```

**Auto-revalidating inputs** (don't need `shouldRevalidate`):
- `product`
- `collection`
- `blog`
- `product-list`
- `collection-list`
