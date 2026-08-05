# Storefront Custom Domains Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an authorized merchant connect one custom storefront hostname through Cloudflare for SaaS while retaining the Celebix platform hostname and fixed Celebix admin origin.

**Architecture:** `saas.store_domains` remains the exact-host serving authority. A provider-neutral domain package normalizes input and orchestrates a Cloudflare for SaaS adapter; PostgreSQL stores provider lifecycle separately and a bounded owner worker reconciles asynchronous DNS/SSL state. The customer panel exposes tenant-authorized APIs and a minimal `Ayarlar > Alan Adı` UI, while the shared storefront canonicalizes active aliases to the database primary hostname.

**Tech Stack:** Node.js 20+, TypeScript 5.9, Next.js 16 App Router, React 19, PostgreSQL 16, Cloudflare for SaaS Custom Hostnames API, Cloudflare Tunnel, Coolify, Node test runner, `tldts` Public Suffix List parser.

## Global Constraints

- Custom domains apply to storefronts only; admin origins remain `https://<slug>.admin.<Celebix platform suffix>`.
- Never accept `storeId`, provider IDs, provider state, verification timestamps, or `isPrimary` from the browser.
- Treat a hostname as ready only when hostname status, SSL status, DNS target, and exact-host origin health are all ready.
- Keep the Celebix platform hostname active during create, activate, failure, removal, and recovery.
- Unknown, pending, or disabled hostnames fail closed in public storefront resolution.
- Cloudflare credentials remain server-only and are never persisted in tenant tables or returned by APIs.
- All mutations require active tenant authority, `configuration.manage`, `custom_domains`, and the current `customDomains` limit.
- Use minimum TLS 1.2 and exact non-wildcard hostnames.
- No mutation may require a per-domain Coolify deployment or proxy configuration change.
- Follow TDD, run the stated focused test after every implementation step, and commit after every task.

---

## File map

### New package: `packages/saas-domain-core`

- `src/hostname.ts`: hostname normalization, A-label conversion, public-suffix validation, reserved-name policy.
- `src/types.ts`: provider-neutral domain lifecycle interfaces.
- `src/cloudflare.ts`: strict Cloudflare response parsing and API adapter.
- `src/service.ts`: idempotent merchant create/recheck/primary/remove orchestration.
- `src/reconciler.ts`: bounded provider reconciliation state machine.

### Database: `packages/saas-data` and SaaS SQL migrations

- PostgreSQL migration `088`: provider lifecycle, immutable operations, merchant RPCs, worker claim/complete RPCs, grants, rollback guards, assertions.
- `src/store-domains/*`: merchant and worker repositories with exact parsers.

### Customer panel

- `lib/server-store-domains/*`: runtime registration and Cloudflare configuration.
- `lib/store-domain-http/*`: tenant-authorized request handlers.
- `lib/store-domain-ui/*`: browser client and view-model validation.
- `components/settings/domains/*`: minimal domain settings interface.
- `app/settings/domains/page.tsx` and `app/api/store-domains/*`: page and HTTP mounting.

### Owner worker and deployment

- `apps/owner/lib/store-domain-reconciliation/*`: production worker composition and bounded loop.
- `apps/owner/instrumentation.ts`: node-only worker startup.
- `scripts/verify-cloudflare-saas-readiness.mjs`: read-only Cloudflare/Tunnel/fallback-origin preflight.
- `docs/operations/storefront-custom-domains.md`: Cloudflare, Tunnel, Coolify, rollback, and incident runbook.

### Shared storefront

- Exact-host resolution returns the active primary hostname as `canonicalUrl`.
- Shared storefront redirects active aliases to the primary hostname while preserving safe path/query.

---

### Task 1: Domain contracts and hostname normalization

**Files:**
- Create: `packages/saas-domain-core/package.json`
- Create: `packages/saas-domain-core/tsconfig.json`
- Create: `packages/saas-domain-core/src/index.ts`
- Create: `packages/saas-domain-core/src/types.ts`
- Create: `packages/saas-domain-core/src/hostname.ts`
- Test: `packages/saas-domain-core/src/hostname.test.ts`
- Modify: `package-lock.json`
- Modify: `packages/saas-contracts/src/types.ts`
- Modify: `packages/saas-contracts/src/index.ts`
- Test: `packages/saas-contracts/src/contracts.test.ts`

**Interfaces:**
- Produces: `normalizeStorefrontHostname(raw: string, policy: StorefrontHostnamePolicy): NormalizedStorefrontHostname`.
- Produces: `StoreDomainView`, `StoreDomainUiStatus`, `CreateStoreDomainInput`, `StoreDomainMutationResult`.
- Consumes: Node `domainToASCII` and `tldts.parse()`.

