import assert from "node:assert/strict";
import test from "node:test";

import {
  PaymentAttemptRepositoryError,
  PostgresPaymentAttemptRepository,
} from "./index.ts";

const STORE = "10000000-0000-4000-8000-000000000001";
const METHOD = "20000000-0000-4000-8000-000000000001";
const PROFILE = "30000000-0000-4000-8000-000000000001";
const ATTEMPT = "40000000-0000-4000-8000-000000000001";
const OPERATION = "50000000-0000-4000-8000-000000000001";
const LEASE = "60000000-0000-4000-8000-000000000001";
const FINGERPRINT = "a".repeat(64);
const CALLBACK_DIGEST = "b".repeat(64);
const EVENT_DIGEST = "c".repeat(64);
const NOW = new Date("2026-07-27T12:00:00.000Z");
const LEASE_EXPIRES_AT = new Date("2026-07-27T12:05:00.000Z");

function sealedCredentials() {
  return {
    algorithm: "A256GCM",
    ciphertext: "b3BhcXVl",
    iv: "AQEBAQEBAQEBAQEB",
    keyId: "provider.current",
    tag: "AgICAgICAgICAgICAgICAg",
    version: 1,
  };
}

function beginPayload() {
  return {
    attemptId: ATTEMPT,
    storeId: STORE,
    paymentMethodId: METHOD,
    profileId: PROFILE,
    providerCode: "fixture_provider",
    environment: "test",
    credentialVersion: 2,
    amountMinor: 12_345,
    currency: "USD",
    publicConfig: { environment: "test", accountReference: "merchant-42" },
    sealedCredentials: sealedCredentials(),
  };
}

function mutationPayload(status = "submitted", version = 3, replayed = false) {
  return {
    attemptId: ATTEMPT,
    status,
    version,
    providerReference: "provider-safe-42",
    safeCode: "accepted",
    replayed,
  };
}

function authorityPayload() {
  return {
    attemptId: ATTEMPT,
    storeId: STORE,
    paymentMethodId: METHOD,
    profileId: PROFILE,
    providerCode: "fixture_provider",
    environment: "test",
    credentialVersion: 2,
    orderReference: "order:fixture-42",
    amountMinor: 12_345,
    currency: "USD",
    status: "submitted",
    version: 3,
    providerReference: "provider-safe-42",
    publicConfig: { environment: "test", accountReference: "merchant-42" },
    sealedCredentials: sealedCredentials(),
  };
}

function claimPayload() {
  return {
    ...authorityPayload(),
    status: "reconciliation_required",
    version: 4,
    leaseId: LEASE,
    leaseOwner: "worker.fixture",
    leaseExpiresAt: LEASE_EXPIRES_AT.toISOString(),
  };
}

type Row = Record<string, unknown>;
type Response = readonly Row[] | Error;
type Responder = (text: string, values: unknown[]) => Response | Promise<Response>;

class Client {
  readonly calls: Array<{ text: string; values: unknown[] }> = [];
  readonly releases: unknown[] = [];
  private readonly responder: Responder;

  constructor(responder: Responder = () => []) {
    this.responder = responder;
  }

  async query(text: string, values: unknown[] = []) {
    this.calls.push({ text, values });
    const response = await this.responder(text, values);
    if (response instanceof Error) throw response;
    return {
      rows: [...response],
      rowCount: response.length,
      command: "SELECT",
      oid: 0,
      fields: [],
    };
  }

  release(value?: unknown) {
    this.releases.push(value);
  }
}

class Pool {
  private index = 0;
  readonly clients: Client[];
  connectCount = 0;

  constructor(clients: Client[]) {
    this.clients = clients;
  }

  async connect() {
    this.connectCount += 1;
    const selected = this.clients[this.index++];
    if (!selected) throw new Error("checkout");
    return selected;
  }
}

function repository(pool: Pool, audits: string[] = []) {
  return new PostgresPaymentAttemptRepository({
    pool,
    role: "celebix_saas_workflow",
    timeouts: {
      poolCheckoutMs: 100,
      statementMs: 500,
      lockMs: 300,
      idleTransactionMs: 700,
    },
    audit(event) {
      audits.push(event.type);
    },
  });
}

function selected(client: Client, functionName: string) {
  const call = client.calls.find(({ text }) => text.includes(`saas.${functionName}`));
  assert.ok(call, `missing ${functionName} call`);
  return call;
}

