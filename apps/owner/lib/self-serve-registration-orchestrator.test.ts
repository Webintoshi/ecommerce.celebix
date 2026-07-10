import assert from "node:assert/strict";
import test from "node:test";

import type {
  CreateStarterTenantInput,
  CreateStarterTenantResult,
  SaaSContractError,
} from "@celebix/saas-contracts";
import type { OidcVerifiedIdentity } from "./self-serve-oidc";
import type {
  PanelSession,
  PanelSessionStore,
  RegistrationAttempt,
  RegistrationAttemptStore,
  RegistrationOidcPort,
} from "./self-serve-registration-orchestrator";
import type { SelfServeRegistrationInput } from "./self-serve-registration";

type OrchestratorModule = typeof import("./self-serve-registration-orchestrator");
const orchestration = await import(
  new URL("./self-serve-registration-orchestrator.ts", import.meta.url).href
).catch(() => ({} as Partial<OrchestratorModule>));

const registration: SelfServeRegistrationInput = {
  firstName: "Ada",
  lastName: "Lovelace",
  storeName: "Çiçek Pazarı",
  storeSlug: "cicek-pazari",
  phone: "+905551112233",
  email: "ada@example.test",
  password: "IdentityProviderOnly!",
  marketingConsent: false,
  privacyConsent: true,
};

const identity: OidcVerifiedIdentity = {
  issuer: "https://identity.example.test/oidc",
  subject: "subject_123",
  audience: ["customer-panel"],
  nonce: "nonce_123",
  email: "ada@example.test",
  emailVerified: true,
};

function tenantResult(status: CreateStarterTenantResult["provisioningStatus"] = "ready"): CreateStarterTenantResult {
  return {
    schemaVersion: 1,
    operationId: "operation_1",
    replayed: false,
    store: { id: "store_1", slug: "cicek-pazari", status: status === "failed" ? "failed" : "active" },
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
      createdAt: "2026-07-10T10:00:00.000Z",
      updatedAt: "2026-07-10T10:00:00.000Z",
    },
    plan: {
      schemaVersion: 1,
      planId: "plan_free",
      planCode: "free_starter",
      version: 1,
      status: "active",
      features: ["catalog"],
      limits: { products: 100, staff: 1, storageBytes: 1_000_000_000 },
      validFrom: "2026-07-10T10:00:00.000Z",
    },
    provisioningStatus: status,
    panelUrl: "https://panel.celebix.site",
    storefrontUrl: "https://cicek-pazari.celebix.site",
  };
}

class RecordingAttemptStore implements RegistrationAttemptStore {
  saved: RegistrationAttempt | null = null;

  async save(attempt: RegistrationAttempt) {
    this.saved = structuredClone(attempt);
  }

  async consume(state: string) {
    if (!this.saved || this.saved.state !== state) throw new Error("missing attempt");
    const attempt = this.saved;
    this.saved = null;
    return structuredClone(attempt);
  }
}

class RecordingSessionStore implements PanelSessionStore {
  created: PanelSession | null = null;

  async create(session: PanelSession) {
    this.created = structuredClone(session);
  }
}

function oidcPort(overrides: Partial<RegistrationOidcPort> = {}): RegistrationOidcPort {
  return {
    async begin() {
      return {
        state: "opaque_state_123",
        authorizationUrl: "https://identity.example.test/authorize?state=opaque_state_123&code_challenge=challenge",
        expiresAt: "2026-07-10T10:10:00.000Z",
      };
    },
    async complete() {
      return identity;
    },
    ...overrides,
  };
}

function validInput(): CreateStarterTenantInput {
  return {
    schemaVersion: 1,
    idempotencyKey: "ssik_server_owned",
    principal: {
      issuer: identity.issuer,
      subject: identity.subject,
      email: identity.email,
      emailVerified: true,
    },
    store: { name: "Çiçek Pazarı", slug: "cicek-pazari", locale: "tr", currency: "TRY", themeKey: "starter" },
    consents: { privacyAcceptedAt: "2026-07-10T10:00:00.000Z" },
    requestedAt: "2026-07-10T10:00:00.000Z",
  };
}

test("exports the registration orchestration surface", () => {
  assert.equal(typeof orchestration.beginSelfServeRegistration, "function");
  assert.equal(typeof orchestration.completeSelfServeRegistration, "function");
});

test("production-disabled begin never calls OIDC and returns an explicit disabled state", async () => {
  if (!orchestration.beginSelfServeRegistration) return;
  let called = false;
  const result = await orchestration.beginSelfServeRegistration({
    enabled: false,
    registration,
    oidc: oidcPort({ begin: async () => { called = true; throw new Error("must not run"); } }),
    attemptStore: new RecordingAttemptStore(),
  });

  assert.deepEqual(result, {
    ok: false,
    state: "disabled",
    code: "self_serve_saas_registration_disabled",
    status: 503,
  });
  assert.equal(called, false);
  assert.equal(JSON.stringify(result).includes(registration.password), false);
});

