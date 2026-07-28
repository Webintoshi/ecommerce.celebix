import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { TenantContext } from "@celebix/saas-contracts";

import {
  IYZICO_SANDBOX_EVIDENCE_ERROR_CODES,
  IyzicoSandboxEvidenceRepositoryError,
  PostgresIyzicoSandboxEvidenceAppRepository,
  PostgresIyzicoSandboxEvidenceWorkflowRepository,
  type IyzicoSandboxEvidenceAppRepository,
  type IyzicoSandboxEvidenceWorkflowRepository,
  type RecordIyzicoSandboxEvidenceEventInput,
} from "../index.ts";

const STORE = "10000000-0000-4000-8000-000000000060";
const PRINCIPAL = "20000000-0000-4000-8000-000000000060";
const MEMBERSHIP = "30000000-0000-4000-8000-000000000060";
const PLAN = "00000000-0000-4000-8000-000000000001";
const PROFILE = "40000000-0000-4000-8000-000000000060";
const METHOD = "50000000-0000-4000-8000-000000000060";
const RUN = "60000000-0000-4000-8000-000000000060";
const LEASE = "61000000-0000-4000-8000-000000000060";
const ATTESTATION = "62000000-0000-4000-8000-000000000060";
const EVENT = "63000000-0000-4000-8000-000000000060";
const ATTEMPT = "64000000-0000-4000-8000-000000000060";
const OPERATION = "65000000-0000-4000-8000-000000000060";
const FINGERPRINT = "1".repeat(64);
const OBSERVATION = "2".repeat(64);
const EVIDENCE_DIGEST = `sha256:${"a".repeat(64)}`;
const MATRIX_DIGEST = `sha256:${"b".repeat(64)}`;
const NOW = new Date("2026-07-28T13:05:00.000Z");
const LEASE_EXPIRES_AT = new Date("2026-07-28T13:10:00.000Z");
const WORKER = "iyzico-evidence-worker-1";

function tenant(overrides: Record<string, unknown> = {}): TenantContext {
  return {
    schemaVersion: 1,
    requestId: "request-iyzico-sandbox-evidence",
    principal: { id: PRINCIPAL, issuer: "https://identity.example.test/oidc", subject: "merchant" },
    store: { id: STORE, slug: "iyzico-evidence", status: "active" },
    membership: { id: MEMBERSHIP, role: "store_owner", status: "active" },
    entitlements: {
      schemaVersion: 1,
      planId: PLAN,
      planCode: "growth",
      version: 2,
      status: "active",
      features: ["integrations"],
      limits: { products: 100, staff: 5, storageBytes: 1_024 },
      validFrom: "2026-01-01T00:00:00.000Z",
    },
    locale: "tr-TR",
    ...overrides,
  } as TenantContext;
}

type Row = Record<string, unknown>;
type Responder = (text: string, values: unknown[]) => Row[] | Error | Promise<Row[] | Error>;

class Client {
  readonly calls: Array<{ text: string; values: unknown[] }> = [];
  readonly releases: unknown[] = [];
  readonly responder: Responder;

  constructor(responder: Responder = () => []) { this.responder = responder; }

  async query(text: string, values: unknown[] = []) {
    this.calls.push({ text, values });
    const selected = await this.responder(text, values);
    if (selected instanceof Error) throw selected;
    return { rows: selected, rowCount: selected.length, command: "", oid: 0, fields: [] };
  }

  release(value?: unknown) { this.releases.push(value); }
}

class Pool {
  private index = 0;
  readonly clients: Client[];

  constructor(clients: Client[]) { this.clients = clients; }

  async connect() {
    const selected = this.clients[this.index++];
    if (!selected) throw new Error("checkout");
    return selected;
  }
}

type Audit = Readonly<{ type: string; role: string; operation: string }>;

function appRepository(pool: Pool, audit: Audit[] = []): IyzicoSandboxEvidenceAppRepository {
  return new PostgresIyzicoSandboxEvidenceAppRepository({
    pool,
    role: "celebix_saas_app",
    timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
    audit(event) { audit.push(event); },
  });
}

function workflowRepository(pool: Pool, audit: Audit[] = []): IyzicoSandboxEvidenceWorkflowRepository {
  return new PostgresIyzicoSandboxEvidenceWorkflowRepository({
    pool,
    role: "celebix_saas_workflow",
    timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
    audit(event) { audit.push(event); },
  });
}

