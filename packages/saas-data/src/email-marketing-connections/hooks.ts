import { randomBytes, createHash } from 'node:crypto';
import { sealEmailMarketingCredential, openEmailMarketingCredential } from './credential-crypto.ts';
import type { MerchantProviderCredentialKeyring } from '../provider-execution/credential-crypto.ts';
import type { EmailMarketingProviderAdapter } from './provider.ts';
import type { EmailMarketingSyncJob, EmailMarketingWorkflowRepository } from './workflow-types.ts';
export async function synchronizeEmailMarketingWebhook(job: EmailMarketingSyncJob, deps: Readonly<{
    repository: EmailMarketingWorkflowRepository;
    keyring: MerchantProviderCredentialKeyring;
    adapter: EmailMarketingProviderAdapter;
    apiKey: string;
    removing: boolean;
}>): Promise<boolean> {
    const adapter = deps.adapter;
    if (job.provider !== 'brevo' || !adapter.createWebhook || !adapter.findWebhook || !adapter.deleteWebhook)
        return true;
    const hook = job.webhook, url = `https://panel.saas-staging.celebix.net/api/marketing/email-connections/webhooks/brevo/${job.connectionId}`;
    const mark = (value: Parameters<EmailMarketingWorkflowRepository['hookCheckpoint']>[1]) => deps.repository.hookCheckpoint(job, value);
    if (!hook?.credential) {
        if (deps.removing)
            return true;
        const secret = randomBytes(32).toString('base64url'), credential = sealEmailMarketingCredential(secret, { storeId: job.storeId, credentialOwnerId: job.connectionId, provider: 'brevo', purpose: 'webhook', credentialVersion: 1 }, deps.keyring);
        if (!await mark({ state: 'dispatched', credential, tokenDigest: createHash('sha256').update(secret).digest('hex') }))
            return false;
        try {
            const result = await adapter.createWebhook(deps.apiKey, url, secret);
            await mark(result.kind === 'verified' ? { state: 'verified', id: result.value } : { state: 'unknown' });
        }
        catch {
            await mark({ state: 'unknown' });
        }
        return false;
    }
    if (hook.state === 'removed')
        return true;
    if (hook.state === 'verified' && !deps.removing)
        return true;
    const secret = openEmailMarketingCredential(hook.credential, { storeId: job.storeId, credentialOwnerId: job.connectionId, provider: 'brevo', purpose: 'webhook', credentialVersion: hook.version }, deps.keyring), found = await adapter.findWebhook(deps.apiKey, url, secret);
    if (found.kind === 'ambiguous') {
        await mark({ state: 'unknown' });
        return !deps.removing;
    }
    if (found.kind === 'missing') {
        // An unknown create can still materialize later; absence is not completion.
        if (deps.removing && hook.id) {
            await mark({ state: 'removed' });
            return true;
        }
        return !deps.removing;
    }
    if (!deps.removing) {
        await mark({ state: 'verified', id: found.id });
        return true;
    }
    if (!await mark({ state: 'removing', id: found.id }))
        return false;
    try {
        const result = await adapter.deleteWebhook(deps.apiKey, found.id);
        if (result.kind === 'verified') {
            await mark({ state: 'removed', id: found.id });
            return true;
        }
    }
    catch { /* The next read checks only this exact authenticated hook. */ }
    return false;
}
