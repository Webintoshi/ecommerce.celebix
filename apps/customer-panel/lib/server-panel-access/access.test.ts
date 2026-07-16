import assert from "node:assert/strict";
import test from "node:test";

import type { TenantContext } from "@celebix/saas-contracts";

import {
  resolveDurableServerPanelAccess,
  type ServerPanelSessionAuthority,
} from "./access.ts";

const NOW = new Date("2026-07-16T10:00:00.000Z");
const SESSION_ID = "55555555-5555-4555-8555-555555555555";
const PRINCIPAL_ID = "22222222-2222-4222-8222-222222222222";
const STORE_ID = "33333333-3333-4333-8333-333333333333";
const MEMBERSHIP_ID = "44444444-4444-4444-8444-444444444444";
const CREDENTIAL = `v1.panel.active.v1.${"A".repeat(43)}`;

const tenantContext: TenantContext = Object.freeze({
  schemaVersion: 1,
  requestId: "panel-page-request",
  principal: Object.freeze({
    id: PRINCIPAL_ID,
    issuer: "https://identity.example.test/oidc",
    subject: "subject_123",
  }),
  store: Object.freeze({ id: STORE_ID, slug: "verified-store", status: "active" }),
  membership: Object.freeze({ id: MEMBERSHIP_ID, role: "store_owner", status: "active" }),
  entitlements: Object.freeze({
    schemaVersion: 1,
    planId: "00000000-0000-4000-8000-000000000001",
    planCode: "free_starter",
    version: 1,
    status: "active",
    features: Object.freeze(["catalog", "orders"] as const),
    limits: Object.freeze({ products: 100, staff: 1, storageBytes: 1_000_000_000 }),
    validFrom: "2026-01-01T00:00:00.000Z",
  }),
  locale: "tr",
});

function authority(result: Awaited<ReturnType<ServerPanelSessionAuthority["resolveSession"]>>) {
  const calls: unknown[] = [];
  return {
    calls,
    value: {
      async resolveSession(input: unknown) {
        calls.push(input);
        return result;
      },
    } satisfies ServerPanelSessionAuthority,
  };
}

function resolved() {
  return {
    kind: "resolved" as const,
    session: Object.freeze({
      sessionId: SESSION_ID,
      familyId: "66666666-6666-4666-8666-666666666666",
      principalId: PRINCIPAL_ID,
      activeStoreId: STORE_ID,
      version: 1,
      issuedAt: "2026-07-16T09:00:00.000Z",
      rotatedAt: "2026-07-16T09:30:00.000Z",
      expiresAt: "2026-07-16T17:00:00.000Z",
    }),
    tenantContext,
  };
}

test("one keyed credential resolution returns only a frozen layout-safe session and durable TenantContext", async () => {
  const repository = authority(resolved());
  const result = await resolveDurableServerPanelAccess({
    credential: CREDENTIAL,
    requestId: "panel-page-request",
    now: NOW,
    authority: repository.value,
  });

  assert.equal(repository.calls.length, 1);
  assert.deepEqual(repository.calls[0], {
    credential: CREDENTIAL,
    requestId: "panel-page-request",
    now: NOW,
  });
  assert.equal(result.kind, "authenticated");
  if (result.kind !== "authenticated") return;
  assert.equal(result.tenantContext, tenantContext);
  assert.deepEqual(result.session, {
    id: SESSION_ID,
    principal: tenantContext.principal,
    activeStoreId: STORE_ID,
    createdAt: "2026-07-16T09:00:00.000Z",
    rotatedAt: "2026-07-16T09:30:00.000Z",
    expiresAt: "2026-07-16T17:00:00.000Z",
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.session), true);
  assert.equal(Object.isFrozen(result.session.principal), true);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(CREDENTIAL), false);
  assert.equal(serialized.includes("familyId"), false);
  assert.equal(serialized.includes("tokenDigest"), false);
  assert.equal(serialized.includes("keyMaterial"), false);
  assert.equal(serialized.includes("database"), false);
  assert.equal(serialized.includes("handoff"), false);
});

test("missing credentials are unauthenticated without touching PostgreSQL", async () => {
  const repository = authority(resolved());
  assert.deepEqual(await resolveDurableServerPanelAccess({
    credential: null,
    requestId: "panel-page-request",
    now: NOW,
    authority: repository.value,
  }), { kind: "unauthenticated" });
  assert.equal(repository.calls.length, 0);
});

test("repository authentication, authorization, and availability outcomes stay separated", async () => {
  for (const [repositoryKind, expected] of [
    ["unauthenticated", "unauthenticated"],
    ["membership_denied", "unauthorized"],
    ["durable_authority_invalid", "unauthorized"],
    ["unavailable", "unavailable"],
  ] as const) {
    const repository = authority({ kind: repositoryKind });
    const result = await resolveDurableServerPanelAccess({
      credential: CREDENTIAL,
      requestId: "panel-page-request",
      now: NOW,
      authority: repository.value,
    });
    assert.deepEqual(result, { kind: expected });
    assert.equal(repository.calls.length, 1);
  }
});

test("a resolved session without exact tenant authority is unauthorized", async () => {
  const repository = authority({
    ...resolved(),
    tenantContext: undefined,
    selectionCandidate: { storeId: STORE_ID },
  });
  assert.deepEqual(await resolveDurableServerPanelAccess({
    credential: CREDENTIAL,
    requestId: "panel-page-request",
    now: NOW,
    authority: repository.value,
  }), { kind: "unauthorized" });
});

test("session and TenantContext principal/store identities must agree", async () => {
  for (const session of [
    { ...resolved().session, principalId: MEMBERSHIP_ID },
    { ...resolved().session, activeStoreId: MEMBERSHIP_ID },
  ]) {
    const repository = authority({ ...resolved(), session });
    assert.deepEqual(await resolveDurableServerPanelAccess({
      credential: CREDENTIAL,
      requestId: "panel-page-request",
      now: NOW,
      authority: repository.value,
    }), { kind: "unauthorized" });
  }
});
