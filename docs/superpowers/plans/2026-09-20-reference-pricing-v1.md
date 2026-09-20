# Reference-based variant pricing V1 implementation plan

> **For agentic workers:** Execute test-first, in the isolated branch. Atlas owns SQL/contracts/data/storefront authority; Mira owns only merchant UI after the contract is fixed. No application/test/build/typecheck runs on this Mac.

**Goal:** Let each store manage manual USD/EUR/gold selling references and price variants in TRY, while preserving fixed prices and immutable payment/order amounts.

**Architecture:** Keep `saas.resolve_effective_variant_price` as the existing price-list precedence authority and extend its base-price fallback with one exact PostgreSQL `numeric` calculation. A tenant-scoped active immutable reference-set version and versioned variant policy feed catalog, quick-order and checkout. Reference activation and payment-start serialize on the existing catalog-store lock; private trace/version facts enter the authority digest and durable snapshots without leaking merchant-only fields to public projections.

**Stack:** PostgreSQL 16, PL/pgSQL, TypeScript strict contracts, Next.js shared Customer Panel and storefront, Node test runner, disposable PostgreSQL.

**Spec:** `docs/specs/Celebix_Referans_Fiyatlandirma_V1.md` (verbatim SHA-256 `3d27740789ed9d5336696e745e952b7138099bc145d0e2a7d8b7092bdbb14c59`).

## Global constraints

- Base `origin/codex/design-tabs-save-fix-live` was verified at `c09d59a21944fb24ef82cf904db5e444ec1d4fd5` on 2026-09-20; verify again before any push.
- Keep old fixed TRY variants and fixed price-list overrides unchanged; no automatic tenant policy/reference seeds.
- SQL `numeric` for all intermediate multiplication/division, reference precision at least eight digits, gram precision at least six; one bounded integer-cent rounding at unit-price boundary.
- `pricing.read` for read/preview and `pricing.manage` for mutation; tenant from existing authority, not request body. Do not weaken exact parsers, RLS or app role boundaries.
- Existing manual reference persists until explicitly changed/deactivated; no external rate API or TTL.
- Checkout quote changes require customer confirmation; bound attempts/callbacks/orders keep immutable amounts; no real provider calls.
- Do not edit Orders archive, Design Settings PR #79, unrelated branches or user QA files.
- No local build/test/typecheck; use only an authorized isolated Linux runner with disposable PostgreSQL and no shared staging DB migration.
- No deploy, merge, real store mutation, payment rebind, Auto Deploy change or paid infrastructure.

## Verified integration map

| Responsibility | Current authority and change seam |
| --- | --- |
| Variant writes | `packages/saas-data/src/catalog/repository.ts` `createVariant/updateVariant` → `saas.catalog_create_variant/catalog_update_variant`; old full payload includes `priceCents`. |
| Price precedence | `202607220045_price_lists.up.sql` `saas.resolve_effective_variant_price`: fixed active price-list item first, then base `variant.price_cents`. |
| Existing preview | `202607230047_pricing_preview.up.sql` compares base to stored `variant.price_cents`; must reflect dynamic base. |
| Public catalog | `packages/saas-data/src/storefront/repository.ts` and SQL public list/category/detail projections use the resolver; `apps/storefront-shared/lib/product-explorer.ts` currently filters/sorts only a fetched page. |
| Quick order | Original links were patched for effective prices in migration 045; hosted creator in `202607270057_quick_order_hosted_payment_authority.up.sql` still reads base `variant.price_cents`. |
| Checkout | `202609050126_promotions_studio.up.sql` `public_checkout_quote_v2/public_checkout_complete_v2` and hosted begin; `apps/storefront-shared/lib/cart/runtime.ts` and `checkout/standard-hosted-payment.ts`. |
| Durable snapshots | `order_items.unit_price_cents`, hosted checkout `item_snapshot`, payment attempt/session amount and digest; callback/retry must use these, never current reference. |
| Cache | `apps/storefront-shared/lib/cache/public-storefront-cache.ts` currently keys by store/scope/input/schema version and TTL, not price-set/policy version. |
| Merchant UI | `apps/customer-panel` (not legacy `apps/admin`): `PriceListConsole`, product detail/editor, settings hub and shared panel shell. |

## Ordered deliverables and test gates

### 1. Exact pricing contract and SQL authority (Atlas)

**Files:** Create `packages/saas-contracts/src/reference-pricing/{types,validation}.ts` with strict discriminated policy/decimal-string parsers and tests; create `apps/owner/scripts/sql/saas/202609200130_reference_pricing.up.sql`, `.down.sql`, `_assertions.sql` and `tests/saas-phase3/reference-pricing/postgres-harness.mjs`. The distinct migration number 130 avoids collision with the unrelated Orders archive 129 work.

