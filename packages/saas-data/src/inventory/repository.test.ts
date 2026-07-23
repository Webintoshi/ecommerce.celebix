import assert from "node:assert/strict";
import test from "node:test";

import type { TenantContext } from "@celebix/saas-contracts";
import type { QueryResult } from "pg";

import {
  InventoryRepositoryError,
  PostgresInventoryRepository,
  type InventoryRepository,
} from "./index.ts";
import type { PostgresClientLike, PostgresPoolLike } from "../postgres/pool.ts";

const STORE = "10000000-0000-4000-8000-000000000001";
const PRINCIPAL = "10000000-0000-4000-8000-000000000002";
const MEMBERSHIP = "10000000-0000-4000-8000-000000000003";
const PLAN = "10000000-0000-4000-8000-000000000004";
const LOCATION = "20000000-0000-4000-8000-000000000001";
const DESTINATION = "20000000-0000-4000-8000-000000000002";
const VARIANT = "30000000-0000-4000-8000-000000000001";
const ORDER = "40000000-0000-4000-8000-000000000001";
const COUNT = "50000000-0000-4000-8000-000000000001";
const TRANSFER = "60000000-0000-4000-8000-000000000001";
const LINE = "70000000-0000-4000-8000-000000000001";
const OPERATION = "80000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-07-23T10:00:00.000Z");
const TIMESTAMP = NOW.toISOString();

const CONFIGURE = Object.freeze([
  "SELECT pg_catalog.set_config('statement_timeout', $1, true)",
  "SELECT pg_catalog.set_config('lock_timeout', $1, true)",
  "SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)",
  "SET LOCAL ROLE celebix_saas_app",
]);

function tenant(): TenantContext {
  return {
    schemaVersion: 1,
    requestId: "request-private",
    principal: { id: PRINCIPAL, issuer: "https://identity.test/oidc", subject: "private" },
    store: { id: STORE, slug: "store", status: "active" },
    membership: { id: MEMBERSHIP, role: "store_owner", status: "active" },
    entitlements: {
      schemaVersion: 1,
      planId: PLAN,
      planCode: "growth",
      version: 2,
      status: "active",
      features: ["catalog"],
      limits: { products: 100, staff: 5, storageBytes: 1_024 },
      validFrom: "2026-01-01T00:00:00.000Z",
    },
    locale: "tr-TR",
  } as TenantContext;
}

const location = () => ({
  id: LOCATION, name: "Ana Depo", isDefault: true, status: "active",
  version: 1, createdAt: TIMESTAMP, updatedAt: TIMESTAMP,
});
const balance = () => ({ locationId: LOCATION, variantId: VARIANT, quantity: 7, version: 1, updatedAt: TIMESTAMP });
const purchase = () => ({
  id: ORDER, locationId: LOCATION, supplierName: "Tedarikçi", status: "draft",
  lines: [{ id: LINE, variantId: VARIANT, orderedQuantity: 2, receivedQuantity: 0, unitCostCents: 100, lineCostCents: 200 }],
  totalCostCents: 200, version: 1, createdAt: TIMESTAMP, updatedAt: TIMESTAMP,
});
const count = () => ({
  id: COUNT, locationId: LOCATION, status: "draft",
  lines: [{ id: LINE, variantId: VARIANT, expectedQuantity: 7 }],
  version: 1, createdAt: TIMESTAMP, updatedAt: TIMESTAMP,
});
const transfer = () => ({
  id: TRANSFER, sourceLocationId: LOCATION, destinationLocationId: DESTINATION, status: "draft",
  lines: [{ id: LINE, variantId: VARIANT, quantity: 2 }],
  version: 1, createdAt: TIMESTAMP, updatedAt: TIMESTAMP,
});
const mutation = (id: string, status: string, version: number) => ({ id, status, version, updatedAt: TIMESTAMP, replayed: false });
const authority = () => ({ tenantContext: tenant(), now: new Date(NOW) });

type QueryLog = Readonly<{ text: string; values?: unknown[] }>;
type ResultRow = Readonly<{ outcome: string; result_payload: unknown }>;

