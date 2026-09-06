# Promotions Studio V1 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` task by task. Every production change starts with a failing focused test. The approved design is the binding authority.

**Goal:** Replace only Customer Panel's generic discounts surface with a typed Promotions Studio and connect one deterministic PostgreSQL promotion evaluator to cart, checkout, hosted payment, orders, refunds, analytics, and staging.

**Architecture:** Additive migration `126` owns typed promotion definitions, versions, targets, codes, operations, usage reservations, redemptions, immutable order snapshots and deterministic allocations. PostgreSQL is the sole runtime evaluator and financial authority. Strict contracts and repositories are thin boundaries. Customer Panel and Storefront use additive V2 APIs while every old SQL function remains compatible for migration-first and code-only rollback.

**Tech stack:** PostgreSQL 16, PL/pgSQL security-definer functions, TypeScript, React/Next.js, Node test runner, `@celebix/saas-cache`, Coolify staging.

**Spec:** `docs/superpowers/specs/2026-09-05-promotions-studio-v1-design.md`

## Global Constraints

- Work only in `/Users/Celebix/Documents/ChatGPT/atlas-promotions-studio-v1` on `codex/atlas-promotions-studio-v1`, based on `fae6cb4f627f16360a332091f93cded5be7cf1a1`.
- Never edit `apps/admin/**`. Keep `/discounts/lucky-wheel` and every non-discount generic merchant module unchanged.
- Preserve old SQL signatures and response shapes. Old application + new schema, new application + new schema, and code-only rollback + new schema must pass.
- PostgreSQL is promotion, usage, checkout amount, order, and analytics financial truth. Redis is optional validated read cache only.
- No client store ID or discount amount is authoritative. Same-origin mutation, tenant isolation, feature entitlement and exact role checks are mandatory.
- Money is safe integer minor units. Evaluator output, tie-breaks, allocation and refund are deterministic.
- No real Güzide customer/product/order/campaign mutation. Staging fixtures must use `ATLAS-QA-PROMO-*` and be cleaned or audit-retained as specified.
- No production deployment. No amend, rebase, force-push, squash merge, source-branch deletion, or silent rollback.
- Exact-base Owner tests currently have two pre-existing failures in merchant-provider execution; branch-only new failure count must be zero and the baseline comparison must be recorded.

---

### Task 1: Freeze typed promotion contracts and deterministic presentation primitives

**Files:**
- Create: `packages/saas-contracts/src/promotions/types.ts`
- Create: `packages/saas-contracts/src/promotions/validation.ts`
- Create: `packages/saas-contracts/src/promotions/promotions.test.ts`
- Create: `packages/saas-contracts/src/promotions/index.ts`
- Modify: `packages/saas-contracts/src/index.ts`
- Modify: `packages/saas-contracts/package.json` only if its test/typecheck discovery requires it
- Create: `packages/saas-data/src/promotions/allocation.ts`
- Create: `packages/saas-data/src/promotions/allocation.test.ts`
- Modify: `packages/saas-data/src/promotions/index.ts`
- Modify: `packages/saas-data/src/index.ts`

**Produces:** Strict immutable V1 request/result/list/detail/analytics/code-batch contracts, code normalization, lifecycle derivation, natural-language summary inputs, and deterministic order/refund allocation utilities. It does not persist or evaluate eligibility.

- [ ] Add RED contract tests for all seven benefits, exact-key rejection, nullable limits, schedules/timezones, automatic/code triggers, include/exclude targets, audiences, combination policy, margin policy, evaluator context/result, legacy projections, list pagination, simulator non-mutation response, code batches, CSV rows, analytics and safe errors.
- [ ] Add RED allocation tests for proportional line allocation, stable remainder placement, gift/X-Y zero-paid rules, total caps, multi-currency rejection and refund upper bounds.
- [ ] Implement bounded parsers and deeply frozen outputs; codes normalize Turkish characters to ASCII uppercase, reject whitespace/control characters and remain store-scoped in persistence.
- [ ] Implement deterministic allocation with only safe integers and stable position/UUID tie-breaks.
- [ ] Export the new modules without changing existing storefront/merchant-admin contract shapes.
- [ ] Run focused tests, then contracts/data tests and typechecks.

