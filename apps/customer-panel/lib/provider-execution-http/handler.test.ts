import assert from "node:assert/strict";
import test from "node:test";

import type { MerchantProviderProfile, TenantContext } from "@celebix/saas-contracts";
import type { PaymentProviderExecutionAuthority } from "@celebix/saas-contracts";
import type {
  MerchantProviderProfileRepository,
  MerchantProviderVerificationProfileRepository,
} from "@celebix/saas-data";
import { IYZICO_IFRAME_PACKET, PAYTR_IFRAME_PACKET } from "@celebix/payment-adapters";

import { createCustomerPanelProviderRegistry } from "../server-provider-execution/registry.ts";
import type { ServerProviderExecutionRuntime } from "../server-provider-execution/runtime.ts";
import { createProviderExecutionHttpHandlers } from "./handler.ts";
import { PAYMENT_PROVIDER_CATALOG } from "../payment-providers/catalog.ts";

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

function profile(
  status: "pending_validation" | "active" = "pending_validation",
  payment = false,
): MerchantProviderProfile {
  return {
    id: PROFILE,
    providerCode: payment ? "paytr_iframe" : "fixture_provider",
    capability: payment ? "payment_processing" as const : "marketplace_sync" as const,
    publicConfig: payment ? { environment: "test", merchantId: "123456" } : { account_reference: "merchant-42" },
    maskedAccountReference: "••••nt-42",
    status,
    credentialVersion: 1,
    version: 1,
    lastValidatedAt: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

function fixture(
  role: "store_owner" | "analyst" = "store_owner",
  empty = false,
  paymentAuthority: Readonly<PaymentProviderExecutionAuthority> | null | undefined = undefined,
) {
  const payment = paymentAuthority !== undefined;
  const repositoryCalls: unknown[] = [];
  let parsedCredential: Uint8Array | null = null;
  const repository = {
    async list(input) { repositoryCalls.push({ kind: "list", input }); return Object.freeze([profile("active", payment)]); },
    async save(input) { repositoryCalls.push({ kind: "save", input }); return profile("pending_validation", payment); },
    async saveVerification(input) { repositoryCalls.push({ kind: "saveVerification", input }); return profile("pending_validation", payment); },
    async disable(input) { repositoryCalls.push({ kind: "disable", input }); return { ...profile("active"), status: "disabled" as const, version: 2 }; },
    async revoke(input) { repositoryCalls.push({ kind: "revoke", input }); return { ...profile("active"), status: "revoked" as const, version: 2 }; },
  } satisfies MerchantProviderProfileRepository & MerchantProviderVerificationProfileRepository;
  const baseEntry = {
    providerCode: payment ? "paytr_iframe" : "fixture_provider",
    capability: payment ? "payment_processing" as const : "marketplace_sync" as const,
    label: payment ? "PayTR iFrame" : "Fixture Provider",
    publicFields: Object.freeze([Object.freeze({ key: payment ? "merchantId" : "account_reference", label: "Hesap" })]),
    credentialFields: Object.freeze([Object.freeze({ key: payment ? "merchantKey" : "api_secret", label: "API Secret", secret: true as const })]),
    parsePublicConfig(value: unknown) {
      const selected = value as Record<string, unknown>;
      if (payment) {
        if (!selected || Object.keys(selected).sort().join(",") !== "environment,merchantId" || selected.environment !== "test" || typeof selected.merchantId !== "string") throw new TypeError();
        return Object.freeze({ environment: "test" as const, merchantId: selected.merchantId });
      }
      if (!selected || Object.keys(selected).join(",") !== "account_reference" || typeof selected.account_reference !== "string") throw new TypeError();
      return Object.freeze({ account_reference: selected.account_reference });
    },
    parseCredential(value: unknown) {
      const selected = value as Record<string, unknown>;
      const key = payment ? "merchantKey" : "api_secret";
      if (!selected || Object.keys(selected).join(",") !== key || typeof selected[key] !== "string") throw new TypeError();
      parsedCredential = new TextEncoder().encode(JSON.stringify({ [key]: selected[key] }));
      return parsedCredential;
    },
    maskAccountReference() { return "••••nt-42"; },
  };
  const entry = Object.freeze(payment ? {
    ...baseEntry, adapterVersion: 1, environments: Object.freeze(["test"] as const),
    executionAuthority: paymentAuthority, profileSaveMode: "execution_authority" as const,
  } : baseEntry);
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
    adapters: payment ? (() => {
      const packet = Object.freeze({
        ...PAYTR_IFRAME_PACKET,
        readiness: Object.freeze({ ...PAYTR_IFRAME_PACKET.readiness, test: "sandbox_ready" as const }),
      });
      const adapter = Object.freeze({ packet });
      return Object.freeze({ size: 1, packet: () => packet, adapter: () => adapter });
    })() : Object.freeze({ size: 0, packet: () => null, adapter: () => null }),
  }) as unknown as ServerProviderExecutionRuntime;
  const handlers = createProviderExecutionHttpHandlers({
    async resolveRuntime() { return runtime; },
    now: () => new Date(NOW),
    requestId: () => REQUEST,
    profileId: () => PROFILE,
    providerCodes: () => empty ? Object.freeze([]) : Object.freeze([payment ? "paytr_iframe" : "fixture_provider"]),
    paymentCatalog: () => payment ? Object.freeze([Object.freeze({
      ...PAYMENT_PROVIDER_CATALOG.find((candidate) => candidate.providerCode === "paytr_iframe")!,
      readiness: paymentAuthority === null ? "verification" as const : "sandbox_ready" as const,
      executionAuthority: paymentAuthority,
    })]) : Object.freeze([]),
  });
  return { handlers, repositoryCalls, parsedCredential: () => parsedCredential };
}

