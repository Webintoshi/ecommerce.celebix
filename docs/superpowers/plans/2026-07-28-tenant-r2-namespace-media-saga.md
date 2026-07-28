# Tenant R2 Namespace and Durable Media Saga Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one immutable R2 namespace part of every tenant bootstrap and replace the manual product-image write with a recoverable, store-isolated PostgreSQL/R2 saga over one private environment bucket.

**Architecture:** PostgreSQL owns the `store_id -> stores/<storeId>/` binding and media-operation lifecycle. Tenant Core creates the binding inside its existing atomic bootstrap transaction; customer-panel derives every object key from freshly resolved `TenantContext`, reserves it in PostgreSQL, writes one exact R2 object, and finalizes the corresponding `product_media` row. The private bucket is never exposed directly; public media is served only through a strict Worker path grammar and private exports are reserved for a later independent plan.

**Tech Stack:** TypeScript 5.9, Node 24 test runner, Next.js 16 route handlers, PostgreSQL 16, Cloudflare R2 S3/AWS Signature V4, Cloudflare Workers, npm workspaces.

## Global Constraints

- One Celebix-managed private R2 bucket per environment; no per-merchant Cloudflare credentials or buckets.
- Every key is server-generated below exact `stores/<storeId>/`; browser-selected store IDs, prefixes, keys, URLs, buckets, and R2 authorities are forbidden.
- Durable panel session -> current membership/subscription -> `TenantContext.store.id` is the only merchant authority.
- R2 credentials remain server-only; `r2.dev` and direct public-bucket custom-domain access remain disabled.
- Product/content delivery may use only the dedicated Worker R2 binding; `imports/` and `exports/` are denied before R2 access.
- App roles receive no direct table writes. SECURITY DEFINER functions and FORCE RLS enforce authority.
- R2/PostgreSQL unknown commits use one read-only recovery and never a blind second write.
- Existing stores are backfilled; new tenant completion cannot report ready without an exact active namespace.
- No source/config/deployment mutation of production. Staging/Cloudflare deployment is a later explicit gate.
- `apps/admin/**` remains byte-for-byte unchanged.
- This plan does not implement remote catalog-image ingestion or merchant exports; those are the next two plans and consume the interfaces produced here.

---

### Task 1: Safe media-storage bootstrap contract

**Files:**
- Modify: `packages/saas-contracts/src/types.ts:208-234`
- Modify: `packages/saas-contracts/src/contracts.test.ts`
- Modify: `packages/saas-data/src/postgres/parsers.ts:41-81`
- Modify: `packages/saas-data/src/postgres/parsers.test.ts`
- Modify: `apps/owner/lib/saas-persistence/tenant-completion-result.ts:37-82`
- Modify: `apps/owner/lib/saas-persistence/tenant-completion-result.test.ts`

**Interfaces:**
- Produces: `StoreMediaReadiness = Readonly<{ schemaVersion: 1; status: "ready"; version: number }>`.
- Produces: required `CreateStarterTenantResult.mediaStorage: StoreMediaReadiness`.
- Security boundary: the safe result contains no bucket, prefix, R2 URL, key, credential, or store-selected value.

- [ ] **Step 1: Write failing exact-shape contract/parser tests**

Add a literal `mediaStorage: { schemaVersion: 1, status: "ready", version: 1 }` to valid fixtures, then add independent negatives:

```ts
test("tenant result requires safe media readiness without infrastructure authority", () => {
  const parsed = parseCreateStarterTenantResult(validResult, "https://panel.celebix.site");
  assert.deepEqual(parsed.mediaStorage, { schemaVersion: 1, status: "ready", version: 1 });
  for (const mediaStorage of [
    undefined,
    { schemaVersion: 1, status: "pending", version: 1 },
    { schemaVersion: 1, status: "ready", version: 0 },
    { schemaVersion: 1, status: "ready", version: 1, bucket: "private" },
  ]) {
    assert.throws(() => parseCreateStarterTenantResult({ ...validResult, mediaStorage }, "https://panel.celebix.site"));
  }
});
```

