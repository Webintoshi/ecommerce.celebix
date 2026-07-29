import assert from "node:assert/strict";
import test from "node:test";

import { PANEL_BROWSER_BOOTSTRAP_URL, PANEL_OIDC_CALLBACK_URL } from "../../../../packages/platform-config/src/saas.ts";
import { createPersistentSelfServeRuntime, createSelfServeHttpActivationApproval } from "../self-serve-http/runtime.ts";
import { createPanelBrowserBindingAuthorityCodec } from "./credential-codec.ts";
import type { PanelBrowserBootstrapResult, PostgresPanelBrowserBindingRepository } from "./postgres-repository.ts";
import { createPanelBrowserBindingRegistrationStartExecutor } from "./start-executor.ts";

const NOW = new Date("2026-07-14T12:00:00.000Z");
const BOOTSTRAP_UUID = "123e4567-e89b-42d3-a456-426614174000";

function fixture(options: { repositoryKind?: PanelBrowserBootstrapResult["kind"]; providerUrlMutation?: (url: URL) => string } = {}) {
  let providerCalls = 0;
  let attemptSaves = 0;
  let exactProviderUrl = "";
  const runtime = createPersistentSelfServeRuntime({
    activationApproval: createSelfServeHttpActivationApproval("disposable_test"),
    registrationAttemptStore: {
      async save() { attemptSaves += 1; },
      async consume() { throw new Error("not used"); },
    },
    oidcTransactionStore: {
      async save() {}, async consume() { throw new Error("not used"); }, async discard() {},
    },
    registrationCompletion: {
      async recordVerifiedIdentity() { return { kind: "identity_recorded", status: "identity_verified", version: 2 } as const; },
      async resumeTenantCreation() { return { kind: "in_progress" } as const; },
      async reconcileUnknownCommit() { return { kind: "pending" } as const; },
    },
    consumedCallbackRecovery: { async classifyConsumedCallback() { return { kind: "missing" } as const; } },
    oidcProvider: {
      buildAuthorizationUrl(input) {
        providerCalls += 1;
        const url = new URL("https://identity.example.test/authorize?tenant=celebix");
        url.searchParams.set("state", input.state);
        url.searchParams.set("nonce", input.nonce);
        url.searchParams.set("code_challenge", input.codeChallenge);
        url.searchParams.set("code_challenge_method", input.codeChallengeMethod);
        url.searchParams.set("redirect_uri", input.redirectUri);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("response_mode", "query");
        exactProviderUrl = options.providerUrlMutation?.(url) ?? url.toString();
        return new URL(exactProviderUrl);
      },
      async verifyCallback() { throw new Error("not used"); },
    },
    requestGate: { async verify() { return "allowed" as const; } },
    clock: () => new Date(NOW), audit() {},
    bodyPolicy: { maximumBytes: 4_096, maximumCallbackQueryBytes: 2_048 },
    registrationOrigin: "https://ecommerce.celebix.co", callbackAuthority: PANEL_OIDC_CALLBACK_URL,
    panelOrigin: "https://panel.celebix.site", platformDomainSuffix: "celebix.site",
    providerAuthority: {
      issuer: "https://identity.example.test/oidc", audience: "customer-panel",
      authorizationOrigin: "https://identity.example.test",
    },
  });
  const codec = createPanelBrowserBindingAuthorityCodec({
    bootstrapKeys: new Map([["bootstrap", Buffer.alloc(32, 0x31)]]),
    activeBootstrapKeyId: "bootstrap",
    browserBindingKeys: new Map([["binding", Buffer.alloc(32, 0x32)]]),
    activeBrowserBindingKeyId: "binding",
    randomBytes: () => Buffer.alloc(32, 0x11),
  });
  const creates: unknown[] = [];
  const auditEvents: unknown[] = [];
  const stateDigester = { digest() { return "a".repeat(64); } };
  const repository: Pick<PostgresPanelBrowserBindingRepository, "createBootstrap"> = {
    async createBootstrap(input) {
      creates.push(structuredClone(input));
      const kind = options.repositoryKind ?? "browser_bootstrap_created";
      return kind === "browser_bootstrap_created" || kind === "browser_bootstrap_replayed"
        ? { kind, expiresAt: new Date(NOW.getTime() + 300_000).toISOString() }
        : { kind };
    },
  };
  const executor = createPanelBrowserBindingRegistrationStartExecutor({
    runtime,
    stateDigester,
    credentialCodec: codec,
    repository,
    panelBootstrapAuthority: PANEL_BROWSER_BOOTSTRAP_URL,
    clock: () => new Date(NOW),
    randomUuid: () => BOOTSTRAP_UUID,
    audit(event) { auditEvents.push(event); },
  });
  return {
    executor, creates, auditEvents, stateDigester, repository,
    get providerCalls() { return providerCalls; },
    get attemptSaves() { return attemptSaves; },
    get exactProviderUrl() { return exactProviderUrl; },
  };
}

