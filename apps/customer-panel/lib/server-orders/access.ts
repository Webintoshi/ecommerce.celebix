import 'server-only';

import {cache} from 'react';
import {isMerchantActionAllowed, type TenantContext} from '@celebix/saas-contracts';
import {resolveDefaultServerPanelAccessRuntime} from '../server-panel-access/default.ts';
import {resolveServerOrdersRuntime} from './runtime.ts';

const NONE = Object.freeze({canManageOrders:false});
const FULL = Object.freeze({canManageOrders:true});

/** Request-local presentation only. Every order RPC checks durable authority independently. */
export const resolvePanelOrdersAccess = cache(async (tenantContext:TenantContext):Promise<Readonly<{canManageOrders:boolean}>> => {
  const role=tenantContext.membership.role;
  if (role !== 'cashier') return isMerchantActionAllowed(role,'orders.manage') ? FULL : NONE;
  try {
    const runtime=resolveServerOrdersRuntime(await resolveDefaultServerPanelAccessRuntime());
    if (!runtime?.orders.getAccess) return NONE;
    const value=await runtime.orders.getAccess({tenantContext,now:new Date()});
    if (!value || typeof value !== 'object' || Array.isArray(value)) return NONE;
    const fields=Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(fields).length!==1 || !Object.hasOwn(fields,'canManageOrders') || !('value' in fields.canManageOrders) || !fields.canManageOrders.enumerable || typeof fields.canManageOrders.value!=='boolean') return NONE;
    return fields.canManageOrders.value ? FULL : NONE;
  } catch { return NONE; }
});
