import { createHash } from 'node:crypto';
import type { TenantContext } from '@celebix/saas-contracts';
import { luckyWheelUuid, parseLuckyWheelManagedPromotionIndex, type LuckyWheelManagedPromotionIndex, parseLuckyWheelCampaign, parseLuckyWheelConfig, parseLuckyWheelDeleteResult, parseLuckyWheelHistoryResult, parseLuckyWheelPublicSettings, parseLuckyWheelRevokeResult, parseLuckyWheelSpinRequest, parseLuckyWheelSpinResult, type LuckyWheelCampaign, type LuckyWheelConfig, type LuckyWheelDeleteResult, type LuckyWheelHistoryResult, type LuckyWheelPublicSettings, type LuckyWheelRevokeResult, type LuckyWheelSpinRequest, type LuckyWheelSpinResult } from '../../../saas-contracts/src/lucky-wheel/index.ts';
import { catalogAuthority } from '../catalog/validation.ts';
import { acquirePostgresClient, type PostgresPoolLike, type PostgresTimeoutOptions } from '../postgres/pool.ts';
export type LuckyWheelRepositoryOptions = Readonly<{
    pool: PostgresPoolLike;
    role: 'celebix_saas_app' | 'celebix_saas_host_resolver';
    timeouts: PostgresTimeoutOptions;
}>;
export type LuckyWheelAdminScope = Readonly<{
    tenantContext: TenantContext;
    now: Date;
}>;
export type LuckyWheelSaveInput = LuckyWheelAdminScope & Readonly<{
    operationId: string;
    campaignId?: string;
    expectedVersion?: number;
    name: string;
    enabled: boolean;
    config: LuckyWheelConfig;
}>;
export type LuckyWheelMutationInput = LuckyWheelAdminScope & Readonly<{
    operationId: string;
    campaignId: string;
    expectedVersion: number;
}>;
export type LuckyWheelPublicScope = Readonly<{
    hostname: string;
    visitorDigest: string;
    now: Date;
}>;
export type LuckyWheelSpinInput = LuckyWheelPublicScope & LuckyWheelSpinRequest;
export interface LuckyWheelAdminRepository {
    managedPromotions(input: LuckyWheelAdminScope & Readonly<{
        limit?: number;
        cursor?: string | null;
    }>): Promise<LuckyWheelManagedPromotionIndex>;
    list(input: LuckyWheelAdminScope): Promise<readonly LuckyWheelCampaign[]>;
    save(input: LuckyWheelSaveInput): Promise<LuckyWheelCampaign>;
    deleteCampaign(input: LuckyWheelMutationInput): Promise<LuckyWheelDeleteResult>;
    history(input: LuckyWheelAdminScope & Readonly<{
        campaignId: string;
        limit?: number;
    }>): Promise<LuckyWheelHistoryResult>;
    revokeCoupons(input: LuckyWheelMutationInput): Promise<LuckyWheelRevokeResult>;
}
export interface PublicLuckyWheelRepository {
    publicSettings(input: Readonly<{
        hostname: string;
        now: Date;
    }>): Promise<LuckyWheelPublicSettings>;
    spin(input: LuckyWheelSpinInput): Promise<LuckyWheelSpinResult>;
    result(input: LuckyWheelPublicScope & Readonly<{
        campaignId: string;
        operationId?: string;
    }>): Promise<LuckyWheelSpinResult | null>;
}
export const LUCKY_WHEEL_ERROR_CODES = ['invalid_input', 'unauthenticated', 'store_inactive', 'membership_denied', 'feature_not_enabled', 'durable_authority_invalid', 'role_denied', 'not_found', 'invalid_reference', 'promotion_unavailable', 'version_conflict', 'operation_mismatch', 'operation_not_found', 'contact_conflict', 'rate_limited', 'limit_exceeded', 'campaign_unavailable', 'quota_exhausted', 'repeat_limited', 'active_campaign_conflict', 'legacy_configuration', 'unavailable', 'commit_uncertain'] as const;
export type LuckyWheelErrorCode = typeof LUCKY_WHEEL_ERROR_CODES[number];
export class LuckyWheelRepositoryError extends Error {
    constructor(readonly code: LuckyWheelErrorCode) { super(`lucky_wheel_${code}`); this.name = 'LuckyWheelRepositoryError'; }
}
function fail(code: LuckyWheelErrorCode = 'invalid_input'): never { throw new LuckyWheelRepositoryError(code); }
function exact(x: unknown, required: readonly string[], optional: readonly string[] = []) { if (typeof x !== 'object' || x === null || Array.isArray(x) || ![Object.prototype, null].includes(Object.getPrototypeOf(x)))
    fail(); const r = x as Record<string, unknown>, keys = Reflect.ownKeys(r), allowed = new Set([...required, ...optional]); if (required.some(k => !Object.hasOwn(r, k)) || keys.some(k => typeof k !== 'string' || !allowed.has(k)))
    fail(); for (const k of keys) {
    const d = Object.getOwnPropertyDescriptor(r, k);
    if (!d || !('value' in d) || !d.enumerable)
        fail();
} return r; }
function host(x: unknown) { if (typeof x !== 'string' || x !== x.toLowerCase() || x.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(x))
    fail(); return x; }
