import assert from 'node:assert/strict';
import test from 'node:test';
import type {TenantContext}from'@celebix/saas-contracts';
import{sealMerchantProviderCredential}from'@celebix/saas-data';
import{createPostgresCentralToshiRepository,registerServerCentralToshiRepository,resolveServerCentralToshiRepository}from'./central-repository.ts';
const STORE='28400000-0000-4000-8000-000000000001',ACTOR='28400000-0000-4000-8000-000000000100',MEMBER='28400000-0000-4000-8000-000000001001',CONFIG='28400000-0000-4000-8000-000000002001',OP='28400000-0000-4000-8000-000000010001',PLAN='00000000-0000-4000-8000-000000000010',NOW=new Date('2026-10-27T12:00:00Z');
const tenant:TenantContext={schemaVersion:1,requestId:'central-test',principal:{id:ACTOR,issuer:'https://identity.test',subject:'staff'},store:{id:STORE,slug:'fixture',status:'active'},membership:{id:MEMBER,role:'editor',status:'active'},entitlements:{schemaVersion:1,planId:PLAN,planCode:'professional',version:2,status:'active',features:['catalog'],limits:{products:100,staff:10,storageBytes:1024},validFrom:'2026-01-01T00:00:00.000Z'},locale:'tr-TR'}as TenantContext;
const keyring=Object.freeze({activeKeyId:'test-only',keys:Object.freeze([Object.freeze({keyId:'test-only',key:new Uint8Array(32).fill(7)})])});
const sealed=sealMerchantProviderCredential({plaintext:new TextEncoder().encode('test-only-central-key'),profileId:CONFIG,storeId:STORE,providerCode:'deepseek',capability:'ai_assistant',credentialVersion:1,keyring});
const connection={provider:'deepseek',label:'DeepSeek',status:'active',isDefault:false,maskedKey:'••••oshi',selectedModel:'deepseek-flash',availableModels:[{id:'deepseek-flash',label:'Toshi'}],version:1,verifiedAt:NOW.toISOString(),updatedAt:NOW.toISOString()};
const authority={configId:CONFIG,provider:'deepseek',selectedModel:'deepseek-flash',sealedCredentials:sealed,credentialVersion:1,version:1};
const identity={configId:CONFIG,credentialVersion:1,version:1};
const connect=()=>({tenantContext:tenant,now:NOW,provider:'deepseek'as const,operationId:OP,configId:CONFIG,sealedCredentials:sealed,credentialDigest:'sha256:'+'a'.repeat(64),credentialVersion:1,maskedKey:'••••oshi',selectedModel:'deepseek-flash',availableModels:[{id:'deepseek-flash',label:'Toshi'}],expectedVersion:0});
class Client{calls:{text:string;values:unknown[]}[]=[];released:unknown[]=[];constructor(readonly outcome:string,readonly payload:unknown,readonly lose=false){}async query(text:string,values:unknown[]=[]){this.calls.push({text,values});if(this.lose&&text==='COMMIT')throw Error('wire');const rows=text.includes('saas.toshi_central_binding_command')?[{outcome:this.outcome,result_payload:this.payload}]:[];return{rows,rowCount:rows.length,command:'',oid:0,fields:[]};}release(value?:unknown){this.released.push(value);}}
function setup(clients:Client[]){let checkouts=0;const repository=createPostgresCentralToshiRepository({pool:{async connect(){checkouts++;const client=clients.shift();if(!client)throw Error('checkout');return client;}},timeouts:{poolCheckoutMs:100,statementMs:500,lockMs:300,idleTransactionMs:700}});return{repository,count:()=>checkouts};}
test('central facade reads identity and sealed authority only through the catalog-scoped native command',async()=>{
 const c=new Client('found',authority),s=setup([c]);assert.deepEqual(await s.repository.getAuthority({tenantContext:tenant,now:NOW,provider:'deepseek'}),authority);
 const query=c.calls.find(q=>q.text.includes('saas.toshi_central_binding_command'))!;assert.deepEqual(query.values.slice(0,8),[STORE,ACTOR,MEMBER,PLAN,'professional',2,NOW,'authority']);assert.equal(query.values[8],'{}');assert.equal(c.calls[0]?.text,'BEGIN READ ONLY');assert.ok(c.calls.some(q=>q.text==='SET LOCAL ROLE celebix_saas_app'));
 const i=new Client('found',identity);assert.deepEqual(await setup([i]).repository.getConnectionIdentity({tenantContext:tenant,now:NOW,provider:'deepseek'}),identity);
 const missing=setup([new Client('not_found',null)]);assert.equal(await missing.repository.getConnectionIdentity({tenantContext:tenant,now:NOW,provider:'deepseek'}),null);
 await assert.rejects(()=>setup([new Client('not_found',null)]).repository.getAuthority({tenantContext:tenant,now:NOW,provider:'deepseek'}),error=>(error as {code?:string}).code==='connection_missing');
});
test('central connect pins the protocol and fingerprints full sealed request plus actor identity',async()=>{
 const c=new Client('connected',connection),s=setup([c]);assert.deepEqual(await s.repository.connect(connect()),connection);const query=c.calls.find(q=>q.text.includes('saas.toshi_central_binding_command'))!,payload=JSON.parse(query.values[8]as string);
 assert.equal(query.values[7],'connect');assert.equal(payload.provider,'deepseek');assert.equal(payload.maskedKey,'••••oshi');assert.equal(payload.selectedModel,'deepseek-flash');assert.deepEqual(payload.sealedCredentials,sealed);assert.match(payload.fingerprint,/^[a-f0-9]{64}$/);assert.equal(payload.isDefault,undefined);assert.equal(c.calls.at(-1)?.text,'COMMIT');
});
test('provider, model, marker, defaults, plaintext credentials and extra authority are rejected before checkout',async()=>{
 const s=setup([]);for(const delta of[{provider:'openai'},{selectedModel:'deepseek-v4-pro'},{maskedKey:'••••test'},{availableModels:[{id:'deepseek-flash',label:'Other'}]},{isDefault:true},{sealedCredentials:'plaintext'},{storeId:STORE}])await assert.rejects(()=>s.repository.connect({...connect(),...delta}as never));assert.equal(s.count(),0);
 await assert.rejects(()=>s.repository.getAuthority({tenantContext:tenant,now:NOW,provider:null}));assert.equal(s.count(),0);
});
test('ambiguous connect commit recovers the same operation without generic provider authority',async()=>{
 const writer=new Client('connected',connection,true),recovery=new Client('operation_replayed',connection),s=setup([writer,recovery]);assert.deepEqual(await s.repository.connect(connect()),connection);assert.deepEqual(writer.released,[true]);const query=recovery.calls.find(q=>q.text.includes('saas.toshi_central_binding_command'))!;assert.equal(query.values[7],'recover');assert.equal(recovery.calls[0]?.text,'BEGIN READ ONLY');
});
test('old DeepSeek model authority is available to the internal migration helper and default flags survive rotation',async()=>{
 const old={...authority,selectedModel:'deepseek-v4-pro'};assert.equal((await setup([new Client('found',old)]).repository.getAuthority({tenantContext:tenant,now:NOW,provider:'deepseek'})).selectedModel,'deepseek-v4-pro');
 const rotated={...connection,isDefault:true,version:2};assert.deepEqual(await setup([new Client('connected',rotated)]).repository.connect({...connect(),expectedVersion:1,credentialVersion:2}),rotated);
});
test('native permission failures and malformed authority never escape as usable bindings',async()=>{
 for(const outcome of['membership_denied','durable_authority_invalid','version_conflict','operation_mismatch']){const c=new Client(outcome,null);await assert.rejects(()=>setup([c]).repository.connect(connect()),error=>(error as {code?:string}).code===outcome);assert.equal(c.calls.at(-1)?.text,'ROLLBACK');}
 const c=new Client('found',{...authority,plaintext:'not-allowed'});await assert.rejects(()=>setup([c]).repository.getAuthority({tenantContext:tenant,now:NOW,provider:'deepseek'}));assert.equal(c.calls.at(-1)?.text,'ROLLBACK');
});
test('central repository registration is private to one approved access authority',()=>{
 const access={readiness:{mode:'approved_staging'},panelOrigin:'https://panel.test'}as never,repository=setup([]).repository;
 const selected=registerServerCentralToshiRepository(access,repository);assert.equal(resolveServerCentralToshiRepository(access),selected);assert.equal(Object.isFrozen(selected),true);assert.throws(()=>registerServerCentralToshiRepository(access,repository),/repository_invalid/);assert.equal(resolveServerCentralToshiRepository({readiness:{mode:'disabled'}}as never),null);
});
