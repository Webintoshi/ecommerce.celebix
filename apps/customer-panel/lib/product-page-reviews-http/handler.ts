import { isMerchantActionAllowed, parseProductPageReviewSettings } from "@celebix/saas-contracts";
import { ProductPageReviewError } from "@celebix/saas-data";
import { authorizeCatalogAdminRequest, readCatalogAdminJsonBody, exactCatalogAdminHttpInput, catalogAdminOperationId, catalogAdminHttpError } from "../catalog-admin-http/handler.ts";
import type { ServerProductPageReviewRuntime } from "../server-product-page-reviews/runtime.ts";

type Dependencies = Readonly<{ resolveRuntime(): Promise<ServerProductPageReviewRuntime | null>; now(): Date; requestId(): string }>;
const PATH = "/api/catalog/admin/product-page-reviews/settings";
const STATUSES: Readonly<Record<string, number>> = Object.freeze({ invalid_input: 400, unauthenticated: 401, membership_denied: 403, store_inactive: 403, feature_not_enabled: 403, version_conflict: 409, operation_mismatch: 409, durable_authority_invalid: 409, unavailable: 503 });
function json(value: unknown) { return Response.json(value, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } }); }
function failure(caught: unknown) { const code = caught instanceof ProductPageReviewError && Object.hasOwn(STATUSES, caught.code) ? caught.code : "unavailable"; return catalogAdminHttpError(code, STATUSES[code]!); }

export function createProductPageReviewHttpHandlers(deps: Dependencies) {
  async function run(request: Request, method: "GET" | "POST"): Promise<Response> {
    const authorized = await authorizeCatalogAdminRequest(deps, request, method, PATH, "forbidden");
    if (authorized instanceof Response) return authorized;
    const action = method === "GET" ? "catalog_admin.read" : "catalog_admin.moderate";
    if (!isMerchantActionAllowed(authorized.tenantContext.membership.role, action)) return catalogAdminHttpError("membership_denied", 403);
    const runtime = authorized.runtime as ServerProductPageReviewRuntime;
    const base = { tenantContext: authorized.tenantContext, now: authorized.now };
    if (method === "GET") {
      try { return json(parseProductPageReviewSettings(await runtime.productPageReviews.settings(base))); }
      catch (caught) { return failure(caught); }
    }
    const operationId = catalogAdminOperationId(request);
    const input = exactCatalogAdminHttpInput(await readCatalogAdminJsonBody(request, 2048), ["expectedVersion", "enabled"]);
    if (!operationId || !input || !Number.isSafeInteger(input.expectedVersion) || (input.expectedVersion as number) < 0 || typeof input.enabled !== "boolean") return catalogAdminHttpError("invalid_input", 400);
    const command = { ...base, operationId, expectedVersion: input.expectedVersion as number, enabled: input.enabled };
    try {
      const result = parseProductPageReviewSettings(await runtime.productPageReviews.saveSettings(command));
      if (result.enabled !== command.enabled || result.version <= command.expectedVersion) return catalogAdminHttpError("unavailable", 503);
      return json(result);
    } catch (caught) { return failure(caught); }
  }
  return Object.freeze({ get: (request: Request) => run(request, "GET"), save: (request: Request) => run(request, "POST") });
}
