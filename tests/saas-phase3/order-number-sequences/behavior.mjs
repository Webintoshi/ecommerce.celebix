import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { Pool } from 'pg';

const envFile = process.env.ORDER_NUMBER_QA_ENV_FILE;
if (!envFile) throw new Error('ORDER_NUMBER_QA_ENV_FILE required');
const raw = readFileSync(envFile, 'utf8').split('\n').find(line => line.startsWith('SAAS_TEST_DATABASE_URL='))?.split('=').slice(1).join('=').trim();
const connectionString = raw?.replace(/^(['"])(.*)\1$/, '$2');
if (!connectionString || new URL(connectionString).pathname !== '/celebix_order_number_qa_20260926') throw new Error('exact disposable order-number clone required');
const DATABASE = 'celebix_order_number_qa_20260926';
const baselineFile = process.env.ORDER_NUMBER_QA_BASELINE_FILE ?? '/tmp/order-number-qa-before161.json';
const pool = new Pool({ connectionString, max: 4, connectionTimeoutMillis: 3000 });
const client = await pool.connect();
const namespace = `a160a${randomBytes(2).toString('hex').slice(0, 3)}`;
const id = number => `${namespace}-0000-4000-8000-${String(number).padStart(12, '0')}`;
const NOW = '2026-09-28T10:00:00.000Z';
const STORE = id(1), PRINCIPAL = id(2), MEMBER = id(3), PLAN = id(4), OTHER = id(5), OTHER_MEMBER = id(6), PRODUCT = id(8), VARIANT = id(9);
const CODE = `number160_${namespace}`;
const authority = (store = STORE, member = MEMBER) => [store, PRINCIPAL, member, PLAN, CODE, 1, NOW];
const fingerprint = 'a'.repeat(64);
let nextId = 100;
const op = () => id(nextId++);
let location;
let scenarios = 0;
const pass = (caseId, label) => console.log(`PASS ${++scenarios} ${caseId} ${label}`);
async function role(name, connection = client) { await connection.query(`SET LOCAL ROLE ${name}`); }
async function rpc(name, values, dbRole = 'celebix_saas_app', connection = client) {
  await role(dbRole, connection);
  const result = await connection.query(`SELECT outcome,result_payload FROM saas.${name}(${values.map((_, index) => `$${index + 1}`).join(',')})`, values);
  assert.equal(result.rows.length, 1); return result.rows[0];
}
async function seed() {
  await role('celebix_saas_owner');
  await client.query(`INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)
    VALUES($1,'Numbers QA',$3,'active','tr','TRY','hemenaku',$5,$5),($2,'Numbers other',$4,'active','tr','TRY','hemenaku',$5,$5)`, [STORE, OTHER, `number-${namespace}`, `number-other-${namespace}`, NOW]);
  await client.query(`INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)
    VALUES($1,'https://qa.celebix.invalid',$2,'number160@qa.celebix.invalid',true,$3,$3)`, [PRINCIPAL, namespace, NOW]);
  await client.query(`INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)
    VALUES($1,$3,$4,'store_owner','active',$6,$6),($2,$3,$5,'store_owner','active',$6,$6)`, [MEMBER, OTHER_MEMBER, PRINCIPAL, STORE, OTHER, NOW]);
  await client.query(`INSERT INTO saas.plans(id,plan_code,version,status,valid_from,created_at,updated_at)
    VALUES($1,$2,1,'active',$3::timestamptz-interval '1 day',$3,$3)`, [PLAN, CODE, NOW]);
  await client.query('ALTER TABLE saas.plan_features DISABLE TRIGGER plan_features_immutable');
  await client.query(`INSERT INTO saas.plan_features(plan_id,feature_key,feature_ordinal,enabled)
    VALUES($1,'catalog',1,true),($1,'orders',2,true),($1,'checkout',3,true)`, [PLAN]);
  await client.query('ALTER TABLE saas.plan_features ENABLE TRIGGER plan_features_immutable');
  await client.query('ALTER TABLE saas.plan_limits DISABLE TRIGGER plan_limits_immutable');
  await client.query(`INSERT INTO saas.plan_limits(plan_id,limit_key,limit_ordinal,limit_value) VALUES($1,'products',1,100)`, [PLAN]);
  await client.query('ALTER TABLE saas.plan_limits ENABLE TRIGGER plan_limits_immutable');
  await client.query(`INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)
    VALUES($1,$3,$5,$6,1,'active',$7::timestamptz-interval '1 day',$7,$7),($2,$4,$5,$6,1,'active',$7::timestamptz-interval '1 day',$7,$7)`, [id(10), id(11), STORE, OTHER, PLAN, CODE, NOW]);
  await client.query(`INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at)
    VALUES($1,$2,'number-qa-product','Number QA product','active','TRY',$3,$3)`, [PRODUCT, STORE, NOW]);
  await client.query("SELECT set_config('saas.inventory.source_marker','catalog_adjustment',true),set_config('saas.inventory.source_id',$1,true),set_config('saas.inventory.source_time',$2,true)", [op(), NOW]);
  await client.query(`INSERT INTO saas.product_variants(id,store_id,product_id,title,price_cents,stock_tracking,stock_quantity,status,created_at,updated_at)
    VALUES($1,$2,$3,'Number QA variant',10000,true,20,'active',$4,$4)`, [VARIANT, STORE, PRODUCT, NOW]);
  const locations = await client.query('SELECT id FROM saas.inventory_locations WHERE store_id=$1 AND is_default', [STORE]);
  location = locations.rows[0].id;
}
async function posSale({ complete = true } = {}) {
  const saleId = op(), createOperation = op();
  const intent = { locationId: location, items: [{ variantId: VARIANT, quantity: 1 }], discount: null, customerName: null, note: null };
  const created = await rpc('in_store_sales_create', [...authority(), createOperation, fingerprint, saleId, JSON.stringify(intent)]);
  assert.equal(created.outcome, 'committed');
  if (!complete) return { saleId, created };
  const prepared = await rpc('in_store_sales_prepare', [...authority(), op(), fingerprint, saleId, 1, 10000]);
  assert.equal(prepared.outcome, 'committed');
  const paid = await rpc('in_store_sales_confirm_payment', [...authority(), op(), fingerprint, saleId, 2, null]);
  assert.equal(paid.outcome, 'committed');
  const completeOperation = op();
  const completed = await rpc('in_store_sales_complete', [...authority(), completeOperation, fingerprint, saleId, 3]);
  assert.equal(completed.outcome, 'committed'); assert.equal(completed.result_payload.sale.status, 'completed');
  return { saleId, completeOperation, completed };
}
async function oldNumbersDigest() {
  await role('celebix_saas_owner');
  const result = await client.query(`SELECT count(*)::integer AS count,md5(coalesce(string_agg(store_id::text||'|'||id::text||'|'||order_number,E'\n' ORDER BY store_id,id),'')) AS digest FROM saas.orders`);
  return result.rows[0];
}
async function counter(store, series, connection = client) {
  await role('celebix_saas_owner', connection);
  const rows = await connection.query('SELECT last_value::text AS value FROM saas.order_number_counters WHERE store_id=$1 AND series=$2', [store, series]);
  return rows.rows[0]?.value ?? null;
}
async function allocationCount(store, connection = client) {
  await role('celebix_saas_owner', connection);
  const rows = await connection.query('SELECT count(*)::integer AS count FROM saas.order_number_allocations WHERE store_id=$1', [store]);
  return rows.rows[0].count;
}
async function allocate(store, order, series, connection = client) {
  await role('celebix_saas_owner', connection);
  const rows = await connection.query('SELECT saas.order_number_allocate($1,$2,$3,$4) AS number', [store, order, series, NOW]);
  return rows.rows[0].number;
}
async function rejected(source, values, predicate) {
  await client.query('SAVEPOINT rejected_number_call');
  try { await assert.rejects(() => client.query(source, values), predicate); }
  finally { await client.query('ROLLBACK TO SAVEPOINT rejected_number_call'); await client.query('RELEASE SAVEPOINT rejected_number_call'); }
}
async function manualDraft() {
  const draftId = op(), createOperation = op();
  const address = { recipientName: 'Number QA', line1: 'Fixture 1', city: 'Istanbul', country: 'TR' };
  const intent = { customerName: 'Number QA', customerEmail: 'number160@qa.celebix.invalid', currency: 'TRY', shippingCents: 0, discountCents: 0, shippingAddress: address, billingAddress: address, adjustInventory: false, lines: [{ lineId: op(), productId: PRODUCT, variantId: VARIANT, quantity: 1, discountCents: 0 }] };
  const created = await rpc('order_drafts_create', [...authority(), createOperation, fingerprint, draftId, JSON.stringify(intent)]);
  assert.equal(created.outcome, 'created'); return { draftId, created };
}
async function rawOrder(orderId, source, number = 'LEGACY-CALLER-NUMBER', currency = 'TRY', store = STORE) {
  await role('celebix_saas_owner');
  return client.query(`INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,created_at,updated_at)
    VALUES($1,$2,$3,$4,'Number QA','number160@qa.celebix.invalid',$5,10000,0,0,10000,'pending','pending',$6,$7,$7) RETURNING order_number`, [orderId, store, number, source, currency, JSON.stringify({ recipientName: 'Number QA', line1: 'Fixture 1', city: 'Istanbul', country: 'TR' }), NOW]);
}
async function proveBlocked(observer, waiter, holder) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const rows = await observer.query('SELECT wait_event_type,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=$1', [waiter]);
    if (rows.rows[0]?.wait_event_type === 'Lock' && rows.rows[0]?.blockers.includes(holder)) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('competing number allocation did not wait for the winning transaction');
}
async function numberRaces() {
  // Only this section commits synthetic fixtures, because independent sessions
  // must see them. The exact disposable DB guard applies before any connection;
  // the release coordinator drops this QA database after rehearsal.
  await client.query('BEGIN');
  try { await seed(); await client.query('COMMIT'); }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  const first = await pool.connect(), second = await pool.connect();
  const holder = (await first.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  const waiter = (await second.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  try {
    for (const [sameOrder, expectedFirst, expectedSecond, expectedCounter] of [
      [false, 'WEB-000001', 'WEB-000002', '2'],
      [true, 'WEB-000003', 'WEB-000003', '3'],
    ]) {
      await first.query('BEGIN'); await second.query('BEGIN');
      await first.query("SET LOCAL statement_timeout='12s'"); await second.query("SET LOCAL statement_timeout='12s'");
      let pending;
      try {
        const firstOrder = op(), secondOrder = sameOrder ? firstOrder : op();
        assert.equal(await allocate(STORE, firstOrder, 'WEB', first), expectedFirst);
        pending = allocate(STORE, secondOrder, 'WEB', second);
        await proveBlocked(client, waiter, holder);
        await first.query('COMMIT');
        assert.equal(await pending, expectedSecond);
        await second.query('COMMIT');
        await client.query('BEGIN');
        assert.equal(await counter(STORE, 'WEB'), expectedCounter);
        assert.equal(await allocationCount(STORE), Number(expectedCounter));
        await client.query('ROLLBACK');
      } finally {
        await first.query('ROLLBACK'); await second.query('ROLLBACK');
        if (pending) await Promise.allSettled([pending]);
      }
    }
    pass('N161-10', 'two real connections serialize distinct numbers and replay the same racing order without increment');
    console.log(`RACE_FIXTURE_STORE ${STORE}`);
  } finally { first.release(); second.release(); }
}
async function migrationSnapshot() {
  await client.query('BEGIN');
  try {
    await role('celebix_saas_owner');
    const result = await client.query(`SELECT
      (SELECT md5(string_agg(pg_get_functiondef(p.oid)||'|'||p.proowner::text||'|'||coalesce(p.proacl::text,''),E'\n' ORDER BY p.oid))
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND p.prokind='f') AS functions,
      (SELECT md5(coalesce(string_agg(row_to_json(c)::text,E'\n' ORDER BY c.store_id,c.series),'')) FROM saas.order_number_counters c) AS counters,
      (SELECT md5(coalesce(string_agg(row_to_json(a)::text,E'\n' ORDER BY a.order_id),'')) FROM saas.order_number_allocations a) AS allocations,
      (SELECT md5(coalesce(string_agg(row_to_json(r)::text,E'\n' ORDER BY r.signature),'')) FROM saas.order_number_migration_restore r) AS restore`);
    return result.rows[0];
  } finally { await client.query('ROLLBACK'); }
}
async function refuseRollbackAfterAllocation() {
  const before = await migrationSnapshot();
  const down = readFileSync(new URL('../../../apps/owner/scripts/sql/saas/202609260161_order_number_series.down.sql', import.meta.url), 'utf8');
  try {
    // The exact migration file owns BEGIN. PostgreSQL stops its remaining
    // statements at the allocation guard; ROLLBACK clears that failed transaction.
    await assert.rejects(() => client.query(down), error => error.code === 'P0001' && error.message === 'ORDER_NUMBER_ROLLBACK_HAS_ALLOCATIONS');
  } finally { await client.query('ROLLBACK'); }
  assert.deepEqual(await migrationSnapshot(), before);
  pass('N161-11', 'the exact down migration refuses used allocations and leaves function and numbering-table hashes unchanged');
}
try {
  const actual = await client.query("SELECT current_database() AS database,current_setting('server_version') AS version");
  assert.equal(actual.rows[0].database, DATABASE); assert.match(actual.rows[0].version, /^16\./);
  await client.query('BEGIN'); await client.query("SET LOCAL statement_timeout='15s'"); await client.query("SET LOCAL lock_timeout='8s'");
  const before = await oldNumbersDigest();
  if (process.argv.includes('--red')) writeFileSync(baselineFile, JSON.stringify({ database: DATABASE, ...before }), { mode: 0o600 });
  else {
    const baseline = JSON.parse(readFileSync(baselineFile, 'utf8'));
    assert.equal(baseline.database, DATABASE);
    assert.deepEqual(before, { count: baseline.count, digest: baseline.digest });
  }
  await seed();
  const first = await posSale();
  // This meaningful RED completes the current real paid POS lifecycle. Before
  // SQL161 the persisted and returned number is the long UUID-based POS code.
  await role('celebix_saas_owner');
  const persisted = await client.query('SELECT order_number FROM saas.orders WHERE store_id=$1 AND id=$2', [STORE, first.completed.result_payload.sale.orderId]);
  assert.equal(first.completed.result_payload.sale.orderNumber, persisted.rows[0].order_number);
  assert.equal(first.completed.result_payload.sale.orderNumber, 'POS-0000001');
  assert.equal(persisted.rows[0].order_number, 'POS-0000001');
  pass('N161-01', 'actual completed POS receipt and persisted order use POS-0000001');
  if (process.argv.includes('--red')) throw new Error('SQL161 behavior already present; expected pre-migration real POS RED');
  pass('N161-02', 'pre-migration existing order-number digest is unchanged after SQL161');

  const beforeDrafts = await allocationCount(STORE);
  await posSale({ complete: false });
  const draft = await manualDraft();
  assert.equal(await allocationCount(STORE), beforeDrafts);
  assert.equal(await counter(STORE, 'POS'), '1'); assert.equal(await counter(STORE, 'WEB'), null);
  const conversionOperation = op();
  const converted = await rpc('order_drafts_convert', [...authority(), conversionOperation, fingerprint, draft.draftId, 1]);
  assert.equal(converted.outcome, 'converted'); assert.equal(converted.result_payload.orderNumber, 'POS-0000002');
  await role('celebix_saas_owner');
  const manual = await client.query('SELECT order_number,source FROM saas.orders WHERE id=$1', [converted.result_payload.orderId]);
  assert.deepEqual(manual.rows[0], { order_number: 'POS-0000002', source: 'manual' });
  pass('N161-03', 'POS and manual drafts allocate nothing; actual manual conversion shares the POS counter');

  const posReplay = await rpc('in_store_sales_complete', [...authority(), first.completeOperation, fingerprint, first.saleId, 3]);
  assert.equal(posReplay.outcome, 'operation_replayed'); assert.equal(posReplay.result_payload.sale.orderNumber, 'POS-0000001');
  const manualReplay = await rpc('order_drafts_convert', [...authority(), conversionOperation, fingerprint, draft.draftId, 1]);
  assert.equal(manualReplay.outcome, 'operation_replayed'); assert.deepEqual(manualReplay.result_payload, converted.result_payload);
  const manualRecovery = await rpc('order_drafts_recover_operation', [...authority(), conversionOperation, fingerprint]);
  assert.equal(manualRecovery.outcome, 'operation_replayed'); assert.equal(manualRecovery.result_payload.orderNumber, 'POS-0000002');
  assert.equal(await counter(STORE, 'POS'), '2'); assert.equal(await allocationCount(STORE), 2);
  pass('N161-04', 'completed POS and manual conversion retries recover the same persisted numbers without counter changes');

  const helperOrder = op();
  assert.equal(await allocate(STORE, helperOrder, 'WEB'), 'WEB-000001');
  assert.equal(await allocate(STORE, helperOrder, 'WEB'), 'WEB-000001');
  assert.equal(await allocate(STORE, op(), 'POS'), 'POS-0000003');
  assert.equal(await allocate(OTHER, op(), 'WEB'), 'WEB-000001');
  assert.equal(await allocate(OTHER, op(), 'POS'), 'POS-0000001');
  assert.equal(await counter(STORE, 'WEB'), '1'); assert.equal(await counter(STORE, 'POS'), '3');
  assert.equal(await counter(OTHER, 'WEB'), '1'); assert.equal(await counter(OTHER, 'POS'), '1');
  const otherAllocations = await allocationCount(OTHER);
  const imported = await rawOrder(op(), 'manual_import', 'WEB-000002', 'TRY', OTHER);
  assert.equal(imported.rows[0].order_number, 'WEB-000002');
  assert.equal(await allocationCount(OTHER), otherAllocations);
  assert.equal(await allocate(OTHER, op(), 'WEB'), 'WEB-000003');
  assert.equal(await counter(OTHER, 'POS'), '1');
  pass('N161-05', 'per-store WEB/POS counters are independent and safely skip retained canonical import numbers');

  const originalOrder = first.completed.result_payload.sale.orderId;
  const deletion = await rpc('delete_order', [...authority(), op(), fingerprint, originalOrder, 1, 'POS-0000001']);
  assert.equal(deletion.outcome, 'deleted');
  const afterDeletion = await posSale();
  assert.equal(afterDeletion.completed.result_payload.sale.orderNumber, 'POS-0000004');
  await role('celebix_saas_owner');
  const tombstone = await client.query('SELECT order_id,order_number FROM saas.in_store_sales WHERE id=$1', [first.saleId]);
  assert.deepEqual(tombstone.rows[0], { order_id: null, order_number: 'POS-0000001' });
  const ledger = await client.query('SELECT order_number FROM saas.order_number_allocations WHERE store_id=$1 AND order_id=$2', [STORE, originalOrder]);
  assert.equal(ledger.rows[0].order_number, 'POS-0000001');
  assert.equal(await allocate(STORE, originalOrder, 'POS'), 'POS-0000001');
  await client.query('SAVEPOINT deleted_order_recreate');
  try { await assert.rejects(() => rawOrder(originalOrder, 'manual', 'POS-0000001'), error => error.code === '23505' && error.message === 'ORDER_NUMBER_DELETED_ORDER'); }
  finally { await client.query('ROLLBACK TO SAVEPOINT deleted_order_recreate'); await client.query('RELEASE SAVEPOINT deleted_order_recreate'); }
  assert.equal(await counter(STORE, 'POS'), '4');
  pass('N161-06', 'permanent deletion preserves the allocation and tombstone and cannot reuse or recreate the deleted order');

  const beforeFailure = await allocationCount(STORE);
  await client.query('SAVEPOINT failed_order_insert');
  try {
    const failedOrder = op();
    const assigned = await allocate(STORE, failedOrder, 'WEB');
    assert.equal(assigned, 'WEB-000002');
    await assert.rejects(() => rawOrder(failedOrder, 'storefront', assigned, 'USD'), error => error.code === '23503');
  }
  finally { await client.query('ROLLBACK TO SAVEPOINT failed_order_insert'); await client.query('RELEASE SAVEPOINT failed_order_insert'); }
  assert.equal(await counter(STORE, 'WEB'), '1'); assert.equal(await allocationCount(STORE), beforeFailure);
  pass('N161-07', 'a failed real orders insert rolls back its preceding allocation and counter update');

  await role('celebix_saas_app');
  await rejected('SELECT saas.order_number_allocate($1,$2,$3,$4)', [STORE, op(), 'WEB', NOW], error => error.code === '42501');
  await rejected('SELECT count(*) FROM saas.order_number_counters', [], error => error.code === '42501');
  await rejected('SELECT count(*) FROM saas.order_number_allocations', [], error => error.code === '42501');
  await role('celebix_saas_owner');
  const privileges = await client.query(`SELECT
    EXISTS(SELECT 1 FROM pg_proc function
      CROSS JOIN LATERAL aclexplode(coalesce(function.proacl,acldefault('f',function.proowner))) permission
      WHERE function.oid='saas.order_number_allocate(uuid,uuid,text,timestamptz)'::regprocedure
        AND permission.grantee=0 AND permission.privilege_type='EXECUTE') AS public_execute,
    has_function_privilege('celebix_saas_host_resolver','saas.order_number_allocate(uuid,uuid,text,timestamptz)','EXECUTE') AS host_execute,
    has_function_privilege('celebix_saas_workflow','saas.order_number_allocate(uuid,uuid,text,timestamptz)','EXECUTE') AS workflow_execute`);
  assert.deepEqual(privileges.rows[0], { public_execute: false, host_execute: false, workflow_execute: false });
  await rejected('UPDATE saas.orders SET order_number=$1 WHERE id=$2', ['POS-CHANGED', converted.result_payload.orderId]);
  await rejected('UPDATE saas.order_number_allocations SET order_number=$1 WHERE store_id=$2 AND order_id=$3', ['WEB-CHANGED', STORE, helperOrder]);
  await rejected('DELETE FROM saas.order_number_allocations WHERE store_id=$1 AND order_id=$2', [STORE, helperOrder]);
  await rejected('UPDATE saas.order_number_migration_restore SET before_hash=before_hash', [], error => error.code === '23514' && error.message === 'ORDER_NUMBER_ALLOCATION_IMMUTABLE');
  pass('N161-08', 'private grants, allocated identities and rollback metadata remain protected');

  await client.query("UPDATE saas.order_number_counters SET last_value=999999 WHERE store_id=$1 AND series='WEB'", [OTHER]);
  await client.query("UPDATE saas.order_number_counters SET last_value=9999999 WHERE store_id=$1 AND series='POS'", [OTHER]);
  assert.equal(await allocate(OTHER, op(), 'WEB'), 'WEB-1000000');
  assert.equal(await allocate(OTHER, op(), 'POS'), 'POS-10000000');
  await client.query("UPDATE saas.order_number_counters SET last_value=9223372036854775807 WHERE store_id=$1 AND series='WEB'", [OTHER]);
  const exhaustedOrder = op();
  await rejected('SELECT saas.order_number_allocate($1,$2,$3,$4)', [OTHER, exhaustedOrder, 'WEB', NOW], error => error.message === 'ORDER_NUMBER_SERIES_EXHAUSTED');
  assert.equal(await counter(OTHER, 'WEB'), '9223372036854775807');
  const exhausted = await client.query('SELECT count(*)::integer AS count FROM saas.order_number_allocations WHERE store_id=$1 AND order_id=$2', [OTHER, exhaustedOrder]);
  assert.equal(exhausted.rows[0].count, 0);
  pass('N161-09', 'number widths grow beyond six or seven digits without truncation and bigint exhaustion fails explicitly');

  await client.query('ROLLBACK');
  if (!process.argv.includes('--no-race')) {
    await numberRaces();
    await refuseRollbackAfterAllocation();
  }
  console.log(`ORDER_NUMBER_SEQUENCES_POSTGRESQL16_COMPLETE ${scenarios}/${scenarios}`);
} finally {
  await client.query('ROLLBACK'); client.release(); await pool.end();
}
