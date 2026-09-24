import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";

import {
  SQL, DB, STORE, OWNER, MEMBERSHIP, PLAN, NOW,
  command, start, stop, psql, apply, migrationsThrough128, seed,
} from "../reference-pricing/postgres-harness.mjs";

const PRODUCT = "50000000-0000-4000-8000-000000000130";
const OTHER_PRODUCT = "50000000-0000-4000-8000-000000000151";
const OTHER_STORE = "10000000-0000-4000-8000-000000000131";
const OTHER_MEMBERSHIP = "30000000-0000-4000-8000-000000000132";
const authority = `'${STORE}'::uuid,'${OWNER}'::uuid,'${MEMBERSHIP}'::uuid,'${PLAN}'::uuid,'free_starter',1,100,'${NOW}'::timestamptz`;
const merchantAuthority = `'${STORE}'::uuid,'${OWNER}'::uuid,'${MEMBERSHIP}'::uuid,'${PLAN}'::uuid,'free_starter',1,'${NOW}'::timestamptz`;
const settingId = "65000000-0000-4000-8000-000000000150";

function scalar(box, sql) { return psql(box, sql).stdout.trim().split("\n").at(-1); }
function asApp(box, sql, allowFailure = false) {
  return psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_app; ${sql} COMMIT;`, allowFailure);
}
function saveSetting(box, operation, expectedVersion, prefix) {
  const config = JSON.stringify({ storeDisplayName: "Test", supportEmail: "test@example.com", timezone: "Europe/Istanbul", skuPrefix: prefix });
  return JSON.parse(asApp(box, `SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
    FROM saas.merchant_admin_save(${merchantAuthority},'${operation}'::uuid,'${"c".repeat(64)}','${settingId}'::uuid,
      ${expectedVersion === null ? "NULL::bigint" : `${expectedVersion}::bigint`},'general_setting','Genel','${config}'::jsonb,'active');`).stdout.trim());
}
function quick(box, operation, product, variant, sku) {
  const intent = JSON.stringify({ kind: "quick", title: `SKU ${product.slice(-4)}`, sku, priceCents: 10000, publish: false });
  const sql = `SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
    FROM saas.catalog_onboard_product_v2(${authority},'${operation}'::uuid,'${"a".repeat(64)}',
      '${product}'::uuid,ARRAY['${variant}'::uuid],'${intent}'::jsonb);`;
  return JSON.parse(asApp(box, sql).stdout.trim());
}
function insertVariant(box, id, product, sku, suffix = "") {
  return psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.product_variants(id,product_id,store_id,title,sku,price_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at)
    VALUES('${id}','${product}','${STORE}','Test ${suffix}','${sku}',10000,false,0,'active','{}',1,'${NOW}','${NOW}'); COMMIT;`, true);
}
function asyncPsql(box, sql) {
  return new Promise((resolve) => {
    const child = spawn(box.tools.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", DB], { env: { ...process.env, LC_ALL: "C", LANG: "C" } });
    let stderr = "";
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stderr }));
    child.stdin.end(sql);
  });
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
  apply(box, "202609240150_store_sku_prefix.up.sql");
  apply(box, "202609240150_store_sku_prefix_assertions.sql");
  seed(box, { dynamicPricingEnabled: false });

  psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,created_at,updated_at)
    VALUES('${OTHER_PRODUCT}','${STORE}','sku-other-product','Other','draft','TRY',1,'${NOW}','${NOW}');
    INSERT INTO saas.catalog_admin_resources(id,store_id,resource_kind,name,slug,config,status,version,created_at,updated_at)
    VALUES('64000000-0000-4000-8000-000000000150','${STORE}','attribute','Renk','renk','{"values":["Beyaz","Siyah"]}','active',1,'${NOW}','${NOW}');
    ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile;
    COMMIT;`);
  const settingOperation = "70000000-0000-4000-8000-000000000155";
  assert.equal(saveSetting(box, settingOperation, null, "RSA").outcome, "saved");
  assert.equal(saveSetting(box, settingOperation, null, "RSA").outcome, "operation_replayed");
  assert.equal(saveSetting(box, "70000000-0000-4000-8000-000000000156", 1, "rsa").outcome, "invalid_input");

  const optionsV2 = JSON.parse(asApp(box, `SELECT result_payload FROM saas.catalog_get_onboarding_options_v2(${authority});`).stdout.trim());
  assert.equal(optionsV2.skuPrefix, "RSA");
  const otherAuthority = `'${OTHER_STORE}'::uuid,'${OWNER}'::uuid,'${OTHER_MEMBERSHIP}'::uuid,'${PLAN}'::uuid,'free_starter',1,100,'${NOW}'::timestamptz`;
  const otherV2 = JSON.parse(asApp(box, `SELECT result_payload FROM saas.catalog_get_onboarding_options_v2(${otherAuthority});`).stdout.trim());
  assert.equal(otherV2.skuPrefix, null);
  const oldOptions = JSON.parse(asApp(box, `SELECT result_payload FROM saas.catalog_get_onboarding_options(${authority});`).stdout.trim());
  assert.equal(Object.hasOwn(oldOptions, "skuPrefix"), false);

  const operation = "70000000-0000-4000-8000-000000000150";
  const quickProduct = "50000000-0000-4000-8000-000000000152";
  const quickVariant = "52000000-0000-4000-8000-000000000152";
  assert.equal(quick(box, operation, quickProduct, quickVariant, "RSA-001").outcome, "created");
  assert.equal(quick(box, operation, quickProduct, quickVariant, "RSA-001").outcome, "operation_replayed");
  assert.equal(scalar(box, `SELECT sku FROM saas.product_variants WHERE id='${quickVariant}'`), "RSA-001");
  assert.equal(scalar(box, `SELECT operation_kind FROM saas.catalog_onboarding_operations WHERE operation_id='${operation}'`), "quick_create");
  assert.equal(quick(box, "70000000-0000-4000-8000-000000000154",
    "50000000-0000-4000-8000-000000000154", "52000000-0000-4000-8000-000000000163", "RSA-001").outcome, "sku_conflict");
  const noSkuVariant = "52000000-0000-4000-8000-000000000161";
  assert.equal(quick(box, "70000000-0000-4000-8000-000000000153",
    "50000000-0000-4000-8000-000000000153", noSkuVariant, undefined).outcome, "created");
  assert.equal(scalar(box, `SELECT sku IS NULL FROM saas.product_variants WHERE id='${noSkuVariant}'`), "t");

  const batchOperation = "70000000-0000-4000-8000-000000000151";
  const batchIds = ["52000000-0000-4000-8000-000000000158", "52000000-0000-4000-8000-000000000159"];
  const batchRows = ["Beyaz", "Siyah"].map((color) => ({ title: color, sku: "RSA-BATCH", priceCents: 10000, stockTracking: true, stockQuantity: 1, attributes: { renk: color } }));
  const batchSql = (operationId, productId, ids, rows) => `SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
    FROM saas.catalog_create_variants_batch(${authority},'${operationId}'::uuid,'${"b".repeat(64)}','${productId}'::uuid,
      ARRAY[${ids.map((id) => `'${id}'::uuid`).join(",")}],
      '${JSON.stringify(rows).replaceAll("'", "''")}'::jsonb);`;
  assert.equal(JSON.parse(asApp(box, batchSql(batchOperation, PRODUCT, batchIds, batchRows)).stdout.trim()).outcome, "created");
  assert.equal(JSON.parse(asApp(box, batchSql(batchOperation, PRODUCT, batchIds, batchRows)).stdout.trim()).outcome, "operation_replayed");
  assert.equal(scalar(box, `SELECT count(*) FROM saas.product_variants WHERE product_id='${PRODUCT}' AND sku='RSA-BATCH'`), "2");
  const otherBatch = JSON.parse(asApp(box, batchSql("70000000-0000-4000-8000-000000000152", OTHER_PRODUCT,
    ["52000000-0000-4000-8000-000000000160"], [batchRows[0]])).stdout.trim());
  assert.equal(otherBatch.outcome, "sku_conflict");

  const first = insertVariant(box, "52000000-0000-4000-8000-000000000153", PRODUCT, "RSA-SHARED", "Beyaz");
  assert.equal(first.status, 0, first.stderr);
  const sameProduct = insertVariant(box, "52000000-0000-4000-8000-000000000154", PRODUCT, "RSA-SHARED", "Siyah");
  assert.equal(sameProduct.status, 0, sameProduct.stderr);
  const otherProduct = insertVariant(box, "52000000-0000-4000-8000-000000000155", OTHER_PRODUCT, "RSA-SHARED");
  assert.notEqual(otherProduct.status, 0);
  assert.match(otherProduct.stderr, /sku_conflict/u);
  const staleSnapshot = psql(box, `BEGIN ISOLATION LEVEL REPEATABLE READ; SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.product_variants(id,product_id,store_id,title,sku,price_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at)
    VALUES('52000000-0000-4000-8000-000000000162','${PRODUCT}','${STORE}','Stale','RSA-RR',10000,false,0,'active','{}',1,'${NOW}','${NOW}');
    COMMIT;`, true);
  assert.notEqual(staleSnapshot.status, 0);
  assert.match(staleSnapshot.stderr, /sku_owner_requires_read_committed/u);

  const idA = "52000000-0000-4000-8000-000000000156";
  const idB = "52000000-0000-4000-8000-000000000157";
  const insert = (id, product, sleep) => `BEGIN; SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.product_variants(id,product_id,store_id,title,sku,price_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at)
    VALUES('${id}','${product}','${STORE}','Concurrent','RSA-RACE',10000,false,0,'active','{}',1,'${NOW}','${NOW}');
    SELECT pg_catalog.pg_sleep(${sleep}); COMMIT;`;
  const [raceA, raceB] = await Promise.all([
    asyncPsql(box, insert(idA, PRODUCT, 2)),
    asyncPsql(box, insert(idB, OTHER_PRODUCT, 0)),
  ]);
  assert.equal([raceA.status, raceB.status].filter((status) => status === 0).length, 1);
  assert.equal(scalar(box, "SELECT count(*) FROM saas.product_variants WHERE store_id='" + STORE + "' AND sku='RSA-RACE'"), "1");

  assert.equal(saveSetting(box, "70000000-0000-4000-8000-000000000157", 1, "NEW").outcome, "saved");
  assert.equal(JSON.parse(asApp(box, `SELECT result_payload FROM saas.catalog_get_onboarding_options_v2(${authority});`).stdout.trim()).skuPrefix, "NEW");
  assert.equal(scalar(box, `SELECT sku FROM saas.product_variants WHERE id='${quickVariant}'`), "RSA-001");
  assert.equal(saveSetting(box, "70000000-0000-4000-8000-000000000158", 2, undefined).outcome, "saved");
  assert.equal(JSON.parse(asApp(box, `SELECT result_payload FROM saas.catalog_get_onboarding_options_v2(${authority});`).stdout.trim()).skuPrefix, null);
  assert.equal(scalar(box, `SELECT sku FROM saas.product_variants WHERE id='${quickVariant}'`), "RSA-001");
  process.stdout.write("PASS native PostgreSQL 16: versioned options, quick SKU/replay, same-product sharing, cross-product and concurrent conflict, prefix change preservation\n");
} finally {
  stop(box);
}
