import { createHash } from "node:crypto";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { types as nodeTypes } from "node:util";

import {
  PAYTR_IFRAME_PACKET,
  createBoundedProviderTransport,
  createPaytrIframeCallbackHash,
  queryPaytrIframeWithTransport,
} from "@celebix/payment-adapters";
import pg from "pg";
import type { PoolClient } from "pg";

const ARTIFACT_KEYS = Object.freeze([
  "schemaVersion",
  "providerCode",
  "capability",
  "environment",
  "adapterVersion",
  "testedGitSha",
  "packetDigest",
  "officialDocumentationUrls",
  "verifiedAt",
  "maskedMerchantSuffix",
  "cases",
  "testMode",
  "realMoney",
  "rawCardCaptured",
  "secretsCaptured",
]);
const CASE_KEYS = Object.freeze([
  "caseId",
  "operationId",
  "attemptId",
  "safeProviderReferenceDigest",
  "resultClass",
  "callbackDigest",
  "startedAt",
  "completedAt",
]);
const OBSERVATION_KEYS = Object.freeze([
  "verifiedAt",
  "maskedMerchantSuffix",
  "cases",
]);
const HISTORY_KEYS = Object.freeze([
  "successSettlementCount",
  "successReceiptCount",
  "replayInput",
  "facts",
]);
const REPLAY_INPUT_KEYS = Object.freeze([
  "merchantOid",
  "totalAmount",
  "paymentType",
]);
const REPLAY_RESULT_KEYS = Object.freeze(["kind"]);
const HISTORY_FACT_KEYS = Object.freeze([
  "kind",
  "operationId",
  "attemptId",
  "operationKind",
  "resultStatus",
  "attemptStatus",
  "testMode",
  "replayed",
  "safeProviderReference",
  "callbackDigest",
  "startedAt",
  "completedAt",
  "amountMinor",
  "currency",
  "sawUnknown",
  "sawReconciledCaptured",
]);
const STATUS_KEYS = Object.freeze(["success", "decline", "status"]);
const REQUIRED_CASES = Object.freeze([
  Object.freeze({
    caseId: "successful_iframe_signed_callback",
    resultClass: "captured",
  }),
  Object.freeze({
    caseId: "provider_declined",
    resultClass: "provider_declined",
  }),
  Object.freeze({
    caseId: "duplicate_callback_replay",
    resultClass: "callback_replayed",
  }),
  Object.freeze({
    caseId: "query_after_write_timeout",
    resultClass: "captured_after_query",
  }),
  Object.freeze({
    caseId: "official_status_query",
    resultClass: "status_verified",
  }),
]);
const HISTORY_KINDS = Object.freeze([
  "success",
  "decline",
  "replay",
  "timeout",
  "status",
] as const);
const SELECTOR_FLAGS = Object.freeze([
  Object.freeze({
    flag: "--success-operation-id",
    key: "successOperationId",
  }),
  Object.freeze({
    flag: "--decline-operation-id",
    key: "declineOperationId",
  }),
  Object.freeze({
    flag: "--replay-operation-id",
    key: "replayOperationId",
  }),
  Object.freeze({
    flag: "--timeout-operation-id",
    key: "timeoutOperationId",
  }),
  Object.freeze({
    flag: "--status-operation-id",
    key: "statusOperationId",
  }),
] as const);
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const HEX_DIGEST = /^[a-f0-9]{64}$/;
const MERCHANT_OID = /^[a-f0-9]{32}$/;
const GIT_SHA = /^[a-f0-9]{40}$/;
const DATABASE = /^[a-z][a-z0-9_]{2,62}$/;
const TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[.]\d{3}Z$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const OFFICIAL_DOCUMENTATION = Object.freeze([
  "https://dev.paytr.com/iframe-api",
  "https://dev.paytr.com/durum-sorgu",
] as const);
const STAGING_ORIGIN = "https://pilot.saas-staging.celebix.site";
const CALLBACK_PATH = "/api/payments/paytr/callback";
const INCOMPLETE = "paytr_iframe_sandbox_evidence_incomplete";
const OPERATOR_INVALID = "paytr_iframe_sandbox_evidence_operator_invalid";

type Environment = Readonly<Record<string, string | undefined>>;
type HistoryKind = typeof HISTORY_KINDS[number];

export type PaytrIframeSandboxEvidenceMode =
  | "disabled"
  | "dry_run"
  | "operator_test_once";

export type PaytrIframeSandboxEvidenceSelectors = Readonly<{
  successOperationId: string;
  declineOperationId: string;
  replayOperationId: string;
  timeoutOperationId: string;
  statusOperationId: string;
}>;

export type PaytrIframeSandboxEvidenceCase = Readonly<{
  caseId: string;
  operationId: string;
  attemptId: string;
  safeProviderReferenceDigest: string;
  resultClass: string;
  callbackDigest: string;
  startedAt: string;
  completedAt: string;
}>;

