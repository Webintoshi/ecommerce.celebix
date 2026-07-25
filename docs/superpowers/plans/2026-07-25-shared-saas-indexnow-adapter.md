# Shared-SaaS IndexNow Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first real provider adapter by binding `/seo/fast-indexing` to a tenant-safe, PostgreSQL-backed IndexNow profile, public verification file, immutable URL submission and explicit unknown-outcome reconciliation flow.

**Architecture:** Customer-panel provisions a platform-managed per-store IndexNow key through one server-owned PostgreSQL operation, while shared storefront declassifies that key only for the exact active canonical hostname and exact key-file path. PostgreSQL snapshots the ordered URL list, active record/profile/publication/domain authority and versions before leasing work. An injected Owner adapter posts once to the fixed IndexNow endpoint; ambiguous transport outcomes stop until a merchant explicitly requests one reconciliation attempt. Production/default runtimes remain disabled, and no profile validation request is made to a merchant-controlled hostname.

**Tech Stack:** TypeScript 5.9, Node.js crypto and fetch, React 19, Next.js 16 App Router, PostgreSQL 16, `pg`, existing `@celebix/saas-contracts` and `@celebix/saas-data`, Node test runner.

## Global Constraints

- Verify the implementation base is `27cdddedf6d4e37c1410e335d49ca18547496e85`, then implement on `codex/saas-phase3-indexnow-adapter` from the documentation-plan commit; do not rewrite the existing P0 history.
- The approved design is `docs/superpowers/specs/2026-07-25-shared-saas-indexnow-adapter-design.md`; any contradiction stops execution before code changes.
- Preserve unrelated untracked files. Never add `.codex-artifacts/**` or the pre-existing untracked 2026-07-22 plan/spec files.
- `apps/admin/**`, `apps/storefront-deri-kordon/**`, frozen legacy IndexNow code, deployment configuration and infrastructure remain byte-for-byte unchanged.
- Add no dependency and do not modify `package-lock.json`.
- Provider code is exactly `indexnow`, capability is exactly `indexing`, and the only outbound endpoint is `https://api.indexnow.org/indexnow`.
- Browser input never selects store, tenant, canonical hostname, provider, credential, verification path, profile version or publication version. Session-derived `TenantContext` and PostgreSQL are the only merchant authority.
- The IndexNow derivation key is a separate 32-byte server-only authority; never reuse the provider credential-encryption key.
- Raw verification keys may appear only in the encrypted credential envelope and the exact public key-file response. They must not appear in generic profile/job projections, RSC, DOM, logs, audits or error text.
- Owner profile validation performs no merchant/custom-domain outbound request. Public key-file reachability is proven by storefront tests and the separately authorized staging gate.
- `celebix_saas_app` cannot read publication secrets or claim/finalize jobs. `celebix_saas_workflow` cannot provision profiles/publications or directly modify their tables. `celebix_saas_host_resolver` can only execute the exact public resolver.
- A possible external side effect followed by timeout/socket failure becomes `provider_outcome_unknown`; it is never automatically retried. Reconciliation requires a new merchant operation and can send the immutable payload at most once.
- Do not deploy, call IndexNow, mutate staging credentials or change parity status during Tasks 1–9. Task 10 is a separately authorized final gate.

---

### Task 1: IndexNow canonical primitives and key derivation

**Files:**
- Create: `packages/saas-data/src/provider-execution/indexnow.ts`
- Create: `packages/saas-data/src/provider-execution/indexnow.test.ts`
- Modify: `packages/saas-data/src/provider-execution/index.ts:1-end`
- Modify: `packages/saas-data/src/index.ts:1-end`

**Interfaces:**
- Consumes: canonical UUID/version values and a copied 32-byte HMAC key.
- Produces: `IndexNowKeyDerivationAuthority`, `createIndexNowKeyDerivationAuthority`, `IndexNowExecutionPayload`, `deriveIndexNowVerificationKey`, `parseIndexNowCredential`, `parseIndexNowPublicConfig`, and `parseIndexNowExecutionPayload`.

- [ ] **Step 1: Write 12 failing parser and derivation tests**

```ts
test("derivation is deterministic and binds every authority field", () => {
  const first = deriveIndexNowVerificationKey(authority(), input());
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(first, deriveIndexNowVerificationKey(authority(), input()));
  for (const change of authoritySubstitutions()) {
    assert.notEqual(first, deriveIndexNowVerificationKey(authority(), change));
  }
});

test("execution payload preserves one canonical ordered URL snapshot", () => {
  const payload = parseIndexNowExecutionPayload({
    schemaVersion: 1,
    canonicalHostname: "shop.example.com",
    keyLocation: `https://shop.example.com/${KEY}.txt`,
    urls: ["https://shop.example.com/a", "https://shop.example.com/b?x=1"],
    recordVersion: 4,
    publicationVersion: 2,
  });
  assert.deepEqual(payload.urls, ["https://shop.example.com/a", "https://shop.example.com/b?x=1"]);
  assert.equal(Object.isFrozen(payload.urls), true);
});
```

Cover hostile accessors, sparse/duplicate arrays, 0/101 URLs, total JSON size over 32 KiB, non-HTTPS, credentials, explicit ports, fragments, wrong hostname, noncanonical URL serialization, controls, wrong `keyLocation`, wrong keys/versions and mutation after parsing. Credential parsing accepts only 64 lowercase hexadecimal UTF-8 bytes; public config is exactly `{ canonicalHostname }`.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --test packages/saas-data/src/provider-execution/indexnow.test.ts
```

Expected: FAIL because `indexnow.ts` and its exports do not exist.

- [ ] **Step 3: Implement the minimal immutable contract**