class Client implements PostgresClientLike {
  readonly queries: QueryLog[] = [];
  readonly releases: Array<boolean | Error | undefined> = [];
  private readonly response: ResultRow;
  private readonly commitError: boolean;
  constructor(response: ResultRow, commitError = false) {
    this.response = response;
    this.commitError = commitError;
  }
  async query(text: string, values?: unknown[]): Promise<QueryResult<Record<string, unknown>>> {
    this.queries.push({ text, values });
    if (text === "COMMIT" && this.commitError) throw new Error("private commit socket detail");
    const rows = text.startsWith("SELECT outcome,result_payload FROM saas.")
      ? [this.response as Record<string, unknown>]
      : [];
    return { rows, rowCount: rows.length } as QueryResult<Record<string, unknown>>;
  }
  release(destroy?: boolean | Error): void { this.releases.push(destroy); }
}

class Pool implements PostgresPoolLike {
  readonly clients: Client[];
  connectCount = 0;
  constructor(...clients: Client[]) { this.clients = clients; }
  async connect(): Promise<PostgresClientLike> {
    const client = this.clients[this.connectCount++];
    if (!client) throw new Error("private pool detail");
    return client;
  }
}

function repository(pool: PostgresPoolLike, generated = [ORDER, COUNT, TRANSFER], audit: string[] = []): InventoryRepository {
  let index = 0;
  return new PostgresInventoryRepository({
    pool,
    role: "celebix_saas_app",
    timeouts: { poolCheckoutMs: 10, statementMs: 20, lockMs: 30, idleTransactionMs: 40 },
    uuid: () => generated[index++] ?? "90000000-0000-4000-8000-000000000001",
    audit: (event) => { audit.push(event.type); },
  });
}

function assertConfigured(client: Client, begin: string, terminal: "COMMIT" | "ROLLBACK"): QueryLog {
  assert.equal(client.queries[0]?.text, begin);
  assert.deepEqual(client.queries.slice(1, 5).map((query) => query.text), CONFIGURE);
  assert.deepEqual(client.queries.slice(1, 4).map((query) => query.values), [["20ms"], ["30ms"], ["40ms"]]);
  assert.equal(client.queries.at(-1)?.text, terminal);
  return client.queries[5]!;
}

test("inventory repository runs every read in one exact read-only transaction and parses before commit", async () => {
  const cases = [
    {
      sql: "SELECT outcome,result_payload FROM saas.inventory_list_locations($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz)",
      response: { outcome: "listed", result_payload: { items: [location()] } },
      invoke: (repo: InventoryRepository) => repo.listLocations(authority()),
    },
    {
      sql: "SELECT outcome,result_payload FROM saas.inventory_list_balances($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid)",
      response: { outcome: "listed", result_payload: { items: [balance()] } },
      invoke: (repo: InventoryRepository) => repo.listBalances({ ...authority(), locationId: LOCATION }),
    },
    {
      sql: "SELECT outcome,result_payload FROM saas.purchasing_list($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz)",
      response: { outcome: "listed", result_payload: { items: [purchase()] } },
      invoke: (repo: InventoryRepository) => repo.listPurchaseOrders(authority()),
    },
    {
      sql: "SELECT outcome,result_payload FROM saas.purchasing_get($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid)",
      response: { outcome: "found", result_payload: purchase() },
      invoke: (repo: InventoryRepository) => repo.getPurchaseOrder({ ...authority(), orderId: ORDER }),
    },
    {
      sql: "SELECT outcome,result_payload FROM saas.inventory_counts_list($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz)",
      response: { outcome: "listed", result_payload: { items: [count()] } },
      invoke: (repo: InventoryRepository) => repo.listCounts(authority()),
    },
    {
      sql: "SELECT outcome,result_payload FROM saas.inventory_counts_get($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid)",
      response: { outcome: "found", result_payload: count() },
      invoke: (repo: InventoryRepository) => repo.getCount({ ...authority(), countId: COUNT }),
    },
    {
      sql: "SELECT outcome,result_payload FROM saas.inventory_transfers_list($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz)",
      response: { outcome: "listed", result_payload: { items: [transfer()] } },
      invoke: (repo: InventoryRepository) => repo.listTransfers(authority()),
    },
    {
      sql: "SELECT outcome,result_payload FROM saas.inventory_transfers_get($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid)",
      response: { outcome: "found", result_payload: transfer() },
      invoke: (repo: InventoryRepository) => repo.getTransfer({ ...authority(), transferId: TRANSFER }),
    },
  ] as const;

  for (const entry of cases) {
    const client = new Client(entry.response);
    const result = await entry.invoke(repository(new Pool(client)));
    assert.ok(result);
    const query = assertConfigured(client, "BEGIN READ ONLY", "COMMIT");
    assert.equal(query.text, entry.sql);
    assert.deepEqual(query.values?.slice(0, 7), [STORE, PRINCIPAL, MEMBERSHIP, PLAN, "growth", 2, NOW]);
    assert.deepEqual(client.releases, [undefined]);
  }

  const malformed = new Client({ outcome: "listed", result_payload: { items: [{ ...location(), storeId: STORE }] } });
  await assert.rejects(
    () => repository(new Pool(malformed)).listLocations(authority()),
    (error: unknown) => error instanceof InventoryRepositoryError && error.code === "unavailable",
  );
  assert.equal(malformed.queries.some((query) => query.text === "COMMIT"), false);
  assert.equal(malformed.queries.at(-1)?.text, "ROLLBACK");
});

