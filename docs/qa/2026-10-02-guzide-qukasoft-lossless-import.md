# Qukasoft XML catalogue import — 2 October 2026

## Scope and source

Shared customer panel accepts Qukasoft XML through the existing authenticated migration workflow. Input is capped at 4 MiB, 2,500 products, 50 variants per product and the unchanged 16 images / 5 MiB per image limits. Native variant keys are ASCII; attribute definitions provide Turkish labels.

Reviewed source SHA-256: `2ce05269184f565ad849ec42e8128a4fb5645a55fa5fc8648b15180e0c410d29`. Expected catalogue: 1,133 products, 1,194 complete unique variants, 47 hierarchy nodes, 6 brand slugs and 3,644 images. Full raw XML, all scalar fields including empties, repeated attributes, all 71 source child rows and unresolved values remain attached to each imported product in `catalog_product_import_sources`.

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
- Native data import completed for all 1,133 products / 1,194 variants and exact source records. Image transfer and final full-source audit are tracked independently until complete.

## Release and operational acceptance

Publish the shared admin cohort only after SQL196 readiness, current common branch ancestry, official compiled PayTR proof and raw payment/preview/storefront configuration preservation gates pass. NET then SITE use owned deployment receipts. Storefront binaries remain unchanged. Restore the original homepage section order/styles and remap categories by slug; old category image references are cleared.

Final acceptance requires all 3,644 media records committed in source order, R2 object proofs, exact source/native field comparisons, deleted old R2 objects, completed search outbox, public product/variant checks, and both shared admin release proofs. Store the timestamped private operational evidence under `.tmp/guzide-qukasoft-import` and `/var/backups/celebix/guzide-20261002-qukasoft-2ce05269`.