function beginInput() {
  return {
    tenantContext: tenant(),
    now: NOW,
    runId: RUN,
    fingerprint: FINGERPRINT,
    profileId: PROFILE,
    expectedProfileVersion: 1,
    expectedCredentialVersion: 1,
    candidateEvidenceDigest: EVIDENCE_DIGEST,
    adapterVersion: 7,
  };
}

function claimInput() {
  return {
    runId: RUN,
    workerId: WORKER,
    leaseId: LEASE,
    now: NOW,
    leaseExpiresAt: LEASE_EXPIRES_AT,
  };
}

function eventInput() {
  return {
    runId: RUN,
    leaseId: LEASE,
    workerId: WORKER,
    eventId: EVENT,
    caseKind: "success" as const,
    eventKind: "success_captured" as const,
    attemptId: ATTEMPT,
    observationDigest: OBSERVATION,
    outcomeCode: "captured" as const,
    observedAt: NOW,
  };
}

function finalizeInput() {
  return {
    runId: RUN,
    leaseId: LEASE,
    workerId: WORKER,
    attestationId: ATTESTATION,
    fingerprint: FINGERPRINT,
    now: NOW,
  };
}

function activateInput() {
  return {
    tenantContext: tenant(),
    now: NOW,
    operationId: OPERATION,
    fingerprint: FINGERPRINT,
    methodId: METHOD,
    expectedMethodVersion: 1,
    attestationId: ATTESTATION,
    expectedProfileVersion: 1,
  };
}

function beginPayload(replayed = false, status = "pending") {
  return { runId: RUN, status, replayed };
}

function claimPayload(replayed = false) {
  return { runId: RUN, leaseId: LEASE, replayed };
}

function eventPayload(replayed = false) {
  return { eventId: EVENT, replayed };
}

function finalizePayload(replayed = false) {
  return { attestationId: ATTESTATION, matrixDigest: MATRIX_DIGEST, replayed };
}

function activationPayload(replayed = false) {
  return {
    id: METHOD,
    state: "active",
    position: 0,
    version: 2,
    updatedAt: NOW.toISOString(),
    replayed,
    activationAttestationId: ATTESTATION,
  };
}

function selected(outcome: string, resultPayload: unknown): Row[] {
  return [{ outcome, result_payload: resultPayload }];
}

function call(client: Client, functionName: string) {
  const matches = client.calls.filter(({ text }) => text.includes(`saas.${functionName}`));
  assert.equal(matches.length, 1, functionName);
  return matches[0]!;
}

function errorCode(code: string) {
  return (error: unknown) => error instanceof IyzicoSandboxEvidenceRepositoryError
    && error.code === code
    && error.message === code;
}

test("app begin uses only the exact 060 signature and returns a frozen closed status", async () => {
  const client = new Client((text) => text.includes("iyzico_iframe_tenant_evidence_begin")
    ? selected("created", beginPayload())
    : []);
  const result = await appRepository(new Pool([client])).begin(beginInput());
  assert.deepEqual(result, { outcome: "created", ...beginPayload() });
  assert.equal(Object.isFrozen(result), true);
  const query = call(client, "iyzico_iframe_tenant_evidence_begin");
  assert.equal(query.text,
    "SELECT outcome,result_payload FROM saas.iyzico_iframe_tenant_evidence_begin($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint,$12::bigint,$13::text,$14::integer)");
  assert.deepEqual(query.values, [
    STORE, PRINCIPAL, MEMBERSHIP, PLAN, "growth", 2, NOW,
    RUN, FINGERPRINT, PROFILE, 1, 1, EVIDENCE_DIGEST, 7,
  ]);
  assert.equal(client.calls.some(({ text }) => text === "SET LOCAL ROLE celebix_saas_app"), true);
  assert.doesNotMatch(JSON.stringify(result), /credential|token|body|header|buyer/i);
});

