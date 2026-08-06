import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const up = readFileSync(path.join(SQL, "202608060094_shipping_fulfillment_runtime.up.sql"), "utf8");
const down = readFileSync(path.join(SQL, "202608060094_shipping_fulfillment_runtime.down.sql"), "utf8");
const assertions = readFileSync(path.join(SQL, "202608060094_shipping_fulfillment_runtime_assertions.sql"), "utf8");

test("fulfillment runtime has no direct table privileges or network work", () => {
  assert.doesNotMatch(up, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE)[\s\S]*shipping_/iu);
  assert.doesNotMatch(`${up}\n${down}\n${assertions}`, /\b(?:fetch|axios|curl|http_request|dblink|postgres_fdw)\b/iu);
  assert.match(assertions, /has_table_privilege[(]'celebix_saas_app','saas[.]shipping_shipments','SELECT,INSERT,UPDATE,DELETE'[)]/u);
});

test("quote credentials and provider authority stay server-only", () => {
  assert.match(up, /quote_credential_digest char[(]64[)]/u);
  assert.doesNotMatch(up, /quote_credential\s+text/iu);
  const projections = [...up.matchAll(/CREATE FUNCTION saas[.]shipping_(?:quote|shipment)_projection[\s\S]+?\$function\$;/gu)].map((match) => match[0]).join("\n");
  assert.doesNotMatch(projections, /credential_envelope|credential_digest|provider_resource_id|storeId|profileId/iu);
});

test("shipment creation is explicit idempotent and all-remaining bounded", () => {
  assert.match(up, /operation_kind IN[(]'begin_quote','begin_shipment'[)]/u);
  assert.match(up, /shipping_fulfillment_operations_store_operation_key/u);
  assert.match(up, /shipping_shipment_items_quantity_check/u);
  assert.match(up, /INSERT INTO saas[.]shipping_shipment_items/u);
  assert.match(up, /order_item[.]quantity-COALESCE/u);
  assert.doesNotMatch(up, /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION[\s\S]*CREATE\s+EXTENSION/iu);
});

test("rollback cannot touch provider profiles orders or payment authority", () => {
  assert.match(down, /SHIPPING_FULFILLMENT_RUNTIME_DOWN_BLOCKED/u);
  assert.doesNotMatch(down, /DROP TABLE saas[.](?:shipping_provider_profiles|orders|order_items|payment_attempts)/u);
});
