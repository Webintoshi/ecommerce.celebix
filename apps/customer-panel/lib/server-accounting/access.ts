import 'server-only';

import { cache } from 'react';
import { hasCommercialCapability, parseAccountingAccess, type AccountingAccess, type TenantContext } from '@celebix/saas-contracts';
import { resolveDefaultServerPanelAccessRuntime } from '../server-panel-access/default.ts';
import { resolveServerAccountingRuntime } from './runtime.ts';

const NONE: AccountingAccess = Object.freeze({ canManageAccounting: false, canCollectReceivables: false });
const FULL: AccountingAccess = Object.freeze({ canManageAccounting: true, canCollectReceivables: true });

/** Request-local presentation data. Financial RPCs independently enforce the grant. */
export const resolvePanelAccountingAccess = cache(async (tenantContext: TenantContext): Promise<AccountingAccess> => {
  if (!hasCommercialCapability(tenantContext.entitlements, 'accounting')) return NONE;
  const role = tenantContext.membership.role;
  if (role === 'store_owner' || role === 'admin') return FULL;
  if (role !== 'cashier') return NONE;
  try {
    const runtime = resolveServerAccountingRuntime(await resolveDefaultServerPanelAccessRuntime());
    if (!runtime) return NONE;
    return parseAccountingAccess(await runtime.accounting.access({ tenantContext, now: new Date() }));
  } catch {
    return NONE;
  }
});
