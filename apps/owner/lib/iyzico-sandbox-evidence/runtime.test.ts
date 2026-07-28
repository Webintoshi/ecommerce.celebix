import assert from "node:assert/strict";
import test from "node:test";

import {
  createIyzicoCheckoutFormAdapter,
  createIyzicoInitializeResponseSignature,
  createIyzicoRetrieveResponseSignature,
  type IyzicoCredential,
  type ProviderTransportRequest,
  type ProviderTransportResult,
} from "@celebix/payment-adapters";
import {
  IyzicoSandboxEvidenceRepositoryError,
  type IyzicoSandboxEvidenceAppRepository,
  type IyzicoSandboxEvidenceWorkflowRepository,
} from "@celebix/saas-data";
import type { TenantContext } from "@celebix/saas-contracts";

const STORE = "10000000-0000-4000-8000-000000000061";
const PRINCIPAL = "20000000-0000-4000-8000-000000000061";
const MEMBERSHIP = "30000000-0000-4000-8000-000000000061";
const PLAN = "00000000-0000-4000-8000-000000000001";
const PROFILE = "40000000-0000-4000-8000-000000000061";
const RUN = "60000000-0000-4000-8000-000000000061";
const LEASE = "61000000-0000-4000-8000-000000000061";
const ATTESTATION = "62000000-0000-4000-8000-000000000061";
const SUCCESS_ATTEMPT = "71000000-0000-4000-8000-000000000061";
const DECLINE_ATTEMPT = "72000000-0000-4000-8000-000000000061";
const TIMEOUT_ATTEMPT = "73000000-0000-4000-8000-000000000061";
const CANDIDATE_DIGEST = `sha256:${"c".repeat(64)}`;
const MATRIX_DIGEST = `sha256:${"d".repeat(64)}`;
const RAW_API_KEY = "sandbox-operator-api-key";
const RAW_SECRET = "sandbox-operator-secret-key";
const PRIVATE_NAME = "Ada Lovelace";
const PRIVATE_EMAIL = "ada.private@example.test";
const PRIVATE_PHONE = "+905551112233";
const PRIVATE_ADDRESS = "Private test address 61";
const PRIVATE_IDENTITY = "10000000146";
const PRIVATE_CARD = "5528790000000008";
const CALLBACK_BINDING = "A".repeat(43);
const START = new Date("2026-07-28T14:00:00.000Z");
const CONTROLLED_TIMEOUTS = new WeakMap<AbortSignal, Readonly<{
  controller: AbortController;
  transportObservation: { invocations: number };
}>>();

const EVENT_IDS = Object.freeze({
  successCaptured: "81000000-0000-4000-8000-000000000061",
  declined: "82000000-0000-4000-8000-000000000061",
  timeoutUnknown: "83000000-0000-4000-8000-000000000061",
  timeoutRecovered: "84000000-0000-4000-8000-000000000061",
  callbackOriginal: "85000000-0000-4000-8000-000000000061",
  callbackReplay: "86000000-0000-4000-8000-000000000061",
});

const ATTEMPT_IDS = Object.freeze({
  success: SUCCESS_ATTEMPT,
  decline: DECLINE_ATTEMPT,
  controlledTimeoutRecovery: TIMEOUT_ATTEMPT,
  callbackReplay: SUCCESS_ATTEMPT,
});

const TOKENS = Object.freeze({
  [SUCCESS_ATTEMPT]: `success_${"A".repeat(40)}`,
  [DECLINE_ATTEMPT]: `decline_${"B".repeat(40)}`,
  [TIMEOUT_ATTEMPT]: `timeout_${"C".repeat(40)}`,
});

type RuntimeModule = Readonly<{
  IyzicoSandboxEvidenceOperatorError: new (code: string) => Error & { readonly code: string };
  createIyzicoSandboxEvidenceOperator(options: unknown): Readonly<{
    run(input: unknown): Promise<Readonly<{
      kind: "attested";
      runId: string;
      attestationId: string;
      matrixDigest: string;
      replayed: boolean;
    }>>;
  }>;
}>;

async function implementation(): Promise<RuntimeModule> {
  const selected = await import("./index.ts").catch(() => null);
  assert.ok(selected, "iyzico sandbox evidence operator module must exist");
  return selected as unknown as RuntimeModule;
}

function tenant(): TenantContext {
  return {
    schemaVersion: 1,
    requestId: "request-owner-iyzico-sandbox-evidence",
    principal: { id: PRINCIPAL, issuer: "https://identity.example.test/oidc", subject: "operator" },
    store: { id: STORE, slug: "owner-iyzico-evidence", status: "active" },
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
  };
}

