import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import type { CreateStarterTenantResult } from "@celebix/saas-contracts";

import { OidcFlowError } from "../self-serve-oidc.ts";
import { createPersistentSelfServeRuntime, createSelfServeHttpActivationApproval } from "../self-serve-http/runtime.ts";
import { createPanelSessionHandoffApproval } from "./activation.ts";
import { createInitialVerifiedCallbackGrantBoundary } from "./initial-callback-grant.ts";
import {
  createPostgresPanelSessionHandoffIssuer,
  isPostgresPanelSessionHandoffIssuerForBoundary,
} from "./postgres-handoff-issuer.ts";

const NOW = new Date("2026-07-14T10:00:00.000Z");
const RAW_STATE = "state_1234567890abcdefghijklmnop";
const OTHER_STATE = "state_other_1234567890abcdefghijk";
const STATE_DIGEST = "a".repeat(64);
const HANDOFF_KEY_ID = "handoff.active.v1";
const HANDOFF_KEY = new Uint8Array(32).fill(0x41);
const OLD_KEY_ID = "handoff.old.v1";
const OLD_KEY = new Uint8Array(48).fill(0x42);
const SESSION_KEY_ID = "panel.active.v1";
const RANDOM = new Uint8Array(Array.from({ length: 32 }, (_, index) => index + 1));
const UUIDS = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
  "10000000-0000-4000-8000-000000000003",
  "10000000-0000-4000-8000-000000000004",
];

type Responder = (text: string, values: readonly unknown[]) => { rows: Record<string, unknown>[]; rowCount: number | null };

function credential(bytes = RANDOM, keyId = HANDOFF_KEY_ID, key = HANDOFF_KEY) {
  const value = `h1.${keyId}.${Buffer.from(bytes).toString("base64url")}`;
  return {
    value,
    digest: createHmac("sha256", key).update(`celebix-panel-handoff-digest-v1\n${value}`, "utf8").digest("hex"),
  };
}

function authority(values: readonly unknown[], proof = credential()) {
  return {
    handoffId: String(values[4] ?? UUIDS[0]),
    attemptId: "attempt_1234567890abcdef",
    tenantOperationId: "20000000-0000-4000-8000-000000000001",
    principalId: "30000000-0000-4000-8000-000000000001",
    activeStoreId: "40000000-0000-4000-8000-000000000001",
    sessionOperationId: String(values[5] ?? UUIDS[1]),
    sessionId: String(values[6] ?? UUIDS[2]),
    familyId: String(values[7] ?? UUIDS[3]),
    tokenKeyId: proof.value.split(".").slice(1, -1).join("."),
    tokenDigest: proof.digest,
    sessionTokenKeyId: SESSION_KEY_ID,
    issuedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 10 * 60_000).toISOString(),
    sessionExpiresAt: new Date(NOW.getTime() + 8 * 60 * 60_000).toISOString(),
  };
}

function runtime() {
  let consumed = false;
  return createPersistentSelfServeRuntime({
    activationApproval: createSelfServeHttpActivationApproval("disposable_test"),
    oidcTransactionStore: {
      async save() {}, async discard() {},
      async consume() {
        if (consumed) throw new OidcFlowError("oidc_state_replayed", "private");
        consumed = true;
        return {
          state: RAW_STATE, nonce: "nonce_1234567890abcdefghijklmnop", codeVerifier: "verifier_1234567890abcdefghijklmnop",
          redirectUri: "https://panel.celebix.site/auth/callback", returnTo: "/kayit",
          expectedIssuer: "https://identity.example.test/oidc", expectedAudience: "customer-panel",
          createdAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 600_000).toISOString(),
        };
      },
    },
    registrationAttemptStore: {
      async save() {},
      async consume() {
        return {
          id: "attempt_1234567890abcdef", state: RAW_STATE,
          details: { storeName: "Store", storeSlug: "store-slug", locale: "tr" as const, currency: "TRY" as const, themeKey: "starter", privacyAcceptedAt: NOW.toISOString() },
          idempotencyKey: "ssik_1234567890abcdefghijklmnop", requestedAt: NOW.toISOString(), status: "awaiting_identity" as const,
          createdAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 600_000).toISOString(),
        };
      },
    },
    oidcProvider: {
      buildAuthorizationUrl() { throw new Error("not used"); },
      async verifyCallback() {
        return { issuer: "https://identity.example.test/oidc", subject: "subject", audience: ["customer-panel"], nonce: "nonce_1234567890abcdefghijklmnop", email: "owner@example.test", emailVerified: true };
      },
    },
    registrationCompletion: {
      async recordVerifiedIdentity() { return { kind: "identity_recorded" as const, status: "identity_verified" as const, version: 2 }; },
      async resumeTenantCreation() {
        return { kind: "tenant_created" as const, result: {
          store: { slug: "store-slug" }, storefrontUrl: "https://store-slug.celebix.site", panelUrl: "https://panel.celebix.site", operationId: "operation", replayed: false,
        } as CreateStarterTenantResult };
      },
      async reconcileUnknownCommit() { return { kind: "pending" as const }; },
    },
    consumedCallbackRecovery: { async classifyConsumedCallback() { return { kind: "missing" as const }; } },
    requestGate: { async verify() { return "allowed" as const; } },
    clock: () => new Date(NOW), audit() {},
    bodyPolicy: { maximumBytes: 4096, maximumCallbackQueryBytes: 2048 },
    registrationOrigin: "https://ecommerce.celebix.co", callbackAuthority: "https://panel.celebix.site/auth/callback",
    panelOrigin: "https://panel.celebix.site", platformDomainSuffix: "celebix.site",
    providerAuthority: { issuer: "https://identity.example.test/oidc", audience: "customer-panel", authorizationOrigin: "https://identity.example.test" },
  });
}

