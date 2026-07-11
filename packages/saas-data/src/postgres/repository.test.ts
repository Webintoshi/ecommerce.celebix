import assert from "node:assert/strict";
import test from "node:test";

import type { Pool, QueryResult } from "pg";

import { PostgresSaaSDataRepository, type PostgresPoolLike } from "./repository.ts";
import { SaaSDataPersistenceError, SaaSDataPoolTimeoutError, SaaSDataTransactionStateError, SaaSDataUnknownCommitError } from "./errors.ts";

function proveNativePoolCompatibility(nativePgPool: Pool): PostgresPoolLike {
  return nativePgPool;
}
void proveNativePoolCompatibility;

class FakeClient {
  readonly calls: Array<{ text: string; values: readonly unknown[] }> = [];
  readonly releases: Array<boolean | Error | undefined> = [];
  failCommit = false;
  failRollback = false;

  async query(text: string, values: readonly unknown[] = []): Promise<QueryResult<Record<string, unknown>>> {
    this.calls.push({ text, values });
    if (text === "COMMIT" && this.failCommit) throw Object.assign(new Error("socket and SQL secret"), { code: "08006" });
    if (text === "ROLLBACK" && this.failRollback) throw Object.assign(new Error("rollback socket"), { code: "08006" });
    return { command: "", rowCount: null, oid: 0, fields: [], rows: [] };
  }

  release(destroy?: boolean | Error): void { this.releases.push(destroy); }
}

function repository(client: FakeClient, events: string[] = []) {
  let next = 0;
  return new PostgresSaaSDataRepository({
    pool: { connect: async () => client },
    generateId: () => `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}`,
    audit: (event) => events.push(event.type),
    timeouts: { poolCheckoutMs: 100, statementMs: 5_000, lockMs: 2_000, idleTransactionMs: 8_000 },
    bootstrapRole: "celebix_saas_bootstrap",
    panelOrigin: "https://panel.example.test",
  });
}

test("beginTransaction binds one client, READ COMMITTED, local timeouts, then exact bootstrap role", async () => {
  const client = new FakeClient();
  const transaction = await repository(client).beginTransaction();
  assert.deepEqual(client.calls, [
    { text: "BEGIN ISOLATION LEVEL READ COMMITTED", values: [] },
    { text: "SELECT pg_catalog.set_config('statement_timeout', $1, true)", values: ["5000ms"] },
    { text: "SELECT pg_catalog.set_config('lock_timeout', $1, true)", values: ["2000ms"] },
    { text: "SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", values: ["8000ms"] },
    { text: "SET LOCAL ROLE celebix_saas_bootstrap", values: [] },
  ]);
  await transaction.rollback();
  assert.deepEqual(client.releases, [undefined]);
});

test("repository construction rejects a non-origin panel authority with a safe error", () => {
  const client = new FakeClient();
  assert.throws(() => new PostgresSaaSDataRepository({
    pool: { connect: async () => client },
    generateId: () => "00000000-0000-4000-8000-000000000001",
    audit: () => undefined,
    timeouts: { poolCheckoutMs: 100, statementMs: 5_000, lockMs: 2_000, idleTransactionMs: 8_000 },
    bootstrapRole: "celebix_saas_bootstrap",
    panelOrigin: "https://panel.example.test/path",
  }), SaaSDataPersistenceError);
  assert.equal(client.calls.length, 0);
});

test("generic pool acquisition failures remain persistence errors rather than adapter timeouts", async () => {
  for (const driverError of [new Error("postgres://secret@production/database"), { code: "08006", message: "private host" }]) {
    const adapter = new PostgresSaaSDataRepository({
      pool: { connect: async () => { throw driverError; } },
      generateId: () => "00000000-0000-4000-8000-000000000001",
      audit: () => undefined,
      timeouts: { poolCheckoutMs: 25, statementMs: 5_000, lockMs: 2_000, idleTransactionMs: 8_000 },
      bootstrapRole: "celebix_saas_bootstrap",
      panelOrigin: "https://panel.example.test",
    });
    await assert.rejects(adapter.beginTransaction(), (error: unknown) => {
      assert.ok(error instanceof SaaSDataPersistenceError);
      assert.equal(error instanceof SaaSDataPoolTimeoutError, false);
      assert.doesNotMatch(error.message, /postgres|secret|production|database|host/i);
      return true;
    });
    assert.equal("query" in adapter, false);
  }
});

test("only the adapter-owned checkout deadline produces a pool timeout", async () => {
  const adapter = new PostgresSaaSDataRepository({
    pool: { connect: () => new Promise(() => undefined) },
    generateId: () => "00000000-0000-4000-8000-000000000001",
    audit: () => undefined,
    timeouts: { poolCheckoutMs: 10, statementMs: 5_000, lockMs: 2_000, idleTransactionMs: 8_000 },
    bootstrapRole: "celebix_saas_bootstrap",
    panelOrigin: "https://panel.example.test",
  });
  const outcome = await Promise.race([
    adapter.beginTransaction().catch((error: unknown) => error),
    new Promise<Error>((resolve) => setTimeout(() => resolve(new Error("external_test_deadline")), 40)),
  ]);
  assert.ok(outcome instanceof SaaSDataPoolTimeoutError);
});

