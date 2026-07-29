import assert from "node:assert/strict";
import test from "node:test";

import { createPanelSessionPersistenceApproval } from "../panel-session-persistence/activation.ts";
import { createPanelSessionCredentialCodec } from "../panel-session-persistence/credential-codec.ts";
import { createPostgresPanelSessionRepository } from "../panel-session-persistence/postgres-panel-session-repository.ts";
import { resolveDurableServerPanelAccess } from "./access.ts";

const NOW = new Date("2026-07-16T10:00:00.000Z");
const SESSION_ID = "55555555-5555-4555-8555-555555555555";
const PRINCIPAL_ID = "22222222-2222-4222-8222-222222222222";
const STORE_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_ID = "44444444-4444-4444-8444-444444444444";
const KEY_ID = "session.active.v1";
const KEY = new Uint8Array(32).fill(0x41);

function authority() {
  return {
    session: {
      sessionId: SESSION_ID,
      familyId: "66666666-6666-4666-8666-666666666666",
      principalId: PRINCIPAL_ID,
      activeStoreId: STORE_ID,
      version: 1,
      issuedAt: "2026-07-16T09:00:00.000Z",
      rotatedAt: "2026-07-16T09:30:00.000Z",
      expiresAt: "2026-07-16T17:00:00.000Z",
    },
    principal: { issuer: "https://identity.example.test/oidc", subject: "subject_123" },
    tenant: {
      store: { id: STORE_ID, slug: "verified-store", status: "active" },
      membership: { id: OTHER_ID, role: "store_owner", status: "active" },
      entitlements: {
        schemaVersion: 1,
        planId: "00000000-0000-4000-8000-000000000001",
        planCode: "free_starter",
        version: 1,
        status: "active",
        features: ["catalog", "orders"],
        limits: { products: 100, staff: 1, storageBytes: 1_000_000_000 },
        validFrom: "2026-01-01T00:00:00.000Z",
      },
      locale: "tr",
    },
  };
}

function credential() {
  return createPanelSessionCredentialCodec({
    keys: new Map([[KEY_ID, KEY]]),
    activeKeyId: KEY_ID,
    randomBytes: (size) => new Uint8Array(size).fill(0x42),
  }).issueCredential().credential;
}

function repository(result: { outcome: string; authority: unknown } | "connect_failure") {
  let connects = 0;
  let resolves = 0;
  const releases: unknown[] = [];
  const pool = {
    async connect() {
      connects += 1;
      if (result === "connect_failure") throw new Error("database details must stay private");
      return {
        async query(text: string) {
          if (text.includes("resolve_panel_session")) {
            resolves += 1;
            return { rows: [result], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        },
        release(destroy?: unknown) { releases.push(destroy); },
      };
    },
  };
  const value = createPostgresPanelSessionRepository(
    createPanelSessionPersistenceApproval("disposable_test"),
    {
      pool,
      keys: new Map([[KEY_ID, KEY]]),
      activeKeyId: KEY_ID,
      clock: () => new Date(NOW),
      randomBytes: (size: number) => new Uint8Array(size).fill(0x43),
      timeouts: { poolCheckoutMs: 1_000, statementMs: 1_000, lockMs: 1_000, idleTransactionMs: 1_000 },
      cleanupLimit: 25,
      audit: () => undefined,
    },
  );
  return { value, get connects() { return connects; }, get resolves() { return resolves; }, releases };
}

async function resolve(value: ReturnType<typeof repository>["value"], candidate = credential()) {
  return resolveDurableServerPanelAccess({
    credential: candidate,
    requestId: "panel-server-integration",
    now: NOW,
    authority: value,
  });
}

test("the existing credential codec and PostgreSQL projection drive one successful server access read", async () => {
  const harness = repository({ outcome: "resolved", authority: authority() });
  const result = await resolve(harness.value);
  assert.equal(result.kind, "authenticated");
  if (result.kind !== "authenticated") return;
  assert.equal(result.session.principal.id, PRINCIPAL_ID);
  assert.equal(result.session.activeStoreId, STORE_ID);
  assert.equal(result.tenantContext.membership.role, "store_owner");
  assert.equal(result.tenantContext.entitlements.planCode, "free_starter");
  assert.deepEqual(result.tenantContext.entitlements.features, ["catalog", "orders"]);
  assert.equal(harness.connects, 1);
  assert.equal(harness.resolves, 1);
  assert.deepEqual(harness.releases, [undefined]);
});

test("malformed, legacy opaque, and unknown-key credentials are rejected before PostgreSQL", async () => {
  for (const candidate of [
    "malformed",
    "legacyOpaqueSessionIdentifier12345678901234567890",
    `v1.unknown.session.key.${"A".repeat(43)}`,
  ]) {
    const harness = repository({ outcome: "resolved", authority: authority() });
    assert.deepEqual(await resolve(harness.value, candidate), { kind: "unauthenticated" });
    assert.equal(harness.connects, 0);
    assert.equal(harness.resolves, 0);
  }
});

test("wrong digests, expiry, revocation, and family revocation remain unauthenticated", async () => {
  for (const reason of ["wrong_digest", "expired", "revoked", "family_revoked"]) {
    const harness = repository({ outcome: "unauthenticated", authority: null });
    assert.deepEqual(await resolve(harness.value), { kind: "unauthenticated" }, reason);
    assert.equal(harness.resolves, 1);
  }
});

test("membership, store, active-store, subscription, and plan corruption remain unauthorized", async () => {
  const invalidAuthorities = [
    () => { const value = authority(); value.tenant.membership.status = "revoked"; return value; },
    () => { const value = authority(); value.tenant.store.status = "suspended"; return value; },
    () => { const value = authority(); value.session.activeStoreId = OTHER_ID; return value; },
    () => { const value = authority(); value.tenant.entitlements.status = "expired"; return value; },
    () => { const value = authority(); value.tenant.entitlements.version = 0; return value; },
  ];
  for (const invalid of invalidAuthorities) {
    const harness = repository({ outcome: "resolved", authority: invalid() });
    assert.deepEqual(await resolve(harness.value), { kind: "unauthorized" });
    assert.equal(harness.resolves, 1);
  }
});

test("database acquisition failure becomes controlled unavailable without fallback", async () => {
  const harness = repository("connect_failure");
  assert.deepEqual(await resolve(harness.value), { kind: "unavailable" });
  assert.equal(harness.connects, 1);
  assert.equal(harness.resolves, 0);
});
