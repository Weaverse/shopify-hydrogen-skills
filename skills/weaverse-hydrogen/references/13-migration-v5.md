# Migration Guide: Remix → React Router v7 (Weaverse v5)

> **Historical (v5).** This guide covers the 2025 move from Remix to React Router v7 with `@weaverse/hydrogen` 5.x on classic Hydrogen. Its imports (`@weaverse/hydrogen`, `HydrogenThemeSchema`, `ComponentLoaderArgs`, `createHydrogenContext`, ...) are v5 APIs. Current themes use `@weaverse/hydrogen` 6 on Hydrogen 2026.10: see [15-migration-v6.md](15-migration-v6.md), the [v6 migration guide](https://docs.weaverse.io/migration-advanced/v6-migration), and the [Hydrogen 2026.4.7 → 2026.10.2 upgrade guide](../../hydrogen-upgrades/references/upgrade-2026.4.7-to-2026.10.2.md).

> Migrate your Weaverse Hydrogen project from Remix to React Router v7.

## Overview

Weaverse v5 migrates from Remix to React Router v7, aligning with Shopify Hydrogen's May 2025 release. This is a major version upgrade with breaking changes.

## Migration Options

### Option 1: Fresh Start (Recommended)

```bash
npx @weaverse/cli@latest create --template=pilot --project-id="your-project-id"
```

Then copy your custom sections, components, and configurations to the new project.

**Best for:** simpler projects, primarily custom sections.

### Option 2: In-Place Upgrade

Follow the steps below to upgrade your existing project.

## In-Place Migration Steps

### Step 1: Enable Remix Future Flags

First, enable all future flags in `vite.config.ts` and test:

```tsx
// vite.config.ts
export default defineConfig({
  plugins: [
    reactRouter({
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
        v3_lazyRouteDiscovery: true,
        v3_routeConfig: true,
        v3_singleFetch: true,
      },
    }),
  ],
});
```

### Step 2: Run the Codemod

```bash
npx codemod remix/2/react-router/upgrade
```

This updates imports and component usage automatically.

### Step 3: Create react-router.config.ts

```tsx
// react-router.config.ts
import type { Config } from '@react-router/dev/config';

export default {
  appDirectory: 'app',
  buildDirectory: 'dist',
  ssr: true,
} satisfies Config;
```

### Step 4: Update vite.config.ts

```tsx
import tailwindcss from '@tailwindcss/vite';
import { hydrogen } from '@shopify/hydrogen/vite';
import { oxygen } from '@shopify/mini-oxygen/vite';
import { reactRouter } from '@react-router/dev/vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    hydrogen(),
    oxygen(),
    reactRouter(),
    tsconfigPaths(),
  ],
});
```

### Step 5: Update Dependencies

```bash
npm install --force \
  @weaverse/hydrogen@5.0.0 \
  @shopify/hydrogen@2025.5.0 \
  @shopify/remix-oxygen@3.0.0 \
  @shopify/cli@3.80.4
```

### Step 6: Update Imports

**Before (Remix):**
```tsx
import { useLoaderData, useNavigate, Link } from '@remix-run/react';
import type { LoaderFunctionArgs, ActionFunctionArgs } from '@shopify/remix-oxygen';
import { json, redirect } from '@shopify/remix-oxygen';
```

**After (React Router v7):**
```tsx
import { useLoaderData, useNavigate, Link } from 'react-router';
import type { LoaderFunctionArgs, ActionFunctionArgs } from 'react-router';
import { data, redirect } from 'react-router';
```

**Key import changes:**

| Before | After |
|--------|-------|
| `@remix-run/react` | `react-router` |
| `@shopify/remix-oxygen` (types) | `react-router` |
| `json()` | `data()` (or just return object) |
| `RemixServer` | `ServerRouter` |

### Step 7: Update entry.server.tsx

```tsx
// Before
import { RemixServer } from '@remix-run/react';

// After
import { ServerRouter } from 'react-router';
```

In the render:

```tsx
// Before
<RemixServer context={routerContext} url={request.url} />

// After
<ServerRouter context={routerContext} url={request.url} nonce={nonce} />
```

### Step 8: Update TypeScript Config

**tsconfig.json:**
```json
{
  "include": [
    "./**/*.d.ts",
    "./**/*.ts",
    "./**/*.tsx",
    ".react-router/types/**/*"
  ],
  "compilerOptions": {
    "rootDirs": [".", "./.react-router/types"]
  }
}
```

**env.d.ts:**
```tsx
declare module 'react-router' {
  interface LoaderFunctionArgs {
    context: AppLoadContext;
  }
  interface ActionFunctionArgs {
    context: AppLoadContext;
  }
}
```

### Step 9: Update .gitignore

```gitignore
# React Router
.react-router/
```

### Step 10: json() → data() or Plain Return

```tsx
// Before (Remix)
import { json } from '@shopify/remix-oxygen';
export async function loader({ context }: LoaderFunctionArgs) {
  return json({ products });
}

// After (React Router v7) — Option A: data()
import { data } from 'react-router';
export async function loader({ context }: LoaderFunctionArgs) {
  return data({ products });
}

// After (React Router v7) — Option B: Plain return (simpler)
export async function loader({ context }: LoaderFunctionArgs) {
  return { products };
}
```

## Weaverse-Specific Changes

### No Changes Needed For:

- **Component code** — Weaverse components don't import from Remix directly
- **Schema definitions** — `createSchema()` is unchanged
- **Component loaders** — `ComponentLoaderArgs` is unchanged
- **Theme schema** — `HydrogenThemeSchema` is unchanged

### Changes Needed:

1. **`@weaverse/hydrogen` version** — Upgrade to v5.0.0+
2. **Route files** — Update imports as described above
3. **entry.server.tsx** — Update to `ServerRouter`
4. **WeaverseHydrogenRoot** — No API change, but ensure route loaders return `weaverseData`

## Testing Checklist

- [ ] `npm run dev` starts without errors
- [ ] All pages load correctly
- [ ] Weaverse Studio preview works
- [ ] Custom components render correctly
- [ ] Forms and cart interactions work
- [ ] `npm run build` completes
- [ ] `npm run typecheck` passes
- [ ] Production deployment works

## Common Issues

### Import Errors

If you see `Cannot find module '@remix-run/react'`:
→ Update import to `react-router`

### Type Errors

If `LoaderFunctionArgs` has wrong types:
→ Ensure `env.d.ts` augments `react-router` module

### Build Errors

If React Router config not found:
→ Ensure `react-router.config.ts` exists in project root

### Studio Preview Broken

If Weaverse Studio doesn't load preview:
→ Ensure `@weaverse/hydrogen@5.0.0+` is installed
→ Check CSP allows weaverse.io domains
→ Verify route loaders return `weaverseData`
