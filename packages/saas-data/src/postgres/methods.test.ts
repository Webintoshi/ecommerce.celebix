import assert from "node:assert/strict";
import test from "node:test";

import type { QueryResult } from "pg";

import type { CanonicalTenantFingerprint, TenantOperationRecord } from "../types.ts";
import { SaaSDataUniqueConflict } from "../errors.ts";
import { PostgresSaaSDataRepository, type PostgresClientLike } from "./repository.ts";

function result(rows: Record<string, unknown>[]): QueryResult<Record<string, unknown>> {
  return { command: "", rowCount: rows.length, oid: 0, fields: [], rows };
}

class MethodClient implements PostgresClientLike {
  readonly calls: Array<{ text: string; values: unknown[] }> = [];
  released = false;
  handler: (text: string, values: unknown[]) => QueryResult<Record<string, unknown>> = () => result([]);
  async query(text: string, values: unknown[] = []) {
    this.calls.push({ text, values });
    return this.handler(text, values);
  }
  release(): void { this.released = true; }
}

function make(client: MethodClient) {
  return new PostgresSaaSDataRepository({
    pool: { connect: async () => client },
    generateId: () => "90000000-0000-4000-8000-000000000001",
    audit: () => undefined,
    timeouts: { statementMs: 5_000, lockMs: 2_000, idleTransactionMs: 8_000 },
    bootstrapRole: "celebix_saas_bootstrap",
  });
}

const time = new Date("2026-07-11T01:00:00.000Z");

test("atomic claim uses INSERT arbitration and a separate winner SELECT", async () => {
  const client = new MethodClient();
  client.handler = (text) => {
    if (/INSERT INTO saas\.tenant_operations/.test(text)) return result([]);
    if (/FROM saas\.tenant_operations\s+WHERE idempotency_key/.test(text)) return result([{
      id: "70000000-0000-4000-8000-000000000001",
      idempotency_key: "opaque-key",
      payload_fingerprint: "a".repeat(64),
      status: "processing",
      result_payload: null,
      created_at: time,
      updated_at: time,
    }]);
    return result([]);
  };
  const transaction = await make(client).beginTransaction();
  const claim = await transaction.operations.claim({
    id: "70000000-0000-4000-8000-000000000002",
    idempotencyKey: "opaque-key",
    fingerprint: "a".repeat(64) as CanonicalTenantFingerprint,
    status: "processing",
    createdAt: time.toISOString(),
    updatedAt: time.toISOString(),
  });
  assert.equal(claim.kind, "existing");
  const dataCalls = client.calls.slice(5);
  assert.match(dataCalls[0]!.text, /ON CONFLICT \(idempotency_key\) DO NOTHING\s+RETURNING/is);
  assert.match(dataCalls[1]!.text, /WHERE idempotency_key = \$1/);
  assert.deepEqual(dataCalls[1]!.values, ["opaque-key"]);
  await transaction.rollback();
});

test("plan loading reads persisted plan, ordered enabled features, and ordered effective limits", async () => {
  const client = new MethodClient();
  client.handler = (text) => {
    if (/FROM saas\.plans/.test(text)) return result([{ id: "00000000-0000-4000-8000-000000000001", plan_code: "free_starter", version: 1, status: "active", valid_from: time, valid_until: null }]);
    if (/FROM saas\.plan_features/.test(text)) return result([{ feature_key: "catalog" }, { feature_key: "orders" }]);
    if (/FROM saas\.plan_limits/.test(text)) return result([
      { limit_key: "products", effective_limit: "100" },
      { limit_key: "staff", effective_limit: "1" },
      { limit_key: "storageBytes", effective_limit: "1000000000" },
      { limit_key: "monthlyOrders", effective_limit: "100" },
      { limit_key: "customDomains", effective_limit: "0" },
    ]);
    return result([]);
  };
  const transaction = await make(client).beginTransaction();
  const plan = await transaction.plans.findByCodeVersion("free_starter", 1);
  assert.deepEqual(plan?.features, ["catalog", "orders"]);
  assert.deepEqual(plan?.limits, { products: 100, staff: 1, storageBytes: 1_000_000_000, monthlyOrders: 100, customDomains: 0 });
  assert.match(client.calls.at(-2)!.text, /enabled = true\s+ORDER BY feature_ordinal/is);
  assert.match(client.calls.at(-1)!.text, /ORDER BY limit_ordinal/is);
  await transaction.rollback();
});

test("store creation uses fixed parameterized SQL and maps only its named constraint", async () => {
  const client = new MethodClient();
  client.handler = (text) => {
    if (/INSERT INTO saas\.stores/.test(text)) throw { code: "23505", constraint: "stores_slug_key", detail: "secret" };
    return result([]);
  };
  const transaction = await make(client).beginTransaction();
  await assert.rejects(transaction.stores.create({
    id: "20000000-0000-4000-8000-000000000001",
    name: "Tenant A",
    slug: "tenant-a",
    status: "active",
    locale: "tr",
    currency: "TRY",
    themeKey: "starter",
    createdAt: time.toISOString(),
    updatedAt: time.toISOString(),
  }), (error: unknown) => error instanceof SaaSDataUniqueConflict && error.kind === "store_slug");
  const call = client.calls.at(-1)!;
  assert.match(call.text, /VALUES \(\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8, \$9\)/);
  assert.doesNotMatch(call.text, /Tenant A|tenant-a|starter/);
  await transaction.rollback();
});
