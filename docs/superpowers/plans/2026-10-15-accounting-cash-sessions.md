# Shared cash sessions implementation plan

> **For agentic workers:** Execute coordinated independent SQL/UI tasks with Root owning contracts, integration, review and publication. Preserve existing shared worktree and release authority.

**Goal:** Simple cash opening, counting, closing and persistent differences for every store.
**Architecture:** Separate count-only session subsystem anchored to existing locked cash ledger snapshots; additive strict contracts and three RPC entry points. A dedicated shared page reuses FinanceModal and accounting tokens.
**Tech Stack:** Next/React, TypeScript contracts/repositories, PostgreSQL16.
**Spec:** `docs/superpowers/specs/2026-10-15-accounting-cash-sessions-design.md`.

## Global constraints
- No automatic money/stock/order mutation or new cashier authority.
- Existing accounting/POS/Owner/storefront DTOs remain unchanged.
- One active session per cash account; closed snapshots immutable.
- Explicit zero counts accepted, safe integer cents only; signed differences retained.
- No polling; durable operation recovery with actor/store scope.
- Root only publishes native then NET then SITE under the existing canonical lock and disk floor.

## Review focus
- Reopening from an old browser after another complete session must conflict even if account version has not changed.
- A sale or reversal committed during counting must invalidate the stale close preview.
- Opening/closing counts never double-count money or erase inherited shortages.
- A network failure or reload must retain the exact operation and recover its committed result.
- Backdated and delayed financial operations affect current delta but never change closed history.

### Task1: Contracts and integration (Root)
- [x] Parser tests for open/close, strict keys, signed arithmetic, frozen closed/current projections, replay identity.
- [x] Implement `cash-sessions.ts`; add repository methods, strict HTTP routes and UI client with actor/store authority.
- [x] Repository/HTTP/client/runtime tests prove role, origin, operation and response identity checks.

### Task2: Native support (accounting_audit)
- [x] Write focused real-PG failing scenarios before SQL240.
- [x] Add private sessions/operation tables, guard, list/mutate/get-operation functions with existing locks and strict native validation.
- [x] Add atomic assertions and safe unused down; used down refuses; old1842 function definitions/ACLs unchanged.
- [x] Real-PG proof: single-open, frozen-close, replay/mismatch, stale-open/close, concurrency, cash-only, cross-store, overflow and no ledger mutation.

### Task3: Shared UI (accounting_ui)
- [x] Inventory preserved existing account actions; reuse shared modal/tokens.
- [x] Implement `CashSessionsConsole.tsx`, model and tests, page and navigation links to `/accounting/cash-sessions`.
- [x] Empty/error/loading states, zero count, inherited/current/total differences, difference note, cancellation, focus and unknown recovery across reload.
- [x] Real component QA390/1024/1440 without customer records.

### Task4: Review and rollout (Root + catalog_stability)
- [x] Focused tests and normal TypeScript production build; independent review, fix material findings.
- [x] Fresh native240 preservation/manifests and release packet; Root atomic SQL up+assertions under canonical lock.
- [ ] Bind/seal exact committed scope; lease-push; NET then SITE with actual read-only UI acceptance.
- [ ] Final native/six-runtime/payment/Google/auth/domain/source proof; report live feature and limitations accurately.

## Execution decisions
User explicitly requested implementation and shared live rollout; preserve that authorization and continue without a redundant design/deploy approval round. Current isolated worktree at9fabf9de9 is reused. Prior research and existing workflow resolve routine UX choices. No dependency installation or SDK upgrade is required; direct private native SQL convention supersedes generic Supabase CLI migration naming.
