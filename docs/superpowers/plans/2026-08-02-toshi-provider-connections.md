# Toshi Provider Connections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** OpenAI, Google Gemini ve Anthropic Claude API anahtarlarını mağaza bazında doğrulayan, şifreli saklayan, kaydedildiğinde aktif eden ve `/settings/artificial-intelligence` ekranından yönetilen üretim güvenli bağlantı katmanını kurmak.

**Architecture:** Paylaşılan sözleşmeler üç sağlayıcıyı ve güvenli public DTO'ları tanımlar. PostgreSQL yalnız şifreli envelope, model seçimi ve audit tutar; customer-panel sunucusu resmî provider endpoint'lerini doğrular ve mevcut provider keyring/AEAD kodunu yeniden kullanır. Browser yalnız maskeli bağlantı durumunu görür ve aynı-origin, tenant-yetkili API ile işlem yapar.

**Tech Stack:** TypeScript 5.9, Next.js 16 App Router, React 19, Node test runner, PostgreSQL 16, `pg`, Node `crypto`, mevcut `@celebix/saas-contracts` ve `@celebix/saas-data` paketleri.

## Global Constraints

- Her mağaza kendi OpenAI, Gemini veya Anthropic API anahtarını kullanır; ortak Celebix anahtarı yoktur.
- Yalnız `api.openai.com`, `generativelanguage.googleapis.com` ve `api.anthropic.com` host'larına sabit adaptör çağrısı yapılır; kullanıcı base URL veremez.
- Başarıyla doğrulanıp kaydedilen bağlantı hemen `active` olur; ilk bağlantı otomatik varsayılandır.
- Sonradan eklenen bağlantı aktif olur fakat mevcut varsayılanı sessizce değiştirmez.
- API anahtarı `merchant_admin_records.config`, HTML, client prop, browser storage, log veya read DTO'suna girmez.
- Secret için mevcut provider credential keyring ve AEAD envelope kodu kullanılır; yeni kripto algoritması yazılmaz.
- Listeleme geçerli mağaza üyeliği, mutasyonlar ayrıca `configuration.manage` yetkisi gerektirir.
- Provider değişiklikleri exact origin/path, JSON content type, bounded body ve idempotency key kurallarını uygular.
- Bu plan yalnız güvenli bağlantı ve ayar yüzeyini teslim eder; Toshi mesaj/model orkestrasyonu ayrı planda bu public olmayan credential authority'yi tüketir.

---

## File Map

**Shared contracts**

- `packages/saas-contracts/src/toshi/providers.ts`: provider enum, public connection/model DTO'ları, parsers ve hata kodları.
- `packages/saas-contracts/src/toshi/providers.test.ts`: exact-object, bounds ve secret-redaction sözleşmeleri.
- `packages/saas-contracts/src/toshi/index.ts`: Toshi contract barrel.
- `packages/saas-contracts/src/index.ts`: public export.
- `packages/saas-contracts/src/merchant-admin/types.ts`: mevcut envelope AAD için `ai_assistant` capability.
- `packages/saas-contracts/src/merchant-admin/merchant-admin.test.ts`: capability sözleşmesi güncellemesi.

**PostgreSQL and data package**

- `apps/owner/scripts/sql/saas/202608020080_toshi_provider_connections.up.sql`: table, indexes, audit ve SECURITY DEFINER fonksiyonları.
- `apps/owner/scripts/sql/saas/202608020080_toshi_provider_connections.down.sql`: bounded rollback.
- `apps/owner/scripts/sql/saas/202608020080_toshi_provider_connections_assertions.sql`: live schema assertions.
- `apps/owner/scripts/sql/saas/phase3-toshi-provider-connections-manifest.json`: SHA-256 pinned migration manifest.
- `apps/owner/scripts/sql/saas/toshi-provider-connections-migration.test.ts`: migration static contract tests.
- `packages/saas-data/src/toshi-providers/types.ts`: repository inputs and internal credential authority.
- `packages/saas-data/src/toshi-providers/canonical.ts`: strict canonicalization/fingerprints.
- `packages/saas-data/src/toshi-providers/errors.ts`: finite repository errors.
- `packages/saas-data/src/toshi-providers/repository.ts`: transaction-safe PostgreSQL adapter.
- `packages/saas-data/src/toshi-providers/repository.test.ts`: SQL, authority, replay and projection tests.
- `packages/saas-data/src/toshi-providers/index.ts`: package exports.
- `packages/saas-data/src/index.ts`: public export.

**Provider verification and server runtime**

