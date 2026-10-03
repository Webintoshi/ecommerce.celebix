import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import pg from 'pg';
import { startAccountingFixture } from '../accounting-ledger/fixture.mjs';

// This fixture is socket-only, disposable, and refuses configured production DBs.
const fixture = startAccountingFixture(204);
const pool = new pg.Pool({ ...fixture.connection, max: 2 });
const migrations = [
  '202610030205_side_cart_free_shipping',
  '202610030206_verified_review_collection',
  '202610030207_restock_alerts',
];
const sqlRoot = new URL('../../../apps/owner/scripts/sql/saas/', import.meta.url);
const files = new Map();
let checks = 0;
const check = async (name, run) => { await run(); console.log(`PASS ${++checks} ${name}`); };

function body(filename) {
  const source = readFileSync(new URL(filename, sqlRoot), 'utf8');
  files.set(filename, source);
  // Individual migrations are transactional themselves. The release executes
  // their complete bodies and assertions under one outer transaction instead.
  const starts = source.match(/^BEGIN(?: READ ONLY)?;\s*$/gm) ?? [];
  const ends = source.match(/^(?:COMMIT|ROLLBACK);\s*$/gm) ?? [];
  assert.ok(starts.length <= 1 && ends.length <= 1, `${filename}: unexpected transaction boundary`);
  assert.equal(starts.length, ends.length, `${filename}: incomplete transaction boundary`);
  if (!filename.endsWith('_assertions.sql')) assert.equal(starts.length, 1, `${filename}: migration must be transactional`);
  return source.replace(/^BEGIN(?: READ ONLY)?;\s*$/gm, '').replace(/^(?:COMMIT|ROLLBACK);\s*$/gm, '');
}

const functions = async () => (await pool.query(`
  SELECT p.oid, p.oid::regprocedure::text AS identity,
    pg_get_functiondef(p.oid) AS definition, to_jsonb(p)-'prosrc' AS authority
  FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace
  ORDER BY p.oid
`)).rows;

const relations = async () => (await pool.query(`
  SELECT c.oid,c.relname,c.relkind,c.relowner,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity
  FROM pg_class c WHERE c.relnamespace='saas'::regnamespace AND c.relkind IN('r','p','v','m','S')
  ORDER BY c.relname
`)).rows;

const constraints = async () => (await pool.query(`
  SELECT c.conname,c.conrelid::regclass::text AS relation,c.contype,c.convalidated,
    c.condeferrable,c.condeferred,pg_get_constraintdef(c.oid) AS definition
  FROM pg_constraint c WHERE c.connamespace='saas'::regnamespace
  ORDER BY c.conrelid::regclass::text,c.conname
`)).rows;

const triggers = async () => (await pool.query(`
  SELECT t.tgname,t.tgrelid::regclass::text AS relation,t.tgenabled,pg_get_triggerdef(t.oid) AS definition
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
  WHERE c.relnamespace='saas'::regnamespace AND NOT t.tgisinternal
  ORDER BY t.tgrelid::regclass::text,t.tgname
`)).rows;

async function business(tables) {
  const result = [];
  for (const table of tables) {
    const identifier = `saas."${table.relname.replaceAll('"', '""')}"`;
    const rows = (await pool.query(`SELECT count(*)::text AS count,
      encode(sha256(convert_to(coalesce(string_agg(row_json,E'\\n' ORDER BY row_json),''),'UTF8')),'hex') AS hash
      FROM (SELECT to_jsonb(record)::text AS row_json FROM ${identifier} record) source`)).rows[0];
    result.push({ table: table.relname, ...rows });
  }
  return result;
}