function harness(responder: Responder, options: { commitFailure?: boolean } = {}) {
  const calls: Array<{ text: string; values: readonly unknown[] }> = [];
  const releases: unknown[] = [];
  let connects = 0;
  let random = 0;
  let randomByteCalls = 0;
  let randomUuidCalls = 0;
  let stateDigesterCalls = 0;
  let clockCalls = 0;
  let failNextWriteCommit = options.commitFailure === true;
  const approvedRuntime = runtime();
  const boundary = createInitialVerifiedCallbackGrantBoundary(approvedRuntime);
  const handoffKey = new Uint8Array(HANDOFF_KEY);
  const oldKey = new Uint8Array(OLD_KEY);
  const handoffKeys = new Map([[HANDOFF_KEY_ID, handoffKey], [OLD_KEY_ID, oldKey]]);
  const pool = {
    async connect() {
      connects += 1;
      let write = false;
      return {
        async query(text: string, values: readonly unknown[] = []) {
          calls.push({ text, values });
          if (text.startsWith("BEGIN ISOLATION")) write = true;
          if (text === "COMMIT" && write && failNextWriteCommit) {
            failNextWriteCommit = false;
            throw new Error("driver secret");
          }
          if (/^BEGIN|^COMMIT$|^ROLLBACK$|set_config|SET LOCAL ROLE/.test(text)) return { rows: [], rowCount: 0 };
          return responder(text, values);
        },
        release(destroy?: unknown) { releases.push(destroy); },
      };
    },
  };
  const dependencies = {
    pool,
    stateDigester: { digest(state: string) { stateDigesterCalls += 1; assert.equal(state, RAW_STATE); return STATE_DIGEST; } },
    handoffKeys,
    activeHandoffKeyId: HANDOFF_KEY_ID,
    sessionTokenKeyId: SESSION_KEY_ID,
    clock: () => { clockCalls += 1; return new Date(NOW); },
    randomBytes(size: number) { randomByteCalls += 1; assert.equal(size, 32); return new Uint8Array(RANDOM); },
    randomUuid: () => { randomUuidCalls += 1; return UUIDS[random++] ?? UUIDS.at(-1)!; },
    timeouts: { poolCheckoutMs: 1000, statementMs: 1000, lockMs: 1000, idleTransactionMs: 1000 },
    audit() {},
    initialCallbackGrantBoundary: boundary,
  };
  const issuer = createPostgresPanelSessionHandoffIssuer(createPanelSessionHandoffApproval("disposable_test"), dependencies);
  async function withGrant<T>(work: (grant: Parameters<typeof issuer.issueHandoff>[0]["initialCallbackGrant"]) => Promise<T>) {
    const execution = await boundary.executeInitialCallback({ state: RAW_STATE, code: "verified-code" }, (grant) => work(grant));
    assert.equal(execution.kind, "initial_callback_granted");
    if (execution.kind !== "initial_callback_granted") throw new Error("missing grant");
    return execution.value;
  }
  return {
    issuer, boundary, approvedRuntime, dependencies, pool, handoffKeys, handoffKey, oldKey, calls, releases, withGrant,
    get connects() { return connects; }, get randomByteCalls() { return randomByteCalls; },
    get randomUuidCalls() { return randomUuidCalls; }, get stateDigesterCalls() { return stateDigesterCalls; },
    get clockCalls() { return clockCalls; },
  };
}

