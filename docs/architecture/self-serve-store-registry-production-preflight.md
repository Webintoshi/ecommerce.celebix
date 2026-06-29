# Self-Serve Store Registry Production Preflight

Status: Phase 2E preflight runbook, no production apply.

This runbook prepares the owner control-plane registry migration for approval. It does not authorize production DDL/DML, runtime authority cutover, `/api/stores` behavior changes, deploy, Logto mutation, DNS/Coolify mutation, secret reporting, or PII reporting.

## Scope

| Item | Decision |
| --- | --- |
| Branch | `codex/self-serve-phase-2c-registry-migration-plan` |
| Current package commit | `5030547d` |
| Schema proposal | [self-serve-store-registry-proposal.sql](../../apps/owner/scripts/sql/self-serve-store-registry-proposal.sql) |
| Backfill proposal | [self-serve-store-registry-backfill-proposal.sql](../../apps/owner/scripts/sql/self-serve-store-registry-backfill-proposal.sql) |
| Rollback proposal | [self-serve-store-registry-rollback-proposal.sql](../../apps/owner/scripts/sql/self-serve-store-registry-rollback-proposal.sql) |
| Production action in Phase 2E | None |

## Backup Plan

Production apply must not start until an owner DB full backup exists and has been restored successfully into an isolated temporary database.

| Requirement | Rule |
| --- | --- |
| Backup type | Full logical backup of owner control-plane DB before registry schema apply. Prefer custom-format `pg_dump` or equivalent platform full backup. |
| Filename | `owner-control-plane-full-YYYYMMDD-HHMMSSZ.dump` plus `owner-control-plane-full-YYYYMMDD-HHMMSSZ.sha256`. |
| Timestamp | UTC timestamp from the backup host, recorded in the migration evidence. |
| Backup verification | Generate SHA-256 checksum, run `pg_restore --list` successfully, and record backup size plus restore-list row count. |
| Restore target | Isolated temp DB named like `owner_registry_rehearsal_YYYYMMDD_HHMMSS`, never production owner DB. |
| Retention | Keep encrypted backup at least 30 days and until Atlas marks the migration accepted; keep checksum/evidence at least 90 days. |
| Access handling | Use operator-controlled DB credentials or temporary read-only/apply role. Secret values must never be pasted into docs, logs, chat, or PR comments. |

Example operator commands, values intentionally omitted:

```bash
pg_dump --format=custom --no-owner --no-acl --file "$BACKUP_FILE" "$OWNER_DATABASE_URL"
shasum -a 256 "$BACKUP_FILE" > "$BACKUP_FILE.sha256"
pg_restore --list "$BACKUP_FILE" > "$BACKUP_FILE.restore-list.txt"
```

## Temp Restore Rehearsal Plan

The restore rehearsal is mandatory before any production migration approval.

1. Confirm backup file and checksum exist.
2. Create an isolated temporary database outside production runtime.
3. Restore the backup into the temp database.
4. Run read-only baseline parity queries against the temp database.
5. Apply the schema proposal to the temp database.
6. Run the backfill proposal as-is first; it ends with `ROLLBACK` and proves SQL/parity execution without persistence.
7. After SQL review, run a temp-only persisted rehearsal copy of the backfill transaction with final `COMMIT` to test post-apply parity. Do not create this temp-only copy ad hoc in production.
8. Run post-apply parity checks.
9. Run rollback proposal against the temp database.
10. Confirm only new self-serve tables were removed and all `owner_*` tables remain intact.
11. Archive rehearsal logs with secrets redacted and row-level PII absent.

Expected rehearsal checks:

- `owner_stores` count remains 10 unless a fresh read-only inventory proves a reviewed change.
- Proposed `stores` count equals `owner_stores` count.
- Proposed `store_domains` count equals 20 if no owner storefront/admin domain is null.
- `store_memberships` remains empty or explicitly blocked.
- Rollback removes only `stores`, `store_domains`, `store_memberships`, `store_invitations`, `store_onboarding_sessions`, `store_provisioning_jobs`, and `store_billing_accounts`.

## Read-Only Production Preflight Queries

