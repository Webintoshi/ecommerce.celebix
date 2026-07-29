import assert from "node:assert/strict";
import test from "node:test";

import {
  CheckoutPaymentRepositoryError,
  PostgresCheckoutPaymentRepository,
} from "./index.ts";

const ids = {
  store: "11111111-1111-4111-8111-111111111111",
  attempt: "22222222-2222-4222-8222-222222222222",
  operation: "33333333-3333-4333-8333-333333333333",
  worker: "44444444-4444-4444-8444-444444444444",
  provider: "55555555-5555-4555-8555-555555555555",
  order: "66666666-6666-4666-8666-666666666666",
  item: "77777777-7777-4777-8777-777777777777",
  event: "88888888-8888-4888-8888-888888888888",
};
const digest = "a".repeat(64);
const merchantOid = "b".repeat(32);
const token = "A".repeat(43);
const now = new Date("2026-07-22T12:00:00.000Z");
const later = new Date("2026-07-22T12:00:30.000Z");
const envelope = {
  algorithm: "A256GCM" as const,
  ciphertext: "QQ",
  iv: "A".repeat(16),
  keyId: "key-1",
  tag: "A".repeat(22),
  version: 1 as const,
};
type Result = { rows: unknown[]; rowCount: number };
class RealisticPgResult {
  readonly command = "SELECT";
  readonly oid = 0;
  readonly fields = [];
  readonly rows: unknown[];
  readonly rowCount: number;
  constructor(rows: unknown[], rowCount: number) {
    this.rows = rows;
    this.rowCount = rowCount;
  }
}
class FakeClient {
  readonly calls: Array<{ text: string; values?: readonly unknown[] }> = [];
  releases: boolean[] = [];
  readonly answers: Result[];
  commitFailures: number;
  constructor(answers: Result[], commitFailure = false) {
    this.answers = answers;
    this.commitFailures = commitFailure ? 1 : 0;
  }
  async query(text: string, values?: readonly unknown[]): Promise<Result> {
    this.calls.push({ text, values });
    if (text === "COMMIT" && this.commitFailures > 0) {
      this.commitFailures -= 1;
      throw new Error("response lost");
    }
    const answer = text.includes("FROM saas.")
      ? (this.answers.shift() ?? { rows: [], rowCount: 0 })
      : { rows: [], rowCount: 0 };
    return new RealisticPgResult(answer.rows, answer.rowCount) as never;
  }
  release(destroy?: boolean) {
    this.releases.push(Boolean(destroy));
  }
}
function repo(
  answers: Result[],
  commitFailure = false,
  audit: () => void = () => undefined,
) {
  const client = new FakeClient(answers, commitFailure);
  return {
    client,
    repository: new PostgresCheckoutPaymentRepository({
      pool: { connect: async () => client } as never,
      role: "celebix_saas_workflow",
      timeouts: {
        poolCheckoutMs: 100,
        statementMs: 100,
        lockMs: 100,
        idleTransactionMs: 100,
      },
      audit,
    }),
  };
}
function row(outcome: string, result_payload: unknown): Result {
  return { rows: [{ outcome, result_payload }], rowCount: 1 };
}
const begin = {
  attemptId: ids.attempt,
  storeId: ids.store,
  providerConfigId: ids.provider,
  status: "reserved",
  holdExpiresAt: "2026-07-22T12:05:00.000Z",
  merchantOid,
  paymentAmount: 1234,
  currency: "TRY",
  customerName: "Ada",
  customerEmail: "ada@example.test",
  customerPhone: "+905551112233",
  shippingAddress: "Ada +905551112233 Acme 1 Istanbul TR",
  basket: [["Item", 1234, 1]],
  providerConfigVersion: 1,
  configurationDigest: digest,
  configurationKeyId: "key-1",
  sealedConfiguration: envelope,
};
const authority = {
  storeId: ids.store,
  attemptId: ids.attempt,
  merchantOid,
  providerConfigId: ids.provider,
  status: "provider_ready",
  itemCount: 3,
  expectedPaymentAmount: 1234,
  currency: "TRY",
  configurationDigest: digest,
  configurationKeyId: "key-1",
  sealedConfiguration: envelope,
};
test("beginAttempt uses workflow authority and canonical begin parameters", async () => {
  const { repository, client } = repo([row("committed", begin)]);
  const result = await repository.beginAttempt({
    hostname: "shop.example.test",
    redemptionDigest: digest,
    attemptId: ids.attempt,
    merchantOid,
    operationId: ids.operation,
    fingerprint: digest,
    now,
  });
  assert.equal(result.outcome, "created");
  assert.equal(result.sealedConfiguration.keyId, "key-1");
  assert.match(
    client.calls.map((call) => call.text).join("\n"),
    /SET LOCAL ROLE celebix_saas_workflow/,
  );
  assert.deepEqual(client.calls.at(-2)?.values, [
    "shop.example.test",
    digest,
    ids.attempt,
    merchantOid,
    ids.operation,
    digest,
    now,
  ]);
  const recoveryInput = {
    hostname: "shop.example.test",
    redemptionDigest: digest,
    attemptId: ids.attempt,
    merchantOid,
    operationId: ids.operation,
    fingerprint: digest,
    now,
  };
  const proven = repo(
    [row("committed", begin), row("operation_replayed", begin)],
    true,
  );
  assert.equal(
    (await proven.repository.beginAttempt(recoveryInput)).outcome,
    "replayed",
  );
  assert.equal(proven.client.releases[0], true);
  assert.equal(
    proven.client.calls.filter((call) =>
      /checkout_begin_attempt/.test(call.text),
    ).length,
    1,
  );
  assert.equal(
    proven.client.calls.filter((call) =>
      /checkout_recover_attempt_operation/.test(call.text),
    ).length,
    1,
  );
  const absent = repo([row("committed", begin), row("not_found", null)], true);
  await assert.rejects(
    () => absent.repository.beginAttempt(recoveryInput),
    /commit_unknown/,
  );
  const mismatch = repo(
    [row("committed", begin), row("operation_mismatch", null)],
    true,
  );
  await assert.rejects(
    () => mismatch.repository.beginAttempt(recoveryInput),
    /commit_unknown/,
  );
});
test("provider-ready, initiation terminal methods and presentation use their exact functions", async () => {
  const ready = {
    attemptId: ids.attempt,
    status: "provider_ready",
    providerTokenDigest: digest,
    providerTokenKeyId: "key-1",
    sealedProviderToken: envelope,
  };
  const { repository, client } = repo([
    row("committed", ready),
    row("committed", { status: "initiation_unknown" }),
    row("committed", { status: "failed" }),
    row("found", {
      attemptId: ids.attempt,
      storeId: ids.store,
      merchantOid,
      providerTokenDigest: digest,
      providerTokenKeyId: "key-1",
      sealedProviderToken: envelope,
    }),
  ]);
  await repository.markProviderReady({
    attemptId: ids.attempt,
    operationId: ids.operation,
    fingerprint: digest,
    providerTokenDigest: digest,
    sealedProviderToken: envelope,
    now,
  });
  await repository.markInitiationUnknown({
    attemptId: ids.attempt,
    operationId: ids.operation,
    fingerprint: digest,
    now,
  });
  await repository.markInitiationFailed({
    attemptId: ids.attempt,
    operationId: ids.operation,
    fingerprint: digest,
    now,
  });
  const presentation = await repository.getPaymentPresentation({
    hostname: "shop.example.test",
    redemptionDigest: digest,
    now,
  });
  assert.equal(presentation.merchantOid, merchantOid);
  assert.match(
    client.calls.map((call) => call.text).join("\n"),
    /checkout_mark_provider_ready[\s\S]*checkout_mark_initiation_unknown[\s\S]*checkout_mark_initiation_failed[\s\S]*checkout_get_payment_presentation/,
  );
  const cases = [
    {
      name: "provider-ready",
      initial: row("committed", ready),
      recovered: row("operation_replayed", ready),
      sql: "checkout_mark_provider_ready",
      recover: "checkout_recover_attempt_operation",
      invoke: (target: PostgresCheckoutPaymentRepository) =>
        target.markProviderReady({
          attemptId: ids.attempt,
          operationId: ids.operation,
          fingerprint: digest,
          providerTokenDigest: digest,
          sealedProviderToken: envelope,
          now,
        }),
    },
    {
      name: "initiation-unknown",
      initial: row("committed", { status: "initiation_unknown" }),
      recovered: row("operation_replayed", {
        status: "initiation_unknown",
      }),
      sql: "checkout_mark_initiation_unknown",
      recover: "checkout_recover_attempt_operation",
      invoke: (target: PostgresCheckoutPaymentRepository) =>
        target.markInitiationUnknown({
          attemptId: ids.attempt,
          operationId: ids.operation,
          fingerprint: digest,
          now,
        }),
    },
    {
      name: "initiation-failed",
      initial: row("committed", { status: "failed" }),
      recovered: row("operation_replayed", { status: "failed" }),
      sql: "checkout_mark_initiation_failed",
      recover: "checkout_recover_attempt_operation",
      invoke: (target: PostgresCheckoutPaymentRepository) =>
        target.markInitiationFailed({
          attemptId: ids.attempt,
          operationId: ids.operation,
          fingerprint: digest,
          now,
        }),
    },
  ];
  for (const entry of cases) {
    const proven = repo([entry.initial, entry.recovered], true);
    await entry.invoke(proven.repository);
    assert.equal(
      proven.client.calls[0]?.text,
      "BEGIN ISOLATION LEVEL READ COMMITTED",
    );
    assert.equal(proven.client.releases[0], true);
    assert.equal(
      proven.client.calls.filter((call) => call.text.includes(entry.sql))
        .length,
      1,
    );
    assert.equal(
      proven.client.calls.filter((call) => call.text.includes(entry.recover))
        .length,
      1,
    );
    assert.equal(
      proven.client.calls.filter((call) => call.text === "BEGIN READ ONLY")
        .length,
      1,
    );
    const absent = repo([entry.initial, row("not_found", null)], true);
    await assert.rejects(
      () => entry.invoke(absent.repository),
      /commit_unknown/,
    );
    const mismatch = repo(
      [entry.initial, row("operation_mismatch", null)],
      true,
    );
    await assert.rejects(
      () => entry.invoke(mismatch.repository),
      /commit_unknown/,
    );
  }
});
test("callback authority is read-only and keeps provider configuration server-only", async () => {
  const { repository, client } = repo([row("found", authority)]);
  const result = await repository.getCallbackAuthority({ merchantOid, now });
  assert.equal(result.configurationDigest, digest);
  assert.equal(result.itemCount, 3);
  assert.equal(client.calls[0]?.text, "BEGIN READ ONLY");
  const boundary = repo([row("found", { ...authority, itemCount: 100 })]);
  assert.equal((await boundary.repository.getCallbackAuthority({ merchantOid, now })).itemCount, 100);
});
test("callback settlement reports only proven outcomes", async () => {
  const { repository } = repo([
    row("settled", { outcome: "settled", orderNumber: "ORD-1" }),
  ]);
  assert.deepEqual(
    await repository.settleCallback({
      status: "success",
      merchantOid,
      callbackDigest: digest,
      operationId: ids.operation,
      fingerprint: digest,
      paymentAmount: 1234,
      totalAmount: 1234,
      currency: "TRY",
      paymentType: "card",
      testMode: 1,
      orderId: ids.order,
      orderItemIds: [ids.item],
      orderEventId: ids.event,
      orderNumber: "ORD-1",
      now,
    }),
    { outcome: "settled", orderNumber: "ORD-1" },
  );
});
test("unknown callback commit performs one authority-bound recovery and stays commit_unknown when unresolved", async () => {
  const { repository, client } = repo(
    [
      row("settled", { outcome: "settled", orderNumber: "ORD-1" }),
      row("not_found", null),
    ],
    true,
  );
  const result = await repository.settleCallback({
    status: "success",
    merchantOid,
    callbackDigest: digest,
    operationId: ids.operation,
    fingerprint: digest,
    paymentAmount: 1234,
    totalAmount: 1234,
    currency: "TRY",
    paymentType: "card",
    testMode: 1,
    orderId: ids.order,
    orderItemIds: [ids.item],
    orderEventId: ids.event,
    orderNumber: "ORD-1",
    now,
  });
  assert.deepEqual(result, { outcome: "commit_unknown" });
  assert.equal(
    client.calls.filter((call) => /checkout_settle_callback/.test(call.text))
      .length,
    1,
  );
  assert.equal(
    client.calls.filter((call) => /checkout_recover_callback/.test(call.text))
      .length,
    1,
  );
  assert.equal(client.releases[0], true);
  assert.deepEqual(
    client.calls.find((call) => /checkout_recover_callback/.test(call.text))
      ?.values,
    [merchantOid, digest, ids.operation, digest],
  );
  const callbackInput = {
    status: "success" as const,
    merchantOid,
    callbackDigest: digest,
    operationId: ids.operation,
    fingerprint: digest,
    paymentAmount: 1234,
    totalAmount: 1234,
    currency: "TRY" as const,
    paymentType: "card" as const,
    testMode: 1 as const,
    orderId: ids.order,
    orderItemIds: [ids.item],
    orderEventId: ids.event,
    orderNumber: "ORD-1",
    now,
  };
  const callbackProven = repo(
    [
      row("settled", { outcome: "settled", orderNumber: "ORD-1" }),
      row("operation_replayed", { outcome: "settled", orderNumber: "ORD-1" }),
    ],
    true,
  );
  assert.deepEqual(
    await callbackProven.repository.settleCallback(callbackInput),
    { outcome: "replayed", orderNumber: "ORD-1" },
  );
  const callbackMismatch = repo(
    [
      row("settled", { outcome: "settled", orderNumber: "ORD-1" }),
      row("operation_mismatch", null),
    ],
    true,
  );
  assert.deepEqual(
    await callbackMismatch.repository.settleCallback(callbackInput),
    { outcome: "commit_unknown" },
  );
});
test("audit failure cannot mask unknown commit", async () => {
  const { repository } = repo(
    [
      row("settled", { outcome: "settled", orderNumber: "ORD-1" }),
      row("not_found", null),
    ],
    true,
    () => {
      throw new Error("audit unavailable");
    },
  );
  assert.deepEqual(
    await repository.settleCallback({
      status: "success",
      merchantOid,
      callbackDigest: digest,
      operationId: ids.operation,
      fingerprint: digest,
      paymentAmount: 1234,
      totalAmount: 1234,
      currency: "TRY",
      paymentType: "card",
      testMode: 1,
      orderId: ids.order,
      orderItemIds: [ids.item],
      orderEventId: ids.event,
      orderNumber: "ORD-1",
      now,
    }),
    { outcome: "commit_unknown" },
  );
});
test("reconciliation claims are bounded and authority-shaped", async () => {
  const { repository } = repo([
    row("claimed", {
      claims: [{ ...authority, leaseToken: token, attemptNumber: 1 }],
    }),
  ]);
  const result = await repository.claimReconciliation({
    workerId: ids.worker,
    now,
    leaseExpiresAt: later,
    limit: 1,
  });
  assert.equal(result[0]?.leaseToken, token);
  assert.equal(result[0]?.itemCount, 3);
  const extraWorker = repo([row("claimed", {
    claims: [{ ...authority, workerId: ids.worker, leaseToken: token, attemptNumber: 1 }],
  })]);
  await assert.rejects(
    () => extraWorker.repository.claimReconciliation({ workerId: ids.worker, now, leaseExpiresAt: later, limit: 1 }),
    /unavailable/,
  );
  await assert.rejects(
    () =>
      repository.claimReconciliation({
        workerId: ids.worker,
        now,
        leaseExpiresAt: later,
        limit: 26,
      }),
    (error: unknown) =>
      error instanceof CheckoutPaymentRepositoryError &&
      error.code === "invalid_input",
  );
});
test("reconciliation lifecycle and cleanup use bounded canonical parameters", async () => {
  const { repository } = repo([
    row("acquired", {
      status: "acquired",
      leaseExpiresAt: later.toISOString(),
    }),
    row("claimed", { ...authority, leaseToken: token, attemptNumber: 1 }),
    row("settled", { orderNumber: "ORD-1" }),
    row("committed", {
      outcome: "unknown",
      status: "unknown",
      nextAttemptAt: later.toISOString(),
    }),
    row("committed", { status: "finished" }),
    row("committed", { releasedCount: 2 }),
  ]);
  assert.deepEqual(
    await repository.beginReconciliationRun({
      workerId: ids.worker,
      runTokenDigest: digest,
      now,
      leaseExpiresAt: later,
    }),
    { outcome: "acquired" },
  );
  assert.equal(
    (
      await repository.claimRedemptionReconciliation({
        hostname: "shop.example.test",
        redemptionDigest: digest,
        workerId: ids.worker,
        now,
        leaseExpiresAt: later,
      })
    )?.attemptId,
    ids.attempt,
  );
  assert.deepEqual(
    await repository.applyReconciliationSuccess({
      merchantOid,
      workerId: ids.worker,
      leaseToken: token,
      operationId: ids.operation,
      fingerprint: digest,
      paymentAmount: 1234,
      totalAmount: 1234,
      currency: "TRY",
      testMode: 1,
      orderId: ids.order,
      orderItemIds: [ids.item],
      orderEventId: ids.event,
      orderNumber: "ORD-1",
      now,
    }),
    { outcome: "settled", orderNumber: "ORD-1" },
  );
  await repository.recordReconciliationUnknown({
    merchantOid,
    workerId: ids.worker,
    leaseToken: token,
    operationId: ids.operation,
    fingerprint: digest,
    nextAttemptAt: later,
    now,
  });
  await repository.finishReconciliationRun({
    workerId: ids.worker,
    runToken: token,
    now,
  });
  assert.deepEqual(
    await repository.cleanupPreProviderAttempts({
      workerId: ids.worker,
      operationId: ids.operation,
      fingerprint: digest,
      now,
      limit: 2,
    }),
    { releasedCount: 2 },
  );
  const recoveryCases = [
    {
      name: "reconciliation-success",
      initial: row("settled", { orderNumber: "ORD-1" }),
      recovered: row("operation_replayed", { orderNumber: "ORD-1" }),
      sql: "checkout_apply_reconciliation_success",
      invoke: (target: PostgresCheckoutPaymentRepository) =>
        target.applyReconciliationSuccess({
          merchantOid,
          workerId: ids.worker,
          leaseToken: token,
          operationId: ids.operation,
          fingerprint: digest,
          paymentAmount: 1234,
          totalAmount: 1234,
          currency: "TRY",
          testMode: 1,
          orderId: ids.order,
          orderItemIds: [ids.item],
          orderEventId: ids.event,
          orderNumber: "ORD-1",
          now,
        }),
    },
    {
      name: "reconciliation-unknown",
      initial: row("committed", {
        outcome: "unknown",
        status: "unknown",
        nextAttemptAt: later.toISOString(),
      }),
      recovered: row("operation_replayed", {
        outcome: "unknown",
        status: "unknown",
        nextAttemptAt: later.toISOString(),
      }),
      sql: "checkout_record_reconciliation_unknown",
      invoke: (target: PostgresCheckoutPaymentRepository) =>
        target.recordReconciliationUnknown({
          merchantOid,
          workerId: ids.worker,
          leaseToken: token,
          operationId: ids.operation,
          fingerprint: digest,
          nextAttemptAt: later,
          now,
        }),
    },
    {
      name: "cleanup",
      initial: row("committed", { releasedCount: 2 }),
      recovered: row("operation_replayed", { releasedCount: 2 }),
      sql: "checkout_cleanup_pre_provider_attempts",
      invoke: (target: PostgresCheckoutPaymentRepository) =>
        target.cleanupPreProviderAttempts({
          workerId: ids.worker,
          operationId: ids.operation,
          fingerprint: digest,
          now,
          limit: 2,
        }),
    },
  ];
  for (const entry of recoveryCases) {
    const proven = repo([entry.initial, entry.recovered], true);
    await entry.invoke(proven.repository);
    assert.equal(
      proven.client.calls[0]?.text,
      "BEGIN ISOLATION LEVEL READ COMMITTED",
      entry.name,
    );
    assert.equal(proven.client.releases[0], true, entry.name);
    assert.equal(
      proven.client.calls.filter((call) => call.text.includes(entry.sql))
        .length,
      1,
      entry.name,
    );
    assert.equal(
      proven.client.calls.filter((call) =>
        call.text.includes("BEGIN READ ONLY"),
      ).length,
      1,
      entry.name,
    );
    const absent = repo([entry.initial, row("not_found", null)], true);
    await assert.rejects(
      () => entry.invoke(absent.repository),
      /commit_unknown/,
      entry.name,
    );
    const mismatch = repo(
      [entry.initial, row("operation_mismatch", null)],
      true,
    );
    await assert.rejects(
      () => entry.invoke(mismatch.repository),
      /commit_unknown/,
      entry.name,
    );
  }
});
test("hostile rows and driver failures expose safe payment errors", async () => {
  const { repository } = repo([
    {
      rows: [{ outcome: "found", result_payload: new Proxy({}, {}) }],
      rowCount: 1,
    },
  ]);
  await assert.rejects(
    () => repository.getCallbackAuthority({ merchantOid, now }),
    (error: unknown) =>
      error instanceof CheckoutPaymentRepositoryError &&
      error.code === "unavailable" &&
      !error.message.includes("SELECT"),
  );
  const poolFailure = new PostgresCheckoutPaymentRepository({
    pool: {
      connect: async () => {
        throw new Error("postgres password");
      },
    } as never,
    role: "celebix_saas_workflow",
    timeouts: {
      poolCheckoutMs: 100,
      statementMs: 100,
      lockMs: 100,
      idleTransactionMs: 100,
    },
    audit: () => undefined,
  });
  await assert.rejects(
    () => poolFailure.getCallbackAuthority({ merchantOid, now }),
    /unavailable/,
  );
  const queryFailure = new PostgresCheckoutPaymentRepository({
    pool: {
      connect: async () => ({
        query: async () => {
          throw new Error("SELECT secret");
        },
        release: () => undefined,
      }),
    } as never,
    role: "celebix_saas_workflow",
    timeouts: {
      poolCheckoutMs: 100,
      statementMs: 100,
      lockMs: 100,
      idleTransactionMs: 100,
    },
    audit: () => undefined,
  });
  await assert.rejects(
    () => queryFailure.getCallbackAuthority({ merchantOid, now }),
    /unavailable/,
  );
});
test("beginAttempt rejects noncanonical public authority", async () => {
  const { repository } = repo([]);
  await assert.rejects(
    () =>
      repository.beginAttempt({
        hostname: "SHOP.example.test",
        redemptionDigest: digest,
        attemptId: ids.attempt,
        merchantOid,
        operationId: ids.operation,
        fingerprint: digest,
        now,
      }),
    /invalid_input/,
  );
});
test("provider-ready rejects an unsealed provider token", async () => {
  const { repository } = repo([]);
  await assert.rejects(
    () =>
      repository.markProviderReady({
        attemptId: ids.attempt,
        operationId: ids.operation,
        fingerprint: digest,
        providerTokenDigest: digest,
        sealedProviderToken: { ...envelope, version: 2 } as never,
        now,
      }),
    /invalid_input/,
  );
});
test("payment presentation does not accept provider secrets outside its exact projection", async () => {
  const { repository } = repo([
    row("found", {
      attemptId: ids.attempt,
      storeId: ids.store,
      merchantOid,
      providerTokenDigest: digest,
      providerTokenKeyId: "key-1",
      sealedProviderToken: envelope,
      configurationDigest: digest,
    }),
  ]);
  await assert.rejects(
    () =>
      repository.getPaymentPresentation({
        hostname: "shop.example.test",
        redemptionDigest: digest,
        now,
      }),
    /unavailable/,
  );
});
test("callback authority rejects malformed durable amounts and mismatched canonical envelopes", async () => {
  const amount = repo([
    row("found", { ...authority, expectedPaymentAmount: 0 }),
  ]);
  await assert.rejects(
    () => amount.repository.getCallbackAuthority({ merchantOid, now }),
    /unavailable/,
  );
  const key = repo([
    row("found", { ...authority, configurationKeyId: "key-2" }),
  ]);
  await assert.rejects(
    () => key.repository.getCallbackAuthority({ merchantOid, now }),
    /unavailable/,
  );
  const { itemCount: _omitted, ...missingItemCount } = authority;
  assert.equal(_omitted, 3);
  for (const candidate of [
    missingItemCount,
    { ...authority, itemCount: null },
    { ...authority, itemCount: "3" },
    { ...authority, itemCount: 1.5 },
    { ...authority, itemCount: 0 },
    { ...authority, itemCount: 101 },
    new Proxy(authority, {}),
  ]) {
    const invalidCount = repo([row("found", candidate)]);
    await assert.rejects(
      () => invalidCount.repository.getCallbackAuthority({ merchantOid, now }),
      /unavailable/,
    );
  }
});
test("failed callback has no synthetic order authority", async () => {
  const { repository } = repo([
    row("failed", { outcome: "failed", status: "failed" }),
  ]);
  assert.deepEqual(
    await repository.settleCallback({
      status: "failed",
      merchantOid,
      callbackDigest: digest,
      operationId: ids.operation,
      fingerprint: digest,
      totalAmount: 1234,
      paymentType: "eft",
      testMode: 1,
      failedReasonCode: "declined",
      failedReasonMessageDigest: digest,
      now,
    }),
    { outcome: "failed" },
  );
});
test("reconciliation-run unknown commit recovers once only when the durable authority proves acquisition", async () => {
  const input = {
    workerId: ids.worker,
    runTokenDigest: digest,
    now,
    leaseExpiresAt: later,
  };
  const missingPayload = repo([row("acquired", { status: "acquired" })]);
  await assert.rejects(
    () => missingPayload.repository.beginReconciliationRun(input),
    /unavailable/,
  );
  const malformedPayload = repo([
    row("acquired", { status: "acquired", leaseExpiresAt: "not-a-date" }),
  ]);
  await assert.rejects(
    () => malformedPayload.repository.beginReconciliationRun(input),
    /unavailable/,
  );
  const extraPayload = repo([
    row("acquired", {
      status: "acquired",
      leaseExpiresAt: later.toISOString(),
      workerId: ids.worker,
    }),
  ]);
  await assert.rejects(
    () => extraPayload.repository.beginReconciliationRun(input),
    /unavailable/,
  );
  const contradictoryPayload = repo([
    row("acquired", {
      status: "acquired",
      leaseExpiresAt: new Date(later.getTime() + 1_000).toISOString(),
    }),
  ]);
  await assert.rejects(
    () => contradictoryPayload.repository.beginReconciliationRun(input),
    /unavailable/,
  );
  const proven = repo(
    [
      row("acquired", {
        status: "acquired",
        leaseExpiresAt: later.toISOString(),
      }),
      row("acquired", {
        status: "acquired",
        leaseExpiresAt: later.toISOString(),
      }),
    ],
    true,
  );
  assert.deepEqual(await proven.repository.beginReconciliationRun(input), {
    outcome: "acquired",
  });
  assert.equal(
    proven.client.calls.filter((call) =>
      /checkout_begin_reconciliation_run/.test(call.text),
    ).length,
    1,
  );
  assert.equal(
    proven.client.calls.filter((call) =>
      /checkout_recover_reconciliation_run/.test(call.text),
    ).length,
    1,
  );
  assert.equal(
    proven.client.calls.filter((call) => call.text === "BEGIN READ ONLY")
      .length,
    1,
  );
  assert.equal(proven.client.releases[0], true);
  assert.deepEqual(
    proven.client.calls.find((call) =>
      /checkout_recover_reconciliation_run/.test(call.text),
    )?.values,
    [ids.worker, digest, now],
  );
  const absent = repo(
    [
      row("acquired", {
        status: "acquired",
        leaseExpiresAt: later.toISOString(),
      }),
      row("not_found", null),
    ],
    true,
  );
  await assert.rejects(
    () => absent.repository.beginReconciliationRun(input),
    /commit_unknown/,
  );
  const mismatch = repo(
    [
      row("acquired", {
        status: "acquired",
        leaseExpiresAt: later.toISOString(),
      }),
      row("busy", { status: "busy" }),
    ],
    true,
  );
  await assert.rejects(
    () => mismatch.repository.beginReconciliationRun(input),
    /commit_unknown/,
  );
});
test("missing redemption reconciliation claim is read-only absence", async () => {
  const { repository } = repo([row("not_found", null)]);
  assert.equal(
    await repository.claimRedemptionReconciliation({
      hostname: "shop.example.test",
      redemptionDigest: digest,
      workerId: ids.worker,
      now,
      leaseExpiresAt: later,
    }),
    undefined,
  );
});
test("cleanup bounds and success callback public inputs reject before SQL", async () => {
  const { repository, client } = repo([]);
  await assert.rejects(
    () =>
      repository.cleanupPreProviderAttempts({
        workerId: ids.worker,
        operationId: ids.operation,
        fingerprint: digest,
        now,
        limit: 101,
      }),
    /invalid_input/,
  );
  const common = {
    status: "success" as const,
    merchantOid,
    callbackDigest: digest,
    operationId: ids.operation,
    fingerprint: digest,
    paymentAmount: 1234,
    totalAmount: 1234,
    paymentType: "card" as const,
    testMode: 1 as const,
    orderId: ids.order,
    orderEventId: ids.event,
    orderNumber: "ORD-1",
    now,
  };
  await assert.rejects(
    () =>
      repository.settleCallback({
        ...common,
        currency: "USD" as never,
        orderItemIds: [ids.item],
      }),
    /invalid_input/,
  );
  const sparse: string[] = [];
  sparse.length = 1;
  await assert.rejects(
    () =>
      repository.settleCallback({
        ...common,
        currency: "TRY",
        orderItemIds: sparse,
      }),
    /invalid_input/,
  );
  assert.equal(client.calls.length, 0);
});
test("repository construction rejects the app role", async () => {
  assert.throws(
    () =>
      new PostgresCheckoutPaymentRepository({
        pool: {} as never,
        role: "celebix_saas_app" as never,
        timeouts: {
          poolCheckoutMs: 1,
          statementMs: 1,
          lockMs: 1,
          idleTransactionMs: 1,
        },
        audit: () => undefined,
      }),
    /unavailable/,
  );
  await assertNormalPaymentSqlMatrix();
});
async function assertNormalPaymentSqlMatrix(): Promise<void> {
  const ready = {
    attemptId: ids.attempt,
    status: "provider_ready",
    providerTokenDigest: digest,
    providerTokenKeyId: "key-1",
    sealedProviderToken: envelope,
  };
  const presentation = {
    attemptId: ids.attempt,
    storeId: ids.store,
    merchantOid,
    providerTokenDigest: digest,
    providerTokenKeyId: "key-1",
    sealedProviderToken: envelope,
  };
  const callback = {
    status: "success" as const,
    merchantOid,
    callbackDigest: digest,
    operationId: ids.operation,
    fingerprint: digest,
    paymentAmount: 1234,
    totalAmount: 1234,
    currency: "TRY" as const,
    paymentType: "card" as const,
    testMode: 1 as const,
    orderId: ids.order,
    orderItemIds: [ids.item],
    orderEventId: ids.event,
    orderNumber: "ORD-1",
    now,
  };
  const authorityClaim = { ...authority, leaseToken: token, attemptNumber: 1 };
  const cases: Array<
    Readonly<{
      name: string;
      mode: string;
      sql: string;
      values: readonly unknown[];
      answer: Result;
      invoke: (
        repository: PostgresCheckoutPaymentRepository,
      ) => Promise<unknown>;
    }>
  > = [
    {
      name: "begin",
      mode: "BEGIN ISOLATION LEVEL READ COMMITTED",
      sql: "SELECT outcome, result_payload FROM saas.checkout_begin_attempt($1::text,$2::text,$3::uuid,$4::text,$5::uuid,$6::text,$7::timestamptz)",
      values: [
        "shop.example.test",
        digest,
        ids.attempt,
        merchantOid,
        ids.operation,
        digest,
        now,
      ],
      answer: row("committed", begin),
      invoke: (repository) =>
        repository.beginAttempt({
          hostname: "shop.example.test",
          redemptionDigest: digest,
          attemptId: ids.attempt,
          merchantOid,
          operationId: ids.operation,
          fingerprint: digest,
          now,
        }),
    },
    {
      name: "provider-ready",
      mode: "BEGIN ISOLATION LEVEL READ COMMITTED",
      sql: "SELECT outcome, result_payload FROM saas.checkout_mark_provider_ready($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::text,$6::timestamptz)",
      values: [
        ids.attempt,
        ids.operation,
        digest,
        JSON.stringify(envelope),
        digest,
        now,
      ],
      answer: row("committed", ready),
      invoke: (repository) =>
        repository.markProviderReady({
          attemptId: ids.attempt,
          operationId: ids.operation,
          fingerprint: digest,
          providerTokenDigest: digest,
          sealedProviderToken: envelope,
          now,
        }),
    },
    {
      name: "initiation-unknown",
      mode: "BEGIN ISOLATION LEVEL READ COMMITTED",
      sql: "SELECT outcome, result_payload FROM saas.checkout_mark_initiation_unknown($1::uuid,$2::uuid,$3::text,$4::timestamptz)",
      values: [ids.attempt, ids.operation, digest, now],
      answer: row("committed", { status: "initiation_unknown" }),
      invoke: (repository) =>
        repository.markInitiationUnknown({
          attemptId: ids.attempt,
          operationId: ids.operation,
          fingerprint: digest,
          now,
        }),
    },
    {
      name: "initiation-failed",
      mode: "BEGIN ISOLATION LEVEL READ COMMITTED",
      sql: "SELECT outcome, result_payload FROM saas.checkout_mark_initiation_failed($1::uuid,$2::uuid,$3::text,$4::timestamptz)",
      values: [ids.attempt, ids.operation, digest, now],
      answer: row("committed", { status: "failed" }),
      invoke: (repository) =>
        repository.markInitiationFailed({
          attemptId: ids.attempt,
          operationId: ids.operation,
          fingerprint: digest,
          now,
        }),
    },
    {
      name: "presentation",
      mode: "BEGIN READ ONLY",
      sql: "SELECT outcome, result_payload FROM saas.checkout_get_payment_presentation($1::text,$2::text,$3::timestamptz)",
      values: ["shop.example.test", digest, now],
      answer: row("found", presentation),
      invoke: (repository) =>
        repository.getPaymentPresentation({
          hostname: "shop.example.test",
          redemptionDigest: digest,
          now,
        }),
    },
    {
      name: "callback-authority",
      mode: "BEGIN READ ONLY",
      sql: "SELECT outcome, result_payload FROM saas.checkout_get_callback_authority($1::text,$2::timestamptz)",
      values: [merchantOid, now],
      answer: row("found", authority),
      invoke: (repository) =>
        repository.getCallbackAuthority({ merchantOid, now }),
    },
    {
      name: "settle-callback",
      mode: "BEGIN ISOLATION LEVEL READ COMMITTED",
      sql: "SELECT outcome, result_payload FROM saas.checkout_settle_callback($1::text,$2::text,$3::uuid,$4::text,$5::text,$6::bigint,$7::bigint,$8::text,$9::text,$10::integer,$11::text,$12::text,$13::uuid,$14::uuid[],$15::uuid,$16::text,$17::timestamptz)",
      values: [
        merchantOid,
        digest,
        ids.operation,
        digest,
        "success",
        1234,
        1234,
        "TRY",
        "card",
        1,
        null,
        null,
        ids.order,
        [ids.item],
        ids.event,
        "ORD-1",
        now,
      ],
      answer: row("settled", { outcome: "settled", orderNumber: "ORD-1" }),
      invoke: (repository) => repository.settleCallback(callback),
    },
    {
      name: "begin-run",
      mode: "BEGIN ISOLATION LEVEL READ COMMITTED",
      sql: "SELECT outcome, result_payload FROM saas.checkout_begin_reconciliation_run($1::uuid,$2::text,$3::timestamptz,$4::timestamptz)",
      values: [ids.worker, digest, now, later],
      answer: row("acquired", {
        status: "acquired",
        leaseExpiresAt: later.toISOString(),
      }),
      invoke: (repository) =>
        repository.beginReconciliationRun({
          workerId: ids.worker,
          runTokenDigest: digest,
          now,
          leaseExpiresAt: later,
        }),
    },
    {
      name: "global-claim",
      mode: "BEGIN ISOLATION LEVEL READ COMMITTED",
      sql: "SELECT outcome, result_payload FROM saas.checkout_claim_reconciliation($1::uuid,$2::timestamptz,$3::timestamptz,$4::bigint)",
      values: [ids.worker, now, later, 1],
      answer: row("claimed", { claims: [authorityClaim] }),
      invoke: (repository) =>
        repository.claimReconciliation({
          workerId: ids.worker,
          now,
          leaseExpiresAt: later,
          limit: 1,
        }),
    },
    {
      name: "redemption-claim",
      mode: "BEGIN ISOLATION LEVEL READ COMMITTED",
      sql: "SELECT outcome, result_payload FROM saas.checkout_claim_redemption_reconciliation($1::text,$2::text,$3::uuid,$4::timestamptz,$5::timestamptz)",
      values: ["shop.example.test", digest, ids.worker, now, later],
      answer: row("claimed", authorityClaim),
      invoke: (repository) =>
        repository.claimRedemptionReconciliation({
          hostname: "shop.example.test",
          redemptionDigest: digest,
          workerId: ids.worker,
          now,
          leaseExpiresAt: later,
        }),
    },
    {
      name: "reconciliation-success",
      mode: "BEGIN ISOLATION LEVEL READ COMMITTED",
      sql: "SELECT outcome, result_payload FROM saas.checkout_apply_reconciliation_success($1::text,$2::uuid,$3::text,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::text,$9::integer,$10::uuid,$11::uuid[],$12::uuid,$13::text,$14::timestamptz)",
      values: [
        merchantOid,
        ids.worker,
        token,
        ids.operation,
        digest,
        1234,
        1234,
        "TRY",
        1,
        ids.order,
        [ids.item],
        ids.event,
        "ORD-1",
        now,
      ],
      answer: row("settled", { orderNumber: "ORD-1" }),
      invoke: (repository) =>
        repository.applyReconciliationSuccess({
          merchantOid,
          workerId: ids.worker,
          leaseToken: token,
          operationId: ids.operation,
          fingerprint: digest,
          paymentAmount: 1234,
          totalAmount: 1234,
          currency: "TRY",
          testMode: 1,
          orderId: ids.order,
          orderItemIds: [ids.item],
          orderEventId: ids.event,
          orderNumber: "ORD-1",
          now,
        }),
    },
    {
      name: "reconciliation-unknown",
      mode: "BEGIN ISOLATION LEVEL READ COMMITTED",
      sql: "SELECT outcome, result_payload FROM saas.checkout_record_reconciliation_unknown($1::text,$2::uuid,$3::text,$4::uuid,$5::text,$6::timestamptz,$7::timestamptz)",
      values: [
        merchantOid,
        ids.worker,
        token,
        ids.operation,
        digest,
        later,
        now,
      ],
      answer: row("committed", {
        outcome: "unknown",
        status: "unknown",
        nextAttemptAt: later.toISOString(),
      }),
      invoke: (repository) =>
        repository.recordReconciliationUnknown({
          merchantOid,
          workerId: ids.worker,
          leaseToken: token,
          operationId: ids.operation,
          fingerprint: digest,
          nextAttemptAt: later,
          now,
        }),
    },
    {
      name: "finish-run",
      mode: "BEGIN ISOLATION LEVEL READ COMMITTED",
      sql: "SELECT outcome, result_payload FROM saas.checkout_finish_reconciliation_run($1::uuid,$2::text,$3::timestamptz)",
      values: [ids.worker, token, now],
      answer: row("committed", { status: "finished" }),
      invoke: (repository) =>
        repository.finishReconciliationRun({
          workerId: ids.worker,
          runToken: token,
          now,
        }),
    },
    {
      name: "cleanup",
      mode: "BEGIN ISOLATION LEVEL READ COMMITTED",
      sql: "SELECT outcome, result_payload FROM saas.checkout_cleanup_pre_provider_attempts($1::uuid,$2::uuid,$3::text,$4::timestamptz,$5::bigint)",
      values: [ids.worker, ids.operation, digest, now, 2],
      answer: row("committed", { releasedCount: 2 }),
      invoke: (repository) =>
        repository.cleanupPreProviderAttempts({
          workerId: ids.worker,
          operationId: ids.operation,
          fingerprint: digest,
          now,
          limit: 2,
        }),
    },
  ];
  for (const entry of cases) {
    const current = repo([entry.answer]);
    await entry.invoke(current.repository);
    assert.equal(current.client.calls[0]?.text, entry.mode, entry.name);
    const query = current.client.calls.find((call) => call.text === entry.sql);
    assert.deepEqual(query?.values, entry.values, entry.name);
    assert.equal(current.client.calls.at(-1)?.text, "COMMIT", entry.name);
    assert.deepEqual(current.client.releases, [false], entry.name);
  }
}
