# Merchant Admin Account Provisioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fake administrator-invite screen with a real, tenant-isolated Logto identity plus PostgreSQL membership lifecycle that produces one-time credentials without email delivery.

**Architecture:** A PostgreSQL 16 authority layer owns staff limits, actor/target role rules, memberships, idempotency, audit evidence, and store-scoped session revocation. A server-only bounded Logto Management API client owns provider identity/password/session operations. A customer-panel saga composes both authorities, while dedicated HTTP handlers derive tenant and actor exclusively from the authenticated panel request and return secrets only in a no-store one-time response.

**Tech Stack:** PostgreSQL 16 SQL functions and RLS, TypeScript, Node test runner, Next.js App Router, React, CSS Modules, `pg`, Logto Management API over bounded `fetch`.

## Global Constraints

- `apps/admin/**` remains byte-for-byte unchanged.
- No local password database, invitation email, second identity provider, iframe, reverse proxy, migration rewrite, production activation, deployment, merge, or credential mutation.
- Browser input never supplies store, tenant, principal, membership, provider subject, or authorization authority.
- Temporary passwords are generated from 24 random bytes, shown once, and never persisted, logged, cached, serialized into RSC, stored in browser storage, placed in URLs, cookies, telemetry, or audit rows.
- Existing callback verification continues requiring provider `email_verified === true`; staging activation remains blocked until a separately authorized disposable live proof succeeds.
- `store_owner` may manage `admin`, `editor`, and `analyst`; `admin` may manage only `editor` and `analyst`; `editor` and `analyst` cannot manage accounts.
- Self-mutation, cross-store mutation, final-owner downgrade/revoke, stale writes, and committed `limits.staff` overflow fail closed in PostgreSQL and the service layer.
- Only exact HTTPS configured Logto authority endpoints are called; redirects, malformed media types, oversized responses, and unknown provider outcomes fail closed.
- Customer-panel and Owner regressions must remain green; staging deployment is a separately authorized final gate.

## File Map

### Durable authority

- Create `apps/owner/scripts/sql/saas/202608050087_merchant_administrator_accounts.up.sql`: tables, constraints, RLS, grants, and security-definer functions for list/reserve/finalize/recover/role/revoke/password-reset operations.
- Create `apps/owner/scripts/sql/saas/202608050087_merchant_administrator_accounts.down.sql`: exact rollback of migration 087 only.
- Create `apps/owner/scripts/sql/saas/202608050087_merchant_administrator_accounts.assertions.sql`: catalog, privilege, function, and forbidden-secret assertions.
- Create `apps/owner/scripts/sql/saas/phase4h-merchant-administrator-accounts-manifest.json`: ordered migration artifact checksums.
- Create `tests/saas-phase3/merchant-administrator-accounts/postgres-harness.mjs`: disposable PostgreSQL 16 apply/concurrency/RLS/backup/restore/rollback/reapply/cleanup proof.

### Shared repository

- Create `packages/saas-data/src/merchant-administrators/types.ts`: immutable public repository contracts.
- Create `packages/saas-data/src/merchant-administrators/errors.ts`: fixed safe error taxonomy.
- Create `packages/saas-data/src/merchant-administrators/validation.ts`: canonical names, roles, opaque targets, operation IDs, and fingerprints.
- Create `packages/saas-data/src/merchant-administrators/repository.ts`: PostgreSQL repository with transaction-state and commit-unknown recovery.
- Create `packages/saas-data/src/merchant-administrators/repository.test.ts`: query mapping, authority, and unknown-outcome tests.
- Create `packages/saas-data/src/merchant-administrators/index.ts`: narrow exports.
- Modify `packages/saas-data/src/index.ts:1-end`: export the new module.

### Provider and saga

