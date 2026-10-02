import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { runStandardCheckoutReconciliation } from "./reconcile-standard-checkouts.mjs";

const ATTEMPT = "10000000-0000-4000-8000-000000000192";
const IDS = [
  "20000000-0000-4000-8000-000000000192",
  "30000000-0000-4000-8000-000000000192",
  "40000000-0000-4000-8000-000000000192",
  "50000000-0000-4000-8000-000000000192",
];
const NOW = new Date("2026-08-06T12:00:00.000Z");
const AUTHORITY = Object.freeze({ providerCode: "paytr_iframe", environment: "live", adapterVersion: 1,
  evidenceDigest: `sha256:${"a".repeat(64)}` });
const SCOPE = Object.freeze([AUTHORITY]);

test("worker expires created attempts then reconciles at most 25 leased candidates", async () => {
  const calls = [];
  const result = await runStandardCheckoutReconciliation({
    sessions: {
      expireCreated: async (input) => { calls.push(["expire", input]); return 2; },
      reconciliationCandidatesScoped: async (input) => { calls.push(["candidates", input]); return [{ attemptId: ATTEMPT, attemptVersion: 4, attemptStatus: "provider_outcome_unknown", credentialVersion: 2, providerReference: "safe-192", ...AUTHORITY }]; },
    },
    attempts: { markUnknown: async () => { throw new Error("unused"); } },
    runtime: { reconcile: async (input) => { calls.push(["reconcile", input]); return { kind: "captured" }; } },
    executionAuthorities: SCOPE,
    now: () => new Date(NOW), randomUUID: () => IDS.shift(),
  });
  assert.deepEqual(result, { status: "completed", expired: 2, candidates: 1, captured: 1, failed: 0, processing: 0, rejected: 0, failures: 0 });
  assert.equal(calls[0][1].limit, 25); assert.equal(calls[1][1].limit, 25);
  assert.deepEqual(calls[1][1].authorities, SCOPE);
  assert.equal(calls[2][1].workerId, "standard-checkout-20000000-0000-4000-8000-000000000192");
  assert.equal(calls[2][1].expectedVersion, 4);
});

test("overdue customer-facing attempts become unknown before leased provider reconciliation", async () => {
  const marked = []; const reconciled = [];
  const ids = [...IDS];
  const result = await runStandardCheckoutReconciliation({
    sessions: { expireCreated: async () => 0, reconciliationCandidatesScoped: async () => [{ attemptId: ATTEMPT, attemptVersion: 7, attemptStatus: "awaiting_customer", credentialVersion: 3, providerReference: null, ...AUTHORITY }] },
    attempts: { markUnknown: async (input) => { marked.push(input); return { attemptId: ATTEMPT, status: "provider_outcome_unknown", version: 8, providerReference: null, safeCode: "checkout_hold_expired", replayed: false }; } },
    runtime: { reconcile: async (input) => { reconciled.push(input); return { kind: "processing" }; } },
    executionAuthorities: SCOPE,
    now: () => new Date(NOW), randomUUID: () => ids.shift(),
  });
  assert.equal(marked.length, 1); assert.equal(marked[0].expectedVersion, 7); assert.match(marked[0].fingerprint, /^[a-f0-9]{64}$/u);
  assert.equal(reconciled[0].expectedVersion, 8);
  assert.deepEqual(result, { status: "completed", expired: 0, candidates: 1, captured: 0, failed: 0, processing: 1, rejected: 0, failures: 0 });
});

test("worker returns finite failure counters and never throws provider failures", async () => {
  const ids = [...IDS];
  const result = await runStandardCheckoutReconciliation({
    sessions: { expireCreated: async () => { throw new Error("db"); }, reconciliationCandidatesScoped: async () => [{ attemptId: ATTEMPT, attemptVersion: 2, attemptStatus: "provider_outcome_unknown", credentialVersion: 1, providerReference: null, ...AUTHORITY }] },
    attempts: { markUnknown: async () => { throw new Error("unused"); } },
    runtime: { reconcile: async () => { throw new Error("provider"); } },
    executionAuthorities: SCOPE,
    now: () => new Date(NOW), randomUUID: () => ids.shift(),
  });
  assert.deepEqual(result, { status: "failed", expired: 0, candidates: 1, captured: 0, failed: 0, processing: 0, rejected: 0, failures: 2 });
});

test("disabled or superseded candidate authority cannot mark unknown or reach provider reconciliation", async () => {
  for (const authority of [{ ...AUTHORITY, environment: "test" }, { ...AUTHORITY, adapterVersion: 2 },
    { ...AUTHORITY, evidenceDigest: `sha256:${"b".repeat(64)}` }, { ...AUTHORITY, providerCode: "iyzico_iframe" }]) {
    let marked = 0; let reconciled = 0;
    const result = await runStandardCheckoutReconciliation({
      sessions: { expireCreated: async () => 0, reconciliationCandidatesScoped: async () => [{
        attemptId: ATTEMPT, attemptVersion: 2, attemptStatus: "awaiting_customer", credentialVersion: 1,
        providerReference: null, ...authority,
      }] },
      attempts: { markUnknown: async () => { marked += 1; throw new Error("not permitted"); } },
      runtime: { reconcile: async () => { reconciled += 1; return { kind: "captured" }; } },
      executionAuthorities: SCOPE, now: () => new Date(NOW), randomUUID: () => IDS[0],
    });
    assert.equal(result.candidates, 1); assert.equal(result.rejected, 1); assert.equal(result.failures, 1);
    assert.equal(marked, 0); assert.equal(reconciled, 0);
  }
});

test("worker fails closed before expiry or legacy selection when compiled scope or scoped RPC is missing", async () => {
  for (const executionAuthorities of [undefined, [], [...SCOPE, ...SCOPE], [{ ...AUTHORITY, environment: "production" }],
    [{ ...AUTHORITY, evidenceDigest: "invalid" }], SCOPE]) {
    let selected = 0; let expired = 0; let marked = 0;
    const result = await runStandardCheckoutReconciliation({
      sessions: { expireCreated: async () => { expired += 1; return 0; },
        reconciliationCandidates: async () => { selected += 1; return []; } },
      attempts: { markUnknown: async () => { marked += 1; } },
      runtime: { reconcile: async () => ({ kind: "captured" }) }, executionAuthorities,
      now: () => new Date(NOW), randomUUID: () => IDS[0],
    });
    assert.equal(result.status, "failed");
    assert.equal(selected, 0); assert.equal(expired, 0); assert.equal(marked, 0);
  }
});

test("script is bounded to batch 25, a 60 second lease window and count-only output", () => {
  const source = readFileSync(new URL("./reconcile-standard-checkouts.mjs", import.meta.url), "utf8");
  assert.match(source, /BATCH_LIMIT = 25/u);
  assert.match(source, /LEASE_WINDOW_MS = 60_000/u);
  assert.doesNotMatch(source, /sealedCredentials|credentialDigest|merchant_key|merchant_salt/iu);
  assert.match(source, /resolveDefaultStandardCheckoutReconciliationRuntime/u);
});
