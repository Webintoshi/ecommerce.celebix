import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { createPanelSessionHandoffApproval } from "./activation.ts";
import { createPostgresPanelSessionHandoffRedeemer } from "./postgres-handoff-redeemer.ts";

const NOW = new Date("2026-07-14T10:00:00.000Z");
const HANDOFF_KEY_ID = "handoff.active.v1";
const HANDOFF_KEY = new Uint8Array(32).fill(0x41);
const SESSION_KEY_ID = "panel.active.v1";
const SESSION_KEY = new Uint8Array(32).fill(0x51);
const RAW_STATE = "state_1234567890abcdefghijklmnop";
const HANDOFF_TOKEN = createHmac("sha256", HANDOFF_KEY)
  .update(`celebix-panel-handoff-v1\n${RAW_STATE}`, "utf8")
  .digest("base64url");
const HANDOFF = `h1.${HANDOFF_KEY_ID}.${HANDOFF_TOKEN}`;
const HANDOFF_DIGEST = createHmac("sha256", HANDOFF_KEY)
  .update(`celebix-panel-handoff-digest-v1\n${HANDOFF}`, "utf8")
  .digest("hex");
const SESSION_TOKEN = createHmac("sha256", SESSION_KEY)
  .update(`celebix-panel-session-from-handoff-v1\n${HANDOFF}`, "utf8")
  .digest("base64url");
const SESSION_CREDENTIAL = `v1.${SESSION_KEY_ID}.${SESSION_TOKEN}`;
const SESSION_DIGEST = createHmac("sha256", SESSION_KEY)
  .update(`celebix-panel-session-v1\n${SESSION_CREDENTIAL}`, "utf8")
  .digest("hex");

type Responder = (text: string, values: readonly unknown[]) => { rows: Record<string, unknown>[]; rowCount: number | null };

function sessionAuthority() {
  return {
    session: {
      sessionId: "10000000-0000-4000-8000-000000000001",
      familyId: "10000000-0000-4000-8000-000000000002",
      principalId: "10000000-0000-4000-8000-000000000003",
      activeStoreId: "10000000-0000-4000-8000-000000000004",
      version: 1,
      issuedAt: NOW.toISOString(),
      rotatedAt: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + 8 * 60 * 60_000).toISOString(),
    },
  };
}

function preflight() {
  return { rows: [{ outcome: "handoff_replayed", authority: { sessionTokenKeyId: SESSION_KEY_ID } }], rowCount: 1 };
}

function harness(
  responder: Responder,
  options: {
    writeCommitFailure?: boolean;
    handoffKeys?: ReadonlyMap<string, Uint8Array>;
    sessionKeys?: ReadonlyMap<string, Uint8Array>;
    audit?: (event: unknown) => void | Promise<void>;
  } = {},
) {
  const calls: Array<{ text: string; values: readonly unknown[] }> = [];
  const releases: unknown[] = [];
  let connects = 0;
  let writeTransaction = false;
  const handoffKeys = new Map(options.handoffKeys ?? [[HANDOFF_KEY_ID, new Uint8Array(HANDOFF_KEY)]]);
  const sessionKeys = new Map(options.sessionKeys ?? [[SESSION_KEY_ID, new Uint8Array(SESSION_KEY)]]);
  const pool = {
    async connect() {
      connects += 1;
      return {
        async query(text: string, values: readonly unknown[] = []) {
          calls.push({ text, values });
          if (text === "BEGIN ISOLATION LEVEL READ COMMITTED") writeTransaction = true;
          if (text === "BEGIN READ ONLY") writeTransaction = false;
          if (text === "COMMIT" && writeTransaction && options.writeCommitFailure) throw new Error("driver private");
          if (/^BEGIN|^COMMIT$|^ROLLBACK$|set_config|SET LOCAL ROLE/.test(text)) return { rows: [], rowCount: 0 };
          return responder(text, values);
        },
        release(destroy?: unknown) { releases.push(destroy); },
      };
    },
  };
  const dependencies = {
    pool,
    handoffKeys,
    sessionKeys,
    clock: () => new Date(NOW),
    timeouts: { poolCheckoutMs: 1000, statementMs: 1000, lockMs: 1000, idleTransactionMs: 1000 },
    audit: options.audit ?? (() => undefined),
  };
  const redeemer = createPostgresPanelSessionHandoffRedeemer(
    createPanelSessionHandoffApproval("disposable_test"),
    dependencies,
  );
  return { redeemer, calls, releases, dependencies, pool, handoffKeys, sessionKeys, get connects() { return connects; } };
}

