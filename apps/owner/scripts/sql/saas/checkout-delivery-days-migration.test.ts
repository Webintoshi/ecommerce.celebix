import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("delivery days migration confines writes to definitions and preserves rollback authority", async () => {
 const prefix = new URL("./202609270169_checkout_delivery_days", import.meta.url);
 const [up, down, assertions] = await Promise.all([".up.sql", ".down.sql", "_assertions.sql"].map((suffix) => readFile(new URL(`${prefix.href}${suffix}`), "utf8")));
 for (const sql of [up, down, assertions]) {
  assert.match(sql, /^BEGIN;/); assert.match(sql, /SET LOCAL ROLE celebix_saas_owner;/); assert.match(sql, /COMMIT;\s*$/);
  assert.doesNotMatch(sql, /(?:INSERT INTO|UPDATE|DELETE FROM) saas\.(?:merchant_admin_records|stores|memberships|subscriptions|provider_profiles)\b/i);
 }
 assert.match(up, /pg_catalog\.pg_get_functiondef/);
 assert.match(up, /CREATE OR REPLACE FUNCTION saas\.merchant_admin_config_valid/);
 assert.match(up, /FORCE ROW LEVEL SECURITY/);
 assert.match(up, /LANGUAGE plpgsql VOLATILE STRICT/);
 assert.match(up, /pg_catalog\.pg_advisory_xact_lock_shared/);
 assert.ok(up.indexOf("pg_catalog.pg_advisory_xact_lock_shared")<up.indexOf("RETURN CASE WHEN p_kind='shipping_setting'"));
 assert.ok(down.indexOf("pg_catalog.pg_advisory_xact_lock(")<down.indexOf("LOCK TABLE saas.merchant_admin_records"));
 assert.match(down, /saas\.checkout_delivery_days\.validation/);
 assert.match(down, /LOCK TABLE saas\.merchant_admin_records IN SHARE ROW EXCLUSIVE MODE/);
 assert.match(down, /CHECKOUT_DELIVERY_DAYS_DOWN_DEFINITION_CHANGED/);
 assert.match(down, /CHECKOUT_DELIVERY_DAYS_DOWN_INCOMPATIBLE_RECORD/);
 assert.match(down, /EXECUTE original/);
 assert.match(assertions, /CHECKOUT_DELIVERY_DAYS_AUTHORITY_INVALID/);
});
