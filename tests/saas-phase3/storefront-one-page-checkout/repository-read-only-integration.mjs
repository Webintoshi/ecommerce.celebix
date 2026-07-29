import assert from "node:assert/strict";

import pg from "pg";

import { PostgresPublicCheckoutRepository } from "../../../packages/saas-data/src/storefront-checkout/repository.ts";

const { Pool } = pg;
const input = JSON.parse(process.argv[2] ?? "null");
assert.ok(input && typeof input === "object" && !Array.isArray(input));

const pool = new Pool({
  host: input.socket,
  port: input.port,
  database: input.database,
  user: "postgres",
  max: 1,
});
const observer = new Pool({
  host: input.socket,
  port: input.port,
  database: input.database,
  user: "postgres",
  max: 1,
});
const observedLockCounts = [];
const observedReadOnlySettings = [];

const repositoryPool = {
  async connect() {
    const client = await pool.connect();
    const backend = await client.query("SELECT pg_catalog.pg_backend_pid() AS pid");
    const backendPid = backend.rows[0].pid;
    return {
      async query(text, values) {
        const result = await client.query(text, values);
        if (text.includes("storefront_checkout_classify_payment_method")) {
          const transaction = await client.query("SHOW transaction_read_only");
          observedReadOnlySettings.push(transaction.rows[0].transaction_read_only);
          const locks = await observer.query(`SELECT pg_catalog.count(*)::integer AS count
            FROM pg_catalog.pg_locks
            WHERE pid=$1 AND granted AND (
              locktype IN('advisory','tuple')
              OR (locktype='relation' AND mode<>'AccessShareLock')
            )`, [backendPid]);
          observedLockCounts.push(locks.rows[0].count);
        }
        return result;
      },
      release(error) {
        client.release(error);
      },
    };
  },
};

const repository = new PostgresPublicCheckoutRepository({
  pool: repositoryPool,
  role: "celebix_saas_workflow",
  timeouts: {
    poolCheckoutMs: 2_000,
    statementMs: 5_000,
    lockMs: 1_000,
    idleTransactionMs: 5_000,
  },
  audit: () => undefined,
});

async function durableEffects() {
  const result = await pool.query(`SELECT
    (SELECT pg_catalog.count(*) FROM saas.storefront_checkout_operations) AS operations,
    (SELECT pg_catalog.count(*) FROM saas.payment_attempts) AS attempts,
    (SELECT pg_catalog.count(*) FROM saas.storefront_checkout_payment_bridges) AS bridges,
    (SELECT pg_catalog.count(*) FROM saas.checkout_inventory_reservations
      WHERE payment_attempt_id IS NOT NULL) AS payment_reservations`);
  assert.equal(result.rowCount, 1);
  return result.rows[0];
}

async function retainedLocks() {
  const result = await pool.query(`SELECT pg_catalog.count(*)::integer AS retained
    FROM pg_catalog.pg_locks
    WHERE pid=pg_catalog.pg_backend_pid() AND locktype IN('advisory','tuple')`);
  assert.equal(result.rowCount, 1);
  return result.rows[0].retained;
}

try {
  const effectsBefore = await durableEffects();
  assert.equal(await retainedLocks(), 0);
  for (const [paymentMethodId, expectedKind] of input.cases) {
    const classified = await repository.classifyPaymentMethod({
      hostname: "store-a.test",
      credentialDigest: "a".repeat(64),
      now: new Date("2026-07-28T15:00:00.000Z"),
      submission: {
        cartVersion: input.cartVersion,
        checkoutNonce: input.checkoutNonce,
        operationId: "84000000-0000-4000-8000-000000000064",
        paymentMethodId,
        identityNumber: null,
        consents: { distanceSales: true, preInformation: true },
      },
    });
    assert.deepEqual(classified, { kind: expectedKind });
    assert.equal(await retainedLocks(), 0);
  }
  assert.deepEqual(observedReadOnlySettings, input.cases.map(() => "on"));
  assert.deepEqual(observedLockCounts, input.cases.map(() => 0));
  assert.deepEqual(await durableEffects(), effectsBefore);
  process.stdout.write("PASS real read-only checkout repository classification\n");
} finally {
  await observer.end();
  await pool.end();
}
