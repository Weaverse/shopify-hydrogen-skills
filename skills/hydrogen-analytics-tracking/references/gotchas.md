# Gotchas — Things That Bite Every Tracking Implementation

Real bugs encountered in production. Read this first when something isn't working.

## "Add-to-cart event is in GTM Preview but not in GA4"

**Symptom:** GTM Preview shows the `add_to_cart` dataLayer push event in the timeline. Right-pane "Output of G-XXXXXXX" says `此代码未发送任何命中` / "no hits sent".

**Cause:** No GA4 Event tag in GTM is configured with a Custom Event trigger for `add_to_cart`. The push lands in dataLayer but nothing forwards it.

**Fix:** Add a tag. See [`gtm-meta-implementation.md`](./gtm-meta-implementation.md) for the recipe. Bonus tip: audit your whole container's e-comm coverage — typically only `purchase` is set up and everything else (view_item, add_to_cart, begin_checkout, view_cart, generate_lead) is missing.

## "GA4 shows view_item → purchase, skipping view_cart and add_to_cart entirely"

**Cause #1:** Buy-now buttons that use Shopify cart permalinks (`/cart/{variantId}:{quantity}?checkout`) teleport directly to Shopify's checkout subdomain. They bypass Hydrogen's cart, so:

- Hydrogen's `AnalyticsEvent.PRODUCT_ADD_TO_CART` never dispatches (nothing called `cart.linesAdd`).
- The Hydrogen cart's checkout button is never clicked, so `AnalyticsEvent.CART_VIEWED` / `begin_checkout` doesn't fire either.

**Fix:** In the Buy-now `onClick`, manually fire both:

```tsx
<a
  href={`/cart/${variantId}:${quantity}?checkout`}
  onClick={() => {
    trackEvent({ event_name: "add_to_cart", custom_data: { currency, value, items } });
    trackEvent({ event_name: "begin_checkout", custom_data: { currency, value, items } });
  }}
>
  Buy now
</a>
```

`sendBeacon` survives the navigation that follows. Each `trackEvent` returns its own UUID `event_id`; they're independent events for dedup purposes.

**Cause #2 (related):** Hydrogen's `PRODUCT_ADD_TO_CART` is dispatched by **diffing cart state after revalidation**, which has unreliable timing. Events often miss GA4 DebugView entirely. **Fix:** fire `add_to_cart` directly from the button onClick, not via the Hydrogen subscriber.

## "Meta CAPI shows no AddToCart events"

**Cause:** Meta CAPI's strict consent gate drops the event entirely when `ad_storage !== "granted"`. If your test session had cookies denied, no event is sent.

**Fix #1 — test correctly:** in incognito, accept the cookie banner BEFORE adding to cart. Then check Meta Events Manager → Test Events with your `META_TEST_EVENT_CODE`.

**Fix #2 — relax the gate (recommended):** rewrite the Meta forwarder so consent denial drops PII but still sends the event with `data_processing_options: ["LDU"]`. See [`gtm-meta-implementation.md`](./gtm-meta-implementation.md) §5.

## "view_item dataLayer push doesn't fire on PDP"

**Cause:** `<Analytics.ProductView>` is conditionally rendered:

```tsx
{selectedVariant && <Analytics.ProductView data={...} />}
```

For combined listings (or any product where the variant resolves after hydration), `selectedVariant` is `null` on first render. The analytics component never mounts and `PRODUCT_VIEWED` doesn't dispatch.

**Fix:** Remove the gate. Use safe fallbacks for variant-specific fields:

```tsx
<Analytics.ProductView
  data={{
    products: [{
      id: product.id,
      title: product.title,
      price: selectedVariant?.price?.amount || "0",
      vendor: product.vendor,
      variantId: selectedVariant?.id || "",
      variantTitle: selectedVariant?.title || "",
      quantity: 1,
    }],
  }}
/>
```

## "GTM Container Diagnostics: Unsupported tag implementation detected on Shopify"

