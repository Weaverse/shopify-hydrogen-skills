# Cart

Sources:
- https://github.com/Shopify/hydrogen/blob/main/packages/hydrogen/src/cart/createCartHandler.ts
- https://github.com/Shopify/hydrogen/blob/main/packages/hydrogen/src/cart/CartForm.tsx

## Cart Route Setup

All cart mutations are handled via a dedicated cart route action:

```ts
// app/routes/cart.tsx
import {json} from 'react-router'
import {CartForm} from '@shopify/hydrogen'
import type {ActionFunctionArgs} from 'react-router'

export async function action({context, request}: ActionFunctionArgs) {
  const {cart} = context
  const formData = await request.formData()
  const {action, inputs} = CartForm.getFormInput(formData)

  switch (action) {
    case CartForm.ACTIONS.LinesAdd:
      return json(await cart.addLines(inputs.lines))
    case CartForm.ACTIONS.LinesUpdate:
      return json(await cart.updateLines(inputs.lines))
    case CartForm.ACTIONS.LinesRemove:
      return json(await cart.removeLines(inputs.lineIds))
    case CartForm.ACTIONS.DiscountCodesUpdate:
      return json(await cart.updateDiscountCodes(inputs.discountCodes))
    case CartForm.ACTIONS.BuyerIdentityUpdate:
      return json(await cart.updateBuyerIdentity(inputs.buyerIdentity))
    case CartForm.ACTIONS.NoteUpdate:
      return json(await cart.updateNote(inputs.note))
    default:
      throw new Error(`Unknown cart action: ${action}`)
  }
}

export async function loader({context}: LoaderFunctionArgs) {
  return json(await context.cart.get())
}
```

## CartForm

A form component that uses React Router's `useFetcher` internally. Submits a hidden `cartFormInput` field containing the serialized action and inputs.

```tsx
import {CartForm} from '@shopify/hydrogen'

// Children can be a render prop — receives the fetcher
<CartForm
  route="/cart"
  action={CartForm.ACTIONS.LinesAdd}
  inputs={{lines: [{merchandiseId: variantId, quantity: 1, selectedVariant}]}}
>
  {(fetcher) => (
    <button type="submit" disabled={fetcher.state !== 'idle'}>
      {fetcher.state !== 'idle' ? 'Adding...' : 'Add to cart'}
    </button>
  )}
</CartForm>

// Or plain children
<CartForm route="/cart" action={CartForm.ACTIONS.LinesRemove} inputs={{lineIds: [lineId]}}>
  <button type="submit">Remove</button>
</CartForm>
```

**Props:**

| Prop | Type | Description |
|------|------|-------------|
| `action` | `CartForm.ACTIONS[key]` | The cart action to perform |
| `inputs` | object | Action-specific inputs (see below) |
| `route` | `string` | Route to submit to. Defaults to current route |
| `fetcherKey` | `string` | Optional key for `useFetcher` |
| `children` | `ReactNode \| (fetcher) => ReactNode` | Render prop receives fetcher |

## CartForm.ACTIONS

```ts
CartForm.ACTIONS = {
  AttributesUpdateInput: 'AttributesUpdateInput',
  BuyerIdentityUpdate: 'BuyerIdentityUpdate',
  Create: 'Create',
  DiscountCodesUpdate: 'DiscountCodesUpdate',
  GiftCardCodesUpdate: 'GiftCardCodesUpdate',
  GiftCardCodesAdd: 'GiftCardCodesAdd',
  GiftCardCodesRemove: 'GiftCardCodesRemove',
  LinesAdd: 'LinesAdd',
  LinesRemove: 'LinesRemove',
  LinesUpdate: 'LinesUpdate',
  NoteUpdate: 'NoteUpdate',
  SelectedDeliveryOptionsUpdate: 'SelectedDeliveryOptionsUpdate',
  MetafieldsSet: 'MetafieldsSet',
  MetafieldDelete: 'MetafieldDelete',
  DeliveryAddressesAdd: 'DeliveryAddressesAdd',
  DeliveryAddressesUpdate: 'DeliveryAddressesUpdate',
  DeliveryAddressesRemove: 'DeliveryAddressesRemove',
  DeliveryAddressesReplace: 'DeliveryAddressesReplace',
}
```

**Inputs per action:**

| Action | Required inputs |
|--------|----------------|
| `LinesAdd` | `lines: OptimisticCartLineInput[]` — include `selectedVariant` for optimistic UI |
| `LinesUpdate` | `lines: CartLineUpdateInput[]` |
| `LinesRemove` | `lineIds: string[]` |
| `DiscountCodesUpdate` | `discountCodes: string[]` |
| `GiftCardCodesUpdate` | `giftCardCodes: string[]` |
| `GiftCardCodesAdd` | `giftCardCodes: string[]` |
| `GiftCardCodesRemove` | `giftCardCodes: string[]` |
| `BuyerIdentityUpdate` | `buyerIdentity: CartBuyerIdentityInput` |
| `NoteUpdate` | `note: string` |
| `AttributesUpdateInput` | `attributes: AttributeInput[]` |
| `SelectedDeliveryOptionsUpdate` | `selectedDeliveryOptions: CartSelectedDeliveryOptionInput[]` |
| `MetafieldsSet` | `metafields: MetafieldWithoutOwnerId[]` |
| `MetafieldDelete` | `key: string` |
| `DeliveryAddressesAdd` | `addresses: CartSelectableAddressInput[]` |
| `DeliveryAddressesUpdate` | `addresses: CartSelectableAddressUpdateInput[]` |
| `DeliveryAddressesRemove` | `addressIds: string[]` |
| `DeliveryAddressesReplace` | `addresses: CartSelectableAddressInput[]` |

