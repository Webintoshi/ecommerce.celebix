# Self-Serve Store Registry Migration Plan

Status: Phase 2C migration review package, proposal only.

This document finalizes the registry schema and owner backfill plan after the live owner DB read-only inventory for `ecommerce.celebix.co`. It does not authorize a production migration, DB DDL/DML, runtime authority cutover, Logto mutation, DNS/Coolify mutation, or deploy.

## Live Owner Inventory Baseline

| Area | Result | Migration meaning |
| --- | --- | --- |
| Owner resource | `owner`, UUID `oo08g4wso080w44oc0s04ws0`, domain `ecommerce.celebix.co`, branch `deploy/owner`, running commit `e9e701ee`. | Confirms the control-plane source, but no runtime change is part of Phase 2C. |
| `owner_profiles` | Exists, 7 rows. `super_admin`: 4, `affiliate_admin`: 3, active: 7. | Platform admin identity exists, but it is not store membership authority. |
| `owner_stores` | Exists, 10 rows. `active`: 3, `draft`: 7, `light_postgres`: 10. | Primary source for `stores` backfill. |
| `owner_store_access` | Exists, 0 rows. | Store membership backfill is blocked. |
| `owner_store_secrets` | Exists, 6 rows. Secret values were not read. | Backfill only secret-row presence metadata, never secret values. |
| `owner_cleanup_runs` | Exists, 6 rows. `orphaned`: 4, `resolved`: 2. | Use as slug tombstone/review signal only. Do not create stores from cleanup rows. |
| Target self-serve tables | `stores`, `store_domains`, `store_memberships`, `store_provisioning_jobs`, `store_onboarding_sessions`, `store_billing_accounts` absent. | Phase 2C prepares schema/backfill proposals for review only. |

Store authority inventory:

- Total owner stores: 10.
- Storefront domains: 10.
- Admin domains: 10.
- Duplicate slug: none.
- Duplicate storefront domain: none.
- Duplicate admin domain: none.
- Reserved slug: none.
- Reserved domain heuristic: 8 hits, expected admin-domain exceptions.
- Present slugs: `hemenaku`, `derycraftcomtr`, `deri-kordon`, `lilyum-flora-ordu`, `butik-waya`, `alpler-spor`, `ezmeo`.
- Missing from owner DB inventory: `skoriq`, `celebix-cms`.

## Source Authority Map

| Source | Current purpose | Phase 2C handling |
| --- | --- | --- |
| `owner_stores` | Owner panel store list, lifecycle, domain, R2, and deployment metadata. | Backfill proposal maps to `stores` and `store_domains`. Runtime authority remains unchanged. |
| `owner_profiles` | Owner panel identity profile and platform roles. | Aggregate inventory only. Do not infer store ownership. |
| `owner_store_access` | Intended scoped access table. | Empty in live inventory; membership migration is blocked. |
| `owner_store_secrets` | Per-store secret authority. | Presence-only metadata. Secret columns must never be selected or migrated into registry metadata. |
| `owner_cleanup_runs` | Cleanup/orphan tracking. | Slug tombstone review input. No store rows created from cleanup history. |
| Store-local admin/user tables | Legacy admin membership authority. | Requires separate store-local DB inventory before `store_memberships` backfill. |
| Logto/auth bridge tables | Identity/customer auth bridge. | Not present in owner DB; customer and admin membership must stay separate. |

## Schema Finalization

| Table | Phase 2C decision | Live inventory alignment |
| --- | --- | --- |
| `stores` | Canonical store identity table with `legacy_owner_store_id`, `source`, `database_mode`, `status`, `provisioning_status`, and `metadata`. | Mirrors 10 `owner_stores` rows. `legacy_owner_store_id` preserves old IDs; `source = legacy_owner_stores`. |
| `store_domains` | Domain registry with `domain_type IN ('storefront', 'admin', 'platform_subdomain', 'custom')`. | Mirrors 10 storefront + 10 admin domains if no null domains exist. Admin domains are reserved-policy exempt. |
| `store_memberships` | Future store authorization authority. | Created by proposal, but production backfill remains empty/blocked until explicit principal source exists. |
| `store_invitations` | Future admin/staff invite lifecycle. | No legacy backfill in Phase 2C. |
| `store_onboarding_sessions` | Future self-serve wizard state. | No legacy backfill in Phase 2C. |
| `store_provisioning_jobs` | Future durable provisioning queue. | No jobs created in Phase 2C. |
| `store_billing_accounts` | Future SaaS billing/trial authority. | Billing readiness is red; no billing backfill or cutover. |

