import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { before, after } from 'node:test';
import { startDeletionFixture } from '../permanent-order-ledger-deletion/fixture.mjs';

let f, variant, location, customer;
const baseline = process.env.CELEBIX_POS_DISCARD_BASELINE === '1';
before(async () => {
  f = await startDeletionFixture();
  variant = randomUUID(); customer = randomUUID(); const product = randomUUID();
  location = (await f.pool.query('SELECT id FROM saas.inventory_locations WHERE store_id=$1 AND is_default', [f.store])).rows[0].id;
  await f.owner(async client => {
    await client.query('UPDATE saas.accounting_release_state SET credit_sales_enabled=true');
    await client.query("INSERT INTO saas.customers(id,store_id,first_name,last_name,phone,status,created_at,updated_at) VALUES($1,$2,'Synthetic','Discard','+905552170001','active',$3,$3)", [customer, f.store, f.now]);
    await client.query("INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at) VALUES($1,$2,$3,'Discard fixture','active','TRY',$4,$4)", [product, f.store, 'discard-' + product, f.now]);
    await client.query("SELECT set_config('saas.inventory.source_marker','catalog_adjustment',true),set_config('saas.inventory.source_id',$1,true),set_config('saas.inventory.source_time',$2,true)", [randomUUID(), f.now.toISOString()]);
    await client.query("INSERT INTO saas.product_variants(id,store_id,product_id,title,price_cents,stock_tracking,stock_quantity,status,created_at,updated_at) VALUES($1,$2,$3,'M',1100000,true,25,'active',$4,$4)", [variant, f.store, product, f.now]);
  });
  if (!baseline) {
    f.native.apply('202610050217_in_store_unpaid_sale_discard.up.sql');
    f.native.apply('202610050217_in_store_unpaid_sale_discard_assertions.sql');
  }
});
after(async () => { await f?.stop(); });
const suffix = version => version === 1 ? '' : '_v' + version;
async function create(version = 3, stage = 'draft', initial = 500000) {
  const id = randomUUID();
  const intent = { locationId: location, items: [{ variantId: variant, quantity: 1, ...(version >= 2 ? { unitPriceOverrideCents: null } : {}) }], discount: null, customerName: 'Synthetic sale', note: 'Synthetic note', ...(version >= 2 ? { paymentMethod: initial === 0 ? null : 'cash' } : {}), ...(version === 3 ? { customerId: customer, initialCollectionCents: initial, dueDate: '2026-12-01' } : {}) };
  let row = await f.rpc('in_store_sales_create' + suffix(version), [...f.authority(), randomUUID(), '1'.repeat(64), id, JSON.stringify(intent)]);
  if (stage === 'held') row = await f.rpc('in_store_sales_hold' + suffix(version), [...f.authority(), randomUUID(), '2'.repeat(64), id, row.result_payload.sale.version, true]);
  if (['payment_pending', 'payment_received', 'completed'].includes(stage)) row = await f.rpc('in_store_sales_prepare' + suffix(version), [...f.authority(), randomUUID(), '3'.repeat(64), id, row.result_payload.sale.version, 1100000]);
  if (['payment_received', 'completed'].includes(stage)) row = await f.rpc('in_store_sales_confirm_payment' + suffix(version), [...f.authority(), randomUUID(), '4'.repeat(64), id, row.result_payload.sale.version, null, ...(version >= 2 ? [null] : [])]);
  if (stage === 'completed') row = await f.rpc('in_store_sales_complete' + suffix(version), [...f.authority(), randomUUID(), '5'.repeat(64), id, row.result_payload.sale.version]);
  return { id, version, sale: row.result_payload.sale };
}
async function discard(sale, extra = {}) {
  const args = { store: f.store, principal: f.principal, member: f.member, operationId: randomUUID(), fingerprint: 'd'.repeat(64), expectedVersion: sale.sale.version, confirmUnpaid: true, ...extra };
  return f.owner(async client => {
    await client.query('SET LOCAL ROLE celebix_saas_app');
    return (await client.query(`SELECT * FROM saas.in_store_sales_discard${suffix(sale.version)}($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [args.store, args.principal, args.member, ...f.authority().slice(3), args.operationId, args.fingerprint, sale.id, args.expectedVersion, args.confirmUnpaid])).rows[0];
  });
}
async function current(id) { return (await f.pool.query('SELECT * FROM saas.in_store_sales WHERE id=$1', [id])).rows[0]; }

test('real valid V3 draft discard commits terminal cancelled and replays exactly once', async () => {
  const sale = await create(), beforeState = await f.snapshot(), operationId = randomUUID();
  // Before SQL217 this reaches the real native call and fails42883, not a skipped migration check.
  const result = await discard(sale, { operationId });
  assert.equal(result.outcome, 'committed'); assert.equal(result.result_payload.sale.status, 'cancelled');
  assert.equal(result.result_payload.sale.version, sale.sale.version + 1);
  assert.deepEqual(result.result_payload.sale.items, sale.sale.items);
  assert.deepEqual(await f.snapshot(), beforeState);
  const savedVersion = result.result_payload.sale.version;
  const read = await f.owner(async client => (await client.query('SELECT * FROM saas.in_store_sales_get_v3($1,$2,$3,$4,$5,$6,$7,$8)', [...f.authority(),sale.id])).rows[0]);
  assert.equal(read.result_payload.status, 'cancelled');
  for (const [name, extra] of [['takeover',[]],['hold',[true]],['prepare',[1100000]],['update',[JSON.stringify({locationId:location,items:[],discount:null,customerName:null,note:null,paymentMethod:null,customerId:null,initialCollectionCents:0,dueDate:null})]]]) {
    const rejected = await f.owner(async client => {
      await client.query('SET LOCAL ROLE celebix_saas_app');
      const args = [...f.authority(),randomUUID(),'a'.repeat(64),sale.id,savedVersion,...extra];
      return (await client.query(`SELECT * FROM saas.in_store_sales_${name}_v3(${args.map((_,i)=>'$'+(i+1)).join(',')})`,args)).rows[0];
    });
    assert.equal(rejected.outcome,'invalid_transition',name);
  }
  assert.equal((await current(sale.id)).version,String(savedVersion));
  assert.deepEqual(await f.snapshot(), beforeState);
  const replay = await discard(sale, { operationId });
  assert.equal(replay.outcome, 'operation_replayed'); assert.equal(replay.result_payload.sale.status, 'cancelled');
  assert.equal((await current(sale.id)).version, String(sale.sale.version + 1));
  const operations = (await f.pool.query("SELECT operation_kind FROM saas.in_store_operations WHERE operation_id=$1", [operationId])).rows;
  assert.deepEqual(operations, [{ operation_kind: 'discard' }]);
  const bootstrap = await f.owner(async client => (await client.query('SELECT * FROM saas.in_store_sales_bootstrap_v3($1,$2,$3,$4,$5,$6,$7)', f.authority())).rows[0]);
  assert.equal(bootstrap.result_payload.activeDraft, null);
  assert.deepEqual(await f.snapshot(), beforeState);
});

test('partial payment preparation releases holds without stock consumption or finance', async () => {
  const sale = await create(3, 'payment_pending'), beforeState = await f.snapshot();
  const held = (await f.pool.query('SELECT status FROM saas.in_store_inventory_reservations WHERE sale_id=$1', [sale.id])).rows;
  assert.deepEqual(held, [{ status: 'held' }]);
  assert.equal((await discard(sale)).outcome, 'committed');
  assert.deepEqual((await f.pool.query('SELECT status FROM saas.in_store_inventory_reservations WHERE sale_id=$1', [sale.id])).rows, [{ status: 'released' }]);
  assert.equal((await current(sale.id)).status, 'cancelled');
  assert.equal((await f.pool.query('SELECT count(*) n FROM saas.in_store_payment_attestations WHERE sale_id=$1', [sale.id])).rows[0].n, '0');
  assert.deepEqual(await f.snapshot(), beforeState);
});

test('zero-collection credit preparation can be discarded before delivery', async () => {
  const sale = await create(3, 'payment_pending', 0), beforeState = await f.snapshot();
  assert.equal((await discard(sale)).outcome, 'committed');
  const saved = await current(sale.id);
  assert.equal(saved.status, 'cancelled'); assert.equal(saved.payment_received_at, null); assert.equal(saved.order_id, null);
  assert.equal(saved.initial_collection_cents, '0'); assert.deepEqual(await f.snapshot(), beforeState);
});

test('V1/V2 discarded held sales remain terminal while the existing unpaid cancel still returns a draft', async () => {
  for (const version of [1, 2]) {
    const sale = await create(version, 'held'), beforeState = await f.snapshot();
    assert.equal((await discard(sale)).result_payload.sale.status, 'cancelled');
    assert.deepEqual(await f.snapshot(), beforeState);
  }
  for (const version of [1, 2, 3]) {
    const legacyCancel = await create(version, 'payment_pending'), beforeState = await f.snapshot();
    const result = await f.rpc('in_store_sales_cancel' + suffix(version), [...f.authority(), randomUUID(), 'c'.repeat(64), legacyCancel.id, legacyCancel.sale.version, true]);
    assert.equal(result.result_payload.sale.status, 'draft');
    assert.deepEqual(result.result_payload.sale.items, legacyCancel.sale.items);
    assert.deepEqual(await f.snapshot(), beforeState);
  }
});

test('received/completed payment and attestation forbid discard without monetary or stock changes', async () => {
  for (const stage of ['payment_received', 'completed']) {
    const sale = await create(3, stage), beforeState = await f.snapshot(), beforeSale = await current(sale.id);
    const result = await discard(sale);
    assert.equal(result.outcome, 'invalid_transition'); assert.deepEqual(await current(sale.id), beforeSale);
    assert.deepEqual(await f.snapshot(), beforeState);
  }
});

test('tenant, ownership, version, unpaid acknowledgement and operation mismatch are rejected', async () => {
  const sale = await create(), beforeSale = await current(sale.id), beforeState = await f.snapshot();
  for (const [extra, outcome] of [[{ store: f.other, member: f.otherMember }, 'not_found'], [{ expectedVersion: sale.sale.version + 1 }, 'version_conflict'], [{ confirmUnpaid: false }, 'invalid_transition'], [{ principal: randomUUID() }, 'membership_denied']]) {
    assert.equal((await discard(sale, extra)).outcome, outcome);
    assert.deepEqual(await current(sale.id), beforeSale); assert.deepEqual(await f.snapshot(), beforeState);
  }
  const operationId = randomUUID(); assert.equal((await discard(sale, { operationId })).outcome, 'committed');
  assert.equal((await discard(sale, { operationId, fingerprint: 'e'.repeat(64) })).outcome, 'operation_mismatch');
});

test('concurrent same-version discard commits once and down/reapply retains prior cancel definitions', async () => {
  const sale = await create(3, 'payment_pending');
  const results = await Promise.all([discard(sale), discard(sale)]);
  assert.deepEqual(results.map(row => row.outcome).sort(), ['committed', 'version_conflict']);
  assert.equal((await current(sale.id)).status, 'cancelled');
  const originals = f.native.value("SELECT jsonb_agg(jsonb_build_object('signature',signature,'definition',definition) ORDER BY signature) FROM saas.in_store_discard_217_restore");
  f.native.apply('202610050217_in_store_unpaid_sale_discard.down.sql');
  for (const original of JSON.parse(originals)) assert.equal(f.native.value(`SELECT pg_get_functiondef('${original.signature.replaceAll("'", "''")}'::regprocedure)`), original.definition.trim());
  assert.equal(f.native.value("SELECT to_regprocedure('saas.in_store_sales_discard_v3(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,boolean)') IS NULL"), 't');
  f.native.apply('202610050217_in_store_unpaid_sale_discard.up.sql'); f.native.apply('202610050217_in_store_unpaid_sale_discard_assertions.sql');
});
