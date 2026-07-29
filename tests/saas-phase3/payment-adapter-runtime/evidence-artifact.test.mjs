import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  PAYTR_IFRAME_PACKET,
  createPaytrIframeCallbackHash,
} from "@celebix/payment-adapters";

import {
  canonicalPaytrIframeSandboxEvidence,
  createPaytrIframeSandboxDuplicateCallbackReplay,
  createPaytrIframeSandboxEvidenceOperator,
  createPaytrIframeSandboxEvidenceRunner,
  derivePaytrIframePacketDigest,
  derivePaytrIframeTestedGitSha,
  parsePaytrIframeSandboxEvidence,
  parsePaytrIframeSandboxEvidenceSelectors,
  resolvePaytrIframeSandboxEvidenceMode,
  runPaytrIframeSandboxEvidence,
} from "../../../apps/owner/scripts/paytr-iframe-sandbox-evidence.ts";

const DIGEST_A = `sha256:${"a".repeat(64)}`;
const DIGEST_B = `sha256:${"b".repeat(64)}`;
const DIGEST_C = `sha256:${"c".repeat(64)}`;
const DIGEST_D = `sha256:${"d".repeat(64)}`;
const UUIDS = Object.freeze([
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
  "10000000-0000-4000-8000-000000000003",
  "10000000-0000-4000-8000-000000000004",
  "10000000-0000-4000-8000-000000000005",
]);
const CASE_IDS = Object.freeze([
  "successful_iframe_signed_callback",
  "provider_declined",
  "duplicate_callback_replay",
  "query_after_write_timeout",
  "official_status_query",
]);

function evidence() {
  const cases = CASE_IDS.map((caseId, index) => ({
    caseId,
    operationId: UUIDS[index],
    attemptId: UUIDS[index],
    safeProviderReferenceDigest: [DIGEST_B, DIGEST_C, DIGEST_B, DIGEST_D, DIGEST_D][index],
    resultClass: [
      "captured",
      "provider_declined",
      "callback_replayed",
      "captured_after_query",
      "status_verified",
    ][index],
    callbackDigest: [DIGEST_A, DIGEST_B, DIGEST_A, DIGEST_C, DIGEST_C][index],
    startedAt: `2026-07-27T12:0${index}:00.000Z`,
    completedAt: `2026-07-27T12:0${index}:30.000Z`,
  }));
  cases[2].attemptId = cases[0].attemptId;
  cases[2].operationId = cases[0].operationId;
  cases[4].attemptId = cases[3].attemptId;
  return {
    schemaVersion: 1,
    providerCode: "paytr_iframe",
    capability: "payment_processing",
    environment: "test",
    adapterVersion: 1,
    testedGitSha: "1".repeat(40),
    packetDigest: DIGEST_A,
    officialDocumentationUrls: [
      "https://dev.paytr.com/iframe-api",
      "https://dev.paytr.com/durum-sorgu",
    ],
    verifiedAt: "2026-07-27T12:30:00.000Z",
    maskedMerchantSuffix: "…1234",
    cases,
    testMode: true,
    realMoney: false,
    rawCardCaptured: false,
    secretsCaptured: false,
  };
}

function observation() {
  const value = evidence();
  return {
    verifiedAt: value.verifiedAt,
    maskedMerchantSuffix: value.maskedMerchantSuffix,
    cases: value.cases,
  };
}

function evidenceRunner(execute) {
  return createPaytrIframeSandboxEvidenceRunner({
    execute,
    async testedGitSha() {
      return "1".repeat(40);
    },
    async packetDigest() {
      return DIGEST_A;
    },
  });
}

const SELECTOR_ARGUMENTS = Object.freeze([
  `--success-operation-id=${UUIDS[0]}`,
  `--decline-operation-id=${UUIDS[1]}`,
  `--replay-operation-id=${UUIDS[0]}`,
  `--timeout-operation-id=${UUIDS[3]}`,
  `--status-operation-id=${UUIDS[4]}`,
]);

test("strict evidence validator accepts only the complete bounded secret-free schema", () => {
  const parsed = parsePaytrIframeSandboxEvidence(evidence());
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.cases), true);
  assert.deepEqual(parsed.cases.map(({ caseId }) => caseId), CASE_IDS);
  assert.equal(canonicalPaytrIframeSandboxEvidence(parsed), JSON.stringify(parsed));

  for (const unsafe of [
    { ...evidence(), merchantKey: "forbidden" },
    { ...evidence(), testMode: false },
    { ...evidence(), realMoney: true },
    { ...evidence(), rawCardCaptured: true },
    { ...evidence(), secretsCaptured: true },
    { ...evidence(), cases: evidence().cases.slice(0, 4) },
    { ...evidence(), officialDocumentationUrls: ["https://example.com/paytr"] },
  ]) {
    assert.throws(
      () => parsePaytrIframeSandboxEvidence(unsafe),
      /paytr_iframe_sandbox_evidence_invalid/,
    );
  }
});