Run these against production only inside a read-only transaction. Do not select PII columns such as email, phone, address, token, or secret values.

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '3s';
-- Run only the SELECT queries listed in this section.
ROLLBACK;
```

| Check | Query type | Expected result | Blocker if failed? |
| --- | --- | --- | --- |
| Owner store count | `SELECT count(*) FROM public.owner_stores;` | `10` from Phase 2B baseline. | Yes, unless inventory is refreshed and reviewed. |
| Status distribution | `SELECT status::text, count(*) FROM public.owner_stores GROUP BY status::text ORDER BY status::text;` | `active = 3`, `draft = 7`. | Yes, if unexpected drift is not reviewed. |
| Duplicate slug | `SELECT slug, count(*) FROM public.owner_stores GROUP BY slug HAVING count(*) > 1;` | 0 rows. | Yes. |
| Duplicate storefront domain | `SELECT lower(trim(storefront_domain)), count(*) FROM public.owner_stores WHERE NULLIF(trim(storefront_domain), '') IS NOT NULL GROUP BY lower(trim(storefront_domain)) HAVING count(*) > 1;` | 0 rows. | Yes. |
| Duplicate admin domain | `SELECT lower(trim(admin_domain)), count(*) FROM public.owner_stores WHERE NULLIF(trim(admin_domain), '') IS NOT NULL GROUP BY lower(trim(admin_domain)) HAVING count(*) > 1;` | 0 rows. | Yes. |
| Null storefront/admin domain | `SELECT count(*) FILTER (WHERE NULLIF(trim(storefront_domain), '') IS NULL) AS null_storefront_domains, count(*) FILTER (WHERE NULLIF(trim(admin_domain), '') IS NULL) AS null_admin_domains FROM public.owner_stores;` | both `0`. | Yes, unless expected domain count is adjusted and approved. |
| Expected proposed stores | `SELECT count(*) AS expected_proposed_stores FROM public.owner_stores;` | `10`. | Yes if different without reviewed inventory. |
| Expected proposed domains | `SELECT count(*) FILTER (WHERE NULLIF(trim(storefront_domain), '') IS NOT NULL) + count(*) FILTER (WHERE NULLIF(trim(admin_domain), '') IS NOT NULL) AS expected_proposed_domains FROM public.owner_stores;` | `20`. | Yes if different without reviewed inventory. |
| Storefront reserved-domain conflicts | `SELECT slug, storefront_domain FROM public.owner_stores WHERE lower(trim(storefront_domain)) ~ '^(admin|panel|owner|ecommerce)\\.';` | 0 rows. | Yes. |
| Admin reserved-domain exception inventory | `SELECT count(*) FROM public.owner_stores WHERE lower(trim(admin_domain)) ~ '^(admin|panel|owner|ecommerce)\\.' OR lower(trim(admin_domain)) LIKE '%.celebix.%';` | Informational; allowed because `domain_type = 'admin'`. | No, unless a non-admin domain appears. |
| Membership blocked source | `SELECT count(*) FROM public.owner_store_access;` | `0`; membership backfill remains blocked. | No for registry mirror; yes for authz cutover. |
| Existing target table inventory | `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('stores', 'store_domains', 'store_memberships', 'store_invitations', 'store_onboarding_sessions', 'store_provisioning_jobs', 'store_billing_accounts') ORDER BY table_name;` | 0 rows before apply. | Yes if tables exist with unreviewed schema. |

If any blocker query fails, stop and update the migration package before production apply.

## Apply Runbook

Production apply requires explicit approval after the backup and temp restore rehearsal pass.

1. Confirm explicit production approval is recorded.
2. Confirm owner DB backup filename, checksum, restore-list, and temp restore rehearsal evidence.
3. Confirm rollback proposal has been reviewed against the exact schema proposal.
4. Confirm preflight SELECT checks are green.
5. Confirm owner runtime is healthy enough for a DDL-only mirror migration.
6. Announce a short maintenance window if operator policy requires one. No runtime cutover is planned, but DDL can still take metadata locks.
7. Apply [self-serve-store-registry-proposal.sql](../../apps/owner/scripts/sql/self-serve-store-registry-proposal.sql) with `ON_ERROR_STOP=1`.
8. Apply the reviewed production backfill transaction. The committed proposal is dry-run safe and ends with `ROLLBACK`; production must use the approved apply variant produced from the temp restore rehearsal, not an ad hoc edit.
9. Run post-apply parity checks.
10. Confirm `owner_*` tables are unchanged except for normal runtime activity outside this migration.
11. Confirm no API reads have switched to the new tables.
12. Monitor owner runtime and database logs.
13. Record evidence and final decision.

No-cutover confirmation:

- `/api/stores` continues to read/write legacy owner authority.
- `super_admin` guard remains unchanged.
- No Logto, DNS, Coolify, or deploy action is part of this runbook.

## Rollback Runbook

Rollback is valid only before runtime cutover. Because Phase 2E does not switch reads to new tables, rollback removes only newly-created self-serve registry objects.

Run rollback when:

- Schema apply succeeds but post-apply parity fails.
- Backfill apply fails after new tables were created.
- Target tables conflict with unexpected pre-existing schema.
- Operator approval is withdrawn before cutover.

Rollback sequence:

1. Confirm no runtime has been switched to self-serve registry tables.
2. Capture row counts for new self-serve tables for evidence.
3. Run [self-serve-store-registry-rollback-proposal.sql](../../apps/owner/scripts/sql/self-serve-store-registry-rollback-proposal.sql) with `ON_ERROR_STOP=1`.
4. Confirm new self-serve tables are absent.
5. Confirm `owner_profiles`, `owner_stores`, `owner_store_access`, `owner_store_secrets`, and `owner_cleanup_runs` still exist.
6. Confirm owner runtime health.

Rollback scope:

- Drops only `store_billing_accounts`, `store_provisioning_jobs`, `store_onboarding_sessions`, `store_invitations`, `store_memberships`, `store_domains`, and `stores`.
- Does not touch existing `owner_*` tables.
- Does not touch tenant store DBs.
- Runtime remains unaffected because there is no cutover.

## Stop Conditions

Stop production migration apply if any of these are true:

- Fresh owner DB backup is missing.
- Backup checksum or `pg_restore --list` verification failed.
- Temp restore rehearsal has not passed.
- Slug duplicate query returns rows.
- Storefront/admin domain duplicate query returns rows.
- Null domain query breaks expected domain parity without approval.
- Expected proposed domain count is not 20 and no reviewed exception exists.
- Target self-serve tables already exist with unreviewed schema.
- Rollback SQL review is incomplete.
- Owner DB degraded state becomes critical.
- Production approval is missing or withdrawn.
- Any command would require reporting secret values or PII.

## Final Recommendation

The Phase 2E preflight package is ready to request approval for backup and temp restore rehearsal. Production apply approval must wait until the restore rehearsal, read-only parity checks, and rollback rehearsal pass.