**Cause:** Someone has pasted gtag.js / GA4 config into a Shopify Customer Events Custom Pixel (Settings → Customer events). At the same time you have the Google & YouTube sales channel app firing GA4. Both ship to the same `G-XXXXXXX` measurement ID.

**Effect:** Purchase events, page_views from the thank-you page, etc. are **double-counted**. Your GA4 reports show 2x the actual conversion rate.

**Fix:** Delete the duplicate Google tag from the Custom Pixel. Keep tracking only via the Google & YouTube sales channel app (Shopify-blessed, Google's modeled conversions only trust this route).

## "Tag Assistant standalone says 0 Google tags found"

**Cause:** GTM is loaded via Hydrogen's `<Script waitForHydration>` (or `requestIdleCallback`-based defer). The `<script>` tag is injected AFTER React hydrates, so Tag Assistant's initial HTML scan sees nothing.

**Fix:** Load GTM as a regular `<script async nonce={nonce}>` in `<head>` instead. See [`gtm-meta-implementation.md`](./gtm-meta-implementation.md) §1. Alternative: verify via GTM Preview's "Connected" mode (which uses runtime postMessage, doesn't care when the script loaded).

## "Custom Events Pixel for Meta double-fires Purchase"

**Cause:** Meta CAPI server webhook AND Customer Events Pixel both send a `Purchase` event for the same order, but with different `event_id` values. Meta's dedup contract is `(event_name, event_id)` — different ids = no dedup = double count.

**Fix:** Use a **deterministic** event_id derived from the Shopify order ID, on BOTH sides:

```ts
// Both Customer Events Pixel (browser) AND orders/create webhook (server)
event_id: `purchase_${order.id}`
```

This also makes the webhook idempotent on Shopify retry. No need to thread a UUID through cart attributes.

## "Meta Diagnostics: server event was not deduplicated" on a Hydrogen storefront

**Symptom:** Meta Events Manager → Diagnostics shows warnings like `服务器的“Purchase”事件未去重` / "Server `Purchase` event was not deduplicated" — typically for **Purchase, InitiateCheckout, and PageView** together. Meta says it can see two events for the same conversion and can't pair them.

**Cause:** Shopify's `Facebook & Instagram` app (when Data Sharing = Enhanced or Maximum) fires its own pixel+CAPI pair from the **Shopify-hosted checkout sandbox** (`checkout.{shop}.com`) with an internal `event_id` you cannot see or match. Your server CAPI webhook fires a third copy with your own event_id (e.g. `purchase_<order_id>`). Meta dedups by `(event_name, event_id)` across the whole pixel account — your event_id doesn't match Shopify's, so the third copy is unpaired.

**Critical Hydrogen nuance — read before reaching for a fix:**

The Shopify FB & Insta app pixel only reaches places where Shopify renders the page. On a Liquid Online Store, that's everywhere. On Hydrogen, that's **only the checkout sandbox** — there's no Liquid theme for Shopify to inject the pixel into your Hydrogen storefront.

Coverage map for Hydrogen + FB & Insta app at Maximum:

| Event | Hydrogen storefront | Shopify checkout | Covered by Shopify app? |
|---|---|---|---|
| `page_view` | ✅ fires here | ✅ also here | only the checkout fire |
| `view_item` / `view_item_list` / `view_cart` | ✅ here only | — | ❌ no |
| `add_to_cart` / `remove_from_cart` / `search` | ✅ here only | — | ❌ no |
| `begin_checkout` | — (or only as you fire it) | ✅ here | ✅ yes |
| `add_payment_info` | — | ✅ here | ✅ yes |
| `purchase` | — | ✅ here | ✅ yes |

So the dedup conflict is **only on the 3 checkout-stage events** — but Meta's diagnostic counters fire per-event-name across the whole account, so even storefront-only `page_view` fires get the warning if Shopify also fires `page_view` once from checkout. The warning is noisy but the underlying conflict is only for the checkout-stage events.

**Fix — do NOT blindly skip every event in your server CAPI forwarder.** That would break Meta coverage for all the storefront events that Shopify never sees.

