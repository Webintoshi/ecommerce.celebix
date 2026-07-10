# Self-Serve Persistent Registration DB Dry-Run Result

Date/time: 2026-07-10T04:51:25Z

Branch: `codex/self-serve-db-migration-dry-run`

Base commit: `0703f743f8f0a25e640caac91fbf8f780dba4041`

Rehearsal commit: `4c7222059e4865f92c1ed787e96a228f9fe32012`

Workflow: `Self-Serve DB Migration Rehearsal`

Run: https://github.com/Webintoshi/ecommerce.celebix/actions/runs/29069967435

Job: `Disposable PostgreSQL rehearsal`

Result: `PASS`

## Scope

This document records the disposable PostgreSQL rehearsal result for the self-serve persistent registration SQL proposal.

SQL files in scope:

- `apps/owner/scripts/sql/self-serve-free-store-foundation-proposal.sql`
- `apps/owner/scripts/sql/self-serve-free-store-foundation-rollback.sql`

Rehearsal files in scope:

- `.github/workflows/self-serve-db-migration-rehearsal.yml`
- `apps/owner/scripts/self-serve-db-migration-rehearsal.mjs`

Production safety confirmation:

- No production database connection was opened.
- No production SQL was applied.
- No production environment variables or secrets were read, changed, printed, or requested.
- No repository secrets were used by the rehearsal workflow.
- No Owner deploy was triggered.
- `SELF_SERVE_PERSISTENCE_MODE=persistent_db_adapter` was not enabled.
- Store creation and provisioning remain disabled.

## Disposable DB Tooling

The original local dry-run attempt was blocked because the isolated shell did not have `psql`, `pg_restore`, `docker`, or `supabase` tooling available in `PATH`.

The approved follow-up rehearsal used a disposable GitHub Actions PostgreSQL service instead of production, staging, Supabase Cloud, Coolify, or any customer database.

| Tooling area | Result |
| --- | --- |
| Local shell tooling | Blocked before SQL execution. |
| GitHub Actions disposable PostgreSQL service | PASS. |
| PostgreSQL client install in CI | PASS. |
| Production DB connection | Not used. |

## Disposable Database

Disposable database name: `self_serve_migration_rehearsal`

PostgreSQL version:

```text
PostgreSQL 16.14 (Debian 16.14-1.pgdg13+1) on x86_64-pc-linux-gnu, compiled by gcc (Debian 14.2.0-19) 14.2.0, 64-bit
```

Fail-closed guard summary:

- Required `SELF_SERVE_REHEARSAL_DATABASE_URL`.
- Required `SELF_SERVE_REHEARSAL_ACK=disposable-only`.
- Allowed only `localhost` or `127.0.0.1`.
- Required database name `self_serve_migration_rehearsal`.
- Rejected production, cloud, Supabase, Coolify, and Celebix host patterns.
- Rejected ambient `DATABASE_URL`, `SUPABASE_URL`, and `OWNER_SUPABASE_SERVICE_ROLE_KEY`.
- Did not print the full connection string.
- Used no repository or environment secret.
- Used trust authentication only inside the isolated disposable PostgreSQL service.
- Generated a throwaway URL password component at run time solely to satisfy the runner's non-empty URL guard.
- Masked both the throwaway component and complete URL before exporting the connection to the rehearsal step.

## Proposal Apply Result

Status: `PASS`

Applied proposal SQL:

- `apps/owner/scripts/sql/self-serve-free-store-foundation-proposal.sql`

The proposal applied successfully in the disposable CI database only.

## Tables Created

Status: `PASS`

Expected proposal-only tables were verified:

- `self_serve_store_registrations`
- `self_serve_store_packages`
- `self_serve_store_domains`
- `self_serve_store_memberships`
- `self_serve_provisioning_jobs`

Negative checks passed:

- No `owner_*` table was created, altered, or dropped.
- No generic runtime cutover table such as `stores`, `store_domains`, or `store_memberships` was created.
- No forbidden raw password, reusable token, access token, refresh token, or secret column was created.

