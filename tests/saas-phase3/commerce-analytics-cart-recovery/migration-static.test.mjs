import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const sql = new URL("apps/owner/scripts/sql/saas/202609030124_commerce_analytics_cart_recovery.up.sql", root);
const downSql = new URL("apps/owner/scripts/sql/saas/202609030124_commerce_analytics_cart_recovery.down.sql", root);
const assertionsSql = new URL("apps/owner/scripts/sql/saas/202609030124_commerce_analytics_cart_recovery_assertions.sql", root);

test("migration 124 extends the existing commerce authorities without a parallel system", async () => {
  const [up, down, assertions] = await Promise.all([
    readFile(sql, "utf8"), readFile(downSql, "utf8"), readFile(assertionsSql, "utf8"),
  ]);
  for (const fragment of [
    "ALTER TABLE saas.store_analytics_connections",
    "CREATE TABLE saas.store_analytics_hostnames",
    "CREATE TABLE saas.store_commerce_analytics_settings",
    "ALTER TABLE saas.abandoned_carts",
    "CREATE TABLE saas.abandoned_cart_episodes",
    "CREATE TABLE saas.abandoned_cart_recovery_tokens",
    "CREATE TABLE saas.abandoned_cart_recovery_attempts",
    "ALTER TABLE saas.analytics_delivery_outbox",
    "analytics_outbox_claim_v2",
    "commerce_analytics_evaluate_carts",
    "FOR UPDATE SKIP LOCKED",
  ]) assert.match(up, new RegExp(fragment.replaceAll(".", "[.]")));
  assert.match(up, /candidate_minutes BETWEEN 15 AND 360/);
  assert.match(up, /abandoned_hours BETWEEN 1 AND 168/);
  assert.match(up, /recovery_link_hours BETWEEN 1 AND 168/);
  assert.match(up, /automatic_recovery_enabled boolean NOT NULL DEFAULT false/);
  assert.match(up, /UNIQUE \(store_id,event_key\)/);
  assert.match(up, /token_digest char\(64\)/);
  assert.doesNotMatch(up, /raw_token|token_value|token_plaintext/i);
  assert.match(up, /ENABLE ROW LEVEL SECURITY/g);
  assert.match(up, /FORCE ROW LEVEL SECURITY/g);
  assert.match(up, /REVOKE ALL[\s\S]+FROM PUBLIC/);
  assert.match(down, /COMMERCE_ANALYTICS_DOWN_GUARD/);
  assert.match(assertions, /ANALYTICS_COMMERCE_MIGRATION_ASSERTION_FAILED/);
});

test("migration 124 preserves financial and tenant authority invariants", async () => {
  const up = await readFile(sql, "utf8");
  assert.match(up, /REFERENCES saas[.]orders\(store_id,id\)/);
  assert.match(up, /REFERENCES saas[.]abandoned_carts\(store_id,id\)/);
  assert.match(up, /currency text[^\n]+CHECK \(currency ~ '\^\[A-Z\]\{3\}\$'\)/);
  assert.match(up, /value_minor bigint[^\n]+CHECK \(value_minor >= 0\)/);
  assert.match(up, /payment_status='completed'/);
  assert.doesNotMatch(up, /payment_status='pending'[\s\S]{0,100}recovered/i);
});