The Owner completion validator test must mutate `mediaStorage` and assert `validateTenantCompletionResult(...) === false` for missing, extra-key, non-ready, and non-positive-version values.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test --workspace @celebix/saas-contracts
node --experimental-strip-types --test --test-name-pattern="tenant result requires safe media readiness" packages/saas-data/src/postgres/parsers.test.ts
node --conditions=react-server --experimental-transform-types --test apps/owner/lib/saas-persistence/tenant-completion-result.test.ts
```

Expected: FAIL because `CreateStarterTenantResult` and strict parsers do not recognize `mediaStorage`.

- [ ] **Step 3: Implement the minimal immutable contract**

Add:

```ts
export interface StoreMediaReadiness {
  readonly schemaVersion: 1;
  readonly status: "ready";
  readonly version: number;
}

export interface CreateStarterTenantResult {
  mediaStorage: StoreMediaReadiness;
}
```

Keep every existing `CreateStarterTenantResult` field unchanged. In both strict parsers require exact keys `schemaVersion,status,version`, literal values `1` and `ready`, and a positive safe integer version. Return a structured clone; never accept optional or inherited keys.

- [ ] **Step 4: Run GREEN and regression tests**

Run the three commands from Step 2 plus:

```bash
npm run typecheck --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/owner
```

Expected: PASS with all existing totals plus the new contract negatives.

- [ ] **Step 5: Commit**

```bash
git add packages/saas-contracts/src/types.ts packages/saas-contracts/src/contracts.test.ts \
  packages/saas-data/src/postgres/parsers.ts packages/saas-data/src/postgres/parsers.test.ts \
  apps/owner/lib/saas-persistence/tenant-completion-result.ts \
  apps/owner/lib/saas-persistence/tenant-completion-result.test.ts