function success(functionName: string, outcome: string, payload: Row) {
  return new Client((text) =>
    text.includes(`saas.${functionName}`)
      ? [{ outcome, result_payload: payload }]
      : [],
  );
}

function beginInput() {
  return {
    authority: { storeId: STORE, now: NOW },
    operationId: ATTEMPT,
    fingerprint: FINGERPRINT,
    paymentMethodId: METHOD,
    orderReference: "order:fixture-42",
    amountMinor: 12_345,
    currency: "USD",
    callbackBindingDigest: CALLBACK_DIGEST,
  };
}

test("begin uses exact workflow transaction and returns copied frozen credential authority", async () => {
  const payload = beginPayload();
  const client = success("payment_attempt_begin", "created", payload);
  const result = await repository(new Pool([client])).begin(beginInput());

  assert.deepEqual(selected(client, "payment_attempt_begin"), {
    text: "SELECT outcome,result_payload FROM saas.payment_attempt_begin($1::uuid,$2::timestamptz,$3::uuid,$4::text,$5::uuid,$6::text,$7::bigint,$8::text,$9::text)",
    values: [STORE, NOW, ATTEMPT, FINGERPRINT, METHOD, "order:fixture-42", 12_345, "USD", CALLBACK_DIGEST],
  });
  assert.deepEqual(client.calls.slice(0, 5).map(({ text }) => text), [
    "BEGIN ISOLATION LEVEL READ COMMITTED",
    "SELECT pg_catalog.set_config('statement_timeout', $1, true)",
    "SELECT pg_catalog.set_config('lock_timeout', $1, true)",
    "SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)",
    "SET LOCAL ROLE celebix_saas_workflow",
  ]);
  assert.equal(client.calls.at(-1)?.text, "COMMIT");
  assert.deepEqual(client.releases, [undefined]);
  assert.equal(result.outcome, "created");
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.publicConfig), true);
  assert.equal(Object.isFrozen(result.sealedCredentials), true);
  assert.notEqual(result.publicConfig, payload.publicConfig);
  assert.notEqual(result.sealedCredentials, payload.sealedCredentials);
  assert.deepEqual(result.sealedCredentials, payload.sealedCredentials);
  assert.equal("callbackBindingDigest" in result, false);
  assert.equal(JSON.stringify(result).includes("merchantOid"), false);
  assert.equal(JSON.stringify(result).includes("testMode"), false);
});

test("markInitialized passes generic status, version, credential and safe fields in signature order", async () => {
  const client = success("payment_attempt_mark_initialized", "submitted", mutationPayload());
  const result = await repository(new Pool([client])).markInitialized({
    attemptId: ATTEMPT,
    operationId: OPERATION,
    fingerprint: FINGERPRINT,
    expectedVersion: 2,
    credentialVersion: 2,
    status: "submitted",
    providerReference: "provider-safe-42",
    safeCode: "accepted",
    now: NOW,
  });

  assert.deepEqual(selected(client, "payment_attempt_mark_initialized").values, [
    ATTEMPT, OPERATION, FINGERPRINT, 2, 2, "submitted", "provider-safe-42", "accepted", NOW,
  ]);
  assert.deepEqual(result, mutationPayload());
  assert.equal(Object.isFrozen(result), true);
});

test("markUnknown uses the fixed unknown transition without provider-specific restrictions", async () => {
  const projected = {
    ...mutationPayload("provider_outcome_unknown", 4),
    safeCode: "transport_outcome_unknown",
  };
  const client = success("payment_attempt_mark_unknown", "provider_outcome_unknown", projected);
  const result = await repository(new Pool([client])).markUnknown({
    attemptId: ATTEMPT,
    operationId: OPERATION,
    fingerprint: FINGERPRINT,
    expectedVersion: 3,
    credentialVersion: 2,
    providerReference: "provider-safe-42",
    safeCode: "transport_outcome_unknown",
    now: NOW,
  });

  assert.deepEqual(selected(client, "payment_attempt_mark_unknown").values, [
    ATTEMPT, OPERATION, FINGERPRINT, 3, 2, "provider-safe-42", "transport_outcome_unknown", NOW,
  ]);
  assert.deepEqual(result, projected);
});

