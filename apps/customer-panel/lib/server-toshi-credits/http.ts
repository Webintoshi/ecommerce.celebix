import { isMerchantActionAllowed, parseToshiCreditWallet, TOSHI_CREDIT_OFFERS, TOSHI_CREDIT_PRICES } from '@celebix/saas-contracts';
import { ToshiCreditRepositoryError } from '@celebix/saas-data';
import { readOrderPanelSessionCookie } from '../order-http/request-input.ts';
import type { ServerToshiCreditsRuntime } from './runtime.ts';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const STATUS: Readonly<Record<string, number>> = { invalid_input: 400, unauthenticated: 401, membership_denied: 403, store_inactive: 403, feature_not_enabled: 403, unavailable: 503, commit_unknown: 503 };
type Dependencies = Readonly<{ resolveRuntime(): Promise<ServerToshiCreditsRuntime | null>; now(): Date; requestId(): string; requestBudgetMs?: number }>;
function json(value: unknown, status = 200): Response { return Response.json(value, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } }); }
function failure(code: string): Response { return json({ code }, STATUS[code] ?? 503); }
function shape(request: Request): boolean {
  try {
    const url = new URL(request.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/api/toshi/credits' || url.search || url.hash || request.body !== null) return false;
    for (const [name] of request.headers) if (name === 'authorization' || name.startsWith('x-celebix') || ['x-panel-session-credential', 'x-store-id', 'x-tenant-id', 'x-principal-id', 'x-membership-id', 'x-plan-id', 'x-database-role', 'x-database-url'].includes(name)) return false;
    return true;
  } catch { return false; }
}
export function createToshiCreditsHttpHandler(deps: Dependencies): (request: Request) => Promise<Response> {
  return async request => {
    const budget = deps.requestBudgetMs ?? 10_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: (() => void) | undefined;
    try {
      if (request.method !== 'GET') return json({ code: 'method_not_allowed' }, 405);
      if (!shape(request)) return failure('invalid_input');
      if (request.signal.aborted) return failure('unavailable');
      const expired = new Promise<never>((_, reject) => {
        abort = () => reject(Error('unavailable'));
        request.signal.addEventListener('abort', abort, { once: true });
        timer = setTimeout(abort, Number.isSafeInteger(budget) && budget > 0 ? Math.min(budget, 10_000) : 10_000);
      });
      async function run<T>(operation: () => Promise<T>): Promise<T> { return Promise.race([operation(), expired]); }
      const runtime = await run(deps.resolveRuntime);
      if (!runtime) return failure('unavailable');
      const cookie = readOrderPanelSessionCookie(request);
      if (cookie.kind !== 'present') return failure('unauthenticated');
      const now = deps.now(), requestId = deps.requestId();
      if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !UUID.test(requestId)) return failure('unavailable');
      const access = await run(() => runtime.access.resolveCredential({ credential: cookie.credential, hostname: request.headers.get('host'), requestId, now }));
      if (access.kind === 'unauthenticated') return failure('unauthenticated');
      if (access.kind === 'unauthorized') return failure('membership_denied');
      if (access.kind !== 'authenticated') return failure('unavailable');
      const tenantContext = access.tenantContext;
      if (tenantContext.store.status !== 'active') return failure('store_inactive');
      if (tenantContext.membership.status !== 'active' || !isMerchantActionAllowed(tenantContext.membership.role, 'catalog_admin.manage')) return failure('membership_denied');
      const wallet = parseToshiCreditWallet(await run(() => runtime.repository.getWallet({ tenantContext, now })));
      return json({ wallet, offers: TOSHI_CREDIT_OFFERS, prices: TOSHI_CREDIT_PRICES });
    } catch (error) { return failure(error instanceof ToshiCreditRepositoryError ? error.code : 'unavailable'); }
    finally { if (timer !== undefined) clearTimeout(timer); if (abort) request.signal.removeEventListener('abort', abort); }
  };
}
