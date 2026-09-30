import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Pool,type PoolClient,type QueryResult} from 'pg';
import {PostgresInStoreSalesRepository,inStoreSalesRepositoryErrorCode,type PostgresClientLike,type PostgresPoolLike} from '../../../packages/saas-data/src/index.ts';
import type {TenantContext} from '../../../packages/saas-contracts/src/index.ts';

// A named disposable database is mandatory. No runtime credential or URL fallback.
const connectionString=process.env.IN_STORE_V2_NATIVE_DATABASE_URL;
if(!connectionString)throw new Error('IN_STORE_V2_NATIVE_DATABASE_URL required');
const url=new URL(connectionString);
if(url.pathname!='/celebix_pos_v2_20260930'||url.hostname!=='localhost'||!url.searchParams.get('host')?.startsWith('/Users/Celebix/.codex/tmp/'))throw new Error('isolated POS v2 clone required');
const pool=new Pool({connectionString,max:1});const client=await pool.connect();
class ScopedClient implements PostgresClientLike {
 constructor(private readonly client:PoolClient){}
 async query(text:string,values?:unknown[]):Promise<QueryResult<Record<string,unknown>>>{
  if(text.startsWith('BEGIN'))return this.client.query('SAVEPOINT pos_v2_repository_call');
  if(text==='COMMIT')return this.client.query('RELEASE SAVEPOINT pos_v2_repository_call');
  if(text==='ROLLBACK'){await this.client.query('ROLLBACK TO SAVEPOINT pos_v2_repository_call');return this.client.query('RELEASE SAVEPOINT pos_v2_repository_call');}
  return this.client.query(text,values);
 }
 release(){}
}
const scopedPool:PostgresPoolLike={connect:async()=>new ScopedClient(client)};
const repository=new PostgresInStoreSalesRepository({pool:scopedPool,role:'celebix_saas_app',timeouts:{poolCheckoutMs:1000,statementMs:10000,lockMs:1000,idleTransactionMs:10000}});
const STORE='a1840000-0000-4000-8000-000000000001',PRINCIPAL='a1840000-0000-4000-8000-000000000002',MEMBER='a1840000-0000-4000-8000-000000000003',PLAN='a1840000-0000-4000-8000-000000000004',VARIANT='a1840000-0000-4000-8000-000000000008';
const SALE='a1840000-0000-4000-8000-000000000080';
const tenantContext={schemaVersion:1,requestId:'pos184-native',principal:{id:PRINCIPAL,issuer:'https://qa.celebix.invalid',subject:'pos184'},store:{id:STORE,slug:'pos-regression-184',status:'active'},membership:{id:MEMBER,role:'store_owner',status:'active'},entitlements:{schemaVersion:1,planId:PLAN,planCode:'pos184_qa',version:1,status:'active',features:['orders','catalog'],limits:{products:100,staff:5,storageBytes:1024},validFrom:'2026-09-25T10:00:00.000Z'},locale:'tr-TR'} as TenantContext;
const authority={tenantContext,now:new Date('2026-09-26T10:00:00.000Z'),contractVersion:2 as const};
const op=(n:number)=>`a1840000-0000-4000-8000-${String(n).padStart(12,'0')}`;
try {
 await client.query('BEGIN');await client.query('SET LOCAL ROLE celebix_saas_owner');
 const fixture=readFileSync(new URL('./price-payment-v2.sql',import.meta.url),'utf8').replace(/^BEGIN;$/m,'').replace(/^ROLLBACK;$/m,'');
 await client.query(fixture);
 const bootstrap=await repository.bootstrap(authority);
 assert.equal(bootstrap.permissions.canEditPrice,true);
 const locationId=bootstrap.locations.find(l=>l.isDefault)!.id;
 const intent={locationId,items:[{variantId:VARIANT,quantity:1,unitPriceOverrideCents:12000}],discount:null,customerName:null,note:null,paymentMethod:'cash' as const};
 const created=await repository.createSale({...authority,saleId:SALE,operationId:op(81),intent});
 assert.equal(created.sale.paymentMethod,'cash');assert.equal(created.sale.items[0]?.catalogUnitPriceCents,11000);assert.equal(created.sale.items[0]?.priceOverrideActorMembershipId,MEMBER);
 const updated=await repository.updateSale({...authority,saleId:SALE,operationId:op(82),expectedVersion:1,intent:{...intent,items:[{...intent.items[0]!,quantity:2}],paymentMethod:'card'}});
 assert.equal(updated.sale.totals.totalCents,24000);assert.equal(updated.sale.items[0]?.unitPriceOverrideCents,12000);
 const held=await repository.holdSale({...authority,saleId:SALE,operationId:op(83),expectedVersion:2,held:true});assert.equal(held.sale.status,'held');
 const refreshed=await repository.getSale({...authority,saleId:SALE});assert.equal(refreshed.items[0]?.unitPriceOverrideCents,12000);assert.equal(refreshed.paymentMethod,'card');
 const page=await repository.listSales({...authority,status:'held',pageSize:50});assert.equal(page.sales.find(s=>s.id===SALE)?.paymentMethod,'card');
 const v1={tenantContext,now:authority.now};
 await assert.rejects(()=>repository.holdSale({...v1,saleId:SALE,operationId:op(84),expectedVersion:3,held:false}),e=>inStoreSalesRepositoryErrorCode(e)==='client_upgrade_required');
 const prepared=await repository.prepareSale({...authority,saleId:SALE,operationId:op(85),expectedVersion:3,expectedTotalCents:24000});assert.equal(prepared.sale.status,'payment_pending');
 await assert.rejects(()=>repository.confirmPayment({...authority,saleId:SALE,operationId:op(86),expectedVersion:4,slipReference:null,paymentMethod:'cash'}),e=>inStoreSalesRepositoryErrorCode(e)==='invalid_transition');
 const paid=await repository.confirmPayment({...authority,saleId:SALE,operationId:op(87),expectedVersion:4,slipReference:null,paymentMethod:null});assert.equal(paid.sale.status,'payment_received');
 const completed=await repository.completeSale({...authority,saleId:SALE,operationId:op(88),expectedVersion:5});assert.equal(completed.sale.status,'completed');assert.match(completed.sale.orderNumber!,/^POS-\d+$/);
 const retried=await repository.completeSale({...authority,saleId:SALE,operationId:op(88),expectedVersion:5});assert.equal(retried.replayed,true);assert.deepEqual(retried.sale,completed.sale);
 const recovered=await repository.getOperation({...authority,operationId:op(88)});assert.equal(recovered?.replayed,true);assert.deepEqual(recovered?.sale,completed.sale);
 const legacy=await repository.getOperation({...authority,operationId:op(45)});assert.equal(legacy?.sale.paymentMethod,null);assert.equal(legacy?.sale.items[0]?.catalogUnitPriceCents,10000);
 const oldRead=await repository.getSale({...v1,saleId:SALE});assert.equal(Object.hasOwn(oldRead,'paymentMethod'),false);assert.equal(Object.hasOwn(oldRead.items[0]!,'catalogUnitPriceCents'),false);
 await client.query('SET LOCAL ROLE celebix_saas_owner');
 const stock=await client.query('SELECT stock_quantity FROM saas.product_variants WHERE store_id=$1 AND id=$2',[STORE,VARIANT]);assert.equal(Number(stock.rows[0]!.stock_quantity),0);
 const moves=await client.query("SELECT count(*) FROM saas.inventory_movements WHERE store_id=$1 AND source_kind='in_store_sale' AND source_id=$2",[STORE,SALE]);assert.equal(Number(moves.rows[0]!.count),1);
 const snapshots=await client.query("SELECT provenance FROM saas.in_store_price_snapshots WHERE store_id=$1 AND sale_id=$2",[STORE,SALE]);assert.equal(snapshots.rows[0]!.provenance.catalogUnitPriceCents,11000);assert.equal(snapshots.rows[0]!.provenance.appliedUnitPriceCents,12000);
 const down=readFileSync(new URL('../../../apps/owner/scripts/sql/saas/202609300184_in_store_sale_price_payment_v2.down.sql',import.meta.url),'utf8');
 await client.query('SAVEPOINT v2_down_guard');await assert.rejects(()=>client.query(down.slice(down.indexOf('DO $guard$'),down.indexOf('$guard$;')+8)),e=>e instanceof Error&&e.message==='IN_STORE_V2_ROLLBACK_DURABLE_DATA_PRESENT');await client.query('ROLLBACK TO SAVEPOINT v2_down_guard');
 console.log('POS v2 native SQL and repository: authority, price/payment persistence, freeze, legacy replay, one stock movement, POS numbering and rollback guard passed.');
} finally {await client.query('ROLLBACK');client.release();await pool.end();}
