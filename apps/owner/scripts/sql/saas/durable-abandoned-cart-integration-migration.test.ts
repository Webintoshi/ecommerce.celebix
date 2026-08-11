import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const files = {
  up: "202608120101_durable_abandoned_cart_integration.up.sql",
  down: "202608120101_durable_abandoned_cart_integration.down.sql",
  assertions: "202608120101_durable_abandoned_cart_integration_assertions.sql",
  manifest: "phase4t-durable-abandoned-cart-integration-manifest.json",
} as const;

function source(name: keyof typeof files): string {
  const url = new URL(files[name], root);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

test("101 binds durable carts to one server-owned merchant projection", () => {
  const up = source("up");
  assert.match(up, /source_cart_id uuid/);
  assert.match(up, /sync_durable_abandoned_cart/);
  assert.match(up, /CREATE CONSTRAINT TRIGGER durable_abandoned_cart_sync/);
  assert.match(up, /CREATE CONSTRAINT TRIGGER durable_abandoned_cart_item_sync/);
  assert.match(up, /DEFERRABLE INITIALLY DEFERRED/);
  assert.match(up, /reconcile_durable_abandoned_carts/);
  assert.match(up, /INTERVAL '30 minutes'/);
  assert.doesNotMatch(up, /abandoned_carts_capture\s*\(|p_credentials|raw[_ ]credential/i);
});

test("101 preserves tenant and checkout authority boundaries", () => {
  const up = source("up");
  assert.match(up, /merchant_action_authority_error/);
  assert.match(up, /saas[.]storefront_checkout_operations/);
  assert.match(up, /recovered_order_id=selected_order_id/);
  assert.match(up, /REVOKE ALL ON FUNCTION saas[.]reconcile_durable_abandoned_carts/);
  assert.doesNotMatch(up, /GRANT (?:SELECT|INSERT|UPDATE|DELETE).*abandoned_carts.*celebix_saas_(?:app|host_resolver)/i);
});

test("101 rollback is guarded and catalog assertions are explicit", () => {
  const down = source("down");
  const assertions = source("assertions");
  assert.match(down, /allow_durable_abandoned_cart_integration_down/);
  assert.match(assertions, /DURABLE_ABANDONED_CART_INTEGRATION_SOURCE_COLUMN_MISSING/);
  assert.match(assertions, /DURABLE_ABANDONED_CART_INTEGRATION_TRIGGER_MISSING/);
  assert.match(assertions, /DURABLE_ABANDONED_CART_INTEGRATION_ITEM_TRIGGER_MISSING/);
  assert.match(assertions, /DURABLE_ABANDONED_CART_INTEGRATION_SOURCE_BINDING_INVALID/);
  assert.match(assertions, /DURABLE_ABANDONED_CART_INTEGRATION_FUNCTION_AUTHORITY_INVALID/);
  assert.match(assertions, /DURABLE_ABANDONED_CART_INTEGRATION_TABLE_AUTHORITY_INVALID/);
  for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
    assert.match(assertions, new RegExp(`'${privilege}'`));
  }
  for (const table of [
    "storefront_carts",
    "storefront_cart_credentials",
    "storefront_cart_items",
    "storefront_cart_operations",
    "storefront_checkout_intents",
    "storefront_customer_credentials",
    "storefront_order_receipts",
    "storefront_checkout_operations",
    "abandoned_carts",
    "abandoned_cart_items",
  ]) {
    assert.match(assertions, new RegExp(`saas[.]${table}`));
  }
  assert.match(assertions, /DURABLE_ABANDONED_CART_INTEGRATION_PRIVILEGE_INVALID/);
});

test("101 artifacts are checksum pinned", () => {
  for (const name of Object.values(files)) assert.equal(existsSync(new URL(name, root)), true, `${name} missing`);
  const manifest = JSON.parse(source("manifest")) as {
    phase: string;
    postgresqlMajor: number;
    externalConnections: number;
    productionMutations: number;
    artifacts: Array<{ file: string; direction: string; sha256: string }>;
  };
  assert.deepEqual({
    phase: manifest.phase,
    postgresqlMajor: manifest.postgresqlMajor,
    externalConnections: manifest.externalConnections,
    productionMutations: manifest.productionMutations,
  }, {
    phase: "phase4t-durable-abandoned-cart-integration",
    postgresqlMajor: 16,
    externalConnections: 0,
    productionMutations: 0,
  });
  assert.deepEqual(manifest.artifacts.map(({ file, direction }) => [file, direction]), [
    [files.up, "up"], [files.down, "down"], [files.assertions, "verify"],
  ]);
  for (const artifact of manifest.artifacts) {
    const bytes = readFileSync(new URL(artifact.file, root));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), artifact.sha256, artifact.file);
  }
});
