# Storefront Customer Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure, store-scoped passwordless customer accounts to the shared storefront while preserving anonymous cart and guest checkout.

**Architecture:** A hostname-authorized PostgreSQL identity boundary stores per-store accounts, HMAC-protected login challenges, opaque revocable sessions, historical order links, account favorites, and account-cart links. The shared Next.js storefront owns the branded email-code flow and account UI; shopper identity remains separate from merchant-admin Logto and the existing anonymous commerce credentials.

**Tech Stack:** PostgreSQL 16, TypeScript, Node.js crypto, Next.js App Router, React, Node test runner, existing `@celebix/saas-contracts` and `@celebix/saas-data` packages.

## Global Constraints

- Accounts are unique by exact `(store_id,email_normalized)` and never global.
- The browser never supplies `store_id`, `tenant_id`, `account_id`, `customer_id`, or database order IDs as authority.
- Registration and sign-in use a six-digit email code; no password or Supabase Auth is added.
- Guest cart, guest checkout, receipt cookies, and merchant-admin Logto remain available and isolated.
- OTPs and session tokens are stored only as keyed digests and are never logged.
- Account auth fails closed; account failure must not disable guest checkout.
- All new behavior is test-first and migration changes are additive and rollback-guarded.
- Roll out behind `CELEBIX_STOREFRONT_ACCOUNTS_MODE=approved_staging`, first on Güzide staging.

---

### Task 1: Freeze Public Storefront Identity Contracts

**Files:**
- Create: `packages/saas-contracts/src/storefront-identity/types.ts`
- Create: `packages/saas-contracts/src/storefront-identity/validation.ts`
- Create: `packages/saas-contracts/src/storefront-identity/storefront-identity.test.ts`
- Create: `packages/saas-contracts/src/storefront-identity/index.ts`
- Modify: `packages/saas-contracts/src/index.ts`
- Modify: `packages/saas-contracts/src/contracts.test.ts`

**Interfaces:**
- Produces `StorefrontAccountSession`, `StorefrontAccountProfile`, `StorefrontAccountAddress`, `StorefrontAccountOrder`, `StorefrontAccountFavorite`, `StorefrontAccountDevice`, and exact mutation-result parsers.
- Produces `parseStorefrontAuthStartResult`, `parseStorefrontAuthVerifyResult`, `parseStorefrontAccountSnapshot`, and `parseStorefrontAccountOrder`.

- [ ] **Step 1: Write failing contract tests**

```ts
test("storefront identity contracts keep authority private and store-scoped", () => {
  const session = parseStorefrontAuthVerifyResult({ outcome: "authenticated", profileRequired: false });
  assert.deepEqual(session, { outcome: "authenticated", profileRequired: false });
  for (const hostile of ["storeId", "tenantId", "accountId", "customerId", "credential", "codeDigest"]) {
    assert.throws(() => parseStorefrontAuthVerifyResult({ outcome: "authenticated", profileRequired: false, [hostile]: "x" }));
  }
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --experimental-strip-types --test packages/saas-contracts/src/storefront-identity/storefront-identity.test.ts`  
Expected: FAIL because the module and parsers do not exist.

- [ ] **Step 3: Implement exact immutable types and parsers**

Use finite outcomes:

```ts
export type StorefrontAuthStartResult = Readonly<{ outcome: "accepted"; retryAfterSeconds: number }>;
export type StorefrontAuthVerifyResult = Readonly<
  | { outcome: "authenticated"; profileRequired: false }
  | { outcome: "profile_required"; profileRequired: true }
>;
```

Order projections expose `orderReference`, status, payment status, totals, line items, and timestamps only. Address and profile parsers reject prototypes, extra keys, control characters, unsafe integers, invalid phone/email, and private authority fields.

- [ ] **Step 4: Run contract tests and typecheck**

Run: `npm test --workspace @celebix/saas-contracts && npm run typecheck --workspace @celebix/saas-contracts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/saas-contracts/src/storefront-identity packages/saas-contracts/src/index.ts packages/saas-contracts/src/contracts.test.ts
git commit -m "feat(contracts): add storefront customer identity"
```

