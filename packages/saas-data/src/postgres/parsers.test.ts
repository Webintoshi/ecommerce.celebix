import assert from "node:assert/strict";
import test from "node:test";

import {
  SaaSDataCorruptionError,
  SaaSDataLockTimeoutError,
  SaaSDataPersistenceError,
  SaaSDataStatementTimeoutError,
  mapPostgresError,
} from "./errors.ts";
import { SaaSDataUniqueConflict } from "../errors.ts";
import { parseCreateStarterTenantResult, parseTenantOperationRow } from "./parsers.ts";

const panelOrigin = "https://panel.example.test";

const ids = {
  operation: "70000000-0000-4000-8000-000000000001",
  principal: "10000000-0000-4000-8000-000000000001",
  store: "20000000-0000-4000-8000-000000000001",
  domain: "30000000-0000-4000-8000-000000000001",
  membership: "40000000-0000-4000-8000-000000000001",
  plan: "00000000-0000-4000-8000-000000000001",
};

const result = {
  schemaVersion: 1,
  operationId: ids.operation,
  replayed: false,
  store: { id: ids.store, slug: "tenant-a", status: "active" },
  primaryDomain: {
    schemaVersion: 1,
    hostname: "tenant-a.example.test",
    domainId: ids.domain,
    domainType: "platform_subdomain",
    storeId: ids.store,
    storeSlug: "tenant-a",
    canonicalHostname: "tenant-a.example.test",
    status: "active",
    cacheVersion: 1,
  },
  membership: {
    schemaVersion: 1,
    id: ids.membership,
    principalId: ids.principal,
    storeId: ids.store,
    role: "store_owner",
    status: "active",
    createdAt: "2026-07-11T01:00:00.000Z",
    updatedAt: "2026-07-11T01:00:00.000Z",
  },
  plan: {
    schemaVersion: 1,
    planId: ids.plan,
    planCode: "free_starter",
    version: 1,
    status: "active",
    features: ["catalog", "orders", "customers", "content", "media", "analytics", "checkout"],
    limits: { products: 100, staff: 1, storageBytes: 1_000_000_000, monthlyOrders: 100, customDomains: 0 },
    validFrom: "2026-07-11T01:00:00.000Z",
  },
  mediaStorage: { schemaVersion: 1, status: "ready", version: 1 },
  provisioningStatus: "ready",
  panelUrl: "https://tenant-a.admin.celebix.site",
  storefrontUrl: "https://tenant-a.example.test",
};

function committedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ids.operation,
    idempotency_key: "opaque-key",
    payload_fingerprint: "a".repeat(64),
    status: "committed",
    result_payload: structuredClone(result),
    created_at: new Date("2026-07-11T01:00:00.000Z"),
    updated_at: new Date("2026-07-11T01:00:00.000Z"),
    ...overrides,
  };
}

test("strict operation parser accepts a complete committed immutable snapshot", () => {
  const parsed = parseTenantOperationRow(committedRow(), panelOrigin);
  assert.equal(parsed.status, "committed");
  assert.deepEqual(parsed.result, result);
});

test("tenant result requires safe media readiness without infrastructure authority", () => {
  const parsed = parseCreateStarterTenantResult(result, panelOrigin);
  assert.deepEqual(parsed.mediaStorage, { schemaVersion: 1, status: "ready", version: 1 });

  for (const mediaStorage of [
    undefined,
    { schemaVersion: 1, status: "pending", version: 1 },
    { schemaVersion: 1, status: "ready", version: 0 },
    { schemaVersion: 1, status: "ready", version: 1, bucket: "private" },
  ]) {
    assert.throws(
      () => parseCreateStarterTenantResult({ ...result, mediaStorage }, panelOrigin),
      SaaSDataCorruptionError,
    );
  }
});

test("strict operation parser rejects extra keys, malformed IDs, and inconsistent nested authority", () => {
  assert.throws(() => parseTenantOperationRow({ ...committedRow(), extra: true }, panelOrigin), SaaSDataCorruptionError);
  assert.throws(() => parseTenantOperationRow(committedRow({ id: "not-a-uuid" }), panelOrigin), SaaSDataCorruptionError);
  const mismatched = structuredClone(result);
  mismatched.primaryDomain.storeId = "20000000-0000-4000-8000-000000000002";
  assert.throws(() => parseTenantOperationRow(committedRow({ result_payload: mismatched }), panelOrigin), SaaSDataCorruptionError);
});

test("strict operation parser rejects malformed committed snapshots and permits result-less processing rows", () => {
  assert.throws(() => parseTenantOperationRow(committedRow({ result_payload: null }), panelOrigin), SaaSDataCorruptionError);
  const processing = parseTenantOperationRow(committedRow({ status: "processing", result_payload: null }), panelOrigin);
  assert.equal(processing.status, "processing");
  assert.equal(processing.result, undefined);
});

