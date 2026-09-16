# Store administrator invitations — approved scope, implementation design

Status: design review; implementation and live delivery NOT completed.

## Problem and evidence

Customer Panel currently saves `administrator_invite` through the generic merchant-admin record API. The API calls the repository save operation, which writes a record, event and idempotency result; it does not enqueue email or grant membership. The visible Active status therefore describes the saved configuration, not delivery or usable access.

The existing Güzide test record must be preserved: Sadık Ahmet, previous-recipient@example.test, admin role, expiration 2026-09-23T19:00:00Z. Do not create another generic record or silently grant access.

Source baseline: 4fffd63c0391dc2ab7d5ef265188ca725d997b12 in existing codex/mira-design-settings-fix worktree. Unrelated dirty order/category visibility and reservation-repair files are excluded.

## Scope and authorization

User approved central authorization, database and email integration plus controlled staging release. Initial live acceptance is restricted to guzide-kuyumcu-4, store a828862c-4cc1-475a-89cc-5fbee31eb43f, and the specified test recipient. No production, payment calls, payment-policy changes, unrelated app deployment, DNS changes, owner-role assignment, or PR merge. Existing schema/readers remain compatible.

Affected surfaces: Customer Panel invitation UI/API, Owner central identity/invitation orchestration, shared contracts/data, additive PostgreSQL migration, invitation delivery worker entry point. Storefront and legacy apps/admin are not invitation consumers; regression checks must prove their existing membership/schema contracts remain valid. Do not modify platform-config unless inspection demonstrates it is necessary.

## Chosen architecture

Use a dedicated invitation lifecycle rather than pretending a generic configuration record is an invitation. Customer Panel authenticates the merchant and requests a store-scoped invitation; central Owner-controlled authority creates and accepts it. Only the central identity boundary can create the membership. Browser-supplied store, actor, role escalation, callback URL or verified-email claims are never authority.

Reuse the existing Resend provider and established durable-job patterns, not the order-specific payload, idempotency namespace or worker queue. Source inspection finds `apps/owner/lib/order-email/{config,resend,production,worker,seal}.ts`; these enforce order-specific contracts. A separate administrator-invitation adapter and job lifecycle must not send invitations under fabricated order identifiers. Provider configuration availability and verified sender must be checked without exposing or copying credentials. Missing configuration blocks live delivery, not local implementation; do not claim the provider is already configured for this use.

Alternatives rejected: synchronous email-only saves lose durable retry state and do not implement acceptance; granting membership at invite creation bypasses verified recipient acceptance. No new third-party service or account is planned.

## Invitation authority and lifecycle

Invitation binds store ID, exact normalized recipient email, allowed role (admin/editor/analyst), inviter principal/membership, source record ID, expiry and version. Store owner cannot be invited. Creation and resend require current store authority; revocation/expiry are checked again at acceptance. Existing higher privilege is never downgraded, and a revoked membership is not silently reactivated.

Use a cryptographically random 32-byte token; persist only its digest in the invitation table. The email job may retain the token only as encrypted payload under a purpose-separated server-only key. Never expose tokens in panel lists, logs, QA artifacts or analytics. Maintain a one-to-one association with the existing generic record for explicit conversion; old records do not automatically send mail or become memberships.

Lifecycle states: pending, accepted, revoked, expired. Delivery states: queued, sending, provider_accepted, delivered, failed, outcome_unknown. Provider acceptance is not inbox delivery. Only verified provider events may mark delivered; otherwise show provider acceptance truthfully. A saved legacy record displays 'Henüz gönderilmedi', not an active administrator.

Create invitation and outbox item atomically with an operation key. Worker uses bounded leases, stable payload/idempotency key, capped retries and safe error codes. A timeout must reuse the original provider key; after its safe replay horizon, stop in outcome_unknown instead of risking duplicate mail. Explicit resend invalidates the previous token, records a new generation and is rate-limited (one per minute, five per hour per invitation). Revoked, accepted or expired generations cannot be delivered or accepted.

## Safe acceptance

Email links use a configured HTTPS platform-owned acceptance endpoint. GET renders a landing screen and never consumes the invite or grants access, so link scanners cannot activate it. Use no-store, no-referrer and no third-party assets/analytics. Redact invite parameters in access logging before enabling live links; if that cannot be guaranteed, use a fragment-to-POST exchange and immediately remove the fragment before rendering.

Bind invitation intent into the existing server-side, browser-bound OIDC flow, not an untrusted return URL. Authenticate users without creating a new store. New recipients may use the identity provider's own registration and verified-email flow. The server must verify issuer/subject and emailVerified=true, with normalized email exactly matching the invitation. A preexisting merchant membership is not required merely to authenticate for acceptance. Do not relax normal panel login guards or create a bypass session.

After authentication, show the destination store and requested role. An explicit CSRF-protected acceptance POST atomically checks token generation/digest, expiry, inviter authority and verified recipient, records acceptance and creates the target membership once. Concurrent/replayed requests cannot create duplicate memberships or broaden roles. Then use existing sanctioned session/handoff functions to enter the exact configured admin hostname. Existing sessions for other stores remain intact; no cookie copying.

## UI and errors

Dedicated invitation list/form shows recipient, role, expiry, invitation and delivery state separately. Actions are send, resend where eligible, revoke and refresh. Preserve entered values on recoverable errors. Duplicate clicks share an operation key. Do not label provider failures as success; distinguish configuration-unavailable, rejected, rate-limited, pending and uncertain outcomes without provider secrets. Existing generic records remain readable and can be explicitly migrated one at a time.

## Verification and release gates

1. Failing behavioral tests first: save without queueing, wrong recipient, unverified email, wrong store, escalated role, expired/revoked token, reused token, concurrent acceptance, existing/revoked membership and rollback atomicity.
2. Disposable PostgreSQL tests under real least-privilege application/identity/workflow roles: no direct membership writes from Panel role, tenant isolation, immutable audit, unique operation replay, bounded job claims, forward/down migration safety.
3. Provider adapter tests without external calls: timeouts, idempotent retries, 401/403, 429, malformed response, webhook authentication/replay, delivery versus acceptance. Test that order-email behavior is unchanged.
4. UI tests: state labels, safe preserved inputs, no token rendering, keyboard and narrow-width usability. Build/typecheck affected apps and run central login/handoff and merchant-admin regressions.
5. Independent security review before migration/release. Record exact candidate, actual running versions, trigger/queue state, backup and rollback procedure. Existing AutoDeploy/Preview settings remain OFF. Do not migrate live data before additive migration passes isolated tests and staging target/readiness checks.
6. Controlled initial sending is recipient/store allowlisted. Convert only the already-approved Güzide record, send one invitation and verify provider result. User completes their own mailbox/login/acceptance steps; do not ask for password/token. Verify membership and a protected page after acceptance. Mailbox receipt requires recipient confirmation or trusted delivery evidence; neither mock tests nor saved records establish it.

## Completion definition

The task is complete only when the intended invitation is sent through the supported provider, the recipient can accept using the matching verified identity, the correct Güzide admin membership exists, and a protected page works under that identity. Report code/test, deployment, provider delivery and authenticated acceptance separately. If external credentials or user mailbox interaction blocks a gate, name that exact gate without marking the whole task complete.