- [ ] Test fixed TRY, 125×40 USD, 100×45 EUR, 2.500×5000+750 gold, new 5200 tariff, quantity 2, direct 22 ayar, explicit purity, labor modes, percent-on-reference-only, half-cent boundaries and overflow.
- [ ] In disposable PG16 verify the tests fail for missing functions/tables before implementing; never fake a successful authority check.
- [ ] Add store-scoped reference definition/immutable set-version/active pointer, versioned variant policy, audit and operation ledger with composite tenant FKs, narrow grants and FORCE RLS.
- [ ] Implement strict canonical decimal-string input, nonzero positive references, nonnegative source/grams/labor, validated purity and single final cent rounding with `numeric`; reject unavailable and overflow instead of returning zero.
- [ ] Mirror `pricing.manage`/read checks, operation-id fingerprint, expectedVersion and store advisory lock ordering. Preview must be read-only, count all affected products/variants before pagination, and distinguish fixed list overrides/unavailable rows. Activation must reject stale dependencies, be atomic and idempotent.
- [ ] Run red/green tests remotely against actual roles and verify rollback/reapply in an isolated database.

### 2. Preserve legacy writes and publish the merchant API (Atlas)

**Files:** `packages/saas-data/src/catalog/{types,repository}.ts`, `packages/saas-data/src/pricing/{types,repository}.ts`, `packages/saas-contracts/src/{catalog,pricing}`, `apps/customer-panel/lib/{pricing-http,server-pricing}`, corresponding tests and migration 130.

- [ ] Test that a title/stock edit preserves a dynamic policy, while a legacy changed `priceCents` rejects with explicit conflict at the SQL boundary; imports and bulk writes cannot flatten it.
- [ ] Add explicit policy save/mode transition with version/tenant checks and authoritative server preview; no browser calculation for persisted sale price.
- [ ] Expose draft, preview, activate, history, policy mutation and effective preview through existing authenticated panel runtime/origin checks with strict request/response parsing.
- [ ] Verify permission matrix: owner/admin manage, editor/analyst read only, other tenant denied; same operation id replays one result and mismatched fingerprint fails.

### 3. Integrate every effective-price consumer (Atlas)

**Files:** migration 130 SQL resolver and latest public list/category/detail/search/hosted-quick-order definitions, `packages/saas-contracts/src/pricing`, `apps/storefront-shared/lib/{product-explorer,cache/public-storefront-cache}.ts` and focused tests.

- [ ] Fixed list override wins without conversion; dynamic base is only applied when no eligible list item exists. New gold discount eligibility defaults off; fixed legacy discounts keep behavior.
- [ ] Compute filter and sort before pagination in SQL for the global catalog query; do not reprice a truncated client page or create product-by-product fan-out.
- [ ] Resolve hosted quick-order base, catalog variant summaries and admin previews consistently; handle compare-at below newly computed sale price without fabricated discounts or broken strict projections.
- [ ] Scope cache freshness by tenant and active reference/policy revisions; never global flush. Name feed/search consumers and eventual invalidation delay.

### 4. Quote, atomic begin and immutable trace (Atlas)

**Files:** migration 130 checkout/hosted function wrappers or exact replacement definitions, `packages/saas-data/src/storefront-commerce`, `apps/storefront-shared/lib/cart/runtime.ts`, `checkout/standard-hosted-payment.ts`, SQL/TS tests.

- [ ] Quote and private authority digest include reference-set/policy/list versions and amount even when a different version yields equal cents; public JSON does not expose margin/cost/audit.
- [ ] Under the shared catalog-store lock, activation and payment begin serialize; stale displayed quote forces a new customer-visible confirmation rather than silent capture.
- [ ] Bind one private explanatory trace to durable order line and hosted payment snapshot; existing bound attempt, callback, retry/replay, COD/bank transfer and refund read old immutable amounts.
- [ ] Use real disposable-PG concurrent sessions to prove race outcomes, tenant isolation and delayed callbacks; controlled provider transport only.

### 5. Merchant UI on fixed backend contract (Mira)

**Files:** `apps/customer-panel/app/settings/pricing/**`, `lib/panel-ui/navigation.ts`, settings hub, new reference console/API client; `components/catalog/{ProductDetailConsole,ProductListConsole}.tsx`, onboarding editor, focused tests and style module.

- [ ] Render manual references, tariffs, active version, usage, history, paginated impact and conflict/large-change confirmation using server projections.
- [ ] Add variant-based fixed TRY/USD/EUR/gold method controls with only relevant fields, reference source and server-computed explanation; preserve current shell and product form semantics.
- [ ] Test loading/empty/error/unavailable, double-submit, save confirmation, keyboard/focus and 1440/1024/390 overflow on an isolated authorized browser fixture.

### 6. Combined release candidate

- [ ] Run relevant contract/data/storefront/panel suites, typecheck/build for affected apps, migration assertions, disposable PG real-role/concurrency suite in one isolated Linux candidate; record exact SHA and failures/skips.
- [ ] Obtain independent code review focused on tenant isolation, SQL lock order, old-editor behavior, quote drift, payments, public trace privacy, locale/rounding and compare-at.
- [ ] Check branch push/PR triggers are OFF before pushing; if safe, push only this branch and create a Draft PR against verified canonical. No deployment or pilot activation; report tax/invoicing acceptance as separate unresolved gate.

## Review focus

1. A tariff is renamed/redefined while a variant points at it: definition identity remains stable; no silent semantic change.
2. A price-list override masks an unavailable reference: the fixed override remains priced, other channels do not.
3. A reference version changes but the rounded price stays the same: authority digest and snapshot still bind the exact version.
4. A simultaneous old editor save and policy change: one wins by version, not a hidden conversion to fixed TRY.
5. Catalog compare-at becomes lower than dynamic price: no fabricated markdown and no entire page failure.
