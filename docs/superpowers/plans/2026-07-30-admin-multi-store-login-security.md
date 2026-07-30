# Secure Multi-Store Admin Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox-style progress and test-first delivery.

**Goal:** Allow one Logto identity to enter every customer admin panel to which it has been explicitly assigned, while keeping all other customer panels denied and making callback failures understandable and recoverable.

**Architecture:** Logto remains the central identity provider. Authorization remains local to each store database through `auth_principals` and `auth_store_memberships`; no callback path grants access from email alone and no global allow-list is introduced. The shared admin runtime classifies callback failures and renders store-specific recovery UI. The owner control plane provisions or reuses one Logto identity and writes an active membership into the selected store database. Admin and owner releases remain separate because they are deployed from different live branches.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Node test runner, PostgreSQL (`pg`), Logto OIDC and Management API, Coolify, GHCR.

**Global Constraints:**

- Never remove the per-store membership check.
- Match Logto identities by exact normalized `primaryEmail` only inside the owner provisioning flow; callback authorization must match the authenticated `sub` only.
- Never update an existing Logto user's password merely because that identity is assigned to another store.
- Never log authorization codes, access tokens, ID tokens, passwords, cookie values, or full Management API response bodies.
- Keep legacy Supabase admin assignment working for `full_supabase` stores.
- Keep admin and owner changes in separate commits so each can be cherry-picked into its own live branch without unrelated code.
- Do not claim success from a build alone. Live acceptance requires one identity allowed on two assigned stores and denied on one unassigned store.

## Release topology

- Shared admin implementation branch: `codex/admin-multistore-login-security`, based on live Hemenaku commit `fc6c5318`.
- Owner integration branch: `codex/owner-logto-admin-memberships`, created from `origin/deploy/owner` after the admin commits are complete.
- Hemenaku admin runtime: `https://admin.hemenaku.com`, Coolify application UUID `krwcu6xj870bb3lzfsbz9bxl`, image `ghcr.io/celebixco/hemenaku-admin:production`.
- Owner runtime stays on `deploy/owner`; only owner-only commits from this plan may be cherry-picked there.
- Candidate second and denied test stores are selected from configured Logto stores at execution time. The first candidates are `atlas-final-acceptance-20260612-121322` and `atlas-template-visual-20260612-233753`; their health must be confirmed before any assignment.

## Task 1: Add a shared admin-login error contract

**Files:**

- Create: `apps/admin/lib/admin-login-contract.ts`
- Create: `apps/admin/lib/admin-login-contract.test.ts`

- [ ] **Step 1: Write failing contract tests**

Cover these cases with `node:test` and `node:assert/strict`:

- each supported code maps to Turkish title, explanation, and recovery action;
- unknown query values return `null` and never become raw UI copy;
- `not_assigned` produces an account-switch action;
- `membership_unavailable` produces a retry action;
- internal redirect paths are sanitized before entering a sign-in URL;
- forced account selection adds `force_account=1` without changing the safe `next` path.

The exported contract must be:

```ts
export type AdminLoginErrorCode =
  | "provider_disabled"
  | "invalid_callback"
  | "token_exchange_failed"
  | "identity_lookup_failed"
  | "membership_unavailable"
  | "not_assigned"
  | "session_write_failed";

export type AdminLoginRecoveryAction = "retry" | "switch_account";

export function parseAdminLoginErrorCode(value: string | null): AdminLoginErrorCode | null;
export function getAdminLoginErrorPresentation(code: AdminLoginErrorCode): {
  title: string;
  message: string;
  action: AdminLoginRecoveryAction;
};
export function buildAdminSignInPath(
  nextPath: string,
  options?: { forceAccountSelection?: boolean },
): string;
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test apps/admin/lib/admin-login-contract.test.ts`

Expected: failure because the contract module does not exist.

- [ ] **Step 3: Implement the minimum pure contract**

Keep this file free of `server-only`, React, Next.js, and database imports so both route handlers and the client login screen can use it.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `node --test apps/admin/lib/admin-login-contract.test.ts`

