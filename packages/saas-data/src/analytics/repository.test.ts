import assert from "node:assert/strict";
import test from "node:test";

import type { TenantContext } from "@celebix/saas-contracts";

import { AnalyticsRepositoryError, PostgresAnalyticsRepository } from "./index.ts";

const STORE = "33333333-3333-4333-8333-333333333333";
const PRINCIPAL = "44444444-4444-4444-8444-444444444444";
const MEMBERSHIP = "55555555-5555-4555-8555-555555555555";
const PLAN = "66666666-6666-4666-8666-666666666666";
const PRODUCT = "77777777-7777-4777-8777-777777777777";
const NOW = new Date("2026-07-22T15:00:00.000Z");

function tenant(): TenantContext {
  return {
    schemaVersion: 1, requestId: "private-request",
    principal: { id: PRINCIPAL, issuer: "https://id.test/oidc", subject: "private-subject" },
    store: { id: STORE, slug: "store", status: "active" },
    membership: { id: MEMBERSHIP, role: "store_owner", status: "active" },
    entitlements: { schemaVersion: 1, planId: PLAN, planCode: "growth", version: 2, status: "active", features: ["analytics"], limits: { products: 100, staff: 5, storageBytes: 1024 }, validFrom: "2026-01-01T00:00:00.000Z" },
    locale: "tr-TR",
  } as TenantContext;
}

function dashboard(overrides: Record<string, unknown> = {}) {
  return {
    period: "month", rangeStart: "2026-07-01T00:00:00.000Z", rangeEnd: NOW.toISOString(), generatedAt: NOW.toISOString(), currency: "TRY", revenueCents: 42_000,
    orders: { total: 3, paid: 2, cancelled: 1, refunded: 0 }, customers: { total: 4, newInPeriod: 1 }, catalog: { activeProducts: 2, lowStockVariants: 1 },
    series: [{ startsAt: "2026-07-01T00:00:00.000Z", orders: 2, revenueCents: 42_000 }], topProducts: [{ productId: PRODUCT, title: "Atlas Mug", quantity: 2, revenueCents: 42_000 }],
    ...overrides,
  };
}

type Answer = Readonly<{ rows?: unknown[]; throw?: Error }>;
class Client {
  readonly calls: Array<Readonly<{ text: string; values: unknown[] }>> = [];
  readonly releases: unknown[] = [];
  private readonly answers: Answer[];
  constructor(answers: Answer[]) { this.answers = answers; }
  async query(text: string, values: unknown[] = []) {
    this.calls.push({ text, values });
    const next = this.answers.shift() ?? {};
    if (next.throw) throw next.throw;
    const rows = next.rows ?? [];
    return { rows, rowCount: rows.length, command: "", oid: 0, fields: [] };
  }
  release(value?: unknown) { this.releases.push(value); }
}
class Pool {
  private readonly clients: Client[];
  private readonly failure: Error | undefined;
  constructor(clients: Client[], failure?: Error) { this.clients = clients; this.failure = failure; }
  async connect() { if (this.failure) throw this.failure; const client = this.clients.shift(); if (!client) throw new Error("pool_empty"); return client; }
}
function repository(pool: Pool) {
  return new PostgresAnalyticsRepository({ pool: pool as never, role: "celebix_saas_app", timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 } });
}
function readAnswers(payload: unknown = dashboard()): Answer[] {
  return [{}, {}, {}, {}, {}, { rows: [{ outcome: "resolved", result_payload: payload }] }, {}];
}