### Task 2: Add migration 126 schema, evaluator, operations and PostgreSQL 16 rehearsal

**Files:**
- Create: `apps/owner/scripts/sql/saas/202609050126_promotions_studio.up.sql`
- Create: `apps/owner/scripts/sql/saas/202609050126_promotions_studio.down.sql`
- Create: `apps/owner/scripts/sql/saas/202609050126_promotions_studio_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/promotions-studio-migration.test.ts`
- Create: `tests/saas-phase3/promotions-studio/migration-static.test.mjs`
- Create: `tests/saas-phase3/promotions-studio/postgres-harness.mjs`
- Modify: `tests/saas-phase3/run-current-suite.mjs`

**Produces:** Additive tenant-safe schema and the single `promotion_evaluate_v1` authority plus CRUD/lifecycle/simulation/codes/reservation/redemption/analytics RPCs, legacy adoption, and a registered exact-count PostgreSQL 16 harness.

- [ ] Write RED static tests for the exact migration triplet, owner, timeout, RLS/FORCE, composite store keys, no direct app/host table writes, pinned search paths, narrow grants, operations, append-only audits, guarded down, and `apps/admin` exclusion.
- [ ] Write RED PG scenarios for feature/role matrix, cross-tenant 404, create/update/version conflict/replay/mismatch, publish validation, pause/resume/archive, server pagination/filter/search, target isolation, code uniqueness/normalization, cryptographic batch generation/replay, legacy percent/fixed adoption and unparseable read-only legacy records.
- [ ] Add evaluator RED scenarios for every benefit/audience/target/condition, schedule boundary, first paid order, abandoned cart, include/exclude, shipping/payment/channel, cost floor, limits, deterministic combination/tie-break, order cap, progress messages and invariants across reordered inputs.
- [ ] Add reservation RED scenarios for reserve/commit/release/expiry, callback replay, last-use race, budget race, customer limit, operation recovery and no Redis dependency.
- [ ] Create all spec tables with store-bound keys, checks, RLS/FORCE, immutable history triggers and no raw secret/token storage.
- [ ] Implement bounded rule validation and one set-oriented SQL evaluator; load active candidates and target facts without N+1 queries.
- [ ] Implement CRUD/lifecycle/simulation/conflict/margin/list/detail/code/batch/CSV/analytics RPCs with exact action and `promotions` feature authority.
- [ ] Idempotently adopt mappable generic discount rows as drafts under unique `legacy_record_id`; preserve all generic rows and expose unmappable rows read-only.
- [ ] Implement reservation/redemption operations using stable advisory/row locks and fingerprints.
- [ ] Make down migration fail when promotion/redemption/snapshot data exists; keep code-only rollback safe.
- [ ] Register the harness with exact scenario count/completion string and prove it is invoked by `npm run test:saas-phase3:current`.

### Task 3: Add the typed data repository and Customer Panel HTTP boundary

**Files:**
- Create: `packages/saas-data/src/promotions/types.ts`
- Create: `packages/saas-data/src/promotions/validation.ts`
- Create: `packages/saas-data/src/promotions/canonical.ts`
- Create: `packages/saas-data/src/promotions/errors.ts`
- Create: `packages/saas-data/src/promotions/repository.ts`
- Create: `packages/saas-data/src/promotions/repository.test.ts`
- Modify: `packages/saas-data/src/promotions/index.ts`
- Modify: `packages/saas-data/src/index.ts`
- Create: `apps/customer-panel/lib/server-promotions/runtime.ts`
- Create: `apps/customer-panel/lib/server-promotions/runtime.test.ts`
- Create: `apps/customer-panel/lib/promotions-http/request-input.ts`
- Create: `apps/customer-panel/lib/promotions-http/request-authority.ts`
- Create: `apps/customer-panel/lib/promotions-http/handler.ts`
- Create: `apps/customer-panel/lib/promotions-http/handler.test.ts`
- Create/Modify: route files under `apps/customer-panel/app/api/promotions/**`
- Modify: `apps/customer-panel/lib/server-runtime.ts` or the discovered composition file that registers repositories

