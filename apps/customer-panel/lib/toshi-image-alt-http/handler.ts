import { hasCommercialCapability, isMerchantActionAllowed } from '@celebix/saas-contracts';
import { readOrderPanelSessionCookie } from '../order-http/request-input.ts';
import { approvedPanelMutationOriginForStore, hasApprovedPanelMutationOriginShape } from '../panel-origin-authority.ts';
import { safeToshiImageAltError } from '../server-toshi-image-alts/service.ts';
import { ToshiImageAltError } from '../server-toshi-image-alts/errors.ts';
import { parseToshiImageAltRequest, UUID } from '../server-toshi-image-alts/validation.ts';
import type { ServerToshiImageAltRuntime } from '../server-toshi-image-alts/runtime.ts';
const MAX_BODY = 1_048_576;
const STATUS: Readonly<Record<string, number>> = { invalid_input: 400, unauthenticated: 401, membership_denied: 403, store_inactive: 403, origin_denied: 403, feature_not_enabled: 403, credential_invalid: 503, insufficient_credits: 402, operation_busy: 409, operation_mismatch: 409, operation_failed: 409, rate_limited: 429, provider_timeout: 504, provider_unavailable: 503, commit_unknown: 503, invalid_output: 502, cancelled: 499, unavailable: 503 };
type Dependencies = Readonly<{ resolveRuntime(): Promise<ServerToshiImageAltRuntime | null>; now(): Date; requestId(): string; requestBudgetMs?: number }>;
function json(value: unknown, status = 200): Response { return Response.json(value, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } }); }
function failure(code: string): Response { return json({ code }, STATUS[code] ?? 503); }
function shape(request: Request): boolean {
  try {
    const url = new URL(request.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/api/content-ai/image-alts' || url.search || url.hash) return false;
    for (const [name] of request.headers) if (name === 'authorization' || name.startsWith('x-celebix') || ['x-panel-session-credential', 'x-store-id', 'x-tenant-id', 'x-principal-id', 'x-membership-id', 'x-plan-id', 'x-database-role', 'x-database-url'].includes(name)) return false;
    return true;
  } catch { return false; }
}
async function body(request: Request, run: <T>(operation: () => Promise<T>) => Promise<T>): Promise<unknown> {
  if (request.headers.get('content-type') !== 'application/json' || request.headers.has('transfer-encoding') || !request.body) throw new ToshiImageAltError('invalid_input');
  const length = request.headers.get('content-length');
  if (length !== null && (!/^(?:0|[1-9]\d*)$/.test(length) || Number(length) > MAX_BODY)) throw new ToshiImageAltError('invalid_input');
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const next = await run(() => reader.read()); if (next.done) break; size += next.value.byteLength; if (size > MAX_BODY) throw new ToshiImageAltError('invalid_input'); chunks.push(next.value); }
    const joined = new Uint8Array(size); let offset = 0;
    try { for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; } return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(joined)); }
    catch (error) { if (error instanceof ToshiImageAltError) throw error; throw new ToshiImageAltError('invalid_input'); }
    finally { joined.fill(0); }
  } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); chunks.forEach(chunk => chunk.fill(0)); }
}
export function createToshiImageAltHttpHandler(deps: Dependencies): (request: Request) => Promise<Response> {
  return async request => {
    const controller = new AbortController(), signal = AbortSignal.any([request.signal, controller.signal]);
    const budget = Math.min(45_000, Math.max(1, deps.requestBudgetMs ?? 45_000)), deadlineAt = performance.now() + budget;
    const expired = () => new ToshiImageAltError(request.signal.aborted ? 'cancelled' : 'provider_timeout');
    let rejectAbort: (error: unknown) => void = () => {};
    const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; }); void aborted.catch(() => {});
    const onAbort = () => rejectAbort(expired()); signal.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), budget);
    const run = async <T>(operation: () => Promise<T>): Promise<T> => { if (signal.aborted) throw expired(); return Promise.race([operation(), aborted]); };
    try {
      if (request.method !== 'POST') return json({ code: 'method_not_allowed' }, 405);
      if (!shape(request)) return failure('invalid_input');
      const runtime = await run(deps.resolveRuntime);
      if (!runtime) return failure('unavailable');
      if (!hasApprovedPanelMutationOriginShape(request, runtime.access.panelOrigin)) return failure('origin_denied');
      const cookie = readOrderPanelSessionCookie(request);
      if (cookie.kind !== 'present') return failure('unauthenticated');
      const now = deps.now(), requestId = deps.requestId();
      if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !UUID.test(requestId)) return failure('unavailable');
      const access = await run(() => runtime.access.resolveCredential({ credential: cookie.credential, hostname: request.headers.get('host'), requestId, now }));
      if (access.kind === 'unauthenticated') return failure('unauthenticated');
      if (access.kind === 'unauthorized') return failure('membership_denied');
      if (access.kind !== 'authenticated') return failure('unavailable');
      const tenantContext = access.tenantContext;
      if (!approvedPanelMutationOriginForStore(request, runtime.access.panelOrigin, tenantContext.store.slug)) return failure('origin_denied');
      if (tenantContext.store.status !== 'active') return failure('store_inactive');
      if (tenantContext.membership.status !== 'active' || !isMerchantActionAllowed(tenantContext.membership.role, 'catalog_admin.manage')) return failure('membership_denied');
      if (!hasCommercialCapability(tenantContext.entitlements, 'ai')) return failure('feature_not_enabled');
      const operationId = request.headers.get('idempotency-key');
      if (!operationId || !UUID.test(operationId)) return failure('invalid_input');
      const parsed = parseToshiImageAltRequest(await body(request, run));
      return json(await run(() => runtime.service.generate({ tenantContext, operationId, request: parsed, signal, deadlineAt })));
    } catch (error) { return failure(safeToshiImageAltError(error).code); }
    finally { clearTimeout(timer); signal.removeEventListener('abort', onAbort); }
  };
}
