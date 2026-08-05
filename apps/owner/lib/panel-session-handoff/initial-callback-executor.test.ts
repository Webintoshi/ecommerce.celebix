import assert from "node:assert/strict";
import test from "node:test";

import type { CreateStarterTenantResult } from "@celebix/saas-contracts";

import { OidcFlowError } from "../self-serve-oidc.ts";
import { createPersistentSelfServeRuntime, createSelfServeHttpActivationApproval } from "../self-serve-http/runtime.ts";
import { createPanelSessionHandoffApproval } from "./activation.ts";
import { createInitialVerifiedCallbackGrantBoundary } from "./initial-callback-grant.ts";
import { createInitialCallbackPanelSessionHandoffExecutor } from "./initial-callback-executor.ts";
import { createPostgresPanelSessionHandoffIssuer } from "./postgres-handoff-issuer.ts";

const NOW = new Date("2026-07-14T10:00:00.000Z");
const STATE = "state_0123456789abcdefghijklmnop";
const OTHER_STATE = "state_other_0123456789abcdefghijk";
const CALLBACK = "https://panel.celebix.site/auth/callback";
const ISSUER = "https://identity.example.test/oidc";
const AUDIENCE = "customer-panel";

const UUIDS = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
  "10000000-0000-4000-8000-000000000003",
  "10000000-0000-4000-8000-000000000004",
];

function runtimeFixture(hooks: { providerStarted?(): void; waitForProviderRelease?(): Promise<void> } = {}) {
  let consumed = false;
  let recoveryCalls = 0;
  const providerInputs: Array<{ state: string; code: string }> = [];
  const attemptStates: string[] = [];
  const runtime = createPersistentSelfServeRuntime({
    activationApproval: createSelfServeHttpActivationApproval("disposable_test"),
    oidcTransactionStore: {
      async save() {}, async discard() {},
      async consume() {
        if (consumed) throw new OidcFlowError("oidc_state_replayed", "private");
        consumed = true;
        return {
          state: STATE, nonce: "nonce_0123456789abcdefghijklmnop", codeVerifier: "verifier_0123456789abcdefghijklmnop",
          redirectUri: CALLBACK, returnTo: "/kayit", expectedIssuer: ISSUER, expectedAudience: AUDIENCE,
          createdAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 600_000).toISOString(),
        };
      },
    },
    registrationAttemptStore: {
      async save() {},
      async consume(state: string) {
        attemptStates.push(state);
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
      async verifyCallback(input) {
        providerInputs.push({ state: input.state, code: input.code });
        hooks.providerStarted?.();
        await hooks.waitForProviderRelease?.();
        return { issuer: ISSUER, subject: "subject", audience: [AUDIENCE], nonce: "nonce_0123456789abcdefghijklmnop", email: "owner@example.test", emailVerified: true };
      },
    },
    registrationCompletion: {
      async recordVerifiedIdentity() { return { kind: "identity_recorded" as const, status: "identity_verified" as const, version: 2 }; },
      async resumeTenantCreation() {
        return {
          kind: "tenant_created" as const,
          result: {
            store: { slug: "verified-store" }, storefrontUrl: "https://verified-store.celebix.site",
            panelUrl: "https://panel.celebix.site", operationId: "operation_verified", replayed: false,
          } as CreateStarterTenantResult,
        };
      },
      async reconcileUnknownCommit() { return { kind: "pending" as const }; },
    },
    consumedCallbackRecovery: {
      async classifyConsumedCallback() { recoveryCalls += 1; return { kind: "missing" as const }; },
    },
    requestGate: { async verify() { return "allowed" as const; } },
    clock: () => new Date(NOW), audit() {},
    bodyPolicy: { maximumBytes: 4_096, maximumCallbackQueryBytes: 2_048 },
    registrationOrigin: "https://ecommerce.celebix.co", callbackAuthority: CALLBACK,
    panelOrigin: "https://panel.celebix.site", platformDomainSuffix: "celebix.site",
    providerAuthority: { issuer: ISSUER, audience: AUDIENCE, authorizationOrigin: "https://identity.example.test" },
  });
  return { runtime, providerInputs, attemptStates, get recoveryCalls() { return recoveryCalls; } };
}

