import assert from "node:assert/strict";
import test from "node:test";

import type { PostgresPoolLike } from "../postgres/pool.ts";
import { PostgresStorefrontIdentityRepository, StorefrontIdentityRepositoryError } from "./index.ts";

const HOST = "identity-a.saas-staging.celebix.site";
const NOW = new Date("2026-08-04T09:00:00.000Z");
const UUIDS = Object.freeze({ challenge: "40000000-0000-4000-8000-000000000083", account: "50000000-0000-4000-8000-000000000083", session: "60000000-0000-4000-8000-000000000083", outbox: "70000000-0000-4000-8000-000000000083" });
const DIGESTS = Object.freeze({ email: "a".repeat(64), request: "f".repeat(64), code: "b".repeat(64), ticket: "8".repeat(64), session: "c".repeat(64), csrf: "d".repeat(64), userAgent: "e".repeat(64) });
const CANDIDATES = Object.freeze([Object.freeze({ keyId: "session_01", digest: DIGESTS.session })]);

type Row = Record<string, unknown>;
type Responder = (text: string, values: unknown[]) => Row[] | Promise<Row[]>;
class Client {
  readonly calls: Array<{ text: string; values: unknown[] }> = [];
  readonly releases: unknown[] = [];
  private readonly responder: Responder;
  constructor(responder: Responder) { this.responder = responder; }
  async query(text: string, values: unknown[] = []) { this.calls.push({ text, values }); const rows = await this.responder(text, values); return { rows, rowCount: rows.length, command: "", oid: 0, fields: [] }; }
  release(value?: unknown) { this.releases.push(value); }
}
class Pool implements PostgresPoolLike {
  private index = 0;
  private readonly clients: readonly Client[];
  constructor(clients: readonly Client[]) { this.clients = clients; }
  async connect() { const selected = this.clients[this.index++]; if (!selected) throw new Error("pool"); return selected; }
}
const TIMEOUTS = Object.freeze({ poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 });
function repository(pool: Pool) { return new PostgresStorefrontIdentityRepository({ pool, role: "celebix_saas_host_resolver", timeouts: TIMEOUTS, audit: () => undefined }); }
function responder(outcome: string, result: unknown): Responder { return (text) => text.includes("saas.public_account_") ? [{ outcome, result_payload: result }] : []; }

test("auth start queues only digest and encrypted delivery authority in one transaction", async () => {
  const client = new Client(responder("accepted", { retryAfterSeconds: 60 }));
  const result = await repository(new Pool([client])).start({ hostname: HOST, now: NOW, challengeId: UUIDS.challenge, emailDigest: DIGESTS.email, requestDigest: DIGESTS.request, codeKeyId: "code_01", codeDigest: DIGESTS.code, ticketKeyId: "ticket_01", ticketDigest: DIGESTS.ticket, expiresAt: new Date("2026-08-04T09:10:00.000Z"), outboxId: UUIDS.outbox, recipientCiphertext: "encrypted-recipient-authority-083", brandSnapshot: { name: "Güzide" }, correlationId: "correlation_083" });
  assert.deepEqual(result, { outcome: "accepted", retryAfterSeconds: 60 });
  const selected = client.calls.find(({ text }) => text.includes("saas.public_account_auth_start"));
  assert.equal(selected?.values.includes("ada@example.com"), false);
  assert.equal(selected?.values.includes(DIGESTS.code), true);
  assert.equal(selected?.values.includes(DIGESTS.ticket), true);
  assert.match(selected?.text ?? "", /saas[.]public_account_auth_start_v2/u);
  assert.equal(client.calls[0]?.text, "BEGIN ISOLATION LEVEL READ COMMITTED");
  assert.equal(client.calls.at(-1)?.text, "COMMIT");
});

