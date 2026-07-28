import { createHash } from "node:crypto";
import { types as nodeTypes } from "node:util";

import {
  parseIyzicoCredential,
  wipeIyzicoCredential,
  type HostedPaymentAdapter,
  type HostedPaymentInitialization,
  type HostedPaymentStatus,
  type IyzicoCredential,
  type VerifiedProviderCallback,
} from "@celebix/payment-adapters";
import {
  IyzicoSandboxEvidenceRepositoryError,
  type RecordIyzicoSandboxEvidenceEventInput,
} from "@celebix/saas-data";

import {
  isTrustedOperatorError,
  trustedOperatorError,
  type IyzicoSandboxEvidenceOperatorErrorCode,
} from "./errors.ts";
import type {
  IyzicoSandboxEvidenceCandidateResolution,
  IyzicoSandboxEvidenceCaseKind,
  IyzicoSandboxEvidenceInitializationFixture,
  IyzicoSandboxEvidenceOperator,
  IyzicoSandboxEvidenceOperatorInput,
  IyzicoSandboxEvidenceOperatorOptions,
  IyzicoSandboxEvidenceOperatorResult,
  IyzicoSandboxEvidenceProfileResolution,
  IyzicoSandboxEvidenceRawCallback,
} from "./types.ts";

type SelectedOptions = Readonly<IyzicoSandboxEvidenceOperatorOptions>;
type SelectedInput = Readonly<{
  tenantContext: IyzicoSandboxEvidenceOperatorInput["tenantContext"];
  profileId: string;
  runId: string;
  leaseId: string;
  attestationId: string;
  workerId: string;
  eventIds: IyzicoSandboxEvidenceOperatorInput["eventIds"];
  attemptIds: IyzicoSandboxEvidenceOperatorInput["attemptIds"];
}>;

type SafeCallback = Readonly<{
  eventKey: string;
  status: "succeeded" | "failed" | "pending" | "retry";
  providerReference: string;
  paidAmountMinor: number;
  currency: "TRY";
  safeCode: string;
}>;

type SafeQuery = Readonly<{
  kind: "succeeded";
  providerReference: string;
  paidAmountMinor: number;
  currency: "TRY";
}>;

type InitializedCase = Readonly<{
  attemptId: string;
  fixture: IyzicoSandboxEvidenceInitializationFixture;
  initialization: Extract<HostedPaymentInitialization, Readonly<{ kind: "iframe" }>>;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const WORKER = /^[A-Za-z0-9._:-]{1,128}$/;
const SAFE_CODE = /^[a-z][a-z0-9_]{0,63}$/;
const UINT8_ARRAY_FILL = Uint8Array.prototype.fill;
const OPTION_KEYS = Object.freeze([
  "appRepository",
  "workflowRepository",
  "candidateResolver",
  "profileResolver",
  "adapterResolver",
  "credentialResolver",
  "operator",
  "now",
  "leaseDurationMs",
]);
const INPUT_KEYS = Object.freeze([
  "tenantContext",
  "profileId",
  "runId",
  "leaseId",
  "attestationId",
  "workerId",
  "eventIds",
  "attemptIds",
]);
const EVENT_ID_KEYS = Object.freeze([
  "successCaptured",
  "declined",
  "timeoutUnknown",
  "timeoutRecovered",
  "callbackOriginal",
  "callbackReplay",
]);
const ATTEMPT_ID_KEYS = Object.freeze([
  "success",
  "decline",
  "controlledTimeoutRecovery",
  "callbackReplay",
]);
const FIXTURE_KEYS = Object.freeze([
  "orderReference",
  "amountMinor",
  "currency",
  "callbackUrl",
  "successUrl",
  "failureUrl",
  "customer",
  "basket",
]);

function fail(code: IyzicoSandboxEvidenceOperatorErrorCode): never {
  throw trustedOperatorError(code);
}

function exact(
  value: unknown,
  keys: readonly string[],
  code: IyzicoSandboxEvidenceOperatorErrorCode,
): Readonly<Record<string, unknown>> {
  try {
    if (
      typeof value !== "object"
      || value === null
      || Array.isArray(value)
      || nodeTypes.isProxy(value)
    ) fail(code);
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) fail(code);
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<PropertyKey, PropertyDescriptor>;
    const actual = Reflect.ownKeys(descriptors);
    if (
      actual.length !== keys.length
      || actual.some((key) => typeof key !== "string" || !keys.includes(key))
    ) fail(code);
    const selected: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) fail(code);
      selected[key] = descriptor.value;
    }
    return Object.freeze(selected);
  } catch (error) {
    if (isTrustedOperatorError(error)) throw error;
    return fail(code);
  }
}

