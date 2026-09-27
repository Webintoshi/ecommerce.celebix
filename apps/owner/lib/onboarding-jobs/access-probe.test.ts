import assert from 'node:assert/strict';
import test from 'node:test';
import type {CreateStarterTenantResult} from '@celebix/saas-contracts';
const scope={ownerOrigin:'https://owner.example.test',panelOrigin:'https://panel.saas-staging.celebix.net',platformDomainSuffix:'saas-staging.celebix.net'};
const result={store:{id:'00000000-0000-4000-8000-000000000001',slug:'qa'},panelUrl:'https://qa.admin.saas-staging.celebix.net',storefrontUrl:'https://qa.saas-staging.celebix.net'} as CreateStarterTenantResult;
async function load(){try{return await import('./access-probe.ts');}catch{assert.fail('bounded access probe is missing');}}
test('wrong tenant 200 and generic 200 never produce ready',async()=>{
 const {probeTenantAccess}=await load();
 for(const payload of [{status:'ok'},{schemaVersion:1,status:'ok',storeId:'other',hostname:'qa.admin.saas-staging.celebix.net'}]){
 const snapshot=await probeTenantAccess(scope,result,{attemptId:'attempt_0000000000000001',now:new Date(),verifyProof:async()=>true,get:async url=>({status:200,body:JSON.stringify(payload)} )});
 assert.notEqual(snapshot.state,'ready');
 }
});
test('mismatched derived authority stops before any request',async()=>{
 const {probeTenantAccess}=await load();let calls=0;
 const snapshot=await probeTenantAccess(scope,{...result,storefrontUrl:'https://private.example.test'},{attemptId:'attempt_0000000000000001',now:new Date(),verifyProof:async()=>true,get:async()=>{calls++;return {status:200,body:''};}});
 assert.equal(snapshot.state,'unavailable');assert.equal(calls,0);
});
test('committed proof plus exact store and hostname health permits ready',async()=>{
 const {probeTenantAccess}=await load();
 const snapshot=await probeTenantAccess(scope,result,{attemptId:'attempt_0000000000000001',now:new Date(),verifyProof:async()=>true,get:async url=>({status:200,body:url.pathname==='/api/health'?JSON.stringify({schemaVersion:1,status:'ok',storeId:result.store.id,hostname:url.hostname}):'<html>ready</html>'})});
 assert.equal(snapshot.state,'ready');
});
test('failed committed proof prevents network calls',async()=>{
 const {probeTenantAccess}=await load();
 const snapshot=await probeTenantAccess(scope,result,{attemptId:'attempt_0000000000000001',now:new Date(),verifyProof:async()=>false,get:async()=>assert.fail('unproven tenant requested')});
 assert.equal(snapshot.state,'pending');
});
test('TLS transport rejects private DNS and an unallowlisted edge',async()=>{
 const {createBoundedPlatformGet}=await load();
 for(const address of ['127.0.0.1','169.254.169.254','10.0.0.1','::1','fc00::1','192.0.2.1']){
 const get=createBoundedPlatformGet({allowedHosts:['qa.saas-staging.celebix.net'],allowedAddresses:['46.225.183.57'],lookup:async()=>[{address,family:address.includes(':')?6:4}]});
 await assert.rejects(()=>get(new URL(result.storefrontUrl)));
 }
});
test('transport keeps TLS/SNI verification, body cap and same-host single redirect',async()=>{
 const {createBoundedPlatformGet}=await load();const {EventEmitter}=await import('node:events');
 for(const scenario of ['foreign','loop','large','ok'] as const){
  let calls=0;
  const request=((url:URL,options:Record<string,unknown>,callback:(response:unknown)=>void)=>{
   calls++;assert.equal(options.rejectUnauthorized,true);assert.equal(options.servername,'qa.saas-staging.celebix.net');
   const req=new EventEmitter() as import('node:events').EventEmitter & {end:()=>void;destroy:(error:Error)=>void};
   req.destroy=error=>{req.emit('error',error);req.emit('close');};
   req.end=()=>queueMicrotask(()=>{
    const res=Object.assign(new EventEmitter(),{statusCode:scenario==='foreign'||scenario==='loop'?302:200,headers:{location:scenario==='foreign'?'https://foreign.example.test/':'/second'}});
    callback(res);res.emit('data',Buffer.alloc(scenario==='large'?262145:4));res.emit('end');req.emit('close');
   });return req;
  }) as unknown as typeof import('node:https').request;
  const get=createBoundedPlatformGet({allowedHosts:['qa.saas-staging.celebix.net'],allowedAddresses:['46.225.183.57'],lookup:async()=>[{address:'46.225.183.57',family:4}],request});
  if(scenario==='ok')assert.equal((await get(new URL(result.storefrontUrl))).status,200);else await assert.rejects(()=>get(new URL(result.storefrontUrl)));
  assert.equal(calls,scenario==='loop'?2:1);
 }
});