- [ ] **Step 1: Write failing normalization and contract tests**

```ts
test("normalizes a Unicode hostname to one exact registrable A-label", () => {
  assert.deepEqual(normalizeStorefrontHostname("WWW.Örnek.com.", POLICY), {
    hostname: "www.xn--rnek-4qa.com",
    registrableDomain: "xn--rnek-4qa.com",
    recordName: "www",
    apex: false,
  });
});

for (const raw of ["https://shop.example.com", "*.example.com", "127.0.0.1", "localhost", "shop.celebix.site", "example.invalid"]) {
  test(`rejects ${raw}`, () => assert.throws(() => normalizeStorefrontHostname(raw, POLICY), /storefront_hostname_invalid/));
}
```

Add a contract assertion that UI states are exactly:

```ts
assert.deepEqual(STORE_DOMAIN_UI_STATUSES, [
  "dns_pending", "hostname_pending", "ssl_pending", "origin_pending", "active", "action_required", "disabled",
]);
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run:

```bash
node --experimental-strip-types --test packages/saas-domain-core/src/hostname.test.ts
npm test --workspace @celebix/saas-contracts
```

Expected: the package/imports and new contract constants are missing.

- [ ] **Step 3: Add package scaffolding and dependency**

Run:

```bash
npm install tldts --workspace @celebix/saas-domain-core
```

Use this package contract:

```json
{
  "name": "@celebix/saas-domain-core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "node --experimental-strip-types --test src/*.test.ts"
  },
  "dependencies": { "@celebix/saas-contracts": "0.1.0", "tldts": "^7.0.0" }
}
```

- [ ] **Step 4: Implement strict normalization and public contracts**

Define:

```ts
export type StorefrontHostnamePolicy = Readonly<{
  reservedSuffixes: readonly string[];
  cnameTarget: string;
}>;

export type NormalizedStorefrontHostname = Readonly<{
  hostname: string;
  registrableDomain: string;
  recordName: string;
  apex: boolean;
}>;
```

`normalizeStorefrontHostname` must reject non-string data, surrounding whitespace, schemes, credentials, paths, ports, IPs, wildcard labels, empty A-labels, invalid public suffixes, and any exact/suffix match in `reservedSuffixes`. Freeze the returned object.

- [ ] **Step 5: Run package tests and typechecks**

Run:

```bash
npm test --workspace @celebix/saas-domain-core
npm run typecheck --workspace @celebix/saas-domain-core
npm test --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-contracts
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json packages/saas-domain-core packages/saas-contracts/src
git commit -m "feat: add custom domain contracts and normalization"
```

---

### Task 2: PostgreSQL custom-domain lifecycle authority

**Files:**
- Create: `apps/owner/scripts/sql/saas/202608050088_storefront_custom_domains.up.sql`
- Create: `apps/owner/scripts/sql/saas/202608050088_storefront_custom_domains.down.sql`
- Create: `apps/owner/scripts/sql/saas/202608050088_storefront_custom_domains_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/phase4h-storefront-custom-domains-manifest.json`
- Test: `apps/owner/scripts/sql/saas/storefront-custom-domains-migration.test.ts`
- Create: `packages/saas-data/src/store-domains/types.ts`
- Create: `packages/saas-data/src/store-domains/validation.ts`
- Create: `packages/saas-data/src/store-domains/repository.ts`
- Test: `packages/saas-data/src/store-domains/repository.test.ts`
- Modify: `packages/saas-data/src/index.ts`
- Modify: `apps/customer-panel/lib/server-panel-access/postgres-runtime.ts`

**Interfaces:**
- Produces: `StoreDomainRepository.list`, `.prepareCreate`, `.bindProvider`, `.requestRecheck`, `.makePrimary`, `.disable`.
- Produces: `StoreDomainWorkflowRepository.claim`, `.complete`, `.fail`.
- Consumes: Task 1 contract types and existing `TenantContext` authority.

- [ ] **Step 1: Write failing migration contract tests**

Assert the migration creates both private tables, enables/forces RLS, grants table access to no application role, and exposes only named RPCs:

```ts
assert.match(up, /CREATE TABLE saas[.]store_domain_provisioning/u);
assert.match(up, /CREATE TABLE saas[.]store_domain_operations/u);
assert.match(up, /CREATE FUNCTION saas[.]merchant_store_domain_prepare_create/u);
assert.match(up, /CREATE FUNCTION saas[.]store_domain_work_claim/u);
assert.match(up, /FORCE ROW LEVEL SECURITY/gu);
assert.doesNotMatch(up, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE).*store_domain_/isu);
```

- [ ] **Step 2: Run the migration test and confirm failure**

Run:

```bash
node --experimental-strip-types --test apps/owner/scripts/sql/saas/storefront-custom-domains-migration.test.ts
```

Expected: migration artifacts are missing.

- [ ] **Step 3: Add tables, constraints, indexes, and rollback guards**

Create `store_domain_provisioning` with the design fields and exact checks. Use separate provider facts:

```sql
CHECK (hostname_status IN ('pending','active','failed','deleted')),
CHECK (ssl_status IN ('pending','active','failed','deleted')),
CHECK (dns_status IN ('pending','ready','mismatch')),
CHECK (origin_status IN ('pending','ready','failed')),
UNIQUE (provider, provider_hostname_id)
```

Create immutable `store_domain_operations` with unique `(store_id, operation_id)` and `(store_id, operation_fingerprint)`. Add partial worker indexes on `next_check_at` for non-terminal provisioning rows. Down migration must refuse while any active custom hostname or leased operation exists.

- [ ] **Step 4: Add merchant and worker RPCs**

Use exact signatures:

```sql
saas.merchant_store_domain_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz)
saas.merchant_store_domain_prepare_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text,uuid,text)
saas.merchant_store_domain_bind_provider(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,bigint,text,jsonb,jsonb)
saas.merchant_store_domain_request_recheck(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,bigint)
saas.merchant_store_domain_make_primary(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,bigint)
saas.merchant_store_domain_disable(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,bigint)
saas.store_domain_work_claim(text,timestamptz,timestamptz,integer,uuid)
saas.store_domain_work_complete(uuid,uuid,text,timestamptz,text,text,text,text,text,text,timestamptz)
saas.store_domain_work_fail(uuid,uuid,text,timestamptz,text,timestamptz,boolean)
```

Merchant RPCs must call `saas.merchant_action_authority_error(..., 'custom_domains', 'configuration.manage')`, enforce the plan limit under row lock, and return exact JSON projections. Worker RPCs use `celebix_saas_workflow`, bounded claims, lease tokens, and version checks.

- [ ] **Step 5: Write failing repository tests**

Cover exact SQL values, typed projection parsing, unavailable database behavior, replay, stale versions, cross-store rejection, and claim lease copying. A representative assertion:

```ts
assert.deepEqual(call(client, "merchant_store_domain_prepare_create").values, [
  STORE, PRINCIPAL, MEMBERSHIP, PLAN, "pilot", 1, NOW, OPERATION, FINGERPRINT, "www.example.com", DOMAIN, "cloudflare_for_saas",
]);
```

- [ ] **Step 6: Implement repositories and register them in the panel runtime**

Expose only frozen facades. Parse exact key sets; never forward raw JSONB or database error text. Map unique conflicts to `hostname_already_claimed` and feature/limit outcomes to `feature_not_enabled` or `limit_reached`.

- [ ] **Step 7: Generate the artifact manifest and run tests**

Run:

```bash
node --experimental-strip-types --test apps/owner/scripts/sql/saas/storefront-custom-domains-migration.test.ts
npm test --workspace @celebix/saas-data -- --test-name-pattern="store domain"
npm run typecheck --workspace @celebix/saas-data
```

Expected: all pass; manifest SHA-256 values match the three SQL artifacts.

- [ ] **Step 8: Commit**

```bash
git add apps/owner/scripts/sql/saas/202608050088_* apps/owner/scripts/sql/saas/phase4h-* apps/owner/scripts/sql/saas/storefront-custom-domains-migration.test.ts packages/saas-data/src apps/customer-panel/lib/server-panel-access/postgres-runtime.ts
git commit -m "feat: add durable storefront domain authority"
```

---

### Task 3: Cloudflare for SaaS adapter

**Files:**
- Create: `packages/saas-domain-core/src/cloudflare.ts`
- Test: `packages/saas-domain-core/src/cloudflare.test.ts`
- Modify: `packages/saas-domain-core/src/types.ts`
- Modify: `packages/saas-domain-core/src/index.ts`

**Interfaces:**
- Produces: `CloudflareCustomHostnameProvider` implementing `CustomHostnameProvider`.
- Consumes: normalized exact hostname and server-only `CloudflareForSaaSConfig`.

- [ ] **Step 1: Write failing adapter tests with an injected fetch**

Cover create, get, delete, 429 retry classification, 409 duplicate recovery, malformed success response, timeout, and safe error redaction.

```ts
const provider = createCloudflareCustomHostnameProvider({
  zoneId: "zone_123",
  apiToken: "secret-token",
  apiBaseUrl: "https://api.cloudflare.com/client/v4",
  minimumTlsVersion: "1.2",
  timeoutMs: 5_000,
}, fakeFetch);

assert.deepEqual(await provider.create("www.example.com"), {
  providerHostnameId: "cf-host-1",
  hostname: "www.example.com",
  hostnameStatus: "pending",
  sslStatus: "pending",
  ownershipValidation: { type: "txt", name: "_cf-custom-hostname.www.example.com", value: "safe-token" },
  certificateValidation: [],
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

```bash
node --experimental-strip-types --test packages/saas-domain-core/src/cloudflare.test.ts
```

Expected: adapter exports are missing.

- [ ] **Step 3: Implement the provider interface and strict parser**

Define:

```ts
export interface CustomHostnameProvider {
  create(hostname: string): Promise<ProviderHostnameSnapshot>;
  get(providerHostnameId: string): Promise<ProviderHostnameSnapshot>;
  find(hostname: string): Promise<ProviderHostnameSnapshot | null>;
  remove(providerHostnameId: string): Promise<Readonly<{ deleted: true }>>;
}
```

Create calls `POST /zones/{zoneId}/custom_hostnames` with:

```json
{
  "hostname": "www.example.com",
  "ssl": { "method": "http", "type": "dv", "settings": { "min_tls_version": "1.2" } }
}
```

Use `Authorization: Bearer`, `Accept: application/json`, `Content-Type: application/json`, `AbortSignal.timeout(timeoutMs)`, and exact response parsing. Never include the token, response body, hostname-validation value, or Cloudflare message text in thrown/loggable errors.

- [ ] **Step 4: Run tests and typecheck**

```bash
npm test --workspace @celebix/saas-domain-core
npm run typecheck --workspace @celebix/saas-domain-core
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/saas-domain-core/src
git commit -m "feat: add Cloudflare custom hostname adapter"
```

---

### Task 4: Domain service and reconciliation worker

**Files:**
- Create: `packages/saas-domain-core/src/service.ts`
- Test: `packages/saas-domain-core/src/service.test.ts`
- Create: `packages/saas-domain-core/src/reconciler.ts`
- Test: `packages/saas-domain-core/src/reconciler.test.ts`
- Create: `apps/owner/lib/store-domain-reconciliation/config.ts`
- Test: `apps/owner/lib/store-domain-reconciliation/config.test.ts`
- Create: `apps/owner/lib/store-domain-reconciliation/production.ts`
- Test: `apps/owner/lib/store-domain-reconciliation/production.test.ts`
- Create: `apps/owner/lib/store-domain-reconciliation/default.ts`
- Modify: `apps/owner/instrumentation.ts`
- Test: `apps/owner/instrumentation.test.ts`

**Interfaces:**
- Produces: `StoreDomainService.create`, `.requestRecheck`, `.makePrimary`, `.disable`.
- Produces: `StoreDomainReconciler.runOnce(): Promise<"empty" | "updated" | "retry_scheduled" | "failed">`.
- Consumes: Task 2 repositories and Task 3 provider.

- [ ] **Step 1: Write failing service and reconciler state-machine tests**

Test create recovery after an ambiguous provider response, no duplicate provider call on operation replay, primary rejection before complete readiness, exponential retry boundaries, terminal provider deletion, and zero provider calls for stale claims.

```ts
assert.deepEqual(await reconciler.runOnce(), "updated");
assert.deepEqual(completed, {
  hostnameStatus: "active",
  sslStatus: "active",
  dnsStatus: "ready",
  originStatus: "ready",
});
```

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
node --experimental-strip-types --test packages/saas-domain-core/src/service.test.ts packages/saas-domain-core/src/reconciler.test.ts
```

Expected: service/reconciler exports are missing.

- [ ] **Step 3: Implement orchestration and bounded retries**

Create performs local prepare, provider create, duplicate lookup recovery, and local bind. Reconciler claims one row, loads provider snapshot, resolves the configured CNAME target with an injected DNS resolver, sends `GET https://{hostname}/api/health` with a five-second timeout and exact expected tenant marker, then completes the claim.

Retry schedule is fixed and bounded:

```ts
const RETRY_SECONDS = Object.freeze([30, 60, 120, 300, 600, 1800, 3600]);
```

Provider 4xx validation errors become `action_required`; 429/5xx/network timeouts retry; repeated terminal not-found after a requested removal becomes deleted.

- [ ] **Step 4: Write and implement strict owner worker configuration**

Require:

```text
CLOUDFLARE_SAAS_API_TOKEN
CLOUDFLARE_SAAS_ZONE_ID
CELEBIX_CUSTOM_DOMAIN_CNAME_TARGET
CELEBIX_CUSTOM_DOMAIN_RESERVED_SUFFIXES
CELEBIX_STORE_DOMAIN_WORKER_ID
CELEBIX_STORE_DOMAIN_WORKER_ENABLED=true|false
CELEBIX_SAAS_DATABASE_URL
```

Configuration rejects public database URLs, non-HTTPS Cloudflare base URLs, targets outside reserved Celebix suffixes, unsafe worker IDs, and missing secrets when enabled.

- [ ] **Step 5: Compose worker and node-only instrumentation**

Start the bounded loop only in the owner Node runtime. Use one in-flight `runOnce`, a 15-second empty delay, immediate continuation after successful work, abort on shutdown, and a generic `store_domain_worker_run_failed` log without provider data.

- [ ] **Step 6: Run tests and typechecks**

```bash
npm test --workspace @celebix/saas-domain-core
npm test --workspace @celebix/owner -- --test-name-pattern="store domain|instrumentation"
npm run typecheck --workspace @celebix/owner
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add packages/saas-domain-core/src apps/owner/lib/store-domain-reconciliation apps/owner/instrumentation.ts apps/owner/instrumentation.test.ts
git commit -m "feat: reconcile storefront custom domains"
```

---

### Task 5: Tenant-authorized custom-domain HTTP API

**Files:**
- Create: `apps/customer-panel/lib/server-store-domains/runtime.ts`
- Test: `apps/customer-panel/lib/server-store-domains/runtime.test.ts`
- Create: `apps/customer-panel/lib/server-store-domains/default.ts`
- Create: `apps/customer-panel/lib/store-domain-http/handler.ts`
- Test: `apps/customer-panel/lib/store-domain-http/handler.test.ts`
- Create: `apps/customer-panel/lib/store-domain-http/default.ts`
- Create: `apps/customer-panel/app/api/store-domains/route.ts`
- Create: `apps/customer-panel/app/api/store-domains/[domainId]/recheck/route.ts`
- Create: `apps/customer-panel/app/api/store-domains/[domainId]/primary/route.ts`
- Create: `apps/customer-panel/app/api/store-domains/[domainId]/route.ts`
- Modify: `apps/customer-panel/package.json`

**Interfaces:**
- Produces: `GET /api/store-domains`, `POST /api/store-domains`, `POST /api/store-domains/:id/recheck`, `POST /api/store-domains/:id/primary`, `DELETE /api/store-domains/:id`.
- Consumes: Task 4 `StoreDomainService` and panel session/tenant authority.

- [ ] **Step 1: Write failing HTTP behavior tests**

Cover origin/CSRF enforcement, no session, wrong method, malformed JSON, unknown keys, hostname normalization, operation ID handling, permissions, feature disabled, limit reached, duplicate hostname, provider unavailable, recheck, primary, disable, and safe error output.

```ts
const response = await handlers.collection(new Request("https://admin.example.test/api/store-domains", {
  method: "POST",
  headers: { "content-type": "application/json", "x-celebix-operation-id": OPERATION },
  body: JSON.stringify({ hostname: "www.example.com" }),
}));
assert.equal(response.status, 202);
assert.deepEqual(await response.json(), { domain: PENDING_DOMAIN });
```

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
node --experimental-transform-types --test apps/customer-panel/lib/store-domain-http/handler.test.ts
```

Expected: handler is missing.

- [ ] **Step 3: Implement runtime facade and handlers**

Use the same authorization pattern as `store-policy-http`: resolve panel access, require exact same-origin mutation, generate server time/request IDs, parse exact payload keys, and call only service methods bound to the approved runtime. Return `Cache-Control: no-store` on all responses.

Map errors exactly:

```ts
const STATUS = Object.freeze({
  invalid_input: 400,
  unauthenticated: 401,
  forbidden: 403,
  feature_not_enabled: 403,
  limit_reached: 409,
  hostname_already_claimed: 409,
  stale_version: 409,
  provider_unavailable: 503,
});
```

- [ ] **Step 4: Mount App Router endpoints and include tests in workspace script**

Each route file re-exports one named handler. Add `lib/server-store-domains/*.test.ts lib/store-domain-http/*.test.ts` to the customer-panel test script.

- [ ] **Step 5: Run tests and typecheck**

```bash
npm test --workspace @celebix/customer-panel -- --test-name-pattern="store domain"
npm run typecheck --workspace @celebix/customer-panel
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-panel/app/api/store-domains apps/customer-panel/lib/server-store-domains apps/customer-panel/lib/store-domain-http apps/customer-panel/package.json
git commit -m "feat: expose storefront domain management api"
```

---

### Task 6: Minimal `Ayarlar > Alan Adı` interface

**Files:**
- Create: `apps/customer-panel/app/settings/domains/page.tsx`
- Create: `apps/customer-panel/components/settings/domains/DomainSettings.tsx`
- Create: `apps/customer-panel/components/settings/domains/domain-settings.module.css`
- Create: `apps/customer-panel/lib/store-domain-ui/client.ts`
- Create: `apps/customer-panel/lib/store-domain-ui/model.ts`
- Test: `apps/customer-panel/lib/store-domain-ui/model.test.ts`
- Test: `apps/customer-panel/lib/store-domain-settings.test.ts`
- Modify: `apps/customer-panel/lib/panel-ui/navigation.ts`
- Modify: `apps/customer-panel/lib/panel-ui/navigation.test.ts`
- Modify: `apps/customer-panel/components/merchant-admin/MerchantFamilyOverview.tsx`
- Modify: `apps/customer-panel/lib/settings-information-architecture.test.ts`

**Interfaces:**
- Produces: `/settings/domains` with list/create/recheck/primary/remove behavior.
- Consumes: Task 5 APIs and Task 1 UI statuses.

- [ ] **Step 1: Write failing navigation, model, and rendered-source tests**

Assert `Alan Adı` appears under Settings, descriptions are not duplicated, the page has one hostname input, live status labels, record copy buttons, and no fixture completion text.

```ts
assert.equal(statusLabel("dns_pending"), "DNS bekleniyor");
assert.equal(statusLabel("ssl_pending"), "SSL hazırlanıyor");
assert.equal(statusLabel("active"), "Aktif");
```

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
node --experimental-transform-types --test apps/customer-panel/lib/store-domain-ui/model.test.ts apps/customer-panel/lib/store-domain-settings.test.ts apps/customer-panel/lib/settings-information-architecture.test.ts
```

Expected: page, model, and route are missing.

- [ ] **Step 3: Implement the UI model and API client**

The client exposes:

```ts
listStoreDomains(): Promise<readonly StoreDomainView[]>
createStoreDomain(hostname: string): Promise<StoreDomainView>
recheckStoreDomain(domainId: string, version: number): Promise<StoreDomainView>
makeStoreDomainPrimary(domainId: string, version: number): Promise<StoreDomainView>
removeStoreDomain(domainId: string, version: number): Promise<StoreDomainView>
```

Generate a fresh operation UUID for each mutation, abort requests at 15 seconds, parse exact response keys, and preserve the last confirmed server state on failure.

- [ ] **Step 4: Implement the open-layout settings page**

Use `PanelTopbarBridge title="Alan Adı"` with no subtitle. Render:

1. permanent Celebix hostname row;
2. one input and `Alan adını bağla` action;
3. one DNS row (`Tür`, `Ad`, `Hedef`, copy icons);
4. compact four-step progress rail;
5. one exact corrective action;
6. `Birincil yap`, `Yeniden kontrol et`, and guarded `Kaldır` actions.

Use dividers and whitespace instead of surrounding cards. On mobile, stack the DNS values and keep all actions at least 44px high. Confirmation is required only for removal.

- [ ] **Step 5: Run focused tests, full panel tests, and typecheck**

```bash
node --experimental-transform-types --test apps/customer-panel/lib/store-domain-ui/model.test.ts apps/customer-panel/lib/store-domain-settings.test.ts apps/customer-panel/lib/panel-ui/navigation.test.ts apps/customer-panel/lib/settings-information-architecture.test.ts
npm test --workspace @celebix/customer-panel
npm run typecheck --workspace @celebix/customer-panel
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-panel/app/settings/domains apps/customer-panel/components/settings/domains apps/customer-panel/lib/store-domain-ui apps/customer-panel/lib/panel-ui/navigation.ts apps/customer-panel/lib/panel-ui/navigation.test.ts apps/customer-panel/components/merchant-admin/MerchantFamilyOverview.tsx apps/customer-panel/lib/settings-information-architecture.test.ts
git commit -m "feat: add custom domain settings experience"
```

---

### Task 7: Primary-host canonicalization across storefront flows

**Files:**
- Modify: `apps/owner/scripts/sql/saas/202608050088_storefront_custom_domains.up.sql`
- Modify: `apps/owner/scripts/sql/saas/202608050088_storefront_custom_domains_assertions.sql`
- Modify: `packages/saas-data/src/storefront/repository.test.ts`
- Modify: `packages/saas-data/src/storefront/types.ts`
- Modify: `apps/storefront-shared/lib/storefront-data.ts`
- Test: `apps/storefront-shared/lib/storefront-data.test.ts`
- Modify: `apps/storefront-shared/app/layout.tsx`
- Test: `apps/storefront-shared/lib/custom-domain-canonicalization.test.ts`
- Modify: customer account/magic-link URL construction files discovered by `rg -l 'primaryHostname|canonicalUrl|account/login' apps/storefront-shared packages/saas-data/src/storefront*`

**Interfaces:**
- Produces: public storefront projection with requested `hostname`, active `primaryHostname`, and `canonicalUrl = https://{primaryHostname}/`.
- Consumes: Task 2 active primary transaction.

- [ ] **Step 1: Write failing alias/canonical tests**

Test active platform alias with active custom primary, active custom alias with platform primary, pending custom hostname not found, and canonical custom host preserving safe path/query.

```ts
assert.deepEqual(storefront, {
  ...BASE,
  hostname: "shop.saas-staging.celebix.site",
  primaryHostname: "www.example.com",
  canonicalUrl: "https://www.example.com/",
});
```

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
node --experimental-strip-types --test packages/saas-data/src/storefront/repository.test.ts
node --experimental-transform-types --test apps/storefront-shared/lib/storefront-data.test.ts apps/storefront-shared/lib/custom-domain-canonicalization.test.ts
```

Expected: current resolver uses the requested domain in `canonicalUrl` and no alias redirect exists.

- [ ] **Step 3: Correct the SQL projection and shared redirect**

Change the resolver projection to:

```sql
'hostname', domain.hostname,
'primaryHostname', primary_domain.hostname,
'canonicalUrl', 'https://' || primary_domain.hostname || '/'
```

At the shared storefront boundary, redirect only when the requested hostname belongs to the resolved store, is active, and differs from `primaryHostname`. Preserve pathname and a validated query string; discard credentials, ports, fragments, and forwarded host input not accepted by the existing trusted-host parser. Use HTTP 308.

- [ ] **Step 4: Verify customer account and checkout continuity**

Ensure magic-link callback, account cookies, cart cookies, receipt links, and checkout redirects use host-only cookies and server-derived current hostname/canonical hostname. Add tests proving no cookie contains a `Domain=` attribute and a login initiated on the custom hostname returns to that same active custom hostname.

- [ ] **Step 5: Run storefront, data, and migration tests**

```bash
npm test --workspace @celebix/saas-data -- --test-name-pattern="storefront|store domain"
npm test --workspace @celebix/storefront-shared
node --experimental-strip-types --test apps/owner/scripts/sql/saas/storefront-custom-domains-migration.test.ts
npm run typecheck --workspace @celebix/storefront-shared
```

Expected: all pass.

- [ ] **Step 6: Refresh migration checksums and commit**

```bash
git add apps/owner/scripts/sql/saas/202608050088_* apps/owner/scripts/sql/saas/phase4h-* packages/saas-data/src/storefront apps/storefront-shared
git commit -m "feat: canonicalize storefront custom domains"
```

---

### Task 8: Cloudflare Tunnel and deployment readiness

**Files:**
- Create: `scripts/verify-cloudflare-saas-readiness.mjs`
- Test: `scripts/verify-cloudflare-saas-readiness.test.mjs`
- Create: `infra/cloudflare/storefront-tunnel.example.yml`
- Create: `docs/operations/storefront-custom-domains.md`
- Modify: `package.json`
- Modify: relevant `.env.example` files found with `rg --files -g '.env*example*'`

**Interfaces:**
- Produces: `npm run verify:custom-domains` read-only preflight.
- Consumes: Cloudflare zone, fallback origin, CNAME target, tunnel state, and shared storefront health endpoint.

- [ ] **Step 1: Write failing preflight tests**

Inject fetch/DNS dependencies and test active, missing quota, inactive fallback origin, wrong proxied target, tunnel unavailable, malformed Cloudflare response, and exact-host health mismatch.

```js
assert.deepEqual(await verifyReadiness(VALID, deps), {
  zone: "active",
  customHostnameQuota: "ready",
  fallbackOrigin: "active",
  cnameTarget: "ready",
  tunnel: "healthy",
  storefront: "healthy",
});
```

- [ ] **Step 2: Run test and confirm failure**

```bash
node --test scripts/verify-cloudflare-saas-readiness.test.mjs
```

Expected: script exports are missing.

- [ ] **Step 3: Implement a read-only preflight**

The script performs only GET/DNS/health calls, uses bounded timeouts, redacts secrets, prints one JSON document, and exits non-zero unless every required state is ready. Add:

```json
"verify:custom-domains": "node ./scripts/verify-cloudflare-saas-readiness.mjs"
```

- [ ] **Step 4: Add tunnel example and runbook**

Use a catch-all service rule followed by no public fallback:

```yaml
tunnel: STORE_TUNNEL_UUID
credentials-file: /etc/cloudflared/storefront-tunnel.json
ingress:
  - service: http://storefront-shared:3000
```

The runbook must give exact dashboard/API steps for enabling Cloudflare for SaaS, creating `shops-origin.celebix.site`, creating proxied `shops.celebix.site`, setting the fallback origin, running two tunnel replicas, adding Coolify secrets, applying migration `088`, enabling the owner worker, testing, disabling the worker, and rolling back before an active custom domain exists.

- [ ] **Step 5: Run preflight unit tests and repository checks**

```bash
node --test scripts/verify-cloudflare-saas-readiness.test.mjs
npm run typecheck
git diff --check
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/verify-cloudflare-saas-readiness* infra/cloudflare docs/operations/storefront-custom-domains.md package.json package-lock.json
git commit -m "ops: add custom domain edge readiness"
```

---

### Task 9: Complete staging lifecycle verification

**Files:**
- Create: `tests/saas-phase3/storefront-custom-domains/lifecycle.test.mjs`
- Create: `tests/saas-phase3/storefront-custom-domains/browser-acceptance.mjs`
- Create: `tests/saas-phase3/storefront-custom-domains/README.md`
- Modify: `tests/saas-phase3/run-current-suite.mjs`
- Modify: `docs/operations/storefront-custom-domains.md`

**Interfaces:**
- Produces: repeatable evidence that one Celebix-owned staging hostname completes connect, activate, primary, alias redirect, account, cart, checkout, and remove flows.
- Consumes: Tasks 1–8 and an owned staging test hostname.

- [ ] **Step 1: Write the lifecycle test before staging mutation**

The test must accept only environment-supplied test hostname and credentials, refuse production zones/suffixes, generate a unique operation ID, and always restore the platform hostname as primary in cleanup.

```js
assert.equal(result.hostnameStatus, "active");
assert.equal(result.sslStatus, "active");
assert.equal(result.dnsStatus, "ready");
assert.equal(result.originStatus, "ready");
assert.equal(result.primaryHostname, TEST_HOSTNAME);
```

- [ ] **Step 2: Run the lifecycle test and confirm it fails safely before configuration**

```bash
node --test tests/saas-phase3/storefront-custom-domains/lifecycle.test.mjs
```

Expected: exits before mutation with `custom_domain_staging_configuration_missing`.

- [ ] **Step 3: Configure staging edge and deployment secrets**

Follow the runbook, run:

```bash
npm run verify:custom-domains
```

Expected: six readiness fields are `ready`/`active`/`healthy` and no secret appears in output.

- [ ] **Step 4: Apply migration and deploy disabled worker**

Run the repository's self-hosted migration command for the staging database, deploy owner/customer-panel/storefront images, and keep `CELEBIX_STORE_DOMAIN_WORKER_ENABLED=false` until health checks pass.

- [ ] **Step 5: Enable worker and run lifecycle/browser acceptance**

```bash
node --test tests/saas-phase3/storefront-custom-domains/lifecycle.test.mjs
node tests/saas-phase3/storefront-custom-domains/browser-acceptance.mjs
```

Browser acceptance verifies desktop and 390px mobile settings UI, copy buttons, live status changes, HTTPS storefront, 308 alias redirect, customer magic-link return, cart persistence, guest checkout, account checkout, and platform fallback after removal.

- [ ] **Step 6: Run full verification**

```bash
npm run typecheck
npm run build:coolify:customer-panel
npm run build:coolify:storefront-shared
npm run build:coolify:owner
npm run test:saas-phase3:current
git diff --check
git status --short
```

Expected: all commands pass; only the user-owned `.superpowers/` path may remain untracked.

- [ ] **Step 7: Commit verification evidence**

```bash
git add tests/saas-phase3/storefront-custom-domains tests/saas-phase3/run-current-suite.mjs docs/operations/storefront-custom-domains.md
git commit -m "test: verify storefront custom domain lifecycle"
```

---

## Completion gate

Before declaring the feature complete:

- Confirm design acceptance criteria map to Tasks 1–9.
- Confirm no Cloudflare token, validation secret, database URL, or test mailbox appears in Git history or logs.
- Confirm free-starter remains at `customDomains = 0` unless a separate immutable plan-version change was explicitly approved.
- Confirm Güzide Kuyumcu's current platform storefront and admin origins still work before enabling its custom-domain entitlement.
- Confirm the custom domain is activated only after both Cloudflare statuses and Celebix health are ready.
- Confirm removal restores the platform primary hostname and deletes the provider hostname.
- Confirm the feature can be disabled by worker/config without redeploying or breaking platform subdomains.