- Create `apps/customer-panel/lib/merchant-identity-provider/config.ts`: strict, independent server-only provider authority parser.
- Create `apps/customer-panel/lib/merchant-identity-provider/logto-client.ts`: bounded Management API client.
- Create `apps/customer-panel/lib/merchant-identity-provider/config.test.ts` and `logto-client.test.ts`: parser and transport proofs.
- Create `apps/customer-panel/lib/server-merchant-administrators/runtime.ts`: immutable runtime registration/resolution.
- Create `apps/customer-panel/lib/server-merchant-administrators/runtime.test.ts`: disabled/default/approved-staging isolation tests.
- Create `apps/customer-panel/lib/merchant-administrator-service/service.ts`: provisioning and lifecycle saga.
- Create `apps/customer-panel/lib/merchant-administrator-service/service.test.ts`: role, idempotency, provider unknown, commit unknown, password reset, and no-secret tests.
- Modify `apps/customer-panel/lib/server-panel-access/postgres-runtime.ts:1-end`: register repository and service only when the independent provider profile is valid.

### HTTP and UI

- Create `apps/customer-panel/lib/merchant-administrator-http/handler.ts`: exact request authority, DTO projection, no-store responses.
- Create `apps/customer-panel/lib/merchant-administrator-http/default.ts`: fail-closed default handler resolver.
- Create `apps/customer-panel/lib/merchant-administrator-http/handler.test.ts`: positive/negative HTTP matrix.
- Create `apps/customer-panel/app/api/settings/administrators/route.ts`: GET/POST mount.
- Create `apps/customer-panel/app/api/settings/administrators/[membershipId]/role/route.ts`: PATCH mount.
- Create `apps/customer-panel/app/api/settings/administrators/[membershipId]/revoke/route.ts`: POST mount.
- Create `apps/customer-panel/app/api/settings/administrators/[membershipId]/reset-temporary-password/route.ts`: POST mount.
- Create `apps/customer-panel/lib/merchant-administrator-ui/client.ts` and `client.test.ts`: safe browser DTO client with no persistence.
- Create `apps/customer-panel/components/settings/MerchantAdministratorConsole.tsx`: real list/create/role/revoke/reset UI and one-time credential dialog.
- Create `apps/customer-panel/components/settings/MerchantAdministratorConsole.module.css` and `.test.ts`: responsive/accessibility rules.
- Modify `apps/customer-panel/app/settings/administrators/page.tsx:1-end`: render the real console.
- Delete `apps/customer-panel/app/settings/administrators/new/page.tsx` and `apps/customer-panel/app/settings/administrators/[recordId]/edit/page.tsx`: remove fake generic record flows.
- Modify `apps/customer-panel/lib/routes.test.ts` only where exact administrator route export assertions become stale.
- Modify `apps/customer-panel/package.json:test`: include the new test directories without dependency changes.
- Create `tests/saas-phase3/merchant-administrator-accounts/static-security.test.mjs`: source-scope and forbidden-secret/authority scans.

---

### Task 1: Durable merchant-administrator authority

**Files:**
- Create the five durable-authority files listed above.

**Interfaces:**
- Consumes: existing `saas.stores`, `saas.principals`, `saas.memberships`, committed tenant snapshots, panel session tables, audit conventions, and app/identity roles.
- Produces: `list_merchant_administrators`, `reserve_merchant_administrator_provisioning`, `mark_merchant_administrator_provider_identity`, `finalize_merchant_administrator_provisioning`, `recover_merchant_administrator_provisioning`, `change_merchant_administrator_role`, `revoke_merchant_administrator_access`, `reserve_merchant_administrator_password_reset`, and `finalize_merchant_administrator_password_reset`.

- [ ] **Step 1: Write the 24-scenario failing PostgreSQL harness**

