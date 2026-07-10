import assert from "node:assert/strict";
import test from "node:test";

import type { CreateStarterTenantInput, CreateStarterTenantResult } from "@celebix/saas-contracts";
import type { PanelSession } from "./session";
import type {
  PanelVerifiedIdentity,
  RegistrationCompletionStore,
  StoredRegistrationAttempt,
} from "./registration-completion";

type CompletionModule = typeof import("./registration-completion");
const completions = await import(new URL("./registration-completion.ts", import.meta.url).href).catch(
  () => ({} as Partial<CompletionModule>),
);

const NOW = new Date("2026-07-11T10:00:00.000Z");
const identity: PanelVerifiedIdentity = {
  issuer: "https://identity.example.test/oidc",
  subject: "subject_123",
  email: "owner@example.test",
  emailVerified: true,
};

function attempt(overrides: Partial<StoredRegistrationAttempt> = {}): StoredRegistrationAttempt {
  return {
    id: "attempt_1234567890abcdefghijklmnop",
    state: "state_1234567890abcdefghijklmnopqr",
    details: {
      storeName: "Çiçek Pazarı",
      storeSlug: "cicek-pazari",
      locale: "tr",
      currency: "TRY",
      themeKey: "starter",
      privacyAcceptedAt: "2026-07-11T09:59:00.000Z",
    },
    idempotencyKey: "ssik_1234567890abcdefghijklmnopqr",
    canonicalFingerprint: "fingerprint:cicek-pazari",
    status: "awaiting_identity",
    createdAt: "2026-07-11T09:59:00.000Z",
    expiresAt: "2026-07-11T10:09:00.000Z",
    ...overrides,
  };
}

function tenantResult(): CreateStarterTenantResult {
  return {
    schemaVersion: 1,
    operationId: "operation_1",
    replayed: false,
    store: { id: "store_1", slug: "cicek-pazari", status: "active" },
    primaryDomain: {
      schemaVersion: 1,
      hostname: "cicek-pazari.celebix.site",
      domainId: "domain_1",
      domainType: "platform_subdomain",
      storeId: "store_1",
      storeSlug: "cicek-pazari",
      canonicalHostname: "cicek-pazari.celebix.site",
      status: "active",
      cacheVersion: 1,
    },
    membership: {
      schemaVersion: 1,
      id: "membership_1",
      principalId: "principal_1",
      storeId: "store_1",
      role: "store_owner",
      status: "active",
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    },
    plan: {
      schemaVersion: 1,
      planId: "plan_free",
      planCode: "free_starter",
      version: 1,
      status: "active",
      features: ["catalog"],
      limits: { products: 100, staff: 1, storageBytes: 1_000_000_000 },
      validFrom: NOW.toISOString(),
    },
    provisioningStatus: "ready",
    panelUrl: "https://panel.celebix.site",
    storefrontUrl: "https://cicek-pazari.celebix.site",
  };
}

function tenantInput(key: string): CreateStarterTenantInput {
  return {
    schemaVersion: 1,
    idempotencyKey: key,
    principal: { issuer: identity.issuer, subject: identity.subject, email: identity.email, emailVerified: true },
    store: { name: "Çiçek Pazarı", slug: "cicek-pazari", locale: "tr", currency: "TRY", themeKey: "starter" },
    consents: { privacyAcceptedAt: "2026-07-11T09:59:00.000Z" },
    requestedAt: NOW.toISOString(),
  };
}

class RecordingSessionStore {
  sessions = new Map<string, PanelSession>();
  failCreates = 0;

  async create(session: PanelSession) {
    if (this.failCreates > 0) {
      this.failCreates -= 1;
      throw new Error("session unavailable");
    }
    if (this.sessions.has(session.id)) throw new Error("panel_session_conflict");
    this.sessions.set(session.id, structuredClone(session));
  }
  async read(id: string) { return structuredClone(this.sessions.get(id) ?? null); }
  async rotate() { throw new Error("unused"); }
  async destroy(id: string) { this.sessions.delete(id); }
}

