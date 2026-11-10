# Pilot Theme Patterns & Conventions

> Reference for the official Weaverse Pilot starter theme.

## Overview

Pilot is the official Weaverse Hydrogen starter theme. It demonstrates best practices for building production-grade Shopify Hydrogen storefronts with Weaverse. Pilot `main` runs on Hydrogen 2026.10 (`@shopify/hydrogen` ^2026.10.2) and `@weaverse/hydrogen` ^6.1, and its `AGENTS.md` is the most current summary of its conventions. Pilot's own copies of the cookbooks and upgrade guides live in `.guides/`.

**GitHub:** https://github.com/Weaverse/pilot
**Template:** `npx @weaverse/cli create --template=pilot`

## Project Structure Conventions

```
pilot/
├── server.ts               # Fetch handler: createAppContext → handleShopifyRoutes → React Router
├── app/
│   ├── .server/            # context.ts (WeaverseClient), storefront.ts, cart.ts, customer-account.ts, ...
│   ├── components/         # Shared UI (Section, Heading, Button, ProductCard, etc.)
│   ├── graphql/            # gql() fragments (fragments.ts) and queries (queries.ts)
│   ├── utils/              # cache.ts (CACHE_*), storefront.ts (unwrapStorefront), csp.ts, ...
│   ├── sections/           # 100+ registered Weaverse sections
│   ├── weaverse/
│   │   ├── components.ts   # All sections registered here
│   │   ├── schema.server.ts  # Theme-wide settings (colors, fonts, layout)
│   │   ├── csp.ts          # Weaverse CSP config
│   │   ├── style.tsx       # GlobalStyle component (CSS variables)
│   │   └── index.tsx       # WeaverseContent wrapper
│   ├── routes.ts           # Route config (:locale? prefix, market guard layouts)
│   └── routes/             # Route modules
```

## Reusable Base Components

Pilot uses shared base components that sections build on:

### Section Component

```tsx
// app/components/section.tsx (simplified)
import { cn } from '~/utils/cn';

export interface SectionProps {
  as?: React.ElementType;
  className?: string;
  gap?: number;
  width?: 'full' | 'stretch' | 'fixed';
  overflow?: 'hidden' | 'unset';
  verticalPadding?: 'none' | 'small' | 'medium' | 'large';
  borderRadius?: number;
  backgroundColor?: string;
  children?: React.ReactNode;
  ref?: React.Ref<HTMLElement>;
}

export function Section(props: SectionProps) {
  let {
    ref,
    as: Tag = 'section',
    className,
    gap,
    width = 'fixed',
    overflow,
    verticalPadding = 'medium',
    borderRadius,
    backgroundColor,
    children,
    ...rest
  } = props;

  let maxWidth = width === 'fixed' ? 'var(--page-width)' : undefined;

  return (
    <Tag
      ref={ref}
      {...rest}
      className={cn('w-full mx-auto', className)}
      style={{
        maxWidth,
        gap: gap ? `${gap}px` : undefined,
        borderRadius: borderRadius ? `${borderRadius}px` : undefined,
        backgroundColor,
        overflow,
        paddingTop: verticalPadding !== 'none' ? `var(--padding-${verticalPadding})` : undefined,
        paddingBottom: verticalPadding !== 'none' ? `var(--padding-${verticalPadding})` : undefined,
      }}
    >
      {children}
    </Tag>
  );
}
```

### Shared Layout Inputs

```tsx
// Reusable schema inputs for section layout
export let layoutInputs = [
  {
    type: 'select' as const,
    name: 'width',
    label: 'Content width',
    configs: {
      options: [
        { value: 'full', label: 'Full page' },
        { value: 'stretch', label: 'Stretch' },
        { value: 'fixed', label: 'Fixed' },
      ],
    },
    defaultValue: 'fixed',
  },
  {
    type: 'range' as const,
    name: 'gap',
    label: 'Items spacing',
    configs: { min: 0, max: 60, step: 4, unit: 'px' },
    defaultValue: 20,
  },
  {
    type: 'select' as const,
    name: 'verticalPadding',
    label: 'Vertical padding',
    configs: {
      options: [
        { value: 'none', label: 'None' },
        { value: 'small', label: 'Small' },
        { value: 'medium', label: 'Medium' },
        { value: 'large', label: 'Large' },
      ],
    },
    defaultValue: 'medium',
  },
];
```