- `apps/customer-panel/lib/toshi-provider-adapters/types.ts`: adapter interface and normalized errors.
- `apps/customer-panel/lib/toshi-provider-adapters/model-policy.ts`: bounded model-family allowlist and deterministic default selection.
- `apps/customer-panel/lib/toshi-provider-adapters/openai.ts`: OpenAI `/v1/models` adapter.
- `apps/customer-panel/lib/toshi-provider-adapters/gemini.ts`: Gemini `/v1beta/models` adapter.
- `apps/customer-panel/lib/toshi-provider-adapters/anthropic.ts`: Anthropic `/v1/models` adapter.
- `apps/customer-panel/lib/toshi-provider-adapters/registry.ts`: finite provider registry.
- `apps/customer-panel/lib/toshi-provider-adapters/adapters.test.ts`: injected-fetch contract tests.
- `apps/customer-panel/lib/server-toshi-providers/runtime.ts`: access, repository, keyring and adapter registry composition.
- `apps/customer-panel/lib/server-toshi-providers/runtime.test.ts`: immutable runtime and disabled-state tests.
- `apps/customer-panel/lib/server-panel-access/postgres-runtime.ts`: production runtime registration.

**HTTP and UI**

- `apps/customer-panel/lib/toshi-provider-http/handler.ts`: authorization, secret zeroing and five API operations.
- `apps/customer-panel/lib/toshi-provider-http/handler.test.ts`: request/response/security matrix.
- `apps/customer-panel/lib/toshi-provider-http/default.ts`: route-ready production handlers.
- `apps/customer-panel/app/api/settings/artificial-intelligence/providers/route.ts`: list endpoint.
- `apps/customer-panel/app/api/settings/artificial-intelligence/providers/[provider]/connect/route.ts`: connect endpoint.
- `apps/customer-panel/app/api/settings/artificial-intelligence/providers/[provider]/model/route.ts`: model endpoint.
- `apps/customer-panel/app/api/settings/artificial-intelligence/providers/[provider]/default/route.ts`: default endpoint.
- `apps/customer-panel/app/api/settings/artificial-intelligence/providers/[provider]/route.ts`: revoke endpoint.
- `apps/customer-panel/lib/toshi-provider-ui/client.ts`: strict same-origin browser client.
- `apps/customer-panel/lib/toshi-provider-ui/client.test.ts`: DTO and request contract tests.
- `apps/customer-panel/components/toshi-settings/ArtificialIntelligenceSettings.tsx`: provider connection UI.
- `apps/customer-panel/components/toshi-settings/artificial-intelligence-settings.module.css`: flat responsive presentation.
- `apps/customer-panel/components/toshi-settings/ArtificialIntelligenceSettings.test.ts`: source/UI behavior contract.
- `apps/customer-panel/app/settings/artificial-intelligence/page.tsx`: page composition and permission projection.

---

### Task 1: Shared Toshi Provider Contracts

**Files:**
- Create: `packages/saas-contracts/src/toshi/providers.ts`
- Create: `packages/saas-contracts/src/toshi/providers.test.ts`
- Create: `packages/saas-contracts/src/toshi/index.ts`
- Modify: `packages/saas-contracts/src/index.ts`
- Modify: `packages/saas-contracts/src/merchant-admin/types.ts`
- Modify: `packages/saas-contracts/src/merchant-admin/merchant-admin.test.ts`

**Interfaces:**
- Produces: `TOSHI_PROVIDERS`, `TOSHI_PROVIDER_CONNECTION_STATUSES`, `TOSHI_PROVIDER_ERROR_CODES`, `parseToshiProviderConnection`, `parseToshiProviderConnectionList`, `ToshiProvider`, `ToshiProviderConnection`, `ToshiProviderModel`, `ToshiProviderErrorCode`.
- Extends: `MerchantProviderCapability` with exact value `ai_assistant` so existing envelope AAD can domain-separate Toshi credentials.

- [ ] **Step 1: Write failing contract tests**

```ts
const NOW = "2026-08-02T12:00:00.000Z";

test("Toshi providers expose only safe finite public connection state", () => {
  assert.deepEqual(TOSHI_PROVIDERS, ["openai", "gemini", "anthropic"]);
  const parsed = parseToshiProviderConnection({
    provider: "openai", label: "OpenAI", status: "active", isDefault: true,
    maskedKey: "••••abcd", selectedModel: "gpt-5", availableModels: [
      { id: "gpt-5", label: "gpt-5" },
    ], version: 1, verifiedAt: NOW, updatedAt: NOW,
  });
  assert.equal(parsed.provider, "openai");
  assert.throws(() => parseToshiProviderConnection({ ...parsed, apiKey: "sk-private" }));
  assert.throws(() => parseToshiProviderConnection({ ...parsed, availableModels: new Array(101).fill({ id: "x", label: "x" }) }));
});

test("provider credential capability includes the isolated AI assistant domain", () => {
  assert.equal(MERCHANT_PROVIDER_CAPABILITIES.includes("ai_assistant"), true);
});
```

- [ ] **Step 2: Run tests and verify the new exports are missing**

Run: `node --experimental-transform-types --test packages/saas-contracts/src/toshi/providers.test.ts packages/saas-contracts/src/merchant-admin/merchant-admin.test.ts`

