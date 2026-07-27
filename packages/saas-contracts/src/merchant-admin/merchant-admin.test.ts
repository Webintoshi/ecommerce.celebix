import assert from "node:assert/strict";
import test from "node:test";
import {
  MERCHANT_ADMIN_PROVIDER_ACTIONS,
  MERCHANT_ADMIN_PROVIDER_JOB_STATUSES,
  MERCHANT_PROVIDER_CAPABILITIES,
  MERCHANT_PROVIDER_PROFILE_STATUSES,
  MERCHANT_ADMIN_RECORD_KINDS,
  parseMerchantAdminConfig,
  parseMerchantAdminMutationResult,
  parseMerchantAdminProviderJob,
  parseMerchantAdminProviderJobMutationResult,
  parseMerchantAdminRecord,
  parseMerchantProviderDescriptor,
  parseMerchantProviderProfile,
} from "./index.ts";
const ID = "11111111-1111-4111-8111-111111111111", PROFILE_ID = "22222222-2222-4222-8222-222222222222", NOW = "2026-07-22T19:00:00.000Z";

function providerProfileFixture() {
  return {
    id: PROFILE_ID,
    providerCode: "fixture_provider",
    capability: "marketplace_sync",
    publicConfig: { accountReference: "merchant-42" },
    maskedAccountReference: "••••nt-42",
    status: "active",
    credentialVersion: 2,
    version: 3,
    lastValidatedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function providerJobFixture(status: string) {
  const beforeExecution = status === "awaiting_provider_activation" || status === "cancelled";
  return {
    id: ID,
    recordId: PROFILE_ID,
    recordKind: "marketplace_connection",
    action: "synchronization",
    status,
    profileId: beforeExecution ? null : PROFILE_ID,
    providerCode: beforeExecution ? null : "fixture_provider",
    credentialVersion: beforeExecution ? null : 2,
    attempt: status === "queued" || beforeExecution ? 0 : 1,
    safeProviderReference: status === "succeeded" ? "provider-ref-42" : null,
    outcomeCode: ["succeeded", "retryable_failed", "permanently_failed", "provider_outcome_unknown", "reconciliation_required"].includes(status) ? "fixture_outcome" : null,
    version: 1,
    requestedAt: NOW,
    updatedAt: NOW,
  };
}
test("parses exact durable merchant module records", () => { const value = parseMerchantAdminRecord({ id: ID, kind: "discount", name: "Yaz indirimi", config: { discountType: "percent", value: 15 }, status: "active", version: 1, createdAt: NOW, updatedAt: NOW }); assert.equal(Object.isFrozen(value.config), true); assert.equal(MERCHANT_ADMIN_RECORD_KINDS.length, 32); for (const hostile of [{ ...value, storeId: ID }, { ...value, config: { apiKey: "private" } }, { ...value, status: "deleted" }]) assert.throws(() => parseMerchantAdminRecord(hostile)); });
test("typed settings expose only finite public configuration", () => {
  const configurations = {
    notification_setting: { emailEnabled: true, smsEnabled: false, pushEnabled: true, senderLabel: "Celebix", replyToEmail: "support@example.test" },
    hero_banner: { headline: "Yeni sezon", body: "Göz atın", imageUrl: "https://cdn.example.test/hero.webp", destination: "/collections/new", enabled: true },
    promotion_banner: { headline: "Yaz indirimi", body: "Sınırlı süre", destination: "/sale", startsAt: NOW, endsAt: "2026-08-22T19:00:00.000Z", enabled: true },
    marquee_setting: { items: ["Ücretsiz kargo"], icon: "truck", speed: "normal", direction: "left", animation: "continuous", enabled: true },
  } as const;
  for (const [kind, config] of Object.entries(configurations)) assert.doesNotThrow(() => parseMerchantAdminRecord({ id: ID, kind, name: "Ayar", config, status: "active", version: 1, createdAt: NOW, updatedAt: NOW }));
  for (const hostile of [{ smtpPassword: "x" }, { apiKey: "x" }, { pushToken: "x" }]) assert.throws(() => parseMerchantAdminRecord({ id: ID, kind: "notification_setting", name: "Ayar", config: hostile, status: "active", version: 1, createdAt: NOW, updatedAt: NOW }));
});
test("advanced SEO and AI records retain only their finite record kinds", () => {
  for (const kind of [
    "seo_geo_profile", "seo_internal_link", "seo_content_entry", "seo_category_entry",
    "seo_page_entry", "seo_product_entry", "ai_setting",
  ] as const) {
    assert.doesNotThrow(() => parseMerchantAdminRecord({
      id: ID,
      kind,
      name: "Yapılandırma",
      config: {},
      status: "draft",
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
    }));
  }
  assert.equal(MERCHANT_ADMIN_RECORD_KINDS.length, 32);
});
test("merchant-admin parsers reject hostile descriptors, prototypes, and sparse arrays without invoking getters", () => {
  const record = { id: ID, kind: "marquee_setting", name: "Ayar", config: { items: ["Duyuru"] }, status: "active", version: 1, createdAt: NOW, updatedAt: NOW };
  const getterRoot = { ...record } as Record<string, unknown>;
  Object.defineProperty(getterRoot, "config", { enumerable: true, get() { throw new Error("getter_invoked"); } });
  const getterArray: unknown[] = ["Duyuru"];
  Object.defineProperty(getterArray, "0", { enumerable: true, get() { throw new Error("getter_invoked"); } });
  const namedArray = ["Duyuru"] as unknown[] & Record<string, unknown>;
  namedArray.extra = "not_allowed";
  const sparseArray = new Array(1);
  for (const hostile of [getterRoot, { ...record, config: { items: getterArray } }, { ...record, config: { items: namedArray } }, { ...record, config: { items: sparseArray } }, Object.assign(Object.create(null), record), Object.assign({ ...record }, { [Symbol("hidden")]: "no" })]) assert.throws(() => parseMerchantAdminRecord(hostile), /merchant_admin_contract_invalid/);
});
test("merchant-admin configuration bounds canonical UTF-8 bytes rather than JavaScript characters", () => {
  const within = Object.fromEntries(Array.from({ length: 4 }, (_, index) => [`field${index}`, "é".repeat(1_990)]));
  const over = Object.fromEntries(Array.from({ length: 5 }, (_, index) => [`field${index}`, "é".repeat(2_000)]));
  assert.doesNotThrow(() => parseMerchantAdminConfig(within));
  assert.throws(() => parseMerchantAdminConfig(over), /merchant_admin_contract_invalid/);
});
test("merchant-admin contract rejects Unicode edge whitespace and C1 controls", () => {
  for (const name of ["\u00a0Ayar", "Ayar\ufeff", "Ayar\u0085"]) assert.throws(() => parseMerchantAdminRecord({ id: ID, kind: "hero_banner", name, config: { headline: "Ayar" }, status: "active", version: 1, createdAt: NOW, updatedAt: NOW }), /merchant_admin_contract_invalid/);
});
test("mutation projections remain exact and replay-aware", () => { const result = parseMerchantAdminMutationResult({ id: ID, kind: "policy", status: "draft", version: 2, updatedAt: NOW, replayed: false }); assert.equal(result.kind, "policy"); assert.throws(() => parseMerchantAdminMutationResult({ ...result, operationId: ID })); });

test("provider preparation is explicit, immutable and cannot claim external success", () => {
  const job = parseMerchantAdminProviderJob({
    id: ID,
    recordId: "22222222-2222-4222-8222-222222222222",
    recordKind: "marketplace_connection",
    action: "synchronization",
    status: "awaiting_provider_activation",
    version: 1,
    requestedAt: NOW,
    updatedAt: NOW,
  });
  assert.equal(job.status, "awaiting_provider_activation");
  assert.equal(Object.isFrozen(job), true);
  assert.deepEqual(MERCHANT_ADMIN_PROVIDER_ACTIONS, ["delivery", "synchronization", "reconciliation", "indexing"]);
  assert.deepEqual(MERCHANT_ADMIN_PROVIDER_JOB_STATUSES, [
    "awaiting_provider_activation", "queued", "leased", "provider_outcome_unknown",
    "reconciliation_required", "succeeded", "retryable_failed", "permanently_failed", "cancelled",
  ]);
  for (const hostile of [
    { ...job, status: "completed" },
    { ...job, action: "send" },
    { ...job, action: "delivery" },
    { ...job, recordKind: "discount" },
    { ...job, storeId: ID },
    { ...job, providerResponse: "ok" },
  ]) assert.throws(() => parseMerchantAdminProviderJob(hostile));

  const mutation = parseMerchantAdminProviderJobMutationResult({
    id: job.id,
    recordId: job.recordId,
    recordKind: job.recordKind,
    action: job.action,
    status: job.status,
    version: 1,
    updatedAt: NOW,
    replayed: false,
  });
  assert.equal(mutation.replayed, false);
  assert.throws(() => parseMerchantAdminProviderJobMutationResult({ ...mutation, recordKind: "invoice_integration" }));
  assert.throws(() => parseMerchantAdminProviderJobMutationResult({ ...mutation, deliveryId: ID }));
});

test("provider profiles expose only masked durable authority", () => {
  const profile = parseMerchantProviderProfile(providerProfileFixture());
  assert.equal(Object.isFrozen(profile), true);
  assert.equal(Object.isFrozen(profile.publicConfig), true);
  assert.equal(profile.providerCode, "fixture_provider");
  assert.doesNotMatch(JSON.stringify(profile), /secret|password|token|cipher|keyId/i);

  assert.deepEqual(MERCHANT_PROVIDER_CAPABILITIES, [
    "marketplace_sync", "invoice_reconciliation", "email_delivery",
    "phone_delivery", "whatsapp_delivery", "indexing", "payment_processing",
  ]);
  assert.deepEqual(MERCHANT_PROVIDER_PROFILE_STATUSES, [
    "pending_validation", "active", "disabled", "rotation_required", "revoked",
  ]);
});

test("provider profiles reject raw encrypted and unknown fields", () => {
  const base = providerProfileFixture();
  for (const hostile of [
    { ...base, credential: "raw" },
    { ...base, ciphertext: "private" },
    { ...base, storeId: ID },
    { ...base, providerCode: "fixture/provider" },
    { ...base, status: "connected" },
    { ...base, publicConfig: { accessToken: "private" } },
  ]) assert.throws(() => parseMerchantProviderProfile(hostile), /merchant_admin_contract_invalid/);
});

test("provider descriptors are exact, deeply frozen and keep secret fields separate", () => {
  const descriptor = parseMerchantProviderDescriptor({
    providerCode: "fixture_provider",
    capability: "marketplace_sync",
    label: "Fixture Provider",
    publicFields: [{ key: "account_reference", label: "Account reference" }],
    credentialFields: [{ key: "api_secret", label: "API secret", secret: true }],
  });
  assert.equal(Object.isFrozen(descriptor), true);
  assert.equal(Object.isFrozen(descriptor.publicFields), true);
  assert.equal(Object.isFrozen(descriptor.publicFields[0]), true);
  assert.equal(Object.isFrozen(descriptor.credentialFields[0]), true);
  for (const hostile of [
    { ...descriptor, credentialFields: [{ key: "api_secret", label: "API secret", secret: false }] },
    { ...descriptor, publicFields: [{ key: "account_reference", label: "One" }, { key: "account_reference", label: "Two" }] },
    { ...descriptor, publicFields: [{ key: "api_secret", label: "Collision" }] },
    { ...descriptor, enabled: true },
  ]) assert.throws(() => parseMerchantProviderDescriptor(hostile), /merchant_admin_contract_invalid/);
});

test("execution jobs parse every safe state without raw provider output", () => {
  for (const status of MERCHANT_ADMIN_PROVIDER_JOB_STATUSES) {
    assert.equal(parseMerchantAdminProviderJob(providerJobFixture(status)).status, status);
  }
  assert.throws(() => parseMerchantAdminProviderJob({
    ...providerJobFixture("succeeded"),
    rawResponse: { token: "private" },
  }), /merchant_admin_contract_invalid/);

  const legacy = parseMerchantAdminProviderJob({
    id: ID,
    recordId: PROFILE_ID,
    recordKind: "marketplace_connection",
    action: "synchronization",
    status: "awaiting_provider_activation",
    version: 1,
    requestedAt: NOW,
    updatedAt: NOW,
  });
  assert.deepEqual({
    profileId: legacy.profileId,
    providerCode: legacy.providerCode,
    credentialVersion: legacy.credentialVersion,
    attempt: legacy.attempt,
    safeProviderReference: legacy.safeProviderReference,
    outcomeCode: legacy.outcomeCode,
  }, {
    profileId: null,
    providerCode: null,
    credentialVersion: null,
    attempt: 0,
    safeProviderReference: null,
    outcomeCode: null,
  });

  const partial = { ...providerJobFixture("queued") } as Record<string, unknown>;
  delete partial.outcomeCode;
  assert.throws(() => parseMerchantAdminProviderJob(partial), /merchant_admin_contract_invalid/);
  assert.throws(() => parseMerchantAdminProviderJob({
    ...providerJobFixture("queued"),
    profileId: null,
    providerCode: null,
    credentialVersion: null,
  }), /merchant_admin_contract_invalid/);
  assert.throws(() => parseMerchantAdminProviderJob({
    ...providerJobFixture("succeeded"),
    outcomeCode: null,
  }), /merchant_admin_contract_invalid/);
});