export type PaytrIframeSandboxEvidence = Readonly<{
  schemaVersion: 1;
  providerCode: "paytr_iframe";
  capability: "payment_processing";
  environment: "test";
  adapterVersion: 1;
  testedGitSha: string;
  packetDigest: string;
  officialDocumentationUrls: typeof OFFICIAL_DOCUMENTATION;
  verifiedAt: string;
  maskedMerchantSuffix: string;
  cases: readonly PaytrIframeSandboxEvidenceCase[];
  testMode: true;
  realMoney: false;
  rawCardCaptured: false;
  secretsCaptured: false;
}>;

type EvidenceExecutionInput = Readonly<{
  environment: "test";
  testMode: 1;
  stagingOrigin: typeof STAGING_ORIGIN;
  callbackUrl: `${typeof STAGING_ORIGIN}${typeof CALLBACK_PATH}`;
  officialDocumentationUrls: typeof OFFICIAL_DOCUMENTATION;
}>;

type EvidenceOperatorContext = Readonly<{
  source: Environment;
  argv: readonly string[];
}>;

type EvidenceRunnerDependencies = Readonly<{
  execute(
    input: EvidenceExecutionInput,
    operator: EvidenceOperatorContext,
  ): Promise<unknown>;
  testedGitSha(source: Environment): Promise<unknown>;
  packetDigest(): Promise<unknown>;
}>;

type OperatorHistoryFact = Readonly<{
  kind: HistoryKind;
  operationId: string;
  attemptId: string;
  operationKind: string;
  resultStatus: string;
  attemptStatus: string;
  testMode: 1;
  replayed: boolean;
  safeProviderReference: string;
  callbackDigest: string;
  startedAt: string;
  completedAt: string;
  amountMinor: number;
  currency: "TRY";
  sawUnknown: boolean;
  sawReconciledCaptured: boolean;
}>;

type OperatorHistory = Readonly<{
  successSettlementCount: 1;
  successReceiptCount: 1;
  replayInput: OperatorReplayInput;
  facts: readonly OperatorHistoryFact[];
}>;

type OperatorReplayInput = Readonly<{
  merchantOid: string;
  totalAmount: number;
  paymentType: "card" | "eft";
}>;

type OperatorCredential = Readonly<{
  merchantId: string;
  merchantKey: string;
  merchantSalt: string;
}>;

type EvidenceOperatorDependencies = Readonly<{
  readHistory(input: Readonly<{
    databaseUrl: string;
    selectors: PaytrIframeSandboxEvidenceSelectors;
  }>): Promise<unknown>;
  replayCallback(input: Readonly<{
    credential: OperatorCredential;
    success: OperatorHistoryFact;
    replayInput: OperatorReplayInput;
  }>): Promise<unknown>;
  queryStatuses(input: Readonly<{
    credential: OperatorCredential;
    success: OperatorHistoryFact;
    decline: OperatorHistoryFact;
    status: OperatorHistoryFact;
  }>): Promise<unknown>;
  now(): Date;
}>;

function invalid(): never {
  throw new TypeError("paytr_iframe_sandbox_evidence_invalid");
}

function operatorInvalid(): never {
  throw new TypeError(OPERATOR_INVALID);
}

function incomplete(): never {
  throw new Error(INCOMPLETE);
}

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (
    typeof value !== "object"
    || value === null
    || Array.isArray(value)
    || nodeTypes.isProxy(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<
    string,
    PropertyDescriptor
  >;
  const ownKeys = Reflect.ownKeys(descriptors);
  if (
    ownKeys.length !== keys.length
    || ownKeys.some((key) =>
      typeof key !== "string" || !keys.includes(key))
    || keys.some((key) => !Object.hasOwn(descriptors, key))
  ) invalid();
  const selected: Record<string, unknown> = Object.create(null) as Record<
    string,
    unknown
  >;
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      invalid();
    }
    selected[key] = descriptor.value;
  }
  return selected;
}

function denseArray(
  value: unknown,
  minimum: number,
  maximum: number,
): readonly unknown[] {
  if (
    !Array.isArray(value)
    || nodeTypes.isProxy(value)
    || Object.getPrototypeOf(value) !== Array.prototype
  ) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<
    string,
    PropertyDescriptor
  >;
  const lengthDescriptor = descriptors.length;
  if (
    !lengthDescriptor
    || !("value" in lengthDescriptor)
    || lengthDescriptor.enumerable
    || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < minimum
    || lengthDescriptor.value > maximum
    || Reflect.ownKeys(descriptors).length !== lengthDescriptor.value + 1
  ) invalid();
  const result: unknown[] = [];
  for (let index = 0; index < lengthDescriptor.value; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      invalid();
    }
    result.push(descriptor.value);
  }
  return result;
}

function timestamp(value: unknown): string {
  if (typeof value !== "string" || !TIMESTAMP.test(value)) invalid();
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    invalid();
  }
  return value;
}

function digest(value: unknown): string {
  if (typeof value !== "string" || !SHA256.test(value)) invalid();
  return value;
}