test("verification passes server-derived authority and returns only the finite public result", async () => {
  const client = new Client(responder("authenticated", { profileRequired: false }));
  const result = await repository(new Pool([client])).verify({ hostname: HOST, now: NOW, challengeId: UUIDS.challenge, emailDigest: DIGESTS.email, verifierKind: "ticket", verifierDigest: DIGESTS.ticket, email: "ada@example.test", accountId: UUIDS.account, sessionId: UUIDS.session, sessionKeyId: "session_01", sessionDigest: DIGESTS.session, csrfDigest: DIGESTS.csrf, deviceLabel: "Safari macOS", userAgentDigest: DIGESTS.userAgent, correlationId: "verify_00083" });
  assert.deepEqual(result, { outcome: "authenticated", profileRequired: false });
  const selected = client.calls.find(({ text }) => text.includes("saas.public_account_auth_verify"));
  assert.equal(selected?.values.length, 15);
  assert.equal(selected?.values[4], "ticket");
  assert.equal(selected?.values[5], DIGESTS.ticket);
  assert.match(selected?.text ?? "", /saas[.]public_account_auth_verify_v2/u);
  assert.equal(JSON.stringify(result).includes("accountId"), false);
});

test("session parsing deeply validates the exact public snapshot", async () => {
  const snapshot = { status: "active", version: 3, profile: { email: "ada@example.test", firstName: "Ada", lastName: "Lovelace" }, addresses: [], favorites: [], devices: [{ id: "device_60000000000040008000000000000083", label: "Safari macOS", current: true, lastSeenAt: NOW.toISOString(), createdAt: NOW.toISOString() }] };
  const client = new Client(responder("found", snapshot));
  assert.deepEqual(await repository(new Pool([client])).session({ hostname: HOST, now: NOW, candidates: CANDIDATES }), { outcome: "found", snapshot });
  const parsed = await repository(new Pool([new Client(responder("found", snapshot))])).session({ hostname: HOST, now: NOW, candidates: CANDIDATES });
  assert.equal(parsed.outcome === "found" && Object.isFrozen(parsed.snapshot), true);
});

test("account order list rejects database authority and parses public references", async () => {
  const order = { orderReference: "CX-083", status: "delivered", paymentStatus: "completed", currency: "TRY", subtotalCents: 12000, shippingCents: 0, totalCents: 12000, createdAt: NOW.toISOString(), items: [{ name: "Altın Yüzük", quantity: 1, unitPriceCents: 12000, lineTotalCents: 12000 }] };
  const client = new Client(responder("found", { items: [order] }));
  assert.deepEqual(await repository(new Pool([client])).orders({ hostname: HOST, now: NOW, candidates: CANDIDATES, limit: 20 }), [order]);
  const hostile = new Client(responder("found", { items: [{ ...order, orderId: UUIDS.account }] }));
  await assert.rejects(repository(new Pool([hostile])).orders({ hostname: HOST, now: NOW, candidates: CANDIDATES, limit: 20 }), /unavailable/u);
});

test("known account failures map to bounded codes and always roll back", async () => {
  const client = new Client(responder("challenge_invalid", null));
  await assert.rejects(repository(new Pool([client])).verify({ hostname: HOST, now: NOW, challengeId: UUIDS.challenge, emailDigest: DIGESTS.email, verifierKind: "code", verifierDigest: DIGESTS.code, email: "ada@example.test", accountId: UUIDS.account, sessionId: UUIDS.session, sessionKeyId: "session_01", sessionDigest: DIGESTS.session, csrfDigest: DIGESTS.csrf, deviceLabel: "Safari macOS", userAgentDigest: DIGESTS.userAgent, correlationId: "verify_00083" }), (error: unknown) => error instanceof StorefrontIdentityRepositoryError && error.code === "challenge_invalid");
  assert.equal(client.calls.at(-1)?.text, "ROLLBACK");
});

test("unknown mutation commit performs one exact replay recovery", async () => {
  const first = new Client(async (text) => { if (text.includes("saas.public_account_favorite_set")) return [{ outcome: "committed", result_payload: { outcome: "created", version: 1, replayed: false } }]; if (text === "COMMIT") throw new Error("lost"); return []; });
  const second = new Client(responder("operation_replayed", { outcome: "created", version: 1, replayed: false }));
  const result = await repository(new Pool([first, second])).favorite({ hostname: HOST, now: NOW, candidates: CANDIDATES, operationId: "80000000-0000-4000-8000-000000000083", fingerprint: "9".repeat(64), productId: "90000000-0000-4000-8000-000000000083", enabled: true, correlationId: "favorite_083" });
  assert.deepEqual(result, { outcome: "created", version: 1, replayed: false });
  assert.deepEqual(first.releases, [true]);
  assert.equal(second.calls.filter(({ text }) => text.includes("saas.public_account_favorite_set")).length, 1);
});