test("workflow claim, case event, and finalize use the exact three 060 signatures", async () => {
  const claimClient = new Client((text) => text.includes("iyzico_iframe_tenant_evidence_claim")
    ? selected("claimed", claimPayload())
    : []);
  const claim = await workflowRepository(new Pool([claimClient])).claim(claimInput());
  assert.deepEqual(claim, { outcome: "claimed", ...claimPayload() });
  assert.equal(call(claimClient, "iyzico_iframe_tenant_evidence_claim").text,
    "SELECT outcome,result_payload FROM saas.iyzico_iframe_tenant_evidence_claim($1::uuid,$2::text,$3::uuid,$4::timestamptz,$5::timestamptz)");
  assert.deepEqual(call(claimClient, "iyzico_iframe_tenant_evidence_claim").values,
    [RUN, WORKER, LEASE, NOW, LEASE_EXPIRES_AT]);

  const matrix = [
    ["success", "success_captured", "captured"],
    ["decline", "declined", "declined"],
    ["controlled_timeout_recovery", "timeout_unknown", "unknown"],
    ["controlled_timeout_recovery", "timeout_recovered", "recovered"],
    ["callback_replay", "callback_original", "accepted"],
    ["callback_replay", "callback_replay", "replayed"],
  ] as const;
  for (const [caseKind, eventKind, outcomeCode] of matrix) {
    const eventClient = new Client((text) => text.includes("iyzico_iframe_tenant_evidence_record_event")
      ? selected("recorded", eventPayload())
      : []);
    const result = await workflowRepository(new Pool([eventClient])).recordEvent({
      ...eventInput(), caseKind, eventKind, outcomeCode,
    } as RecordIyzicoSandboxEvidenceEventInput);
    assert.equal(result.outcome, "recorded");
    const query = call(eventClient, "iyzico_iframe_tenant_evidence_record_event");
    assert.equal(query.text,
      "SELECT outcome,result_payload FROM saas.iyzico_iframe_tenant_evidence_record_event($1::uuid,$2::uuid,$3::text,$4::uuid,$5::text,$6::text,$7::uuid,$8::text,$9::text,$10::timestamptz)");
    assert.deepEqual(query.values, [
      RUN, LEASE, WORKER, EVENT, caseKind, eventKind, ATTEMPT, OBSERVATION, outcomeCode, NOW,
    ]);
  }

  const finalizeClient = new Client((text) => text.includes("iyzico_iframe_tenant_evidence_finalize")
    ? selected("attested", finalizePayload())
    : []);
  const finalized = await workflowRepository(new Pool([finalizeClient])).finalize(finalizeInput());
  assert.deepEqual(finalized, { outcome: "attested", ...finalizePayload() });
  assert.equal(call(finalizeClient, "iyzico_iframe_tenant_evidence_finalize").text,
    "SELECT outcome,result_payload FROM saas.iyzico_iframe_tenant_evidence_finalize($1::uuid,$2::uuid,$3::text,$4::uuid,$5::text,$6::timestamptz)");
  assert.equal(finalizeClient.calls.some(({ text }) => text === "SET LOCAL ROLE celebix_saas_workflow"), true);
});

test("activation handshake uses only the exact 060 function and validates its safe projection", async () => {
  const client = new Client((text) => text.includes("iyzico_iframe_tenant_evidence_activate")
    ? selected("state_changed", activationPayload())
    : []);
  const result = await appRepository(new Pool([client])).activate(activateInput());
  assert.deepEqual(result, { outcome: "state_changed", ...activationPayload() });
  const query = call(client, "iyzico_iframe_tenant_evidence_activate");
  assert.equal(query.text,
    "SELECT outcome,result_payload FROM saas.iyzico_iframe_tenant_evidence_activate($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint,$12::uuid,$13::bigint)");
  assert.deepEqual(query.values, [
    STORE, PRINCIPAL, MEMBERSHIP, PLAN, "growth", 2, NOW,
    OPERATION, FINGERPRINT, METHOD, 1, ATTESTATION, 1,
  ]);
});

test("app and workflow preflight are read-only, role-separated, and fail closed on false", async () => {
  for (const [role, build] of [
    ["celebix_saas_app", appRepository] as const,
    ["celebix_saas_workflow", workflowRepository] as const,
  ]) {
    const client = new Client((text) => text.includes("iyzico_iframe_tenant_evidence_preflight")
      ? [{ ready: true }]
      : []);
    assert.equal(await build(new Pool([client])).preflight(), true);
    assert.equal(client.calls[0]?.text, "BEGIN READ ONLY");
    assert.equal(client.calls.some(({ text }) => text === `SET LOCAL ROLE ${role}`), true);
    assert.equal(call(client, "iyzico_iframe_tenant_evidence_preflight").text,
      "SELECT saas.iyzico_iframe_tenant_evidence_preflight() AS ready");
  }
  const unavailable = new Client((text) => text.includes("iyzico_iframe_tenant_evidence_preflight")
    ? [{ ready: false }]
    : []);
  await assert.rejects(() => appRepository(new Pool([unavailable])).preflight(), errorCode("unavailable"));
});