try {
  // Non-empty merchant and catalog data make the preservation check meaningful.
  const store = randomUUID(), product = randomUUID(), variant = randomUUID();
  await pool.query("INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES($1,'Release fixture',$2,'active','tr','TRY','hemenaku','2026-01-01','2026-01-01')", [store, `release-${store}`]);
  await pool.query("INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at) VALUES($1,$2,'retained-product','Retained product','active','TRY','2026-01-01','2026-01-01')", [product, store]);
  const inventory = await pool.connect();
  try {
    await inventory.query('BEGIN');
    await inventory.query("SELECT set_config('saas.inventory.source_marker','catalog_adjustment',true),set_config('saas.inventory.source_id',$1,true),set_config('saas.inventory.source_time','2026-01-01',true)", [randomUUID()]);
    await inventory.query("INSERT INTO saas.product_variants(id,store_id,product_id,title,price_cents,stock_tracking,stock_quantity,status,created_at,updated_at) VALUES($1,$2,$3,'Retained variant',10000,false,0,'active','2026-01-01','2026-01-01')", [variant, store, product]);
    await inventory.query('COMMIT');
  } catch (error) { await inventory.query('ROLLBACK'); throw error; } finally { inventory.release(); }
  await pool.query("INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,created_at,updated_at) VALUES($1,$2,'shipping_setting','Retained delivery','{\"shippingPriceCents\":1489,\"freeShippingThresholdCents\":100,\"estimatedDays\":3}','active','2026-01-01','2026-01-01')", [randomUUID(), store]);

  const baselineFunctions = await functions(), baselineRelations = await relations();
  const baselineTables = baselineRelations.filter(table => ['r', 'p'].includes(table.relkind));
  const baselineBusiness = await business(baselineTables), baselineConstraints = await constraints(), baselineTriggers = await triggers();
  assert.ok(baselineBusiness.some(table => table.table === 'products' && Number(table.count) > 0));
  const up = migrations.map(name => `${body(`${name}.up.sql`)}\n${body(`${name}_assertions.sql`)}`);
  const down = migrations.toReversed().map(name => body(`${name}.down.sql`));
  const guard = `DO $release_guard$ BEGIN
    IF to_regclass('saas.side_cart_free_shipping_backup') IS NOT NULL
      OR to_regclass('saas.review_collection_206_backup') IS NOT NULL
      OR to_regclass('saas.restock_alerts_207_backup') IS NOT NULL
      OR to_regprocedure('saas.storefront_shipping_for_subtotal(uuid,bigint)') IS NOT NULL
    THEN RAISE EXCEPTION 'STORE_ENGAGEMENT_RELEASE_ALREADY_INSTALLED'; END IF;
  END $release_guard$;`;
  const release = `BEGIN;\n${guard}\n${up.join('\n')}\nCOMMIT;\n`;
  const rollback = `BEGIN;\n${down.join('\n')}\nCOMMIT;\n`;

  async function assertBaseline() {
    assert.deepEqual(await functions(), baselineFunctions, 'original function identities, definitions and full authority');
    assert.deepEqual(await relations(), baselineRelations, 'original relation identities and authority');
    assert.deepEqual(await constraints(), baselineConstraints, 'original constraints');
    assert.deepEqual(await triggers(), baselineTriggers, 'original triggers');
    assert.deepEqual(await business(baselineTables), baselineBusiness, 'every existing business table count and content hash');
  }

  for (let step = 1; step <= up.length; step++) {
    await check(`failure after SQL${204 + step} atomically rolls back the entire release`, async () => {
      const failed = fixture.sql(`BEGIN;\n${guard}\n${up.slice(0, step).join('\n')}\nDO $failure$ BEGIN RAISE EXCEPTION 'STORE_ENGAGEMENT_RELEASE_INJECTED_FAILURE'; END $failure$;\nCOMMIT;`, true);
      assert.notEqual(failed.status, 0);
      assert.match(failed.stderr, /STORE_ENGAGEMENT_RELEASE_INJECTED_FAILURE/);
      await assertBaseline();
    });
  }

  await check('SQL205/206/207 and all assertions commit as one release without changing merchant data or predecessor authority', async () => {
    fixture.sql(release);
    assert.deepEqual(await business(baselineTables), baselineBusiness);
    const applied = new Map((await functions()).map(value => [value.oid, value]));
    for (const predecessor of baselineFunctions) {
      const retained = applied.get(predecessor.oid);
      assert.ok(retained, predecessor.identity);
      assert.equal(retained.identity, predecessor.identity);
      assert.deepEqual(retained.authority, predecessor.authority, predecessor.identity);
    }
    for (const name of ['review_collection_requests', 'restock_subscriptions', 'restock_deliveries']) {
      assert.equal((await pool.query(`SELECT count(*)::text AS count FROM saas.${name}`)).rows[0].count, '0');
    }
    assert.equal((await pool.query('SELECT saas.storefront_shipping_for_subtotal($1,8000000001) value', [store])).rows[0].value.shippingCents, 1489);
  });

  await check('SQL207→206→205 restores baseline identities, ACLs, definitions and all business data', async () => {
    const unresolved = (await pool.query("SELECT identity FROM saas.restock_alerts_207_backup WHERE function_owner IS NOT NULL AND to_regprocedure(identity) IS NULL ORDER BY identity")).rows;
    assert.deepEqual(unresolved, [], 'SQL207 backup function identities must resolve outside the original migration search_path');
    fixture.sql(rollback);
    await assertBaseline();
  });

  await check('a second combined application passes and source files did not change during acceptance', async () => {
    fixture.sql(release);
    assert.deepEqual(await business(baselineTables), baselineBusiness);
    for (const [filename, source] of files) assert.equal(readFileSync(new URL(filename, sqlRoot), 'utf8'), source, `${filename}: changed during acceptance`);
  });
  await check('release preview guard rejects a second installation without altering the accepted schema or business data', async () => {
    const acceptedFunctions = await functions(), acceptedRelations = await relations(), acceptedConstraints = await constraints(), acceptedTriggers = await triggers();
    const rejected = fixture.sql(release, true);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /STORE_ENGAGEMENT_RELEASE_ALREADY_INSTALLED/);
    assert.deepEqual(await functions(), acceptedFunctions);
    assert.deepEqual(await relations(), acceptedRelations);
    assert.deepEqual(await constraints(), acceptedConstraints);
    assert.deepEqual(await triggers(), acceptedTriggers);
    assert.deepEqual(await business(baselineTables), baselineBusiness);
  });
  const manifest = [...files].map(([file, source]) => ({ file, sha256: createHash('sha256').update(source).digest('hex') }));
  console.log(JSON.stringify({ baselineTableCount: baselineTables.length, baselineFunctionCount: baselineFunctions.length, manifest }));
  if (process.argv.includes('--write-release-bundle')) {
    const output = new URL('../../../.tmp/store-engagement-release/', import.meta.url);
    mkdirSync(output, { recursive: true });
    writeFileSync(new URL('apply-205-207.sql', output), release);
    writeFileSync(new URL('rollback-207-205.sql', output), rollback);
    writeFileSync(new URL('manifest.json', output), JSON.stringify({ postgresMajor: 16, baselineThrough: 204, checks, baselineTableCount: baselineTables.length, baselineFunctionCount: baselineFunctions.length, manifest, applySha256: createHash('sha256').update(release).digest('hex'), rollbackSha256: createHash('sha256').update(rollback).digest('hex') }, null, 2) + '\n');
    console.log(`LOCAL_VERIFIED_RELEASE_BUNDLE ${output.pathname}`);
  }
  console.log(`STORE_ENGAGEMENT_RELEASE_POSTGRESQL16_COMPLETE ${checks}/${checks}`);
} finally {
  await pool.end();
  fixture.stop();
}