function iyzicoProfile(environment: "test" | "live", status: "pending_validation" | "active" = "pending_validation"): MerchantProviderProfile {
  return {
    id: PROFILE,
    providerCode: "iyzico_iframe",
    capability: "payment_processing",
    publicConfig: { environment },
    maskedAccountReference: `iyzico ${environment} hesabı`,
    status,
    credentialVersion: 1,
    version: 1,
    lastValidatedAt: status === "active" ? NOW.toISOString() : null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

function iyzicoFixture(existingEnvironment: "test" | "live" = "test") {
  const repositoryCalls: unknown[] = [];
  let parseCredentialCalls = 0;
  let parsedCredential: Uint8Array | null = null;
  const repository = Object.freeze({
    async list(input: unknown) {
      repositoryCalls.push({ kind: "list", input });
      return Object.freeze([iyzicoProfile(existingEnvironment, "active")]);
    },
    async save(input: unknown) {
      repositoryCalls.push({ kind: "save", input });
      throw new Error("legacy_save_must_not_run");
    },
    async saveVerification(input: { publicConfig: { environment: "test" | "live" } }) {
      repositoryCalls.push({ kind: "saveVerification", input });
      return iyzicoProfile(input.publicConfig.environment);
    },
    async disable() { throw new Error("unused"); },
    async revoke() { throw new Error("unused"); },
  });
  const entry = Object.freeze({
    providerCode: "iyzico_iframe",
    capability: "payment_processing" as const,
    label: "iyzico · Checkout Form",
    publicFields: Object.freeze([]),
    credentialFields: Object.freeze([
      Object.freeze({ key: "apiKey", label: "API Key", secret: true as const }),
      Object.freeze({ key: "secretKey", label: "Secret Key", secret: true as const }),
    ]),
    adapterVersion: 1,
    environments: Object.freeze(["test", "live"] as const),
    executionAuthority: null,
    profileSaveMode: "verification" as const,
    parsePublicConfig(value: unknown) {
      const selected = value as Record<string, unknown>;
      if (!selected || Object.keys(selected).join(",") !== "environment" || (selected.environment !== "test" && selected.environment !== "live")) throw new TypeError();
      return Object.freeze({ environment: selected.environment });
    },
    parseCredential(value: unknown) {
      parseCredentialCalls += 1;
      const selected = value as Record<string, unknown>;
      if (!selected || Object.keys(selected).sort().join(",") !== "apiKey,secretKey" || typeof selected.apiKey !== "string" || typeof selected.secretKey !== "string") throw new TypeError();
      parsedCredential = new TextEncoder().encode(JSON.stringify(selected));
      return parsedCredential;
    },
    maskAccountReference(value: Readonly<Record<string, unknown>>) {
      return `iyzico ${value.environment} hesabı`;
    },
  });
  const registry = createCustomerPanelProviderRegistry(Object.freeze([entry]));
  const adapter = Object.freeze({ packet: IYZICO_IFRAME_PACKET });
  const runtime = Object.freeze({
    access: Object.freeze({
      readiness: Object.freeze({ mode: "approved_staging" as const }), panelOrigin: PANEL,
      async resolveCredential() { return Object.freeze({ kind: "authenticated" as const, tenantContext: tenant() }); },
      async rotateCredential() { throw new Error("unused"); }, async revokeCredential() { throw new Error("unused"); },
    }),
    profiles: repository,
    keyring: Object.freeze({ activeKeyId: "provider.current", keys: Object.freeze([Object.freeze({ keyId: "provider.current", key: new Uint8Array(32).fill(12) })]) }),
    registry,
    adapters: Object.freeze({ size: 1, packet: () => IYZICO_IFRAME_PACKET, adapter: () => adapter }),
  }) as unknown as ServerProviderExecutionRuntime;
  const handlers = createProviderExecutionHttpHandlers({
    async resolveRuntime() { return runtime; },
    now: () => new Date(NOW),
    requestId: () => REQUEST,
    profileId: () => PROFILE,
    providerCodes: () => Object.freeze(["iyzico_iframe"]),
    paymentCatalog: () => Object.freeze([
      PAYMENT_PROVIDER_CATALOG.find((candidate) => candidate.providerCode === "iyzico_iframe")!,
    ]),
  });
  return {
    handlers,
    repositoryCalls,
    parseCredentialCalls: () => parseCredentialCalls,
    parsedCredential: () => parsedCredential,
  };
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

test("payment profile persistence requires one exact catalog descriptor and adapter evidence tuple", async () => {
  const authority = Object.freeze({ environment: "test" as const, adapterVersion: 1, evidenceDigest: `sha256:${"a".repeat(64)}` });
  for (const selectedAuthority of [null, Object.freeze({ ...authority, evidenceDigest: `sha256:${"b".repeat(64)}` })]) {
    const probe = fixture("store_owner", false, selectedAuthority);
    const response = await probe.handlers.profiles(request("POST", "/api/merchant-providers/profiles", {
      providerCode: "paytr_iframe", capability: "payment_processing",
      publicConfig: { environment: "test", merchantId: "123456" },
      credential: { merchantKey: "never-parse" }, expectedVersion: 0,
    }));
    assert.equal(response.status, selectedAuthority === null ? 503 : 200);
    assert.equal(probe.repositoryCalls.length, selectedAuthority === null ? 0 : 1);
  }
  const probe = fixture("store_owner", false, authority);
  const response = await probe.handlers.profiles(request("POST", "/api/merchant-providers/profiles", {
    providerCode: "paytr_iframe", capability: "payment_processing",
    publicConfig: { environment: "test", merchantId: "123456" },
    credential: { merchantKey: "server-sealed" }, expectedVersion: 0,
  }));
  assert.equal(response.status, 200);
  assert.deepEqual((probe.repositoryCalls[0] as { input: { executionAuthority: unknown } }).input.executionAuthority, authority);
});

test("Iyzico saves verification identity without execution authority or sandbox evidence", async () => {
  for (const environment of ["test", "live"] as const) {
    const probe = iyzicoFixture(environment === "test" ? "live" : "test");
    const response = await probe.handlers.profiles(request("POST", "/api/merchant-providers/profiles", {
      providerCode: "iyzico_iframe", capability: "payment_processing",
      publicConfig: { environment },
      credential: { apiKey: "api-key-never-return", secretKey: "secret-key-never-return" },
      expectedVersion: 0,
    }));
    assert.equal(response.status, 200);
    assert.deepEqual(probe.repositoryCalls.map((entry) => (entry as { kind: string }).kind), ["saveVerification"]);
    const saved = (probe.repositoryCalls[0] as { input: Record<string, unknown> }).input;
    assert.deepEqual(saved.validationIdentity, { environment, adapterVersion: 1 });
    assert.equal(Object.hasOwn(saved, "executionAuthority"), false);
    assert.equal(JSON.stringify(saved).includes("evidenceDigest"), false);
    assert.doesNotMatch(await response.text(), /api-key-never-return|secret-key-never-return|ciphertext|credentialDigest/);
    assert.equal(probe.parsedCredential()?.every((byte) => byte === 0), true);
  }
});

test("Iyzico rotation rejects an environment change before credential parsing or sealing", async () => {
  const probe = iyzicoFixture("test");
  const response = await probe.handlers.profiles(request("POST", "/api/merchant-providers/profiles", {
    providerCode: "iyzico_iframe", capability: "payment_processing",
    publicConfig: { environment: "live" },
    credential: { apiKey: "must-not-parse", secretKey: "must-not-parse" },
    expectedVersion: 1,
    profileId: PROFILE,
  }));
  assert.equal(response.status, 400);
  assert.deepEqual(probe.repositoryCalls.map((entry) => (entry as { kind: string }).kind), ["list"]);
  assert.equal(probe.parseCredentialCalls(), 0);
  assert.equal(probe.parsedCredential(), null);
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