```ts
export interface IndexNowKeyDerivationAuthority {
  readonly activeKeyId: string;
  derive(input: Readonly<{
    storeId: string;
    profileId: string;
    credentialVersion: number;
    operationId: string;
  }>): Uint8Array;
}

export function createIndexNowKeyDerivationAuthority(input: Readonly<{
  activeKeyId: string;
  keys: readonly Readonly<{ keyId: string; key: Uint8Array }>[];
}>): IndexNowKeyDerivationAuthority;

export type IndexNowExecutionPayload = Readonly<{
  schemaVersion: 1;
  canonicalHostname: string;
  keyLocation: string;
  urls: readonly string[];
  recordVersion: number;
  publicationVersion: number;
}>;

export function deriveIndexNowVerificationKey(
  authority: IndexNowKeyDerivationAuthority,
  input: Readonly<{
    storeId: string;
    profileId: string;
    credentialVersion: number;
    operationId: string;
  }>,
): string;
```

The factory copies key bytes, rejects duplicate IDs/bytes and noncanonical descriptors, and returns only the active key ID plus a derivation method. The method HMAC-SHA-256s the exact domain-separated tuple `celebix:indexnow:v1\0storeId\0profileId\0credentialVersion\0operationId` and returns a fresh 32-byte result. `deriveIndexNowVerificationKey` hex-encodes that result, zeroes it in `finally`, and returns 64 lowercase hex. URL parsing must require `new URL(value).href === value`, exact hostname equality and the limits from the design.

- [ ] **Step 4: Run GREEN and package regression**

```bash
node --experimental-strip-types --test packages/saas-data/src/provider-execution/indexnow.test.ts
npm test --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/saas-data
```

Expected: focused `12/12 PASS`; workspace `278/278 PASS` (baseline `266` plus 12); typecheck exit `0`.

- [ ] **Step 5: Commit**

```bash
git add packages/saas-data/src/provider-execution packages/saas-data/src/index.ts
git commit -m "feat(saas): add indexnow execution primitives"
```

---

### Task 2: Atomic PostgreSQL profile and public-key publication authority

**Files:**
- Create: `apps/owner/scripts/sql/saas/202607250051_indexnow_provider_publication.up.sql`
- Create: `apps/owner/scripts/sql/saas/202607250051_indexnow_provider_publication.down.sql`
- Create: `apps/owner/scripts/sql/saas/202607250051_indexnow_provider_publication_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/phase3j-indexnow-adapter-manifest.json`
- Create: `tests/saas-phase3/indexnow-provider-adapter/postgres-harness.mjs`
- Create: `tests/saas-phase3/indexnow-provider-adapter/static-security.test.mjs`

**Interfaces:**
- Consumes: migrations `001–050`, exact active tenant/membership/plan/feature/domain authority, encrypted credential envelope/digest and server-derived key.
- Produces: `saas.merchant_indexnow_provision(...)`, `saas.resolve_public_indexnow_key(text,text,timestamptz)`, lifecycle closure triggers and a checksum-pinned `001–051` manifest.

- [ ] **Step 1: Add 34 RED scenarios to a disposable PostgreSQL 16 harness**

The harness must support Docker, Podman and isolated native PostgreSQL exactly like the P0 harness, use fresh roles/database/schema, reject non-16 servers, record zero external/production connections and always clean up. Add numbered scenarios for migration/apply assertions; fresh activation/replay; rotation; stale expected version; wrong tenant/store/profile/domain/plan/feature/role; inactive/unverified/alias domain; direct DML/SELECT denial for all three roles; exact public GET lookup; wrong host/path/time/status/version; disable/revoke closure; concurrent double activation; commit-unknown recovery; backup/restore; `051` rollback/reapply; manifest checksums and cleanup.

- [ ] **Step 2: Run RED**

```bash
node tests/saas-phase3/indexnow-provider-adapter/postgres-harness.mjs
```

Expected: FAIL before scenario 1 because migration `051` and the manifest are missing.

- [ ] **Step 3: Implement the minimal publication schema and functions**

```sql
CREATE TABLE saas.merchant_indexnow_publications (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES saas.stores(id),
  profile_id uuid NOT NULL REFERENCES saas.merchant_provider_profiles(id),
  canonical_domain_id uuid NOT NULL REFERENCES saas.store_domains(id),
  credential_version bigint NOT NULL CHECK (credential_version > 0),
  publication_version bigint NOT NULL CHECK (publication_version > 0),
  canonical_hostname text NOT NULL,
  verification_path text NOT NULL,
  verification_value text NOT NULL,
  status text NOT NULL CHECK (status IN ('active','retired','revoked')),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (profile_id, credential_version),
  UNIQUE (canonical_hostname, verification_path, publication_version)
);
```

`merchant_indexnow_provision` must lock and revalidate the TenantContext tuple, `integrations.manage`, active valid subscription/feature, exact active canonical verified domain and enabled `indexnow/indexing` definition; insert/rotate the encrypted profile and publication in one transaction; retire the prior publication; persist the operation fingerprint/result; and project only safe `{ canonicalHostname }` plus a masked last-six reference. `resolve_public_indexnow_key` returns one value only for exact `(hostname,path,now)` and active store/domain/profile/current credential/publication. Revoke/disable/rotation-required transitions close publication via trigger in the same transaction.

Grant only function execution. Explicitly revoke table/sequence privileges from `PUBLIC`, `celebix_saas_app`, `celebix_saas_workflow` and `celebix_saas_host_resolver`. Insert the `indexnow/indexing` provider definition idempotently. Generate the manifest from real SHA-256 file bytes; never hand-fabricate hashes.

- [ ] **Step 4: Run GREEN and static checks**

```bash
node tests/saas-phase3/indexnow-provider-adapter/postgres-harness.mjs --through=51
node --test tests/saas-phase3/indexnow-provider-adapter/static-security.test.mjs
git diff --check
```

Expected: PostgreSQL `34/34 PASS`, static `8/8 PASS`, backup/restore and `051` rollback/reapply PASS, cleanup PASS, external connections `0`.

- [ ] **Step 5: Commit**

