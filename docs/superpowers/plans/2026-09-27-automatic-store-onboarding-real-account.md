# Automatic Store Onboarding Real Account Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development. The user explicitly authorized a real account signup, correction of encountered errors, domain choice, and prior shared deployment permission. Credentials stay out of files, tests, commits and agent messages. Legal acceptance and email verification require their actual user decisions; no bypass.

**Goal:** Register the requested Alpler Spor business through the normal browser flow and verify its account, owner membership, admin and public storefront after correcting onboarding failures.

**Architecture:** Keep verified Logto OIDC identity, durable registration completion, shared SaaS applications and tenant isolation. Use the existing trusted HTTPS wildcard domain for the first registration; make new tenant storefront authority and a publishable starter design work consistently for supported platform suffixes. Preserve current merchant drafts and payment/provider settings.

**Tech Stack:** Next.js, React, TypeScript, PostgreSQL16, existing Logto and Coolify deployments.

**Spec:** `docs/qa/automatic-store-onboarding-audit-2026-09-27.md`; user request dated2026-09-27 authorizes execution through a real user account.

## Global Constraints

- Do not create duplicate accounts or tenants; inspect collisions and resume the existing attempt if present.
- Never store or emit password, identity tokens, browser callback/state secrets or mailbox codes in reports.
- No arbitrary hostname trust, TLS/auth/RLS/verification bypass or per-store application deployment.
- Existing draft documents, versions, published content, domains, provider flags and generated payment bindings are preserved.
- No real order, payment, paid plan, custom domain transfer or marketing consent unless separately requested.
- SQL uses next available ordinal166; verify current live state before applying once, after backup and a disposable rehearsal.
- Workers do not deploy or mutate live infrastructure. Root owns the browser signup and the release.

## Review Focus

- Enabled signup UI must match actual server capability and generated domain suffix.
- Fresh defaults pass both draft and publication rules; existing designs must remain byte-for-byte preserved.
- Duplicate/sluggish requests do not duplicate tenant records or grant wrong owner membership.
- Transient provider/database failures recover without weakening OIDC signature/issuer/audience/nonce validation.
- Successful login is not enough: the new tenant's admin, design, public host and media path must resolve correctly.

## Task 1 — Browser registration and actual error evidence (root)

- [ ] Fill the normal signup form and obtain the required privacy/consent decision.
- [ ] Complete actual Logto signup/sign-in with the user-supplied credentials and verified email; preserve the in-progress tab during user input.
- [ ] Record sanitized error codes and follow each boundary to its root cause; add focused regression tests before fixes.
- [ ] Confirm exactly one intended tenant and active store-owner membership; do not bypass normal session creation.

## Task 2 — Consistent new storefront authority and valid starter seed (SQL worker)

- [x] Prove currentNET-only seed and invalid enabled/null-image default through focused tests.
- [x] Add migration166 with compatible atomic new-platform-domain authority/design seeding for supported suffixes; guard foreign/conflicting domains and preserve existing designs.
- [x] Keep reversible function/trigger migration metadata and restrict functions/backup privileges.
- [x] Verify freshNET/SITE starters, duplicate insert, conflict rollback, default publishability and unchanged existing versions/documents in isolated PostgreSQL only.

## Task 3 — Registration UI matches actual runtime (UI worker)

- [x] Add failing tests for enabled/disabled registration text and configured domain suffix.
- [x] Correct registration status text and remove incorrect claims that payment/shipping are already configured.
- [x] Preserve form fields, server-side consent validation and accessibility; no provider/security integration changes.
- [x] Run focused page/component tests and provide source diff.

## Task 4 — Recoverable startup and OIDC metadata (auth worker)

- [x] Reproduce transient initializer/discovery failure and signing-key rotation with controlled local dependencies.
- [x] Clear failed initialization/discovery caches with bounded retries; refresh JWKS safely without relaxing verification, origin allowlists, response caps or timeouts.
- [x] Verify concurrent requests coalesce, invalid tokens remain rejected and refresh cannot cause unbounded fetches.
- [x] Run relevant auth/registration tests and independent review.

## Task 5 — Integrate, release and verify the real tenant (root)

- [ ] Inspect any actual completion/recovery failure and repair the normal durable path with focused tests if encountered.
- [x] Independent source review, affected typechecks/builds, disposable migration rehearsal and a fresh private backup.
- [x] Commit exact source and safely release affected owner/shared applications, maintaining source-bound payment metadata and all unrelated settings.
- [x] Apply final migration once and verify existing design/domain preservation.
- [ ] Complete the pending browser signup; verify admin, setup/design, public storefront, console and media availability with no real commerce transaction.
- [ ] Preserve the deliverable admin tab; report actual account URLs, changes, tests and any remaining user verification requirement.