git commit -m "feat(saas): define tenant media readiness proof"
```

### Task 2: Transactional namespace port and in-memory authority

**Files:**
- Modify: `packages/saas-data/src/types.ts:1-170`
- Modify: `packages/saas-data/src/ports.ts:1-78`
- Modify: `packages/saas-data/src/index.ts`
- Modify: `packages/saas-data/src/testing/in-memory.ts:1-360`
- Modify: `packages/saas-data/src/testing/in-memory.test.ts`
- Modify: `packages/saas-tenant-core/src/create-starter-tenant.test.ts:66-92`

**Interfaces:**
- Produces: `StoreMediaNamespaceRecord` with exact `storeId`, `namespacePrefix`, `status`, `version`, `createdAt`, `updatedAt`.
- Produces: `StoreMediaNamespaceRepositoryPort.findByStoreId(storeId)` and `.create(record)`.
- Extends: `SaaSDataTransaction.mediaNamespaces` and in-memory inspected state.

- [ ] **Step 1: Write failing in-memory isolation and rollback tests**

```ts
test("media namespace is unique per store and exact to the store UUID", async () => {
  const repository = createInMemorySaaSDataRepository();
  const tx = await repository.beginTransaction();
  const record = {
    storeId: "10000000-0000-4000-8000-000000000001",
    namespacePrefix: "stores/10000000-0000-4000-8000-000000000001/",
    status: "active" as const,
    version: 1,
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
  };
  assert.deepEqual(await tx.mediaNamespaces.create(record), record);
  await assert.rejects(tx.mediaNamespaces.create(record), SaaSDataUniqueConflict);
  await tx.rollback();
  assert.equal(repository.inspectState().mediaNamespaces.length, 0);
});
```

Add negatives for wrong prefix, non-active creation, version other than 1, timestamp mismatch, another store reusing a prefix, and failure injection after namespace create rolling back the whole transaction.

- [ ] **Step 2: Run and verify RED**

Run:

```bash
node --experimental-strip-types --test --test-name-pattern="media namespace" packages/saas-data/src/testing/in-memory.test.ts
```

Expected: TypeScript/test failure because `mediaNamespaces` and `StoreMediaNamespaceRecord` do not exist.

- [ ] **Step 3: Implement ports and in-memory behavior**

Add:

```ts
export type StoreMediaNamespaceStatus = "active" | "suspended" | "deleting" | "deleted";
export interface StoreMediaNamespaceRecord {
  storeId: StoreId;
  namespacePrefix: string;
  status: StoreMediaNamespaceStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface StoreMediaNamespaceRepositoryPort {
  findByStoreId(storeId: string): Promise<StoreMediaNamespaceRecord | null>;
  create(record: StoreMediaNamespaceRecord): Promise<StoreMediaNamespaceRecord>;
}
```

In-memory `create` must validate exact `stores/${record.storeId}/`, require active/version 1/equal timestamps, enforce unique store and prefix, clone all values, call the new `after_media_namespace_create` failure point, and reject after terminal transaction state.

- [ ] **Step 4: Run GREEN**

```bash
npm test --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/saas-data
```

Expected: PASS; existing transaction behavior remains unchanged.

- [ ] **Step 5: Commit**

```bash
git add packages/saas-data/src/types.ts packages/saas-data/src/ports.ts packages/saas-data/src/index.ts \
  packages/saas-data/src/testing/in-memory.ts packages/saas-data/src/testing/in-memory.test.ts \
  packages/saas-tenant-core/src/create-starter-tenant.test.ts
git commit -m "feat(saas): add transactional media namespaces"
```

### Task 3: Tenant Core creates one namespace atomically

**Files:**
- Modify: `packages/saas-tenant-core/src/create-starter-tenant.ts:289-369`
- Modify: `packages/saas-tenant-core/src/create-starter-tenant.test.ts`
- Modify: `apps/owner/lib/self-serve-registration-completion.test.ts`
- Modify: focused tenant-result fixtures under `apps/owner/lib/self-serve-http/**` and `apps/owner/lib/panel-session-handoff/**` only when compilation requires the new safe field

**Interfaces:**
- Consumes: `transaction.mediaNamespaces.create(StoreMediaNamespaceRecord)`.
- Produces: tenant result with exact `mediaStorage: { schemaVersion: 1, status: "ready", version: namespace.version }`.

- [ ] **Step 1: Write failing atomicity/replay tests**

Extend the successful bootstrap test:

```ts
assert.equal(state.mediaNamespaces.length, 1);
assert.deepEqual(state.mediaNamespaces[0], {
  storeId: result.store.id,
  namespacePrefix: `stores/${result.store.id}/`,
  status: "active",
  version: 1,
  createdAt: baseInput.requestedAt,
  updatedAt: baseInput.requestedAt,
});
assert.deepEqual(result.mediaStorage, { schemaVersion: 1, status: "ready", version: 1 });
```

Add tests proving same idempotency replay leaves one namespace and `failAt: "after_media_namespace_create"` leaves zero stores, subscriptions, namespaces, settings, and operations after rollback.

- [ ] **Step 2: Run and verify RED**

```bash
node --experimental-strip-types --test --test-name-pattern="namespace|atomic free starter tenant" packages/saas-tenant-core/src/create-starter-tenant.test.ts
```

Expected: FAIL because Tenant Core does not create the namespace or safe readiness proof.

- [ ] **Step 3: Implement minimal atomic creation**

Immediately after validating the active `free_starter` plan/subscription and confirming the plan contains `media`, create:

```ts
const mediaNamespace = await transaction.mediaNamespaces.create({
  storeId: store.id,
  namespacePrefix: `stores/${store.id}/`,
  status: "active",
  version: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
});
```

Add the safe `mediaStorage` projection to `result`. If the plan lacks `media`, namespace creation fails, or returned store/prefix/version differs, throw the existing safe retryable tenant transaction failure before marking the operation committed.

- [ ] **Step 4: Run GREEN and Owner regressions**

```bash
npm test --workspace @celebix/saas-tenant-core
npm run typecheck --workspace @celebix/saas-tenant-core
npm test --workspace @celebix/owner
npm run typecheck --workspace @celebix/owner
```

Expected: PASS; every successful/replayed fixture carries the safe readiness field.

- [ ] **Step 5: Commit**

```bash
git add packages/saas-tenant-core/src apps/owner/lib
git commit -m "feat(saas): bind tenant creation to media storage"
```

### Task 4: PostgreSQL bootstrap adapter and migration 058 namespace authority

**Files:**
- Modify: `packages/saas-data/src/postgres/repository.ts:52-164,306-358`
- Modify: `packages/saas-data/src/postgres/repository.test.ts`
- Modify: `packages/saas-data/src/postgres/parsers.ts`
- Modify: `packages/saas-data/src/postgres/parsers.test.ts`
- Create: `apps/owner/scripts/sql/saas/202607280058_store_media_namespace_exports.up.sql`
- Create: `apps/owner/scripts/sql/saas/202607280058_store_media_namespace_exports.down.sql`
- Create: `apps/owner/scripts/sql/saas/202607280058_store_media_namespace_exports_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/phase3-tenant-r2-media-manifest.json`
- Create: `tests/saas-phase3/tenant-r2-media/postgres-harness.mjs`
- Create: `tests/saas-phase3/tenant-r2-media/static-security.test.mjs`

**Interfaces:**
- Produces: PostgreSQL implementation of `mediaNamespaces.findByStoreId/create` under `celebix_saas_bootstrap`.
- Produces: `saas.store_media_namespaces` with immutable prefix and no app direct writes.

- [ ] **Step 1: Write failing PostgreSQL adapter query tests**

Require exact SQL/parameters and strict row parsing:

```ts
assert.deepEqual(mediaNamespaceQuery.values, [
  STORE_ID,
  `stores/${STORE_ID}/`,
  "active",
  1,
  NOW,
  NOW,
]);
assert.deepEqual(created, {
  storeId: STORE_ID,
  namespacePrefix: `stores/${STORE_ID}/`,
  status: "active",
  version: 1,
  createdAt: NOW,
  updatedAt: NOW,
});
```

Add corruption tests for extra/missing row keys, wrong prefix/store/status/version/timestamps, duplicate rows, and terminal transaction calls.

- [ ] **Step 2: Run adapter tests and verify RED**

```bash
node --experimental-strip-types --test --test-name-pattern="media namespace|tenant bootstrap" packages/saas-data/src/postgres/repository.test.ts packages/saas-data/src/postgres/parsers.test.ts
```

Expected: FAIL because the Postgres transaction lacks the port and parser.

- [ ] **Step 3: Implement minimal adapter methods**

Use parameterized statements only:

```sql
SELECT store_id, namespace_prefix, status, version, created_at, updated_at
FROM saas.store_media_namespaces WHERE store_id = $1
```

```sql
INSERT INTO saas.store_media_namespaces
  (store_id, namespace_prefix, status, version, created_at, updated_at)
VALUES ($1,$2,$3,$4,$5,$6)
RETURNING store_id, namespace_prefix, status, version, created_at, updated_at
```

The parser independently reconstructs `stores/${storeId}/` and rejects any mismatch.

- [ ] **Step 4: Write the failing disposable PostgreSQL harness**

The harness runs the entire ordered migration set through 058 and contains literal scenarios for PostgreSQL major 16, manifest SHA-256, existing-store backfill, exact prefix/status/version/timestamps, bootstrap-role insert, duplicate and mismatch denial, immutable fields, zero app/host/workflow/PUBLIC DML, FORCE RLS, owner/grants/search paths, backup/restore, rollback/reapply, and cleanup.

Run:

```bash
node tests/saas-phase3/tenant-r2-media/postgres-harness.mjs
```

Expected: FAIL because migration artifacts do not exist.

- [ ] **Step 5: Implement migration 058 namespace DDL and assertions**

The up migration includes this authority shape:

```sql
CREATE TABLE saas.store_media_namespaces (
  store_id uuid PRIMARY KEY REFERENCES saas.stores(id) ON DELETE RESTRICT,
  namespace_prefix text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active',
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT store_media_namespaces_prefix_check
    CHECK (namespace_prefix = 'stores/' || store_id::text || '/'),
  CONSTRAINT store_media_namespaces_status_check
    CHECK (status IN ('active','suspended','deleting','deleted')),
  CONSTRAINT store_media_namespaces_version_check CHECK (version > 0),
  CONSTRAINT store_media_namespaces_timestamp_check CHECK (updated_at >= created_at)
);
```

Add an immutable-authority trigger; enable and FORCE RLS; revoke all from PUBLIC/app/host/workflow; grant only SELECT/INSERT required by `celebix_saas_bootstrap`; backfill each existing store with its exact prefix and store creation timestamp; and provide a dependency-safe disposable-only down migration. Assertions inspect catalog ACLs, trigger ownership, function search paths, RLS flags, and exact constraints.

- [ ] **Step 6: Update checksums and run GREEN**

Generate SHA-256 values from actual files, never manually invent them. Run:

```bash
node tests/saas-phase3/tenant-r2-media/postgres-harness.mjs
node --test tests/saas-phase3/tenant-r2-media/static-security.test.mjs
npm test --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/saas-data
git diff --check
```

Expected: all namespace, migration, rollback/reapply, and adapter tests PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/saas-data/src apps/owner/scripts/sql/saas/202607280058_* \
  apps/owner/scripts/sql/saas/phase3-tenant-r2-media-manifest.json \
  tests/saas-phase3/tenant-r2-media
git commit -m "feat(saas): persist tenant r2 namespaces"
```

### Task 5: Durable media reservation and finalization repository

**Files:**
- Modify: `packages/saas-contracts/src/media/types.ts`
- Modify: `packages/saas-contracts/src/media/validation.ts`
- Modify: `packages/saas-contracts/src/media/index.ts`
- Modify: `packages/saas-contracts/src/media/media.test.ts`
- Modify: `packages/saas-data/src/media/types.ts`
- Modify: `packages/saas-data/src/media/errors.ts`
- Modify: `packages/saas-data/src/media/repository.ts`
- Modify: `packages/saas-data/src/media/repository.test.ts`
- Modify: migration/assertion/down/manifest/harness files created in Task 4

**Interfaces:**
- Produces: `ProductMediaReservation`, `ProductMediaWriteState`, and repository methods `reserveProductMedia`, `markProductMediaUploaded`, `finalizeProductMedia`, `recoverProductMediaOperation`, `requireProductMediaCleanup`, `markProductMediaDeleted`.
- Existing read/update/reorder/archive methods remain compatible.

- [ ] **Step 1: Write failing contract and repository tests**

Define the observable result:

```ts
export type ProductMediaWriteState =
  | "reserved" | "uploaded" | "committed" | "cleanup_required" | "deleted";
export type ProductMediaReservation = Readonly<{
  operationId: string;
  mediaId: string;
  productId: string;
  objectKey: string;
  publicUrl: string;
  mediaType: PublicImageMediaType;
  byteSize: number;
  payloadSha256: string;
  state: ProductMediaWriteState;
  version: number;
}>;
```

Tests prove the repository ignores/rejects browser object authority, derives exact keys from `TenantContext`, sends current plan/storage authority, rejects another store/product, recovers exact operation/fingerprint read-only, never writes twice after unknown commit, and deep-freezes safe results.

- [ ] **Step 2: Run tests and verify RED**

```bash
node --experimental-strip-types --test --test-name-pattern="media reservation" packages/saas-contracts/src/media/media.test.ts
node --experimental-strip-types --test --test-name-pattern="media reservation|media finalization|media cleanup" packages/saas-data/src/media/repository.test.ts
```

Expected: FAIL because lifecycle contracts and methods do not exist.

- [ ] **Step 3: Implement minimal repository lifecycle**

Every method takes `tenantContext`, `now`, operation/fingerprint inputs, and target IDs. It calls one reviewed SQL function, validates one exact outcome/projection, uses READ COMMITTED for writes, READ ONLY for recovery, evicts the client after unknown COMMIT, and performs no automatic second write.

`reserveProductMedia` constructs:

```ts
const objectKey = `stores/${authority.storeId}/products/${productId}/${mediaId}.${extension}`;
const publicUrl = `${configuredMediaOrigin}/${objectKey}`;
```

The origin is constructor-owned exact HTTPS configuration. It is never accepted through method input.

- [ ] **Step 4: Extend migration 058 with lifecycle authority**

Add `saas.store_media_operations` with immutable store/target/key/digest fields, one-way states, expected versions, byte reservation, timestamps, and safe failure code. Add SECURITY DEFINER functions for reserve, mark uploaded, finalize, read-only recover, cleanup-required, and deleted. Reservation locks namespace/quota rows and calculates active plus nonterminal bytes so concurrent reservations cannot exceed `storageBytes`.

The existing terminal-only `product_media_operations` table remains unchanged for existing alt/reorder/archive idempotency. Finalization creates one active `product_media` row and records the committed projection atomically.

- [ ] **Step 5: Add PostgreSQL scenarios and run GREEN**

Add literal harness scenarios for two-store substitution, concurrency at quota boundary, state-transition skips, operation mismatch, replay, invalid prefix, wrong product/variant, membership/feature/subscription/version failures, cleanup proof, direct DML denial, backup/restore, and rollback/reapply.

Run:

```bash
node tests/saas-phase3/tenant-r2-media/postgres-harness.mjs
npm test --workspace @celebix/saas-contracts
npm test --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-data
```

Expected: PASS with the expanded fixed scenario total printed by the harness.

- [ ] **Step 6: Recompute manifest and commit**

```bash
git add packages/saas-contracts/src/media packages/saas-data/src/media \
  apps/owner/scripts/sql/saas/202607280058_* \
  apps/owner/scripts/sql/saas/phase3-tenant-r2-media-manifest.json \
  tests/saas-phase3/tenant-r2-media
git commit -m "feat(saas): add durable media write lifecycle"
```

### Task 6: R2 integrity adapter and manual upload saga

**Files:**
- Modify: `apps/customer-panel/lib/server-media/r2-storage.ts`
- Modify: `apps/customer-panel/lib/server-media/r2-storage.test.ts`
- Modify: `apps/customer-panel/lib/server-media/runtime.ts`
- Modify: `apps/customer-panel/lib/server-media/default.ts`
- Create: `apps/customer-panel/lib/server-media/upload-service.ts`
- Create: `apps/customer-panel/lib/server-media/upload-service.test.ts`
- Modify: `apps/customer-panel/lib/media-http/handler.ts`
- Modify: `apps/customer-panel/lib/media-http/handler.test.ts`
- Modify: `tests/saas-phase3/product-media/static-security.test.mjs`

**Interfaces:**
- Extends: `ProductMediaStorage.put` to require `payloadSha256` metadata.
- Produces: `ProductMediaStorage.head(objectKey)` returning exact length/type/SHA metadata or `not_found`.
- Produces: `createProductMediaUploadService({ repository, storage, now })` which owns the saga; HTTP handler only validates request authority/body and maps safe results.

- [ ] **Step 1: Write failing real-boundary R2 tests**

Tests use a local fake `fetch` boundary but assert the real SigV4 request inputs and parsed behavior:

```ts
await storage.put({ objectKey, mediaType: "image/webp", bytes, payloadSha256 });
assert.equal(request.method, "PUT");
assert.equal(request.headers.get("x-amz-meta-celebix-sha256"), payloadSha256);
const head = await storage.head(objectKey);
assert.deepEqual(head, {
  kind: "found",
  byteSize: bytes.byteLength,
  mediaType: "image/webp",
  payloadSha256,
});
```

Add status, redirect, malformed/missing metadata, mismatched length/type/digest, timeout/network, and secret-free error tests.

- [ ] **Step 2: Write failing saga tests**

Use a real upload service with narrow fake repository/storage boundaries. Assert observable durable calls and returned result for reserve -> PUT -> mark uploaded -> finalize success; R2 failure; known finalize rejection; finalize unknown commit and one recovery; committed/absent recovery; cleanup-required; and cross-store/object substitution before storage access.

- [ ] **Step 3: Run and verify RED**

```bash
cd apps/customer-panel
node --experimental-transform-types --test \
  lib/server-media/r2-storage.test.ts \
  lib/server-media/upload-service.test.ts \
  lib/media-http/handler.test.ts
```

Expected: FAIL because HEAD/integrity metadata and the upload service do not exist.

- [ ] **Step 4: Implement R2 HEAD and upload service**

Add signed `HEAD` using the same exact host/canonical URI builder as PUT/DELETE. Accept only 200 or 404, reject redirects, parse a single canonical content type, non-negative bounded `content-length`, and exact lowercase 64-character metadata digest.

The upload service computes SHA-256 from validated bytes, calls lifecycle methods in order, and owns all delete/recovery decisions. It never logs the request, object URL, credentials, bytes, or digest. The HTTP handler no longer calls `storage.put` and `media.attachMedia` directly.

- [ ] **Step 5: Run GREEN and app regressions**

```bash
cd apps/customer-panel
node --experimental-transform-types --test \
  lib/server-media/*.test.ts lib/media-http/*.test.ts
cd ../..
node --test tests/saas-phase3/product-media/static-security.test.mjs
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
```

Expected: PASS; no direct browser-to-R2 authority and no build errors.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-panel/lib/server-media apps/customer-panel/lib/media-http \
  tests/saas-phase3/product-media/static-security.test.mjs
git commit -m "feat(customer-panel): make media uploads recoverable"
```

### Task 7: Private bucket public-media Worker boundary

**Files:**
- Create: `apps/media-gateway/package.json`
- Create: `apps/media-gateway/tsconfig.json`
- Create: `apps/media-gateway/src/key-authority.ts`
- Create: `apps/media-gateway/src/key-authority.test.ts`
- Create: `apps/media-gateway/src/worker.ts`
- Create: `apps/media-gateway/src/worker.test.ts`
- Create: `apps/media-gateway/wrangler.jsonc`
- Modify: root `package.json` only if workspace glob does not already include `apps/*`
- Modify: root `package-lock.json` only through `npm install` and only if workspace metadata changes
- Modify: `apps/customer-panel/lib/server-media/config.ts`
- Modify: `apps/customer-panel/lib/server-media/config.test.ts`
- Modify: `apps/storefront-shared/lib/runtime-config.ts`
- Modify: `apps/storefront-shared/lib/runtime-config.test.ts`
- Create: `tests/saas-phase3/tenant-r2-media/media-gateway-security.test.mjs`

**Interfaces:**
- Produces: pure `parsePublicMediaKey(pathname)` returning only exact product/content keys.
- Produces: Worker `fetch(request, env)` using a private `MEDIA_BUCKET` R2 binding.
- Configuration contract: public media origin is the exact Worker custom origin; direct `r2.dev` and `r2.cloudflarestorage.com` origins are rejected.

- [ ] **Step 1: Write failing key-authority and Worker tests**

Positive literal:

```ts
assert.deepEqual(
  parsePublicMediaKey(`/stores/${STORE}/products/${PRODUCT}/${MEDIA}.webp`),
  { kind: "product", key: `stores/${STORE}/products/${PRODUCT}/${MEDIA}.webp` },
);
```

Negatives include wrong methods, query/fragment, traversal/encoded traversal, backslashes, duplicate slash, uppercase UUID/extension, wrong extension, child suffix, `imports`, `exports`, unknown class, credentials, Range, Authorization, Cookie, and forwarded/private headers. The R2 fake shows zero `get` calls for every denial.

- [ ] **Step 2: Run and verify RED**

```bash
npm test --workspace @celebix/media-gateway
```

Expected: FAIL because the workspace and authority do not exist.

- [ ] **Step 3: Implement minimal Worker**

The handler accepts only GET/HEAD with no query/body/private headers; parses exact path grammar; reads exactly one R2 object through the binding; permits only JPEG/PNG/WebP metadata; returns immutable content type, nosniff, bounded public cache policy, ETag, and content length; maps missing to 404 and storage failure to safe 503. It never lists the bucket and never constructs keys from headers.

`wrangler.jsonc` declares only the `MEDIA_BUCKET` binding and contains no account ID, credential, production route, or bucket name. Environment binding is supplied only at separately authorized deploy time.

- [ ] **Step 4: Harden configuration**

Both customer-panel and storefront parsers require an exact canonical HTTPS media gateway origin and reject `.r2.dev`, `.r2.cloudflarestorage.com`, localhost, internal names, credentials, ports, paths, query, fragment, whitespace, and production-like values in staging.

- [ ] **Step 5: Run GREEN and regression builds**

```bash
npm test --workspace @celebix/media-gateway
npm run typecheck --workspace @celebix/media-gateway
node --test tests/saas-phase3/tenant-r2-media/media-gateway-security.test.mjs
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/storefront-shared
```

Expected: PASS; direct bucket origins fail closed and storefront public media URLs remain exact Worker URLs.

- [ ] **Step 6: Commit**

```bash
git add apps/media-gateway apps/customer-panel/lib/server-media \
  apps/storefront-shared/lib package.json package-lock.json \
  tests/saas-phase3/tenant-r2-media
git commit -m "feat(saas): add private r2 media gateway"
```

### Task 8: Whole-slice verification and handoff

**Files:**
- Modify: `docs/superpowers/plans/2026-07-28-tenant-r2-namespace-media-saga.md` checkbox state only
- No production configuration or deployment files

**Interfaces:**
- Validates every output of Tasks 1-7.
- Produces the stable foundation consumed by bulk catalog media ingestion and independent export plans.

- [ ] **Step 1: Run focused and complete tests**

```bash
npm ci
npm test --workspace @celebix/saas-contracts
npm test --workspace @celebix/saas-data
npm test --workspace @celebix/saas-tenant-core
npm test --workspace @celebix/owner
npm test --workspace @celebix/customer-panel
npm test --workspace @celebix/storefront-shared
npm test --workspace @celebix/media-gateway
node tests/saas-phase3/tenant-r2-media/postgres-harness.mjs
node --test tests/saas-phase3/tenant-r2-media/*.test.mjs
node --test tests/saas-phase3/product-media/static-security.test.mjs
npm run test:saas-phase1
```

Expected: every command PASS with no skipped new isolation scenario.

- [ ] **Step 2: Run typecheck/build matrix**

```bash
npm run typecheck --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/saas-tenant-core
npm run typecheck --workspace @celebix/owner
npm run build --workspace @celebix/owner
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/storefront-shared
npm run build --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/media-gateway
```

Expected: PASS with no TypeScript or Next build errors.

- [ ] **Step 3: Run security/scope/secret scans**

```bash
git diff --check
git diff --name-only 42f847d8384ebc00492a16ba03b5471643419591...HEAD
git diff --name-only 42f847d8384ebc00492a16ba03b5471643419591...HEAD -- apps/admin
git diff 42f847d8384ebc00492a16ba03b5471643419591...HEAD | \
  rg -n "BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|x-amz-signature|secret_access_key|session=|__Host-celebix_panel|r2\.dev"
```

Expected: `git diff --check` PASS; `apps/admin` output empty; secret scan has no credential/token material and only intentional denial-test literals.

- [ ] **Step 4: Verify cleanup and remote parity**

Confirm the disposable harness removed data/socket directories and left no PostgreSQL process. Then:

```bash
git status --short
git push origin codex/guzide-woocommerce-migration-foundation
git rev-parse HEAD
git rev-parse origin/codex/guzide-woocommerce-migration-foundation
```

Expected: clean worktree and identical local/remote SHA. Staging deployments, Cloudflare binding mutation, and production impacts remain zero.

- [ ] **Step 5: Final review and next-plan gate**

Run `superpowers:requesting-code-review`, repair Critical/Important findings with fresh RED/GREEN evidence, and re-run affected plus full verification. Report this slice as code-complete, not live-complete. Then write and execute the separate `bulk catalog image ingestion` plan against the resulting exact SHA.
