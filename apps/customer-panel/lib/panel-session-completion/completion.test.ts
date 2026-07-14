import assert from "node:assert/strict";
import test from "node:test";

import { createPanelSessionCompletionApproval } from "./activation.ts";
import { createPanelSessionCompletionHandler } from "./completion.ts";

const CALLBACK = "https://panel.celebix.site/auth/callback";
const STATE = "state_0123456789abcdefghijklmnop";
const NOW = new Date("2026-07-14T12:00:00.000Z");
const HANDOFF = `h1.handoff.active.${Buffer.alloc(32, 0x44).toString("base64url")}`;
const CREDENTIAL = `v1.panel.active.${Buffer.alloc(32, 0x55).toString("base64url")}`;
const UUIDS = {
  sessionId: "10000000-0000-4000-8000-000000000001",
  familyId: "10000000-0000-4000-8000-000000000002",
  principalId: "10000000-0000-4000-8000-000000000003",
  activeStoreId: "10000000-0000-4000-8000-000000000004",
};

function session(overrides: Record<string, unknown> = {}) {
  return Object.freeze({
    ...UUIDS,
    version: 1,
    issuedAt: NOW.toISOString(),
    rotatedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 28_800_000).toISOString(),
    ...overrides,
  });
}

function ready() {
  return Object.freeze({
    schemaVersion: 1 as const,
    kind: "session_handoff_ready" as const,
    handoffCredential: HANDOFF,
    handoffExpiresAt: new Date(NOW.getTime() + 600_000).toISOString(),
    redirectPath: "/" as const,
  });
}

function fixture(options: {
  transportResult?: object;
  transportError?: boolean;
  redeemResult?: object;
  recoverResult?: object;
  audit?: (event: unknown) => void | Promise<void>;
} = {}) {
  let transportCalls = 0;
  let redeemCalls = 0;
  let recoverCalls = 0;
  const handoffs: string[] = [];
  const handler = createPanelSessionCompletionHandler({
    activationApproval: createPanelSessionCompletionApproval("disposable_test"),
    publicCallbackAuthority: CALLBACK,
    maximumQueryBytes: 2_048,
    transport: {
      async complete() {
        transportCalls += 1;
        if (options.transportError) throw new Error(`private ${HANDOFF}`);
        return options.transportResult ?? ready();
      },
    },
    redeemer: {
      async redeemHandoff({ credential }: { credential: string }) {
        redeemCalls += 1; handoffs.push(credential);
        return options.redeemResult ?? Object.freeze({ kind: "session_issued", credential: CREDENTIAL, session: session() });
      },
      async recoverRedemption({ credential }: { credential: string }) {
        recoverCalls += 1; handoffs.push(credential);
        return options.recoverResult ?? Object.freeze({ kind: "session_replayed", credential: CREDENTIAL, session: session() });
      },
    },
    clock: () => new Date(NOW),
    audit: options.audit ?? (() => undefined),
  });
  return {
    handler,
    get transportCalls() { return transportCalls; },
    get redeemCalls() { return redeemCalls; },
    get recoverCalls() { return recoverCalls; },
    handoffs,
  };
}

test("first issuance and redemption replay return only the exact secure cookie and fixed empty 303", async () => {
  for (const kind of ["session_issued", "session_replayed"] as const) {
    const current = fixture({ redeemResult: Object.freeze({ kind, credential: CREDENTIAL, session: session() }) });
    const response = await current.handler(new Request(`${CALLBACK}?state=${STATE}&code=verified-code`));
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "https://panel.celebix.site/");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("set-cookie"), `__Host-celebix_panel=${CREDENTIAL}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=28800`);
    assert.equal(await response.text(), "");
    assert.doesNotMatch(response.headers.get("location") ?? "", /state|code|h1\.|v1\./);
    assert.equal(current.redeemCalls, 1);
    assert.equal(current.recoverCalls, 0);
  }
});

test("redemption unknown COMMIT performs exactly one read-only recovery with the identical handoff", async () => {
  const current = fixture({
    redeemResult: Object.freeze({ kind: "commit_unknown", credential: CREDENTIAL }),
    recoverResult: Object.freeze({ kind: "session_replayed", credential: CREDENTIAL, session: session() }),
  });
  assert.equal((await current.handler(new Request(`${CALLBACK}?state=${STATE}&code=verified-code`))).status, 303);
  assert.equal(current.redeemCalls, 1);
  assert.equal(current.recoverCalls, 1);
  assert.deepEqual(current.handoffs, [HANDOFF, HANDOFF]);
});

