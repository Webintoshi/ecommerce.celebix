import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const files = {
  up: "202608160112_storefront_builtin_checkout_order_address.up.sql",
  down: "202608160112_storefront_builtin_checkout_order_address.down.sql",
  assertions: "202608160112_storefront_builtin_checkout_order_address_assertions.sql",
  manifest: "phase5c-storefront-builtin-checkout-order-address-manifest.json",
} as const;

function source(name: keyof typeof files): string {
  const url = new URL(files[name], root);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

test("112 persists recipient name for built-in storefront checkout orders", () => {
  const up = source("up");
  assert.match(up, /public_checkout_complete_without_available_stock_v090/u);
  assert.match(up, /'recipientName',selected_customer[.]first_name\|\|' '\|\|selected_customer[.]last_name/u);
  assert.doesNotMatch(up, /p_delivery->'shippingAddress',NULL,1,p_now,p_now,selected_customer[.]id\);/u);
});

test("112 repairs order-detail projection and old eligible storefront rows", () => {
  const up = source("up");
  const assertions = source("assertions");
  assert.match(up, /CREATE OR REPLACE FUNCTION saas[.]orders_detail_projection/u);
  assert.match(up, /COALESCE\(NULLIF\(pg_catalog[.]btrim\(selected_order[.]shipping_address->>'recipientName'\), ''\), selected_order[.]customer_name\)/u);
  assert.match(up, /UPDATE saas[.]orders AS order_row[\s\S]+NOT order_row[.]shipping_address \? 'recipientName'/u);
  assert.match(up, /order_row[.]shipping_address \? 'line1'[\s\S]+order_row[.]shipping_address \? 'city'[\s\S]+order_row[.]shipping_address \? 'country'/u);
  assert.match(assertions, /STOREFRONT_BUILTIN_CHECKOUT_ORDER_ADDRESS_DETAIL_FALLBACK_INVALID/u);
});

test("112 rollback is owner-gated and keeps function authority pinned", () => {
  const down = source("down");
  const assertions = source("assertions");
  assert.match(down, /allow_storefront_builtin_checkout_order_address_down/u);
  assert.match(down, /STOREFRONT_BUILTIN_CHECKOUT_ORDER_ADDRESS_DOWN_GUARD_REQUIRED/u);
  assert.match(assertions, /STOREFRONT_BUILTIN_CHECKOUT_ORDER_ADDRESS_DETAIL_ACL_INVALID/u);
  assert.match(assertions, /public_checkout_complete_without_available_stock_v090/u);
});

test("112 artifacts are PostgreSQL 16 checksum pinned", () => {
  for (const name of Object.values(files)) {
    assert.equal(existsSync(new URL(name, root)), true, `${name} missing`);
  }
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
    phase: "phase5c-storefront-builtin-checkout-order-address",
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