function evidenceCase(
  value: unknown,
  expected: Readonly<{ caseId: string; resultClass: string }>,
): PaytrIframeSandboxEvidenceCase {
  const parsed = exact(value, CASE_KEYS);
  const startedAt = timestamp(parsed.startedAt);
  const completedAt = timestamp(parsed.completedAt);
  if (
    parsed.caseId !== expected.caseId
    || parsed.resultClass !== expected.resultClass
    || typeof parsed.operationId !== "string"
    || !UUID.test(parsed.operationId)
    || typeof parsed.attemptId !== "string"
    || !UUID.test(parsed.attemptId)
    || Date.parse(completedAt) < Date.parse(startedAt)
  ) invalid();
  return Object.freeze({
    caseId: expected.caseId,
    operationId: parsed.operationId,
    attemptId: parsed.attemptId,
    safeProviderReferenceDigest: digest(parsed.safeProviderReferenceDigest),
    resultClass: expected.resultClass,
    callbackDigest: digest(parsed.callbackDigest),
    startedAt,
    completedAt,
  });
}

function parseCases(value: unknown): readonly PaytrIframeSandboxEvidenceCase[] {
  const evidenceCases = denseArray(
    value,
    REQUIRED_CASES.length,
    REQUIRED_CASES.length,
  );
  return Object.freeze(REQUIRED_CASES.map((expected, index) =>
    evidenceCase(evidenceCases[index], expected)));
}

function validateCaseRelations(
  cases: readonly PaytrIframeSandboxEvidenceCase[],
  verifiedAt: string,
): void {
  const [
    successful,
    declined,
    replay,
    timeoutRecovered,
    officialStatus,
  ] = cases;
  if (
    !successful
    || !declined
    || !replay
    || !timeoutRecovered
    || !officialStatus
    || replay.attemptId !== successful.attemptId
    || replay.operationId !== successful.operationId
    || replay.safeProviderReferenceDigest
      !== successful.safeProviderReferenceDigest
    || replay.callbackDigest !== successful.callbackDigest
    || declined.attemptId === timeoutRecovered.attemptId
    || officialStatus.attemptId !== timeoutRecovered.attemptId
    || officialStatus.safeProviderReferenceDigest
      !== timeoutRecovered.safeProviderReferenceDigest
    || cases.some(({ completedAt }) =>
      Date.parse(completedAt) > Date.parse(verifiedAt))
  ) invalid();
}

export function parsePaytrIframeSandboxEvidence(
  value: unknown,
): PaytrIframeSandboxEvidence {
  const parsed = exact(value, ARTIFACT_KEYS);
  const documentation = denseArray(parsed.officialDocumentationUrls, 2, 2);
  if (
    parsed.schemaVersion !== 1
    || parsed.providerCode !== "paytr_iframe"
    || parsed.capability !== "payment_processing"
    || parsed.environment !== "test"
    || parsed.adapterVersion !== 1
    || typeof parsed.testedGitSha !== "string"
    || !GIT_SHA.test(parsed.testedGitSha)
    || typeof parsed.maskedMerchantSuffix !== "string"
    || !/^…[A-Za-z0-9]{2,8}$/.test(parsed.maskedMerchantSuffix)
    || parsed.testMode !== true
    || parsed.realMoney !== false
    || parsed.rawCardCaptured !== false
    || parsed.secretsCaptured !== false
    || OFFICIAL_DOCUMENTATION.some((url, index) =>
      documentation[index] !== url)
  ) invalid();
  const verifiedAt = timestamp(parsed.verifiedAt);
  const cases = parseCases(parsed.cases);
  validateCaseRelations(cases, verifiedAt);
  return Object.freeze({
    schemaVersion: 1,
    providerCode: "paytr_iframe",
    capability: "payment_processing",
    environment: "test",
    adapterVersion: 1,
    testedGitSha: parsed.testedGitSha,
    packetDigest: digest(parsed.packetDigest),
    officialDocumentationUrls: OFFICIAL_DOCUMENTATION,
    verifiedAt,
    maskedMerchantSuffix: parsed.maskedMerchantSuffix,
    cases,
    testMode: true,
    realMoney: false,
    rawCardCaptured: false,
    secretsCaptured: false,
  });
}

export function canonicalPaytrIframeSandboxEvidence(value: unknown): string {
  return JSON.stringify(parsePaytrIframeSandboxEvidence(value));
}

export function resolvePaytrIframeSandboxEvidenceMode(
  source: Environment,
): PaytrIframeSandboxEvidenceMode {
  try {
    const mode = source.CELEBIX_PAYTR_IFRAME_EVIDENCE_MODE;
    return mode === "dry_run" || mode === "operator_test_once"
      ? mode
      : "disabled";
  } catch {
    return "disabled";
  }
}

export function parsePaytrIframeSandboxEvidenceSelectors(
  argv: readonly string[],
): PaytrIframeSandboxEvidenceSelectors {
  let values: readonly unknown[];
  try {
    values = denseArray(argv, SELECTOR_FLAGS.length, SELECTOR_FLAGS.length);
  } catch {
    return operatorInvalid();
  }
  const selected: Record<string, string> = Object.create(null) as Record<
    string,
    string
  >;
  for (const value of values) {
    if (typeof value !== "string") operatorInvalid();
    const match = SELECTOR_FLAGS.find(({ flag }) =>
      value.startsWith(`${flag}=`));
    if (!match) operatorInvalid();
    const id = value.slice(match.flag.length + 1);
    if (!UUID.test(id) || selected[match.key] !== undefined) operatorInvalid();
    selected[match.key] = id;
  }
  if (
    SELECTOR_FLAGS.some(({ key }) => selected[key] === undefined)
    || selected.replayOperationId !== selected.successOperationId
    || new Set([
      selected.successOperationId,
      selected.declineOperationId,
      selected.timeoutOperationId,
      selected.statusOperationId,
    ]).size !== 4
  ) operatorInvalid();
  return Object.freeze({
    successOperationId: selected.successOperationId!,
    declineOperationId: selected.declineOperationId!,
    replayOperationId: selected.replayOperationId!,
    timeoutOperationId: selected.timeoutOperationId!,
    statusOperationId: selected.statusOperationId!,
  });
}

