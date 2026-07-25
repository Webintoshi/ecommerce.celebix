# Shared-SaaS Provider Execution Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the disabled-by-default credential, PostgreSQL job lifecycle, workflow repository, injected worker, safe HTTP and masked UI foundation required by all six provider-gated merchant surfaces without making an external provider request.

**Architecture:** Existing merchant provider preparation remains the browser-facing starting point. A new provider profile authority stores only AAD-bound encrypted credentials and safe public configuration, while additive PostgreSQL functions bind a prepared job to an active credential version and expose atomic workflow-only claim/finalize/recovery transitions. An injected Owner worker can execute only registry-installed adapters; the production registry is empty in this plan and test adapters are confined to test files.

**Tech Stack:** TypeScript 5.9, Node.js crypto AES-256-GCM, React 19, Next.js 16 App Router, PostgreSQL 16, existing `@celebix/saas-contracts` and `@celebix/saas-data` packages, Node test runner.

## Global Constraints

- Commit this plan directly on top of `81c776a2` on branch `codex/customer-panel-ikas-store-summary`; begin implementation from the resulting plan commit and preserve all pre-existing untracked artifacts and documents.
- `apps/storefront-deri-kordon/**` and `apps/admin/**` are read-only donors and must have a diff count of zero.
- Do not add dependencies or change `package-lock.json`.
- Do not perform an external HTTP request, provider login, credential mutation, staging deployment, production deployment, migration against a non-disposable database, merge or production activation.
- The production adapter registry remains empty; test adapters live only in `*.test.ts` or disposable harness files.
- Existing `awaiting_provider_activation` and `cancelled` rows remain readable after migrations 049 and 050.
- `TenantContext`, active store, membership, plan and feature authority remain server-derived. Browser input never selects a store or tenant.
- Credentials never cross back to the browser, enter logs/audits, or persist as plaintext. PostgreSQL never receives a decryption key.
- `celebix_saas_app` cannot claim or finalize jobs. `celebix_saas_workflow` cannot create/update/revoke merchant profiles or directly modify tables.
- A timeout after a possible external side effect becomes `provider_outcome_unknown`; it is never automatically retried.
- The parity manifest remains `77 complete / 6 provider_gated / 3 legacy_rejected` until a later real-provider sandbox gate passes.

---

### Task 1: Frozen provider profile and execution contracts

**Files:**
- Modify: `packages/saas-contracts/src/merchant-admin/types.ts:22-54`
- Modify: `packages/saas-contracts/src/merchant-admin/validation.ts:1-26`
- Modify: `packages/saas-contracts/src/merchant-admin/merchant-admin.test.ts:1-end`
- Modify: `packages/saas-contracts/src/merchant-admin/index.ts:1-3`
- Modify: `packages/saas-contracts/src/index.ts:95-123`

**Interfaces:**
- Consumes: existing `MerchantAdminProviderRecordKind`, `MerchantAdminProviderAction`, UUID and timestamp validation conventions.
- Produces: `MerchantProviderCapability`, `MerchantProviderDescriptor`, `MerchantProviderProfile`, extended `MerchantAdminProviderJob`, and exact parsers used by repositories, HTTP and UI.

- [ ] **Step 1: Write failing exact-shape and immutability tests**

```ts
test("provider profiles expose only masked durable authority", () => {
  const profile = parseMerchantProviderProfile({
    id: PROFILE_ID, providerCode: "fixture_provider", capability: "marketplace_sync",
    publicConfig: { accountReference: "merchant-42" }, maskedAccountReference: "••••nt-42",
    status: "active", credentialVersion: 2, version: 3, lastValidatedAt: NOW,
    createdAt: NOW, updatedAt: NOW,
  });
  assert.equal(Object.isFrozen(profile), true);
  assert.equal(Object.isFrozen(profile.publicConfig), true);
  assert.doesNotMatch(JSON.stringify(profile), /secret|password|token|cipher|keyId/i);
});

test("provider profiles reject raw encrypted and unknown fields", () => {
  const base = providerProfileFixture();
  for (const hostile of [
    { ...base, credential: "raw" }, { ...base, ciphertext: "private" },
    { ...base, storeId: STORE_ID }, { ...base, providerCode: "fixture/provider" },
    { ...base, status: "connected" },
  ]) assert.throws(() => parseMerchantProviderProfile(hostile), /merchant_admin_contract_invalid/);
});

test("execution jobs parse every safe state without raw provider output", () => {
  for (const status of MERCHANT_ADMIN_PROVIDER_JOB_STATUSES) {
    assert.equal(parseMerchantAdminProviderJob(providerJobFixture(status)).status, status);
  }
  assert.throws(() => parseMerchantAdminProviderJob({
    ...providerJobFixture("succeeded"), rawResponse: { token: "private" },
  }));
});
```

The production changes that make these tests fail are: adding an unknown output key, failing to deep-freeze public config, widening provider-code syntax, or returning a credential/storage field.

- [ ] **Step 2: Run RED**

```bash
npm test --workspace @celebix/saas-contracts -- --test-name-pattern='provider profiles|execution jobs'
```

Expected: FAIL because `parseMerchantProviderProfile` and the extended statuses do not exist.

- [ ] **Step 3: Add the exact public contract**

```ts
export const MERCHANT_PROVIDER_CAPABILITIES = Object.freeze([
  "marketplace_sync", "invoice_reconciliation", "email_delivery",
  "phone_delivery", "whatsapp_delivery", "indexing",
] as const);
export type MerchantProviderCapability = (typeof MERCHANT_PROVIDER_CAPABILITIES)[number];

export const MERCHANT_PROVIDER_PROFILE_STATUSES = Object.freeze([
  "pending_validation", "active", "disabled", "rotation_required", "revoked",
] as const);
export type MerchantProviderProfileStatus = (typeof MERCHANT_PROVIDER_PROFILE_STATUSES)[number];

export interface MerchantProviderProfile {
  readonly id: string;
  readonly providerCode: string;
  readonly capability: MerchantProviderCapability;
  readonly publicConfig: Readonly<Record<string, MerchantAdminJson>>;
  readonly maskedAccountReference: string;
  readonly status: MerchantProviderProfileStatus;
  readonly credentialVersion: number;
  readonly version: number;
  readonly lastValidatedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MerchantProviderDescriptor {
  readonly providerCode: string;
  readonly capability: MerchantProviderCapability;
  readonly label: string;
  readonly publicFields: readonly Readonly<{ key: string; label: string }>[];
  readonly credentialFields: readonly Readonly<{ key: string; label: string; secret: true }>[];
}

export const MERCHANT_ADMIN_PROVIDER_JOB_STATUSES = Object.freeze([
  "awaiting_provider_activation", "queued", "leased", "provider_outcome_unknown",
  "reconciliation_required", "succeeded", "retryable_failed",
  "permanently_failed", "cancelled",
] as const);
```

Extend both `MerchantAdminProviderJob` and `MerchantAdminProviderJobMutationResult` with normalized required `profileId`, `providerCode`, `credentialVersion`, `attempt`, `safeProviderReference` and `outcomeCode` fields, using `null` before execution. During the additive migration window, the raw parser may omit this entire six-field group and must normalize it to `{ profileId: null, providerCode: null, credentialVersion: null, attempt: 0, safeProviderReference: null, outcomeCode: null }`; any partial group remains invalid. Migration 050 projections always emit the complete group. Add `parseMerchantProviderDescriptor` and `parseMerchantProviderProfile`. Extend both job parsers with the exact fields. Use `^[a-z][a-z0-9_]{0,63}$` for provider/outcome/field codes, byte-bounded strings, exact `secret: true`, unique field keys and recursively frozen arrays/config.