Expected: all contract tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/lib/admin-login-contract.ts apps/admin/lib/admin-login-contract.test.ts
git commit -m "test(admin): define login error contract"
```

## Task 2: Make Logto authorization options explicit and subject-only

**Files:**

- Create: `apps/admin/lib/logto-authorize-options.ts`
- Modify: `apps/admin/lib/logto-admin-auth.ts`
- Modify: `apps/admin/app/api/auth/sign-in/route.ts`
- Create: `apps/admin/lib/logto-authorize-options.test.ts`

- [ ] **Step 1: Write failing authorization-option tests**

Create a pure helper in `logto-authorize-options.ts` and import it from the server-only auth module:

```ts
export interface LogtoAuthorizeOptions {
  prompt?: "login";
  firstScreen?: "reset_password" | "identifier:sign-in";
  identifier?: string[];
  loginHint?: string | null;
  uiLocales?: string;
}

export function applyLogtoAuthorizeOptions(url: URL, options?: LogtoAuthorizeOptions): URL;
```

Assert the exact parameter names `prompt`, `first_screen`, `identifier`, `login_hint`, and `ui_locales`. Assert that absent options add nothing.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test apps/admin/lib/logto-authorize-options.test.ts`

Expected: failure because the helper and options are not implemented.

- [ ] **Step 3: Implement authorization options**

Change `buildLogtoAuthorizeUrl(nextPath, options?)` to apply the options after the required OIDC parameters. In the sign-in route, map `force_account=1` to `prompt: "login"`. Preserve the existing reset-password and email hint behavior.

- [ ] **Step 4: Remove callback email authorization**

Change the membership SQL predicate from subject-or-email to subject only:

```sql
where ap.provider = 'logto'
  and coalesce(ap.status, 'active') = 'active'
  and ap.subject = $2
```

Change `findLegacyAdminBridgeByLogtoSubject` so its authorization decision receives only `providerSubject`. Email may still populate the session display after authorization, but it must never select a principal.

- [ ] **Step 5: Redact token exchange errors**

Replace the token response-body error with a status-only error. Do not include upstream body text in the thrown message or logs.

- [ ] **Step 6: Run focused tests and build**

```bash
node --test apps/admin/lib/logto-authorize-options.test.ts
npm run build --workspace @celebix/admin
```

Expected: tests pass and the admin production build succeeds.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/lib/logto-authorize-options.ts apps/admin/lib/logto-admin-auth.ts apps/admin/app/api/auth/sign-in/route.ts apps/admin/lib/logto-authorize-options.test.ts
git commit -m "fix(admin): enforce subject-bound Logto sign-in"
```

## Task 3: Classify callback stages without weakening authorization

**Files:**

- Create: `apps/admin/lib/admin-callback-flow.ts`
- Create: `apps/admin/lib/admin-callback-flow.test.ts`
- Modify: `apps/admin/lib/logto-admin-auth.ts`

- [ ] **Step 1: Write failing callback-flow tests**

Use dependency injection and generic result types so the flow is testable without Next.js, cookies, network, or PostgreSQL. Cover:

- successful exchange, userinfo lookup, and membership lookup;
- token exchange exception -> `token_exchange_failed`;
- userinfo exception or missing `sub` -> `identity_lookup_failed`;
- membership query infrastructure exception -> `membership_unavailable`;
- successful membership lookup returning `null` -> `not_assigned`.

The flow shape must be:

```ts
export async function resolveAdminCallback<TTokens, TIdentity, TMembership>(input: {
  exchangeCode: () => Promise<TTokens>;
  fetchIdentity: (tokens: TTokens) => Promise<TIdentity>;
  readSubject: (identity: TIdentity) => string | null;
  findMembership: (subject: string) => Promise<TMembership | null>;
}): Promise<
  | { ok: true; tokens: TTokens; identity: TIdentity; membership: TMembership }
  | { ok: false; error: Exclude<AdminLoginErrorCode, "provider_disabled" | "invalid_callback" | "session_write_failed"> }
