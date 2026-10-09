import {
  isMerchantActionAllowed, parseOrderBumpSettings, parseOrderBumpWorkspace, parseOrderBumpOptionsPage,
} from '@celebix/saas-contracts';
import { OrderBumpRepositoryError } from '@celebix/saas-data';
import {
  authorizeCatalogAdminRequest, catalogAdminHttpError, readCatalogAdminJsonBody,
  exactCatalogAdminHttpInput, catalogAdminOperationId, catalogAdminHttpId,
} from '../catalog-admin-http/handler.ts';
import type { ServerOrderBumpRuntime } from '../server-order-bumps/runtime.ts';

type Dependencies = Readonly<{ resolveRuntime(): Promise<ServerOrderBumpRuntime | null>; now(): Date; requestId(): string }>;
const PATH = '/api/order-bumps';
function json(value: unknown): Response {
  return Response.json(value, { headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}
function failure(error: unknown): Response {
  if (error instanceof OrderBumpRepositoryError) {
    const code = error.code;
    const status = code === 'invalid_input' ? 400 : code === 'unauthenticated' ? 401
      : ['membership_denied', 'store_inactive', 'feature_not_enabled', 'durable_authority_invalid', 'role_denied'].includes(code) ? 403
      : code === 'not_found' ? 404 : ['version_conflict', 'operation_mismatch', 'invalid_reference'].includes(code) ? 409 : 503;
    return catalogAdminHttpError(status === 503 ? 'unavailable' : code, status);
  }
  return catalogAdminHttpError('unavailable', 503);
}
function version(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : null;
}
function optionQuery(request: Request) {
  const entries = [...new URL(request.url).searchParams.entries()];
  const allowed = new Set(['kind', 'page', 'search', 'productId', 'ids']);
  if (entries.some(([key]) => !allowed.has(key)) || new Set(entries.map(([key]) => key)).size !== entries.length) return null;
  const query = Object.fromEntries(entries);
  if (!['product', 'category', 'variant'].includes(query.kind ?? '') || !/^[1-9]\d{0,5}$/.test(query.page ?? '1')) return null;
  const page = Number(query.page ?? '1');
  if (page > 10000) return null;
  const search = query.search?.trim();
  if (query.search !== undefined && (!search || search !== query.search || search.length > 120 || /[\u0000-\u001f\u007f-\u009f]/u.test(search))) return null;
  const productId = query.productId === undefined ? undefined : catalogAdminHttpId(query.productId);
  if (productId === null || productId !== undefined && query.kind !== 'variant') return null;
  let ids: readonly string[] | undefined;
  if (query.ids !== undefined) {
    const selected = query.ids.split(',');
    if (!selected.length || selected.length > 400 || new Set(selected).size !== selected.length || selected.some(id => catalogAdminHttpId(id) === null) || page !== 1 || search !== undefined || productId !== undefined) return null;
    ids = Object.freeze(selected);
  }
  return Object.freeze({ kind: query.kind as 'product' | 'category' | 'variant', page, ...(search === undefined ? {} : { search }), ...(productId === undefined ? {} : { productId }), ...(ids === undefined ? {} : { ids }) });
}

export function createOrderBumpHandlers(deps: Dependencies) {
  return Object.freeze({
    async get(request: Request): Promise<Response> {
      const auth = await authorizeCatalogAdminRequest(deps, request, 'GET', PATH, 'forbidden');
      if (auth instanceof Response) return auth;
      if (!isMerchantActionAllowed(auth.tenantContext.membership.role, 'configuration.read')) return catalogAdminHttpError('membership_denied', 403);
      try {
        const workspace = parseOrderBumpWorkspace(await (auth.runtime as ServerOrderBumpRuntime).orderBumps.get({ tenantContext: auth.tenantContext, now: auth.now }));
        return json({ workspace });
      } catch (error) { return failure(error); }
    },
    async save(request: Request): Promise<Response> {
      const auth = await authorizeCatalogAdminRequest(deps, request, 'POST', PATH, 'forbidden');
      if (auth instanceof Response) return auth;
      if (!isMerchantActionAllowed(auth.tenantContext.membership.role, 'configuration.manage')) return catalogAdminHttpError('membership_denied', 403);
      const operationId = catalogAdminOperationId(request);
      const row = exactCatalogAdminHttpInput(await readCatalogAdminJsonBody(request, 65536), ['expectedVersion', 'config']);
      const expectedVersion = row ? version(row.expectedVersion) : null;
      if (!row || expectedVersion === null || !operationId) return catalogAdminHttpError('invalid_input', 400);
      let config;
      try { config = parseOrderBumpSettings(row.config); } catch { return catalogAdminHttpError('invalid_input', 400); }
      try {
        const workspace = parseOrderBumpWorkspace(await (auth.runtime as ServerOrderBumpRuntime).orderBumps.save({ tenantContext: auth.tenantContext, now: auth.now, operationId, expectedVersion, config }));
        return json({ workspace });
      } catch (error) { return failure(error); }
    },
    async options(request: Request): Promise<Response> {
      const auth = await authorizeCatalogAdminRequest(deps, request, 'GET', PATH + '/options', 'allowed');
      if (auth instanceof Response) return auth;
      if (!isMerchantActionAllowed(auth.tenantContext.membership.role, 'configuration.read')) return catalogAdminHttpError('membership_denied', 403);
      const input = optionQuery(request);
      if (!input) return catalogAdminHttpError('invalid_input', 400);
      try {
        const options = parseOrderBumpOptionsPage(await (auth.runtime as ServerOrderBumpRuntime).orderBumps.options({ tenantContext: auth.tenantContext, now: auth.now, ...input }));
        if (options.page !== input.page || options.items.length > (input.ids ? input.ids.length : 20) || input.ids && options.items.some(row => !input.ids!.includes(row.id))) throw new Error('order_bump_invalid_options');
        return json({ options });
      } catch (error) { return failure(error); }
    },
  });
}
