import assert from "node:assert/strict";
import test from "node:test";

import { createPanelSessionPersistenceApproval } from "./activation.ts";
import { createPostgresPanelSessionRepository } from "./postgres-panel-session-repository.ts";

const NOW = new Date();
const OPERATION_ID = "11111111-1111-4111-8111-111111111111";
const PRINCIPAL_ID = "22222222-2222-4222-8222-222222222222";
const STORE_ID = "33333333-3333-4333-8333-333333333333";
const MEMBERSHIP_ID = "44444444-4444-4444-8444-444444444444";
const PLAN_ID = "00000000-0000-4000-8000-000000000001";

type QueryResponder = (text: string, values: readonly unknown[]) => { rows: Record<string, unknown>[]; rowCount: number | null };

function empty() {
  return { rows: [], rowCount: 0 };
}

function sessionAuthority(values: readonly unknown[], principalId = PRINCIPAL_ID, activeStoreId: string | null = STORE_ID) {
  const now = values.at(-2) instanceof Date ? values.at(-2) as Date : NOW;
  const expires = values.at(-1) instanceof Date
    ? values.at(-1) as Date
    : new Date(now.getTime() + 8 * 60 * 60_000);
  return {
    session: {
      sessionId: String(values[0] ?? "55555555-5555-4555-8555-555555555555"),
      familyId: String(values[1] ?? "66666666-6666-4666-8666-666666666666"),
      principalId,
      ...(activeStoreId ? { activeStoreId } : {}),
      version: 1,
      issuedAt: now.toISOString(),
      rotatedAt: now.toISOString(),
      expiresAt: expires.toISOString(),
    },
  };
}

function resolvedAuthority() {
  return {
    ...sessionAuthority([], PRINCIPAL_ID, STORE_ID),
    principal: {
      issuer: "https://identity.example.test/oidc",
      subject: "subject_123",
    },
    tenant: {
      store: { id: STORE_ID, slug: "test-store", status: "active" },
      membership: { id: MEMBERSHIP_ID, role: "store_owner", status: "active" },
      entitlements: {
        schemaVersion: 1,
        planId: PLAN_ID,
        planCode: "free_starter",
        version: 1,
        status: "active",
        features: ["catalog", "orders"],
        limits: { products: 100, staff: 1, storageBytes: 1_000_000_000, monthlyOrders: 100, customDomains: 0 },
        validFrom: "2026-01-01T00:00:00.000Z",
      },
      locale: "tr",
    },
  };
}

function assertAuthorityMutationBlocked(value: unknown, mutate: () => void) {
  const before = JSON.stringify(value);
  try { mutate(); } catch (error) { assert.ok(error instanceof TypeError); }
  assert.equal(JSON.stringify(value), before);
}

function harness(responder: QueryResponder, options: { commitFailure?: boolean; audit?: (event: unknown) => void | Promise<void> } = {}) {
  const calls: Array<{ text: string; values: readonly unknown[] }> = [];
  const releases: unknown[] = [];
  let connects = 0;
  const client = {
    async query(text: string, values: readonly unknown[] = []) {
      calls.push({ text, values });
      if (text === "COMMIT" && options.commitFailure) throw new Error("driver details must be redacted");
      if (/^BEGIN|^COMMIT$|^ROLLBACK$|set_config|SET LOCAL ROLE/.test(text)) return empty();
      return responder(text, values);
    },
    release(destroy?: unknown) { releases.push(destroy); },
  };
  let randomCall = 0;
  const repository = createPostgresPanelSessionRepository(
    createPanelSessionPersistenceApproval("disposable_test"),
    {
      pool: { async connect() { connects += 1; return client; } },
      keys: new Map([["panel.active.v1", new Uint8Array(32).fill(0x41)]]),
      activeKeyId: "panel.active.v1",
      clock: () => new Date(NOW),
      randomBytes(size: number) {
        randomCall += 1;
        return new Uint8Array(size).fill(randomCall);
      },
      timeouts: { poolCheckoutMs: 1000, statementMs: 1000, lockMs: 1000, idleTransactionMs: 1000 },
      cleanupLimit: 25,
      audit: options.audit ?? (() => undefined),
    },
  );
  return { repository, calls, releases, get connects() { return connects; } };
}

test("exports only the seven narrow persistent session operations", () => {
  const { repository } = harness(() => empty());
  assert.deepEqual(Object.keys(repository).sort(), [
    "expireDueSessions",
    "issueSession",
    "recoverOperation",
    "resolveSession",
    "revokeSession",
    "revokeSessionFamily",
    "rotateSession",
  ]);
  for (const forbidden of ["pool", "query", "transaction", "client", "keys", "databaseUrl", "tokenDigest"]) {
    assert.equal(forbidden in repository, false);
  }
});

