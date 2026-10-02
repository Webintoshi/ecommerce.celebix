import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import type {TenantContext,InStoreSaleResult,InStorePosCustomerResult,InStorePosCustomer,InStoreBootstrap,InStoreProduct,AccountingCollectionPreview,AccountingMutationResult,AccountingOrderFinance,AccountingCustomerAccount} from '@celebix/saas-contracts';
import {PostgresInStoreSalesRepository} from '../../../packages/saas-data/src/in-store-sales/repository.ts';
import {PostgresAccountingRepository} from '../../../packages/saas-data/src/accounting/repository.ts';
import {createInStoreSalesHttpHandlers} from '../../../apps/customer-panel/lib/in-store-sales-http/handler.ts';
import {createAccountingHttpHandlers} from '../../../apps/customer-panel/lib/accounting-http/handler.ts';
import type {ServerInStoreSalesRuntime} from '../../../apps/customer-panel/lib/server-in-store-sales/runtime.ts';
import type {ServerAccountingRuntime} from '../../../apps/customer-panel/lib/server-accounting/runtime.ts';
import {startAccountingFixture} from './fixture.mjs';

// Only the session resolver is a fixture dependency. Both original HTTP handlers
// use actual repositories, app-role transactions, and disposable PostgreSQL.
const fixture=startAccountingFixture(185);
let pool:Pool|undefined;
try {
  fixture.apply('202610020200_accounting_ledger.up.sql');
  fixture.apply('202610020201_in_store_credit_sales.up.sql');
  pool=new Pool({...fixture.connection,max:3});
  const store=randomUUID(),principal=randomUUID(),membership=randomUUID(),product=randomUUID(),variant=randomUUID();
  const slug='accounting-http-acceptance',host=`${slug}.admin.saas-staging.celebix.site`,panelOrigin='https://panel.saas-staging.celebix.site';
  const now=new Date('2026-10-02T14:00:00.000Z');
  const plan=(await pool.query("SELECT id,plan_code,version,valid_from FROM saas.plans WHERE plan_code='free_starter' AND version=1")).rows[0];
  const features=(await pool.query('SELECT feature_key FROM saas.plan_features WHERE plan_id=$1 AND enabled ORDER BY feature_key',[plan.id])).rows.map(row=>row.feature_key);
  const limits=Object.fromEntries((await pool.query('SELECT limit_key,limit_value FROM saas.plan_limits WHERE plan_id=$1',[plan.id])).rows.map(row=>[row.limit_key,Number(row.limit_value)]));
  await pool.query("INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES($1,'https://qa.celebix.invalid','http-acceptance','http-acceptance@qa.celebix.invalid',true,'2026-01-01','2026-01-01')",[principal]);
  await pool.query("INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES($1,'Synthetic HTTP acceptance',$2,'active','tr','TRY','hemenaku','2026-01-01','2026-01-01')",[store,slug]);
  await pool.query("INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES($1,$2,$3,'store_owner','active','2026-01-01','2026-01-01')",[membership,principal,store]);
  await pool.query("INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'active','2026-01-01','2026-01-01','2026-01-01')",[randomUUID(),store,plan.id,plan.plan_code,plan.version]);
  const location=(await pool.query('SELECT id FROM saas.inventory_locations WHERE store_id=$1 AND is_default',[store])).rows[0].id;
  const seed=await pool.connect();
  try {
    await seed.query('BEGIN');
    await seed.query("INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at) VALUES($1,$2,'http-product','Synthetic HTTP product','active','TRY','2026-01-01','2026-01-01')",[product,store]);
    await seed.query("SELECT set_config('saas.inventory.source_marker','catalog_adjustment',true),set_config('saas.inventory.source_id',$1,true),set_config('saas.inventory.source_time',$2,true)",[randomUUID(),now.toISOString()]);
    await seed.query("INSERT INTO saas.product_variants(id,store_id,product_id,title,barcode,price_cents,stock_tracking,stock_quantity,status,created_at,updated_at) VALUES($1,$2,$3,'M','2010098765432',1100000,true,10,'active',$4,$4)",[variant,store,product,now]);
    await seed.query('UPDATE saas.accounting_release_state SET credit_sales_enabled=true');
    await seed.query('COMMIT');
  } catch(error) {await seed.query('ROLLBACK');throw error;} finally {seed.release();}
  const tenantContext:TenantContext={schemaVersion:1,requestId:randomUUID(),principal:{id:principal,issuer:'https://qa.celebix.invalid',subject:'http-acceptance'},store:{id:store,slug,status:'active'},membership:{id:membership,role:'store_owner',status:'active'},entitlements:{schemaVersion:1,planId:plan.id,planCode:plan.plan_code,version:Number(plan.version),status:'active',features,limits,validFrom:plan.valid_from.toISOString()},locale:'tr-TR'};
  const credential=`v1.panel.current.${Buffer.alloc(32,0x31).toString('base64url')}`;
  const access={readiness:{mode:'approved_staging'},panelOrigin,resolveCredential:async(input:{hostname:string;credential:string})=>input.hostname===host&&input.credential===credential?{kind:'authenticated',tenantContext}:{kind:'unauthenticated'}};
  const options={pool,role:'celebix_saas_app' as const,timeouts:{poolCheckoutMs:5000,statementMs:10000,lockMs:4000,idleTransactionMs:10000}};
  const pos=createInStoreSalesHttpHandlers({resolveRuntime:async()=>({access,sales:new PostgresInStoreSalesRepository(options)} as unknown as ServerInStoreSalesRuntime),now:()=>now,requestId:randomUUID});
  const accounting=createAccountingHttpHandlers({resolveRuntime:async()=>({access,accounting:new PostgresAccountingRepository(options)} as unknown as ServerAccountingRuntime),now:()=>now,requestId:randomUUID});
  function request(path:string,body?:unknown,operationId=randomUUID(),posVersion=false) {
    return new Request(`https://${host}${path}`,{method:body===undefined?'GET':'POST',headers:{host,cookie:`__Host-celebix_panel=${credential}`,...(body===undefined?{}:{origin:`https://${host}`,'content-type':'application/json','idempotency-key':operationId}),...(posVersion?{'x-celebix-in-store-version':'3'}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  }
  async function data<T>(response:Response):Promise<T> {const payload=await response.json();assert.equal(response.status,200,JSON.stringify(payload));assert.equal(response.headers.get('cache-control'),'no-store');return payload.data as T;}
  const contact={firstName:'HTTP',lastName:'Customer',phone:'+905551234567',email:null};
  const customer=await data<InStorePosCustomerResult>(await pos.createCustomer(request('/api/orders/in-store/customers',contact,randomUUID(),true)));
  const search=await data<{customers:InStorePosCustomer[]}>(await pos.searchCustomers(request('/api/orders/in-store/customers?query=HTTP&limit=20',undefined,randomUUID(),true)));
  assert.equal(search.customers[0].id,customer.customer.id);
  const bootstrap=await data<InStoreBootstrap>(await pos.bootstrap(request('/api/orders/in-store/bootstrap',undefined,randomUUID(),true)));
  assert.equal(bootstrap.locations[0].id,location);
  const products=await data<{products:InStoreProduct[]}>(await pos.searchProducts(request(`/api/orders/in-store/products?locationId=${location}&barcode=2010098765432&limit=20`,undefined,randomUUID(),true)));
  assert.equal(products.products[0].variantId,variant);
  const saleId=randomUUID(),intent={locationId:location,items:[{variantId:variant,quantity:1,unitPriceOverrideCents:null}],discount:null,customerName:null,note:null,paymentMethod:'cash',customerId:search.customers[0].id,initialCollectionCents:500000,dueDate:'2026-11-01'};
  const draft=await data<InStoreSaleResult>(await pos.createSale(request('/api/orders/in-store/sales',{saleId,intent},randomUUID(),true)));
  assert.equal(draft.sale.totals.totalCents,1100000);
  const prepared=await data<InStoreSaleResult>(await pos.prepareSale(request(`/api/orders/in-store/sales/${saleId}/prepare`,{expectedVersion:draft.sale.version,expectedTotalCents:1100000},randomUUID(),true),saleId));
  const confirmed=await data<InStoreSaleResult>(await pos.confirmPayment(request(`/api/orders/in-store/sales/${saleId}/payment`,{expectedVersion:prepared.sale.version,slipReference:'HTTP receipt',paymentMethod:null},randomUUID(),true),saleId));
  const completeOp=randomUUID(),completeBody={expectedVersion:confirmed.sale.version};
  const completed=await data<InStoreSaleResult>(await pos.completeSale(request(`/api/orders/in-store/sales/${saleId}/complete`,completeBody,completeOp,true),saleId));
  assert.equal(completed.sale.finance?.dueCents,600000);assert.equal(completed.sale.finance?.collectedCents,500000);assert.equal(completed.sale.status,'completed');
  assert.equal((await data<InStoreSaleResult>(await pos.completeSale(request(`/api/orders/in-store/sales/${saleId}/complete`,completeBody,completeOp,true),saleId))).replayed,true);
  const orderId=completed.sale.orderId!;
  for(const [amountCents,dueCents]of [[200000,400000],[400000,0]]) {
    const preview=await data<AccountingCollectionPreview>(await accounting.preview(request(`/api/accounting/collection-preview?customerId=${customer.customer.id}&orderId=${orderId}&currency=TRY&amountCents=${amountCents}`)));
    assert.equal(preview.allocations.length,1);assert.equal(preview.allocations[0].orderId,orderId);assert.equal(preview.allocations[0].amountCents,amountCents);
    const operationId=randomUUID(),body={customerId:customer.customer.id,orderId,amountCents,currency:'TRY',paymentMethod:'cash',accountId:null,expectedVersion:preview.version,note:null};
    const receipt=await data<AccountingMutationResult>(await accounting.mutate(request('/api/accounting/collections',body,operationId),'collect'));
    assert.equal(receipt.customerAccount?.dueCents,dueCents);assert.deepEqual(receipt.event?.allocations,preview.allocations);
    const replay=await data<AccountingMutationResult>(await accounting.mutate(request('/api/accounting/collections',body,operationId),'collect'));
    assert.equal(replay.replayed,true);assert.equal(replay.event?.id,receipt.event?.id);
  }
  const finance=await data<AccountingOrderFinance>(await accounting.order(request(`/api/accounting/orders/${orderId}`),orderId));
  assert.equal(finance.status,'paid');assert.equal(finance.collectedCents,1100000);assert.equal(finance.dueCents,0);assert.equal(finance.receipts.length,3);
  const customerAccount=await data<AccountingCustomerAccount>(await accounting.customer(request(`/api/accounting/customers/${customer.customer.id}`),customer.customer.id));assert.equal(customerAccount.dueCents,0);
  const order=(await pool.query('SELECT total_cents,payment_status,status FROM saas.orders WHERE store_id=$1 AND id=$2',[store,orderId])).rows[0];assert.equal(Number(order.total_cents),1100000);assert.equal(order.payment_status,'completed');assert.equal(order.status,'delivered');
  assert.equal(Number((await pool.query("SELECT count(*) FROM saas.inventory_movements WHERE store_id=$1 AND source_kind='in_store_sale'",[store])).rows[0].count),1);assert.equal(Number((await pool.query('SELECT stock_quantity FROM saas.product_variants WHERE id=$1',[variant])).rows[0].stock_quantity),9);
  console.log('PASS HTTP customer create/select, 11000/5000 sale prepare/confirm/complete, FIFO preview, 2000/4000 idempotent collections, paid projection and stock once');
  const zeroId=randomUUID();
  const zeroDraft=await data<InStoreSaleResult>(await pos.createSale(request('/api/orders/in-store/sales',{saleId:zeroId,intent:{...intent,initialCollectionCents:0,paymentMethod:null}},randomUUID(),true)));
  const zeroPrepared=await data<InStoreSaleResult>(await pos.prepareSale(request(`/api/orders/in-store/sales/${zeroId}/prepare`,{expectedVersion:zeroDraft.sale.version,expectedTotalCents:1100000},randomUUID(),true),zeroId));
  const zeroOp=randomUUID(),zeroBody={expectedVersion:zeroPrepared.sale.version};
  const zero=await data<InStoreSaleResult>(await pos.completeSale(request(`/api/orders/in-store/sales/${zeroId}/complete`,zeroBody,zeroOp,true),zeroId));
  assert.equal(zero.sale.finance?.status,'unpaid');assert.equal(zero.sale.finance?.collectedCents,0);assert.equal(zero.sale.finance?.dueCents,1100000);assert.deepEqual(zero.sale.finance?.receipts,[]);assert.equal(zero.sale.paymentReceivedAt,null);
  assert.equal((await data<InStoreSaleResult>(await pos.completeSale(request(`/api/orders/in-store/sales/${zeroId}/complete`,zeroBody,zeroOp,true),zeroId))).replayed,true);
  assert.equal(Number((await pool.query('SELECT count(*) FROM saas.in_store_payment_attestations WHERE store_id=$1 AND sale_id=$2',[store,zeroId])).rows[0].count),0);
  assert.equal(Number((await pool.query("SELECT count(*) FROM saas.inventory_movements WHERE store_id=$1 AND source_kind='in_store_sale'",[store])).rows[0].count),2);assert.equal(Number((await pool.query('SELECT stock_quantity FROM saas.product_variants WHERE id=$1',[variant])).rows[0].stock_quantity),8);
  for(const table of ['payment_attempts','checkout_payment_attempts','storefront_accounts'])assert.equal(Number((await pool.query(`SELECT count(*) FROM saas.${table} WHERE store_id=$1`,[store])).rows[0].count),0);
  console.log('PASS HTTP zero-credit sale completes without receipt, replay consumes stock once, and POS creates no provider attempt or storefront login');
  console.log('ACCOUNTING_HTTP_POSTGRESQL16_COMPLETE 2/2');
} finally {await pool?.end();fixture.stop();}
