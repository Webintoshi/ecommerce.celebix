# Orders QA archive — implementation evidence

Status: IMPLEMENTED; VALIDATION PARTIAL — remaining consumer checks blocked by disk capacity. No live migration or archive has run.

## Authority and scope

User approval: `ATLAS ONAYI — ORDERS QA ARŞİVLEME`, this Codex task, 2026-09-09. This is approval to implement/test/prepare a separate PR, not approval to modify live data or deploy. No agent signature substitutes for a human release approval.

Starting branch `codex/atlas-orders-qa-cleanup`, source `152cf2d4700a27406f753b4b97a467fb7e571260`; canonical `455a4a538f4ff78915d38d37247956949aa2f15e`. Source branch and canonical were rechecked against remote on 2026-09-09.

Historical allowlist evidence from the old exact-ID script:

| Identifier | Value |
|---|---|
| Database | celebix_saas_staging_auth01 |
| Store | a828862c-4cc1-475a-89cc-5fbee31eb43f |
| Store slug | guzide-kuyumcu-4 |
| Target 1 | af1982e0-c3f2-5f39-8509-8e0250394b13 |
| Target 2 | 0e8bca85-e87c-5a82-8a4e-d615b6d4df29 |

These identifiers are not fresh live eligibility evidence. Existing records must be rechecked through the authorized runtime before a future application. All other orders are excluded from the cleanup allowlist, including payment-history `a53947fb-e99f-4be5-8d05-5c5cf4eeeb4e`, active QA `a5de1e47-404a-5e90-89c2-2fa9da177a4f`, and incident reproduction `3f8fb0cc-3d25-4bea-aca7-569bc01f9cd6`.

## Old physical-delete path

`scripts/atlas-orders-qa-cleanup.sql` is retired and fails with `ORDERS_QA_PHYSICAL_DELETE_RETIRED`. It no longer contains an apply/delete implementation. Before retirement, a disposable PostgreSQL16 test expected this rejection but observed `atlas_orders_qa_cleanup_wrong_database` (RED). The old apply path was never executed against a live database by this task.

## Exact allowlist runner

`scripts/atlas-orders-qa-archive.mjs` exports `runOrdersQaArchive`. It accepts a trusted server-side `resolveAuthorizedScope` callback, not user-supplied principal/tenant IDs or a DB URL. The host must obtain a fresh existing authenticated TenantContext and verify database name on its already-authorized connection. Repository functions retain independent orders.manage and database authority checks.

Default mode is dry-run. Only the two constant IDs are considered; wrong store/database/slug, unresolved authority or caller-selected IDs fail closed. The runner never returns raw order payloads. Explicit apply additionally requires an evidence reference and uses stable archive operation IDs. This task has not invoked apply on live data.

Each target is its own transaction. An error on target 2 can follow a committed archive of target 1; an exception does not mean the whole batch rolled back. After any error or uncertain response, inspect a fresh dry-run and the operation audit before retrying. Never manufacture a new operation ID to force an uncertain operation through. The two operation IDs are for this one-time cleanup; restoring an order is a separate audited operation, not deletion of the original archive operation.

```js
// In the existing authenticated server host, with its trusted resolver:
await runOrdersQaArchive({ resolveAuthorizedScope }); // read-only dry-run
// Only after separate release/data approval:
await runOrdersQaArchive({
  resolveAuthorizedScope,
  mode: 'apply',
  evidenceReference: 'docs/qa/atlas-orders-qa-archive.md#controlled-release',
});
```

Local command `node scripts/atlas-orders-qa-archive.mjs --dry-run` intentionally refuses to fabricate this runtime and exits 2 with `authorized server runtime required`. No environment values, credentials or browser cookies are read. An authenticated maintenance-host resolver is not yet verified in this task; live dry-run is BLOCKED, not PASS.

Boundary test command: `node --test scripts/atlas-orders-qa-archive.test.mjs`.
First run: 0 PASS / 5 FAIL because runner absent. A sixth test then failed because changed historical target evidence was not rejected. A seventh failed because a historical archive replay after restore was treated as current success; the runner now checks current state after the mutation/replay. Current boundary result: 7 PASS / 0 FAIL. These use a controlled repository boundary and are not PostgreSQL or live certification.

## Disposable PostgreSQL 16 integration

Command: `ARCHIVE_TOOL_INTEGRATION=1 node --experimental-transform-types tests/saas-phase3/orders-qa-archive/postgres-harness.mjs`.

Latest integrated run: **17 PASS groups** (14 core groups plus 3 exact-allowlist groups), exit 0. PostgreSQL 16 uses its own temporary Unix socket and cluster, never an existing server. Actual repository migrations through 126 are applied, then additive 127; the tenant-specific pilot admin-domain seed is deliberately excluded. The exact historical fixtures are inserted before transactional-email migration 089, matching the targets' pre-migration history. No trigger is disabled and no notification is deleted to make them eligible.

