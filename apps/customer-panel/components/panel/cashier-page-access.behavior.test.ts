import assert from 'node:assert/strict';
import test from 'node:test';
import {compile} from '../settings/design/design-editor-test-utils.ts';

test('server page access redirects cashiers away from ecommerce before returning page authority',async()=>{
 for(const role of ['cashier','admin','store_owner'])for(const pathname of ['/products/new','/accounting/receivables','/orders','/settings/design',null]){
  const context={membership:{role}};
  const {requireServerPanelAccess}=compile<any>(new URL('../../lib/server-access.ts',import.meta.url),{
   'server-only':{},
   '@/lib/server-accounting/access':{resolvePanelAccountingAccess:async()=>({canManageAccounting:false,canCollectReceivables:false})},
   './commercial-packages/route-model.ts':{commercialRouteDecision:()=>({kind:'allowed'})},
   'next/headers':{headers:async()=>new Headers(pathname?{'x-celebix-panel-pathname':pathname}:{})},
   'next/navigation':{redirect:(destination:string)=>{throw new Error(`redirect:${destination}`);}},
   '@/lib/server-session':{resolveServerPanelSession:async()=>({})},
   '@/lib/server-panel-access/decision':{decideServerPanelAccess:()=>({kind:'render',session:{},tenantContext:context})},
  });
  const denied=role==='cashier'&&![ '/products/new','/accounting/receivables'].includes(pathname??'');
  if(denied)await assert.rejects(requireServerPanelAccess(),/redirect:\/orders\/quick-links/);
  else assert.equal((await requireServerPanelAccess()).tenantContext,context);
 }
});

test('cashier accounting page authority follows only the server DB grant and retains its trusted sidecar',async()=>{
 for(const allowed of [false,true])for(const pathname of ['/accounting','/accounting/accounts','/accounting/invoicing-integration/new','/settings/design']){
  const context={membership:{role:'cashier'}};let reads=0;
  const {requireServerPanelAccess}=compile<any>(new URL('../../lib/server-access.ts',import.meta.url),{'server-only':{},'./commercial-packages/route-model.ts':{commercialRouteDecision:()=>({kind:'allowed'})},'@/lib/server-accounting/access':{resolvePanelAccountingAccess:async(value:unknown)=>{assert.equal(value,context);reads++;return{canManageAccounting:allowed,canCollectReceivables:false};}},'next/headers':{headers:async()=>new Headers({'x-celebix-panel-pathname':pathname})},'next/navigation':{redirect:(destination:string)=>{throw new Error(`redirect:${destination}`);}},'@/lib/server-session':{resolveServerPanelSession:async()=>({})},'@/lib/server-panel-access/decision':{decideServerPanelAccess:()=>({kind:'render',session:{},tenantContext:context})}});
  if(allowed&&pathname.startsWith('/accounting'))assert.equal((await requireServerPanelAccess()).accountingAccess.canManageAccounting,true);else await assert.rejects(requireServerPanelAccess(),/redirect:\/orders\/quick-links/);assert.equal(reads,1);
 }
});
