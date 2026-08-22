import assert from "node:assert/strict";
import test from "node:test";

import type { TenantContext, ToshiProviderConnection } from "@celebix/saas-contracts";
import type { ConnectToshiProviderInput, ToshiProviderRepository } from "@celebix/saas-data";

import { ToshiProviderAdapterError } from "../toshi-provider-adapters/types.ts";
import type { ServerToshiProviderRuntime } from "../server-toshi-providers/runtime.ts";
import { createToshiProviderHttpHandlers } from "./handler.ts";

const ORIGIN = "https://panel.saas-staging.celebix.site";
const TENANT_ADMIN_ORIGIN = "https://guzide.admin.saas-staging.celebix.site";
const OPERATION = "72000000-0000-4000-8000-000000000001";
const REQUEST = "72000000-0000-4000-8000-000000000002";
const CONFIG = "72000000-0000-4000-8000-000000000003";
const NOW = new Date("2026-08-02T12:00:00.000Z");
const COOKIE = `v1.panel.current.${Buffer.alloc(32, 1).toString("base64url")}`;

const MODELS = Object.freeze([Object.freeze({ id: "gpt-5", label: "gpt-5" })]);
const CONNECTION: ToshiProviderConnection = Object.freeze({
  provider: "openai",
  label: "OpenAI",
  status: "active",
  isDefault: true,
  maskedKey: "••••ture",
  selectedModel: "gpt-5",
  availableModels: MODELS,
  version: 1,
  verifiedAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
});

function tenant(role: "store_owner" | "analyst" = "store_owner"): TenantContext {
  return {
    schemaVersion: 1,
    requestId: REQUEST,
    principal: { id: "72000000-0000-4000-8000-000000000011", issuer: "https://id.test/oidc", subject: "merchant" },
    store: { id: "72000000-0000-4000-8000-000000000012", slug: "guzide", status: "active" },
    membership: { id: "72000000-0000-4000-8000-000000000013", role, status: "active" },
    entitlements: { schemaVersion: 1, planId: "72000000-0000-4000-8000-000000000014", planCode: "starter", version: 1, status: "active", features: ["catalog"], limits: { products: 100, staff: 5, storageBytes: 1_000_000 }, validFrom: "2026-01-01T00:00:00.000Z" },
    locale: "tr-TR",
  } as TenantContext;
}

function request(path: string, method = "GET", value?: unknown, origin = ORIGIN, headers: HeadersInit = {}) {
  const selected = new Headers(headers);
  selected.set("cookie", `__Host-celebix_panel=${COOKIE}`);
  if (method !== "GET") {
    selected.set("origin", origin);
    selected.set("content-type", "application/json");
    selected.set("idempotency-key", OPERATION);
  }
  const body = value === undefined ? undefined : JSON.stringify(value);
  if (body !== undefined) selected.set("content-length", String(Buffer.byteLength(body)));
  return new Request(`http://customer-panel:3400${path}`, { method, headers: selected, body });
}

function fixture(options: Readonly<{
  role?: "store_owner" | "analyst";
  verify?: (key: Uint8Array) => Promise<Readonly<{ models: typeof MODELS; selectedModel: "gpt-5" }>>;
  identity?: Readonly<{ configId: string; credentialVersion: number; version: number }> | null;
}> = {}) {
  const calls: { connect: ConnectToshiProviderInput[]; select: unknown[]; defaults: unknown[]; revoke: unknown[]; verified: string[] } = { connect: [], select: [], defaults: [], revoke: [], verified: [] };
  const reject = async () => { throw new Error("unexpected"); };
  const repository: ToshiProviderRepository = {
    async list() { return [CONNECTION]; },
    async getConnectionIdentity() { return options.identity ?? null; },
    async connect(input) { calls.connect.push(input); return { ...CONNECTION, version: input.expectedVersion + 1 }; },
    async selectModel(input) { calls.select.push(input); return { ...CONNECTION, selectedModel: input.selectedModel, version: input.expectedVersion + 1 }; },
    async setDefault(input) { calls.defaults.push(input); return { ...CONNECTION, isDefault: true, version: input.expectedVersion + 1 }; },
    async revoke(input) { calls.revoke.push(input); return { ...CONNECTION, status: "revoked", isDefault: false, version: input.expectedVersion + 1 }; },
    getAuthority: reject,
  };
  const runtime = {
    readiness: { mode: "approved_staging" },
    repository,
    keyring: Object.freeze({ activeKeyId: "staging-key-01", keys: Object.freeze([Object.freeze({ keyId: "staging-key-01", key: new Uint8Array(32).fill(7) })]) }),
    adapters: Object.freeze({
      get(provider: string) {
        if (provider !== "openai") return Object.freeze({ provider, verify: reject });
        return Object.freeze({ provider: "openai", async verify(key: Uint8Array) {
          calls.verified.push(new TextDecoder().decode(key));
          return options.verify ? options.verify(key) : Object.freeze({ models: MODELS, selectedModel: "gpt-5" as const });
        } });
      },
    }),
    access: {
      readiness: { mode: "approved_staging" },
      panelOrigin: ORIGIN,
      async resolveCredential() { return { kind: "authenticated", session: {}, tenantContext: tenant(options.role) }; },
      async rotateCredential() { return { kind: "unavailable" }; },
      async revokeCredential() { return { kind: "unavailable" }; },
    },
  } as unknown as ServerToshiProviderRuntime;
  return {
    calls,
    handlers: createToshiProviderHttpHandlers({ async resolveRuntime() { return runtime; }, now: () => new Date(NOW), requestId: () => REQUEST, uuid: () => CONFIG }),
  };
}