Key changes from Phase 2A:

- `stores.source_system` is replaced with the clearer `stores.source`.
- `stores.status` keeps `active` / `draft` parity instead of translating live `active` into `ready`.
- `stores.provisioning_status` carries provisioning readiness separately.
- `store_domains.domain_type` is finalized as `storefront`, `admin`, `platform_subdomain`, `custom`.
- `legacy_admin` and `custom_storefront` terminology is removed from the registry contract.
- `store_domains.hostname_normalized` is used for case-insensitive conflict handling.
- Membership backfill is explicitly blocked rather than warning-only.

## Backfill Proposal

| Source | Target | Fields | Idempotency rule | Risk |
| --- | --- | --- | --- | --- |
| `owner_stores` | `stores` | `id -> legacy_owner_store_id`, `slug`, `name`, `status`, `database_mode`, lifecycle metadata. | Upsert by `slug`; update only rows sourced from `legacy_owner_stores` or matching the same legacy id. | A future manually-created `stores.slug` could conflict; SQL avoids overwriting non-legacy rows. |
| `owner_stores.storefront_domain` | `store_domains` | `hostname`, `hostname_normalized`, `domain_type = storefront`, `status`, `is_primary`. | Upsert by normalized hostname; update only legacy-sourced domain rows. | Null or malformed domains reduce expected count below 20. |
| `owner_stores.admin_domain` | `store_domains` | `hostname`, `hostname_normalized`, `domain_type = admin`, reserved-policy exempt metadata. | Upsert by normalized hostname; update only legacy-sourced domain rows. | Admin domains look reserved by heuristic; policy must exempt `domain_type = admin`. |
| `owner_store_secrets` | `stores.metadata` | `ownerSecretRowPresent` boolean only. | Presence-only metadata can be recomputed. | Secret values must not be selected or copied. |
| `owner_cleanup_runs` | Review metadata only | `cleanupRunCount` and tombstone policy note. | No store/domain rows are created from cleanup rows. | Orphaned slugs require human review before reuse. |

Backfill SQL proposal: [self-serve-store-registry-backfill-proposal.sql](/Users/Celebix/Desktop/ecommerce-celebix/.codex-worktrees/self-serve-store-provisioning-phase-0-1/apps/owner/scripts/sql/self-serve-store-registry-backfill-proposal.sql)

Schema SQL proposal: [self-serve-store-registry-proposal.sql](/Users/Celebix/Desktop/ecommerce-celebix/.codex-worktrees/self-serve-store-provisioning-phase-0-1/apps/owner/scripts/sql/self-serve-store-registry-proposal.sql)

## Membership Plan

Membership backfill is blocked in Phase 2C because:

- `owner_store_access` has 0 rows.
- `auth_principals` is absent from owner DB.
- `auth_store_memberships` is absent from owner DB.
- `store_user_roles` is absent from owner DB.
- `owner_profiles` contains platform roles, not canonical per-store ownership.

What can be mirrored now:

- Store identities from `owner_stores`.
- Storefront/admin domains from `owner_stores`.
- Non-secret operational metadata and source refs.

What requires separate inventory:

- Store-local admin users and roles for each tenant DB.
- Logto principal mapping and admin/customer separation.
- Explicit store owner/admin assignment source.
- Platform `super_admin` bypass/support policy separate from store ownership.

No automatic owner inference is allowed from email, slug, store name, domain, historical support contact, or platform `super_admin` role. Storefront customer identities must never be promoted into admin membership.

## Parity Checks