Expected: FAIL because `./toshi/index.ts` and `ai_assistant` do not exist.

- [ ] **Step 3: Implement exact provider DTO parsers and exports**

```ts
export const TOSHI_PROVIDERS = Object.freeze(["openai", "gemini", "anthropic"] as const);
export const TOSHI_PROVIDER_CONNECTION_STATUSES = Object.freeze(["active", "revoked"] as const);
export const TOSHI_PROVIDER_ERROR_CODES = Object.freeze([
  "invalid_input", "unauthenticated", "membership_denied", "origin_denied",
  "credential_invalid", "model_unavailable", "rate_limited", "quota_exceeded",
  "provider_timeout", "provider_unavailable", "version_conflict", "unavailable",
] as const);

export type ToshiProvider = (typeof TOSHI_PROVIDERS)[number];
export type ToshiProviderErrorCode = (typeof TOSHI_PROVIDER_ERROR_CODES)[number];
export type ToshiProviderModel = Readonly<{ id: string; label: string }>;
export type ToshiProviderConnection = Readonly<{
  provider: ToshiProvider;
  label: string;
  status: "active" | "revoked";
  isDefault: boolean;
  maskedKey: string;
  selectedModel: string;
  availableModels: readonly ToshiProviderModel[];
  version: number;
  verifiedAt: string;
  updatedAt: string;
}>;
```

Implement parsers with plain-object/exact-key checks, ISO timestamps, unique model IDs, 1–100 models, 1–160 byte model IDs/labels, version >= 1, provider/label consistency, and no unknown fields. Add `ai_assistant` to `MERCHANT_PROVIDER_CAPABILITIES` and update its expected length assertion from 7 to 8 where applicable.

- [ ] **Step 4: Run contract tests**

Run: `node --experimental-transform-types --test packages/saas-contracts/src/toshi/providers.test.ts packages/saas-contracts/src/merchant-admin/merchant-admin.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/saas-contracts/src
git commit -m "feat: define Toshi provider contracts"
```

---

### Task 2: PostgreSQL Provider Vault and Audit Authority

**Files:**
- Create: `apps/owner/scripts/sql/saas/202608020080_toshi_provider_connections.up.sql`
- Create: `apps/owner/scripts/sql/saas/202608020080_toshi_provider_connections.down.sql`
- Create: `apps/owner/scripts/sql/saas/202608020080_toshi_provider_connections_assertions.sql`
- Create: `apps/owner/scripts/sql/saas/phase3-toshi-provider-connections-manifest.json`
- Create: `apps/owner/scripts/sql/saas/toshi-provider-connections-migration.test.ts`

**Interfaces:**
- Produces table: `saas.toshi_provider_configs` and append-only `saas.toshi_provider_events`.
- Produces functions: `toshi_provider_list`, `toshi_provider_connect`, `toshi_provider_select_model`, `toshi_provider_set_default`, `toshi_provider_revoke`, `toshi_provider_get_authority`, `toshi_provider_recover_operation`.
- Consumes: `saas.merchant_action_authority_error(..., 'catalog', 'configuration.manage')` for writes, `configuration.read` for reads and existing tenant context columns. `catalog` intentionally keeps Toshi available to starter stores while action authorization remains configuration-specific.

- [ ] **Step 1: Write failing migration artifact test**

```ts
test("Toshi provider vault is store-scoped, encrypted-only and secret-free in projections", () => {
  assert.match(up, /CREATE TABLE saas[.]toshi_provider_configs/);
  assert.match(up, /sealed_credentials jsonb NOT NULL/);
  assert.match(up, /credential_digest text NOT NULL/);
  assert.doesNotMatch(up, /api_key\s+text/i);
  assert.match(up, /CREATE UNIQUE INDEX toshi_provider_one_live_provider/);
  assert.match(up, /CREATE UNIQUE INDEX toshi_provider_one_default/);
  assert.match(up, /merchant_action_authority_error\([^;]+?'catalog','configuration[.]manage'/s);
  assert.match(up, /REVOKE ALL ON TABLE saas[.]toshi_provider_configs FROM PUBLIC/);
});
```

- [ ] **Step 2: Run the migration test and verify artifacts are absent**

Run: `node --experimental-transform-types --test apps/owner/scripts/sql/saas/toshi-provider-connections-migration.test.ts`

Expected: FAIL with missing migration file.

- [ ] **Step 3: Implement the schema and SECURITY DEFINER functions**

Core table contract:

