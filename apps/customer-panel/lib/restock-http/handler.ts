import { authorizeCatalogAdminRequest, catalogAdminHttpError } from '../catalog-admin-http/handler.ts';
import type { ServerRestockRuntime } from '../server-restock/runtime.ts';
type Dependencies = Readonly<{ resolveRuntime(): Promise<ServerRestockRuntime | null>; now(): Date; requestId(): string }>;
export function createRestockStatsHandler(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const authorized = await authorizeCatalogAdminRequest(deps, request, 'GET', '/api/restock/stats', 'forbidden');
    if (authorized instanceof Response) return authorized;
    try {
      const runtime = authorized.runtime as ServerRestockRuntime;
      const stats = await runtime.restock.getStats({ tenantContext: authorized.tenantContext, now: authorized.now });
      return Response.json(stats, { headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
    } catch { return catalogAdminHttpError('unavailable', 503); }
  };
}