function issuerFixture(boundary: ReturnType<typeof createInitialVerifiedCallbackGrantBoundary>, commitUnknown = false) {
  const states: string[] = [];
  const queries: string[] = [];
  let uuidIndex = 0;
  let failWriteCommit = commitUnknown;
  let createValues: readonly unknown[] | undefined;
  const authority = (values: readonly unknown[]) => ({
    handoffId: String((createValues ?? values)[4] ?? UUIDS[0]),
    attemptId: "attempt_0123456789abcdef",
    tenantOperationId: "20000000-0000-4000-8000-000000000001",
    principalId: "30000000-0000-4000-8000-000000000001",
    activeStoreId: "40000000-0000-4000-8000-000000000001",
    sessionOperationId: String((createValues ?? values)[5] ?? UUIDS[1]),
    sessionId: String((createValues ?? values)[6] ?? UUIDS[2]),
    familyId: String((createValues ?? values)[7] ?? UUIDS[3]),
    tokenKeyId: String(values[1]),
    tokenDigest: String(values[2]),
    sessionTokenKeyId: String(values[3]),
    issuedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 600_000).toISOString(),
    sessionExpiresAt: new Date(NOW.getTime() + 28_800_000).toISOString(),
  });
  const pool = {
    async connect() {
      let write = false;
      return {
        async query(text: string, values: readonly unknown[] = []) {
          queries.push(text);
          if (text.startsWith("BEGIN ISOLATION")) write = true;
          if (text === "COMMIT" && write && failWriteCommit) {
            failWriteCommit = false;
            throw new Error("simulated lost commit response");
          }
          if (/^BEGIN|^COMMIT$|^ROLLBACK$|set_config|SET LOCAL ROLE/.test(text)) return { rows: [], rowCount: 0 };
          if (text.includes("create_panel_session_handoff")) {
            createValues = values;
            return { rows: [{ outcome: "handoff_created", authority: authority(values) }], rowCount: 1 };
          }
          return { rows: [{ outcome: "handoff_replayed", authority: authority(values) }], rowCount: 1 };
        },
        release() {},
      };
    },
  };
  const issuer = createPostgresPanelSessionHandoffIssuer(createPanelSessionHandoffApproval("disposable_test"), {
    pool,
    stateDigester: { digest(state: string) { states.push(state); return "a".repeat(64); } },
    handoffKeys: new Map([["handoff.active.v1", new Uint8Array(32).fill(0x41)]]),
    activeHandoffKeyId: "handoff.active.v1",
    sessionTokenKeyId: "panel.active.v1",
    clock: () => new Date(NOW),
    randomBytes: () => new Uint8Array(32).fill(0x42),
    randomUuid: () => UUIDS[uuidIndex++] ?? UUIDS.at(-1)!,
    timeouts: { poolCheckoutMs: 1_000, statementMs: 1_000, lockMs: 1_000, idleTransactionMs: 1_000 },
    audit() {},
    initialCallbackGrantBoundary: boundary,
  });
  return { issuer, states, queries };
}

test("unmounted executor snapshots caller input and issues only through the genuine boundary issuer", async () => {
  let announceProvider!: () => void;
  const providerStarted = new Promise<void>((resolve) => { announceProvider = resolve; });
  let releaseProvider!: () => void;
  const providerRelease = new Promise<void>((resolve) => { releaseProvider = resolve; });
  const fixture = runtimeFixture({ providerStarted: announceProvider, waitForProviderRelease: () => providerRelease });
  const boundary = createInitialVerifiedCallbackGrantBoundary(fixture.runtime);
  const genuine = issuerFixture(boundary);
  const executor = createInitialCallbackPanelSessionHandoffExecutor({ runtime: fixture.runtime, boundary, issuer: genuine.issuer });
  const callback = { state: STATE, code: "verified-code" };
  const pending = executor.execute(callback);
  await providerStarted;
  callback.state = OTHER_STATE;
  callback.code = "substituted-code";
  releaseProvider();
  const first = await pending;
  assert.equal(first.kind, "initial_callback_granted");
  if (first.kind === "initial_callback_granted") assert.equal(first.value.handoff.kind, "handoff_created");
  assert.deepEqual(genuine.states, [STATE]);
  assert.deepEqual(fixture.providerInputs, [{ state: STATE, code: "verified-code" }]);
  assert.deepEqual(fixture.attemptStates, [STATE]);

  const replay = await executor.execute({ state: STATE, code: "verified-code" });
  assert.deepEqual(replay, { kind: "initial_callback_replayed" });
  assert.deepEqual(genuine.states, [STATE]);
  assert.equal(fixture.recoveryCalls, 0);
  assert.equal(Object.isFrozen(executor), true);
  assert.deepEqual(Object.keys(executor), ["execute"]);
});

test("executor rejects fake, copied, spread, and wrong-boundary genuine issuers", () => {
  const fixture = runtimeFixture();
  const boundary = createInitialVerifiedCallbackGrantBoundary(fixture.runtime);
  const otherBoundary = createInitialVerifiedCallbackGrantBoundary(fixture.runtime);
  const genuine = issuerFixture(boundary).issuer;
  const wrongBoundary = issuerFixture(otherBoundary).issuer;
  const fake = { issueHandoff: genuine.issueHandoff, recoverHandoff: genuine.recoverHandoff };
  for (const issuer of [fake, { ...genuine }, Object.assign({}, genuine), wrongBoundary]) {
    assert.throws(
      () => createInitialCallbackPanelSessionHandoffExecutor({ runtime: fixture.runtime, boundary, issuer }),
      /initial_callback_handoff_executor_invalid/,
    );
  }
});

test("commit-unknown recovery uses the exact snapshotted callback state", async () => {
  const fixture = runtimeFixture();
  const boundary = createInitialVerifiedCallbackGrantBoundary(fixture.runtime);
  const genuine = issuerFixture(boundary, true);
  const executor = createInitialCallbackPanelSessionHandoffExecutor({ runtime: fixture.runtime, boundary, issuer: genuine.issuer });
  const result = await executor.execute({ state: STATE, code: "verified-code" });
  assert.equal(result.kind, "initial_callback_granted");
  if (result.kind === "initial_callback_granted") assert.equal(result.value.handoff.kind, "handoff_replayed");
  assert.deepEqual(genuine.states, [STATE, STATE]);
});
