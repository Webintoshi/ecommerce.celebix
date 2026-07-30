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
const validSnapshot = {
  schemaVersion: 1,
  operationId: "70000000-0000-4000-8000-000000000001",
  replayed: false,
  store: { id: "20000000-0000-4000-8000-000000000001", slug: "tenant-a", status: "active" },
  primaryDomain: {
    schemaVersion: 1, hostname: "tenant-a.example.test", domainId: "30000000-0000-4000-8000-000000000001",
    domainType: "platform_subdomain", storeId: "20000000-0000-4000-8000-000000000001", storeSlug: "tenant-a",
    canonicalHostname: "tenant-a.example.test", status: "active", cacheVersion: 1,
  },
  membership: {
    schemaVersion: 1, id: "40000000-0000-4000-8000-000000000001", principalId: "10000000-0000-4000-8000-000000000001",
    storeId: "20000000-0000-4000-8000-000000000001", role: "store_owner", status: "active",
    createdAt: "2026-07-11T01:00:00.000Z", updatedAt: "2026-07-11T01:00:00.000Z",
  },
  plan: {
    schemaVersion: 1, planId: "00000000-0000-4000-8000-000000000001", planCode: "free_starter", version: 1, status: "active",
    features: ["catalog", "orders", "customers", "content", "media", "analytics", "checkout"],
    limits: { products: 100, staff: 1, storageBytes: 1_000_000_000, monthlyOrders: 100, customDomains: 0 },
    validFrom: "2026-07-11T01:00:00.000Z",
  },
  mediaStorage: { schemaVersion: 1, status: "ready", version: 1 },
  provisioningStatus: "ready",
  panelUrl: "https://tenant-a.admin.celebix.site",
  storefrontUrl: "https://tenant-a.example.test",
};
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
  for (const [row, expected] of [[undefined, "absent"], [operation("processing", "b".repeat(64)), "processing"], [operation("failed", "b".repeat(64)), "failed"]] as const) {
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

test("recovery validates committed durability before fingerprint classification", async () => {
  const callerFingerprint = "a".repeat(64) as CanonicalTenantFingerprint;
  const classify = async (row: Record<string, unknown>) => {
    const client = new RecoveryClient(); client.row = row;
    const classification = await recovery(client).recover("opaque-key", callerFingerprint);
    assert.equal(client.calls.filter((text) => /INSERT|UPDATE|DELETE/.test(text)).length, 0);
    return classification;
  };

  assert.equal((await classify(operation("committed", "a".repeat(64), structuredClone(validSnapshot)))).kind, "committed_match");
  assert.equal((await classify(operation("committed", "b".repeat(64), structuredClone(validSnapshot)))).kind, "committed_mismatch");
  assert.equal((await classify(operation("committed", "g".repeat(64), structuredClone(validSnapshot)))).kind, "corrupt");
  assert.equal((await classify(operation("committed", "b".repeat(64), null))).kind, "corrupt");

  const replayed = structuredClone(validSnapshot); replayed.replayed = true;
  assert.equal((await classify(operation("committed", "b".repeat(64), replayed))).kind, "corrupt");
  const wrongPanel = structuredClone(validSnapshot); wrongPanel.panelUrl = "https://wrong.example.test/stores/tenant-a";
  assert.equal((await classify(operation("committed", "b".repeat(64), wrongPanel))).kind, "corrupt");
  const malformedNestedId = structuredClone(validSnapshot); malformedNestedId.membership.id = "not-a-uuid";
  assert.equal((await classify(operation("committed", "b".repeat(64), malformedNestedId))).kind, "corrupt");
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