### Heading Component

```tsx
// app/components/heading.tsx
export interface HeadingProps {
  content: string;
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  size?: string;
  mobileSize?: string;
  desktopSize?: string;
  color?: string;
  weight?: string;
  letterSpacing?: string;
  alignment?: 'left' | 'center' | 'right';
  minSize?: number;
  maxSize?: number;
}

export let headingInputs = [
  { type: 'text' as const, name: 'content', label: 'Content', defaultValue: 'Heading' },
  {
    type: 'select' as const, name: 'as', label: 'HTML tag',
    configs: {
      options: [
        { value: 'h1', label: 'H1' },
        { value: 'h2', label: 'H2' },
        { value: 'h3', label: 'H3' },
        { value: 'h4', label: 'H4' },
      ],
    },
    defaultValue: 'h2',
  },
  {
    type: 'select' as const, name: 'alignment', label: 'Alignment',
    configs: {
      options: [
        { value: 'left', label: 'Left' },
        { value: 'center', label: 'Center' },
        { value: 'right', label: 'Right' },
      ],
    },
    defaultValue: 'center',
  },
];
```

## Section Patterns

### Content Section (no data fetching)

```tsx
// app/sections/image-with-text/index.tsx
import { createSchema } from '@weaverse/hydrogen/react-router';
import type { WeaverseComponentProps } from '@weaverse/hydrogen/react-router';
import { Section, layoutInputs } from '~/components/section';
import { cn } from '~/utils/cn';

interface ImageWithTextProps extends WeaverseComponentProps {
  imagePosition: 'left' | 'right';
}

function ImageWithText({ ref, imagePosition, children, ...rest }: ImageWithTextProps) {
  return (
    <Section ref={ref} {...rest}>
      <div className={cn('flex', imagePosition === 'right' && 'flex-row-reverse')}>
        {children}
      </div>
    </Section>
  );
}

export default ImageWithText;

export let schema = createSchema({
  type: 'image-with-text',
  title: 'Image with Text',
  settings: [
    { group: 'Layout', inputs: layoutInputs },
    {
      group: 'Content',
      inputs: [
        {
          type: 'toggle-group',
          name: 'imagePosition',
          label: 'Image position',
          configs: {
            options: [
              { value: 'left', label: 'Left' },
              { value: 'right', label: 'Right' },
            ],
          },
          defaultValue: 'left',
        },
      ],
    },
  ],
  childTypes: ['heading', 'paragraph', 'image', 'button'],
  presets: {
    children: [
      { type: 'image' },
      { type: 'heading', content: 'About Our Store' },
      { type: 'paragraph', content: 'We create amazing products...' },
    ],
  },
});
```

### Data-Driven Section