```sql
CREATE TABLE saas.toshi_provider_configs (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('openai','gemini','anthropic')),
  sealed_credentials jsonb NOT NULL,
  credential_digest text NOT NULL CHECK (credential_digest ~ '^sha256:[a-f0-9]{64}$'),
  credential_version bigint NOT NULL CHECK (credential_version >= 1),
  masked_key text NOT NULL,
  selected_model text NOT NULL,
  available_models jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('active','revoked')),
  is_default boolean NOT NULL DEFAULT false,
  version bigint NOT NULL CHECK (version >= 1),
  verified_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX toshi_provider_one_live_provider
  ON saas.toshi_provider_configs(store_id,provider) WHERE status = 'active';
CREATE UNIQUE INDEX toshi_provider_one_default
  ON saas.toshi_provider_configs(store_id) WHERE status = 'active' AND is_default;
```

All functions must accept the full tenant authority tuple, use exact provider/model/version validation, lock the affected store rows, keep an existing active credential on failed pre-database verification, increment `credential_version` on rotation, append one event per committed mutation, and return public JSON without `sealed_credentials` or `credential_digest`. `toshi_provider_get_authority` is the only function returning an encrypted envelope and is granted only to `celebix_saas_app`; it still requires full tenant authority and returns one selected active/default config. Add operation table/fingerprint handling so repeated idempotency keys replay and mismatched payloads return `operation_mismatch`.

- [ ] **Step 4: Add rollback, assertions and checksum manifest**

Rollback drops functions before tables inside one transaction. Assertions verify owners, grants, RLS/FORCE RLS, partial unique indexes, no PUBLIC privileges, function volatility/security and secret-free list projection. Generate SHA-256 values using:

```bash
shasum -a 256 \
  apps/owner/scripts/sql/saas/202608020080_toshi_provider_connections.up.sql \
  apps/owner/scripts/sql/saas/202608020080_toshi_provider_connections.down.sql \
  apps/owner/scripts/sql/saas/202608020080_toshi_provider_connections_assertions.sql
```

Copy these three exact digests into the matching manifest artifact entries.

- [ ] **Step 5: Run migration artifact tests**

Run: `node --experimental-transform-types --test apps/owner/scripts/sql/saas/toshi-provider-connections-migration.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/owner/scripts/sql/saas/202608020080_toshi_provider_connections* apps/owner/scripts/sql/saas/phase3-toshi-provider-connections-manifest.json apps/owner/scripts/sql/saas/toshi-provider-connections-migration.test.ts
git commit -m "feat: add Toshi provider credential vault"
```

---

### Task 3: Toshi Provider PostgreSQL Repository

**Files:**
- Create: `packages/saas-data/src/toshi-providers/types.ts`
- Create: `packages/saas-data/src/toshi-providers/canonical.ts`
- Create: `packages/saas-data/src/toshi-providers/errors.ts`
- Create: `packages/saas-data/src/toshi-providers/repository.ts`
- Create: `packages/saas-data/src/toshi-providers/repository.test.ts`
- Create: `packages/saas-data/src/toshi-providers/index.ts`
- Modify: `packages/saas-data/src/index.ts`

**Interfaces:**
- Produces `ToshiProviderRepository` with `list`, `getConnectionIdentity`, `connect`, `selectModel`, `setDefault`, `revoke`, `getAuthority`.
- Produces `PostgresToshiProviderRepository` and `ToshiProviderRepositoryError`.
- `getAuthority` returns `ToshiProviderCredentialAuthority` containing only server-side sealed credentials and credential version.

- [ ] **Step 1: Write failing repository tests with a scripted pool**

```ts
test("list projects only public provider state through full tenant authority", async () => {
  const pool = scriptedPool([{ rows: [{ outcome: "listed", result_payload: { items: [CONNECTION] } }], rowCount: 1 }]);
  const repository = new PostgresToshiProviderRepository(options(pool));
  assert.deepEqual(await repository.list({ tenantContext: TENANT, now: NOW }), [CONNECTION]);
  assert.match(pool.queries.at(-2)!.text, /saas[.]toshi_provider_list/);
  assert.equal(JSON.stringify(await repository.list).includes("sealed_credentials"), false);
});

```

Add an explicit commit-unknown case whose scripted query order is `BEGIN`, three
`set_config` calls, `SET LOCAL ROLE`, `toshi_provider_connect`, failing `COMMIT`, then a
new read-only transaction calling `toshi_provider_recover_operation`; assert recovery
returns the byte-for-byte same public connection. Also cover exact input keys, provider
enum, model belonging to available models, version conflict mapping, timeout
configuration, rollback destruction and public parser failure.

- [ ] **Step 2: Run tests and verify repository is missing**

Run: `node --experimental-transform-types --test packages/saas-data/src/toshi-providers/repository.test.ts`

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement repository interfaces and canonicalization**

