import assert from "node:assert/strict";
import test from "node:test";

import type { CreateStarterTenantResult } from "@celebix/saas-contracts";

import { OidcFlowError } from "../self-serve-oidc.ts";
import { createPersistentSelfServeRuntime, createSelfServeHttpActivationApproval } from "../self-serve-http/runtime.ts";
import { createVerifiedEdgeTrustBoundary } from "../self-serve-http/verified-edge-trust.ts";
import { createPanelSessionHandoffApproval } from "./activation.ts";
import { createOwnerPanelSessionInitialCallbackHandler } from "./internal-callback-handler.ts";
import { createInitialVerifiedCallbackGrantBoundary } from "./initial-callback-grant.ts";
import { createPostgresPanelSessionHandoffIssuer } from "./postgres-handoff-issuer.ts";

const NOW = new Date("2026-07-14T12:00:00.000Z");
const CALLBACK = "https://panel.celebix.site/auth/callback";
const STATE = "state_0123456789abcdefghijklmnop";
const ISSUER = "https://identity.example.test/oidc";
const AUDIENCE = "customer-panel";
const UUIDS = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
  "10000000-0000-4000-8000-000000000003",
  "10000000-0000-4000-8000-000000000004",
];
const BINDING = `pb1.${Buffer.alloc(32, 0x22).toString("base64url")}`;

