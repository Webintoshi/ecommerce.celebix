import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult } from "pg";

import type { CanonicalTenantFingerprint } from "../types.ts";
import { SaaSDataPersistenceError, SaaSDataPoolTimeoutError } from "./errors.ts";
import { PostgresTenantOperationRecovery } from "./recovery.ts";
import type { PostgresClientLike } from "./repository.ts";

function result(rows: Record<string, unknown>[]): QueryResult<Record<string, unknown>> {
  return { command: "", rowCount: rows.length, oid: 0, fields: [], rows };
}

class RecoveryClient implements PostgresClientLike {
  readonly calls: string[] = [];
  released: Array<boolean | Error | undefined> = [];
  row: Record<string, unknown> | undefined;
  failCommit = false;
  async query(text: string): Promise<QueryResult<Record<string, unknown>>> {
    this.calls.push(text);
    if (text === "COMMIT" && this.failCommit) throw Object.assign(new Error("private connection detail"), { code: "08006" });
    return /FROM saas\.tenant_operations/.test(text) ? result(this.row ? [this.row] : []) : result([]);
  }
  release(value?: boolean | Error): void { this.released.push(value); }
}

const time = new Date("2026-07-11T01:00:00.000Z");
function operation(status: "processing" | "failed" | "committed", fingerprint = "a".repeat(64), resultPayload: unknown = null) {
  return { id: "70000000-0000-4000-8000-000000000001", idempotency_key: "opaque-key", payload_fingerprint: fingerprint, status, result_payload: resultPayload, created_at: time, updated_at: time };
}

function recovery(client: RecoveryClient) {
  return new PostgresTenantOperationRecovery({
    pool: { connect: async () => client },
    timeouts: { poolCheckoutMs: 100, statementMs: 2_000, lockMs: 500, idleTransactionMs: 3_000 },
    bootstrapRole: "celebix_saas_bootstrap",
    panelOrigin: "https://panel.example.test",
  });
}

test("recovery uses a fresh read-only transaction and classifies absent, processing, and failed", async () => {
  for (const [row, expected] of [[undefined, "absent"], [operation("processing"), "processing"], [operation("failed"), "failed"]] as const) {
    const client = new RecoveryClient(); client.row = row;
    assert.equal((await recovery(client).recover("opaque-key", "a".repeat(64) as CanonicalTenantFingerprint)).kind, expected);
    assert.match(client.calls[0]!, /BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY/);
    assert.ok(client.calls.includes("SET LOCAL ROLE celebix_saas_bootstrap"));
    assert.equal(client.calls.at(-1), "COMMIT");
    assert.deepEqual(client.released, [undefined]);
  }
});

test("recovery construction rejects a non-origin panel authority before pool access", () => {
  let connects = 0;
  assert.throws(() => new PostgresTenantOperationRecovery({
    pool: { connect: async () => { connects += 1; return new RecoveryClient(); } },
    timeouts: { poolCheckoutMs: 100, statementMs: 2_000, lockMs: 500, idleTransactionMs: 3_000 },
    bootstrapRole: "celebix_saas_bootstrap",
    panelOrigin: "http://panel.example.test",
  }), SaaSDataPersistenceError);
  assert.equal(connects, 0);
});

test("recovery classifies malformed and fingerprint-mismatched durable rows without mutation", async () => {
  const malformed = new RecoveryClient(); malformed.row = operation("committed", "a".repeat(64), null);
  assert.equal((await recovery(malformed).recover("opaque-key", "a".repeat(64) as CanonicalTenantFingerprint)).kind, "corrupt");
  const mismatch = new RecoveryClient(); mismatch.row = operation("committed", "b".repeat(64), null);
  assert.equal((await recovery(mismatch).recover("opaque-key", "a".repeat(64) as CanonicalTenantFingerprint)).kind, "committed_mismatch");
  assert.equal(mismatch.calls.filter((text) => /INSERT|UPDATE|DELETE/.test(text)).length, 0);
});

test("recovery destroys a client after a COMMIT response error and never sends rollback", async () => {
  const client = new RecoveryClient();
  client.failCommit = true;
  await assert.rejects(recovery(client).recover("opaque-key", "a".repeat(64) as CanonicalTenantFingerprint), /saas_data_persistence_failed/);
  assert.equal(client.calls.filter((text) => text === "ROLLBACK").length, 0);
  assert.deepEqual(client.released, [true]);
});

test("recovery shares generic rejection and adapter-owned checkout-timeout classification", async () => {
  const generic = new PostgresTenantOperationRecovery({
    pool: { connect: async () => { throw Object.assign(new Error("private DNS detail"), { code: "08006" }); } },
    timeouts: { poolCheckoutMs: 20, statementMs: 2_000, lockMs: 500, idleTransactionMs: 3_000 },
    bootstrapRole: "celebix_saas_bootstrap",
    panelOrigin: "https://panel.example.test",
  });
  await assert.rejects(generic.recover("opaque-key", "a".repeat(64) as CanonicalTenantFingerprint), (error: unknown) => {
    assert.ok(error instanceof SaaSDataPersistenceError);
    assert.equal(error instanceof SaaSDataPoolTimeoutError, false);
    return true;
  });

  const timedOut = new PostgresTenantOperationRecovery({
    pool: { connect: () => new Promise(() => undefined) },
    timeouts: { poolCheckoutMs: 5, statementMs: 2_000, lockMs: 500, idleTransactionMs: 3_000 },
    bootstrapRole: "celebix_saas_bootstrap",
    panelOrigin: "https://panel.example.test",
  });
  await assert.rejects(timedOut.recover("opaque-key", "a".repeat(64) as CanonicalTenantFingerprint), SaaSDataPoolTimeoutError);
});