- [ ] **Step 4: Run GREEN and package regression**

```bash
npm test --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-contracts
```

Expected: exit `0`, zero failures, existing tests plus the three new tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/saas-contracts/src/merchant-admin packages/saas-contracts/src/index.ts
git commit -m "feat(saas): define provider execution contracts"
```

---

### Task 2: AAD-bound credential envelope and zeroization

**Files:**
- Create: `packages/saas-data/src/provider-execution/credential-crypto.ts`
- Create: `packages/saas-data/src/provider-execution/credential-crypto.test.ts`
- Create: `packages/saas-data/src/provider-execution/index.ts`
- Modify: `packages/saas-data/src/index.ts:1-end`

**Interfaces:**
- Consumes: Node `crypto`; 32-byte injected keys; profile/store/provider/capability/version authority.
- Produces: `MerchantProviderCredentialKeyring`, `SealedMerchantProviderCredential`, `sealMerchantProviderCredential`, `openMerchantProviderCredential`.

- [ ] **Step 1: Write failing crypto tests**

```ts
test("provider credentials bind every authority field and rotate without plaintext persistence", () => {
  const plaintext = new TextEncoder().encode('{"apiSecret":"never-print"}');
  const envelope = sealMerchantProviderCredential({
    plaintext, profileId: PROFILE_ID, storeId: STORE_ID,
    providerCode: "fixture_provider", capability: "marketplace_sync",
    credentialVersion: 1, keyring: keyring("provider.current"),
  });
  assert.doesNotMatch(JSON.stringify(envelope), /never-print|apiSecret/);
  const opened = openMerchantProviderCredential({
    envelope, profileId: PROFILE_ID, storeId: STORE_ID,
    providerCode: "fixture_provider", capability: "marketplace_sync",
    credentialVersion: 1, keyring: rotatedKeyring(),
  });
  assert.equal(new TextDecoder().decode(opened), '{"apiSecret":"never-print"}');
  opened.fill(0);
  plaintext.fill(0);
});

test("credential AAD rejects cross-store profile provider capability and version substitution", () => {
  const fixture = sealedFixture();
  for (const change of [
    { storeId: OTHER_STORE_ID }, { profileId: OTHER_PROFILE_ID },
    { providerCode: "other_provider" }, { capability: "indexing" as const },
    { credentialVersion: 2 },
  ]) assert.throws(() => openMerchantProviderCredential({ ...fixture.openInput, ...change }));
});

test("credential crypto rejects accessors duplicate key bytes and noncanonical envelopes", () => {
  assert.throws(() => sealMerchantProviderCredential(accessorInput()));
  assert.throws(() => sealMerchantProviderCredential(duplicateKeyInput()));
  assert.throws(() => openMerchantProviderCredential(noncanonicalEnvelopeInput()));
});
```

- [ ] **Step 2: Run RED**

```bash
node --experimental-transform-types --test packages/saas-data/src/provider-execution/credential-crypto.test.ts
```

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement the minimal hardened envelope**

```ts
export type SealedMerchantProviderCredential = Readonly<{
  algorithm: "A256GCM"; ciphertext: string; iv: string;
  keyId: string; tag: string; version: 1;
}>;
export interface MerchantProviderCredentialKeyring {
  readonly activeKeyId: string;
  readonly keys: readonly Readonly<{ keyId: string; key: Uint8Array }>[];
}
function aad(input: Readonly<{
  profileId: string; storeId: string; providerCode: string;
  capability: MerchantProviderCapability; credentialVersion: number;
}>, keyId: string): Buffer {
  return Buffer.from(JSON.stringify([
    "celebix-provider-credential", 1, input.storeId, input.profileId,
    input.providerCode, input.capability, input.credentialVersion, keyId,
  ]), "utf8");
}
```

Copy the defensive descriptor, dense-array, 32-byte key-copy, canonical base64url and key-zeroization techniques from `quick-orders/token-crypto.ts`, but use error text `provider_credential_crypto_invalid`. Seal with a fresh 12-byte IV and AES-256-GCM. Return a frozen envelope. Open into a fresh `Uint8Array`. Zero copied keys, plaintext copies, IV/AAD/tag buffers and failure-path buffers in `finally`.

- [ ] **Step 4: Run GREEN and forbidden-string scan**

```bash
node --experimental-transform-types --test packages/saas-data/src/provider-execution/credential-crypto.test.ts
npm test --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/saas-data
! rg -n "celebix-quick-link|console\.|process\.env" packages/saas-data/src/provider-execution
```

Expected: all commands exit `0`; final scan has no match.

- [ ] **Step 5: Commit**

```bash
git add packages/saas-data/src/provider-execution packages/saas-data/src/index.ts
git commit -m "feat(saas): seal provider credentials"
```

---

### Task 3: PostgreSQL provider-profile authority

**Files:**
- Create: `apps/owner/scripts/sql/saas/202607250049_merchant_provider_profiles.up.sql`
- Create: `apps/owner/scripts/sql/saas/202607250049_merchant_provider_profiles.down.sql`
- Create: `apps/owner/scripts/sql/saas/202607250049_merchant_provider_profiles_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/phase3i-provider-execution-foundation-manifest.json`
- Create: `tests/saas-phase3/provider-execution-foundation/postgres-harness.mjs`
- Create: `tests/saas-phase3/provider-execution-foundation/static-security.test.mjs`

**Interfaces:**
- Consumes: migration 048 tenant, store, membership and entitlement authority; sealed-envelope JSON from Task 2.
- Produces: owner-managed provider definitions; store-scoped profiles/operations; app functions for list/save/revoke; workflow function for validation result.

- [ ] **Step 1: Write the disposable PostgreSQL RED harness**

The harness creates only a disposable `fixture_provider` definition as owner and covers these exact 25 scenarios:

```js
await scenario("provider definitions are owner-only and application read-only", definitionAuthority);
await scenario("profile save persists ciphertext without raw credential", encryptedAtRest);
await scenario("profile projection omits store and envelope authority", safeProjection);
await scenario("profile replay returns the original projection", replay);
await scenario("profile operation mismatch writes nothing", operationMismatch);
await scenario("profile rotation increments credential and row versions", rotation);
await scenario("stale rotation loses without partial write", staleRotation);
await scenario("revocation is terminal and idempotent by operation", revocation);
await scenario("disable is versioned and requires credential rotation to reactivate", disableProfile);
await scenario("unknown provider is rejected before profile write", unknownProvider);
await scenario("provider capability mismatch is rejected", capabilityMismatch);
await scenario("analyst cannot save or revoke profiles", analystDenied);
await scenario("wrong store cannot read rotate or revoke profile", wrongStoreDenied);
await scenario("inactive store is denied", inactiveStoreDenied);
await scenario("missing integration feature is denied", featureDenied);
await scenario("application cannot select or mutate profile tables", directDmlDenied);
await scenario("workflow cannot create rotate revoke or directly mutate", workflowDmlDenied);
await scenario("workflow validation binds profile and credential version", validationBinding);
await scenario("unknown validation outcome leaves pending profile unchanged", unknownValidation);
await scenario("concurrent create keeps one active-capability profile", concurrentCreate);
await scenario("concurrent rotation keeps one credential version", concurrentRotation);
await scenario("backup contains no plaintext credential", backupSecretScan);
await scenario("restore preserves profile projections", backupRestore);
await scenario("migration 049 rolls back and reapplies cleanly", rollbackReapply);
await scenario("disposable PostgreSQL resources are removed", cleanup);
```

- [ ] **Step 2: Run RED**

```bash
node tests/saas-phase3/provider-execution-foundation/postgres-harness.mjs
```

Expected: FAIL before scenario 1 because migration 049 is absent.

- [ ] **Step 3: Create the exact tables and privilege boundary**

```sql
CREATE TABLE saas.merchant_provider_definitions(
  provider_code text NOT NULL CHECK(provider_code ~ '^[a-z][a-z0-9_]{0,63}$'),
  capability text NOT NULL CHECK(capability IN(
    'marketplace_sync','invoice_reconciliation','email_delivery',
    'phone_delivery','whatsapp_delivery','indexing')),
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  PRIMARY KEY(provider_code,capability)
);

