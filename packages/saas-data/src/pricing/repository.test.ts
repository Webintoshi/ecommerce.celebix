import assert from "node:assert/strict";
import test from "node:test";

import type { PriceList, TenantContext } from "@celebix/saas-contracts";
import type { QueryResult } from "pg";

import { PostgresPricingRepository, pricingRepositoryErrorCode, type PricingRepository } from "./index.ts";
import type { PostgresClientLike, PostgresPoolLike } from "../postgres/pool.ts";

const STORE = "10000000-0000-4000-8000-000000000001";
const PRINCIPAL = "10000000-0000-4000-8000-000000000002";
const MEMBERSHIP = "10000000-0000-4000-8000-000000000003";
const PLAN = "10000000-0000-4000-8000-000000000004";
const LIST = "20000000-0000-4000-8000-000000000001";
const VARIANT = "30000000-0000-4000-8000-000000000001";
const TAG = "40000000-0000-4000-8000-000000000001";
const OPERATION = "50000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-07-23T12:00:00.000Z");
const LATER = "2026-07-24T12:00:00.000Z";

function tenant(): TenantContext {
  return {
    schemaVersion: 1, requestId: "private", principal: { id: PRINCIPAL, issuer: "https://id.test/oidc", subject: "private" },
    store: { id: STORE, slug: "store", status: "active" }, membership: { id: MEMBERSHIP, role: "store_owner", status: "active" },
    entitlements: { schemaVersion: 1, planId: PLAN, planCode: "growth", version: 2, status: "active", features: ["catalog"], limits: { products: 100, staff: 5, storageBytes: 1_024 }, validFrom: "2026-01-01T00:00:00.000Z" }, locale: "tr-TR",
  } as TenantContext;
}
const authority = () => ({ tenantContext: tenant(), now: new Date(NOW) });
const priceList = (status: "draft" | "active" | "archived" = "draft", version = 1): PriceList => ({
  id: LIST, name: "VIP fiyatı", status,
  items: [{ variantId: VARIANT, priceCents: 1250 }],
  rules: [{ channel: "quick_order", customerTagId: TAG, startsAt: NOW.toISOString(), endsAt: LATER, priority: 10 }],
  version, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
  ...(status === "active" ? { activatedAt: NOW.toISOString() } : {}),
  ...(status === "archived" ? { archivedAt: NOW.toISOString() } : {}),
});
type QueryLog = Readonly<{ text: string; values?: unknown[] }>;
class Client implements PostgresClientLike {
  readonly queries: QueryLog[] = [];
  readonly releases: Array<boolean | Error | undefined> = [];
  private readonly result: Readonly<{ outcome: string; result_payload: unknown }> | ((values: readonly unknown[]) => Readonly<{ outcome: string; result_payload: unknown }>);
  private readonly failCommit: boolean;
  constructor(result: Readonly<{ outcome: string; result_payload: unknown }> | ((values: readonly unknown[]) => Readonly<{ outcome: string; result_payload: unknown }>), failCommit = false) {
    this.result = result;
    this.failCommit = failCommit;
  }
  async query(text: string, values?: unknown[]): Promise<QueryResult<Record<string, unknown>>> {
    this.queries.push({ text, values });
    if (text === "COMMIT" && this.failCommit) throw new Error("private socket detail");
    const selected = typeof this.result === "function" ? this.result(values ?? []) : this.result;
    const rows = text.startsWith("SELECT outcome,result_payload FROM saas.") ? [selected] : [];
    return { rows, rowCount: rows.length } as unknown as QueryResult<Record<string, unknown>>;
  }
  release(destroy?: boolean | Error): void { this.releases.push(destroy); }
}
class Pool implements PostgresPoolLike {
  index = 0;
  readonly clients: Client[];
  constructor(clients: Client[]) { this.clients = clients; }
  async connect(): Promise<PostgresClientLike> { const client = this.clients[this.index++]; if (!client) throw new Error("private pool"); return client; }
}
function repository(pool: PostgresPoolLike, audit: string[] = [], uuid: () => string = () => LIST): PricingRepository {
  return new PostgresPricingRepository({
    pool, role: "celebix_saas_app", timeouts: { poolCheckoutMs: 10, statementMs: 20, lockMs: 30, idleTransactionMs: 40 },
    uuid, audit: (event) => { audit.push(event.type); },
  });
}
function operationQuery(client: Client, begin: string, terminal: string) {
  assert.equal(client.queries[0]?.text, begin);
  assert.deepEqual(client.queries.slice(1, 5).map(({ text }) => text), [
    "SELECT pg_catalog.set_config('statement_timeout', $1, true)",
    "SELECT pg_catalog.set_config('lock_timeout', $1, true)",
    "SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)",
    "SET LOCAL ROLE celebix_saas_app",
  ]);
  assert.equal(client.queries.at(-1)?.text, terminal);
  return client.queries[5]!;
}

