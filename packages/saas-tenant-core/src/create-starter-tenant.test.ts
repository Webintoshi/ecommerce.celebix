import assert from "node:assert/strict";
import test from "node:test";

import {
  PLAN_FEATURE_KEYS,
  PLAN_LIMIT_KEYS,
  type CreateStarterTenantInput,
  type CreateStarterTenantResult,
  type StoreMembership,
} from "@celebix/saas-contracts";
import type { DomainRecord, PrincipalRecord } from "@celebix/saas-data";
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
  assert.equal(result.provisioningStatus, "ready");
  assert.equal(state.principals.length, 1);
  assert.equal(state.stores.length, 1);
  assert.equal(state.domains.length, 1);
  assert.equal(state.memberships.length, 1);
  assert.equal(state.subscriptions.length, 1);
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

test("incompatible metadata for the same identity fails safely", async () => {
  const repository = createInMemorySaaSDataRepository();
  const service = createStarterTenantService({ repository });
  requireSuccess(await service.execute(baseInput));

  const error = requireError(
    await service.execute({
      ...baseInput,
      idempotencyKey: "opaque-request-2",
      principal: { ...baseInput.principal, email: "different@example.test" },
      store: { ...baseInput.store, slug: "ikinci-magaza" },
    }),
  );

  assert.equal(error.code, "invalid_input");
  assert.equal(error.field, "principal.email");
  assert.equal(repository.inspectState().stores.length, 1);
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
