import { createPanelBrowserBindingAuthorityCodec } from "../../../apps/owner/lib/panel-browser-binding/credential-codec.ts";
import { createPersistentSelfServeRuntime, createSelfServeHttpActivationApproval } from "../../../apps/owner/lib/self-serve-http/runtime.ts";
import { createOwnerSelfServeAuthCompositionApproval } from "../../../apps/owner/lib/self-serve-auth-composition/activation.ts";
import { createDisabledOwnerSelfServeAuthComposition } from "../../../apps/owner/lib/self-serve-auth-composition/composition.ts";
import { createCustomerPanelAuthCompositionApproval } from "../../../apps/customer-panel/lib/panel-auth-composition/activation.ts";
import { createDisabledCustomerPanelAuthComposition } from "../../../apps/customer-panel/lib/panel-auth-composition/composition.ts";

export const NOW = new Date("2026-07-15T12:00:00.000Z");
export const OWNER_ORIGIN = "https://ecommerce.celebix.co";
export const REGISTER = `${OWNER_ORIGIN}/api/self-serve/register`;
export const BOOTSTRAP = "https://panel.celebix.site/auth/bootstrap";
export const CALLBACK = "https://panel.celebix.site/auth/callback";
const PROVIDER_ISSUER = "https://identity.example.test/oidc";
const PROVIDER_ORIGIN = "https://identity.example.test";
const AUDIENCE = "customer-panel";
const INTERNAL_SECRET = new Uint8Array(32).fill(0x35);
export const SESSION_CREDENTIAL = `v1.panel.active.${Buffer.alloc(32, 0x55).toString("base64url")}`;
const UUIDS = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
  "10000000-0000-4000-8000-000000000003",
  "10000000-0000-4000-8000-000000000004",
  "10000000-0000-4000-8000-000000000005",
];

function withUrl(response, url) {
  Object.defineProperty(response, "url", { configurable: true, value: url });
  return response;
}

export function decodeBridgeForm(html) {
  const decode = (value) => value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
  const fields = [...html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)];
  if (fields.length !== 2) throw new Error("bridge_form_invalid");
  return Object.freeze({
    bootstrapCredential: decode(fields[0][2]),
    providerAuthorizationUrl: decode(fields[1][2]),
  });
}

export function cookieValue(response, name) {
  const cookie = response.headers.getSetCookie().find((value) => value.startsWith(`${name}=`));
  if (!cookie) throw new Error("cookie_missing");
  return cookie.slice(name.length + 1, cookie.indexOf(";"));
}