>;
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test apps/admin/lib/admin-callback-flow.test.ts`

Expected: failure because the callback flow module does not exist.

- [ ] **Step 3: Implement the pure callback flow**

Each dependency call gets its own `try/catch`. Return typed error codes; do not log in the pure helper.

- [ ] **Step 4: Preserve legacy-table compatibility but surface real outages**

In `logto-admin-auth.ts`, distinguish a missing legacy table from a database connectivity/query failure. Missing new membership tables may fall back to legacy tables; a real query failure must propagate and become `membership_unavailable`. If both schema generations are absent, treat the store auth schema as unavailable rather than treating every user as merely unassigned.

- [ ] **Step 5: Run the callback tests**

Run: `node --test apps/admin/lib/admin-callback-flow.test.ts`

Expected: all callback stage tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/lib/admin-callback-flow.ts apps/admin/lib/admin-callback-flow.test.ts apps/admin/lib/logto-admin-auth.ts
git commit -m "fix(admin): classify Logto callback failures"
```

## Task 4: Refactor the callback route and session write boundary

**Files:**

- Modify: `apps/admin/app/callback/route.ts`
- Create: `apps/admin/app/callback/route.contract.test.ts`

- [ ] **Step 1: Write a failing route contract test**

Read the route source and assert that it:

- uses `resolveAdminCallback`;
- no longer emits `login_failed` or `unauthorized` for callback failures;
- preserves the sanitized `next` path on the login error redirect;
- uses `randomUUID()` for a correlation ID;
- never logs tokens or the authorization code.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test apps/admin/app/callback/route.contract.test.ts`

Expected: failure against the current generic callback catch.

- [ ] **Step 3: Implement typed route handling**

Validate state and code first. Execute `resolveAdminCallback`. On a failure, clear role and Logto cookies and redirect to:

```text
/admin/login?error={typed-code}&next={sanitized-path}&cid={correlation-id}
```

Wrap only session payload construction and cookie writes in the final session boundary; its failure maps to `session_write_failed`.

- [ ] **Step 4: Add redacted structured logging**

Log only `event`, `errorCode`, `storeSlug`, and `correlationId`. Error objects may contribute a class/name but never raw response bodies or credentials.

- [ ] **Step 5: Run route contract, callback, and contract tests**

```bash
node --test apps/admin/app/callback/route.contract.test.ts
node --test apps/admin/lib/admin-callback-flow.test.ts
node --test apps/admin/lib/admin-login-contract.test.ts
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/app/callback/route.ts apps/admin/app/callback/route.contract.test.ts
git commit -m "fix(admin): return recoverable callback errors"
```

## Task 5: Build the store-branded login experience

**Files:**

- Modify: `apps/admin/app/api/public/runtime/route.ts`
- Modify: `apps/admin/app/admin/login/page.tsx`
- Create: `apps/admin/app/admin/login/page.contract.test.ts`

- [ ] **Step 1: Write a failing login-page contract test**

Assert that the page source includes:

- `parseAdminLoginErrorCode` and `getAdminLoginErrorPresentation`;
- an explicit “Başka hesapla giriş yap” action using `force_account=1`;
- store name and logo from `/api/public/runtime`;
- “Celebix altyapısıyla korunuyor” as secondary trust copy;
- no raw error query rendering;
- legacy Supabase email/password fields remain reachable when the provider is not Logto.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test apps/admin/app/admin/login/page.contract.test.ts`

Expected: failure against the current generic card.

- [ ] **Step 3: Expose safe public branding**

Extend `/api/public/runtime` with only `logoUrl`. Resolve it through `getStoreInfo()` and `resolveAdminAssetUrl()`, catch storage/database failures, and fall back to `null`. Do not expose store email, phone, address, database URL, or secrets.

- [ ] **Step 4: Implement the responsive login page**

Use a calm two-column desktop layout that collapses to one column on mobile:

- store logo or letter monogram;
- store name as the primary brand;
- concise panel purpose copy;
- one primary Logto sign-in button;
- typed inline error panel with the correct retry or account-switch action;
- small Celebix trust line;
- no decorative floating controls and no callback error toast loop.

Keep `/api/admin/me` session detection and the existing safe `next` redirect.

- [ ] **Step 5: Run contract test and production build**

```bash
node --test apps/admin/app/admin/login/page.contract.test.ts
npm run build --workspace @celebix/admin
git diff --check
```