test("every mutation recovers one unknown COMMIT by replaying the same exact 060 RPC once", async () => {
  const cases = [
    {
      role: "app", operation: "begin", functionName: "iyzico_iframe_tenant_evidence_begin",
      observedOutcome: "created", observed: beginPayload(), recovered: beginPayload(true),
      invoke: (repo: IyzicoSandboxEvidenceAppRepository | IyzicoSandboxEvidenceWorkflowRepository) =>
        (repo as IyzicoSandboxEvidenceAppRepository).begin(beginInput()),
    },
    {
      role: "workflow", operation: "claim", functionName: "iyzico_iframe_tenant_evidence_claim",
      observedOutcome: "claimed", observed: claimPayload(), recovered: claimPayload(true),
      invoke: (repo: IyzicoSandboxEvidenceAppRepository | IyzicoSandboxEvidenceWorkflowRepository) =>
        (repo as IyzicoSandboxEvidenceWorkflowRepository).claim(claimInput()),
    },
    {
      role: "workflow", operation: "record_event", functionName: "iyzico_iframe_tenant_evidence_record_event",
      observedOutcome: "recorded", observed: eventPayload(), recovered: eventPayload(true),
      invoke: (repo: IyzicoSandboxEvidenceAppRepository | IyzicoSandboxEvidenceWorkflowRepository) =>
        (repo as IyzicoSandboxEvidenceWorkflowRepository).recordEvent(eventInput()),
    },
    {
      role: "workflow", operation: "finalize", functionName: "iyzico_iframe_tenant_evidence_finalize",
      observedOutcome: "attested", observed: finalizePayload(), recovered: finalizePayload(true),
      invoke: (repo: IyzicoSandboxEvidenceAppRepository | IyzicoSandboxEvidenceWorkflowRepository) =>
        (repo as IyzicoSandboxEvidenceWorkflowRepository).finalize(finalizeInput()),
    },
    {
      role: "app", operation: "activate", functionName: "iyzico_iframe_tenant_evidence_activate",
      observedOutcome: "state_changed", observed: activationPayload(), recovered: activationPayload(true),
      invoke: (repo: IyzicoSandboxEvidenceAppRepository | IyzicoSandboxEvidenceWorkflowRepository) =>
        (repo as IyzicoSandboxEvidenceAppRepository).activate(activateInput()),
    },
  ] as const;

  for (const selectedCase of cases) {
    const writer = new Client((text) => {
      if (text.includes(selectedCase.functionName)) return selected(selectedCase.observedOutcome, selectedCase.observed);
      if (text === "COMMIT") return new Error("wire lost");
      return [];
    });
    const recovery = new Client((text) => text.includes(selectedCase.functionName)
      ? selected("operation_replayed", selectedCase.recovered)
      : []);
    const audits: Audit[] = [];
    const repo = selectedCase.role === "app"
      ? appRepository(new Pool([writer, recovery]), audits)
      : workflowRepository(new Pool([writer, recovery]), audits);
    const result = await selectedCase.invoke(repo);
    assert.equal(result.outcome, "operation_replayed");
    assert.deepEqual(writer.releases, [true]);
    assert.deepEqual(audits, [{
      type: "iyzico_sandbox_evidence_commit_unknown",
      role: selectedCase.role,
      operation: selectedCase.operation,
    }]);
    const writeCall = call(writer, selectedCase.functionName);
    const replayCall = call(recovery, selectedCase.functionName);
    assert.equal(replayCall.text, writeCall.text);
    assert.deepEqual(replayCall.values, writeCall.values);
    assert.equal(recovery.calls.at(-1)?.text, "COMMIT");
  }
});

test("unresolved or mismatched commit recovery is commit_unknown and never performs a third checkout", async () => {
  const writer = new Client((text) => {
    if (text.includes("iyzico_iframe_tenant_evidence_begin")) return selected("created", beginPayload());
    if (text === "COMMIT") return new Error("wire lost");
    return [];
  });
  const recovery = new Client((text) => text.includes("iyzico_iframe_tenant_evidence_begin")
    ? selected("operation_replayed", { ...beginPayload(true), runId: "60000000-0000-4000-8000-000000000061" })
    : []);
  const pool = new Pool([writer, recovery]);
  await assert.rejects(() => appRepository(pool).begin(beginInput()), errorCode("commit_unknown"));
  assert.equal(pool.clients.length, 2);
  assert.equal(recovery.calls.filter(({ text }) => text.includes("iyzico_iframe_tenant_evidence_begin")).length, 1);
});