- Exact two-target dry-run: eligible 2, archived 0, deleted 0.
- Actual repository archive/restore: both targets; all other orders remain unchanged.
- A synthetic dependency committed after eligibility makes actual archive reject with `invalid_transition`; archive audit remains empty for those targets.
- Whole-saas per-table physical row counts and ordered content digests remain identical before/after, excluding only the two new archive metadata/audit tables. Fixtures include items, events, draft lines, six immutable draft operations, order operations, catalog/inventory state, payment-status protected order and the protected QA/incident IDs.
- Default list excludes the two archived records; authorized archive query returns them; restore returns both to the normal list. Small-page search/neighbors, replay, concurrent operations, tenant/manage denial and real pending notification rejection are covered by the core groups.
- Old `orders_get` preserves its exact response contract; new code uses `orders_get_with_archive`. Existing immutable draft-operation triggers still reject UPDATE/DELETE.

The first integrated fixture attempts exposed real inventory provenance enforcement and email-trigger timing. Setup was corrected to use normal catalog provenance and the real chronological migration order; neither production validation nor immutable triggers were weakened. A synthetic dependency table owner was aligned with the real migration owner so the test could exercise the intended dependency rejection instead of an unrelated permission failure.

Last integrated disk before/after: **11,048,095,744 / 10,994,442,240 bytes**. No worktree cleanup occurred. Disposable cluster teardown removes only the cluster created by that test.

These are isolated database/application evidence, not live staging certification or payment-provider certification.

The obsolete simplified-schema cleanup harness now forwards to the actual-migration archive harness. Its old physical-delete assertions are retired, not represented as archive test evidence.

## Full-suite and independent review

Core commit: `02f5fcdfab0649bbf20c6847bcc74f8414377d23`. The full contracts suite detected the two newly exported archive parsers missing from its frozen export allowlist. Commit `52984ad216f48ef164f620da22bb3f5dac2a534f` adds only those exact expected names, preserving the strict equality assertion.

- Contracts full suite: 332 PASS, 0 FAIL.
- Data full suite: 614 PASS, 0 FAIL.
- Customer Panel full suite: 1321 PASS, 0 FAIL, 1 existing SKIP (1267 + 54 passing tests across its two official commands).
- Focused archive contracts/data/HTTP/runtime/UI: 116 PASS; exact runner boundary: 7 PASS.
- Independent integrated review: no Critical or Important findings. Actual repository/PostgreSQL evidence gap closed; per-target partial completion behavior documented. Minor future-maintenance note: active/archive SQL list projections must retain parity.
- Typecheck: contracts, data, Customer Panel, Owner and Storefront PASS. Admin FAIL: 111 diagnostics across 35 files, all byte-identical to canonical `455a4a538f4ff78915d38d37247956949aa2f15e`. Admin source/config/local type dependencies and lockfile have no diff; no changed SaaS contract/data imports were found there. This is source comparison, not an executed canonical baseline or proof of identical external dependencies. No unrelated fixes were made.
- Customer Panel production build: PASS, exit 0. Generated archive list/archive/restore API routes are included. Full compilation and TypeScript phases completed; this is not a deployment or payment-build approval.
- Full-suite logs: local `/tmp/orders-archive-validation-VOzQ3q/`; these contain isolated test evidence, not live certification. Remaining consumer builds and Owner/Storefront full suites are BLOCKED below the 5,000,000,000-byte disk gate. Owner's two previously reported baseline failures are historical separate-branch evidence, not a fresh archive-branch result.
- Disk for the broad-validation phase fell from 7,546,105,856 bytes to 3,460,321,280 bytes. No worktree cleanup occurred; changes in available space are not attributed to another process without proof. The in-flight Panel build started above the threshold and was allowed to finish; no new heavy step was started below it.
- After Panel build: 3,431,358,464 bytes available. System Git launcher began returning an Xcode license error; existing Command Line Tools Git was used without changing any system/license settings. Fresh Chrome staging read confirmed all four Auto Deploy and Preview Deployments settings OFF. GitHub PR-page control then timed out; no PR creation is claimed.
- Parallel Mira validation is separate: recovered same-SHA tests/build passed except form 8/8, which could not reach assertions because its existing fixture hangs. No Mira file/process or PR #75 was changed here.

## Push safety checks

Read-only Coolify check on 2026-09-09: Customer Panel `yk1h6d97z7ex0h74ok3zrj5c`, Owner `bpsgdwfiswna06mooguu2mr3`, Analytics Worker `qn0gxpiog907c9kcjkurom5r`, Storefront `vtc2aah63jbqnmtxmvykn6jl`: Auto Deploy OFF, Preview Deployments OFF. No setting was changed. The checked repository workflow only targets a different branch for push and contains disposable DB rehearsal, not deployment. Recheck before delivery if state changes.

## Rollback

Archive metadata and audit must be retained when rolling application code back. Old code that does not understand the metadata may show archived orders again in its operational list. This is reversible visibility behavior, not physical restoration: underlying orders and immutable history are never deleted. Do not remove archive/audit metadata to make rollback appear clean. Preserve the existing private rollback package in its current secured location; this task does not read, move or upload it.

## Controlled release

No release has been executed. After code and migration review, obtain a separate exact-SHA staging migration/deployment and two-record archive approval. Verify authorized host, actual database/store, migration readiness, fresh eligibility and protected-record digests; run dry-run, apply only eligible allowlisted records, then verify active/archived lists and unchanged history/effects. Financial analytics remain unchanged.

Deleted: 0. Archived on live: 0. Protected records: no change by this task.
