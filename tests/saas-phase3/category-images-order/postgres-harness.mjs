// Focused disposable PostgreSQL rehearsal. Fixture authority is intentionally
// narrow; application authority is independently covered by HTTP/repository tests.
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { assertSafeEnvironment } from '../../saas-phase2/postgres/disposable-harness.mjs';

assertSafeEnvironment();
const ROOT = path.resolve(import.meta.dirname, '../../..');
const SQL = path.join(ROOT, 'apps/owner/scripts/sql/saas');
const BIN = process.env.CELEBIX_TEST_PG_BIN ?? '/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin';
for (const tool of ['initdb', 'pg_ctl', 'psql']) assert.ok(existsSync(path.join(BIN, tool)), `Missing disposable PostgreSQL tool: ${tool}`);
const temp = mkdtempSync('/tmp/celebix-category-order-');
const data = path.join(temp, 'data'), socket = path.join(temp, 'socket');
const UP = '202609260157_category_images_and_order.up.sql';
const DOWN = '202609260157_category_images_and_order.down.sql';
const ASSERTIONS = '202609260157_category_images_and_order_assertions.sql';
const source = readFileSync(path.join(SQL, '202607280056_catalog_product_onboarding.up.sql'), 'utf8');
const assetSource = readFileSync(path.join(SQL, '202607300069_admin_managed_starter_theme.up.sql'), 'utf8');
function extract(text, name, delimiter = '$function$') {
  const start = text.indexOf(`CREATE FUNCTION saas.${name}(`);
  assert.ok(start >= 0);
  const end = text.indexOf(`\n${delimiter};`, text.indexOf(`AS ${delimiter}`, start));
  return text.slice(start, end + delimiter.length + 2);
}
function run(tool, args, input) {
  const result = spawnSync(path.join(BIN, tool), args, { encoding: 'utf8', input, maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${tool} failed: ${result.stderr}`);
  return result.stdout;
}
function sql(text) { return run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', '55471', '-U', 'postgres', '-d', 'postgres', '-q'], text); }
const STORE = '33333333-3333-4333-8333-333333333333', FOREIGN = '33333333-3333-4333-8333-333333333334';
const PRINCIPAL = '44444444-4444-4444-8444-444444444444', ANALYST = '44444444-4444-4444-8444-444444444445';
const A = '74000000-0000-4000-8000-000000000001', B = '74000000-0000-4000-8000-000000000002';
const C = '74000000-0000-4000-8000-000000000003', D = '74000000-0000-4000-8000-000000000004';
const X = '75000000-0000-4000-8000-000000000001', Y = '75000000-0000-4000-8000-000000000002', Z = '75000000-0000-4000-8000-000000000003';
const NOW = '2026-09-26T12:00:00.000Z';
let operation = 0;
const op = () => `70000000-0000-4000-8000-${String(++operation).padStart(12, '0')}`;
const fingerprint = 'a'.repeat(64);
let pool;
let started = false;
let passed = 0;
function check(name, fn) { return Promise.resolve(fn()).then(() => { passed++; process.stdout.write(`PASS ${name}\n`); }); }
try {
  mkdirSync(socket, { mode: 0o700 });
  run('initdb', ['-D', data, '--auth=trust', '--username=postgres', '--no-locale']);
  appendFileSync(path.join(data, 'postgresql.conf'), `\nlisten_addresses = ''\nunix_socket_directories = '${socket.replaceAll("'", "''")}'\nport = 55471\n`);
  run('pg_ctl', ['-D', data, '-l', path.join(temp, 'postgres.log'), 'start']); started = true;
  const categoryStart = source.indexOf('CREATE TABLE saas.catalog_categories(');
  const categoryEnd = source.indexOf('CREATE TABLE saas.catalog_product_categories(');
  const operationsStart = source.indexOf('CREATE TABLE saas.catalog_onboarding_operations(');
  const operationsEnd = source.indexOf('CREATE INDEX catalog_onboarding_operations_store_idx');
  const timestampSource = readFileSync(path.join(SQL, '202607160018_product_catalog.up.sql'), 'utf8');
  sql(`CREATE ROLE celebix_saas_owner NOLOGIN BYPASSRLS; CREATE ROLE celebix_saas_app NOLOGIN; CREATE ROLE celebix_saas_workflow NOLOGIN; CREATE ROLE celebix_saas_host_resolver NOLOGIN;
    GRANT CREATE ON DATABASE postgres TO celebix_saas_owner; SET ROLE celebix_saas_owner;
    CREATE SCHEMA saas AUTHORIZATION celebix_saas_owner; GRANT USAGE ON SCHEMA saas TO celebix_saas_app;
    CREATE TABLE saas.stores(id uuid PRIMARY KEY,status text NOT NULL);
    CREATE TABLE saas.products(id uuid PRIMARY KEY,store_id uuid,status text,UNIQUE(store_id,id));
    CREATE TABLE saas.test_memberships(store_id uuid,principal_id uuid,role text);
    CREATE FUNCTION saas.catalog_authority_error(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz) RETURNS text LANGUAGE sql STABLE AS $$ SELECT CASE WHEN EXISTS(SELECT 1 FROM saas.test_memberships WHERE store_id=$1 AND principal_id=$2) THEN NULL::text ELSE 'durable_authority_invalid'::text END $$;
    CREATE FUNCTION saas.merchant_action_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text) RETURNS text LANGUAGE sql STABLE AS $$ SELECT CASE WHEN EXISTS(SELECT 1 FROM saas.test_memberships WHERE store_id=$1 AND principal_id=$2 AND (role='store_owner' OR ($9='catalog_admin.read' AND role='analyst'))) THEN NULL::text ELSE 'membership_denied'::text END $$;
    CREATE FUNCTION saas.media_authority_error(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz) RETURNS text LANGUAGE sql STABLE AS $$ SELECT saas.catalog_authority_error($1,$2,$3,$4,$5,$6,$7,$8) $$;
    ${source.slice(categoryStart, categoryEnd)}
    ${source.slice(operationsStart, operationsEnd)}
    ${extract(source, 'guard_catalog_onboarding_operation_mutation')}
    ${extract(source, 'catalog_onboarding_json_exact')}
    ${extract(source, 'catalog_onboarding_slug_base')}
    ${extract(timestampSource, 'catalog_timestamp')}
    ${extract(source, 'catalog_category_projection')}
    ${extract(source, 'catalog_list_categories')}
    ${extract(source, 'catalog_create_category')}
    ${extract(source, 'catalog_update_category')}
    CREATE TABLE saas.storefront_assets(id uuid PRIMARY KEY,store_id uuid NOT NULL,asset_kind text,status text,version bigint,public_url text,width integer,height integer,archived_at timestamptz,created_at timestamptz,updated_at timestamptz,UNIQUE(store_id,id));
    CREATE TABLE saas.storefront_asset_operations(operation_id uuid PRIMARY KEY,store_id uuid,operation_kind text,payload_fingerprint text,result_payload jsonb,committed_at timestamptz);
    CREATE FUNCTION saas.storefront_asset_projection(uuid,uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
    CREATE FUNCTION saas.storefront_asset_operation_replay(uuid,uuid,text,text) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql STABLE AS $$ SELECT 'operation_replayed'::text,operation.result_payload FROM saas.storefront_asset_operations operation WHERE operation.operation_id=$1 AND operation.store_id=$2 AND operation.operation_kind=$3 AND operation.payload_fingerprint=$4 $$;
    ${extract(assetSource, 'storefront_asset_archive', '$f$')}
    ALTER TABLE saas.catalog_categories ENABLE ROW LEVEL SECURITY; ALTER TABLE saas.catalog_categories FORCE ROW LEVEL SECURITY;
    REVOKE ALL ON saas.catalog_categories FROM PUBLIC,celebix_saas_app; GRANT EXECUTE ON FUNCTION saas.catalog_list_categories(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz) TO celebix_saas_app;
  `);
  sql(readFileSync(path.join(SQL, UP), 'utf8')); sql(readFileSync(path.join(SQL, ASSERTIONS), 'utf8'));
  await check('up/assertions, empty rollback and reapply', () => { sql(readFileSync(path.join(SQL, DOWN), 'utf8')); sql(readFileSync(path.join(SQL, UP), 'utf8')); sql(readFileSync(path.join(SQL, ASSERTIONS), 'utf8')); });
  sql(`SET ROLE celebix_saas_owner;
    INSERT INTO saas.stores VALUES('${STORE}','active'),('${FOREIGN}','active');
    INSERT INTO saas.test_memberships VALUES('${STORE}','${PRINCIPAL}','store_owner'),('${STORE}','${ANALYST}','analyst');
    INSERT INTO saas.catalog_categories(id,store_id,name,slug,position,status,version,created_at,updated_at) VALUES('${A}','${STORE}','Pantolon','pantolon',1,'active',1,'${NOW}','${NOW}'),('${B}','${STORE}','Bluz','bluz',2,'active',1,'${NOW}','${NOW}');
    INSERT INTO saas.catalog_categories(id,store_id,parent_id,name,slug,position,status,version,created_at,updated_at) VALUES('${C}','${STORE}','${A}','Jean','jean',1,'active',1,'${NOW}','${NOW}'),('${D}','${STORE}','${A}','Kargo','kargo',2,'active',1,'${NOW}','${NOW}');
    INSERT INTO saas.storefront_assets(id,store_id,asset_kind,status,version,public_url,width,height,created_at,updated_at) VALUES('${X}','${STORE}','category','active',1,'https://media.saas-staging.celebix.site/stores/${STORE}/storefront/category/${X}.webp',600,800,'${NOW}','${NOW}'),('${Y}','${STORE}','logo','active',1,'https://media.saas-staging.celebix.site/stores/${STORE}/storefront/logo/${Y}.png',100,100,'${NOW}','${NOW}'),('${Z}','${FOREIGN}','category','active',1,'https://media.saas-staging.celebix.site/stores/${FOREIGN}/storefront/category/${Z}.webp',600,800,'${NOW}','${NOW}');`);
  pool = new pg.Pool({ host: socket, port: 55471, database: 'postgres', user: 'postgres', max: 4 });
  const authority = [STORE, PRINCIPAL, PRINCIPAL, PRINCIPAL, 'growth', 1, 500, NOW];
  async function call(name, args, selected = authority) {
    const client = await pool.connect();
    try { await client.query('SET ROLE celebix_saas_app');
      const values = [...selected, ...args];
      return (await client.query(`SELECT * FROM saas.${name}(${values.map((_, i) => '$'+(i+1)).join(',')})`, values)).rows[0];
    } finally { await client.query('RESET ROLE'); client.release(); }
  }
  async function categories(selected = authority) { return (await call('catalog_list_categories', [], selected)).result_payload; }
  async function order(groups, operationId = op(), fp = fingerprint, selected = authority) { return call('catalog_reorder_categories', [operationId, fp, JSON.stringify({ groups })], selected); }
  function group(ids, all, parentId) { return { ...(parentId ? { parentId } : {}), orderedCategoryIds: ids, expectedVersions: ids.map(categoryId => ({ categoryId, version: all.find(row => row.id === categoryId).version })) }; }
  await check('old categories omit image', async () => { assert.equal(Object.hasOwn((await categories())[0], 'image'), false); });
  await check('associate active same-store category asset and analyst reads URL', async () => {
    assert.equal((await call('catalog_update_category', [op(), fingerprint, A, 1, JSON.stringify({ name: 'Pantolon', position: 1, image: { assetId: X, altText: 'Pantolon' } })])).outcome, 'updated');
    const read = await categories([STORE, ANALYST, PRINCIPAL, PRINCIPAL, 'growth', 1, 500, NOW]);
    assert.equal(read.find(row => row.id === A).image.publicUrl, `https://media.saas-staging.celebix.site/stores/${STORE}/storefront/category/${X}.webp`);
  });
  await check('image omission preserves and explicit null removes', async () => {
    assert.equal((await call('catalog_update_category', [op(), fingerprint, A, 2, JSON.stringify({ name: 'Pantolon', position: 1 })])).result_payload.category.image.assetId, X);
    assert.equal((await call('catalog_update_category', [op(), fingerprint, A, 3, JSON.stringify({ name: 'Pantolon', position: 1, image: null })])).outcome, 'updated');
    assert.equal(Object.hasOwn((await categories()).find(row => row.id === A), 'image'), false);
  });
  await check('foreign-store and logo assets rejected without category update', async () => {
    for (const assetId of [Y, Z]) assert.equal((await call('catalog_update_category', [op(), fingerprint, A, 4, JSON.stringify({ name: 'Pantolon', position: 1, image: { assetId, altText: '' } })])).outcome, 'invalid_input');
    assert.equal((await categories()).find(row => row.id === A).version, 4);
  });
  await check('referenced category asset cannot archive', async () => {
    assert.equal((await call('catalog_update_category', [op(), fingerprint, A, 4, JSON.stringify({ name: 'Pantolon', position: 1, image: { assetId: X, altText: '' } })])).outcome, 'updated');
    assert.equal((await call('storefront_asset_archive', [op(), fingerprint, X, 1])).outcome, 'version_conflict');
  });
  await check('all sibling groups reorder atomically and replay once', async () => {
    const all = await categories(), groups = [group([B, A], all), group([D, C], all, A)], id = op();
    const result = await order(groups, id);
    assert.equal(result.outcome, 'reordered');
    assert.equal(result.result_payload.categories.find(row => row.id === B).position, 1);
    assert.equal(result.result_payload.categories.find(row => row.id === D).position, 1);
    const replay = await order(groups, id);
    assert.equal(replay.outcome, 'operation_replayed'); assert.equal(replay.result_payload.replayed, true);
    assert.equal((await order(groups, id, 'b'.repeat(64))).outcome, 'operation_mismatch');
    assert.equal((await call('catalog_recover_category_order', [id, fingerprint])).outcome, 'operation_replayed');
  });
  await check('later-group stale version leaves earlier group untouched', async () => {
    const all = await categories(), groups = [group([A, B], all), group([C, D], all, A)];
    groups[1].expectedVersions[0].version--;
    assert.equal((await order(groups)).outcome, 'version_conflict'); assert.deepEqual(await categories(), all);
  });
  await check('partial sibling membership rejected without writes', async () => {
    const all = await categories(); assert.equal((await order([group([A], all)])).outcome, 'order_membership_changed'); assert.deepEqual(await categories(), all);
  });
  await check('cross-parent moves, duplicate IDs and analyst mutation rejected', async () => {
    const all = await categories();
    assert.equal((await order([group([A, C], all)])).outcome, 'order_membership_changed');
    assert.equal((await order([group([A, A], all)])).outcome, 'invalid_input');
    assert.equal((await order([group([A, B], all)], op(), fingerprint, [STORE, ANALYST, PRINCIPAL, PRINCIPAL, 'growth', 1, 500, NOW])).outcome, 'membership_denied');
    assert.deepEqual(await categories(), all);
  });
  await check('simultaneous sibling saves produce one winner and one version conflict', async () => {
    const all = await categories(), results = await Promise.all([order([group([A, B], all)]), order([group([B, A], all)])]);
    assert.deepEqual(results.map(row => row.outcome).sort(), ['reordered', 'version_conflict']);
  });
  await check('simultaneous same-operation creates and updates replay one result', async () => {
    const newId = '74000000-0000-4000-8000-000000000005', createOp = op();
    const payload = JSON.stringify({ name: 'Yeni kategori', position: 3, image: { assetId: X, altText: 'Yeni' } });
    const results = await Promise.all([call('catalog_create_category', [createOp, fingerprint, newId, payload]), call('catalog_create_category', [createOp, fingerprint, newId, payload])]);
    assert.deepEqual(results.map(row => row.outcome).sort(), ['created', 'operation_replayed']);
    assert.equal((await categories()).filter(row => row.id === newId).length, 1);
    const updateOp = op(), edit = JSON.stringify({ name: 'Yeni kategori', position: 3 });
    const updates = await Promise.all([call('catalog_update_category', [updateOp, fingerprint, newId, 1, edit]), call('catalog_update_category', [updateOp, fingerprint, newId, 1, edit])]);
    assert.deepEqual(updates.map(row => row.outcome).sort(), ['operation_replayed', 'updated']);
    assert.equal((await categories()).find(row => row.id === newId).version, 2);
  });
  await check('archived assets cannot be attached and foreign tenant cannot recover order', async () => {
    const archived = '75000000-0000-4000-8000-000000000004';
    await pool.query(`SET ROLE celebix_saas_owner; INSERT INTO saas.storefront_assets(id,store_id,asset_kind,status,version,public_url,width,height,created_at,updated_at) VALUES('${archived}','${STORE}','category','archived',2,'https://media.saas-staging.celebix.site/stores/${STORE}/storefront/category/${archived}.webp',600,800,'${NOW}','${NOW}'); RESET ROLE;`);
    const all = await categories(), item = all.find(row => row.id === B);
    assert.equal((await call('catalog_update_category', [op(), fingerprint, B, item.version, JSON.stringify({ name: item.name, position: item.position, image: { assetId: archived, altText: '' } })])).outcome, 'invalid_input');
    assert.equal((await call('catalog_recover_category_order', [op(), fingerprint], [FOREIGN, PRINCIPAL, PRINCIPAL, PRINCIPAL, 'growth', 1, 500, NOW])).outcome, 'durable_authority_invalid');
  });
  await check('populated rollback refuses data loss', () => { assert.throws(() => sql(readFileSync(path.join(SQL, DOWN), 'utf8')), /CATEGORY_IMAGE_AND_ORDER_DATA_MUST_BE_PRESERVED/); });
  process.stdout.write(`Category images/order: ${passed} PostgreSQL scenarios passed; disposable database only.\n`);
} finally {
  if (pool) await pool.end();
  if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', 'stop']);
  rmSync(temp, { recursive: true, force: true });
}
