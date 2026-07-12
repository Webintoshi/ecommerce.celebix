import assert from "node:assert/strict";
import test from "node:test";

import type { CreateStarterTenantInput } from "@celebix/saas-contracts";
import type { PostgresPoolLike } from "@celebix/saas-data";

import {
  createDisabledOwnerSaaSTenantRuntime,
  createOwnerPostgresActivationApproval,
  createPostgresOwnerSaaSTenantRuntime,
} from "./runtime.ts";

const input: CreateStarterTenantInput = {
  schemaVersion: 1,
  idempotencyKey: "owner-runtime-1",
  principal: {
    issuer: "https://auth.example.test/oidc",
    subject: "subject-1",
    email: "owner@example.test",
    emailVerified: true,
  },
  store: {
    name: "Ornek Magaza",
    slug: "ornek-magaza",
    locale: "tr",
    currency: "TRY",
    themeKey: "starter",
  },
  consents: { privacyAcceptedAt: "2026-07-10T00:00:00.000Z" },
  requestedAt: "2026-07-10T00:00:00.000Z",
};

const timeouts = {
  poolCheckoutMs: 100,
  statementMs: 5_000,
  lockMs: 2_000,
  idleTransactionMs: 8_000,
};

function poolProbe() {
  let connects = 0;
  const pool: PostgresPoolLike = {
    connect: async () => {
      connects += 1;
      throw new Error("private pool detail");
    },
  };
  return { pool, connects: () => connects };
}

test("default runtime remains disabled and environment values cannot activate or connect", async () => {
  const previous = new Map<string, string | undefined>();
  const names = [
    "SELF_SERVE_SAAS_REGISTRATION_ENABLED",
    "CUSTOMER_PANEL_AUTH_ENABLED",
    "SAAS_POSTGRES_ENABLED",
    "DATABASE_URL",
  ];
  for (const name of names) {
    previous.set(name, process.env[name]);
    process.env[name] = name === "DATABASE_URL" ? "postgres://must-not-be-read" : "true";
  }
  try {
    const runtime = createDisabledOwnerSaaSTenantRuntime();
    assert.equal(runtime.kind, "disabled");
    assert.deepEqual(await runtime.tenantCore.createStarterTenant(input), {
      ok: false,
      error: { schemaVersion: 1, code: "service_unavailable", retryable: true },
    });
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("PostgreSQL runtime requires a sealed approval and injected pool without connecting during composition", () => {
  const probe = poolProbe();
  const approval = createOwnerPostgresActivationApproval("disposable_test");
  const runtime = createPostgresOwnerSaaSTenantRuntime({
    pool: probe.pool,
    generateId: () => "00000000-0000-4000-8000-000000000001",
    panelOrigin: "https://panel.example.test",
    platformDomainSuffix: "example.test",
    timeouts,
    audit: () => undefined,
    activationApproval: approval,
    isTrustedRecoveryRequest: async () => true,
  });

  assert.equal(runtime.kind, "postgres");
  assert.equal(probe.connects(), 0);
  assert.deepEqual(
    {
      adapter: approval.adapter,
      storeCreationApproved: approval.storeCreationApproved,
      provisioningApproved: approval.provisioningApproved,
      environment: approval.environment,
      approvedByCompositionRoot: approval.approvedByCompositionRoot,
    },
    {
      adapter: "postgres",
      storeCreationApproved: true,
      provisioningApproved: true,
      environment: "disposable_test",
      approvedByCompositionRoot: true,
    },
  );

  const serializedCopy = JSON.parse(JSON.stringify(approval));
  assert.throws(() => createPostgresOwnerSaaSTenantRuntime({
    pool: probe.pool,
    generateId: () => "00000000-0000-4000-8000-000000000001",
    panelOrigin: "https://panel.example.test",
    platformDomainSuffix: "example.test",
    timeouts,
    audit: () => undefined,
    activationApproval: serializedCopy,
    isTrustedRecoveryRequest: async () => true,
  }), /owner_postgres_activation_not_approved/);
  assert.equal(probe.connects(), 0);
});

test("PostgreSQL composition rejects unbounded timeouts and a non-host platform suffix before pool access", () => {
  const probe = poolProbe();
  const base = {
    pool: probe.pool,
    generateId: () => "00000000-0000-4000-8000-000000000001",
    panelOrigin: "https://panel.example.test",
    platformDomainSuffix: "example.test",
    timeouts,
    audit: () => undefined,
    activationApproval: createOwnerPostgresActivationApproval("disposable_test"),
    isTrustedRecoveryRequest: async () => true,
  };
  for (const invalidTimeouts of [
    { ...timeouts, poolCheckoutMs: 0 },
    { ...timeouts, statementMs: 60_001 },
    { ...timeouts, lockMs: 1.5 },
    { ...timeouts, idleTransactionMs: -1 },
  ]) {
    assert.throws(() => createPostgresOwnerSaaSTenantRuntime({ ...base, timeouts: invalidTimeouts }), /owner_postgres_runtime_invalid/);
  }
  assert.throws(() => createPostgresOwnerSaaSTenantRuntime({
    ...base,
    platformDomainSuffix: "https://example.test/path",
  }), /owner_postgres_runtime_invalid/);
  assert.equal(probe.connects(), 0);
});

test("recovery is separately authorized and rejects malformed authority before pool access", async () => {
  const probe = poolProbe();
  let trusted = false;
  const runtime = createPostgresOwnerSaaSTenantRuntime({
    pool: probe.pool,
    generateId: () => "00000000-0000-4000-8000-000000000001",
    panelOrigin: "https://panel.example.test",
    platformDomainSuffix: "example.test",
    timeouts,
    audit: () => undefined,
    activationApproval: createOwnerPostgresActivationApproval("disposable_test"),
    isTrustedRecoveryRequest: async () => trusted,
  });
  assert.equal(runtime.kind, "postgres");
  if (runtime.kind !== "postgres") return;

  const request = new Request("https://owner.example.test/internal/recovery");
  assert.deepEqual(await runtime.recovery.recover(request, {
    idempotencyKey: "owner-runtime-1",
    fingerprint: "a".repeat(64),
  }), {
    ok: false,
    error: { schemaVersion: 1, code: "unauthenticated", retryable: false },
  });
  assert.equal(probe.connects(), 0);

  trusted = true;
  assert.deepEqual(await runtime.recovery.recover(request, {
    idempotencyKey: " owner-runtime-1",
    fingerprint: "A".repeat(64),
    adapter: "postgres",
  }), {
    ok: false,
    error: { schemaVersion: 1, code: "invalid_input", retryable: false },
  });
  assert.equal(probe.connects(), 0);
});
