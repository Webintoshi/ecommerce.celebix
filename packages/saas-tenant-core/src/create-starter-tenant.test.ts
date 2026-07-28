import assert from "node:assert/strict";
import test from "node:test";

import {
  PLAN_FEATURE_KEYS,
  PLAN_LIMIT_KEYS,
  type CreateStarterTenantInput,
  type CreateStarterTenantResult,
  type StoreMembership,
} from "@celebix/saas-contracts";
import {
  SaaSDataUnknownCommitError,
  SaaSDataUniqueConflict,
  createCanonicalTenantFingerprint,
  type DomainRecord,
  type MembershipRecord,
  type PrincipalRecord,
  type SaaSDataRepository,
  type SaaSDataTransaction,
  type StoreRecord,
  type SubscriptionRecord,
  type TenantOperationRecord,
} from "@celebix/saas-data";
import { createInMemorySaaSDataRepository } from "@celebix/saas-data/testing";

import { createStarterTenantService } from "./index.ts";

const baseInput: CreateStarterTenantInput = {
  schemaVersion: 1,
  idempotencyKey: "opaque-request-1",
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
  consents: {
    privacyAcceptedAt: "2026-07-10T00:00:00.000Z",
  },
  requestedAt: "2026-07-10T00:00:00.000Z",
};

function requireSuccess(outcome: Awaited<ReturnType<ReturnType<typeof createStarterTenantService>["execute"]>>) {
  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    throw new Error("Expected success");
  }
  return outcome.value;
}

function requireError(outcome: Awaited<ReturnType<ReturnType<typeof createStarterTenantService>["execute"]>>) {
  assert.equal(outcome.ok, false);
  if (outcome.ok) {
    throw new Error("Expected error, received success");
  }
  return outcome.error;
}

function overrideTransaction(
  transaction: SaaSDataTransaction,
  overrides: Partial<Pick<SaaSDataTransaction, "principals" | "subscriptions" | "operations">>,
): SaaSDataTransaction {
  return {
    principals: overrides.principals ?? transaction.principals,
    stores: transaction.stores,
    domains: transaction.domains,
    memberships: transaction.memberships,
    plans: transaction.plans,
    subscriptions: overrides.subscriptions ?? transaction.subscriptions,
    settings: transaction.settings,
    mediaNamespaces: transaction.mediaNamespaces,
    operations: overrides.operations ?? transaction.operations,
    generateId: transaction.generateId.bind(transaction),
    commit: transaction.commit.bind(transaction),
    rollback: transaction.rollback.bind(transaction),
  };
}

function transformTransactions(
  repository: SaaSDataRepository,
  transform: (transaction: SaaSDataTransaction) => SaaSDataTransaction,
): SaaSDataRepository {
  return {
    beginTransaction: async () => transform(await repository.beginTransaction()),
  };
}

async function committedOperationFixture() {
  const repository = createInMemorySaaSDataRepository();
  const result = requireSuccess(await createStarterTenantService({ repository }).execute(baseInput));
  const operation = repository.inspectState().operations[0];
  assert.ok(operation);
  return { operation, result };
}

test("successfully bootstraps an atomic free starter tenant", async () => {
  const repository = createInMemorySaaSDataRepository();
  const service = createStarterTenantService({ repository });

  const result = requireSuccess(await service.execute(baseInput));
  const state = repository.inspectState();

  assert.equal(result.replayed, false);
  assert.equal(result.store.slug, "ornek-magaza");
  assert.equal(result.store.status, "active");
  assert.equal(result.primaryDomain.hostname, "ornek-magaza.celebix.site");
  assert.equal(result.membership.role, "store_owner");
  assert.equal(result.membership.status, "active");
  assert.equal(result.plan.planCode, "free_starter");
  assert.equal(result.plan.version, 1);
  assert.deepEqual(result.mediaStorage, { schemaVersion: 1, status: "ready", version: 1 });
  assert.equal(result.provisioningStatus, "ready");
  assert.equal(state.principals.length, 1);
  assert.equal(state.stores.length, 1);
  assert.equal(state.domains.length, 1);
  assert.equal(state.memberships.length, 1);
  assert.equal(state.subscriptions.length, 1);
  assert.deepEqual(state.mediaNamespaces, [{
    storeId: result.store.id,
    namespacePrefix: `stores/${result.store.id}/`,
    status: "active",
    version: 1,
    createdAt: baseInput.requestedAt,
    updatedAt: baseInput.requestedAt,
  }]);
  assert.equal(state.settings.length, 3);
  assert.equal(state.operations.length, 1);
  assert.equal(state.operations[0]?.status, "committed");
  assert.equal(repository.inspectMetrics().commits, 1);
});

