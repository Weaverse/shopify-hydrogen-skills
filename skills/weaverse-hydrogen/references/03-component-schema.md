# 03 — Component Schema

> `createSchema()`, settings, childTypes, presets, enabledOn, limit.

## `createSchema()` Function

The recommended way to define component schemas. Provides Zod validation at build/dev time and TypeScript inference.

> **Production builds (since `@weaverse/hydrogen` 5.16.0 / `@weaverse/schema` 0.10.0):** the Zod runtime is isolated behind a dev-only boundary, so `createSchema()` is an identity pass-through in production and Zod tree-shakes out of the storefront bundle (~20KB gzip off client + SSR). Your schema code is unchanged — validation still runs in dev/build.

```tsx
import { createSchema } from '@weaverse/hydrogen';

export let schema = createSchema({
  type: string,            // Required: unique kebab-case identifier
  title: string,           // Required: display name in Studio
  settings: InspectorGroup[], // Required: editor UI configuration
  childTypes?: string[],   // Optional: allowed child component types
  presets?: object,        // Optional: default values when added to page
  limit?: number,          // Optional: max instances per parent/page
  enabledOn?: {            // Optional: page/group restrictions
    pages?: PageType[],
    groups?: string[],
  },
});
```

Import from either package:
```tsx
import { createSchema } from '@weaverse/hydrogen';   // Recommended
import { createSchema } from '@weaverse/schema';      // Advanced
```

## Properties

### `type` (required)

Unique identifier for the component. Used internally to map components to schemas.

**Rules:**
- Must be unique across all components in the theme
- Use kebab-case: `hero-banner`, `product-card`, `featured-collection`
- No spaces, no camelCase

### `title` (required)

Human-readable name displayed in Studio's page outline and component browser.

**Rules:**
- Use Title Case: `Hero Banner`, `Product Card`
- Keep concise: 1-3 words
- Describe the component's purpose

### `settings` (required)

Array of `InspectorGroup` objects that define the editor UI:

```tsx
interface InspectorGroup {
  group: string;           // Group label (collapsible section in editor)
  inputs: Input[];         // Array of input configurations
}
```

**Recommended group order:** Content → Style → Settings → Advanced

```tsx
settings: [
  {
    group: 'Content',
    inputs: [
      { type: 'text', name: 'heading', label: 'Heading', defaultValue: 'Hello' },
      { type: 'richtext', name: 'body', label: 'Body Content' },
    ],
  },
  {
    group: 'Style',
    inputs: [
      { type: 'color', name: 'backgroundColor', label: 'Background Color', defaultValue: '#ffffff' },
      {
        type: 'select', name: 'textAlign', label: 'Text Alignment', defaultValue: 'center',
        configs: {
          options: [
            { value: 'left', label: 'Left' },
            { value: 'center', label: 'Center' },
            { value: 'right', label: 'Right' },
          ],
        },
      },
    ],
  },
],
```

> **⚠️ `inspector` is deprecated.** Always use `settings`. If both exist, `settings` takes priority.

### `childTypes` (optional)

Array of component `type` strings that can be nested inside this component. If omitted, the component accepts no children.

```tsx
childTypes: ['product-card', 'collection-card', 'empty-state'],
```

- Only components with matching `type` values appear as options in Studio
- The parent component must render `{children}` in its JSX

### `presets` (optional)

Default configuration and child components when the section is first added to a page:

```tsx
presets: {
  // Default values for input settings
  heading: 'Featured Products',
  description: 'Our best sellers',
  layout: 'grid',
  productsPerRow: 3,

  // Default child components
  children: [
    { type: 'product-card' },
    { type: 'product-card' },
    { type: 'product-card' },
  ],
},
```

- Property names match `name` fields in your `settings` inputs
- `children` array creates instances of child components with optional preset data
- Each child can have its own preset values: `{ type: 'product-card', layout: 'compact' }`

### `limit` (optional)

Maximum number of instances allowed within the parent container (or page if no parent):

```tsx
limit: 1,  // Only one instance allowed
```

- Studio disables the "add" button when limit is reached
- Use for components that should appear only once (announcement bars, footers)

### `enabledOn` (optional)

Controls which page types and layout groups can use this component:

```tsx
enabledOn: {
  pages: ['PRODUCT', 'COLLECTION'],  // Only on product and collection pages
},
```

**Page types:**

| Value | Description |
|-------|-------------|
| `'*'` | All page types |
| `'INDEX'` | Homepage |
| `'PRODUCT'` | Product detail pages |
| `'ALL_PRODUCTS'` | All products listing |
| `'COLLECTION'` | Collection pages |
| `'COLLECTION_LIST'` | Collection list pages |
| `'PAGE'` | Custom pages |
| `'BLOG'` | Blog listing pages |
| `'ARTICLE'` | Individual article pages |
| `'CUSTOM'` | Dynamic custom pages |

**Groups** (`header`, `footer`, `body`) — not yet available; reserved for future use.

## Complete Example

```tsx
import { createSchema } from '@weaverse/hydrogen';

export let schema = createSchema({
  type: 'featured-collection',
  title: 'Featured Collection',
  limit: 3,
  enabledOn: {
    pages: ['INDEX', 'COLLECTION'],
  },
  settings: [
    {
      group: 'Content',
      inputs: [
        { type: 'text', name: 'heading', label: 'Heading', defaultValue: 'Featured Products' },
        { type: 'textarea', name: 'description', label: 'Description' },
        {
          type: 'collection', name: 'collection', label: 'Collection',
          shouldRevalidate: true,
        },
      ],
    },
    {
      group: 'Layout',
      inputs: [
        {
          type: 'range', name: 'productsPerRow', label: 'Products per Row',
          defaultValue: 4,
          configs: { min: 2, max: 6, step: 1, unit: '' },
        },
        {
          type: 'range', name: 'gap', label: 'Gap',
          defaultValue: 16,
          configs: { min: 0, max: 48, step: 4, unit: 'px' },
        },
        {
          type: 'toggle-group', name: 'textAlign', label: 'Text Alignment',
          defaultValue: 'center',
          configs: {
            options: [
              { value: 'left', label: 'Left' },
              { value: 'center', label: 'Center' },
              { value: 'right', label: 'Right' },
            ],
          },
        },
      ],
    },
    {
      group: 'Settings',
      inputs: [
        { type: 'switch', name: 'showViewAll', label: 'Show View All Button', defaultValue: true },
        {
          type: 'text', name: 'viewAllText', label: 'View All Text',
          defaultValue: 'View All',
          condition: (data) => data.showViewAll === true,
        },
      ],
    },
  ],
  childTypes: ['product-card'],
  presets: {
    heading: 'Featured Products',
    description: 'Check out our latest arrivals',
    productsPerRow: 4,
    gap: 16,
    textAlign: 'center',
    showViewAll: true,
    viewAllText: 'View All',
    children: [
      { type: 'product-card' },
      { type: 'product-card' },
      { type: 'product-card' },
      { type: 'product-card' },
    ],
  },
});
```
