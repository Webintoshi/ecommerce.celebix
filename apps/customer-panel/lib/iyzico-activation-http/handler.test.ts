import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import type { MerchantProviderProfile, TenantContext } from "@celebix/saas-contracts";
import { IyzicoSandboxEvidenceRepositoryError } from "@celebix/saas-data";

import type { ServerIyzicoActivationRuntime } from "../server-iyzico-activation/runtime.ts";
import { createIyzicoActivationHttpHandlers } from "./handler.ts";

const PANEL = "https://panel.saas-staging.celebix.site";
const TENANT_ADMIN = "https://guzide-kuyumcu-4.admin.saas-staging.celebix.site";
const OTHER_TENANT_ADMIN = "https://other-store.admin.saas-staging.celebix.site";
const INTERNAL_PROXY_HOST = "customer-panel:3400";
const PROFILE = "40000000-0000-4000-8000-000000000061";
const METHOD = "50000000-0000-4000-8000-000000000061";
const OPERATION = "60000000-0000-4000-8000-000000000061";
const REQUEST = "61000000-0000-4000-8000-000000000061";
const ATTESTATION = "62000000-0000-4000-8000-000000000061";
const FINGERPRINT = "f".repeat(64);
const EVIDENCE_DIGEST = `sha256:${"e".repeat(64)}`;
const NOW = new Date("2026-07-28T15:00:00.000Z");
const CREDENTIAL = "v1.panel.current.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

function tenant(role: "store_owner" | "analyst" = "store_owner"): TenantContext {
  return {
    schemaVersion: 1,
    requestId: "private-request",
    principal: { id: "10000000-0000-4000-8000-000000000001", issuer: "https://id.test", subject: "private" },
    store: { id: "20000000-0000-4000-8000-000000000001", slug: "guzide-kuyumcu-4", status: "active" },
    membership: { id: "30000000-0000-4000-8000-000000000001", role, status: "active" },
    entitlements: {
      schemaVersion: 1,
      planId: "70000000-0000-4000-8000-000000000001",
      planCode: "growth",
      version: 2,
      status: "active",
      features: ["integrations", "payment_setting"],
      limits: { products: 100, staff: 5, storageBytes: 100 },
      validFrom: "2026-01-01T00:00:00.000Z",
    },
    locale: "tr-TR",
  } as TenantContext;
}

function profile(overrides: Partial<MerchantProviderProfile> = {}): MerchantProviderProfile {
  return Object.freeze({
    id: PROFILE,
    providerCode: "iyzico_iframe",
    capability: "payment_processing",
    publicConfig: Object.freeze({ environment: "test" }),
    maskedAccountReference: "iyzico test hesabı",
    status: "active",
    credentialVersion: 4,
    version: 7,
    lastValidatedAt: NOW.toISOString(),
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  }) as MerchantProviderProfile;
}

function build() {
  const candidate = Object.freeze({
    evidenceSchemaVersion: 1 as const,
    providerCode: "iyzico_iframe" as const,
    capability: "payment_processing" as const,
    environment: "test" as const,
    adapterVersion: 1 as const,
    gitSha: "a".repeat(40),
    sourceDigest: `sha256:${"b".repeat(64)}`,
  });
  return Object.freeze({
    buildMetadataSchemaVersion: 1 as const,
    ...candidate,
    candidateExecutionDigest: `sha256:${createHash("sha256").update(JSON.stringify(candidate)).digest("hex")}`,
  });
}

function beginFingerprint() {
  return createHash("sha256").update(JSON.stringify({
    kind: "iyzico_iframe_tenant_evidence_begin_current",
    storeId: tenant().store.id,
    runId: OPERATION,
    profileId: PROFILE,
    profileVersion: 7,
    credentialVersion: 4,
    candidateEvidenceDigest: build().candidateExecutionDigest,
    adapterVersion: 1,
  })).digest("hex");
}

function activationFingerprint() {
  return createHash("sha256").update(JSON.stringify({
    kind: "iyzico_iframe_tenant_evidence_activate_current",
    storeId: tenant().store.id,
    operationId: OPERATION,
    methodId: METHOD,
    expectedMethodVersion: 2,
  })).digest("hex");
}

type Current = Readonly<{
  outcome: "not_started" | "current";
  profileId: string;
  runId: string | null;
  status: "pending" | "leased" | "attested" | "rejected" | null;
  rejectionCode: "callback_mismatch" | "timeout_mismatch" | "stale_evidence" | null;
  methodId: string | null;
  methodVersion: number | null;
  methodState: "active" | "disabled" | "emergency_disabled" | null;
  profileVersion: number;
  credentialVersion: number;
  attestationId: string | null;
  activationCurrent: boolean;
}>;

