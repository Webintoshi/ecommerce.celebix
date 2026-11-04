import assert from 'node:assert/strict';
import test from 'node:test';
import {posLoyaltyCommand,PosLoyaltyError} from './pos-loyalty.ts';
const id='6e000000-0000-4000-8000-000000000001';
test('uncertain POS reward operations recover the original command before any replay',async()=>{
 const calls:any[]=[];const result={operationId:id,customerId:id,approvalId:id,expiresAt:'2026-11-04T12:05:00.000Z',availableRewards:[]};
 const value=await posLoyaltyCommand({action:'approve-pos',operationId:id,payload:{saleId:id,token:'a'.repeat(64)}},true,async(path:any,init:any)=>{calls.push([path,JSON.parse(init.body)]);return Response.json(result);});
 assert.deepEqual(value,result);assert.equal(calls.length,1);assert.equal(calls[0][0],'/api/loyalty/recover');assert.equal(calls[0][1].operationId,id);assert.equal(calls[0][1].payload.action,'approve-pos');
});
test('a lost POS response remains uncertain and cannot be mistaken for a declined reward',async()=>{
 await assert.rejects(posLoyaltyCommand({action:'approve-pos',operationId:id,payload:{saleId:id,token:'a'.repeat(64)}},false,async()=>{throw new Error('network');}),error=>error instanceof PosLoyaltyError&&error.uncertain);
 await assert.rejects(posLoyaltyCommand({action:'approve-pos',operationId:id,payload:{saleId:id,token:'a'.repeat(64)}},false,async()=>Response.json({code:'approval_invalid',message:'Onay kodu geçersiz.'},{status:409})),error=>error instanceof PosLoyaltyError&&!error.uncertain);
});