function parseObservation(value: unknown): Readonly<{
  verifiedAt: string;
  maskedMerchantSuffix: string;
  cases: readonly PaytrIframeSandboxEvidenceCase[];
}> {
  const parsed = exact(value, OBSERVATION_KEYS);
  if (
    typeof parsed.maskedMerchantSuffix !== "string"
    || !/^…[A-Za-z0-9]{2,8}$/.test(parsed.maskedMerchantSuffix)
  ) invalid();
  return Object.freeze({
    verifiedAt: timestamp(parsed.verifiedAt),
    maskedMerchantSuffix: parsed.maskedMerchantSuffix,
    cases: parseCases(parsed.cases),
  });
}

export function createPaytrIframeSandboxEvidenceRunner(
  dependencies: EvidenceRunnerDependencies,
) {
  let used = false;
  return Object.freeze({
    async run(input: Readonly<{
      source: Environment;
      argv?: readonly string[];
    }>): Promise<
      PaytrIframeSandboxEvidence
      | Readonly<{ kind: "disabled" }>
      | Readonly<{
        kind: "dry_run";
        testMode: true;
        callbackPath: typeof CALLBACK_PATH;
      }>
      | Readonly<{ kind: "already_run" }>
    > {
      const mode = resolvePaytrIframeSandboxEvidenceMode(input.source);
      if (mode === "disabled") return Object.freeze({ kind: "disabled" });
      if (mode === "dry_run") {
        return Object.freeze({
          kind: "dry_run",
          testMode: true,
          callbackPath: CALLBACK_PATH,
        });
      }
      let authorityOverride = false;
      try {
        authorityOverride =
          input.source.CELEBIX_PAYTR_IFRAME_EVIDENCE_ORIGIN !== undefined
          || input.source.CELEBIX_PAYTR_STAGING_CALLBACK_URL !== undefined
          || input.source.CELEBIX_PAYTR_STAGING_ORIGIN !== undefined;
      } catch {
        return incomplete();
      }
      if (authorityOverride) {
        throw new Error(OPERATOR_INVALID);
      }
      if (used) return Object.freeze({ kind: "already_run" });
      used = true;
      try {
        const operatorSource = Object.freeze({
          CELEBIX_PAYTR_IFRAME_EVIDENCE_MODE:
            input.source.CELEBIX_PAYTR_IFRAME_EVIDENCE_MODE,
          CELEBIX_SAAS_DATABASE_URL:
            input.source.CELEBIX_SAAS_DATABASE_URL,
          CELEBIX_SAAS_DATABASE_NAME:
            input.source.CELEBIX_SAAS_DATABASE_NAME,
          CELEBIX_PAYTR_STAGING_MERCHANT_ID:
            input.source.CELEBIX_PAYTR_STAGING_MERCHANT_ID,
          CELEBIX_PAYTR_STAGING_MERCHANT_KEY:
            input.source.CELEBIX_PAYTR_STAGING_MERCHANT_KEY,
          CELEBIX_PAYTR_STAGING_MERCHANT_SALT:
            input.source.CELEBIX_PAYTR_STAGING_MERCHANT_SALT,
          CELEBIX_PAYTR_STAGING_TEST_MODE:
            input.source.CELEBIX_PAYTR_STAGING_TEST_MODE,
          SOURCE_COMMIT: input.source.SOURCE_COMMIT,
        });
        const testedGitSha = await dependencies.testedGitSha(operatorSource);
        const packetDigest = await dependencies.packetDigest();
        if (
          typeof testedGitSha !== "string"
          || !GIT_SHA.test(testedGitSha)
          || typeof packetDigest !== "string"
          || !SHA256.test(packetDigest)
        ) incomplete();
        const fixedInput = Object.freeze({
          environment: "test" as const,
          testMode: 1 as const,
          stagingOrigin: STAGING_ORIGIN,
          callbackUrl: `${STAGING_ORIGIN}${CALLBACK_PATH}` as const,
          officialDocumentationUrls: OFFICIAL_DOCUMENTATION,
        });
        const observation = parseObservation(
          await dependencies.execute(fixedInput, Object.freeze({
            source: operatorSource,
            argv: input.argv ?? Object.freeze([]),
          })),
        );
        return parsePaytrIframeSandboxEvidence({
          schemaVersion: 1,
          providerCode: "paytr_iframe",
          capability: "payment_processing",
          environment: "test",
          adapterVersion: 1,
          testedGitSha,
          packetDigest,
          officialDocumentationUrls: OFFICIAL_DOCUMENTATION,
          verifiedAt: observation.verifiedAt,
          maskedMerchantSuffix: observation.maskedMerchantSuffix,
          cases: observation.cases,
          testMode: true,
          realMoney: false,
          rawCardCaptured: false,
          secretsCaptured: false,
        });
      } catch {
        return incomplete();
      }
    },
  });
}