test("same idempotency key and fingerprint replays the committed result", async () => {
  const repository = createInMemorySaaSDataRepository();
  const service = createStarterTenantService({ repository });

  const first = requireSuccess(await service.execute(baseInput));
  const replay = requireSuccess(await service.execute(baseInput));

  assert.deepEqual(replay, { ...first, replayed: true });
  assert.equal(repository.inspectState().stores.length, 1);
  assert.equal(repository.inspectState().mediaNamespaces.length, 1);
});

test("same idempotency key with changed payload fails with idempotency_mismatch", async () => {
  const repository = createInMemorySaaSDataRepository();
  const service = createStarterTenantService({ repository });
  requireSuccess(await service.execute(baseInput));

  const error = requireError(
    await service.execute({ ...baseInput, store: { ...baseInput.store, name: "Changed Store" } }),
  );

  assert.equal(error.code, "idempotency_mismatch");
  assert.equal(repository.inspectState().stores.length, 1);
});

test("slug and domain conflicts map to safe contract errors", async () => {
  const slugRepository = createInMemorySaaSDataRepository();
  const slugService = createStarterTenantService({ repository: slugRepository });
  requireSuccess(await slugService.execute(baseInput));
  const slugError = requireError(
    await slugService.execute({
      ...baseInput,
      idempotencyKey: "opaque-request-2",
      principal: { ...baseInput.principal, subject: "subject-2" },
    }),
  );
  assert.equal(slugError.code, "slug_taken");

  const existingDomain: DomainRecord = {
    id: "domain_existing",
    storeId: "store_existing",
    hostname: "ornek-magaza.celebix.site",
    type: "platform_subdomain",
    status: "active",
    canonical: true,
    cacheVersion: 1,
    createdAt: baseInput.requestedAt,
    updatedAt: baseInput.requestedAt,
  };
  const domainRepository = createInMemorySaaSDataRepository({ initialState: { domains: [existingDomain] } });
  const domainService = createStarterTenantService({ repository: domainRepository });
  const domainError = requireError(await domainService.execute(baseInput));
  assert.equal(domainError.code, "domain_conflict");
  assert.equal(domainRepository.inspectState().stores.length, 0);
});

test("principal authority is issuer plus subject rather than email", async () => {
  const repository = createInMemorySaaSDataRepository();
  const service = createStarterTenantService({ repository });
  requireSuccess(await service.execute(baseInput));
  requireSuccess(
    await service.execute({
      ...baseInput,
      idempotencyKey: "opaque-request-2",
      principal: { ...baseInput.principal, subject: "subject-2" },
      store: { ...baseInput.store, name: "Ikinci Magaza", slug: "ikinci-magaza" },
    }),
  );

  const principals = repository.inspectState().principals;
  assert.equal(principals.length, 2);
  assert.equal(new Set(principals.map((principal) => principal.email)).size, 1);
  assert.equal(new Set(principals.map((principal) => principal.subject)).size, 2);
});

test("same issuer and subject reuse the principal when verified email is unchanged", async () => {
  const repository = createInMemorySaaSDataRepository();
  const service = createStarterTenantService({ repository });
  requireSuccess(await service.execute(baseInput));
  requireSuccess(
    await service.execute({
      ...baseInput,
      idempotencyKey: "opaque-request-2",
      store: { ...baseInput.store, name: "Ikinci Magaza", slug: "ikinci-magaza" },
    }),
  );

  assert.equal(repository.inspectState().principals.length, 1);
  assert.equal(repository.inspectState().stores.length, 2);
});

