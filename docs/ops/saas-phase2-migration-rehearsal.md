# Phase 2 Disposable Migration Rehearsal

Status: **plan only; not executed**. The commands below are evidence templates for a separately approved Phase 2A rehearsal. This task created no database, opened no database connection, executed no SQL, and accessed no credentials or infrastructure.

## Purpose and safety envelope

The rehearsal proves that a versioned migration derived from the Phase 1 proposal can create, secure, roll back, upgrade, restore, and isolate the shared SaaS schema under real PostgreSQL concurrency. Every resource is synthetic and disposable. It must use no production hostname, network, credential, backup, customer data, Logto application, R2 bucket, Redis instance, or queue.

The Phase 1 files `apps/owner/scripts/sql/saas/001_shared_saas_foundation.proposal.sql` and its rollback are proposal inputs only. Phase 2A must create reviewed migration artifacts before this rehearsal; this document does not promote or execute the proposal.

## Roles and stop conditions

| Role | Responsibility |
| --- | --- |
| Phase 2A owner | migration, roles/RLS, adapter harness, evidence capture |
| Security reviewer | privilege/RLS/adversarial validation |
| Operations owner | disposable topology, backup/restore, cleanup proof |
| Integration Lead | pins commit/checksums and publishes final evidence index |

Stop immediately if the target endpoint cannot be proven disposable, contains non-synthetic rows, shares a production network/credential, version/extensions differ from the approved matrix, a command references an unapproved URL, or cleanup cannot be proven. Preserve logs, destroy safe disposable resources, and mark FAIL.

## Disposable topology

Use at least three separately created databases/instances:

- `apply`: forward migration, seeds, constraints, RLS, concurrency, persistence, and fault injection;
- `rollback`: forward then rollback from a clean disposable database;
- `upgrade`: prior-version -> new-version -> compatible application tests -> approved downgrade/forward-recovery path.

Unknown-commit simulation may use a disposable TCP fault proxy between the harness and `apply`; it must not proxy any non-disposable endpoint. Backup/restore uses a fourth fresh target or recreated `apply` target. All data uses generated `example.test` identities and reserved test hostnames.

## Evidence workspace and command discipline

The approved implementation task should provide a repository script that wraps commands and writes an evidence directory named by UTC timestamp and commit SHA. Commands below show the required shape, not executable values:

```bash
export REHEARSAL_ID="$(date -u +%Y%m%dT%H%M%SZ)-$(git rev-parse --short=12 HEAD)"
export EVIDENCE_DIR="artifacts/saas-phase2-rehearsal/${REHEARSAL_ID}"
mkdir -p "$EVIDENCE_DIR"
git rev-parse HEAD | tee "$EVIDENCE_DIR/git-head.txt"
shasum -a 256 path/to/approved/migrations/* | tee "$EVIDENCE_DIR/migration-checksums.txt"
```

Connection URLs are supplied only by the disposable-resource runner, are redacted from command transcripts, and are never written to evidence. `set -x` is forbidden where it could expose them. Evidence contains logical target IDs, not credentials.

## Required rehearsal sequence

### 1. Create an isolated disposable PostgreSQL instance

Create labeled, TTL-bound resources in the approved ephemeral environment. Record provider/local container identity, region, creation timestamp, owner, automatic expiry, and empty-database proof. Network rules allow only the rehearsal runner.

Evidence: resource IDs, labels, TTL, network policy, `SELECT current_database(), current_user` with safe logical names, and zero application-table proof.

### 2. Verify PostgreSQL distribution, version, and extensions

Run read-only inventory before migration:

```bash
psql "$DISPOSABLE_APPLY_URL" -X -v ON_ERROR_STOP=1 \
  -c "select version(), current_setting('server_version_num');" \
  -c "select extname, extversion from pg_extension order by extname;"
```

Compare exact distribution/major version, locale/collation, timezone, and approved extensions to the target staging specification. The migration may not silently create or depend on an unapproved extension.

### 3. Apply schema only to the disposable database

Capture before schema, migration checksums, command, UTC start/end, exit status, and migration-table rows. Apply through the exact future migration runner with `ON_ERROR_STOP`/transaction guarantees. Never paste SQL manually.

```bash
pg_dump "$DISPOSABLE_APPLY_URL" --schema-only --no-owner --no-privileges > "$EVIDENCE_DIR/apply-before.sql"
npm run saas:db:migrate:disposable -- --target apply 2>&1 | tee "$EVIDENCE_DIR/apply.log"
pg_dump "$DISPOSABLE_APPLY_URL" --schema-only --no-owner --no-privileges > "$EVIDENCE_DIR/apply-after.sql"
```

### 4. Validate rollback in a separate disposable database