CREATE TABLE saas.merchant_provider_profiles(
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,
  provider_code text NOT NULL,
  capability text NOT NULL,
  public_config jsonb NOT NULL,
  masked_account_reference text NOT NULL,
  sealed_credentials jsonb NOT NULL,
  credential_digest char(64) NOT NULL CHECK(credential_digest ~ '^[a-f0-9]{64}$'),
  credential_key_id text NOT NULL CHECK(credential_key_id ~ '^[A-Za-z0-9._-]{1,128}$'),
  credential_schema_version integer NOT NULL CHECK(credential_schema_version = 1),
  credential_version bigint NOT NULL CHECK(credential_version > 0),
  status text NOT NULL CHECK(status IN('pending_validation','active','disabled','rotation_required','revoked')),
  version bigint NOT NULL CHECK(version > 0),
  last_validated_at timestamptz,
  validation_lease_id uuid,
  validation_lease_owner text,
  validation_lease_expires_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  revoked_at timestamptz,
  FOREIGN KEY(provider_code,capability)
    REFERENCES saas.merchant_provider_definitions(provider_code,capability)
    ON DELETE RESTRICT,
  UNIQUE(store_id,id),
  CHECK(updated_at >= created_at),
  CHECK((status='revoked')=(revoked_at IS NOT NULL)),
  CHECK((validation_lease_id IS NULL)=(validation_lease_owner IS NULL)
    AND (validation_lease_id IS NULL)=(validation_lease_expires_at IS NULL)),
  CHECK(validation_lease_id IS NULL OR status='pending_validation'),
  CHECK(pg_catalog.jsonb_typeof(public_config)='object' AND pg_catalog.pg_column_size(public_config)<=8192),
  CHECK(pg_catalog.jsonb_typeof(sealed_credentials)='object' AND pg_catalog.pg_column_size(sealed_credentials)<=32768)
);

CREATE UNIQUE INDEX merchant_provider_profiles_one_live_capability_idx
  ON saas.merchant_provider_profiles(store_id,provider_code,capability)
  WHERE status <> 'revoked';

CREATE TABLE saas.merchant_provider_profile_operations(
  operation_id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,
  operation_kind text NOT NULL CHECK(operation_kind IN('save','disable','revoke','validate')),
  payload_fingerprint char(64) NOT NULL CHECK(payload_fingerprint ~ '^[a-f0-9]{64}$'),
  result_payload jsonb NOT NULL,
  committed_at timestamptz NOT NULL
);
```

Enable and force RLS on all three tables. Revoke table privileges from `PUBLIC`, `celebix_saas_app`, `celebix_saas_workflow` and `celebix_saas_host_resolver`. Add immutable guards to operation rows and provider definitions. The composite foreign key must prove the exact provider-code/capability pair without relying on a trigger or a provider-code-only reference.

- [ ] **Step 4: Add exact SECURITY DEFINER functions**

```sql
saas.merchant_provider_profile_list(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,text
) -> TABLE(outcome text,result_payload jsonb)

saas.merchant_provider_profile_save(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,
  uuid,text,uuid,text,text,jsonb,text,jsonb,text,text,integer,bigint
) -> TABLE(outcome text,result_payload jsonb)

saas.merchant_provider_profile_revoke(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,
  uuid,text,uuid,bigint
) -> TABLE(outcome text,result_payload jsonb)

saas.merchant_provider_profile_disable(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,
  uuid,text,uuid,bigint
) -> TABLE(outcome text,result_payload jsonb)

saas.merchant_provider_profile_mark_validation(
  uuid,text,timestamptz,uuid,bigint,bigint,text,text
) -> TABLE(outcome text,result_payload jsonb)

saas.merchant_provider_profile_claim_validation(
  text,timestamptz,timestamptz,uuid
) -> TABLE(outcome text,result_payload jsonb)

saas.merchant_provider_profile_recover_operation(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text
) -> TABLE(outcome text,result_payload jsonb)
```

`save` receives operation ID, fingerprint, profile ID, provider code, capability, public config, masked reference, sealed envelope, digest, key ID, envelope schema and expected version. Create requires expected version `0`; rotation requires the exact current profile version, increments credential/version, clears any stale validation lease and returns `pending_validation`. It locks the definition and existing profile row before writing. `disable` permits only `active`, `pending_validation` or `rotation_required` to become `disabled`; reactivation requires a new credential rotation through `save`. `claim_validation` is workflow-only and leases one pending profile through `FOR UPDATE SKIP LOCKED`; its workflow projection includes the envelope and store/AAD fields. `mark_validation` requires the exact lease owner, lease ID, profile version and credential version, accepts only `validated` or `rejected`, clears the lease, maps validated to `active` and rejected to `rotation_required`. Browser/app projections omit `store_id`, envelope, digest and key ID. `recover_operation` is the only read-only app recovery path for uncertain profile commits.

- [ ] **Step 5: Add assertions and checksum manifest**

Assertions fail unless these examples return true:

```sql
SELECT has_table_privilege('celebix_saas_app','saas.merchant_provider_profiles','SELECT,INSERT,UPDATE,DELETE') = false;
SELECT has_function_privilege('celebix_saas_app','saas.merchant_provider_profile_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,text,jsonb,text,jsonb,text,text,integer,bigint)','EXECUTE');
SELECT has_function_privilege('celebix_saas_workflow','saas.merchant_provider_profile_mark_validation(uuid,text,timestamptz,uuid,bigint,bigint,text,text)','EXECUTE');
SELECT has_function_privilege('celebix_saas_app','saas.merchant_provider_profile_mark_validation(uuid,text,timestamptz,uuid,bigint,bigint,text,text)','EXECUTE') = false;
```

The manifest lists migrations 001-049 in order with SHA-256 checksums and declares `externalConnections: 0`, `productionMutations: 0`.

- [ ] **Step 6: Run GREEN**

```bash
node tests/saas-phase3/provider-execution-foundation/postgres-harness.mjs
node --test tests/saas-phase3/provider-execution-foundation/static-security.test.mjs
```

Expected: `25/25 PASS`; PostgreSQL cleanup PASS; zero external connections.

- [ ] **Step 7: Commit**

```bash
git add apps/owner/scripts/sql/saas/202607250049_merchant_provider_profiles.* \
  apps/owner/scripts/sql/saas/phase3i-provider-execution-foundation-manifest.json \
  tests/saas-phase3/provider-execution-foundation
