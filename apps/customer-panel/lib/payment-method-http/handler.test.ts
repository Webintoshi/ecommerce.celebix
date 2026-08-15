import assert from "node:assert/strict";
import test from "node:test";

import type { TenantContext } from "@celebix/saas-contracts";
import {
  PaymentMethodRepositoryError,
  type PaymentMethodRepository,
} from "@celebix/saas-data";

import { PAYMENT_PROVIDER_CATALOG } from "../payment-providers/catalog.ts";
import type { ServerPaymentMethodsRuntime } from "../server-payment-methods/runtime.ts";
import { createPaymentMethodHttpHandlers } from "./handler.ts";

const PANEL = "https://panel.saas-staging.celebix.site";
const TENANT_ADMIN = "https://guzide-kuyumcu-4.admin.saas-staging.celebix.site";
const METHOD = "40000000-0000-4000-8000-000000000005";
const PROFILE = "40000000-0000-4000-8000-000000000006";
const OPERATION = "70000000-0000-4000-8000-000000000001";
const REQUEST = "71000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-07-27T12:00:00.000Z");
const CREDENTIAL = "v1.panel.current.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

function providerConfig(environment: "test" | "live" = "test") {
  return Object.freeze({
    environment,
    locale: "tr" as const,
    threeDSecure: "provider_managed" as const,
    installmentMode: "all" as const,
    maxInstallment: 0 as const,
  });
}

function tenant(role: "store_owner" | "admin" | "editor" | "analyst" = "store_owner"): TenantContext {
  return {
    schemaVersion: 1,
    requestId: "private",
    principal: { id: "10000000-0000-4000-8000-000000000001", issuer: "https://id.test/oidc", subject: "private" },
    store: { id: "20000000-0000-4000-8000-000000000001", slug: "store", status: "active" },
    membership: { id: "30000000-0000-4000-8000-000000000001", role, status: "active" },
    entitlements: {
      schemaVersion: 1,
      planId: "50000000-0000-4000-8000-000000000001",
      planCode: "growth",
      version: 2,
      status: "active",
      features: ["catalog"],
      limits: { products: 100, staff: 5, storageBytes: 100 },
      validFrom: "2026-01-01T00:00:00.000Z",
    },
    locale: "tr-TR",
  } as TenantContext;
}