Expected: test and build pass; no whitespace errors.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/app/api/public/runtime/route.ts apps/admin/app/admin/login/page.tsx apps/admin/app/admin/login/page.contract.test.ts
git commit -m "feat(admin): add store-branded secure login"
```

## Task 6: Add an exact-match Logto admin identity service in owner

**Files:**

- Modify: `apps/owner/lib/logto-provisioning.ts`
- Create: `apps/owner/lib/logto-admin-identity.ts`
- Create: `apps/owner/lib/logto-admin-identity.test.ts`

- [ ] **Step 1: Write failing identity-service tests**

Use a fake Management API transport. Cover:

- `GET /users` uses `search.primaryEmail`, `mode.primaryEmail=exact`, `page=1`, and `page_size=2`;
- returned users are still filtered by normalized exact email locally;
- an existing identity is reused and no password mutation request occurs;
- a new identity without an eight-character password is rejected before the API call;
- a new identity is created with `POST /users` body `{ primaryEmail, name, password }`;
- Management API errors do not expose response bodies or tokens.

The service contract must be:

```ts
export interface LogtoManagementTransport {
  request<T>(pathname: string, init?: RequestInit): Promise<T>;
}

export interface LogtoAdminIdentity {
  subject: string;
  email: string;
  fullName: string | null;
  created: boolean;
}

export async function findOrCreateLogtoAdminIdentity(input: {
  email: string;
  fullName?: string;
  password?: string;
}, transport: LogtoManagementTransport): Promise<LogtoAdminIdentity>;
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test apps/owner/lib/logto-admin-identity.test.ts`

Expected: failure because the identity service does not exist.

- [ ] **Step 3: Export a narrow Management API transport**

Expose an authenticated `requestLogtoManagementApi(pathname, init?)` wrapper from `logto-provisioning.ts`. Reuse the existing M2M token cache. Return parsed JSON only on success and throw status/method/path-only errors. Keep `logto-admin-identity.ts` free of `server-only`; production code injects this authenticated wrapper while tests inject a fake transport.

- [ ] **Step 4: Implement exact lookup and idempotent creation**

Use the official Logto endpoints:

- `GET /api/users` for exact normalized email lookup;
- `POST /api/users` for creation with a preset temporary password.

Do not call `PATCH /api/users/{userId}/password` for an existing identity. The official API supports it, but using it during a second-store assignment would unexpectedly revoke the manager's known password.

- [ ] **Step 5: Run identity tests**

Run: `node --test apps/owner/lib/logto-admin-identity.test.ts`

Expected: all pass.

- [ ] **Step 6: Commit owner-only files**

```bash
git add apps/owner/lib/logto-provisioning.ts apps/owner/lib/logto-admin-identity.ts apps/owner/lib/logto-admin-identity.test.ts
git commit -m "feat(owner): provision reusable Logto admins"
```

## Task 7: Add transactional per-store membership persistence

**Files:**

- Create: `apps/owner/lib/logto-store-admin-membership.ts`
- Create: `apps/owner/lib/logto-store-admin-membership.test.ts`
- Create: `apps/owner/lib/postgres-transaction.ts`
- Create: `apps/owner/lib/postgres-transaction.test.ts`
- Modify: `apps/owner/lib/control-plane.ts`

- [ ] **Step 1: Write failing membership tests**

Use a fake SQL transaction and assert that assignment:

- upserts `auth_principals` by `(provider, subject)` with `provider='logto'` and `status='active'`;
- stores email and display metadata but never a password;
- deactivates any other active role rows for that principal and store;
- upserts the selected `(principal_id, store_slug, role)` membership as active;
- writes `taskDefinition` only to membership metadata;
- propagates a SQL failure without continuing to later statements;
- produces the same final state when repeated.

In `postgres-transaction.test.ts`, use a fake client to assert exact `BEGIN`, `COMMIT`, and error-path `ROLLBACK` order.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test apps/owner/lib/logto-store-admin-membership.test.ts apps/owner/lib/postgres-transaction.test.ts`

Expected: failure because the membership service does not exist.

- [ ] **Step 3: Implement the pure transaction body**

The persistence contract must accept an injected query function and return the local principal UUID:

