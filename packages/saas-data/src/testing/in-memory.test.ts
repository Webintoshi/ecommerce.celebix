import assert from "node:assert/strict";
import test from "node:test";

import { SaaSDataUniqueConflict, createCanonicalTenantFingerprint } from "../index.ts";
import { createInMemorySaaSDataRepository } from "./index.ts";

test("commit publishes a transaction snapshot exactly once", async () => {
  const repository = createInMemorySaaSDataRepository();
  const transaction = await repository.beginTransaction();

  await transaction.principals.create({
    id: transaction.generateId("principal"),
    issuer: "https://auth.example.test/oidc",
    subject: "subject-1",
    email: "owner@example.test",
    emailVerified: true,
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
  });

  assert.equal(repository.inspectState().principals.length, 0);
  await transaction.commit();
  assert.equal(repository.inspectState().principals.length, 1);
  assert.equal(repository.inspectMetrics().commits, 1);
  await assert.rejects(() => transaction.commit(), /already completed/);
});

test("rollback discards all writes in the transaction snapshot", async () => {
  const repository = createInMemorySaaSDataRepository();
  const transaction = await repository.beginTransaction();

  await transaction.principals.create({
    id: transaction.generateId("principal"),
    issuer: "https://auth.example.test/oidc",
    subject: "subject-1",
    email: "owner@example.test",
    emailVerified: true,
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
  });

  await transaction.rollback();
  assert.equal(repository.inspectState().principals.length, 0);
  assert.equal(repository.inspectMetrics().rollbacks, 1);
});

test("transactions are isolated and serialized", async () => {
  const repository = createInMemorySaaSDataRepository();
  const first = await repository.beginTransaction();
  let secondStarted = false;
  const secondPromise = repository.beginTransaction().then((transaction) => {
    secondStarted = true;
    return transaction;
  });

  await Promise.resolve();
  assert.equal(secondStarted, false);
  await first.rollback();

  const second = await secondPromise;
  assert.equal(secondStarted, true);
  await second.rollback();
});

test("uniqueness simulation rejects duplicate principal authority", async () => {
  const repository = createInMemorySaaSDataRepository();
  const first = await repository.beginTransaction();
  const record = {
    id: first.generateId("principal"),
    issuer: "https://auth.example.test/oidc",
    subject: "subject-1",
    email: "owner@example.test",
    emailVerified: true,
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
  } as const;
  await first.principals.create(record);
  await first.commit();

  const second = await repository.beginTransaction();
  await assert.rejects(
    () => second.principals.create({ ...record, id: second.generateId("principal") }),
    (error) => error instanceof SaaSDataUniqueConflict && error.kind === "principal_identity",
  );
  await second.rollback();
});

test("configured failure points fail after the matching write", async () => {
  const repository = createInMemorySaaSDataRepository({ failAt: "after_principal_create" });
  const transaction = await repository.beginTransaction();

  await assert.rejects(
    () =>
      transaction.principals.create({
        id: transaction.generateId("principal"),
        issuer: "https://auth.example.test/oidc",
        subject: "subject-1",
        email: "owner@example.test",
        emailVerified: true,
        createdAt: "2026-07-10T00:00:00.000Z",
        updatedAt: "2026-07-10T00:00:00.000Z",
      }),
    /Injected failure: after_principal_create/,
  );

  await transaction.rollback();
  assert.equal(repository.inspectState().principals.length, 0);
});

test("atomic operation claim creates once and returns the existing operation", async () => {
  const repository = createInMemorySaaSDataRepository();
  const first = await repository.beginTransaction();
  const fingerprint = createCanonicalTenantFingerprint({
    schemaVersion: 1,
    idempotencyKey: "claim-key",
    principal: {
      issuer: "https://auth.example.test/oidc",
      subject: "subject-claim",
      email: "owner@example.test",
      emailVerified: true,
    },
    store: {
      name: "Claim Store",
      slug: "claim-store",
      locale: "tr",
      currency: "TRY",
      themeKey: "starter",
    },
    consents: { privacyAcceptedAt: "2026-07-10T00:00:00.000Z" },
    requestedAt: "2026-07-10T00:00:00.000Z",
  });
  const operation = {
    id: first.generateId("operation"),
    idempotencyKey: "claim-key",
    fingerprint,
    status: "processing",
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
  } as const;

  const created = await first.operations.claim(operation);
  assert.equal(created.kind, "created");
  await first.commit();

  const second = await repository.beginTransaction();
  const existing = await second.operations.claim({ ...operation, id: second.generateId("operation") });
  assert.equal(existing.kind, "existing");
  assert.equal(existing.operation.id, operation.id);
  await second.rollback();
  assert.equal(repository.inspectState().operations.length, 1);
});

