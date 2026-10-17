# Commission payments implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the independent tasks below; root owns integration and the only live release.

**Goal:** Record partial cashier commission payments and show outstanding debt and cash/bank impact clearly.

**Architecture:** Add native251 payout relations backed by existing immutable accounting expense events. Keep native250 period earnings intact and expose separate all-time payment balances with optimistic content/account concurrency controls and durable operation receipts.

**Tech Stack:** PostgreSQL, shared TypeScript contracts/data, Next.js Customer Panel, existing FinanceModal.

**Spec:** docs/superpowers/specs/2026-10-17-commission-payments-design.md

## Global constraints

- Manager/store-owner only; server-derived tenant and current package checks at every boundary.
- Existing1888 function sources and native250 strict DTO remain unchanged; new additive native251 only.
- TRY/cash/bank only, exact integer cents, no automatic write retry, no real payment test writes.
- Separate all-time payable balances from the existing period-earned report.
- One expense/debit per payment, one compensating credit per correction, no earned-expense double count.
- Shared NET then SITE rollout, root sole publisher; preserve owners, storefronts, keys, payment authority and other configuration.

## Review focus

- A later return reduces entitlement below paid: show advance and carry it forward without rewriting money history.
- A generic expense correction must restore payable balance, not only a dedicated Primler correction.
- A disconnected save/reload must recover the original exact command without double debit.
- Concurrent cashier sales/returns and multiple managers must not bypass the balance/account concurrency checks.
- Removed staff and date-filter changes must not hide a real unpaid balance or create duplicate payable amounts.

## Task1: Native ledger and payments

Owner commission_payout_native: four new251 up/down/assertion/native-test files. Consume the exact spec RPC/DTO. Write and run failing native fixtures, implement additive private storage/helpers and RPCs, verify atomic expense+balance effects, receipt replay/recovery, original source invariance, reversals and all review-focus cases. Stop the local fixture when finished. No live effects.

## Task2: Shared contracts and repository

Owner commission_payout_contracts: new accounting/commission-payments.ts/test and accounting exports, data types/repository/tests. Test first strict arithmetic/date/token/result binding, safe bounds, actor/current tenant, four read/write/recovery methods and uncertain commit behavior. Preserve old contracts/tests. No HTTP/UI/live edits.

## Task3: Shared UI

Owner commission_payout_ui: CommissionPaymentsWorkspace/model/tests/styles and CommissionConsole integration. Consume frozen contract and four browser client methods. Test first partial payment preview, stale/error recovery, unchanged command/key, cancellation/focus, reversal and all-time/period separation. Reuse FinanceModal, layout tokens, mobile cards and existing CSS family. No backend or live writes.

## Task4: HTTP/client/runtime integration

Root: test first four manager-only endpoints, exact paths/query/body/origin/key, malformed/foreign response refusal, balance/account/request binding and cancellable no-store reads. Wire catchall dispatch, four client methods, runtime whitelist and fixtures. Run focused existing accounting and new suites, panel/owner typechecks and official builds.

## Task5: Review and shared release

Root plus fresh read-only review: review financial/security/UI behavior and reconcile any concrete issues. Commit exact candidate; prepare fresh guarded native251 stage and two-panel release captures. Independently review scope and frozen sources. Stage once preserving existing1888 sources/rows/config; bind reviewed native state, update only two shared refs and panel source pins; deploy NET, inspect actual runtime and authenticated UI, then SITE and final protected-state checks. Record truthful evidence, leave actual commission/payment settings and real balances untouched.