```ts
export interface ToshiProviderRepository {
  list(input: ToshiProviderAuthorityInput): Promise<readonly ToshiProviderConnection[]>;
  getConnectionIdentity(input: GetToshiProviderConnectionIdentityInput): Promise<Readonly<{
    configId: string;
    credentialVersion: number;
    version: number;
  }> | null>;
  connect(input: ConnectToshiProviderInput): Promise<ToshiProviderConnection>;
  selectModel(input: SelectToshiProviderModelInput): Promise<ToshiProviderConnection>;
  setDefault(input: SetDefaultToshiProviderInput): Promise<ToshiProviderConnection>;
  revoke(input: RevokeToshiProviderInput): Promise<ToshiProviderConnection>;
  getAuthority(input: GetToshiProviderAuthorityInput): Promise<ToshiProviderCredentialAuthority>;
}
```

Follow `provider-execution/repository.ts`: bounded pool checkout, read-only reads, `SET LOCAL ROLE celebix_saas_app`, statement/lock/idle timeouts, exact one-row outcomes, explicit rollback, destroy-on-uncertain-connection and commit-unknown recovery. Canonical fingerprints include store ID, provider, selected model, available model IDs, credential digest/version and expected version, never plaintext.

`ConnectToshiProviderInput` contains `configId`, `provider`, `sealedCredentials`,
`credentialDigest`, `credentialVersion`, `maskedKey`, `selectedModel`,
`availableModels`, `expectedVersion`, `operationId`, `tenantContext` and `now`.
`getConnectionIdentity` returns only config ID/current credential version/public version;
it never returns the sealed secret. `getAuthority` is the separate server-only read used
by the later message runtime.

- [ ] **Step 4: Run repository and package type tests**

Run: `node --experimental-transform-types --test packages/saas-data/src/toshi-providers/repository.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/saas-data/src/toshi-providers packages/saas-data/src/index.ts
git commit -m "feat: add Toshi provider repository"
```

---

### Task 4: Official Provider Verification Adapters

**Files:**
- Create: `apps/customer-panel/lib/toshi-provider-adapters/types.ts`
- Create: `apps/customer-panel/lib/toshi-provider-adapters/model-policy.ts`
- Create: `apps/customer-panel/lib/toshi-provider-adapters/openai.ts`
- Create: `apps/customer-panel/lib/toshi-provider-adapters/gemini.ts`
- Create: `apps/customer-panel/lib/toshi-provider-adapters/anthropic.ts`
- Create: `apps/customer-panel/lib/toshi-provider-adapters/registry.ts`
- Create: `apps/customer-panel/lib/toshi-provider-adapters/adapters.test.ts`

**Interfaces:**
- Produces `ToshiProviderVerificationAdapter.verify(apiKey, signal)`.
- Produces `ToshiProviderAdapterRegistry.get(provider)`.
- Produces normalized `ToshiProviderAdapterError` codes matching shared contracts.

- [ ] **Step 1: Write failing injected-fetch contract tests**

```ts
test("OpenAI verifies only against the official models endpoint", async () => {
  const fetcher = captureJson({ data: [{ id: "gpt-5" }, { id: "whisper-1" }] });
  const result = await createOpenAIProviderAdapter(fetcher).verify(bytes("sk-test"), AbortSignal.timeout(1000));
  assert.equal(fetcher.calls[0].url, "https://api.openai.com/v1/models");
  assert.equal(new Headers(fetcher.calls[0].init.headers).get("authorization"), "Bearer sk-test");
  assert.deepEqual(result.models.map(({ id }) => id), ["gpt-5"]);
});

test("Gemini and Anthropic use their own authentication headers", async () => {
  const geminiFetch = captureJson({ models: [{ name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] }] });
  await createGeminiProviderAdapter(geminiFetch).verify(bytes("gemini-test"), AbortSignal.timeout(1000));
  assert.equal(geminiFetch.calls[0].url, "https://generativelanguage.googleapis.com/v1beta/models");
  assert.equal(new Headers(geminiFetch.calls[0].init.headers).get("x-goog-api-key"), "gemini-test");

  const anthropicFetch = captureJson({ data: [{ id: "claude-sonnet-4-20250514", display_name: "Claude Sonnet 4" }], has_more: false, first_id: null, last_id: null });
  await createAnthropicProviderAdapter(anthropicFetch).verify(bytes("claude-test"), AbortSignal.timeout(1000));
  const headers = new Headers(anthropicFetch.calls[0].init.headers);
  assert.equal(anthropicFetch.calls[0].url, "https://api.anthropic.com/v1/models");
  assert.equal(headers.get("x-api-key"), "claude-test");
  assert.equal(headers.get("anthropic-version"), "2023-06-01");
});
```

Define `bytes` as `new TextEncoder().encode(value)`. Define `captureJson` as a frozen
injected fetch spy returning `Response.json(payload)` and recording exact URL/init pairs;
return a new response on every call so response bodies are never reused.

Cover 401/403 → `credential_invalid`, 429 → `rate_limited` or `quota_exceeded` by safe response code, timeout → `provider_timeout`, 5xx/non-JSON/oversize → `provider_unavailable`, redirects disabled, getter/prototype-hostile JSON rejected, zero allowed models → `model_unavailable`.

