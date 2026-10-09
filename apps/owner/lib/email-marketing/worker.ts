import { runEmailMarketingSyncJob, type EmailMarketingSyncDependencies, type EmailMarketingWorkflowRepository, type EmailMarketingSyncJob, type EmailMarketingWorkerMode, type EmailMarketingTickSummary, type EmailMarketingSyncOutcome } from '@celebix/saas-data';
export interface EmailMarketingWorkerOptions extends EmailMarketingSyncDependencies {
    readonly workerId: string;
    readonly mode: EmailMarketingWorkerMode;
    readonly uuid: () => string;
    readonly providersForJob?: (job: EmailMarketingSyncJob) => EmailMarketingSyncDependencies['providers'];
    readonly runJob?: typeof runEmailMarketingSyncJob;
}
const empty = (): EmailMarketingTickSummary => ({ claimed: 0, verified: 0, blocked: 0, pending: 0, failed: 0 });
export function createEmailMarketingWorker(options: EmailMarketingWorkerOptions): Readonly<{
    runOnce(): Promise<EmailMarketingTickSummary>;
}> { if (!/^[A-Za-z0-9._-]{1,128}$/.test(options.workerId) || !['off', 'revoke_only', 'full'].includes(options.mode))
    throw new Error('email_marketing_worker_invalid'); let running = false; return Object.freeze({ async runOnce() { if (running || options.mode === 'off')
        return empty(); running = true; try {
        const now = options.now();
        await options.repository.reconcileDue({ now, limit: 25, mode: options.mode });
        const jobs = await options.repository.claim({ now, leaseUntil: new Date(now.getTime() + 90000), workerId: options.workerId, mode: options.mode, limit: 25, token: options.uuid() });
        if (jobs.length > 2)
            throw new Error('email_marketing_claim_limit');
        const summary = { ...empty(), claimed: jobs.length };
        await Promise.all(jobs.map(async (job) => { try {
            const deps = { ...options, providers: options.providersForJob?.(job) ?? options.providers }, status = await (options.runJob ?? runEmailMarketingSyncJob)(job, deps);
            if (status === 'verified')
                summary.verified++;
            else if (status === 'blocked')
                summary.blocked++;
            else if (status === 'failed')
                summary.failed++;
            else
                summary.pending++;
        }
        catch {
            summary.failed++;
        } }));
        return Object.freeze(summary);
    }
    finally {
        running = false;
    } } }); }
