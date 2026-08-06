# Basit Kargo Controlled Fulfillment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tenant-owned Basit Kargo connection, controlled live quote selection, durable shipment/barcode/label creation, verified tracking, safe COD settlement, return handling, and storefront tracking without weakening existing manual fulfillment.

**Architecture:** A new server-only `@celebix/shipping-adapters` package owns provider transport and Basit Kargo parsing. Additive PostgreSQL migrations own tenant profiles, resource bindings, quotes, shipments, jobs, observations, operations, labels, and monotonic settlement; `@celebix/saas-data` exposes separate app and workflow repositories. The customer panel presents controlled actions, while storefront account/receipt projections receive only safe verified tracking facts.

**Tech Stack:** Node.js 20+, TypeScript 5.9, Next.js 16 App Router, React 19, PostgreSQL 16 SECURITY DEFINER RPCs with FORCE RLS, Cloudflare R2 through the existing media storage boundary, Node test runner, disposable PostgreSQL harnesses.

## Global Constraints

- Provider order is Basit Kargo first; ShipEntegra and Geliver are adapter additions, not alternate order implementations.
- Every store uses its own encrypted Bearer token and its own Basit Kargo account resources.
- Controlled automation is mandatory: quotes are read-only; only an explicit `orders.fulfill` action may create a shipment.
- Browser payloads never contain store, tenant, profile, credential, provider shipment, R2 object-key, or webhook authority.
- Basit Kargo's exact production origin is `https://basitkargo.com/api`; redirects and arbitrary origin overrides are forbidden.
- A provider create result that is not proven is `provider_outcome_unknown` and must never be blind-retried.
- Webhooks are refresh signals only because the public Basit Kargo documentation does not define a signature scheme.
- COD payment completion requires a verified provider read-back of `DELIVERED`, an exact COD order, and the store setting enabled.
- The first UI ships all remaining quantities in one shipment; database rows preserve per-order-item quantities for future partial fulfillment.
- Label SVG is private, validated, digest-bound, stored in tenant R2, and downloaded as an attachment.
- Existing manual order tracking and every payment/checkout path remain available if the provider is disabled or unavailable.
- No new third-party runtime dependency is allowed.
- `.superpowers/` remains untracked and untouched; `apps/donor` remains byte-unchanged.
- Real provider execution is opt-in and is never claimed without a valid tenant token and recorded staging evidence.

---

### Task 1: Freeze the Public Shipping Contracts

**Files:**
- Create: `packages/saas-contracts/src/shipping/types.ts`
- Create: `packages/saas-contracts/src/shipping/validation.ts`
- Create: `packages/saas-contracts/src/shipping/index.ts`
- Create: `packages/saas-contracts/src/shipping/shipping.test.ts`
- Modify: `packages/saas-contracts/src/index.ts`
- Modify: `packages/saas-contracts/src/authorization/actions.ts`

**Interfaces:**
- Consumes: existing `TenantContext`, `OrderStatus`, `OrderPaymentStatus`, and merchant role policy.
- Produces: `ShippingConnection`, `ShippingResource`, `ShippingPackage`, `ShippingQuoteSession`, `ShippingQuoteOption`, `Shipment`, `ShipmentEvent`, `ShipmentLabel`, `ShipmentMutationResult`, exact parsers, and `shipping.read` / `shipping.manage` merchant actions.

- [ ] **Step 1: Write failing contract tests**

```ts
test("shipping projections are exact, frozen, and contain no private authority", () => {
  const connection = parseShippingConnection({
    providerCode: "basit_kargo",
    displayName: "Basit Kargo",
    status: "active",
    credentialVersion: 2,
    selectedBrandLabel: "Güzide Kuyumcu",
    selectedAddressLabel: "Merkez Depo",
    codDeliveredMarksPaid: false,
    verifiedAt: "2026-08-06T12:00:00.000Z",
    version: 4,
  });
  assert.equal(Object.isFrozen(connection), true);
  assert.equal(Object.hasOwn(connection, "storeId"), false);
  assert.equal(Object.hasOwn(connection, "token"), false);
});

test("shipment status and provider code enums are finite", () => {
  assert.deepEqual(SHIPPING_PROVIDER_CODES, ["basit_kargo"]);
  assert.deepEqual(SHIPMENT_STATUSES, [
    "draft", "creating", "ready", "shipped", "out_for_delivery",
    "delivered", "delayed", "returning", "returned", "lost",
    "cancelled", "provider_outcome_unknown", "attention_required",
  ]);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test --workspace @celebix/saas-contracts -- --test-name-pattern='shipping'`

Expected: FAIL because `src/shipping/index.ts` and its exports do not exist.

- [ ] **Step 3: Implement exact immutable contracts**

```ts
export const SHIPPING_PROVIDER_CODES = Object.freeze(["basit_kargo"] as const);
export const SHIPPING_CONNECTION_STATUSES = Object.freeze([
  "pending", "active", "disabled", "revoked", "attention_required",
] as const);
export const SHIPMENT_STATUSES = Object.freeze([
  "draft", "creating", "ready", "shipped", "out_for_delivery",
  "delivered", "delayed", "returning", "returned", "lost",
  "cancelled", "provider_outcome_unknown", "attention_required",
] as const);

export interface ShippingPackage {
  readonly heightCm: number;
  readonly widthCm: number;
  readonly depthCm: number;
  readonly weightKg: number;
}

export interface ShippingQuoteOption {
  readonly id: string;
  readonly handlerCode: string;
  readonly handlerName: string;
  readonly desiKg: number;
  readonly priceCents: number;
  readonly codFeeCents?: number;
  readonly currency: "TRY";
}
```

Implement exact-key parsers with dense-array, UUID, bounded UTF-8 text, safe-integer minor units, ISO timestamp, finite enum, deep-freeze, and unknown-key rejection. Add `shipping.read` to editor/analyst and `shipping.manage` only to store owner/admin/editor through the existing role matrix.

- [ ] **Step 4: Run contract tests and typecheck**

Run: `npm test --workspace @celebix/saas-contracts && npm run typecheck --workspace @celebix/saas-contracts`

Expected: all contract tests and typecheck PASS.

- [ ] **Step 5: Commit the contract boundary**

```bash
git add packages/saas-contracts/src/shipping packages/saas-contracts/src/index.ts packages/saas-contracts/src/authorization/actions.ts
git commit -m "feat(shipping): add controlled fulfillment contracts"
```

