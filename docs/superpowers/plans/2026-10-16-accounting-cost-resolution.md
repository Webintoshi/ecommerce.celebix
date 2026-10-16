# Accounting Cost Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task. Root coordinates and publishes.

**Goal:** Include recorded catalogue costs when a sale has no captured cost, with honest provenance and unchanged cash/debt flows.

**Architecture:** Preserve immutable known costs. A gated native244 profitability reader resolves missing costs within the report query and adds optional provenance accepted by compatible shared panels.

**Tech Stack:** PostgreSQL16, TypeScript, React/Next.js, existing node tests.

**Spec:** [Design](2026-10-16-accounting-cost-resolution-design.md).

## Global Constraints

- Shared across present/future tenants; no tenant-specific source branches.
- No financial-history rewriting, inferred sibling costs, currency guesses or new polling.
- Defaultfalse producer gate; actual NET acceptance before SITE, both before enable.
- Preserve native243 discounts, Owner/storefront/payment/worker authorities and other active releases.

## Review Focus

- Explicit zero versus missing cost: native and parser cases.
- Cross-store/product/currency mismatch: no adoption of unrelated cost.
- Historical known cost versus current catalogue edit: frozen cost wins.
- Sale/reversal and later debt collection: no duplicate cost deduction.
- Old strict readers: disabled native gate preserves legacy payload exactly.

## Task 1: Native report correction

**Files:** create `apps/owner/scripts/sql/saas/202610160244_accounting_cost_resolution.{up,down}.sql` and `_assertions.sql`; private isolated244 evidence under `.tmp/`.

**Interface:** Existing `saas.accounting_profitability_read(...)`; optional paired `catalogCostOrderCount`/`catalogCostCents`; private `accounting_release_state.cost_catalog_fallback_enabled`.

- [x] Prove missing historical snapshot/current exact cost fails on native243.
- [x] Implement minimal gated cost resolution, exact predecessor backup and guarded rollback.
- [x] Verify frozen zero/current fallback/uniform archived product costs/divergent product costs/invalidation/currency/reversal/collection-date behavior using actual isolated RPCs.
- [ ] Produce exact function/schema/ACL manifest and portable read-only verifier.

## Task 2: Compatible report reader and explanation

**Files:** `packages/saas-contracts/src/accounting/profitability.ts` and `.test.ts`; `apps/customer-panel/components/accounting/ProfitabilityConsole.tsx` and `.behavior.test.ts`; `apps/customer-panel/lib/accounting-ui/profitability-model.ts` and `.test.ts`.

**Interface:** Accept old payloads unchanged; validate paired optional provenance, positive order count and signed safe cents. Existing total already includes fallback cost.

- [x] Fail focused parser/model/UI cases for new provenance before implementation.
- [x] Accept the additive fields without changing old DTO shape or deducting cost twice.
- [x] Explain current-cost use and correct missing-cost message; run focused tests/typechecks.

## Task 3: Root integration and shared rollout

- [ ] Review final native/contract/UI delta and independently inspect money/identity failure modes.
- [ ] Build final candidate after incorporating any separately accepted shared UI baseline.
- [ ] Fresh source/native/runtime/domain/payment/capacity baseline; install244 disabled atomically.
- [ ] Publish compatible shared NET then SITE; verify actual images, logged-in report UI and unchanged existing flows.
- [ ] Enable only the private244 gate; verify actual report resolves costs and clearly identifies current-cost use. Save truthful completion evidence.
