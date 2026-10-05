import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { before, after } from 'node:test';
import { startDeletionFixture } from './fixture.mjs';

let f;
before(async () => { f = await startDeletionFixture({ baseline: process.env.CELEBIX_ORDER_DELETE_BASELINE === '1' }); });
after(async () => { await f?.stop(); });

async function assertDetached(sale, beforeState) {
  assert.equal((await f.pool.query('SELECT count(*) n FROM saas.orders WHERE id=$1', [sale.id])).rows[0].n, '0');
  const receivable = (await f.pool.query('SELECT * FROM saas.accounting_receivables WHERE store_id=$1 AND deleted_order_id=$2', [f.store, sale.id])).rows[0];
  assert.ok(receivable, 'the existing receivable survives with a deleted order snapshot');
  const expectedState = structuredClone(beforeState);
  const expectedReceivable = expectedState.accounting_receivables.find(row => row.id === receivable.id);
  assert.ok(expectedReceivable);
  expectedReceivable.version += 1;
  assert.deepEqual(await f.snapshot(), expectedState, 'only the affected receivable CAS may increment; money, metadata, balances and inventory stay intact');
  assert.equal(receivable.order_id, null);
  assert.equal(receivable.deleted_order_number, sale.orderNumber);
  const events = (await f.pool.query('SELECT order_id,deleted_order_id,deleted_order_number FROM saas.accounting_events WHERE store_id=$1 AND deleted_order_id=$2', [f.store, sale.id])).rows;
  assert.ok(events.length >= 2, 'sale and initial collection evidence must both survive');
  for (const event of events) assert.deepEqual(event, { order_id: null, deleted_order_id: sale.id, deleted_order_number: sale.orderNumber });
  const account = await f.accounting.customerAccount({ tenantContext: f.tenant(), now: f.now, customerId: sale.customerId });
  assert.equal(account.receivables.find(row => row.id === receivable.id).orderNumber, sale.orderNumber, 'customer ledger displays the retained order number');
  assert.equal(account.version, sale.customerVersion + 1, 'detachment invalidates the affected customer CAS version once');
  return expectedState;
}

test('authorized deleteOrder removes POS order but retains ledger, balances, snapshots and exact replay', async () => {
  const sale = await f.order(), beforeState = await f.snapshot(), operationId = randomUUID();
  // Baseline must reach the real deletion. It fails with the FK23503/unavailable bug, not a skipped/missing-schema assertion.
  const result = await f.deletion(sale, { operationId });
  assert.equal(result.deleted, true);
  const detachedState = await assertDetached(sale, beforeState);
  const replay = await f.deletion(sale, { operationId });
  assert.equal(replay.replayed, true);
  assert.deepEqual(await f.snapshot(), detachedState);
  await assert.rejects(() => f.deletion(sale, { operationId, confirmation: 'Different intent' }), error => error.code === 'operation_mismatch');
});