---

### Task 2: Create the Server-Only Shipping Adapter Package

**Files:**
- Create: `packages/shipping-adapters/package.json`
- Create: `packages/shipping-adapters/tsconfig.json`
- Create: `packages/shipping-adapters/src/contracts.ts`
- Create: `packages/shipping-adapters/src/validation.ts`
- Create: `packages/shipping-adapters/src/transport.ts`
- Create: `packages/shipping-adapters/src/transport.test.ts`
- Create: `packages/shipping-adapters/src/registry.ts`
- Create: `packages/shipping-adapters/src/registry.test.ts`
- Create: `packages/shipping-adapters/src/index.ts`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: Task 1 shipping types.
- Produces: `ShippingProviderAdapter<TCredential>`, `ShippingProviderTransport`, normalized provider results, exact transport, and `resolveShippingProviderAdapter("basit_kargo")`.

- [ ] **Step 1: Write failing adapter-boundary tests**

```ts
test("transport permits only exact Basit Kargo HTTPS requests", async () => {
  let called = false;
  const transport = createShippingProviderTransport({ fetch: async () => {
    called = true;
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  } });
  await assert.rejects(() => transport.request({
    origin: "https://evil.example",
    path: "/handlers",
    method: "GET",
    token: "bk_test_token_1234",
    signal: AbortSignal.timeout(100),
  }), /shipping_transport_invalid/u);
  assert.equal(called, false);
});

test("registry contains only the reviewed provider", () => {
  assert.equal(resolveShippingProviderAdapter("basit_kargo").providerCode, "basit_kargo");
  assert.throws(() => resolveShippingProviderAdapter("shipentegra" as never));
});
```

- [ ] **Step 2: Run package test and verify RED**

Run: `npm test --workspace @celebix/shipping-adapters`

Expected: FAIL because the workspace package is absent.

- [ ] **Step 3: Define the adapter interface and safe results**

```ts
export interface ShippingProviderAdapter<TCredential extends object> {
  readonly providerCode: "basit_kargo";
  parseCredential(value: unknown): TCredential;
  verifyCredential(input: VerifyShippingCredentialInput<TCredential>): Promise<ShippingCredentialVerification>;
  quotePackages(input: QuoteShippingPackagesInput<TCredential>): Promise<ShippingQuoteResult>;
  createShipment(input: CreateProviderShipmentInput<TCredential>): Promise<CreateProviderShipmentResult>;
  getShipment(input: GetProviderShipmentInput<TCredential>): Promise<GetProviderShipmentResult>;
  cancelShipment(input: CancelProviderShipmentInput<TCredential>): Promise<ProviderShipmentMutationResult>;
  createReturnShipment(input: CreateReturnShipmentInput<TCredential>): Promise<CreateProviderShipmentResult>;
  downloadLabel(input: DownloadShippingLabelInput<TCredential>): Promise<ShippingLabelDownloadResult>;
}
```

Result unions must distinguish `succeeded`, `rejected`, `credential_invalid`, `throttled`, `temporary_failure`, and `provider_outcome_unknown`. Only create/cancel/return transport ambiguity may yield `provider_outcome_unknown`; safe GET ambiguity is `temporary_failure`.

- [ ] **Step 4: Implement exact transport rules**

Use an injected `fetch` function, exact origin/path allowlist, methods `GET|POST|PUT|DELETE`, `redirect: "manual"`, 10-second connect/read budget, 1 MiB JSON response limit, 2 MiB SVG limit, canonical `application/json` and `image/svg+xml` handling, and best-effort zeroing of copied token bytes. Parse `Retry-After` only as an integer from 1 through 900 seconds.

- [ ] **Step 5: Generate the workspace lock entry and run GREEN**

Run: `npm install --package-lock-only --ignore-scripts`

Run: `npm test --workspace @celebix/shipping-adapters && npm run typecheck --workspace @celebix/shipping-adapters`

Expected: adapter transport/registry tests and typecheck PASS without a new external dependency.

- [ ] **Step 6: Commit the adapter foundation**

```bash
git add packages/shipping-adapters package-lock.json
git commit -m "feat(shipping): add server-only adapter foundation"
```

---

### Task 3: Implement the Basit Kargo Adapter

**Files:**
- Create: `packages/shipping-adapters/src/providers/basit-kargo/types.ts`
- Create: `packages/shipping-adapters/src/providers/basit-kargo/validation.ts`
- Create: `packages/shipping-adapters/src/providers/basit-kargo/adapter.ts`
- Create: `packages/shipping-adapters/src/providers/basit-kargo/adapter.test.ts`
- Create: `packages/shipping-adapters/src/providers/basit-kargo/fixture.ts`
- Modify: `packages/shipping-adapters/src/registry.ts`
- Modify: `packages/shipping-adapters/src/index.ts`
- Modify: `packages/shipping-adapters/package.json`

**Interfaces:**
- Consumes: Task 2 adapter/transport interfaces.
- Produces: `BasitKargoAdapter`, `BasitKargoCredential { token: string }`, `createBasitKargoFixtureTransport`, `BASIT_KARGO_CREATE_FIXTURE`, exact status mapping, and handler/resource/quote/shipment/label parsers.

- [ ] **Step 1: Write the failing provider matrix**

```ts
test("Basit Kargo maps every documented status", () => {
  assert.deepEqual([
    "NEW", "READY_TO_SHIP", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED",
    "NEEDS_SUPPORT", "DELAYED", "RETURNING", "RETURNED", "LOST",
  ].map(mapBasitKargoStatus), [
    "ready", "ready", "shipped", "out_for_delivery", "delivered",
    "attention_required", "delayed", "returning", "returned", "lost",
  ]);
});

test("create timeout is unknown and is never retried by the adapter", async () => {
  const transport = createBasitKargoFixtureTransport([{ kind: "unknown" }]);
  const result = await new BasitKargoAdapter({ transport }).createShipment(BASIT_KARGO_CREATE_FIXTURE);
  assert.deepEqual(result, { kind: "provider_outcome_unknown", providerReference: null });
  assert.equal(transport.calls.length, 1);
});
```

Cover handlers, brands, addresses, package quote, barcode create, shipment GET, cancellation, return barcode, SVG label, 401/403, 400/422, 429, 5xx, malformed JSON, oversized response, redirect, and unknown fields.

