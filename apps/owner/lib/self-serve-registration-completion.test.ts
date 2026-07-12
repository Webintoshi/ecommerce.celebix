import assert from "node:assert/strict";
import test from "node:test";

import type { CreateStarterTenantResult } from "@celebix/saas-contracts";

import type {
  PersistentRegistrationWorkflow,
  RecordVerifiedIdentityInput,
  RecordVerifiedIdentityOutcome,
  VerifiedRegistrationAuthority,
} from "./saas-persistence/postgres-registration-attempt-store.ts";
import {
  createPersistentRegistrationCompletionService,
  type PersistentRegistrationCompletionStore,
} from "./self-serve-registration-completion.ts";

const now = new Date("2026-07-12T10:05:00.000Z");
const attemptId = "attempt_A234567890123456";
const fingerprint = "a".repeat(64);
const tenantInput = {
  schemaVersion: 1 as const,
  idempotencyKey: "ssik_A234567890123456",
  principal: {
    issuer: "https://identity.example.test",
    subject: "subject-123",
    email: "owner@example.test",
    emailVerified: true as const,
  },
  store: {
    name: "Safe Store",
    slug: "safe-store",
    locale: "tr",
    currency: "TRY",
    themeKey: "starter",
  },
  consents: { privacyAcceptedAt: "2026-07-12T10:00:00.000Z" },
  requestedAt: "2026-07-12T10:00:00.000Z",
};
const tenantResult: CreateStarterTenantResult = {
  schemaVersion: 1,
  operationId: "70000000-0000-4000-8000-000000000001",
  replayed: false,
  store: { id: "10000000-0000-4000-8000-000000000001", slug: "safe-store", status: "active" },
  primaryDomain: {
    schemaVersion: 1,
    hostname: "safe-store.celebix.site",
    domainId: "20000000-0000-4000-8000-000000000001",
    domainType: "platform_subdomain",
    storeId: "10000000-0000-4000-8000-000000000001",
    storeSlug: "safe-store",
    canonicalHostname: "safe-store.celebix.site",
    status: "active",
    cacheVersion: 1,
  },
  membership: {
    schemaVersion: 1,
    id: "30000000-0000-4000-8000-000000000001",
    principalId: "40000000-0000-4000-8000-000000000001",
    storeId: "10000000-0000-4000-8000-000000000001",
    role: "store_owner",
    status: "active",
    createdAt: tenantInput.requestedAt,
    updatedAt: tenantInput.requestedAt,
  },
  plan: {
    schemaVersion: 1,
    planId: "50000000-0000-4000-8000-000000000001",
    planCode: "free_starter",
    version: 1,
    status: "active",
    features: ["catalog"],
    limits: { products: 100, staff: 1, storageBytes: 1_000_000_000 },
    validFrom: tenantInput.requestedAt,
  },
  provisioningStatus: "ready",
  panelUrl: "https://panel.celebix.site/stores/safe-store",
  storefrontUrl: "https://safe-store.celebix.site",
};

function authority(version = 2): VerifiedRegistrationAuthority {
  return {
    attempt: {
      id: attemptId,
      details: {
        storeName: tenantInput.store.name,
        storeSlug: tenantInput.store.slug,
        locale: tenantInput.store.locale,
        currency: tenantInput.store.currency,
        themeKey: tenantInput.store.themeKey,
        privacyAcceptedAt: tenantInput.consents.privacyAcceptedAt,
      },
      idempotencyKey: tenantInput.idempotencyKey,
      requestedAt: tenantInput.requestedAt,
      createdAt: tenantInput.requestedAt,
      expiresAt: "2026-07-12T10:10:00.000Z",
    },
    status: "identity_verified",
    version,
    canonicalFingerprint: fingerprint,
    consumedAt: "2026-07-12T10:01:00.000Z",
    verifiedIdentity: {
      issuer: tenantInput.principal.issuer,
      subject: tenantInput.principal.subject,
      email: tenantInput.principal.email,
      emailVerified: true,
    },
    tenantInput,
  };
}

class WorkflowStore implements PersistentRegistrationCompletionStore {
  current = authority();
  recordCalls = 0;
  tenantCreatedCalls = 0;