function uuid(value: unknown, code: IyzicoSandboxEvidenceOperatorErrorCode): string {
  if (typeof value !== "string" || !UUID.test(value)) fail(code);
  return value;
}

function positiveInteger(value: unknown, code: IyzicoSandboxEvidenceOperatorErrorCode): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) fail(code);
  return value as number;
}

function date(value: unknown, code: IyzicoSandboxEvidenceOperatorErrorCode): Date {
  try {
    if (
      typeof value !== "object"
      || value === null
      || nodeTypes.isProxy(value)
      || Object.getPrototypeOf(value) !== Date.prototype
      || Reflect.ownKeys(value).length !== 0
    ) fail(code);
    const timestamp = Date.prototype.getTime.call(value);
    if (!Number.isFinite(timestamp)) fail(code);
    return Object.freeze(new Date(timestamp));
  } catch (error) {
    if (isTrustedOperatorError(error)) throw error;
    return fail(code);
  }
}

function now(options: SelectedOptions): Date {
  try {
    return date(options.now(), "unavailable");
  } catch (error) {
    if (isTrustedOperatorError(error)) throw error;
    return fail("unavailable");
  }
}

function wipe(value: unknown): void {
  try {
    if (
      nodeTypes.isUint8Array(value)
      && !nodeTypes.isProxy(value)
      && Object.getPrototypeOf(value) === Uint8Array.prototype
    ) Reflect.apply(UINT8_ARRAY_FILL, value, [0]);
  } catch {
    // Cleanup cannot change the durable result.
  }
}