test("issues a generated credential and sends only its key ID and digest to fixed SQL", async () => {
  const h = harness((text, values) => {
    assert.match(text, /^SELECT outcome, authority FROM saas\.issue_panel_session\(/);
    return { rows: [{ outcome: "issued", authority: sessionAuthority(values) }], rowCount: 1 };
  });
  const result = await h.repository.issueSession({ operationId: OPERATION_ID, principalId: PRINCIPAL_ID, activeStoreId: STORE_ID, now: NOW });
  assert.equal(result.kind, "issued");
  if (result.kind !== "issued") return;
  assert.match(result.credential, /^v1\.panel\.active\.v1\.[A-Za-z0-9_-]{43}$/);
  assert.equal(result.session.principalId, PRINCIPAL_ID);
  const serializedQueries = JSON.stringify(h.calls);
  assert.equal(serializedQueries.includes(result.credential), false);
  assert.equal(serializedQueries.includes(result.credential.split(".").at(-1) ?? ""), false);
  assert.match(String(h.calls.find((call) => call.text.includes("issue_panel_session"))?.values[4]), /^[a-f0-9]{64}$/);
  assert.deepEqual(h.releases, [undefined]);
});

test("maps exact issue replay, mismatch, membership denial, and durable denial without retries", async () => {
  for (const outcome of ["operation_replayed", "operation_mismatch", "membership_denied", "durable_authority_invalid"] as const) {
    const h = harness((_text, values) => ({
      rows: [{ outcome, authority: outcome === "operation_replayed" ? sessionAuthority(values) : null }],
      rowCount: 1,
    }));
    const result = await h.repository.issueSession({ operationId: OPERATION_ID, principalId: PRINCIPAL_ID, activeStoreId: STORE_ID, now: NOW });
    assert.equal(result.kind, outcome);
    assert.equal(h.connects, 1);
  }
});

test("a forwarded COMMIT failure is commit_unknown, destroys the client, and never rolls back", async () => {
  const h = harness((_text, values) => ({ rows: [{ outcome: "issued", authority: sessionAuthority(values) }], rowCount: 1 }), { commitFailure: true });
  const result = await h.repository.issueSession({ operationId: OPERATION_ID, principalId: PRINCIPAL_ID, activeStoreId: STORE_ID, now: NOW });
  assert.equal(result.kind, "commit_unknown");
  if (result.kind === "commit_unknown") assert.match(result.credential, /^v1\./);
  assert.deepEqual(h.releases, [true]);
  assert.equal(h.calls.some((call) => call.text === "ROLLBACK"), false);
});

test("rejects a non-canonical credential locally without pool access", async () => {
  const h = harness(() => { throw new Error("must not query"); });
  assert.deepEqual(await h.repository.resolveSession({ credential: "not-a-session", requestId: "request_1", now: NOW }), { kind: "unauthenticated" });
  assert.equal(h.connects, 0);
});

test("resolves persisted authority into the frozen TenantContext contract", async () => {
  const h = harness((text, values) => {
    if (text.includes("issue_panel_session")) {
      return { rows: [{ outcome: "issued", authority: sessionAuthority(values) }], rowCount: 1 };
    }
    assert.match(text, /^SELECT outcome, authority FROM saas\.resolve_panel_session\(/);
    return { rows: [{ outcome: "resolved", authority: resolvedAuthority() }], rowCount: 1 };
  });
  const issued = await codecCredential(h);
  const result = await h.repository.resolveSession({ credential: issued, requestId: "request_server_1", now: NOW });
  assert.equal(result.kind, "resolved");
  if (result.kind !== "resolved") return;
  assert.equal(result.tenantContext?.requestId, "request_server_1");
  assert.equal(result.tenantContext?.principal.id, PRINCIPAL_ID);
  assert.equal(result.tenantContext?.store.id, STORE_ID);
  assert.equal(result.tenantContext?.membership.id, MEMBERSHIP_ID);
  assert.equal(result.tenantContext?.locale, "tr");
  assert.equal(JSON.stringify(result).includes("email"), false);
});

test("returns one controlled selection candidate but never fabricates TenantContext", async () => {
  const authority = {
    ...sessionAuthority([], PRINCIPAL_ID, null),
    principal: { issuer: "https://identity.example.test/oidc", subject: "subject_123" },
    selectionCandidate: { storeId: STORE_ID },
  };
  const h = harness((text, values) => text.includes("issue_panel_session")
    ? { rows: [{ outcome: "issued", authority: sessionAuthority(values) }], rowCount: 1 }
    : { rows: [{ outcome: "resolved", authority }], rowCount: 1 });
  const result = await h.repository.resolveSession({ credential: await codecCredential(h), requestId: "request_server_2", now: NOW });
  assert.equal(result.kind, "resolved");
  if (result.kind === "resolved") {
    assert.deepEqual(result.selectionCandidate, { storeId: STORE_ID });
    assert.equal(result.tenantContext, undefined);
  }
});

test("deep-freezes successful session, TenantContext, features, limits, and result projections", async () => {
  const h = harness((text, values) => text.includes("issue_panel_session")
    ? { rows: [{ outcome: "issued", authority: sessionAuthority(values) }], rowCount: 1 }
    : { rows: [{ outcome: "resolved", authority: resolvedAuthority() }], rowCount: 1 });
  const issued = await h.repository.issueSession({ operationId: OPERATION_ID, principalId: PRINCIPAL_ID, activeStoreId: STORE_ID, now: NOW });
  assert.equal(issued.kind, "issued");
  if (issued.kind !== "issued") return;
  const resolved = await h.repository.resolveSession({ credential: issued.credential, requestId: "request_frozen", now: NOW });
  assert.equal(resolved.kind, "resolved");
  if (resolved.kind !== "resolved" || !resolved.tenantContext) return;

  assertAuthorityMutationBlocked(issued, () => { (issued.session as { activeStoreId?: string }).activeStoreId = PRINCIPAL_ID; });
  assertAuthorityMutationBlocked(resolved, () => { (resolved.tenantContext!.store as { id: string }).id = PRINCIPAL_ID; });
  assertAuthorityMutationBlocked(resolved, () => { (resolved.tenantContext!.membership as { role: string }).role = "admin"; });
  assertAuthorityMutationBlocked(resolved, () => { (resolved.tenantContext!.entitlements.features as string[]).push("promotions"); });
  assertAuthorityMutationBlocked(resolved, () => { (resolved.tenantContext!.entitlements.limits as { products: number }).products = 999999; });
  assert.equal(Object.isFrozen(issued.session), true);
  assert.equal(Object.isFrozen(resolved), true);
  assert.equal(Object.isFrozen(resolved.tenantContext), true);
  assert.equal(Object.isFrozen(resolved.tenantContext.entitlements.features), true);
  assert.equal(Object.isFrozen(resolved.tenantContext.entitlements.limits), true);
});

test("deep-freezes a controlled selection candidate and its containing result", async () => {
  const authority = {
    ...sessionAuthority([], PRINCIPAL_ID, null),
    principal: { issuer: "https://identity.example.test/oidc", subject: "subject_123" },
    selectionCandidate: { storeId: STORE_ID },
  };
  const h = harness((text, values) => text.includes("issue_panel_session")
    ? { rows: [{ outcome: "issued", authority: sessionAuthority(values) }], rowCount: 1 }
    : { rows: [{ outcome: "resolved", authority }], rowCount: 1 });
  const credential = await codecCredential(h);
  const resolved = await h.repository.resolveSession({ credential, requestId: "request_candidate_frozen", now: NOW });
  assert.equal(resolved.kind, "resolved");
  if (resolved.kind !== "resolved" || !resolved.selectionCandidate) return;
  assertAuthorityMutationBlocked(resolved, () => { (resolved.selectionCandidate as { storeId: string }).storeId = PRINCIPAL_ID; });
  assert.equal(Object.isFrozen(resolved.selectionCandidate), true);
  assert.equal(Object.isFrozen(resolved), true);
});

test("rotates with a new credential and preserves database-returned absolute expiry", async () => {
  const h = harness((text, values) => {
    if (text.includes("issue_panel_session")) return { rows: [{ outcome: "issued", authority: sessionAuthority(values) }], rowCount: 1 };
    assert.match(text, /^SELECT outcome, authority FROM saas\.rotate_panel_session\(/);
    const authority = sessionAuthority(values.slice(2), PRINCIPAL_ID, STORE_ID);
    authority.session.issuedAt = NOW.toISOString();
    authority.session.rotatedAt = new Date(NOW.getTime() + 1_000).toISOString();
    authority.session.expiresAt = new Date(NOW.getTime() + 8 * 60 * 60_000).toISOString();
    return { rows: [{ outcome: "rotated", authority }], rowCount: 1 };
  });
  const current = await codecCredential(h);
  const result = await h.repository.rotateSession({ currentCredential: current, operationId: OPERATION_ID, requestedStoreId: STORE_ID, now: new Date(NOW.getTime() + 1_000) });
  assert.equal(result.kind, "rotated");
  if (result.kind === "rotated") {
    assert.notEqual(result.credential, current);
    assert.equal(result.session.expiresAt, new Date(NOW.getTime() + 8 * 60 * 60_000).toISOString());
  }
});

test("revokes one session and its family through fixed operations", async () => {
  const h = harness((text, values) => {
    if (text.includes("issue_panel_session")) return { rows: [{ outcome: "issued", authority: sessionAuthority(values) }], rowCount: 1 };
    if (text.includes("revoke_panel_session_family")) return { rows: [{ outcome: "family_revoked", authority: null }], rowCount: 1 };
    if (text.includes("revoke_panel_session")) return { rows: [{ outcome: "revoked", authority: null }], rowCount: 1 };
    throw new Error("unexpected query");
  });
  const credential = await codecCredential(h);
  assert.deepEqual(await h.repository.revokeSession({ credential, reason: "logout", now: NOW }), { kind: "revoked" });
  assert.deepEqual(await h.repository.revokeSessionFamily({ credential, reason: "security", now: NOW }), { kind: "family_revoked" });
});

test("bounded cleanup uses the composed limit and rejects caller override authority", async () => {
  const h = harness((text, values) => {
    assert.match(text, /^SELECT outcome, expired_count FROM saas\.expire_due_panel_sessions\(/);
    assert.equal(values[1], 25);
    return { rows: [{ outcome: "expired", expired_count: "7" }], rowCount: 1 };
  });
  assert.deepEqual(await h.repository.expireDueSessions({ now: NOW }), { kind: "expired", count: 7 });
});

test("read-only recovery proves the supplied credential but never returns it", async () => {
  const h = harness((text, values) => {
    if (text.includes("issue_panel_session")) return { rows: [{ outcome: "issued", authority: sessionAuthority(values) }], rowCount: 1 };
    assert.match(text, /^SELECT outcome, authority FROM saas\.recover_panel_session_operation\(/);
    return { rows: [{ outcome: "operation_replayed", authority: sessionAuthority([]) }], rowCount: 1 };
  });
  const credential = await codecCredential(h);
  const result = await h.repository.recoverOperation({ operationId: OPERATION_ID, operationKind: "issue", credential, principalId: PRINCIPAL_ID, activeStoreId: STORE_ID });
  assert.equal(result.kind, "operation_replayed");
  assert.equal(JSON.stringify(result).includes(credential), false);
  assert.equal(h.calls.some((call) => call.text.startsWith("BEGIN READ ONLY")), true);
});

test("rotation recovery binds requested store and preserves omitted-store inheritance", async () => {
  const recoveryValues: Array<readonly unknown[]> = [];
  const h = harness((text, values) => {
    if (text.includes("issue_panel_session")) return { rows: [{ outcome: "issued", authority: sessionAuthority(values) }], rowCount: 1 };
    assert.match(text, /^SELECT outcome, authority FROM saas\.recover_panel_session_operation\(/);
    recoveryValues.push(values);
    return { rows: [{ outcome: "operation_replayed", authority: sessionAuthority([], PRINCIPAL_ID, STORE_ID) }], rowCount: 1 };
  });
  const currentCredential = await codecCredential(h);
  const candidateCredential = await codecCredential(h);
  const bound = await h.repository.recoverOperation({
    operationId: OPERATION_ID,
    operationKind: "rotate",
    credential: candidateCredential,
    currentCredential,
    requestedStoreId: STORE_ID,
  });
  const inherited = await h.repository.recoverOperation({
    operationId: OPERATION_ID,
    operationKind: "rotate",
    credential: candidateCredential,
    currentCredential,
  });
  assert.equal(bound.kind, "operation_replayed");
  assert.equal(inherited.kind, "operation_replayed");
  assert.equal(recoveryValues[0]?.length, 9);
  assert.equal(recoveryValues[0]?.[8], STORE_ID);
  assert.equal(recoveryValues[1]?.[8], null);
});

test("audit throw, rejection, and pending Promise cannot alter authoritative results", async () => {
  for (const audit of [
    () => { throw new Error("audit throw"); },
    () => Promise.reject(new Error("audit rejection")),
    () => new Promise<void>(() => undefined),
  ]) {
    const h = harness((_text, values) => ({ rows: [{ outcome: "issued", authority: sessionAuthority(values) }], rowCount: 1 }), { audit });
    const result = await h.repository.issueSession({ operationId: OPERATION_ID, principalId: PRINCIPAL_ID, activeStoreId: STORE_ID, now: NOW });
    assert.equal(result.kind, "issued");
  }
});

async function codecCredential(h: ReturnType<typeof harness>) {
  const issue = await h.repository.issueSession({ operationId: OPERATION_ID, principalId: PRINCIPAL_ID, activeStoreId: STORE_ID, now: NOW });
  assert.equal(issue.kind, "issued");
  if (issue.kind !== "issued") throw new Error("test setup failed");
  return issue.credential;
}