test("closed database outcomes map safely and unknown outcomes are unavailable", async () => {
  assert.deepEqual(IYZICO_SANDBOX_EVIDENCE_ERROR_CODES, [
    "invalid_input", "unauthenticated", "membership_denied", "store_inactive",
    "feature_not_enabled", "provider_disabled", "operation_mismatch", "profile_not_found",
    "profile_not_eligible", "profile_not_active", "version_conflict", "already_bound",
    "durable_authority_invalid", "run_not_found", "run_closed", "lease_conflict",
    "stale_evidence", "lease_lost", "case_not_found", "callback_mismatch",
    "timeout_mismatch", "evidence_incomplete", "evidence_mismatch",
    "single_provider_boundary_invalid", "method_not_found", "invalid_transition",
    "already_active", "attestation_not_found", "provider_already_active",
    "unavailable", "commit_unknown",
  ]);

  const known = [
    ["profile_not_found", "begin"] as const,
    ["lease_conflict", "claim"] as const,
    ["callback_mismatch", "event"] as const,
    ["evidence_incomplete", "finalize"] as const,
    ["provider_already_active", "activate"] as const,
  ];
  for (const [outcome, operation] of known) {
    const functionName = operation === "begin" ? "iyzico_iframe_tenant_evidence_begin"
      : operation === "claim" ? "iyzico_iframe_tenant_evidence_claim"
        : operation === "event" ? "iyzico_iframe_tenant_evidence_record_event"
          : operation === "finalize" ? "iyzico_iframe_tenant_evidence_finalize"
            : "iyzico_iframe_tenant_evidence_activate";
    const client = new Client((text) => text.includes(functionName) ? selected(outcome, null) : []);
    const repo = operation === "begin" || operation === "activate"
      ? appRepository(new Pool([client]))
      : workflowRepository(new Pool([client]));
    const invocation = operation === "begin" ? () => (repo as IyzicoSandboxEvidenceAppRepository).begin(beginInput())
      : operation === "claim" ? () => (repo as IyzicoSandboxEvidenceWorkflowRepository).claim(claimInput())
        : operation === "event" ? () => (repo as IyzicoSandboxEvidenceWorkflowRepository).recordEvent(eventInput())
          : operation === "finalize" ? () => (repo as IyzicoSandboxEvidenceWorkflowRepository).finalize(finalizeInput())
            : () => (repo as IyzicoSandboxEvidenceAppRepository).activate(activateInput());
    await assert.rejects(invocation, errorCode(outcome));
    if (outcome === "callback_mismatch") {
      assert.equal(client.calls.some(({ text }) => text === "COMMIT"), true);
    }
  }

  const unknown = new Client((text) => text.includes("iyzico_iframe_tenant_evidence_begin")
    ? selected("private_database_detail", null)
    : []);
  await assert.rejects(() => appRepository(new Pool([unknown])).begin(beginInput()), errorCode("unavailable"));
});

test("hostile input keys, prototypes, UUIDs, digests, dates, and case pairs fail before checkout", async () => {
  const app = appRepository(new Pool([]));
  const workflow = workflowRepository(new Pool([]));
  await assert.rejects(() => app.begin({ ...beginInput(), token: "forbidden" } as never), errorCode("invalid_input"));
  await assert.rejects(() => app.begin({ ...beginInput(), runId: RUN.replace(/^6/, "A") }), errorCode("invalid_input"));
  await assert.rejects(() => app.begin({ ...beginInput(), fingerprint: EVIDENCE_DIGEST }), errorCode("invalid_input"));
  await assert.rejects(() => app.begin({ ...beginInput(), candidateEvidenceDigest: FINGERPRINT }), errorCode("invalid_input"));
  await assert.rejects(() => app.begin({ ...beginInput(), now: new Date(Number.NaN) }), errorCode("invalid_input"));
  await assert.rejects(() => app.begin({ ...beginInput(), adapterVersion: 0 }), errorCode("invalid_input"));
  await assert.rejects(() => app.begin({ ...beginInput(), expectedCredentialVersion: 1.5 }), errorCode("invalid_input"));
  await assert.rejects(() => workflow.claim({ ...claimInput(), leaseExpiresAt: new Date(NOW.getTime() + 15 * 60_000 + 1) }), errorCode("invalid_input"));
  await assert.rejects(() => workflow.recordEvent({
    ...eventInput(), caseKind: "success", eventKind: "declined", outcomeCode: "declined",
  } as never), errorCode("invalid_input"));
  await assert.rejects(() => workflow.recordEvent({ ...eventInput(), requestBody: "forbidden" } as never), errorCode("invalid_input"));
  await assert.rejects(() => app.activate({ ...activateInput(), buyerEmail: "forbidden@example.test" } as never), errorCode("invalid_input"));

  class BeginInputSubclass {}
  await assert.rejects(() => app.begin(Object.assign(new BeginInputSubclass(), beginInput()) as never), errorCode("invalid_input"));
  let getterInvoked = false;
  const getter = Object.defineProperty({ ...beginInput() }, "profileId", {
    enumerable: true,
    get() { getterInvoked = true; return PROFILE; },
  });
  await assert.rejects(() => app.begin(getter), errorCode("invalid_input"));
  assert.equal(getterInvoked, false);
  const proxy = new Proxy(beginInput(), { ownKeys() { throw new Error("trap"); } });
  await assert.rejects(() => app.begin(proxy), errorCode("invalid_input"));
});