function input() {
  return Object.freeze({
    tenantContext: tenant(),
    profileId: PROFILE,
    runId: RUN,
    leaseId: LEASE,
    attestationId: ATTESTATION,
    workerId: "iyzico-owner-evidence-1",
    eventIds: EVENT_IDS,
    attemptIds: ATTEMPT_IDS,
  });
}

function credential(): IyzicoCredential {
  return { apiKey: RAW_API_KEY, secretKey: RAW_SECRET };
}

function response(value: unknown, status = 200): ProviderTransportResult {
  return Object.freeze({
    kind: "response" as const,
    status,
    contentType: "application/json" as const,
    body: new TextEncoder().encode(JSON.stringify(value)),
  });
}

function requestJson(request: ProviderTransportRequest): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(request.body)) as Record<string, unknown>;
}

function providerTransport(
  calls: ProviderTransportRequest[],
  options: Readonly<{
    tamperSuccessSignature?: boolean;
    varyingInitializeTokens?: boolean;
    timeoutTransportObservations?: Array<Readonly<{
      startedAborted: boolean;
      endedAborted: boolean;
    }>>;
  }> = {},
) {
  const issued = new Map<string, Readonly<{ attemptId: string; orderReference: string }>>();
  let initializeCount = 0;
  return Object.freeze({
    request: Object.freeze(async (request: ProviderTransportRequest): Promise<ProviderTransportResult> => {
      const payload = requestJson(request);
      calls.push(Object.freeze({ ...request, body: request.body.slice() }));
      const attemptId = payload.conversationId as keyof typeof TOKENS;
      if (!TOKENS[attemptId]) return response({ status: "failure" }, 400);
      const requestSignal = request.signal;
      const controlledTimeout = requestSignal === undefined
        ? undefined
        : CONTROLLED_TIMEOUTS.get(requestSignal);
      if (controlledTimeout && attemptId === TIMEOUT_ATTEMPT) {
        const startedAborted = requestSignal!.aborted;
        controlledTimeout.transportObservation.invocations += 1;
        controlledTimeout.controller.abort(new Error("injected_transport_timeout"));
        options.timeoutTransportObservations?.push(Object.freeze({
          startedAborted,
          endedAborted: requestSignal!.aborted,
        }));
        throw new Error("injected_transport_timeout");
      }
      if (request.url.includes("/initialize/")) {
        initializeCount += 1;
        const providerReference = options.varyingInitializeTokens
          ? varyingInitializeToken(initializeCount)
          : TOKENS[attemptId];
        issued.set(providerReference, Object.freeze({
          attemptId,
          orderReference: payload.basketId as string,
        }));
        return response({
          status: "success",
          conversationId: attemptId,
          token: providerReference,
          paymentPageUrl: `https://sandbox-cpp.iyzipay.com/?token=${providerReference}&lang=tr`,
          signature: createIyzicoInitializeResponseSignature({
            credential: { apiKey: RAW_API_KEY, secretKey: RAW_SECRET },
            conversationId: attemptId,
            token: providerReference,
          }),
        });
      }
      const providerReference = payload.token as string;
      const authority = issued.get(providerReference);
      if (!authority || authority.attemptId !== attemptId) {
        return response({ status: "failure" }, 400);
      }
      const fraudStatus = attemptId === DECLINE_ATTEMPT ? -1 as const : 1 as const;
      const paymentId = `payment-${attemptId.slice(0, 8)}`;
      const orderReference = authority.orderReference;
      const signed = {
        credential: { apiKey: RAW_API_KEY, secretKey: RAW_SECRET },
        paymentStatus: "SUCCESS",
        paymentId,
        currency: "TRY",
        basketId: orderReference,
        conversationId: attemptId,
        paidPrice: "10.00",
        price: "10.00",
        token: providerReference,
      };
      const signature = options.tamperSuccessSignature && attemptId === SUCCESS_ATTEMPT
        ? "0".repeat(64)
        : createIyzicoRetrieveResponseSignature(signed);
      return response({
        status: "success",
        basketId: orderReference,
        conversationId: attemptId,
        currency: "TRY",
        fraudStatus,
        paidPrice: "10.00",
        paymentId,
        paymentStatus: "SUCCESS",
        price: "10.00",
        signature,
        token: providerReference,
      });
    }),
  });
}

function varyingInitializeToken(sequence: number): string {
  return `checkout_${String(sequence).padStart(2, "0")}_${"X".repeat(36)}`;
}

type RecordedCall = Readonly<{ operation: string; input: Readonly<Record<string, unknown>> }>;

