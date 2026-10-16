import assert from 'node:assert/strict';
import test from 'node:test';
import {handlePlatformHttp} from './http.ts';
const operator={operatorId:'00000000-0000-4000-8000-000000000001',principalId:'00000000-0000-4000-8000-000000000002',issuer:'https://owner.test/auth/v1',subject:'subject',email:'sdkahmetcelebi@icloud.com',label:'Owner',assuranceLevel:'aal2' as const};
test('package requests are a TOTP-protected read resource, never a merchant assignment action',async()=>{
 let reads=0,writes=0;const deps={resolveOperator:async()=>({kind:'authorized',operator}),read:async(_operator:unknown,resource:string)=>{reads++;assert.equal(resource,'package-requests');return{available:true,items:[]};},command:async()=>{writes++;return{};}};
 const url='https://owner.test/api/platform/package-requests';assert.equal((await handlePlatformHttp(new Request(url),['package-requests'],deps)).status,200);
 assert.equal((await handlePlatformHttp(new Request(url,{method:'POST',headers:{origin:'https://owner.test','idempotency-key':'package-key'},body:JSON.stringify({action:'subscription.assign',expectedVersion:0,payload:{}})}),['package-requests'],deps)).status,400);
 assert.equal(reads,1);assert.equal(writes,0);
});
test('known package activation and expired subscription refusals are clear, never uncertain writes',async()=>{
 for(const code of ['subscription_expired','commercial_assignment_disabled']){
  const request=new Request('https://owner.test/api/platform/subscriptions',{method:'POST',headers:{origin:'https://owner.test','idempotency-key':'package-key'},body:JSON.stringify({action:'subscription.assign',expectedVersion:1,payload:{storeId:operator.operatorId,planId:operator.principalId}})});
  const response=await handlePlatformHttp(request,['subscriptions'],{resolveOperator:async()=>({kind:'authorized',operator}),read:async()=>null,command:async()=>{throw Object.assign(Error(code),{code});}});
  assert.equal(response.status,422);assert.equal((await response.json()).code,code);
 }
});
test('unauthorized, merchant and AAL1 never read or mutate platform sources',async()=>{let calls=0;for(const kind of ['unauthenticated','forbidden','mfa_required']){const r=await handlePlatformHttp(new Request('https://owner.test/api/platform/stores'),['stores'],{resolveOperator:async()=>({kind}),read:async()=>{calls++;},command:async()=>{calls++;}});assert.ok([401,403].includes(r.status));}assert.equal(calls,0);});
test('reads have no command side effects; writes need same origin, version, key and matching resource',async()=>{let reads=0,writes=0;const deps={resolveOperator:async()=>({kind:'authorized',operator}),read:async()=>{reads++;return {available:true,items:[]};},command:async()=>{writes++;return {outcome:'committed'};}};
 assert.equal((await handlePlatformHttp(new Request('https://owner.test/api/platform/stores'),['stores'],deps)).status,200);assert.equal(reads,1);assert.equal(writes,0);
 const body=JSON.stringify({action:'billing.receipt.record',expectedVersion:1,payload:{amountCents:500000}});
 for(const [resource,origin,key] of [['billing','https://evil.test','safe-key-123'],['billing','https://owner.test',''],['stores','https://owner.test','safe-key-123']]){const r=await handlePlatformHttp(new Request('https://owner.test/api/platform/'+resource,{method:'POST',headers:{origin,'idempotency-key':key},body}),[resource],deps);assert.ok(r.status>=400);}
 assert.equal(writes,0);
 assert.equal((await handlePlatformHttp(new Request('https://owner.test/api/platform/billing',{method:'POST',headers:{origin:'https://owner.test','idempotency-key':'safe-key-123'},body}),['billing'],deps)).status,200);assert.equal(writes,1);
});
test('retired invitation creation rejects even an authorized central operator without a command',async()=>{let writes=0;const response=await handlePlatformHttp(new Request('https://owner.test/api/platform/invitations',{method:'POST',headers:{origin:'https://owner.test','idempotency-key':'invitation-123'},body:JSON.stringify({action:'ownership.invite',expectedVersion:0,payload:{targetEmail:'user@example.test'}})}),['invitations'],{resolveOperator:async()=>({kind:'authorized',operator}),read:async()=>null,command:async()=>{writes++;return {outcome:'committed'};}});assert.equal(response.status,410);assert.equal((await response.json()).code,'invitations_retired');assert.equal(writes,0);});
