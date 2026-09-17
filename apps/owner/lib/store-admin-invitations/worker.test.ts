import assert from "node:assert/strict";
import test from "node:test";
import { createInvitationWorker } from "./worker.ts";
import { sealInvitationRequest } from "./request-seal.ts";
import type { InvitationDeliveryJob, InvitationSettlement, InvitationWorkflowRepository } from "./repository.ts";

const id = "123e4567-e89b-42d3-a456-426614174000", other = "223e4567-e89b-42d3-a456-426614174000";
const start = Date.parse("2026-09-17T00:00:00.000Z");
const config = { apiKey: "re_fake123", sender: "sender@example.com", acceptanceOrigin: "https://accounts.example.com", allowedStoreId: id, allowedRecipient: "recipient@example.com" };
const keyring = { activeKeyId: "invite_01", keys: { invite_01: Buffer.alloc(32, 7) } };
function setup(options: { job?: Partial<InvitationDeliveryJob>; request?: Record<string, string>; deny?: boolean; authorizeGeneration?: number; expiresAt?: string; advanceAtAuthorize?: number; advanceAtSend?: number; commitUnknown?: boolean; settleFailure?: "throw" | "stale"; response?: () => Promise<Response> } = {}) {
  let current = start, inTransaction = false, attempted = 0;
  const calls: { body: unknown; key: unknown }[] = [], settlements: InvitationSettlement[] = [];
  const request = { from: config.sender, to: config.allowedRecipient, subject: "Original subject", html: "<p>Original bytes</p>", text: "Original bytes", ...options.request };
  const seal = sealInvitationRequest(request, { invitationId: id, generation: 1 }, keyring);
  const job: InvitationDeliveryJob = { deliveryId: id, invitationId: id, storeId: id, generation: 1, sealVersion: "ar1", keyId: seal.keyId, ciphertext: seal.bytes.toString("hex"), ciphertextDigest: seal.digest, rendererVersion: 1, idempotencyKey: `store-admin-invitation/v1/${id}/1`, attemptCount: 1, firstAttemptAt: new Date(start).toISOString(), replayDeadline: new Date(start + 86_100_000).toISOString(), ...options.job };
  const repository: InvitationWorkflowRepository = {
    async claim(_i, allow) { inTransaction = true; attempted++; const accepted = allow(job); inTransaction = false; if (!accepted) { attempted--; return { kind: "configuration_blocked" }; } return { kind: "claimed", value: { items: [job] } }; },
    async authorize(i) { assert.equal(i.now.getTime(), current); current += options.advanceAtAuthorize ?? 0; return options.deny ? { kind: "invitation_unavailable" } : { kind: "authorized", value: { deliveryId: id, invitationId: id, storeId: id, generation: options.authorizeGeneration ?? 1, attemptCount: job.attemptCount, leaseExpiresAt: new Date(start + 120_000).toISOString(), expiresAt: options.expiresAt ?? new Date(start + 86_400_000).toISOString() } }; },
    async settle(i) { assert.equal(inTransaction, false); assert.equal(i.now.getTime(), current); settlements.push(i); if (options.settleFailure === "throw") throw new Error("SECRET DB ERROR"); if (options.settleFailure === "stale") return { kind: "stale_lease" }; if (options.commitUnknown && settlements.length === 1) return { kind: "commit_unknown" }; return { kind: "settled", value: { deliveryId: id, deliveryStatus: i.resultKind === "retry" ? "queued" : i.resultKind } }; },
  };
  const worker = createInvitationWorker({ repository, config, keyring, workerId: "invitation_worker", clock: () => new Date(current), timeoutMs: 20, fetch: async (_url, init) => { assert.equal(inTransaction, false); calls.push({ body: init?.body, key: (init?.headers as Record<string, string>)["idempotency-key"] }); current += options.advanceAtSend ?? 0; return options.response ? options.response() : new Response('{"id":"provider_123"}', { status: 200 }); } });
  return { worker, calls, settlements, attempted: () => attempted };
}
test("durable retries send byte-identical original request and persisted key, never re-render, and accepted is not delivered", async () => {
  const h = setup({ response: async () => new Response('{"name":"rate_limit_exceeded"}', { status: 429 }) });
  await h.worker.runOnce(); await h.worker.runOnce();
  assert.equal(h.calls.length, 2); assert.deepEqual(h.calls[0], h.calls[1]);
  assert.equal(h.calls[0]!.body, '{"from":"sender@example.com","to":["recipient@example.com"],"subject":"Original subject","html":"<p>Original bytes</p>","text":"Original bytes"}');
  assert.equal(h.settlements[0]!.resultKind, "retry"); assert.equal(h.settlements[0]!.safeErrorCode, "provider_rate_limited");
  const accepted = setup(); assert.equal((await accepted.worker.runOnce()).providerAccepted, 1);
  assert.equal(accepted.settlements[0]!.resultKind, "provider_accepted");
});
test("store recipient sender or unusable ciphertext blocks claim with no attempt consumed or send", async () => {
  for (const options of [{ job: { storeId: other } }, { request: { to: "other@example.com" } }, { request: { from: "other@example.com" } }, { job: { generation: 2 } }, { job: { sealVersion: "ai1" as const } }, { job: { ciphertextDigest: "0".repeat(64) } }] as Parameters<typeof setup>[0][]) {
    const h = setup(options); assert.equal((await h.worker.runOnce()).kind, "configuration_blocked"); assert.equal(h.calls.length, 0); assert.equal(h.attempted(), 0); assert.equal(h.settlements.length, 0);
  }
});
test("revoked expired or stale authorization and elapsed lease cannot send", async () => {
  for (const options of [{ deny: true }, { authorizeGeneration: 2 }, { advanceAtAuthorize: 120_001 }]) {
    const h = setup(options); await h.worker.runOnce(); assert.equal(h.calls.length, 0);
  }
});
test("invitation expiry crossed during authorization blocks dispatch despite valid lease replay and run deadlines", async () => {
  for (const remaining of [1_000, 2_010, 2_020]) {
    const h = setup({ expiresAt: new Date(start + remaining).toISOString(), advanceAtAuthorize: 2_000 });
    const result = await h.worker.runOnce();
    assert.equal(h.calls.length, 0, "expiry must cover fresh clock plus the complete send timeout");
    assert.equal(h.settlements.length, 0); assert.equal(result.skipped, 1);
  }
  const valid = setup({ expiresAt: new Date(start + 2_021).toISOString(), advanceAtAuthorize: 2_000 });
  await valid.worker.runOnce(); assert.equal(valid.calls.length, 1);
});
test("timeout retries safely, attempt eight becomes unknown, horizon never dispatches", async () => {
  const timeout = setup({ response: () => new Promise<Response>(() => undefined) }); await timeout.worker.runOnce();
  assert.equal(timeout.settlements[0]!.safeErrorCode, "provider_timeout");
  const max = setup({ job: { attemptCount: 8 }, response: async () => { throw new Error("SECRET PROVIDER BODY"); } }); await max.worker.runOnce();
  assert.equal(max.settlements[0]!.resultKind, "outcome_unknown"); assert.equal(max.settlements[0]!.safeErrorCode, "provider_unavailable");
  const horizon = setup({ job: { firstAttemptAt: new Date(start - 86_100_000).toISOString(), replayDeadline: new Date(start).toISOString() } }); await horizon.worker.runOnce();
  assert.equal(horizon.calls.length, 0); assert.equal(horizon.settlements[0]!.resultKind, "outcome_unknown");
});
test("unknown settlement COMMIT retries only settlement with unchanged intent and fresh clock", async () => {
  const h = setup({ commitUnknown: true, advanceAtSend: 1_000 });
  await h.worker.runOnce(); assert.equal(h.calls.length, 1); assert.equal(h.settlements.length, 2);
  assert.deepEqual(h.settlements[0], h.settlements[1]);
});

