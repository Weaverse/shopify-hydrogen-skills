# Tracking Architecture for Hydrogen

The canonical pipeline. Read this first.

## The funnel & where each event source lives

```
                 ┌────────────────────────────────────────────────────┐
                 │              Storefront (Hydrogen)                 │
                 │                                                    │
   PDP load ──►  │  <Analytics.ProductView>  ─► PRODUCT_VIEWED        │
                 │       │                          │                  │
                 │       └──► <CustomAnalytics> ─► trackEvent()       │
                 │                                  │   │              │
   ATC click ─►  │  AddToCartButton.onClick ─► trackEvent()           │
                 │                                  │   │              │
                 └──────────────────────────────────┼───┼──────────────┘
                                                    │   │
                              ┌─────────────────────┘   └──────────┐
                              ▼                                    ▼
                ┌─────────────────────────┐         ┌──────────────────────────┐
                │  window.dataLayer.push  │         │  navigator.sendBeacon    │
                │  ↓                      │         │  POST /api/track          │
                │  GTM (GTM-XXXXX)        │         │  ↓                       │
                │  ↓                      │         │  forwardToGa4   ─► GA4 MP│
                │  GA4 (G-YYYYYYY)        │         │  forwardToMetaCapi ─► Meta│
                │  Meta Pixel (FB browser)│         │  forwardToGoogleAds ─► Ads│
                │  Google Ads (gtag)      │         │                          │
                │  TikTok Pixel           │         └──────────────────────────┘
                │  Hotjar / Clarity / …   │
                └─────────────────────────┘

  Checkout pages (locked to Shopify Plus checkout, no merchant GTM):
                 ┌────────────────────────────────────────────────────┐
                 │   "Google & YouTube" Sales Channel app             │
                 │     → GA4, Google Ads, Merchant Center             │
                 │   Shopify "Customer Events" Custom Pixel           │
                 │     → Meta Pixel (browser), TikTok, …              │
                 └────────────────────────────────────────────────────┘

  Order created (after thank-you page):
                 ┌────────────────────────────────────────────────────┐
                 │   Shopify orders/create webhook ─► /api/webhooks   │
                 │     → forwardToGa4 / forwardToMetaCapi / GAds      │
                 │     event_id = "purchase_" + shopify_order_id      │
                 │     (deterministic → idempotent on webhook retry,  │
                 │      and dedups against Customer Events Pixel's    │
                 │      browser Purchase event sent with the same id) │
                 └────────────────────────────────────────────────────┘
```

## File layout

```
app/
├── root.tsx                              # <Analytics.Provider>, GTM bootstrap, Consent Mode default
├── entry.server.tsx                      # CSP, Set-Cookie strip for FPC
├── components/
│   └── root/
│       ├── custom-analytics.tsx          # dataLayer bridge subscribed to Hydrogen events
│       └── consent-mode.tsx              # listens for visitorConsentCollected, updates gtag consent
├── utils/
│   ├── track-client.ts                   # trackEvent() helper (dataLayer push + sendBeacon)
│   └── attribution.ts                    # gclid/fbclid/utm capture into cross-domain cookie
├── routes/
│   └── api/
│       ├── track.ts                      # /api/track → orchestrator → all forwarders
│       └── webhooks-orders-create.ts     # Shopify HMAC + order → trackEvent payload
└── .server/
    └── tracking/
        ├── index.ts                      # orchestrator: validate → hash → forward to all
        ├── validate.ts                   # schema validation, consent gating, PII hash gating
        ├── hash.ts                       # SHA-256 of email/phone (lowercased, trimmed)
        ├── audit.ts                      # log forwarder results (success / skip reason / errors)
        ├── shopify-order.ts              # ShopifyOrder → TrackEvent mapping
        ├── shopify-hmac.ts               # webhook signature verification
        ├── types.ts                      # ValidatedEvent, RequestContext, ForwarderResult
        └── forwarders/
            ├── ga4.ts                    # GA4 Measurement Protocol POST
            ├── meta-capi.ts              # Meta Conversions API POST
            └── google-ads.ts             # Google Ads Enhanced Conversions
```

## The dual-send contract

For every trackable event, both legs MUST share the same `event_id`. This is non-negotiable — without it, Meta CAPI and GA4 will double-count.

