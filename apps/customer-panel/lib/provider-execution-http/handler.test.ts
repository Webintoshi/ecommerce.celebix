import assert from "node:assert/strict";
import test from "node:test";

import type { TenantContext } from "@celebix/saas-contracts";
import type { MerchantProviderProfileRepository } from "@celebix/saas-data";

import { createCustomerPanelProviderRegistry } from "../server-provider-execution/registry.ts";
import type { ServerProviderExecutionRuntime } from "../server-provider-execution/runtime.ts";
import { createProviderExecutionHttpHandlers } from "./handler.ts";

const PANEL = "https://panel.staging.example";
const PROFILE = "40000000-0000-4000-8000-000000000005";
const OPERATION = "70000000-0000-4000-8000-000000000001";
const REQUEST = "71000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-07-25T12:00:00.000Z");
const CREDENTIAL = "v1.panel.current.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

function tenant(role: "store_owner" | "analyst" = "store_owner"): TenantContext {
  return {
    schemaVersion: 1,
    requestId: "private",
    principal: { id: "10000000-0000-4000-8000-000000000001", issuer: "https://id.test/oidc", subject: "private" },
    store: { id: "20000000-0000-4000-8000-000000000001", slug: "store", status: "active" },
    membership: { id: "30000000-0000-4000-8000-000000000001", role, status: "active" },
    entitlements: { schemaVersion: 1, planId: "50000000-0000-4000-8000-000000000001", planCode: "growth", version: 2, status: "active", features: ["integrations"], limits: { products: 100, staff: 5, storageBytes: 100 }, validFrom: "2026-01-01T00:00:00.000Z" },
    locale: "tr-TR",
  } as TenantContext;
}

