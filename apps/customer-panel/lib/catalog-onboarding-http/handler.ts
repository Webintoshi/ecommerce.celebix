import "server-only";

import {
  catalogProductAction,
  isMerchantActionAllowed,
  type MerchantAction,
  type TenantContext,
} from "@celebix/saas-contracts";
import {
  CatalogOnboardingRepositoryError,
  type CatalogOnboardingErrorCode,
} from "@celebix/saas-data";

import type { ServerPanelAccessResult } from "../server-panel-access/access.ts";
import { approvedPanelMutationOriginForStore } from "../panel-origin-authority.ts";
import { readPersistentPanelSessionCookie } from "../server-panel-session-controls/request-input.ts";
import type { ServerCatalogOnboardingRuntime } from "../server-catalog-onboarding/runtime.ts";
import {
  createCatalogOnboardingRequestAuthorityValidator,
  type CatalogOnboardingRequestExpectation,
} from "./request-authority.ts";
import {
  readCatalogMerchandisingUpdateInput,
  readCatalogOnboardingCreateInput,
  readCatalogOnboardingProductId,
  readCatalogPublishAfterMediaInput,
  readCatalogCategoryCreateInput,
  readCatalogCategoryUpdateInput,
  readCatalogCategoryArchiveInput,
} from "./request-input.ts";

export const CATALOG_ONBOARDING_OPTIONS_PATH = "/api/catalog/onboarding/options";
export const CATALOG_ONBOARDING_PRODUCTS_PATH = "/api/catalog/onboarding/products";
export const CATALOG_ONBOARDING_CATEGORIES_PATH = "/api/catalog/onboarding/categories";

const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type AuthenticatedAccess = Extract<ServerPanelAccessResult, { kind: "authenticated" }>;
type Dependencies = Readonly<{
  resolveRuntime(): Promise<ServerCatalogOnboardingRuntime | null>;
  now(): Date;
  requestId(): string;
}>;
type AuthorizedRequest = Readonly<{
  runtime: ServerCatalogOnboardingRuntime;
  tenantContext: TenantContext;
  now: Date;
}>;

const ERROR_STATUS: Readonly<Record<CatalogOnboardingErrorCode, number>> = Object.freeze({
  invalid_input: 400,
  unauthenticated: 401,
  membership_denied: 403,
  store_inactive: 403,
  feature_not_enabled: 403,
  product_not_found: 404,
  category_not_found: 404,
  category_in_use: 409,
  durable_authority_invalid: 409,
  product_limit_reached: 409,
  catalog_conflict: 409,
  version_conflict: 409,
  invalid_transition: 409,
  media_incomplete: 409,
  operation_mismatch: 409,
  operation_not_found: 409,
  unavailable: 503,
});

function json(value: unknown, status: number, headers?: HeadersInit): Response {
  return Response.json(value, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...(headers ?? {}),
    },
  });
}

function error(code: string, status: number, headers?: HeadersInit): Response {
  return json({ code }, status, headers);
}

function repositoryError(value: unknown): Response {
  return value instanceof CatalogOnboardingRepositoryError
    ? error(value.code, ERROR_STATUS[value.code])
    : error("unavailable", 503);
}

function privateAuthorityPresent(request: Request): boolean {
  return [
    "authorization",
    "x-celebix-session",
    "x-panel-session-credential",
    "x-store-id",
    "x-tenant-id",
    "x-principal-id",
    "x-membership-id",
    "x-plan-id",
    "x-product-limit",
    "x-database-role",
    "x-database-url",
  ].some((name) => request.headers.has(name));
}

function accessFailure(result: Exclude<ServerPanelAccessResult, AuthenticatedAccess>): Response {
  if (result.kind === "unauthenticated") return error("unauthenticated", 401);
  if (result.kind === "unauthorized") return error("membership_denied", 403);
  return error("unavailable", 503);
}

function authorityFailure(
  decision: ReturnType<ReturnType<typeof createCatalogOnboardingRequestAuthorityValidator>["validate"]>,
  method: CatalogOnboardingRequestExpectation["method"],
): Response | null {
  if (decision === "approved") return null;
  if (decision === "method_not_allowed") return error("method_not_allowed", 405, { allow: method });
  if (decision === "origin_denied") return error("origin_denied", 403);
  return error("invalid_input", 400);
}