function date(x: unknown) { if (!(x instanceof Date) || !Number.isFinite(x.getTime()))
    fail(); return new Date(x.getTime()); }
function digest(x: unknown) { if (typeof x !== 'string' || !/^[a-f0-9]{64}$/u.test(x))
    fail(); return x; }
function version(x: unknown) { if (!Number.isSafeInteger(x) || (x as number) < 1)
    fail(); return x as number; }
function fingerprint(value: unknown): string { function sorted(x: unknown): unknown { if (Array.isArray(x))
    return x.map(sorted); if (x && typeof x === 'object')
    return Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([k, v]) => [k, sorted(v)])); return x; } return createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex'); }
function parsed<T>(read: () => T): T { try {
    return read();
}
catch {
    fail('unavailable');
} }
type Call = Readonly<{
    name: string;
    args: readonly unknown[];
    casts: readonly string[];
    commitErrors?: readonly LuckyWheelErrorCode[];
}>;
class Repository {
    protected readonly options: LuckyWheelRepositoryOptions;
    constructor(options: LuckyWheelRepositoryOptions, role: LuckyWheelRepositoryOptions['role']) {
        try {
            exact(options, ['pool', 'role', 'timeouts']);
            exact(options.timeouts, ['poolCheckoutMs', 'statementMs', 'lockMs', 'idleTransactionMs']);
            if (options.role !== role || typeof options.pool?.connect !== 'function' || Object.values(options.timeouts).some(x => !Number.isSafeInteger(x) || x < 1 || x > 60000)) fail('unavailable');
            this.options = Object.freeze({pool: options.pool, role, timeouts: Object.freeze({...options.timeouts})});
        } catch { fail('unavailable'); }
    }
    private async transaction(call: Call, readOnly: boolean): Promise<unknown> { let client; try {
        client = await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs);
    }
    catch {
        fail('unavailable');
    } let began = false, committing = false, destroy = false; try {
        await client.query(readOnly ? 'BEGIN READ ONLY' : 'BEGIN');
        began = true;
        for (const [key, value] of [['statement_timeout', this.options.timeouts.statementMs], ['lock_timeout', this.options.timeouts.lockMs], ['idle_in_transaction_session_timeout', this.options.timeouts.idleTransactionMs]] as const)
            await client.query('SELECT pg_catalog.set_config($1,$2,true)', [key, `${value}ms`]);
        await client.query(`SET LOCAL ROLE ${this.options.role}`);
        const result = await client.query(`SELECT outcome,result_payload FROM saas.${call.name}(${call.casts.map((cast, i) => `$${i + 1}::${cast}`).join(',')})`, [...call.args]);
        if (result.rowCount !== 1 || result.rows.length !== 1)
            fail('unavailable');
        const row = result.rows[0] as {
            outcome: unknown;
            result_payload: unknown;
        };
        let deferred: LuckyWheelRepositoryError | undefined;
        if (!['ok', 'saved', 'replayed'].includes(row.outcome as string)) {
            if (LUCKY_WHEEL_ERROR_CODES.includes(row.outcome as LuckyWheelErrorCode)) {
                if (!readOnly && call.commitErrors?.includes(row.outcome as LuckyWheelErrorCode))
                    deferred = new LuckyWheelRepositoryError(row.outcome as LuckyWheelErrorCode);
                else
                    fail(row.outcome as LuckyWheelErrorCode);
            }
            else
                fail('unavailable');
        }
        committing = true;
        await client.query('COMMIT');
        committing = false;
        began = false;
        if (deferred)
            throw deferred;
        return row.result_payload;
    }
    catch (error) {
        if (committing) {
            destroy = true;
            throw new LuckyWheelRepositoryError(readOnly ? 'unavailable' : 'commit_uncertain');
        }
        if (began)
            try {
                await client.query('ROLLBACK');
            }
            catch {
                destroy = true;
            }
        if (error instanceof LuckyWheelRepositoryError)
            throw error;
        throw new LuckyWheelRepositoryError('unavailable');
    }
    finally {
        client.release(destroy || undefined);
    } }
    protected read(call: Call) { return this.transaction(call, true); }
    protected async write(call: Call, recovery: Call) { try {
        return await this.transaction(call, false);
    }
    catch (error) {
        if (!(error instanceof LuckyWheelRepositoryError) || error.code !== 'commit_uncertain')
            throw error;
        try {
            return await this.read(recovery);
        }
        catch {
            throw new LuckyWheelRepositoryError('commit_uncertain');
        }
    } }
}
const authorityCasts = ['uuid', 'uuid', 'uuid', 'uuid', 'text', 'bigint', 'timestamptz'] as const;
function authority(context: TenantContext, now: Date) { try {
    const a = catalogAuthority(context, now);
    return [a.storeId, a.principalId, a.membershipId, a.planId, a.planCode, a.planVersion, a.now] as const;
}
catch (error) {
    const code = (error as {
        code?: LuckyWheelErrorCode;
    }).code;
    if (code && LUCKY_WHEEL_ERROR_CODES.includes(code))
        fail(code);
    fail();
} }
export class PostgresLuckyWheelAdminRepository extends Repository implements LuckyWheelAdminRepository {
    constructor(options: LuckyWheelRepositoryOptions) { super(options, 'celebix_saas_app'); }
    async managedPromotions(input: LuckyWheelAdminScope & Readonly<{
        limit?: number;
        cursor?: string | null;
    }>) { exact(input, ['tenantContext', 'now'], ['limit', 'cursor']); const a = authority(input.tenantContext, input.now), limit = input.limit ?? 100; if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200)
        fail(); let at: Date | null = null, id: string | null = null; if (input.cursor !== undefined && input.cursor !== null) {
        if (typeof input.cursor !== 'string' || input.cursor.length !== 61)
            fail();
        const parts = input.cursor.split('|');
        try {
            at = new Date(parts[0]!);
            if (at.toISOString() !== parts[0])
                fail();
            id = luckyWheelUuid(parts[1]);
        }
        catch {
            fail();
        }
    } const value = await this.read({ name: 'lucky_wheel_managed_promotions_v1', args: [...a, limit, at, id], casts: [...authorityCasts, 'integer', 'timestamptz', 'uuid'] }); return parsed(() => parseLuckyWheelManagedPromotionIndex(value)); }
    async list(input: LuckyWheelAdminScope) { exact(input, ['tenantContext', 'now']); const value = await this.read({ name: 'lucky_wheel_campaign_list_v1', args: authority(input.tenantContext, input.now), casts: authorityCasts }); return parsed(() => { if (!Array.isArray(value) || value.length > 280)
        fail('unavailable'); return Object.freeze(value.map(parseLuckyWheelCampaign)); }); }
    async save(input: LuckyWheelSaveInput) { exact(input, ['tenantContext', 'now', 'operationId', 'name', 'enabled', 'config'], ['campaignId', 'expectedVersion']); const a = authority(input.tenantContext, input.now); let operationId, config, campaignId: string | null = null; try {
        operationId = luckyWheelUuid(input.operationId);
        config = parseLuckyWheelConfig(input.config);
        if (input.campaignId !== undefined)
            campaignId = luckyWheelUuid(input.campaignId);
    }
    catch {
        fail();
    } if ((campaignId === null) !== (input.expectedVersion === undefined) || typeof input.enabled !== 'boolean' || typeof input.name !== 'string' || input.name !== input.name.trim() || input.name.length < 1 || input.name.length > 160 || /[\u0000-\u001f\u007f-\u009f]/u.test(input.name))
        fail(); const expectedVersion = input.expectedVersion === undefined ? null : version(input.expectedVersion), f = fingerprint({ principalId: a[1], action: 'save', campaignId, expectedVersion, name: input.name, enabled: input.enabled, config }); const value = await this.write({ name: 'lucky_wheel_campaign_save_v1', args: [...a, operationId, f, campaignId, expectedVersion, input.name, input.enabled, JSON.stringify(config)], casts: [...authorityCasts, 'uuid', 'text', 'uuid', 'bigint', 'text', 'boolean', 'jsonb'] }, { name: 'lucky_wheel_admin_operation_get_v1', args: [...a, operationId, f], casts: [...authorityCasts, 'uuid', 'text'] }); return parsed(() => { const r = parseLuckyWheelCampaign(value); if (campaignId && r.id !== campaignId || r.name !== input.name || r.enabled !== input.enabled || JSON.stringify(r.config) !== JSON.stringify(config))
        fail('unavailable'); return r; }); }
    private async mutation(input: LuckyWheelMutationInput, action: 'delete' | 'revoke') { exact(input, ['tenantContext', 'now', 'operationId', 'campaignId', 'expectedVersion']); const a = authority(input.tenantContext, input.now); let operationId, campaignId; try {
        operationId = luckyWheelUuid(input.operationId);
        campaignId = luckyWheelUuid(input.campaignId);
    }
    catch {
        fail();
    } const expectedVersion = version(input.expectedVersion), f = fingerprint({ principalId: a[1], action, campaignId, expectedVersion }); const value = await this.write({ name: `lucky_wheel_campaign_${action}_v1`, args: [...a, operationId, f, campaignId, expectedVersion], casts: [...authorityCasts, 'uuid', 'text', 'uuid', 'bigint'] }, { name: 'lucky_wheel_admin_operation_get_v1', args: [...a, operationId, f], casts: [...authorityCasts, 'uuid', 'text'] }); return { value, campaignId }; }
    async deleteCampaign(input: LuckyWheelMutationInput) { const { value, campaignId } = await this.mutation(input, 'delete'); return parsed(() => { const r = parseLuckyWheelDeleteResult(value); if (r.campaignId !== campaignId)
        fail('unavailable'); return r; }); }
    async revokeCoupons(input: LuckyWheelMutationInput) { const { value, campaignId } = await this.mutation(input, 'revoke'); return parsed(() => { const r = parseLuckyWheelRevokeResult(value); if (r.campaignId !== campaignId)
        fail('unavailable'); return r; }); }
    async history(input: LuckyWheelAdminScope & Readonly<{
        campaignId: string;
        limit?: number;
    }>) { exact(input, ['tenantContext', 'now', 'campaignId'], ['limit']); const a = authority(input.tenantContext, input.now); let id; try {
        id = luckyWheelUuid(input.campaignId);
    }
    catch {
        fail();
    } const limit = input.limit ?? 50; if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
        fail(); const thisHistory = await this.read({ name: 'lucky_wheel_history_v1', args: [...a, id, limit], casts: [...authorityCasts, 'uuid', 'integer'] }); return parsed(() => parseLuckyWheelHistoryResult(thisHistory)); }
}
export class PostgresPublicLuckyWheelRepository extends Repository implements PublicLuckyWheelRepository {
    constructor(options: LuckyWheelRepositoryOptions) { super(options, 'celebix_saas_host_resolver'); }
    async publicSettings(input: Readonly<{
        hostname: string;
        now: Date;
    }>) { exact(input, ['hostname', 'now']); const value = await this.read({ name: 'lucky_wheel_public_settings_v1', args: [host(input.hostname), date(input.now)], casts: ['text', 'timestamptz'] }); return parsed(() => parseLuckyWheelPublicSettings(value)); }
    async spin(input: LuckyWheelSpinInput) { exact(input, ['hostname', 'visitorDigest', 'now', 'operationId', 'campaignId', 'expectedVersion', 'marketingConsent'], ['email', 'phone']); const hostname = host(input.hostname), visitorDigest = digest(input.visitorDigest), now = date(input.now); let request; try {
        const { hostname: _, visitorDigest: __, now: ___, ...body } = input;
        request = parseLuckyWheelSpinRequest(body);
    }
    catch {
        fail();
    } const f = fingerprint(request), value = await this.write({ name: 'lucky_wheel_spin_v1', commitErrors: ['invalid_input', 'version_conflict', 'rate_limited', 'campaign_unavailable', 'quota_exhausted', 'repeat_limited'], args: [hostname, visitorDigest, now, request.operationId, request.campaignId, request.expectedVersion, request.email ?? null, request.phone ?? null, request.marketingConsent, f], casts: ['text', 'text', 'timestamptz', 'uuid', 'uuid', 'bigint', 'text', 'text', 'boolean', 'text'] }, { name: 'lucky_wheel_public_operation_get_v1', args: [hostname, visitorDigest, now, request.operationId, f], casts: ['text', 'text', 'timestamptz', 'uuid', 'text'] }); return parsed(() => { const r = parseLuckyWheelSpinResult(value); if (r.operationId !== request.operationId || r.campaignId !== request.campaignId || r.campaignVersion !== request.expectedVersion)
        fail('unavailable'); return r; }); }
    async result(input: LuckyWheelPublicScope & Readonly<{
        campaignId: string;
        operationId?: string;
    }>) { exact(input, ['hostname', 'visitorDigest', 'now', 'campaignId'], ['operationId']); let campaignId, operationId; try {
        campaignId = luckyWheelUuid(input.campaignId);
        operationId = input.operationId === undefined ? null : luckyWheelUuid(input.operationId);
    }
    catch {
        fail();
    } const value = await this.read({ name: 'lucky_wheel_result_v1', args: [host(input.hostname), digest(input.visitorDigest), date(input.now), campaignId, operationId], casts: ['text', 'text', 'timestamptz', 'uuid', 'uuid'] }); return parsed(() => { if (value === null)
        return null; const r = parseLuckyWheelSpinResult(value); if (r.campaignId !== campaignId || operationId && r.operationId !== operationId)
        fail('unavailable'); return r; }); }
}