test("changed verified email updates metadata and permits a second store", async () => {
  const repository = createInMemorySaaSDataRepository();
  const service = createStarterTenantService({ repository });
  requireSuccess(await service.execute(baseInput));
  requireSuccess(
    await service.execute({
      ...baseInput,
      idempotencyKey: "opaque-request-2",
      principal: { ...baseInput.principal, email: "new-owner@example.test" },
      store: { ...baseInput.store, name: "Ikinci Magaza", slug: "ikinci-magaza" },
    }),
  );

  const state = repository.inspectState();
  assert.equal(state.principals.length, 1);
  assert.equal(state.principals[0]?.email, "new-owner@example.test");
  assert.equal(state.principals[0]?.issuer, baseInput.principal.issuer);
  assert.equal(state.principals[0]?.subject, baseInput.principal.subject);
  assert.equal(state.stores.length, 2);
});

test("same subject under a different issuer remains a separate principal", async () => {
  const repository = createInMemorySaaSDataRepository();
  const service = createStarterTenantService({ repository });
  requireSuccess(await service.execute(baseInput));
  requireSuccess(
    await service.execute({
      ...baseInput,
      idempotencyKey: "opaque-request-2",
      principal: { ...baseInput.principal, issuer: "https://second-auth.example.test/oidc" },
      store: { ...baseInput.store, name: "Ikinci Magaza", slug: "ikinci-magaza" },
    }),
  );

  const principals = repository.inspectState().principals;
  assert.equal(principals.length, 2);
  assert.equal(new Set(principals.map((principal) => principal.issuer)).size, 2);
  assert.equal(new Set(principals.map((principal) => principal.subject)).size, 1);
});

test("verified email metadata update failure rolls back the full bootstrap", async () => {
  const principal: PrincipalRecord = {
    id: "principal_existing",
    issuer: baseInput.principal.issuer,
    subject: baseInput.principal.subject,
    email: baseInput.principal.email,
    emailVerified: true,
    createdAt: baseInput.requestedAt,
    updatedAt: baseInput.requestedAt,
  };
  const repository = createInMemorySaaSDataRepository({
    failAt: "after_principal_email_update",
    initialState: { principals: [principal] },
  });
  const service = createStarterTenantService({ repository });
  const error = requireError(
    await service.execute({
      ...baseInput,
      principal: { ...baseInput.principal, email: "new-owner@example.test" },
    }),
  );

  const state = repository.inspectState();
  assert.equal(error.code, "tenant_transaction_failed");
  assert.equal(state.principals[0]?.email, baseInput.principal.email);
  assert.equal(state.stores.length, 0);
  assert.equal(state.operations.length, 0);
});

test("runtime-unverified identity cannot create a tenant", async () => {
  const repository = createInMemorySaaSDataRepository();
  const service = createStarterTenantService({ repository });
  const unverified = structuredClone(baseInput) as unknown as Record<string, unknown>;
  (unverified.principal as Record<string, unknown>).emailVerified = false;

  const error = requireError(await service.execute(unverified));
  assert.equal(error.code, "identity_unverified");
  assert.equal(repository.inspectState().stores.length, 0);
  assert.equal(repository.inspectMetrics().begins, 0);
});

test("timestamps must use canonical millisecond UTC form before a transaction begins", async () => {
  for (const timestamp of [
    "2026-07-10T03:00:00.000+03:00",
    "2026-07-10T00:00:00",
    "July 10, 2026 00:00:00 UTC",
    "2026-02-30T00:00:00.000Z",
    "2026-07-10T00:00:00Z",
    "not-a-date",
  ]) {
    const repository = createInMemorySaaSDataRepository();
    const service = createStarterTenantService({ repository });
    const error = requireError(await service.execute({ ...baseInput, requestedAt: timestamp }));
    assert.equal(error.code, "invalid_input", timestamp);
    assert.equal(error.field, "requestedAt", timestamp);
    assert.equal(repository.inspectMetrics().begins, 0, timestamp);
  }
});

test("canonical UTC timestamps are accepted for all consent fields", async () => {
  const repository = createInMemorySaaSDataRepository();
  const result = requireSuccess(
    await createStarterTenantService({ repository }).execute({
      ...baseInput,
      consents: {
        privacyAcceptedAt: "2026-07-10T00:00:00.000Z",
        marketingAcceptedAt: "2026-07-10T00:00:01.000Z",
      },
    }),
  );
  assert.equal(result.replayed, false);
});