### Task 2: Add Credential, Email, Challenge, and Request Security Primitives

**Files:**
- Create: `apps/storefront-shared/lib/account/email.ts`
- Create: `apps/storefront-shared/lib/account/email.test.ts`
- Create: `apps/storefront-shared/lib/account/credential.ts`
- Create: `apps/storefront-shared/lib/account/credential.test.ts`
- Create: `apps/storefront-shared/lib/account/request.ts`
- Create: `apps/storefront-shared/lib/account/request.test.ts`
- Modify: `apps/storefront-shared/lib/runtime-config.ts`
- Modify: `apps/storefront-shared/lib/runtime-config.test.ts`

**Interfaces:**
- Produces `normalizeStorefrontAccountEmail(value: unknown): string`.
- Produces `createAccountSessionCredential`, `accountCredentialDigestCandidates`, challenge sealing/opening, and `serializeAccountCookie` helpers.
- Produces `readAccountJsonRequest(request, configuredOrigin, shape)` and `safeAccountReturnTo`.
- Produces `parseStorefrontIdentityConfig(source)` with mode, keyrings, email delivery settings, and verified public origin.

- [ ] **Step 1: Write failing primitive tests**

```ts
test("normalizes one bounded email and rejects ambiguous input", () => {
  assert.equal(normalizeStorefrontAccountEmail(" Ada@Example.COM "), "ada@example.com");
  for (const value of ["", "a@b", "a\u0000@example.com", ["a@example.com"]]) {
    assert.throws(() => normalizeStorefrontAccountEmail(value));
  }
});

test("session cookie is host-only and token storage is keyed", () => {
  const issued = createAccountSessionCredential(KEYRING, () => new Uint8Array(32).fill(7));
  assert.match(serializeAccountCookie(issued.value), /^__Host-celebix_account=/);
  assert.doesNotMatch(serializeAccountCookie(issued.value), /Domain=/);
  assert.doesNotMatch(issued.digest, /BwcHBwcH/);
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `node --experimental-transform-types --test apps/storefront-shared/lib/account/*.test.ts`  
Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement primitives with Node crypto**

Use HMAC-SHA-256 versioned frames for code, session, email, and CSRF digests; AES-256-GCM for the short-lived challenge cookie; CSPRNG for session tokens and decimal codes. Zero temporary buffers. Cookies must be `Secure; HttpOnly; SameSite=Lax; Path=/` with no `Domain`.

- [ ] **Step 4: Implement exact-origin and bounded-body validation**

Reject authorization headers, duplicate/ambiguous content lengths, transfer encoding, non-JSON content, untrusted origin, cross-site fetch metadata, bodies over 8 KiB, prototypes, extra keys, and non-allowlisted `returnTo` values.

- [ ] **Step 5: Run focused tests and storefront typecheck**

Run: `node --experimental-transform-types --test apps/storefront-shared/lib/account/*.test.ts && npm run typecheck --workspace @celebix/storefront-shared`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/storefront-shared/lib/account apps/storefront-shared/lib/runtime-config.ts apps/storefront-shared/lib/runtime-config.test.ts
git commit -m "feat(storefront): add customer identity security primitives"
```

### Task 3: Add PostgreSQL Storefront Identity Authority

**Files:**
- Create: `apps/owner/scripts/sql/saas/202608040083_storefront_customer_identity.up.sql`
- Create: `apps/owner/scripts/sql/saas/202608040083_storefront_customer_identity.down.sql`
- Create: `apps/owner/scripts/sql/saas/202608040083_storefront_customer_identity_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/phase4f-storefront-customer-identity-manifest.json`
- Create: `apps/owner/scripts/sql/saas/storefront-customer-identity-migration.test.ts`
- Create: `tests/saas-phase3/storefront-customer-identity/postgres-harness.mjs`
- Modify: `tests/saas-phase3/run-current-suite.mjs`

**Interfaces:**
- Produces additive account, challenge, session, order-link, favorite, cart-link, audit, and email-outbox tables.
- Produces `saas.public_account_auth_start`, `saas.public_account_auth_verify`, `saas.public_account_profile_complete`, `saas.public_account_session_get`, `saas.public_account_logout`, `saas.public_account_logout_all`, profile/address/favorite/order/session functions, and exact operation recovery.

- [ ] **Step 1: Write static migration test and PostgreSQL harness first**

The harness must prove:

```js
assert.equal(query(storeAAccount, storeAHost).outcome, "found");
assert.equal(query(storeAAccount, storeBHost).outcome, "unauthenticated");
assert.equal(concurrentVerifyResults.filter((x) => x.outcome === "authenticated").length, 1);
assert.equal(concurrentVerifyResults.filter((x) => x.outcome === "challenge_invalid").length, 1);
assert.equal(count("saas.storefront_accounts"), 1);
assert.equal(count("saas.storefront_account_sessions"), 1);
assert.equal(replayConsumedCode.outcome, "challenge_invalid");
assert.equal(guestCheckoutStillWorks, true);
```

- [ ] **Step 2: Run static test and confirm RED**

Run: `node --experimental-strip-types --test apps/owner/scripts/sql/saas/storefront-customer-identity-migration.test.ts`  
Expected: FAIL because migration artifacts do not exist.

- [ ] **Step 3: Implement tables, indexes, RLS, grants, and immutable audit/outbox guards**

All tables use `FORCE ROW LEVEL SECURITY`; revoke PUBLIC and direct app access. Grant only exact `SECURITY DEFINER` functions to `celebix_saas_host_resolver`. Every function has fixed `search_path=pg_catalog,saas`, validates hostname status, and never trusts browser IDs.

- [ ] **Step 4: Implement auth and account SQL functions**

`public_account_auth_verify` atomically consumes one challenge, selects/creates the store account, reuses/reactivates the unique matching customer, inserts historical order links, and creates either a full or registration session. Registration completion creates the customer then rotates the session. Rate-limit functions count digest buckets without storing raw emails or IPs.

- [ ] **Step 5: Implement rollback guard and assertions**

Down migration requires `celebix.allow_storefront_customer_identity_down=on` and refuses while non-revoked/unexpired credentials or account data exist. Assertions verify schema, function signatures, owners, grants, RLS, fixed search paths, and absence of PUBLIC execute.

- [ ] **Step 6: Run static and disposable PostgreSQL tests**

Run: `node --experimental-strip-types --test apps/owner/scripts/sql/saas/storefront-customer-identity-migration.test.ts && node tests/saas-phase3/storefront-customer-identity/postgres-harness.mjs`  
Expected: PASS on PostgreSQL 16.

- [ ] **Step 7: Commit**

```bash
git add apps/owner/scripts/sql/saas/202608040083_* apps/owner/scripts/sql/saas/phase4f-storefront-customer-identity-manifest.json apps/owner/scripts/sql/saas/storefront-customer-identity-migration.test.ts tests/saas-phase3/storefront-customer-identity tests/saas-phase3/run-current-suite.mjs
git commit -m "feat(db): add storefront customer identity authority"
```

### Task 4: Add SaaS Data Repository and Identity Runtime

**Files:**
- Create: `packages/saas-data/src/storefront-identity/types.ts`
- Create: `packages/saas-data/src/storefront-identity/validation.ts`
- Create: `packages/saas-data/src/storefront-identity/repository.ts`
- Create: `packages/saas-data/src/storefront-identity/repository.test.ts`
- Create: `packages/saas-data/src/storefront-identity/index.ts`
- Modify: `packages/saas-data/src/index.ts`
- Create: `apps/storefront-shared/lib/account/runtime.ts`
- Create: `apps/storefront-shared/lib/account/runtime.test.ts`
- Modify: `apps/storefront-shared/lib/default-runtime.ts`

**Interfaces:**
- Produces `StorefrontIdentityRepository` and `PostgresStorefrontIdentityRepository`.
- Produces `StorefrontIdentityRuntime` methods `start`, `verify`, `completeProfile`, `session`, `logout`, `logoutAll`, `profile`, `addresses`, `favorites`, `orders`, and `devices`.
- Extends `PublicStorefrontRuntime` with `identity: StorefrontIdentityRuntime | null`.

- [ ] **Step 1: Write failing repository query and runtime tests**

Tests assert exact SQL signatures/arguments, transaction recovery, public result parsing, no raw code/email in audits, cookie issuance/deletion, and fail-closed mapping.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `node --experimental-strip-types --test packages/saas-data/src/storefront-identity/repository.test.ts && NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test apps/storefront-shared/lib/account/runtime.test.ts`  
Expected: FAIL because repository/runtime do not exist.

- [ ] **Step 3: Implement repository**

Use `acquirePostgresClient`, transaction-local timeouts/role, exact validators, bounded public errors, rollback/release discipline, and operation recovery for verification/profile completion/favorite/address mutations.

- [ ] **Step 4: Implement runtime and default wiring**

The runtime generates codes/tokens, hashes authority, seals the challenge cookie, queues platform email delivery, maps SQL outcomes, and returns only public projections plus `Set-Cookie` strings. Default runtime enables identity only when config and migration 083 preflight pass; otherwise `identity` is null while `cart` and `checkout` remain available.

- [ ] **Step 5: Run package and storefront tests/typechecks**

Run: `npm test --workspace @celebix/saas-data && npm run typecheck --workspace @celebix/saas-data && node --experimental-transform-types --test apps/storefront-shared/lib/account/*.test.ts && npm run typecheck --workspace @celebix/storefront-shared`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/saas-data/src/storefront-identity packages/saas-data/src/index.ts apps/storefront-shared/lib/account apps/storefront-shared/lib/default-runtime.ts
git commit -m "feat(storefront): add customer identity runtime"
```

### Task 5: Add Platform Email Adapter and Auth Routes

**Files:**
- Create: `apps/storefront-shared/lib/account/email-delivery.ts`
- Create: `apps/storefront-shared/lib/account/email-delivery.test.ts`
- Create: `apps/storefront-shared/lib/account/route.ts`
- Create: `apps/storefront-shared/lib/account/route.test.ts`
- Create: `apps/storefront-shared/app/api/account/auth/start/route.ts`
- Create: `apps/storefront-shared/app/api/account/auth/verify/route.ts`
- Create: `apps/storefront-shared/app/api/account/profile/complete/route.ts`
- Create: `apps/storefront-shared/app/api/account/logout/route.ts`
- Create: `apps/storefront-shared/app/api/account/logout-all/route.ts`

**Interfaces:**
- Produces `StorefrontIdentityEmailDelivery` with an HTTPS Resend implementation and dependency-injected transport.
- Produces thin Next route handlers that select trusted host authority, validate the exact origin/body, call runtime once, and attach no-store cookies.

- [ ] **Step 1: Write failing email and route adapter tests**

Tests cover exact HTTPS endpoint, abort deadline, payload size, store-branded subject/body, no provider response leakage, fixed public status mapping, unsupported methods, and cookie headers.

- [ ] **Step 2: Run tests and confirm RED**

Run: `NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test apps/storefront-shared/lib/account/email-delivery.test.ts apps/storefront-shared/lib/account/route.test.ts`  
Expected: FAIL because adapters do not exist.

- [ ] **Step 3: Implement delivery and routes**

Use a platform-owned verified sender and API key from server-only environment. Never read merchant email settings for login. Use a five-second abort deadline and bounded response reads. Route errors are Turkish, enumeration-safe, and do not expose provider/config/DB details.

- [ ] **Step 4: Run focused tests and build**

Run: `node --experimental-transform-types --test apps/storefront-shared/lib/account/*.test.ts && npm run build --workspace @celebix/storefront-shared`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/storefront-shared/lib/account apps/storefront-shared/app/api/account
git commit -m "feat(storefront): add passwordless account routes"
```

### Task 6: Build the Branded Account Experience

**Files:**
- Create: `apps/storefront-shared/components/account/AccountAuthForm.tsx`
- Create: `apps/storefront-shared/components/account/AccountProfileForm.tsx`
- Create: `apps/storefront-shared/components/account/AccountDashboard.tsx`
- Create: `apps/storefront-shared/components/account/AccountAddresses.tsx`
- Create: `apps/storefront-shared/components/account/AccountFavorites.tsx`
- Create: `apps/storefront-shared/components/account/AccountSecurity.tsx`
- Create: `apps/storefront-shared/components/account/account-ui.test.ts`
- Create: `apps/storefront-shared/app/account/login/page.tsx`
- Create: `apps/storefront-shared/app/account/verify/page.tsx`
- Create: `apps/storefront-shared/app/account/orders/page.tsx`
- Create: `apps/storefront-shared/app/account/orders/[orderReference]/page.tsx`
- Create: `apps/storefront-shared/app/account/addresses/page.tsx`
- Create: `apps/storefront-shared/app/account/profile/page.tsx`
- Create: `apps/storefront-shared/app/account/security/page.tsx`
- Modify: `apps/storefront-shared/app/account/page.tsx`
- Modify: `apps/storefront-shared/app/globals.css`
- Modify: `apps/storefront-shared/components/StoreUtilities.tsx`

**Interfaces:**
- Protected server pages use `runtime.identity.session()` and redirect only through `safeAccountReturnTo`.
- Client forms submit same-origin JSON and consume exact public contract results.

- [ ] **Step 1: Write failing UI behavior tests**

Tests assert accessible labels, input modes/autocomplete, status/error regions, no duplicate heading copy, account navigation, public order references only, logout controls, responsive CSS, and no private IDs/tokens in sources.

- [ ] **Step 2: Run UI test and confirm RED**

Run: `NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test apps/storefront-shared/components/account/account-ui.test.ts`  
Expected: FAIL because account components/pages do not exist.

- [ ] **Step 3: Implement minimal branded pages**

Use the store logo/name/colors from the existing public storefront/design projection. Keep copy short, forms keyboard accessible, mobile-first, and consistent with the open-canvas storefront style. Do not add boxed dashboard clutter.

- [ ] **Step 4: Run UI tests, typecheck, and production build**

Run: `npm test --workspace @celebix/storefront-shared && npm run typecheck --workspace @celebix/storefront-shared && npm run build --workspace @celebix/storefront-shared`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/storefront-shared/components/account apps/storefront-shared/app/account apps/storefront-shared/app/globals.css apps/storefront-shared/components/StoreUtilities.tsx
git commit -m "feat(storefront): add customer account experience"
```

### Task 7: Integrate Favorites, Cart, Checkout, and Merchant Customer View

**Files:**
- Modify: `apps/storefront-shared/lib/favorites.ts`
- Modify: `apps/storefront-shared/lib/favorites.test.ts`
- Modify: `apps/storefront-shared/components/FavoriteStatusProvider.tsx`
- Modify: `apps/storefront-shared/app/api/favorites/resolve/route.ts`
- Modify: `apps/storefront-shared/lib/cart/runtime.ts`
- Modify: `apps/storefront-shared/lib/cart/runtime.test.ts`
- Modify: `apps/storefront-shared/components/CheckoutForm.tsx`
- Modify: `apps/storefront-shared/components/CheckoutForm.test.ts`
- Modify: `apps/storefront-shared/app/api/checkout/complete/route.ts`
- Modify: `apps/customer-panel/components/customers/CustomerDetailConsole.tsx`
- Modify: `apps/customer-panel/lib/server-customers/runtime.ts`
- Modify: `apps/customer-panel/lib/server-customers/runtime.test.ts`
- Modify: `apps/customer-panel/lib/customer-http/handler.ts`
- Modify: `apps/customer-panel/lib/customer-http/handler.test.ts`
- Modify: `apps/customer-panel/lib/customer-http/request-input.ts`
- Modify: `apps/customer-panel/lib/customer-console.test.ts`

**Interfaces:**
- Favorites endpoint returns the union of validated local IDs and account favorites when a full session exists.
- Cart runtime links/merges the anonymous cart after successful account login.
- Checkout quote exposes safe prefill data only to the matching full account session; completion links the order atomically.
- Merchant customer workspace shows account state and supports suspend/re-enable/revoke-all through existing tenant authorization.

- [ ] **Step 1: Write failing integration tests**

Cover local/server favorite union, account cart merge replay, stock cap notices, checkout prefill without browser IDs, signed-in order linking, logout isolation, and merchant account controls.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test apps/storefront-shared/lib/favorites.test.ts apps/storefront-shared/lib/cart/runtime.test.ts apps/storefront-shared/components/CheckoutForm.test.ts apps/customer-panel/lib/server-customers/runtime.test.ts apps/customer-panel/lib/customer-http/handler.test.ts apps/customer-panel/lib/customer-console.test.ts`  
Expected: FAIL because account-aware merge, checkout, and merchant controls do not exist.

- [ ] **Step 3: Implement minimal integrations**

Reuse existing cart and checkout calculations. Identity contributes only server-derived account/customer authority. Never match orders dynamically from a browser-supplied email. Merchant mutations require the existing `customers.manage` authority and revoke sessions in PostgreSQL.

- [ ] **Step 4: Run relevant test suites and builds**

Run: `npm test --workspace @celebix/storefront-shared && npm test --workspace @celebix/customer-panel && npm run build --workspace @celebix/storefront-shared && npm run build --workspace @celebix/customer-panel`  
Expected: new and relevant tests PASS; any unrelated pre-existing suite failure is recorded separately and must not be concealed.

- [ ] **Step 5: Commit**

```bash
git add apps/storefront-shared apps/customer-panel
git commit -m "feat(commerce): connect customer accounts to storefront flows"
```

### Task 8: Verify, Migrate Staging, Deploy, and Exercise the Full Flow

**Files:**
- Modify only if verification finds a tested defect.

**Interfaces:**
- Produces a clean branch, migration backup/evidence, deployed Güzide storefront/customer-panel images, and browser acceptance evidence.

- [ ] **Step 1: Run final automated verification**

```bash
npm test --workspace @celebix/saas-contracts
npm test --workspace @celebix/saas-data
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/storefront-shared
node tests/saas-phase3/storefront-customer-identity/postgres-harness.mjs
```

Expected: all relevant checks PASS.

- [ ] **Step 2: Inspect diff and secrets**

Run `git diff --check`, `git status --short`, and a bounded secret/private-authority scan. No API keys, emails, OTPs, credentials, `.env` files, or database IDs may be added to browser output or committed fixtures.

- [ ] **Step 3: Push branch**

Push the current branch only after local and remote commit hashes are checked.

- [ ] **Step 4: Back up and apply migration 083 to staging**

Create a timestamped PostgreSQL custom-format backup, verify it is non-empty, apply `.up.sql` then assertions, and query migration preflight. Do not apply the down migration.

- [ ] **Step 5: Configure staging identity mode and email transport**

Add only reviewed server-side environment names/values in Coolify. Never print secret values. If no approved platform email credential exists, keep the feature flag disabled and report that exact external blocker rather than inventing a sender.

- [ ] **Step 6: Deploy customer panel and storefront**

Verify both applications deploy the exact pushed commit and remain healthy. Confirm the storefront branch does not revert through a queued deployment.

- [ ] **Step 7: Browser acceptance**

On Güzide staging exercise guest checkout, account email-code start, new/existing verification, profile completion, second-device login, historical order claim, favorites/cart merge, address CRUD, current/all-device logout, and suspension. Keep the final customer account page open for the user.

- [ ] **Step 8: Final commit only if verification fixes were required**

Commit each defect fix with its failing regression test, rerun the exact failed and final suites, push, and redeploy the corrected commit.
