import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import test from 'node:test';
import {COMMERCIAL_PACKAGES,type TenantContext} from '@celebix/saas-contracts';
import {createPostgresPlatformCommerceRepository,parsePlatformCheckoutIntent} from './repository.ts';
const ID='11111111-1111-4111-8111-111111111111',OP='22222222-2222-4222-8222-222222222222',ORDER='33333333-3333-4333-8333-333333333333',NOW=new Date('2026-10-26T12:00:00Z');
const KEY=new Uint8Array(32).fill(7),PLAN=COMMERCIAL_PACKAGES[0]!;
const context={schemaVersion:1,requestId:'test',principal:{id:ID,issuer:'https://auth.test/oidc',subject:'test'},store:{id:ID,slug:'test',status:'active'},membership:{id:ID,role:'store_owner',status:'active'},entitlements:{schemaVersion:1,planId:PLAN.id,planCode:PLAN.code,version:PLAN.version,status:'active',features:['orders','catalog'],limits:{products:100,staff:1,storageBytes:1000},validFrom:'2026-01-01T00:00:00.000Z'},locale:'tr-TR'} as TenantContext;
const intent={kind:'tool' as const,offerId:'restock',term:'once' as const,operationId:OP};
function setup(options:{outcome?:string;loseCommit?:boolean;foreign?:boolean;credit?:boolean;testCredit?:boolean}={}){
 const queries:{text:string;values?:unknown[]}[]=[],released:unknown[]=[];let connections=0;
 const client={async query(text:string,values?:unknown[]){queries.push({text,values});if(text==='COMMIT'&&options.loseCommit)throw Error('private transport');return{rows:text.includes('saas.platform_checkout_create')?[{outcome:options.outcome??'created',result_payload:{orderId:ORDER,storeId:options.foreign?OP:ID,kind:options.credit?'toshi_credit':'tool',offerId:options.testCredit?'toshi-test-1':options.credit?'toshi-500':'restock',term:'once',netCents:options.testCredit?83:options.credit?24900:99000,vatBps:2000,vatCents:options.testCredit?17:options.credit?4980:19800,totalCents:options.testCredit?100:options.credit?29880:118800,currency:'TRY'}}]:[],rowCount:1,command:'SELECT',oid:0,fields:[]};},release(value?:unknown){released.push(value);}};
 const repository=createPostgresPlatformCommerceRepository({pool:{connect:async()=>{connections++;return client;}},handoffKey:KEY,timeouts:{poolCheckoutMs:100,statementMs:200,lockMs:100,idleTransactionMs:200}});
 return{repository,queries,released,connections:()=>connections};
}
test('checkout uses trusted seven-field native authority and deterministic UTF8 handoff digest',async()=>{
 const s=setup(),result=await s.repository.createCheckout({tenantContext:context,now:NOW,intent});
 const canonical={kind:'tool',offerId:'restock',term:'once'};
 const handoff=createHmac('sha256',KEY).update(`platform-commerce:v1:${ID}:${ID}:${OP}:${JSON.stringify(canonical)}`).digest('base64url');
 assert.deepEqual(result,{orderId:ORDER,handoff,checkoutUrl:'https://celebix.net/api/platform-checkout/handoff'});
 const call=s.queries.find(q=>q.text.includes('saas.platform_checkout_create'))!;
 assert.deepEqual(call.values,[ID,ID,ID,PLAN.id,PLAN.code,PLAN.version,NOW,OP,JSON.stringify(canonical),createHash('sha256').update(handoff,'utf8').digest('hex')]);
 assert.ok(s.queries.some(q=>q.text==='SET LOCAL ROLE celebix_saas_app'));assert.equal(s.queries.at(-1)?.text,'COMMIT');
 assert.ok(!JSON.stringify(call.values).includes(handoff));
 const replay=setup({outcome:'operation_replayed'});assert.deepEqual(await replay.repository.createCheckout({tenantContext:context,now:NOW,intent}),result);
});
test('browser authority and price fields never enter the database and roles are restricted',async()=>{
 const s=setup();for(const selected of [{...intent,totalCents:1},{...intent,storeId:OP},{...intent,term:'monthly'},{...intent,offerId:'invented'}])await assert.rejects(()=>s.repository.createCheckout({tenantContext:context,now:NOW,intent:selected as never}));
 await assert.rejects(()=>s.repository.createCheckout({tenantContext:{...context,membership:{...context.membership,role:'editor'}},now:NOW,intent}));
 await assert.rejects(()=>s.repository.createCheckout({tenantContext:{...context,membership:{...context.membership,role:'admin'}},now:NOW,intent:{kind:'package',offerId:COMMERCIAL_PACKAGES[1]!.id,term:'annual',operationId:OP}}));
 assert.equal(s.connections(),0);
});
test('native conflicts are safe and cross-store receipts cannot commit',async()=>{
 for(const outcome of ['already_owned','purchase_pending','already_covered','operation_mismatch','checkout_expired']){const s=setup({outcome});await assert.rejects(()=>s.repository.createCheckout({tenantContext:context,now:NOW,intent}),error=>(error as {code?:string}).code===outcome);assert.equal(s.queries.at(-1)?.text,'ROLLBACK');}
 const s=setup({foreign:true});await assert.rejects(()=>s.repository.createCheckout({tenantContext:context,now:NOW,intent}));assert.equal(s.queries.at(-1)?.text,'ROLLBACK');
});
test('ambiguous commit preserves one native call and never returns a handoff',async()=>{const s=setup({loseCommit:true});await assert.rejects(()=>s.repository.createCheckout({tenantContext:context,now:NOW,intent}),error=>(error as {code?:string}).code==='commit_unknown');assert.equal(s.queries.filter(q=>q.text.includes('saas.platform_checkout_create')).length,1);assert.deepEqual(s.released,[true]);});

