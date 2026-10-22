import { StoreToolsRepositoryError } from '@celebix/saas-data';
import { commercialUuid, isMerchantActionAllowed, parseStoreToolPurchaseIntent, parseStoreToolPurchase, parseStoreToolWorkspace, type TenantContext } from '@celebix/saas-contracts';
import { readOrderPanelSessionCookie } from '../order-http/request-input.ts';
import { approvedPanelMutationOriginForStore, hasApprovedPanelMutationOriginShape } from '../panel-origin-authority.ts';
import type { ServerStoreToolsRuntime } from '../server-store-tools/runtime.ts';
type Dependencies = Readonly<{
    resolveRuntime(): Promise<ServerStoreToolsRuntime | null>;
    now(): Date;
    requestId(): string;
}>;
const STATUS: Readonly<Record<string, number>> = { invalid_input: 400, unauthenticated: 401, membership_denied: 403, store_inactive: 403, feature_not_enabled: 403, origin_denied: 403, operation_mismatch: 409, quote_changed: 409, already_owned: 409, purchase_pending: 409, durable_authority_invalid: 403, unavailable: 503, commit_unknown: 503 };
function json(body: unknown, status = 200, headers: HeadersInit = {}) { return Response.json(body, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers } }); }
function fail(code: string, status = STATUS[code] ?? 503, headers: HeadersInit = {}) { return json({ code }, status, headers); }
async function body(request: Request): Promise<unknown> {
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '') || request.headers.has('transfer-encoding') || !request.body)
        throw TypeError('invalid_input');
    const declared = request.headers.get('content-length');
    if (declared !== null && (!/^(0|[1-9]\d*)$/.test(declared) || Number(declared) > 2048))
        throw TypeError('invalid_input');
    const reader = request.body.getReader(), parts: Uint8Array[] = [];
    let length = 0;
    try {
        for (;;) {
            const chunk = await reader.read();
            if (chunk.done)
                break;
            length += chunk.value.byteLength;
            if (length > 2048) {
                await reader.cancel();
                throw TypeError('invalid_input');
            }
            parts.push(chunk.value);
        }
    }
    finally {
        reader.releaseLock();
    }
    if (length === 0 || declared !== null && length !== Number(declared))
        throw TypeError('invalid_input');
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
        bytes.set(part, offset);
        offset += part.byteLength;
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
export function createStoreToolsHttpHandlers(deps: Dependencies) {
    async function authorize(request: Request, method: 'GET' | 'POST'): Promise<Response | {
        runtime: ServerStoreToolsRuntime;
        tenantContext: TenantContext;
        now: Date;
    }> {
        if (request.method !== method)
            return fail('method_not_allowed', 405, { allow: method });
        try {
            const url = new URL(request.url);
            if (url.pathname !== (method === 'GET' ? '/api/store-tools' : '/api/store-tools/requests') || url.search || url.hash || url.username || url.password || !['http:', 'https:'].includes(url.protocol))
                return fail('invalid_input');
            for (const [name] of request.headers)
                if (name === 'authorization' || name.startsWith('x-celebix') || ['x-panel-session-credential', 'x-store-id', 'x-tenant-id', 'x-principal-id', 'x-membership-id', 'x-plan-id', 'x-database-role', 'x-database-url'].includes(name))
                    return fail('invalid_input');
            const runtime = await deps.resolveRuntime();
            if (!runtime)
                return fail('unavailable');
            if (method === 'POST' && !hasApprovedPanelMutationOriginShape(request, runtime.access.panelOrigin))
                return fail('origin_denied');
            const cookie = readOrderPanelSessionCookie(request);
            if (cookie.kind !== 'present')
                return fail('unauthenticated');
            const now = deps.now(), requestId = commercialUuid(deps.requestId());
            if (!(now instanceof Date) || !Number.isFinite(now.getTime()))
                return fail('unavailable');
            const access = await runtime.access.resolveCredential({ hostname: request.headers.get('host'), credential: cookie.credential, requestId, now: new Date(now) });
            if (access.kind === 'unauthenticated')
                return fail('unauthenticated');
            if (access.kind === 'unauthorized')
                return fail('membership_denied');
            if (access.kind !== 'authenticated')
                return fail('unavailable');
            if (method === 'POST' && !approvedPanelMutationOriginForStore(request, runtime.access.panelOrigin, access.tenantContext.store.slug))
                return fail('origin_denied');
            if (!isMerchantActionAllowed(access.tenantContext.membership.role, 'configuration.read') || method === 'POST' && !['store_owner', 'admin'].includes(access.tenantContext.membership.role))
                return fail('membership_denied');
            return { runtime, tenantContext: access.tenantContext, now: new Date(now) };
        }
        catch {
            return fail('unavailable');
        }
    }
    async function execute(run: () => Promise<unknown>) { try {
        return json(await run());
    }
    catch (error) {
        const code = error instanceof StoreToolsRepositoryError ? error.code : 'unavailable';
        return fail(Object.hasOwn(STATUS, code) ? code : 'unavailable');
    } }
    return Object.freeze({
        async GET(request: Request) { const auth = await authorize(request, 'GET'); if (auth instanceof Response)
            return auth; return execute(async () => { const workspace = parseStoreToolWorkspace(await auth.runtime.storeTools.read({ tenantContext: auth.tenantContext, now: auth.now })); if (workspace.storeId !== auth.tenantContext.store.id || workspace.canRequestPurchase !== ['store_owner', 'admin'].includes(auth.tenantContext.membership.role))
            throw Error('invalid_result'); return workspace; }); },
        async POST(request: Request) { const auth = await authorize(request, 'POST'); if (auth instanceof Response)
            return auth; let intent; try {
            intent = parseStoreToolPurchaseIntent(await body(request));
            if (intent.operationId !== commercialUuid(request.headers.get('idempotency-key')))
                return fail('invalid_input');
        }
        catch {
            return fail('invalid_input');
        } return execute(async () => { const purchase = parseStoreToolPurchase(await auth.runtime.storeTools.request({ tenantContext: auth.tenantContext, now: auth.now, intent })); if (purchase.id !== intent.operationId || purchase.storeId !== auth.tenantContext.store.id || purchase.offerId !== intent.offerId)
            throw Error('invalid_result'); return purchase; }); },
    });
}
