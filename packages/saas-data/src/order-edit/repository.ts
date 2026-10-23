import { parseOrderEditIntent, parseOrderEditWorkspace, parseOrderEditProducts, parseOrderEditPreview, parseOrderEditResult, type OrderEditIntent, type OrderEditWorkspace, type OrderEditProducts, type OrderEditPreview, type OrderEditResult, type TenantContext } from '@celebix/saas-contracts';
import { acquirePostgresClient, type PostgresClientLike, type PostgresPoolLike, type PostgresTimeoutOptions } from '../postgres/pool.ts';
import { orderAuthority, orderUuid, exactOrderInput, type ValidatedOrderAuthority } from '../orders/validation.ts';
import { orderFingerprint, canonicalOrderJson } from '../orders/canonical.ts';
export const ORDER_EDIT_ERRORS = ['invalid_input', 'unauthenticated', 'membership_denied', 'store_inactive', 'feature_not_enabled', 'order_not_found', 'version_conflict', 'operation_mismatch', 'invalid_transition', 'catalog_conflict', 'customer_conflict', 'inventory_conflict', 'price_permission_denied', 'discount_limit_exceeded', 'preview_conflict', 'durable_authority_invalid', 'unavailable'] as const;
export type OrderEditErrorCode = typeof ORDER_EDIT_ERRORS[number];
export class OrderEditError extends Error {
    constructor(readonly code: OrderEditErrorCode,readonly blockReason?:string) { super(code); this.name = 'OrderEditError'; }
}
type Authority = Readonly<{
    tenantContext: TenantContext;
    now: Date;
    orderId: string;
}>;
export interface OrderEditRepository {
    workspace(input: Authority): Promise<OrderEditWorkspace>;
    products(input: Authority & Readonly<{
        search: string;
        limit: number;
    }>): Promise<OrderEditProducts>;
    preview(input: Authority & Readonly<{
        intent: OrderEditIntent;
    }>): Promise<OrderEditPreview>;
    apply(input: Authority & Readonly<{
        operationId: string;
        intent: OrderEditIntent;
        previewFingerprint: string;
    }>): Promise<OrderEditResult>;
}
type Options = Readonly<{
    pool: PostgresPoolLike;
    role: 'celebix_saas_app';
    timeouts: PostgresTimeoutOptions;
}>;
const error = (code: OrderEditErrorCode = 'unavailable',blockReason?:string) => new OrderEditError(code,blockReason);
const BLOCK_REASONS=new Set(['currency_unsupported','order_archived','order_fulfilled','shipment_exists','return_exists','payment_in_progress_or_refunded','settlement_discount_exceeds_total','provider_managed']);
const values = (a: ValidatedOrderAuthority) => [a.storeId, a.principalId, a.membershipId, a.planId, a.planCode, a.planVersion, a.now];
const AUTH = '$1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz';
function digest(v: unknown): string { if (typeof v !== 'string' || !/^[a-f0-9]{64}$/.test(v))
    throw error('invalid_input'); return v; }