function fixture(options: {
  completion?: "tenant_created" | "in_progress";
  commitUnknown?: boolean;
  handlerNow?: Date;
  audit?: (event: unknown) => void | Promise<void>;
  claimKind?: "browser_callback_claimed" | "callback_replayed" | "operation_mismatch" | "expired" | "unauthenticated" | "durable_authority_invalid" | "commit_unknown" | "unavailable";
  returningLogin?: "session_ready" | "callback_not_granted";
} = {}) {
  const order: string[] = [];
  const edgeBoundary = createVerifiedEdgeTrustBoundary();
  let oidcConsumed = false;
  let providerCalls = 0;
  let providerRejectCalls = 0;
  let recoverConsumedCalls = 0;
  const tenantResult = {
    store: { slug: "verified-store" },
    storefrontUrl: "https://verified-store.celebix.site",
    panelUrl: "https://verified-store.admin.celebix.site",
    operationId: "operation_verified",
    replayed: false,
  } as CreateStarterTenantResult;
  const runtime = createPersistentSelfServeRuntime({
    activationApproval: createSelfServeHttpActivationApproval("disposable_test"),
    oidcTransactionStore: {
      async save() {}, async discard() {},
      async consume() {
        providerRejectCalls += 1;
        if (oidcConsumed) throw new OidcFlowError("oidc_state_replayed", "private");
        oidcConsumed = true;
        return {
          state: STATE, nonce: "nonce_0123456789abcdefghijklmnop", codeVerifier: "verifier_0123456789abcdefghijklmnop",
          redirectUri: CALLBACK, returnTo: "/kayit", expectedIssuer: ISSUER, expectedAudience: AUDIENCE,
          createdAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 600_000).toISOString(),
        };
      },
    },
    registrationAttemptStore: {
      async save() {},
      async consume() {
        return {
          id: "attempt_0123456789abcdefghijklmnop", state: STATE,
          details: { storeName: "Verified Store", storeSlug: "verified-store", locale: "tr" as const, currency: "TRY" as const, themeKey: "starter", privacyAcceptedAt: NOW.toISOString() },
          idempotencyKey: "ssik_0123456789abcdefghijklmnop", requestedAt: NOW.toISOString(), status: "awaiting_identity" as const,
          createdAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 600_000).toISOString(),
        };
      },
    },
    oidcProvider: {
      buildAuthorizationUrl() { throw new Error("not used"); },
      async verifyCallback() {
        order.push("provider");
        providerCalls += 1;
        return { issuer: ISSUER, subject: "subject", audience: [AUDIENCE], nonce: "nonce_0123456789abcdefghijklmnop", email: "owner@example.test", emailVerified: true };
      },
    },
    registrationCompletion: {
      async recordVerifiedIdentity() { return { kind: "identity_recorded" as const, status: "identity_verified" as const, version: 2 }; },
      async resumeTenantCreation() {
        return options.completion === "in_progress"
          ? { kind: "in_progress" as const }
          : { kind: "tenant_created" as const, result: tenantResult };
      },
      async reconcileUnknownCommit() { return { kind: "pending" as const }; },
    },
    consumedCallbackRecovery: {
      async classifyConsumedCallback() { recoverConsumedCalls += 1; return { kind: "missing" as const }; },
    },
    requestGate: edgeBoundary.requestGate,
    clock: () => new Date(NOW), audit() {},
    bodyPolicy: { maximumBytes: 4_096, maximumCallbackQueryBytes: 2_048 },
    registrationOrigin: "https://ecommerce.celebix.co", callbackAuthority: CALLBACK,
    panelOrigin: "https://panel.celebix.site", platformDomainSuffix: "celebix.site",
    providerAuthority: { issuer: ISSUER, audience: AUDIENCE, authorizationOrigin: "https://identity.example.test" },
  });
  const grantBoundary = createInitialVerifiedCallbackGrantBoundary(runtime);
  let uuidIndex = 0;
  let failCommit = options.commitUnknown === true;
  let createValues: readonly unknown[] | undefined;
  let issueCalls = 0;
  let recoveryCalls = 0;
  let claimCalls = 0;
  const authority = (values: readonly unknown[]) => ({
    handoffId: String((createValues ?? values)[4] ?? UUIDS[0]), attemptId: "attempt_0123456789abcdef",
    tenantOperationId: "20000000-0000-4000-8000-000000000001", principalId: "30000000-0000-4000-8000-000000000001",
    activeStoreId: "40000000-0000-4000-8000-000000000001", sessionOperationId: String((createValues ?? values)[5] ?? UUIDS[1]),
    sessionId: String((createValues ?? values)[6] ?? UUIDS[2]), familyId: String((createValues ?? values)[7] ?? UUIDS[3]),
    tokenKeyId: String(values[1]), tokenDigest: String(values[2]), sessionTokenKeyId: String(values[3]),
    issuedAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 600_000).toISOString(),
    sessionExpiresAt: new Date(NOW.getTime() + 28_800_000).toISOString(),
  });
  const issuer = createPostgresPanelSessionHandoffIssuer(createPanelSessionHandoffApproval("disposable_test"), {
    pool: { async connect() {
      let write = false;
      return {
        async query(text: string, values: readonly unknown[] = []) {
          if (text.startsWith("BEGIN ISOLATION")) write = true;
          if (text === "COMMIT" && write && failCommit) { failCommit = false; throw new Error("lost commit response"); }
          if (/^BEGIN|^COMMIT$|^ROLLBACK$|set_config|SET LOCAL ROLE/.test(text)) return { rows: [], rowCount: 0 };
          if (text.includes("create_panel_session_handoff")) {
            order.push("issuer");
            issueCalls += 1; createValues = values;
            return { rows: [{ outcome: "handoff_created", authority: authority(values) }], rowCount: 1 };
          }
          recoveryCalls += 1;
          return { rows: [{ outcome: "handoff_replayed", authority: authority(values) }], rowCount: 1 };
        },
        release() {},
      };
    } },
    stateDigester: { digest() { return "a".repeat(64); } },
    handoffKeys: new Map([["handoff.active.v1", new Uint8Array(32).fill(0x41)]]),
    activeHandoffKeyId: "handoff.active.v1", sessionTokenKeyId: "panel.active.v1",
    clock: () => new Date(NOW), randomBytes: () => new Uint8Array(32).fill(0x42),
    randomUuid: () => UUIDS[uuidIndex++] ?? UUIDS.at(-1)!,
    timeouts: { poolCheckoutMs: 1_000, statementMs: 1_000, lockMs: 1_000, idleTransactionMs: 1_000 },
    audit() {}, initialCallbackGrantBoundary: grantBoundary,
  });
  const browserBindingRepository = {
    async claimCallback() {
      order.push("claim");
      claimCalls += 1;
      if (options.claimKind) return { kind: options.claimKind };
      return { kind: claimCalls === 1 ? "browser_callback_claimed" as const : "callback_replayed" as const };
    },
  };
  const handler = createOwnerPanelSessionInitialCallbackHandler({
    runtime, edgeTrustBoundary: edgeBoundary, initialCallbackGrantBoundary: grantBoundary, issuer,
    browserBindingRepository,
    ...(options.returningLogin ? { returningLogin: {
      async tryComplete() {
        order.push("returning_login");
        return options.returningLogin === "session_ready"
          ? { kind: "session_ready" as const, credential: `v1.panel.active.${Buffer.alloc(32, 0x55).toString("base64url")}`, activeStoreId: "40000000-0000-4000-8000-000000000001", destinationOrigin: "https://verified-store.admin.celebix.site", issuedAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 28_800_000).toISOString() }
          : { kind: "fresh_login_required" as const, code: "callback_not_granted" as const };
      },
      async tryRejectProvider() { return { kind: "fresh_login_required" as const, code: "callback_not_granted" as const }; },
    } } : {}),
    clock: () => new Date(options.handlerNow ?? NOW), audit: options.audit ?? (() => undefined),
  });
  return {
    handler, edgeBoundary, browserBindingRepository,
    get providerCalls() { return providerCalls; },
    get providerRejectCalls() { return providerRejectCalls; },
    get recoverConsumedCalls() { return recoverConsumedCalls; },
    get issueCalls() { return issueCalls; },
    get recoveryCalls() { return recoveryCalls; },
    get claimCalls() { return claimCalls; },
    order,
  };
}