```tsx
// app/sections/featured-products/index.tsx (simplified)
import { gql } from '@shopify/hydrogen';
import { createSchema } from '@weaverse/hydrogen/react-router';
import type { WeaverseComponentLoaderArgs, WeaverseComponentProps } from '@weaverse/hydrogen/react-router';
import { Section, layoutInputs } from '~/components/section';
import { ProductCard } from '~/components/product/product-card';
import { CACHE_DEFAULT } from '~/utils/cache';
import { unwrapStorefront } from '~/utils/storefront';

type LoaderData = { collection: { handle: string } };

export let loader = async ({ weaverse, data }: WeaverseComponentLoaderArgs<LoaderData>) => {
  let { storefront } = weaverse;
  let handle = data?.collection?.handle;

  if (!handle) return null;

  // $country/$language are filled from the request; only pass your own variables
  return unwrapStorefront(
    await storefront.graphql(COLLECTION_QUERY, {
      variables: { handle, first: 8 },
      cache: CACHE_DEFAULT,
    }),
  );
};

type Props = WeaverseComponentProps<Awaited<ReturnType<typeof loader>>> & LoaderData;

function FeaturedProducts(props: Props) {
  let { loaderData, children, ...rest } = props;
  let products = loaderData?.collection?.products?.nodes ?? [];

  return (
    <Section {...rest}>
      {children}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {products.map(product => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </Section>
  );
}

export default FeaturedProducts;

export let schema = createSchema({
  type: 'featured-products',
  title: 'Featured Products',
  settings: [
    { group: 'Layout', inputs: layoutInputs },
    {
      group: 'Content',
      inputs: [
        {
          type: 'collection',
          name: 'collection',
          label: 'Collection',
          shouldRevalidate: true,
        },
      ],
    },
  ],
  childTypes: ['heading'],
  presets: {
    gap: 20,
    children: [{ type: 'heading', content: 'Featured Products' }],
  },
});

const COLLECTION_QUERY = gql(`
  query FeaturedCollection($handle: String!, $first: Int!, $language: LanguageCode, $country: CountryCode)
  @inContext(language: $language, country: $country) {
    collection(handle: $handle) {
      title
      products(first: $first) {
        nodes {
          id
          title
          handle
          featuredImage { url altText width height }
          priceRange {
            minVariantPrice { amount currencyCode }
          }
        }
      }
    }
  }
`);
```

Pilot puts shared documents in `app/graphql/` and exports their result types as `StorefrontApi.ResultOf<typeof QUERY>`.

### Page-Restricted Section

```tsx
export let schema = createSchema({
  type: 'related-products',
  title: 'Related Products',
  limit: 1,
  enabled: ({ page }) => page.type === 'PRODUCT',  // Only available on product pages
  settings: [
    { group: 'Layout', inputs: layoutInputs },
  ],
  presets: { gap: 32 },
});
```

## Theme Schema Conventions

Pilot organizes theme settings into logical groups:

```tsx
// app/weaverse/schema.server.ts
export let themeSchema: WeaverseThemeSchema = {
  info: {
    version: '7.0.0',
    author: 'Weaverse',
    name: 'Pilot',
    documentationUrl: 'https://docs.weaverse.io',
    supportUrl: 'https://help.weaverse.io',
  },
  settings: [
    { group: 'Layout', inputs: [/* pageWidth, navHeight, gridGap */] },
    { group: 'Colors', inputs: [/* background, foreground, primary, secondary */] },
    { group: 'Typography', inputs: [/* bodyFont, headingFont, baseSize */] },
    { group: 'Buttons', inputs: [/* primaryBg, primaryText, borderRadius */] },
    { group: 'Header', inputs: [/* sticky, transparent, logo, height */] },
    { group: 'Footer', inputs: [/* columns, copyright, social links */] },
    { group: 'Product', inputs: [/* imageRatio, showVendor, showRating */] },
    { group: 'Cart', inputs: [/* cartType (drawer/page), showNotes */] },
  ],
};
```

## Key Conventions

1. **Use `Section` wrapper** — all sections extend the base `Section` component for consistent layout
2. **Share inputs** — `layoutInputs`, `headingInputs` are shared across sections to maintain consistency
3. **Namespace imports** — always `import * as X` in components.ts
4. **Consistent group ordering** — Layout → Content → Style → Advanced
5. **Child components** — use `childTypes` for composable sections, render `{children}`
6. **`ref` as a prop** — React 19; `forwardRef` is deprecated
7. **TypeScript strict** — all components fully typed with interfaces
8. **GraphQL documents** — `gql()` in `app/graphql/`, fragments passed as `gql()`'s second argument, every query with an explicit `cache`
9. **`shouldRevalidate: true`** — on inputs that change loader data (e.g., collection picker)
10. **kebab-case types** — `hero-banner`, not `heroBanner` or `HeroBanner`
