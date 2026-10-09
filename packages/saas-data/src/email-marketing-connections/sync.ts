import type { EmailMarketingProvider } from '@celebix/saas-contracts';
import type { MerchantProviderCredentialKeyring } from '../provider-execution/credential-crypto.ts';
import type { EmailMarketingProviderAdapter, EmailMarketingContactState, EmailMarketingProviderResult } from './provider.ts';
import type { EmailMarketingWorkflowRepository, EmailMarketingSyncJob, EmailMarketingSyncAction, EmailMarketingSyncOutcome } from './workflow-types.ts';
import { openEmailMarketingCredential } from './credential-crypto.ts';
import { synchronizeEmailMarketingWebhook } from './hooks.ts';
import { EmailMarketingError } from './errors.ts';
export interface EmailMarketingSyncDependencies {
    readonly repository: EmailMarketingWorkflowRepository;
    readonly providers: Readonly<Record<EmailMarketingProvider, EmailMarketingProviderAdapter>>;
    readonly keyring: MerchantProviderCredentialKeyring;
    readonly now: () => Date;
}
function completion(job: EmailMarketingSyncJob, state: EmailMarketingContactState): boolean { if (state.kind === 'absent')
    return job.progress.action === 'remove_membership'; if (state.kind !== 'known')
    return false; switch (job.progress.action) {
    case 'update_profile': return (!job.audience?.firstName || state.firstName === job.audience.firstName) && (!job.audience?.lastName || state.lastName === job.audience.lastName);
    case 'subscribe': return state.marketingStatus === 'subscribed' && state.listIds.includes(job.listId) && !state.unsubscribedListIds.includes(job.listId) && !!state.consentUpdatedAt && !!job.audience?.consentedAt && Date.parse(state.consentUpdatedAt) === Date.parse(job.audience.consentedAt);
    case 'unsubscribe': return state.marketingStatus === 'unsubscribed' || state.marketingStatus === 'suppressed';
    case 'remove_membership': return !state.listIds.includes(job.listId);
    case 'add_membership': return state.listIds.includes(job.listId) && !state.unsubscribedListIds.includes(job.listId);
    default: return false;
} }
export async function runEmailMarketingSyncJob(job: EmailMarketingSyncJob, deps: EmailMarketingSyncDependencies): Promise<EmailMarketingSyncOutcome['status']> {
    const finish = async (outcome: EmailMarketingSyncOutcome) => { const saved = await deps.repository.finish({ jobId: job.id, leaseToken: job.leaseToken, now: deps.now(), outcome }); return saved ? outcome.status : 'pending'; };
    try {
        if (job.kind === 'bootstrap') {
            await deps.repository.bootstrap(job);
            return 'verified';
        }
        const key = openEmailMarketingCredential(job.phase !== 'queued' && job.reconciliationCredential ? job.reconciliationCredential : job.credential, { storeId: job.storeId, credentialOwnerId: job.connectionId, provider: job.provider, purpose: 'connection', credentialVersion: job.phase !== 'queued' && job.reconciliationCredential ? job.reconciliationCredentialVersion! : job.credentialVersion }, deps.keyring), adapter = deps.providers[job.provider];
        if (job.kind === 'cleanup') {
            await synchronizeEmailMarketingWebhook(job, { repository: deps.repository, keyring: deps.keyring, adapter, apiKey: key, removing: true });
            await deps.repository.cleanup(job);
            return 'pending';
        }
        if (job.kind === 'reconcile') {
            if (!await synchronizeEmailMarketingWebhook(job, { repository: deps.repository, keyring: deps.keyring, adapter, apiKey: key, removing: false }))
                return finish({ status: 'pending' });
            // A single page per tick stays below the two-call polling tour bound.
            const page = await adapter.suppressionPage(key, job.progress.pollCursor, job.progress.pollWatermark ?? null);
            const mapped = new Map<string, typeof page.items[number]>();
            for (const event of page.items) {
                if (event.scope === 'list' && event.listId !== job.listId)
                    continue;
                const previous = mapped.get(event.profileId);
                if (!previous || event.scope === 'account')
                    mapped.set(event.profileId, event);
            }
            await deps.repository.poll(job, { events: [...mapped.values()], ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}), completedThrough: page.completedThrough });
            return page.nextCursor ? 'pending' : 'verified';
        }
        if (!job.email)
            return finish({ status: 'failed', errorCode: 'invalid_input' });
        const state = await adapter.contact(key, job.email);
        if (job.phase !== 'queued') {
            // No elapsed-time heuristic closes a dispatched subscription. Positive readback
            // of the exact historical consent and membership is required.
            if (completion(job, state))
                return finish({ status: 'verified', state, ...(job.progress.action === 'update_profile' ? { profileUpdated: true } : {}) });
            return finish({ status: 'attention', state, errorCode: 'outcome_unknown' });
        }
        let action: EmailMarketingSyncAction;
        if (job.kind === 'unsubscribe' || job.kind === 'remove_membership') {
            action = job.kind;
            if (state.kind === 'absent')
                return finish({ status: 'verified', state });
            if (state.kind !== 'known' || !state.profileId)
                return finish({ status: 'blocked', state });
            if (action === 'unsubscribe' && (state.marketingStatus === 'unsubscribed' || state.marketingStatus === 'suppressed') || action === 'remove_membership' && !state.listIds.includes(job.listId))
                return finish({ status: 'verified', state });
        }
        else {
            if (job.audience?.kind !== 'grant' || job.audience.sequence !== job.consentVersion || !job.audience.consentedAt || !job.audience.evidenceVersion)
                return finish({ status: 'blocked', state });
            if (state.kind === 'absent') {
                if (job.profileId || job.progress.subscribeCompleted)
                    return finish({ status: 'blocked', state });
                action = 'subscribe';
            }
            else if (state.kind !== 'known' || state.marketingStatus !== 'subscribed' || state.suppressionReasons.length || state.unsubscribedListIds.includes(job.listId))
                return finish({ status: 'blocked', state });
            else if (!job.progress.profileUpdated && (job.audience.firstName || job.audience.lastName))
                action = 'update_profile';
            else if (!state.listIds.includes(job.listId))
                action = 'add_membership';
            else
                return finish({ status: 'verified', state });
        }
        if (!await deps.repository.checkpoint({ jobId: job.id, leaseToken: job.leaseToken, now: deps.now(), result: { phase: 'dispatched', credentialVersion: job.credentialVersion, action, state } }))
            return 'pending';
        let result: EmailMarketingProviderResult<unknown>;
        if (action === 'subscribe')
            result = await adapter.subscribeNew(key, { email: job.email, ...(job.audience!.firstName ? { firstName: job.audience!.firstName } : {}), ...(job.audience!.lastName ? { lastName: job.audience!.lastName } : {}) }, { consentedAt: job.audience!.consentedAt!, source: job.audience!.source, version: job.audience!.evidenceVersion! }, job.listId, true);
        else if (action === 'update_profile')
            result = await adapter.updateProfile(key, state.profileId!, { email: job.email, ...(job.audience!.firstName ? { firstName: job.audience!.firstName } : {}), ...(job.audience!.lastName ? { lastName: job.audience!.lastName } : {}) });
        else if (action === 'add_membership')
            result = await adapter.addMembership(key, state.profileId!, job.listId);
        else if (action === 'remove_membership')
            result = await adapter.removeMembership(key, state.profileId!, job.listId);
        else
            result = await adapter.unsubscribe(key, state.profileId!, { kind: 'store' });
        if (result.kind === 'verified')
            return finish({ status: 'verified', state, ...(action === 'update_profile' ? { profileUpdated: true } : {}) });
        await deps.repository.checkpoint({ jobId: job.id, leaseToken: job.leaseToken, now: deps.now(), result: { phase: result.kind === 'accepted' ? 'accepted' : 'unknown', ...(result.providerReference ? { providerReference: result.providerReference } : {}) } });
        return finish({ status: 'pending', errorCode: 'outcome_unknown' });
    }
    catch (error) {
        const code = error instanceof EmailMarketingError ? error.code : 'provider_unavailable';
        if (code === 'outcome_unknown')
            await deps.repository.checkpoint({ jobId: job.id, leaseToken: job.leaseToken, now: deps.now(), result: { phase: 'unknown' } });
        return finish({ status: code === 'outcome_unknown' ? 'pending' : code === 'provider_unauthorized' || code === 'provider_forbidden' ? 'blocked' : 'retry', errorCode: code, ...(error instanceof EmailMarketingError && error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}) });
    }
}