- [ ] **Step 2: Run tests and verify adapters are missing**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/toshi-provider-adapters/adapters.test.ts`

Expected: FAIL because adapter modules do not exist.

- [ ] **Step 3: Implement adapter boundary and model policy**

```ts
export interface ToshiProviderVerificationAdapter {
  readonly provider: ToshiProvider;
  verify(apiKey: Uint8Array, signal: AbortSignal): Promise<Readonly<{
    models: readonly ToshiProviderModel[];
    selectedModel: string;
  }>>;
}
```

Decode the key into a temporary Buffer only while constructing headers; reject control characters and keys outside 1–16,384 bytes; clear temporary buffers in `finally`. Use `redirect: "error"`, `cache: "no-store"`, `accept: application/json` and a 10-second composed abort signal. The model policy accepts bounded text/tool-capable families and rejects image, audio, realtime, embedding, moderation and transcription models. Sort IDs deterministically and select: preferred general model, then preferred fast model, then lexical first.

- [ ] **Step 4: Run adapter tests**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/toshi-provider-adapters/adapters.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-panel/lib/toshi-provider-adapters
git commit -m "feat: verify official Toshi AI providers"
```

---

### Task 5: Server Runtime Composition

**Files:**
- Create: `apps/customer-panel/lib/server-toshi-providers/runtime.ts`
- Create: `apps/customer-panel/lib/server-toshi-providers/runtime.test.ts`
- Modify: `apps/customer-panel/lib/server-panel-access/postgres-runtime.ts`

**Interfaces:**
- Produces `ServerToshiProviderRuntime` with `access`, `repository`, `keyring`, `adapters`, `readiness`.
- Produces `registerServerToshiProviderRuntime` and `resolveServerToshiProviderRuntime`.
- Consumes the already parsed merchant provider credential keyring from `postgres-runtime.ts`; no second environment key parser.

- [ ] **Step 1: Write failing runtime registration tests**

```ts
test("runtime registers one immutable provider authority beside panel access", () => {
  const runtime = registerServerToshiProviderRuntime(access, repository, keyring, adapters);
  assert.equal(runtime.readiness.mode, "approved_staging");
  assert.equal(Object.isFrozen(runtime), true);
  assert.throws(() => registerServerToshiProviderRuntime(access, repository, keyring, adapters));
});
```

Assert missing repository methods, mutable keyring, incomplete three-provider registry and disabled access are rejected.

- [ ] **Step 2: Run test and verify runtime is missing**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/server-toshi-providers/runtime.test.ts`

Expected: FAIL because runtime module does not exist.

- [ ] **Step 3: Implement and register the production runtime**

```ts
export type ServerToshiProviderRuntime = Readonly<{
  readiness: Readonly<{ mode: "approved_staging" }>;
  access: ServerPanelAccessRuntime;
  repository: ToshiProviderRepository;
  keyring: MerchantProviderCredentialKeyring;
  adapters: ToshiProviderAdapterRegistry;
}>;
```

In `postgres-runtime.ts`, construct `PostgresToshiProviderRepository` from the existing SaaS pool/timeouts, construct the three-adapter registry, and register it with the already parsed `providerCredentialKeyring`. Registration failure must make the Toshi provider runtime unavailable without weakening panel authentication.

- [ ] **Step 4: Run runtime tests and typecheck**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/server-toshi-providers/runtime.test.ts && npm run typecheck --workspace @celebix/customer-panel`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-panel/lib/server-toshi-providers apps/customer-panel/lib/server-panel-access/postgres-runtime.ts
git commit -m "feat: compose Toshi provider runtime"
```

---

### Task 6: Same-Origin Provider Settings HTTP API

**Files:**
- Create: `apps/customer-panel/lib/toshi-provider-http/handler.ts`
- Create: `apps/customer-panel/lib/toshi-provider-http/handler.test.ts`
- Create: `apps/customer-panel/lib/toshi-provider-http/default.ts`
- Create: `apps/customer-panel/app/api/settings/artificial-intelligence/providers/route.ts`
- Create: `apps/customer-panel/app/api/settings/artificial-intelligence/providers/[provider]/connect/route.ts`
- Create: `apps/customer-panel/app/api/settings/artificial-intelligence/providers/[provider]/model/route.ts`
- Create: `apps/customer-panel/app/api/settings/artificial-intelligence/providers/[provider]/default/route.ts`
- Create: `apps/customer-panel/app/api/settings/artificial-intelligence/providers/[provider]/route.ts`

**Interfaces:**
- Produces GET list, POST connect, PATCH model, POST default and DELETE revoke handlers.
- Consumes `ServerToshiProviderRuntime`, provider adapters and repository.

- [ ] **Step 1: Write failing HTTP security and behavior tests**

```ts
test("connect verifies, seals, zeroes and persists before projecting public state", async () => {
  const response = await handlers.connect(request("/openai/connect", {
    method: "POST", origin: PANEL_ORIGIN, body: { apiKey: "sk-fixture", expectedVersion: 0 },
  }), { params: Promise.resolve({ provider: "openai" }) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).maskedKey, "••••ture");
  assert.equal(JSON.stringify(await response.clone().json()).includes("sk-fixture"), false);
  assert.equal(repository.connectCalls[0].selectedModel, "gpt-5");
});
```

Add a matrix for unauthenticated, wrong tenant, no `configuration.manage`, wrong origin, private headers, query/hash, content type, oversized/chunked body, missing/duplicate idempotency key, invalid route provider, invalid model, version conflict, adapter errors and repository errors. Assert failed verification never calls repository connect; failed rotation leaves prior state untouched.

- [ ] **Step 2: Run handler tests and verify modules are missing**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/toshi-provider-http/handler.test.ts`

