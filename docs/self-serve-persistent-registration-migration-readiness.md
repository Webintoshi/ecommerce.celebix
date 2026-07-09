# Self-Serve Persistent Registration Migration Readiness

Status: readiness packet only. Do not apply this SQL to production without a separate Atlas approval gate.

## Purpose

The persistent self-serve registration adapter currently runs in production-safe `safe_memory_adapter` mode. The proposed migration prepares owner control-plane tables for future durable `/kayit` registration records while keeping real store creation, provisioning, admin handoff, and runtime cutover disabled.

This packet covers only the migration readiness review for:

- `apps/owner/scripts/sql/self-serve-free-store-foundation-proposal.sql`
- `apps/owner/scripts/sql/self-serve-free-store-foundation-rollback.sql`

No production SQL apply, production env change, deployment, or external resource mutation is part of this packet.

## Proposed Tables

| Table | Purpose | Existing source-of-truth impact |
| --- | --- | --- |
| `self_serve_store_registrations` | Durable direct `/kayit` registration record and idempotency anchor. | Does not replace `owner_stores`. |
| `self_serve_store_packages` | Free starter package row for the registration. | Does not replace billing/subscription authority. |
| `self_serve_store_domains` | Planned storefront/admin/custom domain rows for the registration. | Does not create DNS and does not replace deployed store domains. |
| `self_serve_store_memberships` | Planned `store_owner` membership for the applicant. | Does not replace `owner_store_access` or admin runtime auth. |
| `self_serve_provisioning_jobs` | Queued metadata for a future safe provisioning worker. | No worker is enabled by this migration. |

## Indexes And Uniqueness

The proposal includes:

- `self_serve_store_registrations_slug_key` on `store_slug`.
- `self_serve_store_registrations_email_slug_idempotency_key` on `(normalized_email, store_slug)`.
- `self_serve_store_registrations_idempotency_key` on `idempotency_key`.
- `self_serve_store_registrations_email_key` on `normalized_email` for the current one-store-per-email product limit.
- `self_serve_store_packages_registration_key` on `registration_id`.
- `self_serve_store_domains_hostname_key` on `hostname`.
- `self_serve_store_domains_primary_per_type_key` on `(registration_id, domain_type)` where `is_primary`.
- `self_serve_store_memberships_registration_role_key` on `(registration_id, principal_email, role)`.
- `self_serve_provisioning_jobs_registration_kind_key` on `(registration_id, kind)`.

`store_slug` is the persisted normalized slug. The application normalizes it with `normalizeSelfServeStoreSlug()` before insert, so it is the schema equivalent of the requested `normalized_slug` uniqueness key.

## Operational Fields

The registration table includes:

- `status`
- `creation_mode`
- `persistence_mode`
- `planned_store_url`
- `planned_admin_url`
- nullable `admin_redirect_url`
- `last_error_code`
- `last_error_message`
- `created_at`
- `updated_at`
- `plan`
- `password_stored=false` guard
- `metadata`

The package, domain, membership, and provisioning job tables provide the future free starter store bundle rows. `self_serve_provisioning_jobs` includes `status`, `attempts`, `locked_at`, `completed_at`, `error_code`, `error_message`, and `safe_metadata`.

## Rollback Plan

Rollback is proposal-scoped and drops only the proposed `self_serve_*` tables, in dependency order:

1. `self_serve_provisioning_jobs`
2. `self_serve_store_memberships`
3. `self_serve_store_domains`
4. `self_serve_store_packages`
5. `self_serve_store_registrations`

Indexes and constraints are owned by these tables and are removed with them. Existing `owner_*`, customer, order, payment, DNS, R2, Coolify, Logto, analytics, and mail systems are not touched by rollback.

## Schema Compatibility Audit

Code-level audit on `origin/main` found the current owner DB schema authority in `apps/owner/supabase/schema.sql`:

