# 04 — Input Settings

> All input types, configurations, and conditions for component schemas.

## Input Structure

```tsx
type Input = {
  type: InputType;                    // Required: input control type
  name: string;                       // Required: data key (e.g., "title" → component.data.title)
  label?: string;                     // Display label in Studio
  defaultValue?: any;                 // Initial value
  placeholder?: string;               // Placeholder text
  helpText?: string;                  // Help text (supports HTML)
  configs?: object;                   // Additional config (for select, range, toggle-group)
  condition?: (data, weaverse) => boolean;  // Conditional display (function-based, recommended)
  shouldRevalidate?: boolean;         // Re-run loader when this input changes
};
```

## Conditions

Show/hide inputs based on component data:

```tsx
// ✅ Function-based (recommended)
{
  type: 'text',
  name: 'buttonText',
  label: 'Button Text',
  condition: (data) => data.showButton === true,
}

// ❌ String-based (deprecated)
{
  type: 'text',
  name: 'buttonText',
  label: 'Button Text',
  condition: 'showButton.eq.true',
}
```

## `shouldRevalidate`

When `true`, changing this input re-runs the component's `loader` function:

```tsx
{
  type: 'select',
  name: 'sortBy',
  label: 'Sort By',
  shouldRevalidate: true,  // Changing sort triggers data re-fetch
  configs: { options: [{ value: 'newest', label: 'Newest' }] },
}
```

**Auto-revalidating inputs** (no `shouldRevalidate` needed):
`product`, `collection`, `blog`, `product-list`, `collection-list`

---

## Basic Inputs

### `heading`

Decorative heading in the settings panel. No data stored.

```tsx
{ type: 'heading', label: 'Content Settings' }
```

### `text`

Single-line text input. Returns `string`.

```tsx
{
  type: 'text',
  name: 'heading',
  label: 'Heading',
  defaultValue: 'Welcome',
  placeholder: 'Enter heading text',
}
```

### `textarea`

Multi-line text. Returns `string`.

```tsx
{
  type: 'textarea',
  name: 'description',
  label: 'Description',
  defaultValue: 'A longer description here...',
  placeholder: 'Enter description',
}
```

### `richtext`

Rich text editor with formatting (bold, italic, links, lists). Returns `string` (HTML).

```tsx
{
  type: 'richtext',
  name: 'content',
  label: 'Content',
  defaultValue: '<p>Rich <strong>text</strong> content</p>',
}
```

> Has AI-powered content generation built in.

### `url`

URL input. Returns `string`.

```tsx
{
  type: 'url',
  name: 'link',
  label: 'Link',
  defaultValue: '/collections/all',
}
```

### `switch`

Toggle boolean. Returns `boolean`.

```tsx
{
  type: 'switch',
  name: 'showButton',
  label: 'Show Button',
  defaultValue: true,
}
```

### `range`

Numeric slider. Returns `number`. Requires `configs`.

```tsx
{
  type: 'range',
  name: 'gap',
  label: 'Gap',
  defaultValue: 16,
  configs: {
    min: 0,       // Required
    max: 100,     // Required
    step: 4,      // Required
    unit: 'px',   // Optional, display only
  },
}
```

### `select`

Dropdown selector. Returns `string`. Requires `configs.options`.

```tsx
{
  type: 'select',
  name: 'layout',
  label: 'Layout',
  defaultValue: 'grid',
  configs: {
    options: [
      { value: 'grid', label: 'Grid' },
      { value: 'list', label: 'List' },
      { value: 'carousel', label: 'Carousel' },
    ],
  },
}
```

### `toggle-group`

Button group for single selection. Returns `string`. Requires `configs.options`.

```tsx
{
  type: 'toggle-group',
  name: 'textAlign',
  label: 'Text Alignment',
  defaultValue: 'center',
  configs: {
    options: [
      { value: 'left', label: 'Left' },
      { value: 'center', label: 'Center' },
      { value: 'right', label: 'Right' },
    ],
  },
}
```

With icons (Lucide icon names):

```tsx
configs: {
  options: [
    { value: 'left', label: 'Left', icon: 'align-left' },
    { value: 'center', label: 'Center', icon: 'align-center' },
    { value: 'right', label: 'Right', icon: 'align-right' },
  ],
}
```

### `color`

Color picker. Returns `string` (`#RRGGBB` or `#RRGGBBAA`).

```tsx
{
  type: 'color',
  name: 'backgroundColor',
  label: 'Background Color',
  defaultValue: '#FFFFFF',
}
```

### `datepicker`

Date/time picker. Returns `number` (timestamp).

```tsx
{
  type: 'datepicker',
  name: 'startDate',
  label: 'Start Date',
  defaultValue: '2024-01-01',
}
```

Parse the returned timestamp:
```tsx
let date = new Date(props.startDate);
let formatted = date.toLocaleDateString();
```

### `image`

