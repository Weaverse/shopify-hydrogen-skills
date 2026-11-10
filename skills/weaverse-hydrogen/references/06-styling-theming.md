# 06 — Styling & Theming

> Tailwind CSS, theme settings, CVA, GlobalStyle, CSS variables.

## Tailwind CSS

Tailwind is the primary styling approach. All Weaverse Hydrogen themes include Tailwind out of the box.

```tsx
function HeroSection({ heading, ...rest }: HeroProps) {
  return (
    <section {...rest} className="relative min-h-[600px] flex items-center justify-center bg-gray-900">
      <div className="max-w-4xl mx-auto px-4 text-center">
        <h1 className="text-4xl md:text-6xl font-bold text-white tracking-tight">{heading}</h1>
      </div>
    </section>
  );
}
```

### Responsive Design

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
  {children}
</div>
```

---

## Global Theme Settings

Theme-wide settings (colors, typography, spacing) are defined in `app/weaverse/schema.server.ts`:

```tsx
import type { WeaverseThemeSchema } from '@weaverse/hydrogen/react-router';

export let themeSchema: WeaverseThemeSchema = {
  info: {
    version: '1.0.0',
    author: 'Weaverse',
    name: 'Pilot',
    authorProfilePhoto: 'https://example.com/logo.png',
    documentationUrl: 'https://docs.weaverse.io',
    supportUrl: 'mailto:support@weaverse.io',
  },
  settings: [
    {
      group: 'Colors',
      inputs: [
        { type: 'color', name: 'colorPrimary', label: 'Primary Color', defaultValue: '#000000' },
        { type: 'color', name: 'colorSecondary', label: 'Secondary Color', defaultValue: '#666666' },
        { type: 'color', name: 'colorBackground', label: 'Background', defaultValue: '#ffffff' },
        { type: 'color', name: 'colorText', label: 'Text Color', defaultValue: '#1a1a1a' },
      ],
    },
    {
      group: 'Typography',
      inputs: [
        {
          type: 'range', name: 'bodyBaseSize', label: 'Body Font Size',
          defaultValue: 16, configs: { min: 12, max: 24, step: 1, unit: 'px' },
        },
        {
          type: 'range', name: 'bodyBaseLineHeight', label: 'Body Line Height',
          defaultValue: 1.5, configs: { min: 1, max: 2, step: 0.1 },
        },
        {
          type: 'range', name: 'headingBaseSize', label: 'Heading Font Size',
          defaultValue: 32, configs: { min: 20, max: 60, step: 1, unit: 'px' },
        },
      ],
    },
    {
      group: 'Layout',
      inputs: [
        {
          type: 'range', name: 'navHeightDesktop', label: 'Nav Height (Desktop)',
          defaultValue: 64, configs: { min: 40, max: 120, step: 4, unit: 'px' },
        },
        {
          type: 'range', name: 'pageWidth', label: 'Max Page Width',
          defaultValue: 1280, configs: { min: 960, max: 1600, step: 40, unit: 'px' },
        },
      ],
    },
  ],
};
```

> **Note:** `settings` replaces the deprecated `inspector` property in theme schemas too.

---

## GlobalStyle Component

Convert theme settings to CSS custom properties:

```tsx
// app/components/GlobalStyle.tsx
import { useThemeSettings } from '@weaverse/hydrogen/react-router';

export function GlobalStyle() {
  let settings = useThemeSettings();
  if (!settings) return null;

  let {
    colorPrimary,
    colorSecondary,
    colorBackground,
    colorText,
    bodyBaseSize,
    bodyBaseLineHeight,
    headingBaseSize,
    navHeightDesktop,
    pageWidth,
  } = settings;

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
          :root {
            /* Colors */
            --color-primary: ${colorPrimary};
            --color-secondary: ${colorSecondary};
            --color-background: ${colorBackground};
            --color-text: ${colorText};

            /* Typography */
            --body-base-size: ${bodyBaseSize}px;
            --body-base-line-height: ${bodyBaseLineHeight};
            --heading-base-size: ${headingBaseSize}px;

            /* Layout */
            --nav-height-desktop: ${navHeightDesktop}px;
            --page-width: ${pageWidth}px;
          }

          body {
            font-size: var(--body-base-size);
            line-height: var(--body-base-line-height);
            color: var(--color-text);
            background-color: var(--color-background);
          }
        `,
      }}
    />
  );
}
```

Place `<GlobalStyle />` in your root layout (inside `root.tsx`).

---

## `useThemeSettings()` Hook

Access global theme settings in any component:

```tsx
import { useThemeSettings } from '@weaverse/hydrogen/react-router';

function Header() {
  let { colorPrimary, navHeightDesktop, logoUrl } = useThemeSettings();

  return (
    <header
      style={{
        height: `${navHeightDesktop}px`,
        backgroundColor: colorPrimary,
      }}
    >
      {/* header content */}
    </header>
  );
}
```

### TypeScript

```tsx
type MyThemeSettings = {
  colorPrimary: string;
  bodyBaseSize: number;
  navHeightDesktop: number;
};

let settings = useThemeSettings<MyThemeSettings>();
```

---

## `withWeaverse()` HOC

Required in `root.tsx` to provide theme settings context. Pilot wraps the root `Layout` export:

```tsx
// app/root.tsx
import { withWeaverse } from '@weaverse/hydrogen/react-router';
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import { GlobalStyle } from '~/weaverse/style';

export const Layout = withWeaverse(function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <Meta />
        <Links />
        <GlobalStyle />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
});

export default function App() {
  return <Outlet />;
}
```

---

## Class Variance Authority (CVA)

For components with multiple variants, use CVA:

```tsx
import { cva, type VariantProps } from 'class-variance-authority';

let buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none',
  {
    variants: {
      variant: {
        primary: 'bg-blue-600 text-white hover:bg-blue-700',
        secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300',
        outline: 'border border-gray-300 bg-transparent hover:bg-gray-50',
        ghost: 'bg-transparent hover:bg-gray-100',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-base',
        lg: 'h-12 px-6 text-lg',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

type ButtonProps = VariantProps<typeof buttonVariants> & {
  children: React.ReactNode;
};

function Button({ variant, size, children, ...rest }: ButtonProps) {
  return (
    <button className={buttonVariants({ variant, size })} {...rest}>
      {children}
    </button>
  );
}
```

Use CVA variants in your schema:

```tsx
settings: [
  {
    group: 'Style',
    inputs: [
      {
        type: 'select', name: 'variant', label: 'Style',
        defaultValue: 'primary',
        configs: {
          options: [
            { value: 'primary', label: 'Primary' },
            { value: 'secondary', label: 'Secondary' },
            { value: 'outline', label: 'Outline' },
          ],
        },
      },
      {
        type: 'toggle-group', name: 'size', label: 'Size',
        defaultValue: 'md',
        configs: {
          options: [
            { value: 'sm', label: 'S' },
            { value: 'md', label: 'M' },
            { value: 'lg', label: 'L' },
          ],
        },
      },
    ],
  },
],
```

---

## Using CSS Variables in Tailwind

Reference CSS variables from your theme in Tailwind config:

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        secondary: 'var(--color-secondary)',
      },
      fontSize: {
        body: 'var(--body-base-size)',
        heading: 'var(--heading-base-size)',
      },
      maxWidth: {
        page: 'var(--page-width)',
      },
    },
  },
};
```

Then use in components:

```tsx
<div className="bg-primary text-body max-w-page mx-auto">
  {children}
</div>
```