- [ ] **Step 2: Run the provider test and verify RED**

Run: `npm test --workspace @celebix/shipping-adapters -- --test-name-pattern='Basit Kargo|create timeout'`

Expected: FAIL because the provider implementation does not exist.

- [ ] **Step 3: Implement exact endpoint mapping**

```ts
const PATHS = Object.freeze({
  handlers: "/handlers",
  brands: "/firm/brand",
  addresses: "/firm/address",
  quote: "/handlers/fee/packages",
  create: "/v2/order/barcode",
} as const);

export function mapBasitKargoStatus(value: BasitKargoStatus): ShipmentStatus {
  return ({
    NEW: "ready", READY_TO_SHIP: "ready", SHIPPED: "shipped",
    OUT_FOR_DELIVERY: "out_for_delivery", DELIVERED: "delivered",
    NEEDS_SUPPORT: "attention_required", DELAYED: "delayed",
    RETURNING: "returning", RETURNED: "returned", LOST: "lost",
  } as const)[value];
}
```

Build request bodies only from normalized server inputs. Send amounts in Basit Kargo's documented major-unit numeric fields after exact minor-unit conversion. The credential parser accepts one canonical token string of 16–4096 printable non-space ASCII characters.

- [ ] **Step 4: Implement response classification and redaction**

Return bounded safe codes only. Never include provider body, token, recipient, address, email, phone, provider stack, or raw SVG in errors. Keep exact provider ID, barcode, tracking number, handler, status, and price only in successful private results.

- [ ] **Step 5: Run the full adapter package**

Run: `npm test --workspace @celebix/shipping-adapters && npm run typecheck --workspace @celebix/shipping-adapters`

Expected: all package tests PASS.

- [ ] **Step 6: Commit the first provider**

```bash
git add packages/shipping-adapters
git commit -m "feat(shipping): add Basit Kargo adapter"
```

---

### Task 4: Add Tenant Shipping Connection Authority

**Files:**
- Create: `apps/owner/scripts/sql/saas/202608060093_shipping_provider_foundation.up.sql`
- Create: `apps/owner/scripts/sql/saas/202608060093_shipping_provider_foundation.down.sql`
- Create: `apps/owner/scripts/sql/saas/202608060093_shipping_provider_foundation_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/phase4m-shipping-provider-foundation-manifest.json`
- Create: `apps/owner/scripts/sql/saas/shipping-provider-foundation-migration.test.ts`
- Create: `tests/saas-phase3/shipping-provider-foundation/postgres-harness.mjs`
- Create: `tests/saas-phase3/shipping-provider-foundation/static-security.test.mjs`
- Modify: `apps/owner/scripts/migrate-store-db-selfhosted.mjs`

**Interfaces:**
- Consumes: migrations 001–092 and existing app/workflow roles.
- Produces: provider definitions/profiles/resources/jobs/operations and exact RPCs `shipping_connection_*`, `shipping_validation_*`, and `shipping_provider_preflight`.

- [ ] **Step 1: Write failing manifest/static tests**

```ts
test("093 is additive, forced-RLS, secret-safe, and function-only", () => {
  assert.match(up, /CREATE TABLE saas[.]shipping_provider_profiles/u);
  assert.match(up, /ALTER TABLE saas[.]shipping_provider_profiles FORCE ROW LEVEL SECURITY/u);
  assert.doesNotMatch(up, /GRANT (SELECT|INSERT|UPDATE|DELETE).*shipping_provider_profiles.*saas_app/u);
  assert.match(up, /GRANT EXECUTE ON FUNCTION saas[.]shipping_connection_current/u);
});
```

- [ ] **Step 2: Run the migration tests and verify RED**

Run: `node --experimental-transform-types --test apps/owner/scripts/sql/saas/shipping-provider-foundation-migration.test.ts`

Expected: FAIL because migration 093 and manifest do not exist.

- [ ] **Step 3: Add the connection schema and exact constraints**

```sql
CREATE TABLE saas.shipping_provider_profiles (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  provider_code text NOT NULL CHECK (provider_code = 'basit_kargo'),
  status text NOT NULL CHECK (status IN ('pending','active','disabled','revoked','attention_required')),
  credential_envelope jsonb NOT NULL,
  credential_digest text NOT NULL,
  credential_key_id text NOT NULL,
  credential_version bigint NOT NULL CHECK (credential_version > 0),
  account_identity_digest text,
  selected_brand_resource_id uuid,
  selected_address_resource_id uuid,
  cod_delivered_marks_paid boolean NOT NULL DEFAULT false,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (store_id, id)
);

CREATE UNIQUE INDEX shipping_provider_profiles_one_current
  ON saas.shipping_provider_profiles (store_id, provider_code)
  WHERE status <> 'revoked';
```

Add closed resource kinds `brand|address|handler`, immutable operation fingerprints, validation jobs with lease/fence bounds, owner-only tables, FORCE RLS, exact search paths, and no dynamic SQL.

- [ ] **Step 4: Implement exact app/workflow RPCs**

App RPCs: current, save encrypted token, choose resources/settings, rotate, revoke, recover operation. Workflow RPCs: claim validation, read sealed credential under live lease, complete validation with safe resources, fail/requeue validation. Every function receives full `TenantContext` authority in the established order and rechecks active membership/plan/store.

- [ ] **Step 5: Prove PostgreSQL behavior**

The disposable PG16 harness must cover: two stores, duplicate profile race, operation replay/mismatch, analyst denial, app zero table DML, workflow lease fencing, token rotation invalidation, resource cross-store rejection, revoke terminality, backup/restore, guarded down, clean down/up, and cleanup.

Run: `node tests/saas-phase3/shipping-provider-foundation/postgres-harness.mjs`

Expected: every named scenario PASS.

- [ ] **Step 6: Pin all artifacts and commit**

Run: `node --experimental-transform-types --test apps/owner/scripts/sql/saas/shipping-provider-foundation-migration.test.ts tests/saas-phase3/shipping-provider-foundation/static-security.test.mjs`

```bash
git add apps/owner/scripts/sql/saas/202608060093_* apps/owner/scripts/sql/saas/phase4m-shipping-provider-foundation-manifest.json apps/owner/scripts/sql/saas/shipping-provider-foundation-migration.test.ts apps/owner/scripts/migrate-store-db-selfhosted.mjs tests/saas-phase3/shipping-provider-foundation
git commit -m "feat(shipping): add tenant provider authority"
```

