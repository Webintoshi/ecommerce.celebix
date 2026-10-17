import assert from "node:assert/strict";
import test from "node:test";
import type { TenantContext } from "@celebix/saas-contracts";
import { NativeMarketingError } from "./types.ts";
import { PostgresNativeMarketingRepository } from "./repository.ts";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = new Date("2026-10-18T12:00:00.000Z");
const tenantContext: TenantContext = { schemaVersion: 1, requestId: "test", principal: { id: id(2), issuer: "https://identity.example.test", subject: "subject" }, store: { id: id(1), slug: "test", status: "active" }, membership: { id: id(3), role: "store_owner", status: "active" }, entitlements: { schemaVersion: 1, planId: "00000000-0000-4000-8000-000000000001", planCode: "free_starter", version: 1, status: "active", features: ["catalog", "integrations"], limits: { products: 100, staff: 5, storageBytes: 1000 }, validFrom: "2026-01-01T00:00:00.000Z" }, locale: "tr-TR" };
const timeouts = { poolCheckoutMs: 100, statementMs: 1000, lockMs: 100, idleTransactionMs: 1000 };
const campaign = { id: id(4), name: "Campaign", templateId: "offer", status: "queued", scheduledAt: now.toISOString(), recipientCount: 1, sentCount: 0, failedCount: 0, version: 1, isTest: false };
class Client {
  calls: { sql: string; values: unknown[] }[] = [];
  released: unknown[] = [];
  constructor(readonly respond: (sql: string) => Record<string, unknown>[] = () => []) {}
  async query(sql: string, values: unknown[] = []) { this.calls.push({ sql, values }); const rows = this.respond(sql); return { rows, rowCount: rows.length, command: "SELECT", oid: 0, fields: [] }; }
  release(error?: unknown) { this.released.push(error); }
}
const repo = (client: Client, role: "celebix_saas_app" | "celebix_saas_workflow" | "celebix_saas_host_resolver" = "celebix_saas_app") => new PostgresNativeMarketingRepository({ pool: { connect: async () => client }, role, timeouts, uuid: () => id(5) });

