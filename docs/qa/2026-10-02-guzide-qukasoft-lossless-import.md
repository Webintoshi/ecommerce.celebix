# Qukasoft XML catalogue import — 2 October 2026

## Scope and source

Shared customer panel accepts Qukasoft XML through the existing authenticated migration workflow. Input is capped at 4 MiB, 2,500 products, 50 variants per product and the unchanged 16 images / 5 MiB per image limits. Native variant keys are ASCII; attribute definitions provide Turkish labels.

Reviewed source SHA-256: `2ce05269184f565ad849ec42e8128a4fb5645a55fa5fc8648b15180e0c410d29`. Expected catalogue: 1,133 products, 1,194 complete unique variants, 47 hierarchy nodes, 6 brand slugs and 3,644 source image references. The user explicitly approved skipping the empty third YZK-387 image; 3,643 valid images are required. Full raw XML, all scalar fields including empties, repeated attributes, all 71 source child rows and unresolved values remain attached to each imported product in `catalog_product_import_sources`.

Structured grams apply to 1,106 products / 1,127 variants. Source `Adet` remains piece-based pricing; grams do not alter the sales unit. Length options also populate optional cm measurements. Original barcodes, prices, stock, VAT values, source IDs, desi, category hierarchy and rich-description source are retained. Equal list and sale prices do not create artificial discounts; the source home flag does not mark every product featured.

## Source issues

- KLY-517: four child rows (İ, Ö, Ş, Ü) lack price, stock and barcode. Their source data is retained without fabricated sale records.
- ZNC-447: one identical duplicated 54 CM row maps to one runtime variant; both original rows remain retained.
- Products 7714, 8484 and 8965 contain conflicting gram amounts. Native weight is left unset and every amount retained.
- BLK-403, BLK-604 and BLK-2 have conflicting Maden entries. Both values and the source issue are retained.

## Verification already completed

- 66 compiler/import tests; every one of the 1,194 actual source variants passes the native parser.
- 128 focused migration/API/UI tests; 301 server/media tests; 15 shared repository/validation tests.
- Customer panel and saas-data typechecks passed. Broad customer panel tests retain 45 failures outside this change (1,922 pass, 1 skip).
- Real PostgreSQL rollback rehearsal proves extra variants, native opening inventory, exact source metadata, piece units/desi and operation replay without duplication.
- SQL196 up/assert/down rehearsal passed. Live additive schema applied with unchanged whole-platform catalogue/media/inventory hashes; source RLS and procedure permissions verified.
- Complete private server backup verified: database dump and 4,700 old product objects (4,475,085,311 bytes), plus 4 old category images (484,533 bytes). Backups are not exposed publicly or downloaded to the local machine.
- Güzide cleanup rehearsal and commit passed protected business hashes and other tenant hashes. Old active catalogue, category definitions and product media records are cleared. Twenty-two hidden parent identities remain for historical FK/unknown-payment reconciliation; 19 internal payment backing variants retain stock and 61 old held reservations. All customers, orders, payments, callbacks and sessions are retained. No payment outcome is fabricated.
- Native data import completed for all 1,133 products / 1,194 variants and exact source records. All 3,643 accepted media objects passed R2 HEAD, native byte size/type/SHA-256 and active publication checks; source ordinal order and object ownership bindings passed. The remaining original source URL returned HTTP 200 with zero bytes and remains retained as a failed source record, with an explicit user-approved skip.

## Release and operational acceptance

Publish the shared admin cohort only after SQL196 readiness, current common branch ancestry, official compiled PayTR proof and raw payment/preview/storefront configuration preservation gates pass. NET then SITE use owned deployment receipts. Storefront binaries remain unchanged. Restore the original homepage section order/styles and remap categories by slug; old category image references are cleared.

Final acceptance requires all 3,643 accepted media records committed in source order, the single recorded user-approved source exception, R2 object proofs, exact source/native field comparisons, deleted old R2 objects, completed search outbox, public product/variant checks, and both shared admin release proofs. Store the timestamped private operational evidence under `.tmp/guzide-qukasoft-import` and `/var/backups/celebix/guzide-20261002-qukasoft-2ce05269`.

## Native editing and category compatibility corrections

