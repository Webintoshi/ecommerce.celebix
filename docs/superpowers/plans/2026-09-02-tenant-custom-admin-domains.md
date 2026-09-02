# Tenant Custom Admin Domains Implementation Plan

> Execute test-first in the isolated `atlas-admin-custom-domains` worktree. Never edit `apps/admin/**`.

**Goal:** Make verified tenant-owned admin hostnames resolve the correct store in the shared Customer Panel, while preserving the platform fallback host and storefront authority.

**Architecture:** Extend `saas.admin_domains` additively, expose admin-specific lifecycle persistence and services, bind every protected request host to the authenticated store, and reuse the existing Cloudflare for SaaS adapter. Keep the central Logto callback and host-only session model.

**Stack:** PostgreSQL 16 SQL functions/RLS, TypeScript, Next.js App Router, Node test runner, Cloudflare for SaaS, Coolify/Traefik, Logto.

---

### Task 1: Freeze migration and contract behavior

1. Add failing contract and static migration tests for admin-domain lifecycle projections, purpose separation, global uniqueness, one primary admin, platform fallback, and forbidden direct privileges.
2. Run the focused tests and confirm the expected failures.
3. Add migration 120 up/down/assertions and its manifest. Replace the affected public brand, handoff, returning-login, and store-option functions while preserving their signatures.
4. Add strict immutable admin-domain contract parsers and exports.
5. Re-run focused tests to green.

### Task 2: Add PostgreSQL persistence and domain service

1. Add failing `saas-data` tests for list/create/bind/recheck/make-primary/disable, custom-first URL selection, exact transaction behavior, and safe error mapping.
2. Add failing `saas-domain-core` tests for admin hostname normalization and lifecycle behavior using the existing Cloudflare adapter.
3. Implement the admin-domain repository, types, service, and exports with no storefront repository changes.
4. Re-run both workspaces to green.
5. Commit as `feat(domain): add tenant admin hostname lifecycle`.

### Task 3: Bind Customer Panel requests and expose settings

1. Add failing hostname tests for ports, unknown/disabled/storefront hosts, spoofed forwarded host, and cross-tenant sessions.
2. Add failing API and settings tests for separate storefront/admin sections, state, DNS, TLS, primary/fallback, last check, and recheck.
3. Implement direct-Host normalization, server-only active admin resolution, session-store equality checks, admin lifecycle runtime registration, routes, and settings UI.
4. Update panel/invitation/owner/store-option URL projections to use custom primary, platform fallback, then fail closed.
5. Re-run focused Customer Panel and Owner tests.
6. Commit as `feat(customer-panel): resolve tenants from custom admin domains`.

### Task 4: Make login, logout, and mutations custom-host safe

1. Add failing tests for custom-host login, callback destination, logout return, fallback login, cookie isolation, same-origin custom/fallback mutations, and foreign Origin denial.
2. Generalize destination parsing to exact resolved admin hostnames; do not trust wildcard suffixes or forwarded host headers.
3. Preserve state, nonce, issuer, audience, signed handoff, host-only Secure cookies, and existing fallback behavior.
4. Re-run auth and mutation tests.
5. Commit as `fix(auth): support custom admin domain login and logout`.

### Task 5: Prove PostgreSQL and regression compatibility

1. Add a disposable PostgreSQL 16 harness that applies the existing schema through migration 119, then migration 120 and assertions.
2. Prove old application + new schema, new application + new schema, code-only rollback, uniqueness, purpose isolation, one primary, disabled denial, and dual-host resolution.
3. Register the harness in the standard current suite where applicable and add runtime preflight/static checks.
4. Run the focused harness red before final implementation adjustments, then green.
5. Commit as `test(domain): cover admin hostname isolation and dual-host rollout`.

### Task 6: Fresh verification and independent review

Run the real repository scripts for tests, typechecks, Customer Panel/Owner builds, migration statics, PostgreSQL harness, runtime preflight, and `git diff --check`. Confirm branch-only failures are zero and `apps/admin/**` is unchanged. Request independent review, fix every Critical/Important finding, and rerun affected gates.

### Task 7: PR, merge, and staging rollout

Push normally, create `feat(customer-panel): add tenant custom admin domains` against `codex/design-tabs-save-fix-live`, verify scope/SHA, and merge with a merge commit. Preserve the source branch.

Take and restore-verify a staging database backup. Apply migration 120 first, smoke the fallback host, deploy the exact merge SHA, configure only `admin.guzidekuyumcu.com.tr` in Cloudflare/Coolify and exact Logto callback/logout URIs, wait for active DNS/TLS, then run custom-host and fallback browser QA. Clean all test data and record rollback evidence.