Expected: FAIL because handler does not exist.

- [ ] **Step 3: Implement bounded authorization and mutation handlers**

```ts
export function createToshiProviderHttpHandlers(deps: Dependencies) {
  return Object.freeze({
    list,
    connect,
    selectModel,
    setDefault,
    revoke,
  });
}
```

`connect` reads a maximum 20 KiB exact JSON body, copies the API key to `Uint8Array`,
calls the exact provider adapter, reads the current non-secret connection identity,
uses its config ID and incremented credential version (or a new UUID/version 1), seals
with `sealMerchantProviderCredential({ capability: "ai_assistant" })`, hashes/masks the
key and calls `repository.connect`. Clear all mutable body/key/header byte buffers in
`finally`; immutable JavaScript strings are never retained, logged or copied into an
error. Never include raw provider response or secret in an error. Mutations call
`isMerchantActionAllowed(role, "configuration.manage")`; list requires authenticated
active tenant only.

- [ ] **Step 4: Mount thin App Router files**

```ts
export { handleToshiProviderList as GET } from "@/lib/toshi-provider-http/default";
```

Each dynamic route passes Next's async params through the tested handler without parsing provider locally.

- [ ] **Step 5: Run HTTP tests and typecheck**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/toshi-provider-http/handler.test.ts && npm run typecheck --workspace @celebix/customer-panel`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-panel/lib/toshi-provider-http apps/customer-panel/app/api/settings/artificial-intelligence/providers
git commit -m "feat: expose secure Toshi provider settings API"
```

---

### Task 7: AI Provider Settings UI

**Files:**
- Create: `apps/customer-panel/lib/toshi-provider-ui/client.ts`
- Create: `apps/customer-panel/lib/toshi-provider-ui/client.test.ts`
- Create: `apps/customer-panel/components/toshi-settings/ArtificialIntelligenceSettings.tsx`
- Create: `apps/customer-panel/components/toshi-settings/artificial-intelligence-settings.module.css`
- Create: `apps/customer-panel/components/toshi-settings/ArtificialIntelligenceSettings.test.ts`
- Modify: `apps/customer-panel/app/settings/artificial-intelligence/page.tsx`

**Interfaces:**
- Produces `toshiProviderApi.list/connect/selectModel/setDefault/revoke`.
- Produces `<ArtificialIntelligenceSettings canManage />`.
- Consumes only public `ToshiProviderConnection` DTOs.

- [ ] **Step 1: Write failing client and UI source contract tests**

```ts
test("provider client uses same-origin credentials and never retains the submitted key", async () => {
  const api = createToshiProviderApi(fetcher, () => OPERATION_ID);
  await api.connect("openai", { apiKey: "sk-private", expectedVersion: 0 });
  assert.equal(calls[0].path, "/api/settings/artificial-intelligence/providers/openai/connect");
  assert.equal(calls[0].init.credentials, "same-origin");
  assert.equal(new Headers(calls[0].init.headers).get("idempotency-key"), OPERATION_ID);
});

test("AI settings page uses the dedicated provider surface and removes the old warning copy", async () => {
  const source = await readFile(PAGE, "utf8");
  assert.match(source, /ArtificialIntelligenceSettings/);
  assert.doesNotMatch(source, /Sağlayıcı etkinleştirilmeden içerik üretilmez/);
});
```

Test exact DTO rejection, non-JSON response, finite error projection, duplicate submission guard, key input clearing after success, first default label, model change, set-default and revoke confirmation.

