import { ToshiProviderRepositoryError } from '../toshi-providers/errors.ts';
import { parseContentGenerationView } from '../../../saas-contracts/src/content-authoring/validation.ts';
import { acquirePostgresClient, type PostgresClientLike } from '../postgres/pool.ts';
import { exactToshiInput as rawExact, toshiAuthority as rawAuthority, toshiUuid as rawUuid, toshiVersion as rawVersion, toshiSelectedModel as rawSelectedModel } from '../toshi-providers/canonical.ts';
import { CONTENT_AUTHORING_ERROR_CODES, ContentAuthoringRepositoryError } from './errors.ts';
import type { ContentAuthoringRepositoryErrorCode } from './errors.ts';
import type { BeginContentGenerationInput, BeginContentGenerationResult, ClaimContentGenerationInput, CompleteContentGenerationInput, ContentAuthoringRepository, ContentGeneration, ContentGenerationDispatchClaim, ContentGenerationView, FailContentGenerationInput, GetContentGenerationInput, PostgresContentAuthoringRepositoryOptions, ContentGenerationAuthorityInput } from './types.ts';
const codes = new Set<string>(CONTENT_AUTHORING_ERROR_CODES);
function fail(code: ContentAuthoringRepositoryErrorCode = 'invalid_input'): never {
    throw new ContentAuthoringRepositoryError(code);
}
function canonical<T>(fn: () => T): T {
    try {
        return fn();
    }
    catch (error) {
        if (error instanceof ContentAuthoringRepositoryError)
            throw error;
        if (error instanceof ToshiProviderRepositoryError && codes.has(error.code))
            fail(error.code as ContentAuthoringRepositoryErrorCode);
        fail('invalid_input');
    }
}
const exactToshiInput = (...args: Parameters<typeof rawExact>) => canonical(() => rawExact(...args));
const toshiAuthority = (...args: Parameters<typeof rawAuthority>) => canonical(() => rawAuthority(...args));
const toshiUuid = (...args: Parameters<typeof rawUuid>) => canonical(() => rawUuid(...args));
const toshiVersion = (...args: Parameters<typeof rawVersion>) => canonical(() => rawVersion(...args));
const toshiSelectedModel = (...args: Parameters<typeof rawSelectedModel>) => canonical(() => rawSelectedModel(...args));
function digest(v: unknown): string {
    if (typeof v !== 'string' || !/^[a-f0-9]{64}$/.test(v))
        fail();
    return v;
}
function safeCode(v: unknown): string {
    if (typeof v !== 'string' || !['invalid_input', 'rate_limited', 'quota_exceeded', 'provider_timeout', 'provider_unavailable', 'invalid_output', 'cancelled', 'credential_invalid', 'connection_revoked', 'model_unavailable', 'unavailable'].includes(v))
        fail();
    return v;
}
function parseGeneration(v: unknown): ContentGeneration {
    const r = exactToshiInput(v, ['id', 'draftId', 'productId', 'status', 'requestFingerprint', 'sourceFingerprint', 'configId', 'provider', 'model', 'credentialVersion', 'promptVersion', 'version', 'dispatchState', 'claimToken', 'leaseExpiresAt', 'usage', 'draft', 'safeCode', 'createdAt', 'updatedAt', 'finishedAt']);
    toshiUuid(r.id);
    toshiUuid(r.draftId);
    toshiUuid(r.configId);
    if (r.productId !== null)
        toshiUuid(r.productId);
    digest(r.requestFingerprint);
    digest(r.sourceFingerprint);
    toshiVersion(r.version, 1);
    toshiVersion(r.credentialVersion, 1);
    if (!['pending', 'completed', 'failed', 'unknown'].includes(r.status as string) || !['not_dispatched', 'dispatched', 'unknown'].includes(r.dispatchState as string))
        fail('unavailable');
    if (r.claimToken !== null)
        toshiUuid(r.claimToken);
    for (const k of ['createdAt', 'updatedAt', 'finishedAt', 'leaseExpiresAt']) {
        if (r[k] === null && ['finishedAt', 'leaseExpiresAt'].includes(k))
            continue;
        if (typeof r[k] !== 'string' || !Number.isFinite(Date.parse(r[k] as string)))
            fail('unavailable');
    }
    if (r.usage !== null)
        usage(r.usage);
    if (typeof r.model !== 'string' || typeof r.provider !== 'string' || typeof r.promptVersion !== 'string')
        fail('unavailable');
    const result = Object.freeze({
        ...r
    }) as unknown as ContentGeneration;
    toContentGenerationView(result);
    return result;
}
function usage(v: unknown) {
    const r = exactToshiInput(v, ['inputTokens', 'outputTokens', 'totalTokens']);
    for (const x of Object.values(r))
        if (!Number.isSafeInteger(x) || (x as number) < 0 || (x as number) > 2147483647)
            fail();
    if ((r.inputTokens as number) + (r.outputTokens as number) !== r.totalTokens)
        fail();
    return r;
}
export function toContentGenerationView(g: ContentGeneration): ContentGenerationView {
    return Object.freeze(parseContentGenerationView({
        id: g.id, draftId: g.draftId, productId: g.productId, status: g.status, draft: g.draft, sourceFingerprint: g.sourceFingerprint, usage: g.usage, safeCode: g.safeCode, createdAt: g.createdAt, updatedAt: g.updatedAt, finishedAt: g.finishedAt
    }));
}
export class PostgresContentAuthoringRepository implements ContentAuthoringRepository {
    constructor(private readonly options: PostgresContentAuthoringRepositoryOptions) {
        if (options.role !== 'celebix_saas_app' || typeof options.audit !== 'function' || typeof options.pool?.connect !== 'function')
            fail('unavailable');
        for (const n of Object.values(options.timeouts))
            if (!Number.isSafeInteger(n) || n < 1 || n > 60000)
                fail('unavailable');
    }
    private authority(input: ContentGenerationAuthorityInput, configuration = false): unknown[] {
        const a = toshiAuthority(input.tenantContext, input.now);
        if (!(configuration ? ['store_owner', 'admin'] : ['store_owner', 'admin', 'editor']).includes(input.tenantContext.membership.role))
            fail('membership_denied');
        return [a.storeId, a.principalId, a.membershipId, a.planId, a.planCode, a.planVersion, a.now];
    }
    private async run(name: string, values: unknown[]): Promise<{
        outcome: string;
        payload: unknown;
    }> {
        let client: PostgresClientLike;
        try {
            client = await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs);
        }
        catch {
            fail('unavailable');
        }
        let committed = false;
        try {
            await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
            for (const [key, n] of Object.entries({
                statement_timeout: this.options.timeouts.statementMs, lock_timeout: this.options.timeouts.lockMs, idle_in_transaction_session_timeout: this.options.timeouts.idleTransactionMs
            }))
                await client.query(`SELECT pg_catalog.set_config('${key}', $1, true)`, [`${n}ms`]);
            await client.query('SET LOCAL ROLE celebix_saas_app');
            const result = await client.query(`SELECT outcome,result_payload FROM saas.content_authoring_${name}(${values.map((_, i) => `$${i + 1}`).join(',')})`, values);
            if (result.rows.length !== 1 || result.rowCount !== 1)
                fail('unavailable');
            const row = exactToshiInput(result.rows[0], ['outcome', 'result_payload']);
            if (typeof row.outcome !== 'string')
                fail('unavailable');
            // Even an expired operation transition must commit before reporting its fence failure.
            try {
                await client.query('COMMIT');
                committed = true;
            }
            catch {
                committed = true;
                client.release(true);
                try {
                    void Promise.resolve(this.options.audit({
                        type: 'content_authoring_commit_unknown'
                    })).catch(() => {
                    });
                }
                catch {
                }
                fail('commit_unknown');
            }
            client.release();
            if (codes.has(row.outcome))
                fail(row.outcome as ContentAuthoringRepositoryErrorCode);
            return {
                outcome: row.outcome, payload: row.result_payload
            };
        }
        catch (e) {
            if (!committed) {
                try {
                    await client.query('ROLLBACK');
                    client.release();
                }
                catch {
                    client.release(true);
                }
            }
            if (e instanceof ContentAuthoringRepositoryError)
                throw e;
            fail('unavailable');
        }
    }
    private async generation(name: string, values: unknown[]): Promise<ContentGeneration> {
        const r = await this.run(name, values);
        try {
            return parseGeneration(r.payload);
        }
        catch {
            fail('unavailable');
        }
    }
    async beginGeneration(i: BeginContentGenerationInput): Promise<BeginContentGenerationResult> {
        let values: unknown[];
        try {
            exactToshiInput(i, ['tenantContext', 'now', 'operationId', 'requestFingerprint', 'providerBinding', 'envelope']);
            const b = exactToshiInput(i.providerBinding, ['configId', 'provider', 'model', 'credentialVersion', 'promptVersion']), e = exactToshiInput(i.envelope, ['draftId', 'productId', 'sourceFingerprint']);
            if (!['openai', 'gemini', 'anthropic', 'deepseek'].includes(b.provider as string))
                fail();
            values = [...this.authority(i), toshiUuid(i.operationId), digest(i.requestFingerprint), toshiUuid(e.draftId), e.productId === null ? null : toshiUuid(e.productId), digest(e.sourceFingerprint), toshiUuid(b.configId), b.provider, toshiSelectedModel(b.model), toshiVersion(b.credentialVersion, 1), toshiSelectedModel(b.promptVersion)];
        }
        catch (e) {
            if (e instanceof ContentAuthoringRepositoryError)
                throw e;
            fail();
        }
        const r = await this.run('begin', values);
        if (!['pending', 'replayed-result', 'existing-status'].includes(r.outcome))
            fail('unavailable');
        return {
            kind: r.outcome as BeginContentGenerationResult['kind'], generation: parseGeneration(r.payload)
        };
    }
    async claimGenerationDispatch(i: ClaimContentGenerationInput): Promise<ContentGenerationDispatchClaim> {
        const g = await this.generation('claim', [...this.authority(i), toshiUuid(i.operationId), toshiVersion(i.expectedVersion, 1)]);
        if (g.status !== 'pending' || g.dispatchState !== 'dispatched' || !g.claimToken || !g.leaseExpiresAt)
            fail('unavailable');
        return Object.freeze({
            claimToken: g.claimToken, version: g.version, leaseExpiresAt: g.leaseExpiresAt
        });
    }
    async getGeneration(i: GetContentGenerationInput): Promise<ContentGeneration> {
        return this.generation('get', [...this.authority(i), toshiUuid(i.operationId)]);
    }
    async completeGeneration(i: CompleteContentGenerationInput): Promise<ContentGeneration> {
        if (i.usage !== null)
            usage(i.usage);
        if (!i.validatedDraft || typeof i.validatedDraft !== 'object')
            fail();
        digest(i.validatedDraft.sourceFingerprint);
        try {
            parseContentGenerationView({
                id: i.operationId, draftId: i.operationId, productId: null, status: 'completed', draft: i.validatedDraft, sourceFingerprint: i.validatedDraft.sourceFingerprint, usage: i.usage, safeCode: null, createdAt: i.now.toISOString(), updatedAt: i.now.toISOString(), finishedAt: i.now.toISOString()
            });
        }
        catch {
            fail();
        }
        return this.generation('complete', [...this.authority(i), toshiUuid(i.operationId), toshiUuid(i.claimToken), toshiVersion(i.expectedVersion, 1), JSON.stringify(i.validatedDraft), i.usage === null ? null : JSON.stringify(i.usage)]);
    }
    async failGeneration(i: FailContentGenerationInput): Promise<ContentGeneration> {
        if (!['not_dispatched', 'dispatched', 'unknown'].includes(i.dispatchState))
            fail();
        return this.generation('fail', [...this.authority(i), toshiUuid(i.operationId), i.claimToken === null ? null : toshiUuid(i.claimToken), toshiVersion(i.expectedVersion, 1), safeCode(i.safeCode), i.dispatchState]);
    }
    async setDailyLimit(i: ContentGenerationAuthorityInput & Readonly<{
        dailyLimit: number;
    }>): Promise<number> {
        if (!Number.isSafeInteger(i.dailyLimit) || i.dailyLimit < 1 || i.dailyLimit > 10000)
            fail();
        const r = await this.run('set_daily_limit', [...this.authority(i, true), i.dailyLimit]);
        if (r.outcome !== 'updated' || r.payload !== i.dailyLimit)
            fail('unavailable');
        return i.dailyLimit;
    }
}
