# Storefront Magic-Link Authentication Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a modern store-branded customer login page and a scanner-safe, store-scoped magic-link flow with six-digit fallback while preserving guest checkout.

**Architecture:** Extend the existing customer-identity challenge with a second keyed verifier for a 256-bit opaque ticket. Email GET opens a read-only confirmation page; same-origin POST consumes either the ticket or fallback code through one PostgreSQL transaction. A central, sending-only Celebix Resend adapter delivers the branded link and code with the outbox ID as idempotency authority.

**Tech Stack:** Next.js App Router, React, TypeScript, Node test runner, PostgreSQL 16 security-definer RPCs/RLS, Resend HTTPS API, Coolify.

## Global Constraints

- Store authority is always derived from the trusted request hostname; the browser never submits a store ID.
- GET never consumes a challenge or creates a session.
- A verification request contains exactly one of `ticket` or `code`.
- Magic tickets contain at least 256 random bits and PostgreSQL stores only keyed digests.
- Fallback codes and tickets consume the same challenge atomically.
- Guest checkout remains available when account email delivery is disabled or unavailable.
- Production and staging use separate server-only Resend keys with sending-only permission.
- No raw email, ticket, code, cookie, session credential, or provider response enters logs or public error bodies.
- Implementation follows failing-test-first TDD and commits each independently verified authority boundary.

---

### Task 1: Magic-ticket credential authority

**Files:**
- Modify: `apps/storefront-shared/lib/account/credential.test.ts`
- Modify: `apps/storefront-shared/lib/account/credential.ts`

**Interfaces:**
- Produces: `createStorefrontMagicTicket(randomBytes): string`
- Produces: `accountHostnameTicketDigest({ challengeId, hostname, ticket }, keyring, keyId?): { keyId: string; digest: string }`
- Consumes: existing `StorefrontIdentityKeyring` and versioned HMAC framing.

- [ ] **Step 1: Write the failing credential tests**

Add literal assertions proving a 32-byte deterministic source becomes a 43-character base64url ticket, invalid byte lengths fail, hostname changes alter the digest, key rotation produces distinct keyed digests, and malformed tickets are rejected.

- [ ] **Step 2: Run the credential test and verify RED**

Run: `npm test --workspace @celebix/storefront-shared -- --test-name-pattern='magic ticket|credential'`

Expected: FAIL because the ticket functions are not exported.

- [ ] **Step 3: Implement minimal ticket generation and digest framing**

Use a `^[A-Za-z0-9_-]{43}$` ticket grammar, require exactly 32 random bytes, zero temporary buffers after encoding, and issue a versioned `hostname-ticket` HMAC over challenge ID, canonical hostname, and ticket.

- [ ] **Step 4: Run the credential test and verify GREEN**

Run the command from Step 2 and expect all selected tests to pass.

- [ ] **Step 5: Commit**

```bash
git add apps/storefront-shared/lib/account/credential.test.ts apps/storefront-shared/lib/account/credential.ts
git commit -m "feat(storefront): add magic-ticket credentials"
```

### Task 2: Additive PostgreSQL ticket verification authority

**Files:**
- Create: `apps/owner/scripts/sql/saas/202608040085_storefront_magic_link_auth.up.sql`
- Create: `apps/owner/scripts/sql/saas/202608040085_storefront_magic_link_auth.down.sql`
- Create: `apps/owner/scripts/sql/saas/202608040085_storefront_magic_link_auth_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/phase4g-storefront-magic-link-auth-manifest.json`
- Create: `apps/owner/scripts/sql/saas/storefront-magic-link-auth-migration.test.ts`
- Modify: `packages/saas-data/src/storefront-identity/types.ts`
- Modify: `packages/saas-data/src/storefront-identity/repository.ts`
- Modify: `packages/saas-data/src/storefront-identity/repository.test.ts`

**Interfaces:**
- Extends `StorefrontIdentityRepository.start` with `ticketKeyId` and `ticketDigest`.
- Replaces `StorefrontIdentityRepository.verify` verifier input with `{ verifierKind: "ticket" | "code"; verifierDigest: string }`.
- PostgreSQL `public_account_auth_start` receives ticket key/digest in addition to the fallback-code key/digest.
- PostgreSQL `public_account_auth_verify` receives verifier kind and digest, then atomically consumes one shared challenge.

- [ ] **Step 1: Write failing repository and migration tests**

