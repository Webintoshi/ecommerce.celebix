import assert from "node:assert/strict";
import test from "node:test";

import { SaaSDataUniqueConflict } from "../index.ts";
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
