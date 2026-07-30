# Tenant-Branded Admin Authentication Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every merchant a canonical store-branded admin hostname with a secure registration, login, store-switch, logout, and re-login lifecycle backed by Logto identity and self-hosted PostgreSQL tenant/session authority.

**Architecture:** Keep one shared multi-tenant customer-panel deployment. Resolve each request hostname through an explicit `saas.admin_domains` authority, issue only host-bound `__Host-` cookies, and cross origins exclusively through short-lived single-use POST handoffs. Logto remains the identity provider; PostgreSQL remains authoritative for memberships, active store selection, handoff redemption, and principal-global session revocation.

**Tech Stack:** Next.js App Router, React, TypeScript, Node test runner, PostgreSQL 16, `pg`, Logto OIDC, Coolify wildcard routing.

## Global Constraints

- Never put session, handoff, or callback credentials in URLs, fragments, browser storage, referrers, logs, or client-rendered data.
- Never create a cookie scoped to `.admin.celebix.site`; all admin cookies remain host-only `__Host-`, `HttpOnly`, `Secure`, and `SameSite=Lax`.
- Resolve store identity from an exact active admin-domain database record. Do not infer tenant authority from a hostname label alone.
- Preserve the fixed central OIDC callbacks and the current Logto provider. Do not introduce Supabase or a second identity authority.
- Fail closed with bounded, non-enumerating public errors and `Cache-Control: no-store`.
- Preserve legacy aliases while making the generated store-branded origin canonical.
- Write the failing test first for every behavior change, run it to observe the expected failure, then implement the minimum production change.
- Keep migration `202607300069` append-only and reversible. Never edit already-deployed migrations.

---

## Task 1: Canonical admin-origin and hostname contracts

**Files:**

- Modify: `packages/saas-data/src/panel-origin.ts`
- Modify: `packages/saas-data/src/panel-origin.test.ts`
- Modify: `packages/saas-data/src/index.ts`
- Modify: `packages/saas-contracts/src/types.ts`
- Modify: `packages/saas-contracts/src/contracts.test.ts`

- [x] Add failing tests for `createCanonicalAdminOrigin(slug, environment)` and strict normalization of platform admin hostnames.
- [x] Cover production `<slug>.admin.celebix.site`, staging `<slug>.admin.saas-staging.celebix.site`, invalid slugs, credentials, ports, paths, queries, fragments, uppercase labels, trailing dots, Unicode confusables, and unrelated suffixes.
- [x] Add immutable `PublicAdminBrand` and `AdminDomainKind`/`AdminDomainStatus` contracts with exact-key tests.
- [x] Implement the minimum origin helpers and export them from `@celebix/saas-data`.
- [x] Run `node --experimental-transform-types --test packages/saas-data/src/panel-origin.test.ts packages/saas-contracts/src/contracts.test.ts`.
- [x] Commit as `feat(auth): define canonical tenant admin origins`.

## Task 2: PostgreSQL admin-domain and principal-revocation authority

**Files:**

- Create: `apps/owner/scripts/sql/saas/202607300069_tenant_admin_domains_and_principal_logout.up.sql`
- Create: `apps/owner/scripts/sql/saas/202607300069_tenant_admin_domains_and_principal_logout.down.sql`
- Create: `apps/owner/scripts/sql/saas/202607300069_tenant_admin_domains_and_principal_logout_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/phase3-tenant-admin-auth-manifest.json`
- Create: `apps/owner/scripts/sql/saas/tenant-admin-auth-migration-contract.test.ts`
- Create: `tests/saas-phase3/tenant-admin-auth-postgres/tenant-admin-auth-postgres.test.mjs`