test("idempotency key must be exact, trimmed, non-empty, and at most 128 characters", async () => {
  for (const idempotencyKey of [" leading", "trailing ", "   ", "a".repeat(129)]) {
    const repository = createInMemorySaaSDataRepository();
    const error = requireError(
      await createStarterTenantService({ repository }).execute({ ...baseInput, idempotencyKey }),
    );
    assert.equal(error.code, "invalid_input", JSON.stringify(idempotencyKey));
    assert.equal(error.field, "idempotencyKey", JSON.stringify(idempotencyKey));
    assert.equal(repository.inspectMetrics().begins, 0, JSON.stringify(idempotencyKey));
  }

  for (const idempotencyKey of ["canonical-opaque-key", "a".repeat(128)]) {
    const repository = createInMemorySaaSDataRepository();
    const result = requireSuccess(
      await createStarterTenantService({ repository }).execute({ ...baseInput, idempotencyKey }),
    );
    assert.equal(result.replayed, false, String(idempotencyKey.length));
  }
});

test("non-canonical consent timestamps fail before a transaction begins", async () => {
  for (const consents of [
    { privacyAcceptedAt: "2026-07-10T03:00:00.000+03:00" },
    {
      privacyAcceptedAt: baseInput.consents.privacyAcceptedAt,
      marketingAcceptedAt: "2026-07-10T00:00:01Z",
    },
  ]) {
    const repository = createInMemorySaaSDataRepository();
    const error = requireError(
      await createStarterTenantService({ repository }).execute({ ...baseInput, consents }),
    );
    assert.equal(error.code, "invalid_input");
    assert.equal(repository.inspectMetrics().begins, 0);
  }
});

test("caller-provided authority IDs are rejected before a transaction starts", async () => {
  const repository = createInMemorySaaSDataRepository();
  const service = createStarterTenantService({ repository });
  const unsafe = { ...structuredClone(baseInput), storeId: "caller-store-id" };

  const error = requireError(await service.execute(unsafe));
  assert.equal(error.code, "invalid_input");
  assert.equal(repository.inspectMetrics().begins, 0);
});

test("transaction acquisition failures map to a safe retryable error", async () => {
  const service = createStarterTenantService({
    repository: {
      beginTransaction: async () => {
        throw new Error("private adapter detail");
      },
    },
  });

  const outcome = await service.execute(baseInput);
  const error = requireError(outcome);
  assert.deepEqual(error, {
    schemaVersion: 1,
    code: "tenant_transaction_failed",
    retryable: true,
  });
  assert.doesNotMatch(JSON.stringify(outcome), /private adapter detail/);
});

test("service construction accepts only an exact HTTPS panel origin", () => {
  const repository = createInMemorySaaSDataRepository();
  for (const accepted of ["https://panel.celebix.site", "https://panel.example.test", "https://panel.example.test/"]) {
    assert.doesNotThrow(() => createStarterTenantService({ repository, panelBaseUrl: accepted }));
  }
  for (const rejected of [
    "http://panel.example.test",
    "https://user:password@panel.example.test",
    "https://panel.example.test?query=1",
    "https://panel.example.test#fragment",
    "https://panel.example.test/path",
    "/relative",
    "not a url",
    "https:///empty-host",
    "https://panel.example.test/%2Fconfused",
    "https://panel.example.test/path/extra",
  ]) {
    assert.throws(() => createStarterTenantService({ repository, panelBaseUrl: rejected }), /invalid_exact_https_origin/, rejected);
  }
});

test("one trailing slash is normalized before constructing the panel store URL", async () => {
  const repository = createInMemorySaaSDataRepository();
  const value = requireSuccess(await createStarterTenantService({ repository, panelBaseUrl: "https://panel.example.test/" }).execute(baseInput));
  assert.equal(value.panelUrl, "https://panel.example.test/stores/ornek-magaza");
});

test("unknown COMMIT outcome is non-retryable and never triggers rollback", async () => {
  const backing = createInMemorySaaSDataRepository();
  let rollbackCalls = 0;
  const repository = transformTransactions(backing, (transaction) => ({
    ...transaction,
    generateId: transaction.generateId.bind(transaction),
    commit: async () => { throw new SaaSDataUnknownCommitError(); },
    rollback: async () => { rollbackCalls += 1; await transaction.rollback(); },
  }));

  const error = requireError(await createStarterTenantService({ repository }).execute(baseInput));
  assert.deepEqual(error, { schemaVersion: 1, code: "tenant_transaction_failed", retryable: false });
  assert.equal(rollbackCalls, 0);
});