## Indexes And Constraints Verification

Status: `PASS`

Verified indexes:

- `self_serve_store_registrations_slug_key`
- `self_serve_store_registrations_email_slug_idempotency_key`
- `self_serve_store_registrations_idempotency_key`
- `self_serve_store_registrations_email_key`
- `self_serve_store_packages_registration_key`
- `self_serve_store_domains_hostname_key`
- `self_serve_store_domains_primary_per_type_key`
- `self_serve_store_memberships_registration_role_key`
- `self_serve_provisioning_jobs_registration_kind_key`

Verified check constraints include:

- registration status
- plan
- creation mode
- persistence mode
- password-never-stored
- admin redirect safety
- package plan/status
- domain type/status
- membership role/status
- provisioning job kind/adapter/status

Exact schema contract checks passed for all five proposal tables:

- complete column sets
- PostgreSQL data types
- nullability, including nullable `admin_redirect_url` and error fields
- required unique index definitions
- all package/domain/membership/provisioning-job foreign keys
- `ON DELETE CASCADE` relationships to `self_serve_store_registrations(id)`

## Minimal Insert And Idempotency Check

Status: `PASS`

The rehearsal used fake CI-only data:

- Email domain: `example.test`
- Store slug: `dryrun-store`
- Store URL suffix: `celebix.site`
- Admin URL suffix: `celebix.site`

Inserted dependency-ordered rows successfully:

- registration
- free starter package
- platform storefront domain
- admin subdomain
- store owner membership
- provisioning job

The inserted bundle was read back and verified for registration defaults, creation/persistence/status fields, planned URLs, nullable handoff/error fields, timestamps, and every related row.

Constraint behavior passed:

- Duplicate `idempotency_key` was rejected.
- Duplicate `store_slug` was rejected.
- Duplicate `(normalized_email, store_slug)` was rejected.
- Duplicate `normalized_email` was rejected for the current one-store-per-email product limit.
- Invalid foreign key reference was rejected.

## Rollback Result

Status: `PASS`

Rollback SQL:

- `apps/owner/scripts/sql/self-serve-free-store-foundation-rollback.sql`

Rollback verification:

- All proposed `self_serve_*` tables were removed.
- The unrelated `rehearsal_sentinel` table remained after rollback.
- A separate `owner_rehearsal_sentinel` schema/data fingerprint remained unchanged through proposal apply and rollback.
- No additional `owner_*` table appeared relative to the disposable baseline.
- No unrelated table was removed.
- No `DELETE` or `TRUNCATE` against existing business tables was required.
- The sentinel was dropped only as final disposable cleanup.

## CI Summary

The workflow printed this secret-free PASS summary:

```text
proposal apply: PASS
expected tables: PASS
constraints/indexes: PASS
column/foreign-key contracts: PASS
fake inserts: PASS
uniqueness checks: PASS
rollback: PASS
unrelated sentinel preserved: PASS
owner sentinel preserved: PASS
production connection used: NO
```

## Remaining Risks

- This was a disposable PostgreSQL rehearsal, not a production apply.
- Fresh owner DB backup and temp restore rehearsal remain required before any production SQL apply.
- Backup/restore rehearsal has not passed yet.
- The persistent registration write path still requires transactional/RPC hardening before enablement.
- Production SQL apply still requires a separate explicit Atlas approval gate.
- Runtime reads are not cut over to the new self-serve tables.
- `persistent_db_adapter` remains disabled until a separate approval gate.

## Next Required Gate Before Production SQL Apply

Before production SQL apply can be considered, Atlas should require:

1. Fresh owner DB backup.
2. Temp restore rehearsal PASS using the backup artifact.
3. Proposal apply PASS on the restored temp database.
4. Backfill/parity checks, if any live owner data will be mirrored.
5. Rollback rehearsal PASS on the restored temp database.
6. SQL review and rollback SQL review.
7. Transactional/RPC hardening review for the future persistent adapter write path.
8. Explicit production SQL apply approval.
9. Confirmation that no runtime reads are cut over to the new tables during SQL apply.