function repositories(
  calls: RecordedCall[],
  mode: "created" | "replayed" = "created",
  lifecycle: string[] = [],
): Readonly<{
  app: IyzicoSandboxEvidenceAppRepository;
  workflow: IyzicoSandboxEvidenceWorkflowRepository;
}> {
  const replayed = mode === "replayed";
  return {
    app: {
      async begin(selected) {
        lifecycle.push("begin");
        calls.push({ operation: "begin", input: selected as unknown as Readonly<Record<string, unknown>> });
        return Object.freeze({
          outcome: replayed ? "operation_replayed" as const : "created" as const,
          runId: selected.runId,
          status: "pending" as const,
          replayed,
        });
      },
      async activate() { throw new Error("activation_not_in_operator_core"); },
      async preflight() { return true; },
    },
    workflow: {
      async claim(selected) {
        lifecycle.push("claim");
        calls.push({ operation: "claim", input: selected as unknown as Readonly<Record<string, unknown>> });
        return Object.freeze({
          outcome: replayed ? "operation_replayed" as const : "claimed" as const,
          runId: selected.runId,
          leaseId: selected.leaseId,
          replayed,
        });
      },
      async recordEvent(selected) {
        lifecycle.push("event");
        calls.push({ operation: "event", input: selected as unknown as Readonly<Record<string, unknown>> });
        return Object.freeze({
          outcome: replayed ? "operation_replayed" as const : "recorded" as const,
          eventId: selected.eventId,
          replayed,
        });
      },
      async finalize(selected: Parameters<IyzicoSandboxEvidenceWorkflowRepository["finalize"]>[0]) {
        lifecycle.push("finalize");
        calls.push({ operation: "finalize", input: selected as unknown as Readonly<Record<string, unknown>> });
        return Object.freeze({
          outcome: replayed ? "operation_replayed" as const : "attested" as const,
          attestationId: selected.attestationId,
          matrixDigest: MATRIX_DIGEST,
          replayed,
        });
      },
      async preflight() { return true; },
    },
  };
}

function operatorFixture(callbackBodies: Uint8Array[] = []) {
  return Object.freeze({
    async initialization(input: Readonly<{ caseKind: string; attemptId: string }>) {
      return Object.freeze({
        orderReference: `order-${input.attemptId.slice(0, 8)}`,
        amountMinor: 1_000,
        currency: "TRY",
        callbackUrl: `https://checkout.example.test/api/payments/iyzico_iframe/callback/${CALLBACK_BINDING}`,
        successUrl: "https://checkout.example.test/odeme/hizli/sonuc?durum=basarili",
        failureUrl: "https://checkout.example.test/odeme/hizli/sonuc?durum=basarisiz",
        customer: Object.freeze({
          name: PRIVATE_NAME,
          email: PRIVATE_EMAIL,
          phone: PRIVATE_PHONE,
          ipAddress: "203.0.113.61",
          address: PRIVATE_ADDRESS,
          identityNumber: PRIVATE_IDENTITY,
          city: "Istanbul",
          country: "Turkey",
        }),
        basket: Object.freeze([Object.freeze({
          reference: `item-${input.caseKind}`,
          name: "Operator sandbox item",
          quantity: 1,
          unitAmountMinor: 1_000,
          itemType: "VIRTUAL" as const,
        })]),
      });
    },
    async callback(input: Readonly<{
      caseKind: string;
      initialization: Readonly<{ providerReference: string | null }>;
    }>) {
      assert.equal(PRIVATE_CARD.length, 16);
      assert.notEqual(input.initialization.providerReference, null);
      const raw = new TextEncoder().encode(`token=${input.initialization.providerReference}`);
      callbackBodies.push(raw);
      return Object.freeze({
        method: "POST" as const,
        headers: Object.freeze({
          "content-type": "application/x-www-form-urlencoded",
          "content-length": String(raw.byteLength),
        }),
        body: raw,
      });
    },
    async controlledTimeout() {
      const controller = new AbortController();
      const transportObservation = { invocations: 0 };
      CONTROLLED_TIMEOUTS.set(controller.signal, Object.freeze({ controller, transportObservation }));
      return Object.freeze({
        kind: "controlled_timeout_ready" as const,
        signal: controller.signal,
        transportObservation,
      });
    },
  });
}

