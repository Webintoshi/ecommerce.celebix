import assert from "node:assert/strict";
import test from "node:test";

import { createPanelSessionPersistenceApproval } from "../panel-session-persistence/activation.ts";
import { createPostgresCrossHostSessionHandoffRepository } from "./postgres-repository.ts";

const NOW = new Date("2026-07-30T12:00:00.000Z");
const SOURCE = `v1.panel.active.v1.${Buffer.alloc(32, 0x31).toString("base64url")}`;
const STORE = "20000000-0000-4000-8000-000000000002";
const OPERATION = "70000000-0000-4000-8000-000000000001";
const DESTINATION = "hemenaku.admin.saas-staging.celebix.site";
const DESTINATION_ORIGIN = `https://${DESTINATION}`;

type QueryResult = { rows: Record<string, unknown>[]; rowCount: number | null };
type Responder = (text: string, values: readonly unknown[]) => QueryResult;

function empty(): QueryResult { return { rows: [], rowCount: 0 }; }

function sessionAuthority(values: readonly unknown[]) {
  return {
    session: {
      sessionId: values[4],
      familyId: values[5],
      principalId: "10000000-0000-4000-8000-000000000001",
      activeStoreId: STORE,
      version: 1,
      issuedAt: (values[8] as Date).toISOString(),
      rotatedAt: (values[8] as Date).toISOString(),
      expiresAt: (values[9] as Date).toISOString(),
    },
  };
}

function harness(responder: Responder, commitFailure = false) {
  const calls: Array<{ text: string; values: readonly unknown[] }> = [];
  const repository = createPostgresCrossHostSessionHandoffRepository(
    createPanelSessionPersistenceApproval("disposable_test"),
    {
      pool: {
        async connect() {
          return {
            async query(text: string, values: readonly unknown[] = []) {
              calls.push({ text, values });
              if (text === "COMMIT" && commitFailure) throw new Error("private driver detail");
              if (/^BEGIN|^COMMIT$|^ROLLBACK$|set_config|SET LOCAL ROLE/.test(text)) return empty();
              return responder(text, values);
            },
            release() {},
          };
        },
      },
      handoffKeys: new Map([["panel.handoff.v1", new Uint8Array(32).fill(0x41)]]),
      activeHandoffKeyId: "panel.handoff.v1",
      sessionKeys: new Map([["panel.active.v1", new Uint8Array(32).fill(0x42)]]),
      activeSessionKeyId: "panel.active.v1",
      clock: () => new Date(NOW),
      randomBytes: (size: number) => new Uint8Array(size).fill(0x43),
      timeouts: { poolCheckoutMs: 1000, statementMs: 1000, lockMs: 1000, idleTransactionMs: 1000 },
      audit: () => undefined,
    },
  );
  return { repository, calls };
}

test("issues a destination-bound two-minute handoff without sending plaintext credentials to SQL", async () => {
  const h = harness((text, values) => {
    assert.match(text, /^SELECT outcome, authority FROM saas\.issue_cross_host_panel_handoff\(/);
    return {
      rows: [{ outcome: "handoff_issued", authority: {
        destinationOrigin: DESTINATION_ORIGIN,
        expiresAt: (values[9] as Date).toISOString(),
      } }],
      rowCount: 1,
    };
  });
  const result = await h.repository.issueHandoff({
    currentCredential: SOURCE,
    operationId: OPERATION,
    destinationStoreId: STORE,
    destinationHostname: DESTINATION,
    now: NOW,
  });
  assert.equal(result.kind, "handoff_issued");
  if (result.kind !== "handoff_issued") return;
  assert.match(result.credential, /^v1\.panel\.handoff\.v1\.[A-Za-z0-9_-]{43}$/);
  assert.equal(result.destinationOrigin, DESTINATION_ORIGIN);
  const query = h.calls.find(({ text }) => text.includes("issue_cross_host_panel_handoff"));
  assert.equal(query?.values.length, 10);
  assert.equal(JSON.stringify(query?.values).includes(SOURCE), false);
  assert.equal(JSON.stringify(query?.values).includes(result.credential), false);
});

test("redeems on the exact destination and creates the session credential only there", async () => {
  let handoffCredential = "";
  const h = harness((text, values) => {
    if (text.includes("issue_cross_host_panel_handoff")) {
      return { rows: [{ outcome: "handoff_issued", authority: { destinationOrigin: DESTINATION_ORIGIN, expiresAt: (values[9] as Date).toISOString() } }], rowCount: 1 };
    }
    assert.match(text, /^SELECT outcome, authority FROM saas\.redeem_cross_host_panel_handoff\(/);
    return { rows: [{ outcome: "redeemed", authority: sessionAuthority(values) }], rowCount: 1 };
  });
  const issued = await h.repository.issueHandoff({ currentCredential: SOURCE, operationId: OPERATION, destinationStoreId: STORE, destinationHostname: DESTINATION, now: NOW });
  assert.equal(issued.kind, "handoff_issued");
  if (issued.kind !== "handoff_issued") return;
  handoffCredential = issued.credential;
  const redeemed = await h.repository.redeemHandoff({ credential: handoffCredential, destinationHostname: DESTINATION, now: NOW });
  assert.equal(redeemed.kind, "redeemed");
  if (redeemed.kind !== "redeemed") return;
  assert.match(redeemed.sessionCredential, /^v1\.panel\.active\.v1\.[A-Za-z0-9_-]{43}$/);
  const query = h.calls.find(({ text }) => text.includes("redeem_cross_host_panel_handoff"));
  assert.equal(query?.values.length, 10);
  assert.equal(JSON.stringify(query?.values).includes(handoffCredential), false);
  assert.equal(JSON.stringify(query?.values).includes(redeemed.sessionCredential), false);
});

test("rejects malformed or non-canonical destinations without querying", async () => {
  for (const destinationHostname of ["HEMENAKU.admin.celebix.site", `${DESTINATION}:443`, `${DESTINATION}/path`, ""] ) {
    const h = harness(() => { throw new Error("must not query"); });
    assert.deepEqual(await h.repository.issueHandoff({
      currentCredential: SOURCE,
      operationId: OPERATION,
      destinationStoreId: STORE,
      destinationHostname,
      now: NOW,
    }), { kind: "durable_authority_invalid" });
    assert.equal(h.calls.length, 0);
  }
});

test("returns recoverable proofs after an unknown redemption commit without exposing digests", async () => {
  const h = harness((text, values) => {
    if (text.includes("redeem_cross_host_panel_handoff")) {
      return { rows: [{ outcome: "redeemed", authority: sessionAuthority(values) }], rowCount: 1 };
    }
    throw new Error("unexpected query");
  }, true);
  const result = await h.repository.redeemHandoff({
    credential: `v1.panel.handoff.v1.${Buffer.alloc(32, 0x32).toString("base64url")}`,
    destinationHostname: DESTINATION,
    now: NOW,
  });
  assert.equal(result.kind, "commit_unknown");
  assert.equal(JSON.stringify(result).includes("tokenDigest"), false);
  assert.equal(JSON.stringify(result).includes("keyId"), false);
});
