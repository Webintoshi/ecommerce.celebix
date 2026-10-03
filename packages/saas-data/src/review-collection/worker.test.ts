import assert from "node:assert/strict";
import test from "node:test";
import { createReviewCollectionWorker, renderReviewCollectionEmail } from "./worker.ts";
import type { ReviewCollectionClaim, ReviewCollectionEmail, ReviewCollectionRepository } from "./repository.ts";
const NOW = new Date("2026-10-03T12:00:00Z"), ID = "10000000-0000-4000-8000-000000000001", LEASE = "20000000-0000-4000-8000-000000000001", TOKEN = Buffer.alloc(32, 7).toString("base64url");
const claim = (patch: Partial<ReviewCollectionClaim> = {}): ReviewCollectionClaim => ({ id: ID, leaseId: LEASE, attemptCount: 1, recipient: "customer@example.test", storeName: "Mira mağaza", productTitle: "Pamuklu <Gömlek>", origin: "https://mira.example.test", ...patch });
type WorkerRepository = Pick<ReviewCollectionRepository, "claim" | "seal" | "finish">;

test("an opt-out detected immediately before an immutable retry prevents sending", async () => {
  let sends = 0, rechecks = 0;
  const email = renderReviewCollectionEmail({ ...claim(), token: TOKEN });
  const repository: WorkerRepository = { async claim() { return [claim({ attemptCount: 2, firstAttemptAt: NOW.toISOString(), email })]; }, async seal(input) { assert.deepEqual(input.email, email); rechecks++; return null; }, async finish() { assert.fail("suppressed request must not be finished as sent"); } };
  assert.equal(await createReviewCollectionWorker({ repository, now: () => NOW, async send() { sends++; return { kind: "accepted", providerMessageId: "never" }; } }).runOnce(), "processed");
  assert.equal(rechecks, 1); assert.equal(sends, 0);
});
test("provider retries use the persisted payload and identical idempotency key", async () => {
  const frozen = renderReviewCollectionEmail({ ...claim(), token: TOKEN }), sent: { email: ReviewCollectionEmail; key: string }[] = [];
  let number = 0;
  const repository: WorkerRepository = { async claim() { return [claim({ attemptCount: ++number, ...(number > 1 ? { email: frozen, firstAttemptAt: NOW.toISOString() } : {}) })]; }, async seal(input) { assert.equal(input.email.to, frozen.to); return frozen; }, async finish() {} };
  const worker = createReviewCollectionWorker({ repository, now: () => NOW, token: () => TOKEN, uuid: () => LEASE, async send(email, key) { sent.push({ email, key }); return { kind: "retryable", code: "provider_network_error" }; } });
  await worker.runOnce(); await worker.runOnce();
  assert.deepEqual(sent.map(value => value.key), [`review-request/v1/${ID}`, `review-request/v1/${ID}`]); assert.deepEqual(sent[0]?.email, sent[1]?.email);
});
test("uncertain deliveries beyond provider idempotency lifetime never resend", async () => {
  let sends = 0, reason = "";
  const repository: WorkerRepository = { async claim() { return [claim({ firstAttemptAt: new Date(NOW.getTime() - 86400000).toISOString(), email: renderReviewCollectionEmail({ ...claim(), token: TOKEN }) })]; }, async seal() { assert.fail("expired request cannot be prepared"); }, async finish(input) { if (input.result.kind !== "accepted") reason = input.result.code; } };
  await createReviewCollectionWorker({ repository, now: () => NOW, async send() { sends++; return { kind: "accepted", providerMessageId: "never" }; } }).runOnce();
  assert.equal(sends, 0); assert.equal(reason, "idempotency_window_expired");
});
test("claim processing bounds provider concurrency and uses current time before each send", async () => {
  let active = 0, peak = 0, ticks = 0; const observed: number[] = [];
  const repository: WorkerRepository = { async claim() { return Array.from({ length: 5 }, (_, i) => claim({ id: `10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}` })); }, async seal(input) { observed.push(input.now.getTime()); return input.email; }, async finish() {} };
  const worker = createReviewCollectionWorker({ repository, now: () => new Date(NOW.getTime() + ticks++), token: () => TOKEN, async send() { active++; peak = Math.max(peak, active); await new Promise(resolve => setTimeout(resolve, 2)); active--; return { kind: "accepted", providerMessageId: "accepted-test" }; } });
  await worker.runOnce(); assert.equal(peak, 2); assert.equal(observed.length, 5); assert.equal(new Set(observed).size, 5); assert.ok(observed.every(value => value > NOW.getTime()));
});
test("email uses only verified product context, escapes markup and keeps capabilities out of query paths", () => {
  const result = renderReviewCollectionEmail({ ...claim(), token: TOKEN });
  assert.match(result.html, /Pamuklu &lt;Gömlek&gt;/u); assert.match(result.text, new RegExp(`/reviews/new#${TOKEN}`, "u")); assert.match(result.text, /#unsubscribe=/u); assert.doesNotMatch(result.html, /\?token=/u);
});