function runtimeOptions(overrides: Record<string, unknown> = {}) {
  const repositoryCalls: RecordedCall[] = [];
  const transportCalls: ProviderTransportRequest[] = [];
  const lifecycle: string[] = [];
  const callbackBodies: Uint8Array[] = [];
  const timeoutTransportObservations: Array<Readonly<{
    startedAborted: boolean;
    endedAborted: boolean;
  }>> = [];
  const access = { candidate: 0, profile: 0, adapter: 0, credential: 0 };
  const selectedRepositories = repositories(repositoryCalls, "created", lifecycle);
  let openedCredential: IyzicoCredential | undefined;
  let tick = 0;
  const options = {
    appRepository: selectedRepositories.app,
    workflowRepository: selectedRepositories.workflow,
    async candidateResolver() {
      lifecycle.push("candidate");
      access.candidate += 1;
      return Object.freeze({ kind: "ready", adapterVersion: 1, evidenceDigest: CANDIDATE_DIGEST });
    },
    async profileResolver() {
      lifecycle.push("profile");
      access.profile += 1;
      return Object.freeze({
        kind: "ready",
        profileId: PROFILE,
        profileVersion: 3,
        credentialVersion: 2,
        credentialAuthority: Object.freeze({ authority: "opaque-provider-credential-61" }),
      });
    },
    async adapterResolver() {
      lifecycle.push("adapter");
      access.adapter += 1;
      return createIyzicoCheckoutFormAdapter(providerTransport(transportCalls, {
        timeoutTransportObservations,
      }), {
        randomKey: () => "abcdefghijklmnop",
      });
    },
    async credentialResolver() {
      lifecycle.push("credential");
      access.credential += 1;
      openedCredential = credential();
      return openedCredential;
    },
    operator: operatorFixture(callbackBodies),
    now() {
      const selected = new Date(START.getTime() + tick * 1_000);
      tick += 1;
      return selected;
    },
    leaseDurationMs: 10 * 60_000,
    ...overrides,
  };
  return {
    options,
    repositoryCalls,
    transportCalls,
    lifecycle,
    callbackBodies,
    timeoutTransportObservations,
    access,
    openedCredential: () => openedCredential,
  };
}

function errorCode(code: string) {
  return (error: unknown) => typeof error === "object" && error !== null
    && Object.getOwnPropertyDescriptor(error, "code")?.value === code;
}

test("core performs the exact six-event native adapter matrix and persists only digests", async () => {
  const { createIyzicoSandboxEvidenceOperator } = await implementation();
  const fixture = runtimeOptions();
  const runtime = createIyzicoSandboxEvidenceOperator(fixture.options);

  assert.deepEqual(await runtime.run(input()), {
    kind: "attested",
    runId: RUN,
    attestationId: ATTESTATION,
    matrixDigest: MATRIX_DIGEST,
    replayed: false,
  });

  assert.deepEqual(fixture.repositoryCalls.map(({ operation }) => operation), [
    "begin", "claim", "event", "event", "event", "event", "event", "event", "finalize",
  ]);
  const events = fixture.repositoryCalls
    .filter(({ operation }) => operation === "event")
    .map(({ input: selected }) => selected);
  assert.deepEqual(events.map(({ caseKind, eventKind, outcomeCode }) => [
    caseKind, eventKind, outcomeCode,
  ]), [
    ["success", "success_captured", "captured"],
    ["decline", "declined", "declined"],
    ["controlled_timeout_recovery", "timeout_unknown", "unknown"],
    ["controlled_timeout_recovery", "timeout_recovered", "recovered"],
    ["callback_replay", "callback_original", "accepted"],
    ["callback_replay", "callback_replay", "replayed"],
  ]);
  for (const selected of events) {
    assert.deepEqual(Object.keys(selected).sort(), [
      "attemptId", "caseKind", "eventId", "eventKind", "leaseId", "observationDigest",
      "observedAt", "outcomeCode", "runId", "workerId",
    ]);
    assert.match(selected.observationDigest as string, /^[a-f0-9]{64}$/);
  }
  assert.equal(events[4]?.observationDigest, events[5]?.observationDigest);
  assert.equal(new Set([
    events[0]?.observationDigest,
    events[1]?.observationDigest,
    events[2]?.observationDigest,
    events[3]?.observationDigest,
    events[4]?.observationDigest,
  ]).size, 5);
  assert.equal(events[0]?.attemptId, events[4]?.attemptId);
  assert.equal(events[4]?.attemptId, events[5]?.attemptId);
  assert.equal(new Set([events[0]?.attemptId, events[1]?.attemptId, events[2]?.attemptId]).size, 3);
  const durable = JSON.stringify(fixture.repositoryCalls);
  for (const privateValue of [
    RAW_API_KEY, RAW_SECRET, PRIVATE_NAME, PRIVATE_EMAIL, PRIVATE_PHONE, PRIVATE_ADDRESS,
    PRIVATE_IDENTITY, PRIVATE_CARD, ...Object.values(TOKENS),
  ]) assert.equal(durable.includes(privateValue), false, privateValue);
  assert.equal(fixture.transportCalls.length, 9);
  assert.equal(fixture.access.adapter, 1);
  assert.equal(fixture.access.credential, 1);
  assert.equal(fixture.openedCredential()?.apiKey, "");
  assert.equal(fixture.openedCredential()?.secretKey, "");
  assert.equal(fixture.callbackBodies.every((body) => body.every((byte) => byte === 0)), true);
  assert.deepEqual(fixture.timeoutTransportObservations, [{
    startedAborted: false,
    endedAborted: true,
  }]);
  assert.equal(fixture.lifecycle.indexOf("claim") < fixture.lifecycle.indexOf("credential"), true);
  assert.equal(fixture.lifecycle.indexOf("credential") < fixture.lifecycle.indexOf("adapter"), true);
  assert.equal(fixture.lifecycle.indexOf("adapter") < fixture.lifecycle.indexOf("event"), true);
});