function requiredOperatorValue(
  source: Environment,
  name: string,
  maximum: number,
): string {
  const value = source[name];
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > maximum
    || value !== value.trim()
    || CONTROL.test(value)
  ) incomplete();
  return value;
}

function operatorDatabaseUrl(source: Environment): string {
  const name = requiredOperatorValue(
    source,
    "CELEBIX_SAAS_DATABASE_NAME",
    63,
  );
  if (!DATABASE.test(name)) incomplete();
  const value = requiredOperatorValue(
    source,
    "CELEBIX_SAAS_DATABASE_URL",
    4_096,
  );
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return incomplete();
  }
  if (
    (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:")
    || !parsed.username
    || !parsed.password
    || !parsed.hostname
    || parsed.hash
    || decodeURIComponent(parsed.pathname) !== `/${name}`
    || parsed.search !== "?sslmode=require"
    || parsed.toString() !== value
  ) incomplete();
  return value;
}

function operatorCredential(source: Environment): OperatorCredential {
  return {
    merchantId: requiredOperatorValue(
      source,
      "CELEBIX_PAYTR_STAGING_MERCHANT_ID",
      128,
    ),
    merchantKey: requiredOperatorValue(
      source,
      "CELEBIX_PAYTR_STAGING_MERCHANT_KEY",
      256,
    ),
    merchantSalt: requiredOperatorValue(
      source,
      "CELEBIX_PAYTR_STAGING_MERCHANT_SALT",
      256,
    ),
  };
}

function historyFact(value: unknown, expectedKind: HistoryKind):
OperatorHistoryFact {
  const parsed = exact(value, HISTORY_FACT_KEYS);
  const startedAt = timestamp(parsed.startedAt);
  const completedAt = timestamp(parsed.completedAt);
  if (
    parsed.kind !== expectedKind
    || typeof parsed.operationId !== "string"
    || !UUID.test(parsed.operationId)
    || typeof parsed.attemptId !== "string"
    || !UUID.test(parsed.attemptId)
    || typeof parsed.operationKind !== "string"
    || typeof parsed.resultStatus !== "string"
    || typeof parsed.attemptStatus !== "string"
    || parsed.testMode !== 1
    || typeof parsed.replayed !== "boolean"
    || typeof parsed.safeProviderReference !== "string"
    || !MERCHANT_OID.test(parsed.safeProviderReference)
    || typeof parsed.callbackDigest !== "string"
    || !HEX_DIGEST.test(parsed.callbackDigest)
    || !Number.isSafeInteger(parsed.amountMinor)
    || Number(parsed.amountMinor) < 1
    || parsed.currency !== "TRY"
    || typeof parsed.sawUnknown !== "boolean"
    || typeof parsed.sawReconciledCaptured !== "boolean"
    || Date.parse(completedAt) < Date.parse(startedAt)
  ) invalid();
  return Object.freeze({
    kind: expectedKind,
    operationId: parsed.operationId,
    attemptId: parsed.attemptId,
    operationKind: parsed.operationKind,
    resultStatus: parsed.resultStatus,
    attemptStatus: parsed.attemptStatus,
    testMode: 1,
    replayed: parsed.replayed,
    safeProviderReference: parsed.safeProviderReference,
    callbackDigest: parsed.callbackDigest,
    startedAt,
    completedAt,
    amountMinor: Number(parsed.amountMinor),
    currency: "TRY",
    sawUnknown: parsed.sawUnknown,
    sawReconciledCaptured: parsed.sawReconciledCaptured,
  });
}

function replayInput(value: unknown): OperatorReplayInput {
  const parsed = exact(value, REPLAY_INPUT_KEYS);
  if (
    typeof parsed.merchantOid !== "string"
    || !MERCHANT_OID.test(parsed.merchantOid)
    || !Number.isSafeInteger(parsed.totalAmount)
    || Number(parsed.totalAmount) < 1
    || Number(parsed.totalAmount) > Number.MAX_SAFE_INTEGER
    || (parsed.paymentType !== "card" && parsed.paymentType !== "eft")
  ) invalid();
  return Object.freeze({
    merchantOid: parsed.merchantOid,
    totalAmount: Number(parsed.totalAmount),
    paymentType: parsed.paymentType,
  });
}

