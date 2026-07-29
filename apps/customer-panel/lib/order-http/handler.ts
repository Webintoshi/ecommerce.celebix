import {
  parseOrderDashboardSummary,
  parseOrderDetail,
  parseOrderListItem,
  type TenantContext,
} from "@celebix/saas-contracts";
import {
  OrderRepositoryError,
  type OrderErrorCode,
  type OrderMutationResult,
} from "@celebix/saas-data";

import type { ServerPanelAccessResult } from "../server-panel-access/access.ts";
import type { ServerOrdersRuntime } from "../server-orders/runtime.ts";
import {
  createOrderRequestAuthorityValidator,
  type OrderRequestExpectation,
} from "./request-authority.ts";
import {
  readOrderListInput,
  readOrderMutationInput,
  readOrderPanelSessionCookie,
  readOrderPathId,
} from "./request-input.ts";

const ORDERS_PATH = "/api/orders";
const SUMMARY_PATH = "/api/orders/summary";
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type AuthenticatedAccess = Extract<ServerPanelAccessResult, { kind: "authenticated" }>;
type Dependencies = Readonly<{
  resolveRuntime(): Promise<ServerOrdersRuntime | null>;
  now(): Date;
  requestId(): string;
}>;
type AuthorizedRequest = Readonly<{
  runtime: ServerOrdersRuntime;
  tenantContext: TenantContext;
  now: Date;
}>;

const ERROR_STATUS: Readonly<Record<OrderErrorCode, number>> = Object.freeze({
  invalid_input: 400,
  unauthenticated: 401,
  membership_denied: 403,
  store_inactive: 403,
  feature_not_enabled: 403,
  order_not_found: 404,
  note_not_found: 404,
  invalid_transition: 409,
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
  try {
    if (!(value instanceof OrderRepositoryError)) return error("unavailable", 503);
    const code = value.code;
    if (typeof code !== "string" || !Object.hasOwn(ERROR_STATUS, code)) return error("unavailable", 503);
    return error(code, ERROR_STATUS[code as OrderErrorCode]);
  } catch { return error("unavailable", 503); }
}

function privateAuthorityPresent(request: Request): boolean {
  try {
    for (const [name] of request.headers) {
      if (
        name === "authorization" || name.startsWith("x-celebix") ||
        [
          "x-panel-session-credential", "x-store-id", "x-tenant-id", "x-principal-id",
          "x-membership-id", "x-plan-id", "x-database-role", "x-database-url",
        ].includes(name)
      ) return true;
    }
    return false;
  } catch { return true; }
}

function authorityFailure(
  decision: ReturnType<ReturnType<typeof createOrderRequestAuthorityValidator>["validate"]>,
  method: OrderRequestExpectation["method"],
): Response | null {
  if (decision === "approved") return null;
  if (decision === "method_not_allowed") return error("method_not_allowed", 405, { allow: method });
  if (decision === "origin_denied") return error("origin_denied", 403);
  return error("invalid_input", 400);
}

async function authorize(
  dependencies: Dependencies,
  request: Request,
  expectation: OrderRequestExpectation,
): Promise<Response | AuthorizedRequest> {
  let runtime: ServerOrdersRuntime | null;
  try { runtime = await dependencies.resolveRuntime(); }
  catch { return error("unavailable", 503); }
  if (runtime === null) return error("unavailable", 503);
  let decision;
  try {
    const validator = createOrderRequestAuthorityValidator({ panelOrigin: runtime.access.panelOrigin });
    decision = validator.validate(request, expectation);
  } catch { return error("unavailable", 503); }
  const denied = authorityFailure(decision, expectation.method);
  if (denied) return denied;
  if (privateAuthorityPresent(request)) return error("invalid_input", 400);
  let cookie;
  try { cookie = readOrderPanelSessionCookie(request); }
  catch { return error("unauthenticated", 401); }
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
  try {
    const kind = access.kind;
    if (kind === "unauthenticated") return error("unauthenticated", 401);
    if (kind === "unauthorized") return error("membership_denied", 403);
    if (kind !== "authenticated") return error("unavailable", 503);
    const tenantContext = (access as AuthenticatedAccess).tenantContext;
    return Object.freeze({ runtime, tenantContext, now: new Date(now) });
  } catch { return error("unavailable", 503); }
}

function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}