test("verified email metadata updates transactionally without changing identity authority", async () => {
  const repository = createInMemorySaaSDataRepository();
  const first = await repository.beginTransaction();
  const principal = await first.principals.create({
    id: first.generateId("principal"),
    issuer: "https://auth.example.test/oidc",
    subject: "subject-1",
    email: "old@example.test",
    emailVerified: true,
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
  });
  await first.commit();

  const second = await repository.beginTransaction();
  const updated = await second.principals.updateVerifiedEmail(
    principal.id,
    "new@example.test",
    "2026-07-11T00:00:00.000Z",
  );
  assert.equal(updated.email, "new@example.test");
  assert.equal(updated.issuer, principal.issuer);
  assert.equal(updated.subject, principal.subject);
  await second.commit();
  assert.equal(repository.inspectState().principals[0]?.email, "new@example.test");
});

test("injected verified email metadata failure rolls back the update", async () => {
  const principal = {
    id: "principal_existing",
    issuer: "https://auth.example.test/oidc",
    subject: "subject-1",
    email: "old@example.test",
    emailVerified: true,
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
  } as const;
  const repository = createInMemorySaaSDataRepository({
    failAt: "after_principal_email_update",
    initialState: { principals: [principal] },
  });
  const transaction = await repository.beginTransaction();

  await assert.rejects(
    () =>
      transaction.principals.updateVerifiedEmail(
        principal.id,
        "new@example.test",
        "2026-07-11T00:00:00.000Z",
      ),
    /Injected failure: after_principal_email_update/,
  );
  await transaction.rollback();
  assert.equal(repository.inspectState().principals[0]?.email, "old@example.test");
});

test("media namespace is unique per store, exact, and rollback-safe", async () => {
  const repository = createInMemorySaaSDataRepository();
  const transaction = await repository.beginTransaction();
  const storeId = "10000000-0000-4000-8000-000000000001";
  const record = {
    storeId,
    namespacePrefix: `stores/${storeId}/`,
    status: "active" as const,
    version: 1,
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
  };

  assert.deepEqual(await transaction.mediaNamespaces.create(record), record);
  assert.deepEqual(await transaction.mediaNamespaces.findByStoreId(storeId), record);
  await assert.rejects(
    () => transaction.mediaNamespaces.create(record),
    (error) => error instanceof SaaSDataUniqueConflict && error.kind === "media_namespace",
  );
  await transaction.rollback();
  assert.equal(repository.inspectState().mediaNamespaces.length, 0);
  await assert.rejects(() => transaction.mediaNamespaces.findByStoreId(storeId), /already completed/);
});

test("media namespace rejects caller-shaped authority and invalid lifecycle fields", async () => {
  const repository = createInMemorySaaSDataRepository();
  const transaction = await repository.beginTransaction();
  const storeId = "10000000-0000-4000-8000-000000000001";
  const valid = {
    storeId,
    namespacePrefix: `stores/${storeId}/`,
    status: "active" as const,
    version: 1,
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
  };

  for (const candidate of [
    { ...valid, namespacePrefix: "stores/forged/" },
    { ...valid, status: "suspended" as const },
    { ...valid, version: 2 },
    { ...valid, updatedAt: "2026-07-28T00:00:01.000Z" },
  ]) {
    await assert.rejects(() => transaction.mediaNamespaces.create(candidate));
  }

  await transaction.rollback();
  assert.equal(repository.inspectState().mediaNamespaces.length, 0);
});

test("injected media namespace failure is discarded by rollback", async () => {
  const repository = createInMemorySaaSDataRepository({ failAt: "after_media_namespace_create" });
  const transaction = await repository.beginTransaction();
  const storeId = "10000000-0000-4000-8000-000000000001";

  await assert.rejects(
    () => transaction.mediaNamespaces.create({
      storeId,
      namespacePrefix: `stores/${storeId}/`,
      status: "active",
      version: 1,
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T00:00:00.000Z",
    }),
    /Injected failure: after_media_namespace_create/,
  );
  await transaction.rollback();
  assert.equal(repository.inspectState().mediaNamespaces.length, 0);
});
