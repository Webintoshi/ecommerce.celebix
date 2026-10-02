# Automatic variant SKU — 2026-10-02

## Behavior

- Shared product creation and attribute-based variant addition derive the SKU from the product base: `SRA-1341` + `Kırmızı` → `SRA-1341-KIRMIZI`.
- Color takes priority over size. With no color, `XL` becomes `SRA-1341-XL`. Turkish labels use the existing uppercase ASCII SKU contract.
- Manually entered nonblank codes and saved records are preserved. Updating the unsaved product base rebases only matching automatic codes; draft remount and create payload retain them.
- Base editing is locked while pending combinations are open. Archived variants cannot provide the base for new active variants.
- Existing 64-character validation, barcode identities, image limits, prices and stock fields remain intact. No database or contract migration.
- Same-color different-size rows share the color SKU as requested; SQL150 already permits duplicate SKUs inside one product and enforces ownership across products.

## Verification

- Focused helper and actual React creation/detail behavior tests: **38/38 pass**, including observed RED → GREEN for size/color generation, pending-selection locking and archived-base exclusion.
- Additional surrounding helper/forms/SKU-prefix tests: **44/44 pass**.
- Independent code review: two caller issues identified, fixed and reviewed again; no remaining concrete issues.
- Direct full panel TypeScript check and full production build: pass.
- Broad panel first-stage suite: 1956 tests, 1910 pass, 45 fail, 1 skipped. All 45 failing names also reproduce on the pre-change `ef14a7f7` baseline; no current-only failures. Its second stage did not run because the first stage failed. Isolated baseline had four additional harness/environment failures. Evidence remains in private `.tmp/variant-sku-baseline-comparison.json`; temporary source archive removed.
- Initial local build stopped with `ENOSPC`; only unused ignored application build caches were cleared before retry.

## Release

Only the two shared customer panels require deployment. Storefront source, payment settings, preview rows and merchant records stay outside the SKU change. Final image/source and compiled SKU behavior verification are recorded after deployment.
