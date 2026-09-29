import { parseContentResourceTarget, parseContentOutline, parseContentResourceDraft, parseContentResourceUsage, parseContentResourceGeneration, parseContentResourceGenerationView, type ContentResourceGeneration } from '@celebix/saas-contracts';
import { authority as manualAuthority, exact as manualExact, uuid as manualUuid, version as manualVersion, fingerprint as manualDigest } from '../merchant-content/validation.ts';
import { acquirePostgresClient, type PostgresClientLike } from '../postgres/pool.ts';
import { CONTENT_RESOURCE_AUTHORING_ERROR_CODES, ContentResourceAuthoringRepositoryError, type ContentResourceAuthoringErrorCode } from './errors.ts';
import type { ContentResourceAuthoringRepository, PostgresContentResourceAuthoringRepositoryOptions, ResourceGenerationAuthority, BeginContentResourceGenerationInput, BeginContentResourceGenerationResult, ClaimContentResourceGenerationInput, CompleteContentResourceGenerationInput, FailContentResourceGenerationInput } from './types.ts';
const CODES = new Set<string>(CONTENT_RESOURCE_AUTHORING_ERROR_CODES);
function fail(code: ContentResourceAuthoringErrorCode = 'invalid_input'): never { throw new ContentResourceAuthoringRepositoryError(code); }
function validated<T>(fn: () => T): T { try {
    return fn();
}
catch (error) {
    if (error instanceof ContentResourceAuthoringRepositoryError)
        throw error;
    const d = error && typeof error === 'object' ? Object.getOwnPropertyDescriptor(error, 'code') : null;
    fail(d && 'value' in d && typeof d.value === 'string' && CODES.has(d.value) ? d.value as ContentResourceAuthoringErrorCode : 'invalid_input');
} }
const exact = (v: unknown, required: readonly string[], optional: readonly string[] = []) => validated(() => manualExact(v, required, optional));
const uuid = (v: unknown) => validated(() => manualUuid(v)), version = (v: unknown) => validated(() => manualVersion(v)), digest = (v: unknown) => validated(() => manualDigest(v));
const usage = (v: unknown) => validated(() => parseContentResourceUsage(v));
const SAFE = ['invalid_input', 'rate_limited', 'quota_exceeded', 'provider_timeout', 'provider_unavailable', 'invalid_output', 'cancelled', 'credential_invalid', 'connection_revoked', 'model_unavailable', 'unavailable'];
function name(v: unknown) { if (typeof v !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/.test(v))
    fail(); return v; }