Safe minimal skip:

```ts
// app/.server/tracking/forwarders/meta-capi.ts
const COVERED_BY_SHOPIFY_CHECKOUT_PIXEL = new Set([
  "page_view",        // Shopify fires it once at checkout; storefront PVs
                      // still attract the diagnostic warning because Meta
                      // matches by event_name. Skipping is a noise/value
                      // trade — you lose modeled-PV signal on storefront.
  "begin_checkout",   // Shopify fires this from checkout sandbox.
  "add_payment_info", // Same.
]);
if (COVERED_BY_SHOPIFY_CHECKOUT_PIXEL.has(event.event_name)) {
  return { ok: true, skipped: true, reason: "covered_by_shopify_checkout" };
}
```

For **Purchase** specifically: do NOT just skip it. Purchase is the most attribution-critical event and your webhook is the only ground-truth source (covers ad-blocked / iOS / abandoned-and-recovered cases that the checkout pixel misses). Instead:

1. Install a **Custom Pixel** on Shopify checkout (`docs/cr001/checkout-pixel.js`) that fires `fbq('track', 'Purchase', ..., {eventID: 'purchase_' + initData.checkout.order.id})` browser-side with the SAME event_id format as your server CAPI. This pairs YOUR pixel fire with YOUR server fire — separate from Shopify's app pixel's own internal pair. Meta sees two clean dedup pairs and counts Purchase once.
2. Keep `purchase` flowing to all other forwarders (GA4 MP, Google Ads, Traffic Junky, GoAffpro, Awin) from the same webhook.

**Trap to avoid:** It's tempting to assume "FB & Insta app at Maximum already covers everything, drop all 11 mapped events from our forwarder." On Liquid this would be roughly correct. On **Hydrogen this drops Meta coverage entirely for 8 storefront events the app never touches** — your AddToCart, ViewContent, Search funnel reporting goes dark. Always check whether your storefront is Liquid or Hydrogen before extrapolating Shopify-Meta integration advice.

**Verification:** After the skip ships, wait ~24h for Meta Diagnostics to recompute. PageView/InitiateCheckout/AddPaymentInfo warnings should clear. If Purchase warning persists, that's the signal to install the Custom Pixel.

## "GTM tag fires inline scripts, CSP violations spam the console"

**Cause:** Custom HTML tags in GTM inject `<script>` blocks at runtime without the page nonce. Per CSP3 spec, when `nonce-XXX` is present in `script-src`, `'unsafe-inline'` is IGNORED — so un-nonced inline scripts get blocked.

**Fix:** Add `'strict-dynamic'` to `script-src`. This tells the browser to trust whatever the nonced root scripts (gtm.js, your inline `<head>` bootstrap) dynamically load — including Custom HTML tag inline scripts. See [`csp-for-tracking.md`](./csp-for-tracking.md).

## "GA4 Measurement Protocol events skip with reason: no_client_id"

**Cause:** Your server-side GA4 forwarder requires `client_id` to send to GA4 MP, but the request had none. This happens when:

- Visitor declined the cookie banner → no `_ga` cookie → no client_id → server skips.
- First visit + cookie banner not yet accepted → same.

**This is correct behavior** — sending events with random client_ids would pollute your GA4 property with "phantom" sessions that don't tie to any real user.

**If you really want partial coverage:** generate a stable fallback client_id from `crypto.randomUUID()` per session, store in `sessionStorage`, and use it as the fallback. Be aware that these sessions show as "Direct / None" and may inflate session counts.

## "_shopify_essential cookie disables Oxygen full-page cache"

**Cause:** Hydrogen's Storefront API client attaches `Set-Cookie: _shopify_essential=...` to every response that ran `storefront.query()`. Oxygen FPC's contract disallows `Set-Cookie` on cacheable responses, so even with a correct `Oxygen-Cache-Control` header you get `oxygen-cache-status: uncacheable`.

