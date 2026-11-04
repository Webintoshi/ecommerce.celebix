import assert from 'node:assert/strict';
import test from 'node:test';
import {createAccountSessionCredential} from './credential.ts';
import {createAccountLoyaltyRuntime} from './loyalty-runtime.ts';

const keyring={activeKeyId:'test',keys:[{keyId:'test',key:new Uint8Array(32).fill(9)}]};
const operationId='6e000000-0000-4000-8000-000000000001';
test('loyalty never calls the repository with absent or malformed account credentials',async()=>{
 let calls=0;const runtime=createAccountLoyaltyRuntime({repository:{command:async()=>{calls++;return{programs:[],rewards:[]};}} as never,keyring,now:()=>new Date('2026-11-04T12:00:00Z')});
 for(const cookieHeader of[null,'__Host-celebix_account=invalid'])await assert.rejects(runtime.command({hostname:'shop.example.test',cookieHeader,action:'list',payload:{}}),/unauthenticated/);
 assert.equal(calls,0);
});
test('reward use forwards only signed account digest candidates with the original operation',async()=>{
 const calls:any[]=[];const runtime=createAccountLoyaltyRuntime({repository:{command:async(input:unknown)=>{calls.push(input);return{};}} as never,keyring,now:()=>new Date('2026-11-04T12:00:00Z')});
 const credential=createAccountSessionCredential(keyring,n=>new Uint8Array(n).fill(2));
 await runtime.command({hostname:'shop.example.test',cookieHeader:`__Host-celebix_account=${credential.value}`,action:'prepare-reward',operationId,payload:{rewardId:operationId}});
 assert.equal(calls[0].hostname,'shop.example.test');assert.deepEqual(calls[0].candidates,[{keyId:credential.keyId,digest:credential.digest}]);assert.equal(calls[0].operationId,operationId);assert.equal('customerId'in calls[0],false);
});
