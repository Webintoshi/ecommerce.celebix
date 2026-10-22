import type { StoreToolsRepository } from '@celebix/saas-data';
import type { ServerPanelAccessRuntime } from '../server-panel-access/runtime.ts';

export type ServerStoreToolsRuntime = Readonly<{
  access: ServerPanelAccessRuntime & Readonly<{ panelOrigin: string }>;
  storeTools: StoreToolsRepository;
}>;
const repositories = new WeakMap<ServerPanelAccessRuntime, StoreToolsRepository>();

export function registerServerStoreToolsRepository(access: ServerPanelAccessRuntime, repository: StoreToolsRepository): void {
  if (access.readiness.mode !== 'approved_staging' || !access.panelOrigin || repositories.has(access) || typeof repository?.read !== 'function' || typeof repository?.request !== 'function') throw TypeError('store_tools_runtime_invalid');
  repositories.set(access, Object.freeze({ read: repository.read.bind(repository), request: repository.request.bind(repository) }));
}

export function resolveServerStoreToolsRuntime(access: ServerPanelAccessRuntime): ServerStoreToolsRuntime | null {
  const storeTools = repositories.get(access);
  return storeTools && access.readiness.mode === 'approved_staging' && access.panelOrigin ? Object.freeze({ access: access as ServerStoreToolsRuntime['access'], storeTools }) : null;
}

export function resolveStoreToolsRepository(access: ServerPanelAccessRuntime): StoreToolsRepository | undefined {
  return resolveServerStoreToolsRuntime(access)?.storeTools;
}