**Fix:** In `entry.server.tsx`, strip `Set-Cookie` from responses that opted into FPC. See [`oxygen-full-page-cache.md`](./oxygen-full-page-cache.md).

## "Shopify Plus checkout doesn't get my GTM container"

**Cause:** Shopify Plus checkout pages (`/checkouts/cn/*`) lock down the page to Shopify-managed scripts only. Your merchant GTM container (GTM-XXXXX) **cannot** be injected, by design.

**This is not a bug.** The Shopify-blessed pattern is:

- **Google (GA4, Google Ads, Merchant Center)** → fire from the "Google & YouTube" Sales Channel app (its own tag ID, e.g. `GT-XXXXXXXX`, posting to the same measurement IDs you configured in your GTM).
- **Non-Google vendors (Meta Pixel + CAPI, TikTok, etc.)** → use a Custom Customer Events Pixel under Shopify Admin → Settings → Customer events.

**To prove tracking is still working on checkout:** pull a HAR of `/checkouts/cn/*` and grep for `analytics.google.com/g/collect` (GA4) and `googleadservices.com` + `gcs=G111` (Google Ads consent-signal-granted). GA4 will receive purchase events from the sales channel even though GTM Preview shows nothing on those pages.

## "View Source has no GA4 / GTM scripts but they DO load"

Probably normal. `<Script waitForHydration>`, `requestIdleCallback`, and most analytics defer patterns inject scripts via DOM manipulation AFTER initial HTML parse. View Source shows initial HTML only; DevTools → Elements shows the post-hydration DOM, which DOES include the injected scripts.

To verify: in DevTools → Network → filter `gtm.js` → reload. Status 200 = GTM is loading.

## "`form_start` appears in GA4 DebugView, where does it come from?"

GA4 Enhanced Measurement auto-events. `form_start` fires the first time a visitor focuses/types in any `<form>` element on a page where the GA4 tag is loaded. Enabled by default in GA4 → Admin → Data Streams → Enhanced Measurement → "Form interactions".

It's NOT something you push to dataLayer. If you see it appearing around the time of `add_to_cart` failures, **don't conflate them** — `form_start` is fired by GA4 itself when the user clicks into the Shopify checkout's email field; the `add_to_cart` issue is separate.

## "`[shopify-account] <shopify-store> custom element is not registered`"

**Cause:** You loaded only `cdn.shopify.com/storefront/web-components/account.js`. That bundle registers `<shopify-account>` but does NOT synchronously register `<shopify-store>` — it dynamic-imports a chunked `./account/store-*.js` which arrives AFTER `<shopify-account>`'s `connectedCallback` fires. The callback checks `customElements.get("shopify-store")`, finds nothing, emits the warning, and the account UI renders empty (no login icon).

The symmetric trap: loading only `cdn.shopify.com/storefront/web-components.js` — that bundle DOES register `<shopify-store>` but does NOT register `<shopify-account>`, so the inner element stays undefined and the icon also doesn't render.

**Fix:** Load BOTH bundles, in document order, as module scripts (deferred + ordered by default). Don't use `async` — it breaks order, and if `account.js` runs before `web-components.js` the same warning fires.

```tsx
<head>
  <script type="module" src="https://cdn.shopify.com/storefront/web-components.js" defer nonce={nonce} />
  <script type="module" src="https://cdn.shopify.com/storefront/web-components/account.js" defer nonce={nonce} />
</head>
```

See [`csp-for-tracking.md`](./csp-for-tracking.md) for the full bundle map.

## "PUBLIC_STORE_DOMAIN is a read-only env var managed by Hydrogen, and it's a bare hostname"

You can't modify it in Oxygen admin. The bare-hostname format (e.g. `your-shop.myshopify.com`) breaks the Shopify Storefront Web Components' `<shopify-store store-domain>` attribute, which expects a full URL.

**Fix:** normalize in your component:

```tsx
const storeDomainUrl = publicStoreDomain
  ? publicStoreDomain.startsWith("http")
    ? publicStoreDomain
    : `https://${publicStoreDomain}`
  : undefined;