- Existing source-of-truth tables are `owner_profiles`, `owner_stores`, `owner_store_metrics`, `owner_store_access`, `owner_store_secrets`, `owner_audit_logs`, and `owner_cleanup_runs`.
- The proposal creates only `self_serve_*` tables and does not alter existing `owner_*` tables.
- The proposal does not create generic `stores`, `store_domains`, `store_memberships`, package/subscription, or owner runtime cutover tables.
- The persistent adapter writes only to `self_serve_store_registrations`, `self_serve_store_packages`, `self_serve_store_domains`, `self_serve_store_memberships`, and `self_serve_provisioning_jobs` when `SELF_SERVE_PERSISTENCE_MODE=persistent_db_adapter` is explicitly selected.
- Default production behavior remains `safe_memory_adapter`; missing owner DB config fails closed before any write.
- The proposed `persistence_mode` column records that a durable row was created by the explicitly selected `persistent_db_adapter`; adding the column does not enable the adapter or change production defaults.

Direct production schema read was not performed in this task. The local execution context does not provide a fresh read-only owner DB session dedicated to this packet, and the task is explicitly no-production-apply/no-mutation. Before production apply, run the read-only preflight queries below against the real owner DB using a read-only transaction.

## Production Preflight Checklist

Required before any production apply:

- Fresh owner DB full backup exists.
- Backup checksum is recorded.
- Backup restore rehearsal completed in an isolated temp DB.
- Proposal SQL reviewed against the restored schema.
- Rollback SQL reviewed against the restored schema.
- Read-only production parity queries completed.
- No duplicate proposed slug, email, hostname, or idempotency key conflicts.
- Target `self_serve_*` tables do not already exist with incompatible schema.
- `SELF_SERVE_PERSISTENCE_MODE` remains unset or `safe_memory_adapter` until after migration approval.
- `SELF_SERVE_STORE_CREATE_ENABLED=false`.
- `SELF_SERVE_PROVISIONING_ENABLED=false`.
- `SELF_SERVE_AUTO_PROVISIONING_ENABLED=false`.
- No runtime read cutover is planned in the migration apply.
- Explicit Atlas approval is recorded for production SQL apply.

## Backup Requirement

Take a full owner DB backup immediately before production apply. Record:

- Backup filename.
- UTC timestamp.
- Size.
- SHA-256 checksum.
- Verification result, such as `pg_restore --list` for a custom dump.
- Restore target used for rehearsal.
- Retention period and storage location, without exposing secrets.

Do not proceed without a verified backup and a successful temp restore rehearsal.

## Restore Rehearsal Requirement

The production backup must be restored into an isolated temp DB before production apply.

Rehearsal sequence:

1. Restore backup into an empty temp DB.
2. Confirm no production traffic points at the temp DB.
3. Run the proposal SQL on the temp DB.
4. Run post-apply verification queries on the temp DB.
5. Run rollback SQL on the temp DB.
6. Run rollback verification queries on the temp DB.
7. Archive the command log without secrets or PII.

## Apply Order

Production apply order, after approval:

1. Confirm feature flags still keep persistence, store creation, and provisioning disabled.
2. Confirm fresh backup and restore rehearsal evidence.
3. Start a transaction if supported by the migration runner.
4. Apply `self-serve-free-store-foundation-proposal.sql`.
5. Run post-apply verification queries.
6. Do not enable `persistent_db_adapter`.
7. Do not enable provisioning or store creation.
8. Monitor `/api/self-serve/register` for continued safe `safe_memory_adapter` behavior.

## Post-Apply Verification Queries

Run only after an approved apply:

```sql
select to_regclass('public.self_serve_store_registrations') as registrations_table;
select to_regclass('public.self_serve_store_packages') as packages_table;
select to_regclass('public.self_serve_store_domains') as domains_table;
select to_regclass('public.self_serve_store_memberships') as memberships_table;
select to_regclass('public.self_serve_provisioning_jobs') as jobs_table;

select count(*) from self_serve_store_registrations;
select count(*) from self_serve_store_packages;
select count(*) from self_serve_store_domains;
select count(*) from self_serve_store_memberships;
select count(*) from self_serve_provisioning_jobs;

select indexname
from pg_indexes
where schemaname = 'public'
  and tablename like 'self_serve_%'
order by tablename, indexname;

select conname
from pg_constraint
where conrelid in (
  'self_serve_store_registrations'::regclass,
  'self_serve_store_packages'::regclass,
  'self_serve_store_domains'::regclass,
  'self_serve_store_memberships'::regclass,
  'self_serve_provisioning_jobs'::regclass
)
order by conname;
```