  async recordVerifiedIdentity(input: RecordVerifiedIdentityInput): Promise<RecordVerifiedIdentityOutcome> {
    this.recordCalls += 1;
    assert.equal(input.attemptId, attemptId);
    return { kind: "recorded", authority: this.current };
  }

  async loadVerified(): Promise<VerifiedRegistrationAuthority> {
    return structuredClone(this.current);
  }

  async markTenantCreated(): Promise<PersistentRegistrationWorkflow> {
    this.tenantCreatedCalls += 1;
    this.current = { ...this.current, status: "tenant_created", version: this.current.version + 1 };
    return structuredClone(this.current);
  }
}

function service(options: {
  store?: WorkflowStore;
  create?: (input: unknown) => Promise<any>;
  recover?: () => Promise<any>;
  audit?: () => void | Promise<void>;
}) {
  const store = options.store ?? new WorkflowStore();
  let creationCalls = 0;
  let recoveryCalls = 0;
  const completion = createPersistentRegistrationCompletionService({
    workflowStore: store,
    tenantCore: {
      createStarterTenant: async (input) => {
        creationCalls += 1;
        assert.deepEqual(input, tenantInput);
        return options.create?.(input) ?? { ok: true, value: structuredClone(tenantResult) };
      },
    },
    recovery: {
      recover: async (idempotencyKey, receivedFingerprint) => {
        recoveryCalls += 1;
        assert.equal(idempotencyKey, tenantInput.idempotencyKey);
        assert.equal(receivedFingerprint, fingerprint);
        return options.recover?.() ?? { kind: "absent" };
      },
    },
    clock: () => now,
    audit: options.audit ?? (() => undefined),
  });
  return { completion, store, creationCalls: () => creationCalls, recoveryCalls: () => recoveryCalls };
}

test("recording verified identity is durable-only and never creates a tenant", async () => {
  const probe = service({});
  const result = await probe.completion.recordVerifiedIdentity({
    attemptId,
    expectedVersion: 1,
    identity: tenantInput.principal,
  });
  assert.deepEqual(result, { kind: "identity_recorded", status: "identity_verified", version: 2 });
  assert.equal(probe.store.recordCalls, 1);
  assert.equal(probe.creationCalls(), 0);
  assert.equal(probe.recoveryCalls(), 0);
});

test("a new service instance resumes first creation from durable authority exactly once", async () => {
  const store = new WorkflowStore();
  const firstProcess = service({ store });
  await firstProcess.completion.recordVerifiedIdentity({ attemptId, expectedVersion: 1, identity: tenantInput.principal });

  const restarted = service({ store });
  const result = await restarted.completion.resumeTenantCreation(attemptId);
  assert.equal(result.kind, "tenant_created");
  if (result.kind === "tenant_created") assert.equal(result.result.replayed, false);
  assert.equal(restarted.creationCalls(), 1);
  assert.equal(store.tenantCreatedCalls, 1);
});

test("matching replay closes the crash window after tenant commit but before workflow update", async () => {
  const store = new WorkflowStore();
  const crashed = service({
    store,
    create: async () => ({ ok: true, value: { ...structuredClone(tenantResult), replayed: false } }),
  });
  store.markTenantCreated = async () => { throw new Error("process_crashed_before_workflow_update"); };
  assert.deepEqual(await crashed.completion.resumeTenantCreation(attemptId), {
    kind: "rejected",
    error: { code: "durable_authority_invalid", retryable: false },
  });

  store.markTenantCreated = WorkflowStore.prototype.markTenantCreated.bind(store);
  const restarted = service({
    store,
    create: async () => ({ ok: true, value: { ...structuredClone(tenantResult), replayed: true } }),
  });
  const result = await restarted.completion.resumeTenantCreation(attemptId);
  assert.equal(result.kind, "tenant_replayed");
  assert.equal(store.tenantCreatedCalls, 1);
});

