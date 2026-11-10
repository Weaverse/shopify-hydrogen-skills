# Cart-Attribute Stash — Bridging the Webhook Cookie Gap

The single most reliable pattern for getting per-user identifiers (ad-click IDs, browser pixel cookies, GA client IDs) from a Hydrogen storefront into the **Shopify Orders webhook** for server-side conversion forwarders (Meta CAPI, Google Ads Enhanced Conversions, Traffic Junky, GoAffpro, Awin, etc.).

If you've ever wondered "why does my Meta CAPI Purchase event have no `fbp`/`fbc`?" or "why does Traffic Junky show conversions with no `aclid`?", this is the answer.

---

## The problem in one diagram

```
Browser                  Hydrogen worker        Shopify              Your webhook
─────────────────────    ──────────────────     ────────────        ─────────────
Cookies on .segai.cc:    Reads cookies from     Receives cart       Receives webhook
  _ga, _fbp, _fbc,         req.headers.Cookie   create / lines      WITHOUT cookies
  segai_attr (gclid,       on every storefront  mutation. Stores    (server-to-server
  tj_clickid, ref…)        request.             cart attributes.    POST from Shopify.)

         │                       │                    │                   │
         │  Add-to-Cart          │                    │                   │
         │ ──────────────────►   │  cartAttributes-   │                   │
         │                       │  Update ─────────► │                   │
         │                       │                    │ ─────────────────►│
         │                       │                    │  order.note_      │
         │                       │                    │  attributes has   │
         │                       │                    │  every stashed    │
         │                       │                    │  identifier ──────┘
```

**The Shopify Orders webhook is a server-to-server POST from Shopify's infrastructure to your endpoint. It carries no user cookies.** The user's `_fbp`/`_fbc`/`_ga`/`gclid` lived in their browser and never crossed the network on the webhook hop. Any forwarder that reads from request context (which is the natural pattern for a `/api/track` browser endpoint) will silently degrade on the webhook path.

The fix: snapshot every identifier the user has on their browser into the cart's `attributes` (Storefront API) / `note_attributes` (Admin API / webhook payload) at the moment they touch the cart server-side. The webhook handler reads them back from `order.note_attributes`.

---

## Identifiers that need stashing