test("corrupt rows and projections fail closed without exposing database detail", async () => {
  const cases: Row[][] = [
    [{ outcome: "created", result_payload: { ...beginPayload(), token: "forbidden" } }],
    [{ outcome: "created", result_payload: { ...beginPayload(), runId: "not-a-uuid" } }],
    [{ outcome: "created", result_payload: { ...beginPayload(), runId: "60000000-0000-4000-8000-000000000061" } }],
    [{ outcome: "created", result_payload: { ...beginPayload(), status: "private" } }],
    [{ outcome: "created", result_payload: beginPayload(), private_detail: "forbidden" }],
    [
      { outcome: "created", result_payload: beginPayload() },
      { outcome: "created", result_payload: beginPayload() },
    ],
  ];
  for (const rows of cases) {
    const client = new Client((text) => text.includes("iyzico_iframe_tenant_evidence_begin") ? rows : []);
    await assert.rejects(() => appRepository(new Pool([client])).begin(beginInput()), errorCode("unavailable"));
  }

  const spoofed = new Client((text) => text.includes("iyzico_iframe_tenant_evidence_begin")
    ? new IyzicoSandboxEvidenceRepositoryError("profile_not_found")
    : []);
  await assert.rejects(() => appRepository(new Pool([spoofed])).begin(beginInput()), errorCode("unavailable"));
});

test("constructors enforce exact role-specific options and sealed errors", () => {
  const options = {
    pool: new Pool([]),
    timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
    audit() {},
  };
  assert.throws(() => new PostgresIyzicoSandboxEvidenceAppRepository({
    ...options, role: "celebix_saas_owner",
  } as never), errorCode("unavailable"));
  assert.throws(() => new PostgresIyzicoSandboxEvidenceWorkflowRepository({
    ...options, role: "celebix_saas_app",
  } as never), errorCode("unavailable"));
  assert.throws(() => new PostgresIyzicoSandboxEvidenceAppRepository({
    ...options, role: "celebix_saas_app", extra: true,
  } as never), errorCode("unavailable"));
  assert.throws(() => new IyzicoSandboxEvidenceRepositoryError("private_database_detail" as never), TypeError);
  const error = new IyzicoSandboxEvidenceRepositoryError("invalid_input");
  assert.equal(Object.isFrozen(error), true);
  assert.deepEqual(Object.keys(error), ["code"]);
});

test("public types and repository source expose no raw provider or buyer authority fields", () => {
  const source = [
    readFileSync(new URL("./types.ts", import.meta.url), "utf8"),
    readFileSync(new URL("./repository.ts", import.meta.url), "utf8"),
  ].join("\n");
  assert.doesNotMatch(source, /\b(?:apiSecret|secretKey|sealedCredentials|token|requestBody|responseBody|headers|buyerEmail|buyerPhone|buyerAddress)\b/);
  assert.match(source, /iyzico_iframe_tenant_evidence_begin/);
  assert.match(source, /iyzico_iframe_tenant_evidence_claim/);
  assert.match(source, /iyzico_iframe_tenant_evidence_record_event/);
  assert.match(source, /iyzico_iframe_tenant_evidence_finalize/);
  assert.match(source, /iyzico_iframe_tenant_evidence_activate/);
  assert.match(source, /iyzico_iframe_tenant_evidence_preflight/);
});