- [x] Add static failing tests for the new table, exact checks/indexes, row-level security, grants, hostname resolver, canonical-domain write function, single-use cross-host handoff functions, and principal-global revoke function.
- [x] Add a disposable PostgreSQL 16 integration test that provisions two stores for one principal and proves host isolation, handoff single-use, alias support, and revocation of every active family for that principal.
- [x] Implement `saas.admin_domains` with one active canonical domain per store, explicit alias kinds/statuses, verification timestamp invariants, timestamps, RLS, least-privilege grants, and lookup indexes.
- [x] Implement `saas.resolve_public_admin_brand(hostname, now)` returning only store slug, display name, public logo/accent fields when available, and canonical hostname.
- [x] Implement `saas.revoke_principal_panel_sessions(token_key_id, token_digest, reason, now)` so the presented credential must resolve to an active session before all active session families for its principal are revoked atomically.
- [x] Implement short-lived single-use cross-host handoff issue/redeem/recovery functions bound to principal, destination store, destination hostname, and expiration.
- [x] Run the static migration contract test, then the disposable PostgreSQL test against PostgreSQL 16.
- [x] Commit as `feat(auth): add tenant admin domain authority`.

## Task 3: Data repositories and public brand resolver

**Files:**

- Create: `packages/saas-data/src/postgres/admin-domain-repository.ts`
- Create: `packages/saas-data/src/postgres/admin-domain-repository.test.ts`
- Modify: `packages/saas-data/src/index.ts`
- Modify: `apps/customer-panel/lib/panel-session-persistence/postgres-panel-session-repository.ts`
- Modify: `apps/customer-panel/lib/panel-session-persistence/postgres-panel-session-repository.test.ts`
- Modify: `apps/customer-panel/lib/server-panel-access/runtime.ts`

- [x] Add failing repository tests for exact result parsing, zero/multiple-row rejection, safe resolver outcomes, canonical host selection, principal-global revoke, cross-host handoff issue/redeem, commit-unknown recovery, and credential redaction in audit events.
- [x] Implement a read-only public admin-brand resolver using the host-resolver database role/function.
- [x] Extend the session repository/runtime with `revokePrincipalSessions`, `issueCrossHostHandoff`, and `redeemCrossHostHandoff` without weakening existing family/session methods.
- [x] Run the two repository suites with `--experimental-transform-types`.
- [x] Commit as `feat(auth): expose tenant admin session authority`.

## Task 4: Provision canonical admin domains and panel URLs

**Files:**

- Modify: `packages/saas-tenant-core/src/create-starter-tenant.ts`
- Modify: `packages/saas-tenant-core/src/create-starter-tenant.test.ts`
- Modify: `packages/saas-data/src/postgres/parsers.ts`
- Modify: `packages/saas-data/src/postgres/parsers.test.ts`
- Modify: `packages/saas-data/src/postgres/recovery.test.ts`
- Modify: `apps/owner/lib/saas-persistence/tenant-completion-result.ts`
- Modify: `apps/owner/lib/saas-persistence/tenant-completion-result.test.ts`
- Modify: `apps/owner/lib/self-serve-registration-completion.test.ts`
- Modify: `apps/owner/lib/self-serve-http/internal-callback-response.ts`
- Modify: `apps/owner/lib/self-serve-http/internal-callback-response.test.ts`
- Modify: `apps/customer-panel/lib/self-serve-callback-edge/safe-response.ts`
- Modify: `apps/customer-panel/lib/self-serve-callback-edge/safe-response.test.ts`

- [ ] Change expectations first so a created tenant returns its exact canonical admin origin instead of `/stores/<slug>` on the shared panel.
- [ ] Add tests proving completion/recovery rejects a panel URL for another slug, environment, custom alias, path, port, query, or fragment.
- [ ] Persist the canonical platform admin-domain record in the same tenant-creation operation boundary, or in an idempotent recoverable step keyed by the tenant operation id.
- [ ] Update strict parsers and safe callback envelopes to validate the canonical store-branded origin.
- [ ] Run the focused tenant-core, data-parser, owner completion, and callback-edge suites.
- [ ] Commit as `feat(auth): provision canonical store admin origins`.

## Task 5: Resolve admin host and render store-branded login

**Files:**

- Create: `apps/customer-panel/lib/admin-host-authority/resolver.ts`
- Create: `apps/customer-panel/lib/admin-host-authority/resolver.test.ts`
- Create: `apps/customer-panel/lib/admin-host-authority/default.ts`
- Modify: `apps/customer-panel/app/login/page.tsx`
- Create: `apps/customer-panel/app/login/page.test.tsx`
- Modify: `apps/customer-panel/app/globals.css`
- Modify: `apps/customer-panel/lib/panel-auth-route-runtime/runtime.ts`

