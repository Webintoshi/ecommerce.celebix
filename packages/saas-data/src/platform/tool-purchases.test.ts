import assert from 'node:assert/strict';
import test from 'node:test';
import {PostgresPlatformToolPurchasesRepository,PlatformToolPurchaseError} from './tool-purchases.ts';

const operatorId='10000000-0000-4000-8000-000000000001',purchaseId='20000000-0000-4000-8000-000000000001',storeId='30000000-0000-4000-8000-000000000001';
const timeouts={poolCheckoutMs:100,statementMs:100,lockMs:100,idleTransactionMs:100};
const receipt={storeId,amountCents:118800,method:'bank_transfer' as const,reference:'Dekont 42',reason:'Banka hesabına gelen ödeme doğrulandı.'};
const purchase={id:purchaseId,storeId,storeName:'Test mağaza',offerId:'contact_widget',offerName:'İletişim balonu',status:'settled',version:2,createdAt:'2026-10-22T12:00:00.000Z',netCents:99000,vatBps:2000,vatCents:19800,totalCents:118800,currency:'TRY',toolKeys:['contact_widget'],settledAt:'2026-10-22T12:10:00.000Z',receipt:{method:'bank_transfer',reference:'Dekont 42',amountCents:118800}};
function boundary(value:unknown,failCommit=false,error?:string){const calls:{text:string;values?:unknown[]}[]=[],releases:unknown[]=[];const client={async query(text:string,values?:unknown[]){calls.push({text,values});if(text==='COMMIT'&&failCommit)throw Error('transport');if(text.startsWith('SELECT saas.platform_tool_')&&error)throw Error(error);return{rows:text.startsWith('SELECT saas.platform_tool_')?[{result:value}]:[],rowCount:1,command:'',oid:0,fields:[]};},release(destroy?:boolean|Error){releases.push(destroy);}};return{calls,releases,pool:{async connect(){return client;}}};}
function repository(b:ReturnType<typeof boundary>){return new PostgresPlatformToolPurchasesRepository({pool:b.pool,role:'celebix_saas_platform_operator',timeouts});}
test('tool purchase list uses read-only restricted operator RPC and binds returned scope',async()=>{
 const envelope={available:true,observedAt:'2026-10-22T12:00:00.000Z',items:[purchase]},b=boundary(envelope),r=repository(b);
 assert.deepEqual(await r.read(operatorId,{storeId,status:'settled'}),envelope);assert.equal(b.calls[0]?.text,'BEGIN READ ONLY');assert.ok(b.calls.some(row=>row.text==='SET LOCAL ROLE celebix_saas_platform_operator'));assert.deepEqual(b.calls.find(row=>row.text.startsWith('SELECT saas.platform_tool_purchases_read'))?.values,[operatorId,JSON.stringify({storeId,status:'settled'})]);
 const mismatch=boundary(envelope);await assert.rejects(()=>repository(mismatch).read(operatorId,{status:'pending'}),error=>error instanceof PlatformToolPurchaseError&&error.code==='unavailable');assert.equal(mismatch.calls.at(-1)?.text,'ROLLBACK');
});
test('manual verified receipt is parameterized and result must echo exact settled purchase',async()=>{
 const native={ok:true,purchase,replayed:false},b=boundary(native);assert.deepEqual(await repository(b).settle(operatorId,purchaseId,receipt,1,'receipt-42'),native);assert.deepEqual(b.calls.find(row=>row.text.startsWith('SELECT saas.platform_tool_purchase_settle'))?.values,[operatorId,purchaseId,1,'receipt-42',JSON.stringify(receipt)]);assert.equal(b.calls.at(-1)?.text,'COMMIT');
 for(const changed of [{...purchase,id:storeId},{...purchase,storeId:operatorId},{...purchase,totalCents:1},{...purchase,receipt:{...purchase.receipt,reference:'different'}}]){const invalid=boundary({...native,purchase:changed});await assert.rejects(()=>repository(invalid).settle(operatorId,purchaseId,receipt,1,'receipt-42'),error=>error instanceof PlatformToolPurchaseError&&error.code==='unavailable');assert.equal(invalid.calls.at(-1)?.text,'ROLLBACK');}
});
test('invalid identity, scope or receipt cannot acquire a database connection',async()=>{
 const b=boundary({}),r=repository(b);await assert.rejects(()=>r.read('email@example.test',{}));await assert.rejects(()=>r.read(operatorId,{paid:true} as never));await assert.rejects(()=>r.settle(operatorId,purchaseId,{...receipt,paid:true} as never,1,'receipt-42'));await assert.rejects(()=>r.settle(operatorId,purchaseId,{...receipt,reference:''},1,'receipt-42'));await assert.rejects(()=>r.settle(operatorId,purchaseId,receipt,0,'receipt-42'));assert.equal(b.calls.length,0);
});
test('unknown commit destroys connection without rerun; native business errors stay finite',async()=>{
 const b=boundary({ok:true,purchase,replayed:false},true);await assert.rejects(()=>repository(b).settle(operatorId,purchaseId,receipt,1,'receipt-42'),error=>error instanceof PlatformToolPurchaseError&&error.code==='commit_unknown');assert.equal(b.calls.filter(row=>row.text.startsWith('SELECT saas.platform_tool_purchase_settle')).length,1);assert.deepEqual(b.releases,[true]);
 for(const code of ['operator_denied','version_conflict','operation_mismatch','amount_mismatch','already_settled','receipt_used','store_inactive','already_owned','secret failure']){const fail=boundary(null,false,code);await assert.rejects(()=>repository(fail).settle(operatorId,purchaseId,receipt,1,'receipt-42'),error=>error instanceof PlatformToolPurchaseError&&error.code===(code==='secret failure'?'unavailable':code));assert.equal(fail.calls.at(-1)?.text,'ROLLBACK');}
});
