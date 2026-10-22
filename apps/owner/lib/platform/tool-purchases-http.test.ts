import assert from 'node:assert/strict';
import test from 'node:test';
import {handleToolPurchasesHttp} from './tool-purchases-http.ts';

const operator={operatorId:'10000000-0000-4000-8000-000000000001',principalId:'10000000-0000-4000-8000-000000000002',issuer:'https://owner.test/auth/v1',subject:'owner',email:'owner@example.test',label:'Owner',assuranceLevel:'aal2' as const};
const purchaseId='20000000-0000-4000-8000-000000000001';
const storeId='30000000-0000-4000-8000-000000000001';
const body={action:'tool.purchase.settle',expectedVersion:1,payload:{purchaseId,storeId,amountCents:118800,method:'bank_transfer',reference:'Dekont 42',reason:'Banka hesabına gelen ödeme doğrulandı.'}};
function request(value:unknown=body,options:{origin?:string;key?:string;method?:string}={}){return new Request('https://owner.test/api/platform/tool-purchases',{method:options.method??'POST',headers:{origin:options.origin??'https://owner.test','idempotency-key':options.key??'tool-receipt-42','content-type':'application/json'},body:JSON.stringify(value)});}
function dependencies(){let reads=0,writes=0;const deps={allowedOrigin:'https://owner.test',resolveOperator:async()=>({kind:'authorized',operator}),read:async(_operator:unknown,query:Record<string,unknown>)=>{reads++;assert.deepEqual(query,{status:'pending',storeId});return{available:true,items:[]};},settle:async(_operator:unknown,mutation:unknown)=>{writes++;assert.deepEqual(mutation,{...body,idempotencyKey:'tool-receipt-42'});return{outcome:'committed',version:2,result:{purchaseId}};}};return{deps,get reads(){return reads;},get writes(){return writes;}};}

test('owner tool purchase reads and settlement require verified operator authority',async()=>{
 for(const kind of ['unauthenticated','forbidden','mfa_required','unavailable']){const b=dependencies();const response=await handleToolPurchasesHttp(request(),{...b.deps,resolveOperator:async()=>({kind})});assert.equal(response.status,kind==='unavailable'?503:kind==='unauthenticated'?401:403);assert.equal(b.writes,0);assert.equal(b.reads,0);}
});
test('pending purchases are read only and only approved filters reach the repository',async()=>{
 const b=dependencies();const response=await handleToolPurchasesHttp(new Request(`https://owner.test/api/platform/tool-purchases?status=pending&storeId=${storeId}`),b.deps);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(b.reads,1);assert.equal(b.writes,0);
 for(const query of ['paid=true','status=anything',`storeId=${storeId}&storeId=${storeId}`,'storeId=not-a-store'])assert.equal((await handleToolPurchasesHttp(new Request(`https://owner.test/api/platform/tool-purchases?${query}`),b.deps)).status,400);
 assert.equal(b.reads,1);
});
test('only same-origin exact receipt input with a durable key can settle a purchase',async()=>{
 const b=dependencies();
 for(const invalid of [request(body,{origin:'https://evil.test'}),request(body,{key:''}),request({...body,expectedVersion:0}),request({...body,paid:true}),request({...body,payload:{...body.payload,paid:true}}),request({...body,payload:{...body.payload,amountCents:0}}),request({...body,payload:{...body.payload,reference:' '}}),request({...body,payload:{...body.payload,reason:' '}}),request({...body,payload:{...body.payload,method:'browser_success'}}),request({...body,payload:{...body.payload,purchaseId:'bad'}})])assert.ok((await handleToolPurchasesHttp(invalid,b.deps)).status>=400);
 assert.equal(b.writes,0);assert.equal((await handleToolPurchasesHttp(request(),b.deps)).status,200);assert.equal(b.writes,1);
});
test('receipt conflicts are finite business failures; unknown commit stays uncertain',async()=>{
 for(const [code,status] of [['version_conflict',409],['operation_mismatch',409],['amount_mismatch',422],['already_settled',409],['receipt_used',422],['store_inactive',422],['already_owned',422],['record_not_found',404],['operator_denied',403],['commit_unknown',503],['secret database failure',503]] as const){const b=dependencies();const response=await handleToolPurchasesHttp(request(),{...b.deps,settle:async()=>{throw Object.assign(new Error(code),{code});}});assert.equal(response.status,status);const data=await response.json();assert.ok(!JSON.stringify(data).includes('secret database'));assert.equal(data.code,code==='secret database failure'?'unavailable':code);}
});