async function authorize(
  dependencies: Dependencies,
  request: Request,
  expectation: CatalogOnboardingRequestExpectation,
  action: MerchantAction,
): Promise<Response | AuthorizedRequest> {
  let runtime: ServerCatalogOnboardingRuntime | null;
  try { runtime = await dependencies.resolveRuntime(); }
  catch { return error("unavailable", 503); }
  if (runtime === null) return error("unavailable", 503);

  let validator;
  try { validator = createCatalogOnboardingRequestAuthorityValidator({ panelOrigin: runtime.access.panelOrigin }); }
  catch { return error("unavailable", 503); }
  const denied = authorityFailure(validator.validate(request, expectation), expectation.method);
  if (denied) return denied;
  if (privateAuthorityPresent(request)) return error("invalid_input", 400);

  const cookie = readPersistentPanelSessionCookie(request);
  if (cookie.kind !== "present") return error("unauthenticated", 401);
  let now: Date;
  let requestId: string;
  try {
    now = dependencies.now();
    requestId = dependencies.requestId();
  } catch { return error("unavailable", 503); }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !REQUEST_ID.test(requestId)) return error("unavailable", 503);

  let access: ServerPanelAccessResult;
  try {
    access = await runtime.access.resolveCredential({ hostname: request.headers.get("host"), credential: cookie.credential, requestId, now: new Date(now) });
  } catch { return error("unavailable", 503); }
  if (access.kind !== "authenticated") return accessFailure(access);
  if (
    expectation.method !== "GET"
    && !approvedPanelMutationOriginForStore(request, runtime.access.panelOrigin, access.tenantContext.store.slug)
  ) return error("origin_denied", 403);
  if (!isMerchantActionAllowed(access.tenantContext.membership.role, action)) {
    return error("membership_denied", 403);
  }
  return Object.freeze({ runtime, tenantContext: access.tenantContext, now: new Date(now) });
}

function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}

function productId(value: unknown): string | Response {
  return readCatalogOnboardingProductId(value) ?? error("invalid_input", 400);
}

async function execute<T>(operation: () => Promise<T>, status = 200): Promise<Response> {
  try { return json(await operation(), status); }
  catch (caught) { return repositoryError(caught); }
}