test("missing, plain, expired, and cross-boundary grants fail before database access", async () => {
  const h = harness(() => { throw new Error("must not query"); });
  assert.deepEqual(await h.issuer.issueHandoff({ rawState: RAW_STATE, initialCallbackGrant: {} }), { kind: "durable_authority_invalid" });
  assert.deepEqual(await h.issuer.recoverHandoff({ rawState: RAW_STATE, candidateCredential: credential().value, initialCallbackGrant: {} }), { kind: "durable_authority_invalid" });
  assert.equal(h.connects, 0);

  const foreignRuntime = runtime();
  const foreignBoundary = createInitialVerifiedCallbackGrantBoundary(foreignRuntime);
  const foreign = await foreignBoundary.executeInitialCallback({ state: RAW_STATE, code: "verified-code" }, (grant) =>
    h.issuer.issueHandoff({ rawState: RAW_STATE, initialCallbackGrant: grant }));
  assert.equal(foreign.kind, "initial_callback_granted");
  if (foreign.kind === "initial_callback_granted") assert.deepEqual(foreign.value, { kind: "durable_authority_invalid" });
  assert.equal(h.connects, 0);

  let expired: unknown;
  await h.boundary.executeInitialCallback({ state: RAW_STATE, code: "verified-code" }, (grant) => { expired = grant; });
  assert.deepEqual(await h.issuer.issueHandoff({ rawState: RAW_STATE, initialCallbackGrant: expired as never }), { kind: "durable_authority_invalid" });
  assert.equal(h.connects, 0);
});

test("state-bound grant rejects issue and recovery for another state before every authority dependency", async () => {
  const h = harness(() => { throw new Error("must not query"); });
  const results = await h.withGrant(async (initialCallbackGrant) => [
    await h.issuer.issueHandoff({ rawState: OTHER_STATE, initialCallbackGrant }),
    await h.issuer.recoverHandoff({ rawState: OTHER_STATE, candidateCredential: credential().value, initialCallbackGrant }),
  ] as const);
  assert.deepEqual(results, [{ kind: "durable_authority_invalid" }, { kind: "durable_authority_invalid" }]);
  assert.equal(h.stateDigesterCalls, 0);
  assert.equal(h.randomByteCalls, 0);
  assert.equal(h.randomUuidCalls, 0);
  assert.equal(h.clockCalls, 0);
  assert.equal(h.connects, 0);
  assert.deepEqual(h.calls, []);
});

test("only genuine issuer instances authenticate for their exact configured grant boundary", () => {
  const h = harness(() => { throw new Error("not used"); });
  const otherBoundary = createInitialVerifiedCallbackGrantBoundary(runtime());
  const fake = {
    issueHandoff: h.issuer.issueHandoff,
    recoverHandoff: h.issuer.recoverHandoff,
  };
  assert.equal(isPostgresPanelSessionHandoffIssuerForBoundary(h.issuer, h.boundary), true);
  assert.equal(isPostgresPanelSessionHandoffIssuerForBoundary(h.issuer, otherBoundary), false);
  assert.equal(isPostgresPanelSessionHandoffIssuerForBoundary(fake, h.boundary), false);
  assert.equal(isPostgresPanelSessionHandoffIssuerForBoundary({ ...h.issuer }, h.boundary), false);
});

test("first creation uses a random candidate and sends only state/candidate digests to PostgreSQL", async () => {
  const h = harness((text, values) => {
    assert.equal(text, "SELECT outcome, authority FROM saas.create_panel_session_handoff($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)");
    assert.deepEqual(values.slice(0, 4), [STATE_DIGEST, HANDOFF_KEY_ID, credential().digest, SESSION_KEY_ID]);
    return { rows: [{ outcome: "handoff_created", authority: authority(values) }], rowCount: 1 };
  });
  const result = await h.withGrant((initialCallbackGrant) => h.issuer.issueHandoff({ rawState: RAW_STATE, initialCallbackGrant }));
  assert.equal(result.kind, "handoff_created");
  if (result.kind === "handoff_created") assert.equal(result.credential, credential().value);
  assert.equal(h.randomByteCalls, 1);
  assert.equal(JSON.stringify(h.calls).includes(RAW_STATE), false);
});

