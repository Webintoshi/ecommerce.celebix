import assert from "node:assert/strict";
import test from "node:test";

import { canUseTenantFeature } from "../../apps/customer-panel/lib/tenant-context.ts";
import { resolvePanelTenantContext } from "../../apps/customer-panel/lib/panel-access.ts";
import {
  createDisabledPanelOidcCallbackHandler,
  createPanelOidcCallbackHandler,
  recoverPanelRegistration,
} from "../../apps/customer-panel/lib/registration-completion.ts";
import { CUSTOMER_PANEL_AUTH_ENABLED } from "../../apps/customer-panel/lib/config.ts";
import { InMemoryPanelSessionStore } from "../../apps/customer-panel/lib/session.ts";
import { createStorefrontRequestHandler } from "../../apps/storefront-shared/lib/storefront-app.ts";
import { buildCreateStarterTenantInput } from "../../apps/owner/lib/self-serve-identity.ts";
import {
  InMemoryOidcTransactionStore,
  beginOidcAuthorization,
  completeOidcCallback,
  type OidcAuthorizationRequest,
  type OidcProviderCallbackInput,
} from "../../apps/owner/lib/self-serve-oidc.ts";
import {
  SELF_SERVE_SAAS_REGISTRATION_ENABLED,
  beginSelfServeRegistration,
} from "../../apps/owner/lib/self-serve-registration-orchestrator.ts";
import { PANEL_OIDC_CALLBACK_URL } from "../../packages/platform-config/src/saas.ts";
import type { CreateStarterTenantInput } from "@celebix/saas-contracts";
import { createCanonicalTenantFingerprint } from "@celebix/saas-data";
import { createInMemorySaaSDataRepository } from "@celebix/saas-data/testing";
import {
  InMemoryStoreDomainResolver,
  StorefrontResolutionError,
  buildStoreCacheKey,
  buildStoreCacheTag,
  buildStoreJobKey,
  buildStoreObjectKey,
  resolveStorefrontRequestContext,
} from "@celebix/saas-storefront-runtime";
import { createStarterTenantService } from "@celebix/saas-tenant-core";

import { SharedInMemoryRegistrationWorkflowStore } from "./workflow-store.ts";

const NOW = new Date("2026-07-11T10:00:00.000Z");
const ISSUER = "https://identity.example.test";
const AUDIENCE = "celebix-customer-panel";

function fakeProvider(calls?: { verify: number }) {
  return {
    buildAuthorizationUrl(input: OidcAuthorizationRequest) {
      const url = new URL(`${ISSUER}/authorize`);
      url.searchParams.set("state", input.state);
      url.searchParams.set("nonce", input.nonce);
      url.searchParams.set("code_challenge", input.codeChallenge);
      url.searchParams.set("code_challenge_method", input.codeChallengeMethod);
      url.searchParams.set("redirect_uri", input.redirectUri);
      url.searchParams.set("response_type", "code");
      return url;
    },
    async verifyCallback(input: OidcProviderCallbackInput) {
      if (calls) calls.verify += 1;
      assert.equal(input.redirectUri, PANEL_OIDC_CALLBACK_URL);
      return {
        issuer: input.expectedIssuer,
        subject: "subject_phase1_owner",
        audience: [input.expectedAudience],
        nonce: input.expectedNonce,
        email: "owner@phase1.example.test",
        emailVerified: true,
      };
    },
  };
}

function registration() {
  return {
    firstName: "Atlas",
    lastName: "Test",
    storeName: "Phase One Store",
    storeSlug: "phase-one-store",
    phone: "+905551112233",
    email: "browser-input-is-not-authority@example.test",
    password: "NeverCrossBoundary123",
    marketingConsent: false,
    privacyConsent: true,
  };
}

