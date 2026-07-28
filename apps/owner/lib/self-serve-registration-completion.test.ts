import assert from "node:assert/strict";
import test from "node:test";

import type { CreateStarterTenantResult } from "@celebix/saas-contracts";

import {
  IdentityPersistenceError,
  RegistrationCompletionCorruptionError,
} from "./saas-persistence/postgres-identity-common.ts";
import type {
  CompletionClaimOutcome,
  CompletionTransitionInput,
  FinalizeTenantCompletionInput,
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
    limits: { products: 100, staff: 1, storageBytes: 1_000_000_000, monthlyOrders: 100, customDomains: 0 },
    validFrom: tenantInput.requestedAt,
  },
  mediaStorage: { schemaVersion: 1, status: "ready", version: 1 },
  provisioningStatus: "ready",
  panelUrl: "https://panel.celebix.site/stores/safe-store",
  storefrontUrl: "https://safe-store.celebix.site",
};

function authority(
  completionState: "ready" | "creating" | "commit_unknown" | "completed" = "ready",
  workflowStatus: PersistentRegistrationWorkflow["status"] = completionState === "completed" ? "tenant_created" : "identity_verified",
  workflowVersion = workflowStatus === "tenant_created" ? 3 : 2,
  completionVersion = completionState === "ready" ? 1 : 2,
): VerifiedRegistrationAuthority {
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
    status: workflowStatus,
    version: workflowVersion,
    canonicalFingerprint: fingerprint,
    consumedAt: "2026-07-12T10:01:00.000Z",
    verifiedIdentity: {
      issuer: tenantInput.principal.issuer,
      subject: tenantInput.principal.subject,
      email: tenantInput.principal.email,
      emailVerified: true,
    },
    tenantInput,
    completion: {
      state: completionState,
      version: completionVersion,
      updatedAt: now.toISOString(),
      ...(completionState === "creating" || completionState === "commit_unknown" || completionState === "completed"
        ? { startedAt: now.toISOString() }
        : {}),
      ...(completionState === "commit_unknown" ? { commitUnknownAt: now.toISOString() } : {}),
      ...(completionState === "completed" ? { completedAt: now.toISOString(), tenantOperationId: tenantResult.operationId } : {}),
    },
  };
}

function staleCreatingAuthority(): VerifiedRegistrationAuthority {
  const value = authority("creating");
  value.completion.startedAt = new Date(now.getTime() - 120_000).toISOString();
  value.completion.updatedAt = value.completion.startedAt;
  return value;
}

class WorkflowStore implements PersistentRegistrationCompletionStore {
  current = authority();
  recordCalls = 0;
  claimCalls = 0;
  commitUnknownCalls = 0;
  releaseCalls = 0;
  finalizeCalls = 0;
  absentCalls = 0;
  activeLease = false;
  failClaim: Error | undefined;
  failCommitUnknown: Error | undefined;
  failFinalize: Error | undefined;
  leaseRelease: () => unknown = () => { this.activeLease = false; };
  leaseReleaseCalls = 0;

  async recordVerifiedIdentity(input: RecordVerifiedIdentityInput): Promise<RecordVerifiedIdentityOutcome> {
    this.recordCalls += 1;
    assert.equal(input.attemptId, attemptId);
    return { kind: "recorded", authority: this.current };
  }

  async loadVerified(): Promise<VerifiedRegistrationAuthority> {
    return structuredClone(this.current);
  }

  async claimTenantCompletion(): Promise<CompletionClaimOutcome> {
    this.claimCalls += 1;
    if (this.failClaim) throw this.failClaim;
    if (this.current.completion.state === "ready") {
      if (this.current.completion.recoveryAbsentAt) {
        return { kind: "recovery_required", authority: structuredClone(this.current) };
      }
      this.current = authority("creating", "identity_verified", this.current.version, this.current.completion.version + 1);
      this.activeLease = true;
      return {
        kind: "claimed",
        authority: structuredClone(this.current),
        lease: { release: (() => { this.leaseReleaseCalls += 1; return this.leaseRelease(); }) as () => void },
      };
    }
    if (this.current.completion.state === "creating") return { kind: "in_progress", authority: structuredClone(this.current) };
    if (this.current.completion.state === "commit_unknown") return { kind: "commit_unknown", authority: structuredClone(this.current) };
    return { kind: "completed", authority: structuredClone(this.current) };
  }