- [ ] Add failing tests for exact forwarded-host handling, trusted proxy semantics, unknown/inactive domain 404s, resolver outage 503s, canonical-brand payloads, and no cross-store data leakage.
- [ ] Add component tests for Güzide branding, Hemenaku alias branding, missing logo fallback, responsive layout, accessible focus/name/error states, and no credential/client storage output.
- [ ] Resolve public brand server-side before rendering and keep the hostname resolver separate from authenticated tenant data.
- [ ] Render the existing Celebix visual system with store name/logo/accent and a clear `Yönetici girişi` action.
- [ ] Run `npm test --workspace @celebix/customer-panel` and the customer-panel type/build checks.
- [ ] Review changed React/Next files with the React best-practices skill and address material findings.
- [ ] Commit as `feat(panel): brand login by verified admin host`.

## Task 6: Secure first-login and returning-login cross-host handoff

**Files:**

- Create: `apps/customer-panel/lib/cross-host-session-handoff/auto-post-html.ts`
- Create: `apps/customer-panel/lib/cross-host-session-handoff/auto-post-html.test.ts`
- Create: `apps/customer-panel/lib/cross-host-session-handoff/handler.ts`
- Create: `apps/customer-panel/lib/cross-host-session-handoff/handler.test.ts`
- Create: `apps/customer-panel/app/auth/handoff/route.ts`
- Modify: `apps/customer-panel/lib/panel-auth-route-mount/route-set.ts`
- Modify: `apps/customer-panel/lib/panel-auth-route-mount/route-set.test.ts`
- Modify: `apps/customer-panel/lib/panel-session-completion/handler.ts`
- Modify: `apps/customer-panel/lib/panel-session-completion/handler.test.ts`
- Modify: `apps/owner/lib/self-serve-browser-bound-registration/handler.ts`
- Modify: `apps/owner/lib/self-serve-browser-bound-registration/handler.test.ts`

- [ ] Add failing route tests requiring `POST /auth/handoff` and rejecting GET with 405.
- [ ] Add failing HTML tests for nonce-only CSP, exact destination origin/path, POST body credential, no URL credential, no script/style/network allowances, and escaped hostile input.
- [ ] Bind the central callback’s issued handoff to the resolved canonical destination hostname and store membership.
- [ ] Redeem once on the destination host, issue a host-only session cookie, and redirect to the panel root without secrets.
- [ ] Make registration completion use the same destination-bound bridge after tenant creation.
- [ ] Test replay, expiration, wrong hostname, wrong store, inactive membership, inactive store, and database outage safe errors.
- [ ] Run all handoff, callback, route-mount, and browser-bound-registration suites.
- [ ] Commit as `feat(auth): hand off sessions to branded admin hosts`.

## Task 7: Cross-host multi-store switching

**Files:**

- Modify: `apps/customer-panel/lib/server-panel-session-controls/handler.ts`
- Modify: `apps/customer-panel/lib/server-panel-session-controls/handler.test.ts`
- Modify: `apps/customer-panel/components/panel/StoreSwitcher.tsx`
- Modify: `apps/customer-panel/components/panel/StoreSwitcher.test.tsx`
- Create: `apps/customer-panel/app/api/session/switch/route.ts`

- [ ] Add failing tests proving a store switch cannot directly set another host’s cookie and must issue a destination-bound one-time handoff.
- [ ] Return a safe auto-POST bridge response or exact safe destination from the server-controlled switch route.
- [ ] Update the switcher to submit normally/top-level, without fetch-reading a credential or placing one in browser state.
- [ ] Test single-store behavior, unauthorized target, alias-to-canonical switch, replay, back-button behavior, and no password prompt.
- [ ] Run session-control and component suites.
- [ ] Commit as `feat(panel): switch stores through one-time host handoff`.

## Task 8: Principal-global Celebix logout plus Logto logout