```bash
git add apps/owner/scripts/sql/saas/202607250051_indexnow_provider_publication.* \
  apps/owner/scripts/sql/saas/phase3j-indexnow-adapter-manifest.json \
  tests/saas-phase3/indexnow-provider-adapter
git commit -m "feat(saas): add indexnow publication authority"
```

---

### Task 3: Immutable execution snapshot and explicit reconciliation SQL

**Files:**
- Create: `apps/owner/scripts/sql/saas/202607250052_indexnow_provider_execution.up.sql`
- Create: `apps/owner/scripts/sql/saas/202607250052_indexnow_provider_execution.down.sql`
- Create: `apps/owner/scripts/sql/saas/202607250052_indexnow_provider_execution_assertions.sql`
- Modify: `apps/owner/scripts/sql/saas/phase3j-indexnow-adapter-manifest.json:1-end`
- Modify: `tests/saas-phase3/indexnow-provider-adapter/postgres-harness.mjs:1-end`

**Interfaces:**
- Consumes: `indexing_request` record config, active IndexNow profile/current publication and P0 provider job lifecycle.
- Produces: immutable `execution_payload`, payload digest, `lease_operation`, `merchant_provider_request_reconciliation`, `merchant_provider_claim_reconciliation`, and `merchant_provider_finalize_reconciliation`.

- [ ] **Step 1: Extend the harness to exactly 68 scenarios**

Add RED scenarios proving ordered URL persistence; record/profile/publication/domain/version binding; record edits after queue do not change a leased payload; stale unclaimed work cannot lease after rotation/domain change; malformed/noncanonical/wrong-host/duplicate/oversize URLs fail before mutation; normal claim never selects unknown/reconciliation work; app role cannot claim/finalize; workflow cannot request reconciliation; explicit request is idempotent and store-owner authorized; two concurrent reconcile claims yield one lease; an ambiguous reconcile cannot loop automatically; lease owner/id/version/operation mismatches fail; expired leases recover safely; `052` backup/restore/rollback/reapply and checksum assertions pass.

- [ ] **Step 2: Run RED**

```bash
node tests/saas-phase3/indexnow-provider-adapter/postgres-harness.mjs
```

Expected: first `052` assertion fails; the harness still reports exactly 68 declared scenarios.

- [ ] **Step 3: Implement additive snapshot and lease authority**

```sql
ALTER TABLE saas.merchant_provider_jobs
  ADD COLUMN execution_payload jsonb,
  ADD COLUMN execution_payload_digest text,
  ADD COLUMN lease_operation text
    CHECK (lease_operation IS NULL OR lease_operation IN ('execute','reconcile'));
```

Replace `merchant_provider_queue` with a version that, for `indexing_request/indexnow`, locks the record/profile/publication/canonical domain together, validates the exact URLs and persists schema-v1 payload plus SHA-256 digest. Existing non-IndexNow kinds retain P0 behavior. Normal claim emits `lease_operation='execute'` and never selects unknown/reconciliation rows.

Add exact functions:

```text
merchant_provider_request_reconciliation(app authority + operation + job/version)
merchant_provider_claim_reconciliation(worker + now + lease id/expiry)
merchant_provider_finalize_reconciliation(job + lease owner/id/version + outcome)
```

The request transition is only `provider_outcome_unknown -> reconciliation_required`. Claim locks one row with `SKIP LOCKED`, revalidates the immutable snapshot against current store/domain/profile/credential/publication authority, and sets `leased/reconcile`. Finalize accepts only the matching reconcile lease. If current authority differs, terminate safely with `permanently_failed/indexnow_authority_changed` and do not expose or send the old payload.

- [ ] **Step 4: Run GREEN**

```bash
node tests/saas-phase3/indexnow-provider-adapter/postgres-harness.mjs
node tests/saas-phase3/provider-execution-foundation/postgres-harness.mjs
```

Expected: IndexNow `68/68 PASS`; P0 regression `53/53 PASS`; both cleanup checks PASS; external/production connections `0`.

- [ ] **Step 5: Commit**

```bash
git add apps/owner/scripts/sql/saas/202607250052_indexnow_provider_execution.* \
  apps/owner/scripts/sql/saas/phase3j-indexnow-adapter-manifest.json \
  tests/saas-phase3/indexnow-provider-adapter/postgres-harness.mjs
git commit -m "feat(saas): bind indexnow execution snapshots"
```

---

### Task 4: PostgreSQL repositories for provisioning, public lookup and reconciliation

**Files:**
- Create: `packages/saas-data/src/provider-execution/indexnow-repository.ts`
- Create: `packages/saas-data/src/provider-execution/indexnow-repository.test.ts`
- Modify: `packages/saas-data/src/provider-execution/types.ts:13-161`
- Modify: `packages/saas-data/src/provider-execution/workflow-repository.ts:1-452`
- Modify: `packages/saas-data/src/provider-execution/workflow-repository.test.ts:1-end`
- Modify: `packages/saas-data/src/merchant-admin/types.ts:1-13`
- Modify: `packages/saas-data/src/merchant-admin/repository.ts:1-end`
- Modify: `packages/saas-data/src/merchant-admin/repository.test.ts:1-end`
- Modify: `packages/saas-data/src/provider-execution/index.ts:1-end`
- Modify: `packages/saas-data/src/index.ts:1-end`

**Interfaces:**
- Produces `IndexNowProvisioningRepository`, `PublicIndexNowKeyRepository`, snapshot-bearing claims, reconciliation claim/finalize operations and merchant reconciliation request.

- [ ] **Step 1: Write 21 repository RED tests**

```ts
export interface IndexNowProvisioningRepository {
  provision(input: Readonly<{
    tenantContext: TenantContext;
    now: Date;
    operationId: string;
    profileId: string;
    expectedVersion: number;
    verificationValue: string;
    sealedCredentials: SealedMerchantProviderCredential;
    credentialDigest: string;
  }>): Promise<MerchantProviderProfile>;
}

export interface PublicIndexNowKeyRepository {
  resolve(input: Readonly<{
    hostname: string;
    verificationPath: string;
    now: Date;
  }>): Promise<Readonly<{ kind: "found"; verificationValue: string }> | Readonly<{ kind: "not_found" }>>;
}
```