test("first redemption derives the deterministic session credential and sends only fixed digests to SQL", async () => {
  const h = harness((text, values) => {
    if (text.includes("recover_panel_session_handoff_redemption")) {
      assert.deepEqual(values, [HANDOFF_KEY_ID, HANDOFF_DIGEST, null, null, NOW]);
      return preflight();
    }
    assert.equal(text, "SELECT outcome, authority FROM saas.redeem_panel_session_handoff($1,$2,$3,$4,$5)");
    assert.deepEqual(values, [HANDOFF_KEY_ID, HANDOFF_DIGEST, SESSION_KEY_ID, SESSION_DIGEST, NOW]);
    return { rows: [{ outcome: "session_issued", authority: sessionAuthority() }], rowCount: 1 };
  });
  assert.deepEqual(Object.keys(h.redeemer).sort(), ["recoverRedemption", "redeemHandoff"]);
  const result = await h.redeemer.redeemHandoff({ credential: HANDOFF });
  assert.equal(result.kind, "session_issued");
  if (result.kind !== "session_issued") return;
  assert.equal(result.credential, SESSION_CREDENTIAL);
  const serialized = JSON.stringify(h.calls);
  assert.equal(serialized.includes(HANDOFF), false);
  assert.equal(serialized.includes(SESSION_CREDENTIAL), false);
  assert.equal(serialized.includes(HANDOFF_TOKEN), false);
  assert.equal(serialized.includes(SESSION_TOKEN), false);
});

test("redemption replay returns the identical deterministic credential and exactly persisted session", async () => {
  const h = harness((text) => text.includes("recover_panel_session_handoff_redemption")
    ? preflight()
    : { rows: [{ outcome: "session_replayed", authority: sessionAuthority() }], rowCount: 1 });
  const first = await h.redeemer.redeemHandoff({ credential: HANDOFF });
  const second = await h.redeemer.redeemHandoff({ credential: HANDOFF });
  assert.equal(first.kind, "session_replayed");
  assert.deepEqual(second, first);
  if (first.kind === "session_replayed") assert.equal(first.credential, SESSION_CREDENTIAL);
});

test("unknown redemption COMMIT preserves the session credential, evicts the writer, and never rolls back", async () => {
  const h = harness((text) => text.includes("recover_panel_session_handoff_redemption")
    ? preflight()
    : { rows: [{ outcome: "session_issued", authority: sessionAuthority() }], rowCount: 1 }, { writeCommitFailure: true });
  assert.deepEqual(await h.redeemer.redeemHandoff({ credential: HANDOFF }), {
    kind: "commit_unknown",
    credential: SESSION_CREDENTIAL,
  });
  assert.deepEqual(h.releases, [undefined, true]);
  assert.equal(h.calls.some((call) => call.text === "ROLLBACK"), false);
});

