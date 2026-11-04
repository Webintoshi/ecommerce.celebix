import assert from 'node:assert/strict';
import test from 'node:test';
import {parseLoyaltyConfig,parseLoyaltyAdminPayload,parseLoyaltyCustomerResult} from './index.ts';

const variant='50200000-0000-4000-8000-000000000001';
export const config={schemaVersion:1,template:'product_gift',target:5,eligibleProductIds:[],reward:{kind:'gift',variantId:variant,quantity:1},minimumBasketMinor:0,rewardMinimumBasketMinor:0,channels:['storefront','in_store'],startsAt:null,endsAt:null,timezone:'Europe/Istanbul',repeat:true,maxOncePerDay:false,allowMultiplePrograms:false,allowCombination:false,progressExpiryDays:null,rewardExpiryDays:null} as const;
test('loyalty config preserves carryover and explicit defaults without accepting mismatched reward types',()=>{
 assert.deepEqual(parseLoyaltyConfig(config),config);
 for(const changed of [{target:0},{target:1.5},{channels:[]},{eligibleProductIds:[variant,variant]},{reward:{kind:'discount',amountMinor:100}},{rewardExpiryDays:0},{startsAt:'2026-11-05T00:00:00.000Z',endsAt:'2026-11-04T00:00:00.000Z'},{timezone:'not/a-timezone'},{unexpected:true}])assert.throws(()=>parseLoyaltyConfig({...config,...changed}));
});
test('strict command payloads reject delegated tenant authority and getter execution',()=>{
 assert.deepEqual(parseLoyaltyAdminPayload('save',{name:'Kahve',enabled:true,config}),{name:'Kahve',enabled:true,config});
 assert.throws(()=>parseLoyaltyAdminPayload('adjust',{programId:variant,customerId:variant,delta:0,reason:'Düzeltme'}));
 assert.throws(()=>parseLoyaltyAdminPayload('save',{name:'Kahve',enabled:true,config,storeId:variant}));
 let invoked=false;const value=Object.defineProperty({},'schemaVersion',{enumerable:true,get(){invoked=true;return 1;}});assert.throws(()=>parseLoyaltyConfig(value));assert.equal(invoked,false);
});
test('customer prepared rewards require an owner-bound code, stable operation and finite expiry',()=>{
 const value={operationId:variant,rewardId:variant,code:'L-'+'A'.repeat(32),reward:config.reward,giftProductId:variant,expiresAt:null};
 assert.deepEqual(parseLoyaltyCustomerResult('prepare-reward',value),value);
 assert.throws(()=>parseLoyaltyCustomerResult('prepare-reward',{...value,code:'copied invalid code'}));
 assert.throws(()=>parseLoyaltyCustomerResult('prepare-reward',{...value,expiresAt:'tomorrow'}));
});
