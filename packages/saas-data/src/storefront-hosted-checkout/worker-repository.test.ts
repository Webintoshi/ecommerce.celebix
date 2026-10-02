import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult } from "pg";

import type { PostgresPoolLike } from "../postgres/pool.ts";
import { PostgresStorefrontHostedCheckoutWorkerRepository } from "./worker-repository.ts";

const NOW = new Date("2026-08-06T12:00:00.000Z");
const ATTEMPT = "10000000-0000-4000-8000-000000000192";
const SCOPE = Object.freeze([Object.freeze({ providerCode: "paytr_iframe" as const, environment: "live" as const,
  adapterVersion: 1, evidenceDigest: `sha256:${"a".repeat(64)}` })]);
type Row = Record<string, unknown>;
class Client {
  readonly calls: Array<{ text: string; values: unknown[] }> = [];
  readonly releases: unknown[] = [];
  private readonly responder: (text: string, values: unknown[]) => Row[];
  private readonly realPgResult: boolean;
  constructor(responder: (text: string, values: unknown[]) => Row[], realPgResult = false) {
    this.responder = responder;
    this.realPgResult = realPgResult;
  }
  async query(text: string, values: unknown[] = []): Promise<QueryResult<Row>> {
    this.calls.push({ text, values });
    const rows = this.responder(text, values);
    const result: QueryResult<Row> = { rows, rowCount: rows.length, command: "", oid: 0, fields: [] };
    if (this.realPgResult) Object.assign(result, {
      RowCtor: null, _parsers: [], _prebuiltEmptyResultObject: null,
      _types: {}, rowAsArray: false,
    });
    return result;
  }
  release(value?: unknown) { this.releases.push(value); }
}
class Pool implements PostgresPoolLike {
  private cursor = 0;
  private readonly clients: readonly Client[];
  constructor(clients: readonly Client[]) { this.clients = clients; }
  async connect() { const client = this.clients[this.cursor++]; if (!client) throw new Error("pool"); return client; }
}
const options = (pool: Pool) => ({
  pool, role: "celebix_saas_workflow" as const,
  timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
  audit: () => undefined,
});

test("worker reads at most 25 exact reconciliation candidates with workflow authority", async () => {
  const client = new Client((text) => text.includes("storefront_hosted_checkout_reconciliation_candidates") ? [{
    outcome: "found",
    result_payload: { candidates: [{ attemptId: ATTEMPT, attemptVersion: 4, attemptStatus: "provider_outcome_unknown", credentialVersion: 2, providerReference: "safe-192" }] },
  }] : []);
  const repository = new PostgresStorefrontHostedCheckoutWorkerRepository(options(new Pool([client])));
  const candidates = await repository.reconciliationCandidates({ now: NOW, limit: 25 });
  assert.deepEqual(candidates, [{ attemptId: ATTEMPT, attemptVersion: 4, attemptStatus: "provider_outcome_unknown", credentialVersion: 2, providerReference: "safe-192" }]);
  assert.equal(Object.isFrozen(candidates), true); assert.equal(Object.isFrozen(candidates[0]), true);
  const call = client.calls.find(({ text }) => text.includes("storefront_hosted_checkout_reconciliation_candidates"));
  assert.deepEqual(call?.values, [NOW, 25]);
  assert.equal(client.calls[0]?.text, "BEGIN READ ONLY");
  assert.equal(client.calls.some(({ text }) => text === "SET LOCAL ROLE celebix_saas_workflow"), true);
});

test("worker expires a bounded pre-provider batch transactionally", async () => {
  const client = new Client((text) => text.includes("storefront_hosted_checkout_expire_created")
    ? [{ outcome: "expired", result_payload: { expiredCount: 3 } }] : []);
  const repository = new PostgresStorefrontHostedCheckoutWorkerRepository(options(new Pool([client])));
  assert.equal(await repository.expireCreated({ now: NOW, limit: 25 }), 3);
  assert.equal(client.calls[0]?.text, "BEGIN ISOLATION LEVEL READ COMMITTED");
  assert.equal(client.calls.at(-1)?.text, "COMMIT");
});

