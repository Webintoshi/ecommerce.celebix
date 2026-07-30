import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { createPostgresReturningPanelSessionIssuer } from "./postgres-session-issuer.ts";

const NOW = new Date("2026-07-30T12:00:00.000Z");
const SECRET = Buffer.alloc(32, 11);
const IDS = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
  "10000000-0000-4000-8000-000000000003",
];

class Client {
  calls: Array<{ text: string; values: readonly unknown[] }> = [];
  queue: Array<Record<string, unknown>[]> = [];
  failCommit = false;
  releaseCalls: unknown[] = [];
  async query(text: string, values: readonly unknown[] = []) {
    this.calls.push({ text, values });
    if (text === "COMMIT" && this.failCommit) throw new Error("private commit failure");
    const rows = this.queue.shift() ?? [];
    return { rows, rowCount: rows.length };
  }
  release(value?: unknown) { this.releaseCalls.push(value); }
}

function authority() {
  return {
    session: {
      sessionId: IDS[0], familyId: IDS[1], principalId: "20000000-0000-4000-8000-000000000001",
      activeStoreId: "30000000-0000-4000-8000-000000000001", version: 1,
      issuedAt: NOW.toISOString(), rotatedAt: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + 8 * 60 * 60_000).toISOString(),
    },
  };
}

function issuer(clients: Client[]) {
  let uuid = 0;
  return createPostgresReturningPanelSessionIssuer({
    pool: { connect: async () => {
      const next = clients.shift();
      if (!next) throw new Error("unexpected checkout");
      return next;
    } },
    activeSessionKeyId: "session-active",
    sessionKeys: new Map([["session-active", SECRET]]),
    randomBytes: () => Buffer.alloc(32, 7),
    randomUuid: () => IDS[uuid++]!,
    clock: () => new Date(NOW),
    timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 500, idleTransactionMs: 500 },
    audit() {},
  });
}

test("verified OIDC identity issues one durable session with a server-owned credential", async () => {
  const client = new Client();
  client.queue.push([], [], [], [], [], [{ outcome: "issued", authority: authority() }], []);
  const result = await issuer([client]).issue({
    issuer: "https://identity.example.test/oidc",
    subject: "merchant-subject",
  });
  assert.equal(result.kind, "session_issued");
  if (result.kind !== "session_issued") return;
  assert.match(result.credential, /^v1\.session-active\.[A-Za-z0-9_-]{43}$/);
  const expectedDigest = createHmac("sha256", SECRET)
    .update(`celebix-panel-session-v1\n${result.credential}`, "utf8").digest("hex");
  const call = client.calls.find((entry) => entry.text.includes("saas.issue_returning_panel_session"));
  assert.ok(call);
  assert.deepEqual(call.values.slice(0, 2), ["https://identity.example.test/oidc", "merchant-subject"]);
  assert.equal(call.values[6], expectedDigest);
  assert.equal(client.calls.at(-1)?.text, "COMMIT");
  assert.deepEqual(client.releaseCalls, [undefined]);
});

test("unknown COMMIT destroys the writer and performs exactly one read-only recovery", async () => {
  const writer = new Client();
  writer.failCommit = true;
  writer.queue.push([], [], [], [], [], [{ outcome: "issued", authority: authority() }]);
  const reader = new Client();
  reader.queue.push([], [], [], [], [], [{ outcome: "operation_replayed", authority: authority() }], []);
  const result = await issuer([writer, reader]).issue({
    issuer: "https://identity.example.test/oidc",
    subject: "merchant-subject",
  });
  assert.equal(result.kind, "session_issued");
  assert.deepEqual(writer.releaseCalls, [true]);
  assert.match(reader.calls[0]?.text ?? "", /^BEGIN READ ONLY$/);
  assert.equal(reader.calls.filter((entry) => entry.text.includes("recover_returning_panel_session")).length, 1);
  assert.equal(reader.calls.some((entry) => entry.text.includes("issue_returning_panel_session")), false);
});

test("missing identity or membership fails closed without exposing a credential", async () => {
  const client = new Client();
  client.queue.push([], [], [], [], [], [{ outcome: "membership_denied", authority: null }], []);
  const result = await issuer([client]).issue({ issuer: "https://identity.example.test/oidc", subject: "unknown" });
  assert.deepEqual(result, { kind: "membership_denied" });
  assert.equal("credential" in result, false);
});
