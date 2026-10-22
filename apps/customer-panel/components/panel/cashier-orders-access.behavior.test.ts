import assert from 'node:assert/strict';
import test from 'node:test';
import {compile} from '../settings/design/design-editor-test-utils.ts';

test('presentation access fails closed on absent reader, unavailable and malformed native payload',async()=>{
 for(const result of [undefined,{}, {canManageOrders:'true'},{canManageOrders:true,storeId:'forged'},new Error('offline'),{canManageOrders:false},{canManageOrders:true}]){
  const context={membership:{role:'cashier'}};let calls=0;
  const runtime=result===undefined?{orders:{}}:{orders:{getAccess:async(input:any)=>{assert.equal(input.tenantContext,context);assert.ok(input.now instanceof Date);calls++;if(result instanceof Error)throw result;return result;}}};
  const {resolvePanelOrdersAccess}=compile<any>(new URL('../../lib/server-orders/access.ts',import.meta.url),{'server-only':{},react:{cache:(fn:any)=>fn},'../server-panel-access/default.ts':{resolveDefaultServerPanelAccessRuntime:async()=>({})},'./runtime.ts':{resolveServerOrdersRuntime:()=>runtime}});
  assert.deepEqual(await resolvePanelOrdersAccess(context),{canManageOrders:!!result&&!(result instanceof Error)&&Object.keys(result).length===1&&(result as any).canManageOrders===true});assert.equal(calls,result===undefined?0:1);
 }
});

test('cashier detail exposes manual editing and order actions without delete or provider shipping',async()=>{
 for(const canManageOrders of [false,true]){
  const {default:Page}=compile<any>(new URL('../../app/(panel)/orders/[orderId]/page.tsx',import.meta.url),{'@/lib/server-access':{requireServerPanelAccess:async()=>({tenantContext:{membership:{role:'cashier'}},ordersAccess:{canManageOrders}})},'@/components/orders/OrderDetailConsole':{OrderDetailConsole:()=>null}});
  const result=await Page({params:Promise.resolve({orderId:'25900000-0000-4000-8000-000000000001'})});const caps=result.props.children.props.capabilities;
  for(const key of ['manage','fulfill','payment','note','shipping'])assert.equal(caps[key],canManageOrders,key);assert.equal(caps.delete,false);assert.equal(caps.providerShipping,false);
 }
});
