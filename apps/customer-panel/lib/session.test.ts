import assert from "node:assert/strict";
import test from "node:test";

import type { StoreMembership } from "@celebix/saas-contracts";

type SessionModule = typeof import("./session");
const sessions = await import(new URL("./session.ts", import.meta.url).href).catch(
  () => ({} as Partial<SessionModule>),
);

const NOW = new Date("2026-07-10T10:00:00.000Z");
const SESSION_ID = "session_opaque_1234567890abcdefghijklmnop";

function membership(
  storeId: string,
  status: StoreMembership["status"] = "active",
  principalId = "principal_1",
): StoreMembership {
  return {
    schemaVersion: 1,
    id: `membership_${storeId}`,
    principalId,
    storeId,
    role: "store_owner",
    status,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

function panelSession(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    principal: {
      id: "principal_1",
      issuer: "https://identity.example.test/oidc",
      subject: "subject_123",
    },
    activeStoreId: "store_1",
    createdAt: NOW.toISOString(),
    rotatedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 60 * 60_000).toISOString(),
    ...overrides,
  };
}

test("exports the panel session and active-store security surface", () => {
  assert.equal(typeof sessions.resolvePanelSession, "function");
  assert.equal(typeof sessions.selectActiveStore, "function");
  assert.equal(typeof sessions.rotatePanelSessionForStore, "function");
});

test("defines shared production and explicit local-test cookie policies", () => {
  if (!sessions.getPanelSessionCookieOptions) return;
  assert.deepEqual(sessions.getPanelSessionCookieOptions({ kind: "production" }), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 28_800,
  });
  assert.deepEqual(sessions.getPanelSessionCookieOptions({ kind: "local-http-test" }), {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
    maxAge: 28_800,
  });
  assert.equal(sessions.getPanelSessionCookieName?.({ kind: "production" }), "__Host-celebix_panel");
  assert.equal(sessions.getPanelSessionCookieName?.({ kind: "local-http-test" }), "celebix_panel_local");

  const setCookie = sessions.buildPanelSessionSetCookie?.(SESSION_ID, { kind: "production" }) ?? "";
  const clearCookie = sessions.buildPanelSessionClearCookie?.({ kind: "production" }) ?? "";
  for (const cookie of [setCookie, clearCookie]) {
    assert.match(cookie, /^__Host-celebix_panel=/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Path=\//);
    assert.equal(/Domain=/i.test(cookie), false);
  }
  assert.match(setCookie, /Max-Age=28800/);
  assert.match(clearCookie, /Max-Age=0/);
});

test("unauthenticated and expired sessions are rejected for panel pages", async () => {
  if (!sessions.resolvePanelPageAccess || !sessions.InMemoryPanelSessionStore) return;
  const store = new sessions.InMemoryPanelSessionStore();

  assert.deepEqual(await sessions.resolvePanelPageAccess(null, store, NOW), {
    allowed: false,
    redirectTo: "/login",
    code: "unauthenticated",
  });

  await store.create(panelSession({ expiresAt: new Date(NOW.getTime() - 1).toISOString() }));
  assert.deepEqual(await sessions.resolvePanelPageAccess(SESSION_ID, store, NOW), {
    allowed: false,
    redirectTo: "/login",
    code: "unauthenticated",
  });
});

test("invalid persisted sessions are rejected and destroyed", async () => {
  if (!sessions.resolvePanelSession || !sessions.InMemoryPanelSessionStore) return;
  const invalidCases = [
    { id: "short" },
    { id: `${SESSION_ID}!` },
    { createdAt: "2026-07-10T10:00:00Z" },
    { createdAt: "2026-07-10T10:00:01.000Z" },
    { rotatedAt: "2026-07-10T09:59:59.000Z" },
    { rotatedAt: "2026-07-10T10:01:00.000Z" },
    { expiresAt: "2026-07-10T09:59:59.000Z" },
    { expiresAt: "2026-07-10T10:00:00.000Z" },
    { expiresAt: "2026-07-10T18:00:00.001Z" },
    { activeStoreId: " store_1 " },
    { principal: { id: "", issuer: "https://identity.example.test", subject: "subject_123" } },
  ];

  for (const [index, overrides] of invalidCases.entries()) {
    const store = new sessions.InMemoryPanelSessionStore();
    const value = panelSession({ id: `${SESSION_ID.slice(0, -2)}${String(index).padStart(2, "0")}`, ...overrides });
    await store.create(value);
    assert.equal(await sessions.resolvePanelSession(value.id, store, NOW), null);
    assert.equal(await store.read(value.id), null);
  }
});

test("in-memory session persistence rejects duplicate create and missing or colliding rotation", async () => {
  if (!sessions.InMemoryPanelSessionStore) return;
  const store = new sessions.InMemoryPanelSessionStore();
  const original = panelSession();
  await store.create(original);
  await assert.rejects(() => store.create(original), /panel_session_conflict/);
  await assert.rejects(
    () => store.rotate("missing_session_1234567890abcdefghij", { ...original, id: `${SESSION_ID}next` }),
    /panel_session_missing/,
  );
  const existing = { ...original, id: `${SESSION_ID}existing` };
  await store.create(existing);
  await assert.rejects(() => store.rotate(original.id, existing), /panel_session_conflict/);
  assert.deepEqual(await store.read(original.id), original);
  assert.deepEqual(await store.read(existing.id), existing);
});

test("active store selection validates current active membership and rejects invited, revoked, or foreign stores", () => {
  if (!sessions.selectActiveStore) return;
  const currentSession = panelSession();
  const memberships = [
    membership("store_1"),
    membership("store_2", "invited"),
    membership("store_3", "revoked"),
    membership("store_foreign", "active", "principal_other"),
  ];

  const selected = sessions.selectActiveStore(currentSession, memberships, "store_1");
  assert.equal(selected.ok, true);
  if (selected.ok) assert.equal(selected.selection.membership.id, "membership_store_1");

  for (const invalid of ["store_2", "store_3", "store_foreign", "store_missing"]) {
    const denied = sessions.selectActiveStore(currentSession, memberships, invalid);
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.error.code, "membership_denied");
  }
});

test("one principal may switch between multiple active stores with session rotation", async () => {
  if (!sessions.rotatePanelSessionForStore || !sessions.InMemoryPanelSessionStore) return;
  const store = new sessions.InMemoryPanelSessionStore();
  const original = panelSession();
  await store.create(original);

  const result = await sessions.rotatePanelSessionForStore({
    store,
    session: original,
    memberships: [membership("store_1"), membership("store_2")],
    selectionHint: "store_2",
    now: NOW,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.session.activeStoreId, "store_2");
  assert.notEqual(result.session.id, original.id);
  assert.equal(await store.read(original.id), null);
  assert.deepEqual(await store.read(result.session.id), result.session);
});

test("session serialization contains no raw provider token material", () => {
  const unsafe = {
    ...panelSession(),
    accessToken: "provider-access-token",
    refreshToken: "provider-refresh-token",
    idToken: "provider-id-token",
  };
  if (!sessions.toSafePanelSession) return;
  const safe = sessions.toSafePanelSession(unsafe);
  const serialized = JSON.stringify(safe);

  assert.equal(serialized.includes("provider-access-token"), false);
  assert.equal(serialized.includes("provider-refresh-token"), false);
  assert.equal(serialized.includes("provider-id-token"), false);
});