git commit -m "feat(saas): add provider credential authority"
```

---

### Task 4: Provider-profile repository and safe server runtime

**Files:**
- Create: `packages/saas-data/src/provider-execution/types.ts`
- Create: `packages/saas-data/src/provider-execution/errors.ts`
- Create: `packages/saas-data/src/provider-execution/canonical.ts`
- Create: `packages/saas-data/src/provider-execution/repository.ts`
- Create: `packages/saas-data/src/provider-execution/repository.test.ts`
- Modify: `packages/saas-data/src/provider-execution/index.ts:1-end`
- Create: `apps/customer-panel/lib/server-provider-execution/runtime.ts`
- Create: `apps/customer-panel/lib/server-provider-execution/runtime.test.ts`
- Create: `apps/customer-panel/lib/server-provider-execution/registry.ts`
- Create: `apps/customer-panel/lib/server-provider-execution/registry.test.ts`

**Interfaces:**
- Consumes: Task-1 parsers, Task-2 envelope, migration-049 functions and existing PostgreSQL pool transaction helpers.
- Produces: `MerchantProviderProfileRepository` and a frozen approved-staging runtime facade.

- [ ] **Step 1: Write repository RED tests**

```ts
test("profile repository sends sealed authority and parses only safe projections", async () => {
  const profile = await repository(clientReturning("saved", safeProfileRow())).save({
    tenantContext: tenant(), now: NOW, operationId: OPERATION_ID,
    profileId: PROFILE_ID, providerCode: "fixture_provider", capability: "marketplace_sync",
    publicConfig: { accountReference: "merchant-42" }, maskedAccountReference: "••••nt-42",
    sealedCredentials: sealedEnvelope(), credentialDigest: "a".repeat(64), expectedVersion: 0,
  });
  assert.equal(profile.providerCode, "fixture_provider");
  assert.doesNotMatch(JSON.stringify(profile), /ciphertext|keyId|digest|storeId/);
  assert.match(recordedSql(), /merchant_provider_profile_save/);
});

test("profile commit unknown destroys client audits safely and recovers once", async () => {
  const probe = commitUnknownRepository();
  const result = await probe.repository.save(saveInput());
  assert.equal(result.id, PROFILE_ID);
  assert.deepEqual(probe.releases, [true]);
  assert.deepEqual(probe.audit, [{ type: "merchant_provider_profile_commit_unknown" }]);
  assert.equal(probe.recoveryCalls, 1);
});
```

- [ ] **Step 2: Run RED**

```bash
node --experimental-transform-types --test packages/saas-data/src/provider-execution/repository.test.ts
```

Expected: FAIL because repository files are absent.

- [ ] **Step 3: Define exact repository inputs**

```ts
export interface MerchantProviderAuthorityInput {
  readonly tenantContext: TenantContext;
  readonly now: Date;
}
export interface ListMerchantProviderProfilesInput extends MerchantProviderAuthorityInput {
  readonly capability: MerchantProviderCapability;
}
export interface SaveMerchantProviderProfileInput extends ListMerchantProviderProfilesInput {
  readonly operationId: string;
  readonly profileId: string;
  readonly providerCode: string;
  readonly publicConfig: Readonly<Record<string, MerchantAdminJson>>;
  readonly maskedAccountReference: string;
  readonly sealedCredentials: SealedMerchantProviderCredential;
  readonly credentialDigest: string;
  readonly expectedVersion: number;
}
export interface RevokeMerchantProviderProfileInput extends MerchantProviderAuthorityInput {
  readonly operationId: string;
  readonly profileId: string;
  readonly expectedVersion: number;
}
export interface MerchantProviderProfileRepository {
  list(input: ListMerchantProviderProfilesInput): Promise<readonly MerchantProviderProfile[]>;
  save(input: SaveMerchantProviderProfileInput): Promise<MerchantProviderProfile>;
  disable(input: RevokeMerchantProviderProfileInput): Promise<MerchantProviderProfile>;
  revoke(input: RevokeMerchantProviderProfileInput): Promise<MerchantProviderProfile>;
}
```

Implement canonical fingerprints over store ID plus safe input and credential digest, never ciphertext. Use established `acquirePostgresClient`, timeout, destroyed-client and one read-only recovery patterns. Map database outcomes to a closed error union; messages remain outside the repository.

- [ ] **Step 4: Add the approved-staging runtime facade**

```ts
export type ServerProviderExecutionRuntime = Readonly<{
  access: ServerPanelAccessRuntime & Readonly<{
    readiness: Readonly<{ mode: "approved_staging" }>;
    panelOrigin: string;
  }>;
  profiles: MerchantProviderProfileRepository;
  keyring: MerchantProviderCredentialKeyring;
  registry: MerchantProviderRegistry;
}>;
```

Define the panel-side registry in `registry.ts`:

```ts
export interface MerchantProviderRegistryEntry {
  readonly providerCode: string;
  readonly capability: MerchantProviderCapability;
  readonly label: string;
  readonly publicFields: readonly Readonly<{ key: string; label: string }>[];
  readonly credentialFields: readonly Readonly<{ key: string; label: string; secret: true }>[];
  parsePublicConfig(value: unknown): Readonly<Record<string, MerchantAdminJson>>;
  parseCredential(value: unknown): Uint8Array;
  maskAccountReference(value: Readonly<Record<string, MerchantAdminJson>>): string;
}
export interface MerchantProviderRegistry {
  readonly size: number;
  get(providerCode: string, capability: MerchantProviderCapability): MerchantProviderRegistryEntry | null;
}
```

`createCustomerPanelProviderRegistry([])` returns the frozen default empty registry. Registration rejects duplicate code/capability pairs, mutable entries, non-secret credential field declarations, duplicate field keys, duplicate access objects, mutable/invalid keyrings and missing repository methods. The Owner adapter registry in Task 6 is a separate interface and cannot expose credential field metadata to the browser.

- [ ] **Step 5: Run GREEN**

```bash
npm test --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/saas-data
node --experimental-transform-types --test apps/customer-panel/lib/server-provider-execution/runtime.test.ts
node --experimental-transform-types --test apps/customer-panel/lib/server-provider-execution/registry.test.ts
```

Expected: exit `0`; zero failures; profile commit-unknown recovery is called exactly once.

- [ ] **Step 6: Commit**

```bash
git add packages/saas-data/src/provider-execution packages/saas-data/src/index.ts \
  apps/customer-panel/lib/server-provider-execution