test("unredeemed recovery requires the exact retained candidate and persisted session key", async () => {
  const h = harness((text, values) => {
    if (text.includes("create_panel_session_handoff")) {
      return { rows: [{ outcome: "handoff_created", authority: authority(values) }], rowCount: 1 };
    }
    assert.equal(text, "SELECT outcome, authority FROM saas.recover_panel_session_handoff($1,$2,$3,$4,$5)");
    assert.deepEqual(values, [STATE_DIGEST, HANDOFF_KEY_ID, credential().digest, SESSION_KEY_ID, NOW]);
    return { rows: [{ outcome: "handoff_replayed", authority: authority([], credential()) }], rowCount: 1 };
  });
  const results = await h.withGrant(async (initialCallbackGrant) => {
    const created = await h.issuer.issueHandoff({ rawState: RAW_STATE, initialCallbackGrant });
    assert.equal(created.kind, "handoff_created");
    if (created.kind !== "handoff_created") throw new Error("missing candidate");
    return [created, await h.issuer.recoverHandoff({ rawState: RAW_STATE, candidateCredential: created.credential, initialCallbackGrant })] as const;
  });
  assert.equal(results[1].kind, "handoff_replayed");
  if (results[1].kind === "handoff_replayed") assert.equal(results[1].credential, results[0].credential);
});

test("mismatched candidate and redeemed Owner recovery expose no credential", async () => {
  for (const outcome of ["operation_mismatch", "operation_mismatch"] as const) {
    const h = harness(() => ({ rows: [{ outcome, authority: null }], rowCount: 1 }));
    const result = await h.withGrant((initialCallbackGrant) => h.issuer.recoverHandoff({
      rawState: RAW_STATE,
      candidateCredential: `h1.${HANDOFF_KEY_ID}.${Buffer.from(new Uint8Array(32).fill(0x7f)).toString("base64url")}`,
      initialCallbackGrant,
    }));
    assert.deepEqual(result, { kind: "operation_mismatch" });
    assert.equal("credential" in result, false);
  }
});

test("unknown creation COMMIT preserves and recovers only the retained random candidate inside the active grant", async () => {
  const h = harness((text, values) => text.includes("create_panel_session_handoff")
    ? { rows: [{ outcome: "handoff_created", authority: authority(values) }], rowCount: 1 }
    : { rows: [{ outcome: "handoff_replayed", authority: authority([], credential()) }], rowCount: 1 }, { commitFailure: true });
  const results = await h.withGrant(async (initialCallbackGrant) => {
    const unknown = await h.issuer.issueHandoff({ rawState: RAW_STATE, initialCallbackGrant });
    assert.deepEqual(unknown, { kind: "commit_unknown", credential: credential().value });
    return [unknown, await h.issuer.recoverHandoff({ rawState: RAW_STATE, candidateCredential: unknown.credential, initialCallbackGrant })] as const;
  });
  assert.equal(results[1].kind, "handoff_replayed");
  assert.deepEqual(h.releases, [true, undefined]);
  assert.equal(h.calls.some((call) => call.text === "ROLLBACK"), false);
});

test("issuer snapshots all mutable dependencies at construction", async () => {
  const h = harness((_text, values) => ({ rows: [{ outcome: "handoff_created", authority: authority(values) }], rowCount: 1 }));
  h.dependencies.pool = { async connect() { throw new Error("mutated pool"); } };
  h.dependencies.stateDigester = { digest() { throw new Error("mutated digester"); } };
  h.dependencies.handoffKeys.clear();
  h.handoffKey.fill(0xff);
  h.oldKey.fill(0xff);
  h.dependencies.activeHandoffKeyId = "mutated.active";
  h.dependencies.sessionTokenKeyId = "mutated.session";
  h.dependencies.clock = () => new Date("2030-01-01T00:00:00.000Z");
  h.dependencies.randomBytes = () => new Uint8Array(31);
  h.dependencies.randomUuid = () => "invalid";
  h.dependencies.timeouts.poolCheckoutMs = 0;
  h.dependencies.audit = () => { throw new Error("mutated audit"); };
  const result = await h.withGrant((initialCallbackGrant) => h.issuer.issueHandoff({ rawState: RAW_STATE, initialCallbackGrant }));
  assert.equal(result.kind, "handoff_created");
  assert.equal(h.connects, 1);
});

test("raw-state-only recovery API is absent and retained old candidates still verify", async () => {
  const h = harness(() => { throw new Error("must not query without a candidate"); });
  const result = await h.withGrant((initialCallbackGrant) => h.issuer.recoverHandoff({ rawState: RAW_STATE, initialCallbackGrant } as never));
  assert.deepEqual(result, { kind: "durable_authority_invalid" });
  assert.equal(h.connects, 0);
  assert.deepEqual(Object.keys(h.issuer).sort(), ["issueHandoff", "recoverHandoff"]);
});
