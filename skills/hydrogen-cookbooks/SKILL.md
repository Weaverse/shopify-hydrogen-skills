---
name: hydrogen-cookbooks
description: "Step-by-step implementation guides for building features in a Shopify Hydrogen 2026.10 + Weaverse storefront (Pilot) — bundles, combined listings, customer accounts, 3D models, performance, variant media, and Weaverse integration."
---

# Hydrogen Cookbooks

Concrete, step-by-step guides for building specific features in a Shopify Hydrogen storefront. Each cookbook is a self-contained recipe with code, file changes, and implementation notes.

The cookbooks target **Hydrogen 2026.10** (`@shopify/hydrogen` as a request-handler library), React Router 7 and `@weaverse/hydrogen` 6, with [Pilot](https://github.com/Weaverse/pilot) as the reference implementation. They track Pilot's own copies in `.guides/cookbooks/`. For a project still on classic Hydrogen (2026.4 and earlier), migrate first with the hydrogen-upgrades skill's [2026.4.7 → 2026.10.2 guide](../hydrogen-upgrades/references/upgrade-2026.4.7-to-2026.10.2.md).

## Live Documentation

Run these from this skill's own folder. The helpers ship inside the sibling
`shopify-hydrogen` skill, so `../shopify-hydrogen/scripts/` exists whenever the
whole pack is installed.

If you installed this skill on its own, that folder is absent and the commands
below fail with `MODULE_NOT_FOUND`. Add the helpers once:

```bash
npx skills add Weaverse/shopify-hydrogen-skills --skill shopify-hydrogen
```

The `references/` files in this skill remain a usable offline fallback if you
would rather not install it.

For the latest Hydrogen cookbook recipes from Shopify:

```bash
node ../shopify-hydrogen/scripts/search_shopify_docs.mjs "hydrogen cookbook <topic>"
```

For Weaverse-specific patterns:

```bash
node ../shopify-hydrogen/scripts/search_weaverse_docs.mjs "<topic>"
```

The references below are curated guides that may include Weaverse-specific patterns not available in the live docs.

## Available Cookbooks

| Cookbook | Description |
|----------|-------------|
| [bundles.md](./references/bundles.md) | Where Pilot's bundle support lives (`requiresComponents`, badges, bundled variants) and an optional cart-line bundle badge |
| [combined-listings.md](./references/combined-listings.md) | Combined listings on the product form store — utilities, filters, media grouping, price range display |
| [customer-account-api.md](./references/customer-account-api.md) | Customer Account API on Hydrogen's OAuth handlers — setup, `npm run dev:https`, `context.customerAccount.graphql()` in new routes |
| [hydrogen-react-router.md](./references/hydrogen-react-router.md) | Import rules for React Router 7 + Hydrogen 2026.10 (Remix and classic Hydrogen imports → current ones) |
| [model-viewer.md](./references/model-viewer.md) | 3D model support (.glb/.usdz) with Pilot's local `ModelViewer` port and iOS AR |
| [performance-best-practices.md](./references/performance-best-practices.md) | Explicit query caching (`CACHE_*`), full-page cache, streaming, deferred data, third-party scripts, query optimization |
| [variant-media-grouping.md](./references/variant-media-grouping.md) | Group product media by variant option (e.g. Color) |
| [weaverse-hydrogen-integration.md](./references/weaverse-hydrogen-integration.md) | Complete Weaverse 6 integration: `WeaverseClient` in the app context, component registration, theme schema, data fetching |

## How to Use

Each cookbook describes:
- **What** the feature does
- **Prerequisites** to check first
- **Step-by-step implementation** — file changes, code snippets, diffs
- **Troubleshooting** — common issues and fixes

> File paths reference the Pilot theme. Adapt them to your project's structure.