test("missing or stale candidate profile and credential authority perform zero evidence adapter transport and key access", async () => {
  const { createIyzicoSandboxEvidenceOperator } = await implementation();
  const cases = [
    { dependency: "candidate", reason: "candidate_missing" },
    { dependency: "candidate", reason: "candidate_stale" },
    { dependency: "profile", reason: "profile_missing" },
    { dependency: "profile", reason: "profile_stale" },
    { dependency: "profile", reason: "credential_missing" },
    { dependency: "profile", reason: "credential_stale" },
  ] as const;
  for (const selected of cases) {
    const fixture = runtimeOptions({
      ...(selected.dependency === "candidate" ? {
        async candidateResolver() {
          fixture.access.candidate += 1;
          return Object.freeze({ kind: "unavailable", reason: selected.reason });
        },
      } : {
        async profileResolver() {
          fixture.access.profile += 1;
          return Object.freeze({ kind: "unavailable", reason: selected.reason });
        },
      }),
    });
    const runtime = createIyzicoSandboxEvidenceOperator(fixture.options);
    await assert.rejects(() => runtime.run(input()), errorCode("prerequisite_unavailable"));
    assert.deepEqual(fixture.repositoryCalls, []);
    assert.deepEqual(fixture.transportCalls, []);
    assert.equal(fixture.access.adapter, 0);
    assert.equal(fixture.access.credential, 0);
  }
});

test("a tampered native provider result can never become captured and still wipes the opened credential", async () => {
  const { createIyzicoSandboxEvidenceOperator } = await implementation();
  let parsedCredential: IyzicoCredential | undefined;
  const fixture = runtimeOptions({
    async adapterResolver() {
      fixture.access.adapter += 1;
      const native = createIyzicoCheckoutFormAdapter(providerTransport(fixture.transportCalls, {
        tamperSuccessSignature: true,
      }), { randomKey: () => "abcdefghijklmnop" });
      return Object.freeze({
        ...native,
        async initialize(selected: Parameters<typeof native.initialize>[0]) {
          parsedCredential = selected.credential;
          return native.initialize(selected);
        },
      });
    },
  });
  const runtime = createIyzicoSandboxEvidenceOperator(fixture.options);

  await assert.rejects(() => runtime.run(input()), errorCode("scenario_failed"));
  assert.equal(fixture.repositoryCalls.some(({ operation, input: selected }) =>
    operation === "event" && selected.outcomeCode === "captured"), false);
  assert.equal(fixture.repositoryCalls.some(({ operation }) => operation === "finalize"), false);
  assert.equal(fixture.openedCredential()?.apiKey, "");
  assert.equal(fixture.openedCredential()?.secretKey, "");
  assert.deepEqual(parsedCredential, { apiKey: "", secretKey: "" });
  assert.equal(fixture.callbackBodies.every((body) => body.every((byte) => byte === 0)), true);
});

test("credential authority rejects proxy frozen and non-writable plaintext before adapter or transport", async () => {
  const { createIyzicoSandboxEvidenceOperator } = await implementation();
  let proxyTraps = 0;
  const proxiedCredential = new Proxy(credential(), {
    ownKeys() { proxyTraps += 1; return ["apiKey", "secretKey"]; },
    set() { proxyTraps += 1; return false; },
  });
  const nonWritable = Object.defineProperties({}, {
    apiKey: { enumerable: true, value: RAW_API_KEY, writable: true },
    secretKey: { enumerable: true, value: RAW_SECRET, writable: false },
  });
  for (const opened of [proxiedCredential, Object.freeze(credential()), nonWritable]) {
    const fixture = runtimeOptions({
      async credentialResolver() {
        fixture.access.credential += 1;
        return opened;
      },
    });
    await assert.rejects(
      () => createIyzicoSandboxEvidenceOperator(fixture.options).run(input()),
      errorCode("unavailable"),
    );
    assert.equal(fixture.access.adapter, 0);
    assert.deepEqual(fixture.transportCalls, []);
  }
  assert.equal(proxyTraps, 0);
});

test("accepted raw credential is wiped when later adapter resolution fails", async () => {
  const { createIyzicoSandboxEvidenceOperator } = await implementation();
  let opened: IyzicoCredential | undefined;
  const fixture = runtimeOptions({
    async credentialResolver() {
      fixture.access.credential += 1;
      opened = credential();
      return opened;
    },
    async adapterResolver() {
      fixture.access.adapter += 1;
      throw new Error("adapter_resolution_failed");
    },
  });
  await assert.rejects(
    () => createIyzicoSandboxEvidenceOperator(fixture.options).run(input()),
    errorCode("unavailable"),
  );
  assert.deepEqual(opened, { apiKey: "", secretKey: "" });
  assert.equal(fixture.access.credential, 1);
  assert.equal(fixture.access.adapter, 1);
  assert.deepEqual(fixture.transportCalls, []);
});