test("strict evidence validator rejects proxied sparse and accessor-backed arrays without invoking accessors", () => {
  let accessorReads = 0;
  const accessorCases = [...evidence().cases];
  Object.defineProperty(accessorCases, "0", {
    enumerable: true,
    get() {
      accessorReads += 1;
      return evidence().cases[0];
    },
  });
  const sparseCases = [...evidence().cases];
  delete sparseCases[2];
  for (const unsafe of [
    { ...evidence(), cases: new Proxy([...evidence().cases], {}) },
    { ...evidence(), officialDocumentationUrls: new Proxy([...evidence().officialDocumentationUrls], {}) },
    { ...evidence(), cases: sparseCases },
    { ...evidence(), cases: accessorCases },
  ]) {
    assert.throws(
      () => parsePaytrIframeSandboxEvidence(unsafe),
      /paytr_iframe_sandbox_evidence_invalid/,
    );
  }
  assert.equal(accessorReads, 0);
});

test("strict evidence validator binds replay and official query facts to their underlying attempts", () => {
  const unsafeArtifacts = [];
  for (const mutate of [
    (value) => { value.cases[2].attemptId = UUIDS[2]; },
    (value) => { value.cases[2].operationId = UUIDS[2]; },
    (value) => { value.cases[2].callbackDigest = DIGEST_D; },
    (value) => { value.cases[2].safeProviderReferenceDigest = DIGEST_D; },
    (value) => { value.cases[3].attemptId = value.cases[1].attemptId; },
    (value) => { value.cases[4].attemptId = UUIDS[4]; },
    (value) => { value.cases[4].safeProviderReferenceDigest = DIGEST_A; },
    (value) => { value.verifiedAt = "2026-07-27T12:03:00.000Z"; },
  ]) {
    const value = evidence();
    mutate(value);
    unsafeArtifacts.push(value);
  }
  for (const unsafe of unsafeArtifacts) {
    assert.throws(
      () => parsePaytrIframeSandboxEvidence(unsafe),
      /paytr_iframe_sandbox_evidence_invalid/,
    );
  }
});

test("evidence runner is disabled by default and dry-run never reads credentials or network", async () => {
  assert.equal(resolvePaytrIframeSandboxEvidenceMode({}), "disabled");
  assert.equal(
    resolvePaytrIframeSandboxEvidenceMode({
      CELEBIX_PAYTR_IFRAME_EVIDENCE_MODE: "dry_run",
    }),
    "dry_run",
  );
  for (const value of ["enabled", "operator_test", " dry_run", "dry_run "]) {
    assert.equal(
      resolvePaytrIframeSandboxEvidenceMode({
        CELEBIX_PAYTR_IFRAME_EVIDENCE_MODE: value,
      }),
      "disabled",
    );
  }

  let sensitiveReads = 0;
  const source = new Proxy({
    CELEBIX_PAYTR_IFRAME_EVIDENCE_MODE: "dry_run",
  }, {
    get(target, property, receiver) {
      if (typeof property === "string" && /MERCHANT|DATABASE|KEY|SALT|SECRET/.test(property)) {
        sensitiveReads += 1;
        throw new Error("sensitive_environment_must_not_be_read");
      }
      return Reflect.get(target, property, receiver);
    },
  });
  let networkCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    networkCalls += 1;
    throw new Error("network_must_not_run");
  };
  let result;
  try {
    result = await runPaytrIframeSandboxEvidence({ source });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.deepEqual(result, {
    kind: "dry_run",
    testMode: true,
    callbackPath: "/api/payments/paytr/callback",
  });
  assert.equal(sensitiveReads, 0);
  assert.equal(networkCalls, 0);
});