```

Defensive guard: if `storeDomainUrl` is undefined (env not set), render a placeholder icon instead of mounting `<shopify-store store-domain="">` which would build the malformed `https://.your-domain.com/...` URL.

## "Webhook receiver returns 401 invalid_signature for every event"

**Cause #1:** You parsed the body as JSON and re-stringified it for HMAC verification. JSON serialisation isn't byte-stable — key order and whitespace differ. The signature won't match.

**Fix:** Always read the body as TEXT first, verify HMAC against the raw bytes, then `JSON.parse()` for actual use.

```ts
const rawBody = await request.text();
const hmacHeader = request.headers.get("x-shopify-hmac-sha256");
const valid = await verifyShopifyHmac(rawBody, hmacHeader, secret);
if (!valid) return new Response("invalid_signature", { status: 401 });
const order = JSON.parse(rawBody);  // ← parse AFTER verification
```

**Cause #2:** Wrong secret. If you're using Weaverse's webhook-forwarding feature (see [`webhook-forwarding-via-builder.md`](./webhook-forwarding-via-builder.md)), the secret you store as `SHOPIFY_WEBHOOK_SECRET` is the **per-forward signing secret returned when you created the forward**, NOT Shopify's app secret. Easy to confuse.

## "I rotated GA4_API_SECRET but events still hit the old secret"

**Cause:** Oxygen env var changes don't trigger an automatic worker restart. The change is staged but the running worker holds the old value.

**Fix:** Trigger a deploy (any commit + push), OR in Oxygen admin manually click "Deploy" on the storefront. New workers will pick up the new secret.

## "Meta CAPI Purchase events have no fbp/fbc" / "Google Ads conversions don't match on gclid" / "affiliate postback shows conversion but no click ID"

**Symptom:** The browser-side `/api/track` events work fine — fbp/fbc/gclid land in Meta / GA4. But the server-side `purchase` event from the Shopify orders webhook always lands without them. Match quality drops on Meta. Google Ads Enhanced Conversions falls back to user-identifier-only matching. Affiliate networks (Traffic Junky, GoAffpro, Awin, …) show conversions with empty `aclid` / `ref`.

**Cause:** The Shopify Orders webhook is a server-to-server POST from Shopify's infrastructure to your endpoint. **It carries none of the user's browser cookies.** Any forwarder that reads identifiers from request context (the natural pattern for the `/api/track` browser endpoint, e.g. `ctx.fbp = req.cookies._fbp`) will silently get empty values on the webhook path. No error thrown; the forwarder just sends a worse-quality event.

**Fix:** Stash every identifier into `cart.note_attributes` server-side, on the same network round-trip as the cart mutation. Webhook reads them back from `order.note_attributes`. Full pattern — including the `_ga`/`_fbp`/`_fbc` cookie readers, the cart-action handler, and the **second cart entry path** that catches buy-now flows — lives in [`cart-attribute-stash.md`](./cart-attribute-stash.md).

## "Cart attributes are empty for Buy-now purchases only"

**Symptom:** Normal Add-to-Cart → cart drawer → checkout works perfectly. The order's `note_attributes` has every identifier you stash. But "Buy now" purchases (the button that goes straight from PDP to checkout) consistently land with `note_attributes: []` / `customAttributes: []` in the Shopify SubmitForCompletion mutation. The TJ / GoAffpro / Meta CAPI forwarders skip silently.

**Cause:** "Buy now" buttons typically use Shopify's cart-permalink pattern `/cart/<variantId>:<qty>?checkout`, which is handled by a LOADER (`app/routes/cart/lines.tsx`) that calls `cart.create()` and immediately redirects. **It never touches the POST `/cart` action handler**, so any attribution-stash logic placed there never runs for this flow. Standard Hydrogen templates have this gap by default.

**Fix:** Add the same stash to `lines.tsx` before the `cart.create()` call. Shopify's `cartCreate` mutation accepts `attributes` in the same input as `lines`, so it's a single round-trip:

