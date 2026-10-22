import type { OrderEditRepository } from '@celebix/saas-data';
import type { ServerPanelAccessRuntime } from '../server-panel-access/runtime.ts';
import type { ServerOrdersRuntime } from '../server-orders/runtime.ts';
export type ServerOrderEditRuntime = Pick<ServerOrdersRuntime, 'access'> & Readonly<{
    edit: OrderEditRepository;
}>;
const repositories = new WeakMap<ServerPanelAccessRuntime, OrderEditRepository>();
export function registerServerOrderEditRepository(access: ServerPanelAccessRuntime, repository: OrderEditRepository) { if (access.readiness.mode !== 'approved_staging' || !access.panelOrigin || repositories.has(access))
    throw Error('order_edit_runtime_invalid'); const methods = ['workspace', 'products', 'preview', 'apply'] as const; if (methods.some(name => typeof repository[name] !== 'function'))
    throw Error('order_edit_runtime_invalid'); repositories.set(access, Object.freeze(Object.fromEntries(methods.map(name => [name, repository[name].bind(repository)]))) as unknown as OrderEditRepository); }
export function resolveServerOrderEditRuntime(access: ServerPanelAccessRuntime): ServerOrderEditRuntime | null { const edit = repositories.get(access); return access.readiness.mode === 'approved_staging' && access.panelOrigin && edit ? { access: access as ServerOrdersRuntime['access'], edit } : null; }
