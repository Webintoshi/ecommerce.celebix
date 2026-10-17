import assert from 'node:assert/strict';
import test from 'node:test';
import { COMMERCIAL_PACKAGES } from '@celebix/saas-contracts';
import { compile } from '../settings/design/design-editor-test-utils.ts';
const context=(index:number)=>{const p=COMMERCIAL_PACKAGES[index];return {store:{id:'11111111-1111-4111-8111-111111111111'},membership:{role:'store_owner'},entitlements:{schemaVersion:1,planId:p.id,planCode:p.code,version:p.version,status:'active',features:p.features,limits:p.limits,validFrom:'2026-01-01T00:00:00Z'}};};
const stub=()=>null;
function page(path:string,index:number,extra:Record<string,unknown>={}){return compile<any>(new URL(`../../app/(panel)/${path}/page.tsx`,import.meta.url),{'@/lib/server-access':{requireServerPanelAccess:async()=>({tenantContext:context(index)})},'../../../../lib/server-access.ts':{requireServerPanelAccess:async()=>({tenantContext:context(index)})},'@/components/catalog/ProductCreateForm':{ProductCreateForm:stub},'@/components/catalog/ProductDetailConsole':{ProductDetailConsole:stub},'../../../../components/settings/MerchantStaffConsole.tsx':{MerchantStaffConsole:stub},'@/components/content/MerchantContentEditor':{MerchantContentEditor:stub},'@/lib/server-content-resource-authoring/runtime':{contentResourceAuthoringEnabled:()=>true,contentResearchEnabled:()=>true},'@/lib/server-content-resource-authoring/locale':{resolveInitialContentLocale:async()=>'tr'},...extra}).default;}
test('product creation/detail leave core edits available while paid AI and reference controls follow the package',async()=>{
 for(const index of [0,1,2,3]){
  const create=await page('products/new',index)({searchParams:Promise.resolve({mode:'advanced'})});assert.equal(create.props.aiAvailable,index>0);
  const detail=await page('products/[productId]',index)({params:Promise.resolve({productId:'fixture'})});assert.equal(detail.props.canManage,true);assert.equal(detail.props.aiAvailable,index>0);assert.equal(detail.props.canReadPricing,index===3);assert.equal(detail.props.canManagePricing,index===3);
 }
});
test('all blog and page new/edit entrypoints obey AI entitlement even when rollout flags are enabled',async()=>{
 for(const route of ['content/blog/new','content/blog/[recordId]/edit','content/pages/new','content/pages/[recordId]/edit'])for(const index of [0,3]){
  const result=await page(route,index)({params:Promise.resolve({recordId:'fixture'})});assert.equal(result.props.canManage,true);assert.equal(result.props.aiEnabled,index===3,route);assert.equal(result.props.researchEnabled,index===3,route);
 }
});
test('cashier assignment controls follow the package while ordinary staff management remains available',async()=>{
 for(const index of [1,2,3]){const result=await page('settings/administrators',index)();assert.equal(result.props.cashierAvailable,index===3);}
});