---

### Task 5: Add Connection Repositories and Validation Runtime

**Files:**
- Create: `packages/saas-data/src/shipping/errors.ts`
- Create: `packages/saas-data/src/shipping/types.ts`
- Create: `packages/saas-data/src/shipping/credential-crypto.ts`
- Create: `packages/saas-data/src/shipping/credential-crypto.test.ts`
- Create: `packages/saas-data/src/shipping/repository.ts`
- Create: `packages/saas-data/src/shipping/repository.test.ts`
- Create: `packages/saas-data/src/shipping/workflow-repository.ts`
- Create: `packages/saas-data/src/shipping/workflow-repository.test.ts`
- Create: `packages/saas-data/src/shipping/index.ts`
- Modify: `packages/saas-data/src/index.ts`
- Create: `apps/customer-panel/lib/server-shipping/runtime.ts`
- Create: `apps/customer-panel/lib/server-shipping/runtime.test.ts`
- Create: `apps/customer-panel/lib/server-shipping/default.ts`
- Create: `apps/customer-panel/lib/server-shipping/validation-worker.ts`
- Create: `apps/customer-panel/lib/server-shipping/validation-worker.test.ts`

**Interfaces:**
- Consumes: Task 1 contracts, Task 3 adapter, Task 4 RPCs, existing server panel access and provider keyring environment.
- Produces: `ShippingAdminRepository`, `ShippingWorkflowRepository`, registered `ServerShippingRuntime`, and `runShippingValidationJob(jobId)`.

- [ ] **Step 1: Write failing repository and crypto tests**

```ts
test("connection save writes ciphertext and never raw token", async () => {
  await repository.saveConnection({ tenantContext, now, operationId, token: "bk_live_secret" });
  assert.doesNotMatch(JSON.stringify(pool.calls), /bk_live_secret/u);
  assert.match(String(call.values[7]), /"algorithm":"A256GCM"/u);
});

test("validation lease alone opens one exact credential", async () => {
  const authority = await workflow.claimValidation({ workerId, now, leaseSeconds: 30 });
  const opened = await workflow.openClaimedCredential(authority);
  assert.equal(opened.providerCode, "basit_kargo");
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test --workspace @celebix/saas-data -- --test-name-pattern='shipping|connection save|validation lease'`

Expected: FAIL because `src/shipping` is absent.

- [ ] **Step 3: Implement credential sealing and repositories**

Use AES-256-GCM with AAD `['celebix-shipping-credential',1,storeId,profileId,providerCode,credentialVersion]`. Accept keyring IDs/keys through injected server configuration. App repository encrypts before SQL and returns only parsed public contracts. Workflow repository exposes envelope opening only for a live exact lease and wipes token buffers after the adapter call.

- [ ] **Step 4: Implement validation worker**

```ts
export async function runShippingValidationJob(input: Readonly<{
  jobId: string;
  workerId: string;
  runtime: ServerShippingRuntime;
}>): Promise<"completed" | "requeued" | "rejected"> {
  const claim = await input.runtime.workflow.claimValidation(input);
  const credential = await input.runtime.workflow.openClaimedCredential(claim);
  try {
    const result = await input.runtime.adapters.basitKargo.verifyCredential({ credential, signal: AbortSignal.timeout(10_000) });
    return await finalizeValidationResult(input.runtime.workflow, claim, result);
  } finally {
    credential.tokenBytes.fill(0);
  }
}
```

The worker writes only safe labels/digests. Invalid token disables execution; 429/5xx requeues within bounded attempts; timeout never marks the profile active.

- [ ] **Step 5: Run data and panel runtime tests**

Run: `npm test --workspace @celebix/saas-data && npm run typecheck --workspace @celebix/saas-data`

Run: `npm test --workspace @celebix/customer-panel -- --test-name-pattern='server shipping|validation worker'`

Expected: PASS.

- [ ] **Step 6: Commit repository/runtime boundary**

```bash
git add packages/saas-data/src/shipping packages/saas-data/src/index.ts apps/customer-panel/lib/server-shipping
git commit -m "feat(shipping): validate tenant Basit Kargo connections"
```

---

### Task 6: Replace the Placeholder Shipping Settings with a Real Connection Workspace

**Files:**
- Create: `apps/customer-panel/lib/shipping-http/request-authority.ts`
- Create: `apps/customer-panel/lib/shipping-http/request-input.ts`
- Create: `apps/customer-panel/lib/shipping-http/handler.ts`
- Create: `apps/customer-panel/lib/shipping-http/handler.test.ts`
- Create: `apps/customer-panel/lib/shipping-http/default.ts`
- Create: `apps/customer-panel/lib/shipping-ui/client.ts`
- Create: `apps/customer-panel/lib/shipping-ui/client.test.ts`
- Create: `apps/customer-panel/components/shipping/ShippingSettingsConsole.tsx`
- Create: `apps/customer-panel/components/shipping/shipping-settings.module.css`
- Create: `apps/customer-panel/components/shipping/ShippingSettingsConsole.test.ts`
- Create: `apps/customer-panel/app/api/settings/shipping/connection/route.ts`
- Create: `apps/customer-panel/app/api/settings/shipping/connection/resources/route.ts`
- Create: `apps/customer-panel/app/api/settings/shipping/connection/revoke/route.ts`
- Modify: `apps/customer-panel/app/settings/shipping/page.tsx`

**Interfaces:**
- Consumes: `ServerShippingRuntime.current/save/selectResources/revoke`, `shipping.read`, and `shipping.manage`.
- Produces: same-origin connection endpoints and the minimal Basit Kargo settings workspace.

- [ ] **Step 1: Write failing HTTP/UI tests**

Cover GET current, save/rotate token, choose brand/address, COD toggle, revoke, wrong origin, private headers, malformed token, analyst mutation denial, operation replay, loading, setup-required, active, attention, and mobile form behavior.

```ts
test("browser save submits only token and operation identity", async () => {
  await client.saveConnection({ token: "bk_token", operationId: OP });
  assert.deepEqual(await requests[0]!.json(), { token: "bk_token", operationId: OP });
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test --workspace @celebix/customer-panel -- --test-name-pattern='shipping settings|shipping connection'`

