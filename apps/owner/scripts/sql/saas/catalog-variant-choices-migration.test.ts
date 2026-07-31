import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const up = readFileSync(new URL("202607310077_catalog_variant_choices.up.sql", root), "utf8");
const down = readFileSync(new URL("202607310077_catalog_variant_choices.down.sql", root), "utf8");
const assertions = readFileSync(new URL("202607310077_catalog_variant_choices_assertions.sql", root), "utf8");
const signature = "saas.catalog_list_variant_choices(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz)";

test("catalog variant choice migration is tenant-scoped, active-only and bounded", () => {
  assert.match(up, /CREATE FUNCTION saas[.]catalog_list_variant_choices/);
  assert.match(up, /catalog_authority_error/);
  assert.match(up, /product[.]store_id = p_store_id/g);
  assert.match(up, /variant[.]store_id = product[.]store_id/g);
  assert.match(up, /product[.]status = 'active'/g);
  assert.match(up, /variant[.]status = 'active'/g);
  assert.match(up, /choice_count > 5000/);
  assert.match(up, /jsonb_strip_nulls/);
  assert.doesNotMatch(up, /storeId|principalId|membershipId|planId/);
});

test("catalog variant choice migration exposes only its safe function to the app role", () => {
  const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(up, /^BEGIN;\nSET LOCAL ROLE celebix_saas_owner;/);
  assert.match(up, new RegExp(`REVOKE ALL ON FUNCTION ${escaped} FROM PUBLIC`));
  assert.match(up, new RegExp(`GRANT EXECUTE ON FUNCTION ${escaped} TO celebix_saas_app`));
  assert.match(down, /DROP FUNCTION saas[.]catalog_list_variant_choices/);
  assert.match(assertions, /catalog variant choice authority or bound is incomplete/);
  for (const source of [up, down]) {
    assert.match(source, /COMMIT;\s*$/);
    assert.doesNotMatch(source, /postgres(?:ql)?:\/\//i);
  }
});