test("callback replay reuses the success checkout without a second provider initialize", async () => {
  const { createIyzicoSandboxEvidenceOperator } = await implementation();
  const successCallbackBodies: Uint8Array[] = [];
  let parsedCredential: IyzicoCredential | undefined;
  const fixture = runtimeOptions({
    async adapterResolver() {
      fixture.access.adapter += 1;
      const native = createIyzicoCheckoutFormAdapter(providerTransport(fixture.transportCalls, {
        varyingInitializeTokens: true,
      }), { randomKey: () => "abcdefghijklmnop" });
      return Object.freeze({
        ...native,
        async initialize(selected: Parameters<typeof native.initialize>[0]) {
          parsedCredential = selected.credential;
          return native.initialize(selected);
        },
        async verifyCallback(selected: Parameters<typeof native.verifyCallback>[0]) {
          if (selected.expected.attemptId === SUCCESS_ATTEMPT) {
            successCallbackBodies.push(selected.body);
          }
          return native.verifyCallback(selected);
        },
      });
    },
  });

  const result = await createIyzicoSandboxEvidenceOperator(fixture.options).run(input());
  assert.equal(result.kind, "attested");
  const initializationAttempts = fixture.transportCalls
    .filter(({ url }) => url.includes("/initialize/"))
    .map((request) => requestJson(request).conversationId);
  assert.deepEqual(initializationAttempts, [SUCCESS_ATTEMPT, DECLINE_ATTEMPT, TIMEOUT_ATTEMPT]);
  assert.equal(initializationAttempts.filter((attemptId) => attemptId === SUCCESS_ATTEMPT).length, 1);
  assert.equal(successCallbackBodies.length, 3);
  assert.notEqual(successCallbackBodies[0], successCallbackBodies[1]);
  assert.equal(successCallbackBodies[1], successCallbackBodies[2]);
  assert.deepEqual(parsedCredential, { apiKey: "", secretKey: "" });
});

test("a callback from a second provider checkout cannot satisfy the replay evidence", async () => {
  const { createIyzicoSandboxEvidenceOperator } = await implementation();
  const base = operatorFixture();
  const foreignBodies: Uint8Array[] = [];
  const fixture = runtimeOptions({
    async adapterResolver() {
      fixture.access.adapter += 1;
      return createIyzicoCheckoutFormAdapter(providerTransport(fixture.transportCalls, {
        varyingInitializeTokens: true,
      }), { randomKey: () => "abcdefghijklmnop" });
    },
    operator: Object.freeze({
      initialization: base.initialization,
      controlledTimeout: base.controlledTimeout,
      async callback(selected: Readonly<{ caseKind: string }>) {
        if (selected.caseKind !== "callback_replay") return base.callback(selected as never);
        const raw = new TextEncoder().encode(`token=${varyingInitializeToken(4)}`);
        foreignBodies.push(raw);
        return Object.freeze({
          method: "POST" as const,
          headers: Object.freeze({
            "content-type": "application/x-www-form-urlencoded",
            "content-length": String(raw.byteLength),
          }),
          body: raw,
        });
      },
    }),
  });

  await assert.rejects(
    () => createIyzicoSandboxEvidenceOperator(fixture.options).run(input()),
    errorCode("scenario_failed"),
  );
  assert.equal(fixture.repositoryCalls.some(({ operation }) => operation === "finalize"), false);
  assert.equal(foreignBodies.every((body) => body.every((byte) => byte === 0)), true);
});

test("a malformed raw callback witness is wiped before the scenario fails closed", async () => {
  const { createIyzicoSandboxEvidenceOperator } = await implementation();
  const base = operatorFixture();
  const malformedBody = new TextEncoder().encode("token=private-malformed-callback-witness");
  const fixture = runtimeOptions({
    operator: Object.freeze({
      initialization: base.initialization,
      controlledTimeout: base.controlledTimeout,
      async callback() {
        return Object.freeze({
          method: "GET",
          headers: Object.freeze({ "content-type": "text/plain" }),
          body: malformedBody,
        });
      },
    }),
  });

  await assert.rejects(
    () => createIyzicoSandboxEvidenceOperator(fixture.options).run(input()),
    errorCode("scenario_failed"),
  );
  assert.equal(malformedBody.every((byte) => byte === 0), true);
  assert.equal(fixture.repositoryCalls.some(({ operation }) => operation === "event"), false);
});

