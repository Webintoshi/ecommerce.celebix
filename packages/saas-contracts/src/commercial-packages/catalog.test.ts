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
  ['free_starter',2,0,0,100,500,1,1_000_000_000,50,0],
  ['starter',1,199_000,1_990_000,1000,5000,2,5_000_000_000,1000,4],
  ['growth',1,349_000,3_490_000,5000,25000,5,20_000_000_000,5000,4],
  ['professional',1,599_000,5_990_000,10000,50000,15,50_000_000_000,20000,4],
 ]);
 for(const p of COMMERCIAL_PACKAGES){assert.equal(p.currency,'TRY');assert.equal(p.vatIncluded,false);assert.equal(p.annualPriceCents,p.monthlyPriceCents*10);assert.ok(Object.isFrozen(p));assert.ok(Object.isFrozen(p.capabilities));}
});
test('capability matrix preserves usable core while separating growth and physical operations',()=>{
 assert.deepEqual(COMMERCIAL_PACKAGES.map((_,i)=>hasCommercialCapability(entitlements(i),'manual_orders')),[false,true,true,true]);
 for(const c of ['growth_tools','email_marketing','advanced_analytics'] as const) assert.deepEqual(COMMERCIAL_PACKAGES.map((_,i)=>hasCommercialCapability(entitlements(i),c)),[false,false,true,true]);
 for(const c of ['cashier','accounting','reference_pricing'] as const) assert.deepEqual(COMMERCIAL_PACKAGES.map((_,i)=>hasCommercialCapability(entitlements(i),c)),[false,false,false,true]);
 for(const p of COMMERCIAL_PACKAGES) for(const c of ['catalog','orders','customers','content','media','analytics','checkout','integrations'] as const) assert.ok(p.features.includes(c));
});
test('minimum sufficient package and discount do not imply the most expensive plan',()=>{
 assert.equal(getRequiredCommercialPackage('manual_orders').code,'starter');
 assert.equal(getRequiredCommercialPackage('coupons').code,'starter');
 assert.equal(getRequiredCommercialPackage('seo_tools').code,'starter');
 assert.equal(getRequiredCommercialPackage('growth_tools').code,'growth');
 assert.equal(getRequiredCommercialPackage('accounting').code,'professional');
 assert.equal(getRequiredCommercialPackage('manual_orders').monthlyPriceCents*12-getRequiredCommercialPackage('manual_orders').annualPriceCents,398_000);
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
});