test("list returns only the authenticated store public provider state", async () => {
  const response = await fixture().handlers.list(request("/api/settings/artificial-intelligence/providers"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { items: [CONNECTION] });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("connect verifies seals zeroes and persists before projecting public state", async () => {
  const selected = fixture();
  const response = await selected.handlers.connect(
    request("/api/settings/artificial-intelligence/providers/openai/connect", "POST", { apiKey: "sk-fixture", expectedVersion: 0 }),
    { params: Promise.resolve({ provider: "openai" }) },
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.maskedKey, "••••ture");
  assert.equal(JSON.stringify(payload).includes("sk-fixture"), false);
  assert.deepEqual(selected.calls.verified, ["sk-fixture"]);
  assert.equal(selected.calls.connect.length, 1);
  const persisted = selected.calls.connect[0]!;
  assert.equal(persisted.configId, CONFIG);
  assert.equal(persisted.credentialVersion, 1);
  assert.equal(persisted.selectedModel, "gpt-5");
  assert.match(persisted.credentialDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(persisted.sealedCredentials).includes("sk-fixture"), false);
});

test("rotation preserves identity increments credential version and never changes state on failed verification", async () => {
  const existing = fixture({ identity: { configId: CONFIG, credentialVersion: 4, version: 7 } });
  const response = await existing.handlers.connect(
    request("/api/settings/artificial-intelligence/providers/openai/connect", "POST", { apiKey: "sk-rotated", expectedVersion: 7 }),
    { params: Promise.resolve({ provider: "openai" }) },
  );
  assert.equal(response.status, 200);
  assert.equal(existing.calls.connect[0]?.credentialVersion, 5);
  assert.equal(existing.calls.connect[0]?.configId, CONFIG);

  const failed = fixture({ async verify() { throw new ToshiProviderAdapterError("credential_invalid"); } });
  const rejected = await failed.handlers.connect(
    request("/api/settings/artificial-intelligence/providers/openai/connect", "POST", { apiKey: "sk-wrong", expectedVersion: 0 }),
    { params: Promise.resolve({ provider: "openai" }) },
  );
  assert.equal(rejected.status, 401);
  assert.deepEqual(await rejected.json(), { code: "credential_invalid" });
  assert.equal(failed.calls.connect.length, 0);
});

test("model default and revoke mutations use exact provider version authority", async () => {
  const selected = fixture();
  const model = await selected.handlers.selectModel(request("/api/settings/artificial-intelligence/providers/openai/model", "PATCH", { selectedModel: "gpt-5", expectedVersion: 1 }), { params: Promise.resolve({ provider: "openai" }) });
  const makeDefault = await selected.handlers.setDefault(request("/api/settings/artificial-intelligence/providers/openai/default", "POST", { expectedVersion: 1 }), { params: Promise.resolve({ provider: "openai" }) });
  const revoke = await selected.handlers.revoke(request("/api/settings/artificial-intelligence/providers/openai", "DELETE", { expectedVersion: 1 }), { params: Promise.resolve({ provider: "openai" }) });
  assert.deepEqual([model.status, makeDefault.status, revoke.status], [200, 200, 200]);
  assert.equal(selected.calls.select.length, 1);
  assert.equal(selected.calls.defaults.length, 1);
  assert.equal(selected.calls.revoke.length, 1);
});

test("tenant admin Toshi mutations survive internal proxy delivery and stay store-bound", async () => {
  const selected = fixture();
  const response = await selected.handlers.selectModel(
    request(
      "/api/settings/artificial-intelligence/providers/openai/model",
      "PATCH",
      { selectedModel: "gpt-5", expectedVersion: 1 },
      TENANT_ADMIN_ORIGIN,
      { host: "customer-panel:3400" },
    ),
    { params: Promise.resolve({ provider: "openai" }) },
  );
  assert.equal(response.status, 200);
  assert.equal(selected.calls.select.length, 1);

  const other = fixture();
  const denied = await other.handlers.selectModel(
    request(
      "/api/settings/artificial-intelligence/providers/openai/model",
      "PATCH",
      { selectedModel: "gpt-5", expectedVersion: 1 },
      "https://other-store.admin.saas-staging.celebix.site",
      { host: "guzide.admin.saas-staging.celebix.site" },
    ),
    { params: Promise.resolve({ provider: "openai" }) },
  );
  assert.equal(denied.status, 403);
  assert.deepEqual(await denied.json(), { code: "origin_denied" });
  assert.equal(other.calls.select.length, 0);
});

test("wrong origin analyst mutation private headers and route drift fail before provider work", async () => {
  for (const response of [
    await fixture().handlers.connect(request("/api/settings/artificial-intelligence/providers/openai/connect", "POST", { apiKey: "sk-test", expectedVersion: 0 }, "https://attacker.test"), { params: Promise.resolve({ provider: "openai" }) }),
    await fixture({ role: "analyst" }).handlers.connect(request("/api/settings/artificial-intelligence/providers/openai/connect", "POST", { apiKey: "sk-test", expectedVersion: 0 }), { params: Promise.resolve({ provider: "openai" }) }),
    await fixture().handlers.list(request("/api/settings/artificial-intelligence/providers?store=other", "GET")),
    await fixture().handlers.list(request("/api/settings/artificial-intelligence/providers", "GET", undefined, ORIGIN, { authorization: "Bearer private" })),
  ]) assert.notEqual(response.status, 200);
});

test("connect rejects missing session invalid provider content type body size and idempotency drift", async () => {
  const selected = fixture();
  const validBody = JSON.stringify({ apiKey: "sk-test", expectedVersion: 0 });
  const cases: Request[] = [];

  const missingCookie = request("/api/settings/artificial-intelligence/providers/openai/connect", "POST", { apiKey: "sk-test", expectedVersion: 0 });
  missingCookie.headers.delete("cookie");
  cases.push(missingCookie);

  const missingOperation = request("/api/settings/artificial-intelligence/providers/openai/connect", "POST", { apiKey: "sk-test", expectedVersion: 0 });
  missingOperation.headers.delete("idempotency-key");
  cases.push(missingOperation);

  const wrongType = request("/api/settings/artificial-intelligence/providers/openai/connect", "POST", { apiKey: "sk-test", expectedVersion: 0 });
  wrongType.headers.set("content-type", "text/plain");
  cases.push(wrongType);

  cases.push(new Request("http://customer-panel:3400/api/settings/artificial-intelligence/providers/openai/connect", {
    method: "POST",
    headers: {
      cookie: `__Host-celebix_panel=${COOKIE}`,
      origin: ORIGIN,
      "content-type": "application/json",
      "content-length": "20481",
      "idempotency-key": OPERATION,
    },
    body: validBody,
  }));

  for (const candidate of cases) {
    const response = await selected.handlers.connect(candidate, { params: Promise.resolve({ provider: "openai" }) });
    assert.notEqual(response.status, 200);
  }
  const invalidProvider = await selected.handlers.connect(
    request("/api/settings/artificial-intelligence/providers/other/connect", "POST", { apiKey: "sk-test", expectedVersion: 0 }),
    { params: Promise.resolve({ provider: "other" }) },
  );
  assert.equal(invalidProvider.status, 400);
  assert.equal(selected.calls.connect.length, 0);
  assert.equal(selected.calls.verified.length, 0);
});
