# Self-Serve Persistent Registration DB Dry-Run Result

Date/time: 2026-07-09T10:43:11Z

Branch: `codex/self-serve-db-migration-dry-run`

Base commit: `0703f743f8f0a25e640caac91fbf8f780dba4041`

## Scope

This document records the disposable database rehearsal status for the self-serve persistent registration SQL proposal.

SQL files in scope:

- `apps/owner/scripts/sql/self-serve-free-store-foundation-proposal.sql`
- `apps/owner/scripts/sql/self-serve-free-store-foundation-rollback.sql`

Production safety confirmation:

- No production database connection was opened.
- No production SQL was applied.
- No production environment variables or secrets were read, changed, printed, or requested.
- No Owner deploy was triggered.
- `SELF_SERVE_PERSISTENCE_MODE=persistent_db_adapter` was not enabled.
- Store creation and provisioning remain disabled.

## Disposable DB Tooling Availability

The dry-run could not be executed in this shell because no approved disposable database tooling is available in `PATH`.

| Tool | Availability | Impact |
| --- | --- | --- |
| `psql` | Missing | Cannot create or connect to a local disposable Postgres database. |
| `pg_restore` | Missing | Cannot verify or restore a local dump artifact. |
| `docker` | Missing | Cannot start a local Docker Postgres container. |
| `supabase` | Missing | Cannot start a local Supabase stack. |

Result: dry-run blocked before any SQL execution.

## Disposable Database

Planned disposable database name: `self_serve_migration_rehearsal`

Actual disposable database used: none. No database was created or modified.

## Proposal Apply Result

Status: blocked.

Reason: missing disposable DB tooling.

No SQL from `self-serve-free-store-foundation-proposal.sql` was executed.

## Tables Created

Status: not executed.

Expected proposal-only tables for the future dry-run:

- `self_serve_store_registrations`
- `self_serve_store_packages`
- `self_serve_store_domains`
- `self_serve_store_memberships`
- `self_serve_provisioning_jobs`

Expected negative checks for the future dry-run:

- No `owner_*` table is created, altered, or dropped.
- No generic runtime cutover tables such as `stores`, `store_domains`, or `store_memberships` are created.
- No password, token, or secret columns are created.

## Indexes And Constraints Verification

Status: not executed.

Expected future checks:

- `self_serve_store_registrations_slug_key`
- `self_serve_store_registrations_email_slug_idempotency_key`
- `self_serve_store_registrations_idempotency_key`
- `self_serve_store_registrations_email_key`
- `self_serve_store_packages_registration_key`
- `self_serve_store_domains_hostname_key`
- `self_serve_store_domains_primary_per_type_key`
- `self_serve_store_memberships_registration_role_key`
- `self_serve_provisioning_jobs_registration_kind_key`
- `self_serve_store_registrations_password_never_stored`
- `self_serve_store_registrations_admin_redirect_safe`

## Minimal Insert And Idempotency Check

Status: not executed.

Planned fake local-only values:

- Email: `dryrun@example.test`
- Slug: `dryrun-store`

Expected future checks:

- Registration row can be inserted with fake local-only data.
- Package/free plan row can be inserted.
- Platform domain row can be inserted.
- Admin domain row can be inserted.
- Membership row can be inserted.
- Provisioning job row can be inserted.
- Duplicate `idempotency_key` is rejected.
- Duplicate `(normalized_email, store_slug)` is rejected.
- Duplicate `store_slug` is rejected.

## Rollback Result

Status: not executed.

No SQL from `self-serve-free-store-foundation-rollback.sql` was executed.

Expected future rollback checks:

- All `self_serve_*` proposal tables are removed.
- Rollback does not touch `owner_*` source-of-truth tables.
- Rollback does not touch generic runtime tables.

## Future Disposable-Only Command Sequence

The next execution gate can run the rehearsal only after approved disposable tooling exists. One safe local Docker Postgres sequence would be:

```bash
docker run --rm --name self-serve-migration-rehearsal \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=self_serve_migration_rehearsal \
  -p 55432:5432 \
  -d postgres:16

until PGPASSWORD=postgres psql \
  -h 127.0.0.1 \
  -p 55432 \
  -U postgres \
  -d self_serve_migration_rehearsal \
  -c 'select 1'; do
  sleep 1
done

PGPASSWORD=postgres psql \
  -h 127.0.0.1 \
  -p 55432 \
  -U postgres \
  -d self_serve_migration_rehearsal \
  -v ON_ERROR_STOP=1 \
  -f apps/owner/scripts/sql/self-serve-free-store-foundation-proposal.sql

PGPASSWORD=postgres psql \
  -h 127.0.0.1 \
  -p 55432 \
  -U postgres \
  -d self_serve_migration_rehearsal \
  -v ON_ERROR_STOP=1 \
  -f apps/owner/scripts/sql/self-serve-free-store-foundation-rollback.sql

docker stop self-serve-migration-rehearsal
```

Future verification queries must remain local-only and should check:

```sql
select tablename
from pg_tables
where schemaname = 'public'
order by tablename;

select indexname
from pg_indexes
where schemaname = 'public'
  and tablename like 'self_serve_%'
order by indexname;

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name like 'self_serve_%'
  and column_name ~* '(password|token|secret)';
```

## Remaining Risks

- Proposal SQL has not yet been executed against a disposable database in this environment.
- Insert/idempotency behavior has not yet been proven by a database engine in this environment.
- Rollback behavior has not yet been proven by a database engine in this environment.
- Production SQL apply still requires a separate Atlas approval gate, fresh backup, restore rehearsal, rollback review, and no-runtime-cutover confirmation.

## Next Required Gate Before Production SQL Apply

Before production SQL apply can be considered, Atlas should require:

1. Disposable DB tooling installed or an approved isolated disposable database environment.
2. Proposal apply rehearsal PASS on `self_serve_migration_rehearsal`.
3. Minimal fake insert/idempotency checks PASS.
4. Rollback rehearsal PASS.
5. Fresh owner DB backup and temp restore rehearsal PASS.
6. Explicit production SQL apply approval.
7. Confirmation that no runtime reads are cut over to the new tables during SQL apply.