### Client side (`app/utils/track-client.ts`)

```ts
export function trackEvent(input: TrackEventInput): string {
  const event_id = generateEventId();  // crypto.randomUUID() or polyfill
  if (typeof window === "undefined") return event_id;

  const { event_name, custom_data = {} } = input;

  // (1) dataLayer push for GTM/browser pixels. event_id field is what makes
  //     the Meta Pixel tag in GTM dedup against the server CAPI hit.
  window.dataLayer?.push({
    event: event_name,
    event_id,
    ...custom_data,
  });

  // (2) Server-side send. ALWAYS send (consent gating happens server-side
  //     where it can be expressed per vendor — see consent-mode.md).
  const payload = {
    event_id,
    event_name,
    event_time: Date.now(),
    custom_data: { ...custom_data, ...getAttribution() },
    user_data: { ...(input.user_data ?? {}), ...(readGaClientId() ? { client_id: readGaClientId() } : {}) },
    consent: getCurrentConsent(),
    page_url: window.location.href,
  };

  const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
  const ok = navigator.sendBeacon?.("/api/track", blob);
  if (!ok) {
    void fetch("/api/track", {
      method: "POST",
      keepalive: true,  // critical — survives page unload
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }

  return event_id;
}
```

**Why `sendBeacon` first, `fetch` with `keepalive` fallback:** the most important events (add_to_cart, begin_checkout, "Buy now") are immediately followed by navigation. Regular `fetch` gets aborted on page unload. `sendBeacon` is the browser API specifically designed for this and is fire-and-forget.

### Server side (`app/.server/tracking/index.ts`)

```ts
export async function handleTrack(request: Request, env: TrackingEnv, ctx: RequestContext) {
  const raw = await request.json();
  const validated = validate(raw);  // schema check, PII hashing (only if consent permits)

  // Fan out to all forwarders in parallel. Each returns its own status
  // independently — one failing doesn't affect the others.
  const results = await Promise.all([
    forwardToGa4(validated, env, ctx),
    forwardToMetaCapi(validated, env, ctx),
    forwardToGoogleAds(validated, env, ctx),
  ]);

  // Audit log every result for B6 observability. Skip reasons:
  //   no_client_id, ad_storage_denied (now: relaxed to LDU instead),
  //   meta_env_missing, http_4xx, no_user_match_keys, …
  for (const r of results) ctx.audit?.log({ event_id: validated.event_id, ...r });

  return Response.json({ ok: true, forwarders: results }, { status: 200 });
}
```

## When server-side is the only path that works

| Event source | Browser GTM works? | Server `/api/track` works? | Use which |
|---|---|---|---|
| Storefront `view_item`, `add_to_cart`, etc. | ✅ (with sendBeacon + nonce CSP) | ✅ | Both, dedup via event_id |
| `purchase` from Shopify thank-you page | ⚠ (only via Customer Events Pixel, locked surface) | ✅ via `orders/create` webhook | Webhook is canonical; pixel adds match-quality lift |
| Cart events from `/cart` route action | ❌ (server route, no browser) | ✅ | Server only |
| Background jobs (abandoned cart, refund) | ❌ | ✅ | Server only |

## Deterministic event_id for orders

For browser-side begin_checkout / add_to_cart, `event_id = crypto.randomUUID()` (one-shot).

For order events (purchase, refund, fulfilment), use a **deterministic** id derived from the order:

```ts
event_id = `purchase_${shopify_order_id}`
```

This guarantees:
- **Webhook idempotency** — if Shopify retries `orders/create`, the second call dedups against the first.
- **Cross-side dedup** — the Customer Events Pixel on Shopify's thank-you page can use the same scheme to send the browser Purchase event with `event_id: "purchase_" + orderId`. Meta/GA4 will dedup automatically against the webhook hit.

The alternative — stashing a GA-style UUID in `cart.attributes` at begin_checkout, then re-reading from the order's `note_attributes` — works but has more failure modes (cart attribute lost on payment retry, format encoding bugs, etc.). Use the simple ID scheme.

## Vendor mapping table