test("complete disposable Phase 1 flow is exact, idempotent, tenant-scoped, and fail-closed", async () => {
  const workflowStore = new SharedInMemoryRegistrationWorkflowStore();
  const oidcTransactions = new InMemoryOidcTransactionStore();
  const providerCalls = { verify: 0 };
  const provider = fakeProvider(providerCalls);
  const repository = createInMemorySaaSDataRepository();
  const tenantCore = createStarterTenantService({ repository });
  const sessions = new InMemoryPanelSessionStore();

  const started = await beginSelfServeRegistration({
    enabled: true,
    registration: registration(),
    attemptStore: workflowStore,
    now: () => NOW,
    oidc: {
      async begin({ returnTo }) {
        return beginOidcAuthorization({
          provider,
          transactionStore: oidcTransactions,
          redirectUri: PANEL_OIDC_CALLBACK_URL,
          returnTo,
          expectedIssuer: ISSUER,
          expectedAudience: AUDIENCE,
          expectedAuthorizationOrigin: ISSUER,
          now: () => NOW,
        });
      },
      async cancel(state) {
        await oidcTransactions.discard(state);
      },
    },
  });
  assert.equal(started.ok, true);
  if (!started.ok) return;

  const state = new URL(started.authorizationUrl).searchParams.get("state");
  assert.ok(state);
  const ownerAttempt = await workflowStore.findByState(state, NOW);
  assert.ok(ownerAttempt);
  assert.equal(ownerAttempt.requestedAt, NOW.toISOString());
  assert.equal(JSON.stringify(ownerAttempt).includes(registration().password), false);
  assert.equal(JSON.stringify(ownerAttempt).includes(registration().email), false);

  let canonicalInput: CreateStarterTenantInput | undefined;
  let tenantCoreCalls = 0;
  const callback = createPanelOidcCallbackHandler({
    enabled: true,
    completionStore: workflowStore,
    panelSessionStore: sessions,
    cookiePolicy: { kind: "production" },
    now: () => NOW,
    oidc: {
      async complete(input) {
        const completed = await completeOidcCallback({
          provider,
          transactionStore: oidcTransactions,
          callback: input,
          now: () => NOW,
        });
        return completed.identity;
      },
    },
    async buildTenantInput(identity, attempt) {
      const built = await buildCreateStarterTenantInput(
        {
          ...identity,
          audience: [AUDIENCE],
          nonce: "verified-by-provider",
        },
        attempt.details,
        {
          idempotencyKey: attempt.idempotencyKey,
          requestedAt: attempt.requestedAt,
        },
      );
      if (built.ok) canonicalInput = structuredClone(built.input);
      return built;
    },
    tenantCoreClient: {
      async createStarterTenant(input) {
        tenantCoreCalls += 1;
        return tenantCore.execute(input);
      },
    },
  });

  const callbackResponse = await callback(new Request(
    `${PANEL_OIDC_CALLBACK_URL}?state=${encodeURIComponent(state)}&code=verified-code`,
  ));
  assert.equal(callbackResponse.status, 303);
  assert.equal(callbackResponse.headers.get("location"), "https://panel.celebix.site/");
  assert.ok(canonicalInput);
  assert.equal(canonicalInput.requestedAt, ownerAttempt.requestedAt);
  assert.equal(canonicalInput.principal.email, "owner@phase1.example.test");
  assert.equal(JSON.stringify(canonicalInput).includes(registration().password), false);

  const completedAttempt = await workflowStore.findById(ownerAttempt.id, NOW);
  assert.equal(completedAttempt?.status, "session_created");
  assert.deepEqual(completedAttempt?.tenantInputSnapshot, canonicalInput);
  assert.equal(
    completedAttempt?.canonicalFingerprint,
    createCanonicalTenantFingerprint(canonicalInput),
  );
  assert.equal(tenantCoreCalls, 1);
  assert.equal(providerCalls.verify, 1);

  const callbackReplay = await callback(new Request(
    `${PANEL_OIDC_CALLBACK_URL}?state=${encodeURIComponent(state)}&code=verified-code`,
  ));
  assert.equal(callbackReplay.status, 409);
  assert.deepEqual(await callbackReplay.json(), { code: "invalid_callback_state" });
  assert.equal(callbackReplay.headers.has("set-cookie"), false);
  assert.equal(callbackReplay.headers.has("location"), false);
  assert.equal(providerCalls.verify, 1);
  assert.equal(tenantCoreCalls, 1);

  const stateAfterCreate = repository.inspectState();
  assert.equal(stateAfterCreate.principals.length, 1);
  assert.equal(stateAfterCreate.stores.length, 1);
  assert.equal(stateAfterCreate.domains.length, 1);
  assert.equal(stateAfterCreate.memberships.length, 1);
  assert.equal(stateAfterCreate.subscriptions.length, 1);
  assert.equal(stateAfterCreate.operations.length, 1);
  assert.equal(stateAfterCreate.operations[0]?.status, "committed");
  assert.equal(stateAfterCreate.domains[0]?.hostname, "phase-one-store.celebix.site");

  const cookie = callbackResponse.headers.get("set-cookie") ?? "";
  const sessionId = cookie.match(/^__Host-celebix_panel=([^;]+)/)?.[1];
  assert.ok(sessionId);
  const session = await sessions.read(sessionId);
  assert.ok(session);

  const tenantResult = completedAttempt?.tenantResult;
  assert.ok(tenantResult);
  const panelContext = await resolvePanelTenantContext({
    requestId: "request_panel_phase1",
    session,
    dataPort: {
      async getMemberships() { return stateAfterCreate.memberships; },
      async getPrincipalAuthority(principalId) {
        const principal = stateAfterCreate.principals.find((entry) => entry.id === principalId);
        return principal ? { issuer: principal.issuer, subject: principal.subject } : null;
      },
      async getStore(storeId) {
        const store = stateAfterCreate.stores.find((entry) => entry.id === storeId);
        return store
          ? { id: store.id, slug: store.slug, status: store.status, locale: store.locale }
          : null;
      },
      async getEntitlements(storeId) {
        return storeId === tenantResult.store.id ? tenantResult.plan : null;
      },
      async getResolvedHost(storeId) {
        return storeId === tenantResult.store.id ? tenantResult.primaryDomain : null;
      },
    },
  });
  assert.equal(panelContext.ok, true);
  if (!panelContext.ok) return;
  assert.equal(panelContext.context.store.id, tenantResult.store.id);
  assert.equal(canUseTenantFeature(panelContext.context, "catalog"), true);
  assert.equal(canUseTenantFeature(panelContext.context, "unknown_injected_feature"), false);

  const resolver = new InMemoryStoreDomainResolver([
    { host: tenantResult.primaryDomain, storeStatus: tenantResult.store.status },
  ]);
  const storefrontContext = await resolveStorefrontRequestContext({
    requestId: "request_storefront_phase1",
    trustedHost: tenantResult.primaryDomain.hostname,
    resolver,
    async loadStorefrontStore(storeId) {
      const store = stateAfterCreate.stores.find((entry) => entry.id === storeId);
      return store ? { ...store, entitlements: tenantResult.plan } : null;
    },
  });
  assert.equal(storefrontContext instanceof StorefrontResolutionError, false);
  if (storefrontContext instanceof StorefrontResolutionError) return;
  assert.equal(storefrontContext.store.id, panelContext.context.store.id);
  assert.equal(storefrontContext.store.slug, panelContext.context.store.slug);
  assert.equal(storefrontContext.resolvedHost.canonicalHostname, "phase-one-store.celebix.site");
  assert.match(buildStoreCacheKey(tenantResult.store.id, "catalog", "products", 1), /^celebix:store_/);
  assert.match(buildStoreCacheTag(tenantResult.store.id, "products", 1), /^store:store_/);
  assert.match(buildStoreJobKey(tenantResult.store.id, "catalog", "sync"), /^store:store_/);
  assert.match(buildStoreObjectKey(tenantResult.store.id, "media", "products/hero.jpg"), /^stores\/store_/);

  const replay = await tenantCore.execute(structuredClone(canonicalInput));
  assert.equal(replay.ok, true);
  if (replay.ok) assert.equal(replay.value.replayed, true);
  const afterReplay = repository.inspectState();
  assert.equal(afterReplay.stores.length, 1);
  assert.equal(afterReplay.memberships.length, 1);
  assert.equal(afterReplay.subscriptions.length, 1);
  assert.equal(afterReplay.operations.length, 1);

  const mismatch = await tenantCore.execute({
    ...canonicalInput,
    store: { ...canonicalInput.store, name: "Mutated Under Same Key" },
  });
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) assert.equal(mismatch.error.code, "idempotency_mismatch");

  const deniedRecovery = await recoverPanelRegistration({
    attemptId: ownerAttempt.id,
    completionStore: workflowStore,
    panelSessionStore: sessions,
    buildTenantInput: async () => ({ ok: true, input: canonicalInput }),
    tenantCoreClient: { createStarterTenant: (input) => tenantCore.execute(input) },
    now: () => NOW,
    authority: {
      kind: "verified_identity",
      identity: {
        issuer: ISSUER,
        subject: "different-subject",
        email: "attacker@example.test",
        emailVerified: true,
      },
    },
  });
  assert.equal(deniedRecovery.ok, false);
  if (!deniedRecovery.ok) assert.equal(deniedRecovery.code, "registration_recovery_denied");

  const hostMismatch = await resolveStorefrontRequestContext({
    requestId: "request_host_mismatch",
    trustedHost: tenantResult.primaryDomain.hostname,
    resolver,
    async loadStorefrontStore() {
      return {
        ...stateAfterCreate.stores[0],
        id: "store_wrong",
        entitlements: tenantResult.plan,
      };
    },
  });
  assert.ok(hostMismatch instanceof StorefrontResolutionError);
  if (hostMismatch instanceof StorefrontResolutionError) {
    assert.equal(hostMismatch.code, "host_store_mismatch");
  }

  const unknownHost = await resolveStorefrontRequestContext({
    requestId: "request_unknown_host",
    trustedHost: "unknown.celebix.site",
    resolver,
    async loadStorefrontStore() { throw new Error("must not use a default tenant"); },
  });
  assert.ok(unknownHost instanceof StorefrontResolutionError);
  if (unknownHost instanceof StorefrontResolutionError) assert.equal(unknownHost.code, "host_not_found");

  assert.equal(SELF_SERVE_SAAS_REGISTRATION_ENABLED, false);
  assert.equal(CUSTOMER_PANEL_AUTH_ENABLED, false);
  assert.equal((await createDisabledPanelOidcCallbackHandler()(new Request(PANEL_OIDC_CALLBACK_URL))).status, 503);
  assert.deepEqual(
    await createStorefrontRequestHandler()({
      requestId: "request_disabled_storefront",
      pathname: "/",
      headers: new Headers({ host: tenantResult.primaryDomain.hostname }),
    }),
    {
      kind: "host_not_configured",
      status: 503,
      title: "Storefront unavailable",
      message: "This shared storefront runtime is not configured.",
    },
  );
});
