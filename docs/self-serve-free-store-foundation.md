# Self-Serve Free Starter Store Foundation

Status: proposal-backed foundation only. No production provisioning, DNS, R2, Coolify, Logto client creation, or DB migration is enabled by this package.

## Scope

This package prepares the direct `/kayit` registration flow for a future automatic free starter store path while keeping production safe by default.

Implemented now:

- `POST /api/self-serve/register` validates direct registration payloads and returns a processing contract.
- Default production behavior is safe pending mode with planned storefront/admin URLs.
- Passwords are only validated in memory and are never persisted, returned, logged, or placed into the request store.
- Idempotency is enforced for normalized email + slug.
- Same normalized email with a different slug is blocked while `SELF_SERVE_MAX_STORES_PER_USER=1`.
- A local/test-only mock creation adapter can create in-memory mock store/package/domain/membership/provisioning-job records.

Not implemented in this package:

- Real store creation.
- Real provisioning jobs.
- Owner runtime authority cutover.
- Production DB persistence.
- Coolify, DNS, R2, Logto, payment, analytics, mail, or Search Console mutations.
- Direct-to-admin one-time handoff.

## Existing Store Creation Audit

The existing owner-controlled creation path remains separate:

- `apps/owner/app/api/stores/route.ts` is the current privileged owner create endpoint.
- That route uses `@celebix/platform-config.createStore(...)` to create owner store metadata.
- It then calls `apps/owner/lib/store-provisioning.ts` via `runStoreProvisioningWorkflow(...)`.
- The provisioning workflow can touch Supabase, R2, admin deployment, storefront deployment, and runtime readiness flows depending on store mode and flags.

The self-serve direct registration route does not call `/api/stores`, `createStore(...)`, or `runStoreProvisioningWorkflow(...)`.

## Feature Flags

Safe defaults:

| Flag | Default | Production meaning |
| --- | --- | --- |
| `SELF_SERVE_DIRECT_REGISTRATION_ENABLED` | `true` | `/kayit` direct registration contract is available. |
| `SELF_SERVE_FREE_STARTER_STORE_ENABLED` | `false` | Free starter creation is not active by default. |
| `SELF_SERVE_STORE_CREATE_ENABLED` | `false` | Real store creation is disabled. |
| `SELF_SERVE_PROVISIONING_ENABLED` | `false` | Real provisioning is disabled. |
| `SELF_SERVE_AUTO_PROVISIONING_ENABLED` | `false` | Automatic provisioning is disabled. |
| `SELF_SERVE_REQUIRE_OWNER_APPROVAL` | `false` | Final target is direct-to-admin, not approval-first. |
| `SELF_SERVE_PREVIEW_MODE` | safe preview default | Keeps unsafe paths blocked unless explicitly overridden. |
| `SELF_SERVE_REQUIRE_PAYMENT_BEFORE_PUBLIC` | `false` | Free starter can be prepared without payment gate. |
| `SELF_SERVE_MAX_STORES_PER_USER` | `1` | One active/pending store per normalized email. |
| `SELF_SERVE_REQUIRE_EMAIL_VERIFICATION` | `true` | Future auth handoff must verify email. |
| `SELF_SERVE_DEFAULT_DOMAIN_SUFFIX` | `celebix.site` | Planned storefront domain suffix. |

Local mock creation requires all of these:

- non-production runtime (`NODE_ENV !== "production"`)
- `SELF_SERVE_PREVIEW_MODE=true`
- `SELF_SERVE_FREE_STARTER_STORE_ENABLED=true`
- `SELF_SERVE_STORE_CREATE_ENABLED=true`
- `SELF_SERVE_PROVISIONING_ENABLED=false`
- `SELF_SERVE_AUTO_PROVISIONING_ENABLED=false`

If any real production mutation flag is enabled without the required safe local conditions, the persistence mode becomes `blocked_by_phase_1_safety`.

## API Contract

Default safe response for a valid request:

- HTTP `202`
- `code: "self_serve_store_creation_processing"`
- `adminRedirectUrl: null`
- `plannedStoreUrl: https://<slug>.celebix.site`
- `plannedAdminUrl: https://admin-<slug>.celebix.site`
- `creation.mode: "production_safe_pending"`
- `creation.status: "processing"`
- `provisioning.storeCreateEnabled: false`
- `provisioning.provisioningEnabled: false`

Local mock response, only under explicit local/test flags:

- HTTP `202`
- `creation.mode: "local_mock_creation"`
- `creation.status: "mock_records_created"`
- `creation.artifacts.store`
- `creation.artifacts.package`
- `creation.artifacts.domain`
- `creation.artifacts.adminDomain`
- `creation.artifacts.membership`
- `creation.artifacts.provisioningJob`

The mock artifacts are in-memory only and do not create external resources.

## Idempotency

Normalization keys:

- `email`: trimmed lowercase.
- `slug`: normalized through the self-serve slug helper.

Behavior:

- Same normalized email + slug returns the existing request and sets `idempotent: true`.
- Same normalized slug with a different email returns `409 self_serve_slug_taken`.
- Same normalized email with a different slug returns `409 self_serve_email_has_existing_store` while max stores per user is one.

## Proposal SQL

Proposal-only SQL is included for review:

- `../apps/owner/scripts/sql/self-serve-free-store-foundation-proposal.sql`
- `../apps/owner/scripts/sql/self-serve-free-store-foundation-rollback.sql`

These files are not wired into migrations and must not be applied to production without a separate Atlas approval, backup, restore rehearsal, rollback review, and runtime cutover plan.

## Future Direct-to-Admin Handoff

The final product target is:

1. Register account through Logto.
2. Create free starter store safely and idempotently.
3. Create store owner membership.
4. Prepare short-lived one-time admin handoff.
5. Redirect the user to the newly created admin panel.

Current state:

- `adminRedirectUrl` remains `null`.
- `handoff.mode` is `pending_secure_one_time_handoff`.
- Long-lived tokens must never be passed in query strings.
- One-time handoff must expire quickly and bind to the authenticated principal, store, and target admin domain.

## Remaining Blockers Before Real Auto-Provisioning

- Production registry tables need approved migration apply.
- Owner DB backup/restore rehearsal must remain green.
- Logto user creation and admin membership creation must be transactional or compensatable.
- Store provisioning must be idempotent with retry-safe job semantics.
- Domain/DNS/Coolify/R2 operations need separate guarded workers and rollback plans.
- Admin session handoff needs a reviewed short-lived token model.
- Production flags must be enabled only through a separate Atlas release gate.