Expected: FAIL because handlers and console are absent.

- [ ] **Step 3: Implement exact handlers and routes**

GET projects only `ShippingConnection`. POST bodies have exact key sets and 16 KiB limits. `save` calls the validation job after the DB transaction and returns `202` while pending or `200` when the immediate validation completes. Every response is `no-store` and contains no token echo.

- [ ] **Step 4: Implement the concise settings UI**

Render one Basit Kargo row with `Bağla`, `Değiştir`, `Bağlantıyı kaldır`, brand/address selectors, and COD toggle. Use existing panel typography and flat separators; do not reintroduce large marketing cards, repeated page titles, or explanatory paragraphs.

- [ ] **Step 5: Run panel tests and typecheck**

Run: `npm test --workspace @celebix/customer-panel && npm run typecheck --workspace @celebix/customer-panel`

Expected: PASS. The maturity ledger remains unchanged because provider connection alone does not complete `shipping_rate_runtime` or `shipping_labels`.

- [ ] **Step 6: Commit the connection workspace**

```bash
git add apps/customer-panel/app/settings/shipping apps/customer-panel/app/api/settings/shipping apps/customer-panel/components/shipping apps/customer-panel/lib/shipping-http apps/customer-panel/lib/shipping-ui
git commit -m "feat(shipping): add Basit Kargo connection workspace"
```

---

### Task 7: Add Durable Quote and Shipment Authority

**Files:**
- Create: `apps/owner/scripts/sql/saas/202608060094_shipping_fulfillment_runtime.up.sql`
- Create: `apps/owner/scripts/sql/saas/202608060094_shipping_fulfillment_runtime.down.sql`
- Create: `apps/owner/scripts/sql/saas/202608060094_shipping_fulfillment_runtime_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/phase4n-shipping-fulfillment-runtime-manifest.json`
- Create: `apps/owner/scripts/sql/saas/shipping-fulfillment-runtime-migration.test.ts`
- Create: `tests/saas-phase3/shipping-fulfillment-runtime/postgres-harness.mjs`
- Create: `tests/saas-phase3/shipping-fulfillment-runtime/static-security.test.mjs`
- Modify: `apps/owner/scripts/migrate-store-db-selfhosted.mjs`

**Interfaces:**
- Consumes: migration 093 profiles/resources and existing orders/order_items.
- Produces: quote/session/option, shipment/item, job/event/operation tables and exact app/workflow RPCs.

- [ ] **Step 1: Write failing migration and PG scenarios**

Name scenarios for quote creation, exact option binding, ten-minute expiry, order version drift, all-remaining-item projection, concurrent create, item over-fulfillment denial, app/workflow ACL, create success, provider unknown, operation recovery, and drain-guarded rollback.

- [ ] **Step 2: Run the migration test and verify RED**

Run: `node --experimental-transform-types --test apps/owner/scripts/sql/saas/shipping-fulfillment-runtime-migration.test.ts`

Expected: FAIL because migration 094 is missing.

- [ ] **Step 3: Create closed quote and shipment relations**

Use store-composite foreign keys, UUID primary keys, exact status checks, safe integer cents, positive finite package JSON validation, ten-minute server-derived quote expiry, immutable quote options, per-order-item shipment quantities, unique create operation identity, and FORCE RLS on every relation.

- [ ] **Step 4: Implement exact transaction functions**

App functions:

```sql
saas.shipping_quote_begin(... order_id uuid, expected_order_version bigint, packages jsonb, operation_id uuid)
saas.shipping_quote_current(... quote_credential_digest text)
saas.shipping_shipment_begin(... order_id uuid, expected_order_version bigint, quote_id uuid, option_id uuid, operation_id uuid)
saas.shipping_shipment_current(... shipment_id uuid)
saas.shipping_operation_recover(... operation_id uuid, operation_kind text)
```

Workflow functions claim quote/create jobs with exact leases, read sealed provider authority, complete quote options, complete create, mark unknown, and release/requeue safe read jobs. No provider network work occurs inside SQL.

- [ ] **Step 5: Run PG16 and static gates**

Run: `node tests/saas-phase3/shipping-fulfillment-runtime/postgres-harness.mjs`

Run: `node --experimental-transform-types --test apps/owner/scripts/sql/saas/shipping-fulfillment-runtime-migration.test.ts tests/saas-phase3/shipping-fulfillment-runtime/static-security.test.mjs`

Expected: every scenario PASS.

- [ ] **Step 6: Commit runtime authority**

```bash
git add apps/owner/scripts/sql/saas/202608060094_* apps/owner/scripts/sql/saas/phase4n-shipping-fulfillment-runtime-manifest.json apps/owner/scripts/sql/saas/shipping-fulfillment-runtime-migration.test.ts apps/owner/scripts/migrate-store-db-selfhosted.mjs tests/saas-phase3/shipping-fulfillment-runtime
git commit -m "feat(shipping): add durable fulfillment runtime"
```

---

### Task 8: Implement Quote/Create Repositories, Worker, and Order UI

**Files:**
- Modify: `packages/saas-data/src/shipping/types.ts`
- Modify: `packages/saas-data/src/shipping/repository.ts`
- Modify: `packages/saas-data/src/shipping/repository.test.ts`
- Modify: `packages/saas-data/src/shipping/workflow-repository.ts`
- Modify: `packages/saas-data/src/shipping/workflow-repository.test.ts`
- Create: `apps/customer-panel/lib/server-shipping/fulfillment-worker.ts`
- Create: `apps/customer-panel/lib/server-shipping/fulfillment-worker.test.ts`
- Create: `apps/customer-panel/lib/server-shipping/fulfillment-service.ts`
- Create: `apps/customer-panel/lib/server-shipping/fulfillment-service.test.ts`
- Modify: `apps/customer-panel/lib/shipping-http/handler.ts`
- Modify: `apps/customer-panel/lib/shipping-http/handler.test.ts`
- Modify: `apps/customer-panel/lib/shipping-http/default.ts`
- Modify: `apps/customer-panel/lib/shipping-ui/client.ts`
- Create: `apps/customer-panel/components/shipping/OrderShipmentConsole.tsx`
- Create: `apps/customer-panel/components/shipping/order-shipment.module.css`
- Create: `apps/customer-panel/components/shipping/OrderShipmentConsole.test.ts`
- Create: `apps/customer-panel/app/api/orders/[orderId]/shipping/quotes/route.ts`
- Create: `apps/customer-panel/app/api/orders/[orderId]/shipments/route.ts`
- Create: `apps/customer-panel/app/api/orders/[orderId]/shipments/[shipmentId]/route.ts`
- Modify: `apps/customer-panel/components/orders/OrderDetailConsole.tsx`
- Modify: `apps/customer-panel/app/orders/[orderId]/page.tsx`

