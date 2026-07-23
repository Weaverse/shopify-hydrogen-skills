# 02 — Creating Components

> How to build and register Weaverse section components.

## Component File Structure

Each component is either a single file or a directory:

```
app/sections/my-section.tsx           # Single file
app/sections/my-section/
├── index.tsx                         # Main component + schema + loader
├── schema.ts                         # Schema (optional separate file)
└── loader.ts                         # Loader (optional separate file)
```

## Required Exports

Every Weaverse component file must export:

1. **`default`** — The React component
2. **`schema`** — Component schema (via `createSchema()`)
3. **`loader`** (optional) — Server-side data fetching function

```tsx
// app/sections/hero-banner/index.tsx
import { createSchema } from '@weaverse/hydrogen';
import type { HydrogenComponentProps } from '@weaverse/hydrogen';

// --- Component ---
interface HeroBannerProps extends HydrogenComponentProps {
  heading: string;
  subheading: string;
  buttonText: string;
  buttonLink: string;
}

function HeroBanner({ heading, subheading, buttonText, buttonLink, children, ...rest }: HeroBannerProps) {
  return (
    <section {...rest} className="relative py-20 px-4 bg-gray-900 text-white text-center">
      <h1 className="text-5xl font-bold">{heading}</h1>
      <p className="mt-4 text-xl text-gray-300">{subheading}</p>
      {buttonText && (
        <a href={buttonLink} className="mt-8 inline-block bg-white text-black px-8 py-3 rounded-lg font-semibold">
          {buttonText}
        </a>
      )}
      {children}
    </section>
  );
}

export default HeroBanner;

// --- Schema ---
export let schema = createSchema({
  type: 'hero-banner',
  title: 'Hero Banner',
  settings: [
    {
      group: 'Content',
      inputs: [
        { type: 'text', name: 'heading', label: 'Heading', defaultValue: 'Welcome' },
        { type: 'textarea', name: 'subheading', label: 'Subheading', defaultValue: 'Shop our latest collection' },
        { type: 'text', name: 'buttonText', label: 'Button Text', defaultValue: 'Shop Now' },
        { type: 'url', name: 'buttonLink', label: 'Button Link', defaultValue: '/collections/all' },
      ],
    },
  ],
  presets: {
    heading: 'Welcome',
    subheading: 'Shop our latest collection',
    buttonText: 'Shop Now',
    buttonLink: '/collections/all',
  },
});
```

## Critical Rules

### 1. Spread `{...rest}` on Root Element

**Always** spread the remaining props onto the root HTML element. This is how Weaverse Studio attaches event listeners, data attributes, and interaction handlers.

```tsx
// ✅ CORRECT
function MySection({ title, ...rest }: Props) {
  return <section {...rest}><h2>{title}</h2></section>;
}

// ❌ WRONG — Studio interactions will break
function MySection({ title }: Props) {
  return <section><h2>{title}</h2></section>;
}
```

### 2. Render `{children}` if Using `childTypes`

If your schema defines `childTypes`, you **must** render `{children}` in your component:

```tsx
function ProductGrid({ heading, children, ...rest }: Props) {
  return (
    <section {...rest}>
      <h2>{heading}</h2>
      <div className="grid grid-cols-3 gap-4">
        {children}  {/* Child components render here */}
      </div>
    </section>
  );
}
```

### 3. Use Namespace Imports for Registration

```tsx
// ✅ CORRECT — namespace import
import * as HeroBanner from '~/sections/hero-banner';

// ❌ WRONG — default import
import HeroBanner from '~/sections/hero-banner';
```

### 4. `forwardRef` is Optional (React 19)

In React 19, `forwardRef` is no longer required. Just spread `{...rest}`:

```tsx
// React 19 — no forwardRef needed
function MySection(props: MySectionProps) {
  let { heading, ...rest } = props;
  return <section {...rest}><h2>{heading}</h2></section>;
}
export default MySection;

// React 18 — use forwardRef
import { forwardRef } from 'react';
let MySection = forwardRef<HTMLElement, MySectionProps>((props, ref) => {
  let { heading, ...rest } = props;
  return <section ref={ref} {...rest}><h2>{heading}</h2></section>;
});
export default MySection;
```

### 5. Use `enabled` for Context-Aware Insertion

Use a synchronous `enabled` callback when a section should only be insertable for a specific page, handle, locale, or placement group:

```tsx
export let schema = createSchema({
  type: 'freebie-banner',
  title: 'Freebie Banner',
  enabled: ({ page, group }) =>
    page.type === 'CUSTOM' &&
    page.handle === 'freebies/essential' &&
    group === 'body',
  settings: [],
});
```

Keep the callback pure and return a boolean immediately. Errors, Promises, and invalid results make the section unavailable for new insertion, while existing instances stay editable. `enabledOn` is deprecated; move its page/group checks into `enabled`.

## Component Registration

After creating a component, register it in `app/weaverse/components.ts`:

```tsx
import type { HydrogenComponent } from '@weaverse/hydrogen';

import * as HeroBanner from '~/sections/hero-banner';
import * as FeaturedCollection from '~/sections/featured-collection';
import * as ProductCard from '~/sections/product-card';
import * as Testimonials from '~/sections/testimonials';

export let components: HydrogenComponent[] = [
  HeroBanner,
  FeaturedCollection,
  ProductCard,
  Testimonials,
];
```

Then restart your dev server: `npm run dev`

## TypeScript Props Pattern

### Basic (no loader)

```tsx
import type { HydrogenComponentProps } from '@weaverse/hydrogen';

interface MyProps extends HydrogenComponentProps {
  heading: string;
  showButton: boolean;
  gap: number;
}
```

### With Loader

```tsx
import type { HydrogenComponentProps, ComponentLoaderArgs } from '@weaverse/hydrogen';

type InputData = { collectionHandle: string };

export let loader = async ({ weaverse, data }: ComponentLoaderArgs<InputData>) => {
  return await weaverse.storefront.query(QUERY, { variables: { handle: data.collectionHandle } });
};

// Derive props from loader return type
type Props = HydrogenComponentProps<Awaited<ReturnType<typeof loader>>> & InputData;

function MyComponent({ loaderData, collectionHandle, ...rest }: Props) {
  // loaderData is fully typed
}
```

## Section vs. Child Components

**Sections** are top-level components added to page layouts:
- Appear in Studio's section picker
- Can define `childTypes`, `enabled`, `limit`
- Typically have `presets` with default children

**Child components** are nested inside sections:
- Referenced by `type` in parent's `childTypes`
- Simpler schemas, usually no `enabled` or `limit` needed
- Receive data from parent context

```tsx
// Parent section
export let schema = createSchema({
  type: 'testimonial-section',
  title: 'Testimonials',
  childTypes: ['testimonial-item'],
  presets: {
    children: [
      { type: 'testimonial-item', quote: 'Great product!', author: 'Jane' },
      { type: 'testimonial-item', quote: 'Love it!', author: 'John' },
    ],
  },
  settings: [/* ... */],
});

// Child component
export let schema = createSchema({
  type: 'testimonial-item',
  title: 'Testimonial Item',
  settings: [
    {
      group: 'Content',
      inputs: [
        { type: 'textarea', name: 'quote', label: 'Quote' },
        { type: 'text', name: 'author', label: 'Author' },
      ],
    },
  ],
});
```
