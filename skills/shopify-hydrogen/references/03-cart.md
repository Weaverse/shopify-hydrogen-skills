# Cart

Reference implementation: Pilot's `app/.server/cart.ts`, `app/components/cart/cart-store.ts` and `app/components/cart/*`, on `@shopify/hydrogen` 2026.10.

## Overview

In Hydrogen 2026.10 the cart is two pieces:

- **Server:** `createCartServerHandlers({ fragment })` from `@shopify/hydrogen`, registered in `handleShopifyRoutes` (see `01-setup.md`). It serves `/api/cart` and manages the `cart` cookie.
- **Client:** `createCartComponents<typeof cartHandlers>()` from `@shopify/hydrogen/react`: `CartProvider`, `useCart`, `useCartForm`, `useCartActions`. Forms post to `/api/cart`, so they work without JavaScript; once hydrated, the store applies changes optimistically.

`context.cart`, `createCartHandler`, `CartForm`, `CartForm.ACTIONS`, `useOptimisticCart` and the `/cart` route action are gone. Delete the old `routes/api/cart.ts`-style route: Hydrogen owns `/api/cart`.

> Classic Hydrogen cart patterns (2026.4 and earlier) are covered in the `hydrogen-upgrades` skill.

## Server Handlers

```ts
// app/.server/cart.ts
import { createCartServerHandlers, gql } from "@shopify/hydrogen";

/**
 * Fields your cart UI renders beyond Hydrogen's default cart fields. Hydrogen
 * merges this into every cart query and mutation, so the store, the
 * `/api/cart` response and `refresh()` all carry them.
 */
const CART_FRAGMENT = gql(`
  fragment CartFragment on Cart {
    appliedGiftCards { id lastCharacters }
    buyerIdentity { countryCode }
    lines(first: 250) {
      nodes {
        # Line-level and order-level allocations together; replaces the
        # deprecated Cart.discountAllocations for the summary total.
        allDiscountAllocations: discountAllocations(lineLevelOnly: false) {
          discountedAmount { amount currencyCode }
        }
        merchandise {
          ... on ProductVariant {
            requiresComponents
          }
        }
      }
    }
  }
`);

export const cartHandlers = createCartServerHandlers({ fragment: CART_FRAGMENT });
```

`CartCost.totalDutyAmount` and `totalTaxAmount` are no longer populated; `hydrogen gql check --fail-on-warn` fails on deprecated fields.

## Client Store

```ts
// app/components/cart/cart-store.ts
import type { CartDataFromHandlers } from "@shopify/hydrogen";
import { createCartComponents } from "@shopify/hydrogen/react";
import type { cartHandlers } from "~/.server/cart";

export type CartData = CartDataFromHandlers<typeof cartHandlers>;
export type CartLineData = CartData["lines"]["nodes"][number];

export const {
  CartProvider,
  useCart,
  useSuspenseCart,
  useOptionalCart,
  useCartActions,
  useCartForm,
} = createCartComponents<typeof cartHandlers>();
```

Render the provider once in `app/root.tsx`:

```tsx
// inside the Layout <body>
<CartProvider>
  {/* header, main, footer */}
</CartProvider>
```

Render `CartProvider` **without** server `initialData`. The cart loads from `/api/cart` after hydration, so the HTML stays anonymous and Oxygen can full-page cache it.

## Reading State

`useCart` takes a selector:

```ts
const cart = useCart((state) => state.data);
const loading = useCart((state) => state.loading);
const note = useCart((state) => state.data.note);
const notePending = useCart((state) => state.pending.note);
const noteErrors = useCart((state) => state.errors.note);
const linePending = useCart((state) => state.pending.lines.has(line.id));
const discountPending = useCart((state) => state.pending.discountCodes.has(code));
const discountError = useCart((state) => state.errors.discountCodes.get(code));
```

## Cart Forms

`useCartForm()` returns `formProps()` for the `<form>` and `register(name, options)` for its fields and buttons.