Test exact constructor surfaces/roles, canonical inputs, frozen outputs, no extra projection keys, one SQL function call, PostgreSQL timeout setup, rollback behavior, pool-acquisition classification, commit-unknown audit, public read-only transaction, result mismatch fail-closed, snapshot parsing, reconciliation claim/finalize and merchant request idempotency.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --test \
  packages/saas-data/src/provider-execution/indexnow-repository.test.ts \
  packages/saas-data/src/provider-execution/workflow-repository.test.ts \
  packages/saas-data/src/merchant-admin/repository.test.ts
```

Expected: FAIL on missing repositories/interfaces and missing reconciliation methods.

- [ ] **Step 3: Implement exact repository additions**

Extend `MerchantProviderWorkflowClaim` with frozen `executionPayload`, `executionPayloadDigest` and `leaseOperation: "execute" | "reconcile"`. Replace the old direct `reconcile(...)` method with:

```ts
claimReconciliation(input: ClaimMerchantProviderWorkInput): Promise<Empty | Claimed>;
finalizeReconciliation(input: MerchantProviderFinalizeInput): Promise<MerchantAdminProviderJob>;
```

Add `requestProviderJobReconciliation(...)` to `MerchantAdminRepository`. Keep every transaction parameterized, role-scoped and exact-shape parsed. Public lookup uses `BEGIN READ ONLY` and `SET LOCAL ROLE celebix_saas_host_resolver`; provisioning/merchant request use `celebix_saas_app`; claim/finalize use `celebix_saas_workflow`. Never return the verification value from provisioning or generic profile/job methods.

- [ ] **Step 4: Run GREEN and full data regression**

```bash
node --experimental-strip-types --test \
  packages/saas-data/src/provider-execution/indexnow-repository.test.ts \
  packages/saas-data/src/provider-execution/workflow-repository.test.ts \
  packages/saas-data/src/merchant-admin/repository.test.ts
npm test --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/saas-data
```

Expected: focused additions `21/21 PASS`; workspace `299/299 PASS` (baseline 266 + Task 1's 12 + this task's 21); typecheck exit `0`.

- [ ] **Step 5: Commit**

```bash
git add packages/saas-data/src/provider-execution packages/saas-data/src/merchant-admin \
  packages/saas-data/src/index.ts
git commit -m "feat(saas): add indexnow repositories"
```

---

### Task 5: Exact shared-storefront verification key response

**Files:**
- Modify: `apps/storefront-shared/lib/default-runtime.ts:1-65`
- Create: `apps/storefront-shared/lib/default-runtime.test.ts`
- Modify: `apps/storefront-shared/proxy.ts:1-93`
- Modify: `apps/storefront-shared/lib/storefront-app.test.ts:1-end`
- Create: `apps/storefront-shared/lib/indexnow-key-response.ts`
- Create: `apps/storefront-shared/lib/indexnow-key-response.test.ts`

**Interfaces:**
- Consumes: trusted proxy-selected canonical hostname and `PublicIndexNowKeyRepository`.
- Produces: one exact public `text/plain; charset=utf-8` key response for `/<64-lower-hex>.txt`.

- [ ] **Step 1: Write 12 storefront RED tests**

```ts
test("exact trusted hostname and path declassify one matching key", async () => {
  const response = await proxy(request(`https://internal/${KEY}.txt`, trustedHeaders("shop.example.com")));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), KEY);
  assert.equal(response.headers.get("content-type"), "text/plain; charset=utf-8");
});
```

Also prove wrong/untrusted host, wrong key/path/case/length, query, fragment, child path, POST, disabled runtime, inactive lookup and repository failure never reveal a key; forged raw Host/Forwarded headers cannot rescue a request; normal storefront and PayTR behavior remain unchanged.

- [ ] **Step 2: Run RED**

```bash
node --experimental-strip-types --test \
  apps/storefront-shared/lib/indexnow-key-response.test.ts \
  apps/storefront-shared/lib/storefront-app.test.ts
```

Expected: FAIL because the response module/runtime repository integration is absent.

- [ ] **Step 3: Implement the exact response before normal page CSP work**

```ts
const KEY_PATH = /^\/[0-9a-f]{64}\.txt$/;

export async function resolveIndexNowKeyResponse(input: Readonly<{
  method: string;
  pathname: string;
  search: string;
  hash: string;
  hostname: string;
  now: Date;
  repository: PublicIndexNowKeyRepository;
}>): Promise<Response | null>;
```

Call this only after `selectTrustedStorefrontHostAuthority` returns `trusted`. A matching path with any invalid method/query/hash/repository result returns fixed 404 and never falls through. A found value must equal the path stem, then return exactly that value with `cache-control: no-store`, nosniff, no-referrer and the strict fallback CSP. Add migration `051` to storefront preflight and construct `PostgresPublicIndexNowKeyRepository` on the existing pool.

- [ ] **Step 4: Run GREEN and storefront regression**

```bash
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/storefront-shared
```

Expected: `107/107 PASS` (baseline 95 + 12), typecheck/build PASS, zero warnings promoted to failures.

- [ ] **Step 5: Commit**

```bash
git add apps/storefront-shared/lib/default-runtime.ts \
  apps/storefront-shared/lib/default-runtime.test.ts apps/storefront-shared/proxy.ts \
  apps/storefront-shared/lib/storefront-app.test.ts apps/storefront-shared/lib/indexnow-key-response*