function parsedIntent(v: unknown): OrderEditIntent { try {
    return parseOrderEditIntent(v);
}
catch {
    throw error('invalid_input');
} }
export class PostgresOrderEditRepository implements OrderEditRepository {
    private readonly options: Options;
    constructor(options: Options) { if (!options || options.role !== 'celebix_saas_app' || Object.keys(options).sort().join(',') !== 'pool,role,timeouts' || !options.pool || typeof options.pool.connect !== 'function')
        throw error(); for (const value of Object.values(options.timeouts ?? {}))
        if (!Number.isSafeInteger(value) || value < 1 || value > 60000)
            throw error(); if (Object.keys(options.timeouts ?? {}).sort().join(',') !== 'idleTransactionMs,lockMs,poolCheckoutMs,statementMs')
        throw error(); this.options = { ...options, timeouts: { ...options.timeouts } }; }
    private async configure(client: PostgresClientLike) { for (const [name, value] of [['statement_timeout', this.options.timeouts.statementMs], ['lock_timeout', this.options.timeouts.lockMs], ['idle_in_transaction_session_timeout', this.options.timeouts.idleTransactionMs]] as const)
        await client.query(`SELECT pg_catalog.set_config('${name}',$1,true)`, [`${value}ms`]); await client.query('SET LOCAL ROLE celebix_saas_app'); }
    private async rpc<T>(write: boolean, sql: string, args: unknown[], expected: readonly string[], parse: (v: unknown, replay: boolean) => T, recover?: () => Promise<T>): Promise<T> { let client: PostgresClientLike; try {
        client = await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs);
    }
    catch {
        throw error();
    } let terminal = false, began = false; try {
        await client.query(write ? 'BEGIN ISOLATION LEVEL READ COMMITTED' : 'BEGIN READ ONLY');
        began = true;
        await this.configure(client);
        const result = await client.query(sql, args);
        if (result.rowCount !== 1 || result.rows.length !== 1)
            throw error();
        const row = result.rows[0] as {
            outcome: unknown;
            result_payload: unknown;
        };
        if (!row || typeof row.outcome !== 'string' || Object.keys(row).sort().join(',') !== 'outcome,result_payload')
            throw error();
        if ((ORDER_EDIT_ERRORS as readonly string[]).includes(row.outcome)) {
            const details=row.result_payload;
            const reason=details&&typeof details==='object'&&!Array.isArray(details)&&Object.keys(details).join(',')==='blockReason'&&(details as Record<string,unknown>).blockReason;
            throw error(row.outcome as OrderEditErrorCode,typeof reason==='string'&&BLOCK_REASONS.has(reason)?reason:undefined);
        }
        if (!expected.includes(row.outcome))
            throw error();
        let observed: T;
        try {
            observed = parse(row.result_payload, row.outcome === 'operation_replayed');
        }
        catch {
            throw error();
        }
        try {
            await client.query('COMMIT');
            terminal = true;
            try {
                client.release();
            }
            catch { }
            return observed;
        }
        catch {
            terminal = true;
            try {
                client.release(true);
            }
            catch { }
            if (write && recover)
                return await recover();
            throw error();
        }
    }
    catch (failure) {
        if (!terminal) {
            let destroy = !began;
            if (began)
                try {
                    await client.query('ROLLBACK');
                }
                catch {
                    destroy = true;
                }
            try {
                client.release(destroy || undefined);
            }
            catch { }
        }
        if (failure instanceof OrderEditError)
            throw failure;
        throw error();
    } }
    private authority(input: Authority, extra: readonly string[] = []) { const r = exactOrderInput(input, ['tenantContext', 'now', 'orderId', ...extra]); return { a: orderAuthority(r.tenantContext as TenantContext, r.now as Date), orderId: orderUuid(r.orderId) }; }
    async workspace(input: Authority) { const { a, orderId } = this.authority(input); return this.rpc(false, `SELECT outcome,result_payload FROM saas.orders_edit_workspace(${AUTH},$8::uuid)`, [...values(a), orderId], ['found'], v => { const r = parseOrderEditWorkspace(v); if (r.orderId !== orderId)
        throw error(); return r; }); }
    async products(input: Authority & Readonly<{
        search: string;
        limit: number;
    }>) { const { a } = this.authority(input, ['search', 'limit']); if (typeof input.search !== 'string' || input.search !== input.search.trim() || input.search.length > 100 || /[\u0000-\u001f\u007f]/.test(input.search) || !Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 50)
        throw error('invalid_input'); return this.rpc(false, `SELECT outcome,result_payload FROM saas.orders_edit_options(${AUTH},$8::text,$9::bigint)`, [...values(a), input.search, input.limit], ['found'], parseOrderEditProducts); }
    async preview(input: Authority & Readonly<{
        intent: OrderEditIntent;
    }>) { const { a, orderId } = this.authority(input, ['intent']); const intent = parsedIntent(input.intent); return this.rpc(false, `SELECT outcome,result_payload FROM saas.orders_edit_preview(${AUTH},$8::uuid,$9::jsonb)`, [...values(a), orderId, canonicalOrderJson(intent)], ['previewed'], v => { const r = parseOrderEditPreview(v); if (r.orderId !== orderId || r.expectedVersion !== intent.expectedVersion)
        throw error(); return r; }); }
    async apply(input: Authority & Readonly<{
        operationId: string;
        intent: OrderEditIntent;
        previewFingerprint: string;
    }>) { const { a, orderId } = this.authority(input, ['operationId', 'intent', 'previewFingerprint']); const operationId = orderUuid(input.operationId), intent = parsedIntent(input.intent), previewFingerprint = digest(input.previewFingerprint), fingerprint = orderFingerprint('edit_order', a.storeId, { orderId, intent, previewFingerprint }); const parse = (value: unknown, replayed: boolean) => { if (!value || typeof value !== 'object' || Array.isArray(value))
        throw error(); const r = parseOrderEditResult({ ...value, replayed }); if (r.orderId !== orderId || r.operationId !== operationId || r.version !== intent.expectedVersion + 1 || r.preview.fingerprint !== previewFingerprint)
        throw error(); return r; }; return this.rpc(true, `SELECT outcome,result_payload FROM saas.orders_edit_apply(${AUTH},$8::uuid,$9::uuid,$10::text,$11::jsonb,$12::text)`, [...values(a), orderId, operationId, fingerprint, canonicalOrderJson(intent), previewFingerprint], ['committed', 'operation_replayed'], parse, () => this.rpc(false, `SELECT outcome,result_payload FROM saas.orders_edit_recover(${AUTH},$8::uuid,$9::text)`, [...values(a), operationId, fingerprint], ['found', 'operation_replayed'], v => parse(v, true))); }
}