  async isTenantCompletionActive(): Promise<boolean> { return this.activeLease; }

  async markTenantCompletionCommitUnknown(_input: CompletionTransitionInput): Promise<VerifiedRegistrationAuthority> {
    this.commitUnknownCalls += 1;
    if (this.failCommitUnknown) throw this.failCommitUnknown;
    this.current = authority("commit_unknown", "identity_verified", this.current.version, this.current.completion.version + 1);
    return structuredClone(this.current);
  }

  async releaseTenantCompletion(_input: CompletionTransitionInput): Promise<VerifiedRegistrationAuthority> {
    this.releaseCalls += 1;
    this.current = authority("ready", "identity_verified", this.current.version, this.current.completion.version + 1);
    return structuredClone(this.current);
  }

  async finalizeTenantCompletion(_input: FinalizeTenantCompletionInput): Promise<VerifiedRegistrationAuthority> {
    this.finalizeCalls += 1;
    if (this.failFinalize) throw this.failFinalize;
    this.current = authority("completed", "tenant_created", this.current.version + 1, this.current.completion.version + 1);
    return structuredClone(this.current);
  }

  async recoverAbsentTenantCompletion(_input: CompletionTransitionInput): Promise<VerifiedRegistrationAuthority> {
    this.absentCalls += 1;
    this.current = authority("ready", "identity_verified", this.current.version, this.current.completion.version + 1);
    this.current.completion.recoveryAbsentAt = now.toISOString();
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
        return options.recover?.() ?? {
          kind: "committed_match",
          result: { ...structuredClone(tenantResult), replayed: true },
        };
      },
    },
    panelOrigin: "https://panel.celebix.site",
    platformDomainSuffix: "celebix.site",
    clock: () => now,
    audit: options.audit ?? (() => undefined),
  });
  return { completion, store, creationCalls: () => creationCalls, recoveryCalls: () => recoveryCalls };
}

test("recording verified identity remains durable-only", async () => {
  const probe = service({});
  assert.deepEqual(await probe.completion.recordVerifiedIdentity({ attemptId, expectedVersion: 1, identity: tenantInput.principal }), {
    kind: "identity_recorded", status: "identity_verified", version: 2,
  });
  assert.equal(probe.creationCalls(), 0);
});

test("resume claims ready before invoking Tenant Core and finalizes atomically", async () => {
  const probe = service({});
  const result = await probe.completion.resumeTenantCreation(attemptId);
  assert.equal(result.kind, "tenant_created");
  assert.equal(probe.store.claimCalls, 1);
  assert.equal(probe.creationCalls(), 1);
  assert.equal(probe.store.finalizeCalls, 1);
  assert.equal(probe.store.current.status, "tenant_created");
  assert.equal(probe.store.current.completion.state, "completed");
  assert.equal("markTenantCreated" in probe.store, false);
});

test("two concurrent resumes fence Tenant Core to exactly one invocation", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const probe = service({ create: async () => { await gate; return { ok: true, value: structuredClone(tenantResult) }; } });
  const winner = probe.completion.resumeTenantCreation(attemptId);
  while (probe.creationCalls() === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  const loser = await probe.completion.resumeTenantCreation(attemptId);
  assert.deepEqual(loser, { kind: "in_progress" });
  assert.equal(probe.creationCalls(), 1);
  release();
  assert.equal((await winner).kind, "tenant_created");
});

test("post-finalization responses use the persisted result graph, never caller-supplied nested authorities", async () => {
  const fabricated: CreateStarterTenantResult = {
    ...structuredClone(tenantResult),
    store: { ...tenantResult.store, id: "10000000-0000-4000-8000-000000000099" },
    primaryDomain: {
      ...tenantResult.primaryDomain,
      domainId: "20000000-0000-4000-8000-000000000099",
      storeId: "10000000-0000-4000-8000-000000000099",
    },
    membership: {
      ...tenantResult.membership,
      id: "30000000-0000-4000-8000-000000000099",
      principalId: "40000000-0000-4000-8000-000000000099",
      storeId: "10000000-0000-4000-8000-000000000099",
    },
    plan: { ...tenantResult.plan, planId: "50000000-0000-4000-8000-000000000099" },
  };
  const probe = service({ create: async () => ({ ok: true, value: fabricated }) });
  assert.deepEqual(await probe.completion.resumeTenantCreation(attemptId), {
    kind: "tenant_created",
    result: tenantResult,
  });
  assert.equal(probe.recoveryCalls(), 1);
});

