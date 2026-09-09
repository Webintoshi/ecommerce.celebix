# Orders QA archive — implementation evidence

Status: IMPLEMENTATION IN PROGRESS. No live migration or archive has run.

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
First run: 0 PASS / 5 FAIL because runner absent. A sixth test then failed because changed historical target evidence was not rejected. Current boundary result: 6 PASS / 0 FAIL. These use a controlled repository boundary and are not PostgreSQL or live certification.

The obsolete simplified-schema cleanup harness now forwards to the actual-migration archive harness. Its old physical-delete assertions are retired, not represented as archive test evidence.

## Push safety

Read-only Coolify check on 2026-09-09: Customer Panel `yk1h6d97z7ex0h74ok3zrj5c`, Owner `bpsgdwfiswna06mooguu2mr3`, Analytics Worker `qn0gxpiog907c9kcjkurom5r`, Storefront `vtc2aah63jbqnmtxmvykn6jl`: Auto Deploy OFF, Preview Deployments OFF. No setting was changed. The checked repository workflow only targets a different branch for push and contains disposable DB rehearsal, not deployment. Recheck before delivery if state changes.

## Rollback

Archive metadata and audit must be retained when rolling application code back. Old code that does not understand the metadata may show archived orders again in its operational list. This is reversible visibility behavior, not physical restoration: underlying orders and immutable history are never deleted. Do not remove archive/audit metadata to make rollback appear clean. Preserve the existing private rollback package in its current secured location; this task does not read, move or upload it.

## Controlled release

No release has been executed. After code and migration review, obtain a separate exact-SHA staging migration/deployment and two-record archive approval. Verify authorized host, actual database/store, migration readiness, fresh eligibility and protected-record digests; run dry-run, apply only eligible allowlisted records, then verify active/archived lists and unchanged history/effects. Financial analytics remain unchanged.

Deleted: 0. Archived on live: 0. Protected records: no change by this task.