test("inventory repository exposes the eleven exact mutation SQL signatures", async () => {
  const savePurchase = { ...authority(), operationId: OPERATION, locationId: LOCATION, supplierName: "Tedarikçi", lines: [{ lineId: LINE, variantId: VARIANT, orderedQuantity: 2, unitCostCents: 100 }] };
  const saveCount = { ...authority(), operationId: OPERATION, locationId: LOCATION, lines: [{ lineId: LINE, variantId: VARIANT, countedQuantity: 7 }] };
  const saveTransfer = { ...authority(), operationId: OPERATION, sourceLocationId: LOCATION, destinationLocationId: DESTINATION, lines: [{ lineId: LINE, variantId: VARIANT, quantity: 2 }] };
  const cases = [
    ["SELECT outcome,result_payload FROM saas.purchasing_save($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint,$12::uuid,$13::text,$14::jsonb)", { outcome: "saved", result_payload: mutation(ORDER, "draft", 1) }, (repo: InventoryRepository) => repo.savePurchaseOrder(savePurchase)],
    ["SELECT outcome,result_payload FROM saas.purchasing_transition($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint,$12::text)", { outcome: "transitioned", result_payload: mutation(ORDER, "ordered", 2) }, (repo: InventoryRepository) => repo.transitionPurchaseOrder({ ...authority(), operationId: OPERATION, orderId: ORDER, expectedVersion: 1, transition: "order" })],
    ["SELECT outcome,result_payload FROM saas.purchasing_receive($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint,$12::uuid,$13::jsonb)", { outcome: "received", result_payload: mutation(ORDER, "received", 2) }, (repo: InventoryRepository) => repo.receivePurchaseOrder({ ...authority(), operationId: OPERATION, orderId: ORDER, expectedVersion: 1, locationId: LOCATION, lines: [{ lineId: LINE, quantity: 2 }] })],
    ["SELECT outcome,result_payload FROM saas.inventory_counts_save($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint,$12::uuid,$13::jsonb)", { outcome: "saved", result_payload: mutation(COUNT, "draft", 1) }, (repo: InventoryRepository) => repo.saveCount(saveCount)],
    ["SELECT outcome,result_payload FROM saas.inventory_counts_start($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint)", { outcome: "started", result_payload: mutation(COUNT, "counting", 2) }, (repo: InventoryRepository) => repo.startCount({ ...authority(), operationId: OPERATION, countId: COUNT, expectedVersion: 1 })],
    ["SELECT outcome,result_payload FROM saas.inventory_counts_commit($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint)", { outcome: "committed", result_payload: mutation(COUNT, "committed", 2) }, (repo: InventoryRepository) => repo.commitCount({ ...authority(), operationId: OPERATION, countId: COUNT, expectedVersion: 1 })],
    ["SELECT outcome,result_payload FROM saas.inventory_counts_cancel($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint)", { outcome: "cancelled", result_payload: mutation(COUNT, "cancelled", 2) }, (repo: InventoryRepository) => repo.cancelCount({ ...authority(), operationId: OPERATION, countId: COUNT, expectedVersion: 1 })],
    ["SELECT outcome,result_payload FROM saas.inventory_transfers_save($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint,$12::uuid,$13::uuid,$14::jsonb)", { outcome: "saved", result_payload: mutation(TRANSFER, "draft", 1) }, (repo: InventoryRepository) => repo.saveTransfer(saveTransfer)],
    ["SELECT outcome,result_payload FROM saas.inventory_transfers_dispatch($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint)", { outcome: "dispatched", result_payload: mutation(TRANSFER, "in_transit", 2) }, (repo: InventoryRepository) => repo.dispatchTransfer({ ...authority(), operationId: OPERATION, transferId: TRANSFER, expectedVersion: 1 })],
    ["SELECT outcome,result_payload FROM saas.inventory_transfers_receive($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint)", { outcome: "received", result_payload: mutation(TRANSFER, "received", 2) }, (repo: InventoryRepository) => repo.receiveTransfer({ ...authority(), operationId: OPERATION, transferId: TRANSFER, expectedVersion: 1 })],
    ["SELECT outcome,result_payload FROM saas.inventory_transfers_cancel($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint)", { outcome: "cancelled", result_payload: mutation(TRANSFER, "cancelled", 2) }, (repo: InventoryRepository) => repo.cancelTransfer({ ...authority(), operationId: OPERATION, transferId: TRANSFER, expectedVersion: 1 })],
  ] as const;

  for (const [sql, response, invoke] of cases) {
    const client = new Client(response);
    const result = await invoke(repository(new Pool(client), [response.result_payload.id]));
    assert.equal(result.replayed, false);
    const query = assertConfigured(client, "BEGIN ISOLATION LEVEL READ COMMITTED", "COMMIT");
    assert.equal(query.text, sql);
    assert.match(String(query.values?.[8]), /^[a-f0-9]{64}$/);
    assert.deepEqual(client.releases, [undefined]);
  }
});