export function createCatalogOnboardingHttpHandlers(dependencies: Dependencies) {
  if (
    !dependencies || typeof dependencies !== "object" || Array.isArray(dependencies)
    || Object.keys(dependencies).sort().join(",") !== "now,requestId,resolveRuntime"
    || typeof dependencies.resolveRuntime !== "function"
    || typeof dependencies.now !== "function"
    || typeof dependencies.requestId !== "function"
  ) throw new Error("catalog_onboarding_http_handler_invalid");

  return Object.freeze({
    async getOptions(request: Request): Promise<Response> {
      const authorized = await authorize(dependencies, request, { method: "GET", pathname: CATALOG_ONBOARDING_OPTIONS_PATH }, catalogProductAction("read"));
      if (isResponse(authorized)) return authorized;
      return execute(() => authorized.runtime.onboarding.getOptions({ tenantContext: authorized.tenantContext, now: authorized.now }));
    },

    async createProduct(request: Request): Promise<Response> {
      const authorized = await authorize(dependencies, request, { method: "POST", pathname: CATALOG_ONBOARDING_PRODUCTS_PATH }, catalogProductAction("create"));
      if (isResponse(authorized)) return authorized;
      const input = await readCatalogOnboardingCreateInput(request);
      if (input.kind !== "valid") return error("invalid_input", 400);
      return execute(() => authorized.runtime.onboarding.createProduct({
        tenantContext: authorized.tenantContext,
        now: authorized.now,
        operationId: input.operationId,
        intent: input.intent,
      }), 201);
    },

    async getProductEditor(request: Request, rawProductId: unknown): Promise<Response> {
      const selectedProductId = productId(rawProductId);
      if (isResponse(selectedProductId)) return selectedProductId;
      const pathname = `/api/catalog/products/${selectedProductId}/merchandising`;
      const authorized = await authorize(dependencies, request, { method: "GET", pathname }, catalogProductAction("read"));
      if (isResponse(authorized)) return authorized;
      return execute(() => authorized.runtime.onboarding.getProductEditor({
        tenantContext: authorized.tenantContext,
        now: authorized.now,
        productId: selectedProductId,
      }));
    },

    async updateMerchandising(request: Request, rawProductId: unknown): Promise<Response> {
      const selectedProductId = productId(rawProductId);
      if (isResponse(selectedProductId)) return selectedProductId;
      const pathname = `/api/catalog/products/${selectedProductId}/merchandising`;
      const authorized = await authorize(dependencies, request, { method: "PATCH", pathname }, catalogProductAction("manage_merchandising"));
      if (isResponse(authorized)) return authorized;
      const input = await readCatalogMerchandisingUpdateInput(request);
      if (input.kind !== "valid") return error("invalid_input", 400);
      return execute(() => authorized.runtime.onboarding.updateMerchandising({
        tenantContext: authorized.tenantContext,
        now: authorized.now,
        operationId: input.operationId,
        productId: selectedProductId,
        expectedProfileVersion: input.expectedProfileVersion,
        profile: input.profile,
        categoryIds: input.categoryIds,
        resourceIds: input.resourceIds,
        channelIds: input.channelIds,
      }));
    },

    async publishAfterMedia(request: Request, rawProductId: unknown): Promise<Response> {
      const selectedProductId = productId(rawProductId);
      if (isResponse(selectedProductId)) return selectedProductId;
      const pathname = `/api/catalog/products/${selectedProductId}/publish-after-media`;
      const authorized = await authorize(dependencies, request, { method: "POST", pathname }, catalogProductAction("publish"));
      if (isResponse(authorized)) return authorized;
      const input = await readCatalogPublishAfterMediaInput(request);
      if (input.kind !== "valid") return error("invalid_input", 400);
      return execute(() => authorized.runtime.onboarding.publishAfterMedia({
        tenantContext: authorized.tenantContext,
        now: authorized.now,
        operationId: input.operationId,
        productId: selectedProductId,
        expectedProductVersion: input.expectedProductVersion,
        expectedMediaCount: input.expectedMediaCount,
      }));
    },

    async listCategories(request: Request): Promise<Response> {
      const authorized = await authorize(dependencies, request, { method: "GET", pathname: CATALOG_ONBOARDING_CATEGORIES_PATH }, "catalog_admin.read");
      if (isResponse(authorized)) return authorized;
      return execute(() => authorized.runtime.onboarding.listCategories({ tenantContext: authorized.tenantContext, now: authorized.now }));
    },

    async createCategory(request: Request): Promise<Response> {
      const authorized = await authorize(dependencies, request, { method: "POST", pathname: CATALOG_ONBOARDING_CATEGORIES_PATH }, "catalog_admin.manage");
      if (isResponse(authorized)) return authorized;
      const input = await readCatalogCategoryCreateInput(request);
      if (input.kind !== "valid") return error("invalid_input", 400);
      return execute(() => authorized.runtime.onboarding.createCategory({ tenantContext: authorized.tenantContext, now: authorized.now, operationId: input.operationId, fields: input.fields }), 201);
    },

    async updateCategory(request: Request, rawCategoryId: unknown): Promise<Response> {
      const categoryId = productId(rawCategoryId);
      if (isResponse(categoryId)) return categoryId;
      const authorized = await authorize(dependencies, request, { method: "PATCH", pathname: `${CATALOG_ONBOARDING_CATEGORIES_PATH}/${categoryId}` }, "catalog_admin.manage");
      if (isResponse(authorized)) return authorized;
      const input = await readCatalogCategoryUpdateInput(request);
      if (input.kind !== "valid") return error("invalid_input", 400);
      return execute(() => authorized.runtime.onboarding.updateCategory({ tenantContext: authorized.tenantContext, now: authorized.now, operationId: input.operationId, categoryId, expectedVersion: input.expectedVersion, fields: input.fields }));
    },

    async archiveCategory(request: Request, rawCategoryId: unknown): Promise<Response> {
      const categoryId = productId(rawCategoryId);
      if (isResponse(categoryId)) return categoryId;
      const authorized = await authorize(dependencies, request, { method: "POST", pathname: `${CATALOG_ONBOARDING_CATEGORIES_PATH}/${categoryId}/archive` }, "catalog_admin.archive");
      if (isResponse(authorized)) return authorized;
      const input = await readCatalogCategoryArchiveInput(request);
      if (input.kind !== "valid") return error("invalid_input", 400);
      return execute(() => authorized.runtime.onboarding.archiveCategory({ tenantContext: authorized.tenantContext, now: authorized.now, operationId: input.operationId, categoryId, expectedVersion: input.expectedVersion }));
    },
  });
}
