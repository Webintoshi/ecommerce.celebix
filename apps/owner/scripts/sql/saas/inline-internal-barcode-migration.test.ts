import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const up = readFileSync(new URL("202609250151_inline_internal_barcode.up.sql", import.meta.url), "utf8");
const down = readFileSync(new URL("202609250151_inline_internal_barcode.down.sql", import.meta.url), "utf8");
const assertions = readFileSync(new URL("202609250151_inline_internal_barcode_assertions.sql", import.meta.url), "utf8");
const numericUp = readFileSync(new URL("202609250152_numeric_internal_barcode.up.sql", import.meta.url), "utf8");
const numericDown = readFileSync(new URL("202609250152_numeric_internal_barcode.down.sql", import.meta.url), "utf8");
const numericAssertions = readFileSync(new URL("202609250152_numeric_internal_barcode_assertions.sql", import.meta.url), "utf8");

test("inline Code 128 reservation shares the tenant sequence and never changes a product", () => {
  assert.match(up, /merchant_action_authority_error\([\s\S]*'catalog_admin\.manage'/u);
  assert.match(up, /pg_advisory_xact_lock[\s\S]*p_operation_id/u);
  assert.match(up, /existing\.store_id<>p_store_id OR existing\.operation_kind<>'reserve_internal'/u);
  assert.match(up, /barcode_label_sequences\(store_id,last_value,updated_at\)/u);
  assert.match(up, /ON CONFLICT\(store_id\) DO UPDATE/u);
  assert.match(up, /internal_code:='CXI-'\|\|pg_catalog\.lpad\(sequence_value::text,12,'0'\)/u);
  assert.match(up, /INSERT INTO saas\.barcode_label_operations/u);
  assert.doesNotMatch(up, /(?:UPDATE|INSERT INTO|DELETE FROM)\s+saas\.product_variants/iu);
});

test("reservation migration keeps app table privileges sealed and rollback preserves operation history", () => {
  assert.match(up, /REVOKE ALL ON FUNCTION saas\.barcode_label_reserve_internal/u);
  assert.match(up, /GRANT EXECUTE ON FUNCTION saas\.barcode_label_reserve_internal/u);
  assert.match(down, /reservations_must_be_cleared_before_downgrade/u);
  assert.match(assertions, /inline_barcode_authority_invalid/u);
});

test("numeric barcode migration keeps legacy functions and uses one tenant sequence for both new paths", () => {
  assert.match(numericUp, /CREATE FUNCTION saas\.barcode_label_reserve_numeric_internal\(/u);
  assert.match(numericUp, /CREATE FUNCTION saas\.barcode_label_generate_numeric_internal\(/u);
  assert.doesNotMatch(numericUp, /(?:DROP|REPLACE) FUNCTION saas\.barcode_label_(?:reserve|generate)_internal/u);
  assert.match(numericUp, /CREATE UNIQUE INDEX product_variants_store_numeric_internal_barcode_key/u);
  assert.match(numericUp, /barcode ~ '\^97\[0-9\]\{7\}\$'/u);
  assert.match(numericUp, /barcode_label_sequences\(store_id,last_value,updated_at\)/u);
  assert.match(numericUp, /WHERE saas\.barcode_label_sequences\.last_value<9999999/u);
  assert.match(numericUp, /internal_code:='97'\|\|pg_catalog\.lpad\(sequence_value::text,7,'0'\)/u);
  assert.equal((numericUp.match(/saas\.barcode_label_next_numeric_internal\(p_store_id,p_now\)/gu) ?? []).length, 2);
  assert.match(numericUp, /merchant_action_authority_error\([\s\S]*'catalog_admin\.manage'/u);
  assert.match(numericUp, /REVOKE ALL ON FUNCTION saas\.barcode_label_next_numeric_internal/u);
  assert.match(numericAssertions, /numeric_internal_barcode_contract_invalid/u);
  assert.match(numericDown, /numeric_internal_barcodes_must_be_cleared_before_downgrade/u);
});