test("inventory repository canonicalizes line order into deterministic fingerprints and SQL payloads", async () => {
  const secondLine = "70000000-0000-4000-8000-000000000002";
  const secondVariant = "30000000-0000-4000-8000-000000000002";
  const response = { outcome: "saved", result_payload: mutation(TRANSFER, "draft", 2) };
  const left = new Client(response), right = new Client(response);
  const common = {
    ...authority(), operationId: OPERATION, transferId: TRANSFER, expectedVersion: 1,
    sourceLocationId: LOCATION, destinationLocationId: DESTINATION,
  };
  await repository(new Pool(left)).saveTransfer({
    ...common,
    lines: [
      { lineId: secondLine, variantId: secondVariant, quantity: 3 },
      { lineId: LINE, variantId: VARIANT, quantity: 2 },
    ],
  });
  await repository(new Pool(right)).saveTransfer({
    ...common,
    lines: [
      { lineId: LINE, variantId: VARIANT, quantity: 2 },
      { lineId: secondLine, variantId: secondVariant, quantity: 3 },
    ],
  });
  const leftValues = left.queries[5]?.values, rightValues = right.queries[5]?.values;
  assert.equal(leftValues?.[8], rightValues?.[8]);
  assert.equal(leftValues?.[13], rightValues?.[13]);
  assert.deepEqual(JSON.parse(String(leftValues?.[13])).map((line: { lineId: string }) => line.lineId), [LINE, secondLine]);
});

test("inventory repository destroys an unknown writer and performs exactly one fresh read-only recovery without retrying the write", async () => {
  const audit: string[] = [];
  const writer = new Client({ outcome: "dispatched", result_payload: mutation(TRANSFER, "in_transit", 2) }, true);
  const recovery = new Client({ outcome: "operation_replayed", result_payload: mutation(TRANSFER, "in_transit", 2) });
  const pool = new Pool(writer, recovery);
  const result = await repository(pool, [], audit).dispatchTransfer({
    ...authority(), operationId: OPERATION, transferId: TRANSFER, expectedVersion: 1,
  });
  assert.equal(result.replayed, true);
  assert.equal(pool.connectCount, 2);
  assert.deepEqual(writer.releases, [true]);
  assert.deepEqual(recovery.releases, [undefined]);
  assert.deepEqual(audit, ["inventory_commit_unknown"]);
  assert.equal(writer.queries.filter((query) => query.text.includes("inventory_transfers_dispatch")).length, 1);
  const recoveryQuery = assertConfigured(recovery, "BEGIN READ ONLY", "COMMIT");
  assert.equal(recoveryQuery.text, "SELECT outcome,result_payload FROM saas.inventory_recover_operation($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text)");
  assert.equal(recovery.queries.filter((query) => query.text.includes("inventory_recover_operation")).length, 1);
});

