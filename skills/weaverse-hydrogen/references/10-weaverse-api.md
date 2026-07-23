# Weaverse API Reference

> Complete reference for Weaverse hooks, components, and utilities.

## Core Imports

```tsx
// Main imports
import {
  createSchema,
  WeaverseClient,
  WeaverseHydrogenRoot,
  withWeaverse,
  useWeaverse,
  useThemeSettings,
  useItemInstance,
  useParentInstance,
  useChildInstances,
  getSelectedProductOptions,
  IMAGES_PLACEHOLDERS,
} from '@weaverse/hydrogen';

// Type imports
import type {
  HydrogenComponent,
  HydrogenComponentProps,
  HydrogenComponentSchema,
  HydrogenThemeSchema,
  ComponentLoaderArgs,
  WeaverseImage,
  WeaverseVideo,
} from '@weaverse/hydrogen';
```

---

## WeaverseClient

Server-side class for interacting with Weaverse services. Initialized in `server.ts`.

### Initialization

```tsx
// server.ts
import { WeaverseClient } from '@weaverse/hydrogen';
import { components } from '~/weaverse/components';
import { themeSchema } from '~/weaverse/schema.server';

export async function createAppLoadContext(request, env, executionContext) {
  let hydrogenContext = createHydrogenContext({ env, request, cache, waitUntil, session, /* ... */ });

  return {
    ...hydrogenContext,
    weaverse: new WeaverseClient({
      ...hydrogenContext,
      request,
      cache,
      themeSchema,
      components,
    }),
  };
}
```

### loadPage()

Load a Weaverse page's data including component loaders.

```tsx
weaverse.loadPage({
  type?: PageType,       // 'INDEX' | 'PRODUCT' | 'COLLECTION' | 'PAGE' | 'BLOG' | 'ARTICLE' | 'CUSTOM'
  handle?: string,       // Page/product/collection handle
  locale?: string,       // e.g., 'en-us', 'fr-ca'
  projectId?: string,    // For multi-project setups
  strategy?: CacheOptions, // Caching strategy
}): Promise<WeaverseLoaderData | null>
```

**Usage in routes:**

```tsx
// Homepage
let weaverseData = await context.weaverse.loadPage({ type: 'INDEX' });

// Product page
let weaverseData = await context.weaverse.loadPage({ type: 'PRODUCT', handle: params.handle });

// Collection page
let weaverseData = await context.weaverse.loadPage({ type: 'COLLECTION', handle: params.handle });

// Custom page
let weaverseData = await context.weaverse.loadPage({ type: 'PAGE', handle: params.handle });

// Blog
let weaverseData = await context.weaverse.loadPage({ type: 'BLOG', handle: params.blogHandle });

// Article
let weaverseData = await context.weaverse.loadPage({ type: 'ARTICLE', handle: params.articleHandle });
```

### loadThemeSettings()

Load global theme settings.

```tsx
let themeSettings = await context.weaverse.loadThemeSettings();
// Returns HydrogenThemeSettings with all values from schema.server.ts
```

### fetchWithCache()

Fetch external APIs with Hydrogen caching.

```tsx
let data = await weaverse.fetchWithCache<T>(url, {
  method: 'GET',
  headers: { 'API-Key': env.MY_API_KEY },
  strategy: {
    maxAge: 60,
    staleWhileRevalidate: 600,
  },
});
```

---

## withWeaverse()

Higher-order component that wraps the root `App` component to enable Weaverse theming and component system.

```tsx
// app/root.tsx
import { withWeaverse } from '@weaverse/hydrogen';

function App() {
  return <Outlet />;
}

export default withWeaverse(App);
```

**Must be used in `root.tsx`.** This is required for Weaverse Studio to function.

---

## WeaverseHydrogenRoot

Renders Weaverse page content. Used in route components.

```tsx
import { WeaverseHydrogenRoot } from '@weaverse/hydrogen';

export default function Homepage() {
  return <WeaverseHydrogenRoot />;
}
```

The component:
1. Reads `weaverseData` from the route's loader data
2. Creates the Weaverse context
3. Renders all sections configured for this page in Weaverse Studio
4. Handles component tree rendering (parent-child relationships)

---

## Hooks

### useWeaverse()

Access the global Weaverse instance with page data, theme settings, and component registry.

```tsx
import { useWeaverse } from '@weaverse/hydrogen';

function MyComponent() {
  let { themeSettings, itemInstances, page, eventBus } = useWeaverse();

  // themeSettings — global theme settings object
  // itemInstances — Map<string, WeaverseItemStore> of all component instances
  // page — current page data (type, handle, sections)
  // eventBus — publish-subscribe for cross-component communication
}
```

### useThemeSettings()

Shortcut to access global theme settings.

```tsx
import { useThemeSettings } from '@weaverse/hydrogen';

function Header() {
  let { headerBgColor, logoWidth, stickyHeader } = useThemeSettings();

  return (
    <header style={{ backgroundColor: headerBgColor }}>
      <img src="/logo.png" style={{ width: `${logoWidth}px` }} />
    </header>
  );
}
```

