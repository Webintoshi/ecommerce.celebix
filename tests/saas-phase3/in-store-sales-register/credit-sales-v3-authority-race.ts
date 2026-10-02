import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Pool} from 'pg';
import type {TenantContext} from '@celebix/saas-contracts';
import {PostgresInStoreSalesRepository} from '../../../packages/saas-data/src/in-store-sales/repository.ts';
import {startAccountingFixture} from '../accounting-ledger/fixture.mjs';

const fixture=startAccountingFixture(185);
let pool:Pool|undefined;
try {
 fixture.apply('202610020200_accounting_ledger.up.sql');
 const migration=readFileSync(new URL('../../../apps/owner/scripts/sql/saas/202610020201_in_store_credit_sales.up.sql',import.meta.url),'utf8');
 const recheck=/ -- Lock durable authority and recheck after any wait on the store writer lock\.\n(?: PERFORM 1 FROM [^\n]+\n)+ err:=[^\n]+\n IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;\n/g;
 if(process.argv.includes('--baseline'))assert.equal([...migration.matchAll(recheck)].length,3,'baseline removes exactly the three new durable authority rechecks');
 fixture.sql(process.argv.includes('--baseline')?migration.replace(recheck,''):migration);
 fixture.sql(readFileSync(new URL('./credit-sales-v3.sql',import.meta.url),'utf8').replace(/ROLLBACK;\s*$/,'COMMIT;'));
 pool=new Pool({...fixture.connection,max:5});
 const qaPool=pool;
 const store='a2010000-0000-4000-8000-000000000001';
 const owner='a2010000-0000-4000-8000-000000000003';
 const cashier='a2010000-0000-4000-8000-000000000040';
 const plan='a2010000-0000-4000-8000-000000000004';
 const now=new Date('2026-10-02T14:00:00.000Z');
 const location=(await qaPool.query('SELECT id FROM saas.inventory_locations WHERE store_id=$1 AND is_default',[store])).rows[0].id;
 const authority=(manager=false)=>({tenantContext:{schemaVersion:1,requestId:randomUUID(),principal:{id:manager?'a2010000-0000-4000-8000-000000000002':'a2010000-0000-4000-8000-000000000041',issuer:'https://qa.celebix.invalid',subject:manager?'pos201':'pos201_cashier'},store:{id:store,slug:'pos-credit-regression-201',status:'active'},membership:{id:manager?owner:cashier,role:manager?'store_owner':'cashier',status:'active'},entitlements:{schemaVersion:1,planId:plan,planCode:'pos201_qa',version:1,status:'active',features:['orders','catalog'],limits:{products:100,staff:5,storageBytes:1024},validFrom:'2026-10-01T00:00:00.000Z'},locale:'tr-TR'} as TenantContext,now,contractVersion:3 as const});
 let workerPid:number|null=null;
 const trackedPool={async connect(){const client=await qaPool.connect();workerPid=Number((await client.query('SELECT pg_backend_pid() pid')).rows[0].pid);return client;}};
 const repository=new PostgresInStoreSalesRepository({pool:trackedPool,role:'celebix_saas_app',timeouts:{poolCheckoutMs:5000,statementMs:10000,lockMs:5000,idleTransactionMs:10000}});
 const denied=(error:unknown)=>error instanceof Error&&'code'in error&&error.code==='membership_denied';

 async function queuedRevoke(member:string,operationId:string,run:()=>Promise<unknown>) {
  const blocker=await qaPool.connect();
  workerPid=null;
  let pending:Promise<PromiseSettledResult<unknown>>|undefined;
  try {
   await blocker.query('BEGIN');
   await blocker.query("SELECT pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||$1::text,0))",[store]);
   pending=run().then(value=>({status:'fulfilled' as const,value}),reason=>({status:'rejected' as const,reason}));
   let waiting=false;
   for(let attempt=0;attempt<100;attempt++){
    if(workerPid!==null){const state=await qaPool.query("SELECT wait_event_type,wait_event FROM pg_stat_activity WHERE pid=$1",[workerPid]);waiting=state.rows[0]?.wait_event_type==='Lock'&&state.rows[0]?.wait_event==='advisory';}
    if(waiting)break;
    await new Promise(resolve=>setTimeout(resolve,20));
   }
   assert.equal(waiting,true,'app writer must be queued on the store lock before authority is revoked');
   await qaPool.query("UPDATE saas.memberships SET status='revoked' WHERE id=$1",[member]);
   await blocker.query('COMMIT');
   const result=await pending;
   assert.equal(result.status,'rejected','a queued writer must recheck durable membership after its wait');
   if(result.status==='rejected')assert.equal(denied(result.reason),true,String(result.reason));
   assert.equal((await qaPool.query('SELECT count(*)::integer count FROM saas.in_store_operations WHERE operation_id=$1',[operationId])).rows[0].count,0,'denied queued writer must not create an idempotency record');
  } finally {
   await blocker.query('ROLLBACK');blocker.release();
   if(pending)await pending;
   await qaPool.query("UPDATE saas.memberships SET status='active' WHERE id=$1",[member]);
  }
 }

 const customerOp=randomUUID();
 await queuedRevoke(cashier,customerOp,()=>repository.createCustomer({...authority(),operationId:customerOp,intent:{firstName:'Queued',lastName:'Customer',phone:'+905559990001',email:null}}));
 assert.equal((await qaPool.query("SELECT count(*)::integer count FROM saas.customers WHERE store_id=$1 AND phone='+905559990001'",[store])).rows[0].count,0);
 console.log('PASS revoked cashier queued on CRM creation is denied without creating a customer or operation');

 const saleId=randomUUID(),saleOp=randomUUID();
 await queuedRevoke(cashier,saleOp,()=>repository.createSale({...authority(),operationId:saleOp,saleId,intent:{locationId:location,items:[],discount:null,customerName:null,note:null,paymentMethod:'cash',customerId:null,initialCollectionCents:null,dueDate:null}}));
 assert.equal((await qaPool.query('SELECT count(*)::integer count FROM saas.in_store_sales WHERE id=$1',[saleId])).rows[0].count,0);
 console.log('PASS revoked cashier queued on a V3 sale write is denied without creating sale or stock evidence');

 const grant=(await qaPool.query('SELECT to_jsonb(g) snapshot FROM saas.in_store_staff_grants g WHERE membership_id=$1',[cashier])).rows[0].snapshot;
 const staffOp=randomUUID();
 await queuedRevoke(owner,staffOp,()=>repository.setStaffGrant({...authority(true),operationId:staffOp,membershipId:cashier,expectedVersion:Number(grant.version),enabled:true,locationIds:[location],discountLimitBps:0,canEditPrice:false,canSellOnCredit:true,canCollectReceivables:true}));
 assert.deepEqual((await qaPool.query('SELECT to_jsonb(g) snapshot FROM saas.in_store_staff_grants g WHERE membership_id=$1',[cashier])).rows[0].snapshot,grant);
 console.log('PASS revoked manager queued on staff write cannot grant credit or collection authority');
 console.log('CREDIT_SALES_V3_AUTHORITY_RACE_COMPLETE 3/3');
} finally {await pool?.end();fixture.stop();}