**Produces:** Commit-unknown-safe PostgreSQL adapter and all Customer Panel read/mutation endpoints with server-derived tenant authority.

- [ ] Add RED repository tests for every SQL call signature, transaction mode, timeouts, role switch, strict result parsing, replay, operation recovery, rollback, destroyed-client paths, exact IDs and bounded pages.
- [ ] Add RED HTTP tests for session and feature checks, owner/admin success, editor/analyst mutation 403, cross-origin 403, private headers/client store ID rejection, cross-tenant 404, malformed content/size/IDs, idempotency, version conflict and safe 503.
- [ ] Implement canonical SHA-256 fingerprints and strict input validation before pool checkout.
- [ ] Implement read/write transaction helpers, optimistic versions and operation recovery following existing merchant-admin/catalog patterns.
- [ ] Register a narrow promotions repository façade in approved staging runtime composition.
- [ ] Implement list/detail/create/update/publish/pause/resume/duplicate/archive/simulate/conflicts/targets/codes/batches/CSV/analytics endpoints under `/api/promotions`.
- [ ] Ensure simulation is read-only and cannot create reservation, redemption, stock or analytics mutations.
- [ ] Run focused, contracts, data and Customer Panel tests/typechecks.

### Task 4: Integrate promotions with cart, offline checkout, hosted payment and immutable orders

**Files:**
- Modify: `apps/owner/scripts/sql/saas/202609050126_promotions_studio.up.sql`
- Modify: `apps/owner/scripts/sql/saas/202609050126_promotions_studio.down.sql`
- Modify: `apps/owner/scripts/sql/saas/202609050126_promotions_studio_assertions.sql`
- Modify: `tests/saas-phase3/promotions-studio/postgres-harness.mjs`
- Modify: `packages/saas-contracts/src/storefront/commerce.ts`
- Modify: `packages/saas-contracts/src/storefront/storefront.test.ts` and focused commerce tests
- Modify: `packages/saas-data/src/storefront-commerce/types.ts`
- Modify: `packages/saas-data/src/storefront-commerce/validation.ts`
- Modify: `packages/saas-data/src/storefront-commerce/repository.ts`
- Modify: `packages/saas-data/src/storefront-commerce/repository.test.ts`
- Modify: `packages/saas-data/src/storefront-hosted-checkout/types.ts`
- Modify: `packages/saas-data/src/storefront-hosted-checkout/validation.ts`
- Modify: related hosted-checkout repository tests
- Modify: `apps/storefront-shared/lib/checkout/standard-hosted-payment.ts`
- Modify: related checkout tests

**Produces:** Additive V2 commerce projections and repository calls that use the database evaluator, reserve/commit/release usage, send canonical discounted payment totals, and persist immutable snapshots/allocations while old interfaces remain unchanged.

- [ ] Write RED rolling-compatibility tests: old four-argument quote and existing response parser remain unchanged; new quote accepts coupon candidates and returns V2 cart promotion fields; old code/new schema, new code/new schema and code-only rollback pass.
- [ ] Write RED PG tests for automatic/code quote, invalid/ineligible code, coupon removal, client amount ignored, offline complete atomically commits redemption/order snapshot/allocation, failure rolls back, and operation replay is single-use.
- [ ] Write RED hosted tests for authority projection with discount, allocated provider basket matching total, one held reservation, payment failure/timeout release, captured callback commit, duplicate callback no-op and changed/archived rule not altering frozen settlement.
- [ ] Add immutable order snapshot/allocation projections without changing historical order totals.
- [ ] Add V2 contract fields for subtotal, line/shipping/total discounts, gifts, applied/rejected promotions and progress messages; keep V1 exact parser and function available.
- [ ] Update repository fingerprints to bind normalized codes and evaluator authority digest.
- [ ] Route new quote/offline/hosted flows through `promotion_evaluate_v1`; hosted settlement consumes the frozen reservation/snapshot, never re-evaluates.
- [ ] Implement deterministic refund-allocation RPC/contract only; no live provider refund call.
- [ ] Re-run migration harness, contracts, data and Storefront tests/typechecks.