test("invalid callback, provider rejection, fresh-login, and transport failure emit controlled JSON without cookie or redirect", async () => {
  const cases = [
    [fixture(), new Request(`${CALLBACK}?state=short&code=code`), "panel_session_callback_invalid", 400],
    [fixture({ transportResult: Object.freeze({ schemaVersion: 1, kind: "fresh_login_required", code: "provider_rejected", retryable: false }) }), new Request(`${CALLBACK}?state=${STATE}&error=access_denied`), "panel_session_provider_rejected", 400],
    [fixture({ transportResult: Object.freeze({ schemaVersion: 1, kind: "fresh_login_required", code: "callback_replayed", retryable: false }) }), new Request(`${CALLBACK}?state=${STATE}&code=code`), "panel_session_fresh_login_required", 409],
    [fixture({ transportError: true }), new Request(`${CALLBACK}?state=${STATE}&code=code`), "panel_session_transport_unavailable", 503],
  ] as const;
  for (const [current, request, code, status] of cases) {
    const response = await current.handler(request);
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { code, retryable: false, freshLoginRequired: true });
    assert.equal(response.headers.has("set-cookie"), false);
    assert.equal(response.headers.has("location"), false);
    assert.equal(current.redeemCalls, 0);
    assert.equal(current.recoverCalls, 0);
  }
  assert.equal(cases[0][0].transportCalls, 0);
});

test("every redemption denial or malformed success projection fails closed without retry, cookie, or Location", async () => {
  const results = [
    ...["expired", "unauthenticated", "membership_denied", "operation_mismatch", "unavailable", "durable_authority_invalid"]
      .map((kind) => Object.freeze({ kind })),
    Object.freeze({ kind: "session_issued", credential: "v1.bad", session: session() }),
    Object.freeze({ kind: "session_issued", credential: CREDENTIAL, session: { ...session() } }),
    Object.freeze({ kind: "session_issued", credential: CREDENTIAL, session: session({ activeStoreId: undefined }) }),
    Object.freeze({ kind: "session_issued", credential: CREDENTIAL, session: session({ rotatedAt: new Date(NOW.getTime() + 28_800_000).toISOString() }) }),
    Object.freeze({ kind: "session_issued", credential: CREDENTIAL, session: session({ expiresAt: new Date(NOW.getTime() + 28_800_001).toISOString() }) }),
    Object.freeze({ kind: "session_issued", credential: CREDENTIAL, session: session({ expiresAt: NOW.toISOString() }) }),
  ];
  for (const redeemResult of results) {
    const current = fixture({ redeemResult });
    const response = await current.handler(new Request(`${CALLBACK}?state=${STATE}&code=code`));
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "panel_session_redemption_failed");
    assert.equal(response.headers.has("set-cookie"), false);
    assert.equal(response.headers.has("location"), false);
    assert.equal(current.redeemCalls, 1);
    assert.equal(current.recoverCalls, 0);
  }
});

test("malformed or stale handoff projections fail before redemption", async () => {
  const results = [
    Object.freeze({ ...ready(), handoffCredential: "h1.bad" }),
    Object.freeze({ ...ready(), handoffExpiresAt: "not-a-timestamp" }),
    Object.freeze({ ...ready(), handoffExpiresAt: NOW.toISOString() }),
    Object.freeze({ ...ready(), handoffExpiresAt: new Date(NOW.getTime() + 600_001).toISOString() }),
  ];
  for (const transportResult of results) {
    const current = fixture({ transportResult });
    const response = await current.handler(new Request(`${CALLBACK}?state=${STATE}&code=code`));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "panel_session_transport_unavailable");
    assert.equal(response.headers.has("set-cookie"), false);
    assert.equal(response.headers.has("location"), false);
    assert.equal(current.redeemCalls, 0);
    assert.equal(current.recoverCalls, 0);
  }
});

test("audit throw, rejection, or non-settlement never changes session authority or receives credentials", async () => {
  for (const audit of [
    () => { throw new Error(`private ${HANDOFF} ${CREDENTIAL}`); },
    async () => { throw new Error(`private ${HANDOFF} ${CREDENTIAL}`); },
    () => new Promise<never>(() => undefined),
  ]) assert.equal((await fixture({ audit }).handler(new Request(`${CALLBACK}?state=${STATE}&code=code`))).status, 303);
});
