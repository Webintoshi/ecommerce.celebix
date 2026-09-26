import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';

// Never accept a production URL or a generic DATABASE_URL fallback. All test
// fixtures stay in a single outer transaction and are rolled back on failure.
const envFile = process.env.IN_STORE_REHEARSAL_ENV_FILE;
if (!envFile) throw new Error('IN_STORE_REHEARSAL_ENV_FILE required');
const raw = readFileSync(envFile, 'utf8').split('\n')
  .find(line => line.startsWith('IN_STORE_REHEARSAL_DATABASE_URL='))
  ?.split('=').slice(1).join('=').trim();
const connectionString = raw?.replace(/^(['"])(.*)\1$/, '$2');
let databasePath;
try { databasePath = connectionString && new URL(connectionString).pathname; }
catch { throw new Error('named disposable stock-summary clone required'); }
if (databasePath !== '/celebix_product_stockfix_qa_20260926') {
  throw new Error('named disposable stock-summary clone required');
}
const pool = new Pool({ connectionString, max: 1 });
const client = await pool.connect();
const id = number => `a1590000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const NOW = '2026-09-28T10:00:00.000Z';
const STORE = id(1), PRINCIPAL = id(2), MEMBER = id(3), PLAN = id(4), OTHER = id(5);
const CODE = 'stock159_qa';
const authority = [STORE, PRINCIPAL, MEMBER, PLAN, CODE, 1, 100, NOW];
const posAuthority = [STORE, PRINCIPAL, MEMBER, PLAN, CODE, 1, NOW];
const P = { sold: id(10), zero: id(11), mixed: id(12), untracked: id(13), archivedVariant: id(14), noActive: id(15), archivedProduct: id(16), draft: id(17), foreign: id(18) };
const V = { l: id(30), m: id(31), s: id(32) };
let scenarios = 0;
const pass = (caseId, label) => console.log(`PASS ${++scenarios} ${caseId} ${label}`);
async function role(name) { await client.query(`SET LOCAL ROLE ${name}`); }
async function rpc(name, values) {
  await role('celebix_saas_app');
  const result = await client.query(`SELECT outcome,result_payload FROM saas.${name}(${values.map((_, index) => `$${index + 1}`).join(',')})`, values);
  assert.equal(result.rows.length, 1, name);
  return result.rows[0];
}
async function list(options = {}, version = 'v5', auth = authority) {
  const { search = null, status = null, stock = null, sort = 'title-asc', pageSize = 100, cursor = null } = options;
  return rpc(`catalog_list_products_${version}`, [...auth, search, status, stock, null, null, null, sort, pageSize, cursor?.timestamp ?? null, cursor?.title ?? null, cursor?.id ?? null]);
}
async function listed(options = {}, version = 'v5') {
  const result = await list(options, version);
  assert.equal(result.outcome, 'listed');
  return result.result_payload;
}
const itemIds = payload => payload.items.map(item => item.id);
const summary = (payload, product) => payload.variantSummaries[product].productStock;
async function expectSqlFailure(source, values, code) {
  await client.query('SAVEPOINT rejected_call');
  try { await assert.rejects(() => client.query(source, values), error => error.code === code); }
  finally { await client.query('ROLLBACK TO SAVEPOINT rejected_call'); await client.query('RELEASE SAVEPOINT rejected_call'); }
}
async function seed() {
  await role('celebix_saas_owner');
  await client.query(`INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)
    VALUES($1,'Stock159 QA','stock159-qa','active','tr','TRY','hemenaku',$3,$3),
      ($2,'Stock159 foreign','stock159-foreign','active','tr','TRY','hemenaku',$3,$3)`, [STORE, OTHER, NOW]);
  await client.query(`INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)
    VALUES($1,'https://qa.celebix.invalid','stock159','stock159@qa.celebix.invalid',true,$2,$2)`, [PRINCIPAL, NOW]);
  await client.query(`INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)
    VALUES($1,$2,$3,'store_owner','active',$4,$4)`, [MEMBER, PRINCIPAL, STORE, NOW]);
  await client.query(`INSERT INTO saas.plans(id,plan_code,version,status,valid_from,created_at,updated_at)
    VALUES($1,$2,1,'active',$3::timestamptz-interval '1 day',$3,$3)`, [PLAN, CODE, NOW]);
  // Only these synthetic plan inserts bypass the plan seal, within this
  // rollback-only transaction. The production seal is re-enabled immediately.
  await client.query('ALTER TABLE saas.plan_features DISABLE TRIGGER plan_features_immutable');
  await client.query(`INSERT INTO saas.plan_features(plan_id,feature_key,feature_ordinal,enabled)
    VALUES($1,'catalog',1,true),($1,'orders',2,true)`, [PLAN]);
  await client.query('ALTER TABLE saas.plan_features ENABLE TRIGGER plan_features_immutable');
  await client.query('ALTER TABLE saas.plan_limits DISABLE TRIGGER plan_limits_immutable');
  await client.query(`INSERT INTO saas.plan_limits(plan_id,limit_key,limit_ordinal,limit_value)
    VALUES($1,'products',1,100)`, [PLAN]);
  await client.query('ALTER TABLE saas.plan_limits ENABLE TRIGGER plan_limits_immutable');
  await client.query(`INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)
    VALUES($1,$2,$3,$4,1,'active',$5::timestamptz-interval '1 day',$5,$5)`, [id(6), STORE, PLAN, CODE, NOW]);
  const products = [
    [P.sold, 'Alpha sold L', 'active', STORE],
    [P.zero, 'Bravo all zero', 'active', STORE],
    [P.mixed, 'Charlie mixed', 'active', STORE],
    [P.untracked, 'Delta untracked', 'active', STORE],
    [P.archivedVariant, 'Echo archived exclusion', 'active', STORE],
    [P.noActive, 'Foxtrot no active', 'active', STORE],
    [P.archivedProduct, 'Golf archived product', 'archived', STORE],
    [P.draft, 'Hotel draft zero', 'draft', STORE],
    [P.foreign, 'Foreign untracked', 'active', OTHER],
  ];
  for (const [index, [product, title, status, store]] of products.entries()) {
    const created = new Date(Date.parse(NOW) - 60_000 + index * 1000).toISOString();
    await client.query(`INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at,archived_at)
      VALUES($1,$2,$3,$4,$5,'TRY',$6,$6,CASE WHEN $5='archived' THEN $6::timestamptz ELSE NULL END)`, [product, store, `stock159-product-${index}`, title, status, created]);
  }
  const variants = [
    [V.l, P.sold, 'L', true, 1, 'active', STORE],
    [V.m, P.sold, 'M', true, 1, 'active', STORE],
    [V.s, P.sold, 'S', true, 1, 'active', STORE],
    [id(33), P.zero, 'Zero first', true, 0, 'active', STORE],
    [id(34), P.zero, 'Zero second', true, 0, 'active', STORE],
    [id(35), P.zero, 'Archived untracked', false, 500, 'archived', STORE],
    [id(36), P.mixed, 'Tracked zero', true, 0, 'active', STORE],
    [id(37), P.mixed, 'Untracked later', false, 900, 'active', STORE],
    [id(38), P.untracked, 'Untracked', false, 800, 'active', STORE],
    [id(39), P.archivedVariant, 'Active quantity', true, 2, 'active', STORE],
    [id(40), P.archivedVariant, 'Archived quantity', true, 50, 'archived', STORE],
    [id(41), P.noActive, 'Only archived', true, 8, 'archived', STORE],
    [id(42), P.archivedProduct, 'Archived product zero', true, 0, 'active', STORE],
    [id(43), P.draft, 'Draft zero', true, 0, 'active', STORE],
    [id(44), P.foreign, 'Foreign untracked', false, 700, 'active', OTHER],
  ];
  await client.query("SELECT set_config('saas.inventory.source_marker','catalog_adjustment',true),set_config('saas.inventory.source_id',$1,true),set_config('saas.inventory.source_time',$2,true)", [id(7), NOW]);
  for (const [index, [variant, product, title, tracked, quantity, status, store]] of variants.entries()) {
    const created = new Date(Date.parse(NOW) - 30_000 + index * 1000).toISOString();
    await client.query(`INSERT INTO saas.product_variants(id,store_id,product_id,title,sku,barcode,price_cents,stock_tracking,stock_quantity,status,created_at,updated_at,archived_at)
      VALUES($1,$2,$3,$4,$5,$6,10000,$7,$8,$9,$10,$10,CASE WHEN $9='archived' THEN $10::timestamptz ELSE NULL END)`, [variant, store, product, title, `STOCK159-${index}`, `990000000${String(index).padStart(4, '0')}`, tracked, quantity, status, created]);
  }
}
async function completeLSale() {
  await role('celebix_saas_owner');
  const locations = await client.query('SELECT id FROM saas.inventory_locations WHERE store_id=$1 AND is_default', [STORE]);
  const saleId = id(60), fingerprint = 'a'.repeat(64);
  const intent = { locationId: locations.rows[0].id, items: [{ variantId: V.l, quantity: 1 }], discount: null, customerName: null, note: null };
  const created = await rpc('in_store_sales_create', [...posAuthority, id(61), fingerprint, saleId, JSON.stringify(intent)]);
  assert.equal(created.outcome, 'committed');
  const prepared = await rpc('in_store_sales_prepare', [...posAuthority, id(62), fingerprint, saleId, 1, 10000]);
  assert.equal(prepared.outcome, 'committed');
  const paid = await rpc('in_store_sales_confirm_payment', [...posAuthority, id(63), fingerprint, saleId, 2, null]);
  assert.equal(paid.outcome, 'committed');
  const completed = await rpc('in_store_sales_complete', [...posAuthority, id(64), fingerprint, saleId, 3]);
  assert.equal(completed.outcome, 'committed');
  assert.equal(completed.result_payload.sale.status, 'completed');
}
try {
  const actual = await client.query("SELECT current_database() AS database,current_setting('server_version') AS version");
  assert.equal(actual.rows[0].database, 'celebix_product_stockfix_qa_20260926');
  assert.match(actual.rows[0].version, /^16\./, 'PostgreSQL16 rehearsal required');
  await client.query('BEGIN');
  await client.query("SET LOCAL statement_timeout='15s'");
  await client.query("SET LOCAL lock_timeout='5s'");
  await client.query('SET LOCAL ROLE celebix_saas_app');
  // Real public RPC invocation: before159 this fails with PostgreSQL42883,
  // proving that the stock-summary behavior has not shipped yet.
  await list();
  await seed();
  const before = await listed();
  assert.deepEqual(summary(before, P.sold), { trackedVariantCount: 3, untrackedVariantCount: 0, trackedQuantity: 3 });
  await completeLSale();
  const all = await listed();
  assert.deepEqual(itemIds(all), [P.sold, P.zero, P.mixed, P.untracked, P.archivedVariant, P.noActive, P.draft]);
  assert.deepEqual(summary(all, P.sold), { trackedVariantCount: 3, untrackedVariantCount: 0, trackedQuantity: 2 });
  assert.equal(all.variantSummaries[P.sold].variantId, V.l);
  assert.equal(all.variantSummaries[P.sold].stockQuantity, 0);
  pass('S159-01', 'actual completed L sale reduces product total3 to2 while representative L stays0');

  const cases = [
    [P.zero, { trackedVariantCount: 2, untrackedVariantCount: 0, trackedQuantity: 0 }],
    [P.mixed, { trackedVariantCount: 1, untrackedVariantCount: 1, trackedQuantity: 0 }],
    [P.untracked, { trackedVariantCount: 0, untrackedVariantCount: 1, trackedQuantity: 0 }],
    [P.archivedVariant, { trackedVariantCount: 1, untrackedVariantCount: 0, trackedQuantity: 2 }],
    [P.noActive, { trackedVariantCount: 0, untrackedVariantCount: 0, trackedQuantity: 0 }],
    [P.draft, { trackedVariantCount: 1, untrackedVariantCount: 0, trackedQuantity: 0 }],
  ];
  for (const [product, expected] of cases) assert.deepEqual(summary(all, product), expected);
  pass('S159-02', 'only active variants contribute; untracked quantities never inflate tracked totals');

  const oldList = await listed({}, 'v4');
  const withoutAddition = structuredClone(all);
  for (const value of Object.values(withoutAddition.variantSummaries)) delete value.productStock;
  assert.deepEqual(withoutAddition, oldList);
  assert.equal(oldList.variantSummaries[P.sold].stockQuantity, 0);
  assert.ok(!Object.hasOwn(oldList.variantSummaries[P.sold], 'productStock'));
  pass('S159-03', 'V5 is additive and legacy V4 representative price stock and payload stay intact');

  const stockCases = [
    ['in-stock', [P.sold, P.mixed, P.untracked, P.archivedVariant]],
    ['out-of-stock', [P.zero, P.draft]],
    ['untracked', [P.mixed, P.untracked]],
  ];
  for (const [stock, expected] of stockCases) assert.deepEqual(itemIds(await listed({ stock })), expected);
  assert.deepEqual(itemIds(await listed({ stock: 'in-stock', search: '9900000000001' })), [P.sold]);
  assert.deepEqual(itemIds(await listed({ stock: 'out-of-stock', status: 'active' })), [P.zero]);
  assert.deepEqual(itemIds(await listed({ stock: 'out-of-stock', status: 'archived' })), [P.archivedProduct]);
  pass('S159-04', 'stock filters use product totals and keep search status and zero-active semantics');

  const sortCases = [
    ['title-asc', [P.sold, P.mixed, P.untracked, P.archivedVariant]],
    ['title-desc', [P.archivedVariant, P.untracked, P.mixed, P.sold]],
    ['created-asc', [P.sold, P.mixed, P.untracked, P.archivedVariant]],
    ['created-desc', [P.archivedVariant, P.untracked, P.mixed, P.sold]],
    ['updated-desc', [P.archivedVariant, P.untracked, P.mixed, P.sold]],
  ];
  for (const [sort, expected] of sortCases) {
    const first = await listed({ stock: 'in-stock', sort, pageSize: 2 });
    assert.deepEqual(itemIds(first), expected.slice(0, 2));
    assert.equal(first.hasMore, true); assert.ok(first.cursorAnchor);
    const second = await listed({ stock: 'in-stock', sort, pageSize: 2, cursor: first.cursorAnchor });
    assert.deepEqual(itemIds(second), expected.slice(2));
    assert.equal(second.hasMore, false); assert.equal(second.cursorAnchor, null);
  }
  const firstZero = await listed({ stock: 'out-of-stock', pageSize: 1 });
  assert.deepEqual(itemIds(firstZero), [P.zero]);
  assert.deepEqual(itemIds(await listed({ stock: 'out-of-stock', pageSize: 1, cursor: firstZero.cursorAnchor })), [P.draft]);
  pass('S159-05', 'all five sorts apply aggregate filters before keyset pagination without gaps');

  const oldDashboard = await rpc('catalog_get_dashboard_summary', authority);
  const dashboard = await rpc('catalog_get_dashboard_summary_v2', authority);
  assert.equal(dashboard.outcome, 'summarized');
  assert.deepEqual(dashboard.result_payload, {
    totalProducts: 7, activeProducts: 6, draftProducts: 1, productLimit: 100,
    activeVariants: 10, outOfStockVariants: 5, productsWithoutMedia: 7, activeMedia: 0,
    outOfStockProducts: 2,
  });
  const { outOfStockProducts, ...legacyDashboard } = dashboard.result_payload;
  assert.equal(outOfStockProducts, 2); assert.deepEqual(legacyDashboard, oldDashboard.result_payload);
  pass('S159-06', 'dashboard counts fully sold-out products while preserving all legacy variant counts');

  const foreign = [...authority]; foreign[0] = OTHER;
  assert.equal((await list({}, 'v5', foreign)).outcome, 'membership_denied');
  assert.equal((await rpc('catalog_get_dashboard_summary_v2', foreign)).outcome, 'membership_denied');
  const invalidMember = [...authority]; invalidMember[2] = id(99);
  assert.equal((await list({}, 'v5', invalidMember)).outcome, 'membership_denied');
  assert.equal((await list({ stock: 'wrong' })).outcome, 'invalid_input');
  await role('celebix_saas_owner');
  await client.query("UPDATE saas.memberships SET status='revoked' WHERE id=$1", [MEMBER]);
  assert.equal((await list()).outcome, 'membership_denied');
  assert.equal((await rpc('catalog_get_dashboard_summary_v2', authority)).outcome, 'membership_denied');
  await role('celebix_saas_owner');
  await client.query("UPDATE saas.memberships SET status='active' WHERE id=$1", [MEMBER]);
  await client.query("UPDATE saas.stores SET status='suspended' WHERE id=$1", [STORE]);
  assert.equal((await list()).outcome, 'store_inactive');
  assert.equal((await rpc('catalog_get_dashboard_summary_v2', authority)).outcome, 'store_inactive');
  await role('celebix_saas_owner');
  await client.query("UPDATE saas.stores SET status='active' WHERE id=$1", [STORE]);
  await client.query("UPDATE saas.subscriptions SET status='inactive' WHERE store_id=$1", [STORE]);
  assert.equal((await list()).outcome, 'durable_authority_invalid');
  assert.equal((await rpc('catalog_get_dashboard_summary_v2', authority)).outcome, 'durable_authority_invalid');
  await role('celebix_saas_owner');
  await client.query("UPDATE saas.subscriptions SET status='active' WHERE store_id=$1", [STORE]);
  pass('S159-07', 'tenant membership revocation store and current subscription authority remain enforced');

  await role('celebix_saas_app');
  await expectSqlFailure('SELECT saas.catalog_checked_product_stock_summary($1,$2,$3)', [1, 0, 2], '42501');
  await expectSqlFailure(`SELECT * FROM saas.catalog_list_products_unpriced_v5(${authority.concat([null, null, null, null, null, null, 'title-asc', 100, null, null, null]).map((_, index) => `$${index + 1}`).join(',')})`, [...authority, null, null, null, null, null, null, 'title-asc', 100, null, null, null], '42501');
  await role('celebix_saas_owner');
  const exact = await client.query('SELECT saas.catalog_checked_product_stock_summary($1,$2,$3) AS summary', [1, 0, '9007199254740991']);
  assert.deepEqual(exact.rows[0].summary, { trackedVariantCount: 1, untrackedVariantCount: 0, trackedQuantity: Number.MAX_SAFE_INTEGER });
  await expectSqlFailure('SELECT saas.catalog_checked_product_stock_summary($1,$2,$3)', [1, 0, '9007199254740992'], '22003');
  await expectSqlFailure('SELECT saas.catalog_checked_product_stock_summary($1,$2,$3)', [1, 0, '-1'], '22003');
  const acl = await client.query(`SELECT
    pg_catalog.has_function_privilege('celebix_saas_app','saas.catalog_checked_product_stock_summary(bigint,bigint,numeric)','EXECUTE') AS app_guard,
    pg_catalog.has_function_privilege('celebix_saas_app','saas.catalog_list_products_unpriced_v5(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,text,text,text,uuid,uuid,uuid,text,integer,timestamptz,text,uuid)','EXECUTE') AS app_unpriced`);
  assert.deepEqual(acl.rows[0], { app_guard: false, app_unpriced: false });
  pass('S159-08', 'private checked arithmetic permits exact safe bound and rejects overflow or negative stock');

  console.log(`CATALOG_PRODUCT_STOCK_SUMMARY_POSTGRESQL16_COMPLETE ${scenarios}/${scenarios}`);
} finally {
  await client.query('ROLLBACK');
  client.release();
  await pool.end();
}
