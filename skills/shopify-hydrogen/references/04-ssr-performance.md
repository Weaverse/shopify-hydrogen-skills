# SSR Performance: Worker Bundle & TTFB Measurement

Production-verified on pilot.weaverse.dev (June 2026).

## The single-file worker inlines every dynamic import

Oxygen (workerd) requires the server build to be **one file**, so Rollup sets
`inlineDynamicImports` for the SSR build. Consequence most people miss:

> `React.lazy(() => import("heavy-lib"))` defers the *client* chunk, but the
> entire library still lands in `dist/server/index.js` — and its parse/compile
> cost is paid on **every cold start** of the worker isolate.

Real case: a hero-video section lazy-importing `react-player` v3 dragged
hls.js (1.28MB) + dashjs (0.95MB) + media-chrome (0.47MB) + Mux/Vimeo players
into the worker — ~3.1MB of source that can only ever run in a browser.
SSR bundle: **3.5MB**.

### Fix: SSR-only module stub via `resolveId`

```ts
// vite.config.ts
const SSR_STUBBED_MODULES = new Set(["react-player"]);

function ssrStubClientOnlyModules(): Plugin {
  return {
    name: "ssr-stub-client-only-modules",
    enforce: "pre",
    resolveId(id, _importer, options) {
      if (options?.ssr && SSR_STUBBED_MODULES.has(id)) {
        return fileURLToPath(
          new URL("./app/utils/ssr-client-only-stub.ts", import.meta.url),
        );
      }
      return null;
    },
  };
}
```

```ts
// app/utils/ssr-client-only-stub.ts
export default function ClientOnlyStub(): null {
  return null;
}
```

Result: **3.5MB → 1.4MB (-60%)**. Browsers still get the real library
(client chunks unchanged).

**Safety precondition:** the stubbed component must never actually render
during SSR. Gate it behind something that is false on the server — e.g.
`useInView()` (no IntersectionObserver in SSR) or a post-hydration mounted
flag. If SSR renders real markup from the library, stubbing changes the
HTML and causes hydration mismatches.

### Auditing what's in the server bundle

`source-map-explorer` can choke on worker sourcemaps. Direct decomposition
is reliable:

```bash
node -e "
const map=require('./dist/server/index.js.map');
const byPkg={};
map.sources.forEach((s,i)=>{
  const len=map.sourcesContent?.[i]?.length||0;
  const m=s.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
  byPkg[m?m[1]:'app-code']=(byPkg[m?m[1]:'app-code']||0)+len;
});
Object.entries(byPkg).sort((a,b)=>b[1]-a[1]).slice(0,20)
  .forEach(([k,v])=>console.log((v/1024).toFixed(0).padStart(6)+' KB  '+k));
"
```

(Sizes are pre-minification source bytes — good for ranking, not absolutes.)

## Measuring TTFB correctly

Three mistakes that produce wrong conclusions:

1. **`curl -I` sends HEAD** — fails full-page-cache method conditions and
   often takes different code paths. Always probe with GET.
2. **Pairing two requests** (one for `-w` timing, one for `-D` headers)
   attributes one request's cache status to another's latency. Capture both
   from a single request:
   ```bash
   curl -s -D /tmp/h.txt -o /dev/null -H "Accept-Encoding: gzip" \
     -w "ttfb=%{time_starttransfer}s " https://store.com/
   grep -i "oxygen-full-page-cache" /tmp/h.txt
   ```
3. **Small bursts can't measure the cold tail** — isolate cold starts are
   stochastic; compare distributions over time, not 5-probe batches.

### Expected bands (well-tuned Hydrogen storefront on Oxygen)

| Path | TTFB |
|---|---|
| Full-page cache hit | ~100–130ms (network-bound) |
| Warm worker, subrequest caches warm | ~250–340ms (render floor) |
| Cold isolate | +parse/compile of the server bundle — this is what the bundle diet shrinks |
| First visit (tracking cookies → `Set-Cookie`) | always uncacheable, full SSR — inherent to Hydrogen analytics |
