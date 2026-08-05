import assert from "node:assert/strict";
import test from "node:test";

import type { RegistrationAttempt } from "../../apps/owner/lib/self-serve-registration-orchestrator.ts";
import { SharedInMemoryRegistrationWorkflowStore } from "./workflow-store.ts";

const NOW = new Date("2026-07-11T10:00:00.000Z");

function attempt(overrides: Partial<RegistrationAttempt> = {}): RegistrationAttempt {
  return {
    id: "attempt_shared_1234567890abcdefghij",
    state: "state_shared_1234567890abcdefghijkl",
    details: {
      storeName: "Ortak Mağaza",
      storeSlug: "ortak-magaza",
      locale: "tr",
      currency: "TRY",
      themeKey: "starter",
      privacyAcceptedAt: "2026-07-11T09:59:00.000Z",
    },
    idempotencyKey: "ssik_shared_1234567890abcdefghijkl",
    requestedAt: NOW.toISOString(),
    status: "awaiting_identity",
    createdAt: NOW.toISOString(),
    expiresAt: "2026-07-11T10:10:00.000Z",
    ...overrides,
  };
}

test("Owner begin data is visible through the panel completion port", async () => {
  const store = new SharedInMemoryRegistrationWorkflowStore();
  const initial = attempt();
  await store.save(initial);

  assert.deepEqual(await store.findByState(initial.state, NOW), initial);
  assert.deepEqual(await store.findById(initial.id, NOW), initial);
});

test("one state maps to one attempt and one attempt maps to one state", async () => {
  const store = new SharedInMemoryRegistrationWorkflowStore();
  const initial = attempt();
  await store.save(initial);

  await assert.rejects(
    () => store.save(attempt({ id: "attempt_other_1234567890abcdefghij" })),
    /registration_state_conflict/,
  );
  await assert.rejects(
    () => store.save(attempt({ state: "state_other_1234567890abcdefghijkl" })),
    /registration_attempt_conflict/,
  );
});

test("consume is one-use while preserving the authoritative completion record", async () => {
  const store = new SharedInMemoryRegistrationWorkflowStore();
  const initial = attempt();
  await store.save(initial);

  assert.deepEqual(await store.consume(initial.state, NOW), initial);
  await assert.rejects(() => store.consume(initial.state, NOW), /registration_attempt_replayed/);
  assert.deepEqual(await store.findByState(initial.state, NOW), initial);
});

test("expired records and immutable attempt mutations fail closed", async () => {
  const store = new SharedInMemoryRegistrationWorkflowStore();
  const initial = attempt();
  await store.save(initial);

  await assert.rejects(
    () => store.consume(initial.state, new Date("2026-07-11T10:10:00.000Z")),
    /registration_attempt_expired/,
  );
  await assert.rejects(
    () => store.update({ ...initial, details: { ...initial.details, storeName: "Değişti" } }),
    /registration_attempt_immutable_field_changed/,
  );
});
