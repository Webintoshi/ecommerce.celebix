# Self-Serve Persistent Registration Adapter

Status: foundation only. No production DB migration has been applied, no production deploy is included, and no provisioning or real store creation is enabled by this work.

## DB Access Audit

Existing owner DB access uses the Owner Supabase service-client pattern:

- `apps/owner/lib/owner-supabase-server.ts` exposes `createOwnerServiceClient()`.
- `apps/owner/lib/owner-supabase-shared.ts` centralizes owner Supabase env reads and missing-env reporting.
- `apps/owner/lib/control-plane.ts`, `apps/owner/lib/store-provisioning.ts`, `apps/owner/lib/store-config-authority.ts`, `apps/owner/lib/store-lifecycle.ts`, and store secret helpers use Supabase `.from(...)` queries against owner control-plane tables.
- `apps/owner/app/api/stores/route.ts` remains the privileged owner create endpoint and is still guarded by owner auth/super-admin authorization.
- The self-serve registration route does not call `/api/stores`, `createStore(...)`, or `runStoreProvisioningWorkflow(...)`.

`apps/owner/lib/light-postgres-provisioning.ts` was referenced in the task prompt, but that file is not present on the current `origin/main` base. The relevant provisioning path on this branch is `apps/owner/lib/store-provisioning.ts`.

## Persistence Modes

Default mode is unchanged:

- Unset `SELF_SERVE_PERSISTENCE_MODE` => `safe_memory_adapter`.
- `SELF_SERVE_PERSISTENCE_MODE=persistent_db_adapter` => persistent DB adapter path, only if store creation/provisioning flags are not enabled.
- Unknown persistence mode values fall back to `safe_memory_adapter`.
- Dangerous production mutation flags still force `blocked_by_phase_1_safety` unless the existing local mock conditions are explicitly met.

Persistent mode requires owner DB env presence. If required owner DB env is missing, `/api/self-serve/register` returns a controlled `503 self_serve_persistent_adapter_unavailable` response before any write attempt. Secret values are never returned.

## Adapter Behavior

Implemented foundation:

- Valid registration creates a registration bundle through the explicit persistent adapter.
- Same normalized email + slug is idempotent.
- Same slug with a different email is rejected.
- Same email with a different slug is blocked while `SELF_SERVE_MAX_STORES_PER_USER=1`.
- Password is validated only in memory and is never stored in adapter snapshots, API responses, or SQL columns.
- Provisioning job record is prepared as `queued` metadata only; no worker executes it in this phase.

The Supabase-backed adapter writes only to proposed `self_serve_*` tables when persistent mode is explicitly selected and those tables/config exist. Because production migration is not applied in this task, the production default remains safe memory and persistent writes are not reachable by default.

## SQL Proposal Safety

SQL files:

- `../apps/owner/scripts/sql/self-serve-free-store-foundation-proposal.sql`
- `../apps/owner/scripts/sql/self-serve-free-store-foundation-rollback.sql`

Safety properties:

- Both files are marked `PROPOSAL ONLY - DO NOT APPLY TO PRODUCTION YET`.
- They are not wired into a migration pipeline.
- Proposal SQL does not include `DROP TABLE`, `DELETE FROM`, or `TRUNCATE`.
- Rollback scope is limited to proposed `self_serve_*` tables.
- Existing `owner_*` source-of-truth tables are untouched.
- No runtime read cutover is included.

Key persistence fields:

- `idempotency_key`
- `normalized_email`
- `store_slug`
- `(normalized_email, store_slug)` unique idempotency index
- unique `store_slug`
- current one-store-per-email unique `normalized_email`
- `creation_mode`
- planned storefront/admin URLs
- nullable `admin_redirect_url`
- free starter package and membership tables
- `self_serve_provisioning_jobs.adapter`
- job status/error/safe metadata
- `password_stored=false` check

## Production Migration Status

Not included:

- Production DB migration apply.
- Owner runtime authority cutover.
- Worker execution of provisioning jobs.
- Coolify, DNS, R2, Logto client creation, mail, analytics, Search Console, payment, DeryCraft, or customer-store mutation.

Before real persistent production use, Atlas still needs a separate migration/apply gate with owner DB backup, temp restore rehearsal, rollback review, SQL review, and post-apply parity checks.

## Remaining Blockers Before Direct Auto-Provisioning

- Production registry tables must be migrated through the approved owner DB process.
- Persistent writes should move to a transaction/RPC or compensatable worker model before production auto-provisioning.
- Logto account creation and email verification need final architecture approval.
- Store provisioning jobs need idempotent worker execution and retry semantics.
- Short-lived one-time admin handoff still needs security review.
- Production flags for store creation/provisioning must remain disabled until a separate Atlas release gate.