function wipeCallbackCandidate(value: unknown): void {
  try {
    if (typeof value !== "object" || value === null || nodeTypes.isProxy(value)) return;
    const descriptor = Object.getOwnPropertyDescriptor(value, "body");
    if (descriptor && "value" in descriptor) wipe(descriptor.value);
  } catch {
    // Cleanup cannot change the durable result.
  }
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function options(value: IyzicoSandboxEvidenceOperatorOptions): SelectedOptions {
  const selected = exact(value, OPTION_KEYS, "unavailable");
  const appRepository = selected.appRepository as IyzicoSandboxEvidenceOperatorOptions["appRepository"];
  const workflowRepository = selected.workflowRepository as IyzicoSandboxEvidenceOperatorOptions["workflowRepository"];
  const operator = selected.operator as IyzicoSandboxEvidenceOperatorOptions["operator"];
  if (
    typeof selected.candidateResolver !== "function"
    || typeof selected.profileResolver !== "function"
    || typeof selected.adapterResolver !== "function"
    || typeof selected.credentialResolver !== "function"
    || typeof selected.now !== "function"
    || !Number.isSafeInteger(selected.leaseDurationMs)
    || (selected.leaseDurationMs as number) < 1
    || (selected.leaseDurationMs as number) > 15 * 60_000
    || typeof appRepository !== "object"
    || appRepository === null
    || typeof appRepository.begin !== "function"
    || typeof workflowRepository !== "object"
    || workflowRepository === null
    || typeof workflowRepository.claim !== "function"
    || typeof workflowRepository.recordEvent !== "function"
    || typeof workflowRepository.finalize !== "function"
    || typeof operator !== "object"
    || operator === null
    || typeof operator.initialization !== "function"
    || typeof operator.callback !== "function"
    || typeof operator.controlledTimeout !== "function"
  ) fail("unavailable");
  return Object.freeze({
    appRepository,
    workflowRepository,
    candidateResolver: selected.candidateResolver as SelectedOptions["candidateResolver"],
    profileResolver: selected.profileResolver as SelectedOptions["profileResolver"],
    adapterResolver: selected.adapterResolver as SelectedOptions["adapterResolver"],
    credentialResolver: selected.credentialResolver as SelectedOptions["credentialResolver"],
    operator,
    now: selected.now as SelectedOptions["now"],
    leaseDurationMs: selected.leaseDurationMs as number,
  });
}

function input(value: IyzicoSandboxEvidenceOperatorInput): SelectedInput {
  const selected = exact(value, INPUT_KEYS, "invalid_input");
  const eventIds = exact(selected.eventIds, EVENT_ID_KEYS, "invalid_input");
  const attemptIds = exact(selected.attemptIds, ATTEMPT_ID_KEYS, "invalid_input");
  const parsedEventIds = Object.freeze({
    successCaptured: uuid(eventIds.successCaptured, "invalid_input"),
    declined: uuid(eventIds.declined, "invalid_input"),
    timeoutUnknown: uuid(eventIds.timeoutUnknown, "invalid_input"),
    timeoutRecovered: uuid(eventIds.timeoutRecovered, "invalid_input"),
    callbackOriginal: uuid(eventIds.callbackOriginal, "invalid_input"),
    callbackReplay: uuid(eventIds.callbackReplay, "invalid_input"),
  });
  if (new Set(Object.values(parsedEventIds)).size !== EVENT_ID_KEYS.length) fail("invalid_input");
  const parsedAttemptIds = Object.freeze({
    success: uuid(attemptIds.success, "invalid_input"),
    decline: uuid(attemptIds.decline, "invalid_input"),
    controlledTimeoutRecovery: uuid(attemptIds.controlledTimeoutRecovery, "invalid_input"),
    callbackReplay: uuid(attemptIds.callbackReplay, "invalid_input"),
  });
  if (
    parsedAttemptIds.callbackReplay !== parsedAttemptIds.success
    || new Set([
      parsedAttemptIds.success,
      parsedAttemptIds.decline,
      parsedAttemptIds.controlledTimeoutRecovery,
    ]).size !== 3
  ) fail("invalid_input");
  if (typeof selected.workerId !== "string" || !WORKER.test(selected.workerId)) fail("invalid_input");
  return Object.freeze({
    tenantContext: selected.tenantContext as SelectedInput["tenantContext"],
    profileId: uuid(selected.profileId, "invalid_input"),
    runId: uuid(selected.runId, "invalid_input"),
    leaseId: uuid(selected.leaseId, "invalid_input"),
    attestationId: uuid(selected.attestationId, "invalid_input"),
    workerId: selected.workerId,
    eventIds: parsedEventIds,
    attemptIds: parsedAttemptIds,
  });
}

function candidate(value: unknown): IyzicoSandboxEvidenceCandidateResolution {
  const kindDescriptor = typeof value === "object" && value !== null
    ? Object.getOwnPropertyDescriptor(value, "kind")
    : undefined;
  if (!kindDescriptor || !("value" in kindDescriptor)) fail("unavailable");
  if (kindDescriptor.value === "unavailable") {
    const selected = exact(value, ["kind", "reason"], "unavailable");
    if (selected.reason !== "candidate_missing" && selected.reason !== "candidate_stale") {
      fail("unavailable");
    }
    return Object.freeze({ kind: "unavailable", reason: selected.reason });
  }
  const selected = exact(value, ["kind", "adapterVersion", "evidenceDigest"], "unavailable");
  if (
    selected.kind !== "ready"
    || selected.adapterVersion !== 1
    || typeof selected.evidenceDigest !== "string"
    || !DIGEST.test(selected.evidenceDigest)
  ) fail("unavailable");
  return Object.freeze({ kind: "ready", adapterVersion: 1, evidenceDigest: selected.evidenceDigest });
}

function profile(value: unknown, expectedProfileId: string): IyzicoSandboxEvidenceProfileResolution {
  const kindDescriptor = typeof value === "object" && value !== null
    ? Object.getOwnPropertyDescriptor(value, "kind")
    : undefined;
  if (!kindDescriptor || !("value" in kindDescriptor)) fail("unavailable");
  if (kindDescriptor.value === "unavailable") {
    const selected = exact(value, ["kind", "reason"], "unavailable");
    const reasons = [
      "profile_missing",
      "profile_stale",
      "credential_missing",
      "credential_stale",
    ] as const;
    if (!reasons.includes(selected.reason as never)) fail("unavailable");
    return Object.freeze({
      kind: "unavailable",
      reason: selected.reason as Extract<IyzicoSandboxEvidenceProfileResolution, { kind: "unavailable" }>["reason"],
    });
  }
  const selected = exact(value, [
    "kind",
    "profileId",
    "profileVersion",
    "credentialVersion",
    "credentialAuthority",
  ], "unavailable");
  if (
    selected.kind !== "ready"
    || uuid(selected.profileId, "unavailable") !== expectedProfileId
    || typeof selected.credentialAuthority !== "object"
    || selected.credentialAuthority === null
    || nodeTypes.isProxy(selected.credentialAuthority)
  ) fail("unavailable");
  return Object.freeze({
    kind: "ready",
    profileId: expectedProfileId,
    profileVersion: positiveInteger(selected.profileVersion, "unavailable"),
    credentialVersion: positiveInteger(selected.credentialVersion, "unavailable"),
    credentialAuthority: selected.credentialAuthority,
  });
}

function adapter(value: unknown, expectedVersion: number): HostedPaymentAdapter<IyzicoCredential> {
  const selected = exact(value, [
    "packet",
    "parseCredential",
    "maskAccount",
    "initialize",
    "verifyCallback",
    "query",
  ], "unavailable");
  const packet = exact(selected.packet, [
    "providerCode",
    "familyCode",
    "modeCode",
    "adapterVersion",
    "implementation",
    "callbackResponse",
    "readiness",
    "endpoints",
    "presentation",
    "publicFields",
    "credentialFields",
    "capabilities",
    "documentation",
  ], "unavailable");
  const readiness = exact(packet.readiness, ["test", "live"], "unavailable");
  const capabilities = exact(packet.capabilities, [
    "initialize", "callback", "query", "threeDSecure", "installments", "preAuth",
    "capture", "cancel", "refund", "partialRefund", "tokenization",
  ], "unavailable");
  if (
    packet.providerCode !== "iyzico_iframe"
    || packet.familyCode !== "iyzico"
    || packet.modeCode !== "iframe"
    || packet.adapterVersion !== expectedVersion
    || packet.implementation !== "hosted"
    || readiness.test !== "verification"
    || capabilities.initialize !== true
    || capabilities.callback !== true
    || capabilities.query !== true
    || typeof selected.parseCredential !== "function"
    || typeof selected.maskAccount !== "function"
    || typeof selected.initialize !== "function"
    || typeof selected.verifyCallback !== "function"
    || typeof selected.query !== "function"
  ) fail("unavailable");
  return value as HostedPaymentAdapter<IyzicoCredential>;
}

function fixture(value: unknown): IyzicoSandboxEvidenceInitializationFixture {
  return exact(value, FIXTURE_KEYS, "scenario_failed") as unknown as IyzicoSandboxEvidenceInitializationFixture;
}

function initialization(value: unknown): Extract<HostedPaymentInitialization, { kind: "iframe" }> {
  const selected = exact(value, ["kind", "url", "token", "providerReference"], "scenario_failed");
  if (
    selected.kind !== "iframe"
    || typeof selected.url !== "string"
    || typeof selected.token !== "string"
    || typeof selected.providerReference !== "string"
    || selected.token !== selected.providerReference
  ) fail("scenario_failed");
  return Object.freeze({
    kind: "iframe",
    url: selected.url,
    token: selected.token,
    providerReference: selected.providerReference,
  });
}

function rawCallback(value: unknown): IyzicoSandboxEvidenceRawCallback {
  const selected = exact(value, ["method", "headers", "body"], "scenario_failed");
  if (
    selected.method !== "POST"
    || !nodeTypes.isUint8Array(selected.body)
    || nodeTypes.isProxy(selected.body)
    || Object.getPrototypeOf(selected.body) !== Uint8Array.prototype
  ) fail("scenario_failed");
  return Object.freeze({
    method: "POST",
    headers: selected.headers as Readonly<Record<string, string>>,
    body: selected.body as Uint8Array,
  });
}

function callback(value: unknown): SafeCallback {
  const selected = exact(value, [
    "eventKey",
    "status",
    "providerReference",
    "paidAmountMinor",
    "currency",
    "safeCode",
  ], "scenario_failed");
  if (
    typeof selected.eventKey !== "string"
    || selected.eventKey.length < 1
    || selected.eventKey.length > 256
    || (selected.status !== "succeeded"
      && selected.status !== "failed"
      && selected.status !== "pending"
      && selected.status !== "retry")
    || typeof selected.providerReference !== "string"
    || selected.providerReference.length < 1
    || selected.providerReference.length > 256
    || !Number.isSafeInteger(selected.paidAmountMinor)
    || (selected.paidAmountMinor as number) < 0
    || selected.currency !== "TRY"
    || typeof selected.safeCode !== "string"
    || !SAFE_CODE.test(selected.safeCode)
  ) fail("scenario_failed");
  return Object.freeze({
    eventKey: selected.eventKey,
    status: selected.status,
    providerReference: selected.providerReference,
    paidAmountMinor: selected.paidAmountMinor as number,
    currency: "TRY",
    safeCode: selected.safeCode,
  });
}

function query(value: unknown): SafeQuery {
  const selected = exact(value, [
    "kind",
    "providerReference",
    "paidAmountMinor",
    "currency",
  ], "scenario_failed");
  if (
    selected.kind !== "succeeded"
    || typeof selected.providerReference !== "string"
    || selected.providerReference.length < 1
    || selected.providerReference.length > 256
    || !Number.isSafeInteger(selected.paidAmountMinor)
    || (selected.paidAmountMinor as number) < 1
    || selected.currency !== "TRY"
  ) fail("scenario_failed");
  return Object.freeze({
    kind: "succeeded",
    providerReference: selected.providerReference,
    paidAmountMinor: selected.paidAmountMinor as number,
    currency: "TRY",
  });
}

function repositoryError(error: unknown): never {
  if (isTrustedOperatorError(error)) throw error;
  if (error instanceof IyzicoSandboxEvidenceRepositoryError) {
    if (error.code === "commit_unknown") fail("commit_unknown");
    if (error.code === "lease_conflict" || error.code === "lease_lost" || error.code === "run_closed") {
      fail("concurrent_run");
    }
  }
  return fail("unavailable");
}

async function repositoryCall<Result>(operation: () => Promise<Result>): Promise<Result> {
  try {
    return await operation();
  } catch (error) {
    return repositoryError(error);
  }
}

async function scenarioCall<Result>(operation: () => Promise<Result>): Promise<Result> {
  try {
    return await operation();
  } catch (error) {
    if (isTrustedOperatorError(error)) throw error;
    return fail("scenario_failed");
  }
}

function safeCallbackEqual(left: SafeCallback, right: SafeCallback): boolean {
  return left.eventKey === right.eventKey
    && left.status === right.status
    && left.providerReference === right.providerReference
    && left.paidAmountMinor === right.paidAmountMinor
    && left.currency === right.currency
    && left.safeCode === right.safeCode;
}

async function initializeCase(
  selectedOptions: SelectedOptions,
  selectedAdapter: HostedPaymentAdapter<IyzicoCredential>,
  credential: IyzicoCredential,
  caseKind: IyzicoSandboxEvidenceCaseKind,
  attemptId: string,
): Promise<InitializedCase> {
  return scenarioCall(async () => {
    const selectedFixture = fixture(await selectedOptions.operator.initialization(Object.freeze({
      caseKind,
      attemptId,
    })));
    const selectedInitialization = initialization(await selectedAdapter.initialize(Object.freeze({
      ...selectedFixture,
      environment: "test" as const,
      credential,
      attemptId,
      signal: new AbortController().signal,
    })));
    return Object.freeze({
      attemptId,
      fixture: selectedFixture,
      initialization: selectedInitialization,
    });
  });
}

async function callbackWitness(
  selectedOptions: SelectedOptions,
  caseKind: IyzicoSandboxEvidenceCaseKind,
  selectedInitialization: InitializedCase["initialization"],
): Promise<IyzicoSandboxEvidenceRawCallback> {
  return scenarioCall(async () => {
    const value = await selectedOptions.operator.callback(Object.freeze({
      caseKind,
      initialization: selectedInitialization,
    }));
    try {
      return rawCallback(value);
    } catch (error) {
      wipeCallbackCandidate(value);
      throw error;
    }
  });
}

async function verify(
  selectedAdapter: HostedPaymentAdapter<IyzicoCredential>,
  credential: IyzicoCredential,
  selectedCase: InitializedCase,
  selectedCallback: IyzicoSandboxEvidenceRawCallback,
  signal: AbortSignal,
): Promise<SafeCallback> {
  return scenarioCall(async () => callback(await selectedAdapter.verifyCallback(Object.freeze({
    environment: "test" as const,
    credential,
    method: selectedCallback.method,
    headers: selectedCallback.headers,
    body: selectedCallback.body,
    signal,
    expected: Object.freeze({
      attemptId: selectedCase.attemptId,
      orderReference: selectedCase.fixture.orderReference,
      amountMinor: selectedCase.fixture.amountMinor,
      currency: selectedCase.fixture.currency,
      providerReference: selectedCase.initialization.providerReference,
    }),
  }))));
}

async function record(
  selectedOptions: SelectedOptions,
  selectedInput: SelectedInput,
  value: Omit<RecordIyzicoSandboxEvidenceEventInput, "runId" | "leaseId" | "workerId" | "observedAt">,
): Promise<void> {
  const result = await repositoryCall(() => selectedOptions.workflowRepository.recordEvent({
    ...value,
    runId: selectedInput.runId,
    leaseId: selectedInput.leaseId,
    workerId: selectedInput.workerId,
    observedAt: now(selectedOptions),
  } as RecordIyzicoSandboxEvidenceEventInput));
  if (result.eventId !== value.eventId) fail("unavailable");
}

async function runScenarios(
  selectedOptions: SelectedOptions,
  selectedInput: SelectedInput,
  selectedAdapter: HostedPaymentAdapter<IyzicoCredential>,
  credential: IyzicoCredential,
): Promise<void> {
  const success = await initializeCase(
    selectedOptions,
    selectedAdapter,
    credential,
    "success",
    selectedInput.attemptIds.success,
  );
  let raw = await callbackWitness(selectedOptions, "success", success.initialization);
  try {
    const verified = await verify(
      selectedAdapter,
      credential,
      success,
      raw,
      new AbortController().signal,
    );
    if (
      verified.status !== "succeeded"
      || verified.paidAmountMinor !== success.fixture.amountMinor
      || verified.providerReference !== success.initialization.providerReference
    ) fail("scenario_failed");
    await record(selectedOptions, selectedInput, {
      eventId: selectedInput.eventIds.successCaptured,
      caseKind: "success",
      eventKind: "success_captured",
      attemptId: selectedInput.attemptIds.success,
      observationDigest: sha256({ semantic: "success_captured", attemptId: selectedInput.attemptIds.success, verified }),
      outcomeCode: "captured",
    });
  } finally {
    wipe(raw.body);
  }

  const decline = await initializeCase(
    selectedOptions,
    selectedAdapter,
    credential,
    "decline",
    selectedInput.attemptIds.decline,
  );
  raw = await callbackWitness(selectedOptions, "decline", decline.initialization);
  try {
    const verified = await verify(
      selectedAdapter,
      credential,
      decline,
      raw,
      new AbortController().signal,
    );
    if (
      verified.status !== "failed"
      || verified.paidAmountMinor !== decline.fixture.amountMinor
      || verified.providerReference !== decline.initialization.providerReference
    ) fail("scenario_failed");
    await record(selectedOptions, selectedInput, {
      eventId: selectedInput.eventIds.declined,
      caseKind: "decline",
      eventKind: "declined",
      attemptId: selectedInput.attemptIds.decline,
      observationDigest: sha256({ semantic: "declined", attemptId: selectedInput.attemptIds.decline, verified }),
      outcomeCode: "declined",
    });
  } finally {
    wipe(raw.body);
  }

  const timeout = await initializeCase(
    selectedOptions,
    selectedAdapter,
    credential,
    "controlled_timeout_recovery",
    selectedInput.attemptIds.controlledTimeoutRecovery,
  );
  raw = await callbackWitness(selectedOptions, "controlled_timeout_recovery", timeout.initialization);
  try {
    const witness = await scenarioCall(async () => exact(
      await selectedOptions.operator.controlledTimeout(),
      ["kind", "signal"],
      "scenario_failed",
    ));
    if (
      witness.kind !== "controlled_timeout_observed"
      || !(witness.signal instanceof AbortSignal)
      || witness.signal.aborted !== true
    ) fail("scenario_failed");
    const unknown = await verify(
      selectedAdapter,
      credential,
      timeout,
      raw,
      witness.signal,
    );
    if (
      unknown.status !== "retry"
      || unknown.providerReference !== timeout.initialization.providerReference
    ) fail("scenario_failed");
    await record(selectedOptions, selectedInput, {
      eventId: selectedInput.eventIds.timeoutUnknown,
      caseKind: "controlled_timeout_recovery",
      eventKind: "timeout_unknown",
      attemptId: selectedInput.attemptIds.controlledTimeoutRecovery,
      observationDigest: sha256({
        semantic: "controlled_timeout_unknown",
        attemptId: selectedInput.attemptIds.controlledTimeoutRecovery,
        verified: unknown,
      }),
      outcomeCode: "unknown",
    });
    const recovered = query(await scenarioCall<HostedPaymentStatus>(() => selectedAdapter.query(Object.freeze({
      environment: "test",
      credential,
      attemptId: selectedInput.attemptIds.controlledTimeoutRecovery,
      orderReference: timeout.fixture.orderReference,
      providerReference: timeout.initialization.providerReference,
      amountMinor: timeout.fixture.amountMinor,
      currency: timeout.fixture.currency,
      signal: new AbortController().signal,
    }))));
    if (
      recovered.providerReference !== timeout.initialization.providerReference
      || recovered.paidAmountMinor !== timeout.fixture.amountMinor
    ) fail("scenario_failed");
    await record(selectedOptions, selectedInput, {
      eventId: selectedInput.eventIds.timeoutRecovered,
      caseKind: "controlled_timeout_recovery",
      eventKind: "timeout_recovered",
      attemptId: selectedInput.attemptIds.controlledTimeoutRecovery,
      observationDigest: sha256({
        semantic: "controlled_timeout_recovered",
        attemptId: selectedInput.attemptIds.controlledTimeoutRecovery,
        recovered,
      }),
      outcomeCode: "recovered",
    });
  } finally {
    wipe(raw.body);
  }

  const replay = await initializeCase(
    selectedOptions,
    selectedAdapter,
    credential,
    "callback_replay",
    selectedInput.attemptIds.callbackReplay,
  );
  raw = await callbackWitness(selectedOptions, "callback_replay", replay.initialization);
  try {
    const original = await verify(
      selectedAdapter,
      credential,
      replay,
      raw,
      new AbortController().signal,
    );
    const repeated = await verify(
      selectedAdapter,
      credential,
      replay,
      raw,
      new AbortController().signal,
    );
    if (
      original.status !== "succeeded"
      || original.paidAmountMinor !== replay.fixture.amountMinor
      || original.providerReference !== replay.initialization.providerReference
      || !safeCallbackEqual(original, repeated)
    ) fail("scenario_failed");
    const observationDigest = sha256({
      semantic: "callback_replay",
      attemptId: selectedInput.attemptIds.callbackReplay,
      verified: original,
    });
    await record(selectedOptions, selectedInput, {
      eventId: selectedInput.eventIds.callbackOriginal,
      caseKind: "callback_replay",
      eventKind: "callback_original",
      attemptId: selectedInput.attemptIds.callbackReplay,
      observationDigest,
      outcomeCode: "accepted",
    });
    await record(selectedOptions, selectedInput, {
      eventId: selectedInput.eventIds.callbackReplay,
      caseKind: "callback_replay",
      eventKind: "callback_replay",
      attemptId: selectedInput.attemptIds.callbackReplay,
      observationDigest,
      outcomeCode: "replayed",
    });
  } finally {
    wipe(raw.body);
  }
}

async function execute(
  selectedOptions: SelectedOptions,
  selectedInput: SelectedInput,
): Promise<IyzicoSandboxEvidenceOperatorResult> {
  const beginNow = now(selectedOptions);
  let selectedCandidate: IyzicoSandboxEvidenceCandidateResolution;
  let selectedProfile: IyzicoSandboxEvidenceProfileResolution;
  try {
    selectedCandidate = candidate(await selectedOptions.candidateResolver());
    if (selectedCandidate.kind === "unavailable") fail("prerequisite_unavailable");
    selectedProfile = profile(await selectedOptions.profileResolver(Object.freeze({
      tenantContext: selectedInput.tenantContext,
      profileId: selectedInput.profileId,
      now: beginNow,
    })), selectedInput.profileId);
    if (selectedProfile.kind === "unavailable") fail("prerequisite_unavailable");
  } catch (error) {
    if (isTrustedOperatorError(error)) throw error;
    return fail("unavailable");
  }
  if (selectedCandidate.kind !== "ready" || selectedProfile.kind !== "ready") {
    return fail("prerequisite_unavailable");
  }
  const beginFingerprint = sha256({
    kind: "iyzico_sandbox_evidence_begin",
    runId: selectedInput.runId,
    profileId: selectedProfile.profileId,
    profileVersion: selectedProfile.profileVersion,
    credentialVersion: selectedProfile.credentialVersion,
    adapterVersion: selectedCandidate.adapterVersion,
    evidenceDigest: selectedCandidate.evidenceDigest,
  });
  const begun = await repositoryCall(() => selectedOptions.appRepository.begin({
    tenantContext: selectedInput.tenantContext,
    now: beginNow,
    runId: selectedInput.runId,
    fingerprint: beginFingerprint,
    profileId: selectedProfile.profileId,
    expectedProfileVersion: selectedProfile.profileVersion,
    expectedCredentialVersion: selectedProfile.credentialVersion,
    candidateEvidenceDigest: selectedCandidate.evidenceDigest,
    adapterVersion: selectedCandidate.adapterVersion,
  }));
  if (begun.runId !== selectedInput.runId || begun.status !== "pending") fail("concurrent_run");
  const claimNow = now(selectedOptions);
  const claimed = await repositoryCall(() => selectedOptions.workflowRepository.claim({
    runId: selectedInput.runId,
    workerId: selectedInput.workerId,
    leaseId: selectedInput.leaseId,
    now: claimNow,
    leaseExpiresAt: new Date(claimNow.getTime() + selectedOptions.leaseDurationMs),
  }));
  if (claimed.runId !== selectedInput.runId || claimed.leaseId !== selectedInput.leaseId) {
    fail("concurrent_run");
  }

  let selectedAdapter: HostedPaymentAdapter<IyzicoCredential>;
  try {
    selectedAdapter = adapter(await selectedOptions.adapterResolver(), selectedCandidate.adapterVersion);
  } catch (error) {
    if (isTrustedOperatorError(error)) throw error;
    return fail("unavailable");
  }
  let openedCredential: IyzicoCredential | undefined;
  let selectedCredential: IyzicoCredential | undefined;
  try {
    openedCredential = await selectedOptions.credentialResolver(Object.freeze({
      credentialAuthority: selectedProfile.credentialAuthority,
      profileId: selectedProfile.profileId,
      profileVersion: selectedProfile.profileVersion,
      credentialVersion: selectedProfile.credentialVersion,
      runId: selectedInput.runId,
      leaseId: selectedInput.leaseId,
    }));
    selectedCredential = parseIyzicoCredential(openedCredential);
    await runScenarios(selectedOptions, selectedInput, selectedAdapter, selectedCredential);
    const finalized = await repositoryCall(() => selectedOptions.workflowRepository.finalize({
      runId: selectedInput.runId,
      leaseId: selectedInput.leaseId,
      workerId: selectedInput.workerId,
      attestationId: selectedInput.attestationId,
      fingerprint: sha256({
        kind: "iyzico_sandbox_evidence_finalize",
        runId: selectedInput.runId,
        attestationId: selectedInput.attestationId,
      }),
      now: now(selectedOptions),
    }));
    if (finalized.attestationId !== selectedInput.attestationId) fail("unavailable");
    return Object.freeze({
      kind: "attested",
      runId: selectedInput.runId,
      attestationId: finalized.attestationId,
      matrixDigest: finalized.matrixDigest,
      replayed: finalized.replayed,
    });
  } catch (error) {
    if (isTrustedOperatorError(error)) throw error;
    return fail("unavailable");
  } finally {
    if (selectedCredential !== undefined) wipeIyzicoCredential(selectedCredential);
    if (openedCredential !== undefined) wipeIyzicoCredential(openedCredential);
  }
}

export function createIyzicoSandboxEvidenceOperator(
  value: IyzicoSandboxEvidenceOperatorOptions,
): IyzicoSandboxEvidenceOperator {
  const selectedOptions = options(value);
  return Object.freeze({
    async run(value: IyzicoSandboxEvidenceOperatorInput) {
      try {
        return await execute(selectedOptions, input(value));
      } catch (error) {
        if (isTrustedOperatorError(error)) throw error;
        return fail("unavailable");
      }
    },
  });
}
