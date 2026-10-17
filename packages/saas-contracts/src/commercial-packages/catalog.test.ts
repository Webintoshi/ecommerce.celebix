import test from 'node:test';
import assert from 'node:assert/strict';
import {COMMERCIAL_PACKAGES, getCommercialPackage, getRequiredCommercialPackage, hasCommercialCapability} from './catalog.ts';
import type {PlanEntitlements} from '../types.ts';

function entitlements(index:number):PlanEntitlements {
 const p=COMMERCIAL_PACKAGES[index];
 return {schemaVersion:1,planId:p.id,planCode:p.code,version:p.version,status:'active',features:p.features,limits:p.limits,validFrom:'2026-10-17T00:00:00.000Z'};
}
test('four immutable packages match approved prices and resource capacities',()=>{
 assert.deepEqual(COMMERCIAL_PACKAGES.map(p=>[p.code,p.version,p.monthlyPriceCents,p.annualPriceCents,p.limits.products,p.variantLimit,p.limits.staff,p.limits.storageBytes,p.limits.monthlyOrders,p.limits.customDomains]),[
  ['free_starter',3,0,0,25,500,1,1_000_000_000,50,0],
  ['starter',2,258_700,2_587_000,1000,5000,2,5_000_000_000,1000,4],
  ['growth',2,453_700,4_537_000,5000,25000,5,20_000_000_000,5000,4],
  ['professional',2,778_700,7_787_000,10000,50000,15,50_000_000_000,20000,4],
 ]);
 for(const p of COMMERCIAL_PACKAGES){assert.equal(p.currency,'TRY');assert.equal(p.vatIncluded,false);assert.equal(p.annualPriceCents,p.monthlyPriceCents*10);assert.ok(Object.isFrozen(p));assert.ok(Object.isFrozen(p.capabilities));}
});
test('capability matrix preserves usable core while separating growth and physical operations',()=>{
 assert.deepEqual(COMMERCIAL_PACKAGES.map((_,i)=>hasCommercialCapability(entitlements(i),'manual_orders')),[false,false,false,true]);
 for(const c of ['growth_tools','email_marketing','advanced_analytics'] as const) assert.deepEqual(COMMERCIAL_PACKAGES.map((_,i)=>hasCommercialCapability(entitlements(i),c)),[false,false,true,true]);
 for(const c of ['cashier','accounting','reference_pricing'] as const) assert.deepEqual(COMMERCIAL_PACKAGES.map((_,i)=>hasCommercialCapability(entitlements(i),c)),[false,false,false,true]);
 for(const p of COMMERCIAL_PACKAGES) for(const c of ['catalog','orders','customers','content','media','analytics','checkout','integrations'] as const) assert.ok(p.features.includes(c));
});
test('minimum sufficient package and discount do not imply the most expensive plan',()=>{
 assert.equal(getRequiredCommercialPackage('manual_orders').code,'professional');
 assert.equal(getRequiredCommercialPackage('coupons').code,'starter');
 assert.equal(getRequiredCommercialPackage('seo_tools').code,'starter');
 assert.equal(getRequiredCommercialPackage('growth_tools').code,'growth');
 assert.equal(getRequiredCommercialPackage('accounting').code,'professional');
 assert.equal(getRequiredCommercialPackage('coupons').monthlyPriceCents*12-getRequiredCommercialPackage('coupons').annualPriceCents,517_400);
});
test('capability checks reject inactive, unknown, mismatched managed identities and absent broad rights',()=>{
 const e=entitlements(3);
 assert.equal(hasCommercialCapability({...e,status:'expired'},'accounting'),false);
 assert.equal(hasCommercialCapability(e,'unknown'),false);
 assert.equal(getCommercialPackage({...e,version:99}),undefined);
 assert.equal(hasCommercialCapability({...e,planCode:'pilot'},'accounting'),false);
 assert.equal(hasCommercialCapability({...e,features:e.features.filter(v=>v!=='accounting')},'accounting'),false);
});
test('legacy pilot and free v1 retain their broad feature authorization without being repriced',()=>{
 const legacy={...entitlements(3),planId:'00000000-0000-4000-8000-000000000002',planCode:'pilot',version:1};
 assert.equal(getCommercialPackage(legacy),undefined);
 assert.equal(hasCommercialCapability(legacy,'accounting'),true);
 assert.equal(hasCommercialCapability({...legacy,features:['catalog','orders']},'manual_orders'),true);
 assert.equal(hasCommercialCapability({...legacy,features:['catalog','orders']},'accounting'),false);
 const freeV1={...legacy,planId:'00000000-0000-4000-8000-000000000001',planCode:'free_starter',version:1,features:['catalog','orders'] as const};
 assert.equal(getCommercialPackage(freeV1),undefined);
 assert.equal(hasCommercialCapability(freeV1,'manual_orders'),true);
 assert.equal(hasCommercialCapability({...freeV1,version:2},'manual_orders'),false);
});

test('prior tariffs remain exact immutable lookups while only current tariffs are offered',()=>{
 const historic=[
  {id:'00000000-0000-4000-8000-000000000003',code:'free_starter',version:2,monthly:0,annual:0,products:100},
  {id:'00000000-0000-4000-8000-000000000004',code:'starter',version:1,monthly:199_000,annual:1_990_000,products:1000},
  {id:'00000000-0000-4000-8000-000000000005',code:'growth',version:1,monthly:349_000,annual:3_490_000,products:5000},
  {id:'00000000-0000-4000-8000-000000000006',code:'professional',version:1,monthly:599_000,annual:5_990_000,products:10000},
 ] as const;
 for(const old of historic){
  const p=getCommercialPackage({planId:old.id,planCode:old.code,version:old.version});
  assert.ok(p);assert.equal(p.monthlyPriceCents,old.monthly);assert.equal(p.annualPriceCents,old.annual);assert.equal(p.limits.products,old.products);
  assert.ok(Object.isFrozen(p));assert.equal(COMMERCIAL_PACKAGES.some(current=>current.id===old.id),false);
  assert.equal(getCommercialPackage({planId:old.id,planCode:old.code,version:old.version+1}),undefined);
  if(old.code==='starter'||old.code==='growth')assert.equal(p.capabilities.includes('manual_orders'),true);
 }
 assert.deepEqual(COMMERCIAL_PACKAGES.map(p=>p.id),[
  '00000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000008','00000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000010',
 ]);
 // Integer cross-products prove a single 30% increase from the prior published prices.
 for(const [index,monthly,annual] of [[1,199_000,1_990_000],[2,349_000,3_490_000],[3,599_000,5_990_000]]){
  assert.equal(COMMERCIAL_PACKAGES[index].monthlyPriceCents*100,monthly*130);
  assert.equal(COMMERCIAL_PACKAGES[index].annualPriceCents*100,annual*130);
 }
});
test('unrecognized commercial identities never inherit legacy broad capabilities',()=>{
 const e=entitlements(3);
 for(const p of [
  {...e,planId:'99999999-9999-4999-8999-999999999999'},
  {...e,planId:'00000000-0000-4000-8000-000000000006',version:2},
  {...e,planId:'00000000-0000-4000-8000-000000000008',planCode:'pilot',version:99},
 ])assert.equal(hasCommercialCapability(p,'accounting'),false);
});