test("uses the exact read-only transaction sequence and one analytics function call", async () => {
  const client = new Client(readAnswers());
  const result = await repository(new Pool([client])).dashboard({ tenantContext: tenant(), now: NOW, period: "month" });
  assert.equal(result.period, "month");
  assert.equal(Object.isFrozen(result.series), true);
  assert.equal(client.calls.filter((call) => call.text.includes("merchant_analytics_dashboard")).length, 1);
  const call = client.calls.find((entry) => entry.text.includes("merchant_analytics_dashboard"));
  assert.match(call?.text ?? "", /^SELECT outcome,result_payload FROM saas\.merchant_analytics_dashboard\(/);
  assert.deepEqual(call?.values, [STORE, PRINCIPAL, MEMBERSHIP, PLAN, "growth", 2, NOW, "month"]);
  assert.equal(JSON.stringify(result).includes(STORE), false);
  assert.deepEqual(client.calls.map((entry) => entry.text), [
    "BEGIN READ ONLY",
    "SELECT pg_catalog.set_config('statement_timeout', $1, true)",
    "SELECT pg_catalog.set_config('lock_timeout', $1, true)",
    "SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)",
    "SET LOCAL ROLE celebix_saas_app",
    call?.text,
    "COMMIT",
  ]);
  assert.deepEqual(client.releases, [undefined]);
});

test("every pre-commit database failure cleans up exactly once and commit-unknown destroys", async () => {
  for (const index of [0, 1, 2, 3, 4, 5] as const) {
    const answers = readAnswers(); answers[index] = { throw: new Error(`fault-${index}`) };
    const client = new Client(answers);
    await assert.rejects(() => repository(new Pool([client])).dashboard({ tenantContext: tenant(), now: NOW, period: "month" }), (error: unknown) => error instanceof AnalyticsRepositoryError && error.code === "unavailable");
    if (index === 0) { assert.deepEqual(client.releases, [true]); assert.equal(client.calls.some((call) => call.text === "ROLLBACK"), false); }
    else { assert.equal(client.calls.at(-1)?.text, "ROLLBACK"); assert.deepEqual(client.releases, [undefined]); }
  }
  const rollbackFailure = new Client([{}, { throw: new Error("configure") }, { throw: new Error("rollback") }]);
  await assert.rejects(() => repository(new Pool([rollbackFailure])).dashboard({ tenantContext: tenant(), now: NOW, period: "month" }), AnalyticsRepositoryError);
  assert.deepEqual(rollbackFailure.releases, [true]);
  const commitFailure = new Client([{}, {}, {}, {}, {}, { rows: [{ outcome: "resolved", result_payload: dashboard() }] }, { throw: new Error("commit") }]);
  await assert.rejects(() => repository(new Pool([commitFailure])).dashboard({ tenantContext: tenant(), now: NOW, period: "month" }), AnalyticsRepositoryError);
  assert.deepEqual(commitFailure.releases, [true]);
  assert.equal(commitFailure.calls.some((call) => call.text === "ROLLBACK"), false);
});

test("maps acquisition, malformed projection, timeout, outcome and terminal failures to stable unavailable", async () => {
  await assert.rejects(() => repository(new Pool([], new Error("driver secret"))).dashboard({ tenantContext: tenant(), now: NOW, period: "month" }), (error: unknown) => error instanceof AnalyticsRepositoryError && error.code === "unavailable" && error.message === "unavailable");
  for (const answers of [
    readAnswers({ ...dashboard(), storeId: STORE }),
    [{}, {}, {}, {}, {}, { rows: [{ outcome: "not_a_real_outcome", result_payload: null }] }, {}] as Answer[],
    [{}, {}, {}, {}, {}, { throw: new Error("statement timeout secret") }] as Answer[],
    [{}, {}, {}, {}, {}, { rows: [{ outcome: "resolved", result_payload: dashboard() }] }, { throw: new Error("commit wire") }] as Answer[],
  ]) {
    await assert.rejects(() => repository(new Pool([new Client(answers)])).dashboard({ tenantContext: tenant(), now: NOW, period: "month" }), (error: unknown) => error instanceof AnalyticsRepositoryError && error.code === "unavailable");
  }
});

test("rejects malformed input before acquiring a client and rolls back a non-terminal read", async () => {
  const pool = new Pool([]);
  await assert.rejects(() => repository(pool).dashboard({ tenantContext: tenant(), now: NOW, period: "quarter" as never }), (error: unknown) => error instanceof AnalyticsRepositoryError && error.code === "invalid_input");
  const client = new Client([{}, {}, {}, {}, {}, { rows: [{ outcome: "feature_not_enabled", result_payload: null }] }, {}]);
  await assert.rejects(() => repository(new Pool([client])).dashboard({ tenantContext: tenant(), now: NOW, period: "month" }), (error: unknown) => error instanceof AnalyticsRepositoryError && error.code === "feature_not_enabled");
  assert.equal(client.calls.at(-1)?.text, "ROLLBACK");
});
