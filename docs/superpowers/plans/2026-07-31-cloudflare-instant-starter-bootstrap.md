# Cloudflare Wildcard and Instant Starter Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans and superpowers:test-driven-development. Do not use subagents unless the user explicitly authorizes them.

**Goal:** Make every successful Celebix registration immediately open a secure canonical admin panel and a `free_starter` storefront without creating customer-specific DNS records or certificates, while preserving every currently working hostname.

**Architecture:** Pre-provision Cloudflare-backed DNS-01 wildcard certificates and separate Traefik routers for the shared customer-panel and shared storefront. Keep tenant authority in PostgreSQL exact-domain records. Commit the store, owner membership, `free_starter` subscription, Starter theme, media namespace, canonical storefront domain, and canonical admin domain atomically before returning `ready`.

**Tech Stack:** TypeScript, Node test runner, Next.js App Router, PostgreSQL 16, Cloudflare DNS, Coolify-managed Traefik.

## Safety constraints

- Start in the existing isolated `codex/guzide-staging-integration` worktree.
- Never remove or overwrite existing exact-domain routers or certificates during the staging canary.
- Never print, commit, or place Cloudflare/Coolify credentials in application environment variables.
- Do not call Cloudflare, Coolify, or ACME inside the customer registration request.
- Unknown wildcard hosts must reach no tenant data and must fail closed after exact PostgreSQL resolution.
- `auth`, `panel`, `ecommerce`, `api`, `admin`, and other platform host labels must never become tenant slugs.
- Apply production proxy/TLS changes only after staging certificate, routing, registration, login, logout, and rollback evidence passes.

## Task 1: Lock Starter provisioning and reserved platform slugs

**Files:**

- Modify: `packages/saas-tenant-core/src/create-starter-tenant.test.ts`
- Modify: `packages/saas-tenant-core/src/create-starter-tenant.ts`

- [ ] Add failing tests proving a non-`starter` `themeKey` and every reserved platform slug is rejected before a transaction begins.
- [ ] Run `node --experimental-strip-types --test packages/saas-tenant-core/src/create-starter-tenant.test.ts` and observe the new failures.
- [ ] Add the minimum immutable reserved-slug policy and require `themeKey === "starter"` at the tenant-core authority boundary.
- [ ] Re-run the focused test and `npm run typecheck --workspace @celebix/saas-tenant-core`.

## Task 2: Bind canonical admin redirects to the active environment

**Files:**

- Modify: `packages/saas-data/src/panel-origin.test.ts`
- Modify: `packages/saas-data/src/panel-origin.ts`
- Modify: `packages/saas-data/src/index.ts`
- Modify: `apps/customer-panel/lib/tenant-panel-logout.test.ts`
- Modify: `apps/customer-panel/lib/tenant-panel-logout.ts`
- Modify only if focused tests expose the same gap: `apps/customer-panel/lib/tenant-admin-login-model.ts`, `apps/customer-panel/lib/server-panel-session-controls/switch-handoff.ts`, and their tests.

- [ ] Add failing origin-helper tests proving a staging panel rejects production canonical admin origins and production rejects staging.
- [ ] Add failing logout start/callback tests for the same cross-environment redirect attempt.
- [ ] Run the focused tests and observe the expected failures.
- [ ] Implement one shared exact-origin parser derived from the fixed central panel origin and use it in logout.
- [ ] Audit login, handoff, and store-switch destination parsing; reuse the helper wherever a database projection could cross environments.
- [ ] Re-run `npm test --workspace @celebix/saas-data`, the focused customer-panel suites, and both workspace typechecks.

## Task 3: Add repeatable wildcard TLS and routing verification

**Files:**

- Create: `scripts/verify-tenant-wildcard-readiness.mjs`
- Create: `scripts/verify-tenant-wildcard-readiness.test.mjs`
- Modify: `package.json`
- Modify: `docs/operations/tenant-admin-auth-rollout.md`

- [ ] Add failing tests for certificate SAN coverage, certificate expiry thresholds, admin/storefront route separation, exact platform-host preservation, and unknown-host fail-closed results.
- [ ] Implement a read-only verifier that accepts explicit environment/host inputs, performs bounded DNS/TLS/HTTPS checks, and emits no secrets.
- [ ] Add a root package script for the verifier and document staging/production commands plus rollback checks.
- [ ] Run the verifier unit test and a read-only preflight against current Güzide, central panel, and random unknown staging hosts.

## Task 4: Verify the code candidate before infrastructure mutation

- [ ] Run focused tenant-core, saas-data, customer-panel, owner registration, and storefront tests.
- [ ] Run affected workspace typechecks and production builds.
- [ ] Run `git diff --check` and review the complete diff for secret leakage and unrelated changes.
- [ ] Commit the verified code and operations changes with a narrow auth/bootstrap commit.

## Task 5: Configure staging Cloudflare DNS-01 wildcard TLS without replacing current routes

- [ ] Capture a redacted snapshot of the active Coolify project, Traefik static/dynamic configuration, certificate store, exact-domain routers, image digests, and health results.
- [ ] Validate the Cloudflare token has only the required zone DNS permissions without printing it.
- [ ] Add a staging DNS Challenge resolver and certificates for `*.admin.saas-staging.celebix.site` and `*.saas-staging.celebix.site`.
- [ ] Add lower-priority wildcard routers to the existing shared customer-panel and shared storefront while retaining all exact routers.
- [ ] Reload/restart the proxy only after configuration validation, then prove every pre-existing exact hostname still returns its prior healthy result.
- [ ] Run the wildcard readiness verifier; a Traefik default certificate, wrong SAN, cross-router response, or unknown tenant acceptance aborts and triggers rollback.

## Task 6: Deploy and prove instant customer readiness

- [ ] Push the verified commit and deploy the shared owner, customer-panel, and storefront staging applications through the existing Coolify project.
- [ ] Confirm deployment commit SHA, image digest, migration state, and health checks without exposing credentials.
- [ ] Register one uniquely named staging test customer through the real browser flow.
- [ ] Prove the callback enters its canonical admin panel without a second password and the canonical Starter storefront returns 200 over valid TLS immediately after the committed registration.
- [ ] Prove logout returns to the branded login page, the old panel session is rejected, and a fresh login succeeds.
- [ ] Re-run Güzide and central service smoke tests to prove no regression.
- [ ] Record timestamps, URLs, status codes, certificate fingerprints/SANs, deployment identifiers, and rollback evidence in the operations document.

## Task 7: Production gate and handoff

- [ ] Do not change production until staging Task 6 is fully green.
- [ ] Present the staging evidence and request the action-time production infrastructure confirmation.
- [ ] After confirmation, repeat the same snapshot, wildcard TLS, router canary, regression, and instant-registration proof in production.
- [ ] Monitor wildcard renewal health; warn below 30 days, mark critical below 14 days, and block new production tenant readiness if certificate health is unsafe.
- [ ] Use superpowers:verification-before-completion, then superpowers:finishing-a-development-branch before declaring the feature complete.
