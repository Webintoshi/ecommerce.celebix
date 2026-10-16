# Accounting cost resolution

## Request and evidence

Use recorded product/variant costs in shared accounting. Read-only live evidence on 2026-10-16: Butik Siora has 87 October order lines; 83 have an exact current variant cost, only two have captured costs, leaving 81 costed lines unrepresented in profitability. Evidence: `.tmp/accounting-cost-resolution-20261016/live-cost-coverage.json`.

## Behavior

- A valid sale-time cost snapshot wins, including explicit zero. Catalogue edits never replace a known historical cost.
- For a missing/null snapshot, resolve current cost from the exact store/product/variant with matching currency. If that variant has no cost or only a product link remains, use the product's recorded common cost only when every non-null variant cost agrees on one value, including archived variants. A supplied variant ID must belong to that product/store. Never select an arbitrary sibling, average conflicting costs, use sale price, or convert currencies implicitly.
- Keep order identity, quantity, invalidation, deleted-order and safe-integer protections. Invalidation cannot be repaired by a catalogue fallback.
- Resolve fallback during the existing report request. Do not mutate financial events, debts, account balances or immutable snapshots; do not introduce polling.
- Report `catalogCostOrderCount` and signed `catalogCostCents` together only when at least one non-cancelled order actually uses fallback. These are provenance within `knownCostCents`, not a second deduction.
- Explain briefly that those sales use current product costs and can change when those costs change. Missing costs remain unknown rather than zero profit assumptions.
- Install native support with private singleton `cost_catalog_fallback_enabled=false`; legacy DTO and report behavior remain exact while disabled. Publish compatible panels NET then SITE, accept both, then enable separately.

## Scope

One additive native244 migration/rollback/assertions; profitability DTO/parser/tests and profitability UI/model/tests. Preserve collection discount243, payments, sale-versus-collection dates, access control and other applications.

## Additional live root cause

One of four lines without an exact variant cost belongs to a product whose four old archived size variants all retain the same 820 TL cost, while the two replacement size variants have null costs. Uniform product-level fallback recovers this recorded cost; divergent variant costs remain unresolved. Evidence: `.tmp/accounting-cost-resolution-20261016/live-sibling-cost-case.json`.