```ts
export async function persistLogtoStoreAdminMembership(input: {
  query: <TRow extends Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<TRow[]>;
  subject: string;
  email: string;
  fullName: string | null;
  storeSlug: string;
  role: StoreAdminRole;
  taskDefinition: string | null;
}): Promise<{ principalId: string }>;
```

- [ ] **Step 4: Add a real transaction boundary**

Implement the tested `runPostgresTransaction(client, callback)` helper in `postgres-transaction.ts`. In `control-plane.ts`, add `withLightPostgresStoreTransaction(store, callback)` next to the existing light-Postgres query helper. It must open one `pg.Client`, delegate transaction ordering to the tested helper, and close the client in `finally`.

- [ ] **Step 5: Run membership tests**

Run: `node --test apps/owner/lib/logto-store-admin-membership.test.ts apps/owner/lib/postgres-transaction.test.ts`

Expected: all pass.

- [ ] **Step 6: Commit owner-only files**

```bash
git add apps/owner/lib/logto-store-admin-membership.ts apps/owner/lib/logto-store-admin-membership.test.ts apps/owner/lib/postgres-transaction.ts apps/owner/lib/postgres-transaction.test.ts apps/owner/lib/control-plane.ts
git commit -m "feat(owner): persist store-scoped admin memberships"
```

## Task 8: Route owner admin assignment by store architecture

**Files:**

- Create: `apps/owner/lib/store-admin-assignment.ts`
- Modify: `apps/owner/lib/control-plane.ts`
- Modify: `apps/owner/app/api/stores/[slug]/admins/route.ts`
- Modify: `apps/owner/components/CreateStoreAdminForm.tsx`
- Modify: `apps/owner/app/stores/[slug]/page.tsx`
- Create: `apps/owner/lib/store-admin-assignment.test.ts`

- [ ] **Step 1: Write failing assignment-policy tests**

Create and test a pure routing policy in `store-admin-assignment.ts` so the Node test never imports the server-only control plane:

```ts
export function resolveStoreAdminAssignmentMode(store: Pick<StoreConfig, "databaseMode" | "authProvider">):
  | "logto_light_postgres"
  | "supabase_legacy";
```

Assert that `light_postgres + logto` never calls the Supabase service client and `full_supabase` remains on the legacy path.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test apps/owner/lib/store-admin-assignment.test.ts`

Expected: failure because the routing policy does not exist.

- [ ] **Step 3: Integrate Logto assignment**

At the top of `createOrAssignStoreAdmin`, after owner authorization and store-config resolution:

1. normalize email/name/task fields;
2. for `logto_light_postgres`, find or create the Logto identity;
3. persist membership inside the store transaction;
4. write the existing owner audit event without password data;
5. return the Logto subject as `userId` and the `created` flag;
6. keep the existing Supabase path unchanged for legacy stores.

If membership persistence fails after a new Logto identity was created, leave the identity unassigned and return an error. This is safe and retryable; do not delete the central identity as compensation.

- [ ] **Step 4: Fix light-Postgres admin listing and counts**

Replace `profiles/auth.users` reads for light-Postgres stores with active joins between `auth_principals` and `auth_store_memberships`, filtered by the store slug. Preserve the existing `StoreAdminSummary` response shape.

- [ ] **Step 5: Make password conditional in route and UI**

The route accepts optional `password`. Pass the resolved assignment mode from `apps/owner/app/stores/[slug]/page.tsx` into the form. For Logto stores, the owner form labels it “Yeni hesap için geçici şifre” and explains that an existing central account's password is not changed. The identity service enforces the password only when it must create a new Logto user. Legacy Supabase stores retain the existing required-password behavior.

- [ ] **Step 6: Run policy and owner tests**

```bash
node --test apps/owner/lib/store-admin-assignment.test.ts
node --test apps/owner/lib/logto-admin-identity.test.ts
node --test apps/owner/lib/logto-store-admin-membership.test.ts
node --test apps/owner/lib/postgres-transaction.test.ts
```

Expected: all pass.

- [ ] **Step 7: Commit owner-only files**

```bash
git add apps/owner/lib/store-admin-assignment.ts apps/owner/lib/control-plane.ts apps/owner/app/api/stores/'[slug]'/admins/route.ts apps/owner/components/CreateStoreAdminForm.tsx apps/owner/app/stores/'[slug]'/page.tsx apps/owner/lib/store-admin-assignment.test.ts
git commit -m "feat(owner): assign one admin to multiple stores"
```

## Task 9: Verify admin and owner builds without hiding baseline debt

**Files:**

- Modify only if a new error is proven to originate from Tasks 1-8.

- [ ] **Step 1: Run every focused test**

```bash
node --test \
  apps/admin/lib/admin-login-contract.test.ts \
  apps/admin/lib/logto-authorize-options.test.ts \
  apps/admin/lib/admin-callback-flow.test.ts \
  apps/admin/app/callback/route.contract.test.ts \
  apps/admin/app/admin/login/page.contract.test.ts \
  apps/owner/lib/logto-admin-identity.test.ts \
  apps/owner/lib/logto-store-admin-membership.test.ts \
  apps/owner/lib/postgres-transaction.test.ts \
  apps/owner/lib/store-admin-assignment.test.ts
