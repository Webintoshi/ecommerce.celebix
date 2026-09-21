import assert from "node:assert/strict";
import test from "node:test";

const RESOURCE_ID = "a5de1e47-404a-5e90-89c2-2fa9da177a4f";
const OPERATION_ID = "11111111-1111-4111-8111-111111111111";
const AUDIT_ID = "22222222-2222-4222-8222-222222222222";

async function contract() {
  const loaded = await import("./index.ts").catch(() => null);
  assert.notEqual(loaded, null, "deletion contract module must exist");
  return loaded!;
}

test("parses and deeply freezes exact permanent deletion projections", async () => {
  const selected = await contract();
  const impact = selected.parsePermanentDeletionImpact({
    resourceKind: "order",
    resourceId: RESOURCE_ID,
    expectedVersion: 3,
    confirmationLabel: "MAN-a5de1e47404a5e9089c2",
    effects: [
      { kind: "order_items", count: 1, disposition: "delete" },
      { kind: "external_payment", count: 1, disposition: "external_unchanged" },
    ],
  });
  assert.equal(Object.isFrozen(impact), true);
  assert.equal(Object.isFrozen(impact.effects), true);
  assert.equal(Object.isFrozen(impact.effects[0]), true);
  assert.deepEqual(selected.parsePermanentDeletionCommand({
    operationId: OPERATION_ID,
    expectedVersion: 3,
    confirmation: "MAN-a5de1e47404a5e9089c2",
  }), {
    operationId: OPERATION_ID,
    expectedVersion: 3,
    confirmation: "MAN-a5de1e47404a5e9089c2",
  });
  assert.deepEqual(selected.parsePermanentDeletionResult({
    resourceKind: "order",
    resourceId: RESOURCE_ID,
    deleted: true,
    auditId: AUDIT_ID,
    replayed: false,
  }), {
    resourceKind: "order",
    resourceId: RESOURCE_ID,
    deleted: true,
    auditId: AUDIT_ID,
    replayed: false,
  });
});

test("rejects unknown effects, cross-resource effects, unsafe counts, and extra authority", async () => {
  const selected = await contract();
  const base = {
    resourceKind: "order",
    resourceId: RESOURCE_ID,
    expectedVersion: 3,
    confirmationLabel: "MAN-a5de1e47404a5e9089c2",
  } as const;
  for (const value of [
    { ...base, effects: [{ kind: "raw_sql", count: 1, disposition: "delete" }] },
    { ...base, effects: [{ kind: "variants", count: 1, disposition: "delete" }] },
    { ...base, effects: [{ kind: "order_items", count: -1, disposition: "delete" }] },
    { ...base, effects: [{ kind: "order_items", count: 1.5, disposition: "delete" }] },
    { ...base, effects: [{ kind: "order_items", count: 1, disposition: "erase" }] },
    { ...base, effects: [], storeId: RESOURCE_ID },
  ]) assert.throws(() => selected.parsePermanentDeletionImpact(value), /permanent_deletion_contract_invalid/u);
});

test("rejects malformed commands and contradictory results", async () => {
  const selected = await contract();
  for (const value of [
    { operationId: "not-a-uuid", expectedVersion: 3, confirmation: "MAN-1" },
    { operationId: OPERATION_ID, expectedVersion: 0, confirmation: "MAN-1" },
    { operationId: OPERATION_ID, expectedVersion: 3, confirmation: " MAN-1" },
    { operationId: OPERATION_ID, expectedVersion: 3, confirmation: "MAN-1", tenantId: RESOURCE_ID },
  ]) assert.throws(() => selected.parsePermanentDeletionCommand(value), /permanent_deletion_contract_invalid/u);

  for (const value of [
    { resourceKind: "order", resourceId: RESOURCE_ID, deleted: false, auditId: AUDIT_ID, replayed: false },
    { resourceKind: "unknown", resourceId: RESOURCE_ID, deleted: true, auditId: AUDIT_ID, replayed: false },
    { resourceKind: "order", resourceId: RESOURCE_ID, deleted: true, auditId: AUDIT_ID, replayed: "false" },
  ]) assert.throws(() => selected.parsePermanentDeletionResult(value), /permanent_deletion_contract_invalid/u);
});
