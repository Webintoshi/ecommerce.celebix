import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { createPanelSessionHandoffApproval } from "./activation.ts";
import { createPostgresPanelSessionHandoffIssuer } from "./postgres-handoff-issuer.ts";

const NOW = new Date("2026-07-14T10:00:00.000Z");
const RAW_STATE = "state_1234567890abcdefghijklmnop";
const STATE_DIGEST = "a".repeat(64);
const HANDOFF_KEY_ID = "handoff.active.v1";
const HANDOFF_KEY = new Uint8Array(32).fill(0x41);
const OLD_KEY_ID = "handoff.old.v1";
const OLD_KEY = new Uint8Array(48).fill(0x42);
const SESSION_KEY_ID = "panel.active.v1";
const UUIDS = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
  "10000000-0000-4000-8000-000000000003",
  "10000000-0000-4000-8000-000000000004",
];

type Responder = (text: string, values: readonly unknown[]) => { rows: Record<string, unknown>[]; rowCount: number | null };

function credential(keyId = HANDOFF_KEY_ID, key = HANDOFF_KEY) {
  const token = createHmac("sha256", key)
    .update(`celebix-panel-handoff-v1\n${RAW_STATE}`, "utf8")
    .digest("base64url");
  const value = `h1.${keyId}.${token}`;
  return {
    value,
    digest: createHmac("sha256", key)
      .update(`celebix-panel-handoff-digest-v1\n${value}`, "utf8")
      .digest("hex"),
  };
}

function authority(values: readonly unknown[], keyId = HANDOFF_KEY_ID, key = HANDOFF_KEY) {
  const proof = credential(keyId, key);
  return {
    handoffId: String(values[4] ?? UUIDS[0]),
    attemptId: "attempt_1234567890abcdef",
    tenantOperationId: "20000000-0000-4000-8000-000000000001",
    principalId: "30000000-0000-4000-8000-000000000001",
    activeStoreId: "40000000-0000-4000-8000-000000000001",
    sessionOperationId: String(values[5] ?? UUIDS[1]),
    sessionId: String(values[6] ?? UUIDS[2]),
    familyId: String(values[7] ?? UUIDS[3]),
    tokenKeyId: keyId,
    tokenDigest: proof.digest,
    sessionTokenKeyId: SESSION_KEY_ID,
    issuedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 10 * 60_000).toISOString(),
    sessionExpiresAt: new Date(NOW.getTime() + 8 * 60 * 60_000).toISOString(),
  };
}

function harness(responder: Responder, options: { commitFailure?: boolean; audit?: (event: unknown) => void | Promise<void> } = {}) {
  const calls: Array<{ text: string; values: readonly unknown[] }> = [];
  const releases: unknown[] = [];
  let connects = 0;
  let random = 0;
  const issuer = createPostgresPanelSessionHandoffIssuer(
    createPanelSessionHandoffApproval("disposable_test"),
    {
      pool: {
        async connect() {
          connects += 1;
          return {
            async query(text: string, values: readonly unknown[] = []) {
              calls.push({ text, values });
              if (text === "COMMIT" && options.commitFailure) throw new Error("driver secret");
              if (/^BEGIN|^COMMIT$|^ROLLBACK$|set_config|SET LOCAL ROLE/.test(text)) return { rows: [], rowCount: 0 };
              return responder(text, values);
            },
            release(destroy?: unknown) { releases.push(destroy); },
          };
        },
      },
      stateDigester: { digest(state: string) { assert.equal(state, RAW_STATE); return STATE_DIGEST; } },
      handoffKeys: new Map([[HANDOFF_KEY_ID, HANDOFF_KEY], [OLD_KEY_ID, OLD_KEY]]),
      activeHandoffKeyId: HANDOFF_KEY_ID,
      sessionTokenKeyId: SESSION_KEY_ID,
      clock: () => new Date(NOW),
      randomUuid: () => UUIDS[random++] ?? UUIDS.at(-1)!,
      timeouts: { poolCheckoutMs: 1000, statementMs: 1000, lockMs: 1000, idleTransactionMs: 1000 },
      audit: options.audit ?? (() => undefined),
    },
  );
  return { issuer, calls, releases, get connects() { return connects; } };
}