git commit -m "feat(saas): add provider profile repository"
```

---

### Task 5: Workflow-only job lifecycle migration and repository

**Files:**
- Create: `apps/owner/scripts/sql/saas/202607250050_merchant_provider_execution.up.sql`
- Create: `apps/owner/scripts/sql/saas/202607250050_merchant_provider_execution.down.sql`
- Create: `apps/owner/scripts/sql/saas/202607250050_merchant_provider_execution_assertions.sql`
- Modify: `apps/owner/scripts/sql/saas/phase3i-provider-execution-foundation-manifest.json:1-end`
- Modify: `tests/saas-phase3/provider-execution-foundation/postgres-harness.mjs:1-end`
- Create: `packages/saas-data/src/provider-execution/workflow-repository.ts`
- Create: `packages/saas-data/src/provider-execution/workflow-repository.test.ts`
- Modify: `packages/saas-data/src/provider-execution/types.ts:1-end`
- Modify: `packages/saas-data/src/provider-execution/index.ts:1-end`
- Modify: `packages/saas-data/src/merchant-admin/types.ts:6-12`
- Modify: `packages/saas-data/src/merchant-admin/repository.ts:1-end`
- Modify: `packages/saas-data/src/merchant-admin/repository.test.ts:1-end`
- Modify: `packages/saas-data/src/merchant-admin/index.ts:1-4`

**Interfaces:**
- Consumes: active versioned provider profiles from Task 4 and existing prepared jobs.
- Produces: app queue operation; workflow atomic claim, heartbeat, finalize and read-only recovery operations.

- [ ] **Step 1: Extend the PostgreSQL harness with 28 RED scenarios**

Add scenarios for queue binding, one claimant, store/profile/version snapshots, stale-worker denial, heartbeat, lease expiry, retry, cancel races, success, permanent failure, provider outcome unknown, reconciliation, finalize recovery, role boundaries, rollback/reapply and cleanup. The harness total becomes exactly `53/53`.

```js
await scenario("queue binds the exact active profile credential version", queueBinding);
await scenario("claim atomically leases one eligible job", atomicClaim);
await scenario("two workers cannot claim the same job", concurrentClaim);
await scenario("stale lease owner cannot heartbeat or finalize", staleWorkerDenied);
await scenario("possible side effect becomes provider outcome unknown", outcomeUnknown);
await scenario("unknown outcome cannot be automatically requeued", unknownNeverRetries);
await scenario("read-only reconciliation resolves a proven success", reconciliationSuccess);
await scenario("workflow cannot cross store or credential version", workflowIsolation);
```

- [ ] **Step 2: Run RED**

```bash
node tests/saas-phase3/provider-execution-foundation/postgres-harness.mjs
```

Expected: first new scenario FAIL because migration 050 is absent.

- [ ] **Step 3: Add lifecycle columns and state constraints**

```sql
ALTER TABLE saas.merchant_provider_jobs
  ADD COLUMN profile_id uuid,
  ADD COLUMN provider_code text,
  ADD COLUMN credential_version bigint,
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN lease_id uuid,
  ADD COLUMN lease_owner text,
  ADD COLUMN lease_expires_at timestamptz,
  ADD COLUMN safe_provider_reference text,
  ADD COLUMN outcome_code text,
  ADD COLUMN finished_at timestamptz,
  ADD FOREIGN KEY(store_id,profile_id)
    REFERENCES saas.merchant_provider_profiles(store_id,id) ON DELETE RESTRICT;

ALTER TABLE saas.merchant_provider_jobs DROP CONSTRAINT merchant_provider_jobs_status_check;
ALTER TABLE saas.merchant_provider_jobs ADD CONSTRAINT merchant_provider_jobs_status_check
  CHECK(status IN(
    'awaiting_provider_activation','queued','leased','provider_outcome_unknown',
    'reconciliation_required','succeeded','retryable_failed',
    'permanently_failed','cancelled'));
```

Add state-shape checks: only `leased` has lease fields; terminal states have `finished_at`; awaiting rows have no profile; queued and later rows have profile/provider/credential version; provider reference appears only after a proven result; attempt count never decreases. Replace the projection functions so old prepared jobs produce required execution fields as null/zero.

- [ ] **Step 4: Add app and workflow SQL functions**

```sql
saas.merchant_provider_queue(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,
  uuid,text,uuid,bigint,uuid,bigint
) -> TABLE(outcome text,result_payload jsonb)

saas.merchant_provider_claim(
  text,timestamptz,timestamptz,uuid
) -> TABLE(outcome text,result_payload jsonb)

saas.merchant_provider_heartbeat(
  uuid,text,timestamptz,timestamptz,bigint
) -> TABLE(outcome text,result_payload jsonb)

saas.merchant_provider_finalize(
  uuid,text,timestamptz,bigint,text,text,text
) -> TABLE(outcome text,result_payload jsonb)

saas.merchant_provider_recover_workflow_operation(
  uuid,text
) -> TABLE(outcome text,result_payload jsonb)
```

`queue` is app-only and binds job/profile under row locks after revalidating store, record, provider definition, active profile and expected versions. `claim` is workflow-only and uses one statement with `FOR UPDATE SKIP LOCKED LIMIT 1`; it returns sealed envelope/store binding only to workflow role. `finalize` accepts only `succeeded`, `retryable_failed`, `permanently_failed`, `provider_outcome_unknown` or `reconciliation_required`. `provider_outcome_unknown` cannot transition to `queued`; only reconciliation may move it to `succeeded`, `permanently_failed` or remain unknown.

Extend the app repository with the exact queue boundary:

```ts
export interface QueueMerchantAdminProviderJobInput extends MerchantAdminAuthorityInput {
  readonly operationId: string;
  readonly jobId: string;
  readonly expectedJobVersion: number;
  readonly profileId: string;
  readonly expectedProfileVersion: number;
  readonly kind: MerchantAdminProviderRecordKind;
}
```

Add `queueProviderJob(input: QueueMerchantAdminProviderJobInput): Promise<MerchantAdminProviderJobMutationResult>` to `MerchantAdminRepository`. Fingerprint the job/profile IDs and both expected versions, call `merchant_provider_queue`, validate returned profile/provider/credential fields, and use the existing merchant-provider operation recovery function for an uncertain app commit.

- [ ] **Step 5: Write workflow repository RED tests**

```ts
test("workflow claim returns one credential snapshot and no raw secret", async () => {
  const claim = await repository(claimRow()).claim({
    workerId: "worker.fixture", now: NOW, leaseExpiresAt: LATER,
  });
  assert.equal(claim.kind, "claimed");
  if (claim.kind !== "claimed") assert.fail("claim expected");
  assert.equal(claim.job.credentialVersion, 2);
  assert.doesNotMatch(JSON.stringify(claim), /apiSecret|password|token/);
});

test("profile validation claim binds lease and credential authority", async () => {
  const claim = await repository(validationClaimRow()).claimProfileValidation({
    workerId: "worker.fixture", now: NOW, leaseExpiresAt: LATER,
  });
  assert.equal(claim.kind, "claimed");
  if (claim.kind !== "claimed") assert.fail("validation claim expected");
  assert.equal(claim.profile.credentialVersion, 2);
  assert.equal(claim.profile.leaseOwner, "worker.fixture");
  assert.doesNotMatch(JSON.stringify(claim.profile.publicConfig), /secret|token|password/i);
});