| `event_name` (GA4 standard) | Meta CAPI | Google Ads | TikTok |
|---|---|---|---|
| `page_view` | `PageView` | (built-in) | `ViewContent` |
| `view_item` | `ViewContent` | (built-in) | `ViewContent` |
| `view_item_list` | `ViewContent` | — | — |
| `add_to_cart` | `AddToCart` | `add_to_cart` conv | `AddToCart` |
| `remove_from_cart` | (no inverse — Meta has no inverse event; safer to drop client-side) | — | — |
| `view_cart` | `ViewContent` (with content_ids) | — | — |
| `begin_checkout` | `InitiateCheckout` | `begin_checkout` conv | `InitiateCheckout` |
| `add_payment_info` | `AddPaymentInfo` | — | `AddPaymentInfo` |
| `purchase` | `Purchase` | `purchase` conv (Enhanced Conversions) | `CompletePayment` |
| `generate_lead` | `Lead` | (lead conv) | `SubmitForm` |
| `sign_up` | `CompleteRegistration` | — | `CompleteRegistration` |
| `search` / `view_search_results` | `Search` | — | `Search` |

Hold the mapping in a `Record<string, string>` per forwarder so storefront code can stay GA4-canonical and vendor naming is centralised.

### Meta CAPI on Hydrogen: which events to actually send

The table above shows the *name mapping*, not the *sending decision*. On a Hydrogen storefront with Shopify's `Facebook & Instagram` app installed at Enhanced/Maximum data sharing, the Shopify app fires its own pixel+CAPI pair from the **checkout sandbox** (`checkout.{shop}.com`) for `page_view`, `begin_checkout`, `add_payment_info`, and `purchase`. Your server CAPI sending the same event names creates an unpaired third copy that Meta Diagnostics flags as `服务器事件未去重` / "server event was not deduplicated".

Safe default for the Meta CAPI forwarder on Hydrogen:

- **Skip server-side**: `page_view`, `begin_checkout`, `add_payment_info` (Shopify's checkout pixel covers these and adds no value to skip-them-too).
- **Skip + add browser-side Custom Pixel for dedup**: `purchase` is too critical to drop — install `docs/cr001/checkout-pixel.js` that fires `fbq('track', 'Purchase', ..., {eventID: 'purchase_' + order.id})` from the checkout sandbox with the same event_id your server uses. Then your webhook → server CAPI and your Custom Pixel → browser pixel pair cleanly. Shopify's own pair runs in parallel and dedups separately.
- **Keep server-side**: all storefront events Shopify never sees — `view_item`, `view_item_list`, `view_cart`, `add_to_cart`, `remove_from_cart`, `search`, `view_search_results`, plus non-ecomm events `generate_lead`, `sign_up`, `add_to_wishlist`. These have no Shopify-app counterpart on Hydrogen (no Liquid theme = no app pixel injection), so your server CAPI is the only Meta source.

Do **not** skip the storefront events just because the data-sharing UI lists them as "shared by the app" — that UI describes the Liquid Online Store behavior, not your headless storefront. See [`gotchas.md`](./gotchas.md) §"Meta Diagnostics: server event was not deduplicated" for the full reasoning.

## Audit log

The system silently drops events for many reasons (consent, missing user_data, vendor 4xx, etc.). Without audit logging you cannot debug "why is event X missing in Meta".

Minimum log shape per forwarder result:

```ts
{
  ts: number;
  event_id: string;
  event_name: string;
  forwarder: "ga4" | "meta_capi" | "google_ads";
  ok: boolean;
  skipped?: boolean;
  reason?: string;       // "ad_storage_denied" | "no_client_id" | "meta_env_missing" | "http_400" | …
  error?: string;        // vendor error message if !ok
}
```

Store in whatever cheap log sink you have (Oxygen logs, a KV table, a Tinybird endpoint). When the marketing team asks "where did our Purchase events go", grep by `event_id` and you'll see exactly which forwarder dropped it and why.

## What NOT to put in the dataLayer push

- **No raw PII.** Hash email/phone server-side only, never in the browser. Browser-side hashing leaks via dev tools, source maps, and request bodies.
- **No nested `ecommerce.*` shape if you're not using `sendEcommerceData=true` on the GTM GA4 tag.** Pick one convention (flat top-level OR nested under `ecommerce`) and stick to it across all events. Mixing causes silent parameter loss.
- **No internal IDs.** Use the canonical Shopify variant_id / product_id (or your storefront's stable id), not your CMS row id.