function current(overrides: Partial<Current> = {}): Current {
  return Object.freeze({
    outcome: "not_started",
    profileId: PROFILE,
    runId: null,
    status: null,
    rejectionCode: null,
    methodId: null,
    methodVersion: null,
    methodState: null,
    profileVersion: 7,
    credentialVersion: 4,
    attestationId: null,
    activationCurrent: false,
    ...overrides,
  });
}

function fixture(options: Readonly<{
  role?: "store_owner" | "analyst";
  access?: "authenticated" | "unauthenticated" | "unauthorized";
  build?: ReturnType<typeof build> | null;
  profiles?: readonly MerchantProviderProfile[];
  current?: Current;
  error?: string;
  runtimeNull?: boolean;
}> = {}) {
  const calls: Array<Readonly<{ kind: string; input: unknown }>> = [];
  const fail = () => {
    if (options.error === "unknown") throw new Error(`driver:${ATTESTATION}:${EVIDENCE_DIGEST}`);
    if (options.error) throw new IyzicoSandboxEvidenceRepositoryError(options.error as never);
  };
  const evidence = Object.freeze({
    async beginCurrent(input: unknown) {
      calls.push(Object.freeze({ kind: "beginCurrent", input }));
      fail();
      return Object.freeze({ outcome: "created", runId: OPERATION, status: "pending", methodId: METHOD, methodVersion: 1, methodState: "disabled", replayed: false });
    },
    async current(input: unknown) {
      calls.push(Object.freeze({ kind: "current", input }));
      fail();
      return options.current ?? current();
    },
    async activateCurrent(input: unknown) {
      calls.push(Object.freeze({ kind: "activateCurrent", input }));
      fail();
      return Object.freeze({
        outcome: "state_changed", id: METHOD, state: "active", position: 0, version: 3,
        updatedAt: NOW.toISOString(), replayed: false, activationAttestationId: ATTESTATION,
      });
    },
    async activationRuntimePreflight() { return true as const; },
  });
  const profileReader = Object.freeze({
    async list(input: unknown) {
      calls.push(Object.freeze({ kind: "profiles", input }));
      return Object.freeze([...(options.profiles ?? [profile()])]);
    },
  });
  const accessKind = options.access ?? "authenticated";
  const runtime = Object.freeze({
    access: Object.freeze({
      readiness: Object.freeze({ mode: "approved_staging" as const }),
      panelOrigin: PANEL,
      async resolveCredential() {
        return accessKind === "authenticated"
          ? Object.freeze({ kind: "authenticated" as const, tenantContext: tenant(options.role) })
          : Object.freeze({ kind: accessKind });
      },
      async rotateCredential() { throw new Error("unused"); },
      async revokeCredential() { throw new Error("unused"); },
    }),
    evidence,
    profiles: profileReader,
    build: options.build === undefined ? build() : options.build,
  }) as unknown as ServerIyzicoActivationRuntime;
  const handlers = createIyzicoActivationHttpHandlers({
    async resolveRuntime() { return options.runtimeNull ? null : runtime; },
    now: () => new Date(NOW),
    requestId: () => REQUEST,
  });
  return { handlers, calls };
}