test("legacy callback runtime accepts an exact historical markUnknown replay at freshly loaded authority", async () => {
  const historical = {
    ...mutationPayload("provider_outcome_unknown", 3, true),
    safeCode: "fraud_review",
  };
  const client = success("payment_attempt_mark_unknown", "operation_replayed", historical);
  const result = await repository(new Pool([client])).markUnknown({
    attemptId: ATTEMPT,
    operationId: OPERATION,
    fingerprint: FINGERPRINT,
    expectedVersion: 3,
    credentialVersion: 2,
    providerReference: "provider-safe-42",
    safeCode: "fraud_review",
    now: NOW,
  });

  const legacyRuntimePresentation = result.attemptId === ATTEMPT
    && result.status === "provider_outcome_unknown"
    && result.providerReference === "provider-safe-42"
    && result.safeCode === "fraud_review"
    && result.replayed
    && result.version >= 1
    && result.version <= 3
    ? "processing"
    : "rejected";
  assert.deepEqual(result, historical);
  assert.equal(legacyRuntimePresentation, "processing");
});

test("markUnknown replay bridge accepts bounded exact history but rejects future and mismatched rows", async () => {
  const exactOlder = {
    ...mutationPayload("provider_outcome_unknown", 2, true),
    safeCode: "fraud_review",
  };
  assert.deepEqual(await repository(new Pool([
    success("payment_attempt_mark_unknown", "operation_replayed", exactOlder),
  ])).markUnknown({
    attemptId: ATTEMPT,
    operationId: OPERATION,
    fingerprint: FINGERPRINT,
    expectedVersion: 3,
    credentialVersion: 2,
    providerReference: "provider-safe-42",
    safeCode: "fraud_review",
    now: NOW,
  }), exactOlder);

  for (const hostile of [
    {
      ...mutationPayload("provider_outcome_unknown", 5, true),
      safeCode: "fraud_review",
    },
    {
      ...mutationPayload("provider_outcome_unknown", 2, true),
      safeCode: "different_observation",
    },
  ]) {
    await assert.rejects(
      () => repository(new Pool([
        success("payment_attempt_mark_unknown", "operation_replayed", hostile),
      ])).markUnknown({
        attemptId: ATTEMPT,
        operationId: OPERATION,
        fingerprint: FINGERPRINT,
        expectedVersion: 3,
        credentialVersion: 2,
        providerReference: "provider-safe-42",
        safeCode: "fraud_review",
        now: NOW,
      }),
      (error: unknown) => error instanceof PaymentAttemptRepositoryError
        && error.code === "unavailable",
    );
  }

  await assert.rejects(
    () => repository(new Pool([
      success("payment_attempt_mark_initialized", "operation_replayed", {
        ...mutationPayload("submitted", 3, true),
      }),
    ])).markInitialized({
      attemptId: ATTEMPT,
      operationId: OPERATION,
      fingerprint: FINGERPRINT,
      expectedVersion: 3,
      credentialVersion: 2,
      status: "submitted",
      providerReference: "provider-safe-42",
      safeCode: "accepted",
      now: NOW,
    }),
    (error: unknown) => error instanceof PaymentAttemptRepositoryError
      && error.code === "unavailable",
  );
});

test("getCallbackAuthority is a read-only opaque binding lookup with frozen authority", async () => {
  const payload = authorityPayload();
  const client = success("payment_callback_authority", "found", payload);
  const result = await repository(new Pool([client])).getCallbackAuthority({
    providerCode: "fixture_provider",
    callbackBindingDigest: CALLBACK_DIGEST,
    now: NOW,
  });

  assert.equal(client.calls[0]?.text, "BEGIN READ ONLY");
  assert.deepEqual(selected(client, "payment_callback_authority"), {
    text: "SELECT outcome,result_payload FROM saas.payment_callback_authority($1::text,$2::text,$3::timestamptz)",
    values: ["fixture_provider", CALLBACK_DIGEST, NOW],
  });
  assert.deepEqual(result, payload);
  assert.notEqual(result.publicConfig, payload.publicConfig);
  assert.notEqual(result.sealedCredentials, payload.sealedCredentials);
  assert.equal(Object.isFrozen(result), true);
});