**Interfaces:**
- Consumes: migration 094 RPCs, Task 3 Basit adapter, active Task 5 runtime.
- Produces: `beginQuote`, `currentQuote`, `beginShipment`, `currentShipment`, `createShippingFulfillmentService`, `runQuoteJob`, `runShipmentCreateJob`, and controlled order-detail UI.

- [ ] **Step 1: Write failing repository/worker/UI tests**

```ts
test("explicit option selection creates one durable shipment job", async () => {
  const adapter = createRecordingShippingAdapter();
  const service = createShippingFulfillmentService({
    admin: createInMemoryShippingAdminRepository(),
    workflow: createInMemoryShippingWorkflowRepository(),
    adapter,
  });
  const first = await service.beginShipment({ tenantContext, orderId, expectedVersion: 7, quoteCredential, optionId, operationId: OP });
  const replay = await service.beginShipment({ tenantContext, orderId, expectedVersion: 7, quoteCredential, optionId, operationId: OP });
  assert.equal(first.shipmentId, replay.shipmentId);
  assert.equal(adapter.createCalls.length, 1);
});
```

Cover quote-only behavior, stale quote, option substitution, order version drift, malformed package, role denial, double click, immediate success, 429 requeue, 4xx rejection, create timeout unknown, and refresh after navigation.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test --workspace @celebix/saas-data -- --test-name-pattern='shipping quote|shipment begin'`

Run: `npm test --workspace @celebix/customer-panel -- --test-name-pattern='shipment|fulfillment worker'`

Expected: FAIL on missing methods/components.

- [ ] **Step 3: Implement app/workflow repositories and worker**

Quote worker calls only `quotePackages`; create worker calls `createShipment` once. A success is completed atomically. `provider_outcome_unknown` is durable and no auto-retry job is created. 429 uses provider retry seconds capped by DB policy.

- [ ] **Step 4: Implement exact same-origin routes**

Quote POST accepts `{ operationId, expectedOrderVersion, packages }`. Shipment POST accepts `{ operationId, expectedOrderVersion, quoteCredential, optionId }`. Browser never sends handler code, price, profile, brand/address, recipient, COD amount, items, or provider reference.

- [ ] **Step 5: Implement controlled order UI**

Add one compact “Gönderi oluştur” action to the shipping area. Dialog flow: package measures → “Teklifleri getir” → radio list → “Barkod oluştur”. Show `Tahmini` next to price and disable every action while its operation is active. Preserve the manual tracking form under a secondary action.

- [ ] **Step 6: Run full affected workspaces and commit**

Run: `npm test --workspace @celebix/saas-data && npm run typecheck --workspace @celebix/saas-data`

Run: `npm test --workspace @celebix/customer-panel && npm run typecheck --workspace @celebix/customer-panel`

```bash
git add packages/saas-data/src/shipping apps/customer-panel/lib/server-shipping apps/customer-panel/lib/shipping-http apps/customer-panel/lib/shipping-ui apps/customer-panel/components/shipping apps/customer-panel/components/orders/OrderDetailConsole.tsx apps/customer-panel/app/orders apps/customer-panel/app/api/orders
git commit -m "feat(shipping): create controlled Basit Kargo shipments"
```

---

### Task 9: Add Verified Tracking, Webhook Signals, Reconciliation, and COD Settlement

**Files:**
- Create: `apps/owner/scripts/sql/saas/202608060095_shipping_tracking_settlement.up.sql`
- Create: `apps/owner/scripts/sql/saas/202608060095_shipping_tracking_settlement.down.sql`
- Create: `apps/owner/scripts/sql/saas/202608060095_shipping_tracking_settlement_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/phase4o-shipping-tracking-settlement-manifest.json`
- Create: `apps/owner/scripts/sql/saas/shipping-tracking-settlement-migration.test.ts`
- Create: `tests/saas-phase3/shipping-tracking-settlement/postgres-harness.mjs`
- Create: `tests/saas-phase3/shipping-tracking-settlement/static-security.test.mjs`
- Modify: `apps/owner/scripts/migrate-store-db-selfhosted.mjs`
- Modify: `packages/saas-data/src/shipping/workflow-repository.ts`
- Modify: `packages/saas-data/src/shipping/workflow-repository.test.ts`
- Modify: `packages/saas-data/src/storefront-identity/repository.ts`
- Modify: `packages/saas-data/src/storefront-identity/repository.test.ts`
- Modify: `packages/saas-data/src/order-emails/repository.ts`
- Modify: `packages/saas-data/src/order-emails/repository.test.ts`
- Create: `apps/customer-panel/lib/server-shipping/reconciliation-worker.ts`
- Create: `apps/customer-panel/lib/server-shipping/reconciliation-worker.test.ts`
- Create: `apps/customer-panel/lib/shipping-webhook/handler.ts`
- Create: `apps/customer-panel/lib/shipping-webhook/handler.test.ts`
- Create: `apps/customer-panel/app/api/shipping/webhooks/basit-kargo/[binding]/route.ts`
- Create: `apps/customer-panel/scripts/reconcile-shipping.mjs`
- Modify: `apps/customer-panel/package.json`

**Interfaces:**
- Consumes: shipment/profile authority and Basit `getShipment`.
- Produces: webhook observation, refresh candidates, monotonic status finalizer, exact COD settlement, and bounded reconciliation command.

- [ ] **Step 1: Write failing security and settlement scenarios**

Cover unsigned payload cannot mutate, unknown binding is opaque, duplicate webhook digest, provider read-back required, stale status cannot regress, delivered is terminal, wrong-store shipment, wrong payment method, COD setting off, amount mismatch, concurrent delivered finalizers, and payment event replay.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --experimental-transform-types --test apps/owner/scripts/sql/saas/shipping-tracking-settlement-migration.test.ts`

Expected: FAIL because migration 095 is absent.

- [ ] **Step 3: Add observation and settlement authority**