test("worker accepts the real pg Result envelope while keeping the row contract exact", async () => {
  const client = new Client((text) => text.includes("storefront_hosted_checkout_reconciliation_candidates") ? [{
    outcome: "found",
    result_payload: { candidates: [{ attemptId: ATTEMPT, attemptVersion: 4, attemptStatus: "provider_outcome_unknown", credentialVersion: 2, providerReference: null }] },
  }] : [], true);
  const repository = new PostgresStorefrontHostedCheckoutWorkerRepository(options(new Pool([client])));
  const candidates = await repository.reconciliationCandidates({ now: NOW, limit: 25 });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.attemptId, ATTEMPT);
  assert.equal(client.calls.at(-1)?.text, "COMMIT");
});

test("worker rejects invalid bounds and malformed database projections", async () => {
  const repository = new PostgresStorefrontHostedCheckoutWorkerRepository(options(new Pool([])));
  await assert.rejects(repository.expireCreated({ now: NOW, limit: 26 }), /invalid_input/u);
  const client = new Client((text) => text.includes("reconciliation_candidates")
    ? [{ outcome: "found", result_payload: { candidates: [{ attemptId: ATTEMPT, attemptVersion: 0 }] } }] : []);
  await assert.rejects(new PostgresStorefrontHostedCheckoutWorkerRepository(options(new Pool([client]))).reconciliationCandidates({ now: NOW, limit: 25 }), /unavailable/u);
});

test("scoped worker preserves database fairness order and exact immutable execution eligibility", async () => {
  const laterId = "20000000-0000-4000-8000-000000000192";
  const candidate = { attemptId: laterId, attemptVersion: 4, attemptStatus: "provider_outcome_unknown",
    credentialVersion: 2, providerReference: "safe-193", ...SCOPE[0] };
  const client = new Client((text) => text.includes("reconciliation_candidates_scoped(") ? [{
    outcome: "found", result_payload: { candidates: [candidate, { ...candidate, attemptId: ATTEMPT }] },
  }] : [], true);
  const repository = new PostgresStorefrontHostedCheckoutWorkerRepository(options(new Pool([client])));
  const result = await repository.reconciliationCandidatesScoped({ now: NOW, limit: 25, authorities: SCOPE });
  assert.deepEqual(result.map(({ attemptId }) => attemptId), [laterId, ATTEMPT]);
  assert.equal(Object.isFrozen(result[0]), true);
  const call = client.calls.find(({ text }) => text.includes("reconciliation_candidates_scoped("));
  assert.deepEqual(call?.values, [NOW, 25, JSON.stringify(SCOPE)]);
  assert.match(call?.text ?? "", /ORDER BY candidate\.candidate_position/u);
  assert.equal(client.calls[0]?.text, "BEGIN READ ONLY");
});

test("scoped worker rejects disabled, superseded and malformed projected authority", async () => {
  const candidate = { attemptId: ATTEMPT, attemptVersion: 4, attemptStatus: "provider_outcome_unknown",
    credentialVersion: 2, providerReference: null, ...SCOPE[0] };
  for (const item of [
    { ...candidate, environment: "test" }, { ...candidate, providerCode: "iyzico_iframe" },
    { ...candidate, adapterVersion: 2 }, { ...candidate, evidenceDigest: `sha256:${"b".repeat(64)}` },
    { ...candidate, credentialVersion: 0 }, { ...candidate, secret: "unexpected" },
  ]) {
    const client = new Client((text) => text.includes("reconciliation_candidates_scoped(")
      ? [{ outcome: "found", result_payload: { candidates: [item] } }] : []);
    await assert.rejects(() => new PostgresStorefrontHostedCheckoutWorkerRepository(options(new Pool([client])))
      .reconciliationCandidatesScoped({ now: NOW, limit: 25, authorities: SCOPE }), /unavailable/u);
  }
});

test("scoped worker rejects invalid scope before database access", async () => {
  const repository = new PostgresStorefrontHostedCheckoutWorkerRepository(options(new Pool([])));
  for (const authorities of [[], [...SCOPE, ...SCOPE], [{ ...SCOPE[0], environment: "production" }],
    [{ ...SCOPE[0], providerCode: "other_provider" }], [{ ...SCOPE[0], adapterVersion: 0 }],
    [{ ...SCOPE[0], evidenceDigest: "invalid" }], [{ ...SCOPE[0], unexpected: true }],
    Object.assign([...SCOPE], { unexpected: true })]) {
    await assert.rejects(() => repository.reconciliationCandidatesScoped({ now: NOW, limit: 25, authorities } as never), /invalid_input/u);
  }
});
