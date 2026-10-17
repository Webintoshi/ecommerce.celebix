import assert from 'node:assert/strict';
import test from 'node:test';
import {parseCommercialPlanOverview,parseCommercialUpgradeRequest,parseCommercialUpgradeIntent} from './projection.ts';
const ID='00000000-0000-4000-8000-000000000003', STORE='11111111-1111-4111-8111-111111111111';
const request={requestId:STORE,storeId:STORE,planId:'00000000-0000-4000-8000-000000000006',status:'pending',createdAt:'2026-10-17T12:00:00.000Z',replayed:false};
const overview={plan:{planId:ID,planCode:'free_starter',version:2},usage:{products:1,variants:2,staff:1,storageBytes:1,monthlyOrders:0,customDomains:0},request};
test('plan overview copies a finite safe projection and validates money-independent usage',()=>{
 assert.deepEqual(parseCommercialPlanOverview(overview),overview);
 for(const bad of [{...overview,storeId:STORE},{...overview,usage:{...overview.usage,variants:-1}},{...overview,plan:{...overview.plan,version:0}},{...overview,request:{...request,status:'paid'}}])assert.throws(()=>parseCommercialPlanOverview(bad));
});
test('request intent contains only known target and a canonical operation key',()=>{
 const intent={planId:'00000000-0000-4000-8000-000000000010',operationId:STORE};assert.deepEqual(parseCommercialUpgradeIntent(intent),intent);
 for(const bad of [{...intent,storeId:STORE},{...intent,planId:STORE},{...intent,operationId:'unsafe'}])assert.throws(()=>parseCommercialUpgradeIntent(bad));
 assert.throws(()=>parseCommercialUpgradeRequest({...request,createdAt:'not a date'}));
});

test('historic upgrade outcomes remain readable but cannot be used as new upgrade targets',()=>{
 for(const planId of ['00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000006']){
  assert.equal(parseCommercialUpgradeRequest({...request,planId}).planId,planId);
  assert.throws(()=>parseCommercialUpgradeIntent({planId,operationId:STORE}));
 }
 for(const planId of ['00000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000008','00000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000010']){
  assert.equal(parseCommercialUpgradeRequest({...request,planId}).planId,planId);
  assert.deepEqual(parseCommercialUpgradeIntent({planId,operationId:STORE}),{planId,operationId:STORE});
 }
 assert.throws(()=>parseCommercialUpgradeRequest({...request,planId:STORE}));
});