## CartForm.getFormInput

Parses a `FormData` object into a `CartActionInput`. Checkbox values are auto-coerced: `'on'` → `true`, `'off'` → `false`. Other form fields are merged into `inputs`.

```ts
const {action, inputs} = CartForm.getFormInput(formData)
```

## useOptimisticCart

Applies pending cart mutations optimistically before the server responds. Requires `selectedVariant` to be passed in `LinesAdd` inputs.

```tsx
import {useOptimisticCart} from '@shopify/hydrogen'

function Cart({cart: serverCart}) {
  const cart = useOptimisticCart(serverCart)

  return (
    <ul>
      {cart.lines.nodes.map((line) => (
        <li key={line.id} style={{opacity: line.isOptimistic ? 0.5 : 1}}>
          {line.merchandise.product.title}
          {line.isOptimistic && ' (adding...)'}
        </li>
      ))}
    </ul>
  )
}
```

**Optimistic cart properties:**

| Property | Description |
|----------|-------------|
| `cart.isOptimistic` | `true` when any optimistic state is pending |
| `line.isOptimistic` | `true` for lines not yet confirmed by the server |
| `cart.totalQuantity` | Recalculated to include optimistic lines |
| `cart.cost` | Recalculated optimistically when possible |

> If `selectedVariant` is missing from a `LinesAdd` input, `useOptimisticCart` logs a warning and skips the optimistic update for that line.

## Auto-creating the Cart

Several methods automatically create a new cart if none exists:

- `addLines` — creates cart with the lines
- `updateDiscountCodes` — creates cart with discount codes
- `updateGiftCardCodes` — creates cart with gift card codes
- `updateBuyerIdentity` — creates cart with buyer identity
- `updateNote` — creates cart with note
- `updateAttributes` — creates cart with attributes
- `setMetafields` — creates cart with metafields

Methods that do NOT auto-create (they require an existing cart ID):
`updateLines`, `removeLines`, `removeGiftCardCodes`, `updateSelectedDeliveryOption`, `deleteMetafield`, all delivery address methods.

## Custom Methods

```ts
const cart = createCartHandler({
  storefront,
  getCartId: cartGetIdDefault(request.headers),
  setCartId: cartSetIdDefault(),
  customMethods: {
    // Override existing method
    addLines: async (lines, params) => {
      // custom logic before/after
      return cartHandler.addLines(lines, params)
    },
    // Add new method
    addLineWithTracking: async (line, params) => {
      trackEvent('add_to_cart', line)
      return cartHandler.addLines([line], params)
    },
  },
})
```

## Client-Side Cart Bootstrap Pitfalls

When the cart moves out of the root loader into a post-hydration `/api/cart`
fetch (to keep SSR documents anonymous for full-page caching), four bugs
follow unless designed around. All four were flagged by review and fixed in
Weaverse/pilot#409 + #410 (June 2026):

1. **Locale loss** — a hard-coded `load("/api/cart")` runs the cart query in
   the default market on `/fr-ca/...` pages. Build the URL with the active
   locale prefix (`usePrefixPathWithLocale("/api/cart")`).
2. **Null-response race** — a pre-cookie bootstrap can resolve `cart: null`
   AFTER a fast add-to-cart mutation created a cart, wiping it. Non-null
   responses can be guarded by `updatedAt` comparison; null ones carry no
   timestamp — snapshot a module-level mutation counter before each load and
   only clear the store if it is unchanged.
3. **Stale token/cart after redirects** — the old root loader revalidated on
   auth actions and cookie-setting GET redirects (discount-code routes); a
   mount-only bootstrap doesn't. Re-run the load on `location.key`.
4. **`cart_viewed` with null cart** — Hydrogen's `<Analytics.CartView>`
   publish effect is keyed on `[publish, url, shopId]` and NEVER replays when
   the provider's cart context updates later. Direct `/cart` landings fire
   before the bootstrap resolves. Gate the component on a `cartBootstrapped`
   store flag set when the first response is applied — and RESET the flag at
   the start of every navigation re-load, or GET cart mutators
   (`/discount/:code?redirect=/cart`) publish the pre-navigation cart.
5. **Module-ref resurrection** — if a `useCart()` merge consults a
   module-level "freshest fetcher cart" ref before the store, an accepted
   `cart: null` bootstrap must clear that ref too, or it keeps resurrecting
   a cart whose cookie expired or was completed at checkout.

**Non-bugs (verified against Hydrogen dist, don't "fix"):**
- The null→bootstrapped-cart transition does NOT emit fake add-to-cart
  events: `CartAnalytics` resolves loader promises through the same
  `setCarts` path and gates emission on the `cartLastUpdatedAt` localStorage
  record either way.
- Optimistic carts don't leak synthetic line ids into analytics as long as
  the optimistic transform preserves `updatedAt` — `CartAnalytics` ignores
  carts whose `updatedAt` matches the previous one.

## Oxygen FPC keying fact (for review triage)

Oxygen's full-page cache keys entries by the **full request URL including the
query string**, plus `Vary`'d headers; the worker is not invoked on hits.
(shopify.dev/docs/storefronts/headless/hydrogen/caching/full-page-cache,
Shopify/hydrogen discussion #2513.) Claims that it "matches by path and
ignores search params" are wrong — `/search?q=a` vs `?q=b` are distinct
entries. Query-param diversity costs cache cardinality, never wrong content.
`Vary: Cookie` makes every cookie string a separate key — it effectively
disables FPC; prefer gating storage on personalization cookies instead.
