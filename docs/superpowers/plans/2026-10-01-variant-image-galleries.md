# Variant image galleries implementation

Approved spec: docs/superpowers/specs/2026-10-01-variant-image-galleries.md

## Global constraints
- Keep 16 total product images and existing 5 MB/image validation. Gallery assignment reuses media IDs, creates no files, uses no extra quota.
- Galleries optional, ordered, first image cover. Missing/archived image filtered; fallback general active gallery. Legacy variant images remain compatible.
- Same-store/product integrity, manage_media authority, optimistic product-gallery version, atomic batch, idempotent retries. No unrelated catalog changes.
- Centered modal; Uygula, Vazgeç, Ürün görsellerini kullan; preserve errors and inputs. Explicit selected targets for batch; match real attributes.
- Support new and existing product workflows, and real storefront selection/gallery/cart/POS/order.
- Preserve latest live shared features/themes; compatible SQL first, storefront readers, admin last. Reversible live QA.

## Task 1: persistence and public read integration
Own new SQL migration 202610010186, saas-data storefront repository and tests. Separate ordered junction, product-level gallery revision and operation log; migrate legacy associations. Do not alter legacy product projection shape. Public readers hydrate optional variant mediaIds via a separate batched public function guarded by verified hostname; wire detail and quick-view/catalog consumers. Cart/checkout and merchant thumbnails select assignment first, then legacy, then general. Admin RPC list/save signatures: 8 existing media authority params; list productId as 9; save operationId 9, fingerprint 10, productId 11, expectedVersion 12, assignments jsonb 13. Payload {gallery:{productId,version,assignments:[{variantId,mediaIds}]}}. Outcome found/committed/operation_replayed or existing media codes. At most 100 variants per request and 16 unique IDs each. Tests SQL integrity/permissions/replay/conflict/archives/16 quota, repository public readers.

## Task 2: admin UI
Own components/catalog and catalog-ui/variant-media-client.ts, plus onboarding media completion local mapping. Existing product row thumbnail and centered multi-select modal, order, cover, clear, cancel, save. Explicit optional batch to related attribute targets. GET/POST /api/catalog/products/{productId}/variant-media, GET {gallery}, POST {expectedVersion,assignments} and caller-retained Idempotency-Key, response {gallery,replayed}. ProductGallery state version default1, assignments only explicit variant links. New product workflow capture stable uploaded ID mapping then save gallery; resume same draft on failure. Never exceed16; don't duplicate upload. Write behavioral UI tests first.

## Task 3: storefront rendering/contracts
Own saas-contracts storefront types/validation/helper and storefront components/design-ui. Add optional mediaIds to PublicProductVariant, export shared resolver of ordered variant/gallery media. Undefined field -> legacy variantId media then general; explicit empty list -> general. Validate unique 0..16 matching product media IDs. Gallery selection and purchase selection coordinated by small client wrapper/context, current photo retained when present, else first. Quick-view and shared design preview same resolver. Write meaningful resolver and selection tests first. No repository/SQL edits.

## Task 4: root integration/release
Own dedicated admin data repository in media/variant-gallery.ts, HTTP handlers/runtime route and authority/cache invalidation, common admin/gallery contracts. Verify precise boundary parsing, no tenant leakage, conflict/retry inputs. Build packages/admin/storefront; SQL isolated tests; independent review; deploy with runtime base coordination; read-only live checks plus apply/rollback gallery QA. Record release evidence.