test("settleCallback carries generic event, amount, currency, and outcome authority", async () => {
  const projected = mutationPayload("captured", 4);
  const client = success("payment_attempt_settle_callback", "captured", projected);
  const result = await repository(new Pool([client])).settleCallback({
    providerCode: "fixture_provider",
    callbackBindingDigest: CALLBACK_DIGEST,
    operationId: OPERATION,
    fingerprint: FINGERPRINT,
    eventKeyDigest: EVENT_DIGEST,
    expectedVersion: 3,
    credentialVersion: 2,
    status: "captured",
    providerReference: "provider-safe-42",
    safeCode: "accepted",
    amountMinor: 12_345,
    currency: "USD",
    now: NOW,
  });

  assert.deepEqual(selected(client, "payment_attempt_settle_callback"), {
    text: "SELECT outcome,result_payload FROM saas.payment_attempt_settle_callback($1::text,$2::text,$3::uuid,$4::text,$5::text,$6::bigint,$7::bigint,$8::text,$9::text,$10::text,$11::bigint,$12::text,$13::timestamptz)",
    values: [
      "fixture_provider", CALLBACK_DIGEST, OPERATION, FINGERPRINT, EVENT_DIGEST,
      3, 2, "captured", "provider-safe-42", "accepted", 12_345, "USD", NOW,
    ],
  });
  assert.deepEqual(result, projected);
});

test("applyHostedCallback binds callback identity and permits an iframe terminal result", async () => {
  const projected = {
    ...mutationPayload("captured", 4),
    disposition: "applied",
  };
  const client = success("payment_attempt_apply_hosted_callback", "captured", {
    ...mutationPayload("captured", 4),
  });
  const result = await repository(new Pool([client])).applyHostedCallback({
    providerCode: "fixture_provider",
    callbackBindingDigest: CALLBACK_DIGEST,
    operationId: OPERATION,
    fingerprint: FINGERPRINT,
    eventKeyDigest: EVENT_DIGEST,
    expectedVersion: 2,
    credentialVersion: 2,
    status: "captured",
    providerReference: "provider-safe-42",
    safeCode: "accepted",
    amountMinor: 12_345,
    currency: "USD",
    now: NOW,
  });

  assert.deepEqual(selected(client, "payment_attempt_apply_hosted_callback"), {
    text: "SELECT outcome,result_payload FROM saas.payment_attempt_apply_hosted_callback($1::text,$2::text,$3::uuid,$4::text,$5::text,$6::bigint,$7::bigint,$8::text,$9::text,$10::text,$11::bigint,$12::text,$13::timestamptz)",
    values: [
      "fixture_provider", CALLBACK_DIGEST, OPERATION, FINGERPRINT, EVENT_DIGEST,
      2, 2, "captured", "provider-safe-42", "accepted", 12_345, "USD", NOW,
    ],
  });
  assert.deepEqual(result, projected);
});

test("applyHostedCallback exposes durable unknown as processing without inventing settlement", async () => {
  const payload = mutationPayload("provider_outcome_unknown", 3);
  const client = success("payment_attempt_apply_hosted_callback", "processing", payload);
  const result = await repository(new Pool([client])).applyHostedCallback({
    providerCode: "fixture_provider",
    callbackBindingDigest: CALLBACK_DIGEST,
    operationId: OPERATION,
    fingerprint: FINGERPRINT,
    eventKeyDigest: EVENT_DIGEST,
    expectedVersion: 3,
    credentialVersion: 2,
    status: "captured",
    providerReference: "provider-safe-42",
    safeCode: "accepted",
    amountMinor: 12_345,
    currency: "USD",
    now: NOW,
  });

  assert.deepEqual(result, {
    ...payload,
    disposition: "processing",
  });
});

test("applyHostedCallback accepts only an exact same-event replay projection", async () => {
  const payload = mutationPayload("provider_outcome_unknown", 3, true);
  const client = success(
    "payment_attempt_apply_hosted_callback",
    "callback_replayed",
    payload,
  );
  const result = await repository(new Pool([client])).applyHostedCallback({
    providerCode: "fixture_provider",
    callbackBindingDigest: CALLBACK_DIGEST,
    operationId: OPERATION,
    fingerprint: FINGERPRINT,
    eventKeyDigest: EVENT_DIGEST,
    expectedVersion: 3,
    credentialVersion: 2,
    status: "provider_outcome_unknown",
    providerReference: "provider-safe-42",
    safeCode: "accepted",
    amountMinor: 12_345,
    currency: "USD",
    now: NOW,
  });

  assert.deepEqual(result, {
    ...payload,
    disposition: "processing",
  });
});