test("inventory repository rolls back known mutation failures and maps unknown failures without leaking details", async () => {
  for (const [outcome, code] of [
    ["version_conflict", "version_conflict"],
    ["resource_not_found", "resource_not_found"],
    ["active_hold_conflict", "active_hold_conflict"],
  ] as const) {
    const client = new Client({ outcome, result_payload: null });
    await assert.rejects(
      () => repository(new Pool(client)).dispatchTransfer({
        ...authority(), operationId: OPERATION, transferId: TRANSFER, expectedVersion: 1,
      }),
      (error: unknown) => error instanceof InventoryRepositoryError && error.code === code,
    );
    assertConfigured(client, "BEGIN ISOLATION LEVEL READ COMMITTED", "ROLLBACK");
    assert.deepEqual(client.releases, [undefined]);
  }
  const unknown = new Client({ outcome: "private_sql_detail", result_payload: null });
  await assert.rejects(
    () => repository(new Pool(unknown)).dispatchTransfer({
      ...authority(), operationId: OPERATION, transferId: TRANSFER, expectedVersion: 1,
    }),
    (error: unknown) => error instanceof InventoryRepositoryError && error.code === "unavailable" && !error.message.includes("private"),
  );
});

test("inventory repository rejects corrupt replay flags and operation-impossible mutation statuses before commit", async () => {
  for (const resultPayload of [
    { ...mutation(TRANSFER, "in_transit", 2), replayed: "private" },
    mutation(TRANSFER, "cancelled", 2),
  ]) {
    const client = new Client({ outcome: "dispatched", result_payload: resultPayload });
    await assert.rejects(
      () => repository(new Pool(client)).dispatchTransfer({
        ...authority(), operationId: OPERATION, transferId: TRANSFER, expectedVersion: 1,
      }),
      (error: unknown) => error instanceof InventoryRepositoryError && error.code === "unavailable",
    );
    assert.equal(client.queries.some((query) => query.text === "COMMIT"), false);
    assertConfigured(client, "BEGIN ISOLATION LEVEL READ COMMITTED", "ROLLBACK");
  }
});

test("inventory repository validates exact input and TenantContext before pool checkout", async () => {
  const pool = new Pool();
  const repo = repository(pool);
  await assert.rejects(
    () => repo.listLocations({ ...authority(), storeId: STORE } as never),
    (error: unknown) => error instanceof InventoryRepositoryError && error.code === "invalid_input",
  );
  await assert.rejects(
    () => repo.listLocations({ ...authority(), tenantContext: { ...tenant(), store: { ...tenant().store, id: "not-a-uuid" } } as TenantContext }),
    (error: unknown) => error instanceof InventoryRepositoryError && error.code === "durable_authority_invalid",
  );
  await assert.rejects(
    () => repo.saveTransfer({
      ...authority(), operationId: OPERATION, sourceLocationId: LOCATION, destinationLocationId: DESTINATION,
      lines: [{ lineId: LINE, variantId: VARIANT, quantity: 0 }],
    }),
    (error: unknown) => error instanceof InventoryRepositoryError && error.code === "invalid_input",
  );
  assert.equal(pool.connectCount, 0);
});

test("inventory repository construction is finite and fail-closed", () => {
  assert.throws(
    () => new PostgresInventoryRepository({
      pool: new Pool(), role: "celebix_saas_app", timeouts: { poolCheckoutMs: 1, statementMs: 1, lockMs: 1, idleTransactionMs: 1 },
      uuid: () => ORDER, audit: () => undefined, databaseUrl: "private",
    } as never),
    (error: unknown) => error instanceof InventoryRepositoryError && error.code === "unavailable",
  );
});