test("timeout evidence requires an explicit injected controlled fault witness", async () => {
  const { createIyzicoSandboxEvidenceOperator } = await implementation();
  const base = operatorFixture();
  const fixture = runtimeOptions({
    operator: Object.freeze({
      initialization: base.initialization,
      callback: base.callback,
      async controlledTimeout() {
        return Object.freeze({
          kind: "not_a_controlled_witness",
          signal: new AbortController().signal,
          transportObservation: { invocations: 0 },
        });
      },
    }),
  });
  const runtime = createIyzicoSandboxEvidenceOperator(fixture.options);

  await assert.rejects(() => runtime.run(input()), errorCode("scenario_failed"));
  assert.equal(fixture.repositoryCalls.some(({ operation, input: selected }) =>
    operation === "event" && selected.eventKind === "timeout_unknown"), false);
  assert.equal(fixture.repositoryCalls.some(({ operation }) => operation === "finalize"), false);
});

test("timeout evidence rejects pre-aborted never-aborted and zero-transport witnesses", async () => {
  const { createIyzicoSandboxEvidenceOperator } = await implementation();
  for (const mode of ["pre_aborted", "never_aborted", "zero_transport"] as const) {
    let controller: AbortController | undefined;
    const transportObservation = { invocations: 0 };
    const base = operatorFixture();
    const fixture = runtimeOptions({
      operator: Object.freeze({
        initialization: base.initialization,
        callback: base.callback,
        async controlledTimeout() {
          controller = new AbortController();
          if (mode === "pre_aborted") controller.abort(new Error("too_early"));
          return Object.freeze({
            kind: "controlled_timeout_ready" as const,
            signal: controller.signal,
            transportObservation,
          });
        },
      }),
      async adapterResolver() {
        fixture.access.adapter += 1;
        const native = createIyzicoCheckoutFormAdapter(providerTransport(fixture.transportCalls), {
          randomKey: () => "abcdefghijklmnop",
        });
        if (mode === "pre_aborted") return native;
        return Object.freeze({
          ...native,
          async verifyCallback(selected: Parameters<typeof native.verifyCallback>[0]) {
            if (selected.expected.attemptId !== TIMEOUT_ATTEMPT) {
              return native.verifyCallback(selected);
            }
            if (mode === "zero_transport") controller?.abort(new Error("adapter_only_abort"));
            return Object.freeze({
              eventKey: "iyzico:controlled-timeout:retry",
              status: "retry" as const,
              providerReference: selected.expected.providerReference,
              paidAmountMinor: selected.expected.amountMinor,
              currency: "TRY" as const,
              safeCode: "temporary_failure",
            });
          },
        });
      },
    });

    await assert.rejects(
      () => createIyzicoSandboxEvidenceOperator(fixture.options).run(input()),
      errorCode("scenario_failed"),
    );
    assert.equal(fixture.repositoryCalls.some(({ operation, input: selected }) =>
      operation === "event" && selected.eventKind === "timeout_unknown"), false);
    assert.equal(fixture.repositoryCalls.some(({ operation }) => operation === "finalize"), false);
  }
});

test("repository operation replays remain idempotent while terminal and concurrent runs fail closed", async () => {
  const { createIyzicoSandboxEvidenceOperator } = await implementation();
  const replayCalls: RecordedCall[] = [];
  const replayRepositories = repositories(replayCalls, "replayed");
  const replayFixture = runtimeOptions({
    appRepository: replayRepositories.app,
    workflowRepository: replayRepositories.workflow,
  });
  const replayed = await createIyzicoSandboxEvidenceOperator(replayFixture.options).run(input());
  assert.equal(replayed.replayed, true);
  assert.equal(replayCalls.filter(({ operation }) => operation === "event").length, 6);

  for (const repositoryError of [
    ["commit_unknown", "commit_unknown"],
    ["lease_conflict", "concurrent_run"],
  ] as const) {
    let claims = 0;
    const fixture = runtimeOptions({
      workflowRepository: {
        ...repositories([]).workflow,
        async claim() {
          claims += 1;
          throw new IyzicoSandboxEvidenceRepositoryError(repositoryError[0]);
        },
      },
    });
    await assert.rejects(
      () => createIyzicoSandboxEvidenceOperator(fixture.options).run(input()),
      errorCode(repositoryError[1]),
    );
    assert.equal(fixture.access.adapter, 0);
    assert.equal(fixture.access.credential, 0);
    assert.equal(claims, repositoryError[0] === "commit_unknown" ? 2 : 1);
  }
});

