# Storefront Hero Slider and R2 Media Design

Date: 2026-08-03
Status: Approved for implementation planning

## Goal

Replace the single-image home hero editor with a simple, durable one-to-three banner slider. Every uploaded image must be stored in the authenticated store's Cloudflare R2 namespace and the same published data must drive the admin preview and the customer-facing storefront.

## Current problem and root cause

The design media HTTP handler creates object keys under `stores/{storeId}/design/{mediaId}.{extension}`. The shared R2 storage validator does not currently allow the exact `/design/` namespace, although the design repository and its tests require that namespace. The upload therefore fails before an R2 request can be made. A recent UI change hid the hero upload control but did not repair the storage boundary.

The current storefront design contract also models `hero` as one headline, body, image, destination, and enabled flag. A real slider requires a versioned contract and database validation update rather than a UI-only array.

## User experience

The existing `Ana sayfa` design section remains the entry point. It presents banner tabs labelled `Banner 1`, `Banner 2`, and `Banner 3` for the banners that exist.

Each banner contains:

- a required headline;
- optional supporting text;
- a required desktop image for a publishable slide;
- an optional mobile image that falls back to the desktop image;
- an optional product, collection, or page destination;
- an enabled state.

The editor starts with at least one banner. `Banner ekle` is available until three banners exist. A banner can be removed only while at least one other banner remains. Adding and removing banners is explicit; the editor never invents hidden slides. Banner order is the tab order and can be changed with clear move-left and move-right buttons, avoiding drag-only interaction.

Uploads show a finite state: ready, uploading, uploaded, or failed. A failed upload leaves the existing banner untouched and provides a retry action. Newly uploaded media is added to the store's media options and selected for only the active banner.

## Slider behavior

Admin preview and storefront use the same slider rendering component and behavior:

- one banner is rendered as a static hero with no redundant controls;
- two or three banners advance every five seconds;
- previous and next buttons and one dot per banner provide manual navigation;
- autoplay pauses while the slider is hovered or any control/content inside it has focus;
- manual navigation restarts the interval from the selected banner;
- `prefers-reduced-motion: reduce` disables autoplay and animated transitions;
- controls expose accessible names, the active dot exposes its selected state, and slide changes do not steal focus;
- desktop and mobile sources use responsive image selection, with the desktop image as the mobile fallback.

## Contract and compatibility

Introduce storefront design schema version 2. The draft `hero` becomes:

```text
hero: {
  enabled: boolean,
  slides: HeroSlide[1..3]
}
```

Each draft slide contains `headline`, `body`, `desktopImage`, `mobileImage`, `destination`, and `enabled`. Media fields are tenant-bound design media references. The public projection contains resolved public media URLs and resolved internal destination paths, never media IDs or tenant authority.

A draft always stores between one and three slides. Publication requires at least one enabled slide, and every enabled slide requires a valid desktop image. Disabled slides may remain incomplete in the draft and are omitted from the public projection. The public hero keeps its own `enabled` gate and contains only the enabled, publishable slides in their saved order.

Schema version 1 documents remain readable during migration. Their existing single hero becomes the first schema version 2 slide. The former hero `enabled` value becomes the version 2 hero-level `enabled` value, while the migrated slide itself is enabled, preserving the former visible/hidden behavior without creating a draft that has no enabled slide. Text, image, and destination remain unchanged. New writes and publications use schema version 2 only. No existing store loses its published hero during rollout.

The PostgreSQL migration updates the design validation and public projection functions atomically, upgrades stored draft and published JSON, preserves version counters, and includes assertions for one slide, three slides, invalid zero/four slide arrays, foreign media, invalid destinations, and legacy conversion.

## R2 storage boundary

The shared R2 validator will explicitly allow only this additional key shape:

`stores/{storeId}/design/{mediaId}.{jpg|png|webp}`

Nested paths, neighboring namespaces, malformed UUIDs, unsupported extensions, redirects, and cross-store object keys remain rejected. Uploads retain the existing pending-write, HEAD verification, metadata publication, durable PostgreSQL reservation, and cleanup-on-known-failure sequence.

Runtime secrets remain server-only. The browser sends only the selected file and generated alt text to the same-origin design media endpoint. The client never receives the R2 account ID, bucket credential, object key authority, or tenant identifiers.

## Components and responsibilities

- `DesignWorkspace` owns the design editor state, autosave chain, publication state, media list, and upload request.
- `DesignInspector` delegates the home section to a focused hero slider editor instead of embedding every banner field in one line.
- `HeroSliderEditor` owns banner selection, add/remove/reorder commands, per-banner inputs, and upload feedback. It receives immutable design/media/destination values and emits a complete validated hero value.
- `StorefrontHeroSlider` renders both preview and storefront presentations so behavior cannot drift between them.
- The storefront design contract owns schema parsing and version 1-to-2 compatibility.
- PostgreSQL remains the durable authority for draft, publication, media tenancy, version conflicts, and public projection.
- R2 remains the binary object store under the store-scoped design namespace.

## Data flow

1. The user selects a desktop or mobile image for the active banner.
2. The client POSTs multipart media to `/api/storefront-design/media` with same-origin credentials and an idempotency key.
3. The server derives the store from the authenticated panel session, validates the image bytes, and creates the exact store-scoped R2 key.
4. R2 receives a pending object; the server verifies its digest and dimensions, publishes its metadata, then reserves the matching media row in PostgreSQL.
5. The client adds the returned public media option and updates the active banner reference.
6. Existing design autosave writes the version 2 draft with optimistic concurrency.
7. Publish resolves media and destinations inside PostgreSQL and emits a public schema version 2 design.
8. Preview and storefront render the same public hero slider shape.

## Error handling

- Invalid image type, size, dimensions, or payload returns a fixed Turkish upload error without revealing infrastructure details.
- R2 rejection or unavailable storage leaves the current banner reference unchanged.
- An uncertain R2 write is recovered only through the existing exact HEAD verification; it is never blindly uploaded twice.
- A database reservation failure triggers safe object cleanup when the write outcome is known.
- Draft version conflicts keep local edits visible and show the existing conflict state.
- A slide without a desktop image may be saved as a draft but blocks publication with a banner-specific message.
- Missing mobile media always falls back to desktop media.

## Testing and release

Testing covers:

- R2 design namespace acceptance and neighboring-path rejection;
- authenticated store binding and secret-free upload responses;
- one-to-three slide contract bounds and version 1 conversion;
- PostgreSQL migration, constraints, public projection, and rollback assertions;
- editor add, remove, reorder, upload success, upload failure, retry, and state preservation;
- preview/storefront parity, autoplay, manual controls, pause behavior, reduced motion, and responsive image fallback;
- production build and existing focused design/storefront suites.

Release order is migration first, application second. The live verification uses Güzide Kuyumcu with one reversible test upload, confirms the R2 public media URL, saves and reloads the draft, publishes the slider, checks desktop and mobile storefront behavior, then removes any temporary test media or restores the original published design.

## Out of scope

- More than three banners;
- video banners;
- per-slide scheduling;
- arbitrary external links;
- client-side R2 credentials or direct browser-to-R2 uploads;
- a second independent hero data source.
