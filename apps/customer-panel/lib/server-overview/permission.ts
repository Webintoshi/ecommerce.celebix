import type {OverviewAccess,TenantContext} from '@celebix/saas-contracts';
import type {ServerPanelAccessRuntime} from '../server-panel-access/runtime.ts';
import {resolveServerInStoreSalesRuntime} from '../server-in-store-sales/runtime.ts';

const NONE:OverviewAccess=Object.freeze({canViewOverview:false});
const FULL:OverviewAccess=Object.freeze({canViewOverview:true});

/** Fresh authority read. Presentation caching belongs only in the SSR wrapper. */
export async function readOverviewAccess(tenantContext:TenantContext,access:ServerPanelAccessRuntime,now:Date):Promise<OverviewAccess>{
 if(tenantContext.membership.role!=='cashier')return FULL;
 try{
  const runtime=resolveServerInStoreSalesRuntime(access);
  if(!runtime?.sales.getOverviewAccess)return NONE;
  const value=await runtime.sales.getOverviewAccess({tenantContext,now:new Date(now)});
  if(!value||typeof value!=='object'||Array.isArray(value))return NONE;
  const fields=Object.getOwnPropertyDescriptors(value),field=fields.canViewOverview;
  if(Reflect.ownKeys(fields).length!==1||!field||!('value'in field)||!field.enumerable||typeof field.value!=='boolean')return NONE;
  return field.value?FULL:NONE;
 }catch{return NONE;}
}
