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

Completed on both shared customer panels, candidate `7838e26629465cba1265e5f315c45d87657a7bcc`, branch `codex/shared-catalog-search`:

| Target | Owned finished deployment |
| --- | --- |
| NET `e4xe74cmii7jucbkyor0o412` | `jzyxzgqqimu2m3qg1iyynwz8` |
| SITE `yk1h6d97z7ex0h74ok3zrj5c` | `nrhr8aqf5ae41nxstu6j1z8f` |

- Rollback rehearsal and final exact configuration comparison pass. Both normal panel source pins match the candidate; global deployment queue is idle.
- Running image/SOURCE binding, all six production SKU source hashes and compiled client code verified. Pure deployed-module color priority, size fallback, manual-code preservation, base changes and length guards pass on both panels.
- Existing payment build artifacts, compiled approvals and database authority still match the official candidate proof. No provider was called.
- Every payment/preview environment row and other configuration remains raw equal. Both storefronts remain pinned to `99a613f7f133db8312a74fd71463e317add82d07`.
- Both common login domains and Butik Siora/Güzide aliases return HTML200.
- Chrome authenticated Güzide create form loads, but that store has no attribute definitions; no live variant record was submitted. Butik Siora requires a new sign-in. End-to-end SKU form behavior is covered by the mounted React tests and deployed source/client/pure-function checks above. Temporary browser tabs were closed.
- Evidence is retained privately under `.tmp/variant-sku-release`; no catalog records were changed during acceptance.