test("applyHostedCallback recovers a durable processing observation as an operation replay after COMMIT loss", async () => {
  const observed = mutationPayload("provider_outcome_unknown", 3, false);
  const writer = new Client((text) => {
    if (text.includes("saas.payment_attempt_apply_hosted_callback")) {
      return [{ outcome: "processing", result_payload: observed }];
    }
    if (text === "COMMIT") return new Error("wire lost");
    return [];
  });
  const recovery = new Client((text) =>
    text.includes("saas.payment_attempt_apply_hosted_callback")
      ? [{
          outcome: "operation_replayed",
          result_payload: { ...observed, replayed: true },
        }]
      : [],
  );
  const pool = new Pool([writer, recovery]);
  const audits: string[] = [];

  const result = await repository(pool, audits).applyHostedCallback({
    providerCode: "fixture_provider",
    callbackBindingDigest: CALLBACK_DIGEST,
    operationId: OPERATION,
    fingerprint: FINGERPRINT,
    eventKeyDigest: EVENT_DIGEST,
    expectedVersion: 3,
    credentialVersion: 2,
    status: "captured",
    providerReference: "provider-safe-42",
    safeCode: "accepted",
    amountMinor: 12_345,
    currency: "USD",
    now: NOW,
  });

  assert.deepEqual(result, {
    ...observed,
    replayed: true,
    disposition: "processing",
  });
  assert.equal(pool.connectCount, 2);
  assert.deepEqual(audits, ["payment_attempt_commit_unknown"]);
  assert.deepEqual(writer.releases, [true]);
  assert.equal(recovery.calls[0]?.text, "BEGIN READ ONLY");
  assert.equal(recovery.calls.filter(({ text }) =>
    text.includes("saas.payment_attempt_apply_hosted_callback")).length, 1);
  assert.equal(recovery.calls.at(-1)?.text, "COMMIT");
});

test("claimReconciliation binds operation and lease and returns immutable credential snapshot", async () => {
  const payload = claimPayload();
  const client = success("payment_attempt_claim_reconciliation", "claimed", payload);
  const result = await repository(new Pool([client])).claimReconciliation({
    attemptId: ATTEMPT,
    operationId: OPERATION,
    fingerprint: FINGERPRINT,
    expectedVersion: 3,
    workerId: "worker.fixture",
    leaseId: LEASE,
    now: NOW,
    leaseExpiresAt: LEASE_EXPIRES_AT,
  });

  assert.deepEqual(selected(client, "payment_attempt_claim_reconciliation"), {
    text: "SELECT outcome,result_payload FROM saas.payment_attempt_claim_reconciliation($1::uuid,$2::uuid,$3::text,$4::bigint,$5::text,$6::uuid,$7::timestamptz,$8::timestamptz)",
    values: [ATTEMPT, OPERATION, FINGERPRINT, 3, "worker.fixture", LEASE, NOW, LEASE_EXPIRES_AT],
  });
  assert.equal(result.outcome, "claimed");
  assert.equal(result.leaseId, LEASE);
  assert.equal(result.leaseOwner, "worker.fixture");
  assert.equal(result.leaseExpiresAt, LEASE_EXPIRES_AT.toISOString());
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.sealedCredentials), true);
});

test("finalizeReconciliation passes all immutable checks and releases the lease result", async () => {
  const projected = mutationPayload("captured", 5);
  const client = success("payment_attempt_finalize_reconciliation", "captured", projected);
  const result = await repository(new Pool([client])).finalizeReconciliation({
    attemptId: ATTEMPT,
    operationId: OPERATION,
    fingerprint: FINGERPRINT,
    expectedVersion: 4,
    workerId: "worker.fixture",
    leaseId: LEASE,
    credentialVersion: 2,
    status: "captured",
    providerReference: "provider-safe-42",
    safeCode: "accepted",
    amountMinor: 12_345,
    currency: "USD",
    now: NOW,
  });

  assert.deepEqual(selected(client, "payment_attempt_finalize_reconciliation"), {
    text: "SELECT outcome,result_payload FROM saas.payment_attempt_finalize_reconciliation($1::uuid,$2::uuid,$3::text,$4::bigint,$5::text,$6::uuid,$7::bigint,$8::text,$9::text,$10::text,$11::bigint,$12::text,$13::timestamptz)",
    values: [
      ATTEMPT, OPERATION, FINGERPRINT, 4, "worker.fixture", LEASE, 2,
      "captured", "provider-safe-42", "accepted", 12_345, "USD", NOW,
    ],
  });
  assert.deepEqual(result, projected);
});

