import type { EmailMarketingConnectionRepository, EmailMarketingWebhookRepository } from '@celebix/saas-data';
import {parseEmailMarketingProviderAvailability, type EmailMarketingProviderAvailability} from '@celebix/saas-contracts';
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
    providerAvailability: EmailMarketingProviderAvailability;
}>;
const repositories = new WeakMap<ServerPanelAccessRuntime, EmailMarketingConnectionRepository>(), hooks = new WeakMap<ServerPanelAccessRuntime, EmailMarketingWebhookRepository>();
const availability = new WeakMap<ServerPanelAccessRuntime, EmailMarketingProviderAvailability>();
export const DEFAULT_EMAIL_PROVIDER_AVAILABILITY = Object.freeze({brevo:false,klaviyo:true});
const METHODS = ['overview', 'candidateProvider', 'validate', 'lists', 'preview', 'apply', 'rotate', 'recheck', 'disconnect', 'sync'] as const;
export function registerServerEmailMarketingRepository(access: ServerPanelAccessRuntime, repository: EmailMarketingConnectionRepository, providerAvailability: EmailMarketingProviderAvailability = DEFAULT_EMAIL_PROVIDER_AVAILABILITY): void { if (access.readiness.mode !== 'approved_staging' || !access.panelOrigin || repositories.has(access) || METHODS.some(method => typeof repository[method] !== 'function'))
    throw Error('server_email_marketing_runtime_invalid');
    availability.set(access,parseEmailMarketingProviderAvailability(providerAvailability));
    repositories.set(access, Object.freeze(Object.fromEntries(METHODS.map(method => [method, repository[method].bind(repository)]))) as unknown as EmailMarketingConnectionRepository); }
export function resolveServerEmailMarketingRuntime(access: ServerPanelAccessRuntime): ServerEmailMarketingRuntime | null { const email = repositories.get(access); return access.readiness.mode === 'approved_staging' && access.panelOrigin && email ? Object.freeze({ access: access as ApprovedServerPanelAccessRuntime, email,providerAvailability:availability.get(access) ?? DEFAULT_EMAIL_PROVIDER_AVAILABILITY }) : null; }
export function registerServerEmailMarketingWebhookRepository(access: ServerPanelAccessRuntime, repository: EmailMarketingWebhookRepository): void { if (access.readiness.mode !== 'approved_staging' || !access.panelOrigin || hooks.has(access) || typeof repository.receive !== 'function')
    throw Error('server_email_marketing_runtime_invalid'); hooks.set(access, Object.freeze({ receive: repository.receive.bind(repository) })); }
export function resolveServerEmailMarketingWebhookRepository(access: ServerPanelAccessRuntime): EmailMarketingWebhookRepository | null { return access.readiness.mode === 'approved_staging' ? hooks.get(access) ?? null : null; }
