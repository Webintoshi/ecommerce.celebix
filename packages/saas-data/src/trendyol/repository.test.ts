import assert from 'node:assert/strict';
import test from 'node:test';
import type {TenantContext} from '@celebix/saas-contracts';
import {createPostgresTrendyolRepository,createPostgresTrendyolWorkflowRepository} from './repository.ts';
const id='11111111-1111-4111-8111-111111111111',now=new Date('2026-10-23T12:00:00Z');
const tenant={schemaVersion:1,principal:{id},store:{id,slug:'fixture',status:'active'},membership:{id,role:'store_owner',status:'active'},entitlements:{schemaVersion:1,planId:'00000000-0000-4000-8000-000000000008',planCode:'starter',version:2,status:'active',features:['integrations','orders','marketplaces']}} as unknown as TenantContext;
function fixture(answer:Record<string,unknown>,failCommit=false){const calls:{text:string;values:unknown[]}[]=[];let poisoned=false;return{calls,get poisoned(){return poisoned;},pool:{async connect(){return{async query(text:string,values:unknown[]=[]){calls.push({text,values});if(text==='COMMIT'&&failCommit)throw Error('database details must not leak');const match=text.includes('FROM saas.trendyol_');return{rows:match?[answer]:[],rowCount:match?1:0,command:'',oid:0,fields:[]};},release(error?:boolean){poisoned=error===true;}};}}};}
test('Trendyol native request uses trusted tenant snapshot and rejects secret-bearing public DTO',async()=>{
 const f=fixture({outcome:'found',result_payload:{items:[],nextCursor:null,credential:'not public'}}),r=createPostgresTrendyolRepository({pool:f.pool});
 await assert.rejects(()=>r.products({tenantContext:tenant,now}),{code:'unavailable'});
 assert.ok(f.calls.some(c=>c.text==='SET LOCAL ROLE celebix_saas_app'));
 assert.deepEqual(f.calls.find(c=>c.text.includes('trendyol_command'))!.values.slice(0,7),[id,id,id,tenant.entitlements.planId,'starter',2,now.toISOString()]);
 assert.ok(f.calls.some(c=>c.text==='ROLLBACK'));
});
test('free package and forged identities cannot reach persistence even if browser UI is bypassed',async()=>{
 const f=fixture({}),r=createPostgresTrendyolRepository({pool:f.pool});
 await assert.rejects(()=>r.overview({tenantContext:{...tenant,entitlements:{...tenant.entitlements,features:['integrations']}},now}),{code:'feature_not_enabled'});
 await assert.rejects(()=>r.products({tenantContext:{...tenant,store:{...tenant.store,id:'other'}},now}),{code:'invalid_input'});
 assert.equal(f.calls.length,0);
});
test('workflow restores every lease fence and treats unknown database commits as uncertain',async()=>{
 const f=fixture({outcome:'stale',result_payload:{}}),r=createPostgresTrendyolWorkflowRepository({pool:f.pool});
 assert.equal(await r.read({jobId:id,leaseId:id,generation:3,connectionVersion:4},now),null);
 const call=f.calls.find(c=>c.text.includes('trendyol_workflow'))!;
 assert.deepEqual(JSON.parse(call.values[1] as string),{jobId:id,leaseId:id,generation:3,connectionVersion:4});assert.ok(f.calls.some(c=>c.text==='SET LOCAL ROLE celebix_saas_workflow'));
 const u=fixture({outcome:'found',result_payload:{items:[],nextCursor:null}},true);
 await assert.rejects(()=>createPostgresTrendyolRepository({pool:u.pool}).products({tenantContext:tenant,now}),{code:'commit_unknown'});assert.equal(u.poisoned,true);
});
test('an unrecognized webhook secret is denied rather than reported as retryable outage',async()=>{
 const f=fixture({outcome:'denied',result_payload:null});await assert.rejects(()=>createPostgresTrendyolWorkflowRepository({pool:f.pool}).webhook(id,'a'.repeat(64),now),{code:'membership_denied'});
});
