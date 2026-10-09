import type { EmailMarketingConnectionRepository, EmailMarketingWebhookRepository } from '@celebix/saas-data';
import type { ServerPanelAccessRuntime } from '../server-panel-access/runtime.ts';
export type ApprovedServerPanelAccessRuntime = ServerPanelAccessRuntime & Readonly<{
    readiness: Readonly<{
        mode: 'approved_staging';
    }>;
    panelOrigin: string;
}>;
export type ServerEmailMarketingRuntime = Readonly<{
    access: ApprovedServerPanelAccessRuntime;
    email: EmailMarketingConnectionRepository;
}>;
const repositories = new WeakMap<ServerPanelAccessRuntime, EmailMarketingConnectionRepository>(), hooks = new WeakMap<ServerPanelAccessRuntime, EmailMarketingWebhookRepository>();
const METHODS = ['overview', 'validate', 'lists', 'preview', 'apply', 'rotate', 'recheck', 'disconnect', 'sync'] as const;
export function registerServerEmailMarketingRepository(access: ServerPanelAccessRuntime, repository: EmailMarketingConnectionRepository): void { if (access.readiness.mode !== 'approved_staging' || !access.panelOrigin || repositories.has(access) || METHODS.some(method => typeof repository[method] !== 'function'))
    throw Error('server_email_marketing_runtime_invalid'); repositories.set(access, Object.freeze(Object.fromEntries(METHODS.map(method => [method, repository[method].bind(repository)]))) as unknown as EmailMarketingConnectionRepository); }
export function resolveServerEmailMarketingRuntime(access: ServerPanelAccessRuntime): ServerEmailMarketingRuntime | null { const email = repositories.get(access); return access.readiness.mode === 'approved_staging' && access.panelOrigin && email ? Object.freeze({ access: access as ApprovedServerPanelAccessRuntime, email }) : null; }
export function registerServerEmailMarketingWebhookRepository(access: ServerPanelAccessRuntime, repository: EmailMarketingWebhookRepository): void { if (access.readiness.mode !== 'approved_staging' || !access.panelOrigin || hooks.has(access) || typeof repository.receive !== 'function')
    throw Error('server_email_marketing_runtime_invalid'); hooks.set(access, Object.freeze({ receive: repository.receive.bind(repository) })); }
export function resolveServerEmailMarketingWebhookRepository(access: ServerPanelAccessRuntime): EmailMarketingWebhookRepository | null { return access.readiness.mode === 'approved_staging' ? hooks.get(access) ?? null : null; }