function parseHistory(
  value: unknown,
  selectors: PaytrIframeSandboxEvidenceSelectors,
): OperatorHistory {
  const parsed = exact(value, HISTORY_KEYS);
  const rawFacts = denseArray(
    parsed.facts,
    HISTORY_KINDS.length,
    HISTORY_KINDS.length,
  );
  const facts = Object.freeze(HISTORY_KINDS.map((kind, index) =>
    historyFact(rawFacts[index], kind)));
  const selectedReplayInput = replayInput(parsed.replayInput);
  const [success, decline, replay, timeout, status] = facts;
  const selectedIds = [
    selectors.successOperationId,
    selectors.declineOperationId,
    selectors.replayOperationId,
    selectors.timeoutOperationId,
    selectors.statusOperationId,
  ];
  if (
    parsed.successSettlementCount !== 1
    || parsed.successReceiptCount !== 1
    || !success
    || !decline
    || !replay
    || !timeout
    || !status
    || facts.some((fact, index) => fact.operationId !== selectedIds[index])
    || success.operationKind !== "settle_callback"
    || success.resultStatus !== "success"
    || success.attemptStatus !== "succeeded"
    || success.replayed
    || success.sawUnknown
    || success.sawReconciledCaptured
    || decline.operationKind !== "settle_callback"
    || decline.resultStatus !== "failed"
    || decline.attemptStatus !== "failed"
    || decline.replayed
    || decline.sawUnknown
    || decline.sawReconciledCaptured
    || replay.operationKind !== "settle_callback"
    || replay.resultStatus !== "success"
    || replay.attemptStatus !== "succeeded"
    || replay.replayed
    || replay.operationId !== success.operationId
    || replay.attemptId !== success.attemptId
    || replay.safeProviderReference !== success.safeProviderReference
    || replay.callbackDigest !== success.callbackDigest
    || replay.sawUnknown
    || replay.sawReconciledCaptured
    || timeout.operationKind !== "initiation_unknown"
    || timeout.resultStatus !== "initiation_unknown"
    || timeout.attemptStatus !== "succeeded"
    || timeout.replayed
    || !timeout.sawUnknown
    || timeout.sawReconciledCaptured
    || status.operationKind !== "reconcile_success"
    || status.resultStatus !== "success"
    || status.attemptStatus !== "succeeded"
    || status.replayed
    || !status.sawUnknown
    || !status.sawReconciledCaptured
    || status.attemptId !== timeout.attemptId
    || status.safeProviderReference !== timeout.safeProviderReference
    || decline.attemptId === timeout.attemptId
    || success.attemptId === decline.attemptId
    || success.attemptId === timeout.attemptId
    || selectedReplayInput.merchantOid !== success.safeProviderReference
    || selectedReplayInput.totalAmount < success.amountMinor
  ) invalid();
  return Object.freeze({
    successSettlementCount: 1,
    successReceiptCount: 1,
    replayInput: selectedReplayInput,
    facts,
  });
}

function parseReplayResult(value: unknown): Readonly<{ kind: "replayed" }> {
  const parsed = exact(value, REPLAY_RESULT_KEYS);
  if (parsed.kind !== "replayed") invalid();
  return Object.freeze({ kind: "replayed" });
}

function canonicalHistory(value: OperatorHistory): string {
  return JSON.stringify(value);
}

function parseStatusFacts(value: unknown): Readonly<{
  success: "succeeded";
  decline: "unknown";
  status: "succeeded";
}> {
  const parsed = exact(value, STATUS_KEYS);
  if (
    parsed.success !== "succeeded"
    || parsed.decline !== "unknown"
    || parsed.status !== "succeeded"
  ) invalid();
  return Object.freeze({
    success: "succeeded",
    decline: "unknown",
    status: "succeeded",
  });
}

function safeReferenceDigest(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function evidenceCaseFromHistory(
  fact: OperatorHistoryFact,
  expected: typeof REQUIRED_CASES[number],
): PaytrIframeSandboxEvidenceCase {
  return Object.freeze({
    caseId: expected.caseId,
    operationId: fact.operationId,
    attemptId: fact.attemptId,
    safeProviderReferenceDigest: safeReferenceDigest(
      fact.safeProviderReference,
    ),
    resultClass: expected.resultClass,
    callbackDigest: `sha256:${fact.callbackDigest}`,
    startedAt: fact.startedAt,
    completedAt: fact.completedAt,
  });
}

function wipeOperatorCredential(credential: OperatorCredential): void {
  for (const key of ["merchantId", "merchantKey", "merchantSalt"]) {
    try {
      Reflect.set(credential, key, "");
    } catch {
      // Best effort; operator values are never logged or placed in the artifact.
    }
  }
}

export function createPaytrIframeSandboxEvidenceOperator(
  dependencies: EvidenceOperatorDependencies,
): EvidenceRunnerDependencies["execute"] {
  return async (fixed, operator) => {
    if (
      fixed.environment !== "test"
      || fixed.testMode !== 1
      || fixed.stagingOrigin !== STAGING_ORIGIN
      || fixed.callbackUrl !== `${STAGING_ORIGIN}${CALLBACK_PATH}`
      || fixed.officialDocumentationUrls !== OFFICIAL_DOCUMENTATION
    ) incomplete();
    const selectors = parsePaytrIframeSandboxEvidenceSelectors(operator.argv);
    if (operator.source.CELEBIX_PAYTR_STAGING_TEST_MODE !== "1") incomplete();
    const databaseUrl = operatorDatabaseUrl(operator.source);
    const credential = operatorCredential(operator.source);
    try {
      const history = parseHistory(
        await dependencies.readHistory({ databaseUrl, selectors }),
        selectors,
      );
      const [success] = history.facts;
      if (!success) incomplete();
      parseReplayResult(await dependencies.replayCallback({
        credential,
        success,
        replayInput: history.replayInput,
      }));
      const historyAfterReplay = parseHistory(
        await dependencies.readHistory({ databaseUrl, selectors }),
        selectors,
      );
      if (canonicalHistory(history) !== canonicalHistory(historyAfterReplay)) {
        incomplete();
      }
      const [, decline, , , status] = historyAfterReplay.facts;
      if (!success || !decline || !status) incomplete();
      parseStatusFacts(await dependencies.queryStatuses({
        credential,
        success,
        decline,
        status,
      }));
      const verifiedAt = dependencies.now();
      if (
        !(verifiedAt instanceof Date)
        || !Number.isFinite(verifiedAt.getTime())
      ) incomplete();
      const suffix = credential.merchantId.slice(-4);
      if (!/^[A-Za-z0-9]{2,8}$/.test(suffix)) incomplete();
      return Object.freeze({
        verifiedAt: verifiedAt.toISOString(),
        maskedMerchantSuffix: `…${suffix}`,
        cases: Object.freeze(historyAfterReplay.facts.map((fact, index) =>
          evidenceCaseFromHistory(fact, REQUIRED_CASES[index]!))),
      });
    } finally {
      wipeOperatorCredential(credential);
    }
  };
}

async function exactReplayResponse(response: Response): Promise<void> {
  if (
    !(response instanceof Response)
    || response.status !== 200
    || response.redirected
    || response.headers.has("location")
    || response.headers.get("content-type") !== "text/plain; charset=utf-8"
  ) incomplete();
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null && contentLength !== "2") incomplete();
  if (response.body === null) incomplete();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const selected = await reader.read();
      if (selected.done) break;
      if (!(selected.value instanceof Uint8Array)) incomplete();
      total += selected.value.byteLength;
      if (total > 2) {
        await reader.cancel().catch(() => undefined);
        incomplete();
      }
      chunks.push(selected.value);
    }
    if (total !== 2) incomplete();
    const bytes = new Uint8Array(2);
    try {
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      if (new TextDecoder("utf-8", { fatal: true }).decode(bytes) !== "OK") {
        incomplete();
      }
    } finally {
      bytes.fill(0);
    }
  } finally {
    for (const chunk of chunks) chunk.fill(0);
    reader.releaseLock();
  }
}