Store only bounded routing facts plus body digest. `shipping_workflow_apply_provider_observation` accepts exact live lease, provider shipment ID, canonical safe status facts, observation digest, occurred time, handler/tracking, and monetary facts. It appends one event and advances only allowed monotonic transitions.

`DELIVERED` calls an owner-only helper that verifies `cash_on_delivery`, pending payment, setting enabled, exact store/order/shipment, and amount before changing payment status and emitting an immutable order event. The same migration updates the exact public account-order functions to include only safe shipment projections and appends idempotent `order_shipped` / `order_delivered` outbox events; Task 11 adds the TypeScript consumers without changing the pinned SQL bytes.

- [ ] **Step 4: Implement webhook and reconciliation workers**

Webhook route requires exact POST, JSON content type, 64 KiB maximum, high-entropy binding, and no cookies/auth headers. It stores the digest and returns a generic `202`. Worker claims the refresh job, opens the exact credential, calls `getShipment`, and applies only the verified response.

The reconciliation script claims at most 25 jobs, uses five workers, respects per-profile next-run times, exits on 50-second budget, and supports `--dry-run` without opening credentials or network.

- [ ] **Step 5: Run PG, worker, and webhook tests**

Run: `node tests/saas-phase3/shipping-tracking-settlement/postgres-harness.mjs`

Run: `npm test --workspace @celebix/customer-panel -- --test-name-pattern='shipping webhook|reconciliation|COD'`

Expected: PASS.

- [ ] **Step 6: Commit verified tracking**

```bash
git add apps/owner/scripts/sql/saas/202608060095_* apps/owner/scripts/sql/saas/phase4o-shipping-tracking-settlement-manifest.json apps/owner/scripts/sql/saas/shipping-tracking-settlement-migration.test.ts apps/owner/scripts/migrate-store-db-selfhosted.mjs tests/saas-phase3/shipping-tracking-settlement packages/saas-data/src/shipping apps/customer-panel/lib/server-shipping apps/customer-panel/lib/shipping-webhook apps/customer-panel/app/api/shipping apps/customer-panel/scripts/reconcile-shipping.mjs apps/customer-panel/package.json
git commit -m "feat(shipping): verify tracking and COD settlement"
```

---

### Task 10: Persist Labels and Add Cancel/Return Operations

**Files:**
- Create: `apps/customer-panel/lib/server-shipping/label-service.ts`
- Create: `apps/customer-panel/lib/server-shipping/label-service.test.ts`
- Create: `apps/customer-panel/lib/server-shipping/svg-validation.ts`
- Create: `apps/customer-panel/lib/server-shipping/svg-validation.test.ts`
- Modify: `apps/customer-panel/lib/server-media/r2-storage.ts`
- Modify: `apps/customer-panel/lib/server-media/r2-storage.test.ts`
- Modify: `apps/customer-panel/lib/shipping-http/handler.ts`
- Modify: `apps/customer-panel/lib/shipping-http/handler.test.ts`
- Modify: `apps/customer-panel/lib/shipping-http/default.ts`
- Create: `apps/customer-panel/app/api/orders/[orderId]/shipments/[shipmentId]/label/route.ts`
- Create: `apps/customer-panel/app/api/orders/[orderId]/shipments/[shipmentId]/cancel/route.ts`
- Create: `apps/customer-panel/app/api/orders/[orderId]/shipments/[shipmentId]/return/route.ts`
- Modify: `apps/customer-panel/components/shipping/OrderShipmentConsole.tsx`
- Modify: `apps/customer-panel/components/shipping/OrderShipmentConsole.test.ts`

**Interfaces:**
- Consumes: verified shipment, Basit download/cancel/return adapter calls, private R2 binding.
- Produces: idempotent label persistence/download, safe cancellation, and linked incoming return shipment.

- [ ] **Step 1: Write failing SVG and operation tests**