test("a failed explicit replay rollback is attempted once and never retried by rollbackSafely", async () => {
  const backing = createInMemorySaaSDataRepository();
  requireSuccess(await createStarterTenantService({ repository: backing }).execute(baseInput));
  let rollbackCalls = 0;
  const repository = transformTransactions(backing, (transaction) => ({
    ...transaction,
    generateId: transaction.generateId.bind(transaction),
    commit: transaction.commit.bind(transaction),
    rollback: async () => {
      rollbackCalls += 1;
      throw new Error("synthetic rollback failure");
    },
  }));

  const error = requireError(await createStarterTenantService({ repository }).execute(baseInput));
  assert.deepEqual(error, { schemaVersion: 1, code: "tenant_transaction_failed", retryable: true });
  assert.equal(rollbackCalls, 1);
});

test("membership conflict maps to membership_conflict", async () => {
  const principal: PrincipalRecord = {
    id: "principal_0001",
    issuer: baseInput.principal.issuer,
    subject: baseInput.principal.subject,
    email: baseInput.principal.email,
    emailVerified: true,
    createdAt: baseInput.requestedAt,
    updatedAt: baseInput.requestedAt,
  };
  const membership: StoreMembership = {
    schemaVersion: 1,
    id: "membership_existing",
    principalId: principal.id,
    storeId: "store_0001",
    role: "store_owner",
    status: "active",
    createdAt: baseInput.requestedAt,
    updatedAt: baseInput.requestedAt,
  };
  const repository = createInMemorySaaSDataRepository({
    initialState: { principals: [principal], memberships: [membership] },
  });
  const service = createStarterTenantService({ repository });

  const error = requireError(await service.execute(baseInput));
  assert.equal(error.code, "membership_conflict");
  assert.equal(repository.inspectState().stores.length, 0);
});

test("failures after each bootstrap stage roll back every partial record", async () => {
  const failurePoints = [
    "after_principal_create",
    "after_store_create",
    "after_domain_create",
    "after_membership_create",
    "after_subscription_create",
    "after_media_namespace_create",
  ] as const;

  for (const failAt of failurePoints) {
    const repository = createInMemorySaaSDataRepository({ failAt });
    const service = createStarterTenantService({ repository });
    const error = requireError(await service.execute(baseInput));
    const state = repository.inspectState();

    assert.equal(error.code, "tenant_transaction_failed", failAt);
    assert.equal(state.principals.length, 0, failAt);
    assert.equal(state.stores.length, 0, failAt);
    assert.equal(state.domains.length, 0, failAt);
    assert.equal(state.memberships.length, 0, failAt);
    assert.equal(state.subscriptions.length, 0, failAt);
    assert.equal(state.mediaNamespaces.length, 0, failAt);
    assert.equal(state.settings.length, 0, failAt);
    assert.equal(state.operations.length, 0, failAt);
    assert.equal(repository.inspectMetrics().rollbacks, 1, failAt);
  }
});

test("concurrent duplicate requests create one store and one replay", async () => {
  const repository = createInMemorySaaSDataRepository();
  const service = createStarterTenantService({ repository });

  const outcomes = await Promise.all([service.execute(baseInput), service.execute(baseInput)]);
  const results = outcomes.map(requireSuccess);

  assert.equal(results.filter((result) => result.replayed).length, 1);
  assert.equal(repository.inspectState().stores.length, 1);
  assert.equal(repository.inspectState().operations.length, 1);
});

test("atomic claim race with the same fingerprint replays the winner", async () => {
  const { operation, result } = await committedOperationFixture();
  const backing = createInMemorySaaSDataRepository();
  const repository = transformTransactions(backing, (transaction) =>
    overrideTransaction(transaction, {
      operations: {
        ...transaction.operations,
        claim: async () => ({ kind: "existing", operation }),
      },
    }),
  );

  const replay = requireSuccess(await createStarterTenantService({ repository }).execute(baseInput));
  assert.deepEqual(replay, { ...result, replayed: true });
  const state = backing.inspectState();
  assert.equal(state.operations.length, 0);
  assert.equal(state.stores.length, 0);
  assert.equal(state.domains.length, 0);
  assert.equal(state.memberships.length, 0);
  assert.equal(state.subscriptions.length, 0);
  assert.equal(backing.inspectMetrics().rollbacks, 1);
});