test("creates a handoff from state digest only and never accepts caller principal or store authority", async () => {
  const h = harness((text, values) => {
    assert.equal(text, "SELECT outcome, authority FROM saas.create_panel_session_handoff($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)");
    assert.equal(values[0], STATE_DIGEST);
    return { rows: [{ outcome: "handoff_created", authority: authority(values) }], rowCount: 1 };
  });
  assert.deepEqual(Object.keys(h.issuer).sort(), ["issueHandoff", "recoverHandoff"]);
  const result = await h.issuer.issueHandoff({ rawState: RAW_STATE });
  assert.equal(result.kind, "handoff_created");
  if (result.kind !== "handoff_created") return;
  assert.equal(result.credential, credential().value);
  const serialized = JSON.stringify(h.calls);
  assert.equal(serialized.includes(RAW_STATE), false);
  assert.equal(serialized.includes(result.credential), false);
  assert.equal(serialized.includes(result.credential.split(".").at(-1) ?? ""), false);
  assert.equal("principalId" in h.issuer.issueHandoff, false);
  assert.deepEqual(h.releases, [undefined]);
});

test("replay rederives the same credential from the database-stored old key ID", async () => {
  const h = harness((_text, values) => ({
    rows: [{ outcome: "handoff_replayed", authority: authority(values, OLD_KEY_ID, OLD_KEY) }],
    rowCount: 1,
  }));
  const result = await h.issuer.issueHandoff({ rawState: RAW_STATE });
  assert.equal(result.kind, "handoff_replayed");
  if (result.kind === "handoff_replayed") assert.equal(result.credential, credential(OLD_KEY_ID, OLD_KEY).value);
});

test("replay preserves the stored session key ID after active session-key rotation", async () => {
  const h = harness((_text, values) => ({
    rows: [{
      outcome: "handoff_replayed",
      authority: { ...authority(values), sessionTokenKeyId: "panel.retained.v1" },
    }],
    rowCount: 1,
  }));
  const result = await h.issuer.issueHandoff({ rawState: RAW_STATE });
  assert.equal(result.kind, "handoff_replayed");
  if (result.kind === "handoff_replayed") assert.equal(result.credential, credential().value);
});

test("read-only creation recovery rederives the persisted credential without writing", async () => {
  const h = harness((text, values) => {
    assert.equal(text, "SELECT outcome, authority FROM saas.recover_panel_session_handoff($1,$2)");
    assert.deepEqual(values, [STATE_DIGEST, NOW]);
    return { rows: [{ outcome: "handoff_replayed", authority: authority([], OLD_KEY_ID, OLD_KEY) }], rowCount: 1 };
  });
  const result = await h.issuer.recoverHandoff({ rawState: RAW_STATE });
  assert.equal(result.kind, "handoff_replayed");
  assert.equal(h.calls.some((call) => call.text === "BEGIN READ ONLY"), true);
  assert.equal(h.calls.some((call) => call.text.includes("create_panel_session_handoff")), false);
});

test("unknown COMMIT preserves the deterministic handoff and destroys the client without rollback", async () => {
  const h = harness((_text, values) => ({ rows: [{ outcome: "handoff_created", authority: authority(values) }], rowCount: 1 }), { commitFailure: true });
  const result = await h.issuer.issueHandoff({ rawState: RAW_STATE });
  assert.deepEqual(result, { kind: "commit_unknown", credential: credential().value });
  assert.deepEqual(h.releases, [true]);
  assert.equal(h.calls.some((call) => call.text === "ROLLBACK"), false);
});

test("invalid state and removed replay keys fail closed with safe outcomes", async () => {
  const invalid = harness(() => { throw new Error("must not query"); });
  assert.deepEqual(await invalid.issuer.issueHandoff({ rawState: "short" }), { kind: "durable_authority_invalid" });
  assert.equal(invalid.connects, 0);

  const removed = harness((_text, values) => ({
    rows: [{ outcome: "handoff_replayed", authority: authority(values, "removed.v1", OLD_KEY) }],
    rowCount: 1,
  }));
  assert.deepEqual(await removed.issuer.issueHandoff({ rawState: RAW_STATE }), { kind: "durable_authority_invalid" });
});

test("audit throw, rejection, and pending promises cannot alter handoff authority", async () => {
  for (const audit of [
    () => { throw new Error("audit private"); },
    () => Promise.reject(new Error("audit private")),
    () => new Promise<void>(() => undefined),
  ]) {
    const h = harness((_text, values) => ({ rows: [{ outcome: "handoff_created", authority: authority(values) }], rowCount: 1 }), { audit });
    assert.equal((await h.issuer.issueHandoff({ rawState: RAW_STATE })).kind, "handoff_created");
  }
});