Reject scripts, event handlers, external references, data URLs, foreignObject, entity declarations, oversized XML, non-SVG roots, and mismatched MIME. Prove private object key never reaches the response and download uses `attachment`, `nosniff`, `no-store`, and a bounded filename.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test --workspace @celebix/customer-panel -- --test-name-pattern='shipping label|shipment cancel|return shipment'`

Expected: FAIL because services/routes are absent.

- [ ] **Step 3: Implement label storage**

Use namespace `stores/{storeId}/shipping-labels/{shipmentId}/{labelVersion}.svg` only inside the server R2 adapter. Persist SHA-256, byte size, MIME, object digest/binding, and label version through workflow RPC. On known R2 failure leave a retryable label job; on commit unknown use HEAD/read metadata before writing again.

- [ ] **Step 4: Implement cancel and return**

Cancellation requires a fresh provider read proving pre-handover status. Return requires verified delivered status and creates a distinct `INCOMING` shipment linked to the original. Neither operation changes stock or issues a payment refund.

- [ ] **Step 5: Add concise shipment actions and verify**

Run: `npm test --workspace @celebix/customer-panel && npm run typecheck --workspace @celebix/customer-panel`

Expected: PASS; UI shows only actions valid for the persisted current status.

- [ ] **Step 6: Commit label and reverse-logistics slice**

```bash
git add apps/customer-panel/lib/server-shipping apps/customer-panel/lib/server-media apps/customer-panel/lib/shipping-http apps/customer-panel/app/api/orders apps/customer-panel/components/shipping
git commit -m "feat(shipping): add labels cancellation and returns"
```

---

### Task 11: Project Verified Tracking to Customers and Notifications

**Files:**
- Modify: `packages/saas-contracts/src/storefront-identity/types.ts`
- Modify: `packages/saas-contracts/src/storefront-identity/validation.ts`
- Modify: `packages/saas-contracts/src/storefront-identity/storefront-identity.test.ts`
- Modify: `packages/saas-data/src/storefront-identity/repository.ts`
- Modify: `packages/saas-data/src/storefront-identity/repository.test.ts`
- Modify: `apps/storefront-shared/app/account/orders/[orderReference]/page.tsx`
- Modify: `apps/storefront-shared/components/account/account-ui.test.ts`
- Modify: `apps/storefront-shared/app/globals.css`
- Modify: `packages/saas-data/src/order-emails/types.ts`
- Modify: `packages/saas-data/src/order-emails/repository.ts`
- Modify: `packages/saas-data/src/order-emails/repository.test.ts`

**Interfaces:**
- Consumes: verified shipment/events only.
- Produces: safe `StorefrontAccountShipment` projection and durable `order_shipped` / `order_delivered` outbox events.

- [ ] **Step 1: Write failing public projection tests**

```ts
test("account order exposes only safe verified shipment facts", () => {
  const parsed = parseStorefrontAccountOrder({ ...order, shipments: [{
    id: "public-shipment-1",
    carrier: "Aras Kargo",
    trackingNumber: "1234567890",
    status: "shipped",
    updatedAt: NOW,
  }] });
  assert.equal(Object.hasOwn(parsed.shipments[0]!, "providerShipmentId"), false);
  assert.equal(Object.hasOwn(parsed.shipments[0]!, "profileId"), false);
});
```

Cover account session, wrong host, wrong customer, guest receipt projection if the existing receipt route exposes order detail, empty shipments, multiple shipments, and secret-key rejection.

- [ ] **Step 2: Run contracts/data/storefront tests and verify RED**

Run: `npm test --workspace @celebix/saas-contracts -- --test-name-pattern='account order'`

Run: `npm test --workspace @celebix/storefront-shared -- --test-name-pattern='account.*shipment|tracking'`

Expected: FAIL because `shipments` is not in the account order contract.

- [ ] **Step 3: Extend the public SQL projection and repository**

Return shipment ID as a new public opaque value, carrier, tracking number, safe tracking URL only when exact HTTPS, normalized status, and timestamps. Never project provider ID, profile, credential version, price internals, webhook data, R2 binding, or private movement payload.

- [ ] **Step 4: Render the customer tracking experience**

Add one compact progress row under order totals with current status and tracking action. Keep the page brand-driven, responsive, keyboard accessible, and free of provider configuration language.

- [ ] **Step 5: Wire idempotent transactional events**

Verified first transition to `shipped` and `delivered` inserts one outbox event. Existing delivery worker determines accepted/delivered status; if no adapter is configured, event remains pending and UI never says notification sent.

- [ ] **Step 6: Verify the already-pinned 095 projection and commit**

Run: `npm test --workspace @celebix/saas-contracts && npm test --workspace @celebix/saas-data && npm test --workspace @celebix/storefront-shared`

```bash
git add packages/saas-contracts/src/storefront-identity packages/saas-data/src/storefront-identity packages/saas-data/src/order-emails apps/storefront-shared/app/account apps/storefront-shared/components/account apps/storefront-shared/app/globals.css
git commit -m "feat(shipping): show verified customer tracking"
```

---

### Task 12: Register Cumulative Gates and Verify the Complete Feature

**Files:**
- Create: `tests/saas-phase3/basit-kargo-controlled-fulfillment/static-security.test.mjs`
- Create: `tests/saas-phase3/basit-kargo-controlled-fulfillment/runtime-acceptance.test.mjs`
- Modify: `tests/saas-phase3/current-tests.json`
- Modify: `tests/saas-phase3/run-current-suite.mjs`
- Modify: `tests/saas-phase3/full-maturity-matrix.json`
- Modify: `apps/customer-panel/lib/panel-ui/functional-maturity.ts`
- Modify: `apps/customer-panel/lib/panel-ui/functional-maturity.test.ts`
- Modify: `docs/superpowers/plans/2026-08-06-basit-kargo-controlled-fulfillment.md`

**Interfaces:**
- Consumes: Tasks 1–11.
- Produces: cumulative security/build/behavior evidence and truthful maturity state.

- [ ] **Step 1: Write failing cumulative gates**

Static gate must prove:

- all 093–095 up/down/assertion hashes are pinned;
- `apps/donor` and deployment files are unchanged;
- browser graphs contain no token, store, tenant, profile, credential, provider ID, object key, or webhook binding;
- transport has one exact Basit origin and no arbitrary fetch;
- create unknown cannot schedule another create POST;
- webhook cannot call settlement directly;
- COD needs provider read-back;
- labels are private attachment downloads;
- current suite registers all new PG harnesses and tests.

- [ ] **Step 2: Run the new gate and verify RED**

Run: `node --test tests/saas-phase3/basit-kargo-controlled-fulfillment/*.test.mjs`

Expected: FAIL until current suite and maturity files include the feature.

- [ ] **Step 3: Update truthful maturity**

Move `shipping_rate_runtime` and `shipping_labels` from gaps to operational only after their runtime tests pass. Keep fulfillment locations, provider-independent automatic selection, and other unsupported shipping capabilities in gaps. Do not mark the entire module `production_ready` while any gap remains.

- [ ] **Step 4: Run workspace tests and typechecks**

Run:

```bash
npm test --workspace @celebix/shipping-adapters
npm run typecheck --workspace @celebix/shipping-adapters
npm test --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-contracts
npm test --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/saas-data
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
npm test --workspace @celebix/storefront-shared
npm run typecheck --workspace @celebix/storefront-shared
```

Expected: all PASS.

- [ ] **Step 5: Run builds and the cumulative PostgreSQL suite**

Run:

```bash
npm run build --workspace @celebix/customer-panel
npm run build --workspace @celebix/storefront-shared
node tests/saas-phase3/run-current-suite.mjs
```

Expected: both builds and every registered current test PASS; only explicitly documented external-provider tests may be skipped.

- [ ] **Step 6: Run final leak/diff checks**

Run:

```bash
git diff --check
git diff -- apps/donor
git status --short
rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' '(Bearer [A-Za-z0-9]|api[_-]?token|credential_envelope|providerShipmentId|shipping-labels/)' apps/customer-panel apps/storefront-shared packages/shipping-adapters packages/saas-data
```

Review every match. Type/property names and server-only SQL are allowed; literals, logs, browser DTOs, HTML, RSC props, and test secrets are not. `.superpowers/` must remain the only unrelated untracked path.

- [ ] **Step 7: Mark plan complete and commit verification metadata**

```bash
git add tests/saas-phase3 apps/customer-panel/lib/panel-ui/functional-maturity.ts apps/customer-panel/lib/panel-ui/functional-maturity.test.ts docs/superpowers/plans/2026-08-06-basit-kargo-controlled-fulfillment.md
git commit -m "test(shipping): gate Basit Kargo fulfillment"
```

Do not push, migrate, deploy, configure a real webhook, or execute a real provider shipment without separate authorization and a tenant-owned Basit Kargo token.