test("committed replay uses the immutable operation snapshot after tenant rows change", async () => {
  const { operation, result } = await committedOperationFixture();
  const changedAt = "2026-07-11T00:00:00.000Z";
  const changedStore: StoreRecord = {
    id: result.store.id,
    name: "Renamed Store",
    slug: result.store.slug,
    status: "suspended",
    locale: "tr",
    currency: "TRY",
    themeKey: "changed",
    createdAt: baseInput.requestedAt,
    updatedAt: changedAt,
  };
  const changedDomain: DomainRecord = {
    id: result.primaryDomain.domainId,
    storeId: result.store.id,
    hostname: result.primaryDomain.hostname,
    type: result.primaryDomain.domainType,
    status: "disabled",
    canonical: false,
    cacheVersion: 2,
    createdAt: baseInput.requestedAt,
    updatedAt: changedAt,
  };
  const changedMembership: MembershipRecord = {
    ...result.membership,
    status: "revoked",
    updatedAt: changedAt,
  };
  const changedSubscription: SubscriptionRecord = {
    id: "subscription_changed",
    storeId: result.store.id,
    planId: result.plan.planId,
    planCode: result.plan.planCode,
    planVersion: result.plan.version,
    status: "expired",
    validFrom: result.plan.validFrom,
    validUntil: changedAt,
    createdAt: baseInput.requestedAt,
    updatedAt: changedAt,
  };
  const backing = createInMemorySaaSDataRepository({
    initialState: {
      stores: [changedStore],
      domains: [changedDomain],
      memberships: [changedMembership],
      subscriptions: [changedSubscription],
    },
  });
  const repository = transformTransactions(backing, (transaction) =>
    overrideTransaction(transaction, {
      operations: {
        ...transaction.operations,
        claim: async () => ({ kind: "existing", operation }),
      },
    }),
  );

  const replay = requireSuccess(await createStarterTenantService({ repository }).execute(baseInput));
  assert.deepEqual(replay, { ...result, replayed: true });
  assert.equal(replay.store.status, "active");
  assert.equal(replay.primaryDomain.status, "active");
  assert.equal(replay.membership.status, "active");
  assert.equal(replay.plan.status, "active");
  const withoutReplay = { ...replay, replayed: false };
  assert.deepEqual(withoutReplay, result);
  assert.doesNotMatch(JSON.stringify(operation.result), /password|token|secret|databaseurl|connectionstring/i);
});

test("atomic claim race with a different fingerprint returns mismatch", async () => {
  const { operation } = await committedOperationFixture();
  const backing = createInMemorySaaSDataRepository();
  const repository = transformTransactions(backing, (transaction) =>
    overrideTransaction(transaction, {
      operations: {
        ...transaction.operations,
        claim: async () => ({ kind: "existing", operation }),
      },
    }),
  );
  const changed = { ...baseInput, store: { ...baseInput.store, name: "Changed Name" } };

  const error = requireError(await createStarterTenantService({ repository }).execute(changed));
  assert.equal(error.code, "idempotency_mismatch");
  assert.equal(backing.inspectState().stores.length, 0);
});

test("same-fingerprint processing and failed claims return retryable failure, not mismatch", async () => {
  const fingerprint = createCanonicalTenantFingerprint(baseInput);
  for (const status of ["processing", "failed"] as const) {
    const operation: TenantOperationRecord = {
      id: `operation_${status}`,
      idempotencyKey: baseInput.idempotencyKey,
      fingerprint,
      status,
      createdAt: baseInput.requestedAt,
      updatedAt: baseInput.requestedAt,
    };
    const backing = createInMemorySaaSDataRepository();
    const repository = transformTransactions(backing, (transaction) =>
      overrideTransaction(transaction, {
        operations: {
          ...transaction.operations,
          claim: async () => ({ kind: "existing", operation }),
        },
      }),
    );

    const error = requireError(await createStarterTenantService({ repository }).execute(baseInput));
    assert.deepEqual(error, {
      schemaVersion: 1,
      code: "tenant_transaction_failed",
      retryable: true,
    });
    assert.equal(backing.inspectState().stores.length, 0);
  }
});