test("an uncertain commit emits one audit and performs exactly one read-only replay with no write retry", async () => {
  const observed = mutationPayload("submitted", 3, false);
  const writer = new Client((text) => {
    if (text.includes("saas.payment_attempt_mark_initialized")) {
      return [{ outcome: "submitted", result_payload: observed }];
    }
    if (text === "COMMIT") return new Error("wire lost");
    return [];
  });
  const recovery = new Client((text) =>
    text.includes("saas.payment_attempt_mark_initialized")
      ? [{ outcome: "operation_replayed", result_payload: mutationPayload("submitted", 3, true) }]
      : [],
  );
  const audits: string[] = [];

  const result = await repository(new Pool([writer, recovery]), audits).markInitialized({
    attemptId: ATTEMPT,
    operationId: OPERATION,
    fingerprint: FINGERPRINT,
    expectedVersion: 2,
    credentialVersion: 2,
    status: "submitted",
    providerReference: "provider-safe-42",
    safeCode: "accepted",
    now: NOW,
  });

  assert.deepEqual(result, mutationPayload("submitted", 3, true));
  assert.deepEqual(audits, ["payment_attempt_commit_unknown"]);
  assert.deepEqual(writer.releases, [true]);
  assert.equal(recovery.calls[0]?.text, "BEGIN READ ONLY");
  assert.equal(recovery.calls.filter(({ text }) => text.includes("saas.payment_attempt_mark_initialized")).length, 1);
  assert.equal(writer.calls.filter(({ text }) => text.includes("saas.payment_attempt_mark_initialized")).length, 1);
  assert.equal(recovery.calls.at(-1)?.text, "COMMIT");
});

test("begin and claim normalize immutable operation replay after uncertain commit", async () => {
  const cases = [
    {
      invoke(repo: PostgresPaymentAttemptRepository) {
        return repo.begin(beginInput());
      },
      functionName: "payment_attempt_begin",
      observedOutcome: "created",
      observed: beginPayload(),
      replayed: { ...beginPayload(), outcome: "replayed" },
    },
    {
      invoke(repo: PostgresPaymentAttemptRepository) {
        return repo.claimReconciliation({
          attemptId: ATTEMPT,
          operationId: OPERATION,
          fingerprint: FINGERPRINT,
          expectedVersion: 3,
          workerId: "worker.fixture",
          leaseId: LEASE,
          now: NOW,
          leaseExpiresAt: LEASE_EXPIRES_AT,
        });
      },
      functionName: "payment_attempt_claim_reconciliation",
      observedOutcome: "claimed",
      observed: claimPayload(),
      replayed: { ...claimPayload(), outcome: "replayed" },
    },
  ] as const;

  for (const selectedCase of cases) {
    const writer = new Client((text) => {
      if (text.includes(`saas.${selectedCase.functionName}`)) {
        return [{ outcome: selectedCase.observedOutcome, result_payload: selectedCase.observed }];
      }
      if (text === "COMMIT") return new Error("wire lost");
      return [];
    });
    const recovery = new Client((text) =>
      text.includes(`saas.${selectedCase.functionName}`)
        ? [{ outcome: "operation_replayed", result_payload: selectedCase.observed }]
        : [],
    );
    const result = await selectedCase.invoke(repository(new Pool([writer, recovery])));
    assert.deepEqual(result, selectedCase.replayed);
    assert.equal(recovery.calls[0]?.text, "BEGIN READ ONLY");
  }
});

test("failed or mismatched commit recovery returns commit_unknown after one read and no third checkout", async () => {
  const observed = {
    ...mutationPayload("provider_outcome_unknown", 4),
    safeCode: "transport_outcome_unknown",
  };
  const writer = new Client((text) => {
    if (text.includes("saas.payment_attempt_mark_unknown")) {
      return [{ outcome: "provider_outcome_unknown", result_payload: observed }];
    }
    if (text === "COMMIT") return new Error("wire lost");
    return [];
  });
  const recovery = new Client((text) =>
    text.includes("saas.payment_attempt_mark_unknown")
      ? [{
          outcome: "operation_replayed",
          result_payload: { ...observed, version: 99, replayed: true },
        }]
      : [],
  );
  const pool = new Pool([writer, recovery]);
  const audits: string[] = [];

  await assert.rejects(
    () => repository(pool, audits).markUnknown({
      attemptId: ATTEMPT,
      operationId: OPERATION,
      fingerprint: FINGERPRINT,
      expectedVersion: 3,
      credentialVersion: 2,
      providerReference: "provider-safe-42",
      safeCode: "transport_outcome_unknown",
      now: NOW,
    }),
    (error: unknown) => error instanceof PaymentAttemptRepositoryError && error.code === "commit_unknown",
  );
  assert.equal(pool.connectCount, 2);
  assert.deepEqual(audits, ["payment_attempt_commit_unknown"]);
});