function profile(status: "pending_validation" | "active" = "pending_validation") {
  return {
    id: PROFILE,
    providerCode: "fixture_provider",
    capability: "marketplace_sync" as const,
    publicConfig: { account_reference: "merchant-42" },
    maskedAccountReference: "••••nt-42",
    status,
    credentialVersion: 1,
    version: 1,
    lastValidatedAt: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

function fixture(role: "store_owner" | "analyst" = "store_owner", empty = false) {
  const repositoryCalls: unknown[] = [];
  let parsedCredential: Uint8Array | null = null;
  const repository = {
    async list(input) { repositoryCalls.push({ kind: "list", input }); return Object.freeze([profile("active")]); },
    async save(input) { repositoryCalls.push({ kind: "save", input }); return profile(); },
    async disable(input) { repositoryCalls.push({ kind: "disable", input }); return { ...profile("active"), status: "disabled" as const, version: 2 }; },
    async revoke(input) { repositoryCalls.push({ kind: "revoke", input }); return { ...profile("active"), status: "revoked" as const, version: 2 }; },
  } satisfies MerchantProviderProfileRepository;
  const entry = Object.freeze({
    providerCode: "fixture_provider",
    capability: "marketplace_sync" as const,
    label: "Fixture Provider",
    publicFields: Object.freeze([Object.freeze({ key: "account_reference", label: "Hesap" })]),
    credentialFields: Object.freeze([Object.freeze({ key: "api_secret", label: "API Secret", secret: true as const })]),
    parsePublicConfig(value: unknown) {
      const selected = value as { account_reference?: unknown };
      if (!selected || Object.keys(selected).join(",") !== "account_reference" || typeof selected.account_reference !== "string") throw new TypeError();
      return Object.freeze({ account_reference: selected.account_reference });
    },
    parseCredential(value: unknown) {
      const selected = value as { api_secret?: unknown };
      if (!selected || Object.keys(selected).join(",") !== "api_secret" || typeof selected.api_secret !== "string") throw new TypeError();
      parsedCredential = new TextEncoder().encode(JSON.stringify({ api_secret: selected.api_secret }));
      return parsedCredential;
    },
    maskAccountReference() { return "••••nt-42"; },
  });
  const registry = createCustomerPanelProviderRegistry(empty ? Object.freeze([]) : Object.freeze([entry]));
  const runtime = Object.freeze({
    access: Object.freeze({
      readiness: Object.freeze({ mode: "approved_staging" as const }), panelOrigin: PANEL,
      async resolveCredential() { return Object.freeze({ kind: "authenticated" as const, tenantContext: tenant(role) }); },
      async rotateCredential() { throw new Error("unused"); }, async revokeCredential() { throw new Error("unused"); },
    }),
    profiles: repository,
    keyring: Object.freeze({ activeKeyId: "provider.current", keys: Object.freeze([Object.freeze({ keyId: "provider.current", key: new Uint8Array(32).fill(12) })]) }),
    registry,
  }) as unknown as ServerProviderExecutionRuntime;
  const handlers = createProviderExecutionHttpHandlers({
    async resolveRuntime() { return runtime; },
    now: () => new Date(NOW),
    requestId: () => REQUEST,
    profileId: () => PROFILE,
    providerCodes: () => empty ? Object.freeze([]) : Object.freeze(["fixture_provider"]),
  });
  return { handlers, repositoryCalls, parsedCredential: () => parsedCredential };
}

function request(method: string, path: string, body?: unknown, origin = PANEL) {
  const headers: Record<string, string> = { cookie: `__Host-celebix_panel=${CREDENTIAL}` };
  if (method === "POST") {
    headers.origin = origin;
    headers["content-type"] = "application/json";
    headers["idempotency-key"] = OPERATION;
  }
  return new Request(`${PANEL}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

test("profile save seals one registry-validated credential and never returns it", async () => {
  const probe = fixture();
  const response = await probe.handlers.profiles(request("POST", "/api/merchant-providers/profiles", {
    providerCode: "fixture_provider",
    capability: "marketplace_sync",
    publicConfig: { account_reference: "merchant-42" },
    credential: { api_secret: "never-return" },
    expectedVersion: 0,
  }));
  assert.equal(response.status, 200);
  assert.doesNotMatch(await response.clone().text(), /never-return|ciphertext|keyId|digest|storeId/);
  const savedProfile = await response.json() as { status: string; lastValidatedAt: string | null };
  assert.equal(savedProfile.status, "pending_validation");
  assert.equal(savedProfile.lastValidatedAt, null);
  assert.notEqual(savedProfile.status, "active");
  assert.equal(probe.repositoryCalls.length, 1);
  const saved = (probe.repositoryCalls[0] as { input: Record<string, unknown> }).input;
  assert.equal(typeof saved.credentialDigest, "string");
  assert.equal(typeof (saved.sealedCredentials as { ciphertext: unknown }).ciphertext, "string");
  assert.equal(JSON.stringify(saved).includes("never-return"), false);
  assert.equal(probe.parsedCredential()?.every((byte) => byte === 0), true);
});

test("profile rotation revalidates ownership and creates only the next credential version", async () => {
  const probe = fixture();
  const response = await probe.handlers.profiles(request("POST", "/api/merchant-providers/profiles", {
    providerCode: "fixture_provider",
    capability: "marketplace_sync",
    publicConfig: { account_reference: "merchant-42" },
    credential: { api_secret: "rotated-never-return" },
    expectedVersion: 1,
    profileId: PROFILE,
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(probe.repositoryCalls.map((entry) => (entry as { kind: string }).kind), ["list", "save"]);
  const saved = (probe.repositoryCalls[1] as { input: Record<string, unknown> }).input;
  assert.equal(saved.profileId, PROFILE);
  assert.equal(saved.expectedVersion, 1);
  assert.equal(JSON.stringify(saved).includes("rotated-never-return"), false);
  assert.equal(probe.parsedCredential()?.every((byte) => byte === 0), true);
  assert.doesNotMatch(await response.text(), /rotated-never-return|ciphertext|credentialDigest/);
});

test("profile mutations fail before sealing on authority or provider errors", async () => {
  const cases = [
    { probe: fixture(), request: request("POST", "/api/merchant-providers/profiles", { providerCode: "fixture_provider", capability: "marketplace_sync", publicConfig: { account_reference: "merchant-42" }, credential: { api_secret: "secret" }, expectedVersion: 0 }, "https://wrong.example") },
    { probe: fixture("analyst"), request: request("POST", "/api/merchant-providers/profiles", { providerCode: "fixture_provider", capability: "marketplace_sync", publicConfig: { account_reference: "merchant-42" }, credential: { api_secret: "secret" }, expectedVersion: 0 }) },
    { probe: fixture(), request: request("POST", "/api/merchant-providers/profiles", { providerCode: "unknown", capability: "marketplace_sync", publicConfig: {}, credential: {}, expectedVersion: 0 }) },
    { probe: fixture("store_owner", true), request: request("POST", "/api/merchant-providers/profiles", { providerCode: "fixture_provider", capability: "marketplace_sync", publicConfig: {}, credential: {}, expectedVersion: 0 }) },
  ];
  for (const selected of cases) {
    const response = await selected.probe.handlers.profiles(selected.request);
    assert.ok([400, 403, 503].includes(response.status));
    assert.equal(selected.probe.repositoryCalls.length, 0);
  }
});

test("definitions and profiles GET expose only safe bounded projections", async () => {
  const probe = fixture();
  const definitions = await probe.handlers.definitions(request("GET", "/api/merchant-providers/definitions?capability=marketplace_sync"));
  assert.equal(definitions.status, 200);
  assert.deepEqual((await definitions.json() as { items: unknown[] }).items[0], {
    providerCode: "fixture_provider", capability: "marketplace_sync", label: "Fixture Provider",
    publicFields: [{ key: "account_reference", label: "Hesap" }],
    credentialFields: [{ key: "api_secret", label: "API Secret", secret: true }],
  });
  const profiles = await probe.handlers.profiles(request("GET", "/api/merchant-providers/profiles?capability=marketplace_sync"));
  assert.equal(profiles.status, 200);
  assert.doesNotMatch(await profiles.text(), /ciphertext|credentialDigest|storeId/);
});

test("empty registry definitions remain truthful while profile mutation is unavailable", async () => {
  const probe = fixture("store_owner", true);
  const definitions = await probe.handlers.definitions(request("GET", "/api/merchant-providers/definitions?capability=marketplace_sync"));
  assert.deepEqual(await definitions.json(), { items: [] });
  const paymentDefinitions = await probe.handlers.definitions(request("GET", "/api/merchant-providers/definitions?capability=payment_processing"));
  assert.deepEqual(await paymentDefinitions.json(), { items: [] });
  const response = await probe.handlers.profiles(request("POST", "/api/merchant-providers/profiles", {}));
  assert.equal(response.status, 503);
  assert.equal(probe.repositoryCalls.length, 0);
});
