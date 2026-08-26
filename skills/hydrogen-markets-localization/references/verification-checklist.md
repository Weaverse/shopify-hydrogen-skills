# Markets & Localization Verification Checklist

Use this checklist after tracing the storefront. Adapt commands and market cases to the repository; never substitute a universal market list.

Two rules apply to every section below:

- **Approval rule.** Keep external verification read-only by default. Before any configuration write or cart, account, logout, checkout, content-sync, or publish action, confirm the exact target, environment, identity, scope, and values and obtain explicit owner approval. Use dedicated test identities; never place a paid order.
- **Redaction rule.** Record URLs as origin plus pathname only. Never persist or report query values, fragments, checkout URLs, authorization codes/state, cart or session identifiers, signed parameters, or cookies. Keep credentials in approved bindings or an untracked `0600` environment file, and never expose their values in prompts, docs, URLs, command arguments, or logs.

## Contents

- [Before editing](#before-editing)
- [Focused regressions](#focused-regressions)
- [Production-boundary tests](#production-boundary-tests)
- [Real dev-server matrix](#real-dev-server-matrix)
- [Shopify admin handoff](#shopify-admin-handoff)
- [Platform and release proof](#platform-and-release-proof)

## Before editing

- [ ] Record the clean starting commit and confirm the expected branch.
- [ ] Identify the single market allowlist and every consumer. Flag duplicate locale maps.
- [ ] Trace default, LTR-prefixed, RTL, provider-language-override, ordinary-slug, and unsupported-locale-shaped requests.
- [ ] Trace document requests and React Router `.data` requests separately.
- [ ] Sweep links, forms, redirects, cart actions, account routes, checkout, SEO, sitemap, and translation readers.
- [ ] List legacy routes/settings/helpers and their callers before planning deletion.
- [ ] Confirm the merchant's enabled Shopify countries, languages, currencies, domains, and URL strategy.
- [ ] Map each required read/write to its actual authority: Weaverse, Storefront API, Shopify Admin/API, or Customer Account settings.
- [ ] Derive exact methods and paths from mounted routes or authoritative docs; reject guessed endpoints.
- [ ] Place every credential needed by later checks per the redaction rule before running an authenticated check.

## Focused regressions

Prefer behavior-level tests against public helpers or real route boundaries.

### Market model and paths

- [ ] Exactly one market has an empty path prefix.
- [ ] Every configured prefix round-trips through resolve, localize, and delocalize.
- [ ] Prefix matching is case-normalized, whole-segment, and idempotent.
- [ ] Ordinary slugs that resemble language names remain ordinary slugs.
- [ ] Unsupported locale-shaped prefixes return the intended not-found response, including `.data` requests.
- [ ] Query strings and hashes survive locale switching where applicable.
- [ ] Previous supported-market fixtures remain a subset unless removal is intentional and approved.

### Context and rendering

- [ ] The real request context sends Shopify its verified provider language and country.
- [ ] The real Weaverse client sends the public language-country locale used for content and Translation Manager lookup.
- [ ] Provider-language overrides do not change the public path, hreflang, bundle, or Weaverse locale.
- [ ] SSR and hydration render the same `<html lang>` and `dir` for LTR and RTL markets.
- [ ] Market switching cannot leave stale layout or translation state.

### Navigation and redirects

- [ ] Internal links and form actions preserve the selected market.
- [ ] Same-origin Storefront redirects are delocalized for lookup and relocalized for the response.
- [ ] Both document and data-route redirect headers are handled when the framework emits both forms; rewritten responses replace the active header rather than append a second target.
- [ ] External redirect targets pass through unchanged.
- [ ] Product, collection, page, blog, and article handle redirects preserve market state where localized handles exist.

### Cart, account, and checkout

- [ ] Cart creation includes the active country in buyer identity.
- [ ] Every cart mutation path synchronizes buyer identity before checkout.
- [ ] The country selector preserves the neutral path and query while changing prefixes.
- [ ] Cart fetchers and API routes use localized URLs.
- [ ] Safe app-relative redirect targets beginning with exactly one `/` survive; schemes, protocol-relative forms, backslashes, control characters, and parse failures fall back to the localized cart while required cart/session cookies still commit.
- [ ] Login and unauthorized-account redirects preserve the market and return target.
- [ ] Logout passes the localized home as `postLogoutRedirectUri`.
- [ ] Checkout uses the cart after buyer-identity synchronization and returns localized on failure.

### SEO and translations

- [ ] Exactly one canonical survives route and CMS metadata composition.
- [ ] Hreflang includes only routes proven equivalent; uncertain handle/CMS routes emit none.
- [ ] `x-default`, when used, is emitted in the framework's valid form.
- [ ] Sitemaps do not fabricate localized handle alternates.
- [ ] Translation bundles cover the source keys and preserve interpolation variables.
- [ ] Bundled copy is not classified as a merchant override.
- [ ] Live design override beats persisted override; persisted override beats genuine legacy setting; legacy setting beats bundled copy.
- [ ] Missing, inherited, null, non-string, historical shipped-default, merchant-edited, and explicitly empty values have separate tested semantics.
- [ ] Shipped components use the shared translation reader rather than hardcoded or bypass props.

## Production-boundary tests

A pure helper test does not prove shipped code calls the helper. Add the smallest tests that drive real boundaries:

- [ ] Construct the real Hydrogen/Weaverse request context and record outbound locale requests.
- [ ] Drive the real root loader and assert localized theme payload plus merchant-override provenance.
- [ ] Drive the real cart action with safe and hostile redirect targets.
- [ ] Render representative shipped components inside the real translation provider, including a live cleared value.
- [ ] Drive the real logout function and inspect the option passed to Customer Account logout for every configured prefix.

For each load-bearing rule, perform a temporary mutation: weaken or bypass the rule, prove the focused regression fails for the expected reason, then restore the source and confirm the test passes. Do not commit mutation changes.

## Real dev-server matrix

Boot the repository's actual dev or preview server. Exercise at least:

| Case | Required observation |
|---|---|
| Default market | Unprefixed route, expected currency/language, stable canonical |
| LTR prefixed market | Prefix survives links, data requests, cart, account, and redirects |
| RTL market | Correct server-rendered `lang` and `dir="rtl"`; usable hydrated layout |
| Provider override | Shopify receives provider code while public URL and Weaverse use public locale |
| Ordinary first-segment slug | Route remains content, not a locale |
| Unsupported locale shape | Not found; no silent default-market content |

For each applicable case, inspect home and one product/resource route. Exercise cart, account login/logout, or checkout transitions only in an approved environment with a dedicated test identity. Capture response status, origin plus pathname, document `lang`/`dir`, displayed currency/language, and the expected redirect class. Exercise `.data` URLs separately from browser documents, and record evidence under the redaction rule.

## Shopify admin handoff

Use this handoff when the agent lacks a shop-scoped `WEAVERSE_API_KEY`, the
minimum granted Shopify scopes, or a current-schema operation proven to perform
the required change. Do not present handoff work as completed production setup.

- [ ] Name the exact shop/admin target and environment without including a secret.
- [ ] Record whether the key is an accepted `shopify` or `content_api` token; `agent_cli` is not valid for the Admin proxy.
- [ ] Record the minimum required scopes and have the merchant review them in **Weaverse Dashboard → Settings → Shopify Admin API Proxy → Manage Scopes**.
- [ ] Use only the verified `POST https://studio.weaverse.io/api/admin-graphql` route; budget for 1000 requests/hour/token and a 15-second timeout.
- [ ] Copy the desired market rows from the storefront's canonical allowlist:
  country, language, currency, domain/path strategy, and enabled/published state.
- [ ] List required Customer Account logout URLs as origin plus pathname only.
- [ ] For every change, cite the authoritative doc or mounted route that proves the exact Admin UI operation or Admin GraphQL query/mutation. Leave it unresolved rather than inventing one or assuming every Markets or Customer Account setting is mutable.
- [ ] Include a harmless identity/shop and granted-scope query the authorized operator must run before mutation.
- [ ] Show current value, desired value, idempotency/no-op predicate, rollback,
  independent readback, and the separate publish/enable boundary.
- [ ] Require inspection of HTTP/proxy errors, top-level GraphQL `errors`, and mutation `userErrors`; accepted HTTP status alone is not success.
- [ ] Require the operator to return redacted readback for every country,
  language, currency, market status, and logout pathname, plus the deployed
  revision used for post-publish verification.
- [ ] State what code/dev-server checks passed and label Shopify enablement,
  Customer Account configuration, publication, and live proof as blocked until
  that readback is supplied.

## Platform and release proof

### Shopify and Customer Account

- [ ] Probe every configured country/language pair against the production Storefront API boundary.
- [ ] Read back effective country, language, currency, and availability; reject silent fallback.
- [ ] Confirm products and translations required by each market are published.
- [ ] Determine from the current Shopify Admin GraphQL schema or authoritative docs whether Customer Account logout URLs are readable or mutable. Use verified GraphQL only when supported; otherwise provide exact Admin UI handoff steps. Require approval before changes and exact redacted readback afterward.

### Weaverse

- [ ] Confirm theme schema exposes the current static source keys for Translation Manager sync.
- [ ] Confirm the repository's Translation Manager/theme-key sync procedure and current state. Run a sync only in an approved environment after explicit owner approval, then read back the result.
- [ ] Publish a harmless test override only in a non-production fixture or explicitly approved environment; verify locale lookup plus explicit-empty behavior, then restore the prior value.
- [ ] Use [`weaverse-content-api`](../../weaverse-content-api/SKILL.md) for locale-specific content readback instead of inventing REST calls.
- [ ] Run the repository's demo/project synchronization check and confirm it leaves no unexplained tracked changes.

### Immutable gates and live proof

- [ ] Run focused localization regressions.
- [ ] Run repository lint/type/build and generated-manifest or schema-drift checks.
- [ ] Run secret/value audits covering schemas, presets, examples, and generated manifests.
- [ ] Run `git diff --check` and confirm generated commands leave the intended tree only.
- [ ] Confirm CI runs the relevant regressions; if it does not, record the gap rather than treating CI as proof.
- [ ] Verify the deployed revision matches the tested commit.
- [ ] Repeat read-only portions of the market matrix against the live storefront. Exercise cart, account, logout, or checkout only after explicit owner approval and without paid or destructive transactions.
- [ ] Record origin plus pathname, statuses, effective locale/currency, deployment revision, and remaining unproven boundaries under the redaction rule.