test("read-only recovery verifies the same deterministic credential and cannot issue a missing session", async () => {
  let probes = 0;
  const h = harness((text, values) => {
    assert.equal(text, "SELECT outcome, authority FROM saas.recover_panel_session_handoff_redemption($1,$2,$3,$4,$5)");
    probes += 1;
    if (probes === 1) return preflight();
    assert.deepEqual(values, [HANDOFF_KEY_ID, HANDOFF_DIGEST, SESSION_KEY_ID, SESSION_DIGEST, NOW]);
    return { rows: [{ outcome: "session_replayed", authority: sessionAuthority() }], rowCount: 1 };
  });
  const result = await h.redeemer.recoverRedemption({ credential: HANDOFF });
  assert.equal(result.kind, "session_replayed");
  assert.equal(h.calls.filter((call) => call.text === "BEGIN READ ONLY").length, 2);
  assert.equal(h.calls.some((call) => call.text.includes("redeem_panel_session_handoff")), false);
});

test("wrong handoff, expired authority, and removed handoff or session keys fail closed", async () => {
  const removedHandoff = harness(() => { throw new Error("must not query"); }, { handoffKeys: new Map([["other.v1", HANDOFF_KEY]]) });
  assert.deepEqual(await removedHandoff.redeemer.redeemHandoff({ credential: HANDOFF }), { kind: "unauthenticated" });
  assert.equal(removedHandoff.connects, 0);

  const expired = harness(() => ({ rows: [{ outcome: "expired", authority: null }], rowCount: 1 }));
  assert.deepEqual(await expired.redeemer.redeemHandoff({ credential: HANDOFF }), { kind: "expired" });
  assert.equal(expired.connects, 1);

  const removedSession = harness(() => preflight(), { sessionKeys: new Map([["other.v1", SESSION_KEY]]) });
  assert.deepEqual(await removedSession.redeemer.redeemHandoff({ credential: HANDOFF }), { kind: "unauthenticated" });
  assert.equal(removedSession.connects, 1);
});

test("revoked, replaced, expired-session, membership, and store replay denials return no credential", async () => {
  for (const denied of ["unauthenticated", "membership_denied"] as const) {
    const h = harness((text) => text.includes("recover_panel_session_handoff_redemption")
      ? preflight()
      : { rows: [{ outcome: denied, authority: null }], rowCount: 1 });
    const result = await h.redeemer.redeemHandoff({ credential: HANDOFF });
    assert.deepEqual(result, { kind: denied });
    assert.equal("credential" in result, false);
  }
});

test("redeemer snapshots pool, clocks, timeouts, key maps, key bytes, and audit at construction", async () => {
  const h = harness((text) => text.includes("recover_panel_session_handoff_redemption")
    ? preflight()
    : { rows: [{ outcome: "session_issued", authority: sessionAuthority() }], rowCount: 1 });
  const handoffBytes = h.handoffKeys.get(HANDOFF_KEY_ID)!;
  const sessionBytes = h.sessionKeys.get(SESSION_KEY_ID)!;
  h.dependencies.pool = { async connect() { throw new Error("mutated pool"); } };
  h.dependencies.clock = () => new Date("2030-01-01T00:00:00.000Z");
  h.dependencies.timeouts.poolCheckoutMs = 0;
  h.dependencies.audit = () => { throw new Error("mutated audit"); };
  h.handoffKeys.clear();
  h.sessionKeys.clear();
  handoffBytes.fill(0xff);
  sessionBytes.fill(0xff);
  const result = await h.redeemer.redeemHandoff({ credential: HANDOFF });
  assert.equal(result.kind, "session_issued");
  assert.equal(h.connects, 2);
});

test("audit throw, rejection, and pending promises cannot alter session authority", async () => {
  for (const audit of [
    () => { throw new Error("audit private"); },
    () => Promise.reject(new Error("audit private")),
    () => new Promise<void>(() => undefined),
  ]) {
    const h = harness((text) => text.includes("recover_panel_session_handoff_redemption")
      ? preflight()
      : { rows: [{ outcome: "session_issued", authority: sessionAuthority() }], rowCount: 1 }, { audit });
    assert.equal((await h.redeemer.redeemHandoff({ credential: HANDOFF })).kind, "session_issued");
  }
});
