import assert from "node:assert/strict";
import test from "node:test";

import type { CreateStarterTenantInput, CreateStarterTenantResult } from "@celebix/saas-contracts";
import { createCanonicalTenantFingerprint } from "@celebix/saas-data";
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
  emailVerified: true as const,
};

function attempt(overrides: Partial<StoredRegistrationAttempt> = {}): StoredRegistrationAttempt {
  const input = tenantInput("ssik_1234567890abcdefghijklmnopqr");
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
    requestedAt: NOW.toISOString(),
    canonicalFingerprint: createCanonicalTenantFingerprint(input),
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
      buildTenantInput: async (
        _identity: PanelVerifiedIdentity,
        attemptOrDetails: StoredRegistrationAttempt | unknown,
        legacyIdempotencyKey?: string,
      ) => {
        const idempotencyKey = attemptOrDetails && typeof attemptOrDetails === "object" && "idempotencyKey" in attemptOrDetails
          ? String((attemptOrDetails as StoredRegistrationAttempt).idempotencyKey)
          : String(legacyIdempotencyKey ?? "");
        const input = tenantInput(idempotencyKey);
        return {
          ok: true as const,
          input,
          canonicalFingerprint: createCanonicalTenantFingerprint(input),
        };
      },
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
    verifiedPrincipal: { ...identity, emailVerified: true },
  });
  const store = new completions.InMemoryRegistrationCompletionStore([verified]);
  await assert.rejects(
    () => store.update({
      ...verified,
      verifiedPrincipal: { ...identity, subject: "attacker" },
    }),
    /registration_attempt_immutable_field_changed/,
  );

  const tenantCreated = attempt({
    ...verified,
    status: "tenant_created",
    tenantResult: tenantResult(),
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

test("completion store freezes attempt details, requestedAt, canonical input, fingerprint, and tenant result", async () => {
  if (!completions.InMemoryRegistrationCompletionStore) return;
  const input = tenantInput(attempt().idempotencyKey);
  const frozen = attempt({
    status: "tenant_created",
    verifiedPrincipal: { ...identity, emailVerified: true },
    tenantInputSnapshot: input,
    canonicalFingerprint: createCanonicalTenantFingerprint(input),
    tenantResult: tenantResult(),
    tenantOperation: {
      operationId: "operation_1",
      principalId: "principal_1",
      storeId: "store_1",
      provisioningStatus: "ready",
    },
  });
  const mutations: StoredRegistrationAttempt[] = [
    { ...frozen, details: { ...frozen.details, storeName: "Mutated" } },
    { ...frozen, requestedAt: "2026-07-11T10:00:01.000Z" },
    { ...frozen, canonicalFingerprint: "0".repeat(64) },
    { ...frozen, tenantInputSnapshot: { ...input, requestedAt: "2026-07-11T10:00:01.000Z" } },
    { ...frozen, tenantResult: { ...tenantResult(), store: { ...tenantResult().store, slug: "mutated" } } },
  ];

  for (const mutation of mutations) {
    const store = new completions.InMemoryRegistrationCompletionStore([frozen]);
    await assert.rejects(() => store.update(mutation), /registration_attempt_immutable_field_changed/);
  }
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

test("panel callback is bound to the exact callback URL", async () => {
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
  const response = await handler(new Request(
    `https://panel.celebix.site/not-the-callback?state=${attempt().state}&code=valid-code`,
  ));
  assert.equal(response.status, 400);
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(response.headers.has("location"), false);
  assert.equal(providerCalls, 0);
});

test("completion dependency failures are controlled and never expose private errors", async () => {
  if (!completions.completePanelRegistration || !completions.InMemoryRegistrationCompletionStore) return;
  const privateMessage = "postgres://private-provider-message";
  const baseStore = new completions.InMemoryRegistrationCompletionStore([attempt()]);

  const cases = [
    {
      name: "lookup",
      input: {
        ...dependencies(baseStore).input,
        completionStore: { ...baseStore, async findById() { throw new Error(privateMessage); } },
      },
    },
    {
      name: "input build",
      input: {
        ...dependencies(new completions.InMemoryRegistrationCompletionStore([attempt()])).input,
        async buildTenantInput() { throw new Error(privateMessage); },
      },
    },
    {
      name: "tenant core",
      input: {
        ...dependencies(new completions.InMemoryRegistrationCompletionStore([attempt()])).input,
        tenantCoreClient: { async createStarterTenant() { throw new Error(privateMessage); } },
      },
    },
  ];

  for (const failure of cases) {
    const result = await completions.completePanelRegistration({
      ...failure.input,
      attemptId: attempt().id,
      identity,
    } as never);
    assert.equal(result.ok, false, failure.name);
    if (!result.ok) {
      assert.equal(result.status, 503, failure.name);
      assert.equal(JSON.stringify(result).includes(privateMessage), false, failure.name);
    }
  }
});

test("callback store and cookie failures return controlled 503 without redirect or cookie", async () => {
  if (!completions.InMemoryRegistrationCompletionStore || !completions.createPanelOidcCallbackHandler) return;
  const privateMessage = "provider-secret-detail";
  const failures = [
    {
      completionStore: {
        async findByState() { throw new Error(privateMessage); },
        async findById() { throw new Error(privateMessage); },
        async save() { throw new Error(privateMessage); },
        async update() { throw new Error(privateMessage); },
      },
    },
    {
      completionStore: new completions.InMemoryRegistrationCompletionStore([attempt()]),
      serializeSessionCookie() { throw new Error(privateMessage); },
    },
  ];

  for (const failure of failures) {
    const deps = dependencies(failure.completionStore as RegistrationCompletionStore);
    const handler = completions.createPanelOidcCallbackHandler({
      enabled: true,
      ...deps.input,
      ...failure,
      oidc: { async complete() { return identity; } },
      cookiePolicy: { kind: "production" },
    } as never);
    const response = await handler(new Request(
      `https://panel.celebix.site/auth/callback?state=${attempt().state}&code=valid-code`,
    ));
    assert.equal(response.status, 503);
    assert.equal(response.headers.has("set-cookie"), false);
    assert.equal(response.headers.has("location"), false);
    assert.equal((await response.text()).includes(privateMessage), false);
  }
});

test("completion update and session read failures remain controlled and recoverable", async () => {
  if (!completions.completePanelRegistration || !completions.InMemoryRegistrationCompletionStore) return;
  const privateMessage = "private-adapter-failure";
  const base = new completions.InMemoryRegistrationCompletionStore([attempt()]);
  const updateFailure: RegistrationCompletionStore = {
    save: (value) => base.save(value),
    async update() { throw new Error(privateMessage); },
    findByState: (state, now) => base.findByState(state, now),
    findById: (id, now) => base.findById(id, now),
  };
  const updateResult = await completions.completePanelRegistration({
    ...dependencies(updateFailure).input,
    attemptId: attempt().id,
    identity,
  });
  assert.equal(updateResult.ok, false);
  if (!updateResult.ok) {
    assert.equal(updateResult.status, 503);
    assert.equal(JSON.stringify(updateResult).includes(privateMessage), false);
  }

  const input = tenantInput(attempt().idempotencyKey);
  const tenantCreated = attempt({
    status: "tenant_created",
    verifiedPrincipal: { ...identity, emailVerified: true },
    tenantInputSnapshot: input,
    canonicalFingerprint: createCanonicalTenantFingerprint(input),
    tenantResult: tenantResult(),
    tenantOperation: {
      operationId: "operation_1",
      principalId: "principal_1",
      storeId: "store_1",
      provisioningStatus: "ready",
    },
  });
  const createdStore = new completions.InMemoryRegistrationCompletionStore([tenantCreated]);
  const readResult = await completions.completePanelRegistration({
    ...dependencies(createdStore).input,
    panelSessionStore: {
      async create() {},
      async read() { throw new Error(privateMessage); },
      async rotate() {},
      async destroy() {},
    },
    attemptId: tenantCreated.id,
    identity,
  });
  assert.equal(readResult.ok, false);
  if (!readResult.ok) {
    assert.equal(readResult.status, 503);
    assert.equal(readResult.retryable, true);
    assert.equal(JSON.stringify(readResult).includes(privateMessage), false);
  }
  assert.equal((await createdStore.findById(tenantCreated.id, NOW))?.status, "tenant_created");
});

test("retryable Tenant Core and OIDC provider failures fail closed without cookie or redirect", async () => {
  if (!completions.completePanelRegistration || !completions.InMemoryRegistrationCompletionStore || !completions.createPanelOidcCallbackHandler) return;
  const retryStore = new completions.InMemoryRegistrationCompletionStore([attempt()]);
  const retryResult = await completions.completePanelRegistration({
    ...dependencies(retryStore).input,
    tenantCoreClient: {
      async createStarterTenant() {
        return {
          ok: false as const,
          error: { schemaVersion: 1 as const, code: "tenant_transaction_failed" as const, retryable: true },
        };
      },
    },
    attemptId: attempt().id,
    identity,
  });
  assert.equal(retryResult.ok, false);
  if (!retryResult.ok) {
    assert.equal(retryResult.status, 503);
    assert.equal(retryResult.retryable, true);
  }
  const recoverable = await retryStore.findById(attempt().id, NOW);
  assert.equal(recoverable?.status, "identity_verified");
  assert.ok(recoverable?.tenantInputSnapshot);

  const providerStore = new completions.InMemoryRegistrationCompletionStore([attempt()]);
  const providerDeps = dependencies(providerStore);
  const handler = completions.createPanelOidcCallbackHandler({
    enabled: true,
    ...providerDeps.input,
    oidc: { async complete() { throw new Error("private-provider-token"); } },
    cookiePolicy: { kind: "production" },
  });
  const response = await handler(new Request(
    `https://panel.celebix.site/auth/callback?state=${attempt().state}&code=valid-code`,
  ));
  assert.equal(response.status, 400);
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(response.headers.has("location"), false);
  assert.equal((await response.text()).includes("private-provider-token"), false);
});