test("a reconciler winning the destroyed-lease finalization gap still yields authoritative success", async () => {
  const store = new WorkflowStore();
  store.failFinalize = new IdentityPersistenceError();
  store.leaseRelease = () => {
    store.activeLease = false;
    store.current = authority("completed", "tenant_created", 3, 3);
  };
  const probe = service({ store });
  assert.deepEqual(await probe.completion.resumeTenantCreation(attemptId), {
    kind: "tenant_created",
    result: tenantResult,
  });
  assert.equal(probe.creationCalls(), 1);
  assert.equal(probe.recoveryCalls(), 1);
});

test("creating and commit_unknown never invoke Tenant Core and require recovery", async () => {
  for (const [state, expected] of [["creating", "in_progress"], ["commit_unknown", "reconciliation_required"]] as const) {
    const store = new WorkflowStore();
    store.current = authority(state);
    const probe = service({ store });
    assert.deepEqual(await probe.completion.resumeTenantCreation(attemptId), { kind: expected });
    assert.equal(probe.creationCalls(), 0);
  }
});

test("completed response-loss resume is read-only and returns the exact committed operation", async () => {
  const store = new WorkflowStore();
  store.current = authority("completed");
  const probe = service({ store, recover: async () => ({ kind: "committed_match", result: { ...structuredClone(tenantResult), replayed: true } }) });
  assert.deepEqual(await probe.completion.resumeTenantCreation(attemptId), {
    kind: "tenant_already_created",
    result: { ...structuredClone(tenantResult), replayed: true },
  });
  assert.equal(probe.creationCalls(), 0);
  assert.equal(probe.recoveryCalls(), 1);
  assert.equal(store.finalizeCalls, 0);
  assert.equal(store.current.completion.version, 2);
});

test("completed response-loss reconciliation is read-only and never reopens durable state", async () => {
  const store = new WorkflowStore();
  store.current = authority("completed");
  const probe = service({ store, recover: async () => ({ kind: "committed_match", result: { ...structuredClone(tenantResult), replayed: true } }) });
  assert.deepEqual(await probe.completion.reconcileUnknownCommit(attemptId), {
    kind: "tenant_recovered",
    result: { ...structuredClone(tenantResult), replayed: true },
  });
  assert.equal(probe.creationCalls(), 0);
  assert.equal(store.finalizeCalls, 0);
  assert.equal(store.current.status, "tenant_created");
  assert.equal(store.current.completion.version, 2);
});

test("completed recovery fails closed for mismatched operation and every non-committed classification", async () => {
  const cases = [
    { kind: "committed_match", result: { ...structuredClone(tenantResult), operationId: "70000000-0000-4000-8000-000000000002", replayed: true } },
    { kind: "committed_mismatch" },
    { kind: "corrupt" },
    { kind: "absent" },
    { kind: "processing" },
    { kind: "failed" },
  ];
  for (const recovery of cases) {
    const store = new WorkflowStore();
    store.current = authority("completed");
    const probe = service({ store, recover: async () => recovery });
    assert.deepEqual(await probe.completion.resumeTenantCreation(attemptId), {
      kind: "rejected", error: { code: "durable_authority_invalid", retryable: false },
    });
    assert.equal(probe.creationCalls(), 0);
    assert.equal(store.finalizeCalls, 0);
  }
});

test("completed recovery transport failure is retryable without tenant creation", async () => {
  const store = new WorkflowStore();
  store.current = authority("completed");
  const probe = service({ store, recover: async () => { throw new Error("private pool state"); } });
  assert.deepEqual(await probe.completion.resumeTenantCreation(attemptId), {
    kind: "rejected", error: { code: "tenant_transaction_failed", retryable: true },
  });
  assert.equal(probe.creationCalls(), 0);
});

test("a creating restart performs read-only recovery before any Tenant Core call", async () => {
  const store = new WorkflowStore();
  store.current = staleCreatingAuthority();
  const probe = service({ store, recover: async () => ({ kind: "committed_match", result: { ...structuredClone(tenantResult), replayed: true } }) });
  assert.deepEqual(await probe.completion.resumeTenantCreation(attemptId), { kind: "in_progress" });
  const reconciled = await probe.completion.reconcileUnknownCommit(attemptId);
  assert.equal(reconciled.kind, "tenant_recovered");
  assert.equal(probe.creationCalls(), 0);
  assert.equal(probe.recoveryCalls(), 1);
  assert.equal(store.current.completion.state, "completed");
});

