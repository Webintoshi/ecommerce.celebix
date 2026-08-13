import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const read = (file) => readFile(path.join(SQL, file), "utf8");

test("durable carts project into merchant abandoned carts without browser capture authority", async () => {
  const migration = await read("202608120101_durable_abandoned_cart_integration.up.sql");
  assert.match(migration, /source_cart_id uuid/);
  assert.match(migration, /sync_durable_abandoned_cart/);
  assert.match(migration, /CREATE CONSTRAINT TRIGGER durable_abandoned_cart_sync/);
  assert.match(migration, /CREATE CONSTRAINT TRIGGER durable_abandoned_cart_item_sync/);
  assert.match(migration, /DEFERRABLE INITIALLY DEFERRED/);
  assert.doesNotMatch(migration, /abandoned_carts_capture\s*\(/);
  assert.doesNotMatch(migration, /p_credentials|raw[_ ]credential|document[.]cookie|localStorage/i);
});

test("manual merchant archive remains terminal while empty-cart archives may reactivate", async () => {
  const migration = await read("202608120101_durable_abandoned_cart_integration.up.sql");
  assert.match(migration, /selected_abandoned[.]status='archived'[\s\S]*NOT EXISTS[\s\S]*saas[.]abandoned_cart_items/);
});

test("merchant reads reconcile inactivity only after durable authority succeeds", async () => {
  const migration = await read("202608120101_durable_abandoned_cart_integration.up.sql");
  assert.match(migration, /reconcile_durable_abandoned_carts\s*\(/);
  assert.match(migration, /INTERVAL '30 minutes'/);
  for (const name of ["summary", "list", "get"]) {
    assert.match(migration, new RegExp(`CREATE FUNCTION saas[.]abandoned_carts_${name}\\(`));
  }
  assert.match(migration, /merchant_action_authority_error[\s\S]*reconcile_durable_abandoned_carts/);
  assert.doesNotMatch(migration, /GRANT (?:SELECT|INSERT|UPDATE|DELETE).*abandoned_carts.*celebix_saas_(?:app|host_resolver)/i);
});

test("projection uses authoritative catalog data and checkout order binding", async () => {
  const migration = await read("202608120101_durable_abandoned_cart_integration.up.sql");
  for (const source of [
    "saas.storefront_cart_items",
    "saas.storefront_cart_credentials",
    "saas.product_variants",
    "saas.products",
    "saas.product_media",
    "saas.storefront_checkout_operations",
  ]) assert.match(migration, new RegExp(source.replaceAll(".", "[.]")));
  assert.match(migration, /recovered_order_id/);
  assert.doesNotMatch(migration, /customer_name\s*:=|customer_email\s*:=|customer_phone\s*:=/);
});

test("migration remains additive, reversible, and manifest-bound", async () => {
  const [up, down, assertions, backfillUp, backfillDown, backfillAssertions, identityUp, identityDown, identityAssertions, manifestSource] = await Promise.all([
    read("202608120101_durable_abandoned_cart_integration.up.sql"),
    read("202608120101_durable_abandoned_cart_integration.down.sql"),
    read("202608120101_durable_abandoned_cart_integration_assertions.sql"),
    read("202608120102_durable_abandoned_cart_rollout_backfill.up.sql"),
    read("202608120102_durable_abandoned_cart_rollout_backfill.down.sql"),
    read("202608120102_durable_abandoned_cart_rollout_backfill_assertions.sql"),
    read("202608120103_abandoned_cart_product_customer_identity.up.sql"),
    read("202608120103_abandoned_cart_product_customer_identity.down.sql"),
    read("202608120103_abandoned_cart_product_customer_identity_assertions.sql"),
    read("phase4t-durable-abandoned-cart-integration-manifest.json"),
  ]);
  assert.match(up, /^--/);
  assert.match(down, /allow_durable_abandoned_cart_integration_down/);
  assert.match(assertions, /DURABLE_ABANDONED_CART_INTEGRATION_/);
  assert.match(backfillUp, /sync_durable_abandoned_cart/);
  assert.match(backfillDown, /allow_durable_abandoned_cart_rollout_backfill_down/);
  assert.match(backfillAssertions, /DURABLE_ABANDONED_CART_ROLLOUT_BACKFILL_INCOMPLETE/);
  assert.match(identityUp, /storefront_verified_customer_from_candidates/);
  assert.match(identityUp, /firstProductName/);
  assert.match(identityDown, /allow_abandoned_cart_product_customer_identity_down/);
  assert.match(identityAssertions, /ABANDONED_CART_PRODUCT_CUSTOMER_IDENTITY_PROJECTION_LEAK/);
  const manifest = JSON.parse(manifestSource);
  assert.equal(manifest.phase, "phase4t-durable-abandoned-cart-integration");
  assert.equal(manifest.postgresqlMajor, 16);
  assert.equal(manifest.externalConnections, 0);
  assert.equal(manifest.productionMutations, 0);
  assert.deepEqual(manifest.artifacts.map((entry) => entry.file), [
    "202608120101_durable_abandoned_cart_integration.up.sql",
    "202608120101_durable_abandoned_cart_integration.down.sql",
    "202608120101_durable_abandoned_cart_integration_assertions.sql",
    "202608120102_durable_abandoned_cart_rollout_backfill.up.sql",
    "202608120102_durable_abandoned_cart_rollout_backfill.down.sql",
    "202608120102_durable_abandoned_cart_rollout_backfill_assertions.sql",
    "202608120103_abandoned_cart_product_customer_identity.up.sql",
    "202608120103_abandoned_cart_product_customer_identity.down.sql",
    "202608120103_abandoned_cart_product_customer_identity_assertions.sql",
  ]);
  for (const entry of manifest.artifacts) assert.match(entry.sha256, /^[a-f0-9]{64}$/);
});