function release(client: PostgresClientLike, destroy = false) { try {
    client.release(destroy || undefined);
}
catch { /* Never retry a mutation after teardown failure. */ } }
export function toContentResourceGenerationView(g: ContentResourceGeneration) { const { id, target, stage, status, outline, draft, sourceFingerprint, usage, safeCode, createdAt, updatedAt, finishedAt } = g; return parseContentResourceGenerationView({ id, target, stage, status, outline, draft, sourceFingerprint, usage, safeCode, createdAt, updatedAt, finishedAt }); }
export class PostgresContentResourceAuthoringRepository implements ContentResourceAuthoringRepository {
    private readonly options: PostgresContentResourceAuthoringRepositoryOptions;
    constructor(options: PostgresContentResourceAuthoringRepositoryOptions) { const r = exact(options, ['pool', 'role', 'timeouts', 'audit']), timeouts = exact(r.timeouts, ['poolCheckoutMs', 'statementMs', 'lockMs', 'idleTransactionMs']); if (r.role !== 'celebix_saas_app' || typeof r.audit !== 'function' || !r.pool || typeof (r.pool as any).connect !== 'function')
        fail(); for (const v of Object.values(timeouts))
        if (!Number.isSafeInteger(v) || (v as number) < 1 || (v as number) > 60000)
            fail(); this.options = Object.freeze({ ...options, timeouts: Object.freeze({ ...options.timeouts }) }); }
    private args(input: unknown, keys: readonly string[], optional: readonly string[] = []) { const r = exact(input, ['tenantContext', 'now', 'operationId', ...keys], optional), a = validated(() => manualAuthority(r.tenantContext, r.now, true)); return { r, values: [a.storeId, a.principalId, a.membershipId, a.planId, a.planCode, a.planVersion, a.now, uuid(r.operationId)] }; }
    private async query(client: PostgresClientLike, text: string, values?: unknown[]) { let timer: ReturnType<typeof setTimeout> | undefined; try {
        return await Promise.race([Promise.resolve().then(() => client.query(text, values)), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new ContentResourceAuthoringRepositoryError('unavailable')), this.options.timeouts.statementMs); })]);
    }
    finally {
        if (timer)
            clearTimeout(timer);
    } }
    private async run(action: string, values: unknown[]) {
        let client: PostgresClientLike;
        try {
            client = await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs);
        }
        catch {
            fail('unavailable');
        }
        let terminal = false;
        try {
            await this.query(client, 'BEGIN ISOLATION LEVEL READ COMMITTED');
            for (const [k, v] of Object.entries({ statement_timeout: this.options.timeouts.statementMs, lock_timeout: this.options.timeouts.lockMs, idle_in_transaction_session_timeout: this.options.timeouts.idleTransactionMs }))
                await this.query(client, `SELECT pg_catalog.set_config('${k}',$1,true)`, [`${v}ms`]);
            await this.query(client, 'SET LOCAL ROLE celebix_saas_app');
            const result = await this.query(client, `SELECT outcome,result_payload FROM saas.content_resource_authoring_${action}(${values.map((_, i) => '$' + (i + 1)).join(',')})`, values);
            if (result.rowCount !== 1 || result.rows.length !== 1)
                fail('unavailable');
            const row = exact(result.rows[0], ['outcome', 'result_payload']);
            if (typeof row.outcome !== 'string')
                fail('unavailable');
            // Expiry transitions must commit even when their result is a fence error.
            try {
                await this.query(client, 'COMMIT');
                terminal = true;
                release(client);
            }
            catch {
                terminal = true;
                release(client, true);
                try {
                    const p = this.options.audit({ type: 'content_resource_authoring_commit_unknown' });
                    if (p)
                        void p.catch(() => undefined);
                }
                catch { }
                fail('commit_unknown');
            }
            if (CODES.has(row.outcome))
                fail(row.outcome as ContentResourceAuthoringErrorCode);
            return { outcome: row.outcome, payload: row.result_payload };
        }
        catch (error) {
            if (!terminal) {
                try {
                    await this.query(client, 'ROLLBACK');
                }
                catch { }
                release(client, true);
            }
            if (error instanceof ContentResourceAuthoringRepositoryError)
                throw error;
            fail('unavailable');
        }
    }
    private async generation(action: string, values: unknown[], outcomes: readonly string[]) { const result = await this.run(action, values); if (!outcomes.includes(result.outcome))
        fail('unavailable'); try {
        const g = parseContentResourceGeneration(result.payload);
        if (g.id !== values[7])
            fail('unavailable');
        return { outcome: result.outcome, generation: g };
    }
    catch {
        fail('unavailable');
    } }
    async beginGeneration(input: BeginContentResourceGenerationInput): Promise<BeginContentResourceGenerationResult> { const { r, values } = this.args(input, ['requestFingerprint', 'sourceFingerprint', 'target', 'stage', 'providerBinding']), target = validated(() => parseContentResourceTarget(r.target)), b = exact(r.providerBinding, ['configId', 'provider', 'model', 'credentialVersion', 'promptVersion']); if (!['outline', 'draft'].includes(r.stage as string) || !['deepseek', 'openai', 'gemini', 'anthropic'].includes(b.provider as string))
        fail(); const result = await this.generation('begin', [...values, digest(r.requestFingerprint), digest(r.sourceFingerprint), JSON.stringify(target), r.stage, uuid(b.configId), b.provider, name(b.model), version(b.credentialVersion), name(b.promptVersion)], ['pending', 'replayed-result', 'existing-status']); const g = result.generation; if (JSON.stringify(g.target) !== JSON.stringify(target) || g.stage !== r.stage || g.sourceFingerprint !== r.sourceFingerprint || g.requestFingerprint !== r.requestFingerprint)
        fail('unavailable'); return { kind: result.outcome as BeginContentResourceGenerationResult['kind'], generation: g }; }
    async getGeneration(input: ResourceGenerationAuthority) { const { values } = this.args(input, []); return (await this.generation('get', values, ['found'])).generation; }
    async claimGenerationDispatch(input: ClaimContentResourceGenerationInput) { const { r, values } = this.args(input, ['expectedVersion']); const g = (await this.generation('claim', [...values, version(r.expectedVersion)], ['claimed'])).generation; if (g.status !== 'pending' || g.dispatchState !== 'dispatched' || !g.claimToken || !g.leaseExpiresAt)
        fail('unavailable'); return Object.freeze({ claimToken: g.claimToken, version: g.version, leaseExpiresAt: g.leaseExpiresAt }); }
    async completeGeneration(input: CompleteContentResourceGenerationInput) { const { r, values } = this.args(input, ['expectedVersion', 'claimToken', 'outline', 'draft', 'usage']); if ((r.outline === null) === (r.draft === null))
        fail(); const outline = r.outline === null ? null : validated(() => parseContentOutline(r.outline)), draft = r.draft === null ? null : validated(() => parseContentResourceDraft(r.draft)), measured = usage(r.usage); return (await this.generation('complete', [...values, uuid(r.claimToken), version(r.expectedVersion), outline === null ? null : JSON.stringify(outline), draft === null ? null : JSON.stringify(draft), measured === null ? null : JSON.stringify(measured)], ['completed'])).generation; }
    async failGeneration(input: FailContentResourceGenerationInput) { const { r, values } = this.args(input, ['expectedVersion', 'claimToken', 'safeCode', 'dispatchState'], ['usage']); const measured = r.usage === undefined || r.usage === null ? null : usage(r.usage); if (!SAFE.includes(r.safeCode as string) || !['not_dispatched', 'dispatched', 'unknown'].includes(r.dispatchState as string))
        fail(); const token = r.claimToken === null ? null : uuid(r.claimToken); if (measured !== null && (r.safeCode !== 'invalid_output' || r.dispatchState !== 'dispatched' || token === null))
        fail(); return (await this.generation('fail', [...values, token, version(r.expectedVersion), r.safeCode, r.dispatchState, measured === null ? null : JSON.stringify(measured)], ['failed'])).generation; }
}
