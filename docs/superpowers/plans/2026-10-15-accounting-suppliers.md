# Supplier debts and recorded payments implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans for the scoped tasks below. Root coordinates interfaces, review and publication.

**Goal:** Shared supplier debts with partial payments and visible cash/bank effects, published safely to all stores.
**Architecture:** Separate strict supplier contracts and additive private native241 records. Existing expense/reversal ledger writes are reused atomically; existing1848 functions and old DTOs stay exact.
**Tech Stack:** TypeScript, React/Next.js, private PostgreSQL16, existing FinanceModal/accounting styles.
**Spec:** `docs/superpowers/specs/2026-10-15-accounting-suppliers-design.md`

## Global constraints

- Root sole publisher; no real live financial records for QA.
- Owner/admin only; no new cashier/auth grants, polling, dependencies or stock/purchase-order changes.
- Money safe integers; atomic exact replay; frozen unknown commands; preserve old API keys/native1848 definitions/owners/ACLs.
- NET → read-only acceptance → SITE → read-only acceptance,6GiB disk floor and unchanged owner/storefront/payment/domain witnesses.

## Review focus

- Generic expense reversal must reopen the linked supplier debt without stale paid counters.
- Same/different concurrent payment keys must not overpay or spend the same account balance twice.
- Backdated records and previous cash counts must use actual ledger movement rather than timestamps.
- Response/receipt mismatches and unavailable browser storage must never permit a second financial command.
- Currency/date/filter/100-row limits must not hide matching debts or manufacture totals from a truncated page.

### Task1: Shared contract and transport (Root)

Files: new `packages/saas-contracts/src/accounting/suppliers.ts` +tests; accounting index, data repository/types/tests; HTTP handler/default/tests; UI client/tests; server runtime/tests; shared API router if required.
Interfaces: exact names and shapes in the spec.
- [x] Write and observe failing contract tests for debt/payment/result identities, dates, safe money, status arithmetic and command binding.
- [x] Implement strict immutable parsers and result matching; verify tests pass.
- [x] Write failing repository/HTTP/client/runtime cases; implement supplier methods/routes using existing authority and transaction patterns, then run scoped regressions.

### Task2: Additive native241 (accounting_audit)

Files: SQL241 up/assertions/down; dedicated readonly verifier/manifest in Root packet.
Consumes: Task1 exact JSON contract. Produces:3 least-privilege RPCs, immutable evidence and exact old1848 preservation.
- [x] Prove missing supplier RPCs fail in isolated PG.
- [x] Implement four private immutable tables, helpers and RPCs with common locks and existing expense/reverse delegation.
- [x] Verify partial/full, overpay, funds, stale/concurrent/replay, all reversals, cancellation, authority, old cash/expense/collection behavior, assertions/down guards.

### Task3: Shared understandable UI (supplier_ui)

Files: new SupplierDebtsConsole/component/model/tests/page; accounting tabs/settings/navigation/presentation route mapping as required.
Consumes: Task1 parsers/client methods. Produces: list/detail/create/pay/reverse/cancel forms, before→after preview and preserved command recovery.
- [x] Write and observe failing arithmetic, frozen command, recovery, form validation/cancel/focus and navigation tests.
- [x] Reuse FinanceModal/styles; implement screens with explicit empty/loading/error/limit states and per-currency amounts.
- [x] Verify tests,390/1024/1440 layout, keyboard/Cancel/Escape, no polling/errors; Root final visual acceptance.

### Task4: Native and rollout evidence (catalog_stability + Root)

Files: private fresh `.tmp/accounting-suppliers-20261015` packet, docs/qa supplier report.
- [x] Build isolated PG behavior fixtures and fresh240+241 verifier strategy; old1848exact baseline preserved.
- [x] Run affected typechecks, native assertions/behavior, normal production build and fresh independent whole-change review.
- [x] Root applies atomic native241 with sealed sources; capture fresh exact six runtimes and private release evidence.
- [ ] Root commits exact files, seals/pushes shared refs, publishes NET then SITE, records truthful read-only live acceptance, verifies final runtimes/native/payment/domain boundaries and disk floor.

Ruling: The user's direct implementation/live request and Customer Panel AGENTS supply execution/publication authorization; no repeated process approval is needed. Supplier name snapshots follow the current purchasing model, and partial payment is cash-basis paid expense only once. Actual banking transfers and automatic procurement expense recognition remain outside this feature.