test("finalize commit unknown performs one recovery and never reexecutes adapter", async () => {
  const probe = finalizeCommitUnknownRepository();
  const result = await probe.repository.finalize(finalizeInput("provider_outcome_unknown"));
  assert.equal(result.status, "provider_outcome_unknown");
  assert.equal(probe.finalizeCalls, 1);
  assert.equal(probe.recoveryCalls, 1);
  assert.deepEqual(probe.releases, [true]);
});
```

- [ ] **Step 6: Implement the workflow repository**

```ts
export interface MerchantProviderWorkflowRepository {
  claimProfileValidation(input: Readonly<{
    workerId: string; now: Date; leaseExpiresAt: Date;
  }>): Promise<Readonly<{ kind: "empty" }> | Readonly<{
    kind: "claimed"; profile: MerchantProviderValidationClaim;
  }>>;
  markProfileValidation(input: MerchantProviderValidationResultInput): Promise<MerchantProviderProfile>;
  claim(input: Readonly<{
    workerId: string; now: Date; leaseExpiresAt: Date;
  }>): Promise<Readonly<{ kind: "empty" }> | Readonly<{
    kind: "claimed"; job: MerchantProviderWorkflowClaim;
  }>>;
  heartbeat(input: MerchantProviderHeartbeatInput): Promise<MerchantAdminProviderJob>;
  finalize(input: MerchantProviderFinalizeInput): Promise<MerchantAdminProviderJob>;
  recover(input: MerchantProviderWorkflowRecoveryInput): Promise<MerchantAdminProviderJob>;
}
```

Define the workflow-only projections in the same file:

```ts
export interface MerchantProviderValidationClaim {
  readonly profileId: string;
  readonly storeId: string;
  readonly providerCode: string;
  readonly capability: MerchantProviderCapability;
  readonly publicConfig: Readonly<Record<string, MerchantAdminJson>>;
  readonly sealedCredentials: SealedMerchantProviderCredential;
  readonly credentialVersion: number;
  readonly profileVersion: number;
  readonly leaseId: string;
  readonly leaseOwner: string;
  readonly leaseExpiresAt: string;
}
export interface MerchantProviderValidationResultInput {
  readonly profileId: string;
  readonly credentialVersion: number;
  readonly profileVersion: number;
  readonly leaseId: string;
  readonly leaseOwner: string;
  readonly now: Date;
  readonly outcome: "validated" | "rejected";
  readonly outcomeCode: string;
}
export interface MerchantProviderWorkflowClaim {
  readonly jobId: string;
  readonly recordId: string;
  readonly storeId: string;
  readonly profileId: string;
  readonly providerCode: string;
  readonly capability: MerchantProviderCapability;
  readonly publicConfig: Readonly<Record<string, MerchantAdminJson>>;
  readonly sealedCredentials: SealedMerchantProviderCredential;
  readonly credentialVersion: number;
  readonly jobVersion: number;
  readonly leaseId: string;
  readonly leaseOwner: string;
  readonly leaseExpiresAt: string;
  readonly attempt: number;
}
export interface MerchantProviderHeartbeatInput {
  readonly jobId: string; readonly leaseOwner: string; readonly leaseId: string;
  readonly expectedVersion: number; readonly now: Date; readonly leaseExpiresAt: Date;
}
export interface MerchantProviderFinalizeInput {
  readonly jobId: string; readonly leaseOwner: string; readonly leaseId: string;
  readonly expectedVersion: number; readonly now: Date;
  readonly outcome: "succeeded" | "retryable_failed" | "permanently_failed" | "provider_outcome_unknown" | "reconciliation_required";
  readonly outcomeCode: string; readonly safeProviderReference: string | null;
}
export interface MerchantProviderWorkflowRecoveryInput {
  readonly jobId: string; readonly operationFingerprint: string;
}
```

Constructor role is exactly `celebix_saas_workflow`. No method accepts browser `TenantContext`. Profile validation claim uses migration-049 lease authority and returns the sealed envelope only to workflow. Finalize commit-unknown destroys the client and performs exactly one recovery lookup by job/lease fingerprint.

- [ ] **Step 7: Run GREEN**

```bash
node tests/saas-phase3/provider-execution-foundation/postgres-harness.mjs
node --experimental-transform-types --test packages/saas-data/src/provider-execution/workflow-repository.test.ts
npm test --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/saas-data
```

Expected: PostgreSQL `53/53 PASS`; repository tests exit `0`; cleanup PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/owner/scripts/sql/saas/202607250050_merchant_provider_execution.* \
  apps/owner/scripts/sql/saas/phase3i-provider-execution-foundation-manifest.json \
  tests/saas-phase3/provider-execution-foundation/postgres-harness.mjs \
  packages/saas-data/src/provider-execution packages/saas-data/src/merchant-admin
git commit -m "feat(saas): add provider execution lifecycle"
```

---

### Task 6: Injected Owner worker with no production adapter

**Files:**
- Create: `apps/owner/lib/merchant-provider-execution/types.ts`
- Create: `apps/owner/lib/merchant-provider-execution/registry.ts`
- Create: `apps/owner/lib/merchant-provider-execution/worker.ts`
- Create: `apps/owner/lib/merchant-provider-execution/worker.test.ts`
- Create: `tests/saas-phase3/provider-execution-foundation/worker-static-security.test.mjs`

**Interfaces:**
- Consumes: workflow repository, Task-2 credential opener and an injected adapter registry.
- Produces: one-shot `runMerchantProviderWorkerOnce`; no scheduler, route, cron, deployment or default adapter.

- [ ] **Step 1: Write worker RED tests**

```ts
test("worker validates pending credential with an injected adapter and zeroes plaintext", async () => {
  const probe = workerProbe({ adapterOutcome: { kind: "validated" } });
  assert.deepEqual(await probe.worker.runOnce(), { kind: "profile_validated" });
  assert.equal(probe.adapterValidationCalls, 1);
  assert.equal(probe.repositoryValidationCalls, 1);
  assert.equal(probe.observedPlaintextAfterRun.every((byte) => byte === 0), true);
});

test("worker maps possible side effect to unknown without second adapter call", async () => {
  const probe = workerProbe({ adapterOutcome: { kind: "provider_outcome_unknown" } });
  assert.deepEqual(await probe.worker.runOnce(), { kind: "provider_outcome_unknown" });
  assert.equal(probe.adapterExecuteCalls, 1);
  assert.equal(probe.repositoryFinalizeCalls, 1);
  assert.equal(probe.repositoryRequeueCalls, 0);
});

test("empty production registry never claims or contacts a provider", async () => {
  const probe = disabledWorkerProbe();
  assert.deepEqual(await probe.worker.runOnce(), { kind: "disabled" });
  assert.equal(probe.claimCalls, 0);
  assert.equal(probe.fetchCalls, 0);
});
```

- [ ] **Step 2: Run RED**

```bash
NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test apps/owner/lib/merchant-provider-execution/worker.test.ts
```

Expected: FAIL because the worker module is absent.

- [ ] **Step 3: Define the adapter outcome contract**

```ts
export type ProviderExecutionOutcome =
  | Readonly<{ kind: "succeeded"; safeProviderReference: string; outcomeCode: "accepted" }>
  | Readonly<{ kind: "retryable_failed"; outcomeCode: string }>
  | Readonly<{ kind: "permanently_failed"; outcomeCode: string }>
  | Readonly<{ kind: "provider_outcome_unknown"; outcomeCode: "transport_outcome_unknown" }>;

export interface MerchantProviderAdapter {
  readonly providerCode: string;
  readonly capability: MerchantProviderCapability;
  validateCredential(input: Readonly<{
    credential: Uint8Array;
    publicConfig: Readonly<Record<string, MerchantAdminJson>>;
  }>): Promise<Readonly<{ kind: "validated" }> | Readonly<{ kind: "rejected"; outcomeCode: string }>>;
  execute(input: Readonly<{
    credential: Uint8Array;
    job: MerchantProviderWorkflowClaim;
  }>): Promise<ProviderExecutionOutcome>;
  reconcile(input: Readonly<{
    credential: Uint8Array;
    job: MerchantProviderWorkflowClaim;
  }>): Promise<ProviderExecutionOutcome>;
}
export interface MerchantProviderAdapterRegistry {
  readonly size: number;
  get(providerCode: string, capability: MerchantProviderCapability): MerchantProviderAdapter | null;
}
```