test("pricing repository executes one exact PostgreSQL function for every public method", async () => {
  const cases = [
    ["SELECT outcome,result_payload FROM saas.pricing_list($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz)", { outcome: "listed", result_payload: { items: [priceList()] } }, (repo: PricingRepository) => repo.list(authority())],
    ["SELECT outcome,result_payload FROM saas.pricing_get($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid)", { outcome: "found", result_payload: priceList() }, (repo: PricingRepository) => repo.get({ ...authority(), priceListId: LIST })],
    ["SELECT outcome,result_payload FROM saas.pricing_save($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint,$12::text,$13::jsonb,$14::jsonb)", (values: readonly unknown[]) => ({ outcome: "saved", result_payload: { ...priceList(), id: String(values[9]) } }), (repo: PricingRepository) => repo.save({ ...authority(), operationId: OPERATION, name: "VIP fiyatı", items: priceList().items, rules: priceList().rules })],
    ["SELECT outcome,result_payload FROM saas.pricing_activate($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint)", { outcome: "activated", result_payload: priceList("active", 2) }, (repo: PricingRepository) => repo.activate({ ...authority(), operationId: OPERATION, priceListId: LIST, expectedVersion: 1 })],
    ["SELECT outcome,result_payload FROM saas.pricing_archive($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint)", { outcome: "archived", result_payload: priceList("archived", 2) }, (repo: PricingRepository) => repo.archive({ ...authority(), operationId: OPERATION, priceListId: LIST, expectedVersion: 1 })],
  ] as const;
  for (const [sql, result, invoke] of cases) {
    const client = new Client(result);
    await invoke(repository(new Pool([client])));
    const query = operationQuery(client, sql.includes("pricing_list(") || sql.includes("pricing_get(") ? "BEGIN READ ONLY" : "BEGIN ISOLATION LEVEL READ COMMITTED", "COMMIT");
    assert.equal(query.text, sql);
    assert.deepEqual(query.values?.slice(0, 7), [STORE, PRINCIPAL, MEMBERSHIP, PLAN, "growth", 2, NOW]);
    assert.equal(client.queries.filter(({ text }) => text.startsWith("SELECT outcome,result_payload FROM saas.")).length, 1);
  }
});

test("pricing repository canonicalizes item and rule order into deterministic fingerprints", async () => {
  const V2 = "30000000-0000-4000-8000-000000000002";
  const input = { ...authority(), operationId: OPERATION, priceListId: LIST, expectedVersion: 1, name: "VIP fiyatı" };
  const left = new Client({ outcome: "saved", result_payload: { ...priceList(), version: 2 } });
  const right = new Client({ outcome: "saved", result_payload: { ...priceList(), version: 2 } });
  await repository(new Pool([left])).save({ ...input, items: [{ variantId: V2, priceCents: 900 }, { variantId: VARIANT, priceCents: 1250 }], rules: [{ channel: "storefront", priority: 1 }, ...priceList().rules] });
  await repository(new Pool([right])).save({ ...input, items: [{ variantId: VARIANT, priceCents: 1250 }, { variantId: V2, priceCents: 900 }], rules: [...priceList().rules, { channel: "storefront", priority: 1 }] });
  const leftValues = left.queries[5]!.values!, rightValues = right.queries[5]!.values!;
  assert.equal(leftValues[8], rightValues[8]);
  assert.equal(leftValues[12], rightValues[12]);
  assert.equal(leftValues[13], rightValues[13]);
  assert.match(String(leftValues[8]), /^[a-f0-9]{64}$/);
});

test("pricing repository performs one read-only recovery after unknown COMMIT without retrying the write", async () => {
  const audit: string[] = [];
  const writer = new Client({ outcome: "activated", result_payload: priceList("active", 2) }, true);
  const recovery = new Client({ outcome: "operation_replayed", result_payload: priceList("active", 2) });
  const pool = new Pool([writer, recovery]);
  const result = await repository(pool, audit).activate({ ...authority(), operationId: OPERATION, priceListId: LIST, expectedVersion: 1 });
  assert.equal(result.status, "active");
  assert.equal(pool.index, 2);
  assert.deepEqual(writer.releases, [true]);
  assert.deepEqual(audit, ["pricing_commit_unknown"]);
  assert.equal(writer.queries.filter(({ text }) => text.includes("pricing_activate")).length, 1);
  const recoveryQuery = operationQuery(recovery, "BEGIN READ ONLY", "COMMIT");
  assert.equal(recoveryQuery.text, "SELECT outcome,result_payload FROM saas.pricing_recover_operation($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text)");
});

test("pricing repository maps finite outcomes to non-forgeable safe errors", async () => {
  for (const [outcome, code] of [["not_found", "resource_not_found"], ["version_conflict", "version_conflict"], ["pricing_conflict", "pricing_conflict"], ["private_sql", "unavailable"]] as const) {
    const client = new Client({ outcome, result_payload: null });
    await assert.rejects(
      () => repository(new Pool([client])).archive({ ...authority(), operationId: OPERATION, priceListId: LIST, expectedVersion: 1 }),
      (error: unknown) => pricingRepositoryErrorCode(error) === code && error instanceof Error && !error.message.includes("private"),
    );
    operationQuery(client, "BEGIN ISOLATION LEVEL READ COMMITTED", "ROLLBACK");
  }
});