| Cookie              | Purpose                                        | Forwarder using it          |
| ------------------- | ---------------------------------------------- | --------------------------- |
| `_ga`               | GA4 client_id (`_ga` cookie's `<rand>.<ts>` tail) | GA4 Measurement Protocol  |
| `_fbp`              | Meta browser id                                | Meta Conversions API        |
| `_fbc`              | Meta click id (fbclid wrap)                    | Meta Conversions API        |
| `_gcl_aw` (or own) | Google Ads click id (gclid)                    | Google Ads Enhanced Conv.   |
| custom attribution  | tj_clickid, ref (GoAffpro), awc (Awin), …      | Affiliate S2S postbacks     |

If you maintain your own first-party cross-subdomain attribution cookie (recommended: it survives ITP / consent-denied / browser-blocked first-party `_gcl_aw`), keep `gclid`, `tj_clickid`, `ref`, `aff`, etc. in there.

---

## Where to stash: the cart entry paths

This is the trap most implementations fall into. On Hydrogen 2026.10 (Pilot `main`) the cart is mutated by more than one server path, and your stash logic needs to run in **each** one that creates or changes a cart. There is no `context.cart` and no `CartForm` action route anymore: cart forms and the cart store post to Hydrogen's `/api/cart` handlers, which `server.ts` registers through `handleShopifyRoutes`.

### Path 1 — `POST /api/cart` (the cart store)

The regular Add-to-Cart flow: `useProductForm()` / `useCartForm()` forms and `window.Shopify.actions.updateCart()` all post to `/api/cart`. To run code around it, register your own `POST /api/cart` handler **before** `cartHandlers` (the first match wins) and delegate to `cartHandlers.post`, the way Pilot's `createPilotCartHandlers()` in `app/.server/cart.ts` already does for the market sync:

```ts
// app/.server/cart.ts
import { cartQueries, createShopifyRouteHandler, type ShopifyRouteHandlerContext } from "@shopify/hydrogen";
import { buildAttributionCartAttrsFromCookies } from "~/utils/attribution";

type Attribute = { key: string; value: string | null };
type StashCart = { id?: string; attributes?: Attribute[] } | null | undefined;

const CART_GID_PREFIX = "gid://shopify/Cart/";

/** The `cart` cookie holds the cart token without the GID prefix. */
function readCartCookie(cookieHeader: string | null) {
  const token = cookieHeader?.match(/(?:^|;\s*)cart=([^;]*)/)?.[1];
  if (!token) return null;
  const id = decodeURIComponent(token);
  return id.startsWith(CART_GID_PREFIX) ? id : CART_GID_PREFIX + id;
}

/**
 * The cart the mutation produced. JSON requests (the hydrated cart store) get
 * it in the result. Form posts (submitted before hydration or without JS) get
 * a redirect instead, so read the cart ID from the new `cart` cookie the
 * handler set (first add) or from the request's cookie, and query it.
 */
async function resolveMutatedCart(
  result: Awaited<ReturnType<typeof cartHandlers.post>>,
  context: Omit<ShopifyRouteHandlerContext, "sessionManager">,
): Promise<StashCart> {
  if (result.type === "json") {
    return (result.data as { cart?: StashCart }).cart;
  }
  if (result.type !== "redirect") return null; // an error: nothing to stash
  const setCookies = new Headers(result.headers).getSetCookie();
  const cartId =
    readCartCookie(setCookies.find((c) => c.startsWith("cart=")) ?? null) ??
    readCartCookie(context.request.headers.get("Cookie"));
  if (!cartId) return null;
  const { data } = await context.storefrontClient.graphql(cartQueries.cart, {
    variables: { id: cartId },
  });
  return data?.cart;
}

export const attributionCartHandler = {
  post: createShopifyRouteHandler(
    "/api/cart",
    "POST",
    async (context: Omit<ShopifyRouteHandlerContext, "sessionManager">) => {
      const result = await cartHandlers.post(context);

      // After ANY successful cart mutation, merge attribution identifiers
      // into the cart's attributes. Idempotent — skips when the cart already
      // carries them.
      const desired = buildAttributionCartAttrsFromCookies(
        context.request.headers.get("Cookie"),
      );
      if (desired.length === 0) return result;
      // Best-effort — never fail the cart mutation if this hiccups.
      const cart = await resolveMutatedCart(result, context).catch(() => null);
      if (cart?.id) {
        const existing = cart.attributes ?? [];
        const missing = desired.filter(
          (d) => !existing.some((e) => e.key === d.key && e.value === d.value),
        );
        if (missing.length > 0) {
          const preserveKeys = new Set(desired.map((d) => d.key));
          const attributes = [
            ...existing
              .filter((e) => !preserveKeys.has(e.key))
              .map((e) => ({ key: e.key, value: e.value ?? "" })),
            ...desired,
          ];
          await context.storefrontClient
            .graphql(cartQueries.cartAttributesUpdate, {
              variables: { cartId: cart.id, attributes },
            })
            .catch(() => undefined);
        }
      }
      return result;
    },
  ),
};
```

`cartHandlers.post` answers a JSON request with `{ type: "json", data }` and any other request (a cart `<form>` posted before hydration or without JavaScript) with `{ type: "redirect", location, headers }`. A redirect can also mean the request was rejected before any mutation; the merge below is idempotent, so stashing on the existing cart is still safe. Handle both: a stash that only reads `result.data` silently skips every no-JS add even though the mutation succeeded and the attribution cookies exist. On a first add, the redirect's `headers` carry the new `cart` cookie; otherwise the cart ID is in the request's cookie. Hydrogen keeps its own cookie reader internal, so the sample parses the cookie itself (`cart=<token>`, token without the `gid://shopify/Cart/` prefix).

Register it in `server.ts` ahead of `cartHandlers` in the `handlers` array. If you already have an app-owned `POST /api/cart` (Pilot's syncs the cart's market and customer first), fold the stash into that handler instead of adding a second one: only the first matching handler runs.

The merge step matters: Shopify's `cartAttributesUpdate` mutation **replaces** the full attributes set, so you must send the union to avoid clobbering whatever the storefront has already written (e.g. by a 3rd-party app's tracker). The same rule applies on the client: the cart store's `attributes-update` also replaces the whole list, so any client-side attribute editor must resend the stashed `_*` keys it finds in `state.data.attributes`.

