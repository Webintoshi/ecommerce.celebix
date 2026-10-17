# Cashier Commissions Implementation Plan

> **For agentic workers:** Use subagent-driven-development to implement the independent native, contract/transport and panel tasks; root integrates HTTP/runtime and owns publication. Steps use checkbox syntax for tracking.

**Goal:** Managers configure each cashier's percentage commission and see accurate net-product-sales entitlement in Accounting → Primler.

**Architecture:** Add a staff-only V6 setting contract and a prospective completion snapshot. A manager-only indexed native report applies current return/discount adjustments using the captured rate. Existing sales and financial contracts remain unchanged.

**Tech Stack:** PostgreSQL native RPC/trigger, TypeScript shared contracts/repositories, Next.js shared Customer Panel.

**Spec:** `docs/superpowers/specs/2026-10-17-cashier-commissions-design.md`

## Global Constraints

- Default commission false/0; enabled rate 1–10000 bps; no 20% ceiling.
- Net merchandise after discounts/returns, excluding delivery; per-sale integer-cent rounding.
- Staff V1–V5 and sale/payment V4 remain compatible; existing source-pinned functions remain unchanged.
- Managers only; no automatic real grant activation, plaintext phone exposure, cash/bank effect or historical backfill.
- No whole-database business scans or polling. Root alone publishes NET → SITE after verification.

## Review Focus

- A manager completing/taking over a cashier's sale must not move the original seller's entitlement.
- Changing/revoking settings must not rewrite previous rates or delete entitlement.
- Partial payments/replayed completion and actual refund settlement must not duplicate accrual/deduction.
- Deleted staff/order and reversed discounts must preserve historical identity and restore the correct amount.
- Date/currency/cent boundaries and malformed or forged permission inputs must fail safely.

## Task 1: Native support — native agent

**Files:** new `202610170250_cashier_commissions.{up,down}.sql`, assertions and focused native test under `apps/owner/scripts/sql/saas/`.

**Interfaces:** produces staff V6 list/set/recover, completion snapshot and `accounting_commissions_read(auth7,jsonb)`. Consumes immutable create-operation attribution, current staff grants and existing receivable adjustment counters.

- [ ] Write and observe failing focused scenarios for prospective capture, rate limits, original seller, zero/disabled grants, partial payments, replay, late discounts/returns/reversal, shipping exclusion, removed identities and manager-only isolation.
- [ ] Add guarded default columns, private snapshot/trigger and V6/report RPCs; keep all existing function definitions/ACLs unchanged.
- [ ] Run native scenarios, source/schema scope assertions and conservative rollback checks in an isolated fixture. Freeze hashes; no live effects.

## Task 2: Strict contracts and staff transport — contract agent

**Files:** `packages/saas-contracts/src/accounting/commissions.ts`, accounting/staff type/validation exports; matching `packages/saas-data` repositories; existing in-store-sales HTTP/browser client and tests.

**Interfaces:** produces `parseAccountingCommissionsFilters`, `parseAccountingCommissions`, `AccountingRepository.commissions`, staff V6 input/output and atomic retry handling.

- [ ] Observe failing tests for rate >20%, 100%, invalid/zero enabled, legacy DTO/receipt preservation, date/filter/report math and unauthorized reads.
- [ ] Implement immutable strict parsers and version-selected V6 calls. Bind returned report dates and saved grant flag/rate/version to the request.
- [ ] Run focused suites/typechecks; share exact interfaces with UI/root; no live effects or independent commit.

## Task 3: Shared panel — panel agent

**Files:** both existing cashier sales permission forms, new CommissionConsole/style/page, accounting navigation, panel route/nav/cashier gates and focused behavior tests.

**Interfaces:** consumes V6 flags/rate and `accountingUi.commissions(filters,signal)` returning the spec report.

- [ ] Observe failing form/permission/report behavior tests, including unchanged existing fields, optional disabled rate, error preservation, zero/empty rows and stale response isolation.
- [ ] Add the checkbox and percentage field to the same atomic save. Add manager-only Primler navigation/report with stable loading and period controls.
- [ ] Verify cashier general accounting access cannot expose the staff commission report; run focused tests and self-review.

## Task 4: HTTP/runtime integration — root

**Files:** accounting HTTP handler/tests, browser client/tests, server accounting method binding/tests and new API route.

**Interfaces:** `GET /api/accounting/commissions` → manager-only `runtime.accounting.commissions` with server-derived tenant authority.

- [ ] Write failing tests for manager success, full-account cashier denied, duplicate/forged query or headers, malformed/date-mismatched response and unavailable runtime.
- [ ] Implement the route, strict request/response validation and runtime binding without altering other accounting actions.
- [ ] Run focused tests and cross-layer typechecks. Review the three tasks, resolve discrepancies, then commit the single candidate.

## Task 5: Shared release — root only

- [ ] Official panel build and owner compatibility build/typecheck; preserve generated payment metadata evidence and restore only own generated source artifacts.
- [ ] Capture fresh native249/6-runtime/ref/config baseline. Review bounded additive native250 stage and commit once under canonical lock; inspect uncertain outcomes without replay.
- [ ] Publish exact leased shared refs, update only approved source pins/SOURCE_COMMIT values, queue NET then SITE, and verify actual source/health/payment/config plus truthful UI acceptance.
- [ ] Confirm no real commission settings were enabled automatically; report the live feature and exact entry points concisely.

## Execution rulings

- User asked for planning and coding in the same request; no repeated generic design/implementation approval is required. The financial basis was explicitly confirmed in the async reply.
- Original creator is the commission recipient because takeover/collection by a manager is operational assistance, not an implicit reassignment of incentive.
- Keep current masked staff-phone convention; no new decryption authority is introduced for a payroll report.
- Existing amount-based financial returns/discounts reduce merchandise first, capped at zero; payment refund is a settlement and is not a second deduction.