export function composeApprovedStagingFlow() {
  const counts = {
    gate: 0,
    registration: 0,
    bootstrapCreate: 0,
    bind: 0,
    claim: 0,
    provider: 0,
    issuer: 0,
    redeemer: 0,
    recovery: 0,
    sessions: 0,
    external: 0,
    ownerBindingRoute: 0,
    ownerCallbackRoute: 0,
  };
  let transaction;
  let attempt;
  let ownerRoutes;
  const browserAuthority = { version: 0, state: "", bootstrap: "", provider: "", binding: "" };
  const runtime = createPersistentSelfServeRuntime({
    activationApproval: createSelfServeHttpActivationApproval("approved_staging"),
    registrationAttemptStore: {
      async save(value) { counts.registration += 1; attempt = structuredClone(value); },
      async consume(state) {
        if (!attempt || attempt.state !== state) throw new Error("attempt_missing");
        return structuredClone(attempt);
      },
    },
    oidcTransactionStore: {
      async save(value) { transaction = structuredClone(value); },
      async consume(state) {
        if (!transaction || transaction.state !== state) throw new Error("transaction_missing");
        const value = structuredClone(transaction);
        transaction = undefined;
        return value;
      },
      async discard(state) { if (transaction?.state === state) transaction = undefined; },
    },
    registrationCompletion: {
      async recordVerifiedIdentity() { return { kind: "identity_recorded", status: "identity_verified", version: 2 }; },
      async resumeTenantCreation() {
        return {
          kind: "tenant_created",
          result: {
            store: { slug: "verified-store" },
            storefrontUrl: "https://verified-store.celebix.site",
            panelUrl: "https://panel.celebix.site",
            operationId: "operation",
            replayed: false,
          },
        };
      },
      async reconcileUnknownCommit() { return { kind: "pending" }; },
    },
    consumedCallbackRecovery: { async classifyConsumedCallback() { return { kind: "missing" }; } },
    oidcProvider: {
      buildAuthorizationUrl(input) {
        const url = new URL(`${PROVIDER_ORIGIN}/authorize`);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("response_mode", "query");
        url.searchParams.set("state", input.state);
        url.searchParams.set("nonce", input.nonce);
        url.searchParams.set("code_challenge", input.codeChallenge);
        url.searchParams.set("code_challenge_method", input.codeChallengeMethod);
        url.searchParams.set("redirect_uri", input.redirectUri);
        return url;
      },
      async verifyCallback(input) {
        counts.provider += 1;
        return {
          issuer: PROVIDER_ISSUER,
          subject: "subject_1",
          audience: [AUDIENCE],
          nonce: input.expectedNonce,
          email: "owner@example.test",
          emailVerified: true,
        };
      },
    },
    requestGate: { async verify() { counts.gate += 1; return "allowed"; } },
    clock: () => new Date(NOW),
    audit: () => undefined,
    bodyPolicy: { maximumBytes: 4_096, maximumCallbackQueryBytes: 8_192 },
    registrationOrigin: OWNER_ORIGIN,
    callbackAuthority: CALLBACK,
    panelOrigin: "https://panel.celebix.site",
    platformDomainSuffix: "celebix.site",
    providerAuthority: { issuer: PROVIDER_ISSUER, audience: AUDIENCE, authorizationOrigin: PROVIDER_ORIGIN },
  });
  const codec = createPanelBrowserBindingAuthorityCodec({
    bootstrapKeys: new Map([["bootstrap.active", new Uint8Array(32).fill(0x41)]]),
    activeBootstrapKeyId: "bootstrap.active",
    browserBindingKeys: new Map([["binding.active", new Uint8Array(32).fill(0x42)]]),
    activeBrowserBindingKeyId: "binding.active",
    randomBytes: (size) => new Uint8Array(size).fill(0x43),
  });
  const repository = {
    async createBootstrap(input) {
      counts.bootstrapCreate += 1;
      if (browserAuthority.version !== 0) return { kind: "operation_mismatch" };
      Object.assign(browserAuthority, {
        version: 1,
        state: input.rawState,
        bootstrap: input.bootstrapCredential,
        provider: input.providerAuthorizationUrl,
      });
      return { kind: "browser_bootstrap_created", expiresAt: input.expiresAt.toISOString() };
    },
    async bindBrowserCredential(input) {
      counts.bind += 1;
      if (
        browserAuthority.version !== 1 || input.bootstrapCredential !== browserAuthority.bootstrap ||
        input.providerAuthorizationUrl !== browserAuthority.provider
      ) return { kind: "unauthenticated" };
      browserAuthority.version = 2;
      browserAuthority.binding = input.browserBindingCredential;
      return {
        kind: "browser_binding_created",
        providerAuthorizationUrl: browserAuthority.provider,
        expiresAt: input.expiresAt.toISOString(),
      };
    },
    async claimCallback(input) {
      counts.claim += 1;
      if (browserAuthority.version === 3 && input.rawState === browserAuthority.state) return { kind: "callback_replayed" };
      if (
        browserAuthority.version !== 2 || input.rawState !== browserAuthority.state ||
        input.browserBindingCredential !== browserAuthority.binding
      ) return { kind: "unauthenticated" };
      browserAuthority.version = 3;
      return { kind: "browser_callback_claimed" };
    },
    async cleanupExpired() { return { kind: "cleaned", count: 0 }; },
  };
  let uuidIndex = 0;
  let createValues;
  const handoffAuthority = (values) => ({
    handoffId: String((createValues ?? values)[4] ?? UUIDS[1]),
    attemptId: "attempt_0123456789abcdef",
    tenantOperationId: "20000000-0000-4000-8000-000000000001",
    principalId: UUIDS[2],
    activeStoreId: UUIDS[3],
    sessionOperationId: String((createValues ?? values)[5] ?? UUIDS[2]),
    sessionId: String((createValues ?? values)[6] ?? UUIDS[3]),
    familyId: String((createValues ?? values)[7] ?? UUIDS[4]),
    tokenKeyId: String(values[1]),
    tokenDigest: String(values[2]),
    sessionTokenKeyId: String(values[3]),
    issuedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 600_000).toISOString(),
    sessionExpiresAt: new Date(NOW.getTime() + 28_800_000).toISOString(),
  });
  const owner = createDisabledOwnerSelfServeAuthComposition({
    activationApproval: createOwnerSelfServeAuthCompositionApproval("approved_staging"),
    runtime,
    stateDigester: { digest() { return "a".repeat(64); } },
    browserBindingCredentialCodec: codec,
    browserBindingRepository: repository,
    ownerInternalOrigin: OWNER_ORIGIN,
    browserBindingInternalKeys: new Map([["active", INTERNAL_SECRET]]),
    sessionCompletionInternalKeys: new Map([["active", INTERNAL_SECRET]]),
    browserBindingMaximumBodyBytes: 16_384,
    sessionCompletionMaximumBodyBytes: 16_384,
    clock: () => new Date(NOW),
    randomUuid: () => UUIDS[uuidIndex++] ?? UUIDS.at(-1),
    randomNonceBytes: (size) => new Uint8Array(size).fill(0x44),
    handoffIssuer: {
      pool: {
        async connect() {
          return {
            async query(text, values = []) {
              if (/^BEGIN|^COMMIT$|^ROLLBACK$|set_config|SET LOCAL ROLE/.test(text)) return { rows: [], rowCount: 0 };
              if (text.includes("create_panel_session_handoff")) {
                counts.issuer += 1;
                createValues = values;
                return { rows: [{ outcome: "handoff_created", authority: handoffAuthority(values) }], rowCount: 1 };
              }
              return { rows: [{ outcome: "handoff_replayed", authority: handoffAuthority(values) }], rowCount: 1 };
            },
            release() {},
          };
        },
      },
      handoffKeys: new Map([["handoff.active", new Uint8Array(32).fill(0x45)]]),
      activeHandoffKeyId: "handoff.active",
      sessionTokenKeyId: "panel.active",
      randomBytes: (size) => new Uint8Array(size).fill(0x46),
      timeouts: { poolCheckoutMs: 1_000, statementMs: 1_000, lockMs: 1_000, idleTransactionMs: 1_000 },
      audit: () => undefined,
    },
    bridgeAudit: () => undefined,
    browserBindingStartAudit: () => undefined,
    browserBindingGatewayAudit: () => undefined,
    initialCallbackAudit: () => undefined,
    sessionHandoffGatewayAudit: () => undefined,
  });
  const fetch = async (request) => {
    const url = new URL(request.url);
    let response;
    if (url.pathname === "/api/internal/self-serve/browser-binding") {
      counts.ownerBindingRoute += 1;
      response = ownerRoutes
        ? await ownerRoutes.internalBrowserBinding(request)
        : await owner.browserBindingInternalGateway(request);
    } else if (url.pathname === "/api/internal/self-serve/oidc-callback") {
      counts.ownerCallbackRoute += 1;
      response = ownerRoutes
        ? await ownerRoutes.internalCallback(request)
        : await owner.sessionHandoffInternalGateway(request);
    } else {
      counts.external += 1;
      throw new Error("external_network_forbidden");
    }
    return withUrl(response, request.url);
  };
  const sessionAuthority = Object.freeze({
    sessionId: UUIDS[3], familyId: UUIDS[4], principalId: UUIDS[2], activeStoreId: UUIDS[3], version: 1,
    issuedAt: NOW.toISOString(), rotatedAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 28_800_000).toISOString(),
  });
  const customer = createDisabledCustomerPanelAuthComposition({
    activationApproval: createCustomerPanelAuthCompositionApproval("approved_staging"),
    ownerInternalOrigin: OWNER_ORIGIN,
    randomBytes: (size) => new Uint8Array(size).fill(0x47),
    clock: () => new Date(NOW),
    fetch,
    browserBinding: {
      activeKeyId: "active", activeSecret: INTERNAL_SECRET, maximumBodyBytes: 16_384,
      deadlineMs: 1_000, maximumResponseBytes: 4_096, transportAudit: () => undefined, handlerAudit: () => undefined,
    },
    sessionCompletion: {
      activeKeyId: "active", activeSecret: INTERNAL_SECRET, maximumQueryBytes: 8_192,
      deadlineMs: 1_000, maximumResponseBytes: 4_096, transportAudit: () => undefined, handlerAudit: () => undefined,
    },
    handoffRedeemer: {
      async redeemHandoff() {
        counts.redeemer += 1;
        counts.sessions += 1;
        return Object.freeze({ kind: "session_issued", credential: SESSION_CREDENTIAL, session: sessionAuthority });
      },
      async recoverRedemption() {
        counts.recovery += 1;
        return Object.freeze({ kind: "session_replayed", credential: SESSION_CREDENTIAL, session: sessionAuthority });
      },
    },
  });
  return {
    owner,
    customer,
    counts,
    browserAuthority,
    mountOwnerRoutes(routeSet) { ownerRoutes = routeSet; },
  };
}