const REGISTRATION = {
  storeName: "Verified Store", storeSlug: "verified-store",
  marketingConsent: false, privacyConsent: true,
};

test("calls genuine runtime once and creates a durable bootstrap for the exact returned provider URL", async () => {
  const current = fixture();
  const result = await current.executor.execute(REGISTRATION);
  assert.equal(current.providerCalls, 1);
  assert.equal(current.attemptSaves, 1);
  assert.equal(current.creates.length, 1);
  const created = current.creates[0] as Record<string, unknown>;
  assert.equal(created.providerAuthorizationUrl, current.exactProviderUrl);
  assert.equal(created.rawState, new URL(current.exactProviderUrl).searchParams.get("state"));
  assert.equal(created.bindingId, BOOTSTRAP_UUID);
  assert.deepEqual(result, {
    bootstrapCredential: `bs1.bootstrap.${Buffer.alloc(32, 0x11).toString("base64url")}`,
    providerAuthorizationUrl: current.exactProviderUrl,
    panelBootstrapAuthority: PANEL_BROWSER_BOOTSTRAP_URL,
    bootstrapExpiresAt: new Date(NOW.getTime() + 300_000).toISOString(),
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(result instanceof Response, false);
  assert.equal(JSON.stringify(current.auditEvents).includes(result.bootstrapCredential), false);
  assert.equal(JSON.stringify(current.auditEvents).includes(current.exactProviderUrl), false);
});

test("exact replay is accepted but commit_unknown and every other write uncertainty fail closed", async () => {
  const replay = fixture({ repositoryKind: "browser_bootstrap_replayed" });
  assert.equal((await replay.executor.execute(REGISTRATION)).providerAuthorizationUrl, replay.exactProviderUrl);
  for (const kind of ["commit_unknown", "unavailable", "operation_mismatch", "expired", "durable_authority_invalid"] as const) {
    const current = fixture({ repositoryKind: kind });
    await assert.rejects(() => current.executor.execute(REGISTRATION), /panel_browser_binding_start_unavailable/);
    assert.equal(current.creates.length, 1);
  }
});

test("rejects non-canonical or wrong redirect provider authority before durable bootstrap creation", async () => {
  for (const mutation of [
    (url: URL) => `${url.toString()}#fragment`,
    (url: URL) => { url.searchParams.set("redirect_uri", "https://attacker.example/callback"); return url.toString(); },
  ]) {
    const current = fixture({ providerUrlMutation: mutation });
    await assert.rejects(() => current.executor.execute(REGISTRATION), /panel_browser_binding_start_unavailable/);
    assert.equal(current.creates.length, 0);
  }
});

test("captures injected digest and repository methods against post-composition mutation", async () => {
  const current = fixture();
  current.stateDigester.digest = () => { throw new Error("mutated"); };
  current.repository.createBootstrap = async () => { throw new Error("mutated"); };
  assert.equal((await current.executor.execute(REGISTRATION)).providerAuthorizationUrl, current.exactProviderUrl);
});
