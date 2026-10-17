import assert from "node:assert/strict";
import test from "node:test";
import type { PostgresClientLike } from "@celebix/saas-data";
import type { NativeMarketingConfig } from "./config.ts";
import { initializeNativeMarketingProductionRuntime } from "./production.ts";
function config(): NativeMarketingConfig { return { database: { url: "postgresql://workflow:secret@postgres:5432/celebix_saas_production?sslmode=verify-full", name: "celebix_saas_production" }, deliveryMode: "test", workerId: "marketing-1", resendApiKey: "re_marketing_authority", senderEmail: "noreply@marketing.celebix.co", webhookSecret: "whsec_marketing_authority", keyring: { activeKeyId: "marketing_01", keys: { marketing_01: Buffer.alloc(32, 8) } }, testRecipient: "qa@example.test", publicOrigin: "https://owner.saas-staging.celebix.net", storeIds: "*" }; }
class Client { readonly calls: string[] = []; constructor(readonly healthy = true) {} async query(sql: string) { this.calls.push(sql); const rows = sql.includes("server_version_num") ? [{ version_num: 160003, database_name: "celebix_saas_production", current_role: "celebix_saas_workflow", session_is_superuser: false, workflow_member: true, native_marketing_lifecycle: this.healthy }] : sql.includes("native_marketing_work_claim") ? [{ outcome: "empty", result_payload: { items: [] } }] : []; return { rowCount: rows.length, rows }; } release() {} }
test("marketing runtime preflights dedicated lifecycle then claims bounded work without any provider call", async () => {
  const client = new Client(); let ended = 0, sends = 0;
  const runtime = await initializeNativeMarketingProductionRuntime(config(), { createPool: () => ({ async connect() { return client as unknown as PostgresClientLike; }, async end() { ended++; } }), uuid: () => "33333333-3333-4333-8333-333333333333", now: () => new Date("2026-10-18T10:00:00.000Z"), fetch: async () => { sends++; throw Error("unexpected provider call"); } });
  assert.equal(await runtime.runOnce(), "empty"); assert.equal(sends, 0); assert.ok(client.calls.some(sql => sql.includes("native_marketing_work_authorize"))); assert.ok(client.calls.some(sql => sql.includes("native_marketing_work_claim"))); await runtime.close(); assert.equal(ended, 1);
});
test("missing marketing migration prevents startup and closes its pool", async () => {
  const client = new Client(false); let ended = 0;
  await assert.rejects(initializeNativeMarketingProductionRuntime(config(), { createPool: () => ({ async connect() { return client as unknown as PostgresClientLike; }, async end() { ended++; } }), uuid: () => "33333333-3333-4333-8333-333333333333", now: () => new Date(), fetch: async () => { throw Error("unexpected provider call"); } }), /native_marketing_production_preflight_failed/u);
  assert.equal(ended, 1);
});