### Task 5: Build Storefront coupon, promotion messaging and shareable-link UX

**Files:**
- Create/Modify: `apps/storefront-shared/lib/promotions/**`
- Create/Modify: cart API/request/runtime/route files selected by Task 4
- Modify: `apps/storefront-shared/components/CartPageClient.tsx`
- Modify: `apps/storefront-shared/components/CheckoutForm.tsx`
- Modify: `apps/storefront-shared/components/CheckoutSummary.tsx`
- Modify: `apps/storefront-shared/components/checkout-readiness.ts`
- Modify: `apps/storefront-shared/app/globals.css`
- Create: shareable coupon route under the existing Storefront route family
- Modify/Create: focused Storefront component, request, route and analytics tests

**Produces:** Server-confirmed coupon apply/remove, automatic-promotion labels, discount/gift rows, safe rejection copy, two bounded progress hints, and same-host share links.

- [ ] Add RED tests proving the browser never calculates or claims a discount, apply/remove re-quotes the server, normalized code state survives cart navigation, invalid/expired/usage errors are safe, automatic campaigns are labelled, gifts are not shown when unavailable, and inaccessible audience campaigns never leak.
- [ ] Add RED share-link tests for hostname/store binding, query stripping, invalid/archived code rejection, cross-tenant failure, no raw promotion authority and safe redirects.
- [ ] Add RED analytics tests for a validated `coupon_applied` behavior event without PII or financial authority.
- [ ] Implement the coupon field and summaries using only V2 server responses; preserve checkout if analytics/Redis is unavailable.
- [ ] Implement the share route using normalized code candidates and hostname authority.
- [ ] Verify keyboard flow, live regions, 390px layout and zero horizontal overflow in focused tests.
- [ ] Run Storefront tests/typecheck/build.

### Task 6: Build the dedicated Customer Panel list and five-step editor

**Files:**
- Create: `apps/customer-panel/components/promotions/PromotionStudio.tsx`
- Create: `apps/customer-panel/components/promotions/PromotionList.tsx`
- Create: `apps/customer-panel/components/promotions/PromotionEditor.tsx`
- Create: `apps/customer-panel/components/promotions/PromotionTargetPicker.tsx`
- Create: `apps/customer-panel/components/promotions/PromotionSimulator.tsx`
- Create: `apps/customer-panel/components/promotions/promotion-studio.module.css`
- Create: `apps/customer-panel/lib/promotion-ui/model.ts`
- Create: `apps/customer-panel/lib/promotion-ui/client.ts`
- Create: focused `apps/customer-panel/lib/promotion-ui/*.test.ts`
- Modify: `apps/customer-panel/app/discounts/page.tsx`
- Modify: `apps/customer-panel/app/discounts/new/page.tsx`
- Create: `apps/customer-panel/app/discounts/[promotionId]/page.tsx`
- Modify: `apps/customer-panel/app/discounts/[recordId]/edit/page.tsx` or replace its param safely with the canonical promotion route
- Modify: Customer Panel route/parity tests that currently assert generic discount console usage

**Produces:** Dedicated campaign home, 12 templates, controlled five-step wizard, sticky story, target/audience selection, conflict/margin gates, same-evaluator simulator, full lifecycle actions and dirty-state safety.

