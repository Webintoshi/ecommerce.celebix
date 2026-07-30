import assert from "node:assert/strict";
import test from "node:test";

type MutationModule = typeof import("./mutation.ts");

const mutations = await import("./mutation.ts").catch(
  () => ({} as Partial<MutationModule>),
);

const NOW = new Date("2026-07-16T10:00:00.000Z");
const OPERATION_ID = "10000000-0000-4000-8000-000000000001";
const STORE_ID = "20000000-0000-4000-8000-000000000002";
const CURRENT = `v1.panel.current.${Buffer.alloc(32, 0x31).toString("base64url")}`;
const CANDIDATE = `v1.panel.next.${Buffer.alloc(32, 0x32).toString("base64url")}`;

function session(activeStoreId = STORE_ID) {
  return {
    sessionId: "30000000-0000-4000-8000-000000000003",
    familyId: "40000000-0000-4000-8000-000000000004",
    principalId: "50000000-0000-4000-8000-000000000005",
    activeStoreId,
    version: 2,
    issuedAt: "2026-07-16T08:00:00.000Z",
    rotatedAt: NOW.toISOString(),
    expiresAt: "2026-07-16T12:00:00.000Z",
  };
}

test("successful durable rotation emits only an expiry-bounded replacement cookie and safe store projection", async () => {
  assert.equal(typeof mutations.rotatePersistentPanelSessionCredential, "function");
  const calls: unknown[] = [];
  const result = await mutations.rotatePersistentPanelSessionCredential?.({
    authority: {
      async rotateSession(input) { calls.push(input); return { kind: "rotated", credential: CANDIDATE, session: session() }; },
      async recoverOperation() { throw new Error("recovery must not run"); },
    },
    currentCredential: CURRENT,
    operationId: OPERATION_ID,
    requestedStoreId: STORE_ID,
    now: NOW,
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(result, {
    kind: "rotated",
    activeStoreId: STORE_ID,
    replacementCookie: `__Host-celebix_panel=${CANDIDATE}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=7200`,
  });
  assert.equal(JSON.stringify(result).includes(CURRENT), false);
  assert.equal("credential" in (result as object), false);
});

test("commit-unknown recovery proves the exact candidate, current credential, operation, and store once", async () => {
  const calls: unknown[] = [];
  const result = await mutations.rotatePersistentPanelSessionCredential?.({
    authority: {
      async rotateSession(input) { calls.push(["rotate", input]); return { kind: "commit_unknown", credential: CANDIDATE }; },
      async recoverOperation(input) { calls.push(["recover", input]); return { kind: "operation_replayed", session: session() }; },
    },
    currentCredential: CURRENT,
    operationId: OPERATION_ID,
    requestedStoreId: STORE_ID,
    now: NOW,
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], ["recover", {
    operationId: OPERATION_ID,
    operationKind: "rotate",
    credential: CANDIDATE,
    currentCredential: CURRENT,
    requestedStoreId: STORE_ID,
  }]);
  assert.equal(result?.kind, "rotated");
  assert.match(result?.kind === "rotated" ? result.replacementCookie : "", /^__Host-celebix_panel=/);
});

test("unproved or mismatched rotation never emits a cookie", async () => {
  for (const recovered of [
    { kind: "operation_mismatch" as const },
    { kind: "unavailable" as const },
    { kind: "operation_replayed" as const, session: session("60000000-0000-4000-8000-000000000006") },
  ]) {
    const result = await mutations.rotatePersistentPanelSessionCredential?.({
      authority: {
        async rotateSession() { return { kind: "commit_unknown", credential: CANDIDATE }; },
        async recoverOperation() { return recovered; },
      },
      currentCredential: CURRENT,
      operationId: OPERATION_ID,
      requestedStoreId: STORE_ID,
      now: NOW,
    });
    assert.notEqual(result?.kind, "rotated");
    assert.equal(JSON.stringify(result ?? {}).includes(CANDIDATE), false);
  }
});

test("logout delegates principal-global revoke with reason logout", async () => {
  assert.equal(typeof mutations.revokePersistentPanelSessionCredential, "function");
  const calls: unknown[] = [];
  const result = await mutations.revokePersistentPanelSessionCredential?.({
    authority: {
      async revokePrincipalSessions(input) { calls.push(input); return { kind: "principal_revoked" }; },
    },
    credential: CURRENT,
    now: NOW,
  });
  assert.deepEqual(calls, [{ credential: CURRENT, reason: "logout", now: NOW }]);
  assert.deepEqual(result, { kind: "revoked" });
  assert.equal(JSON.stringify(result).includes(CURRENT), false);
});