git commit -m "feat(storefront): serve indexnow verification keys"
```

---

### Task 6: Disabled-by-default panel provisioning and truthful controls

**Files:**
- Create: `apps/customer-panel/lib/server-provider-execution/config.ts`
- Create: `apps/customer-panel/lib/server-provider-execution/config.test.ts`
- Create: `apps/customer-panel/lib/server-provider-execution/indexnow-entry.ts`
- Create: `apps/customer-panel/lib/server-provider-execution/indexnow-entry.test.ts`
- Modify: `apps/customer-panel/lib/server-provider-execution/registry.ts:8-123`
- Modify: `apps/customer-panel/lib/server-provider-execution/registry.test.ts:1-end`
- Modify: `apps/customer-panel/lib/server-provider-execution/runtime.ts:17-137`
- Modify: `apps/customer-panel/lib/server-provider-execution/runtime.test.ts:1-end`
- Modify: `apps/customer-panel/lib/server-panel-access/postgres-runtime.ts:1-359`
- Create: `apps/customer-panel/lib/server-panel-access/postgres-runtime.test.ts`
- Modify: `apps/customer-panel/lib/provider-execution-http/handler.ts:1-271`
- Modify: `apps/customer-panel/lib/provider-execution-http/handler.test.ts:1-end`
- Modify: `apps/customer-panel/lib/provider-execution-http/default.ts:1-26`
- Create: `apps/customer-panel/app/api/merchant-providers/indexnow/activate/route.ts`
- Modify: `apps/customer-panel/lib/merchant-admin-http/handler.ts:1-end`
- Modify: `apps/customer-panel/lib/merchant-admin-http/handler.test.ts:1-end`
- Modify: `apps/customer-panel/lib/merchant-admin-http/default.ts:1-end`
- Create: `apps/customer-panel/app/api/merchant-admin/provider-jobs/[kind]/[jobId]/reconcile/route.ts`
- Modify: `apps/customer-panel/lib/provider-execution-ui/client.ts:1-end`
- Modify: `apps/customer-panel/lib/provider-execution-ui/client.test.ts:1-end`
- Modify: `apps/customer-panel/lib/merchant-admin-ui/client.ts:1-end`
- Modify: `apps/customer-panel/components/merchant-admin/ProviderConnectionPanel.tsx:1-157`
- Modify: `apps/customer-panel/components/merchant-admin/MerchantModuleConsole.tsx:180-560`
- Modify: `apps/customer-panel/lib/merchant-admin-ui/route-behavior.test.ts:1-end`

**Interfaces:**
- Consumes: authenticated server `TenantContext`, panel Origin, repository/keyring/derivation authority and current provider job.
- Produces: dedicated `POST /api/merchant-providers/indexnow/activate`, explicit job reconciliation endpoint and truthful IndexNow UI.

- [ ] **Step 1: Write 28 RED tests across config, HTTP and UI**

Config tests require the exact environment names below and prove empty, partial, production-tier, production-like database, malformed/duplicate key material and mismatched active IDs all return disabled/fail closed:

```text
CELEBIX_PROVIDER_EXECUTION_MODE=approved_staging
CELEBIX_PROVIDER_CREDENTIAL_KEY_ID
CELEBIX_PROVIDER_CREDENTIAL_KEY_B64URL
CELEBIX_INDEXNOW_DERIVATION_KEY_ID
CELEBIX_INDEXNOW_DERIVATION_KEY_B64URL
```

HTTP tests prove the activation body is exactly `{ expectedVersion, profileId? }`; provider/host/key cannot be supplied; exact Origin/session/role/feature/idempotency are required; one derived key is sealed/zeroed and one provisioning call occurs; generic profile save rejects the server-managed IndexNow entry before credential parsing. Reconciliation tests require exact job/version and one repository call only from `provider_outcome_unknown`.

UI tests prove no credential/key/keyLocation appears; the active state shows canonical hostname plus masked last six; pending/disabled/unknown/succeeded/failed copy is truthful; unknown offers only `Yeniden doğrula ve gönder`; all controls are at least 48px; a non-manager sees no mutation control.

- [ ] **Step 2: Run RED**

```bash
node --experimental-transform-types --test \
  apps/customer-panel/lib/server-provider-execution/*.test.ts \
  apps/customer-panel/lib/provider-execution-http/handler.test.ts \
  apps/customer-panel/lib/provider-execution-ui/client.test.ts \
  apps/customer-panel/lib/merchant-admin-http/handler.test.ts \
  apps/customer-panel/lib/merchant-admin-ui/route-behavior.test.ts
```

Expected: FAIL on missing config/entry/activate/reconcile surfaces.

- [ ] **Step 3: Implement strict staging-only runtime registration**

Add internal `credentialMode: "merchant_supplied" | "server_managed"` and `list(capability): readonly string[]` to the registry contract. The handler obtains definition codes from that immutable registry list instead of a separate hardcoded provider-code authority. The `indexnow/indexing` descriptor has no public or credential fields and is available only when strict approved-staging config parses. `postgres-runtime.ts` registers provider runtime only after the existing panel runtime and migrations `049–052` preflight succeed. Default/production/partial config leaves no provider runtime and returns controlled 503.

Activation creates/validates the profile UUID and lists the existing server-side profile when rotating. A new profile uses credential version `1`; an existing exact IndexNow profile must match `expectedVersion` and uses `existing.credentialVersion + 1`. The handler derives the credential once, encodes it as exact UTF-8 hex, seals it with that credential version, calls `provision`, and zeroes every plaintext byte in `finally`. `publicConfig` is server-produced `{ canonicalHostname }`; SQL remains authoritative for its value. Reconciliation routes through the merchant repository and never call an adapter/provider directly.

- [ ] **Step 4: Implement the truthful UI branch**

```ts
providerExecutionApi.activateIndexNow(expectedVersion: number, profileId?: string)
merchantAdminApi.requestProviderJobReconciliation(kind, jobId, expectedVersion)
```

For capability `indexing`, render the dedicated activation/rotation action rather than merchant credential inputs. Do not expose a retry/queue action for `provider_outcome_unknown`; only explicit reconciliation is allowed. Preserve all other five provider-gated surfaces unchanged.

- [ ] **Step 5: Run GREEN and customer-panel regression**

```bash
node --experimental-transform-types --test \
  apps/customer-panel/lib/server-provider-execution/*.test.ts \
  apps/customer-panel/lib/provider-execution-http/handler.test.ts \
  apps/customer-panel/lib/provider-execution-ui/client.test.ts \
  apps/customer-panel/lib/merchant-admin-http/handler.test.ts \
  apps/customer-panel/lib/merchant-admin-ui/route-behavior.test.ts
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
```

Expected: focused new assertions `28/28 PASS`; workspace `526 PASS + 1 intentional skip`; typecheck/build PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-panel/lib/server-provider-execution \
  apps/customer-panel/lib/server-panel-access/postgres-runtime.ts \
  apps/customer-panel/lib/provider-execution-http apps/customer-panel/lib/provider-execution-ui \
  apps/customer-panel/lib/merchant-admin-http apps/customer-panel/lib/merchant-admin-ui \
  apps/customer-panel/components/merchant-admin apps/customer-panel/app/api/merchant-providers/indexnow \
  'apps/customer-panel/app/api/merchant-admin/provider-jobs/[kind]/[jobId]/reconcile'
git commit -m "feat(panel): add indexnow provisioning controls"
```

---

### Task 7: Hardened Owner IndexNow HTTP adapter

**Files:**
- Create: `apps/owner/lib/merchant-provider-execution/indexnow-adapter.ts`
- Create: `apps/owner/lib/merchant-provider-execution/indexnow-adapter.test.ts`
- Modify: `apps/owner/lib/merchant-provider-execution/types.ts:11-32`

**Interfaces:**
- Consumes: decrypted 64-hex credential, safe `{ canonicalHostname }`, immutable execution payload and injected fetch/timeout authority.
- Produces: a frozen `MerchantProviderAdapter` for `indexnow/indexing` with deterministic outcome mapping.

- [ ] **Step 1: Write 24 RED adapter tests**

Prove local credential/public-config/payload validation; no merchant-domain fetch during `validateCredential`; exact fixed endpoint/method/headers/body/order; redirect manual; 200/202 success; 400/403/422 permanent; 429/5xx retryable; redirect/malformed response permanent; timeout/socket reset after send unknown; failure before write classified locally; body/header/time limits; fatal UTF-8; key zeroization; and no URL query/key/raw response in audit/error/reference.

```ts
test("adapter posts one exact immutable payload to the fixed endpoint", async () => {
  const probe = transportReturning(200);
  const result = await adapter(probe.fetch).execute({ credential: keyBytes(), job: claim() });
  assert.deepEqual(probe.calls, [{
    url: "https://api.indexnow.org/indexnow",
    method: "POST",
    redirect: "manual",
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList: URLS }),
  }]);
  assert.deepEqual(result, {
    kind: "succeeded",
    outcomeCode: "accepted",
    safeProviderReference: `indexnow:200:${DIGEST.slice(0, 24)}`,
  });
});
```

- [ ] **Step 2: Run RED**

```bash
NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test \
  apps/owner/lib/merchant-provider-execution/indexnow-adapter.test.ts
```

Expected: FAIL because the adapter module is missing.

- [ ] **Step 3: Implement one injected, bounded request**

```ts
export function createIndexNowAdapter(input: Readonly<{
  fetch: typeof fetch;
  timeoutMs: number;
  maxResponseBytes: 4096;
}>): MerchantProviderAdapter;
```

`validateCredential` checks only the local key, safe public config and their shape; it never calls fetch. `execute` and `reconcile` both use the same one-shot send primitive and exact immutable payload. Track whether request dispatch began so only possible-side-effect failures become unknown. Accept no configurable endpoint. Drain at most 4096 response bytes and emit only fixed secret-free codes/reference. Zero the credential copy and encoded request-body buffer in `finally`.

- [ ] **Step 4: Run GREEN and Owner regression**

```bash
NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test \
  apps/owner/lib/merchant-provider-execution/indexnow-adapter.test.ts \
  apps/owner/lib/merchant-provider-execution/worker.test.ts
npm run typecheck --workspace @celebix/owner
npm run build --workspace @celebix/owner
```

Expected: adapter `24/24 PASS`; existing worker tests remain green; Owner typecheck/build PASS; external calls `0` because fetch is injected.

- [ ] **Step 5: Commit**

```bash
git add apps/owner/lib/merchant-provider-execution
git commit -m "feat(saas): add indexnow provider adapter"
```

---

### Task 8: Worker reconciliation path and disabled staging runner

**Files:**
- Modify: `apps/owner/lib/merchant-provider-execution/worker.ts:130-243`
- Modify: `apps/owner/lib/merchant-provider-execution/worker.test.ts:1-end`
- Create: `apps/owner/lib/merchant-provider-execution/runtime-config.ts`
- Create: `apps/owner/lib/merchant-provider-execution/runtime-config.test.ts`
- Create: `apps/owner/lib/merchant-provider-execution/default-runtime.ts`
- Create: `apps/owner/lib/merchant-provider-execution/default-runtime.test.ts`
- Create: `apps/owner/scripts/run-indexnow-provider-worker.mjs`
- Modify: `tests/saas-phase3/provider-execution-foundation/worker-static-security.test.mjs:1-end`
- Modify: `tests/saas-phase3/indexnow-provider-adapter/static-security.test.mjs:1-end`

**Interfaces:**
- Consumes: profile-validation claim, reconciliation claim, normal execution claim, strict staging config and IndexNow adapter.
- Produces: validation-first/reconciliation-second/execution-third worker ordering and an approved-staging-only one-shot runner.

- [ ] **Step 1: Write 16 RED worker/runtime tests**

Prove validation runs first; then one reconciliation claim; then one normal claim. Reconciliation invokes only `adapter.reconcile`, execution only `adapter.execute`; wrong lease operation fails before adapter; unknown finalize never auto-claims; authority-changed reconciliation sends zero requests; ambiguous reconciliation returns unknown; default/partial/production config gives `disabled`; approved-staging config copies keys, validates a staging DB name and builds one adapter; runner has no interval/cron/loop and does nothing while disabled.

- [ ] **Step 2: Run RED**

```bash
NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test \
  apps/owner/lib/merchant-provider-execution/worker.test.ts \
  apps/owner/lib/merchant-provider-execution/runtime-config.test.ts \
  apps/owner/lib/merchant-provider-execution/default-runtime.test.ts
```

Expected: FAIL on missing runtime modules and missing reconciliation claim path.

- [ ] **Step 3: Implement deterministic claim ordering**

```ts
const validation = await repository.claimProfileValidation(window);
if (validation.kind === "claimed") return validateProfile(validation.profile);
const reconciliation = await repository.claimReconciliation(window);
if (reconciliation.kind === "claimed") return executeClaim(reconciliation.job, "reconcile");
const execution = await repository.claim(window);
if (execution.kind === "claimed") return executeClaim(execution.job, "execute");
return Object.freeze({ kind: "empty" });
```

Finalize reconciliation only through `finalizeReconciliation`. Never catch an unknown result and call execute/reconcile again. Audit only provider code, capability, operation and fixed classification.

The default runtime snapshots environment once, requires deployment tier `staging`, mode `approved_staging`, staging database identity, both key authorities and migrations `049–052`; constructs the workflow repository, keyring, fixed IndexNow adapter and one-entry registry. Production registry remains `createMerchantProviderAdapterRegistry(Object.freeze([]))`. The script invokes `runOnce()` exactly once and prints only the safe result kind.

- [ ] **Step 4: Run GREEN and security tests**

```bash
NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test \
  apps/owner/lib/merchant-provider-execution/*.test.ts
node --test tests/saas-phase3/provider-execution-foundation/worker-static-security.test.mjs \
  tests/saas-phase3/indexnow-provider-adapter/static-security.test.mjs
npm run typecheck --workspace @celebix/owner
npm run build --workspace @celebix/owner
```

Expected: 16 new worker/runtime assertions PASS, all pre-existing Owner provider tests PASS, both static suites PASS, typecheck/build PASS, real IndexNow calls `0`.

- [ ] **Step 5: Commit**

```bash
git add apps/owner/lib/merchant-provider-execution apps/owner/scripts/run-indexnow-provider-worker.mjs \
  tests/saas-phase3/provider-execution-foundation/worker-static-security.test.mjs \
  tests/saas-phase3/indexnow-provider-adapter/static-security.test.mjs
git commit -m "feat(saas): reconcile unknown indexnow outcomes"
```

---

### Task 9: Whole-branch security, browser contract and local evidence

**Files:**
- Create: `tests/saas-phase3/indexnow-provider-adapter/browser-contract.test.mjs`
- Modify: `tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/api/merchant-admin/[...slug]/route.ts:1-end`
- Modify: `tests/saas-phase3/hemenaku-admin-presentation/browser-acceptance.mjs:1-end`
- Modify: `apps/customer-panel/lib/panel-ui/parity-manifest.test.ts:1-end` (assert unchanged P0 parity only)

**Interfaces:**
- Consumes: all local P1 components with fake provider transport and disposable PostgreSQL.
- Produces: code-complete evidence without deployment, external request or false parity promotion.

- [ ] **Step 1: Write 18 RED static/browser contract assertions**

Prove `/seo/fast-indexing` renders disconnected, pending, active, queued, leased, unknown, succeeded and failed states from safe fixtures; activation and reconciliation are exact same-origin mutations; raw key/key path/full submitted query/provider body never enters HTML/RSC/console; unknown has no automatic retry; 390/1024/1025 widths have zero overflow and 48px targets; all browser network stays loopback/data/blob. Assert parity remains `77 complete / 6 provider_gated / 3 legacy_rejected` until Task 10.

- [ ] **Step 2: Run RED**

```bash
node --test tests/saas-phase3/indexnow-provider-adapter/browser-contract.test.mjs
CELEBIX_RUN_LOCAL_BROWSER_ACCEPTANCE=1 node \
  tests/saas-phase3/hemenaku-admin-presentation/browser-acceptance.mjs
```

Expected: new IndexNow route/state matrix fails until the local fixture and acceptance runner support it; parity assertion already passes unchanged.

- [ ] **Step 3: Extend only local fixture/evidence paths**

Fixtures use fake hex keys and injected loopback provider responses. Do not embed any staging/production key, hostname, cookie or token. Preserve all existing merchant-shell acceptance routes and measurements.

- [ ] **Step 4: Run the complete verification matrix**

```bash
npm test --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-contracts
npm test --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/saas-data
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/storefront-shared
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
NODE_OPTIONS='--conditions=react-server' node --experimental-transform-types --test $(rg --files apps/owner | rg '\.test\.(ts|mjs)$')
npm run typecheck --workspace @celebix/owner
npm run build --workspace @celebix/owner
node tests/saas-phase3/provider-execution-foundation/postgres-harness.mjs
node tests/saas-phase3/indexnow-provider-adapter/postgres-harness.mjs
node --test tests/saas-phase3/provider-execution-foundation/*.test.mjs \
  tests/saas-phase3/indexnow-provider-adapter/*.test.mjs
CELEBIX_RUN_LOCAL_BROWSER_ACCEPTANCE=1 node tests/saas-phase3/hemenaku-admin-presentation/browser-acceptance.mjs
git diff --check
! git diff --name-only 27cddded...HEAD | rg '^apps/admin/'
! git diff --name-only 27cddded...HEAD | rg '^apps/storefront-deri-kordon/'
! git diff 27cddded...HEAD | rg -n -i '(BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|postgres(?:ql)?://[^[:space:]]+:[^[:space:]]+@|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|[0-9a-f]{64}\.txt)'
git status --short
```

Expected:

- contracts `136/136 PASS`;
- saas-data `299/299 PASS`;
- storefront `107/107 PASS`;
- customer-panel `526 PASS + 1 intentional skip`;
- Owner all tests, typecheck and build PASS;
- P0 PostgreSQL `53/53 PASS`, IndexNow PostgreSQL `68/68 PASS`, both cleanup PASS;
- provider static/browser contract suites PASS;
- local browser external requests `0`, console errors `0`, overflow `0`, minimum target `48px`;
- `apps/admin/**` and donor storefront diff count `0`;
- secret/verification-file scan no matches outside synthetic test constants;
- staging deploys, production impacts and real IndexNow calls `0`.

- [ ] **Step 5: Commit final local evidence**

```bash
git add tests/saas-phase3/indexnow-provider-adapter/browser-contract.test.mjs \
  'tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/api/merchant-admin/[...slug]/route.ts' \
  tests/saas-phase3/hemenaku-admin-presentation/browser-acceptance.mjs \
  apps/customer-panel/lib/panel-ui/parity-manifest.test.ts
git commit -m "test(saas): verify indexnow provider adapter"
```

- [ ] **Step 6: Request whole-branch review and repair every Critical/Important finding**

Review exact spec coverage, authority boundaries, SQL grants, commit-unknown semantics, SSRF absence, zeroization, immutable payload parsing, all changed files and test adequacy. Rerun the affected RED/GREEN commands after each repair, then repeat the complete matrix.

- [ ] **Step 7: Push without rewriting history**

```bash
git push -u origin codex/saas-phase3-indexnow-adapter
git rev-parse HEAD
git ls-remote --heads origin codex/saas-phase3-indexnow-adapter
```

Expected: local and remote SHA match; force-push count `0`; worktree contains only preserved pre-existing untracked files.

Report the intermediate status:

```text
PASS — INDEXNOW_ADAPTER_CODE_COMPLETE
STAGING INDEXNOW E2E: NOT_EXECUTED — SEPARATE AUTHORIZATION REQUIRED
```

---

### Task 10: Separately authorized staging IndexNow acceptance gate

**Authorization gate:** Stop before this task and obtain explicit written permission for staging secrets/configuration, exact-SHA customer-panel/Owner/shared-storefront deploys and one real IndexNow request. Production permission is not implied.

**Files after successful evidence only:**
- Modify: `apps/customer-panel/lib/panel-ui/parity-manifest.ts:181` (IndexNow entry only)
- Modify: `apps/customer-panel/lib/panel-ui/parity-manifest.test.ts:1-end` (exact totals only)

- [ ] **Step 1: Verify and deploy one exact reviewed SHA to isolated staging only**

Record branch/SHA, services, PostgreSQL 16 identity and migration `001–052` presence without printing secrets. Configure separate matching provider credential/derivation authorities only in staging. Deploy customer-panel, Owner and shared storefront from the exact same SHA. Owner runner remains one-shot; no scheduler or production registry activation.

- [ ] **Step 2: Execute fresh real staging proof**

Using one disposable staging merchant/store and one safe canonical staging storefront:

1. activate IndexNow through the authenticated panel;
2. prove profile/publication/domain/version row binding and no raw key in generic projections;
3. GET the exact public key file and verify wrong host/path/query/old path are denied;
4. save and queue an ordered URL snapshot on the exact canonical host;
5. run the one-shot Owner worker once and prove one request to `api.indexnow.org`;
6. accept only 200/202 as success and show truthful safe UI state;
7. use an injected/isolated ambiguous transport drill to prove no automatic second POST;
8. request explicit reconciliation and prove at most one reconciliation lease/send;
9. scan DB projections, DOM/RSC/network/console/runtime logs for raw key, credential, URL query, cookies and secrets;
10. revoke profile, prove key file closes, revoke disposable credential/config and clean staging rows.

- [ ] **Step 3: Run negative and regression evidence**

Verify wrong/missing session/Origin/role/store/profile/version/domain/path; stale rotation; concurrent provisioning/claim/reconciliation; provider 400/403/422/429/5xx classification; no production host/database/request; and rerun the Task 9 complete matrix against the reviewed source SHA.

- [ ] **Step 4: Promote only the proven parity entry**

Change `/seo/fast-indexing` from `provider_gated` to `complete`, update exact totals to `78 complete / 5 provider_gated / 3 legacy_rejected`, run the parity and complete regression tests, and commit:

```bash
git add apps/customer-panel/lib/panel-ui/parity-manifest.ts \
  apps/customer-panel/lib/panel-ui/parity-manifest.test.ts
git commit -m "test(saas): close indexnow staging acceptance"
git push origin codex/saas-phase3-indexnow-adapter
```

- [ ] **Step 5: Final report**

Report only after all evidence passes:

```text
PASS — SHARED_SAAS_INDEXNOW_ADAPTER_COMPLETE
working feature parity: 78/86 (90.7%)
closed transition parity: 81/86 (94.2%)
provider-gated surfaces: 5/86 (5.8%)
production impacts: 0
```

Include exact SHA/commit map, changed files, PostgreSQL `68/68`, P0 `53/53`, workspace totals, real request count/classification, key-file positive/negative evidence, reconciliation count, security scans, cleanup, credential status, staging-only deployment list, donor/admin diff counts, remote parity and production impact `0`.

## Completion Checklist

- [ ] Tasks 1–9 are complete with nine independently reviewable commits.
- [ ] Every task demonstrated a failing RED test before implementation and a passing GREEN command after it.
- [ ] Manifest checksums are computed from real bytes and migration `051 → 052` rollback/reapply is proven.
- [ ] No raw key, credential, TenantContext, cookie, URL query or provider response crosses a forbidden boundary.
- [ ] No merchant-controlled hostname is fetched during profile validation.
- [ ] Unknown outcomes never automatically retry; reconciliation requires a merchant operation and a separate lease.
- [ ] Default and production runtimes remain disabled.
- [ ] `apps/admin/**` and donor storefront diff counts are zero.
- [ ] Task 10 remains unchecked until separately authorized staging evidence exists.
