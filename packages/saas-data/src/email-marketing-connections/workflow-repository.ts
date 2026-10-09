import { emailMarketingInteger, emailMarketingUuid, parseEmailMarketingProvider } from '@celebix/saas-contracts';
import { acquirePostgresClient, type PostgresPoolLike, type PostgresTimeoutOptions } from '../postgres/pool.ts';
import { EmailMarketingError } from './errors.ts';
import type { EmailMarketingWorkflowRepository, EmailMarketingSyncJob } from './workflow-types.ts';
function validTime(now: Date) { if (!(now instanceof Date) || !Number.isFinite(now.getTime()))
    throw new EmailMarketingError('invalid_input'); }
function lease(input: {
    jobId: string;
    leaseToken: string;
    now?: Date;
}) { if (input.now)
    validTime(input.now); return { jobId: emailMarketingUuid(input.jobId), leaseToken: emailMarketingUuid(input.leaseToken) }; }
export function createPostgresEmailMarketingWorkflowRepository(options: Readonly<{
    pool: PostgresPoolLike;
    role: 'celebix_saas_workflow';
    timeouts: PostgresTimeoutOptions;
}>): EmailMarketingWorkflowRepository {
    if (options.role !== 'celebix_saas_workflow' || Object.values(options.timeouts).some(n => !Number.isSafeInteger(n) || n < 1 || n > 60000))
        throw new EmailMarketingError('not_configured');
    async function call(action: string, input: unknown): Promise<unknown> { const encoded = JSON.stringify(input); if (Buffer.byteLength(encoded) > 65536)
        throw new EmailMarketingError('invalid_input'); const client = await acquirePostgresClient(options.pool, options.timeouts.poolCheckoutMs); let released = false; try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$2,true),set_config('idle_in_transaction_session_timeout',$3,true)", [`${options.timeouts.statementMs}ms`, `${options.timeouts.lockMs}ms`, `${options.timeouts.idleTransactionMs}ms`]);
        await client.query('SET LOCAL ROLE celebix_saas_workflow');
        const r = await client.query('SELECT saas.email_marketing_work($1::text,$2::jsonb) AS result', [action, encoded]);
        if (r.rows.length !== 1)
            throw new EmailMarketingError('provider_unavailable');
        try {
            await client.query('COMMIT');
            client.release();
            released = true;
        }
        catch {
            client.release(true);
            released = true;
            throw new EmailMarketingError('outcome_unknown');
        }
        return r.rows[0]!.result;
    }
    catch (error) {
        if (!released) {
            try {
                await client.query('ROLLBACK');
                client.release();
            }
            catch {
                client.release(true);
            }
        }
        if (error instanceof EmailMarketingError)
            throw error;
        throw new EmailMarketingError('provider_unavailable');
    } }
    const repo: EmailMarketingWorkflowRepository = {
        async claim(input) { validTime(input.now); validTime(input.leaseUntil); if (!/^[A-Za-z0-9._-]{1,128}$/.test(input.workerId) || !['off', 'revoke_only', 'full'].includes(input.mode) || input.limit < 1 || input.limit > 25 || !Number.isInteger(input.limit) || input.leaseUntil.getTime() - input.now.getTime() !== 90000)
            throw new EmailMarketingError('invalid_input'); const rows = await call('claim', { workerId: input.workerId, mode: input.mode, limit: input.limit, token: emailMarketingUuid(input.token) }); if (!Array.isArray(rows) || rows.length > 2)
            throw new EmailMarketingError('provider_invalid_response'); return Object.freeze(rows.map(value => { if (!value || typeof value !== 'object')
            throw new EmailMarketingError('provider_invalid_response'); const j = value as EmailMarketingSyncJob; emailMarketingUuid(j.id); emailMarketingUuid(j.storeId); emailMarketingUuid(j.connectionId); emailMarketingUuid(j.leaseToken); emailMarketingInteger(j.generation, 1); emailMarketingInteger(j.credentialVersion, 1); if (j.consentVersion !== null)
            emailMarketingInteger(j.consentVersion); parseEmailMarketingProvider(j.provider); if (!['bootstrap', 'profile', 'subscribe', 'unsubscribe', 'remove_membership', 'reconcile', 'cleanup'].includes(j.kind) || !['queued', 'dispatched', 'accepted', 'unknown'].includes(j.phase) || !Number.isFinite(Date.parse(j.leaseUntil)) || !j.credential || !j.progress || !j.listId)
            throw new EmailMarketingError('provider_invalid_response'); return Object.freeze(j); })); },
        async checkpoint(input) { return await call('checkpoint', { ...lease(input), result: input.result }) === true; },
        async finish(input) { return await call('finish', { ...lease(input), outcome: input.outcome }) === true; },
        async hookCheckpoint(job, result) { return await call('hook_checkpoint', { ...lease({ jobId: job.id, leaseToken: job.leaseToken }), ...result }) === true; },
        async bootstrap(job) { return await call('bootstrap', lease({ jobId: job.id, leaseToken: job.leaseToken })) === true; },
        async cleanup(job) { return await call('cleanup', lease({ jobId: job.id, leaseToken: job.leaseToken })) === true; },
        async poll(job, page) { return await call('poll', { ...lease({ jobId: job.id, leaseToken: job.leaseToken }), page }) === true; },
        async recordProviderEvent(input) { validTime(input.receivedAt); if (input.eventTime !== null && !Number.isFinite(Date.parse(input.eventTime)))
            throw new EmailMarketingError('invalid_input'); const result = await call('event', { connectionId: emailMarketingUuid(input.connectionId), eventId: input.eventId, eventTime: input.eventTime, event: input.event }); if (result !== 'recorded' && result !== 'replayed' && result !== 'rejected')
            throw new EmailMarketingError('provider_invalid_response'); return result; },
        async reconcileDue(input) { validTime(input.now); if (input.limit < 1 || input.limit > 25 || !Number.isInteger(input.limit) || !['off', 'revoke_only', 'full'].includes(input.mode))
            throw new EmailMarketingError('invalid_input'); return emailMarketingInteger(await call('schedule', { mode: input.mode, limit: input.limit })); },
        async reserveRate(connectionId, provider, bucket) { const result = await call('rate', { connectionId: emailMarketingUuid(connectionId), provider: parseEmailMarketingProvider(provider), bucket }) as {
            allowed?: boolean;
            retryAfterSeconds?: number;
        }; if (result?.allowed !== true)
            throw new EmailMarketingError('provider_rate_limited', typeof result?.retryAfterSeconds === 'number' ? result.retryAfterSeconds : 60); }
    };
    return Object.freeze(repo);
}