```

Expected: all pass.

- [ ] **Step 2: Run production builds**

```bash
npm run build --workspace @celebix/admin
npm run build --workspace @celebix/owner
```

Expected: both exit 0.

- [ ] **Step 3: Run typechecks and compare with baseline**

```bash
npm run typecheck --workspace @celebix/admin
npm run typecheck --workspace @celebix/owner
```

The admin branch has pre-existing type errors outside this scope. No new error may reference a changed auth/login file. Owner must not gain a new type error. Record exact remaining baseline errors in the handoff.

- [ ] **Step 4: Run repository hygiene checks**

```bash
git diff --check
git status --short
git log --oneline --max-count=12
```

Expected: no uncommitted generated artifacts and all changes split by admin/owner responsibility.

## Task 10: Prepare separate live branches safely

**Files:** Git operations only.

- [ ] **Step 1: Push the shared admin branch**

```bash
git push -u origin codex/admin-multistore-login-security
```

- [ ] **Step 2: Record owner-only commit SHAs**

Identify the commits beginning with:

- `feat(owner): provision reusable Logto admins`
- `feat(owner): persist store-scoped admin memberships`
- `feat(owner): assign one admin to multiple stores`

- [ ] **Step 3: Create owner integration branch from the live owner branch**

```bash
git fetch origin deploy/owner
git switch -c codex/owner-logto-admin-memberships origin/deploy/owner
```

- [ ] **Step 4: Cherry-pick only owner commits**

Cherry-pick the three recorded owner-only commits in their original order. Do not cherry-pick admin commits or the Hemenaku UI history.

- [ ] **Step 5: Re-run owner verification on the real owner base**

```bash
node --test \
  apps/owner/lib/logto-admin-identity.test.ts \
  apps/owner/lib/logto-store-admin-membership.test.ts \
  apps/owner/lib/postgres-transaction.test.ts \
  apps/owner/lib/store-admin-assignment.test.ts