function pathId(value: unknown): string | Response {
  return readOrderPathId(value) ?? error("invalid_input", 400);
}

function mutationResult(value: unknown): Readonly<OrderMutationResult> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("invalid");
  const parsed = value as Record<string, unknown>;
  if (Object.keys(parsed).sort().join(",") !== "id,paymentStatus,replayed,status,updatedAt,version") {
    throw new TypeError("invalid");
  }
  const projected = parseOrderListItem({
    id: parsed.id,
    orderNumber: "synthetic",
    source: "manual_import",
    customerName: "Synthetic Customer",
    customerEmail: "synthetic@example.com",
    currency: "TRY",
    totalCents: 0,
    status: parsed.status,
    paymentStatus: parsed.paymentStatus,
    itemCount: 0,
    createdAt: parsed.updatedAt,
    updatedAt: parsed.updatedAt,
    version: parsed.version,
  });
  if (typeof parsed.replayed !== "boolean") throw new TypeError("invalid");
  return Object.freeze({
    id: projected.id,
    status: projected.status,
    paymentStatus: projected.paymentStatus,
    version: projected.version,
    updatedAt: projected.updatedAt,
    replayed: parsed.replayed,
  });
}

async function execute<T>(operation: () => Promise<T>, safe: (value: T) => unknown): Promise<Response> {
  try { return json(safe(await operation()), 200); }
  catch (caught) { return repositoryError(caught); }
}

