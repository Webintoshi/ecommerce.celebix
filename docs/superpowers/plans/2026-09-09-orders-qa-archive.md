# Orders QA Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Reversibly remove explicitly selected QA orders from operational queries without changing business history.

**Architecture:** Add separate archive state and append-only archive/restore operation records. Reuse server TenantContext and orders.manage authorization. Filter active orders in SQL before pagination, preserve financial queries, and expose archive state through a backwards-compatible detail contract.

**Tech Stack:** PostgreSQL 16, TypeScript, existing Node tests and Customer Panel.

**Spec:** User-approved ATLAS ONAYI — ORDERS QA ARŞİVLEME in this task, 2026-09-09.

## Global Constraints

- Existing branch codex/atlas-orders-qa-cleanup, starting HEAD 152cf2d4700a27406f753b4b97a467fb7e571260; canonical 455a4a538f4ff78915d38d37247956949aa2f15e.
- No live migration/apply, deployment, merge, environment, payment approval or Auto Deploy changes.
- No DELETE or UPDATE of order/draft/item/event/operation/payment/snapshot history, no trigger weakening, no changes to IDs/FKs, order/payment status, amounts, inventory or financial analytics.
- Exact QA IDs belong only to the future cleanup allowlist, never generic backend code.
- Initial targets af1982e0-c3f2-5f39-8509-8e0250394b13 and 0e8bca85-e87c-5a82-8a4e-d615b6d4df29; store from old evidence a828862c-4cc1-475a-89cc-5fbee31eb43f, slug guzide-kuyumcu-4, DB celebix_saas_staging_auth01. These are historical identifiers, not a fresh live eligibility certification.
- Protect every non-allowlisted order, especially payment/provider history, pending notifications, active Mira QA and the 503 reproduction record.
- Existing dependencies only; no cleanup. Heavy validation serialized with Mira, minimum 5,000,000,000 bytes available.

### Task 1: Transactional archive and operational query compatibility

**Files:**
- Create additive SQL migration and assertions under apps/owner/scripts/sql/saas using the next free migration number.
- Create tests/saas-phase3/orders-qa-archive/postgres-harness.mjs using real migrations, not reduced schema copies.
- Modify packages/saas-contracts/src/orders/types.ts, validation.ts and relevant exports/tests only as required for archive metadata.
- Modify packages/saas-data/src/orders/types.ts, repository.ts, validation/cursor helpers and tests for archive query, archive/restore and metadata.
- Modify narrowly Customer Panel order HTTP/runtime/client/detail presentation and their tests to expose authorized archive access/restore and a small archive indicator.

**Interfaces:** archiveOrder and restoreOrder accept server authority, UUID operationId, orderId, reason and QA evidence reference; archive state is distinct from order business state. Archive listing uses a separate cursor scope so a normal cursor cannot leak archived records. Existing list calls retain active-only behavior, existing financial summary remains unchanged.

- [ ] Write failing real PostgreSQL tests that assert archive and restore outcomes, active/archived list membership before LIMIT, search and neighbors, unchanged digest/count of immutable history, tenant/privilege rejection, replay/mismatched operation rejection and concurrent operation safety. Observe RED before adding production behavior.
- [ ] Add separate state + immutable operation audit, composite store/order FK, restricted table grants and security-definer functions using existing merchant_action_authority_error with orders.manage. Serialize per order and operation key, recheck dependency gates while locked, return replay without a second audit entry. New payment/shipping/inventory/active notification dependencies fail closed; use conservative blocking for uncertain dependencies.
- [ ] Add additive replacements/wrappers for active SQL list and neighbors; archive query requires management authority. Keep old migration files and trigger definitions unchanged. Detail payload supports absent archive metadata for old responses; new code displays archived state without fabricated order details.
- [ ] Run focused contracts/data/HTTP/presentation tests and real PostgreSQL16 harness serially. Record exact RED/GREEN evidence and any unsupported test separately.
- [ ] Self-review changed files, stage only exact owned files and commit the implementation; do not push. Report changed paths, commit SHA, commands/counts and unresolved concerns to the root controller.

### Task 2: Exact allowlist tool, verification and delivery

**Files:** scripts/atlas-orders-qa-archive.mjs or SQL counterpart; docs/qa/atlas-orders-qa-archive.md; rollback notes in the same QA document. Disable the obsolete DELETE apply entrypoint without running it.

**Interfaces:** invoke the Task 1 functions using real server-resolved TenantContext, not fabricated principal or client-supplied authority. The tool defaults to read-only dry-run, verifies exact environment/store/two-order allowlist and current eligibility, and never accepts broad name/status selection.

- [ ] Test tool default dry-run and exact target rejection in disposable PostgreSQL; assert physical row digests unchanged and output contains only non-PII eligibility/count information.
- [ ] Document fresh/live verification availability separately from disposable fixture evidence. If no authorized live read connection exists, report live dry-run BLOCKED rather than recycling old eligibility.
- [ ] Run affected full tests/typechecks/builds serially, then diff-check and independent branch review; fix scoped findings without weakening tests.
- [ ] Verify push cannot trigger deployment, push only this branch and create its separate PR with migration/readiness/rollback and test limitations.
- [ ] Deliver exact head and dry-run command, no live archive, no deletion. Rollback old application code may re-show archived records; keep metadata/audit intact.