Apply forward migration to `rollback`, capture schema, run the reviewed rollback through the migration runner, and compare the final schema to the pristine baseline. Do not reuse the forward-test database.

```bash
pg_dump "$DISPOSABLE_ROLLBACK_URL" --schema-only --no-owner --no-privileges > "$EVIDENCE_DIR/rollback-before.sql"
npm run saas:db:migrate:disposable -- --target rollback
npm run saas:db:rollback:disposable -- --target rollback
pg_dump "$DISPOSABLE_ROLLBACK_URL" --schema-only --no-owner --no-privileges > "$EVIDENCE_DIR/rollback-after.sql"
diff -u "$EVIDENCE_DIR/rollback-before.sql" "$EVIDENCE_DIR/rollback-after.sql"
```

PASS requires documented expected differences only (for example the migration ledger, if intentionally retained). Destructive rollback is rehearsal-only; production recovery prefers forward repair/restore.

### 5. Seed frozen `free_starter`

Apply the exact versioned seed once, then again. Require one plan version, the frozen Phase 1 feature set/limits, stable ID/version, and no duplicates. Capture safe row projections and counts, not customer data.

### 6. Run constraint tests

Test named uniqueness, foreign keys, checks, partial unique indexes, result-payload shape/immutability, normalized slug/hostname, one active canonical domain/store, one active subscription/store, membership uniqueness, plan version, timestamps, and illegal workflow/session states. Every negative case runs in a transaction and rolls back.

### 7. Run RLS and authority tests

Use separately authenticated least-privilege roles, never a migration owner:

- **tenant role:** set authenticated principal/store with `SET LOCAL`, prove own-store access and deny every other store; prove missing variables deny;
- **principal membership discovery:** set principal only, list only that principal's active memberships, then establish selected store;
- **bootstrap authority prototype:** the dedicated BYPASSRLS role can run only the frozen repository's reviewed parameterized statement inventory against explicitly granted bootstrap tables/columns; it cannot perform DDL, alter roles/policies/functions, reach workflow/session/dedicated data, access ungranted columns, or connect from a public workload;
- **exact-host resolver prototype:** exact active host returns only `ResolvedStoreHost` fields; unknown/pending/disabled/ambiguous/cross-store alias returns none/safe denial; resolver cannot list tables/tenants.

Catalog evidence includes `pg_roles`, `information_schema.role_table_grants`, function privileges, policies, owners, `relrowsecurity`, and `relforcerowsecurity`. Secrets and password hashes are excluded.

### 8. Run concurrent idempotency race tests

Start independent processes/connections behind a barrier, not promises sharing one client. For each case capture process ID, transaction timing, returned operation/result, constraint errors, and final row counts. A minimum of 50 repetitions per race is proposed, with higher counts after performance calibration.

### 9. Simulate unknown commit state

Using the disposable fault proxy, cut the client connection after PostgreSQL receives `COMMIT` at controlled timing windows. The application must destroy the connection, emit safe `commit_unknown`, and make no automatic bootstrap retry. On a fresh direct connection, classify:

- committed row with matching fingerprint -> replay stored result;
- absent row -> explicit authorized retry may be scheduled;
- processing/failed/malformed/mismatch -> quarantine and operator review.

Prove the pool never returns the broken client and no duplicate tenant rows exist.

### 10. Inject transaction rollback faults

Fault after operation claim, principal create/update, store, domain, membership, subscription, each setting, result snapshot, and before commit. For every failure known to occur before the commit attempt, prove zero partial tenant rows and no operation row because the claim belongs to the same rolled-back transaction. Only the separate unknown-commit simulation may produce either one committed operation or no operation. Then run the same key under the documented recovery policy.

### 11. Run multi-store isolation tests

Create at least stores A and B with different principals, memberships, domains, sessions, metadata, cache/job fixtures, and audit identifiers. Execute every supported read/write as A against B and vice versa. Database results must be empty/denied and row counts unchanged. API/storage/cache/queue isolation evidence is completed in Phase 2E but referenced from the same matrix.

### 12. Run session and workflow persistence tests

Start attempts/sessions on application instance A, continue/read/revoke on B, restart both, and repeat. Prove one-time OIDC consume, optimistic workflow transitions, pending-session recovery, old-cookie denial after rotation/logout, idle/absolute expiry, and membership revocation during a request.

### 13. Rehearse upgrade and downgrade

On `upgrade`, apply the previous approved version, seed synthetic rows including terminal/in-progress edge cases, apply the new version, and run both current and explicitly supported compatibility readers. Exercise the reviewed downgrade only if it is declared data-safe. Otherwise prove forward repair and restore-to-new-target; never pretend destructive down migration is a safe production rollback.

### 14. Produce schema dump and diff