function dependencies(store: RegistrationCompletionStore, sessions = new RecordingSessionStore()) {
  let tenantCalls = 0;
  return {
    sessions,
    get tenantCalls() { return tenantCalls; },
    input: {
      completionStore: store,
      panelSessionStore: sessions,
      buildTenantInput: async (_identity: PanelVerifiedIdentity, _details: unknown, idempotencyKey: string) => ({
        ok: true as const,
        input: tenantInput(idempotencyKey),
      }),
      tenantCoreClient: {
        async createStarterTenant(input: CreateStarterTenantInput) {
          tenantCalls += 1;
          assert.equal(input.idempotencyKey, attempt().idempotencyKey);
          return { ok: true as const, value: tenantResult() };
        },
      },
      now: () => NOW,
    },
  };
}

test("exports panel-owned registration completion and recovery", () => {
  assert.equal(typeof completions.InMemoryRegistrationCompletionStore, "function");
  assert.equal(typeof completions.completePanelRegistration, "function");
  assert.equal(typeof completions.recoverPanelRegistration, "function");
  assert.equal(typeof completions.createPanelOidcCallbackHandler, "function");
});

test("completion store rejects one state being bound to two attempts", async () => {
  if (!completions.InMemoryRegistrationCompletionStore) return;
  const store = new completions.InMemoryRegistrationCompletionStore([attempt()]);
  await assert.rejects(
    () => store.save(attempt({ id: "attempt_other_1234567890abcdefghij" })),
    /registration_state_conflict/,
  );
});

test("completion store rejects immutable authority changes and status regression", async () => {
  if (!completions.InMemoryRegistrationCompletionStore) return;
  const verified = attempt({
    status: "identity_verified",
    verifiedPrincipal: { issuer: identity.issuer, subject: identity.subject },
  });
  const store = new completions.InMemoryRegistrationCompletionStore([verified]);
  await assert.rejects(
    () => store.update({
      ...verified,
      verifiedPrincipal: { issuer: identity.issuer, subject: "attacker" },
    }),
    /registration_attempt_immutable_field_changed/,
  );

  const tenantCreated = attempt({
    ...verified,
    status: "tenant_created",
    tenantOperation: {
      operationId: "operation_1",
      principalId: "principal_1",
      storeId: "store_1",
      provisioningStatus: "ready",
    },
  });
  const tenantStore = new completions.InMemoryRegistrationCompletionStore([tenantCreated]);
  await assert.rejects(
    () => tenantStore.update({ ...tenantCreated, status: "identity_verified" }),
    /registration_attempt_status_invalid/,
  );
});

test("callback normalizes non-empty state/code and checks attempt before provider verification", async () => {
  if (!completions.InMemoryRegistrationCompletionStore || !completions.createPanelOidcCallbackHandler) return;
  const store = new completions.InMemoryRegistrationCompletionStore([attempt()]);
  const deps = dependencies(store);
  let providerCalls = 0;
  const handler = completions.createPanelOidcCallbackHandler({
    enabled: true,
    ...deps.input,
    oidc: { async complete() { providerCalls += 1; return identity; } },
    cookiePolicy: { kind: "production" },
  });

  for (const url of [
    "https://panel.celebix.site/auth/callback?state=%20&code=code",
    "https://panel.celebix.site/auth/callback?state=state&code=%20",
    "https://panel.celebix.site/auth/callback?state=missing_1234567890abcdefgh&code=code",
  ]) {
    const response = await handler(new Request(url));
    assert.equal(response.status, 400);
  }
  assert.equal(providerCalls, 0);
});