Source categories now include every ancestor membership while retaining the original leaf as the primary category. This fixes parent storefront category queries, which use direct native membership. The original manifest remains immutable; a second compiled manifest proves every non-category field is unchanged. Expected membership count is 2,255.

SQL197 adds private native attribute key resolution and source attribute association helpers, preserves existing resource names/config/option values, makes future Qukasoft imports prepare the seven supported definitions, and aligns native variant creation/resource editing with explicit config keys. UP/assert/DOWN and a full 1,133-product attribute backfill rehearsal passed; guarded live application preserved product, variant, source and media hashes. The seven definitions now have 3,164 product links.

The shared migration HTTP authority uses the existing approved panel mutation origin helper, allowing verified tenant admin domains with existing session/permission checks. Original alien-origin and missing-session protections remain covered. The two original 4b9971 panel releases passed source cohort, compiled payment authorities, SQL readiness, health and raw configuration preservation gates; the final compatibility candidate is validated and released separately.

## Final live acceptance — 14:40 UTC

- Final functional candidate `817c9fdcc8991683057f5375428a947e17bc83e9` is live on both shared panels. Owned NET deployment `l1553fy5khpx3178u0zu7uv3` and SITE deployment `ky4lt3ruri934hnem30mlxsj` finished. Fresh runtime and 69-source/12-route cohort checks passed for both; the final guarded verification reports global idle and both storefront witnesses unchanged at `99a613f7f133db8312a74fd71463e317add82d07`. Raw configuration, payment authorities, preview rows and unrelated environment values are preserved. No payment provider was invoked.
- Forty-five focused attribute/editor/authority/compiler tests and the customer panel typecheck passed for the final correction. The initial comparison helper still selected the original leaf-only manifest; correcting its input to the independently pinned final manifest resolved the audit discrepancy without a catalogue mutation.
- Guarded category rehearsal and commit added exactly 1,122 ancestor memberships, totaling 2,255. All original leaf rows remained byte-for-byte equal; product, variant, full source, media, inventory and resource hashes and all other tenant hashes remained unchanged. Live SQL SHA-256: `b5d735a486898b5576a4384533d5c8c064598f23b0d3e2bea0a183c010b2425d`.
- Fresh complete native comparison passed with no errors: 1,133 products, 1,194 variants, 47 categories, six brands, 1,133 exact source metadata records, 1,106 weighted products, 1,127 weighted variants, 3,164 native attribute associations and 3,643 committed media. The final compiler manifest changes only category membership lists; every non-category product payload and original primary leaf matches the immutable original manifest.
- All 3,643 accepted R2 objects passed HEAD, byte size, media type, native payload digest and publication checks. Source gallery order and media/product/variant/object ownership bindings match. All 4,704 old product/category R2 objects were deleted and HEAD-404 verified, releasing 4,475,569,844 bytes. The private verified backup remains retained.
- Search audit at 14:37 UTC passed after the category commit: native, PostgreSQL projection and external index ID sets each equal the 1,133 imported products; all 1,643 old IDs are absent. All 2,776 outbox rows are synchronized, including exact current generations for the 1,122 affected products. All 2,255 category labels project into search; all 11 root category searches include every expected member. Public barcode, Turkish/ASCII search, cursor pagination and tenant isolation checks passed. Search report SHA-256: `0064218048b73fa5d5cfa6a2f626f0f3f6c5e233633fc7eeed8a1acd541af11f`.
- Public home and product/category responses show imported catalogue records and source galleries. Earlier hydrated product checks confirmed both YZK-387 images and the four harf-kolye images loaded from R2. Existing homepage design/content ordering and assets were restored with the new category IDs, without publishing an old draft.
- Anonymous canonical Qukasoft POSTs on both NET and Güzide custom admin now reach the existing session guard (`401 unauthenticated`); alien origins remain rejected (`403 origin_denied`). These probes contain no importable data, use no credentials, and create no import.
- The owned exited temporary media worker was removed only after its final logs and receipt were saved. Operational proofs are private in `.tmp/guzide-qukasoft-import` and the server backup directory.

Accepted exception: source product `5495` (YZK-387), image ordinal 2, returns an empty file. The user explicitly requested skipping it. Its original URL and failure remain retained; the native job honestly remains `completed_with_failures` with 3,643 committed and one failed source reference. No replacement image or source value was fabricated. The source issues listed above remain retained and reported.