```js
scenario("same store and operation id reserve exactly once", async () => {
  const [left, right] = await Promise.all([
    reserveAsOwner({ operationId, fingerprint }),
    reserveAsOwner({ operationId, fingerprint }),
  ]);
  assert.equal(new Set([left.operationId, right.operationId]).size, 1);
});

scenario("staff limit race admits only one final membership", async () => {
  const results = await Promise.allSettled([finalize(first), finalize(second)]);
  assert.equal(results.filter((entry) => entry.status === "fulfilled").length, 1);
});

scenario("revoke closes only target store panel sessions", async () => {
  await revokeAsOwner(targetMembership);
  assert.equal(await activeSessions(targetMembership.storeId), 0);
  assert.equal(await activeSessions(otherStore.id), 1);
});
```

- [ ] **Step 2: Verify RED**

Run: `node tests/saas-phase3/merchant-administrator-accounts/postgres-harness.mjs`

Expected: FAIL before scenario 1 because migration 087 and its manifest are absent.

- [ ] **Step 3: Implement migration 087 minimally**

```sql
create table saas.merchant_admin_provisioning_operations (
  id uuid primary key,
  store_id uuid not null references saas.stores(id),
  requested_by_membership_id uuid not null references saas.memberships(id),
  idempotency_key text not null,
  payload_fingerprint text not null,
  normalized_email text not null,
  username text not null,
  requested_role text not null check (requested_role in ('admin','editor','analyst')),
  status text not null check (status in ('reserved','provider_created','committed','known_failed','reconciliation_required')),
  provider_subject text,
  principal_id uuid references saas.principals(id),
  membership_id uuid references saas.memberships(id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  committed_at timestamptz,
  unique (store_id, idempotency_key)
);

create table saas.merchant_administrator_mutation_operations (
  id uuid primary key,
  store_id uuid not null references saas.stores(id),
  requested_by_membership_id uuid not null references saas.memberships(id),
  target_membership_id uuid not null references saas.memberships(id),
  operation_kind text not null check (operation_kind in ('role_change','revoke','password_reset')),
  payload_fingerprint text not null,
  status text not null check (status in ('reserved','provider_updated','committed','known_failed','reconciliation_required')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  committed_at timestamptz,
  unique (store_id, id)
);
```

Every function must obtain the store/actor from trusted session context, row-lock actor/target/store, recompute role and last-owner constraints, and return only opaque membership identifiers plus safe projections. The list query joins an operation profile when present and falls back to principal email for pre-existing owner memberships; no fabricated username is returned.

- [ ] **Step 4: Add assertions, exact manifest checksums, rollback, and run GREEN**

Run: `shasum -a 256 apps/owner/scripts/sql/saas/202608050087_merchant_administrator_accounts.up.sql apps/owner/scripts/sql/saas/202608050087_merchant_administrator_accounts.down.sql apps/owner/scripts/sql/saas/202608050087_merchant_administrator_accounts.assertions.sql`

Run: `node tests/saas-phase3/merchant-administrator-accounts/postgres-harness.mjs`