Add tests proving the repository emits exact SQL arguments for both verifiers and the migration adds non-null ticket authority for new rows, preserves existing unexpired code challenges, forces RLS, grants only RPC execution, and rejects ticket/code replay.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
node --experimental-transform-types --test apps/owner/scripts/sql/saas/storefront-magic-link-auth-migration.test.ts
npm test --workspace @celebix/saas-data -- --test-name-pattern='identity.*ticket|ticket.*identity'
```

Expected: FAIL because migration 085 and repository verifier fields do not exist.

- [ ] **Step 3: Implement migration and repository changes**

Add nullable ticket columns for backward compatibility, require them in the new start RPC, accept `ticket` only when both ticket columns are present, accept `code` through the existing code fields, lock the selected challenge `FOR UPDATE`, increment attempts on invalid verifiers, and set one `consumed_at` on success. Pin artifact SHA-256 values in the manifest.

- [ ] **Step 4: Run a real PostgreSQL 16 migration harness and focused tests**

Run the repository tests, migration artifact test, and the project’s existing PostgreSQL 16 identity harness. Expect ticket success plus replay, expiry, concurrency, and other-host failures.

- [ ] **Step 5: Commit**

```bash
git add apps/owner/scripts/sql/saas/202608040085_storefront_magic_link_auth.* apps/owner/scripts/sql/saas/phase4g-storefront-magic-link-auth-manifest.json apps/owner/scripts/sql/saas/storefront-magic-link-auth-migration.test.ts packages/saas-data/src/storefront-identity
git commit -m "feat(db): add storefront magic-link authority"
```

### Task 3: Runtime and Resend delivery

**Files:**
- Modify: `apps/storefront-shared/lib/account/runtime.test.ts`
- Modify: `apps/storefront-shared/lib/account/runtime.ts`
- Modify: `apps/storefront-shared/lib/account/email-delivery.test.ts`
- Modify: `apps/storefront-shared/lib/account/email-delivery.ts`
- Modify: `apps/storefront-shared/lib/default-runtime.ts`

**Interfaces:**
- `StorefrontIdentityRuntime.start` returns the existing public accepted shape and sends `{ email, ticket, code, storeName, storeOrigin, returnTo, idempotencyKey }`.
- `StorefrontIdentityRuntime.verify` accepts exactly one of `{ ticket }` or `{ challengeCookie, code }`.
- Resend delivery sends `Idempotency-Key: account-login/<outbox-id>` and a bounded branded HTML/text message.

- [ ] **Step 1: Write failing runtime and delivery tests**

Prove start generates both verifiers, passes only digests to the repository, passes raw values only to the delivery adapter, builds an HTTPS URL on the exact trusted store origin, escapes merchant text, sets the idempotency header, and verifies tickets without a challenge cookie while fallback codes still require one.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm test --workspace @celebix/storefront-shared -- --test-name-pattern='ticket|platform delivery|verification'
```

Expected: FAIL on the new message and verification contracts.

- [ ] **Step 3: Implement runtime and adapter changes**

Generate ticket/code once, derive independent keyed digests, seal the fallback challenge cookie, call the extended repository, and deliver one branded message. Build the URL with `new URL('/account/verify', storeOrigin)`, add only `ticket` and safe `returnTo`, and do not interpolate raw HTML without escaping.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the command from Step 2 and expect all selected tests to pass.

- [ ] **Step 5: Commit**

```bash
git add apps/storefront-shared/lib/account/runtime.test.ts apps/storefront-shared/lib/account/runtime.ts apps/storefront-shared/lib/account/email-delivery.test.ts apps/storefront-shared/lib/account/email-delivery.ts apps/storefront-shared/lib/default-runtime.ts
git commit -m "feat(storefront): deliver scanner-safe magic links"
```

### Task 4: Public route contracts and confirmation flow

**Files:**
- Modify: `packages/saas-contracts/src/storefront-identity/index.ts`
- Modify: `packages/saas-contracts/src/storefront-identity/index.test.ts`
- Modify: `apps/storefront-shared/lib/account/route.test.ts`
- Modify: `apps/storefront-shared/lib/account/route.ts`
- Modify: `apps/storefront-shared/app/account/verify/page.tsx`

**Interfaces:**
- Start response: `{ outcome: "accepted", retryAfterSeconds, message, returnTo }`.
- Verify request: exact union `{ ticket, returnTo? } | { code, returnTo? }`.
- Verification GET renders only; POST remains `/api/account/auth/verify`.

- [ ] **Step 1: Write failing contract and route tests**