- [ ] **Step 2: Run tests and verify UI modules are missing**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/toshi-provider-ui/client.test.ts apps/customer-panel/components/toshi-settings/ArtificialIntelligenceSettings.test.ts`

Expected: FAIL because client/component do not exist.

- [ ] **Step 3: Implement strict browser client**

```ts
export function createToshiProviderApi(fetcher: typeof fetch = fetch, uuid = crypto.randomUUID.bind(crypto)) {
  return Object.freeze({
    list: () => requestList(),
    connect: (provider: ToshiProvider, input: { apiKey: string; expectedVersion: number }) => mutate("POST", `${base}/${provider}/connect`, input),
    selectModel: (provider: ToshiProvider, input: { model: string; expectedVersion: number }) => mutate("PATCH", `${base}/${provider}/model`, input),
    setDefault: (provider: ToshiProvider, expectedVersion: number) => mutate("POST", `${base}/${provider}/default`, { expectedVersion }),
    revoke: (provider: ToshiProvider, expectedVersion: number) => mutate("DELETE", `${base}/${provider}`, { expectedVersion }),
  });
}
```

Use exact provider validation, `credentials: "same-origin"`, `cache: "no-store"`, JSON content type and per-mutation idempotency UUID. Parse every success through shared exact parsers and map only finite error codes to Turkish UI messages.

- [ ] **Step 4: Implement the flat provider settings component**

Render OpenAI, Gemini and Claude as three compact rows/cards with logo mark, status, masked key, verified time, password input, connect/rotate button, model select, default radio/action and revoke. Do not render repeated page title, long description, nested generic panel card or raw provider code. Keep one active submission, abort on unmount, reload authoritative state after mutation, clear password field on success, and expose status through `aria-live="polite"`.

- [ ] **Step 5: Compose the settings page**

```tsx
export default async function ArtificialIntelligenceSettingsPage() {
  const { tenantContext } = await requireServerPanelAccess();
  const canManage = isMerchantActionAllowed(tenantContext.membership.role, "configuration.manage");
  return <ArtificialIntelligenceSettings canManage={canManage} />;
}
```

The generic `ai_setting` preference editor remains below the provider surface in a
compact `Tercihler` section for language, tone and enabled-feature preferences. It is
never used for credentials and receives no provider key field.

- [ ] **Step 6: Run UI tests and typecheck**

Run: `node --experimental-transform-types --test apps/customer-panel/lib/toshi-provider-ui/client.test.ts apps/customer-panel/components/toshi-settings/ArtificialIntelligenceSettings.test.ts && npm run typecheck --workspace @celebix/customer-panel`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/customer-panel/lib/toshi-provider-ui apps/customer-panel/components/toshi-settings apps/customer-panel/app/settings/artificial-intelligence/page.tsx
git commit -m "feat: add Toshi AI provider settings"
```

---

### Task 8: Full Connection Verification

**Files:**
- Modify only if failures reveal a defect in files created by Tasks 1–7.

**Interfaces:**
- Verifies all connection-path deliverables together.

- [ ] **Step 1: Run focused suites**

```bash
node --experimental-transform-types --test \
  packages/saas-contracts/src/toshi/providers.test.ts \
  packages/saas-data/src/toshi-providers/repository.test.ts \
  apps/owner/scripts/sql/saas/toshi-provider-connections-migration.test.ts \
  apps/customer-panel/lib/toshi-provider-adapters/adapters.test.ts \
  apps/customer-panel/lib/server-toshi-providers/runtime.test.ts \
  apps/customer-panel/lib/toshi-provider-http/handler.test.ts \
  apps/customer-panel/lib/toshi-provider-ui/client.test.ts \
  apps/customer-panel/components/toshi-settings/ArtificialIntelligenceSettings.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run package typechecks and customer-panel build**

```bash
npm run typecheck --workspace @celebix/saas-contracts
npm run typecheck --workspace @celebix/saas-data
npm run typecheck --workspace @celebix/customer-panel
npm run build --workspace @celebix/customer-panel
```

Expected: all commands exit 0.

- [ ] **Step 3: Run secret and route scans**

```bash
rg -n "apiKey|sealed_credentials|credential_digest" apps/customer-panel/app/settings apps/customer-panel/components/toshi-settings apps/customer-panel/lib/toshi-provider-ui
rg -n "https?://" apps/customer-panel/lib/toshi-provider-adapters
```

Expected: UI contains only password field naming and request construction; no secret value or server envelope projection. Adapter URLs contain only the three allowlisted official hosts.

- [ ] **Step 4: Run staging browser acceptance after migration/deploy**

Open `/settings/artificial-intelligence`, verify all three providers are visible, connect one valid provider-owned test key, confirm it becomes active/default and the raw key is absent from DOM/network responses. Connect a second provider and confirm both remain active while default is unchanged. Change default, rotate with an invalid key and confirm the old connection survives, then revoke a disposable test connection.

---

## Follow-on Plan Boundary

After this plan is green, write `2026-08-02-toshi-provider-message-orchestration.md` for:

- durable conversations/messages;
- OpenAI Responses, Gemini generateContent and Anthropic Messages generation adapters;
- provider/model pinning per conversation;
- minimum-data salt-okunur store tools;
- Toshi UI provider state and safe local fallback;
- no automatic cross-provider fallback;
- a separate later plan for preview/confirm/write-action authority.
