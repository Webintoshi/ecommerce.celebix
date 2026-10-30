import { hasCommercialCapability, isMerchantActionAllowed } from '@celebix/saas-contracts';
import { readOrderPanelSessionCookie } from '../order-http/request-input.ts';
import { approvedPanelMutationOriginForStore, hasApprovedPanelMutationOriginShape } from '../panel-origin-authority.ts';
import { parsePolicyAuthoringRequest } from '../policy-authoring/validation.ts';
import { PolicyAuthoringError, safePolicyAuthoringError } from '../server-policy-authoring/service.ts';
import type { ServerPolicyAuthoringRuntime } from '../server-policy-authoring/runtime.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_BODY = 125_000;
const STATUS: Readonly<Record<string, number>> = {
  invalid_input: 400, source_too_large: 413, unauthenticated: 401, membership_denied: 403, store_inactive: 403, origin_denied: 403,
  feature_not_enabled: 403, credential_invalid: 503, connection_missing: 503, connection_revoked: 409,
  insufficient_credits: 402, operation_busy: 409, operation_mismatch: 409, operation_failed: 409,
  version_conflict: 409, record_not_found: 404, model_unavailable: 503, rate_limited: 429, quota_exceeded: 429,
  provider_timeout: 504, provider_unavailable: 503, commit_unknown: 503, invalid_output: 502, cancelled: 499, unavailable: 503,
};
type Dependencies = Readonly<{
  resolveRuntime(): Promise<ServerPolicyAuthoringRuntime | null>;
  now(): Date;
  requestId(): string;
  requestBudgetMs?: number;
}>;
function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}
function failure(code: string): Response { return json({ code }, STATUS[code] ?? 503); }
function requestShape(request: Request): boolean {
  try {
    const url = new URL(request.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/api/content-ai/policies' || url.search || url.hash) return false;
    for (const [name] of request.headers) {
      if (name === 'authorization' || name.startsWith('x-celebix') || ['x-panel-session-credential', 'x-store-id', 'x-tenant-id', 'x-principal-id', 'x-membership-id', 'x-plan-id', 'x-database-role', 'x-database-url'].includes(name)) return false;
    }
    return true;
  } catch { return false; }
}
async function readBody(request: Request, run: <T>(operation: () => Promise<T>) => Promise<T>): Promise<unknown> {
  if (request.headers.get('content-type') !== 'application/json' || request.headers.has('transfer-encoding') || !request.body) throw new PolicyAuthoringError('invalid_input');
  const length = request.headers.get('content-length');
  if (length !== null && (!/^(?:0|[1-9]\d*)$/.test(length) || Number(length) > MAX_BODY)) throw new PolicyAuthoringError('invalid_input');
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await run(() => reader.read());
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_BODY) throw new PolicyAuthoringError('invalid_input');
      chunks.push(new Uint8Array(next.value));
    }
    if (size === 0 || length !== null && Number(length) !== size) throw new PolicyAuthoringError('invalid_input');
    const joined = new Uint8Array(size);
    let offset = 0;
    try {
      for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
      try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(joined)); }
      catch { throw new PolicyAuthoringError('invalid_input'); }
    } finally { joined.fill(0); }
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
    chunks.forEach(chunk => chunk.fill(0));
  }
}
export function createPolicyAuthoringHttpHandler(deps: Dependencies): (request: Request) => Promise<Response> {
  return async request => {
    const controller = new AbortController(), signal = AbortSignal.any([request.signal, controller.signal]);
    const budget = Math.min(45_000, Math.max(1, deps.requestBudgetMs ?? 45_000)), deadlineAt = performance.now() + budget;
    const expired = () => new PolicyAuthoringError(request.signal.aborted ? 'cancelled' : 'provider_timeout');
    let rejectAbort: (error: unknown) => void = () => {};
    const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
    void aborted.catch(() => {});
    const onAbort = () => rejectAbort(expired());
    signal.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), budget);
    const run = async <T>(operation: () => Promise<T>): Promise<T> => {
      if (signal.aborted || performance.now() >= deadlineAt) throw expired();
      const result = await Promise.race([operation(), aborted]);
      if (signal.aborted || performance.now() >= deadlineAt) throw expired();
      return result;
    };
    try {
      if (request.method !== 'POST') return json({ code: 'method_not_allowed' }, 405);
      if (!requestShape(request)) return failure('invalid_input');
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
      if (tenantContext.membership.status !== 'active' || !isMerchantActionAllowed(tenantContext.membership.role, 'content.manage')) return failure('membership_denied');
      if (!hasCommercialCapability(tenantContext.entitlements, 'ai')) return failure('feature_not_enabled');
      const operationId = request.headers.get('idempotency-key');
      if (!operationId || !UUID.test(operationId)) return failure('invalid_input');
      const raw = await readBody(request, run);
      let parsed;
      try { parsed = parsePolicyAuthoringRequest(raw); } catch { return failure('invalid_input'); }
      return json(await run(() => runtime.service.generate({ tenantContext, operationId, request: parsed, signal, deadlineAt })));
    } catch (error) { return failure(safePolicyAuthoringError(error).code); }
    finally { clearTimeout(timer); signal.removeEventListener('abort', onAbort); }
  };
}