Expected: `24/24 PASS`; PostgreSQL 16 apply, catalog, privilege/RLS negatives, concurrency, backup/restore, rollback/reapply, and cleanup all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/owner/scripts/sql/saas/202608050087_* apps/owner/scripts/sql/saas/phase4h-merchant-administrator-accounts-manifest.json tests/saas-phase3/merchant-administrator-accounts/postgres-harness.mjs
git commit -m "feat(saas): add durable merchant administrator authority"
```

### Task 2: Typed PostgreSQL repository

**Files:**
- Create `packages/saas-data/src/merchant-administrators/*` and modify `packages/saas-data/src/index.ts:1-end`.

**Interfaces:**
- Consumes: Task 1 SQL functions and existing `TenantContext`, transaction, pool, and safe error patterns.
- Produces:

```ts
export interface MerchantAdministratorRepository {
  listForTenant(context: TenantContext): Promise<MerchantAdministratorList>;
  reserveProvisioning(context: TenantContext, actor: PanelActor, input: CanonicalCreateMerchantAdministratorInput): Promise<ProvisioningReservation>;
  recordProviderIdentity(reservation: ProvisioningReservation, identity: ProvisionedIdentity): Promise<void>;
  finalizeProvisioning(reservation: ProvisioningReservation, identity: ProvisionedIdentity): Promise<CommittedAdministratorMembership>;
  recoverProvisioning(operationId: string): Promise<ProvisioningRecovery>;
  changeRole(context: TenantContext, actor: PanelActor, input: ChangeAdministratorRoleInput): Promise<CommittedAdministratorMembership>;
  revokeAccess(context: TenantContext, actor: PanelActor, input: RevokeAdministratorAccessInput): Promise<void>;
  reservePasswordReset(context: TenantContext, actor: PanelActor, input: ResetAdministratorPasswordInput): Promise<PasswordResetReservation>;
  finalizePasswordReset(reservation: PasswordResetReservation): Promise<void>;
}
```

- [ ] **Step 1: Write 14 failing repository tests**

```ts
test("commit unknown performs one read-only recovery and never a second write", async () => {
  const repository = createRepositoryWithScript([commitUnknown(), committedRecoveryRow()]);
  const result = await repository.finalizeProvisioning(reservation, identity);
  assert.equal(result.membershipId, expectedMembershipId);
  assert.deepEqual(repository.calls.map((call) => call.kind), ["write", "read"]);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --experimental-strip-types --test packages/saas-data/src/merchant-administrators/repository.test.ts`

Expected: FAIL with module-not-found for `merchant-administrators/repository.ts`.

- [ ] **Step 3: Implement immutable types, canonical validation, safe errors, and repository**

```ts
export class MerchantAdministratorAuthorityError extends Error {
  constructor(readonly code: MerchantAdministratorErrorCode) {
    super(code);
    this.name = "MerchantAdministratorAuthorityError";
  }
}

export const canonicalizeCreateAdministrator = (input: CreateMerchantAdministratorInput) =>
  Object.freeze({
    displayName: requireCanonicalDisplayName(input.displayName),
    username: requireCanonicalUsername(input.username),
    normalizedEmail: normalizeVerifiedEmail(input.email),
    role: requireAssignableRole(input.role),
    operationId: requireUuid(input.idempotencyKey),
  });
```

Map each SQL result exhaustively, reject unexpected columns/enums, destroy clients after commit-unknown, and allow only one read-only recovery.

- [ ] **Step 4: Verify GREEN and package regression**

Run: `node --experimental-strip-types --test packages/saas-data/src/merchant-administrators/repository.test.ts`

Expected: `14/14 PASS`.

Run: `npm test --workspace @celebix/saas-data && npm run typecheck --workspace @celebix/saas-data`

Expected: all existing and 14 new tests PASS; typecheck PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/saas-data/src/merchant-administrators packages/saas-data/src/index.ts
git commit -m "feat(saas): add merchant administrator repository"
```

### Task 3: Bounded Logto Management API client

**Files:**
- Create `apps/customer-panel/lib/merchant-identity-provider/{config.ts,config.test.ts,logto-client.ts,logto-client.test.ts}`.

**Interfaces:**
- Consumes: server `fetch`, immutable environment input, official Logto create/list/password/session endpoints.
- Produces:

```ts
export interface MerchantIdentityProvisioner {
  findUserByExactIdentifiers(input: Readonly<{ username: string; normalizedEmail: string }>): Promise<{ kind: "missing" } | ProvisionedIdentity>;
  createUser(input: Readonly<{ displayName: string; username: string; normalizedEmail: string; temporaryPassword: string }>): Promise<ProvisionedIdentity>;
  replacePassword(input: Readonly<{ providerSubject: string; temporaryPassword: string }>): Promise<void>;
  revokeUserSessions(providerSubject: string): Promise<void>;
}
```

- [ ] **Step 1: Write 22 failing parser/transport tests**

```ts
test("unknown create outcome performs exactly one exact read-only lookup", async () => {
  const fetch = scriptedFetch([connectionReset(), exactSingleUserResponse()]);
  const result = await client.createUser(input);
  assert.equal(result.providerSubject, "provider-user");
  assert.deepEqual(fetch.methods(), ["POST", "GET"]);
});

test("identifier split across two subjects fails closed", async () => {
  await assert.rejects(() => client.findUserByExactIdentifiers(input), /merchant_identity_identifier_collision/);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/merchant-identity-provider/*.test.ts`

Expected: FAIL because config/client modules do not exist.

- [ ] **Step 3: Implement strict configuration and transport**

```ts
export type MerchantIdentityAuthority = Readonly<{
  mode: "approved_staging";
  issuer: string;
  managementApiOrigin: string;
  clientId: string;
  clientSecret: string;
  timeoutMs: number;
}>;

const MANAGEMENT_PATHS = Object.freeze({
  users: "/api/users",
  password: (subject: string) => `/api/users/${encodeURIComponent(subject)}/password`,
  sessions: (subject: string) => `/api/users/${encodeURIComponent(subject)}/sessions`,
});
```

Extract a single exact base media type, accept only `application/json`, cap streamed bodies, use `redirect: "manual"`, fatal UTF-8, bounded JSON objects/arrays, memory-only tokens, and fixed secret-free errors. Exact lookup uses `search.primaryEmail`/`mode.primaryEmail=exact`, `search.username`/`mode.username=exact`, and `joint=or`, then verifies returned canonical fields locally.

- [ ] **Step 4: Verify GREEN**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/merchant-identity-provider/*.test.ts`

Expected: `22/22 PASS` including HTTPS/origin/redirect/media-type/body-limit/timeout/collision/unknown-outcome/session-revoke negatives.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-panel/lib/merchant-identity-provider
git commit -m "feat(saas): add bounded logto administrator client"
```

### Task 4: Provisioning and lifecycle saga

**Files:**
- Create `apps/customer-panel/lib/server-merchant-administrators/{runtime.ts,runtime.test.ts}`.
- Create `apps/customer-panel/lib/merchant-administrator-service/{service.ts,service.test.ts}`.
- Modify `apps/customer-panel/lib/server-panel-access/postgres-runtime.ts:1-end`.

**Interfaces:**
- Consumes: Tasks 2 and 3 interfaces plus server-derived `TenantContext` and `PanelActor`.
- Produces `MerchantAdministratorService` methods `list`, `create`, `changeRole`, `revoke`, and `resetTemporaryPassword`.

- [ ] **Step 1: Write 20 failing saga/runtime tests**

```ts
test("staff limit rejection makes zero provider calls", async () => {
  repository.reserveProvisioning.rejectWith("merchant_administrator_staff_limit_reached");
  await assert.rejects(() => service.create(context, actor, input));
  assert.equal(provider.callCount, 0);
});

test("password reset reveals only after provider password and both session authorities succeed", async () => {
  const result = await service.resetTemporaryPassword(context, owner, target);
  assert.equal(result.outcome, "password_reset");
  assert.match(result.temporaryPassword, /^[A-Za-z0-9_-]{32}$/);
  assert.deepEqual(trace, ["reserve", "replacePassword", "revokeProviderSessions", "finalizeAndRevokePanelSessions"]);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/server-merchant-administrators/runtime.test.ts apps/customer-panel/lib/merchant-administrator-service/service.test.ts`

Expected: FAIL because runtime/service modules do not exist.

- [ ] **Step 3: Implement minimal saga**

```ts
const generateTemporaryPassword = (): string => randomBytes(24).toString("base64url");

export const createMerchantAdministratorService = (dependencies: Dependencies): MerchantAdministratorService => ({
  async create(context, actor, rawInput) {
    const input = canonicalizeCreateAdministrator(rawInput);
    const reservation = await dependencies.repository.reserveProvisioning(context, actor, input);
    const password = generateTemporaryPassword();
    const found = await dependencies.provider.findUserByExactIdentifiers(input);
    const identity = found.kind === "missing"
      ? await dependencies.provider.createUser({ ...input, temporaryPassword: password })
      : found;
    await dependencies.repository.recordProviderIdentity(reservation, identity);
    const committed = await dependencies.repository.finalizeProvisioning(reservation, identity);
    return found.kind === "missing"
      ? Object.freeze({ outcome: "created", displayName: input.displayName, username: identity.username, temporaryPassword: password, role: committed.role })
      : Object.freeze({ outcome: committed.alreadyActive ? "already_active" : "membership_added", displayName: identity.displayName, username: identity.username, role: committed.role });
  },
  list: (context, actor) => dependencies.repository.listForTenant(context, actor),
  changeRole: (context, actor, input) => dependencies.repository.changeRole(context, actor, input),
  revoke: (context, actor, input) => dependencies.repository.revokeAccess(context, actor, input),
  async resetTemporaryPassword(context, actor, input) {
    const reservation = await dependencies.repository.reservePasswordReset(context, actor, input);
    const password = generateTemporaryPassword();
    await dependencies.provider.replacePassword({ providerSubject: reservation.providerSubject, temporaryPassword: password });
    await dependencies.provider.revokeUserSessions(reservation.providerSubject);
    await dependencies.repository.finalizePasswordReset(reservation);
    return Object.freeze({ outcome: "password_reset", username: reservation.username, temporaryPassword: password });
  },
});
```

Provider unknown create allows exactly one lookup inside the provider client. DB commit unknown allows exactly one repository recovery. Password-reset unknown never issues a second password write and never reveals a credential; it records `reconciliation_required`. Register the service only when both panel auth and the independent approved-staging provider profile are valid; missing provider configuration disables only administrator mutations, not the panel.

- [ ] **Step 4: Verify GREEN and runtime regression**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/server-merchant-administrators/runtime.test.ts apps/customer-panel/lib/merchant-administrator-service/service.test.ts`

Expected: `20/20 PASS`.

Run: `npm run typecheck --workspace @celebix/customer-panel`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-panel/lib/server-merchant-administrators apps/customer-panel/lib/merchant-administrator-service apps/customer-panel/lib/server-panel-access/postgres-runtime.ts
git commit -m "feat(saas): compose administrator provisioning saga"
```

### Task 5: Dedicated administrator HTTP authority

**Files:**
- Create the four API route files and three `merchant-administrator-http` files listed in the file map.
- Modify `apps/customer-panel/package.json:test` to include the new directory.

**Interfaces:**
- Consumes: `resolvePanelServerAccess(request)` and Task 4 `MerchantAdministratorService`.
- Produces exact no-store JSON routes for list/create/role/revoke/reset.

- [ ] **Step 1: Write 28 failing HTTP tests**

```ts
test("create rejects browser tenant authority before service", async () => {
  const response = await handler(new Request(publicUrl, {
    method: "POST",
    headers: { origin: panelOrigin, cookie: validCookie, "content-type": "application/json" },
    body: JSON.stringify({ ...validInput, storeId: forgedStoreId }),
  }));
  assert.equal(response.status, 400);
  assert.equal(service.calls.length, 0);
});

test("credential response is one-time and uncacheable", async () => {
  const response = await handler(validCreateRequest());
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("pragma"), "no-cache");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
});
```

- [ ] **Step 2: Verify RED**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/merchant-administrator-http/handler.test.ts`

Expected: FAIL because handler module is absent.

- [ ] **Step 3: Implement exact request validation and route mounts**

```ts
const FORBIDDEN_HEADERS = Object.freeze(["authorization", "x-celebix-store-id", "x-celebix-principal-id"]);

const secureJson = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    pragma: "no-cache",
    "referrer-policy": "no-referrer",
  },
});
```

Require exact method/path, canonical same-origin `Origin` for mutations, host-only panel cookie through existing access resolution, exact JSON content type, bounded body, UUID idempotency key, no query, and no request-derived tenant IDs. GET must never return principal UUID, membership UUID, provider subject, password state, or token fields; route targets are separately signed/opaque server projections rather than raw IDs.

- [ ] **Step 4: Verify GREEN and route regression**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/merchant-administrator-http/handler.test.ts`

Expected: `28/28 PASS`.

Run: `npm test --workspace @celebix/customer-panel`

Expected: prior customer-panel total plus 28 new tests PASS, existing skip count unchanged.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-panel/lib/merchant-administrator-http apps/customer-panel/app/api/settings/administrators apps/customer-panel/package.json
git commit -m "feat(saas): expose secure administrator account api"
```

### Task 6: Real administrators UI and one-time credential dialog

**Files:**
- Create UI client/component/style/test files from the file map.
- Modify `apps/customer-panel/app/settings/administrators/page.tsx:1-end` and exactly the two stale administrator route-export assertions in `apps/customer-panel/lib/routes.test.ts`; no other route assertions change.
- Delete the fake generic new/edit pages.

**Interfaces:**
- Consumes: Task 5 safe DTO endpoints.
- Produces an accessible administrators screen with truthful rows, staff usage, role controls, revocation, reset confirmation, and an ephemeral credential dialog.

- [ ] **Step 1: Write 18 failing UI/client tests**

```ts
test("closing credentials permanently clears the temporary password", async () => {
  render(<MerchantAdministratorConsole initialModel={model} client={clientReturningCredential} />);
  await createAccount();
  expect(screen.getByText(temporaryPassword)).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Giriş bilgilerini kapat" }));
  expect(screen.queryByText(temporaryPassword)).toBeNull();
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
});

test("admin cannot render admin or owner assignment options", () => {
  render(<MerchantAdministratorConsole initialModel={adminActorModel} client={client} />);
  expect(screen.queryByRole("option", { name: "Yönetici" })).toBeNull();
  expect(screen.queryByRole("option", { name: "Mağaza sahibi" })).toBeNull();
});
```

- [ ] **Step 2: Verify RED**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/merchant-administrator-ui/client.test.ts apps/customer-panel/components/settings/MerchantAdministratorConsole.test.ts apps/customer-panel/components/settings/MerchantAdministratorConsole.module.test.ts`

Expected: FAIL because UI modules do not exist.

- [ ] **Step 3: Implement minimal truthful UI**

```tsx
const [credential, setCredential] = useState<CreatedMerchantAdministratorCredential | null>(null);

const closeCredential = () => setCredential(null);

return (
  <section aria-labelledby="administrator-heading">
    <header>
      <h1 id="administrator-heading">Yöneticiler</h1>
      <p>{model.usage.active} / {model.usage.limit} aktif hesap</p>
    </header>
    <AdministratorTable rows={model.rows} permissions={model.permissions} />
    {credential ? <OneTimeCredentialDialog credential={credential} onClose={closeCredential} /> : null}
  </section>
);
```

Use 48px minimum targets, visible focus, keyboard dialog trap/restore, explicit destructive confirmations, truthful unavailable states, no fake last-login data, no legacy generic records, and no credential reopen behavior. Password reset is hidden for identities with other active-store memberships and its confirmation warns that provider sessions will be revoked.

- [ ] **Step 4: Verify GREEN, accessibility, and page routes**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/merchant-administrator-ui/client.test.ts apps/customer-panel/components/settings/MerchantAdministratorConsole.test.ts apps/customer-panel/components/settings/MerchantAdministratorConsole.module.test.ts apps/customer-panel/lib/routes.test.ts`

Expected: `18/18` new UI tests PASS and route regression PASS.

Run: `npm run typecheck --workspace @celebix/customer-panel && npm run build --workspace @celebix/customer-panel`

Expected: PASS; build exports `/settings/administrators` and all four API route families, with no fake `/new` or edit page.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-panel/app/settings/administrators apps/customer-panel/lib/routes.test.ts apps/customer-panel/lib/merchant-administrator-ui apps/customer-panel/components/settings/MerchantAdministratorConsole*
git commit -m "feat(saas): replace fake administrator invites"
```

### Task 7: Static security and whole-branch verification

**Files:**
- Create `tests/saas-phase3/merchant-administrator-accounts/static-security.test.mjs`.
- Modify only files already named in Tasks 1-6 for defects discovered by verification.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: auditable source-scope, secret-safety, authority, regression, and remote-parity evidence.

- [ ] **Step 1: Write failing static-security assertions**

```js
test("management credentials remain server-only and temporary passwords have no sink", () => {
  assert.equal(scanClientSources(/LOGTO.*SECRET|managementApiOrigin|temporaryPassword\s*:/), 0);
  assert.equal(scanSql(/password|access_token|client_secret/i), 0);
  assert.equal(scanSource(/localStorage|sessionStorage/), 0);
});

test("legacy administrator invites grant no access", () => {
  assert.equal(scanNewAdministratorSources(/administrator_invite|MerchantModuleConsole/), 0);
});
```

- [ ] **Step 2: Verify RED, then complete allowlists without weakening assertions**

Run: `node --test tests/saas-phase3/merchant-administrator-accounts/static-security.test.mjs`

Expected first run: FAIL until every new source is classified and fake-route references are absent.

- [ ] **Step 3: Run focused and disposable suites**

```bash
node tests/saas-phase3/merchant-administrator-accounts/postgres-harness.mjs
node --test tests/saas-phase3/merchant-administrator-accounts/static-security.test.mjs
node tests/saas-phase2/panel-auth-composition/postgres-harness.mjs
node tests/saas-phase2/panel-session-completion/postgres-harness.mjs
npm run test:saas-phase1
```

Expected: merchant administrator `24/24`, static security PASS, composition `40/40`, session completion `58/58`, and Phase 1 regression PASS.

- [ ] **Step 4: Run workspace verification**

```bash
npm test --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/saas-data
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
npm test --workspace @celebix/owner
npm run typecheck --workspace @celebix/owner
npm run build --workspace @celebix/owner
git diff --check
```

Expected: all tests PASS, existing intentional skips unchanged, both workspaces typecheck/build PASS, diff check PASS.

- [ ] **Step 5: Run scope, secret, and unchanged-donor scans**

```bash
git diff --name-only 1dd660e004c83cf6043a312d67e0fed91ad0071a...HEAD
git diff --name-only 1dd660e004c83cf6043a312d67e0fed91ad0071a...HEAD -- apps/admin
git diff 1dd660e004c83cf6043a312d67e0fed91ad0071a...HEAD | rg -n "client_secret|access_token|temporaryPassword\s*[:=]\s*['\"]|__Host-celebix_panel=|providerSubject\s*[:=]\s*['\"]"
git status --short
```

Expected: only plan-authorized files; `apps/admin/**` diff count `0`; secret scan returns no matches; worktree clean after commit.

- [ ] **Step 6: Commit and push without deployment**

```bash
git add tests/saas-phase3/merchant-administrator-accounts
git commit -m "test(saas): verify merchant administrator provisioning"
git push -u origin codex/merchant-admin-account-provisioning
git rev-parse HEAD
git ls-remote --heads origin codex/merchant-admin-account-provisioning
```

Expected: local and remote SHA match; staging deployment `0`; production impacts `0`.

## Separately Authorized Staging Gate (Do Not Execute in This Plan Run)

- [ ] Deploy the exact reviewed SHA only after written authorization.
- [ ] Create one disposable staging employee identity and report credential status only as `created / used / revoked`.
- [ ] Prove its ID token contains provider-authoritative `email_verified === true`; otherwise stop `MERCHANT_ADMIN_VERIFIED_EMAIL_AUTHORITY_BLOCKED` without weakening callback validation.
- [ ] Prove login, exact-store access, role limits, password reset, logout, revoke, replay denial, log scans, and cleanup.
- [ ] Keep production deployment, credential mutation, merge, and real-customer impact at `0`.
