import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import path from "node:path";

import {
  SQL, DB, STORE, OWNER, MEMBERSHIP, PLAN, NOW,
  command, start, stop, psql, apply, migrationsThrough128, seed,
} from "../reference-pricing/postgres-harness.mjs";

const productId = "50000000-0000-4000-8000-000000000130";
const firstId = "52000000-0000-4000-8000-000000000149";
const secondId = "52000000-0000-4000-8000-000000000150";
const operationId = "70000000-0000-4000-8000-000000000149";
const authority = `'${STORE}'::uuid,'${OWNER}'::uuid,'${MEMBERSHIP}'::uuid,'${PLAN}'::uuid,'free_starter',1,100,'${NOW}'::timestamptz`;
const first = { title: "Kırmızı / M", sku: "RED-M", priceCents: 12000, stockTracking: true, stockQuantity: 3, attributes: { renk: "Kırmızı", beden: "M" } };
const second = { title: "Mavi / L", sku: "BLUE-L", priceCents: 14000, stockTracking: true, stockQuantity: 2, attributes: { renk: "Mavi", beden: "L" } };

function result(box, variants, ids = [firstId, secondId], operation = operationId) {
  const sql = `BEGIN; SET LOCAL ROLE celebix_saas_app;
    SELECT pg_catalog.jsonb_build_object('outcome',outcome,'payload',result_payload)
    FROM saas.catalog_create_variants_batch(${authority},'${operation}'::uuid,'${"a".repeat(64)}','${productId}'::uuid,
      ARRAY[${ids.map((id) => `'${id}'::uuid`).join(",")}],
      '${JSON.stringify(variants).replaceAll("'", "''")}'::jsonb); COMMIT;`;
  return JSON.parse(psql(box, sql).stdout.trim());
}

let box;
try {
  box = start();
  command(box.tools.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], `CREATE DATABASE ${DB};`);
  for (const file of migrationsThrough128()) apply(box, file);
  const later = readdirSync(SQL).filter((file) => /2026\d{8}_.*\.up\.sql$/.test(file)
    && Number(file.slice(8, 12)) >= 129
    && (Number(file.slice(8, 12)) <= 145 || Number(file.slice(8, 12)) === 149))
    .sort((a, b) => Number(a.slice(8, 12)) - Number(b.slice(8, 12)) || a.localeCompare(b));
  for (const file of later) apply(box, file);
  apply(box, "202609230149_catalog_variant_batch_assertions.sql");
  seed(box, { dynamicPricingEnabled: false });
  psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.catalog_admin_resources(id,store_id,resource_kind,name,slug,config,status,version,created_at,updated_at) VALUES
      ('64000000-0000-4000-8000-000000000149','${STORE}','attribute','Renk','renk','{"values":["Kırmızı","Mavi"]}','active',1,'2026-01-01','2026-01-01'),
      ('64000000-0000-4000-8000-000000000150','${STORE}','attribute','Beden','beden','{"values":["M","L"]}','active',1,'2026-01-01','2026-01-01'); COMMIT;`);

  const created = result(box, [first, second]);
  assert.equal(created.outcome, "created");
  assert.equal(created.payload.variants.length, 2);
  assert.equal(result(box, [first, second]).outcome, "operation_replayed");
  assert.equal(psql(box, `SELECT count(*) FROM saas.product_variants WHERE id IN ('${firstId}','${secondId}')`).stdout.trim(), "2");
  assert.equal(psql(box, `SELECT count(*) FROM saas.catalog_variant_commerce_profiles WHERE variant_id IN ('${firstId}','${secondId}')`).stdout.trim(), "2");
  const conflict = result(box, [{ ...first, sku: "UNIQUE", attributes: second.attributes }], ["52000000-0000-4000-8000-000000000151"], "70000000-0000-4000-8000-000000000150");
  assert.equal(conflict.outcome, "variant_combination_conflict");
  const skuConflict = result(box, [{ ...first, attributes: { renk: "Kırmızı", beden: "L" } }], ["52000000-0000-4000-8000-000000000151"], "70000000-0000-4000-8000-000000000151");
  assert.equal(skuConflict.outcome, "sku_conflict");
  const invalid = result(box, [
    { ...first, sku: "RED-L", attributes: { renk: "Kırmızı", beden: "L" } },
    { ...second, sku: "UNKNOWN", attributes: { renk: "Yeşil", beden: "M" } },
  ], ["52000000-0000-4000-8000-000000000151", "52000000-0000-4000-8000-000000000152"], "70000000-0000-4000-8000-000000000152");
  assert.equal(invalid.outcome, "invalid_input");
  assert.equal(psql(box, `SELECT count(*) FROM saas.product_variants WHERE id IN ('52000000-0000-4000-8000-000000000151','52000000-0000-4000-8000-000000000152')`).stdout.trim(), "0");
  assert.equal(psql(box, `SELECT count(*) FROM saas.catalog_operations WHERE operation_id='70000000-0000-4000-8000-000000000152'`).stdout.trim(), "0");
  process.stdout.write(`PASS native PostgreSQL 16: migration chain through 149, create/replay/conflicts, commerce projections\n`);
} finally {
  stop(box);
}