test("fresh creating reconciliation stays pending and cannot reopen active work", async () => {
  const store = new WorkflowStore();
  store.current = authority("creating");
  store.activeLease = true;
  const probe = service({ store, recover: async () => ({ kind: "absent" }) });
  assert.deepEqual(await probe.completion.reconcileUnknownCommit(attemptId), { kind: "pending" });
  assert.equal(probe.recoveryCalls(), 0);
  assert.equal(store.absentCalls, 0);
  assert.equal(store.current.completion.state, "creating");
});

test("unknown COMMIT is returned only after the durable marker succeeds", async () => {
  const probe = service({ create: async () => ({ ok: false, error: { schemaVersion: 1, code: "tenant_transaction_failed", retryable: false } }) });
  assert.deepEqual(await probe.completion.resumeTenantCreation(attemptId), { kind: "commit_unknown" });
  assert.equal(probe.store.commitUnknownCalls, 1);
  assert.equal(probe.store.current.completion.state, "commit_unknown");
  assert.equal(probe.recoveryCalls(), 0);
});

test("unknown-COMMIT marker failure returns completion_state_unknown", async () => {
  const store = new WorkflowStore();
  store.failCommitUnknown = new IdentityPersistenceError();
  const probe = service({ store, create: async () => ({ ok: false, error: { schemaVersion: 1, code: "tenant_transaction_failed", retryable: false } }) });
  assert.deepEqual(await probe.completion.resumeTenantCreation(attemptId), { kind: "completion_state_unknown" });
  assert.equal(store.current.completion.state, "creating");
  assert.equal(probe.creationCalls(), 1);
});

test("confirmed failures release creating to ready before returning their safe result", async () => {
  const probe = service({ create: async () => ({ ok: false, error: { schemaVersion: 1, code: "slug_taken", retryable: false } }) });
  assert.deepEqual(await probe.completion.resumeTenantCreation(attemptId), {
    kind: "rejected", error: { code: "slug_taken", retryable: false },
  });
  assert.equal(probe.store.releaseCalls, 1);
  assert.equal(probe.store.current.completion.state, "ready");
});

test("an unclassified Tenant Core throw stays creating and requires recovery-first", async () => {
  const probe = service({ create: async () => { throw new Error("private transport state"); } });
  assert.deepEqual(await probe.completion.resumeTenantCreation(attemptId), { kind: "completion_state_unknown" });
  assert.equal(probe.store.releaseCalls, 0);
  assert.equal(probe.store.current.completion.state, "creating");
  assert.equal(probe.creationCalls(), 1);
});

test("post-success finalization failure is reconciliation_required, never corruption or retryable creation", async () => {
  const store = new WorkflowStore();
  store.failFinalize = new IdentityPersistenceError();
  const probe = service({ store });
  assert.deepEqual(await probe.completion.resumeTenantCreation(attemptId), { kind: "reconciliation_required" });
  assert.equal(probe.creationCalls(), 1);
  assert.equal(store.current.completion.state, "creating");
});

test("committed recovery finalization failure remains reconciliation_required", async () => {
  const store = new WorkflowStore();
  store.current = authority("commit_unknown");
  store.failFinalize = new IdentityPersistenceError();
  const probe = service({ store, recover: async () => ({ kind: "committed_match", result: { ...structuredClone(tenantResult), replayed: true } }) });
  assert.deepEqual(await probe.completion.reconcileUnknownCommit(attemptId), { kind: "reconciliation_required" });
  assert.equal(probe.creationCalls(), 0);
  assert.equal(store.current.completion.state, "commit_unknown");
});

test("finalization corruption remains fail-closed and distinct from transient persistence", async () => {
  const creationStore = new WorkflowStore();
  creationStore.failFinalize = new RegistrationCompletionCorruptionError();
  assert.deepEqual(await service({ store: creationStore }).completion.resumeTenantCreation(attemptId), {
    kind: "rejected", error: { code: "durable_authority_invalid", retryable: false },
  });

  const recoveryStore = new WorkflowStore();
  recoveryStore.current = authority("commit_unknown");
  recoveryStore.failFinalize = new RegistrationCompletionCorruptionError();
  assert.deepEqual(await service({ store: recoveryStore, recover: async () => ({ kind: "committed_match", result: { ...structuredClone(tenantResult), replayed: true } }) }).completion.reconcileUnknownCommit(attemptId), {
    kind: "rejected", error: { code: "durable_authority_invalid", retryable: false },
  });
});