test('authoritative owner SQL delete_order uses the same authority and detach boundary', async () => {
  const sale = await f.order(), beforeState = await f.snapshot();
  await f.owner(async client => {
    const result = await client.query('SELECT * FROM saas.delete_order($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [...f.authority(), randomUUID(), 'a'.repeat(64), sale.id, sale.expectedVersion, sale.orderNumber]);
    assert.equal(result.rows[0].outcome, 'deleted');
  });
  await assertDetached(sale, beforeState);
});

test('completed V3 named/noted sale tombstones without changing stock, receipt or credit snapshots', async () => {
  const sale = await f.completedV3(), beforeState = await f.snapshot();
  const original = (await f.pool.query('SELECT * FROM saas.in_store_sales WHERE id=$1', [sale.saleId])).rows[0];
  assert.equal(original.intent.customerName, 'Synthetic named sale');
  assert.equal(original.intent.note, 'Synthetic private note');
  const receipt = (await f.pool.query('SELECT to_jsonb(t)-\'slip_reference\' body FROM saas.in_store_payment_attestations t WHERE sale_id=$1', [sale.saleId])).rows[0].body;
  await f.deletion(sale);
  const detachedState = await assertDetached(sale, beforeState);
  const tombstone = (await f.pool.query('SELECT * FROM saas.in_store_sales WHERE id=$1', [sale.saleId])).rows[0];
  assert.equal(tombstone.status, 'completed'); assert.equal(tombstone.order_id, null); assert.equal(tombstone.order_number, sale.orderNumber);
  assert.equal(tombstone.intent.customerName, null); assert.equal(tombstone.intent.note, null);
  for (const key of ['customer_id', 'customer_snapshot', 'initial_collection_cents', 'due_date', 'items', 'total_cents', 'payment_received_at', 'completed_at']) assert.deepEqual(tombstone[key], original[key], key + ' remains frozen');
  assert.deepEqual((await f.pool.query('SELECT to_jsonb(t)-\'slip_reference\' body FROM saas.in_store_payment_attestations t WHERE sale_id=$1', [sale.saleId])).rows[0].body, receipt);
  assert.equal(Number((await f.pool.query('SELECT stock_quantity FROM saas.product_variants WHERE id=$1', [sale.variantId])).rows[0].stock_quantity), 9);
  const replay = await f.owner(async client => (await client.query('SELECT * FROM saas.in_store_sales_complete_v3($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [...f.authority(), sale.completeOperation, sale.completeFingerprint, sale.saleId, 3])).rows[0]);
  assert.equal(replay.outcome, 'operation_replayed'); assert.equal(replay.result_payload.sale.orderId, null);
  assert.deepEqual(await f.snapshot(), detachedState);
});

test('cross-tenant, stale version and confirmation mismatch cannot detach finance', async () => {
  const sale = await f.order(), beforeState = await f.snapshot();
  for (const [extra, code] of [[{ tenantContext: f.tenant(f.other, f.otherMember) }, 'order_not_found'], [{ expectedVersion: sale.expectedVersion + 1 }, 'version_conflict'], [{ confirmation: 'Wrong number' }, 'invalid_confirmation']]) {
    await assert.rejects(() => f.deletion(sale, extra), error => error.code === code);
    assert.deepEqual(await f.snapshot(), beforeState);
  }
  await assert.rejects(() => f.owner(async client => {
    await client.query("SELECT set_config('saas.permanent_delete_order',$1,true)", [f.other + ':' + sale.id]);
    await client.query('DELETE FROM saas.orders WHERE id=$1', [sale.id]);
  }));
  assert.equal((await f.pool.query('SELECT count(*) n FROM saas.orders WHERE id=$1', [sale.id])).rows[0].n, '1');
  assert.deepEqual(await f.snapshot(), beforeState);
});

test('deletion context cannot rewrite immutable event amount/metadata or frozen V3 intent', async () => {
  const sale = await f.completedV3(), beforeState = await f.snapshot();
  for (const mutation of ['amount_cents=amount_cents+1', "metadata=metadata||'{\"changed\":true}'::jsonb"]) {
    await assert.rejects(() => f.owner(async client => {
      await client.query("SELECT set_config('saas.permanent_delete_order',$1,true)", [f.store + ':' + sale.id]);
      await client.query(`UPDATE saas.accounting_events SET ${mutation} WHERE order_id=$1`, [sale.id]);
    }));
  }
  await assert.rejects(() => f.owner(async client => {
    await client.query("SELECT set_config('saas.permanent_delete_order',$1,true)", [f.other + ':' + sale.id]);
    await client.query('UPDATE saas.accounting_events SET order_id=NULL WHERE order_id=$1', [sale.id]);
  }), /ACCOUNTING_IMMUTABLE/);
  await assert.rejects(() => f.owner(client => client.query("UPDATE saas.in_store_sales SET intent=jsonb_set(intent,'{note}','null') WHERE id=$1", [sale.saleId])), /IN_STORE_CREDIT_SNAPSHOT_IMMUTABLE/);
  await assert.rejects(() => f.owner(async client => {
    await client.query("SELECT set_config('saas.permanent_delete_order',$1,true),set_config('saas.in_store.redact_order',$1,true),set_config('saas.in_store.redact_sale',$2,true)", [f.store + ':' + sale.id, f.store + ':' + sale.saleId]);
    await client.query("UPDATE saas.in_store_sales SET order_id=NULL,intent=jsonb_set(jsonb_set(intent,'{customerName}','null'),'{note}','null'),total_cents=total_cents-1 WHERE id=$1", [sale.saleId]);
  }), /IN_STORE_CREDIT_SNAPSHOT_IMMUTABLE/);
  await assert.rejects(() => f.owner(client => client.query('DELETE FROM saas.accounting_events WHERE order_id=$1', [sale.id])), /ACCOUNTING_IMMUTABLE/);
  assert.equal((await f.pool.query("SELECT has_function_privilege('celebix_saas_app','saas.accounting_detach_deleted_order(uuid,uuid)','EXECUTE') allowed")).rows[0].allowed, false);
  assert.deepEqual(await f.snapshot(), beforeState);
});

test('retained debt remains collectible after deletion and stale pre-deletion CAS is rejected', async () => {
  const sale = await f.order(), inventory = await f.snapshot();
  await f.deletion(sale);
  const authority = { tenantContext: f.tenant(), now: f.now };
  const current = await f.accounting.customerAccount({ ...authority, customerId: sale.customerId });
  assert.equal(current.dueCents, 600000);
  const intent = { customerId: sale.customerId, orderId: null, amountCents: 200000, currency: 'TRY', paymentMethod: 'card', accountId: null, expectedVersion: current.version, note: 'Synthetic subsequent receipt' };
  await assert.rejects(() => f.accounting.collect({ ...authority, operationId: randomUUID(), intent: { ...intent, expectedVersion: sale.customerVersion } }), error => error.code === 'version_conflict');
  const operationId = randomUUID();
  const received = await f.accounting.collect({ ...authority, operationId, intent });
  assert.equal(received.customerAccount.dueCents, 400000);
  assert.equal(received.event.amountCents, 200000);
  assert.equal(received.event.paymentMethod, 'card');
  const receivable = received.customerAccount.receivables.find(row => row.orderNumber === sale.orderNumber);
  assert.ok(receivable); assert.equal(receivable.saleCents, 1100000); assert.equal(receivable.collectedCents, 700000);
  const replay = await f.accounting.collect({ ...authority, operationId, intent });
  assert.equal(replay.replayed, true); assert.equal(replay.event.id, received.event.id);
  const afterState = await f.snapshot();
  for (const key of ['inventory_movements', 'inventory_balances']) assert.deepEqual(afterState[key], inventory[key]);
});

test('deletion waits before order row lock so a catalog/accounting transaction can finish without inversion', async () => {
  const sale = await f.order(), client = await f.pool.connect();
  let pending;
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock_shared(hashtextextended('saas.accounting.release',0)),pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||$1::text,0)),pg_advisory_xact_lock(hashtextextended('saas.accounting.store:'||$1::text,0))", [f.store]);
    const pid = (await client.query('SELECT pg_backend_pid() pid')).rows[0].pid;
    const beforeState = await f.snapshot();
    pending = f.deletion(sale); pending.catch(() => {});
    let waiting = false;
    for (let attempt = 0; attempt < 150 && !waiting; attempt++) {
      waiting = (await f.pool.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted AND pid<>$1 AND objid=(hashtextextended('saas.catalog.store:'||$2::text,0)&4294967295)::oid) waiting", [pid, f.store])).rows[0].waiting;
      if (!waiting) await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(waiting, true, 'deletion joins the shared release/catalog/accounting lock order');
    await client.query("SET LOCAL lock_timeout='500ms'");
    await client.query('SELECT id FROM saas.orders WHERE store_id=$1 AND id=$2 FOR UPDATE', [f.store, sale.id]);
    await client.query('COMMIT');
    assert.equal((await pending).deleted, true);
    await assertDetached(sale, beforeState);
  } finally { await client.query('ROLLBACK'); client.release(); await pending?.catch(() => {}); }
});