The registry constructor rejects duplicates, mutable objects and adapter code/capability mismatches. `createProductionMerchantProviderRegistry()` returns a frozen empty registry in P0.

- [ ] **Step 4: Implement one-shot worker behavior**

`runOnce` returns one of `disabled`, `empty`, `profile_validated`, `profile_rejected`, `succeeded`, `retryable_failed`, `permanently_failed`, `provider_outcome_unknown`, or `reconciliation_required`. It stops before any claim if disabled/empty. Otherwise it first attempts one profile-validation claim; if none exists, it attempts one execution-job claim. It selects the exact adapter, opens AAD-bound credentials, validates or executes exactly once, zeroes plaintext in `finally`, finalizes exactly once, and never requeues an unknown result. Audit events contain only `{ operation, classification, providerCode, capability }` with fixed values.

- [ ] **Step 5: Run GREEN and static security**

```bash
NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test apps/owner/lib/merchant-provider-execution/worker.test.ts
node --test tests/saas-phase3/provider-execution-foundation/worker-static-security.test.mjs
npm run typecheck --workspace @celebix/owner
```

Expected: exit `0`; static scan proves production registry empty and no `process.env`, fetch URL, scheduler or raw logging in worker core.

- [ ] **Step 6: Commit**

```bash
git add apps/owner/lib/merchant-provider-execution \
  tests/saas-phase3/provider-execution-foundation/worker-static-security.test.mjs
git commit -m "feat(saas): add disabled provider worker"
```

---

### Task 7: Safe profile HTTP, browser client and masked connection UI

**Files:**
- Create: `apps/customer-panel/lib/provider-execution-http/handler.ts`
- Create: `apps/customer-panel/lib/provider-execution-http/handler.test.ts`
- Create: `apps/customer-panel/lib/provider-execution-http/default.ts`
- Create: `apps/customer-panel/lib/provider-execution-ui/client.ts`
- Create: `apps/customer-panel/lib/provider-execution-ui/client.test.ts`
- Create: `apps/customer-panel/components/merchant-admin/ProviderConnectionPanel.tsx`
- Create: `apps/customer-panel/components/merchant-admin/provider-connection-panel.module.css`
- Modify: `apps/customer-panel/components/merchant-admin/MerchantModuleConsole.tsx:210-594`
- Modify: `apps/customer-panel/lib/merchant-admin-http/handler.ts:90-102`
- Modify: `apps/customer-panel/lib/merchant-admin-http/handler.test.ts:1-end`
- Modify: `apps/customer-panel/lib/merchant-admin-http/default.ts:1-end`
- Modify: `apps/customer-panel/lib/merchant-admin-ui/client.ts:1-40`
- Modify: `apps/customer-panel/lib/merchant-admin-ui/client.test.ts:1-end`
- Modify: `apps/customer-panel/lib/merchant-admin-ui/route-behavior.test.ts:600-680`
- Create: `apps/customer-panel/app/api/merchant-providers/profiles/route.ts`
- Create: `apps/customer-panel/app/api/merchant-providers/definitions/route.ts`
- Create: `apps/customer-panel/app/api/merchant-providers/profiles/[profileId]/revoke/route.ts`
- Create: `apps/customer-panel/app/api/merchant-providers/profiles/[profileId]/disable/route.ts`
- Create: `apps/customer-panel/app/api/merchant-admin/provider-jobs/[kind]/[jobId]/queue/route.ts`

**Interfaces:**
- Consumes: safe profile runtime, registry parser/sealer and existing provider-module UI.
- Produces: GET/save/revoke same-origin API and masked responsive provider state. Production remains 503/disabled because the registry is empty.

- [ ] **Step 1: Write HTTP RED tests**

```ts
test("profile save seals one registry-validated credential and never returns it", async () => {
  const probe = handlersWithFixtureRegistry();
  const response = await probe.handlers.profiles(request("POST", "/api/merchant-providers/profiles", {
    providerCode: "fixture_provider", capability: "marketplace_sync",
    publicConfig: { accountReference: "merchant-42" },
    credential: { apiSecret: "never-return" }, expectedVersion: 0,
  }));
  assert.equal(response.status, 200);
  assert.doesNotMatch(await response.clone().text(), /never-return|ciphertext|keyId|digest|storeId/);
  assert.equal(probe.sealCalls, 1);
  assert.equal(probe.repositoryCalls, 1);
});

test("profile mutations fail before sealing on authority or provider errors", async () => {
  for (const input of [missingOrigin(), wrongOrigin(), missingSession(), analystSession(), unknownProvider(), wrongCapability()]) {
    const probe = handlersWithFixtureRegistry(input.runtime);
    const response = await probe.handlers.profiles(input.request);
    assert.ok([400, 401, 403, 503].includes(response.status));
    assert.equal(probe.sealCalls, 0);
    assert.equal(probe.repositoryCalls, 0);
  }
});
```

- [ ] **Step 2: Run HTTP RED**

```bash
node --experimental-transform-types --test apps/customer-panel/lib/provider-execution-http/handler.test.ts
```

Expected: FAIL because handler files are absent.

- [ ] **Step 3: Implement exact request authority and secret handling**

Routes are fixed:

```text
GET  /api/merchant-providers/profiles?capability=<exact capability>
GET  /api/merchant-providers/definitions?capability=<exact capability>
POST /api/merchant-providers/profiles
POST /api/merchant-providers/profiles/<uuid>/revoke
POST /api/merchant-providers/profiles/<uuid>/disable
POST /api/merchant-admin/provider-jobs/<kind>/<uuid>/queue
```

GET requires a persistent session but no Origin. Definitions GET serializes only `parseMerchantProviderDescriptor` output and returns an empty frozen list for the production empty registry. POST requires exact public panel Origin, JSON content type, no private headers, a 32 KiB body limit and `idempotency-key`. The registry parser converts raw credential to canonical JSON bytes. The handler hashes the bytes, seals them, zeros them in `finally`, calls the repository once, and serializes only `parseMerchantProviderProfile` output. Default runtime with an empty registry returns fixed 503 before body/credential parsing. The queue body is exactly `{ expectedJobVersion, profileId, expectedProfileVersion }`; the handler derives store and record kind, invokes `queueProviderJob` once, and rejects pending/revoked/wrong-capability profiles before SQL mutation.

- [ ] **Step 4: Write UI RED tests**

```ts
test("provider connection panel renders masked states and no credential echo", async () => {
  const html = await renderConnectionPanel(activeProfileFixture());
  assert.match(html, /fixture_provider/);
  assert.match(html, /••••nt-42/);
  assert.doesNotMatch(html, /apiSecret|ciphertext|credentialDigest|storeId/);
});

test("provider modules remain truthful while registry is disabled", async () => {
  const html = await renderMerchantModule("marketplace_connection", disabledProviderClient());
  assert.match(html, /Sağlayıcı adaptörü etkin değil/);
  assert.doesNotMatch(html, /bağlandı|senkronize edildi|başarılı/iu);
});
```

- [ ] **Step 5: Run UI RED**

```bash
node --experimental-transform-types --test apps/customer-panel/lib/merchant-admin-ui/route-behavior.test.ts \
  apps/customer-panel/lib/provider-execution-ui/client.test.ts
```

Expected: FAIL because the new panel and client are absent.

- [ ] **Step 6: Implement the masked panel**

```ts
type ProviderConnectionPanelProps = Readonly<{
  capability: MerchantProviderCapability;
  canManage: boolean;
}>;
```

