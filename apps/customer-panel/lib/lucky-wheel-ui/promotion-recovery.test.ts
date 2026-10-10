import assert from 'node:assert/strict';
import test from 'node:test';
import {createLuckyWheelPromotionApi} from './promotion-recovery.ts';
import {createPromotionDraft,updatePromotionDraft,promotionRuleDocument} from '../promotion-ui/model.ts';
import {wheelFixture,OP_ID,WHEEL_ID} from './fixtures.ts';
function storage(){const rows=new Map<string,string>();return{getItem:(k:string)=>rows.get(k)??null,setItem:(k:string,v:string)=>{rows.set(k,v)},removeItem:(k:string)=>{rows.delete(k)}}}
const draft=()=>updatePromotionDraft(createPromotionDraft('custom'),{name:'Özel çark indirimi',triggerKind:'code',codeInput:'LW-SOURCE-78000000000040008000000000000001',perCustomerUsage:null,totalUsage:null,budgetMinor:null,salesChannels:['storefront'],benefit:{kind:'fixed_amount',amountMinor:12345,currency:'TRY'},minimumBasketMinor:56789});
function receipt(body:string){const payload=JSON.parse(body);return Response.json({promotion:{id:WHEEL_ID,name:payload.name,status:'active',version:2,createdAt:wheelFixture().createdAt,updatedAt:wheelFixture().updatedAt,ruleDocument:payload.ruleDocument},replayed:false},{status:201})}
test('source creation persists before request and reload retries identical payload/key with one server record',async()=>{
 const memory=storage(),calls:RequestInit[]=[],ledger=new Map<string,string>();let loseReply=true;
 const fetcher=async(_url:unknown,init?:RequestInit)=>{calls.push(init!);assert.ok(memory.getItem('celebix.wheel.source-create.v1:fixture'));const key=new Headers(init?.headers).get('idempotency-key')!;const body=String(init?.body);if(ledger.has(key))assert.equal(ledger.get(key),body);else ledger.set(key,body);if(loseReply){loseReply=false;throw Error('lost reply')}return receipt(body)};
 const first=createLuckyWheelPromotionApi({scope:'fixture',storage:memory,fetch:fetcher as typeof fetch,randomUUID:()=>OP_ID});await assert.rejects(first.apply(draft()));assert.ok(first.hasUnresolved());
 const reloaded=createLuckyWheelPromotionApi({scope:'fixture',storage:memory,fetch:fetcher as typeof fetch,randomUUID:()=>WHEEL_ID});const recovered=await reloaded.pendingDraft();assert.ok(recovered);assert.equal(recovered.name,draft().name);assert.deepEqual(promotionRuleDocument(recovered),promotionRuleDocument(draft()));
 await assert.rejects(reloaded.apply(updatePromotionDraft(recovered,{name:'Different'})));assert.equal(calls.length,1);const result=await reloaded.apply(recovered);assert.equal(result.kind,'saved');assert.equal(calls[0].body,calls[1].body);assert.equal(new Headers(calls[1].headers).get('idempotency-key'),OP_ID);assert.equal(ledger.size,1);assert.equal(await reloaded.pendingDraft(),null);
});
test('definitive permission rejection releases recovery and permits corrected new intent',async()=>{
 const memory=storage(),calls:RequestInit[]=[];let count=0;const api=createLuckyWheelPromotionApi({scope:'fixture',storage:memory,randomUUID:()=>++count===1?OP_ID:WHEEL_ID,fetch:async(_url,init)=>{calls.push(init!);return calls.length===1?Response.json({code:'membership_denied'},{status:403}):receipt(String(init?.body))}});
 await assert.rejects(api.apply(draft()),/membership_denied/);assert.equal(api.hasUnresolved(),false);assert.equal(await api.pendingDraft(),null);await api.apply(updatePromotionDraft(draft(),{name:'Düzeltilmiş'}));assert.equal(new Headers(calls[1].headers).get('idempotency-key'),WHEEL_ID);
});
test('uncertain or malformed response retains source recovery in its own store scope',async()=>{
 const memory=storage();const first=createLuckyWheelPromotionApi({scope:'fixture',storage:memory,randomUUID:()=>OP_ID,fetch:async()=>Response.json({code:'membership_denied',extra:true},{status:403})});await assert.rejects(first.apply(draft()));assert.ok(first.hasUnresolved());
 const other=createLuckyWheelPromotionApi({scope:'other',storage:memory});assert.equal(await other.pendingDraft(),null);assert.ok(await createLuckyWheelPromotionApi({scope:'fixture',storage:memory}).pendingDraft());
});
test('unavailable browser persistence blocks source write before contacting server',async()=>{
 let writes=0;const api=createLuckyWheelPromotionApi({scope:'fixture',storage:{getItem:()=>null,setItem:()=>{throw Error('denied')},removeItem:()=>{}},randomUUID:()=>OP_ID,fetch:async()=>{writes++;return receipt('{}')}});await assert.rejects(api.apply(draft()));assert.equal(writes,0);assert.ok(api.hasUnresolved());
});
test('inline wheel creation rejects automatic sources before any ordinary active promotion can be created',async()=>{
 let calls=0;const api=createLuckyWheelPromotionApi({scope:'fixture',storage:storage(),randomUUID:()=>OP_ID,fetch:async()=>{calls++;return receipt('{}')}});await assert.rejects(api.apply(updatePromotionDraft(draft(),{triggerKind:'automatic'})),/invalid_input/);assert.equal(calls,0);
});
test('auth rejection during verification cannot discard an earlier possibly committed source request',async()=>{
 const memory=storage(),calls:RequestInit[]=[];const api=createLuckyWheelPromotionApi({scope:'fixture',storage:memory,randomUUID:()=>OP_ID,fetch:async(_url,init)=>{calls.push(init!);if(calls.length===1)throw Error('lost reply');if(calls.length===2)return Response.json({code:'unauthenticated'},{status:401});return receipt(String(init?.body))}});await assert.rejects(api.apply(draft()));await assert.rejects(api.apply((await api.pendingDraft())!),/unauthenticated/);assert.ok(api.hasUnresolved());await api.apply((await api.pendingDraft())!);assert.equal(new Set(calls.map(c=>new Headers(c.headers).get('idempotency-key'))).size,1);
});