### Path 2 — GET `/cart/<variantId>:<qty>` permalink

The **Buy-now / instant-checkout** flow, generated by links like:

```tsx
<a href={`/cart/${variantId}:${qty}`}>Buy now</a>
```

Hydrogen 2026.10 answers cart permalinks itself inside `handleShopifyRoutes` (it hands them to Shopify's own permalink). Pilot's `server.ts` intercepts permalinks **without** a `payment` param and lets React Router serve them from `app/routes/cart/lines.tsx`, a LOADER (GET, no form data) that creates the cart with `storefront.graphql(cartQueries.cartCreate, …)` and redirects to checkout. **This path never touches `/api/cart`.** Without the stash here, every Buy-now purchase lands in Shopify with empty `note_attributes`.

```ts
// app/routes/cart/lines.tsx
import { cartQueries, createCartCookie } from "@shopify/hydrogen";
import { buildAttributionCartAttrsFromCookies } from "~/utils/attribution";

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const { storefront } = context;
  // ... parse linesMap from params.lines, read ?discount=

  // Stash attribution at cart creation. `cartCreate`'s input accepts
  // `attributes`, so this is a single round-trip.
  const attributionAttrs = buildAttributionCartAttrsFromCookies(
    request.headers.get("Cookie"),
  );

  const result = await storefront.graphql(cartQueries.cartCreate, {
    variables: {
      input: {
        lines: linesMap,
        discountCodes: discount ? [discount] : [],
        buyerIdentity: { countryCode: storefront.i18n.country },
        ...(attributionAttrs.length > 0 ? { attributes: attributionAttrs } : {}),
      },
    },
  });

  // ... set createCartCookie(cart.id), redirect to cart.checkoutUrl
}
```

Permalinks **with** `payment` (the Shop Pay button's links) stay with Hydrogen's handler and Shopify's permalink, so no app code runs on them; attribution on that path relies on Shopify's own checkout tracking.

### Path 3 (optional) — the checkout hand-off

Pilot's checkout button goes through `app/routes/cart/checkout.tsx`, a loader that syncs the cart's country and redirects to `checkoutUrl` with `appendForwardedAttribution()`. It is the last server hop before checkout, so it is a good place for a final idempotent stash (`cartQueries.cartAttributesUpdate` with the merged list) when cookies were set after the cart was created.

If your theme has additional cart-mutating endpoints (e.g. an upsell handler, a "save for later" feature), apply the same pattern there.

---

## The cookie reader

A single helper that reads every identifier from `request.headers.Cookie` and returns the `[{key, value}]` shape Shopify expects.

```ts
// app/utils/attribution.ts

export function readNamedCookieFromHeader(
  cookieHeader: string | null | undefined,
  name: string,
): string | undefined {
  if (!cookieHeader) return undefined;
  const prefix = `${name}=`;
  const match = cookieHeader.split(/;\s*/).find((c) => c.startsWith(prefix));
  if (!match) return undefined;
  const value = match.slice(prefix.length);
  return value || undefined;
}

/** Parse `_ga` → GA4 client_id ("<rand>.<ts>"). */
export function readGaClientIdFromCookieHeader(
  cookieHeader: string | null | undefined,
): string | undefined {
  const raw = readNamedCookieFromHeader(cookieHeader, "_ga");
  if (!raw) return undefined;
  const parts = raw.split(".");
  return parts.length >= 4 ? `${parts[2]}.${parts[3]}` : undefined;
}

export function buildAttributionCartAttrsFromCookies(
  cookieHeader: string | null | undefined,
): Array<{ key: string; value: string }> {
  // Your own cross-subdomain attribution cookie (gclid, tj_clickid, ref, …)
  const attribution = readAttributionFromCookieHeader(cookieHeader);
  const clientId = readGaClientIdFromCookieHeader(cookieHeader);
  const fbp = readNamedCookieFromHeader(cookieHeader, "_fbp");
  const fbc = readNamedCookieFromHeader(cookieHeader, "_fbc");
  const gclid = attribution.gclid;
  const tjClickId = attribution.tj_clickid;
  // GoAffpro's loader normalises ref/aff/gfp_ref to one cookie; mirror.
  const goaffproRef =
    attribution.gfp_ref ?? attribution.ref ?? attribution.aff;

  const attrs: Array<{ key: string; value: string }> = [];
  // Prefix with `_` so they sort/cluster in the Shopify Order Admin UI
  // and don't collide with the merchant's own attribute keys.
  if (clientId) attrs.push({ key: "_segai_ga_client_id", value: clientId });
  if (fbp) attrs.push({ key: "_segai_fbp", value: fbp });
  if (fbc) attrs.push({ key: "_segai_fbc", value: fbc });
  if (gclid) attrs.push({ key: "_segai_gclid", value: gclid });
  if (tjClickId) attrs.push({ key: "_segai_tj_clickid", value: tjClickId });
  if (goaffproRef) attrs.push({ key: "_segai_goaffpro_ref", value: goaffproRef });
  return attrs;
}
```

(Rename the `_segai_` prefix to your own brand. Keep `_` leading-underscore — it conventionally signals "internal" in Shopify cart-attribute UIs and is preserved through to the order.)

---

## Reading them back in the webhook

```ts
// app/.server/tracking/shopify-order.ts
export function shopifyOrderToTrackEvent(order: ShopifyOrderPayload): TrackEvent {
  const noteAttr = (key: string): string | undefined =>
    order.note_attributes?.find((a) => a.name === key)?.value ?? undefined;

  const clientId    = noteAttr("_segai_ga_client_id");
  const fbp         = noteAttr("_segai_fbp");
  const fbc         = noteAttr("_segai_fbc");
  const gclid       = noteAttr("_segai_gclid");
  const tjClickId   = noteAttr("_segai_tj_clickid");
  const goaffproRef = noteAttr("_segai_goaffpro_ref");

  return {
    event_id: `purchase_${order.id}`, // deterministic dedup key
    event_name: "purchase",
    custom_data: {
      transaction_id: String(order.id),
      currency: order.currency,
      value: Number(order.total_price),
      items: /* ... */,
      // Forward identifiers under canonical keys each forwarder expects:
      ...(tjClickId   ? { tj_clickid:   tjClickId }   : {}),
      ...(goaffproRef ? { goaffpro_ref: goaffproRef } : {}),
      ...(fbp         ? { fbp }                       : {}),
      ...(fbc         ? { fbc }                       : {}),
      ...(gclid       ? { gclid }                     : {}),
    },
    user_data: {
      email: order.email,                            // hashed downstream
      phone: order.customer?.phone,                  // hashed downstream
      external_id: order.customer?.id?.toString(),
      client_id: clientId,                           // GA4 MP needs this
    },
    consent: {
      // Shopify's checkout enforced the customer's choice. The PII fields
      // wouldn't be on the order if the customer declined them, so we
      // declare full grant here to let downstream forwarders use them.
      analytics_storage: "granted",
      ad_storage: "granted",
      ad_user_data: "granted",
      ad_personalization: "granted",
    },
  };
}
```

Then forwarders fall back to `event.custom_data.fbp` / `.fbc` / `.gclid` when their request context doesn't have them (i.e. on the webhook path):

```ts
// app/.server/tracking/forwarders/meta-capi.ts
function buildUserData(event: ValidatedEvent, ctx: RequestContext): MetaUserData {
  const out: MetaUserData = {};
  // ...
  out.fbp = ctx.fbp ?? asString(event.custom_data?.fbp);
  out.fbc = ctx.fbc ?? asString(event.custom_data?.fbc);
  if (!out.fbp) delete out.fbp;
  if (!out.fbc) delete out.fbc;
  return out;
}
```

The Google Ads forwarder already accepts `event.custom_data.gclid` in most reference implementations. TJ / GoAffpro / Awin forwarders should read their identifier under a canonical key (e.g. `event.custom_data.tj_clickid`).

---

## Why not client-side stash?

A tempting alternative is to do the stash in a React `useEffect` somewhere — typically in the cart drawer or cart summary component:

```tsx
// ❌ DON'T DO THIS — racy, mounts only when cart UI is rendered
useEffect(() => {
  const attribution = getAttribution();
  window.Shopify?.actions?.updateCart({ attributes: [/* ... */] });
}, [cart]);
```

This breaks in two ways:

1. **It only runs when the component mounts.** If the user goes PDP → "Buy now" → checkout, the cart drawer/page is never rendered → effect never runs → cart attrs stay empty.

2. **Race against checkout click.** Even when the drawer does open, the user can click "Continue to checkout" within ~200ms — before the async fetcher mutation completes — and navigate away with no attributes set.

The server-side stash runs in the same network round-trip as the cart mutation itself, so there's no race and no UI-mount dependency.

---

## What to verify after deploying

1. Visit `<site>.com/?tj_clickid=TEST_001&gclid=GCL_TEST&fbclid=FB_TEST` in incognito.
2. Add any item to cart (any flow — Add-to-Cart drawer, /cart page, or "Buy now").
3. Reload the cart (or check the next `GET /api/cart` response in DevTools Network): the cart's `attributes` should now carry the `_*` keys. For Buy-now, check the order in step 5 instead (the permalink redirects straight to checkout).
4. Complete checkout with the Bogus Gateway.
5. **Shopify Order Admin → Additional Details** lists every populated key.
6. **Meta Events Manager → Test Events**: the Purchase event shows `fbp` / `fbc` populated. Match-quality score for the Purchase event goes up.
7. **Google Ads conversion diagnostics**: Purchase matches on `gclid`. Enhanced Conversions match rate increases.
8. **GA4 DebugView**: the server-side purchase event arrives with the correct `client_id` (same as the user's storefront session).

---

## What's still racy: the cookie capture itself

This whole pattern presumes the user's cookies are already set when they touch the cart. There's a separate hydration-race concern:

```
SSR page render (0ms)
  ↓
hydration starts (~50–200ms)
  ↓
useEffect runs → captureAttributionFromUrl() writes segai_attr cookie  ← LATE
  ↓
user clicks "Buy now" → GET /cart/<id>:<qty> with the cookie
```

If the user clicks faster than hydration completes, the cookie isn't set yet → cart-attribute stash sees an empty cookie → empty attrs on cart. This is a separate issue from what this doc covers. Options:

1. **Set the attribution cookie server-side from URL params** in your storefront route loader (e.g. add `Set-Cookie` to the root route's response). Trade-off: this disables Oxygen full-page cache for that response — see [`oxygen-full-page-cache.md`](./oxygen-full-page-cache.md).
2. **Read URL params directly in `lines.tsx`** as a fallback when the cookie isn't set yet:
   ```ts
   const cookieAttrs = buildAttributionCartAttrsFromCookies(request.headers.get("Cookie"));
   const urlAttrs = buildAttributionCartAttrsFromSearch(url.search); // mirror function
   const merged = mergeCartAttrs(urlAttrs, cookieAttrs); // url wins on absent keys
   ```
   (Doesn't help the `POST /api/cart` path because that request URL carries no attribution params.)

For most flows where the user lands, browses, then converts, hydration completes long before any cart interaction. The race only matters for extremely fast "land → click Buy now" flows.

---

## Related references

- [`architecture.md`](./architecture.md) — the full client/server tracking topology
- [`webhook-forwarding-via-builder.md`](./webhook-forwarding-via-builder.md) — the Shopify Orders webhook → `/api/track` flow
- [`gotchas.md`](./gotchas.md) — assorted other traps
