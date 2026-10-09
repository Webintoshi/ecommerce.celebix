import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createEmailMarketingProviders, createPostgresEmailMarketingWorkflowRepository, type PostgresPoolLike } from '@celebix/saas-data';
import type { EmailMarketingWorkerConfig } from './config.ts';
import { createEmailMarketingWorker } from './worker.ts';
const TIMEOUTS = Object.freeze({ poolCheckoutMs: 2000, statementMs: 5000, lockMs: 2000, idleTransactionMs: 5000 });
type PoolResource = PostgresPoolLike & Readonly<{
    end(): Promise<void>;
}>;
export interface EmailMarketingProductionDependencies {
    readonly createPool: (url: string, name: string) => PoolResource;
    readonly fetch: typeof fetch;
    readonly now: () => Date;
    readonly uuid: () => string;
}
const defaults: EmailMarketingProductionDependencies = { createPool: (url, name) => { const pool = new pg.Pool({ connectionString: url, application_name: name, max: 4, connectionTimeoutMillis: 2000, idleTimeoutMillis: 10000 }); pool.on('error', () => undefined); return pool; }, fetch: (url, init) => globalThis.fetch(url, init), now: () => new Date(), uuid: randomUUID };
export async function initializeEmailMarketingProductionRuntime(config: EmailMarketingWorkerConfig, deps: EmailMarketingProductionDependencies = defaults) {
    const pool = deps.createPool(config.database.url, `celebix-email-marketing-${config.workerId}`);
    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN READ ONLY');
            await client.query("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$2,true),set_config('idle_in_transaction_session_timeout',$3,true)", ['5000ms', '2000ms', '5000ms']);
            await client.query('SET LOCAL ROLE celebix_saas_workflow');
            const r = await client.query("SELECT current_setting('server_version_num')::int AS version,current_database() AS database_name,current_user AS role,roles.rolsuper AS superuser,pg_has_role(session_user,'celebix_saas_workflow','MEMBER') AS member,to_regprocedure('saas.email_marketing_work(text,jsonb)') IS NOT NULL AS lifecycle FROM pg_roles roles WHERE roles.rolname=session_user");
            const row = r.rows[0];
            if (r.rows.length !== 1 || !row || Math.floor(Number(row.version) / 10000) !== 16 || row.database_name !== config.database.name || row.role !== 'celebix_saas_workflow' || row.superuser !== false || row.member !== true || row.lifecycle !== true)
                throw new Error('email_marketing_preflight_failed');
            await client.query('COMMIT');
        }
        catch (error) {
            await client.query('ROLLBACK').catch(() => { });
            throw error;
        }
        finally {
            client.release();
        }
        const repository = createPostgresEmailMarketingWorkflowRepository({ pool, role: 'celebix_saas_workflow', timeouts: TIMEOUTS }), providers = createEmailMarketingProviders({ fetch: deps.fetch, now: deps.now });
        const worker = createEmailMarketingWorker({ repository, providers, providersForJob: job => createEmailMarketingProviders({ fetch: deps.fetch, now: deps.now, reserveRate: (provider, bucket) => repository.reserveRate(job.connectionId, provider, bucket) }), keyring: config.keyring, mode: config.mode, workerId: config.workerId, now: deps.now, uuid: deps.uuid });
        return Object.freeze({ runOnce: worker.runOnce, async close() { await pool.end(); for (const key of config.keyring.keys)
                key.key.fill(0); } });
    }
    catch (error) {
        await pool.end().catch(() => { });
        for (const key of config.keyring.keys)
            key.key.fill(0);
        throw error;
    }
}