test("absent recovery atomically returns completion to ready without tenant creation", async () => {
  for (const state of ["creating", "commit_unknown"] as const) {
    const store = new WorkflowStore();
    store.current = state === "creating" ? staleCreatingAuthority() : authority(state);
    const probe = service({ store, recover: async () => ({ kind: "absent" }) });
    assert.deepEqual(await probe.completion.reconcileUnknownCommit(attemptId), { kind: "recovery_absent", state: "ready" });
    assert.equal(probe.creationCalls(), 0);
    assert.equal(store.absentCalls, 1);
    assert.equal(store.current.completion.state, "ready");
    assert.equal(store.current.completion.recoveryAbsentAt, now.toISOString());
  }
});

test("recovery-fenced ready is read-only until reconciliation proves a committed operation", async () => {
  const store = new WorkflowStore();
  store.current = authority("ready", "identity_verified", 2, 3);
  store.current.completion.recoveryAbsentAt = now.toISOString();
  let recovery: any = { kind: "absent" };
  const probe = service({ store, recover: async () => recovery });

  assert.deepEqual(await probe.completion.resumeTenantCreation(attemptId), { kind: "reconciliation_required" });
  assert.equal(probe.creationCalls(), 0);
  assert.deepEqual(await probe.completion.reconcileUnknownCommit(attemptId), { kind: "recovery_absent", state: "ready" });
  assert.equal(store.current.completion.version, 3);
  assert.equal(store.absentCalls, 0);

  recovery = { kind: "committed_match", result: { ...structuredClone(tenantResult), replayed: true } };
  assert.deepEqual(await probe.completion.reconcileUnknownCommit(attemptId), {
    kind: "tenant_recovered",
    result: { ...structuredClone(tenantResult), replayed: true },
  });
  assert.equal(probe.creationCalls(), 0);
  assert.equal(store.commitUnknownCalls, 1);
  assert.equal(store.current.completion.state, "completed");
});

test("processing, failed, mismatch, and corruption recovery never invoke Tenant Core", async () => {
  for (const [kind, expected] of [
    ["processing", { kind: "pending" }],
    ["failed", { kind: "failed" }],
    ["committed_mismatch", { kind: "rejected", error: { code: "durable_authority_invalid", retryable: false } }],
    ["corrupt", { kind: "rejected", error: { code: "durable_authority_invalid", retryable: false } }],
  ] as const) {
    const store = new WorkflowStore();
    store.current = staleCreatingAuthority();
    const probe = service({ store, recover: async () => ({ kind }) });
    assert.deepEqual(await probe.completion.reconcileUnknownCommit(attemptId), expected);
    assert.equal(probe.creationCalls(), 0);
  }
});