Normalize schema dumps with fixed `pg_dump` version/options. Diff pristine, applied, rollback, upgraded, and restored schemas. Also capture checksums, migration ledger, constraints/indexes/policies/functions/grants, safe row counts, and query plans for critical exact-host/membership/idempotency lookups.

```bash
pg_dump "$DISPOSABLE_APPLY_URL" --schema-only --no-owner --no-privileges > "$EVIDENCE_DIR/final-schema.sql"
diff -u "$EVIDENCE_DIR/expected-schema.sql" "$EVIDENCE_DIR/final-schema.sql" > "$EVIDENCE_DIR/schema.diff"
```

### 15. Destroy disposable resources

Disable the fault proxy, destroy every database/instance, runner secret, backup artifact, volume, and network rule, and query the provider/local runtime to prove absence. Cleanup failure marks the rehearsal FAIL and pages the operations owner.

Evidence: destroy command transcript with credentials redacted, UTC completion, resource-list-after output, TTL expiry confirmation, and evidence-manifest checksum.

## Required concurrency matrix

| Race | Expected result | Final proof |
| --- | --- | --- |
| same key / same fingerprint simultaneous signup | one creator; all others replay identical committed payload | one operation/store/domain/membership/subscription; same operation ID/result |
| same key / different fingerprint | one winner; all different payloads receive `idempotency_mismatch` | no rows for losing payload; mismatch audit event |
| same slug / different key | one successful store; other receives `slug_taken` | one slug/domain, separate rolled-back losing operation |
| same hostname / different store | one domain owner; other receives `domain_conflict` | exact unique hostname and no partial losing store transaction |
| principal email metadata update race | issuer+subject stays one principal; deterministic committed email policy | one principal, no authority change, audit of metadata update |
| session rotation race | one new active session; old and losing replacements revoked/absent | one active digest; every old cookie denied across replicas |
| OIDC state consume race | one consumer obtains transaction; all others replay-denied | one `consumed_at`; one provider exchange |
| membership revocation during request | no high-risk mutation after revocation wins | mutation conditioned/rolled back; denial audit |
| alias/canonical-domain update race | resolver returns a fully consistent old/new binding or denies | never a cross-store/chained/stale redirect |

## RLS verification plan

For each table/action, maintain an explicit matrix of migration owner (setup only), bootstrap executor, tenant application with principal only, tenant application with principal+store A, same with store B, host resolver, workflow/session role, and anonymous/no settings. Record expected/actual row counts and SQLSTATE. At minimum prove:

- missing or invalid `app.current_*` settings deny;
- settings are `SET LOCAL` and disappear after commit/rollback and pool reuse;
- principal discovery sees only the current principal's memberships;
- store-scoped policies see only the selected store;
- tenant roles cannot alter context functions/policies or self-grant;
- the isolated bootstrap role has only the reviewed bootstrap table/column grants, its BYPASSRLS attribute is explicit, and every ungranted table/column/DDL/action is denied;
- resolver returns safe exact fields only and cannot enumerate;
- `FORCE RLS` applies even to table owners used by runtime (runtime must not own tables).

## Backup, restore, rollback, and recovery rehearsal

1. Take a logical/approved physical backup of synthetic `apply` after committed tenants and sessions.
2. Record backup ID, start/end, size, checksum, encryption status, retention, and PostgreSQL version.
3. Restore to a new empty disposable target, never over the source.
4. Run schema/checksum, row-count, RLS, exact-host, committed replay, session revocation, and application smoke tests.
5. Measure recovery point/time against proposed staging objectives; objectives require Operations approval before rehearsal.
6. For application rollback, disable new writers, deploy the last compatible binary, keep expanded schema, and verify reads/revocations.
7. For migration failure before commit, rely on transactional rollback. For committed incompatible migration, prefer forward fix or restore/cutover to a verified new target.
8. Reconcile tenant operations by idempotency key before re-enabling registration/store creation.

## Required evidence manifest

The final signed index must contain:

- exact commands with secrets redacted, UTC timestamps, runner identity, git SHA;
- PostgreSQL distribution/version, locale/timezone, and extensions;
- migration and runner checksums plus migration ledger;
- before/after/rollback/upgrade/restore schema dumps and diffs;
- complete test logs and repetition counts;
- safe table row counts after each failure/race;
- role/grant/policy dumps and RLS proof matrix;
- unknown-commit and rollback fault-injection proof;
- backup and restore proof;
- cleanup commands and post-cleanup absence proof;
- reviewer names/decisions and unresolved deviations.

Missing, edited-without-trace, secret-bearing, or non-reproducible evidence is a FAIL.

## Exit criteria

Rehearsal PASS requires all 15 stages, every concurrency/RLS case, rollback or documented forward-recovery path, backup/restore, and cleanup to pass from a clean run at one pinned commit. This planning task records no PASS evidence; current status is **NOT RUN / NOT READY**.