### useItemInstance()

Access a specific component instance by ID.

```tsx
import { useItemInstance } from '@weaverse/hydrogen';

function SomeComponent() {
  let headerInstance = useItemInstance('site-header');

  if (headerInstance) {
    console.log(headerInstance.data); // component data
    headerInstance.updateData({ isSticky: true }); // update data
  }
}
```

### useParentInstance()

Access the parent component instance from a child.

```tsx
import { useParentInstance } from '@weaverse/hydrogen';

function ChildComponent() {
  let parent = useParentInstance();

  if (parent) {
    let parentLayout = parent.data.layout;
    // Adapt child rendering based on parent settings
  }
}
```

### useChildInstances()

Access child component instances.

```tsx
import { useChildInstances } from '@weaverse/hydrogen';

function ParentComponent() {
  let children = useChildInstances();

  // children is an array of WeaverseItemStore instances
  children.forEach(child => {
    console.log(child.data);
  });
}
```

---

## createSchema()

Define component schemas with Zod validation at build/dev time. Since `@weaverse/hydrogen` 5.16.0 the Zod runtime is dev-only — `createSchema()` is an identity pass-through in production and Zod tree-shakes out of the bundle.

```tsx
import { createSchema } from '@weaverse/hydrogen';

export let schema = createSchema({
  type: 'my-component',
  title: 'My Component',
  limit: 1,
  enabled: ({ page, group }) =>
    page.type === 'PRODUCT' && group === 'body',
  settings: [
    {
      group: 'Content',
      inputs: [
        { type: 'text', name: 'title', label: 'Title', defaultValue: 'Hello' },
      ],
    },
  ],
  childTypes: ['heading', 'paragraph'],
  presets: {
    title: 'Hello',
    children: [{ type: 'heading', content: 'Default Heading' }],
  },
});
```

`enabled` accepts a boolean or synchronous callback with `{ page: { id, type, handle, locale }, group }`. The callback runs in the storefront preview and must return a boolean immediately. Errors, Promises, and invalid results fail closed for new insertion; existing instances remain editable. `enabledOn` is deprecated and can be migrated by moving its page/group checks into the callback.

```tsx
import type {
  ComponentAvailabilityContext,
  ComponentGroup,
  Resolvable,
} from '@weaverse/hydrogen';
```

See [03-component-schema.md](03-component-schema.md) for full schema reference.

---

## Types

### HydrogenComponentProps

Base props interface for all Weaverse components.

```tsx
interface HydrogenComponentProps<LoaderData = unknown> {
  children?: React.ReactNode;
  loaderData?: LoaderData;
  className?: string;
  style?: React.CSSProperties;
  // ... other HTML attributes
}
```

### HydrogenComponentProps with Loader Data

```tsx
type Props = HydrogenComponentProps<Awaited<ReturnType<typeof loader>>> & {
  // component-specific props from schema
  heading: string;
  layout: 'grid' | 'list';
};
```

### ComponentLoaderArgs

```tsx
interface ComponentLoaderArgs<T = Record<string, unknown>> {
  weaverse: {
    storefront: HydrogenContext['storefront'];
    env: HydrogenEnv;
    fetchWithCache: <R>(url: string, options?: RequestInit) => Promise<R>;
  };
  data: T; // Component settings from schema
}
```

### WeaverseImage

```tsx
interface WeaverseImage {
  id?: string;
  url: string;
  altText?: string;
  width?: number;
  height?: number;
}
```

### HydrogenThemeSchema

```tsx
interface HydrogenThemeSchema {
  info: {
    version: string;
    author: string;
    name: string;
    documentationUrl?: string;
    supportUrl?: string;
  };
  settings: InspectorGroup[];
}
```

---

## Utility Functions

### getSelectedProductOptions()

Extract selected product options from URL search parameters.

```tsx
import { getSelectedProductOptions } from '@weaverse/hydrogen';

export async function loader({ request, context }: LoaderFunctionArgs) {
  const selectedOptions = getSelectedProductOptions(request);

  const { product } = await context.storefront.query(PRODUCT_QUERY, {
    variables: {
      handle: params.handle,
      selectedOptions,
    },
  });

  return { product };
}
```

### IMAGES_PLACEHOLDERS

Placeholder images for development.

```tsx
import { IMAGES_PLACEHOLDERS } from '@weaverse/hydrogen';

// Use in component presets or default values
export let schema = createSchema({
  type: 'hero',
  title: 'Hero',
  settings: [
    {
      group: 'Content',
      inputs: [
        {
          type: 'image',
          name: 'backgroundImage',
          label: 'Background',
          defaultValue: IMAGES_PLACEHOLDERS.banner,
        },
      ],
    },
  ],
});
```

Available placeholders: `banner`, `product`, `collection`, `blog`, `article`, `page`.