test("unexpected operation unique conflict is a retryable transaction failure", async () => {
  const backing = createInMemorySaaSDataRepository();
  const repository = transformTransactions(backing, (transaction) =>
    overrideTransaction(transaction, {
      operations: {
        ...transaction.operations,
        claim: async () => {
          throw new SaaSDataUniqueConflict("operation_idempotency");
        },
      },
    }),
  );

  const error = requireError(await createStarterTenantService({ repository }).execute(baseInput));
  assert.deepEqual(error, {
    schemaVersion: 1,
    code: "tenant_transaction_failed",
    retryable: true,
  });
  assert.equal(backing.inspectState().stores.length, 0);
});

test("result URLs and plan entitlements derive from persisted records", async () => {
  const repository = createInMemorySaaSDataRepository();
  const service = createStarterTenantService({ repository });
  const result = requireSuccess(await service.execute(baseInput));
  const state = repository.inspectState();

  assert.equal(result.storefrontUrl, `https://${state.domains[0]?.hostname}`);
  assert.equal(result.panelUrl, `https://panel.celebix.site/stores/${state.stores[0]?.slug}`);
  assert.equal(result.plan.planId, state.plans[0]?.id);
  assert.ok(result.plan.features.every((feature) => PLAN_FEATURE_KEYS.includes(feature)));
  assert.ok(Object.keys(result.plan.limits).every((limit) => PLAN_LIMIT_KEYS.includes(limit as never)));
});

test("entitlement validity and status derive from the persisted subscription", async () => {
  const backing = createInMemorySaaSDataRepository();
  const subscriptionValidFrom = "2026-07-10T00:00:05.000Z";
  const subscriptionValidUntil = "2026-08-10T00:00:05.000Z";
  const repository = transformTransactions(backing, (transaction) =>
    overrideTransaction(transaction, {
      subscriptions: {
        ...transaction.subscriptions,
        create: (record) =>
          transaction.subscriptions.create({
            ...record,
            status: "inactive",
            validFrom: subscriptionValidFrom,
            validUntil: subscriptionValidUntil,
          }),
      },
    }),
  );

  const result = requireSuccess(await createStarterTenantService({ repository }).execute(baseInput));
  const plan = backing.inspectState().plans[0];
  assert.ok(plan);
  assert.notEqual(plan.validFrom, subscriptionValidFrom);
  assert.equal(result.plan.status, "inactive");
  assert.equal(result.plan.validFrom, subscriptionValidFrom);
  assert.equal(result.plan.validUntil, subscriptionValidUntil);
  assert.deepEqual(result.plan.features, plan.features);
  assert.deepEqual(result.plan.limits, plan.limits);
});

test("persisted and returned values contain no password, token, or secret keys", async () => {
  const repository = createInMemorySaaSDataRepository();
  const service = createStarterTenantService({ repository });
  const result = requireSuccess(await service.execute(baseInput));
  const serialized = JSON.stringify({ result, state: repository.inspectState() }).toLowerCase();

  assert.doesNotMatch(serialized, /password|token|secret|credential|databaseurl|connectionstring/);
});

test("default setting keys are isolated by store", async () => {
  const repository = createInMemorySaaSDataRepository();
  const service = createStarterTenantService({ repository });
  requireSuccess(await service.execute(baseInput));
  requireSuccess(
    await service.execute({
      ...baseInput,
      idempotencyKey: "opaque-request-2",
      principal: { ...baseInput.principal, subject: "subject-2", email: "second@example.test" },
      store: { ...baseInput.store, name: "Ikinci Magaza", slug: "ikinci-magaza" },
    }),
  );

  const settings = repository.inspectState().settings;
  assert.equal(settings.length, 6);
  assert.equal(new Set(settings.map((setting) => setting.storeId)).size, 2);
  for (const storeId of new Set(settings.map((setting) => setting.storeId))) {
    assert.deepEqual(
      settings.filter((setting) => setting.storeId === storeId).map((setting) => setting.key).sort(),
      ["currency", "locale", "themeKey"],
    );
  }
});

test("result is assignable to the frozen CreateStarterTenantResult contract", async () => {
  const repository = createInMemorySaaSDataRepository();
  const result: CreateStarterTenantResult = requireSuccess(
    await createStarterTenantService({ repository }).execute(baseInput),
  );
  assert.equal(result.schemaVersion, 1);
});