- [ ] Add RED UI/source tests for all templates, five and only five primary steps, plain Turkish copy, collapsed advanced controls, example/help copy, action-bearing empty/loading/error states and no internal terminology.
- [ ] Add RED model tests for template defaults, form preservation across steps, canonical dirty snapshots, code/date/tier/cross-field validation, natural-language summaries and publish eligibility.
- [ ] Add RED client tests for server pagination/filter/search, stale response suppression, selected IDs preserved across pages, idempotency, conflict/version responses and role-specific actions.
- [ ] Implement the list with five KPI cards, 7/30/90 range, server search/filter/pagination, human-readable mechanics, lifecycle/status badges, desktop table/mobile cards and required quick actions.
- [ ] Implement the template chooser and controlled five-step wizard; advanced settings stay closed by default and the sticky summary updates live.
- [ ] Reuse existing catalog/customer server search clients; archived/cross-tenant records cannot be selected and unresolved selected IDs remain visible until explicitly removed.
- [ ] Connect conflict/margin checks and simulator to server endpoints; publication remains disabled while blocking findings exist.
- [ ] Reuse `dirty-navigation.ts` for unload, internal link, cancel and modal-close protection; clear dirty state only after successful persistence.
- [ ] Leave `MerchantModuleConsole`, `MerchantRecordEditor`, generic non-discount routes and Lucky Wheel behavior unchanged.
- [ ] Run Customer Panel tests/typecheck/build.

### Task 7: Add code management, promotion analytics and Redis compiled-rule cache

**Files:**
- Create: `apps/customer-panel/components/promotions/PromotionCodes.tsx`
- Create: `apps/customer-panel/components/promotions/PromotionAnalytics.tsx`
- Modify: `apps/customer-panel/components/promotions/promotion-studio.module.css`
- Create: `apps/customer-panel/app/discounts/[promotionId]/codes/page.tsx`
- Create: `apps/customer-panel/app/discounts/[promotionId]/analytics/page.tsx`
- Modify/Create: focused promotion UI/client tests
- Modify: `packages/saas-cache/src/key.ts`
- Modify: `packages/saas-cache/src/key.test.ts`
- Create: promotion cache adapter/tests in `packages/saas-cache` or the existing Storefront runtime cache boundary
- Modify: `apps/customer-panel/lib/server-promotions/runtime.ts`
- Modify: `apps/storefront-shared/lib/default-runtime.ts`
- Modify: analytics contracts/data/SQL in migration `126` only where required for promotion dimensions
- Modify: `tests/saas-phase3/promotions-studio/postgres-harness.mjs`

**Produces:** Batch-code management and safe CSV, PostgreSQL-truth campaign metrics with Umami attribution, and best-effort compiled-rule caching that fails through to PostgreSQL.

- [ ] Add RED tests for cryptographically generated batch limits, batch replay, pause/revoke, remaining/used counts, export authorization, no PII and spreadsheet-formula neutralisation.
- [ ] Add RED analytics tests for usage, affected orders, discount, gross/net sales, average basket, new customer, abandoned recovery, recovered revenue, UTM dimensions, product/category rankings, currency separation and no causality claim.
- [ ] Add RED cache tests for environment/store/namespace/currency/channel/schema keys, validation before hits, namespace rotation after lifecycle mutation, TTL bounds and Redis read/write/delete failure fallback.
- [ ] Build codes and analytics routes/pages with read-only states for analysts and explicit unavailable/partial states.
- [ ] Query financial metrics from immutable PostgreSQL order snapshots/redemptions; use Umami only for anonymous attribution.
- [ ] Cache only validated active compiled definitions. Keep reservation, redemption, idempotency and financial analytics uncached.
- [ ] Run cache/contracts/data/Customer Panel/Storefront tests and typechecks.

### Task 8: Close performance, property, compatibility and integration coverage

**Files:**
- Modify: `tests/saas-phase3/promotions-studio/postgres-harness.mjs`
- Create: `tests/saas-phase3/promotions-studio/property.test.mjs`
- Create: `tests/saas-phase3/promotions-studio/performance.mjs`
- Modify: `tests/saas-phase3/run-current-suite.mjs`
- Modify: focused package/application tests only when a discovered gap requires a regression
- Create: `docs/ops/promotions-studio-rollout.md`

**Produces:** Exhaustive invariants, bounded performance evidence, full rolling-compatibility rehearsal, migration/rollback runbook and branch-only failure comparison.