test("unknown COMMIT never retries automatically and explicit committed recovery marks tenant_created", async () => {
  const probe = service({
    create: async () => ({
      ok: false,
      error: { schemaVersion: 1, code: "tenant_transaction_failed", retryable: false },
    }),
    recover: async () => ({ kind: "committed_match", result: { ...structuredClone(tenantResult), replayed: true } }),
  });

  assert.deepEqual(await probe.completion.resumeTenantCreation(attemptId), { kind: "commit_unknown" });
  assert.equal(probe.creationCalls(), 1);
  assert.equal(probe.store.tenantCreatedCalls, 0);
  const recovered = await probe.completion.reconcileUnknownCommit(attemptId);
  assert.equal(recovered.kind, "tenant_recovered");
  assert.equal(probe.creationCalls(), 1);
  assert.equal(probe.recoveryCalls(), 1);
  assert.equal(probe.store.tenantCreatedCalls, 1);
});

test("absent recovery is controlled, read-only, and leaves identity_verified", async () => {
  const probe = service({ recover: async () => ({ kind: "absent" }) });
  assert.deepEqual(await probe.completion.reconcileUnknownCommit(attemptId), { kind: "absent" });
  assert.equal(probe.creationCalls(), 0);
  assert.equal(probe.recoveryCalls(), 1);
  assert.equal(probe.store.tenantCreatedCalls, 0);
  assert.equal(probe.store.current.status, "identity_verified");
});

test("processing and failed recovery are controlled and never invoke tenant creation", async () => {
  for (const [kind, expected] of [["processing", "pending"], ["failed", "failed"]] as const) {
    const probe = service({ recover: async () => ({ kind }) });
    assert.deepEqual(await probe.completion.reconcileUnknownCommit(attemptId), { kind: expected });
    assert.equal(probe.creationCalls(), 0);
    assert.equal(probe.store.tenantCreatedCalls, 0);
  }
});

test("mismatch and corrupt recovery fail closed with no tenant call or workflow mutation", async () => {
  for (const kind of ["committed_mismatch", "corrupt"] as const) {
    const probe = service({ recover: async () => ({ kind }) });
    assert.deepEqual(await probe.completion.reconcileUnknownCommit(attemptId), {
      kind: "rejected",
      error: { code: "durable_authority_invalid", retryable: false },
    });
    assert.equal(probe.creationCalls(), 0);
    assert.equal(probe.store.tenantCreatedCalls, 0);
  }
});

test("tenant conflict and retryability outcomes remain safe and stable", async () => {
  for (const [error, expected] of [
    [{ schemaVersion: 1, code: "idempotency_mismatch", retryable: false }, "idempotency_mismatch"],
    [{ schemaVersion: 1, code: "slug_taken", retryable: false }, "slug_taken"],
    [{ schemaVersion: 1, code: "domain_conflict", retryable: false }, "domain_conflict"],
    [{ schemaVersion: 1, code: "membership_conflict", retryable: false }, "membership_conflict"],
    [{ schemaVersion: 1, code: "identity_unverified", retryable: false }, "identity_unverified"],
    [{ schemaVersion: 1, code: "tenant_transaction_failed", retryable: true }, "tenant_transaction_failed"],
    [{ schemaVersion: 1, code: "service_unavailable", retryable: true }, "tenant_transaction_failed"],
  ] as const) {
    const probe = service({ create: async () => ({ ok: false, error }) });
    assert.deepEqual(await probe.completion.resumeTenantCreation(attemptId), {
      kind: "rejected",
      error: { code: expected, retryable: error.retryable },
    });
    assert.equal(probe.creationCalls(), 1);
    assert.equal(probe.store.tenantCreatedCalls, 0);
  }
});

test("safe audit delivery cannot block or replace completion authority", async () => {
  for (const audit of [
    () => { throw new Error("private audit detail"); },
    () => Promise.reject(new Error("private audit rejection")),
    () => new Promise<void>(() => undefined),
  ]) {
    const probe = service({ audit });
    const result = await Promise.race([
      probe.completion.resumeTenantCreation(attemptId),
      new Promise<{ kind: "blocked" }>((resolve) => setTimeout(() => resolve({ kind: "blocked" }), 40)),
    ]);
    assert.equal(result.kind, "tenant_created");
  }
});