test("bounded database outcomes map exactly and unknown outcomes fail unavailable", async () => {
  for (const [outcome, expected] of [
    ["payment_method_inactive", "payment_method_inactive"],
    ["credential_version_mismatch", "credential_version_mismatch"],
    ["future_database_code", "unavailable"],
  ] as const) {
    const client = new Client((text) =>
      text.includes("saas.payment_attempt_begin")
        ? [{ outcome, result_payload: null }]
        : [],
    );
    await assert.rejects(
      () => repository(new Pool([client])).begin(beginInput()),
      (error: unknown) => error instanceof PaymentAttemptRepositoryError && error.code === expected,
    );
    assert.equal(client.calls.at(-1)?.text, "ROLLBACK");
  }
});

test("hostile rows, accessors, unknown keys, and malformed envelopes are rejected and destroyed", async () => {
  let nestedProxyTrapCount = 0;
  const hostileRows: unknown[] = [
    new Proxy({ outcome: "created", result_payload: beginPayload() }, {}),
    Object.defineProperty({ outcome: "created" }, "result_payload", {
      enumerable: true,
      get() {
        throw new Error("hostile getter");
      },
    }),
    { outcome: "created", result_payload: beginPayload(), rawSqlError: "secret" },
    { outcome: "created", result_payload: { ...beginPayload(), plaintextCredential: "secret" } },
    {
      outcome: "created",
      result_payload: {
        ...beginPayload(),
        sealedCredentials: { ...sealedCredentials(), ciphertext: "not+base64" },
      },
    },
    {
      outcome: "created",
      result_payload: {
        ...beginPayload(),
        publicConfig: {
          environment: "test",
          nested: new Proxy({ accountReference: "merchant-42" }, {
            getPrototypeOf(target) {
              nestedProxyTrapCount += 1;
              return Reflect.getPrototypeOf(target);
            },
          }),
        },
      },
    },
  ];

  for (const hostile of hostileRows) {
    const client = new Client((text) =>
      text.includes("saas.payment_attempt_begin")
        ? [hostile as Row]
        : [],
    );
    await assert.rejects(
      () => repository(new Pool([client])).begin(beginInput()),
      (error: unknown) => error instanceof PaymentAttemptRepositoryError && error.code === "unavailable",
    );
    assert.equal(client.calls.at(-1)?.text, "ROLLBACK");
    assert.deepEqual(client.releases, [true]);
  }
  assert.equal(nestedProxyTrapCount, 0);
});

test("query row arrays must be exact ordinary arrays", async () => {
  class ExoticRows<T> extends Array<T> {}
  const client = new Client();
  client.query = async (text: string, values: unknown[] = []) => {
    client.calls.push({ text, values });
    const rows = new ExoticRows<Row>();
    if (text.includes("saas.payment_attempt_begin")) {
      rows.push({ outcome: "created", result_payload: beginPayload() });
    }
    return { rows, rowCount: rows.length, command: "SELECT", oid: 0, fields: [] };
  };

  await assert.rejects(
    () => repository(new Pool([client])).begin(beginInput()),
    (error: unknown) => error instanceof PaymentAttemptRepositoryError && error.code === "unavailable",
  );
  assert.deepEqual(client.releases, [true]);
});

test("query and rollback failures destroy the uncertain client without leaking raw errors", async () => {
  const queryFailure = new Client((text) =>
    text.includes("saas.payment_attempt_begin") ? new Error("password=secret raw SQL") : [],
  );
  await assert.rejects(
    () => repository(new Pool([queryFailure])).begin(beginInput()),
    (error: unknown) =>
      error instanceof PaymentAttemptRepositoryError
      && error.code === "unavailable"
      && !error.message.includes("secret"),
  );
  assert.deepEqual(queryFailure.releases, [true]);

  const rollbackFailure = new Client((text) => {
    if (text.includes("saas.payment_attempt_begin")) return new Error("query");
    if (text === "ROLLBACK") return new Error("rollback");
    return [];
  });
  await assert.rejects(() => repository(new Pool([rollbackFailure])).begin(beginInput()));
  assert.deepEqual(rollbackFailure.releases, [true]);
});