function paymentMethod() {
  return {
    id: METHOD,
    kind: "cash_on_delivery" as const,
    profileId: null,
    providerCode: null,
    label: "Kapıda ödeme",
    state: "disabled" as const,
    emergencyReason: null,
    position: 0,
    config: {},
    version: 1,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

function mutation(state: "active" | "disabled" | "emergency_disabled" = "disabled", replayed = false) {
  return { id: METHOD, state, position: 0, version: state === "disabled" ? 1 : 2, updatedAt: NOW.toISOString(), replayed };
}

type AccessKind = "authenticated" | "unauthenticated" | "unauthorized";

function fixture(options: Readonly<{
  role?: "store_owner" | "admin" | "editor" | "analyst";
  accessKind?: AccessKind;
  repositoryError?: string;
  runtimeNull?: boolean;
  catalog?: readonly (typeof PAYMENT_PROVIDER_CATALOG)[number][];
  providerExecution?: unknown;
  method?: ReturnType<typeof paymentMethod> | Readonly<Record<string, unknown>>;
}> = {}) {
  const calls: Array<{ kind: string; input: unknown }> = [];
  const fail = () => {
    if (options.repositoryError === "unknown") throw new Error("driver detail");
    if (options.repositoryError) throw new PaymentMethodRepositoryError(options.repositoryError as never);
  };
  const methods = {
    async list(input) { calls.push({ kind: "list", input }); fail(); return Object.freeze([options.method ?? paymentMethod()]) as never; },
    async save(input) { calls.push({ kind: "save", input }); fail(); return mutation(); },
    async setState(input) { calls.push({ kind: "setState", input }); fail(); return mutation(input.state); },
    async reorder(input) { calls.push({ kind: "reorder", input }); fail(); return Object.freeze({ items: Object.freeze([mutation()]), replayed: false }); },
    async recoverOperation(input) { calls.push({ kind: "recoverOperation", input }); fail(); return mutation("disabled", true); },
  } satisfies PaymentMethodRepository;
  const accessKind = options.accessKind ?? "authenticated";
  const runtime = Object.freeze({
    access: Object.freeze({
      readiness: Object.freeze({ mode: "approved_staging" as const }),
      panelOrigin: PANEL,
      async resolveCredential() {
        if (accessKind === "authenticated") return Object.freeze({ kind: "authenticated" as const, tenantContext: tenant(options.role) });
        return Object.freeze({ kind: accessKind });
      },
      async rotateCredential() { throw new Error("unused"); },
      async revokeCredential() { throw new Error("unused"); },
    }),
    methods,
    catalog: options.catalog ?? PAYMENT_PROVIDER_CATALOG,
    providerExecution: options.providerExecution ?? null,
  }) as unknown as ServerPaymentMethodsRuntime;
  const handlers = createPaymentMethodHttpHandlers({
    async resolveRuntime() { return options.runtimeNull ? null : runtime; },
    now: () => new Date(NOW),
    requestId: () => REQUEST,
  });
  return { handlers, calls };
}

function request(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const selected: Record<string, string> = {
    cookie: `__Host-celebix_panel=${CREDENTIAL}`,
    ...headers,
  };
  if (method === "POST") {
    selected.origin ??= PANEL;
    selected["content-type"] ??= "application/json";
    selected["idempotency-key"] ??= OPERATION;
  }
  return new Request(`${PANEL}${path}`, {
    method,
    headers: selected,
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}

async function code(response: Response) {
  return (await response.json() as { code?: string }).code;
}

test("authenticated catalog returns exactly 58 truthful local entries", async () => {
  const probe = fixture({ role: "analyst" });
  const response = await probe.handlers.catalog(request("GET", "/api/payment-providers/catalog"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  const result = await response.json() as { items: Array<Record<string, unknown>> };
  assert.equal(result.items.length, 58);
  assert.deepEqual(result.items.filter((entry) => entry.readiness === "verification").map((entry) => entry.providerCode), ["iyzico_iframe"]);
  assert.deepEqual(result.items.filter((entry) => entry.readiness === "sandbox_ready").map((entry) => entry.providerCode), ["paytr_iframe"]);
  assert.equal(result.items.filter((entry) => !["iyzico_iframe", "paytr_iframe"].includes(String(entry.providerCode))).every((entry) => entry.readiness === "planned"), true);
  assert.equal(result.items.some((entry) => String(entry.providerCode).includes("dummy")), false);
  assert.equal(result.items.every((entry) => String(entry.logoPath).startsWith("/payment-providers/")), true);
  assert.equal(probe.calls.length, 0);
});

test("catalog accepts a forward-safe exact sandbox promotion without a hardcoded verification snapshot", async () => {
  const evidenceDigest = `sha256:${"a".repeat(64)}`;
  const catalog = PAYMENT_PROVIDER_CATALOG.map((entry) => entry.providerCode === "paytr_iframe"
    ? Object.freeze({ ...entry, readiness: "sandbox_ready" as const, executionAuthority: Object.freeze({
      environment: "test" as const, adapterVersion: 1, evidenceDigest,
    }) })
    : entry);
  const probe = fixture({ role: "analyst", catalog });
  const response = await probe.handlers.catalog(request("GET", "/api/payment-providers/catalog"));
  assert.equal(response.status, 200);
  const result = await response.json() as { items: Array<Record<string, unknown>> };
  assert.deepEqual(result.items.filter((entry) => entry.readiness === "sandbox_ready").map((entry) => entry.providerCode), ["paytr_iframe"]);
});

test("methods GET delegates only the authenticated TenantContext and validates output", async () => {
  const probe = fixture({ role: "analyst" });
  const response = await probe.handlers.methods(request("GET", "/api/payment-methods"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { items: [paymentMethod()] });
  assert.equal(probe.calls.length, 1);
  const input = probe.calls[0]!.input as Record<string, unknown>;
  assert.deepEqual(Object.keys(input).sort(), ["now", "tenantContext"]);
  assert.equal((input.tenantContext as TenantContext).store.id, tenant().store.id);
});

test("valid built-in save reaches the repository with exact frozen config", async () => {
  const config = {
    accountHolder: "Celebix Mağazacılık A.Ş.",
    bankName: "Örnek Bankası",
    iban: "TR330006100519786457841326",
    instructions: "Sipariş numaranızı açıklamaya yazın.",
  };
  const saveProbe = fixture();
  const saveResponse = await saveProbe.handlers.methods(request("POST", "/api/payment-methods", {
    methodId: METHOD,
    expectedVersion: 0,
    kind: "bank_transfer",
    profileId: null,
    providerCode: null,
    label: "Banka havalesi",
    config,
  }));
  assert.equal(saveResponse.status, 200);
  assert.deepEqual(await saveResponse.json(), mutation());
  const repositoryInput = saveProbe.calls[0]!.input as Record<string, unknown>;
  assert.deepEqual(Object.keys(repositoryInput).sort(), [
    "config", "expectedVersion", "kind", "label", "methodId", "now", "operationId",
    "profileId", "providerCode", "tenantContext",
  ]);
  assert.deepEqual(repositoryInput.config, config);
  assert.equal(Object.isFrozen(repositoryInput.config), true);
});

test("canonical tenant admin origin can save a built-in payment method", async () => {
  const probe = fixture();
  const response = await probe.handlers.methods(request("POST", "/api/payment-methods", {
    methodId: METHOD,
    expectedVersion: 0,
    kind: "bank_transfer",
    profileId: null,
    providerCode: null,
    label: "Banka havalesi",
    config: {
      accountHolder: "Celebix Mağazacılık A.Ş.",
      bankName: "Örnek Bankası",
      iban: "TR330006100519786457841326",
      instructions: "Sipariş numaranızı açıklamaya yazın.",
    },
  }, {
    origin: TENANT_ADMIN,
    host: new URL(TENANT_ADMIN).host,
  }));

  assert.equal(response.status, 200);
  assert.equal(probe.calls[0]?.kind, "save");
});

test("invalid built-in IBAN is rejected before repository save", async () => {
  const probe = fixture();
  const response = await probe.handlers.methods(request("POST", "/api/payment-methods", {
    methodId: METHOD,
    expectedVersion: 0,
    kind: "bank_transfer",
    profileId: null,
    providerCode: null,
    label: "Banka havalesi",
    config: {
      accountHolder: "Celebix Mağazacılık A.Ş.",
      bankName: "Örnek Bankası",
      iban: "TR330006100519786457841327",
      instructions: "Sipariş numaranızı açıklamaya yazın.",
    },
  }));
  assert.equal(response.status, 400);
  assert.equal(await code(response), "invalid_input");
  assert.equal(probe.calls.some(({ kind }) => kind === "save"), false);
});

test("state and exact dense reorder delegate bounded DTOs", async () => {
  const stateProbe = fixture();
  const stateResponse = await stateProbe.handlers.state(request("POST", `/api/payment-methods/${METHOD}/state`, {
    expectedVersion: 1,
    state: "active",
    emergencyReason: null,
  }), METHOD);
  assert.equal(stateResponse.status, 200);
  assert.deepEqual(stateProbe.calls.map(({ kind }) => kind), ["list", "setState"]);
  assert.deepEqual(stateProbe.calls[1]!.input, {
    tenantContext: tenant(), now: NOW, operationId: OPERATION, methodId: METHOD,
    expectedVersion: 1, state: "active", emergencyReason: null,
  });

  const reorderProbe = fixture();
  const reorderResponse = await reorderProbe.handlers.reorder(request("POST", "/api/payment-methods/reorder", {
    items: [{ id: METHOD, expectedVersion: 1, position: 0 }],
  }));
  assert.equal(reorderResponse.status, 200);
  assert.equal(reorderProbe.calls[0]!.kind, "reorder");
});

test("planned provider catalog entries cannot become configured methods in Wave 0", async () => {
  const probe = fixture();
  const response = await probe.handlers.methods(request("POST", "/api/payment-methods", {
    methodId: METHOD,
    expectedVersion: 0,
    kind: "provider",
    profileId: PROFILE,
    providerCode: "paytr",
    label: "PayTR Direct API",
    config: { credential: "must-not-be-parsed" },
  }));
  assert.equal(response.status, 503);
  const responseText = await response.text();
  assert.equal((JSON.parse(responseText) as { code: string }).code, "unavailable");
  assert.equal(probe.calls.length, 0);
  assert.doesNotMatch(responseText, /must-not-be-parsed/);
});

test("Iyzico verification profiles cannot create or enable a payment method before execution authority", async () => {
  const createProbe = fixture();
  const createResponse = await createProbe.handlers.methods(request("POST", "/api/payment-methods", {
    methodId: METHOD,
    expectedVersion: 0,
    kind: "provider",
    profileId: PROFILE,
    providerCode: "iyzico_iframe",
    label: "iyzico",
    config: { environment: "test" },
  }));
  assert.equal(createResponse.status, 503);
  assert.equal(await code(createResponse), "unavailable");
  assert.equal(createProbe.calls.length, 0);

  const iyzicoMethod = Object.freeze({
    ...paymentMethod(),
    kind: "provider" as const,
    profileId: PROFILE,
    providerCode: "iyzico_iframe",
    label: "iyzico",
    config: { environment: "test" },
  });
  const enableProbe = fixture({ method: iyzicoMethod });
  const enableResponse = await enableProbe.handlers.state(request("POST", `/api/payment-methods/${METHOD}/state`, {
    expectedVersion: 1,
    state: "active",
    emergencyReason: null,
  }), METHOD);
  assert.equal(enableResponse.status, 503);
  assert.equal(await code(enableResponse), "unavailable");
  assert.deepEqual(enableProbe.calls.map(({ kind }) => kind), ["list"]);
});

test("provider method mutation requires exact catalog registry packet evidence version and environment authority", async () => {
  const digest = `sha256:${"a".repeat(64)}`;
  const authority = Object.freeze({ environment: "test" as const, adapterVersion: 1, evidenceDigest: digest });
  const catalog = PAYMENT_PROVIDER_CATALOG.map((entry) => entry.providerCode === "paytr_iframe"
    ? Object.freeze({ ...entry, readiness: "sandbox_ready" as const, executionAuthority: authority })
    : entry);
  const packet = Object.freeze({
    providerCode: "paytr_iframe", familyCode: "paytr", modeCode: "iframe",
    adapterVersion: 1, implementation: "hosted", readiness: Object.freeze({ test: "sandbox_ready", live: "verification" }),
    endpoints: Object.freeze({ test: Object.freeze(["https://www.paytr.com/odeme/api/get-token"]), live: Object.freeze(["https://www.paytr.com/odeme/api/get-token"]) }),
  });
  const registryEntry = Object.freeze({
    providerCode: "paytr_iframe", capability: "payment_processing", adapterVersion: 1,
    environments: Object.freeze(["test"]), executionAuthority: authority,
  });
  const providerExecution = Object.freeze({
    registry: Object.freeze({ get: () => registryEntry }),
    adapters: Object.freeze({ packet: () => packet, adapter: () => Object.freeze({ packet }) }),
  });
  const input = {
    methodId: METHOD, expectedVersion: 0, kind: "provider", profileId: PROFILE,
    providerCode: "paytr_iframe", label: "PayTR", config: Object.freeze({
      ...providerConfig(),
      locale: "tr" as const,
      installmentMode: "limited" as const,
      maxInstallment: 6 as const,
    }),
  };
  const accepted = fixture({ catalog, providerExecution });
  assert.equal((await accepted.handlers.methods(request("POST", "/api/payment-methods", input))).status, 200);
  assert.equal(accepted.calls.filter((entry) => entry.kind === "save").length, 1);
  const savedProviderConfig = (accepted.calls.find((entry) => entry.kind === "save")!.input as Record<string, unknown>).config;
  assert.deepEqual(savedProviderConfig, {
    environment: "test",
    locale: "tr",
    threeDSecure: "provider_managed",
    installmentMode: "limited",
    maxInstallment: 6,
  });
  assert.equal(Object.isFrozen(savedProviderConfig), true);

  const mismatches = [
    null,
    { ...providerExecution, registry: Object.freeze({ get: () => null }) },
    { ...providerExecution, registry: Object.freeze({ get: () => ({ ...registryEntry, adapterVersion: 2 }) }) },
    { ...providerExecution, registry: Object.freeze({ get: () => ({ ...registryEntry, executionAuthority: { ...authority, evidenceDigest: `sha256:${"b".repeat(64)}` } }) }) },
    { ...providerExecution, adapters: Object.freeze({ packet: () => ({ ...packet, readiness: { test: "verification", live: "verification" } }), adapter: () => ({ packet }) }) },
  ];
  for (const mismatch of mismatches) {
    const rejected = fixture({ catalog, providerExecution: mismatch });
    const response = await rejected.handlers.methods(request("POST", "/api/payment-methods", input));
    assert.equal(response.status, 503);
    assert.equal(rejected.calls.length, 0);
  }
  const wrongEnvironment = fixture({ catalog, providerExecution });
  assert.equal((await wrongEnvironment.handlers.methods(request("POST", "/api/payment-methods", {
    ...input, config: providerConfig("live"),
  }))).status, 503);
  assert.equal(wrongEnvironment.calls.length, 0);

  for (const invalidConfig of [
    { environment: "test" },
    { ...providerConfig(), unsupported: true },
    { ...providerConfig(), installmentMode: "limited", maxInstallment: 0 },
    { ...providerConfig(), threeDSecure: "disabled" },
  ]) {
    const invalid = fixture({ catalog, providerExecution });
    const response = await invalid.handlers.methods(request("POST", "/api/payment-methods", {
      ...input,
      config: invalidConfig,
    }));
    assert.equal(response.status, 400);
    assert.equal(await code(response), "invalid_input");
    assert.equal(invalid.calls.length, 0);
  }

  const providerMethod = Object.freeze({
    ...paymentMethod(), kind: "provider" as const, profileId: PROFILE,
    providerCode: "paytr_iframe", label: "PayTR", config: providerConfig(),
  });
  const acceptedState = fixture({ catalog, providerExecution, method: providerMethod });
  assert.equal((await acceptedState.handlers.state(request("POST", `/api/payment-methods/${METHOD}/state`, {
    expectedVersion: 1, state: "active", emergencyReason: null,
  }), METHOD)).status, 200);
  assert.deepEqual(acceptedState.calls.map(({ kind }) => kind), ["list", "setState"]);

  const rejectedState = fixture({ catalog, providerExecution: null, method: providerMethod });
  assert.equal((await rejectedState.handlers.state(request("POST", `/api/payment-methods/${METHOD}/state`, {
    expectedVersion: 1, state: "active", emergencyReason: null,
  }), METHOD)).status, 503);
  assert.deepEqual(rejectedState.calls.map(({ kind }) => kind), ["list"]);
});

test("method, path, query, private-header, session, role and Origin boundaries fail before repository", async () => {
  const cases = [
    { probe: fixture(), invoke: (p: ReturnType<typeof fixture>) => p.handlers.catalog(request("POST", "/api/payment-providers/catalog", {})), status: 405, code: "method_not_allowed" },
    { probe: fixture(), invoke: (p: ReturnType<typeof fixture>) => p.handlers.catalog(request("GET", "/api/payment-providers/catalog?x=1")), status: 400, code: "invalid_input" },
    { probe: fixture(), invoke: (p: ReturnType<typeof fixture>) => p.handlers.methods(request("GET", "/api/payment-methods", undefined, { "x-store-id": tenant().store.id })), status: 400, code: "invalid_input" },
    { probe: fixture(), invoke: (p: ReturnType<typeof fixture>) => p.handlers.methods(request("GET", "/api/payment-methods", undefined, { cookie: "" })), status: 401, code: "unauthenticated" },
    { probe: fixture({ accessKind: "unauthenticated" }), invoke: (p: ReturnType<typeof fixture>) => p.handlers.methods(request("GET", "/api/payment-methods")), status: 401, code: "unauthenticated" },
    { probe: fixture({ accessKind: "unauthorized" }), invoke: (p: ReturnType<typeof fixture>) => p.handlers.methods(request("GET", "/api/payment-methods")), status: 403, code: "membership_denied" },
    { probe: fixture({ role: "analyst" }), invoke: (p: ReturnType<typeof fixture>) => p.handlers.methods(request("POST", "/api/payment-methods", {}, { origin: PANEL })), status: 403, code: "membership_denied" },
    { probe: fixture(), invoke: (p: ReturnType<typeof fixture>) => p.handlers.methods(request("POST", "/api/payment-methods", {}, { origin: "https://wrong.example" })), status: 403, code: "origin_denied" },
    { probe: fixture({ runtimeNull: true }), invoke: (p: ReturnType<typeof fixture>) => p.handlers.methods(request("GET", "/api/payment-methods")), status: 503, code: "unavailable" },
  ];
  for (const selected of cases) {
    const response = await selected.invoke(selected.probe);
    assert.equal(response.status, selected.status);
    assert.equal(await code(response), selected.code);
    assert.equal(selected.probe.calls.length, 0);
  }
});

test("body framing UTF-8 exact-shape and reorder/state invariants are bounded", async () => {
  const cases = [
    request("POST", "/api/payment-methods", "{}", { "content-type": "text/plain" }),
    request("POST", "/api/payment-methods", "{}", { "transfer-encoding": "chunked" }),
    request("POST", "/api/payment-methods", "{invalid"),
    request("POST", "/api/payment-methods", "x".repeat(32_769)),
    request("POST", "/api/payment-methods/reorder", { items: [] }),
    request("POST", "/api/payment-methods/reorder", { items: [
      { id: METHOD, expectedVersion: 1, position: 0 },
      { id: METHOD, expectedVersion: 1, position: 1 },
    ] }),
  ];
  for (const selected of cases) {
    const probe = fixture();
    const response = selected.url.endsWith("/reorder")
      ? await probe.handlers.reorder(selected)
      : await probe.handlers.methods(selected);
    assert.equal(response.status, 400);
    assert.equal(await code(response), "invalid_input");
    assert.equal(probe.calls.length, 0);
  }
  const probe = fixture();
  const invalidState = await probe.handlers.state(request("POST", `/api/payment-methods/${METHOD}/state`, {
    expectedVersion: 1, state: "emergency_disabled", emergencyReason: null,
  }), METHOD);
  assert.equal(invalidState.status, 400);
  assert.equal(probe.calls.length, 0);
});

test("repository errors map to the finite HTTP vocabulary without leaking details", async () => {
  for (const [repositoryCode, status] of [["record_not_found", 404], ["version_conflict", 409], ["provider_already_active", 409], ["unavailable", 503]] as const) {
    const probe = fixture({ repositoryError: repositoryCode });
    const response = await probe.handlers.methods(request("GET", "/api/payment-methods"));
    assert.equal(response.status, status);
    assert.equal(await code(response), repositoryCode);
  }
  const unknown = fixture({ repositoryError: "unknown" });
  const response = await unknown.handlers.methods(request("GET", "/api/payment-methods"));
  assert.equal(response.status, 503);
  const responseText = await response.text();
  assert.equal((JSON.parse(responseText) as { code: string }).code, "unavailable");
  assert.doesNotMatch(responseText, /driver detail/);
});

test("method duplicate maps to the finite conflict response", async () => {
  const probe = fixture({ repositoryError: "method_already_exists" });
  const response = await probe.handlers.methods(request("POST", "/api/payment-methods", {
    methodId: METHOD,
    expectedVersion: 0,
    kind: "cash_on_delivery",
    profileId: null,
    providerCode: null,
    label: "Kapıda ödeme",
    config: { instructions: "Teslimatta ödeme yapın." },
  }));
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { code: "method_already_exists" });
});