test("validates registration then stores only safe details server-side before awaiting identity", async () => {
  if (!orchestration.beginSelfServeRegistration) return;
  const attempts = new RecordingAttemptStore();
  const result = await orchestration.beginSelfServeRegistration({
    enabled: true,
    registration,
    oidc: oidcPort(),
    attemptStore: attempts,
    now: () => new Date("2026-07-10T10:00:00.000Z"),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.state, "awaiting_identity");
  assert.equal(attempts.saved?.details.storeSlug, "cicek-pazari");
  const persisted = JSON.stringify(attempts.saved);
  assert.equal(persisted.includes(registration.password), false);
  assert.equal(persisted.includes(registration.email), false);
  assert.equal(persisted.includes(registration.phone), false);
  assert.equal(JSON.stringify(result).includes(registration.password), false);
});

test("the registration foundation never reads browser email or password authority", async () => {
  if (!orchestration.beginSelfServeRegistration) return;
  const browserInput = { ...registration };
  Object.defineProperties(browserInput, {
    email: { get() { throw new Error("browser email must not be read"); } },
    password: { get() { throw new Error("browser password must not be read"); } },
  });
  const result = await orchestration.beginSelfServeRegistration({
    enabled: true,
    registration: browserInput,
    oidc: oidcPort(),
    attemptStore: new RecordingAttemptStore(),
    now: () => new Date("2026-07-10T10:00:00.000Z"),
  });

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.state, "awaiting_identity");
});

test("verified callback creates Tenant Core input, establishes a token-free session, then redirects", async () => {
  if (!orchestration.beginSelfServeRegistration || !orchestration.completeSelfServeRegistration) return;
  const attempts = new RecordingAttemptStore();
  const sessions = new RecordingSessionStore();
  const begin = await orchestration.beginSelfServeRegistration({
    enabled: true,
    registration: { ...registration, storeId: "browser-store" } as SelfServeRegistrationInput,
    oidc: oidcPort(),
    attemptStore: attempts,
    now: () => new Date("2026-07-10T10:00:00.000Z"),
  });
  assert.equal(begin.ok, true);
  let tenantInput: CreateStarterTenantInput | null = null;

  const complete = await orchestration.completeSelfServeRegistration({
    callback: { code: "valid-code", state: "opaque_state_123" },
    oidc: oidcPort(),
    attemptStore: attempts,
    buildTenantInput: async () => ({ ok: true, input: validInput() }),
    tenantCoreClient: {
      async createStarterTenant(input: CreateStarterTenantInput) {
        tenantInput = structuredClone(input);
        return { ok: true, value: tenantResult("ready") };
      },
    },
    panelSessionStore: sessions,
    now: () => new Date("2026-07-10T10:01:00.000Z"),
  });

  assert.deepEqual(complete, {
    ok: true,
    state: "ready",
    redirectTo: "https://panel.celebix.site/",
    operationId: "operation_1",
  });
  assert.equal(JSON.stringify(tenantInput).includes(registration.password), false);
  assert.equal(JSON.stringify(tenantInput).includes("browser-store"), false);
  assert.equal(sessions.created?.principal.issuer, identity.issuer);
  assert.equal(sessions.created?.principal.subject, identity.subject);
  assert.equal(sessions.created?.activeStore.storeId, "store_1");
  assert.equal(JSON.stringify(sessions.created).toLowerCase().includes("token"), false);
  assert.equal(complete.redirectTo.includes(sessions.created?.id ?? "missing"), false);
});

test("unverified identity and Tenant Core failure never establish a panel session", async () => {
  if (!orchestration.completeSelfServeRegistration) return;
  const error: SaaSContractError = { schemaVersion: 1, code: "identity_unverified", retryable: false };
  for (const scenario of ["identity", "tenant"] as const) {
    const attempts = new RecordingAttemptStore();
    await attempts.save({
      state: "opaque_state_123",
      details: {
        storeName: "Çiçek Pazarı",
        storeSlug: "cicek-pazari",
        locale: "tr",
        currency: "TRY",
        themeKey: "starter",
        privacyAcceptedAt: "2026-07-10T10:00:00.000Z",
      },
      createdAt: "2026-07-10T10:00:00.000Z",
      expiresAt: "2026-07-10T10:10:00.000Z",
    });
    const sessions = new RecordingSessionStore();
    const result = await orchestration.completeSelfServeRegistration({
      callback: { code: "valid-code", state: "opaque_state_123" },
      oidc: oidcPort({ complete: async () => scenario === "identity" ? { ...identity, emailVerified: false } : identity }),
      attemptStore: attempts,
      buildTenantInput: async () => scenario === "identity" ? { ok: false, error } : { ok: true, input: validInput() },
      tenantCoreClient: {
        async createStarterTenant() {
          return { ok: false, error: { schemaVersion: 1, code: "tenant_transaction_failed", retryable: false } };
        },
      },
      panelSessionStore: sessions,
    });

    assert.equal(result.ok, false);
    assert.equal(result.state, "failed");
    assert.equal(sessions.created, null);
  }
});

test("processing tenant result establishes the selected store session and redirects to setup", async () => {
  if (!orchestration.completeSelfServeRegistration) return;
  const attempts = new RecordingAttemptStore();
  await attempts.save({
    state: "opaque_state_123",
    details: {
      storeName: "Çiçek Pazarı",
      storeSlug: "cicek-pazari",
      locale: "tr",
      currency: "TRY",
      themeKey: "starter",
      privacyAcceptedAt: "2026-07-10T10:00:00.000Z",
    },
    createdAt: "2026-07-10T10:00:00.000Z",
    expiresAt: "2026-07-10T10:10:00.000Z",
  });
  const sessions = new RecordingSessionStore();
  const result = await orchestration.completeSelfServeRegistration({
    callback: { code: "valid-code", state: "opaque_state_123" },
    oidc: oidcPort(),
    attemptStore: attempts,
    buildTenantInput: async () => ({ ok: true, input: validInput() }),
    tenantCoreClient: { async createStarterTenant() { return { ok: true, value: tenantResult("processing") }; } },
    panelSessionStore: sessions,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.state, "provisioning");
  assert.equal(result.redirectTo, "https://panel.celebix.site/setup");
  assert.ok(sessions.created);
});
