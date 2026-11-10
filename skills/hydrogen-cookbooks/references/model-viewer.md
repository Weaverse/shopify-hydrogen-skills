# Model Viewer (3D Models)

Renders 3D model media (.glb/.usdz) uploaded to Shopify products, with AR on iOS through Quick Look. Built into Pilot.

Hydrogen 2026.10 removed `ModelViewer` (and `ExternalVideo`) from `@shopify/hydrogen`. Pilot ships a local port, `app/components/product-media/model-viewer.tsx`, that renders `<model-viewer>` with the attributes and defaults the classic component set. On classic Hydrogen (2026.4 and earlier) the component was imported from `@shopify/hydrogen`; see the hydrogen-upgrades skill's [2026.4.7 → 2026.10.2 guide](../../hydrogen-upgrades/references/upgrade-2026.4.7-to-2026.10.2.md).

## How It Works

1. Merchants upload 3D models (.glb/.usdz) to product media in Shopify Admin.
2. The Storefront API returns `Model3d` media with `sources` (URL and MIME type).
3. `MediaItem` detects `mediaContentType === "MODEL_3D"` and lazy-loads `ModelViewerItem` (a `React.lazy` chunk), which renders the local `ModelViewer`.
4. `ModelViewer` injects Google's `@google/model-viewer` module script (v1.12.1, the build classic Hydrogen loaded, from unpkg.com) once per page, then renders `<model-viewer>`.
5. `getModel3dData()` puts the GLB source first (`sources[0]` is the model `src`) and returns the USDZ source as `iosSrc` for AR.
6. 3D models show a cube icon in thumbnails and render in the zoom modal.

## Files

| File | Role |
|------|------|
| `app/components/product-media/model-viewer.tsx` | Local port of classic `<ModelViewer>`: script loader plus `<model-viewer>` element |
| `app/components/product-media/model-viewer-item.tsx` | Thin wrapper loaded with `React.lazy` so the viewer stays out of the main bundle |
| `app/components/product-media/model-utils.ts` | `getModel3dData()`: GLB-first sources, `iosSrc`, default `alt` |
| `app/components/product-media/types.ts` | `Media_Model3d_Fragment`, narrowed from `MediaFragment` by `__typename` |
| `app/components/product-media/media-item.tsx` | Renders the lazy viewer for `MODEL_3D` media; eager on the first slide, `reveal="interaction"` elsewhere |
| `app/components/product-media/media-slider.tsx`, `media-grid.tsx` | Cube icon badge, no zoom click on 3D media |
| `app/components/product-media/media-zoom.tsx` | Cube icon in zoom thumbnails, `ModelViewer` in the zoom modal |
| `app/graphql/fragments.ts` | `MEDIA_FRAGMENT` already selects `Model3d` sources |
| `app/weaverse/csp.ts` | Allows `https://unpkg.com` in `scriptSrc` for the model-viewer script |

## GraphQL Fragment

`MEDIA_FRAGMENT` is a `gql()` document; its result type is inferred, so there is no codegen step:

```graphql
fragment Media on Media {
  __typename
  mediaContentType
  alt
  previewImage { id url altText width height }
  ... on Model3d {
    id
    sources {
      mimeType
      url
    }
  }
  # ... other media types
}
```

```ts
// app/components/product-media/types.ts
import type { MediaFragment } from "~/graphql/fragments";

export type Media_Model3d_Fragment = Extract<
  MediaFragment,
  { __typename: "Model3d" }
>;
```

## Usage

```tsx
import { getModel3dData } from "./model-utils";
import { ModelViewer } from "./model-viewer";
import type { Media_Model3d_Fragment } from "./types";

if (media.mediaContentType === "MODEL_3D") {
  let { data, iosSrc } = getModel3dData(media as Media_Model3d_Fragment);
  return <ModelViewer data={data} iosSrc={iosSrc} className="h-full w-full" />;
}
```

`ModelViewer` props: `data` (a `Model3d` with `sources`, `alt`, `previewImage`), `iosSrc`, `loading` (`auto | lazy | eager`), `reveal` (`auto | manual | interaction`) and `className`. The classic component's event-handler props (`onLoad`, `onArStatus`, ...) are not ported; add them to the local component if you need them.

## To Remove

1. In `media-item.tsx`, remove the `LazyModelViewerItem` import and the `MODEL_3D` branch.
2. In `media-slider.tsx`, `media-grid.tsx` and `media-zoom.tsx`, remove the `MODEL_3D` badge and branches.
3. Delete `model-viewer.tsx`, `model-viewer-item.tsx` and `model-utils.ts`, and `https://unpkg.com` from `app/weaverse/csp.ts` if nothing else needs it.
4. Run `npm run typecheck`.

## Requirements

- A product with a 3D model uploaded in Shopify Admin (Media section).
- The CSP must allow the model-viewer script origin (`https://unpkg.com`).
- Supports .glb (rendered) and .usdz (iOS AR) sources.
