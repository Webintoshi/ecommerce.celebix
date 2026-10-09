import { createHash } from 'node:crypto';
import { isMerchantActionAllowed, emailMarketingObject, emailMarketingInteger, emailMarketingUuid, emailMarketingText, parseEmailMarketingProvider, parseEmailMarketingSelection, type TenantContext } from '@celebix/saas-contracts';
import { EmailMarketingError } from '@celebix/saas-data';
import { readOrderPanelSessionCookie } from '../order-http/request-input.ts';
import { approvedPanelMutationOriginForStore, hasApprovedPanelMutationOriginShape } from '../panel-origin-authority.ts';
import type { ServerEmailMarketingRuntime } from '../server-email-marketing/runtime.ts';
import { EMAIL_MARKETING_ROOT, emailMarketingRequestUrl, emailMarketingRequestBody, emailMarketingOperation, emailMarketingQuery } from './request-input.ts';
type GetArea = 'overview' | 'lists' | 'preview';
type PostArea = 'validate' | 'apply' | 'rotate' | 'recheck' | 'disconnect' | 'sync';
type Dependencies = Readonly<{
    resolveRuntime(): Promise<ServerEmailMarketingRuntime | null>;
    now(): Date;
    requestId(): string;
}>;
type Authorized = Readonly<{
    runtime: ServerEmailMarketingRuntime;
    tenantContext: TenantContext;
    now: Date;
    sessionBinding: string;
}>;
const STATUS: Readonly<Record<string, number>> = Object.freeze({ invalid_input: 400, unauthorized: 401, forbidden: 403, version_conflict: 409, operation_conflict: 409, candidate_expired: 409, account_in_use: 409, account_mismatch: 409, provider_unauthorized: 409, provider_forbidden: 403, provider_rate_limited: 429, provider_unavailable: 503, provider_invalid_response: 503, outcome_unknown: 503, cleanup_pending: 409, not_configured: 503 });
function json(value: unknown, status = 200) { return Response.json(value, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' } }); }
function error(code: string, status: number) { return json({ code }, status); }
async function authorize(deps: Dependencies, request: Request, method: string, path: string, query = false): Promise<Authorized | Response> { if (request.method !== method)
    return error('invalid_input', 405); try {
    emailMarketingRequestUrl(request, path, query);
}
catch {
    return error('invalid_input', 400);
} let runtime: ServerEmailMarketingRuntime | null; try {
    runtime = await deps.resolveRuntime();
}
catch {
    return error('not_configured', 503);
} if (!runtime)
    return error('not_configured', 503); const write = method !== 'GET'; if (write && !hasApprovedPanelMutationOriginShape(request, runtime.access.panelOrigin))
    return error('forbidden', 403); const cookie = readOrderPanelSessionCookie(request); if (cookie.kind !== 'present')
    return error('unauthorized', 401); const now = deps.now(); let requestId: string; try {
    requestId = emailMarketingUuid(deps.requestId());
    if (!(now instanceof Date) || !Number.isFinite(now.getTime()))
        throw Error();
}
catch {
    return error('provider_unavailable', 503);
} let access; try {
    access = await runtime.access.resolveCredential({ hostname: request.headers.get('host'), credential: cookie.credential, requestId, now });
}
catch {
    return error('provider_unavailable', 503);
} if (access.kind === 'unauthenticated')
    return error('unauthorized', 401); if (access.kind === 'unauthorized')
    return error('forbidden', 403); if (access.kind !== 'authenticated')
    return error('provider_unavailable', 503); if (write && !approvedPanelMutationOriginForStore(request, runtime.access.panelOrigin, access.tenantContext.store.slug))
    return error('forbidden', 403); if (!isMerchantActionAllowed(access.tenantContext.membership.role, write ? 'integrations.manage' : 'integrations.read') || access.tenantContext.store.status !== 'active' || access.tenantContext.membership.status !== 'active' || access.tenantContext.entitlements.status !== 'active' || !access.tenantContext.entitlements.features.includes('integrations'))
    return error('forbidden', 403); return { runtime, tenantContext: access.tenantContext, now, sessionBinding: createHash('sha256').update(cookie.credential).digest('hex') }; }
async function execute(run: () => Promise<unknown>) { try {
    return json(await run());
}
catch (caught) {
    const code = caught instanceof EmailMarketingError && Object.hasOwn(STATUS, caught.code) ? caught.code : 'provider_unavailable';
    const r = error(code, STATUS[code]!);
    if (caught instanceof EmailMarketingError && code === 'provider_rate_limited' && caught.retryAfterSeconds && Number.isSafeInteger(caught.retryAfterSeconds) && caught.retryAfterSeconds <= 86400)
        r.headers.set('retry-after', String(caught.retryAfterSeconds));
    return r;
} }
export function createEmailMarketingHttpHandlers(deps: Dependencies) { return Object.freeze({ async get(request: Request, area: GetArea) { const authorized = await authorize(deps, request, 'GET', area === 'overview' ? EMAIL_MARKETING_ROOT : `${EMAIL_MARKETING_ROOT}/${area}`, area !== 'overview'); if (authorized instanceof Response)
        return authorized; const { runtime, tenantContext, now, sessionBinding } = authorized; if (area === 'overview')
        return execute(() => runtime.email.overview({ tenantContext, now })); let query; try {
        query = emailMarketingQuery(request, area);
    }
    catch {
        return error('invalid_input', 400);
    } return execute(() => area === 'lists' ? runtime.email.lists({ tenantContext, now, sessionBinding, ...query }) : runtime.email.preview({ tenantContext, now, sessionBinding, ...query })); }, async post(request: Request, area: PostArea) { const authorized = await authorize(deps, request, 'POST', `${EMAIL_MARKETING_ROOT}/${area}`); if (authorized instanceof Response)
        return authorized; const { runtime, tenantContext, now, sessionBinding } = authorized; try {
        const value = await emailMarketingRequestBody(request), operationId = emailMarketingOperation(request);
        if (area === 'validate') {
            const v = emailMarketingObject(value, ['provider', 'apiKey']);
            const provider = parseEmailMarketingProvider(v.provider), apiKey = emailMarketingText(v.apiKey, 4096);
            return execute(() => runtime.email.validate({ tenantContext, now, sessionBinding, operationId, provider, apiKey }));
        }
        if (area === 'recheck' || area === 'disconnect' || area === 'sync') {
            const v = emailMarketingObject(value, ['expectedVersion']), expectedVersion = emailMarketingInteger(v.expectedVersion);
            return execute(() => runtime.email[area]({ tenantContext, now, operationId, expectedVersion }));
        }
        const v = emailMarketingObject(value, area === 'apply' ? ['candidateId', 'expectedVersion', 'selection'] : ['candidateId', 'expectedVersion']), candidateId = emailMarketingUuid(v.candidateId), expectedVersion = emailMarketingInteger(v.expectedVersion);
        if (area === 'rotate')
            return execute(() => runtime.email.rotate({ tenantContext, now, sessionBinding, operationId, candidateId, expectedVersion }));
        const selection = parseEmailMarketingSelection(v.selection);
        return execute(() => runtime.email.apply({ tenantContext, now, sessionBinding, operationId, candidateId, expectedVersion, selection }));
    }
    catch {
        return error('invalid_input', 400);
    } } }); }
