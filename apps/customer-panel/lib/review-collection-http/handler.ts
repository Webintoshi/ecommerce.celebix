import { ReviewCollectionError } from "@celebix/saas-data";
import { parseReviewCollectionSettings } from "@celebix/saas-contracts";
import { authorizeCatalogAdminRequest, readCatalogAdminJsonBody, exactCatalogAdminHttpInput, catalogAdminOperationId, catalogAdminHttpId, catalogAdminHttpError } from "../catalog-admin-http/handler.ts";
import type { ServerReviewCollectionRuntime } from "../server-review-collection/runtime.ts";
type Dependencies = Readonly<{ resolveRuntime(): Promise<ServerReviewCollectionRuntime | null>; now(): Date; requestId(): string }>;
function json(value: unknown): Response { return Response.json(value, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } }); }
function failed(caught: unknown): Response { if (caught instanceof TypeError) return catalogAdminHttpError("invalid_input", 400); const code = caught instanceof ReviewCollectionError ? caught.code : "unavailable"; return catalogAdminHttpError(code, ["version_conflict", "operation_mismatch", "ineligible_order"].includes(code) ? 409 : code === "invalid_input" ? 400 : ["membership_denied", "feature_not_enabled", "store_inactive"].includes(code) ? 403 : 503); }
export function createReviewCollectionHttpHandlers(deps: Dependencies) {
  async function run(request: Request, action: "overview" | "settings" | "request"): Promise<Response> {
    const path = `/api/catalog/admin/review-collection${action === "overview" ? "" : `/${action}`}`;
    const authorized = await authorizeCatalogAdminRequest(deps, request, action === "overview" ? "GET" : "POST", path, "forbidden");
    if (authorized instanceof Response) return authorized;
    const runtime = authorized.runtime as ServerReviewCollectionRuntime, base = { tenantContext: authorized.tenantContext, now: authorized.now };
    try {
      if (action === "overview") return json(await runtime.reviewCollection.overview(base));
      const operationId = catalogAdminOperationId(request); if (!operationId) return catalogAdminHttpError("invalid_input", 400);
      const parsed = exactCatalogAdminHttpInput(await readCatalogAdminJsonBody(request, 8192), action === "settings" ? ["enabled", "delayDays", "expectedVersion"] : ["orderId", "expectedVersion"]);
      if (!parsed) return catalogAdminHttpError("invalid_input", 400);
      if (action === "settings") { const value = parseReviewCollectionSettings({ enabled: parsed.enabled, delayDays: parsed.delayDays, version: parsed.expectedVersion }); return json(await runtime.reviewCollection.saveSettings({ ...base, operationId, expectedVersion: value.version, enabled: value.enabled, delayDays: value.delayDays })); }
      const orderId = catalogAdminHttpId(parsed.orderId); if (!orderId || !Number.isSafeInteger(parsed.expectedVersion) || (parsed.expectedVersion as number) < 1) return catalogAdminHttpError("invalid_input", 400);
      return json(await runtime.reviewCollection.requestOrder({ ...base, operationId, orderId, expectedVersion: parsed.expectedVersion as number }));
    } catch (caught) { return failed(caught); }
  }
  return Object.freeze({ overview: (request: Request) => run(request, "overview"), settings: (request: Request) => run(request, "settings"), request: (request: Request) => run(request, "request") });
}
