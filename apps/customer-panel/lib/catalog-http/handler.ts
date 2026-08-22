import "server-only";

import type { TenantContext } from "@celebix/saas-contracts";
import {
  CatalogRepositoryError,
  type CatalogErrorCode,
  type CatalogRepository,
} from "@celebix/saas-data";

import type { ServerPanelAccessResult } from "../server-panel-access/access.ts";
import { approvedPanelMutationOriginForStore } from "../panel-origin-authority.ts";
import { readPersistentPanelSessionCookie } from "../server-panel-session-controls/request-input.ts";
import type { ServerCatalogRuntime } from "../server-catalog/runtime.ts";
import {
  CATALOG_SUMMARY_PATH,
  CATALOG_VARIANT_CHOICES_PATH,
  createCatalogRequestAuthorityValidator,
  type CatalogRequestExpectation,
} from "./request-authority.ts";
import {
  readCatalogListInput,
  readCatalogMutationInput,
  readCatalogPathId,
} from "./request-input.ts";

const PRODUCTS_PATH = "/api/catalog/products";
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type AuthenticatedAccess = Extract<ServerPanelAccessResult, { kind: "authenticated" }>;
type Dependencies = Readonly<{
  resolveRuntime(): Promise<ServerCatalogRuntime | null>;
  now(): Date;
  requestId(): string;
}>;

type AuthorizedRequest = Readonly<{
  runtime: ServerCatalogRuntime;
  tenantContext: TenantContext;
  now: Date;
}>;

const ERROR_STATUS: Readonly<Record<CatalogErrorCode, number>> = Object.freeze({
  invalid_input: 400,
  unauthenticated: 401,
  membership_denied: 403,
  store_inactive: 403,
  feature_not_enabled: 403,
  product_not_found: 404,
  variant_not_found: 404,
  product_limit_reached: 409,
  slug_conflict: 409,
  sku_conflict: 409,
  version_conflict: 409,
  operation_replayed: 409,
  operation_mismatch: 409,
  durable_authority_invalid: 409,
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
  return value instanceof CatalogRepositoryError
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
  ].some((name) => request.headers.has(name));
}

function accessFailure(result: Exclude<ServerPanelAccessResult, AuthenticatedAccess>): Response {
  if (result.kind === "unauthenticated") return error("unauthenticated", 401);
  if (result.kind === "unauthorized") return error("membership_denied", 403);
  return error("unavailable", 503);
}

function authorityFailure(
  decision: ReturnType<ReturnType<typeof createCatalogRequestAuthorityValidator>["validate"]>,
  method: CatalogRequestExpectation["method"],
): Response | null {
  if (decision === "approved") return null;
  if (decision === "method_not_allowed") return error("method_not_allowed", 405, { allow: method });
  if (decision === "origin_denied") return error("origin_denied", 403);
  return error("invalid_input", 400);
}

async function authorize(
  dependencies: Dependencies,
  request: Request,
  expectation: CatalogRequestExpectation,
): Promise<Response | AuthorizedRequest> {
  let runtime: ServerCatalogRuntime | null;
  try { runtime = await dependencies.resolveRuntime(); }
  catch { return error("unavailable", 503); }
  if (runtime === null) return error("unavailable", 503);
  let validator;
  try { validator = createCatalogRequestAuthorityValidator({ panelOrigin: runtime.access.panelOrigin }); }
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
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !REQUEST_ID.test(requestId)) {
    return error("unavailable", 503);
  }
  let access: ServerPanelAccessResult;
  try {
    access = await runtime.access.resolveCredential({
      credential: cookie.credential,
      requestId,
      now: new Date(now),
    });
  } catch { return error("unavailable", 503); }
  if (access.kind !== "authenticated") return accessFailure(access);
  if (
    expectation.method !== "GET"
    && !approvedPanelMutationOriginForStore(request, runtime.access.panelOrigin, access.tenantContext.store.slug)
  ) return error("origin_denied", 403);
  return Object.freeze({ runtime, tenantContext: access.tenantContext, now: new Date(now) });
}

function exactId(value: unknown): string | Response {
  return readCatalogPathId(value) ?? error("invalid_input", 400);
}

function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}

async function execute<T>(operation: () => Promise<T>, success: (value: T) => Response): Promise<Response> {
  try { return success(await operation()); }
  catch (caught) { return repositoryError(caught); }
}