test("malformed or authority-inconsistent Tenant Core success cannot finalize", async () => {
  for (const result of [
    { ...structuredClone(tenantResult), operationId: "not-a-uuid" },
    { ...structuredClone(tenantResult), unexpectedAuthority: true },
    { ...structuredClone(tenantResult), store: { ...tenantResult.store, slug: "wrong-store" } },
    { ...structuredClone(tenantResult), store: { ...tenantResult.store, unexpectedAuthority: true } },
    { ...structuredClone(tenantResult), primaryDomain: { ...tenantResult.primaryDomain, storeId: "wrong-store-id" } },
    { ...structuredClone(tenantResult), primaryDomain: { ...tenantResult.primaryDomain, domainId: "wrong-domain-id" } },
    { ...structuredClone(tenantResult), membership: { ...tenantResult.membership, storeId: "wrong-store-id" } },
    { ...structuredClone(tenantResult), membership: { ...tenantResult.membership, principalId: "wrong-principal-id" } },
    { ...structuredClone(tenantResult), store: { ...tenantResult.store, status: "suspended" } },
    { ...structuredClone(tenantResult), primaryDomain: { ...tenantResult.primaryDomain, status: "pending" } },
    { ...structuredClone(tenantResult), membership: { ...tenantResult.membership, updatedAt: "not-a-timestamp" } },
    { ...structuredClone(tenantResult), membership: { ...tenantResult.membership, createdAt: "2026-07-12T10:00:01.000Z" } },
    { ...structuredClone(tenantResult), membership: { ...tenantResult.membership, updatedAt: "2026-07-12T10:00:01.000Z" } },
    { ...structuredClone(tenantResult), plan: { ...tenantResult.plan, version: 2 } },
    { ...structuredClone(tenantResult), plan: { ...tenantResult.plan, planId: "wrong-plan-id" } },
    { ...structuredClone(tenantResult), plan: { ...tenantResult.plan, validFrom: "2026-07-12T10:00:01.000Z" } },
    { ...structuredClone(tenantResult), plan: { ...tenantResult.plan, features: ["orders", "catalog"] } },
    { ...structuredClone(tenantResult), plan: { ...tenantResult.plan, features: ["catalog", "catalog"] } },
    { ...structuredClone(tenantResult), plan: { ...tenantResult.plan, features: ["catalog", "unsupported"] } },
    { ...structuredClone(tenantResult), plan: { ...tenantResult.plan, limits: { products: 100 } } },
    { ...structuredClone(tenantResult), plan: { ...tenantResult.plan, limits: { ...tenantResult.plan.limits, products: -1 } } },
    { ...structuredClone(tenantResult), plan: { ...tenantResult.plan, limits: { ...tenantResult.plan.limits, staff: 1.5 } } },
    { ...structuredClone(tenantResult), plan: { ...tenantResult.plan, limits: { ...tenantResult.plan.limits, hidden: 1 } } },
    { ...structuredClone(tenantResult), provisioningStatus: "processing" },
    { ...structuredClone(tenantResult), panelUrl: "https://evil.example.test/stores/safe-store" },
    { ...structuredClone(tenantResult), storefrontUrl: "https://evil.example.test" },
  ]) {
    const probe = service({ create: async () => ({ ok: true, value: result }) });
    assert.deepEqual(await probe.completion.resumeTenantCreation(attemptId), {
      kind: "rejected", error: { code: "durable_authority_invalid", retryable: false },
    });
    assert.equal(probe.store.finalizeCalls, 0);
    assert.equal(probe.store.current.completion.state, "creating");
  }
});

test("authoritative results never wait for a non-settling lease cleanup", async () => {
  for (const create of [
    async () => ({ ok: true, value: structuredClone(tenantResult) }),
    async () => ({ ok: false, error: { schemaVersion: 1, code: "tenant_transaction_failed", retryable: false } }),
    async () => ({ ok: false, error: { schemaVersion: 1, code: "slug_taken", retryable: false } }),
  ]) {
    const store = new WorkflowStore();
    store.leaseRelease = () => new Promise<void>(() => undefined);
    const probe = service({ store, create });
    const result = await Promise.race([
      probe.completion.resumeTenantCreation(attemptId),
      new Promise<{ kind: "blocked" }>((resolve) => setTimeout(() => resolve({ kind: "blocked" }), 40)),
    ]);
    assert.notEqual(result.kind, "blocked");
  }
});

test("transient claim persistence and durable corruption remain distinguishable", async () => {
  const transientStore = new WorkflowStore();
  transientStore.failClaim = new IdentityPersistenceError();
  assert.deepEqual(await service({ store: transientStore }).completion.resumeTenantCreation(attemptId), {
    kind: "rejected", error: { code: "completion_persistence_failed", retryable: true },
  });

  const corruptStore = new WorkflowStore();
  corruptStore.failClaim = new RegistrationCompletionCorruptionError();
  assert.deepEqual(await service({ store: corruptStore }).completion.resumeTenantCreation(attemptId), {
    kind: "rejected", error: { code: "durable_authority_invalid", retryable: false },
  });
});

test("safe audit remains non-blocking across completion transitions", async () => {
  for (const audit of [
    () => { throw new Error("private audit detail"); },
    () => Promise.reject(new Error("private audit rejection")),
    () => new Promise<void>(() => undefined),
  ]) {
    const result = await Promise.race([
      service({ audit }).completion.resumeTenantCreation(attemptId),
      new Promise<{ kind: "blocked" }>((resolve) => setTimeout(() => resolve({ kind: "blocked" }), 40)),
    ]);
    assert.equal(result.kind, "tenant_created");
  }
});