- [ ] Add property/exhaustive tests for non-negative totals, discount caps, stable determinism across input order, same-store enforcement, inactive lifecycle exclusion, full/expired limits, simulation non-mutation and client-discount rejection.
- [ ] Measure 100 active campaigns, 20 cart lines and five codes with product/category/segment targets; assert no N+1 calls and warm p95 <=100 ms/cold p95 <=250 ms or fix the evidenced bottleneck.
- [ ] Rehearse canonical migrations through `125`, then `126` up + assertions, replay, old code/new schema, new code/new schema, code-only rollback, legacy adoption and data-bearing down guard on disposable PostgreSQL 16.
- [ ] Exercise offline and hosted checkout parity, reservation expiry/reconciliation and immutable order/refund snapshots.
- [ ] Document exact backup, restore verification, migration-first, assertion, code-only rollback, emergency down guard, deploy order, Redis outage, QA and cleanup steps without secrets.
- [ ] Run the registered harness through `npm run test:saas-phase3:current` and record exact scenario/completion evidence.

### Task 9: Fresh full verification and independent review

**Files:** All branch changes; no new feature scope.

**Produces:** Fresh evidence on the final branch and a clean independent review.

- [ ] Run all six required workspace test suites; compare Owner failures to exact-base and require zero branch-only new failures.
- [ ] Run all six typechecks sequentially where shared build output could collide.
- [ ] Run Customer Panel, Storefront Shared and Owner production builds sequentially.
- [ ] Run migration static tests, the promotion PG16 harness, Phase 3 current suite, performance/property tests and `git diff --check`.
- [ ] Scan for secrets, client store authority, client discount authority, destructive SQL, dual coupon authorities, forbidden internal merchant copy, unexpected `apps/admin/**`, and unrelated files.
- [ ] Request a whole-branch independent review for usability, contracts, tenant/action authority, evaluator determinism, money/allocation, reservation races, replay/recovery, hosted/offline parity, immutable snapshots, refund caps, cache fail-open, legacy safety and rollback.
- [ ] Fix every Critical/Important finding with a failing regression first, re-run affected/full gates and obtain scoped clean re-review.

### Task 10: Commit, PR, merge and migration-first staging certification

**Files:** No repository feature changes after review except review-tested fixes and PR documentation.

**Produces:** Logical commits, merged PR, exact staging running SHAs, real-browser evidence and cleaned QA fixtures; production remains untouched.

- [ ] Preserve logical commit history, push normally to `origin/codex/atlas-promotions-studio-v1`, open PR `feat(customer-panel): build simple promotions studio` against `codex/design-tabs-save-fix-live`, and include all required architecture/test/rollback/staging evidence.
- [ ] Revalidate base/head/commit/file scope, open/mergeable state, no `apps/admin/**`, no unexpected status checks and source branch preservation.
- [ ] Merge with a merge commit only; record the exact merge SHA and verify all source commits are ancestors.
- [ ] Record pre-rollout Customer Panel, Storefront, Analytics Worker and Owner running SHAs.
- [ ] Take the main SaaS PostgreSQL backup and restore-verify it in isolation without exposing secrets.
- [ ] Apply migration `126` + assertions first; verify migration replay/idempotency and compatibility.
- [ ] Deploy only changed staging services at the exact merge SHA in safe order; do not deploy production.
- [ ] In real Chrome, create only timestamped `ATLAS-QA-PROMO-*` products/campaigns/codes and execute all wizard/templates, targeting, simulator, cart/code/automatic/progress, offline or safe non-charged checkout, lifecycle, analytics, role/tenant and share-link scenarios.
- [ ] Verify exact running SHA, health, console error/warning 0, unexpected 4xx/5xx 0, no login loop, and layouts at 1440/1024/390 with horizontal overflow 0.
- [ ] Test Redis outage by stopping only the staging cache dependency, prove PostgreSQL fail-through and checkout correctness, then restore and verify health.
- [ ] Archive QA campaigns/products, revoke/pause QA batches and recovery tokens, release active QA reservations, remove temporary CSV/fixtures, restore temporary settings and prove real Güzide data unchanged. Preserve audit-required records and the source branch.
