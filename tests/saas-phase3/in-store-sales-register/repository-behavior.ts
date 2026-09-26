import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Pool,type PoolClient,type QueryResult} from 'pg';
import {PostgresInStoreSalesRepository,inStoreSalesRepositoryErrorCode,type PostgresClientLike,type PostgresPoolLike} from '../../../packages/saas-data/src/index.ts';
import {parseInStoreBootstrap,parseInStoreSale,parseOrderDetail,type TenantContext} from '../../../packages/saas-contracts/src/index.ts';

// This runner requires an explicitly named disposable clone; it cannot fall back to a runtime URL.
const envPath=process.env.IN_STORE_REHEARSAL_ENV_FILE;
if(!envPath)throw new Error('IN_STORE_REHEARSAL_ENV_FILE required');
const raw=readFileSync(envPath,'utf8').split('\n').find(line=>line.startsWith('IN_STORE_REHEARSAL_DATABASE_URL='))?.split('=').slice(1).join('=').trim();
const connectionString=raw?.replace(/^(['"])(.*)\1$/,'$2');
if(!connectionString||new URL(connectionString).pathname!='/celebix_in_store_rehearsal_20260926')throw new Error('disposable clone required');
const pool=new Pool({connectionString,max:1});
const client=await pool.connect();
const NOW=new Date('2026-09-28T10:00:00.000Z');
const STORE='a1570000-0000-4000-8000-000000000001',PRINCIPAL='a1570000-0000-4000-8000-000000000002',MEMBER='a1570000-0000-4000-8000-000000000003',PLAN='a1570000-0000-4000-8000-000000000004',VARIANT='a1570000-0000-4000-8000-000000000008',SALE='a1570000-0000-4000-8000-000000000010';
const context={schemaVersion:1,requestId:'pos157-qa',principal:{id:PRINCIPAL,issuer:'https://qa.celebix.invalid',subject:'pos157'},store:{id:STORE,slug:'pos-regression-157',status:'active'},membership:{id:MEMBER,role:'store_owner',status:'active'},entitlements:{schemaVersion:1,planId:PLAN,planCode:'pos157_qa',version:1,status:'active',features:['orders','catalog'],limits:{products:100,staff:5,storageBytes:1024},validFrom:'2026-09-25T10:00:00.000Z'},locale:'tr-TR'} as TenantContext;
const authority={tenantContext:context,now:NOW};
// Savepoint boundaries retain repository transaction commands and real PostgreSQL role changes
// while keeping every QA fixture inside one outer transaction that is always rolled back.
class ScopedClient implements PostgresClientLike{
 constructor(private readonly client:PoolClient){}
 async query(text:string,values?:unknown[]):Promise<QueryResult<Record<string,unknown>>>{
  if(text.startsWith('BEGIN'))return this.client.query('SAVEPOINT pos_repository_call');
  if(text==='COMMIT')return this.client.query('RELEASE SAVEPOINT pos_repository_call');
  if(text==='ROLLBACK'){await this.client.query('ROLLBACK TO SAVEPOINT pos_repository_call');return this.client.query('RELEASE SAVEPOINT pos_repository_call');}
  return this.client.query(text,values);
 }
 release(){}
}
const scopedPool:PostgresPoolLike={connect:async()=>new ScopedClient(client)};
const repo=new PostgresInStoreSalesRepository({pool:scopedPool,role:'celebix_saas_app',timeouts:{poolCheckoutMs:1000,statementMs:10000,lockMs:1000,idleTransactionMs:10000}});
try{
 await client.query('BEGIN');
 await client.query('SET LOCAL ROLE celebix_saas_owner');
 const fixture=readFileSync(new URL('./behavior.sql',import.meta.url),'utf8').replace(/^BEGIN;$/m,'').replace(/^ROLLBACK;$/m,'');
 await client.query(fixture);
 const down=readFileSync(new URL('../../../apps/owner/scripts/sql/saas/202609260157_in_store_sales_register.down.sql',import.meta.url),'utf8');
 const guard=down.slice(down.indexOf('DO $guard$'),down.indexOf('$guard$;')+'$guard$;'.length);
 await client.query('SAVEPOINT rollback_guard');
 await assert.rejects(()=>client.query(guard),error=>error instanceof Error&&error.message==='IN_STORE_ROLLBACK_DURABLE_DATA_PRESENT');
 await client.query('ROLLBACK TO SAVEPOINT rollback_guard');
 const bootstrap=await repo.bootstrap(authority);parseInStoreBootstrap(bootstrap);assert.equal(bootstrap.permissions.canSell,true);
 const sale=await repo.getSale({...authority,saleId:SALE});parseInStoreSale(sale);assert.equal(sale.orderId,null);assert.equal(sale.status,'completed');
 const locationId=bootstrap.locations.find(location=>location.isDefault)!.id;
 const products=await repo.searchProducts({...authority,locationId,barcode:'0000012345678',limit:20});assert.equal(products.products.length,1);assert.equal(products.products[0]!.barcode,'0000012345678');
 const page=await repo.listSales({...authority,status:'completed',pageSize:1});assert.equal(page.sales.length,1);assert.ok(page.nextCursor);
 const next=await repo.listSales({...authority,status:'completed',pageSize:1,cursor:page.nextCursor!});assert.equal(next.sales.length,1);assert.notEqual(next.sales[0]!.id,page.sales[0]!.id);
 const staff=await repo.listStaff(authority);assert.equal(staff.staff.length,1);
 await client.query('SET LOCAL ROLE celebix_saas_owner');
 await client.query("SELECT set_config('saas.inventory.source_marker','catalog_adjustment',true),set_config('saas.inventory.source_id','a1570000-0000-4000-8000-000000000080',true),set_config('saas.inventory.source_time',$1,true)",[NOW.toISOString()]);
 await client.query('UPDATE saas.product_variants SET stock_quantity=3,version=version+1,updated_at=$1 WHERE store_id=$2 AND id=$3',[NOW,STORE,VARIANT]);
 const saleId='a1570000-0000-4000-8000-000000000081',operationId='a1570000-0000-4000-8000-000000000082';
 const intent={locationId,items:[{variantId:VARIANT,quantity:1}],discount:{kind:'fixed_amount' as const,amountCents:1500},customerName:null,note:null};
 const created=await repo.createSale({...authority,operationId,saleId,intent});assert.equal(created.sale.totals.totalCents,9500);
 const recovered=await repo.getOperation({...authority,operationId});assert.equal(recovered!.sale.id,saleId);assert.equal(recovered!.replayed,true);
 const retry=await repo.createSale({...authority,operationId,saleId,intent});assert.equal(retry.replayed,true);
 const prepared=await repo.prepareSale({...authority,operationId:'a1570000-0000-4000-8000-000000000083',saleId,expectedVersion:1,expectedTotalCents:9500});assert.equal(prepared.sale.status,'payment_pending');
 const paid=await repo.confirmPayment({...authority,operationId:'a1570000-0000-4000-8000-000000000084',saleId,expectedVersion:2,slipReference:null});assert.equal(paid.sale.status,'payment_received');
 await assert.rejects(()=>repo.cancelSale({...authority,operationId:'a1570000-0000-4000-8000-000000000085',saleId,expectedVersion:3,confirmUnpaid:true}),error=>inStoreSalesRepositoryErrorCode(error)==='invalid_transition');
 await client.query('SET LOCAL ROLE celebix_saas_owner');
 await client.query(`CREATE FUNCTION pg_temp.pos157_fail_completion() RETURNS trigger LANGUAGE plpgsql AS $fn$ BEGIN IF NEW.store_id='a1570000-0000-4000-8000-000000000001'::uuid THEN RAISE EXCEPTION 'POS157_INJECTED_FINALIZATION_FAILURE';END IF;RETURN NEW;END $fn$`);
 await client.query('CREATE TRIGGER pos157_qa_completion_failure BEFORE INSERT ON saas.orders FOR EACH ROW EXECUTE FUNCTION pg_temp.pos157_fail_completion()');
 await assert.rejects(()=>repo.completeSale({...authority,operationId:'a1570000-0000-4000-8000-000000000086',saleId,expectedVersion:3}),error=>inStoreSalesRepositoryErrorCode(error)==='unavailable');
 assert.equal((await repo.getSale({...authority,saleId})).status,'payment_received');
 await client.query('SET LOCAL ROLE celebix_saas_owner');
 const attestation=await client.query('SELECT count(*)::integer AS count FROM saas.in_store_payment_attestations WHERE store_id=$1 AND sale_id=$2',[STORE,saleId]);assert.equal(attestation.rows[0]!.count,1);
 await client.query('DROP TRIGGER pos157_qa_completion_failure ON saas.orders');
 const completed=await repo.completeSale({...authority,operationId:'a1570000-0000-4000-8000-000000000086',saleId,expectedVersion:3});assert.equal(completed.sale.status,'completed');assert.ok(completed.sale.orderId);
 const replay=await repo.completeSale({...authority,operationId:'a1570000-0000-4000-8000-000000000086',saleId,expectedVersion:3});assert.equal(replay.sale.orderId,completed.sale.orderId);assert.equal(replay.replayed,true);
 await client.query('SET LOCAL ROLE celebix_saas_owner');
 const detailPayload=await client.query('SELECT saas.orders_detail_projection($1,$2) AS detail',[STORE,completed.sale.orderId]);
 const detail=parseOrderDetail(detailPayload.rows[0]!.detail);assert.equal(detail.source,'in_store');assert.equal(detail.customerEmail,null);assert.equal(detail.shippingAddress,null);
 console.log('POS157 real PostgreSQL repository behavior passed: bootstrap/search/pagination/staff/create/recovery/prepare/attest/complete/replay');
}finally{
 await client.query('ROLLBACK');client.release();await pool.end();
}