Image picker from Shopify Files. Returns `WeaverseImage` object.

```tsx
{
  type: 'image',
  name: 'heroImage',
  label: 'Hero Image',
  defaultValue: {
    url: 'https://cdn.shopify.com/...',
    altText: 'Hero banner',
    width: 1920,
    height: 800,
  },
}
```

**WeaverseImage type:**
```tsx
type WeaverseImage = {
  id: string;
  url: string;
  altText: string;
  width: number;
  height: number;
  previewSrc: string;
};
```

Render with the theme's `<Image>` component. Hydrogen 2026.10 removed `Image` from `@shopify/hydrogen`; Pilot ports it to `app/components/image.tsx` (CDN `srcset` via `app/components/shopify-image.tsx`):
```tsx
import { Image } from '~/components/image';
<Image data={props.heroImage} sizes="100vw" />
```

The `defaultValue` can also be a simple string URL.

### `video`

Video picker from Shopify Files. Returns `WeaverseVideo` object.

```tsx
{
  type: 'video',
  name: 'backgroundVideo',
  label: 'Background Video',
}
```

**WeaverseVideo type:**
```tsx
type WeaverseVideo = {
  id: string;
  url: string;
  altText: string;
  width: number;
  height: number;
  previewSrc: string;
};
```

---

## Resource Picker Inputs

These inputs open Shopify resource pickers. They auto-revalidate the loader.

### `product`

Shopify product picker. Returns product data.

```tsx
{
  type: 'product',
  name: 'product',
  label: 'Product',
}
```

### `collection`

Shopify collection picker. Returns collection data.

```tsx
{
  type: 'collection',
  name: 'collection',
  label: 'Collection',
}
```

### `blog`

Shopify blog picker. Returns blog data.

```tsx
{
  type: 'blog',
  name: 'blog',
  label: 'Blog',
}
```

### `article`

Shopify article picker. Returns article data.

```tsx
{
  type: 'article',
  name: 'article',
  label: 'Article',
}
```

### `metaobject`

Shopify metaobject picker. Returns metaobject data.

```tsx
{
  type: 'metaobject',
  name: 'metaobject',
  label: 'Metaobject',
}
```

### `product-list`

Multi-product picker. Returns array of products.

```tsx
{
  type: 'product-list',
  name: 'products',
  label: 'Products',
}
```

### `collection-list`

Multi-collection picker. Returns array of collections.

```tsx
{
  type: 'collection-list',
  name: 'collections',
  label: 'Collections',
}
```

---

## Complete Settings Example

```tsx
settings: [
  {
    group: 'Content',
    inputs: [
      { type: 'heading', label: 'Text' },
      { type: 'text', name: 'heading', label: 'Heading', defaultValue: 'Shop Now' },
      { type: 'richtext', name: 'description', label: 'Description' },
      { type: 'heading', label: 'Button' },
      { type: 'switch', name: 'showButton', label: 'Show Button', defaultValue: true },
      {
        type: 'text', name: 'buttonText', label: 'Button Text',
        defaultValue: 'Learn More',
        condition: (data) => data.showButton === true,
      },
      {
        type: 'url', name: 'buttonLink', label: 'Button Link',
        defaultValue: '/collections/all',
        condition: (data) => data.showButton === true,
      },
    ],
  },
  {
    group: 'Media',
    inputs: [
      { type: 'image', name: 'backgroundImage', label: 'Background Image' },
      { type: 'video', name: 'backgroundVideo', label: 'Background Video' },
    ],
  },
  {
    group: 'Data',
    inputs: [
      { type: 'collection', name: 'collection', label: 'Collection' },
      {
        type: 'range', name: 'productsCount', label: 'Products to Show',
        defaultValue: 4,
        shouldRevalidate: true,
        configs: { min: 1, max: 12, step: 1 },
      },
      {
        type: 'select', name: 'sortBy', label: 'Sort By',
        defaultValue: 'BEST_SELLING',
        shouldRevalidate: true,
        configs: {
          options: [
            { value: 'BEST_SELLING', label: 'Best Selling' },
            { value: 'CREATED_AT', label: 'Newest' },
            { value: 'PRICE', label: 'Price: Low to High' },
          ],
        },
      },
    ],
  },
  {
    group: 'Style',
    inputs: [
      { type: 'color', name: 'bgColor', label: 'Background Color', defaultValue: '#f7f7f7' },
      { type: 'color', name: 'textColor', label: 'Text Color', defaultValue: '#000000' },
      {
        type: 'toggle-group', name: 'textAlign', label: 'Text Alignment',
        defaultValue: 'left',
        configs: {
          options: [
            { value: 'left', label: 'Left', icon: 'align-left' },
            { value: 'center', label: 'Center', icon: 'align-center' },
            { value: 'right', label: 'Right', icon: 'align-right' },
          ],
        },
      },
    ],
  },
],
```