export function createOrderHttpHandlers(dependencies: Dependencies) {
  try {
    if (
      !dependencies || typeof dependencies.resolveRuntime !== "function" ||
      typeof dependencies.now !== "function" || typeof dependencies.requestId !== "function"
    ) throw new Error("invalid");
  } catch { throw new Error("order_http_handler_invalid"); }

  return Object.freeze({
    async getDashboardSummary(request: Request): Promise<Response> {
      const authorized = await authorize(dependencies, request, {
        method: "GET", pathname: SUMMARY_PATH, query: "forbidden",
      });
      if (isResponse(authorized)) return authorized;
      return execute(
        () => authorized.runtime.orders.getDashboardSummary({
          tenantContext: authorized.tenantContext,
          now: authorized.now,
        }),
        parseOrderDashboardSummary,
      );
    },

    async listOrders(request: Request): Promise<Response> {
      const authorized = await authorize(dependencies, request, {
        method: "GET", pathname: ORDERS_PATH, query: "allowed",
      });
      if (isResponse(authorized)) return authorized;
      const input = readOrderListInput(request);
      if (input.kind !== "valid") return error("invalid_input", 400);
      return execute(
        () => authorized.runtime.orders.listOrders({
          tenantContext: authorized.tenantContext,
          now: authorized.now,
          ...input.value,
        }),
        (result) => {
          if (
            typeof result !== "object" || result === null || Array.isArray(result) ||
            (Object.keys(result).sort().join(",") !== "items" && Object.keys(result).sort().join(",") !== "items,nextCursor") ||
            !Array.isArray(result.items) ||
            (result.nextCursor !== undefined && (
              typeof result.nextCursor !== "string" || !/^[A-Za-z0-9_-]{1,1024}$/.test(result.nextCursor)
            ))
          ) throw new TypeError("invalid");
          return Object.freeze({
            items: Object.freeze(result.items.map(parseOrderListItem)),
            ...(result.nextCursor === undefined ? {} : { nextCursor: result.nextCursor }),
          });
        },
      );
    },

    async getOrder(request: Request, rawOrderId: unknown): Promise<Response> {
      const orderId = pathId(rawOrderId);
      if (isResponse(orderId)) return orderId;
      const authorized = await authorize(dependencies, request, {
        method: "GET", pathname: `${ORDERS_PATH}/${orderId}`, query: "forbidden",
      });
      if (isResponse(authorized)) return authorized;
      return execute(
        () => authorized.runtime.orders.getOrder({
          tenantContext: authorized.tenantContext,
          now: authorized.now,
          orderId,
        }),
        parseOrderDetail,
      );
    },

    async transitionStatus(request: Request, rawOrderId: unknown): Promise<Response> {
      const orderId = pathId(rawOrderId);
      if (isResponse(orderId)) return orderId;
      const authorized = await authorize(dependencies, request, {
        method: "PATCH", pathname: `${ORDERS_PATH}/${orderId}/status`, query: "forbidden",
      });
      if (isResponse(authorized)) return authorized;
      const input = await readOrderMutationInput(request, "transition_status");
      if (input.kind !== "valid") return error("invalid_input", 400);
      return execute(
        () => authorized.runtime.orders.transitionStatus({
          tenantContext: authorized.tenantContext,
          now: authorized.now,
          operationId: input.operationId,
          orderId,
          ...input.value,
        }),
        mutationResult,
      );
    },

    async transitionPayment(request: Request, rawOrderId: unknown): Promise<Response> {
      const orderId = pathId(rawOrderId);
      if (isResponse(orderId)) return orderId;
      const authorized = await authorize(dependencies, request, {
        method: "PATCH", pathname: `${ORDERS_PATH}/${orderId}/payment`, query: "forbidden",
      });
      if (isResponse(authorized)) return authorized;
      const input = await readOrderMutationInput(request, "transition_payment");
      if (input.kind !== "valid") return error("invalid_input", 400);
      return execute(
        () => authorized.runtime.orders.transitionPayment({
          tenantContext: authorized.tenantContext,
          now: authorized.now,
          operationId: input.operationId,
          orderId,
          ...input.value,
        }),
        mutationResult,
      );
    },

    async updateShipping(request: Request, rawOrderId: unknown): Promise<Response> {
      const orderId = pathId(rawOrderId);
      if (isResponse(orderId)) return orderId;
      const authorized = await authorize(dependencies, request, {
        method: "PATCH", pathname: `${ORDERS_PATH}/${orderId}/shipping`, query: "forbidden",
      });
      if (isResponse(authorized)) return authorized;
      const input = await readOrderMutationInput(request, "update_shipping");
      if (input.kind !== "valid") return error("invalid_input", 400);
      return execute(
        () => authorized.runtime.orders.updateShipping({
          tenantContext: authorized.tenantContext,
          now: authorized.now,
          operationId: input.operationId,
          orderId,
          ...input.value,
        }),
        mutationResult,
      );
    },

    async addNote(request: Request, rawOrderId: unknown): Promise<Response> {
      const orderId = pathId(rawOrderId);
      if (isResponse(orderId)) return orderId;
      const authorized = await authorize(dependencies, request, {
        method: "POST", pathname: `${ORDERS_PATH}/${orderId}/notes`, query: "forbidden",
      });
      if (isResponse(authorized)) return authorized;
      const input = await readOrderMutationInput(request, "add_note");
      if (input.kind !== "valid") return error("invalid_input", 400);
      return execute(
        () => authorized.runtime.orders.addNote({
          tenantContext: authorized.tenantContext,
          now: authorized.now,
          operationId: input.operationId,
          orderId,
          ...input.value,
        }),
        mutationResult,
      );
    },

    async archiveNote(request: Request, rawOrderId: unknown, rawNoteId: unknown): Promise<Response> {
      const orderId = pathId(rawOrderId);
      const noteId = pathId(rawNoteId);
      if (isResponse(orderId)) return orderId;
      if (isResponse(noteId)) return noteId;
      const authorized = await authorize(dependencies, request, {
        method: "POST", pathname: `${ORDERS_PATH}/${orderId}/notes/${noteId}/archive`, query: "forbidden",
      });
      if (isResponse(authorized)) return authorized;
      const input = await readOrderMutationInput(request, "archive_note");
      if (input.kind !== "valid") return error("invalid_input", 400);
      return execute(
        () => authorized.runtime.orders.archiveNote({
          tenantContext: authorized.tenantContext,
          now: authorized.now,
          operationId: input.operationId,
          orderId,
          noteId,
        }),
        mutationResult,
      );
    },
  });
}
