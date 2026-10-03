import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultContactWidgetConfig } from "@celebix/saas-contracts";
import { merchantAdminConfig } from "./validation.ts";
import { MerchantAdminRepositoryError } from "./errors.ts";
import { PostgresMerchantAdminRepository } from "./repository.ts";

test("contact widget enters the existing merchant config boundary with strict typed rules", () => {
  const config = createDefaultContactWidgetConfig();
  assert.deepEqual(merchantAdminConfig("contact_widget", config), config);
  for (const invalid of [{ ...config, extra: true }, { ...config, enabled: true }, { ...config, title: "<script>" }, { ...config, channels: [{ type: "email", enabled: true, label: "Email", value: "a@b.test?bcc=x" }] }]) {
    assert.throws(() => merchantAdminConfig("contact_widget", invalid), (error: unknown) => error instanceof MerchantAdminRepositoryError && error.code === "invalid_input");
  }
});

test("contact-widget create retries keep the physical ID and fingerprint; draft writes stop before persistence", async () => {
  const now = new Date("2026-10-03T12:00:00.000Z"), store = "33333333-3333-4333-8333-333333333333";
  const tenantContext = { schemaVersion: 1, requestId: "private", principal: { id: "44444444-4444-4444-8444-444444444444", issuer: "https://id.test/oidc", subject: "private" }, store: { id: store, slug: "store", status: "active" }, membership: { id: "55555555-5555-4555-8555-555555555555", role: "store_owner", status: "active" }, entitlements: { schemaVersion: 1, planId: "66666666-6666-4666-8666-666666666666", planCode: "growth", version: 2, status: "active", features: ["catalog"], limits: { products: 100, staff: 5, storageBytes: 1024 }, validFrom: "2026-01-01T00:00:00.000Z" }, locale: "tr-TR" } as never;
  const writes: unknown[][] = [];
  const repository = new PostgresMerchantAdminRepository({ pool: { connect: async () => ({ query: async (text: string, values: unknown[] = []) => { const rows = text.includes("merchant_admin_save") ? [{ outcome: writes.length ? "operation_replayed" : "saved", result_payload: { id: values[9], kind: "contact_widget", status: "active", version: 1, updatedAt: now.toISOString() } }] : []; if (rows.length) writes.push(values); return { rows, rowCount: rows.length, command: "", oid: 0, fields: [] }; }, release() {} }) }, role: "celebix_saas_app", timeouts: { poolCheckoutMs: 100, statementMs: 100, lockMs: 100, idleTransactionMs: 100 }, audit() {}, uuid: () => { throw new Error("contact widget creates must not use random IDs"); } });
  const input = { tenantContext, now, operationId: "72000000-0000-4000-8000-000000000001", kind: "contact_widget" as const, name: "İletişim balonu", config: createDefaultContactWidgetConfig(), status: "active" as const };
  assert.equal((await repository.save(input)).replayed, false);
  assert.equal((await repository.save(input)).replayed, true);
  assert.equal(writes[0]?.[9], writes[1]?.[9]); assert.equal(writes[0]?.[8], writes[1]?.[8]);
  await assert.rejects(() => repository.save({ ...input, status: "draft" }), (error: unknown) => error instanceof MerchantAdminRepositoryError && error.code === "invalid_input");
  assert.equal(writes.length, 2);
});
