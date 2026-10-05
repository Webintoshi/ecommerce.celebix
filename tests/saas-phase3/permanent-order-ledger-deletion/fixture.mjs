import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { startAccountingFixture } from '../accounting-ledger/fixture.mjs';
import { PostgresOrderRepository } from '../../../packages/saas-data/src/orders/index.ts';
import { PostgresAccountingRepository } from '../../../packages/saas-data/src/accounting/index.ts';

export async function startDeletionFixture({ baseline = false } = {}) {
  const native = startAccountingFixture(199);
  let pool;
  try {
    native.apply('202610020200_accounting_ledger.up.sql');
    native.apply('202610020201_in_store_credit_sales.up.sql');
    if (!baseline) {
      // Exact candidate; a missing migration is a hard failure, never a skipped acceptance.
      native.apply('202610050216_permanent_order_accounting_retention.up.sql');
    }
    pool = new pg.Pool({ ...native.connection, max: 5 });
    const now = new Date(), principal = randomUUID(), member = randomUUID(), otherMember = randomUUID();
    const store = randomUUID(), other = randomUUID();
    const plan = (await pool.query("SELECT id,plan_code,version,valid_from FROM saas.plans WHERE plan_code='free_starter' AND version=1")).rows[0];
    assert.ok(plan);
    const limits = Object.fromEntries((await pool.query('SELECT limit_key,limit_value FROM saas.plan_limits WHERE plan_id=$1', [plan.id])).rows.map(row => [row.limit_key, Number(row.limit_value)]));
    await pool.query("INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES($1::uuid,'https://deletion.qa.invalid',$1::uuid::text,$2,true,$3,$3)", [principal, `${principal}@deletion.qa.invalid`, now]);
    for (const [id, membership] of [[store, member], [other, otherMember]]) {
      await pool.query("INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES($1,'Synthetic deletion',$2,'active','tr','TRY','hemenaku',$3,$3)", [id, `deletion-${id}`, now]);
      await pool.query("INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES($1,$2,$3,'store_owner','active',$4,$4)", [membership, principal, id, now]);
      await pool.query("INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'active',$6,$6,$6)", [randomUUID(), id, plan.id, plan.plan_code, plan.version, now]);
    }
    const tenant = (id = store, membership = member) => ({ schemaVersion: 1, requestId: randomUUID(), principal: { id: principal, issuer: 'https://deletion.qa.invalid', subject: principal }, store: { id, slug: `deletion-${id}`, status: 'active' }, membership: { id: membership, role: 'store_owner', status: 'active' }, entitlements: { schemaVersion: 1, planId: plan.id, planCode: plan.plan_code, version: Number(plan.version), status: 'active', features: ['orders', 'catalog'], limits, validFrom: plan.valid_from.toISOString() }, locale: 'tr-TR' });
    const options = { pool, role: 'celebix_saas_app', timeouts: { poolCheckoutMs: 2000, statementMs: 10000, lockMs: 6000, idleTransactionMs: 10000 } };
    const orders = new PostgresOrderRepository({ ...options, generateId: () => randomUUID(), audit: () => {} }), accounting = new PostgresAccountingRepository(options);
    const authority = () => [store, principal, member, plan.id, plan.plan_code, Number(plan.version), now];
    async function owner(work) {
      const client = await pool.connect();
      try { await client.query('BEGIN'); await client.query('SET LOCAL ROLE celebix_saas_owner'); const result = await work(client); await client.query('COMMIT'); return result; }
      catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    }
    async function rpc(name, args) {
      assert.match(name, /^in_store_sales_[a-z0-9_]+$/);
      return owner(async client => {
        await client.query('SET LOCAL ROLE celebix_saas_app');
        const row = (await client.query(`SELECT * FROM saas.${name}(${args.map((_, index) => '$' + (index + 1)).join(',')})`, args)).rows[0];
        assert.equal(row.outcome, 'committed', `${name}: ${row.outcome}`);
        return row;
      });
    }
    async function customer() {
      const id = randomUUID();
      await pool.query("INSERT INTO saas.customers(id,store_id,first_name,last_name,phone,status,created_at,updated_at) VALUES($1,$2,'Synthetic','Customer',$3,'active',$4,$4)", [id, store, '+90555' + String(Math.floor(Math.random() * 10000000)).padStart(7, '0'), now]);
      return id;
    }
    async function order(total = 1100000, initial = 500000) {
      const id = randomUUID(), operationId = randomUUID(), customerId = await customer(), orderNumber = 'POS-QA-' + id;
      await pool.query("INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,customer_phone,customer_id,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,created_at,updated_at) VALUES($1,$2,$3,'in_store','Synthetic Customer',NULL,'+905551110001',$4,'TRY',$5,0,0,$5,'delivered','pending',NULL,$6,$6)", [id, store, orderNumber, customerId, total, now]);
      await pool.query('SELECT saas.accounting_post_pos_sale($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)', [store, id, operationId, customerId, JSON.stringify({ name: 'Synthetic Customer', phone: '+905551110001' }), total, initial, 'TRY', initial ? 'cash' : null, '2026-12-01', member, now, initial ? now : null, member]);
      const customerVersion = Number((await pool.query("SELECT version FROM saas.accounting_customer_versions WHERE store_id=$1 AND customer_id=$2 AND currency='TRY'", [store, customerId])).rows[0].version);
      return { id, orderNumber, customerId, customerVersion, expectedVersion: Number((await pool.query('SELECT version FROM saas.orders WHERE id=$1', [id])).rows[0].version) };
    }
    async function completedV3() {
      const productId = randomUUID(), variantId = randomUUID(), saleId = randomUUID(), customerId = await customer();
      const location = (await pool.query('SELECT id FROM saas.inventory_locations WHERE store_id=$1 AND is_default', [store])).rows[0].id;
      await owner(async client => {
        await client.query('UPDATE saas.accounting_release_state SET credit_sales_enabled=true');
        await client.query("INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at) VALUES($1,$2,$3,'Synthetic stock','active','TRY',$4,$4)", [productId, store, 'stock-' + productId, now]);
        await client.query("SELECT set_config('saas.inventory.source_marker','catalog_adjustment',true),set_config('saas.inventory.source_id',$1,true),set_config('saas.inventory.source_time',$2,true)", [randomUUID(), now.toISOString()]);
        await client.query("INSERT INTO saas.product_variants(id,store_id,product_id,title,price_cents,stock_tracking,stock_quantity,status,created_at,updated_at) VALUES($1,$2,$3,'M',1100000,true,10,'active',$4,$4)", [variantId, store, productId, now]);
      });
      const intent = { locationId: location, items: [{ variantId, quantity: 1, unitPriceOverrideCents: null }], discount: null, customerName: 'Synthetic named sale', note: 'Synthetic private note', paymentMethod: 'cash', customerId, initialCollectionCents: 500000, dueDate: '2026-12-01' };
      await rpc('in_store_sales_create_v3', [...authority(), randomUUID(), '1'.repeat(64), saleId, JSON.stringify(intent)]);
      await rpc('in_store_sales_prepare_v3', [...authority(), randomUUID(), '2'.repeat(64), saleId, 1, 1100000]);
      await rpc('in_store_sales_confirm_payment_v3', [...authority(), randomUUID(), '3'.repeat(64), saleId, 2, 'synthetic-slip', null]);
      const completeOperation = randomUUID(), completeFingerprint = '4'.repeat(64);
      const result = await rpc('in_store_sales_complete_v3', [...authority(), completeOperation, completeFingerprint, saleId, 3]);
      const id = result.result_payload.sale.orderId;
      const saved = (await pool.query('SELECT order_number,version FROM saas.orders WHERE id=$1', [id])).rows[0];
      const customerVersion = Number((await pool.query("SELECT version FROM saas.accounting_customer_versions WHERE store_id=$1 AND customer_id=$2 AND currency='TRY'", [store, customerId])).rows[0].version);
      return { id, saleId, variantId, customerId, customerVersion, orderNumber: saved.order_number, expectedVersion: Number(saved.version), completeOperation, completeFingerprint };
    }
    async function snapshot() {
      const result = {};
      for (const table of ['accounting_receivables', 'accounting_events', 'accounting_allocations', 'accounting_account_movements', 'accounting_accounts', 'inventory_movements', 'inventory_balances']) {
        result[table] = (await pool.query(`SELECT coalesce(jsonb_agg((to_jsonb(t)-'order_id'-'deleted_order_id'-'deleted_order_number') ORDER BY to_jsonb(t)::text),'[]') value FROM saas.${table} t WHERE store_id=$1`, [store])).rows[0].value;
      }
      return result;
    }
    const deletion = (sale, extra = {}) => orders.deleteOrder({ tenantContext: tenant(), now, operationId: randomUUID(), orderId: sale.id, expectedVersion: sale.expectedVersion, confirmation: sale.orderNumber, ...extra });
    return { native, pool, store, other, member, otherMember, principal, now, tenant, owner, rpc, authority, orders, accounting, order, completedV3, snapshot, deletion, async stop() { await pool.end(); native.stop(); } };
  } catch (error) { if (pool) await pool.end(); native.stop(); throw error; }
}