```ts
import { buildAttributionCartAttrsFromCookies } from "~/utils/attribution";

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const { cart } = context;
  // ... parse lines
  const attributionAttrs = buildAttributionCartAttrsFromCookies(
    request.headers.get("Cookie"),
  );
  const result = await cart.create({
    lines: linesMap,
    discountCodes: discountArray,
    ...(attributionAttrs.length > 0 ? { attributes: attributionAttrs } : {}),
  });
  // ... redirect to checkout
}
```

Audit your own routes for any other cart-mutating code path (e.g. a `/cart/upsell` endpoint, share-cart feature) and apply the same pattern there.

## "3rd-party affiliate tracker's loader.js is POSTing to /cart/update.js and getting 405"

**Symptom:** Browser console shows `POST https://yoursite.com/cart/update.js 405` from a script like `api.goaffpro.com/loader.js`. The request body looks like `attributes[__ref]=AFFILIATE_CODE&attributes[__sub_id]=...`.

**Cause:** Affiliate trackers (GoAffpro, Refersion, etc.) were designed for **Shopify Liquid themes**, which expose AJAX cart endpoints like `/cart/update.js`, `/cart/add.js`, `/cart.js`. Hydrogen has none of these — its cart routes use loaders/actions on `/cart` (no `.js` suffix). Their loader's auto-stash of attribution into cart attributes silently fails.

**Fix:** Two complementary approaches:

1. **Don't rely on their tracker for cart attributes.** Implement the server-side cart-attribute stash yourself (see [`cart-attribute-stash.md`](./cart-attribute-stash.md)). Capture the same identifiers their loader captures (typically `?ref=` / `?aff=` / `?gfp_ref=` URL params) into your own attribution cookie, then stash from that cookie into cart attrs on the server. Their `/cart/update.js` 405 becomes harmless noise.

2. **Optionally silence the 405** by adding a Hydrogen route that 204s the request:

   ```ts
   // app/routes/cart/update.js.ts  (or app/routes/cart.update[.]js.tsx in older templates)
   export async function action() { return new Response(null, { status: 204 }); }
   export async function loader() { return new Response(null, { status: 204 }); }
   ```

   Don't actually parse + apply the body — your own stash already handles the same data via the cookie route, with merge logic that doesn't clobber other apps' attributes.

**For GoAffpro specifically:** their thank-you-page callback `/order_complete` is fired from `checkoutPageCallback()` in `loader.js`, which only runs on the Shopify thank-you page — a different subdomain (`checkout.<site>`) where the storefront's GTM doesn't run. Hydrogen storefronts must wire `/order_complete` themselves from the orders webhook. The `_segai_goaffpro_ref` cart attribute pattern + a server-side forwarder is the canonical path; the docs page is at <https://docs.goaffpro.com/how-tos/manual-integration/custom-shopify-integration>.

## "secrets leaked in chat / Slack / git"

If `SESSION_SECRET`, `SHOPIFY_WEBHOOK_SECRET`, `GA4_API_SECRET`, `META_CAPI_ACCESS_TOKEN`, or any private key was ever in clear text in a message that reached an external service (chat, AI assistant, screenshot in a JIRA ticket), **rotate immediately**:

- **`SESSION_SECRET`** — generate new in Oxygen env → redeploy.
- **`SHOPIFY_WEBHOOK_SECRET`** — Shopify admin → Notifications → re-issue, OR (if using Weaverse forwarding) `POST /api/webhook-forwards/{id}/rotate`.
- **`GA4_API_SECRET`** — GA4 Admin → Data Streams → Measurement Protocol API secrets → delete + create new.
- **`META_CAPI_ACCESS_TOKEN`** — Meta Business Manager → Pixel settings → re-issue.

Public-by-design IDs (`META_PIXEL_ID`, `GA4_MEASUREMENT_ID`, `GTM_ID`, `WEAVERSE_PROJECT_ID`) don't need rotation — they appear in the page's HTML anyway.
