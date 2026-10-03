import type { PostgresRestockAdminRepository } from '@celebix/saas-data';
import type { ServerPanelAccessRuntime } from '../server-panel-access/runtime.ts';
import { resolveServerCatalogAdminRuntime, type ServerCatalogAdminRuntime } from '../server-catalog-admin/runtime.ts';
type Repository = Pick<PostgresRestockAdminRepository, 'getStats'>;
export type ServerRestockRuntime = ServerCatalogAdminRuntime & Readonly<{ restock: Repository }>;
const repositories = new WeakMap<ServerPanelAccessRuntime, Repository>();
export function registerServerRestockRepository(access: ServerPanelAccessRuntime, repository: Repository): void {
  if (access.readiness.mode !== 'approved_staging' || typeof repository?.getStats !== 'function' || repositories.has(access)) throw Error('restock_runtime_invalid');
  repositories.set(access, repository);
}
export function resolveServerRestockRuntime(access: ServerPanelAccessRuntime): ServerRestockRuntime | null {
  const catalog = resolveServerCatalogAdminRuntime(access), restock = repositories.get(access);
  return catalog && restock ? Object.freeze({ ...catalog, restock }) : null;
}
