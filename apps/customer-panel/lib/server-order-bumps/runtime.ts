import type { PostgresOrderBumpAdminRepository } from '@celebix/saas-data';
import type { ServerPanelAccessRuntime } from '../server-panel-access/runtime.ts';
import { resolveServerCatalogAdminRuntime, type ServerCatalogAdminRuntime } from '../server-catalog-admin/runtime.ts';

type Repository = Pick<PostgresOrderBumpAdminRepository, 'get' | 'save' | 'options'>;
export type ServerOrderBumpRuntime = ServerCatalogAdminRuntime & Readonly<{ orderBumps: Repository }>;
const repositories = new WeakMap<ServerPanelAccessRuntime, Repository>();

export function registerServerOrderBumpRepository(access: ServerPanelAccessRuntime, repository: Repository): void {
  if (access.readiness.mode !== 'approved_staging' || access.panelOrigin === null || repositories.has(access) || ['get', 'save', 'options'].some(key => typeof repository?.[key as keyof Repository] !== 'function')) throw new Error('order_bump_runtime_invalid');
  repositories.set(access, Object.freeze({ get: repository.get.bind(repository), save: repository.save.bind(repository), options: repository.options.bind(repository) }));
}
export function resolveServerOrderBumpRuntime(access: ServerPanelAccessRuntime): ServerOrderBumpRuntime | null {
  const catalog = resolveServerCatalogAdminRuntime(access), orderBumps = repositories.get(access);
  return catalog && orderBumps ? Object.freeze({ ...catalog, orderBumps }) : null;
}