These are read-only checks to run on a restored temporary database after applying the proposal there, and again after any future approved production apply before cutover.

| Check | Query shape | Expected |
| --- | --- | --- |
| Owner store count | `SELECT count(*) FROM owner_stores` | 10 from Phase 2B baseline unless inventory changes. |
| Proposed store count | `SELECT count(*) FROM stores WHERE source = 'legacy_owner_stores'` | Equal to owner store count. |
| Status parity | Group `owner_stores.status` and `stores.status`. | `active: 3`, `draft: 7` baseline mapped to `active: 3`, `draft: 7`. |
| Slug uniqueness | `GROUP BY slug HAVING count(*) > 1`. | 0 rows. |
| Storefront domain uniqueness | `store_domains` filtered to `domain_type = 'storefront'`. | 0 duplicates. |
| Admin domain uniqueness | `store_domains` filtered to `domain_type = 'admin'`. | 0 duplicates. |
| Domain row count | `SELECT count(*) FROM store_domains WHERE source = 'legacy_owner_stores'`. | 20 unless null storefront/admin domains exist. |
| Missing storefront/admin rows | Left join `stores` to `store_domains` by type. | 0 rows unless source domain is null. |
| Reserved domain exceptions | Filter reserved-looking hostnames by domain type. | Admin domains allowed; storefront/custom require review. |
| Duplicate primary domain by type | `GROUP BY store_id, domain_type HAVING count(*) > 1` where primary. | 0 rows. |
| Orphan domains | Domain rows without store join. | 0 rows. |
| Membership count | `store_memberships` sourced from migration mirror. | 0 or explicitly documented as blocked. |

The backfill proposal includes the main parity query list at the bottom and rolls back by default.

## Rollback Proposal

Rollback SQL proposal: [self-serve-store-registry-rollback-proposal.sql](/Users/Celebix/Desktop/ecommerce-celebix/.codex-worktrees/self-serve-store-provisioning-phase-0-1/apps/owner/scripts/sql/self-serve-store-registry-rollback-proposal.sql)

Rollback strategy:

- Safe only before runtime cutover.
- Drop only new self-serve tables in dependency order.
- Do not touch `owner_profiles`, `owner_stores`, `owner_store_access`, `owner_store_secrets`, `owner_cleanup_runs`, or store-local tenant DBs.
- Runtime remains unaffected because no API reads are switched to new tables in Phase 2C.

## Production Migration Gates

Production apply remains blocked until all gates pass:

1. Fresh owner DB backup.
2. Temporary restore test.
3. Schema SQL review.
4. Backfill SQL review.
5. Rollback SQL review.
6. Read-only parity dry-run.
7. Apply to restored temporary DB first.
8. Transactional apply plan where Postgres lock constraints allow it.
9. No runtime authority cutover.
10. No `/api/stores` read/write switch to new tables.
11. Post-apply row parity.
12. Monitoring and owner health checks.
13. Explicit Atlas approval for production migration apply.

## Remaining Blockers

| Area | Status | Reason | Required action |
| --- | --- | --- | --- |
| Store registry mirror | Yellow | 10 owner stores map cleanly, but `skoriq` and `celebix-cms` are missing from owner DB inventory. | Decide whether missing stores are out of scope, archived, or require external inventory. |
| Domain mirror | Yellow | Storefront/admin counts are clean, but reserved-domain heuristic flags admin-style domains. | Adopt `domain_type = admin` reserved-policy exception. |
| Membership mirror | Red | No explicit owner DB membership source. | Run store-local/auth principal inventory and design explicit membership import. |
| Authz cutover | Red | `store_memberships` cannot authorize real admins yet. | Keep legacy auth paths; no cutover until membership parity exists. |
| Billing readiness | Red | No billing authority source. | Define billing model and migration source separately. |
| Provisioning jobs | Red | Jobs table is proposal only. | Add worker/idempotency design in later phase. |

## Safety Statement

Phase 2C is proposal-only. It performs no production DB apply, no live DDL/DML, no deploy, no runtime cutover, no Logto/DNS/Coolify mutation, no secret reporting, and no PII reporting.