**Files:**

- Modify: `apps/customer-panel/lib/server-panel-session-controls/handler.ts`
- Modify: `apps/customer-panel/lib/server-panel-session-controls/handler.test.ts`
- Modify: `apps/customer-panel/app/api/session/logout/route.ts`
- Create: `apps/customer-panel/app/auth/logout/callback/route.ts`
- Create: `apps/customer-panel/app/auth/logout/callback/route.test.ts`
- Modify: `apps/customer-panel/components/panel/LogoutButton.tsx`
- Modify: `apps/customer-panel/components/panel/LogoutButton.test.tsx`
- Modify: `apps/customer-panel/lib/panel-auth-authority/config.ts`
- Modify: `apps/customer-panel/lib/panel-auth-authority/config.test.ts`

- [ ] Add failing tests requiring all panel session families for the authenticated principal to be revoked atomically.
- [ ] Add failing tests for Logto `end_session_endpoint`, exact fixed post-logout callback, state binding, host-only cookie deletion, retryable provider failure, and a fresh account prompt on next login.
- [ ] Change logout to call `revokePrincipalSessions`, clear the current host cookie, then top-level redirect through Logto logout.
- [ ] Implement the fixed production/staging callback and safely return to the original verified admin host without credentials in its URL.
- [ ] Run the logout, config, session repository, and customer-panel suites.
- [ ] Commit as `feat(auth): revoke principal sessions on logout`.

## Task 9: Legacy aliases and pilot provisioning

**Files:**

- Create: `apps/owner/scripts/sql/saas/202607300070_seed_pilot_admin_domains.up.sql`
- Create: `apps/owner/scripts/sql/saas/202607300070_seed_pilot_admin_domains.down.sql`
- Create: `apps/owner/scripts/sql/saas/202607300070_seed_pilot_admin_domains_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/pilot-admin-domain-seed.test.ts`
- Modify: `apps/owner/lib/store-config-authority.ts`
- Modify: `apps/owner/lib/store-config-authority.test.ts`

- [ ] Add failing idempotency tests for Güzide canonical staging hostname and Hemenaku canonical plus legacy alias.
- [ ] Seed only exact verified store ids/slugs discovered from the target database; never guess or hard-code a broad wildcard mapping.
- [ ] Keep legacy aliases active but return the canonical origin in brand/switch responses.
- [ ] Update owner config projections so shared customer-panel deployment identity is separate from a store’s canonical/alias admin domains.
- [ ] Run seed contract and owner authority suites.
- [ ] Commit as `feat(auth): seed pilot store admin domains`.

## Task 10: Full verification and staged rollout

**Files:**

- Modify: `docs/superpowers/plans/2026-07-30-tenant-branded-admin-auth-hardening.md`
- Create: `docs/operations/tenant-admin-auth-rollout.md`

- [ ] Run migration up/assert/down/up in disposable PostgreSQL 16 and record exact results.
- [ ] Run `npm test --workspace @celebix/customer-panel`.
- [ ] Run `npm test --workspace @celebix/owner`.
- [ ] Run the affected `@celebix/saas-data`, `@celebix/saas-contracts`, and `@celebix/saas-tenant-core` suites with the repository’s transform flags.
- [ ] Run typecheck/build/lint commands defined by affected workspace packages.
- [ ] Start the panel locally with controlled host headers and browser-test desktop/mobile branded login, keyboard access, error states, handoff, switch, logout, and fresh re-login.
- [ ] Apply migrations and Coolify wildcard routing first to Güzide staging; verify `guzide-kuyumcu-4.admin.saas-staging.celebix.site` end to end.
- [ ] Activate Hemenaku as a canary while retaining `admin.hemenaku.com`; verify both origins resolve the same store and all navigation prefers the canonical hostname.
- [ ] Capture deployment ids, health checks, HTTP response evidence, and rollback commands in the operations document without secrets.
- [ ] Use the verification-before-completion skill before claiming success, then use finishing-a-development-branch to prepare the branch for review/merge.
- [ ] Commit as `docs(auth): record tenant admin rollout evidence`.
