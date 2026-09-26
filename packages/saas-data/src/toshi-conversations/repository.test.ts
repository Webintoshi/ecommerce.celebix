import assert from "node:assert/strict";
import test from "node:test";
import type { TenantContext } from "@celebix/saas-contracts";
import { PostgresToshiConversationRepository } from "./repository.ts";
import { ToshiConversationRepositoryError } from "./errors.ts";

const ID = "33333333-3333-4333-8333-333333333333", ACTOR = "44444444-4444-4444-8444-444444444444", MEMBER = "55555555-5555-4555-8555-555555555555", PLAN = "66666666-6666-4666-8666-666666666666", OP = "77777777-7777-4777-8777-777777777777", CONFIG = "88888888-8888-4888-8888-888888888888";
const NOW = new Date("2026-09-26T12:00:00.000Z");
const SUMMARY = { id: ID, title: "Stok", provider: "deepseek" as const, model: "deepseek-flash", version: 0, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() };
const CONVERSATION = { ...SUMMARY, messages: [] };
const READY = { operationId: OP, conversation: CONVERSATION, configId: CONFIG, credentialVersion: 1 };
const tenant = (): TenantContext => ({ schemaVersion: 1, requestId: "request", principal: { id: ACTOR, issuer: "https://identity.example.test/oidc", subject: "merchant" }, store: { id: ID, slug: "store", status: "active" }, membership: { id: MEMBER, role: "store_owner", status: "active" }, entitlements: { schemaVersion: 1, planId: PLAN, planCode: "starter", version: 2, status: "active", features: ["catalog"], limits: { products: 100, staff: 5, storageBytes: 1024 }, validFrom: "2026-01-01T00:00:00.000Z" }, locale: "tr-TR" } as TenantContext);
class Client {
  readonly calls: { text: string; values: unknown[] }[] = []; readonly releases: unknown[] = [];
  constructor(private readonly responder: (text: string, values: unknown[]) => Record<string, unknown>[]) {}
  async query(text: string, values: unknown[] = []) { this.calls.push({ text, values }); const rows = this.responder(text, values); return { rows, rowCount: rows.length, command: "", oid: 0, fields: [] }; }
  release(value?: unknown) { this.releases.push(value); }
}
class Pool { constructor(readonly clients: Client[]) {} async connect() { const c = this.clients.shift(); if (!c) throw Error("checkout"); return c; } }
function repo(clients: Client[], audit: string[] = []) { return new PostgresToshiConversationRepository({ pool: new Pool(clients), role: "celebix_saas_app", timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 }, audit(event) { audit.push(event.type); } }); }
const begin = () => ({ tenantContext: tenant(), now: NOW, operationId: OP, conversationId: null, expectedVersion: null, text: "Stok" });

test("reserve passes full actor/store authority and immutable request fingerprint without client provider", async () => {
  const client = new Client((text) => text.includes("toshi_conversation_begin_turn") ? [{ outcome: "ready", result_payload: READY }] : []);
  assert.deepEqual(await repo([client]).beginTurn(begin()), { kind: "ready", ...READY });
  const call = client.calls.find((c) => c.text.includes("toshi_conversation_begin_turn"))!;
  assert.deepEqual(call.values.slice(0, 7), [ID, ACTOR, MEMBER, PLAN, "starter", 2, NOW]);
  assert.match(String(call.values[8]), /^[a-f0-9]{64}$/);
  assert.equal(client.calls.filter((c) => c.text.includes("toshi_conversation_begin_turn")).length, 1);
});
test("completed reservation replay returns stored conversation without ready credential authority", async () => {
  const client = new Client((text) => text.includes("begin_turn") ? [{ outcome: "replayed", result_payload: CONVERSATION }] : []);
  assert.deepEqual(await repo([client]).beginTurn(begin()), { kind: "replayed", conversation: CONVERSATION });
});
test("busy or failed reservations remain explicit and never retry mutation", async () => {
  for (const code of ["turn_busy", "quota_exceeded", "connection_revoked"]) {
    const client = new Client((text) => text.includes("begin_turn") ? [{ outcome: code, result_payload: null }] : []);
    await assert.rejects(() => repo([client]).beginTurn(begin()), (e: unknown) => e instanceof ToshiConversationRepositoryError && e.code === code);
    assert.equal(client.calls.filter((c) => c.text.includes("begin_turn")).length, 1);
    assert.equal(client.calls.at(-1)?.text, "ROLLBACK");
  }
});
test("completion commit uncertainty recovers identical frozen operation result and destroys writer", async () => {
  const writer = new Client((text) => { if (text.includes("complete_turn")) return [{ outcome: "completed", result_payload: CONVERSATION }]; if (text === "COMMIT") throw Error("wire"); return []; });
  const recovery = new Client((text) => text.includes("recover_turn") ? [{ outcome: "completed", result_payload: CONVERSATION }] : []);
  const audits: string[] = [];
  assert.deepEqual(await repo([writer, recovery], audits).completeTurn({ tenantContext: tenant(), now: NOW, operationId: OP, assistantText: "Stok doğru.", sources: [] }), CONVERSATION);
  assert.deepEqual(writer.releases, [true]);
  assert.deepEqual(audits, ["toshi_conversation_commit_unknown"]);
  assert.equal(recovery.calls[0]?.text, "BEGIN READ ONLY");
});
test("private payloads and bad sources fail closed before checkout or after bounded rollback", async () => {
  await assert.rejects(() => repo([]).beginTurn({ ...begin(), provider: "deepseek" } as never), (e: unknown) => e instanceof ToshiConversationRepositoryError && e.code === "invalid_input");
  await assert.rejects(() => repo([]).completeTurn({ tenantContext: tenant(), now: NOW, operationId: OP, assistantText: "OK", sources: [{ label: "X", href: "https://evil.test" }] }), (e: unknown) => e instanceof ToshiConversationRepositoryError && e.code === "invalid_input");
  const client = new Client((text) => text.includes("conversation_get") ? [{ outcome: "found", result_payload: { ...CONVERSATION, sealedCredentials: "secret" } }] : []);
  await assert.rejects(() => repo([client]).get({ tenantContext: tenant(), now: NOW, conversationId: ID }), (e: unknown) => e instanceof ToshiConversationRepositoryError && e.code === "unavailable");
});
test("list is actor-scoped, frozen and caps the public history list", async () => {
  const client = new Client((text) => text.includes("conversation_list") ? [{ outcome: "listed", result_payload: { conversations: [SUMMARY] } }] : []);
  const result = await repo([client]).list({ tenantContext: tenant(), now: NOW });
  assert.deepEqual(result, [SUMMARY]); assert.equal(Object.isFrozen(result), true);
  assert.equal(client.calls[0]?.text, "BEGIN READ ONLY");
});