async function invoke(current: ReturnType<typeof fixture>, query = `state=${STATE}&code=verified-code`, binding = BINDING) {
  return current.edgeBoundary.invokeWithVerifiedContext((context) => current.handler.handle(
    new Request(`${CALLBACK}?${query}`), context, binding,
  ));
}

test("exact active edge context executes one genuine initial callback and returns one canonical handoff", async () => {
  const current = fixture();
  const result = await invoke(current);
  assert.equal(result.status, 200);
  assert.equal(result.body.kind, "session_handoff_ready");
  if (result.body.kind === "session_handoff_ready") {
    assert.match(result.body.handoffCredential, /^h1\./);
    assert.equal(result.body.handoffExpiresAt, new Date(NOW.getTime() + 600_000).toISOString());
    assert.equal(result.body.destinationStoreId, "40000000-0000-4000-8000-000000000001");
    assert.equal(result.body.destinationOrigin, "https://verified-store.admin.celebix.site");
  }
  assert.equal(current.providerCalls, 1);
  assert.equal(current.issueCalls, 1);
  assert.equal(current.recoveryCalls, 0);
  assert.equal(current.recoverConsumedCalls, 0);
  assert.equal(current.claimCalls, 1);
  assert.deepEqual(current.order.slice(0, 3), ["claim", "provider", "issuer"]);
});

test("exact authorization-response issuer reaches OIDC completion before handoff", async () => {
  const current = fixture();
  const result = await invoke(current, `state=${STATE}&code=verified-code&iss=${encodeURIComponent(ISSUER)}`);
  assert.equal(result.status, 200);
  assert.equal(result.body.kind, "session_handoff_ready");
  assert.equal(current.providerCalls, 1);
  assert.equal(current.issueCalls, 1);
  assert.deepEqual(current.order.slice(0, 3), ["claim", "provider", "issuer"]);
});

test("browser-bound returning login bypasses tenant completion and returns one durable session", async () => {
  const current = fixture({ returningLogin: "session_ready" });
  const result = await invoke(current, `state=plogin_0123456789abcdefghijklmnop&code=verified-code`);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    schemaVersion: 1,
    kind: "session_ready",
    sessionCredential: `v1.panel.active.${Buffer.alloc(32, 0x55).toString("base64url")}`,
    sessionIssuedAt: NOW.toISOString(),
    sessionExpiresAt: new Date(NOW.getTime() + 28_800_000).toISOString(),
    destinationStoreId: "40000000-0000-4000-8000-000000000001",
    destinationOrigin: "https://verified-store.admin.celebix.site",
    redirectPath: "/",
  });
  assert.equal(current.claimCalls, 0);
  assert.equal(current.providerCalls, 0);
  assert.equal(current.issueCalls, 0);
  assert.deepEqual(current.order, ["returning_login"]);
});

test("authorization-response issuer mismatch consumes state but stops provider, tenant, handoff, and session authority", async () => {
  const current = fixture();
  const result = await invoke(
    current,
    `state=${STATE}&code=verified-code&iss=${encodeURIComponent("https://attacker.example/oidc")}`,
  );
  assert.deepEqual(result.body, {
    schemaVersion: 1,
    kind: "fresh_login_required",
    code: "callback_unavailable",
    retryable: false,
  });
  assert.equal(current.providerRejectCalls, 1);
  assert.equal(current.providerCalls, 0);
  assert.equal(current.issueCalls, 0);
  assert.equal(current.recoveryCalls, 0);
  assert.equal(current.recoverConsumedCalls, 0);
  assert.equal(current.claimCalls, 1);
  assert.deepEqual(current.order, ["claim"]);
});

test("callback handler snapshots the atomic browser claim dependency at composition", async () => {
  const current = fixture();
  current.browserBindingRepository.claimCallback = async () => { throw new Error("mutated"); };
  const result = await invoke(current);
  assert.equal(result.status, 200);
  assert.equal(current.claimCalls, 1);
  assert.deepEqual(current.order.slice(0, 3), ["claim", "provider", "issuer"]);
});

test("unknown handoff COMMIT performs the one B2B1 recovery and still returns the retained credential", async () => {
  const current = fixture({ commitUnknown: true });
  const result = await invoke(current);
  assert.equal(result.status, 200);
  assert.equal(current.issueCalls, 1);
  assert.equal(current.recoveryCalls, 1);
});

