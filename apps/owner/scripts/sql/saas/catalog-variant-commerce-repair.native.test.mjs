import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { applyBaseline } from '../../../../../tests/saas-phase3/admin-login-security/baseline.mjs';
import { startDisposablePostgres } from '../../../../../tests/saas-phase3/merchant-signup-profile/disposable-postgres.mjs';

const dir = import.meta.dirname;
const read = (file) => readFileSync(path.join(dir, file), 'utf8');
const stem = '202611130506_catalog_variant_commerce_repair';
const id = (number) => `50600000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const store = id(1);
const actor = id(2);
const membership = id(3);
const product = id(4);
const existing = id(5);
const missing = id(6);
const archived = id(7);
const plan = '00000000-0000-4000-8000-000000000010';

test('backfills visible catalog variants and maintains commerce profiles across single-variant entry points', () => {
  const { sql, stop } = startDisposablePostgres({ database: 'catalog_variant_commerce_repair' });
  const query = (source) => JSON.parse(sql(source));
  const owner = (source) => sql(`SET ROLE celebix_saas_owner; ${source}`);
  try {
    applyBaseline(sql, dir);
    for (const file of readdirSync(dir)
      .filter((file) => /^\d{12}/.test(file) && Number(file.slice(8, 12)) > 227
        && Number(file.slice(8, 12)) <= 271 && /(?:\.up|\.seed|\.freeze|_grants)\.sql$/.test(file))
      .sort((a, b) => Number(a.slice(8, 12)) - Number(b.slice(8, 12)) || a.localeCompare(b))) {
      sql(read(file));
    }

    owner(`
      INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)
      VALUES ('${store}','Fixture','variant-commerce-repair','active','tr','TRY','starter',now(),now());
      INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)
      VALUES ('${actor}','fixture','variant-commerce-repair','fixture@example.test',true,now(),now());
      INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)
      VALUES ('${membership}','${actor}','${store}','store_owner','active',now(),now());
      INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)
      VALUES ('${id(8)}','${store}','${plan}','professional',2,'active',now()-interval '1 day',now(),now());
      INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at)
      VALUES ('${product}','${store}','fixture-product','Fixture product','active','TRY',now(),now());
      SELECT set_config('saas.inventory.source_marker','catalog_adjustment',false),
        set_config('saas.inventory.source_id','${id(12)}',false),set_config('saas.inventory.source_time',now()::text,false);
      INSERT INTO saas.product_variants(id,store_id,product_id,title,price_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at)
      VALUES ('${existing}','${store}','${product}','First',1200,false,0,'active','{}',1,now(),now()),
             ('${missing}','${store}','${product}','Second',1300,false,0,'active','{}',1,now(),now()),
             ('${archived}','${store}','${product}','Archived',1400,false,0,'active','{}',1,now(),now());
      UPDATE saas.product_variants SET status='archived',archived_at=now(),updated_at=now() WHERE id='${archived}';
      INSERT INTO saas.catalog_variant_commerce_profiles(variant_id,product_id,store_id,continue_selling_when_out_of_stock,shipping_desi_milli,version,created_at,updated_at)
      VALUES ('${existing}','${product}','${store}',true,750,3,now(),now());
    `);
    const limit = sql(`SELECT effective_limit FROM saas.plan_limits WHERE plan_id='${plan}' AND limit_key='products'`);
    const authority = `'${store}','${actor}','${membership}','${plan}','professional',2,${limit},clock_timestamp()`;
    const editor = () => query(`SET ROLE celebix_saas_app;
      SELECT result_payload->'variants' FROM saas.catalog_get_product_editor_with_origins(${authority},'${product}')`);
    const profiles = () => query(`SELECT jsonb_object_agg(variant_id,to_jsonb(profile)) FROM saas.catalog_variant_commerce_profiles AS profile WHERE store_id='${store}'`);
    const original = profiles()[existing];
    assert.deepEqual(editor().map(({ variant }) => variant.id), [existing]);
    assert.throws(() => sql(read(`${stem}_assertions.sql`)), /CATALOG_VARIANT_COMMERCE_WRITER_MISSING_PROFILE/);

    sql(read(`${stem}.up.sql`));
    sql(read(`${stem}_assertions.sql`));
    assert.deepEqual(editor().map(({ variant }) => variant.id), [existing, missing]);
    assert.deepEqual(profiles()[existing], original);
    assert.equal(profiles()[missing].continue_selling_when_out_of_stock, false);
    assert.equal(profiles()[archived], undefined);
    const withoutProfile = query(`BEGIN;
      SET LOCAL ROLE celebix_saas_owner;
      DELETE FROM saas.catalog_variant_commerce_profiles WHERE variant_id='${missing}';
      SET LOCAL ROLE celebix_saas_app;
      SELECT row FROM saas.catalog_get_product_editor_with_origins(${authority},'${product}')
      CROSS JOIN LATERAL jsonb_array_elements(result_payload->'variants') AS variants(row)
      WHERE row->'variant'->>'id'='${missing}';
      ROLLBACK;`);
    assert.equal(withoutProfile.continueSellingWhenOutOfStock, false);
    assert.equal(withoutProfile.shippingDesiMilli, undefined);

    const create = (variantId, name, extra = '') => {
      const operation = randomUUID();
      const fingerprint = createHash('sha256').update(operation).digest('hex');
      const write = (id) => sql(`SET ROLE celebix_saas_app;
        SELECT outcome FROM saas.${name}(${authority},'${operation}','${fingerprint}','${product}','${id}',
          'New variant',NULL,NULL,1500,NULL,NULL,false,0,'{}'${extra})`);
      assert.equal(write(variantId), 'created', name);
      assert.equal(write(randomUUID()), 'operation_replayed', name);
      const profile = profiles()[variantId];
      assert.equal(profile.continue_selling_when_out_of_stock, false);
      assert.equal(profile.measured_quantity_milli, null);
    };
    create(id(9), 'catalog_create_variant');
    create(id(10), 'catalog_create_variant_measurements', `,'{"weight":{"valueMilli":500000,"unit":"g"}}'::jsonb`);
    create(id(11), 'catalog_create_variant_with_tax', `,'{"tax":{"treatment":"taxable","rateBps":2000}}'::jsonb`);
    assert.equal(editor().length, 5);
    sql(read(`${stem}_assertions.sql`));

    const beforeRollback = profiles();
    sql(read(`${stem}.down.sql`));
    assert.deepEqual(profiles(), beforeRollback);
    assert.throws(() => sql(read(`${stem}_assertions.sql`)), /CATALOG_VARIANT_COMMERCE_WRITER_MISSING_PROFILE/);
  } finally {
    stop();
  }
});
