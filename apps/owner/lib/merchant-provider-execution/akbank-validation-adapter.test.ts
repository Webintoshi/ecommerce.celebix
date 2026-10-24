import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import type { ProviderTransportRequest } from '@celebix/payment-adapters';
import { createAkbankValidationAdapter } from './akbank-validation-adapter.ts';
const secret = {merchantSafeId:'1'.repeat(32),terminalSafeId:'2'.repeat(32),secretKey:'owner-fixture-only'};
const identity = Object.freeze({environment:'live' as const, adapterVersion:1 as const});
function adapter(mode:'signed'|'unsigned'|'wrong-terminal'|'rejected') {
 return createAkbankValidationAdapter(Object.freeze({validationIdentity:identity,validationReference:()=> '11111111-1111-4111-8111-111111111111',validationRandomKey:()=> 'unused_random_key_fixture',validationTimeoutMs:1000,
 transport: Object.freeze({async request(request: ProviderTransportRequest) {
  assert.equal(request.environment,'live');
  const data = JSON.parse(new TextDecoder().decode(request.body));
  assert.equal(data.txnCode,'1010');
  assert.equal(data.order.orderId,'11111111-1111-4111-8111-111111111111');
  if (mode==='rejected') return {kind:'response' as const,status:401,contentType:'',body:new Uint8Array(0)};
  const body = new TextEncoder().encode(JSON.stringify({txnCode:'1010',responseCode:'VPS-1007',terminal:{merchantSafeId:secret.merchantSafeId,terminalSafeId:mode==='wrong-terminal'?'3'.repeat(32):secret.terminalSafeId},txnDetailList:[]}));
  return {kind:'response' as const,status:200,contentType:'application/json',body,...(mode==='unsigned'?{}:{headers:{'auth-hash':createHmac('sha512',secret.secretKey).update(body).digest('base64')}})};
 }})}));
}
test('owner Akbank verification is read-only, signed and wipes opened credentials',async()=>{
 const credential = new TextEncoder().encode(JSON.stringify(secret));
 assert.deepEqual(await adapter('signed').validateCredential({credential,publicConfig:{environment:'live'}}),{kind:'validated'});
 assert.ok(credential.every(byte=>byte===0));
});
test('owner Akbank cannot validate unsigned or other-terminal responses',async()=>{
 for (const mode of ['unsigned','wrong-terminal','rejected'] as const) {
  const result=await adapter(mode).validateCredential({credential:new TextEncoder().encode(JSON.stringify(secret)),publicConfig:{environment:'live'}});
  assert.equal(result.kind,'rejected');
  if(result.kind==='rejected') assert.equal(result.outcomeCode,mode==='rejected'?'provider_rejected':'validation_unavailable');
 }
});
test('owner rejects duplicate secret JSON and mismatched environment before bank call',async()=>{
 for(const value of [JSON.stringify(secret).replace('"secretKey":','"secretKey":"other","secretKey":'),'{}']) {
  const credential=new TextEncoder().encode(value);
  const result=await adapter('signed').validateCredential({credential,publicConfig:{environment:'live'}});
  assert.equal(result.kind,'rejected');assert.ok(credential.every(byte=>byte===0));
 }
 assert.equal((await adapter('signed').validateCredential({credential:new TextEncoder().encode(JSON.stringify(secret)),publicConfig:{environment:'test'}})).kind,'rejected');
});
