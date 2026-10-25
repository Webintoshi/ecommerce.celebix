# Store Admin 30-Day Session Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement the scoped tasks.

**Goal:** Keep store administrators signed in for a fixed maximum of 30 days, until they log out.

**Architecture:** Retain native session families, WhatsApp assurance and persistent cookies. Deploy compatible owner/panel readers before increasing native issuance; preserve absolute expiry and revocation.

**Tech Stack:** TypeScript, Next.js, PostgreSQL16, existing shared Coolify applications.

**Spec:** `docs/superpowers/specs/2026-10-24-store-admin-session-30-days-design.md`

## Global Constraints

- 30 days from original verified sign-in; no sliding renewal or retroactive extension.
- Keep central owner TOTP, legacy issuers and temporary OTP/handoff lifetimes unchanged.
- Root is the sole publisher. Preserve all existing environment, worker and payment authority.
- Run current and historical source-bound signup rehearsals and fresh wildcard HTTPS verification.

## Review Focus

- Eight-hour validation hidden on an intermediate owner or cross-domain reader.
- Session rotation or cookie refresh silently resetting the 30-day deadline.
- Arbitrary long sessions issued without verified WhatsApp assurance.
- Logout, membership removal or security reset failing to invalidate the long session.
- Existing eight-hour sessions or central owner authentication changing unexpectedly.

## Tasks

- [ ] Add shared lifetime constants in `packages/saas-contracts/src/store-admin-session-policy.ts` and export them.
- [ ] Write failing boundary tests, then update customer-panel session validators and remaining-life cookie serialization. Keep legacy issuance distinct.
- [ ] Write failing owner completion/handoff boundary tests, then update owner readers while preserving legacy eight-hour issuers.
- [ ] Add migration272, guarded rollback/assertions and disposable native lifecycle tests covering issuance, original-deadline transfer, expiry and revocation.
- [ ] Review the complete auth boundary, run focused regressions and affected production builds, refresh signup proof and commit the exact candidate.
- [ ] Capture a fresh deployment baseline. Publish compatible owner/panel readers on NET and SITE, apply native issuance under the shared publisher lock, and verify running sources, native authority and live acceptance.
