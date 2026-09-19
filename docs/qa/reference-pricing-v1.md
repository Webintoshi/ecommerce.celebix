# Reference pricing V1 — isolated candidate evidence

## Scope and source

- Canonical starting point verified before the isolated worktree: `c09d59a21944fb24ef82cf904db5e444ec1d4fd5` (`codex/design-tabs-save-fix-live`). The current candidate SHA is recorded in the delivery report after the final commit; a later canonical/base change needs re-evaluation.
- Branch: `codex/reference-pricing-v1`. The original working tree and its untracked QA files were not used for implementation.
- Verbatim supplied specification: `docs/specs/Celebix_Referans_Fiyatlandirma_V1.md`; both downloaded and committed copies have SHA-256 `3d27740789ed9d5336696e745e952b7138099bc145d0e2a7d8b7092bdbb14c59`.
- No real-store reference, catalog, order, payment or provider mutation; no shared database migration, deploy, merge, or Auto Deploy setting change.

## Isolated checks (2026-09-20)

The source was copied to a disposable remote Linux runner with Node 22 and PostgreSQL 16. SQL tests ran in a read-only, network-disabled, capability-dropped container with a disposable PostgreSQL cluster; no staging database was connected. The runner image was `sha256:7caaef610190ddc7fdf277336ef3e7b83f979fe9b98e30a816faf53a88c9a465`.

| Evidence | Result | Coverage |
| --- | --- | --- |
| Migration 130, reference/policy/permissions | 27/27 PASS | Exact arithmetic, immutable sets, legacy edits, role and tenant boundaries, rollback/reapply. |
| Migration 131, public prices | 9/9 PASS | Effective-price resolution and public catalog projections. |
| Migration 132, checkout binding | 13/13 PASS | Confirmed quote lineage, promotion/shipping seal, stale price rejection, bound offline/hosted replay, rollback guard. Last run includes the strengthened receipt component parity check. |
| Migration 133, policy preview | 10/10 PASS | Server-calculated candidate price/impact and permissions. |
| Migration 134, manual orders | 5/5 PASS | Dynamic-price fail-closed behavior in draft and line creation, rollback/reapply. |
| Migration 135, promotions | 6/6 PASS | Protected gold line/gift/bundle exclusion unless explicitly opted in; existing fixed-price promotion behavior. |
| Focused Node 22 TypeScript tests across contracts, data, panel, storefront | 150/150 PASS | Parsers, repository adapters, panel endpoints/client/model, catalog cache/pagination, cart and hosted flows. These are isolated focused tests, not the complete application suite. |
| Diff whitespace check | PASS | `git diff --check`. |

The hosted scenarios use a synthetic disposable database/payment profile. They do not call a real payment provider or prove live payment, callback, invoice or tax acceptance. The supplied runner does not contain every production dependency (`pg`/payment adapters), so the full monorepo test/typecheck/build and `apps/storefront-shared/lib/checkout/runtime.test.ts` have **not** been run. No physical or browser-based 1440/1024/390, keyboard/focus or authenticated merchant acceptance was performed. Fixture/isolated results must not be presented as live QA.

## Open gates before a release or pilot

1. Run the complete affected contracts/data/Customer Panel/storefront suites, typecheck and release builds in an authorized isolated environment with the full dependency graph; then exercise 1440/1024/390 and keyboard/focus. Keep the evidence bound to that exact candidate SHA.
2. Verify existing import/export and barcode-label price display integrations against a dynamic variant. Legacy barcode labels still read cached `variant.price_cents`; do not print them as a live computed price without an explicit pricing-aware change. Confirm search/feed indexing delay separately.
3. A shipping-only free-shipping promotion can still benefit a cart containing protected gold; the exclusion implemented here guards the gold **item price**, direct gift, bundle and item discounts. If the commercial rule should prohibit every benefit on a gold-only cart, define that rule and add corresponding tests before a pilot.
4. Confirm gold purity/tariff definitions and tax/invoicing policy with the merchant; none is inferred from the supplied illustrative reference values. No automatic reference seed is installed, and all existing variants remain fixed until an authorized policy change.
5. Obtain exact candidate migration/rollback review and a separately approved pilot/deployment plan. Once dynamic policies or historical bindings are in use, blindly reverting to old code or dropping migrations would be unsafe.