function request(method: "GET" | "POST", path: string, body?: unknown, headers: Record<string, string> = {}) {
  const selected: Record<string, string> = { cookie: `__Host-celebix_panel=${CREDENTIAL}`, ...headers };
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

async function json(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

const CURRENT_PATH = "/api/payment-providers/iyzico/sandbox-activation/current";
const BEGIN_PATH = "/api/payment-providers/iyzico/sandbox-activation/begin";
const ACTIVATE_PATH = "/api/payment-providers/iyzico/sandbox-activation/activate";

test("current maps every merchant lifecycle without exposing evidence authority", async () => {
  const fixtures: Array<Readonly<{
    options: Parameters<typeof fixture>[0];
    phase: string;
    canBegin: boolean;
    canActivate: boolean;
    methodId: string | null;
    expectedMethodVersion: number | null;
  }>> = [
    { options: { build: null }, phase: "build_pending", canBegin: false, canActivate: false, methodId: null, expectedMethodVersion: null },
    { options: { profiles: [profile({ status: "pending_validation", lastValidatedAt: null })] }, phase: "credentials_unverified", canBegin: false, canActivate: false, methodId: null, expectedMethodVersion: null },
    { options: { current: current() }, phase: "evidence_pending", canBegin: true, canActivate: false, methodId: null, expectedMethodVersion: null },
    { options: { current: current({ outcome: "current", runId: OPERATION, status: "pending", methodId: METHOD, methodVersion: 1, methodState: "disabled" }) }, phase: "running", canBegin: false, canActivate: false, methodId: null, expectedMethodVersion: null },
    { options: { current: current({ outcome: "current", runId: OPERATION, status: "leased", methodId: METHOD, methodVersion: 1, methodState: "disabled" }) }, phase: "running", canBegin: false, canActivate: false, methodId: null, expectedMethodVersion: null },
    { options: { current: current({ outcome: "current", runId: OPERATION, status: "rejected", rejectionCode: "stale_evidence", methodId: METHOD, methodVersion: 1, methodState: "disabled" }) }, phase: "rejected", canBegin: true, canActivate: false, methodId: null, expectedMethodVersion: null },
    { options: { current: current({ outcome: "current", runId: OPERATION, status: "attested", methodId: METHOD, methodVersion: 2, methodState: "disabled", attestationId: ATTESTATION, activationCurrent: true }) }, phase: "ready_to_activate", canBegin: false, canActivate: true, methodId: METHOD, expectedMethodVersion: 2 },
    { options: { current: current({ outcome: "current", runId: OPERATION, status: "attested", methodId: METHOD, methodVersion: 3, methodState: "active", attestationId: ATTESTATION, activationCurrent: true }) }, phase: "active", canBegin: false, canActivate: false, methodId: METHOD, expectedMethodVersion: 3 },
  ];

  for (const selected of fixtures) {
    const probe = fixture(selected.options);
    const response = await probe.handlers.current(request("GET", CURRENT_PATH));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await json(response), {
      phase: selected.phase,
      canBegin: selected.canBegin,
      canActivate: selected.canActivate,
      methodId: selected.methodId,
      expectedMethodVersion: selected.expectedMethodVersion,
    });
    const serialized = JSON.stringify(await probe.handlers.current(request("GET", CURRENT_PATH)).then(json));
    assert.doesNotMatch(serialized, /attestation|digest|event|secret|profileId|runId/i);
    assert.doesNotMatch(serialized, new RegExp(ATTESTATION));
  }
});

test("begin derives the active TEST profile and generated Build A authority server-side", async () => {
  const live = profile({ id: "40000000-0000-4000-8000-000000000060", publicConfig: Object.freeze({ environment: "live" }), updatedAt: "2026-07-28T16:00:00.000Z" });
  const probe = fixture({ profiles: [live, profile()] });
  const response = await probe.handlers.begin(request("POST", BEGIN_PATH, {}));
  assert.equal(response.status, 200);
  assert.deepEqual(await json(response), {
    phase: "running", canBegin: false, canActivate: false, methodId: null, expectedMethodVersion: null,
  });
  assert.deepEqual(probe.calls.map(({ kind }) => kind), ["profiles", "beginCurrent"]);
  const input = probe.calls[1]!.input as Record<string, unknown>;
  assert.deepEqual(Object.keys(input).sort(), [
    "adapterVersion", "candidateEvidenceDigest", "expectedCredentialVersion", "expectedProfileVersion",
    "fingerprint", "now", "profileId", "runId", "tenantContext",
  ]);
  assert.equal(input.runId, OPERATION);
  assert.equal(input.fingerprint, beginFingerprint());
  assert.equal(input.profileId, PROFILE);
  assert.equal(input.expectedProfileVersion, 7);
  assert.equal(input.expectedCredentialVersion, 4);
  assert.equal(input.adapterVersion, 1);
  assert.equal(input.candidateEvidenceDigest, build().candidateExecutionDigest);
  assert.equal((input.tenantContext as TenantContext).store.id, tenant().store.id);
  assert.equal(input.now instanceof Date, true);
});

test("tenant admin sandbox activation survives internal proxy delivery and stays store-bound", async () => {
  const probe = fixture();
  const response = await probe.handlers.begin(request("POST", BEGIN_PATH, {}, {
    origin: TENANT_ADMIN,
    host: INTERNAL_PROXY_HOST,
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(probe.calls.map(({ kind }) => kind), ["profiles", "beginCurrent"]);

  const rejected = await probe.handlers.begin(request("POST", BEGIN_PATH, {}, {
    origin: OTHER_TENANT_ADMIN,
    host: INTERNAL_PROXY_HOST,
  }));
  assert.equal(rejected.status, 403);
  assert.deepEqual(await json(rejected), { code: "origin_denied" });
  assert.deepEqual(probe.calls.map(({ kind }) => kind), ["profiles", "beginCurrent"]);
});

test("activate derives its fingerprint from the browser operation method and version then strips attestation", async () => {
  const probe = fixture();
  const response = await probe.handlers.activate(request("POST", ACTIVATE_PATH, {
    methodId: METHOD,
    expectedMethodVersion: 2,
  }));
  assert.equal(response.status, 200);
  const body = await json(response);
  assert.deepEqual(body, {
    phase: "active", canBegin: false, canActivate: false, methodId: METHOD, expectedMethodVersion: 3,
  });
  assert.deepEqual(probe.calls.map(({ kind }) => kind), ["profiles", "activateCurrent"]);
  const input = probe.calls[1]!.input as Record<string, unknown>;
  assert.deepEqual(Object.keys(input).sort(), [
    "expectedMethodVersion", "fingerprint", "methodId", "now", "operationId", "tenantContext",
  ]);
  assert.equal(input.operationId, OPERATION);
  assert.equal(input.fingerprint, activationFingerprint());
  assert.equal("attestationId" in input, false);
  assert.doesNotMatch(JSON.stringify(body), /attestation|digest|event|credential|secret/i);
});

test("method path query body private headers session role and origin fail before repositories", async () => {
  const cases: Array<readonly [ReturnType<typeof fixture>, Request, number, string]> = [
    [fixture(), request("GET", `${CURRENT_PATH}?profileId=${PROFILE}`), 400, "invalid_input"],
    [fixture(), request("POST", BEGIN_PATH, { fingerprint: FINGERPRINT }), 400, "invalid_input"],
    [fixture(), request("POST", BEGIN_PATH, { attestationId: ATTESTATION }), 400, "invalid_input"],
    [fixture(), request("POST", ACTIVATE_PATH, { methodId: METHOD, expectedMethodVersion: 2, candidateEvidenceDigest: EVIDENCE_DIGEST }), 400, "invalid_input"],
    [fixture(), request("POST", ACTIVATE_PATH, { fingerprint: FINGERPRINT, methodId: METHOD, expectedMethodVersion: 2 }), 400, "invalid_input"],
    [fixture(), request("POST", BEGIN_PATH, {}, { origin: "https://evil.example" }), 403, "origin_denied"],
    [fixture(), request("GET", CURRENT_PATH, undefined, { "x-store-id": tenant().store.id }), 400, "invalid_input"],
    [fixture({ access: "unauthenticated" }), request("GET", CURRENT_PATH), 401, "unauthenticated"],
    [fixture({ access: "unauthorized" }), request("GET", CURRENT_PATH), 403, "membership_denied"],
    [fixture({ role: "analyst" }), request("POST", BEGIN_PATH, {}), 403, "membership_denied"],
    [fixture({ runtimeNull: true }), request("GET", CURRENT_PATH), 503, "unavailable"],
  ];
  for (const [probe, selected, status, expectedCode] of cases) {
    const handler = selected.method === "GET" ? probe.handlers.current
      : new URL(selected.url).pathname === BEGIN_PATH ? probe.handlers.begin : probe.handlers.activate;
    const response = await handler(selected);
    assert.equal(response.status, status);
    assert.equal((await json(response)).code, expectedCode);
    assert.equal(probe.calls.length, 0);
  }
});

test("finite repository failures preserve provider conflict UX and hide unknown details", async () => {
  for (const [repositoryCode, status, expectedCode] of [
    ["provider_already_active", 409, "provider_already_active"],
    ["version_conflict", 409, "version_conflict"],
    ["commit_unknown", 503, "unavailable"],
    ["unknown", 503, "unavailable"],
  ] as const) {
    const probe = fixture({ error: repositoryCode });
    const response = await probe.handlers.activate(request("POST", ACTIVATE_PATH, {
      methodId: METHOD, expectedMethodVersion: 2,
    }));
    assert.equal(response.status, status);
    const body = await json(response);
    assert.deepEqual(body, { code: expectedCode });
    assert.doesNotMatch(JSON.stringify(body), new RegExp(`${ATTESTATION}|${EVIDENCE_DIGEST}`));
  }
});