test("operator evidence seam executes once with fixed TEST authority and returns only the parsed artifact", async () => {
  const expected = evidence();
  const executions = [];
  const runner = evidenceRunner(async (input) => {
    executions.push(input);
    return observation();
  });
  const source = { CELEBIX_PAYTR_IFRAME_EVIDENCE_MODE: "operator_test_once" };

  const artifact = await runner.run({ source });
  assert.deepEqual(artifact, parsePaytrIframeSandboxEvidence(expected));
  assert.deepEqual(executions, [{
    environment: "test",
    testMode: 1,
    stagingOrigin: "https://pilot.saas-staging.celebix.site",
    callbackUrl: "https://pilot.saas-staging.celebix.site/api/payments/paytr/callback",
    officialDocumentationUrls: [
      "https://dev.paytr.com/iframe-api",
      "https://dev.paytr.com/durum-sorgu",
    ],
  }]);
  assert.deepEqual(await runner.run({ source }), { kind: "already_run" });
  assert.equal(executions.length, 1);
});

test("operator evidence seam rejects origin overrides and contains unsafe executor output without logging", async () => {
  let executions = 0;
  const runner = evidenceRunner(async () => {
    executions += 1;
    return {
      ...observation(),
      token: "provider-token-must-not-escape",
      testedGitSha: "f".repeat(40),
    };
  });
  await assert.rejects(
    runner.run({
      source: {
        CELEBIX_PAYTR_IFRAME_EVIDENCE_MODE: "operator_test_once",
        CELEBIX_PAYTR_IFRAME_EVIDENCE_ORIGIN: "https://merchant.example",
      },
    }),
    /paytr_iframe_sandbox_evidence_operator_invalid/,
  );
  assert.equal(executions, 0);
  const unsafeOutputRunner = evidenceRunner(async () => {
    executions += 1;
    return {
      ...observation(),
      token: "provider-token-must-not-escape",
      testedGitSha: "f".repeat(40),
    };
  });
  await assert.rejects(
    unsafeOutputRunner.run({
      source: { CELEBIX_PAYTR_IFRAME_EVIDENCE_MODE: "operator_test_once" },
    }),
    /paytr_iframe_sandbox_evidence_incomplete/,
  );
  assert.equal(executions, 1);
});

test("operator evidence seam contains every foreign failure behind one opaque error", async () => {
  const runner = evidenceRunner(async () => {
    throw new Error("provider-response-with-secret");
  });
  await assert.rejects(
    runner.run({
      source: { CELEBIX_PAYTR_IFRAME_EVIDENCE_MODE: "operator_test_once" },
    }),
    (error) => {
      assert.equal(error.message, "paytr_iframe_sandbox_evidence_incomplete");
      assert.doesNotMatch(error.message, /provider-response|secret/);
      return true;
    },
  );
});

test("operator selectors are five exact UUID flags with no positional or duplicate input", () => {
  assert.deepEqual(parsePaytrIframeSandboxEvidenceSelectors(SELECTOR_ARGUMENTS), {
    successOperationId: UUIDS[0],
    declineOperationId: UUIDS[1],
    replayOperationId: UUIDS[0],
    timeoutOperationId: UUIDS[3],
    statusOperationId: UUIDS[4],
  });
  for (const unsafe of [
    SELECTOR_ARGUMENTS.slice(0, 4),
    [...SELECTOR_ARGUMENTS, "--artifact=/tmp/evidence.json"],
    [...SELECTOR_ARGUMENTS.slice(0, 4), SELECTOR_ARGUMENTS[0]],
    SELECTOR_ARGUMENTS.map((value, index) =>
      index === 2 ? `--replay-operation-id=${UUIDS[2]}` : value),
    SELECTOR_ARGUMENTS.map((value, index) =>
      index === 0 ? "--success-operation-id=not-a-uuid" : value),
  ]) {
    assert.throws(
      () => parsePaytrIframeSandboxEvidenceSelectors(unsafe),
      /paytr_iframe_sandbox_evidence_operator_invalid/,
    );
  }
});

test("packet digest is derived from the canonical actual packet value", async () => {
  assert.equal(
    await derivePaytrIframePacketDigest(),
    `sha256:${createHash("sha256")
      .update(JSON.stringify(PAYTR_IFRAME_PACKET))
      .digest("hex")}`,
  );
});

