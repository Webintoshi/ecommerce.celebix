# Self-Serve Store Registry Migration Plan

Status: Phase 2A read-only mirror plan

This plan prepares the Celebix platform for a central self-serve store registry and membership authority. It is not a production migration and does not authorize DB apply, runtime authority cutover, Logto mutation, DNS/Coolify mutation, or deploy.

## Source Authority Map

| Source | Current purpose | Authority level | Phase 2A migration note |
| --- | --- | --- | --- |
| `owner_stores` | Owner panel store list, lifecycle, domains, R2, deployment metadata. | Legacy operational authority. | Mirror into proposed `stores`, `store_domains`, and metadata only after read-only inventory. |
| `owner_profiles` | Owner panel identity profile and `super_admin` / `affiliate_admin` role. | Owner auth authority. | Map to platform principals later; do not remove Supabase owner auth in Phase 2A. |
| `owner_store_access` | Owner panel scoped store access and commission metadata. | Partial access authority. | Report as candidate `store_memberships` or affiliate model input; do not infer ownership automatically. |
| `stores/registry.json` | Repo-tracked store slug/name/domain/theme/status list. | Repo registry authority. | Read locally for dry-run mapping; not enough for production migration alone. |
| `stores/*/store.config.json` | Per-store declarative config for domains, R2, bootstrap, storefront deployment. | Repo config authority. | Primary local dry-run input for proposed store/domain/deployment refs. |
| Store-local `users` + `store_user_roles` | Legacy admin identity and admin role bridge. | Store-local admin authority. | Inventory only; future mapping to `store_memberships` requires live schema parity. |
| `auth_principals` / `auth_store_memberships` | Logto customer principal bridge in store runtime. | Store-local customer auth authority. | Customer memberships must remain separate from admin access. |
| Coolify resources | App runtime/deployment resources. | External operational authority. | Mirror non-secret resource refs only; no Coolify mutation in Phase 2A. |
| R2 resources | Media buckets/domains. | External storage authority. | Mirror bucket/public URL/managed domain as metadata; no bucket mutation. |
| DNS/domain provider | Domain routing and verification. | External domain authority. | `store_domains` must include verification state before future activation. |

## Target Registry Model

| Table | Authority | Phase 2A strategy |
| --- | --- | --- |
| `stores` | Canonical store identity, lifecycle, database mode, source mirror metadata. | Proposal only; mirror rows in dry-run output. |
| `store_domains` | Storefront, custom, platform subdomain, and legacy admin domain authority. | Proposal only; check duplicate hostname and primary domain conflicts. |
| `store_memberships` | Store owner/admin/staff/support/automation authorization. | Proposal only; produce missing mapping warnings until principal inventory is complete. |
| `store_invitations` | Staff/admin invite lifecycle. | Proposal only; no live invites. |
| `store_onboarding_sessions` | Draft self-serve onboarding state. | Proposal only; no production writes. |
| `store_provisioning_jobs` | Durable provisioning queue. | Proposal only; no jobs created in Phase 2A. |
| `store_billing_accounts` | Trial, plan, billing entitlement authority. | Proposal only; no billing cutover or charging. |

## Read-Only Mirror Approach

1. Read local `stores/registry.json`.
2. Read local `stores/*/store.config.json`.
3. Generate deterministic proposed `stores` rows.
4. Generate deterministic proposed `store_domains` rows from storefront/admin domains.
5. Generate deployment refs metadata for Coolify and R2 without secrets.
6. Emit warnings for duplicate slugs, duplicate domains, missing config, missing memberships, possible legacy split stores, and known external stores missing from local registry.
7. Keep `owner_stores`, legacy admin URLs, store-local auth, and owner Supabase auth unchanged.

The dry-run script must not read secrets, env values, production DB, network, Logto, DNS, Coolify, or R2 APIs.

## No-Cutover Rule

Phase 2A is mirror-only. The following remain forbidden:

- No production DB migration apply.
- No live table create/update/delete.
- No runtime store authority change.
- No `/api/stores` behavior change.
- No `super_admin` guard removal.
- No Logto/DNS/Coolify mutation.
- No deploy.
- No storefront/admin routing cutover.

## Parity Checks

Before a future migration apply, the mirror must prove:

- Local repo store count matches expected production owner inventory.
- Every `owner_stores.slug` maps to one proposed `stores.slug`.
- Every storefront/admin domain maps to exactly one proposed `store_domains.hostname`.
- No duplicate primary domain per store/domain type.
- Store status and database mode mapping is documented.
- R2 bucket/public URL/managed domain refs are mirrored without secrets.
- Coolify deployment resource refs are mirrored without write access.
- Membership mapping is explicit and never inferred from slug alone.
- Store-local admin role mapping is compared against proposed `store_memberships`.
- Customer memberships are not promoted into admin access.

## Authz Policy Outline

Logto identity is not authorization. Future admin APIs must:

1. Resolve a principal from trusted identity context.
2. Resolve `store_id` from canonical DB store/domain mapping.
3. Check `store_memberships` by `principal_id + store_id + active status`.
4. Enforce role/capability boundaries server-side.
5. Reject stale, disabled, removed, or customer-only memberships for admin APIs.
6. Treat `storeSlug` as a target selector, not an authorization proof.
7. Audit `super_admin`, support access, and impersonation.

Role boundaries:

- `store_owner`: billing, domains, staff, store settings.
- `store_admin`: catalog, orders, content, operations.
- `store_staff`: scoped operational capabilities.
- `support_admin`: audited support operations.
- `super_admin`: audited platform bypass only.
- `storefront_customer`: storefront/customer APIs only, never admin APIs.

## Existing Stores Mapping Strategy

Local repo evidence currently covers stores listed in `stores/registry.json` and `stores/*/store.config.json`. Known live stores that are not present locally require external inventory before production migration.

Required mapping fields:

- Stable store id.
- Slug and display name.
- Lifecycle status.
- Database mode.
- Storefront/admin/platform domains.
- R2 bucket and public/managed domains.
- Coolify admin/storefront resource refs.
- Owner/admin principal mapping.
- Legacy store-local users and roles.
- Logto principal mapping.

Potential legacy split examples must be resolved as canonical store identity decisions before migration. The dry-run warns on likely split identities, but a human review decides whether they are one store, two stores, or a legacy alias.

## Production Migration Gates

Production migration cannot proceed until all gates pass:

1. SQL review.
2. Fresh production backup.
3. Temporary restore test.
4. Row count parity.
5. Slug uniqueness check.
6. Domain uniqueness check.
7. Membership parity check.
8. No duplicate primary domains.
9. Rollback SQL reviewed.
10. No runtime cutover before mirror parity.
11. Audit logging for `super_admin` and support access.
12. Explicit Atlas approval for production apply.

## Backup And Restore Requirements

- Capture owner DB backup immediately before migration.
- Restore backup into a temporary database and run the migration there first.
- Compare row counts and checksums for owner stores, domains, access/membership inputs, and metadata refs.
- Keep old owner runtime pointed at legacy `owner_stores` until post-restore validation is green.

## Rollback Outline

Phase 2A creates no production objects, so rollback is deleting the local branch changes.

For a later production migration, rollback must include:

- Drop or disable new registry tables only if no runtime cutover happened.
- Preserve `owner_stores` and legacy store-local auth tables.
- Revert feature flags to legacy read paths.
- Keep old admin/storefront URLs unchanged.
- Re-run owner runtime health checks.

## Phase 2B Prerequisites

Phase 2B should not start runtime cutover. The safest next step is inventory/live schema audit:

- Confirm production `owner_stores` schema and row count.
- Confirm live store-local auth bridge schemas.
- Confirm `auth_principals` and `auth_store_memberships` schema sources.
- Confirm Hemenaku, SkorIQ, Celebix CMS, and any other live stores missing from local registry.
- Confirm backup/restore workflow.
