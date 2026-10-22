import { hasStoreToolLicense, parseStoreToolWorkspace, type StoreToolKey, type TenantContext } from '@celebix/saas-contracts';
import type { StoreToolsRepository } from '@celebix/saas-data';

/** A missing reader preserves legacy facades; a failed reader must never fall back to package rights. */
export async function readStoreToolLicense(runtime: Readonly<{ storeTools?: Pick<StoreToolsRepository, 'read'> }>, tenantContext: TenantContext, now: Date, tool: StoreToolKey): Promise<boolean | null> {
  if (!runtime.storeTools) return null;
  const workspace = parseStoreToolWorkspace(await runtime.storeTools.read({ tenantContext, now }));
  if (workspace.storeId !== tenantContext.store.id) throw Error('store_tools_projection_invalid');
  return hasStoreToolLicense(workspace, tool);
}
