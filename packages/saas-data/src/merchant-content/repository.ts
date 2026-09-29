import { createHash } from 'node:crypto';
import { parseMerchantContentDocument, parseSaveMerchantContentRequest, type MerchantContentDocument, type MerchantContentVersion } from '@celebix/saas-contracts';
import { acquirePostgresClient, type PostgresClientLike } from '../postgres/pool.ts';
import { merchantAdminFingerprint } from '../merchant-admin/canonical.ts';
import { MERCHANT_CONTENT_ERROR_CODES, MerchantContentRepositoryError, type MerchantContentErrorCode } from './errors.ts';
import type { GetMerchantContentInput, ListMerchantContentVersionsInput, MerchantContentRepository, PostgresMerchantContentRepositoryOptions, RecoverMerchantContentOperationInput, SaveMerchantContentInput } from './types.ts';
import { authority, exact, fingerprint, invalid, kind, uuid, version } from './validation.ts';
const unavailable = () => new MerchantContentRepositoryError('unavailable');
const A = '$1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz';
function release(client: PostgresClientLike, destroy = false) { try {
    client.release(destroy || undefined);
}
catch { /* A teardown failure cannot cause a mutation retry. */ } }
export class PostgresMerchantContentRepository implements MerchantContentRepository {
    private readonly options: PostgresMerchantContentRepositoryOptions;
    constructor(options: PostgresMerchantContentRepositoryOptions) {
        const r = exact(options, ['pool', 'role', 'timeouts', 'audit']);
        if (r.role !== 'celebix_saas_app' || typeof r.audit !== 'function' || !r.pool || typeof (r.pool as any).connect !== 'function')
            invalid();
        const timeouts = exact(r.timeouts, ['poolCheckoutMs', 'statementMs', 'lockMs', 'idleTransactionMs']);
        for (const value of Object.values(timeouts))
            if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 60000)
                invalid();
        this.options = Object.freeze({ ...options, timeouts: Object.freeze({ ...options.timeouts }) });
    }
    private async query(client: PostgresClientLike, text: string, values?: unknown[]) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            return await Promise.race([Promise.resolve().then(() => client.query(text, values)), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(unavailable()), this.options.timeouts.statementMs); })]);
        }
        finally {
            if (timer)
                clearTimeout(timer);
        }
    }
    private async acquire() { try {
        return await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs);
    }
    catch {
        throw unavailable();
    } }
    private async configure(client: PostgresClientLike) { for (const [key, ms] of [['statement_timeout', this.options.timeouts.statementMs], ['lock_timeout', this.options.timeouts.lockMs], ['idle_in_transaction_session_timeout', this.options.timeouts.idleTransactionMs]] as const)
        await this.query(client, `SELECT pg_catalog.set_config('${key}', $1, true)`, [`${ms}ms`]); await this.query(client, 'SET LOCAL ROLE celebix_saas_app'); }
    private args(input: unknown, keys: readonly string[], write: boolean, optional: readonly string[] = []) { const r = exact(input, ['tenantContext', 'now', ...keys], optional), auth = authority(r.tenantContext, r.now, write); return { r, values: [auth.storeId, auth.principalId, auth.membershipId, auth.planId, auth.planCode, auth.planVersion, auth.now], auth }; }
    private row(result: {
        rows: unknown[];
        rowCount?: number | null;
    }) {
        let r: Record<string, unknown>;
        try {
            if (result.rowCount !== 1 || result.rows.length !== 1)
                throw unavailable();
            r = exact(result.rows[0], ['outcome', 'result_payload']);
        }
        catch {
            throw unavailable();
        }
        if (typeof r.outcome !== 'string')
            throw unavailable();
        if ((MERCHANT_CONTENT_ERROR_CODES as readonly string[]).includes(r.outcome))
            throw new MerchantContentRepositoryError(r.outcome as MerchantContentErrorCode);
        return { outcome: r.outcome, payload: r.result_payload };
    }
    private document(value: unknown): MerchantContentDocument { try {
        return parseMerchantContentDocument(value);
    }
    catch {
        throw unavailable();
    } }
    private async read<T>(text: string, values: unknown[], outcome: string, parse: (value: unknown) => T) { const client = await this.acquire(); let terminal = false; try {
        await this.query(client, 'BEGIN READ ONLY');
        await this.configure(client);
        const row = this.row(await this.query(client, text, values));
        if (row.outcome !== outcome)
            throw unavailable();
        const parsed = parse(row.payload);
        await this.query(client, 'COMMIT');
        terminal = true;
        release(client);
        return parsed;
    }
    catch (error) {
        if (!terminal) {
            try {
                await this.query(client, 'ROLLBACK');
            }
            catch { }
            release(client, true);
        }
        if (error instanceof MerchantContentRepositoryError)
            throw error;
        throw unavailable();
    } }
    async get(input: GetMerchantContentInput) { const { r, values } = this.args(input, ['kind', 'recordId'], false), selectedKind = kind(r.kind), recordId = uuid(r.recordId); return this.read(`SELECT outcome,result_payload FROM saas.merchant_content_get(${A},$8::text,$9::uuid)`, [...values, selectedKind, recordId], 'found', value => { const d = this.document(value); if (d.id !== recordId || d.kind !== selectedKind)
        throw unavailable(); return d; }); }
    async recoverOperation(input: RecoverMerchantContentOperationInput): Promise<{
        document: MerchantContentDocument;
        replayed: true;
    }> { const { r, values } = this.args(input, ['operationId', 'fingerprint'], true); return this.read(`SELECT outcome,result_payload FROM saas.merchant_content_recover_operation(${A},$8::uuid,$9::text)`, [...values, uuid(r.operationId), fingerprint(r.fingerprint)], 'operation_replayed', value => ({ document: this.document(value), replayed: true })); }
    async save(input: SaveMerchantContentInput) {
        const { r, values, auth } = this.args(input, ['operationId', 'request'], true), operationId = uuid(r.operationId);
        let request;
        try {
            request = parseSaveMerchantContentRequest(r.request);
        }
        catch {
            invalid();
        }
        const boundFingerprint = merchantAdminFingerprint('merchant_content_save_v1', auth.storeId, request), client = await this.acquire();
        let terminal = false;
        try {
            await this.query(client, 'BEGIN ISOLATION LEVEL READ COMMITTED');
            await this.configure(client);
            const row = this.row(await this.query(client, `SELECT outcome,result_payload FROM saas.merchant_content_save(${A},$8::uuid,$9::text,$10::jsonb)`, [...values, operationId, boundFingerprint, JSON.stringify(request)]));
            if (!['saved', 'operation_replayed'].includes(row.outcome))
                throw unavailable();
            const document = this.document(row.payload);
            if (document.kind !== request.kind || (request.recordId !== null && document.id !== request.recordId) || document.version !== (request.expectedVersion ?? 0) + 1)
                throw unavailable();
            try {
                await this.query(client, 'COMMIT');
                terminal = true;
                release(client);
                return { document, replayed: row.outcome === 'operation_replayed' };
            }
            catch {
                terminal = true;
                release(client, true);
                try {
                    const pending = this.options.audit({ type: 'merchant_content_commit_unknown' });
                    if (pending)
                        void pending.catch(() => undefined);
                }
                catch { }
                try {
                    return await this.recoverOperation({ tenantContext: r.tenantContext as SaveMerchantContentInput['tenantContext'], now: r.now as Date, operationId, fingerprint: boundFingerprint });
                }
                catch {
                    throw new MerchantContentRepositoryError('commit_unknown');
                }
            }
        }
        catch (error) {
            if (!terminal) {
                try {
                    await this.query(client, 'ROLLBACK');
                }
                catch { }
                release(client, true);
            }
            if (error instanceof MerchantContentRepositoryError)
                throw error;
            throw unavailable();
        }
    }
    async listVersions(input: ListMerchantContentVersionsInput): Promise<readonly MerchantContentVersion[]> {
        const { r, values } = this.args(input, ['kind', 'recordId', 'limit'], false, ['beforeVersion']), selectedKind = kind(r.kind), recordId = uuid(r.recordId), limit = version(r.limit), before = r.beforeVersion === undefined ? null : version(r.beforeVersion);
        if (limit > 50)
            invalid();
        return this.read(`SELECT outcome,result_payload FROM saas.merchant_content_versions(${A},$8::text,$9::uuid,$10::integer,$11::bigint)`, [...values, selectedKind, recordId, limit, before], 'listed', value => {
            try {
                const result = exact(value, ['items']);
                if (!Array.isArray(result.items) || result.items.length > limit)
                    throw unavailable();
                let previous = before ?? Number.MAX_SAFE_INTEGER;
                return Object.freeze(result.items.map(item => { const v = exact(item, ['recordId', 'kind', 'version', 'values', 'status', 'bodyFormat', 'origins', 'savedAt']); if (v.recordId !== recordId || v.kind !== selectedKind)
                    throw unavailable(); const n = version(v.version); if (n >= previous)
                    throw unavailable(); previous = n; const fields = exact(v.values, ['name', 'slug', 'locale', 'body', 'excerpt', 'seoTitle', 'seoDescription', 'published']); if (typeof fields.body !== 'string')
                    throw unavailable(); const d = this.document({ ...fields, id: recordId, kind: selectedKind, version: n, status: v.status, bodyFormat: v.bodyFormat, bodyDigest: 'sha256:' + createHash('sha256').update(fields.body).digest('hex'), origins: v.origins, createdAt: v.savedAt, updatedAt: v.savedAt, publishedAt: null }); const { name, slug, locale, body, excerpt, seoTitle, seoDescription, published } = d; return Object.freeze({ recordId, kind: selectedKind, version: n, values: Object.freeze({ name, slug, locale, body, excerpt, seoTitle, seoDescription, published }), status: d.status, bodyFormat: d.bodyFormat, origins: d.origins, savedAt: d.updatedAt }); }));
            }
            catch {
                throw unavailable();
            }
        });
    }
}