export function createCatalogHttpHandlers(dependencies: Dependencies) {
  if (
    !dependencies || typeof dependencies.resolveRuntime !== "function" ||
    typeof dependencies.now !== "function" || typeof dependencies.requestId !== "function"
  ) throw new Error("catalog_http_handler_invalid");

  return Object.freeze({
    async getDashboardSummary(request: Request): Promise<Response> {
      const authorized = await authorize(dependencies, request, {
        method: "GET", pathname: CATALOG_SUMMARY_PATH, query: "forbidden",
      });
      if (isResponse(authorized)) return authorized;
      return execute(
        () => authorized.runtime.catalog.getDashboardSummary({
          tenantContext: authorized.tenantContext,
          now: authorized.now,
        }),
        (result) => json(result, 200),
      );
    },

    async listProducts(request: Request): Promise<Response> {
      const authorized = await authorize(dependencies, request, {
        method: "GET", pathname: PRODUCTS_PATH, query: "allowed",
      });
      if (isResponse(authorized)) return authorized;
      const input = readCatalogListInput(request);
      if (input.kind !== "valid") return error("invalid_input", 400);
      return execute(
        () => authorized.runtime.catalog.listProducts({
          tenantContext: authorized.tenantContext,
          now: authorized.now,
          ...input.value,
        }),
        (result) => json(result, 200),
      );
    },

    async listVariantChoices(request: Request): Promise<Response> {
      const authorized = await authorize(dependencies, request, {
        method: "GET", pathname: CATALOG_VARIANT_CHOICES_PATH, query: "forbidden",
      });
      if (isResponse(authorized)) return authorized;
      return execute(
        () => authorized.runtime.catalog.listVariantChoices({
          tenantContext: authorized.tenantContext,
          now: authorized.now,
        }),
        (items) => json({ items }, 200),
      );
    },

    async createProduct(request: Request): Promise<Response> {
      const authorized = await authorize(dependencies, request, {
        method: "POST", pathname: PRODUCTS_PATH, query: "forbidden",
      });
      if (isResponse(authorized)) return authorized;
      const input = await readCatalogMutationInput(request, "create_product");
      if (input.kind !== "valid") return error("invalid_input", 400);
      return execute(
        () => authorized.runtime.catalog.createProduct({
          tenantContext: authorized.tenantContext,
          now: authorized.now,
          operationId: input.operationId,
          ...input.value,
        }),
        (result) => json(result, 201),
      );
    },

    async getProduct(request: Request, rawProductId: unknown): Promise<Response> {
      const productId = exactId(rawProductId);
      if (isResponse(productId)) return productId;
      const authorized = await authorize(dependencies, request, {
        method: "GET", pathname: `${PRODUCTS_PATH}/${productId}`, query: "forbidden",
      });
      if (isResponse(authorized)) return authorized;
      return execute(
        () => authorized.runtime.catalog.getProductDetails({
          tenantContext: authorized.tenantContext,
          now: authorized.now,
          productId,
        }),
        (result) => json(result, 200),
      );
    },

    async updateProduct(request: Request, rawProductId: unknown): Promise<Response> {
      const productId = exactId(rawProductId);
      if (isResponse(productId)) return productId;
      const authorized = await authorize(dependencies, request, {
        method: "PATCH", pathname: `${PRODUCTS_PATH}/${productId}`, query: "forbidden",
      });
      if (isResponse(authorized)) return authorized;
      const input = await readCatalogMutationInput(request, "update_product");
      if (input.kind !== "valid") return error("invalid_input", 400);
      return execute(
        () => authorized.runtime.catalog.updateProduct({
          tenantContext: authorized.tenantContext,
          now: authorized.now,
          operationId: input.operationId,
          productId,
          ...input.value,
        }),
        (result) => json(result, 200),
      );
    },

    async archiveProduct(request: Request, rawProductId: unknown): Promise<Response> {
      const productId = exactId(rawProductId);
      if (isResponse(productId)) return productId;
      const authorized = await authorize(dependencies, request, {
        method: "POST", pathname: `${PRODUCTS_PATH}/${productId}/archive`, query: "forbidden",
      });
      if (isResponse(authorized)) return authorized;
      const input = await readCatalogMutationInput(request, "archive_product");
      if (input.kind !== "valid") return error("invalid_input", 400);
      return execute(
        () => authorized.runtime.catalog.archiveProduct({
          tenantContext: authorized.tenantContext,
          now: authorized.now,
          operationId: input.operationId,
          productId,
          ...input.value,
        }),
        (result) => json(result, 200),
      );
    },

    async createVariant(request: Request, rawProductId: unknown): Promise<Response> {
      const productId = exactId(rawProductId);
      if (isResponse(productId)) return productId;
      const authorized = await authorize(dependencies, request, {
        method: "POST", pathname: `${PRODUCTS_PATH}/${productId}/variants`, query: "forbidden",
      });
      if (isResponse(authorized)) return authorized;
      const input = await readCatalogMutationInput(request, "create_variant");
      if (input.kind !== "valid") return error("invalid_input", 400);
      return execute(
        () => authorized.runtime.catalog.createVariant({
          tenantContext: authorized.tenantContext,
          now: authorized.now,
          operationId: input.operationId,
          productId,
          ...input.value,
        }),
        (result) => json(result, 201),
      );
    },

    async updateVariant(request: Request, rawProductId: unknown, rawVariantId: unknown): Promise<Response> {
      const productId = exactId(rawProductId);
      const variantId = exactId(rawVariantId);
      if (isResponse(productId)) return productId;
      if (isResponse(variantId)) return variantId;
      const authorized = await authorize(dependencies, request, {
        method: "PATCH", pathname: `${PRODUCTS_PATH}/${productId}/variants/${variantId}`, query: "forbidden",
      });
      if (isResponse(authorized)) return authorized;
      const input = await readCatalogMutationInput(request, "update_variant");
      if (input.kind !== "valid") return error("invalid_input", 400);
      return execute(
        () => authorized.runtime.catalog.updateVariant({
          tenantContext: authorized.tenantContext,
          now: authorized.now,
          operationId: input.operationId,
          productId,
          variantId,
          ...input.value,
        }),
        (result) => json(result, 200),
      );
    },

    async archiveVariant(request: Request, rawProductId: unknown, rawVariantId: unknown): Promise<Response> {
      const productId = exactId(rawProductId);
      const variantId = exactId(rawVariantId);
      if (isResponse(productId)) return productId;
      if (isResponse(variantId)) return variantId;
      const authorized = await authorize(dependencies, request, {
        method: "POST", pathname: `${PRODUCTS_PATH}/${productId}/variants/${variantId}/archive`, query: "forbidden",
      });
      if (isResponse(authorized)) return authorized;
      const input = await readCatalogMutationInput(request, "archive_variant");
      if (input.kind !== "valid") return error("invalid_input", 400);
      return execute(
        () => authorized.runtime.catalog.archiveVariant({
          tenantContext: authorized.tenantContext,
          now: authorized.now,
          operationId: input.operationId,
          productId,
          variantId,
          ...input.value,
        }),
        (result) => json(result, 200),
      );
    },
  });
}
