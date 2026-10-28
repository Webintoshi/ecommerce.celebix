import assert from 'node:assert/strict';
import test from 'node:test';
import {executeNativePlatformCommerceCommand} from './runtime.ts';
const NOW=new Date('2026-10-28T12:00:00Z'),ID='28900000-0000-4000-8000-000000000001';
const input={operationId:ID,storeSelector:'123',sessionDigest:'a'.repeat(64),ipDigest:'b'.repeat(64)};
test('public native bridge selects only the fixed creator and returns closed rejections so their rate reservation commits',async()=>{
 for(const outcome of ['store_unavailable','rate_limited','operation_mismatch']){
  const calls:unknown[]=[];
  const row={outcome,result_payload:null};
  const value=await executeNativePlatformCommerceCommand({query:async(text,values)=>{calls.push({text,values});return{rows:[row]};}},'public_test',input,NOW);
  assert.deepEqual(value,row);assert.deepEqual(calls,[{text:'SELECT outcome,result_payload FROM saas.platform_checkout_public_test_create($1::timestamptz,$2::uuid,$3::text,$4::text,$5::text)',values:[NOW,ID,'123','a'.repeat(64),'b'.repeat(64)]}]);
 }
});
test('malformed or unknown native rejections throw before commit; legacy calls keep the existing machine path',async()=>{
 for(const row of [{outcome:'private_error',result_payload:null},{outcome:'rate_limited',result_payload:null,privateValue:'never'},{outcome:'created',result_payload:null}])await assert.rejects(executeNativePlatformCommerceCommand({query:async()=>({rows:[row]})},'public_test',input,NOW));
 const calls:unknown[]=[];const row={outcome:'found',result_payload:{order:{},attempt:null}};
 assert.deepEqual(await executeNativePlatformCommerceCommand({query:async(text,values)=>{calls.push({text,values});return{rows:[row]};}},'read',{orderId:ID,sessionDigest:input.sessionDigest},NOW),row);
 assert.deepEqual(calls,[{text:'SELECT outcome,result_payload FROM saas.platform_checkout_machine($1::text,$2::jsonb)',values:['read',JSON.stringify({orderId:ID,sessionDigest:input.sessionDigest})]}]);
});