```tsx
function ItemRemoveButton({ lineId }: { lineId: string }) {
  const { formProps, register } = useCartForm();
  return (
    <form {...formProps()}>
      <input type="hidden" {...register("lineId", { value: lineId })} />
      <button type="submit" {...register("remove")}>Remove</button>
    </form>
  );
}
```

```tsx
function QuantityAdjust({ line }: { line: CartLineData }) {
  const { formProps, register } = useCartForm();
  return (
    <form {...formProps()}>
      {/* first submit button: Enter in the input sets the quantity */}
      <button type="submit" {...register("set")} />
      <input type="hidden" {...register("lineId", { value: line.id })} />
      <button type="submit" {...register("decrease")} disabled={line.quantity <= 1}>−</button>
      <input {...register("quantity", { value: line.quantity, interactive: true })} />
      <button type="submit" {...register("increase")}>+</button>
    </form>
  );
}
```

```tsx
function DiscountForm() {
  const { formProps, register } = useCartForm();
  const [code, setCode] = useState("");
  return (
    // beforeSubmit can call event.preventDefault() to skip the submission
    <form {...formProps({ beforeSubmit: validate, afterSubmit: showPending })}>
      <input {...register("discountCode", { value: code })} onChange={(e) => setCode(e.target.value)} />
      <button type="submit">Apply</button>
    </form>
  );
}
```

Fields Pilot registers: `lineId`, `remove`, `set`, `increase`, `decrease`, `quantity`, `discountCode`, `note`. Add to cart from a product page goes through Hydrogen's product form store (`useProductForm()` with `merchandiseId`, `quantity`, `addToCart`); see the `weaverse-hydrogen` skill or Pilot's `app/components/product/product-form.tsx`.

## Refreshing After App-Owned Changes

After a change the store didn't make itself (a gift card, a market switch), refetch:

```ts
const { refresh } = useCartActions();
await fetch("/api/cart/gift-cards", { method: "POST", body });
refresh();
```

## App-Owned Cart Handlers

Hydrogen's handlers don't cover everything. Build extra endpoints with `createShopifyRouteHandler(path, method, handler)` and register them **before** `cartHandlers` in `handleShopifyRoutes` (the first match wins). Pilot's `createPilotCartHandlers()` adds:

- `POST /api/cart` that moves the cart into the request's market and onto the signed-in customer, drops a `cart` cookie whose cart no longer exists, then delegates to `cartHandlers.post({ ...context, request })`.
- `POST /api/cart/buyer-identity` for the country selector.
- `POST /api/cart/gift-cards` to add or remove gift cards.

Pilot keeps `/cart/:lines` permalinks (without a `payment` param), `/discount/:code` and `/cart/checkout` as React Router routes. Hydrogen answers permalinks with `payment` (Shop Pay). `getCartId(request)` from `@shopify/hydrogen` reads the cart cookie.

`/api/*` handler paths are never market-prefixed. Pilot resolves their market from the same-origin `Referer`.

## Cart Analytics

`useCartAnalytics()` from `@shopify/hydrogen/react` publishes `cart_updated`, `product_added_to_cart` and `product_removed_from_cart` from the cart store to `window.Shopify.analytics`. Render it inside `CartProvider`, after `ShopifyScripts`.

## Oxygen FPC keying fact (for review triage)

Oxygen's full-page cache keys entries by the **full request URL including the
query string**, plus `Vary`'d headers; the worker is not invoked on hits.
(shopify.dev/docs/storefronts/headless/hydrogen/caching/full-page-cache,
Shopify/hydrogen discussion #2513.) Claims that it "matches by path and
ignores search params" are wrong — `/search?q=a` vs `?q=b` are distinct
entries. Query-param diversity costs cache cardinality, never wrong content.
`Vary: Cookie` makes every cookie string a separate key — it effectively
disables FPC; prefer gating storage on personalization cookies instead.
