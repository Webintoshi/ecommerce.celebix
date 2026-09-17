import assert from "node:assert/strict";
import test from "node:test";
import type { PostgresPoolLike } from "@celebix/saas-data";
import { createInvitationIdentityRepository, createInvitationWorkflowRepository } from "./repository.ts";

const id = "123e4567-e89b-42d3-a456-426614174000";
const at = new Date("2026-09-17T00:00:00.000Z");
const authority = { storeId: id, principalId: id, membershipId: id, planId: id, planCode: "starter", planVersion: 1 };
const timeouts = { poolCheckoutMs: 100, statementMs: 100, lockMs: 100, idleTransactionMs: 100 };
function harness(answer: (sql: string, values: unknown[], connection: number) => unknown, failCommit = false) {
  const queries: { sql: string; values: unknown[]; connection: number }[] = [], releases: unknown[] = [];
  let connection = 0;
  const pool: PostgresPoolLike = { async connect() {
    const n = ++connection;
    return { async query(sql, values = []) {
      queries.push({ sql, values, connection: n });
      if (sql === "COMMIT" && failCommit && n === 1) throw new Error("SECRET_DATABASE_URL");
      const row = answer(sql, values, n);
      return { rows: row ? [row as Record<string, unknown>] : [], rowCount: row ? 1 : 0, command: "SELECT", oid: 0, fields: [] };
    }, release(destroy) { releases.push(destroy); } };
  } };
  return { pool, queries, releases };
}
test("identity list preserves hasMore under a fixed bounded role transaction and rejects extra SQL fields", async () => {
  const h = harness(sql => sql.includes("invitation_list(") ? { outcome: "listed", result_payload: { items: [], hasMore: true } } : undefined);
  const repository = createInvitationIdentityRepository({ pool: h.pool, timeouts });
  assert.deepEqual(await repository.list(authority, at), { kind: "listed", value: { items: [], hasMore: true } });
  assert.ok(h.queries.some(q => q.sql === "SET LOCAL ROLE celebix_saas_identity"));
  assert.equal(h.queries.some(q => q.sql.includes("READ ONLY")), false);
  assert.deepEqual(h.queries.find(q => q.sql.includes("invitation_list("))?.values, [id, id, id, id, "starter", 1, at]);
  const bad = harness(sql => sql.includes("invitation_list(") ? { outcome: "listed", result_payload: { items: [], hasMore: true, secret: "bad" } } : undefined);
  assert.deepEqual(await createInvitationIdentityRepository({ pool: bad.pool, timeouts }).list(authority, at), { kind: "unavailable" });
  assert.ok(bad.queries.some(q => q.sql === "ROLLBACK"));
});
test("unknown COMMIT discards client and recovery uses a new connection without exposing SQL errors", async () => {
  const h = harness(sql => sql.includes("invitation_list(") ? { outcome: "listed", result_payload: { items: [], hasMore: false } } : sql.includes("recover_operation(") ? { outcome: "operation_not_found", result_payload: null } : undefined, true);
  const repository = createInvitationIdentityRepository({ pool: h.pool, timeouts });
  assert.deepEqual(await repository.list(authority, at), { kind: "commit_unknown" });
  assert.deepEqual(await repository.recoverOperation(authority, { operationId: id, fingerprint: "a".repeat(64), now: at }), { kind: "operation_not_found" });
  assert.equal(h.releases[0], true);
  assert.equal(h.queries.find(q => q.sql.includes("recover_operation("))?.connection, 2);
});
test("out-of-scope claim rolls back the whole transaction, including attempts, and never commits", async () => {
  let attempts = 0;
  const job = { deliveryId: id, invitationId: id, storeId: id, generation: 1, sealVersion: "ar1", keyId: "invite_01", ciphertext: "aa".repeat(32), ciphertextDigest: "a".repeat(64), rendererVersion: 1, idempotencyKey: `store-admin-invitation/v1/${id}/1`, attemptCount: 1, firstAttemptAt: at.toISOString(), replayDeadline: "2026-09-17T23:55:00.000Z" };
  const h = harness(sql => { if (sql === "ROLLBACK") attempts = 0; if (sql.includes("delivery_claim(")) { attempts++; return { outcome: "claimed", result_payload: { items: [job] } }; } });
  const repository = createInvitationWorkflowRepository({ pool: h.pool, timeouts, scope: { allowedStoreId: id, allowedRecipient: "recipient@example.com" } });
  assert.deepEqual(await repository.claim({ workerId: "invite_worker", leaseId: id, now: at, leaseExpiresAt: new Date(at.getTime() + 60_000), limit: 1 }, () => false), { kind: "configuration_blocked" });
  assert.equal(attempts, 0); assert.equal(h.queries.some(q => q.sql === "COMMIT"), false);
  assert.ok(h.queries.some(q => q.sql === "SET LOCAL ROLE celebix_saas_workflow"));
  assert.deepEqual(h.queries.find(q => q.sql.includes("delivery_claim("))?.values.slice(-2), [id, "recipient@example.com"]);
});
test("acceptance parser preserves an existing owner and preview remains explicit server identity", async () => {
  const h = harness(sql => sql.includes("invitation_accept(") ? { outcome: "accepted", result_payload: { invitationId: id, storeId: id, principalId: id, membershipId: id, role: "store_owner", adminHostname: "admin.example.com" } } : undefined);
  const result = await createInvitationIdentityRepository({ pool: h.pool, timeouts }).accept({ grantDigest: "a".repeat(64), browserKeyId: "browser_01", browserDigest: "b".repeat(64), operationId: id, fingerprint: "c".repeat(64), principalId: id, membershipId: id, now: at });
  assert.equal(result.kind, "accepted");
  if ("value" in result) assert.equal(result.value.role, "store_owner");
});

