import assert from "node:assert/strict";
import test from "node:test";
import type { TenantContext } from "@celebix/saas-contracts";
import type { QueryResult } from "pg";
import { PostgresInventoryRepository, inventoryRepositoryErrorCode } from "./index.ts";
import type { PostgresClientLike, PostgresPoolLike } from "../postgres/pool.ts";

const STORE = "10000000-0000-4000-8000-000000000001";
const ID = "40000000-0000-4000-8000-000000000001";
const OTHER = "40000000-0000-4000-8000-000000000002";
const LOCATION = "20000000-0000-4000-8000-000000000001";
const DESTINATION = "20000000-0000-4000-8000-000000000002";
const LINE = "70000000-0000-4000-8000-000000000001";
const VARIANT = "30000000-0000-4000-8000-000000000001";
const OPERATION = "80000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-10-04T10:00:00.000Z");
const context = {
  schemaVersion: 1, requestId: "test", principal: { id: "10000000-0000-4000-8000-000000000002", issuer: "https://identity.test/oidc", subject: "test" },
  store: { id: STORE, slug: "store", status: "active" }, membership: { id: "10000000-0000-4000-8000-000000000003", role: "store_owner", status: "active" },
  entitlements: { schemaVersion: 1, planId: "10000000-0000-4000-8000-000000000004", planCode: "growth", version: 2, status: "active", features: ["catalog"], limits: { products: 100, staff: 5, storageBytes: 1024 }, validFrom: "2026-01-01T00:00:00.000Z" }, locale: "tr-TR",
} as TenantContext;
const authority = { tenantContext: context, now: NOW, operationId: OPERATION };
const projection = (status: string, version: number, id = ID) => ({ id, status, version, updatedAt: NOW.toISOString(), replayed: false });
type Row = { outcome: string; result_payload: unknown };
class Client implements PostgresClientLike {
  queries: { text: string; values?: unknown[] }[] = [];
  releases: (boolean | Error | undefined)[] = [];
  constructor(readonly responses: Row[], readonly failCommit = false) {}
  async query(text: string, values?: unknown[]): Promise<QueryResult<Record<string, unknown>>> {
    this.queries.push({ text, values });
    if (text === "COMMIT" && this.failCommit) throw new Error("socket closed");
    const rows = text.startsWith("SELECT outcome,result_payload FROM saas.") ? [this.responses.shift()!] : [];
    return { rows, rowCount: rows.length, command: "SELECT", oid: 0, fields: [] } as QueryResult<Record<string, unknown>>;
  }
  release(value?: boolean | Error) { this.releases.push(value); }
}
function repository(clients: Client[], generated = ID, audit: string[] = []) {
  const pool: PostgresPoolLike = { async connect() { const client = clients.shift(); if (!client) throw Error("unexpected checkout"); return client; } };
  return new PostgresInventoryRepository({ pool, role: "celebix_saas_app", uuid: () => generated, audit: event => { audit.push(event.type); }, timeouts: { poolCheckoutMs: 10, statementMs: 20, lockMs: 30, idleTransactionMs: 40 } });
}
const definitions = [
  { method: "savePurchaseOrderAndOrder" as const, base: "purchasing_save", next: "purchasing_transition", outcome: "transitioned", status: "ordered", input: { ...authority, locationId: LOCATION, supplierName: "Tedarikçi", lines: [{ lineId: LINE, variantId: VARIANT, orderedQuantity: 2, unitCostCents: 1489 }] }, existing: { orderId: ID, expectedVersion: 4 } },
  { method: "saveCountAndStart" as const, base: "inventory_counts_save", next: "inventory_counts_start", outcome: "started", status: "counting", input: { ...authority, locationId: LOCATION, lines: [{ lineId: LINE, variantId: VARIANT }] }, existing: { countId: ID, expectedVersion: 4 } },
  { method: "saveTransferAndDispatch" as const, base: "inventory_transfers_save", next: "inventory_transfers_dispatch", outcome: "dispatched", status: "in_transit", input: { ...authority, sourceLocationId: LOCATION, destinationLocationId: DESTINATION, lines: [{ lineId: LINE, variantId: VARIANT, quantity: 2 }] }, existing: { transferId: ID, expectedVersion: 4 } },
] as const;
for (const def of definitions) {
  for (const edit of [false, true]) test(`${def.method} ${edit ? "activates an existing draft" : "creates an active record"} in one native transaction`, async () => {
    const savedVersion = edit ? 5 : 1;
    const client = new Client([{ outcome: "saved", result_payload: projection("draft", savedVersion) }, { outcome: def.outcome, result_payload: projection(def.status, savedVersion + 1) }]);
    const result = await (repository([client])[def.method] as Function)({ ...def.input, ...(edit ? def.existing : {}) });
    assert.equal(result.status, def.status); assert.equal(result.version, savedVersion + 1);
    assert.equal(client.queries[0].text, "BEGIN ISOLATION LEVEL READ COMMITTED");
    assert.equal(client.queries.filter(q => q.text.startsWith("BEGIN")).length, 1);
    assert.equal(client.queries.at(-1)?.text, "COMMIT");
    const writes = client.queries.filter(q => q.text.startsWith("SELECT outcome,result_payload FROM saas."));
    assert.equal(writes.length, 2); assert.ok(writes[0].text.includes(`saas.${def.base}(`)); assert.ok(writes[1].text.includes(`saas.${def.next}(`));
    assert.equal(writes[0].values?.[7], OPERATION); assert.notEqual(writes[1].values?.[7], OPERATION);
    assert.match(String(writes[1].values?.[7]), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(writes[1].values?.[9], ID); assert.equal(writes[1].values?.[10], savedVersion);
    assert.deepEqual(client.releases, [undefined]);
  });
  test(`${def.method} replay continues with the durable target and deterministic second key`, async () => {
    const run = async (generated: string) => {
      const client = new Client([{ outcome: "operation_replayed", result_payload: projection("draft", 1) }, { outcome: "operation_replayed", result_payload: projection(def.status, 2) }]);
      const result = await (repository([client], generated)[def.method] as Function)(def.input);
      assert.equal(result.id, ID); assert.equal(result.replayed, true);
      const writes = client.queries.filter(q => q.text.startsWith("SELECT outcome,result_payload FROM saas."));
      assert.equal(writes[1].values?.[9], ID);
      return writes[1].values?.slice(7, 11);
    };
    assert.deepEqual(await run(ID), await run(OTHER));
  });
  test(`${def.method} second-stage rejection rolls back the whole save`, async () => {
    const client = new Client([{ outcome: "saved", result_payload: projection("draft", 1) }, { outcome: "active_hold_conflict", result_payload: null }]);
    await assert.rejects(() => (repository([client])[def.method] as Function)(def.input), error => inventoryRepositoryErrorCode(error) === "active_hold_conflict");
    assert.equal(client.queries.at(-1)?.text, "ROLLBACK"); assert.equal(client.queries.some(q => q.text === "COMMIT"), false);
  });
  test(`${def.method} denies the first stage without attempting activation`, async () => {
    const client = new Client([{ outcome: "membership_denied", result_payload: null }]);
    await assert.rejects(() => (repository([client])[def.method] as Function)(def.input), error => inventoryRepositoryErrorCode(error) === "membership_denied");
    assert.equal(client.queries.filter(q => q.text.startsWith("SELECT outcome,result_payload FROM saas.")).length, 1);
    assert.equal(client.queries.at(-1)?.text, "ROLLBACK");
  });
  test(`${def.method} uncertain COMMIT recovers the final operation rather than the saved draft`, async () => {
    const client = new Client([{ outcome: "saved", result_payload: projection("draft", 1) }, { outcome: def.outcome, result_payload: projection(def.status, 2) }], true);
    const recovery = new Client([{ outcome: "operation_replayed", result_payload: projection(def.status, 2) }]);
    const audit: string[] = [];
    const result = await (repository([client, recovery], ID, audit)[def.method] as Function)(def.input);
    assert.equal(result.status, def.status); assert.equal(result.replayed, true); assert.deepEqual(audit, ["inventory_commit_unknown"]);
    const final = client.queries.filter(q => q.text.startsWith("SELECT outcome,result_payload FROM saas.")).at(-1)!;
    const recovered = recovery.queries.find(q => q.text.includes("inventory_recover_operation("))!;
    assert.deepEqual(recovered.values?.slice(7), final.values?.slice(7, 9));
    assert.equal(recovery.queries[0].text, "BEGIN READ ONLY");
  });
}
test("direct count start rejects counted values before checkout so start cannot erase user input", async () => {
  const client = new Client([]);
  await assert.rejects(() => repository([client]).saveCountAndStart({ ...authority, locationId: LOCATION, lines: [{ lineId: LINE, variantId: VARIANT, countedQuantity: 0 }] }), error => inventoryRepositoryErrorCode(error) === "invalid_input");
  assert.equal(client.queries.length, 0);
});

test("direct save namespaces cannot replay an old draft key and malformed activation rolls back", async () => {
  const input = definitions[0].input;
  const legacy = new Client([{ outcome: "saved", result_payload: projection("draft", 1) }]);
  await repository([legacy]).savePurchaseOrder(input);
  const activated = new Client([{ outcome: "saved", result_payload: projection("draft", 1) }, { outcome: "transitioned", result_payload: projection("ordered", 2) }]);
  await repository([activated]).savePurchaseOrderAndOrder(input);
  const legacySave = legacy.queries.find(query => query.text.includes("saas.purchasing_save("))!;
  const directSave = activated.queries.find(query => query.text.includes("saas.purchasing_save("))!;
  assert.notEqual(legacySave.values?.[8], directSave.values?.[8]);
  for (const invalid of [projection("draft", 2), projection("ordered", 3), projection("ordered", 2, OTHER), { ...projection("ordered", 2), private: true }]) {
    const client = new Client([{ outcome: "saved", result_payload: projection("draft", 1) }, { outcome: "transitioned", result_payload: invalid }]);
    await assert.rejects(() => repository([client]).savePurchaseOrderAndOrder(input), error => inventoryRepositoryErrorCode(error) === "unavailable");
    assert.equal(client.queries.at(-1)?.text, "ROLLBACK");
  }
});

test("activating an already running count cannot reset its snapshot or quantities", async () => {
  const client = new Client([{ outcome: "saved", result_payload: projection("counting", 5) }]);
  await assert.rejects(() => repository([client]).saveCountAndStart({ ...definitions[1].input, countId: ID, expectedVersion: 4 }), error => inventoryRepositoryErrorCode(error) === "invalid_transition");
  assert.equal(client.queries.at(-1)?.text, "ROLLBACK");
  assert.equal(client.queries.some(query => query.text.includes("inventory_counts_start(")), false);
});

test("direct save line limits and finite two-version progression fail before checkout", async () => {
  for (const def of definitions) {
    const client = new Client([]);
    const lines = Array.from({ length: 501 }, (_, index) => ({ ...def.input.lines[0], lineId: `70000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, variantId: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}` }));
    await assert.rejects(() => (repository([client])[def.method] as Function)({ ...def.input, lines }), error => inventoryRepositoryErrorCode(error) === "invalid_input");
    await assert.rejects(() => (repository([client])[def.method] as Function)({ ...def.input, ...def.existing, expectedVersion: Number.MAX_SAFE_INTEGER - 1 }), error => inventoryRepositoryErrorCode(error) === "invalid_input");
    assert.equal(client.queries.length, 0);
  }
});