test("in-flight revocation cannot unsend but stale settlement and persistence exceptions surface safely", async () => {
  for (const settleFailure of ["stale", "throw"] as const) {
    const h = setup({ settleFailure });
    const result = await h.worker.runOnce();
    assert.deepEqual(result, { kind: "persistence_unavailable", claimed: 1, sent: 1, settled: 0, skipped: 0, providerAccepted: 1 });
    assert.equal(h.calls.length, 1); assert.equal(h.settlements.length, 1);
    assert.equal(JSON.stringify(result).includes("SECRET"), false);
  }
});

test("provider adapter codes map only to SQL allowlist and invalid provider IDs cannot poison settlement", async () => {
  for (const [status, body, code, resultKind] of [
    [403, '{"name":"forbidden"}', "configuration_unavailable", "failed"],
    [409, '{"name":"invalid_idempotent_request"}', "provider_rejected", "failed"],
    [409, '{"name":"concurrent_idempotent_requests"}', "provider_unavailable", "retry"],
    [200, '{"id":"unsafe:provider:id"}', "invalid_response", "retry"],
  ] as const) {
    const h = setup({ response: async () => new Response(body, { status }) }); await h.worker.runOnce();
    assert.equal(h.settlements[0]!.safeErrorCode, code); assert.equal(h.settlements[0]!.resultKind, resultKind); assert.equal(h.settlements[0]!.providerMessageId, null);
  }
});

test("same worker refuses overlapping runs instead of issuing a second claim", async () => {
  let finish!: (response: Response) => void;
  const h = setup({ response: () => new Promise<Response>(resolve => { finish = resolve; }) });
  const pending = h.worker.runOnce();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal((await h.worker.runOnce()).kind, "already_running");
  finish(new Response('{"id":"provider_123"}', { status: 200 })); await pending;
  assert.equal(h.attempted(), 1); assert.equal(h.calls.length, 1);
});