## Rollback Verification Queries

Run only after an approved rollback:

```sql
select to_regclass('public.self_serve_store_registrations') as registrations_table;
select to_regclass('public.self_serve_store_packages') as packages_table;
select to_regclass('public.self_serve_store_domains') as domains_table;
select to_regclass('public.self_serve_store_memberships') as memberships_table;
select to_regclass('public.self_serve_provisioning_jobs') as jobs_table;

select to_regclass('public.owner_stores') as owner_stores_table;
select to_regclass('public.owner_store_access') as owner_store_access_table;
select to_regclass('public.owner_store_secrets') as owner_store_secrets_table;
```

Expected result: all `self_serve_*` table lookups return `null`, and existing `owner_*` table lookups still resolve.

## Read-Only Production Preflight Queries

Before apply, run these inside a read-only transaction:

```sql
begin read only;

select to_regclass('public.self_serve_store_registrations') as registrations_table;
select to_regclass('public.self_serve_store_packages') as packages_table;
select to_regclass('public.self_serve_store_domains') as domains_table;
select to_regclass('public.self_serve_store_memberships') as memberships_table;
select to_regclass('public.self_serve_provisioning_jobs') as jobs_table;

select count(*) as owner_store_count from public.owner_stores;
select status, count(*) from public.owner_stores group by status order by status;
select slug, count(*) from public.owner_stores group by slug having count(*) > 1;
select storefront_domain, count(*) from public.owner_stores group by storefront_domain having count(*) > 1;
select admin_domain, count(*) from public.owner_stores group by admin_domain having count(*) > 1;

commit;
```

Do not select PII, secrets, tokens, or raw customer data.

## Dry-Run Rehearsal Status

No disposable local or temp Postgres DB was available in this task. The SQL was not applied anywhere. Rehearsal remains pending and must be completed before production apply.

Suggested temp rehearsal commands when an isolated Postgres target is approved:

```bash
psql "$TEMP_OWNER_DB_URL" -v ON_ERROR_STOP=1 -f apps/owner/scripts/sql/self-serve-free-store-foundation-proposal.sql
psql "$TEMP_OWNER_DB_URL" -v ON_ERROR_STOP=1 -f apps/owner/scripts/sql/self-serve-free-store-foundation-rollback.sql
```

Use a temp database only. Do not run these against production during rehearsal.

## Known Risks

- The proposal relies on `gen_random_uuid()` availability. Confirm owner DB extension support during restore rehearsal.
- `store_slug` is unique across self-serve registrations but does not yet check `owner_stores.slug`; production enablement needs a preflight conflict check and adapter-level owner registry check.
- `hostname` is unique across self-serve planned domains but does not yet check `owner_stores.storefront_domain` or `owner_stores.admin_domain`; production enablement needs parity checks.
- Multi-step adapter writes are not currently wrapped in an RPC transaction; this is acceptable only while persistent mode remains disabled in production.
- RLS policies for `self_serve_*` tables are not defined in this proposal. The current adapter uses service role writes only; public direct table access must remain unavailable.
- Direct-to-admin handoff remains disabled; `admin_redirect_url` must stay null until a short-lived handoff design is approved.

## Approval Gate

Production apply requires a separate Atlas approval that explicitly names:

- Backup artifact.
- Restore rehearsal result.
- SQL proposal version.
- Rollback version.
- Apply operator.
- Apply window.
- Confirmation that no runtime cutover, `persistent_db_adapter` enablement, store creation, or provisioning enablement is included in the migration apply.
