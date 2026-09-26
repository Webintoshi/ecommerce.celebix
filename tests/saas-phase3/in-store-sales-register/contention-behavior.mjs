import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';

// This test commits synthetic fixtures for separate database connections. The entire
// database must be disposable; its name cannot be changed to a merchant runtime DB.
const envFile = process.env.IN_STORE_CONTENTION_ENV_FILE;
if (!envFile) throw new Error('IN_STORE_CONTENTION_ENV_FILE required');
const raw = readFileSync(envFile, 'utf8').split('\n').find(line => line.startsWith('IN_STORE_REHEARSAL_DATABASE_URL='))?.split('=').slice(1).join('=').trim();
const connectionString = raw?.replace(/^(['"])(.*)\1$/, '$2');
let databasePath;
try { databasePath = connectionString && new URL(connectionString).pathname; }
catch { throw new Error('dedicated disposable contention database required'); }
if (databasePath !== '/celebix_in_store_race_20260926') throw new Error('dedicated disposable contention database required');
const pool = new Pool({ connectionString, max: 4 });
const observer = await pool.connect(), first = await pool.connect(), second = await pool.connect();
const namespace = `a159${randomBytes(2).toString('hex')}`;
const id = number => `${namespace}-0000-4000-8000-${String(number).padStart(12, '0')}`;
const NOW = '2026-09-28T10:00:00.000Z';
const STORE = id(1), PRINCIPAL = id(2), MEMBER = id(3), PLAN = id(4), PRODUCT = id(7), PROVIDER = id(8);
const HOST = `pos-contention-${namespace}.qa.invalid`, CODE = `pos_contention_${namespace}`;
const envelope = { algorithm: 'A256GCM', ciphertext: 'cXVpY2stbGluay10b2tlbi1jaXBoZXJ0ZXh0', iv: 'AQEBAQEBAQEBAQEB', keyId: 'key-1', tag: 'AgICAgICAgICAgICAgICAg', version: 1 };
const address = { recipientName: 'Fixture Customer', phone: '+905551110000', line1: 'Fixture 1', city: 'Istanbul', country: 'TR' };
const authority = [STORE, PRINCIPAL, MEMBER, PLAN, CODE, 1, NOW];
let location, otherLocation;
let operation = 1000;
const op = () => id(operation++), fingerprint = 'a'.repeat(64);
async function transaction(client, role, run) {
  await client.query('BEGIN');
  try {
    await client.query(`SET LOCAL ROLE ${role}`);
    await client.query("SET LOCAL statement_timeout='10s'");
    await client.query("SET LOCAL lock_timeout='8s'");
    const result = await run(); await client.query('COMMIT'); return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}
const rpc = async (client, name, values) => {
  const result = await client.query(`SELECT outcome,result_payload FROM saas.${name}(${values.map((_, index) => `$${index + 1}`).join(',')})`, values);
  assert.equal(result.rows.length, 1); return result.rows[0];
};
async function app(name, values) { return transaction(first, 'celebix_saas_app', () => rpc(first, name, values)); }
async function seedVariant(number, quantity) {
  const variant = id(number);
  await observer.query("SELECT set_config('saas.inventory.source_marker','catalog_adjustment',true),set_config('saas.inventory.source_id',$1,true),set_config('saas.inventory.source_time',$2,true)", [op(), NOW]);
  await observer.query(`INSERT INTO saas.product_variants(id,store_id,product_id,title,price_cents,stock_tracking,stock_quantity,status,created_at,updated_at) VALUES($1,$2,$3,$4,10000,true,$5,'active',$6,$6)`, [variant, STORE, PRODUCT, `Variant ${number}`, quantity, NOW]);
  return variant;
}
async function createDraft(variant, number) {
  const saleId = id(number);
  const intent = { locationId: location, items: [{ variantId: variant, quantity: 1 }], discount: null, customerName: null, note: null };
  const result = await app('in_store_sales_create', [...authority, op(), fingerprint, saleId, JSON.stringify(intent)]);
  assert.equal(result.outcome, 'committed'); return saleId;
}
async function seedLink(variant, number) {
  const link = id(number), digest = randomBytes(32).toString('hex');
  await transaction(observer, 'celebix_saas_owner', async () => {
    await observer.query(`INSERT INTO saas.quick_order_links(id,store_id,creating_membership_id,provider_config_id,status,token_digest,token_key_id,sealed_token,customer_name,customer_email,customer_phone,shipping_address,billing_address,internal_label,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,expires_at,version,created_at,updated_at) VALUES($1,$2,$3,$4,'active',$5,'key-1',$6,'Fixture Customer','fixture@qa.invalid','+905551110000',$7,$7,'POS contention','TRY',10000,0,0,10000,$8::timestamptz+interval '24 hours',1,$8,$8)`, [link, STORE, MEMBER, PROVIDER, randomBytes(32).toString('hex'), JSON.stringify(envelope), JSON.stringify(address), NOW]);
    await observer.query(`INSERT INTO saas.quick_order_link_items(id,store_id,quick_order_link_id,product_id,variant_id,position,product_name,variant_name,unit_price_cents,quantity,line_total_cents,created_at) VALUES($1,$2,$3,$4,$5,0,'Fixture Product','Fixture Variant',10000,1,10000,$6)`, [id(number + 1), STORE, link, PRODUCT, variant, NOW]);
    await observer.query(`INSERT INTO saas.quick_order_redemption_sessions(id,store_id,quick_order_link_id,cookie_digest,expires_at,version,created_at,updated_at) VALUES($1,$2,$3,$4,$5::timestamptz+interval '1 hour',1,$5,$5)`, [id(number + 2), STORE, link, digest, NOW]);
  });
  return { digest, attemptId: id(number + 3), operationId: op(), merchantOid: randomBytes(16).toString('hex') };
}
function beginOnline(client, link) { return rpc(client, 'checkout_begin_attempt', [HOST, link.digest, link.attemptId, link.merchantOid, link.operationId, fingerprint, NOW]); }
function prepare(client, sale) { return rpc(client, 'in_store_sales_prepare', [...authority, op(), fingerprint, sale, 1, 10000]); }
async function proveBlocked(waiterPid, holderPid) {
  const deadline = Date.now() + 2500;
  while (Date.now() < deadline) {
    const state = await observer.query(`SELECT wait_event_type,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=$1`, [waiterPid]);
    if (state.rows[0]?.wait_event_type === 'Lock' && state.rows[0]?.blockers.includes(holderPid)) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('losing request did not wait on the winning transaction');
}
async function race(name, winner, loser, winnerRole, loserRole, expectedLoser) {
  await first.query('BEGIN'); await first.query(`SET LOCAL ROLE ${winnerRole}`); await first.query("SET LOCAL statement_timeout='10s'");
  await second.query('BEGIN'); await second.query(`SET LOCAL ROLE ${loserRole}`); await second.query("SET LOCAL statement_timeout='10s'");
  let pending;
  try {
    const won = await winner(first); assert.ok(['committed', 'attempt_started', 'reserved'].includes(won.outcome), `unexpected winner: ${won.outcome}`);
    const holderPid = (await first.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const waiterPid = (await second.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    pending = loser(second);
    // Attach rejection handling before inspecting the block, so a SQL failure cannot
    // become an unhandled rejection while the observer is reading pg_stat_activity.
    const observed = pending.then(value => ({ value }), error => ({ error }));
    await proveBlocked(waiterPid, holderPid); await first.query('COMMIT');
    const result = await observed; if (result.error) throw result.error;
    assert.equal(result.value.outcome, expectedLoser); await second.query('COMMIT');
    console.log(`${name}: winner committed; loser waited and returned ${expectedLoser}`);
  } catch (error) {
    await first.query('ROLLBACK'); if (pending) await pending.catch(() => {}); await second.query('ROLLBACK'); throw error;
  }
}
async function inspectStock(variant) {
  const result = await observer.query(`SELECT v.stock_quantity,(SELECT quantity FROM saas.inventory_balances WHERE store_id=$1 AND location_id=$2 AND variant_id=v.id) AS location_quantity,(SELECT coalesce(sum(quantity),0) FROM saas.all_inventory_reservations WHERE store_id=$1 AND variant_id=v.id AND stock_tracked AND status='held') AS held FROM saas.product_variants v WHERE v.store_id=$1 AND v.id=$3`, [STORE, location, variant]);
  return result.rows[0];
}
async function rejectLocationWriter(name, values, entityTable, entityId, variant, before) {
  const writer = await pool.connect();
  try {
    await writer.query('BEGIN'); await writer.query('SET LOCAL ROLE celebix_saas_app');
    let result;
    try { result = await rpc(writer, name, values); assert.equal(result.outcome, 'active_hold_conflict'); }
    catch (error) {
      // The location guard is the final boundary after legacy global checks. Record
      // this controlled refusal separately from structured RPC refusal.
      if (error.code !== '23514' || error.message !== 'INVENTORY_LOCATION_ACTIVE_HOLD_VIOLATION') throw error;
      result = { outcome: 'location_guard_23514' };
    }
    await writer.query('ROLLBACK');
    const after = await inspectStock(variant); assert.deepEqual(after, before);
    const status = await observer.query(`SELECT status FROM saas.${entityTable} WHERE store_id=$1 AND id=$2`, [STORE, entityId]);
    assert.ok(['draft', 'counting'].includes(status.rows[0].status));
    console.log(`${name}: held location preserved (${result.outcome})`);
    assert.equal(result.outcome, 'active_hold_conflict', 'existing inventory RPC must return its controlled hold conflict for location reservations');
    return result.outcome;
  } finally { await writer.query('ROLLBACK'); writer.release(); }
}
try {
  assert.match((await observer.query('SHOW server_version')).rows[0].server_version, /^16\./);
  await transaction(observer, 'celebix_saas_owner', async () => {
    await observer.query(`INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES($1,'POS contention fixture',$2,'active','tr','TRY','hemenaku',$3,$3)`, [STORE, `pos-contention-${namespace}`, NOW]);
    await observer.query(`INSERT INTO saas.principals VALUES($1,'https://qa.celebix.invalid',$2,'contention@qa.invalid',true,$3,$3)`, [PRINCIPAL, namespace, NOW]);
    await observer.query(`INSERT INTO saas.memberships VALUES($1,$2,$3,'store_owner','active',$4,$4)`, [MEMBER, PRINCIPAL, STORE, NOW]);
    await observer.query(`INSERT INTO saas.plans VALUES($1,$2,1,'active',$3::timestamptz-interval '1 day',NULL,$3,$3)`, [PLAN, CODE, NOW]);
    await observer.query('ALTER TABLE saas.plan_features DISABLE TRIGGER plan_features_immutable');
    await observer.query(`INSERT INTO saas.plan_features VALUES($1,'orders',2,true),($1,'catalog',1,true)`, [PLAN]);
    await observer.query('ALTER TABLE saas.plan_features ENABLE TRIGGER plan_features_immutable');
    await observer.query(`INSERT INTO saas.subscriptions VALUES($1,$2,$3,$4,1,'active',$5::timestamptz-interval '1 day',NULL,$5,$5)`, [id(5), STORE, PLAN, CODE, NOW]);
    location = (await observer.query('SELECT id FROM saas.inventory_locations WHERE store_id=$1 AND is_default', [STORE])).rows[0].id;
    otherLocation = id(6);
    await observer.query(`INSERT INTO saas.inventory_locations(id,store_id,name,is_default,status,created_at,updated_at) VALUES($1,$2,'Other fixture location',false,'active',$3,$3)`, [otherLocation, STORE, NOW]);
    await observer.query(`INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at) VALUES($1,$2,'contention-product','Fixture Product','active','TRY',$3,$3)`, [PRODUCT, STORE, NOW]);
    await observer.query(`INSERT INTO saas.checkout_provider_configs(id,store_id,provider_key,status,public_origin,configuration_key_id,sealed_configuration,configuration_digest,version,created_at,updated_at) VALUES($1,$2,'paytr','active','https://www.paytr.com','key-1',$3,$4,1,$5,$5)`, [PROVIDER, STORE, JSON.stringify(envelope), 'd'.repeat(64), NOW]);
    await observer.query(`INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version) VALUES($1,$2,$3,'custom_domain','active',true,$4,$4,$4,1)`, [id(9), STORE, HOST, NOW]);
    await seedVariant(10, 1); await seedVariant(11, 1); await seedVariant(12, 3); await seedVariant(13, 1);
    // Move two units to another location, so global checks alone cannot protect the
    // single unit reserved at the selected location.
    await observer.query('UPDATE saas.inventory_balances SET quantity=1 WHERE store_id=$1 AND location_id=$2 AND variant_id=$3', [STORE, location, id(12)]);
    await observer.query(`INSERT INTO saas.inventory_balances(store_id,location_id,variant_id,quantity,version,updated_at) VALUES($1,$2,$3,2,1,$4)`, [STORE, otherLocation, id(12), NOW]);
  });
  const posFirstSale = await createDraft(id(10), 20), onlineFirstSale = await createDraft(id(11), 21);
  const posFirstLink = await seedLink(id(10), 30), onlineFirstLink = await seedLink(id(11), 40);
  await race('POS wins final unit against real checkout_begin_attempt', client => prepare(client, posFirstSale), client => beginOnline(client, posFirstLink), 'celebix_saas_app', 'celebix_saas_workflow', 'stock_unavailable');
  await race('Online wins final unit against real POS preparation', client => beginOnline(client, onlineFirstLink), client => prepare(client, onlineFirstSale), 'celebix_saas_workflow', 'celebix_saas_app', 'inventory_conflict');
  for (const variant of [id(10), id(11)]) assert.deepEqual(await inspectStock(variant), { stock_quantity: '1', location_quantity: '1', held: '1' });
  const locationSale = await createDraft(id(12), 22), globalSale = await createDraft(id(13), 23);
  assert.equal((await transaction(first, 'celebix_saas_app', () => prepare(first, locationSale))).outcome, 'committed');
  assert.equal((await transaction(first, 'celebix_saas_app', () => prepare(first, globalSale))).outcome, 'committed');
  await transaction(observer, 'celebix_saas_owner', async () => {
    for (const [number, variant] of [[50, id(12)], [60, id(13)]]) {
      await observer.query(`INSERT INTO saas.inventory_counts(id,store_id,location_id,status,version,created_at,updated_at) VALUES($1,$2,$3,'counting',1,$4,$4)`, [id(number), STORE, location, NOW]);
      await observer.query(`INSERT INTO saas.inventory_count_lines(id,store_id,inventory_count_id,variant_id,expected_quantity,counted_quantity) VALUES($1,$2,$3,$4,1,0)`, [id(number + 1), STORE, id(number), variant]);
      await observer.query(`INSERT INTO saas.inventory_transfers(id,store_id,source_location_id,destination_location_id,status,version,created_at,updated_at) VALUES($1,$2,$3,$4,'draft',1,$5,$5)`, [id(number + 2), STORE, location, otherLocation, NOW]);
      await observer.query(`INSERT INTO saas.inventory_transfer_lines(id,store_id,inventory_transfer_id,variant_id,quantity) VALUES($1,$2,$3,$4,1)`, [id(number + 3), STORE, id(number + 2), variant]);
    }
  });
  for (const [number, variant] of [[50, id(12)], [60, id(13)]]) {
    const before = await inspectStock(variant);
    await rejectLocationWriter('inventory_counts_commit', [...authority, op(), fingerprint, id(number), 1], 'inventory_counts', id(number), variant, before);
    await rejectLocationWriter('inventory_transfers_dispatch', [...authority, op(), fingerprint, id(number + 2), 1], 'inventory_transfers', id(number + 2), variant, before);
  }
  console.log('POS157 actual writer contention checks passed; synthetic fixtures retained only in dedicated disposable DB.');
} finally {
  await Promise.allSettled([observer.query('ROLLBACK'), first.query('ROLLBACK'), second.query('ROLLBACK')]);
  observer.release(); first.release(); second.release(); await pool.end();
}