test("tested SHA comes only from exact image SOURCE_COMMIT before operator work", async () => {
  const sourceCommit = "9".repeat(40);
  let executions = 0;
  const runner = createPaytrIframeSandboxEvidenceRunner({
    async execute() {
      executions += 1;
      return observation();
    },
    testedGitSha: derivePaytrIframeTestedGitSha,
    packetDigest: derivePaytrIframePacketDigest,
  });
  const artifact = await runner.run({
    source: {
      CELEBIX_PAYTR_IFRAME_EVIDENCE_MODE: "operator_test_once",
      SOURCE_COMMIT: sourceCommit,
    },
  });
  assert.equal(artifact.testedGitSha, sourceCommit);
  assert.equal(executions, 1);

  for (const invalidSourceCommit of [undefined, "9".repeat(39), "A".repeat(40)]) {
    const calls = {
      database: 0,
      executor: 0,
      replay: 0,
      status: 0,
      network: 0,
    };
    const sensitiveReads = Object.fromEntries([
      "CELEBIX_SAAS_DATABASE_URL",
      "CELEBIX_SAAS_DATABASE_NAME",
      "CELEBIX_PAYTR_STAGING_MERCHANT_ID",
      "CELEBIX_PAYTR_STAGING_MERCHANT_KEY",
      "CELEBIX_PAYTR_STAGING_MERCHANT_SALT",
      "CELEBIX_PAYTR_STAGING_TEST_MODE",
    ].map((name) => [name, 0]));
    const operator = createPaytrIframeSandboxEvidenceOperator({
      async readHistory() {
        calls.database += 1;
        throw new Error("must_not_read_database");
      },
      async replayCallback() {
        calls.replay += 1;
        throw new Error("must_not_replay");
      },
      async queryStatuses() {
        calls.status += 1;
        throw new Error("must_not_query_status");
      },
      now() {
        return new Date("2026-07-27T12:30:00.000Z");
      },
    });
    const invalidRunner = createPaytrIframeSandboxEvidenceRunner({
      async execute(...args) {
        calls.executor += 1;
        return operator(...args);
      },
      testedGitSha: derivePaytrIframeTestedGitSha,
      packetDigest: derivePaytrIframePacketDigest,
    });
    const source = new Proxy({
      CELEBIX_PAYTR_IFRAME_EVIDENCE_MODE: "operator_test_once",
      SOURCE_COMMIT: invalidSourceCommit,
    }, {
      get(target, property, receiver) {
        if (typeof property === "string" && property in sensitiveReads) {
          sensitiveReads[property] += 1;
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      calls.network += 1;
      throw new Error("must_not_use_network");
    };
    try {
      await assert.rejects(
        invalidRunner.run({
          source,
        }),
        /paytr_iframe_sandbox_evidence_incomplete/,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
    assert.deepEqual(calls, {
      database: 0,
      executor: 0,
      replay: 0,
      status: 0,
      network: 0,
    });
    assert.deepEqual(Object.values(sensitiveReads), [0, 0, 0, 0, 0, 0]);
  }
});

test("operator source getter failures are opaque and never reach the executor", async () => {
  for (const throwingProperty of [
    "SOURCE_COMMIT",
    "CELEBIX_PAYTR_IFRAME_EVIDENCE_ORIGIN",
    "CELEBIX_PAYTR_STAGING_MERCHANT_KEY",
  ]) {
    let executions = 0;
    const runner = evidenceRunner(async () => {
      executions += 1;
      return observation();
    });
    const source = new Proxy({
      CELEBIX_PAYTR_IFRAME_EVIDENCE_MODE: "operator_test_once",
    }, {
      get(target, property, receiver) {
        if (property === throwingProperty) {
          throw new Error("foreign-secret-getter-message");
        }
        return Reflect.get(target, property, receiver);
      },
    });
    await assert.rejects(
      runner.run({ source }),
      (error) => {
        assert.equal(error.message, "paytr_iframe_sandbox_evidence_incomplete");
        assert.doesNotMatch(error.message, /foreign|secret|getter/);
        return true;
      },
    );
    assert.equal(executions, 0);
  }
});

test("concrete operator verifies database history and official status facts before returning an observation", async () => {
  const attempts = Object.freeze({
    success: "10000000-0000-4000-8000-000000000011",
    decline: "10000000-0000-4000-8000-000000000012",
    timeout: "10000000-0000-4000-8000-000000000013",
  });
  const fact = (kind, index, overrides = {}) => ({
    kind,
    operationId: kind === "replay" ? UUIDS[0] : UUIDS[index],
    attemptId: {
      success: attempts.success,
      decline: attempts.decline,
      replay: attempts.success,
      timeout: attempts.timeout,
      status: attempts.timeout,
    }[kind],
    operationKind: {
      success: "settle_callback",
      decline: "settle_callback",
      replay: "settle_callback",
      timeout: "initiation_unknown",
      status: "reconcile_success",
    }[kind],
    resultStatus: {
      success: "success",
      decline: "failed",
      replay: "success",
      timeout: "initiation_unknown",
      status: "success",
    }[kind],
    attemptStatus: kind === "decline" ? "failed" : "succeeded",
    testMode: 1,
    replayed: false,
    safeProviderReference: {
      success: "a".repeat(32),
      decline: "b".repeat(32),
      replay: "a".repeat(32),
      timeout: "c".repeat(32),
      status: "c".repeat(32),
    }[kind],
    callbackDigest: {
      success: "d".repeat(64),
      decline: "e".repeat(64),
      replay: "d".repeat(64),
      timeout: "f".repeat(64),
      status: "f".repeat(64),
    }[kind],
    startedAt: `2026-07-27T12:0${index}:00.000Z`,
    completedAt: `2026-07-27T12:0${index}:30.000Z`,
    amountMinor: 100,
    currency: "TRY",
    sawUnknown: kind === "timeout" || kind === "status",
    sawReconciledCaptured: kind === "status",
    ...overrides,
  });
  const history = {
    successSettlementCount: 1,
    successReceiptCount: 1,
    replayInput: {
      merchantOid: "a".repeat(32),
      totalAmount: 100,
      paymentType: "card",
    },
    facts: ["success", "decline", "replay", "timeout", "status"]
      .map((kind, index) => fact(kind, index)),
  };
  const reads = [];
  const replays = [];
  const queries = [];
  const operator = createPaytrIframeSandboxEvidenceOperator({
    async readHistory(input) {
      reads.push(input);
      return history;
    },
    async replayCallback(input) {
      replays.push(input);
      return { kind: "replayed" };
    },
    async queryStatuses(input) {
      queries.push(input);
      return {
        success: "succeeded",
        decline: "unknown",
        status: "succeeded",
      };
    },
    now() {
      return new Date("2026-07-27T12:30:00.000Z");
    },
  });
  const runner = evidenceRunner(operator);
  const artifact = await runner.run({
    source: {
      CELEBIX_PAYTR_IFRAME_EVIDENCE_MODE: "operator_test_once",
      CELEBIX_SAAS_DATABASE_URL:
        "postgresql://operator:private@db.celebix.internal:5432/celebix_saas_production?sslmode=require",
      CELEBIX_SAAS_DATABASE_NAME: "celebix_saas_production",
      CELEBIX_PAYTR_STAGING_MERCHANT_ID: "merchant-1234",
      CELEBIX_PAYTR_STAGING_MERCHANT_KEY: "private-key",
      CELEBIX_PAYTR_STAGING_MERCHANT_SALT: "private-salt",
      CELEBIX_PAYTR_STAGING_TEST_MODE: "1",
    },
    argv: SELECTOR_ARGUMENTS,
  });
  assert.equal(artifact.testedGitSha, "1".repeat(40));
  assert.equal(artifact.packetDigest, DIGEST_A);
  assert.equal(artifact.maskedMerchantSuffix, "…1234");
  assert.equal(artifact.cases[2].attemptId, artifact.cases[0].attemptId);
  assert.equal(artifact.cases[4].attemptId, artifact.cases[3].attemptId);
  assert.equal(reads.length, 2);
  assert.equal(replays.length, 1);
  assert.equal(queries.length, 1);
  assert.deepEqual(replays[0].credential, {
    merchantId: "",
    merchantKey: "",
    merchantSalt: "",
  });
  assert.deepEqual(replays[0].replayInput, history.replayInput);
  assert.deepEqual(replays[0].success, history.facts[0]);
  assert.deepEqual(queries[0].credential, {
    merchantId: "",
    merchantKey: "",
    merchantSalt: "",
  });
  assert.deepEqual(reads[0].selectors,
    parsePaytrIframeSandboxEvidenceSelectors(SELECTOR_ARGUMENTS));

});

test("concrete operator rejects missing and contradictory history without provider calls", async () => {
  let providerCalls = 0;
  const operator = createPaytrIframeSandboxEvidenceOperator({
    async readHistory() {
      return {
        successSettlementCount: 2,
        successReceiptCount: 1,
        replayInput: {
          merchantOid: "a".repeat(32),
          totalAmount: 100,
          paymentType: "card",
        },
        facts: [],
      };
    },
    async replayCallback() {
      providerCalls += 1;
      throw new Error("must_not_replay");
    },
    async queryStatuses() {
      providerCalls += 1;
      throw new Error("must_not_query");
    },
    now() {
      return new Date("2026-07-27T12:30:00.000Z");
    },
  });
  const runner = evidenceRunner(operator);
  await assert.rejects(
    runner.run({
      source: {
        CELEBIX_PAYTR_IFRAME_EVIDENCE_MODE: "operator_test_once",
        CELEBIX_SAAS_DATABASE_URL:
          "postgresql://operator:private@db.celebix.internal:5432/celebix_saas_production?sslmode=require",
        CELEBIX_SAAS_DATABASE_NAME: "celebix_saas_production",
      CELEBIX_PAYTR_STAGING_MERCHANT_ID: "merchant-1234",
      CELEBIX_PAYTR_STAGING_MERCHANT_KEY: "private-key",
      CELEBIX_PAYTR_STAGING_MERCHANT_SALT: "private-salt",
      CELEBIX_PAYTR_STAGING_TEST_MODE: "1",
      },
      argv: SELECTOR_ARGUMENTS,
    }),
    /paytr_iframe_sandbox_evidence_incomplete/,
  );
  assert.equal(providerCalls, 0);
});

test("concrete operator requires exact TEST mode and rejects callback authority before database or provider work", async () => {
  let databaseReads = 0;
  let providerCalls = 0;
  const operator = createPaytrIframeSandboxEvidenceOperator({
    async readHistory() {
      databaseReads += 1;
      throw new Error("must_not_read_database");
    },
    async replayCallback() {
      providerCalls += 1;
      throw new Error("must_not_replay");
    },
    async queryStatuses() {
      providerCalls += 1;
      throw new Error("must_not_query_provider");
    },
    now() {
      return new Date("2026-07-27T12:30:00.000Z");
    },
  });
  for (const overrides of [
    { CELEBIX_PAYTR_STAGING_TEST_MODE: undefined },
    { CELEBIX_PAYTR_STAGING_TEST_MODE: "0" },
    {
      CELEBIX_PAYTR_STAGING_TEST_MODE: "1",
      CELEBIX_PAYTR_STAGING_CALLBACK_URL:
        "https://merchant.example/api/payments/paytr/callback",
    },
    {
      CELEBIX_PAYTR_STAGING_TEST_MODE: "1",
      CELEBIX_PAYTR_STAGING_ORIGIN: "https://merchant.example",
    },
    {
      CELEBIX_PAYTR_STAGING_TEST_MODE: "1",
      CELEBIX_SAAS_DATABASE_URL:
        "postgresql://operator:private@db.celebix.internal:5432/celebix_saas_production",
    },
    {
      CELEBIX_PAYTR_STAGING_TEST_MODE: "1",
      CELEBIX_SAAS_DATABASE_NAME: "wrong_database",
    },
  ]) {
    const runner = evidenceRunner(operator);
    await assert.rejects(
      runner.run({
        source: {
          CELEBIX_PAYTR_IFRAME_EVIDENCE_MODE: "operator_test_once",
          CELEBIX_SAAS_DATABASE_URL:
            "postgresql://operator:private@db.celebix.internal:5432/celebix_saas_production?sslmode=require",
          CELEBIX_SAAS_DATABASE_NAME: "celebix_saas_production",
          CELEBIX_PAYTR_STAGING_MERCHANT_ID: "merchant-1234",
          CELEBIX_PAYTR_STAGING_MERCHANT_KEY: "private-key",
          CELEBIX_PAYTR_STAGING_MERCHANT_SALT: "private-salt",
          ...overrides,
        },
        argv: SELECTOR_ARGUMENTS,
      }),
      /paytr_iframe_sandbox_evidence_incomplete|operator_invalid/,
    );
  }
  assert.equal(databaseReads, 0);
  assert.equal(providerCalls, 0);
});

test("operator-simulated duplicate callback must preserve canonical durable history", async () => {
  const fact = (kind, index) => ({
    kind,
    operationId: kind === "replay" ? UUIDS[0] : UUIDS[index],
    attemptId: kind === "success" || kind === "replay"
      ? "10000000-0000-4000-8000-000000000011"
      : kind === "decline"
        ? "10000000-0000-4000-8000-000000000012"
        : "10000000-0000-4000-8000-000000000013",
    operationKind: {
      success: "settle_callback",
      decline: "settle_callback",
      replay: "settle_callback",
      timeout: "initiation_unknown",
      status: "reconcile_success",
    }[kind],
    resultStatus: kind === "decline"
      ? "failed"
      : kind === "timeout" ? "initiation_unknown" : "success",
    attemptStatus: kind === "decline" ? "failed" : "succeeded",
    testMode: 1,
    replayed: false,
    safeProviderReference: kind === "success" || kind === "replay"
      ? "a".repeat(32)
      : kind === "decline" ? "b".repeat(32) : "c".repeat(32),
    callbackDigest: kind === "success" || kind === "replay"
      ? "d".repeat(64)
      : kind === "decline" ? "e".repeat(64) : "f".repeat(64),
    startedAt: `2026-07-27T12:0${index}:00.000Z`,
    completedAt: `2026-07-27T12:0${index}:30.000Z`,
    amountMinor: 100,
    currency: "TRY",
    sawUnknown: kind === "timeout" || kind === "status",
    sawReconciledCaptured: kind === "status",
  });
  const history = {
    successSettlementCount: 1,
    successReceiptCount: 1,
    replayInput: {
      merchantOid: "a".repeat(32),
      totalAmount: 100,
      paymentType: "card",
    },
    facts: ["success", "decline", "replay", "timeout", "status"]
      .map((kind, index) => fact(kind, index)),
  };
  let reads = 0;
  let queries = 0;
  const operator = createPaytrIframeSandboxEvidenceOperator({
    async readHistory() {
      reads += 1;
      return reads === 1
        ? history
        : { ...history, successReceiptCount: 2 };
    },
    async replayCallback() {
      return { kind: "replayed" };
    },
    async queryStatuses() {
      queries += 1;
      throw new Error("must_not_query_changed_history");
    },
    now() {
      return new Date("2026-07-27T12:30:00.000Z");
    },
  });
  await assert.rejects(
    evidenceRunner(operator).run({
      source: {
        CELEBIX_PAYTR_IFRAME_EVIDENCE_MODE: "operator_test_once",
        CELEBIX_SAAS_DATABASE_URL:
          "postgresql://operator:private@db.celebix.internal:5432/celebix_saas_production?sslmode=require",
        CELEBIX_SAAS_DATABASE_NAME: "celebix_saas_production",
        CELEBIX_PAYTR_STAGING_MERCHANT_ID: "merchant-1234",
        CELEBIX_PAYTR_STAGING_MERCHANT_KEY: "private-key",
        CELEBIX_PAYTR_STAGING_MERCHANT_SALT: "private-salt",
        CELEBIX_PAYTR_STAGING_TEST_MODE: "1",
      },
      argv: SELECTOR_ARGUMENTS,
    }),
    /paytr_iframe_sandbox_evidence_incomplete/,
  );
  assert.equal(reads, 2);
  assert.equal(queries, 0);
});

test("duplicate callback replay uses canonical signer and accepts only fixed exact OK response", async () => {
  const credential = {
    merchantId: "merchant-1234",
    merchantKey: "private-key",
    merchantSalt: "private-salt",
  };
  const replayInput = {
    merchantOid: "a".repeat(32),
    totalAmount: 100,
    paymentType: "card",
  };
  const hash = createPaytrIframeCallbackHash({
    credential,
    merchantOid: replayInput.merchantOid,
    status: "success",
    totalAmount: String(replayInput.totalAmount),
  });
  const body = new URLSearchParams({
    merchant_oid: replayInput.merchantOid,
    status: "success",
    total_amount: String(replayInput.totalAmount),
    hash,
    payment_type: replayInput.paymentType,
    test_mode: "1",
  }).toString();
  const callbackDigest = createHash("sha256").update(body).digest("hex");
  const requests = [];
  const replay = createPaytrIframeSandboxDuplicateCallbackReplay(
    async (request) => {
      requests.push({
        url: request.url,
        method: request.method,
        redirect: request.redirect,
        contentType: request.headers.get("content-type"),
        body: await request.text(),
      });
      return new Response("OK", {
        status: 200,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "content-length": "2",
        },
      });
    },
  );
  assert.deepEqual(await replay({
    credential,
    replayInput,
    success: { callbackDigest },
  }), { kind: "replayed" });
  assert.equal(requests.length, 1);
  assert.equal(
    requests[0].url,
    "https://pilot.saas-staging.celebix.site/api/payments/paytr/callback",
  );
  assert.equal(requests[0].method, "POST");
  assert.equal(requests[0].redirect, "manual");
  assert.equal(
    requests[0].contentType,
    "application/x-www-form-urlencoded",
  );
  assert.equal(requests[0].body, body);

  const reorderedBody = new URLSearchParams([
    ["test_mode", "1"],
    ["payment_type", replayInput.paymentType],
    ["hash", hash],
    ["total_amount", String(replayInput.totalAmount)],
    ["status", "success"],
    ["merchant_oid", replayInput.merchantOid],
  ]).toString();
  const reorderedRequests = [];
  const reorderedReplay = createPaytrIframeSandboxDuplicateCallbackReplay(
    async (request) => {
      reorderedRequests.push(await request.text());
      return new Response("OK", {
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    },
  );
  assert.deepEqual(await reorderedReplay({
    credential,
    replayInput,
    success: {
      callbackDigest: createHash("sha256").update(reorderedBody).digest("hex"),
    },
  }), { kind: "replayed" });
  assert.deepEqual(reorderedRequests, [reorderedBody]);

  for (const response of [
    new Response("INVALID", {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    }),
    new Response("OK", {
      status: 202,
      headers: { "content-type": "text/plain; charset=utf-8" },
    }),
    new Response("OK", {
      status: 200,
      headers: { "content-type": "text/plain" },
    }),
    new Response(null, {
      status: 302,
      headers: {
        location: "https://example.com/",
        "content-type": "text/plain; charset=utf-8",
      },
    }),
  ]) {
    const rejectReplay = createPaytrIframeSandboxDuplicateCallbackReplay(
      async () => response,
    );
    await assert.rejects(
      rejectReplay({
        credential,
        replayInput,
        success: { callbackDigest },
      }),
      /paytr_iframe_sandbox_evidence_incomplete/,
    );
  }

  let digestMismatchCalls = 0;
  await assert.rejects(
    createPaytrIframeSandboxDuplicateCallbackReplay(async () => {
      digestMismatchCalls += 1;
      return new Response("OK");
    })({
      credential,
      replayInput,
      success: { callbackDigest: "f".repeat(64) },
    }),
    /paytr_iframe_sandbox_evidence_incomplete/,
  );
  assert.equal(digestMismatchCalls, 0);

  let ambiguousCalls = 0;
  await assert.rejects(
    createPaytrIframeSandboxDuplicateCallbackReplay(
      async () => {
        ambiguousCalls += 1;
        return new Response("OK");
      },
      () => "f".repeat(64),
    )({
      credential,
      replayInput,
      success: { callbackDigest: "f".repeat(64) },
    }),
    /paytr_iframe_sandbox_evidence_incomplete/,
  );
  assert.equal(ambiguousCalls, 0);
});

test("owner and cumulative commands deterministically register the evidence and cross-layer gates", async () => {
  const [
    ownerPackage,
    ownerRunner,
    cumulativeRunner,
    evidenceScript,
    runbook,
  ] = await Promise.all([
    readFile(new URL("../../../apps/owner/package.json", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../../../apps/owner/scripts/run-tests.mjs",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../run-current-suite.mjs", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../../../apps/owner/scripts/paytr-iframe-sandbox-evidence.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../../docs/ops/payment-adapter-runtime-runbook.md",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  assert.match(ownerPackage, /"test": "node [.][/ ]?scripts[/]run-tests[.]mjs"/);
  assert.match(ownerPackage, /"evidence:paytr-sandbox"/);
  assert.match(ownerRunner, /evidence-artifact[.]test[.]mjs/);
  assert.match(cumulativeRunner, /evidence-artifact[.]test[.]mjs/);
  assert.match(cumulativeRunner, /in-process[.]test[.]mjs/);
  assert.match(cumulativeRunner, /missingRequiredCurrentTests/);
  assert.match(
    evidenceScript,
    /SET LOCAL ROLE celebix_saas_app[\s\S]*saas[.]paytr_iframe_sandbox_evidence_history\(\$1::uuid,\$2::uuid,\$3::uuid,\$4::uuid,\$5::uuid\)/,
  );
  assert.doesNotMatch(
    evidenceScript,
    /SET LOCAL ROLE celebix_saas_owner|saas[.](?:checkout_payment_attempts|checkout_callback_receipts|checkout_reconciliation_receipts|checkout_operations)/,
  );
  assert.match(evidenceScript, /queryPaytrIframeWithTransport/);
  assert.match(evidenceScript, /successReceiptCount/);
  assert.match(evidenceScript, /SOURCE_COMMIT/);
  assert.match(evidenceScript, /[?]sslmode=require/);
  assert.doesNotMatch(
    evidenceScript,
    /saas[.]payment_attempts|saas[.]payment_attempt_events|saas[.]payment_attempt_operations|createPaytrIframeAdapter|git rev-parse|orderReference/,
  );
  assert.match(runbook, /panel container/);
  assert.match(runbook, /operator-simulated signed duplicate callback/);
  assert.match(runbook, /at most the 720\s+possible orders/);
  assert.match(runbook, /byte-for-byte equal/);
  assert.match(runbook, /This is\s+not evidence that PayTR sent a second callback/);
  assert.match(
    runbook,
    /Do not copy these credentials into the\s+owner environment[.]/,
  );
  assert.doesNotMatch(runbook, /owner environment must already contain/i);
});