test("reviewed SQL authority failure is a safe finite code and no raw provider/SQL error escapes", async () => {
  for (const outcome of ["feature_not_enabled", "SECRET_RAW_ERROR"]) {
    const h = harness(sql => sql.includes("invitation_list(") ? { outcome, result_payload: null } : undefined);
    const result = await createInvitationIdentityRepository({ pool: h.pool, timeouts }).list(authority, at);
    assert.deepEqual(result, { kind: outcome === "feature_not_enabled" ? "feature_not_enabled" : "unavailable" });
  }
});

test("resolve grant preview and acceptance recovery use exact reviewed argument order and strict fields", async () => {
  const source = { invitationId: id, generation: 2, storeId: id, email: "recipient@example.com", displayName: "Recipient", role: "editor", expiresAt: "2026-09-18T00:00:00.000Z" };
  const preview = { ...source, grantId: id, storeName: "Store", issuer: "https://issuer.example.com/oidc", subject: "verified-subject", accepted: false };
  const h = harness(sql => {
    if (sql.includes("invitation_resolve(")) return { outcome: "resolved", result_payload: source };
    if (sql.includes("invitation_grant(")) return { outcome: "granted", result_payload: { grantId: id, invitationId: id, generation: 2, expiresAt: source.expiresAt } };
    if (sql.includes("invitation_grant_preview(")) return { outcome: "grant_available", result_payload: preview };
    if (sql.includes("recover_acceptance(")) return { outcome: "operation_replayed", result_payload: { invitationId: id, storeId: id, principalId: id, membershipId: id, role: "editor", adminHostname: "admin.example.com" } };
  });
  const repository = createInvitationIdentityRepository({ pool: h.pool, timeouts });
  assert.deepEqual(await repository.resolve("a".repeat(64), at), { kind: "resolved", value: source });
  const grantInput = { invitationId: id, generation: 2, tokenDigest: "a".repeat(64), browserKeyId: "browser_01", browserDigest: "b".repeat(64), issuer: preview.issuer, subject: preview.subject, email: source.email, emailVerified: true, grantId: id, grantDigest: "c".repeat(64), operationId: id, fingerprint: "d".repeat(64), now: at, expiresAt: new Date(source.expiresAt) };
  assert.equal((await repository.grant(grantInput)).kind, "granted");
  assert.deepEqual(h.queries.find(q => q.sql.includes("invitation_grant("))?.values, [id, 2, "a".repeat(64), "browser_01", "b".repeat(64), preview.issuer, preview.subject, source.email, true, id, "c".repeat(64), id, "d".repeat(64), at, grantInput.expiresAt]);
  assert.deepEqual(await repository.grantPreview(grantInput), { kind: "grant_available", value: preview });
  assert.equal((await repository.recoverAcceptance(grantInput)).kind, "operation_replayed");
  assert.deepEqual(h.queries.find(q => q.sql.includes("recover_acceptance("))?.values, ["c".repeat(64), "browser_01", "b".repeat(64), id, "d".repeat(64), at]);
});

test("pool checkout and query deadlines are bounded and late connections are discarded", async () => {
  let release: unknown;
  const pool: PostgresPoolLike = { connect: () => new Promise(resolve => setTimeout(() => resolve({ query: async () => { throw new Error("must not query late connection"); }, release: value => { release = value; } }), 15)) };
  assert.deepEqual(await createInvitationIdentityRepository({ pool, timeouts: { ...timeouts, poolCheckoutMs: 1 } }).list(authority, at), { kind: "unavailable" });
  await new Promise(resolve => setTimeout(resolve, 25)); assert.equal(release, true);
  const hanging: PostgresPoolLike = { async connect() { return { query: () => new Promise(() => undefined), release: value => { release = value; } }; } };
  assert.deepEqual(await createInvitationIdentityRepository({ pool: hanging, timeouts: { ...timeouts, statementMs: 1 } }).list(authority, at), { kind: "unavailable" });
  assert.equal(release, true);
});

test("authorization strictly preserves authoritative invitation expiry and rejects missing or malformed timestamps", async () => {
  const authorized = { deliveryId: id, invitationId: id, storeId: id, generation: 1, attemptCount: 1, leaseExpiresAt: "2026-09-17T00:02:00.000Z", expiresAt: "2026-09-17T00:00:01.000Z" };
  for (const expiresAt of [authorized.expiresAt, undefined, "not-a-date", "2026-09-17T00:00:01+00:00"]) {
    const value = { ...authorized, expiresAt };
    if (expiresAt === undefined) delete (value as { expiresAt?: string }).expiresAt;
    const h = harness(sql => sql.includes("delivery_authorize(") ? { outcome: "authorized", result_payload: value } : undefined);
    const repository = createInvitationWorkflowRepository({ pool: h.pool, timeouts, scope: { allowedStoreId: id, allowedRecipient: "recipient@example.com" } });
    const result = await repository.authorize({ deliveryId: id, leaseId: id, workerId: "worker", now: at });
    assert.deepEqual(result, expiresAt === authorized.expiresAt ? { kind: "authorized", value: authorized } : { kind: "unavailable" });
  }
});