`ProviderConnectionPanel` fetches safe descriptors and profiles for its fixed capability, then renders loading, unavailable, empty, pending, active, rotation-required, disabled and revoked states. Browser headers, query or form values cannot enable the registry. Credential inputs are created only from the descriptor response. After submit the form resets and never keeps credentials in a long-lived React state object. All controls are at least 48 by 48 pixels. Existing six provider module pages mount it through the `definition.workflow` capability mapping.

Extend `merchantAdminApi` with:

```ts
async queueProviderJob(
  recordKind: MerchantAdminProviderRecordKind,
  jobId: string,
  expectedJobVersion: number,
  profileId: string,
  expectedProfileVersion: number,
) {
  return parseMerchantAdminProviderJobMutationResult(await post(
    `/api/merchant-admin/provider-jobs/${providerKind(recordKind)}/${opaqueId(jobId)}/queue`,
    { expectedJobVersion, profileId: opaqueId(profileId), expectedProfileVersion },
  ));
}
```

An active profile plus an `awaiting_provider_activation` job exposes one `Sıraya al` action. Pending or disabled profiles never enable it. `provider_outcome_unknown` shows `Sonuç doğrulanıyor — tekrar göndermeyin` and exposes no queue/cancel retry control.

- [ ] **Step 7: Run GREEN**

```bash
node --experimental-transform-types --test apps/customer-panel/lib/provider-execution-http/handler.test.ts \
  apps/customer-panel/lib/provider-execution-ui/client.test.ts \
  apps/customer-panel/lib/merchant-admin-ui/route-behavior.test.ts
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
```

Expected: exit `0`; zero failures; the pre-existing single intentional skip remains the only skip.

- [ ] **Step 8: Commit**

```bash
git add apps/customer-panel/lib/provider-execution-http apps/customer-panel/lib/provider-execution-ui \
  apps/customer-panel/components/merchant-admin apps/customer-panel/app/api/merchant-providers \
  apps/customer-panel/app/api/merchant-admin/provider-jobs \
  apps/customer-panel/lib/merchant-admin-http apps/customer-panel/lib/merchant-admin-ui
git commit -m "feat(panel): add masked provider connections"
```

---

### Task 8: Whole-foundation verification and evidence

**Files:**
- Modify: `apps/customer-panel/lib/panel-ui/parity-manifest.test.ts:1-end`
- Create: `tests/saas-phase3/provider-execution-foundation/browser-contract.test.mjs`
- Modify: `tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/api/merchant-admin/[...slug]/route.ts:1-end`
- Modify: `tests/saas-phase3/hemenaku-admin-presentation/browser-acceptance.mjs:1-end`

**Interfaces:**
- Consumes: all P0 components.
- Produces: explicit evidence that the foundation is ready while all six routes remain truthfully provider-gated.

- [ ] **Step 1: Write final RED evidence tests**

```ts
test("foundation does not promote provider routes before real sandbox proof", () => {
  assert.equal(HEMENAKU_DONOR_PARITY.length, 86);
  assert.equal(HEMENAKU_DONOR_PARITY.filter(({ status }) => status === "complete").length, 77);
  assert.equal(HEMENAKU_DONOR_PARITY.filter(({ status }) => status === "provider_gated").length, 6);
  assert.equal(HEMENAKU_DONOR_PARITY.filter(({ status }) => status === "legacy_rejected").length, 3);
});
```

Browser contract assertions prove all six pages render their exact capability, disabled production registry, no false-success copy, 48-pixel targets, zero horizontal overflow at 390, 1024 and 1025 widths, and no credential value or external provider origin in DOM, RSC, console or network. Same-origin `/api/merchant-providers/definitions` and `/profiles` requests remain permitted.

- [ ] **Step 2: Run RED**

```bash
node --experimental-transform-types --test apps/customer-panel/lib/panel-ui/parity-manifest.test.ts
node --test tests/saas-phase3/provider-execution-foundation/browser-contract.test.mjs
```

Expected: parity count test passes; browser contract fails until fixture/acceptance covers all six provider pages. This split proves the browser test is new evidence rather than a manifest-status change.

- [ ] **Step 3: Extend only the local browser fixture and route matrix**

```js
const PROVIDER_FOUNDATION_ROUTES = Object.freeze([
  "/marketplaces",
  "/accounting/invoicing-integration",
  "/marketing/email",
  "/marketing/phone",
  "/marketing/whatsapp",
  "/seo/fast-indexing",
]);
```

The fixture returns safe masked profiles only and never a credential or envelope. Browser network allowlist remains loopback/data/blob; any external request fails the run.

- [ ] **Step 4: Run the complete verification matrix**

```bash
npm test --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-contracts
npm test --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/saas-data
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test $(rg --files apps/owner | rg '\.test\.(ts|mjs)$')
npm run typecheck --workspace @celebix/owner
npm run build --workspace @celebix/owner
node tests/saas-phase3/provider-execution-foundation/postgres-harness.mjs
node --test tests/saas-phase3/provider-execution-foundation/*.test.mjs
CELEBIX_RUN_LOCAL_BROWSER_ACCEPTANCE=1 node tests/saas-phase3/hemenaku-admin-presentation/browser-acceptance.mjs
git diff --check
! git diff --name-only 81c776a2...HEAD | rg '^apps/admin/'
! git diff --name-only 81c776a2...HEAD | rg '^apps/storefront-deri-kordon/'
! git diff 81c776a2...HEAD | rg -n -i '(BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|postgres(?:ql)?://[^[:space:]]+:[^[:space:]]+@|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,})'
git status --short
```

Expected:

- PostgreSQL `53/53 PASS` and cleanup PASS;
- contracts, data, customer-panel and Owner zero failures;
- customer-panel retains only its one intentional skip;
- both builds PASS;
- local browser acceptance PASS with external requests `0`, console errors `0`, horizontal overflow `0`, minimum target `48px`;
- `apps/admin/**` diff `0` and storefront donor diff `0`;
- secret scan no matches;
- deploys and external provider requests `0`.

- [ ] **Step 5: Commit final evidence**

```bash
git add apps/customer-panel/lib/panel-ui/parity-manifest.test.ts \
  tests/saas-phase3/provider-execution-foundation/browser-contract.test.mjs \
  tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/api/merchant-admin/[...slug]/route.ts \
  tests/saas-phase3/hemenaku-admin-presentation/browser-acceptance.mjs
git commit -m "test(saas): verify provider execution foundation"
```

- [ ] **Step 6: Push without rewriting history**

```bash
git push origin codex/customer-panel-ikas-store-summary
git ls-remote --heads origin codex/customer-panel-ikas-store-summary
git rev-parse HEAD
```

Expected: remote SHA equals local HEAD; force-push count `0`.

## Completion Report

Report:

```text
PASS — SHARED_SAAS_PROVIDER_EXECUTION_FOUNDATION_COMPLETE
```

Include final SHA, commit map, changed files, PostgreSQL scenarios, workspace totals, browser measurements, credential/envelope scans, donor/admin diff counts, remote parity and unchanged parity:

```text
working feature parity: 77/86 (89.5%)
closed transition parity: 80/86 (93.0%)
provider-gated surfaces: 6/86 (7.0%)
external provider calls: 0
staging deployments: 0
production impacts: 0
```

P0 completion authorizes planning P1 IndexNow. It does not authorize implementing P1, selecting marketing/accounting providers, entering credentials, staging deployment or production activation.
