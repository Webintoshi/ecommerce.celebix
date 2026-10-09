import { emailMarketingUuid } from '@celebix/saas-contracts';
import { acquirePostgresClient, type PostgresPoolLike, type PostgresTimeoutOptions } from '../postgres/pool.ts';
import { EmailMarketingError } from './errors.ts';
export interface EmailMarketingWebhookEvent {
    readonly eventId: string;
    readonly email: string;
    readonly kind: 'unsubscribe' | 'suppressed';
    readonly scope: 'account' | 'list';
    readonly listId: string | null;
    readonly eventTime: string | null;
}
export interface EmailMarketingWebhookRepository {
    receive(input: Readonly<{
        hostname: string;
        connectionId: string;
        tokenDigest: string;
        events: readonly EmailMarketingWebhookEvent[];
    }>): Promise<Readonly<{
        authenticated: boolean;
        recorded: number;
    }>>;
}
export function createPostgresEmailMarketingWebhookRepository(options: Readonly<{
    pool: PostgresPoolLike;
    timeouts: PostgresTimeoutOptions;
}>): EmailMarketingWebhookRepository { return Object.freeze({ async receive(input: Parameters<EmailMarketingWebhookRepository['receive']>[0]) { emailMarketingUuid(input.connectionId); if (input.hostname !== 'panel.saas-staging.celebix.net' || !/^([a-f0-9]{64})$/.test(input.tokenDigest) || input.events.length > 100)
        throw new EmailMarketingError('invalid_input'); const client = await acquirePostgresClient(options.pool, options.timeouts.poolCheckoutMs); let released = false; try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$2,true),set_config('idle_in_transaction_session_timeout',$3,true)", [`${options.timeouts.statementMs}ms`, `${options.timeouts.lockMs}ms`, `${options.timeouts.idleTransactionMs}ms`]);
        await client.query('SET LOCAL ROLE celebix_saas_host_resolver');
        const r = await client.query('SELECT saas.email_marketing_brevo_hook($1::text,$2::uuid,$3::text,$4::jsonb) AS result', [input.hostname, input.connectionId, input.tokenDigest, JSON.stringify(input.events)]);
        const data = r.rows[0]?.result as {
            authenticated?: boolean;
            recorded?: number;
        } | undefined;
        if (r.rows.length !== 1 || typeof data?.authenticated !== 'boolean' || data.authenticated && (!Number.isInteger(data.recorded) || data.recorded! < 0 || data.recorded! > 100))
            throw new EmailMarketingError('provider_invalid_response');
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
        return Object.freeze({ authenticated: data.authenticated, recorded: data.recorded ?? 0 });
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
    } } }); }