npm run build --workspace @celebix/owner
git diff --check origin/deploy/owner...HEAD
```

- [ ] **Step 6: Push owner integration branch**

```bash
git push -u origin codex/owner-logto-admin-memberships
```

## Task 11: Deploy shared admin, then owner

**Files:** External deployment state; no source edits unless verification proves a defect.

- [ ] **Step 1: Record rollback points**

Before deployment record:

- current Hemenaku image digest and container ID;
- current owner commit SHA and Coolify deployment ID;
- current HTTP status and redirect location for `/admin/login` and `/api/auth/sign-in?next=%2Fadmin`.

- [ ] **Step 2: Build and publish the Hemenaku admin image**

Use the existing Celebix build-server/GHCR pipeline to build `codex/admin-multistore-login-security` and publish `ghcr.io/celebixco/hemenaku-admin:production`. Verify the registry digest changed before touching Coolify.

- [ ] **Step 3: Redeploy Hemenaku in Coolify**

Force-deploy application `krwcu6xj870bb3lzfsbz9bxl`. Wait for healthy state and confirm the running image digest equals the published digest.

- [ ] **Step 4: Verify Hemenaku login before owner rollout**

Anonymous checks must show:

- `/admin/login` returns 200;
- `/api/public/runtime` returns `name` and a safe nullable `logoUrl`;
- `/api/auth/sign-in?next=%2Fadmin` returns 307 to `auth.celebix.co`;
- `/api/auth/sign-in?next=%2Fadmin&force_account=1` includes `prompt=login` in the OIDC authorization request.

- [ ] **Step 5: Fast-forward owner delivery**

After the owner integration branch build passes, update `deploy/owner` only by fast-forwarding or cherry-picking the verified three owner commits. Never overwrite the live owner branch with the admin branch.

- [ ] **Step 6: Deploy and smoke-test owner**

Wait for the Coolify owner application to report healthy. Confirm the store detail page loads and existing `full_supabase` admin forms remain available.

## Task 12: Live multi-store authorization acceptance

**Files:** External test data only.

- [ ] **Step 1: Select three healthy Logto stores**

Use Hemenaku plus two healthy configured Atlas admin runtimes. One Atlas store is assigned; the other remains unassigned. Do not use a store whose DNS, callback URI, or runtime health is failing.

- [ ] **Step 2: Create one temporary central manager identity**

Use the owner panel to create `codex.multistore.20260730@celebix.co` on Hemenaku with a freshly generated temporary password held only for the test session. Assign the same email to the selected second store. Confirm the second assignment reports `created: false` and does not change the password.

- [ ] **Step 3: Verify allowed store A**

In a clean browser context, sign in to Hemenaku and confirm `/admin` loads, `/api/admin/me` returns 200, and the role matches the assigned role.

- [ ] **Step 4: Verify allowed store B with the same Logto session**

Open the assigned Atlas admin. Confirm callback succeeds and `/admin` loads without re-provisioning or callback failure.

- [ ] **Step 5: Verify denied store C**

Open the unassigned Atlas admin with the same central session. Confirm it returns to `/admin/login?error=not_assigned`, displays store-specific denial copy, and never creates an admin session cookie.

- [ ] **Step 6: Verify account switching and logout**

From the denial state, use “Başka hesapla giriş yap” and confirm Logto prompts for an account. Then log out from an allowed store and confirm the admin session is cleared and a later sign-in still succeeds.

- [ ] **Step 7: Verify responsive layout**

Inspect the login page at desktop and mobile widths. Confirm logo/name, primary action, typed error, and trust copy remain visible without horizontal scrolling.

- [ ] **Step 8: Review production logs**

Confirm successful and denied callbacks include correlation IDs and error codes but contain no password, authorization code, access token, ID token, or cookie value.

- [ ] **Step 9: Remove temporary access**

Deactivate the temporary test memberships in the selected store databases after acceptance. The central Logto identity may remain without active memberships for audit/retry safety, or be removed separately through an explicitly approved cleanup action.

## Task 13: Final verification and handoff

- [ ] **Step 1: Re-run public smoke checks after cleanup**

Confirm Hemenaku login, public runtime, sign-in redirect, and owner health still pass.

- [ ] **Step 2: Capture final release evidence**

Record:

- admin branch and commit SHA;
- owner branch and commit SHA;
- GHCR digest;
- Coolify deployment IDs;
- focused test counts;
- build results;
- allowed A, allowed B, denied C browser outcomes;
- any unchanged pre-existing typecheck debt.

- [ ] **Step 3: Roll back if an acceptance condition fails**

If admin callback/session behavior fails, restore the recorded Hemenaku image digest and redeploy. If owner assignment fails, restore the recorded owner commit and redeploy. Do not weaken membership checks as a workaround.

## Official Logto references used by this plan

- Exact user search: `https://docs.logto.io/user-management/advanced-user-search`
- Create user: `https://openapi.logto.io/operation/operation-createuser`
- Update password API, intentionally not used for existing identities during assignment: `https://openapi.logto.io/operation/operation-updateuserpassword`
- Invitation-only and pre-provisioned user guidance: `https://docs.logto.io/end-user-flows/sign-up-and-sign-in/disable-user-registration`