test("consumed replay, no-grant completion, and expired handoff never return authority", async () => {
  const replay = fixture();
  assert.equal((await invoke(replay)).status, 200);
  const replayed = await invoke(replay);
  assert.deepEqual(replayed.body, { schemaVersion: 1, kind: "fresh_login_required", code: "callback_replayed", retryable: false });
  assert.equal(replay.issueCalls, 1);
  assert.equal(replay.recoveryCalls, 0);
  assert.equal(replay.recoverConsumedCalls, 0);
  assert.equal(replay.claimCalls, 2);

  const pending = fixture({ completion: "in_progress" });
  assert.deepEqual((await invoke(pending)).body, { schemaVersion: 1, kind: "fresh_login_required", code: "callback_not_granted", retryable: false });
  assert.equal(pending.issueCalls, 0);

  const expired = fixture({ handlerNow: new Date(NOW.getTime() + 600_000) });
  assert.deepEqual((await invoke(expired)).body, { schemaVersion: 1, kind: "fresh_login_required", code: "handoff_rejected", retryable: false });
});

test("provider error consumes only provider state and creates no grant or handoff", async () => {
  const current = fixture();
  const result = await invoke(current, `state=${STATE}&error=access_denied&error_description=private&iss=${encodeURIComponent(ISSUER)}`);
  assert.deepEqual(result.body, { schemaVersion: 1, kind: "fresh_login_required", code: "provider_rejected", retryable: false });
  assert.equal(current.providerCalls, 0);
  assert.equal(current.providerRejectCalls, 1);
  assert.equal(current.issueCalls, 0);
  assert.equal(current.recoveryCalls, 0);
  assert.equal(current.recoverConsumedCalls, 0);
  assert.equal(current.claimCalls, 1);
});

test("provider-error issuer mismatch consumes state but is not accepted as a provider rejection", async () => {
  const current = fixture();
  const result = await invoke(
    current,
    `state=${STATE}&error=access_denied&iss=${encodeURIComponent("https://attacker.example/oidc")}`,
  );
  assert.deepEqual(result.body, {
    schemaVersion: 1,
    kind: "fresh_login_required",
    code: "callback_unavailable",
    retryable: false,
  });
  assert.equal(current.providerRejectCalls, 1);
  assert.equal(current.providerCalls, 0);
  assert.equal(current.issueCalls, 0);
  assert.equal(current.claimCalls, 1);
  assert.deepEqual(current.order, ["claim"]);
});

test("wrong, expired, replayed, and commit-unknown browser authority stop before provider and issuer", async () => {
  for (const claimKind of [
    "callback_replayed", "operation_mismatch", "expired", "unauthenticated",
    "durable_authority_invalid", "commit_unknown", "unavailable",
  ] as const) {
    const current = fixture({ claimKind });
    const result = await invoke(current);
    assert.equal(result.body.kind, "fresh_login_required");
    assert.equal(current.claimCalls, 1);
    assert.equal(current.providerCalls, 0);
    assert.equal(current.providerRejectCalls, 0);
    assert.equal(current.issueCalls, 0);
    assert.deepEqual(current.order, ["claim"]);
  }
  const missing = fixture();
  assert.equal((await invoke(missing, `state=${STATE}&code=verified-code`, "")).body.kind, "fresh_login_required");
  assert.equal(missing.providerCalls, 0);
  assert.equal(missing.issueCalls, 0);
});

test("fake, expired, copied, and cross-boundary contexts fail before provider or issuer", async () => {
  const current = fixture();
  const request = new Request(`${CALLBACK}?state=${STATE}&code=verified-code`);
  for (const context of [{}, Object.freeze({}), { edge: "copied" }]) {
    const result = await current.handler.handle(request.clone(), context, BINDING);
    assert.notEqual(result.status, 200);
  }
  let expiredContext: unknown;
  await current.edgeBoundary.invokeWithVerifiedContext(async (context) => { expiredContext = context; return undefined; });
  assert.notEqual((await current.handler.handle(request.clone(), expiredContext, BINDING)).status, 200);
  const other = createVerifiedEdgeTrustBoundary();
  await other.invokeWithVerifiedContext(async (context) => {
    assert.notEqual((await current.handler.handle(request.clone(), context, BINDING)).status, 200);
  });
  assert.equal(current.providerCalls, 0);
  assert.equal(current.issueCalls, 0);
});

test("audit failure or non-settlement cannot alter callback authority", async () => {
  for (const audit of [
    () => { throw new Error("state code credential private"); },
    async () => { throw new Error("state code credential private"); },
    () => new Promise<never>(() => undefined),
  ]) assert.equal((await invoke(fixture({ audit }))).status, 200);
});