test("invalid public input and forged repository errors are contained before checkout", async () => {
  const pool = new Pool([]);
  await assert.rejects(
    () => repository(pool).begin({ ...beginInput(), currency: "TRY " }),
    (error: unknown) => error instanceof PaymentAttemptRepositoryError && error.code === "invalid_input",
  );
  await assert.rejects(
    () => repository(pool).claimReconciliation({
      attemptId: ATTEMPT,
      operationId: OPERATION,
      fingerprint: FINGERPRINT,
      expectedVersion: 3,
      workerId: " worker",
      leaseId: LEASE,
      now: NOW,
      leaseExpiresAt: LEASE_EXPIRES_AT,
    }),
    (error: unknown) => error instanceof PaymentAttemptRepositoryError && error.code === "invalid_input",
  );
  assert.equal(pool.connectCount, 0);
  assert.throws(
    () => new PostgresPaymentAttemptRepository({
      pool,
      role: "celebix_saas_app",
      timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
      audit() {},
    } as never),
    (error: unknown) => error instanceof PaymentAttemptRepositoryError && error.code === "unavailable",
  );
  let poolProxyTrapCount = 0;
  const hostilePool = new Proxy({}, {
    get() {
      poolProxyTrapCount += 1;
      throw new Error("hostile pool getter");
    },
  });
  assert.throws(
    () => new PostgresPaymentAttemptRepository({
      pool: hostilePool as never,
      role: "celebix_saas_workflow",
      timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
      audit() {},
    }),
    (error: unknown) => error instanceof PaymentAttemptRepositoryError && error.code === "unavailable",
  );
  assert.equal(poolProxyTrapCount, 0);
  assert.throws(() => new PaymentAttemptRepositoryError("not_a_code" as never), TypeError);
  const error = new PaymentAttemptRepositoryError("record_not_found");
  assert.equal(Object.isFrozen(error), true);
  assert.deepEqual(Object.keys(error), ["code"]);
});

test("Date subclasses and own-property decorations fail before every timestamp checkout", async () => {
  class HostileDate extends Date {}
  let accessorReads = 0;
  let proxyTrapCount = 0;
  const candidates = [
    (milliseconds: number) => new HostileDate(milliseconds),
    (milliseconds: number) => Object.defineProperty(new Date(milliseconds), "enumerableDecoration", {
      configurable: true,
      enumerable: true,
      value: "hostile",
    }),
    (milliseconds: number) => Object.defineProperty(new Date(milliseconds), "hiddenDecoration", {
      configurable: true,
      enumerable: false,
      value: "hostile",
    }),
    (milliseconds: number) => Object.defineProperty(new Date(milliseconds), Symbol("hostile"), {
      configurable: true,
      enumerable: false,
      value: "hostile",
    }),
    (milliseconds: number) => Object.defineProperty(new Date(milliseconds), "accessorDecoration", {
      configurable: true,
      enumerable: true,
      get() {
        accessorReads += 1;
        return "hostile";
      },
    }),
    (milliseconds: number) => new Proxy(new Date(milliseconds), {
      getPrototypeOf(target) {
        proxyTrapCount += 1;
        return Reflect.getPrototypeOf(target);
      },
      ownKeys(target) {
        proxyTrapCount += 1;
        return Reflect.ownKeys(target);
      },
    }),
  ] as const;

  for (const candidate of candidates) {
    const nowPool = new Pool([]);
    await assert.rejects(
      () => repository(nowPool).begin({
        ...beginInput(),
        authority: { storeId: STORE, now: candidate(NOW.getTime()) },
      }),
      (error: unknown) =>
        error instanceof PaymentAttemptRepositoryError
        && error.code === "invalid_input",
    );
    assert.equal(nowPool.connectCount, 0);

    const leasePool = new Pool([]);
    const leaseTimestamp = candidate(LEASE_EXPIRES_AT.getTime());
    await assert.rejects(
      () => repository(leasePool).claimReconciliation({
        attemptId: ATTEMPT,
        operationId: OPERATION,
        fingerprint: FINGERPRINT,
        expectedVersion: 3,
        workerId: "worker.fixture",
        leaseId: LEASE,
        now: NOW,
        leaseExpiresAt: leaseTimestamp,
      }),
      (error: unknown) =>
        error instanceof PaymentAttemptRepositoryError
        && error.code === "invalid_input",
    );
    assert.equal(leasePool.connectCount, 0);
  }
  assert.equal(accessorReads, 0);
  assert.equal(proxyTrapCount, 0);
});
