import assert from "node:assert/strict";
import { test } from "node:test";
import { createDefaultRestockAlertsConfig } from "../restock-alerts/index.ts";
import { parseMerchantAdminRecord } from "./validation.ts";

const record = { id: "11111111-1111-4111-8111-111111111111", kind: "restock_alerts", name: "Stok bildirimi", config: createDefaultRestockAlertsConfig(), status: "active", version: 1, createdAt: "2026-10-03T12:00:00.000Z", updatedAt: "2026-10-03T12:00:00.000Z" };
test("merchant records accept typed restock settings and preserve disabled default", () => {
  assert.equal(parseMerchantAdminRecord(record).config.enabled, false);
});
test("restock merchant records reject invalid settings and private provider keys", () => {
  for (const config of [{}, { ...record.config, schemaVersion: 2 }, { ...record.config, enabled: "true" }, { ...record.config, apiKey: "secret" }]) assert.throws(() => parseMerchantAdminRecord({ ...record, config }));
});
