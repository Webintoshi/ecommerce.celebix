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

const PANEL = "https://panel.staging.example";
const METHOD = "40000000-0000-4000-8000-000000000005";
const PROFILE = "40000000-0000-4000-8000-000000000006";
const OPERATION = "70000000-0000-4000-8000-000000000001";
const REQUEST = "71000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-07-27T12:00:00.000Z");
const CREDENTIAL = "v1.panel.current.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

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
}> = {}) {
  const calls: Array<{ kind: string; input: unknown }> = [];
  const fail = () => {
    if (options.repositoryError === "unknown") throw new Error("driver detail");
    if (options.repositoryError) throw new PaymentMethodRepositoryError(options.repositoryError as never);
  };
  const methods = {
    async list(input) { calls.push({ kind: "list", input }); fail(); return Object.freeze([paymentMethod()]); },
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
    catalog: PAYMENT_PROVIDER_CATALOG,
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
  assert.deepEqual(result.items.filter((entry) => entry.readiness === "verification").map((entry) => entry.providerCode), ["paytr_iframe"]);
  assert.equal(result.items.filter((entry) => entry.providerCode !== "paytr_iframe").every((entry) => entry.readiness === "planned"), true);
  assert.equal(result.items.some((entry) => String(entry.providerCode).includes("dummy")), false);
  assert.equal(result.items.every((entry) => String(entry.logoPath).startsWith("/payment-providers/")), true);
  assert.equal(probe.calls.length, 0);
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

test("built-in save state and exact dense reorder delegate bounded DTOs", async () => {
  const saveProbe = fixture();
  const saveResponse = await saveProbe.handlers.methods(request("POST", "/api/payment-methods", {
    methodId: METHOD,
    expectedVersion: 0,
    kind: "cash_on_delivery",
    profileId: null,
    providerCode: null,
    label: "Kapıda ödeme",
    config: {},
  }));
  assert.equal(saveResponse.status, 200);
  assert.deepEqual(await saveResponse.json(), mutation());
  assert.deepEqual(Object.keys((saveProbe.calls[0]!.input as Record<string, unknown>)).sort(), [
    "config", "expectedVersion", "kind", "label", "methodId", "now", "operationId",
    "profileId", "providerCode", "tenantContext",
  ]);

  const stateProbe = fixture();
  const stateResponse = await stateProbe.handlers.state(request("POST", `/api/payment-methods/${METHOD}/state`, {
    expectedVersion: 1,
    state: "active",
    emergencyReason: null,
  }), METHOD);
  assert.equal(stateResponse.status, 200);
  assert.equal(stateProbe.calls[0]!.kind, "setState");
  assert.deepEqual(stateProbe.calls[0]!.input, {
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
    providerCode: "paytr_iframe",
    label: "PayTR",
    config: { credential: "must-not-be-parsed" },
  }));
  assert.equal(response.status, 503);
  const responseText = await response.text();
  assert.equal((JSON.parse(responseText) as { code: string }).code, "unavailable");
  assert.equal(probe.calls.length, 0);
  assert.doesNotMatch(responseText, /must-not-be-parsed/);
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
  for (const [repositoryCode, status] of [["record_not_found", 404], ["version_conflict", 409], ["unavailable", 503]] as const) {
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