test("terminal begin replay reconciles through exact finalize without lease or private authority", async () => {
  const { createIyzicoSandboxEvidenceOperator } = await implementation();
  const finalizeInputs: unknown[] = [];
  const fixture = runtimeOptions({
    appRepository: {
      ...repositories([]).app,
      async begin(selected: Parameters<IyzicoSandboxEvidenceAppRepository["begin"]>[0]) {
        return Object.freeze({
          outcome: "operation_replayed" as const,
          runId: selected.runId,
          status: "attested" as const,
          replayed: true,
        });
      },
    },
    workflowRepository: {
      ...repositories([]).workflow,
      async finalize(selected: Parameters<IyzicoSandboxEvidenceWorkflowRepository["finalize"]>[0]) {
        finalizeInputs.push(selected);
        return Object.freeze({
          outcome: "operation_replayed" as const,
          attestationId: selected.attestationId,
          matrixDigest: MATRIX_DIGEST,
          replayed: true,
        });
      },
    },
  });
  const runtime = createIyzicoSandboxEvidenceOperator(fixture.options);
  assert.deepEqual(await runtime.run(input()), {
    kind: "attested",
    runId: RUN,
    attestationId: ATTESTATION,
    matrixDigest: MATRIX_DIGEST,
    replayed: true,
  });
  assert.equal(finalizeInputs.length, 1);
  assert.equal(fixture.access.adapter, 0);
  assert.equal(fixture.access.credential, 0);

  const hostile = new Proxy(input(), { ownKeys() { throw new Error("private_input_trap"); } });
  await assert.rejects(() => runtime.run(hostile), errorCode("invalid_input"));
});

test("one runtime commit-unknown retry reuses the exact frozen repository input", async () => {
  const { createIyzicoSandboxEvidenceOperator } = await implementation();
  const beginInputs: unknown[] = [];
  const finalizeInputs: unknown[] = [];
  const fixture = runtimeOptions({
    appRepository: {
      ...repositories([]).app,
      async begin(selected: Parameters<IyzicoSandboxEvidenceAppRepository["begin"]>[0]) {
        beginInputs.push(selected);
        if (beginInputs.length === 1) {
          throw new IyzicoSandboxEvidenceRepositoryError("commit_unknown");
        }
        return Object.freeze({
          outcome: "operation_replayed" as const,
          runId: selected.runId,
          status: "pending" as const,
          replayed: true,
        });
      },
    },
    workflowRepository: {
      ...repositories([]).workflow,
      async finalize(selected: Parameters<IyzicoSandboxEvidenceWorkflowRepository["finalize"]>[0]) {
        finalizeInputs.push(selected);
        if (finalizeInputs.length === 1) {
          throw new IyzicoSandboxEvidenceRepositoryError("commit_unknown");
        }
        return Object.freeze({
          outcome: "operation_replayed" as const,
          attestationId: selected.attestationId,
          matrixDigest: MATRIX_DIGEST,
          replayed: true,
        });
      },
    },
  });
  const result = await createIyzicoSandboxEvidenceOperator(fixture.options).run(input());
  assert.equal(result.kind, "attested");
  assert.equal(beginInputs.length, 2);
  assert.equal(beginInputs[0], beginInputs[1]);
  assert.equal(finalizeInputs.length, 2);
  assert.equal(finalizeInputs[0], finalizeInputs[1]);
});

test("nested dependency proxies and accessors are rejected without invoking traps", async () => {
  const { createIyzicoSandboxEvidenceOperator } = await implementation();
  let traps = 0;
  const fixture = runtimeOptions();
  const repositoryProxy = new Proxy(fixture.options.appRepository, {
    get() { traps += 1; throw new Error("repository_get_trap"); },
  });
  const operatorProxy = new Proxy(fixture.options.operator, {
    get() { traps += 1; throw new Error("operator_get_trap"); },
  });
  const accessorRepository = Object.defineProperty({}, "begin", {
    enumerable: true,
    get() { traps += 1; return async () => undefined; },
  });
  for (const overrides of [
    { appRepository: repositoryProxy },
    { operator: operatorProxy },
    { appRepository: accessorRepository },
  ]) {
    assert.throws(
      () => createIyzicoSandboxEvidenceOperator({ ...fixture.options, ...overrides } as never),
      errorCode("unavailable"),
    );
  }
  assert.equal(traps, 0);

  const credentialAuthority = Object.defineProperty({}, "authority", {
    enumerable: true,
    get() { traps += 1; return "private"; },
  });
  const authorityFixture = runtimeOptions({
    async profileResolver() {
      return Object.freeze({
        kind: "ready",
        profileId: PROFILE,
        profileVersion: 3,
        credentialVersion: 2,
        credentialAuthority,
      });
    },
  });
  await assert.rejects(
    () => createIyzicoSandboxEvidenceOperator(authorityFixture.options).run(input()),
    errorCode("unavailable"),
  );
  assert.deepEqual(authorityFixture.repositoryCalls, []);
  assert.equal(traps, 0);
});