type EvidenceFetch = (request: Request) => Promise<Response>;
type EvidenceBodyDigest = (bytes: Uint8Array) => string;

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function exactReplayBodyBytes(
  fields: readonly (readonly [string, string])[],
  expectedDigest: string,
  deriveDigest: EvidenceBodyDigest,
): Uint8Array<ArrayBuffer> {
  const order = fields.map((_, index) => index);
  let matched: Uint8Array<ArrayBuffer> | undefined;
  let ambiguous = false;
  const visit = (depth: number): void => {
    if (ambiguous) return;
    if (depth === order.length) {
      const bytes = new TextEncoder().encode(new URLSearchParams(
        order.map((index) => [...fields[index]!]),
      ).toString());
      let keep = false;
      try {
        if (deriveDigest(bytes) === expectedDigest) {
          if (matched !== undefined) {
            matched.fill(0);
            matched = undefined;
            ambiguous = true;
          } else {
            matched = bytes;
            keep = true;
          }
        }
      } finally {
        if (!keep) bytes.fill(0);
      }
      return;
    }
    for (let index = depth; index < order.length; index += 1) {
      [order[depth], order[index]] = [order[index]!, order[depth]!];
      visit(depth + 1);
      [order[depth], order[index]] = [order[index]!, order[depth]!];
      if (ambiguous) return;
    }
  };
  try {
    visit(0);
    if (ambiguous || matched === undefined) incomplete();
    return matched;
  } catch {
    matched?.fill(0);
    return incomplete();
  } finally {
    order.fill(0);
  }
}

export function createPaytrIframeSandboxDuplicateCallbackReplay(
  fetcher: EvidenceFetch = (request) => globalThis.fetch(request),
  deriveDigest: EvidenceBodyDigest = sha256Hex,
) {
  return async (input: Readonly<{
    credential: OperatorCredential;
    success: Readonly<{ callbackDigest: string }>;
    replayInput: OperatorReplayInput;
  }>): Promise<Readonly<{ kind: "replayed" }>> => {
    let bodyBytes: Uint8Array<ArrayBuffer> | undefined;
    try {
      if (!HEX_DIGEST.test(input.success.callbackDigest)) incomplete();
      const totalAmount = String(input.replayInput.totalAmount);
      const hash = createPaytrIframeCallbackHash({
        credential: input.credential,
        merchantOid: input.replayInput.merchantOid,
        status: "success",
        totalAmount,
      });
      const fields: readonly (readonly [string, string])[] = Object.freeze([
        Object.freeze(["merchant_oid", input.replayInput.merchantOid] as const),
        Object.freeze(["status", "success"] as const),
        Object.freeze(["total_amount", totalAmount] as const),
        Object.freeze(["hash", hash] as const),
        Object.freeze(["payment_type", input.replayInput.paymentType] as const),
        Object.freeze(["test_mode", "1"] as const),
      ]);
      bodyBytes = exactReplayBodyBytes(
        fields,
        input.success.callbackDigest,
        deriveDigest,
      );
      const request = new Request(`${STAGING_ORIGIN}${CALLBACK_PATH}`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: bodyBytes,
        redirect: "manual",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      });
      await exactReplayResponse(await fetcher(request));
      return Object.freeze({ kind: "replayed" });
    } catch {
      return incomplete();
    } finally {
      bodyBytes?.fill(0);
    }
  };
}