test("strict snapshot parsing rejects invalid timestamps, URLs, features, and limits", () => {
  const invalidTimestamp = structuredClone(result);
  invalidTimestamp.membership.createdAt = "2026-07-11T01:00:00Z";
  const invalidUrl = structuredClone(result);
  invalidUrl.storefrontUrl = "https://different.example.test";
  const unknownFeature = structuredClone(result);
  unknownFeature.plan.features = ["catalog", "unknown_feature"];
  const duplicateFeature = structuredClone(result);
  duplicateFeature.plan.features = ["catalog", "catalog"];
  const missingLimit = structuredClone(result);
  Reflect.deleteProperty(missingLimit.plan.limits, "staff");
  const decimalLimit = structuredClone(result);
  decimalLimit.plan.limits.staff = 1.5;
  const negativeLimit = structuredClone(result);
  negativeLimit.plan.limits.products = -1;

  for (const candidate of [invalidTimestamp, invalidUrl, unknownFeature, duplicateFeature, missingLimit, decimalLimit, negativeLimit]) {
    assert.throws(() => parseTenantOperationRow(committedRow({ result_payload: candidate }), panelOrigin), SaaSDataCorruptionError);
  }
});

test("persisted committed snapshots require replayed false and preserve the source payload", () => {
  const source = structuredClone(result);
  const parsed = parseTenantOperationRow(committedRow({ result_payload: source }), panelOrigin);
  assert.equal(parsed.result?.replayed, false);
  assert.equal(source.replayed, false);

  const replayed = structuredClone(result);
  replayed.replayed = true;
  assert.throws(() => parseTenantOperationRow(committedRow({ result_payload: replayed }), panelOrigin), SaaSDataCorruptionError);
  assert.equal(replayed.replayed, true);
});

test("strict snapshot parser binds panelUrl to the approved origin and exact store path", () => {
  const maliciousPanelUrls = [
    "https://user:password@tenant-a.admin.celebix.site",
    "https://tenant-a.admin.celebix.site?next=evil",
    "https://tenant-a.admin.celebix.site#fragment",
    "https://wrong.example.test/stores/tenant-a",
    "https://tenant-b.admin.celebix.site",
    "https://tenant-a.admin.celebix.site/extra",
    "https://tenant-a.admin.celebix.site%2Fevil",
    "https://tenant-a.admin.celebix.site//",
    "http://tenant-a.admin.celebix.site",
  ];
  for (const panelUrl of maliciousPanelUrls) {
    const candidate = structuredClone(result);
    candidate.panelUrl = panelUrl;
    assert.throws(() => parseTenantOperationRow(committedRow({ result_payload: candidate }), panelOrigin), SaaSDataCorruptionError, panelUrl);
  }
});

test("strict rows reject feature-order, validity-range, and idempotency-key corruption", () => {
  const outOfOrder = structuredClone(result);
  outOfOrder.plan.features = ["orders", "catalog"];
  assert.throws(() => parseTenantOperationRow(committedRow({ result_payload: outOfOrder }), panelOrigin), SaaSDataCorruptionError);

  const laterValidity = structuredClone(result);
  Object.assign(laterValidity.plan, { validUntil: "2026-07-11T01:00:00.001Z" });
  assert.doesNotThrow(() => parseTenantOperationRow(committedRow({ result_payload: laterValidity }), panelOrigin));

  for (const validUntil of ["2026-07-11T01:00:00.000Z", "2026-07-10T01:00:00.000Z"]) {
    const invalidValidity = structuredClone(result);
    invalidValidity.plan.validFrom = "2026-07-11T01:00:00.000Z";
    Object.assign(invalidValidity.plan, { validUntil });
    assert.throws(() => parseTenantOperationRow(committedRow({ result_payload: invalidValidity }), panelOrigin), SaaSDataCorruptionError);
  }

  for (const idempotencyKey of [" leading", "trailing ", "", "a".repeat(129)]) {
    assert.throws(() => parseTenantOperationRow(committedRow({ idempotency_key: idempotencyKey }), panelOrigin), SaaSDataCorruptionError);
  }
});

test("PostgreSQL errors map only known constraints and timeout codes without retaining driver details", () => {
  const statement = mapPostgresError({ code: "57014", message: "secret SQL" });
  const lock = mapPostgresError({ code: "55P03", detail: "database=prod" });
  const unknown = mapPostgresError({ code: "XX000", message: "SELECT password" });
  assert.ok(statement instanceof SaaSDataStatementTimeoutError);
  assert.ok(lock instanceof SaaSDataLockTimeoutError);
  assert.ok(unknown instanceof SaaSDataPersistenceError);
  assert.doesNotMatch(unknown.message, /SELECT|password|prod/i);

  const constraints = {
    principals_issuer_subject_key: "principal_identity",
    stores_slug_key: "store_slug",
    domains_hostname_key: "domain_hostname",
    memberships_principal_store_key: "membership",
    subscriptions_one_active_per_store_idx: "subscription",
    store_settings_store_key_key: "setting",
    tenant_operations_idempotency_key_key: "operation_idempotency",
  } as const;
  for (const [constraint, kind] of Object.entries(constraints)) {
    const mapped = mapPostgresError({ code: "23505", constraint, detail: "private row" });
    assert.ok(mapped instanceof SaaSDataUniqueConflict);
    assert.equal(mapped.kind, kind);
    assert.doesNotMatch(mapped.message, /private|constraint|row/i);
  }
});