test('credit offers use once-only checkout and owner or admin authority without client pricing',async()=>{
 const selected={kind:'toshi_credit' as const,offerId:'toshi-500',term:'once' as const,operationId:OP};
 assert.deepEqual(parsePlatformCheckoutIntent(selected),selected);
 for(const role of ['store_owner','admin']as const){const s=setup({credit:true});const result=await s.repository.createCheckout({tenantContext:{...context,membership:{...context.membership,role}},now:NOW,intent:selected});assert.equal(result.orderId,ORDER);const query=s.queries.find(q=>q.text.includes('saas.platform_checkout_create'))!;assert.deepEqual(JSON.parse(query.values![8]as string),{kind:'toshi_credit',offerId:'toshi-500',term:'once'});}
 const s=setup({credit:true});
 for(const bad of [{...selected,term:'annual'},{...selected,offerId:'toshi-501'},{...selected,credits:500},{...selected,netCents:1}])assert.throws(()=>parsePlatformCheckoutIntent(bad));
 await assert.rejects(()=>s.repository.createCheckout({tenantContext:{...context,membership:{...context.membership,role:'editor'}},now:NOW,intent:selected}));assert.equal(s.connections(),0);
});

test('one TRY test offer is server-priced and uses the same authenticated signed handoff',async()=>{
 const selected={kind:'toshi_credit' as const,offerId:'toshi-test-1',term:'once' as const,operationId:OP};
 for(const role of ['store_owner','admin']as const){
  const s=setup({credit:true,testCredit:true});
  assert.equal((await s.repository.createCheckout({tenantContext:{...context,membership:{...context.membership,role}},now:NOW,intent:selected})).orderId,ORDER);
  const call=s.queries.find(q=>q.text.includes('saas.platform_checkout_create'))!;
  assert.deepEqual(JSON.parse(call.values![8]as string),{kind:'toshi_credit',offerId:'toshi-test-1',term:'once'});
 }
 for(const bad of [{...selected,totalCents:100},{...selected,netCents:83},{...selected,credits:100},{...selected,term:'monthly'}])assert.throws(()=>parsePlatformCheckoutIntent(bad));
});