async function readHistoryFromPostgres(input: Readonly<{
  databaseUrl: string;
  selectors: PaytrIframeSandboxEvidenceSelectors;
}>): Promise<unknown> {
  const { Pool } = pg;
  const pool = new Pool({
    connectionString: input.databaseUrl,
    max: 1,
    connectionTimeoutMillis: 2_000,
    idleTimeoutMillis: 2_000,
    statement_timeout: 5_000,
    lock_timeout: 2_000,
    idle_in_transaction_session_timeout: 5_000,
    application_name: "celebix-paytr-evidence-read-only",
  });
  pool.on("error", () => undefined);
  let client: PoolClient | undefined;
  try {
    const connected = await pool.connect();
    client = connected;
    await connected.query(
      "BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY",
    );
    await connected.query("SET LOCAL ROLE celebix_saas_app");
    const result = await connected.query<Record<string, unknown>>({
      text: `SELECT outcome,result_payload
        FROM saas.paytr_iframe_sandbox_evidence_history($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid)`,
      values: [
        input.selectors.successOperationId,
        input.selectors.declineOperationId,
        input.selectors.replayOperationId,
        input.selectors.timeoutOperationId,
        input.selectors.statusOperationId,
      ],
    });
    const row = result.rows[0];
    if (
      result.rowCount !== 1
      || row?.outcome !== "found"
      || row.result_payload === null
      || typeof row.result_payload !== "object"
    ) incomplete();
    return row.result_payload;
  } finally {
    await client?.query("ROLLBACK").catch(() => undefined);
    client?.release();
    await pool.end().catch(() => undefined);
  }
}

async function queryOfficialStatuses(input: Readonly<{
  credential: OperatorCredential;
  success: OperatorHistoryFact;
  decline: OperatorHistoryFact;
  status: OperatorHistoryFact;
}>): Promise<unknown> {
  const transport = createBoundedProviderTransport({
    fetch: (request) => globalThis.fetch(request),
    timeoutMs: 5_000,
    maximumResponseBytes: 262_144,
  });
  async function query(fact: OperatorHistoryFact): Promise<string> {
    const result = await queryPaytrIframeWithTransport(transport, {
      environment: "test",
      credential: input.credential,
      merchantOid: fact.safeProviderReference,
      signal: AbortSignal.timeout(5_000),
    });
    return result.status === "success"
      && result.paymentAmount === fact.amountMinor
      && result.currency === fact.currency
      && result.testMode === 1
      ? "succeeded"
      : "unknown";
  }
  return {
    success: await query(input.success),
    decline: await query(input.decline),
    status: await query(input.status),
  };
}

export async function derivePaytrIframeTestedGitSha(
  source: Environment,
): Promise<string> {
  const value = source.SOURCE_COMMIT;
  if (typeof value !== "string") incomplete();
  if (!GIT_SHA.test(value)) incomplete();
  return value;
}

export async function derivePaytrIframePacketDigest(): Promise<string> {
  const canonicalPacket = JSON.stringify(PAYTR_IFRAME_PACKET);
  return `sha256:${createHash("sha256")
    .update(canonicalPacket)
    .digest("hex")}`;
}

const concreteOperator = createPaytrIframeSandboxEvidenceOperator({
  readHistory: readHistoryFromPostgres,
  replayCallback: createPaytrIframeSandboxDuplicateCallbackReplay(),
  queryStatuses: queryOfficialStatuses,
  now: () => new Date(),
});

const defaultRunner = createPaytrIframeSandboxEvidenceRunner({
  execute: concreteOperator,
  testedGitSha: derivePaytrIframeTestedGitSha,
  packetDigest: derivePaytrIframePacketDigest,
});

export async function runPaytrIframeSandboxEvidence(input: Readonly<{
  source: Environment;
  argv?: readonly string[];
}>) {
  return defaultRunner.run(input);
}

export async function mainPaytrIframeSandboxEvidence(input: Readonly<{
  source?: Environment;
  argv?: readonly string[];
  write?(value: string): void;
  writeError?(value: string): void;
}> = {}): Promise<number> {
  const write = input.write ?? ((value: string) => process.stdout.write(value));
  const writeError = input.writeError
    ?? ((value: string) => process.stderr.write(value));
  try {
    const result = await runPaytrIframeSandboxEvidence({
      source: input.source ?? process.env,
      argv: input.argv ?? process.argv.slice(2),
    });
    write(
      ("schemaVersion" in result
        ? canonicalPaytrIframeSandboxEvidence(result)
        : JSON.stringify(result)) + "\n",
    );
    return 0;
  } catch {
    writeError(`${INCOMPLETE}\n`);
    return 1;
  }
}

const invokedPath = process.argv[1];
if (
  typeof invokedPath === "string"
  && import.meta.url === pathToFileURL(invokedPath).href
) {
  process.exitCode = await mainPaytrIframeSandboxEvidence();
}
