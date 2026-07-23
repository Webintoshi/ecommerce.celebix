import assert from "node:assert/strict";
import test from "node:test";
import {
  MERCHANT_ADMIN_PROVIDER_ACTIONS,
  MERCHANT_ADMIN_PROVIDER_JOB_STATUSES,
  MERCHANT_ADMIN_RECORD_KINDS,
  parseMerchantAdminMutationResult,
  parseMerchantAdminProviderJob,
  parseMerchantAdminProviderJobMutationResult,
  parseMerchantAdminRecord,
} from "./index.ts";
const ID = "11111111-1111-4111-8111-111111111111", NOW = "2026-07-22T19:00:00.000Z";
test("parses exact durable merchant module records", () => { const value = parseMerchantAdminRecord({ id: ID, kind: "discount", name: "Yaz indirimi", config: { discountType: "percent", value: 15 }, status: "active", version: 1, createdAt: NOW, updatedAt: NOW }); assert.equal(Object.isFrozen(value.config), true); assert.equal(MERCHANT_ADMIN_RECORD_KINDS.length, 25); for (const hostile of [{ ...value, storeId: ID }, { ...value, config: { apiKey: "private" } }, { ...value, status: "deleted" }]) assert.throws(() => parseMerchantAdminRecord(hostile)); });
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
  assert.deepEqual(MERCHANT_ADMIN_PROVIDER_JOB_STATUSES, ["awaiting_provider_activation", "cancelled"]);
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