Prove extra keys and both/neither verifier inputs fail, ticket verification does not require the challenge cookie, code verification does, GET source has no mutation request, and public start success never reveals account existence.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm test --workspace @celebix/saas-contracts -- --test-name-pattern='auth'
npm test --workspace @celebix/storefront-shared -- --test-name-pattern='account auth'
```

Expected: FAIL because the route accepts only `code`.

- [ ] **Step 3: Implement exact union parsing and read-only confirmation**

Parse a 43-character ticket or six digits, never both. Keep same-origin JSON validation for POST. Render the confirmation page from URL state without calling verification until the customer activates the primary button.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run both commands from Step 2 and expect them to pass.

- [ ] **Step 5: Commit**

```bash
git add packages/saas-contracts/src/storefront-identity apps/storefront-shared/lib/account/route.test.ts apps/storefront-shared/lib/account/route.ts apps/storefront-shared/app/account/verify/page.tsx
git commit -m "feat(storefront): add magic-link confirmation flow"
```

### Task 5: Modern account entry interface

**Files:**
- Modify: `apps/storefront-shared/components/account/AccountAuthForm.tsx`
- Modify: `apps/storefront-shared/app/account/login/page.tsx`
- Modify: `apps/storefront-shared/app/account/verify/page.tsx`
- Modify: `apps/storefront-shared/app/globals.css`
- Modify: `apps/storefront-shared/lib/storefront-app.test.ts`

**Interfaces:**
- `AccountAuthForm` supports `mode: "email" | "ticket" | "code"` with explicit sent, busy, success, and generic-error states.
- Login stays on-page after accepted start and exposes resend only after the server-provided interval.

- [ ] **Step 1: Write failing UI behavior tests**

Add source/integration assertions for the compact heading, link action copy, trust text, three account benefits, no oversized auth serif typography, ticket confirmation button, fallback disclosure, and responsive single-column bounds.

- [ ] **Step 2: Run the storefront test and verify RED**

Run: `npm test --workspace @celebix/storefront-shared -- --test-name-pattern='account entry|magic link'`

Expected: FAIL because the old hero and `Kod gönder` remain.

- [ ] **Step 3: Implement the minimal modern UI**

Use one centered semantic section, real labels, `aria-live`, `autoComplete="email"` and `one-time-code`, visible focus, disabled/busy copy, a compact sent state, and mobile styles. Keep static visual content outside client state and avoid adding third-party UI dependencies.

- [ ] **Step 4: Run the storefront test and verify GREEN**

Run the command from Step 2 and expect the selected tests to pass.

- [ ] **Step 5: Commit**

```bash
git add apps/storefront-shared/components/account/AccountAuthForm.tsx apps/storefront-shared/app/account/login/page.tsx apps/storefront-shared/app/account/verify/page.tsx apps/storefront-shared/app/globals.css apps/storefront-shared/lib/storefront-app.test.ts
git commit -m "feat(storefront): modernize customer account entry"
```

### Task 6: Full verification, deployment, and staged activation

**Files:**
- Modify only if verification reveals a scoped defect in files from Tasks 1–5.

**Interfaces:**
- Produces one verified commit deployed to both storefront and Güzide admin branches.
- Consumes a verified staging Resend sending key and authenticated sending subdomain supplied through Coolify environment variables.

- [ ] **Step 1: Run complete automated verification**

```bash
npm test --workspace @celebix/saas-contracts
npm test --workspace @celebix/saas-data
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/storefront-shared
git diff --check
```

Expected: all commands pass with no uncommitted implementation changes.

- [ ] **Step 2: Apply migration 085 through the privileged staging migration path**

Run the up migration and assertions against PostgreSQL 16, confirm version/database/role boundaries, and record only non-secret verification output.

- [ ] **Step 3: Configure server-only staging identity values**

Create independent 32-byte HMAC and seal keys, store them only in Coolify, set account mode/origin suffix, and add the verified `@celebix.co` sender plus the Resend sending-only key. Never print values in terminal output or commit them.

- [ ] **Step 4: Push and deploy the exact verified commit**

Push the same HEAD to `codex/storefront-unified-theme-authority` and `codex/guzide-staging-integration`, force a Coolify rebuild for both resources, and wait for healthy containers running the exact commit.

- [ ] **Step 5: Run live acceptance checks**

Verify `/health`, `/account/login`, sent-state behavior, real email delivery to an authorized test recipient, read-only link GET, explicit POST login, replay rejection, account page, logout/login, and unauthenticated `/checkout`. Confirm no secret or raw ticket appears in public responses or logs.

- [ ] **Step 6: Commit any scoped verification fix and repeat Steps 1–5**

If a defect appears, first add a failing regression test, implement the smallest fix, commit it with a focused message, and repeat the full gate.
