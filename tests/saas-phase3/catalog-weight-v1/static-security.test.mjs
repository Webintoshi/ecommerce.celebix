import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const root=new URL("../../../",import.meta.url);
const read=file=>readFileSync(new URL(file,root),"utf8");
const migration=read("apps/owner/scripts/sql/saas/202609210142_catalog_weight.up.sql");
const editor=read("apps/customer-panel/components/catalog/CatalogWeightEditor.tsx");
const runner=read("scripts/catalog-weight-backfill.mjs");
const contract=read("packages/saas-contracts/src/catalog-weight/types.ts");

test("declared weight is an admin-only store opt-in and not a pricing mutation",()=>{
  for(const table of ["catalog_weight_store_profiles","catalog_weight_declarations","catalog_weight_operations"]){
    assert.match(migration,new RegExp(`ALTER TABLE saas[.]${table} FORCE ROW LEVEL SECURITY`,"u"));
  }
  assert.match(migration,/CHECK \(pricing_verified=false\)/u);
  assert.doesNotMatch(migration,/\b(?:UPDATE|DELETE FROM)\s+saas[.](?:products|product_variants|pricing_[a-z_]+)\b/iu);
  assert.doesNotMatch(`${editor}\n${contract}`,/a828862c|guzide-kuyumcu|guzidekuyumcu/iu);
  assert.match(editor,/if\(projection[.]profileMode===null\)return null/u);
  assert.doesNotMatch(contract,/metalGrams|gold_gram|priceCents|stockQuantity/u);
});

test("exact import is source-version pinned, empty-target only, and rollback preserves later edits",()=>{
  assert.match(migration,/product_row[.]version<>p_expected_product_version OR variant_row[.]version<>p_expected_variant_version/u);
  assert.match(migration,/current_digest<>p_source_digest/u);
  assert.match(migration,/existing_value_preserved/u);
  assert.match(migration,/target[.]import_operation_id<>p_import_operation_id OR target[.]version<>1/u);
  assert.match(runner,/a828862c-4cc1-475a-89cc-5fbee31eb43f/u);
  assert.match(runner,/guzide-kuyumcu-4/u);
  assert.match(runner,/mode:"dry_run"/u);
});