test("queue validates immutable content and passes tenant identity plus idempotent operation to one RPC", async () => {
  const client = new Client(sql => sql.includes("native_marketing_command") ? [{ outcome: "saved", result_payload: campaign }] : []);
  const input = { tenantContext, now, operationId: id(6), templateId: "offer" as const, name: "Campaign", content: { subject: "Offer", heading: "Hello", body: "Details", buttonLabel: "Shop", buttonPath: "/products" }, productIds: [id(7)] };
  assert.deepEqual(await repo(client).queueCampaign(input), campaign);
  const call = client.calls.find(x => x.sql.includes("native_marketing_command"))!;
  assert.deepEqual(call.values.slice(0, 7), [id(1), id(2), id(3), tenantContext.entitlements.planId, "free_starter", 1, now]);
  assert.equal(call.values[7], "queue");
  const envelope = JSON.parse(String(call.values[8]));
  const payload = envelope.value;
  assert.equal(payload.content.buttonPath, "/products");
  assert.equal(Object.hasOwn(payload, "recipients"), false);
  assert.match(envelope.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(client.calls.some(x => x.sql === "SET LOCAL ROLE celebix_saas_app"), true);
  assert.equal(client.calls.at(-1)?.sql, "COMMIT");
  for (const buttonPath of ["//evil.test", "https://evil.test", "/\\evil.test", "/products\nX"]) await assert.rejects(repo(client).queueCampaign({ ...input, content: { ...input.content, buttonPath } }), (e: unknown) => e instanceof NativeMarketingError && e.code === "invalid_input");
  await assert.rejects(repo(client).queueCampaign({ ...input, productIds: [id(7), id(7)] }));
});

test("wrong role, commercial capability denial and commit uncertainty fail closed", async () => {
  const client = new Client();
  await assert.rejects(repo(client, "celebix_saas_workflow").overview({ tenantContext, now }));
  const denied = { ...tenantContext, entitlements: { ...tenantContext.entitlements, features: ["catalog"] as const } };
  await assert.rejects(repo(client).overview({ tenantContext: denied, now }), (e: unknown) => e instanceof NativeMarketingError && e.code === "feature_not_enabled");
  assert.equal(client.calls.length, 0);
  const unknown = new Client(sql => { if (sql === "COMMIT") throw new Error("connection lost"); return sql.includes("native_marketing_command") ? [{ outcome: "saved", result_payload: campaign }] : []; });
  await assert.rejects(repo(unknown).queueCampaign({ tenantContext, now, operationId: id(6), templateId: "offer", name: "Campaign" }), (e: unknown) => e instanceof NativeMarketingError && e.code === "commit_unknown");
  assert.deepEqual(unknown.released, [true]);
});

test("worker filters stores before lease and rejects corrupt sealed retries", async () => {
  const client = new Client(sql => sql.includes("native_marketing_work_claim") ? [{ outcome: "empty", result_payload: { items: [] } }] : []);
  assert.deepEqual(await repo(client, "celebix_saas_workflow").claim({ workerId: "worker", now, leaseExpiresAt: new Date(now.getTime() + 60000), limit: 20, storeIds: [id(1)] }), { kind: "empty" });
  assert.deepEqual(client.calls.find(x => x.sql.includes("native_marketing_work_claim"))?.values.at(-2), [id(1)]);
  await assert.rejects(repo(client, "celebix_saas_workflow").claim({ workerId: "worker", now, leaseExpiresAt: new Date(now.getTime() + 60000), limit: 21 }));
  const malformed = new Client(sql => sql.includes("native_marketing_work_claim") ? [{ outcome: "claimed", result_payload: { items: [{ deliveryId: id(4), storeId: id(1), attemptCount: 2, idempotencyKey: `native-marketing/v1/${id(4)}`, firstAttemptAt: now.toISOString(), idempotencyExpiresAt: new Date(now.getTime() + 172800000).toISOString(), sealKeyId: "key_01", sealedRequest: Buffer.alloc(40).toString("base64"), requestDigest: "a".repeat(64), projection: null }] } }] : []);
  await assert.rejects(repo(malformed, "celebix_saas_workflow").claim({ workerId: "worker", now, leaseExpiresAt: new Date(now.getTime() + 60000), limit: 20 }), (e: unknown) => e instanceof NativeMarketingError && e.code === "unavailable");
  assert.equal(malformed.calls.at(-1)?.sql, "ROLLBACK");
});

test("unsubscribe only accepts digests and never crosses into administrator role", async () => {
  const client = new Client(sql => sql.includes("native_marketing_unsubscribe") ? [{ outcome: "unsubscribed", result_payload: null }] : []);
  await repo(client, "celebix_saas_host_resolver").unsubscribe({ tokenDigest: "a".repeat(64), now });
  assert.deepEqual(client.calls.find(x => x.sql.includes("native_marketing_unsubscribe"))?.values, ["a".repeat(64), now]);
  await assert.rejects(repo(client).unsubscribe({ tokenDigest: "a".repeat(64), now }));
  await assert.rejects(repo(client, "celebix_saas_host_resolver").unsubscribe({ tokenDigest: "raw_token", now }));
});

test("immediate campaign retries preserve operation fingerprint as request time advances", async () => {
  const client = new Client(sql => sql.includes("native_marketing_command") ? [{ outcome: "saved", result_payload: campaign }] : []);
  const input = { tenantContext, now, operationId: id(6), templateId: "offer" as const, name: "Campaign" };
  await repo(client).queueCampaign(input);
  await repo(client).queueCampaign({ ...input, now: new Date(now.getTime() + 60000) });
  const calls = client.calls.filter(x => x.sql.includes("native_marketing_command"));
  assert.equal(calls[0]?.values[8], calls[1]?.values[8]);
  assert.equal(Object.hasOwn(JSON.parse(String(calls[0]?.values[8])).value, "scheduledAt"), false);
});

test("sender budget deferral commits queue state before reporting deferred preparation", async () => {
  const client = new Client(sql => sql.includes("native_marketing_work_seal") ? [{ outcome: "deferred", result_payload: null }] : []);
  await assert.rejects(repo(client, "celebix_saas_workflow").seal({ deliveryId: id(4), leaseId: id(5), workerId: "worker", now, sealKeyId: "native_01", sealedRequest: Buffer.alloc(40), requestDigest: "a".repeat(64), unsubscribeTokenDigest: "b".repeat(64), firstAttemptAt: now, idempotencyExpiresAt: new Date(now.getTime() + 86400000) }), (e: unknown) => e instanceof NativeMarketingError && e.code === "delivery_deferred");
  assert.equal(client.calls.at(-1)?.sql, "COMMIT");
});
