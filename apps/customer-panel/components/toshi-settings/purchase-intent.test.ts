import assert from 'node:assert/strict';
import test from 'node:test';
import {hasToshiTestPurchaseIntent} from './purchase-intent.ts';
import {compile} from '../settings/design/design-editor-test-utils.ts';
test('only a sole exact test-product hint selects authenticated auto checkout',()=>{
 assert.equal(hasToshiTestPurchaseIntent({purchase:'toshi-test-1'}),true);
 for(const value of [{},{purchase:'toshi-500'},{purchase:'TOSHI-test-1'},{purchase:['toshi-test-1']},{purchase:['toshi-test-1','toshi-test-1']},{purchase:'toshi-test-1',totalCents:'100'},{purchase:'toshi-test-1',storeId:'forged'},{next:'https://evil.test'},{purchase:' toshi-test-1'}])assert.equal(hasToshiTestPurchaseIntent(value),false);
});
test('authenticated settings page enables the exact hint only for owner and admin purchase authority',async()=>{
 const storeId='11111111-1111-4111-8111-111111111111';
 for(const role of ['store_owner','admin','editor','cashier','analyst']){
  const {default:Page}=compile<{default:(input:unknown)=>Promise<{props:{autoStartTestPurchase:boolean;storeId:string}}> }>(new URL('../../app/(panel)/settings/artificial-intelligence/page.tsx',import.meta.url),{
   '@/lib/server-access':{requireServerPanelAccess:async()=>({tenantContext:{store:{id:storeId},membership:{role}}})},
   '@/components/toshi-settings/ArtificialIntelligenceSettings':{ArtificialIntelligenceSettings:()=>null},
  });
  const selected=await Page({searchParams:Promise.resolve({purchase:'toshi-test-1'})});
  assert.equal(selected.props.autoStartTestPurchase,['store_owner','admin'].includes(role));assert.equal(selected.props.storeId,storeId);
  for(const query of [{},{purchase:['toshi-test-1','toshi-test-1']},{purchase:'toshi-test-1',totalCents:'100'}])assert.equal((await Page({searchParams:Promise.resolve(query)})).props.autoStartTestPurchase,false);
 }
});
