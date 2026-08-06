import assert from "node:assert/strict";
import test from "node:test";

import type { PostgresPoolLike } from "../postgres/pool.ts";
import { PostgresStorefrontHostedCheckoutWorkerRepository } from "./worker-repository.ts";

const NOW = new Date("2026-08-06T12:00:00.000Z");
const ATTEMPT = "10000000-0000-4000-8000-000000000192";
type Row = Record<string, unknown>;
class Client {
  readonly calls: Array<{ text: string; values: unknown[] }> = [];
  readonly releases: unknown[] = [];
  private readonly responder: (text: string, values: unknown[]) => Row[];
  constructor(responder: (text: string, values: unknown[]) => Row[]) { this.responder = responder; }
  async query(text: string, values: unknown[] = []) { this.calls.push({ text, values }); const rows = this.responder(text, values); return { rows, rowCount: rows.length, command: "", oid: 0, fields: [] }; }
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

test("worker rejects invalid bounds and malformed database projections", async () => {
  const repository = new PostgresStorefrontHostedCheckoutWorkerRepository(options(new Pool([])));
  await assert.rejects(repository.expireCreated({ now: NOW, limit: 26 }), /invalid_input/u);
  const client = new Client((text) => text.includes("reconciliation_candidates")
    ? [{ outcome: "found", result_payload: { candidates: [{ attemptId: ATTEMPT, attemptVersion: 0 }] } }] : []);
  await assert.rejects(new PostgresStorefrontHostedCheckoutWorkerRepository(options(new Pool([client]))).reconciliationCandidates({ now: NOW, limit: 25 }), /unavailable/u);
});