test("pricing repository rejects browser authority and corrupt projections before COMMIT", async () => {
  await assert.rejects(
    () => repository(new Pool([])).save({ ...authority(), operationId: OPERATION, name: "VIP", items: priceList().items, rules: priceList().rules, storeId: STORE } as never),
    (error: unknown) => pricingRepositoryErrorCode(error) === "invalid_input",
  );
  const corrupt = new Client({ outcome: "found", result_payload: { ...priceList(), currency: "TRY" } });
  await assert.rejects(() => repository(new Pool([corrupt])).get({ ...authority(), priceListId: LIST }), (error: unknown) => pricingRepositoryErrorCode(error) === "unavailable");
  operationQuery(corrupt, "BEGIN READ ONLY", "ROLLBACK");
});

test("pricing repository rejects mutation projections that contradict the addressed id lifecycle or next version", async () => {
  for (const payload of [
    { ...priceList("active", 2), id: "20000000-0000-4000-8000-000000000002" },
    priceList("draft", 2),
    priceList("active", 3),
  ]) {
    const client = new Client({ outcome: "activated", result_payload: payload });
    await assert.rejects(
      () => repository(new Pool([client])).activate({ ...authority(), operationId: OPERATION, priceListId: LIST, expectedVersion: 1 }),
      (error: unknown) => pricingRepositoryErrorCode(error) === "unavailable",
    );
    operationQuery(client, "BEGIN ISOLATION LEVEL READ COMMITTED", "ROLLBACK");
  }
});

test("pricing repository descriptor-copies list arrays without invoking hostile element accessors", async () => {
  let reads = 0;
  const hostile: unknown[] = [];
  Object.defineProperty(hostile, "0", { enumerable: true, get() { reads += 1; return priceList(); } });
  const client = new Client({ outcome: "listed", result_payload: { items: hostile } });
  await assert.rejects(
    () => repository(new Pool([client])).list(authority()),
    (error: unknown) => pricingRepositoryErrorCode(error) === "unavailable",
  );
  assert.equal(reads, 0);
  operationQuery(client, "BEGIN READ ONLY", "ROLLBACK");
});

test("pricing create derives one server-owned UUID deterministically across repository instances", async () => {
  const generated = [
    "20000000-0000-4000-8000-000000000091",
    "20000000-0000-4000-8000-000000000092",
  ];
  const clients = generated.map(() => new Client((values) => ({
    outcome: "saved",
    result_payload: { ...priceList(), id: String(values[9]) },
  })));
  const results: PriceList[] = [];
  for (const [index, client] of clients.entries()) {
    results.push(await repository(new Pool([client]), [], () => generated[index]!).save({
      ...authority(), operationId: OPERATION, name: "VIP fiyatı",
      items: priceList().items,
      rules: [priceList().rules[0]!, { channel: "storefront", priority: 5 }],
    }));
  }
  const first = clients[0]!.queries[5]!.values!, second = clients[1]!.queries[5]!.values!;
  assert.match(results[0]!.id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(results[0]!.id, results[1]!.id);
  assert.equal(first[9], second[9]);
  assert.equal(first[8], second[8]);
  assert.equal(generated.includes(results[0]!.id), false);
});

test("pricing repository rejects hostile row and payload descriptors without invoking them", async () => {
  let rowsReads = 0;
  const hostileRows: unknown[] = [];
  Object.defineProperty(hostileRows, "0", { enumerable: true, get() { rowsReads += 1; return { outcome: "listed", result_payload: { items: [priceList()] } }; } });
  const rowsClient: PostgresClientLike = {
    async query(text: string) { const rows = text.startsWith("SELECT outcome,result_payload FROM saas.") ? hostileRows : []; return { rows, rowCount: rows.length } as QueryResult<Record<string, unknown>>; },
    release() { /* observed through rejection */ },
  };
  await assert.rejects(() => repository(new Pool([rowsClient as Client])).list(authority()), (error: unknown) => pricingRepositoryErrorCode(error) === "unavailable");
  assert.equal(rowsReads, 0);

  let rowReads = 0;
  const hostileRow = { outcome: "listed" } as Record<string, unknown>;
  Object.defineProperty(hostileRow, "result_payload", { enumerable: true, get() { rowReads += 1; return { items: [priceList()] }; } });
  const rowClient = new Client(hostileRow as never);
  await assert.rejects(() => repository(new Pool([rowClient])).list(authority()), (error: unknown) => pricingRepositoryErrorCode(error) === "unavailable");
  assert.equal(rowReads, 0);

  let rootReads = 0;
  const hostileRoot = {} as Record<string, unknown>;
  Object.defineProperty(hostileRoot, "items", { enumerable: true, get() { rootReads += 1; return [priceList()]; } });
  const rootClient = new Client({ outcome: "listed", result_payload: hostileRoot });
  await assert.rejects(() => repository(new Pool([rootClient])).list(authority()), (error: unknown) => pricingRepositoryErrorCode(error) === "unavailable");
  assert.equal(rootReads, 0);
});
