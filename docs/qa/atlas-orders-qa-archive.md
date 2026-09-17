# Orders QA archive — implementation evidence

## 2026-09-17 controlled closeout (supersedes historical status below)

Current candidate: `69ee87990a53909968d64e4bc9f51d6be9e5f253`, branch `codex/atlas-orders-qa-cleanup`. Normal merge preserves running source `2f239495f4358c25f85a4f7fb2938ce547a0905a`, including compact administrators, discount cards, design and domain changes. No canonical merge.

The user's repeated explicit instructions to archive the nine screenshot-selected test orders and publish the bounded Panel update supersede the historical preparation-only approval. This does not authorize bypassing eligibility, changing dependency records, or payment/provider operations. Only two exact targets pass the existing guards; seven remain blocked. The runner allowlist was not expanded.

Validation:

- Full Panel first test group on `afc84260`: 1378 PASS, 1 FAIL, 1 SKIP (1380 total). Failure is `merchant-admin-ui/route-behavior.test.ts`, missing expected inline-create element. The exact same failure was reproduced on the running `2f239495` source; affected merchant UI files are unchanged by this archive release. It is a known baseline failure, not counted as PASS.
- Final `69ee8799` archive console/client regression: 38 PASS, including uncertain retry and success/restore/new-archive operation identity. Remaining official react-server group: 54 PASS.
- Contracts: 332 PASS; data: 616 PASS; both typechecks PASS. Panel typecheck/build PASS on final candidate in a network-isolated Node 24.11.1 validation container.
- Actual disposable PostgreSQL 16.14: 17 groups PASS in original order and 17 groups PASS with migration 128 preceding 127. These are fixtures, not live archive acceptance.
- Storefront-shared build PASS. `apps/admin` build attempted but blocked by Google Fonts Lora fetch in network-none validation; not counted as PASS. No disk cleanup or local heavy build.
- Independent readiness and archive UI reviews approved after fixing readiness coverage and completed-intent retirement.
- Official PayTR/Iyzico generator and check methods PASS for exact candidate. Existing PayTR test/live modes and authority scope retained; adapter source digest unchanged. Iyzico remains unauthorized. New candidate binding is associated with the user's current bounded release approval, not automatic inheritance of an old approval. No provider call.

Release: migration 127 applied atomically with assertions to `celebix_saas_staging_auth01` (`isolated_staging`), after backing up existing function definitions/ACLs and confirming they remained unchanged. Archive tables were empty after migration; no existing order row was mutated. Manual Panel deployment `52da5a4a-6afc-4107-9cd8-8946b21a7c60` finished successfully.

### Live acceptance — PARTIAL, 2 of 9 archived

- Actual running container `5190ae938569`, image `sha256:ad9b09ef039fca003fb945b2185af94ff994a6b530bfe8446de89ebff46eebdc`, SOURCE_COMMIT `69ee87990a53909968d64e4bc9f51d6be9e5f253`, Next build ID `HAcGsRVjrsowUjisPv8HT`. Checked key application source hashes against candidate, and both generated payment metadata files against the officially validated output. Direct runtime generator execution is not claimed. HTTPS `/api/health`: 200.
- Existing Chrome Sadık Ahmet profile, authenticated `guzide-kuyumcu-4` / Mağaza sahibi. No cookie/token extraction, new login, logout or fabricated authority. Used the deployed archive form, one explicit submit per exact target, with reason `Kullanıcı tarafından onaylanan test siparişi arşivleme`.
- `0e8bca85-e87c-5a82-8a4e-d615b6d4df29`: displayed “Sipariş arşivlendi.” Operation `4d049bfd-420a-4e22-ab68-46a942affde5`.
- `af1982e0-c3f2-5f39-8509-8e0250394b13`: displayed “Sipariş arşivlendi.” Operation `6b9be36d-3709-4304-942b-f02404c2d866`.
- Returned to the unfiltered normal Orders list; both IDs absent, the other seven selected IDs still present. Session left open on Orders. Read-only database verification confirms exactly two archive states and two append-only archive operations in this store.
- All nine physical order rows, 12 order items, 14 events and five order operations retain identical ordered-content digests compared with the pre-release backup. No physical deletion, status/payment change, refund, inventory mutation or notification change.
- Seven blocked IDs remain unchanged: `a5de1e47-404a-5e90-89c2-2fa9da177a4f` (analytics outbox/email); `3f8fb0cc-3d25-4bea-aca7-569bc01f9cd6`, `bf0a44a8-8e80-4c35-ab73-0bf4a0f530ed`, `07f5215a-a751-4d84-9476-45e78a6f5531`, `4e53def8-4276-4ad8-8bab-4247922dce6a`, `0c4f337b-bc1c-446a-adc9-b64af8e6d1b2` (cart, receipt, checkout-operation and email dependencies); `a53947fb-e99f-4be5-8d05-5c5cf4eeeb4e` (payment state, receipt, checkout operation, email and hosted checkout session). These facts do not assert that a real payment occurred; they are the existing archive policy's observed blockers.
- No blanket panel certification. No full browser console/network audit or responsive matrix was performed in this bounded archive execution. Fixture tests above are separate from these actual authenticated archive results.

Rollback: previous image `sha256:bca8dd5c125d6e3f0bdd69c89eac45b488bea3e598c8c3fdabbed672a6d06aa2` retained with matching source/settings in a private server backup. Pre/post hooks unchanged; all four app Auto Deploy/Preview switches OFF. Owner, Storefront and Worker unchanged. Preserve archive metadata/audit on rollback; old direct-ID detail ABI lacks the new archived-detail permission rule and must not be represented as equivalent access enforcement.

## Historical preparation evidence

The following sections describe the earlier preparation state, not the current release status.

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