test("panel callback completes tenant creation, persists session, and emits only the shared panel cookie", async () => {
  if (!completions.InMemoryRegistrationCompletionStore || !completions.createPanelOidcCallbackHandler) return;
  const store = new completions.InMemoryRegistrationCompletionStore([attempt()]);
  const deps = dependencies(store);
  const handler = completions.createPanelOidcCallbackHandler({
    enabled: true,
    ...deps.input,
    oidc: { async complete(callback: { state: string; code: string }) { assert.equal(callback.code, "valid-code"); return identity; } },
    cookiePolicy: { kind: "production" },
  });
  const response = await handler(new Request(
    `https://panel.celebix.site/auth/callback?state=${attempt().state}&code=%20valid-code%20`,
  ));

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "https://panel.celebix.site/");
  const cookie = response.headers.get("set-cookie") ?? "";
  assert.match(cookie, /^__Host-celebix_panel=/);
  assert.match(cookie, /Secure/);
  assert.equal(cookie.includes("operation_1"), false);
  assert.equal(deps.tenantCalls, 1);
  assert.equal(deps.sessions.sessions.size, 1);
  assert.equal((await store.findById(attempt().id, NOW))?.status, "session_created");
});

test("session failure preserves tenant_created and matching verified recovery never calls TenantCore twice", async () => {
  if (!completions.InMemoryRegistrationCompletionStore || !completions.completePanelRegistration || !completions.recoverPanelRegistration) return;
  const store = new completions.InMemoryRegistrationCompletionStore([attempt()]);
  const sessions = new RecordingSessionStore();
  sessions.failCreates = 1;
  const deps = dependencies(store, sessions);

  const first = await completions.completePanelRegistration({ ...deps.input, attemptId: attempt().id, identity });
  assert.equal(first.ok, false);
  if (!first.ok) assert.equal(first.retryable, true);
  assert.equal((await store.findById(attempt().id, NOW))?.status, "tenant_created");
  assert.equal(deps.tenantCalls, 1);

  const recovered = await completions.recoverPanelRegistration({
    ...deps.input,
    attemptId: attempt().id,
    authority: { kind: "verified_identity", identity },
  });
  assert.equal(recovered.ok, true);
  assert.equal(deps.tenantCalls, 1);
  assert.equal(sessions.sessions.size, 1);

  const replay = await completions.recoverPanelRegistration({
    ...deps.input,
    attemptId: attempt().id,
    authority: { kind: "authenticated_principal", principal: { id: "principal_1", issuer: identity.issuer, subject: identity.subject } },
  });
  assert.equal(replay.ok, true);
  assert.equal(deps.tenantCalls, 1);
  assert.equal(sessions.sessions.size, 1);
});

test("recovery denies state-only, different identity, and different authenticated principal", async () => {
  if (!completions.InMemoryRegistrationCompletionStore || !completions.completePanelRegistration || !completions.recoverPanelRegistration) return;
  const store = new completions.InMemoryRegistrationCompletionStore([attempt()]);
  const sessions = new RecordingSessionStore();
  sessions.failCreates = 1;
  const deps = dependencies(store, sessions);
  await completions.completePanelRegistration({ ...deps.input, attemptId: attempt().id, identity });

  for (const authority of [
    undefined,
    { kind: "verified_identity", identity: { ...identity, subject: "different" } },
    { kind: "authenticated_principal", principal: { id: "principal_other", issuer: identity.issuer, subject: identity.subject } },
  ]) {
    const result = await completions.recoverPanelRegistration({
      ...deps.input,
      attemptId: attempt().id,
      authority: authority as never,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "registration_recovery_denied");
  }
  assert.equal(deps.tenantCalls, 1);
  assert.equal(sessions.sessions.size, 0);
});

test("disabled live callback returns 503 without provider, TenantCore, session, or cookie", async () => {
  if (!completions.InMemoryRegistrationCompletionStore || !completions.createPanelOidcCallbackHandler) return;
  const store = new completions.InMemoryRegistrationCompletionStore([attempt()]);
  const deps = dependencies(store);
  let providerCalls = 0;
  const handler = completions.createPanelOidcCallbackHandler({
    enabled: false,
    ...deps.input,
    oidc: { async complete() { providerCalls += 1; return identity; } },
    cookiePolicy: { kind: "production" },
  });
  const response = await handler(new Request(
    `https://panel.celebix.site/auth/callback?state=${attempt().state}&code=valid-code`,
  ));
  assert.equal(response.status, 503);
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(providerCalls, 0);
  assert.equal(deps.tenantCalls, 0);
  assert.equal(deps.sessions.sessions.size, 0);
});
