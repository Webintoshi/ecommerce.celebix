# Shared admin product thumbnails

## User scope

Display existing product photos in dashboard best sellers, analytics featured/products lists, order detail, POS search and cart. Preserve existing layout and financial behavior. Use variant media first, then active main product media; missing/broken images retain the existing placeholder.

## Root cause and baseline

- Baseline c54f17a7 (final POS code dabec3f1); branch codex/admin-product-thumbnails, existing managed seo-tools checkout.
- Dashboard, commerce analytics and order detail render static icons and lack image fields in their projections/contracts. POS UI accepts images but SQL157/184 returns imageUrl:null.
- The application role cannot SELECT product_media; catalog media RPC denies cashier. A narrowly authorized batch read RPC is required, without expanding table grants or cashier catalog access. Frozen SQL184 and monetary operation/replay data remain unchanged.
- Live read-only verification: Butik Siora62active products and0active media; Güzide1188active products and4699active media across1512products. Positive live QA uses Güzide; Butik verifies missing-image behavior. No generated/invented photos or catalog writes.

## Work ownership

- POS agent: batch image resolver/RPC migration, native tests and read-only POS enrichment.
- Catalog agent: optional imageUrl analytics/order contracts and repository projections/tests.
- UI agent: shared decorative thumbnail, existing screen frames and mounted regressions.
- Root: controller/client integration, fresh final checks, browser QA and guarded release after Mira's SEO final source is merged.

## Acceptance

- Variant precedence, product fallback, archived/deleted media exclusion, same-store references, cashier access, bounded bulk lookup and unchanged monetary/idempotency data.
- Real photos on four requested surfaces, preserved after draft save/hold/reopen; broken URL falls back, changed URL recovers, lazy loading and fixed dimensions.
- Focused tests, native application-role RPC checks, affected package types and panel build. Mobile/desktop live read-only verification, no completed financial transaction.
- Compatible DB read support first, then two shared admins through existing fresh snapshot/lock/guarded queue. Preserve Mira SEO release and SQL184.

## Verified implementation

- Merged final live SEO source aad603db0d879a6ee4e72bc9e80c40811e66d4f3 into this branch before final checks. SQL184 remains byte-identical, checksum c28ac97c3b283463092dd91699c90aaa593ada289484102b24935fed5e11c9a5.
- Shared decorative thumbnails preserve existing frames and spoken product identity; lazy/async photos fall back on load error and retry when their URL changes. POS display photos survive immutable mutation results without being included in sale intents. Authoritative null reads clear removed photos.
- Read-only image enrichment uses the caller's existing transaction and verified authority, deduplicated bounded batches, optional compatible analytics/order fields, and the narrowly scoped new RPC. Selected variants never use another color's media; archived orders preserve existing manager-only access. No raw media table grants, mutations, journal rewrites, or catalog writes.
- Independent review found and verified repairs for stale authoritative photos and archived-order association access. No remaining P1/P2 findings.
- Root final focused integration after SEO merge:342/342 pass, panel/data typechecks and production panel build pass. Full data suite755 pass2skip. Whole contracts496 pass1 existing frozen-export failure. Whole panel1867 pass40fail1skip; existing presentation/source expectations outside this change are listed in docs/qa/admin-product-thumbnails-test-diagnostics-2026-09-30.md. No claim of a fully green unrelated whole suite.
- Root independently applied the reviewed guarded SQL bundle on the disposable native DB and ran the native application-role fixture: variant/main preference, other-color exclusion, tenant/order/archive access, cashier scope, bounded batches, missing/archived/deleted media, every POS read group and immutable operation replay pass. Protected catalog/media/sale/payment/order/inventory rows and existing POS function definitions remained unchanged.
- Frozen SQL185 source4c1b9a1ab0efd9139238b228258d44ee79edffa9b4087e6b7db0f6309b26d7b0; guarded bundle924f4f31615c00969a121f90730590bc439a829dd7ff7440df8546844f219e9d. Private evidence under .tmp/admin-product-thumbnails.