test("a client resolving after checkout timeout is destroyed exactly once without being used", async () => {
  let resolveClient!: (client: FakeClient) => void;
  const lateClient = new FakeClient();
  const adapter = new PostgresSaaSDataRepository({
    pool: { connect: () => new Promise((resolve) => { resolveClient = resolve; }) },
    generateId: () => "00000000-0000-4000-8000-000000000001",
    audit: () => undefined,
    timeouts: { poolCheckoutMs: 10, statementMs: 5_000, lockMs: 2_000, idleTransactionMs: 8_000 },
    bootstrapRole: "celebix_saas_bootstrap",
    panelOrigin: "https://panel.example.test",
  });

  await assert.rejects(adapter.beginTransaction(), SaaSDataPoolTimeoutError);
  resolveClient(lateClient);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(lateClient.releases, [true]);
  assert.equal(lateClient.calls.length, 0);
});

test("successful and repeated checkout outcomes leave no active deadline behavior or late clients", async () => {
  const normalClient = new FakeClient();
  const normal = repository(normalClient);
  const transaction = await normal.beginTransaction();
  await transaction.rollback();
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.deepEqual(normalClient.releases, [undefined]);

  const lateClients = Array.from({ length: 5 }, () => new FakeClient());
  await Promise.all(lateClients.map(async (client) => {
    let resolveClient!: (value: FakeClient) => void;
    const adapter = new PostgresSaaSDataRepository({
      pool: { connect: () => new Promise((resolve) => { resolveClient = resolve; }) },
      generateId: () => "00000000-0000-4000-8000-000000000001",
      audit: () => undefined,
      timeouts: { poolCheckoutMs: 5, statementMs: 5_000, lockMs: 2_000, idleTransactionMs: 8_000 },
      bootstrapRole: "celebix_saas_bootstrap",
      panelOrigin: "https://panel.example.test",
    });
    await assert.rejects(adapter.beginTransaction(), SaaSDataPoolTimeoutError);
    resolveClient(client);
  }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(lateClients.every((client) => client.releases.length === 1 && client.releases[0] === true));
});

test("all calls after a confirmed rollback reject locally without touching the client", async () => {
  const client = new FakeClient();
  const transaction = await repository(client).beginTransaction();
  await transaction.rollback();
  const callCount = client.calls.length;
  await assert.rejects(transaction.rollback(), (error: unknown) => error instanceof SaaSDataTransactionStateError && error.code === "transaction_already_rolled_back");
  await assert.rejects(transaction.commit(), (error: unknown) => error instanceof SaaSDataTransactionStateError && error.code === "transaction_already_rolled_back");
  await assert.rejects(transaction.stores.findBySlug("tenant-a"), SaaSDataTransactionStateError);
  assert.equal(client.calls.length, callCount);
  assert.deepEqual(client.releases, [undefined]);
});

test("confirmed commit releases once and every later terminal call rejects locally", async () => {
  const client = new FakeClient();
  const transaction = await repository(client).beginTransaction();
  await transaction.commit();
  await assert.rejects(transaction.commit(), (error: unknown) => error instanceof SaaSDataTransactionStateError && error.code === "transaction_already_committed");
  await assert.rejects(transaction.rollback(), (error: unknown) => error instanceof SaaSDataTransactionStateError && error.code === "transaction_already_committed");
  assert.deepEqual(client.releases, [undefined]);
});

test("COMMIT errors become unknown outcome, destroy client, emit safe audit, and never rollback", async () => {
  const client = new FakeClient();
  const events: string[] = [];
  client.failCommit = true;
  const transaction = await repository(client, events).beginTransaction();
  await assert.rejects(transaction.commit(), SaaSDataUnknownCommitError);
  assert.equal(client.calls.filter((call) => call.text === "ROLLBACK").length, 0);
  assert.deepEqual(client.releases, [true]);
  assert.deepEqual(events, ["tenant_bootstrap_commit_unknown"]);
  await assert.rejects(transaction.rollback(), (error: unknown) => error instanceof SaaSDataTransactionStateError && error.code === "transaction_commit_unknown");
});

test("rollback failure marks transaction broken and destroys the client", async () => {
  const client = new FakeClient();
  client.failRollback = true;
  const transaction = await repository(client).beginTransaction();
  await assert.rejects(transaction.rollback());
  assert.deepEqual(client.releases, [true]);
  await assert.rejects(transaction.rollback(), (error: unknown) => error instanceof SaaSDataTransactionStateError && error.code === "transaction_broken");
});
