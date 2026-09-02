import {
  isMerchantActionAllowed,
  parseInventoryBalance,
  parseInventoryCount,
  parseInventoryLocation,
  parseInventoryLocationMutationResult,
  parseInventoryMutationResult,
  parseInventoryTransfer,
  parsePurchaseOrder,
  type MerchantAction,
  type TenantContext,
} from "@celebix/saas-contracts";
import { inventoryRepositoryErrorCode } from "@celebix/saas-data";

import { readOrderPanelSessionCookie } from "../order-http/request-input.ts";
import { approvedPanelMutationOriginForStore } from "../panel-origin-authority.ts";
import type { ServerPanelAccessResult } from "../server-panel-access/access.ts";
import type { ServerInventoryRuntime } from "../server-inventory/runtime.ts";
import { classifyInventoryRequest, inventoryOriginApproved, type InventoryRoute } from "./request-authority.ts";
import { readInventoryGetInput, readInventoryMutationInput, type InventoryMutationInput } from "./request-input.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
type Dependencies = Readonly<{ resolveRuntime(): Promise<ServerInventoryRuntime | null>; now(): Date; requestId(): string }>;
type Authorized = Readonly<{ runtime: ServerInventoryRuntime; tenantContext: TenantContext; now: Date }>;
type OperationValue = Readonly<{ operationId: string; expectedVersion: number }>;

function requiredAction(route: InventoryRoute): MerchantAction {
  switch (route.kind) {
    case "purchase_list":
    case "purchase_get":
      return "purchasing.read";
    case "purchase_save":
    case "purchase_transition":
    case "purchase_receive":
      return "purchasing.manage";
    case "locations":
    case "balances":
    case "count_list":
    case "count_get":
    case "transfer_list":
    case "transfer_get":
      return "inventory.read";
    case "location_save":
    case "location_archive":
    case "count_save":
    case "count_start":
    case "count_commit":
    case "count_cancel":
    case "transfer_save":
    case "transfer_dispatch":
    case "transfer_receive":
    case "transfer_cancel":
      return "inventory.manage";
  }
}

function response(value: unknown, status = 200, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  return Response.json(value, { status, headers });
}
function error(code: string, status: number, extra?: HeadersInit): Response { return response({ code }, status, extra); }
function repositoryError(value: unknown): Response {
  try {
    const code = inventoryRepositoryErrorCode(value);
    if (code === "invalid_input") return error("invalid_input", 400);
    if (code === "resource_not_found") return error("not_found", 404);
    if (["unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled", "durable_authority_invalid"].includes(code ?? "")) return error("forbidden", 403);
    if (["invalid_transition", "version_conflict", "operation_mismatch", "over_receipt", "inventory_conflict", "active_hold_conflict", "insufficient_stock"].includes(code ?? "")) return error("conflict", 409);
    return error("unavailable", 503);
  } catch { return error("unavailable", 503); }
}
function denseArray(value: unknown, maximum: number): readonly unknown[] {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) {
      throw new TypeError("inventory_http_output_invalid");
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).length !== value.length + 1) throw new TypeError("inventory_http_output_invalid");
    const copied: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        throw new TypeError("inventory_http_output_invalid");
      }
      copied.push(descriptor.value);
    }
    return copied;
  } catch { throw new TypeError("inventory_http_output_invalid"); }
}
function items(value: unknown, parser: (entry: unknown) => unknown): Readonly<{ items: readonly unknown[] }> {
  return Object.freeze({ items: Object.freeze(denseArray(value, 500).map(parser)) });
}
function mutation(kind: "purchase_order" | "inventory_count" | "inventory_transfer", value: unknown) {
  return Object.freeze({ kind, ...parseInventoryMutationResult(value) });
}
function locationMutation(value: unknown) {
  return Object.freeze({ kind: "inventory_location" as const, ...parseInventoryLocationMutationResult(value) });
}

async function authorize(dependencies: Dependencies, request: Request, route: InventoryRoute): Promise<Response | Authorized> {
  const cookie = readOrderPanelSessionCookie(request);
  if (cookie.kind !== "present") return error("unauthenticated", 401);
  let runtime: ServerInventoryRuntime | null;
  try { runtime = await dependencies.resolveRuntime(); } catch { return error("unavailable", 503); }
  if (!runtime) return error("unavailable", 503);
  if (route.method === "POST" && !inventoryOriginApproved(request, runtime.access.panelOrigin)) return error("forbidden", 403);
  let now: Date, requestId: string;
  try { now = dependencies.now(); requestId = dependencies.requestId(); } catch { return error("unavailable", 503); }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !UUID.test(requestId)) return error("unavailable", 503);
  let access: ServerPanelAccessResult;
  try {
    access = await runtime.access.resolveCredential({ hostname: request.headers.get("host"), credential: cookie.credential, requestId, now: new Date(now) });
  } catch { return error("unavailable", 503); }
  if (access.kind === "unauthenticated") return error("unauthenticated", 401);
  if (access.kind === "unauthorized") return error("forbidden", 403);
  if (access.kind !== "authenticated") return error("unavailable", 503);
  if (route.method === "POST" && !approvedPanelMutationOriginForStore(request, runtime.access.panelOrigin, access.tenantContext.store.slug)) return error("forbidden", 403);
  if (!isMerchantActionAllowed(access.tenantContext.membership.role, requiredAction(route))) return error("forbidden", 403);
  return Object.freeze({ runtime, tenantContext: access.tenantContext, now: new Date(now) });
}

async function execute(run: () => Promise<unknown>, parser: (value: unknown) => unknown): Promise<Response> {
  try { return response(parser(await run())); } catch (caught) { return repositoryError(caught); }
}

export function createInventoryHttpHandler(dependencies: Dependencies): (request: Request) => Promise<Response> {
  try {
    if (
      !dependencies || typeof dependencies !== "object" || Array.isArray(dependencies) ||
      Object.keys(dependencies).sort().join(",") !== "now,requestId,resolveRuntime" ||
      typeof dependencies.resolveRuntime !== "function" || typeof dependencies.now !== "function" ||
      typeof dependencies.requestId !== "function"
    ) throw new Error();
  } catch { throw new Error("inventory_http_handler_invalid"); }

  return async function handle(request: Request): Promise<Response> {
    const decision = classifyInventoryRequest(request);
    if (decision.kind === "not_found") return error("not_found", 404);
    if (decision.kind === "invalid") return error("invalid_input", 400);
    if (decision.kind === "method_not_allowed") return error("method_not_allowed", 405, { allow: decision.allow });
    const route = decision.route;
    const input = route.method === "GET"
      ? readInventoryGetInput(request, route)
      : await readInventoryMutationInput(request, route);
    if (input.kind === "invalid") return error("invalid_input", 400);
    const authorized = await authorize(dependencies, request, route);
    if (authorized instanceof Response) return authorized;
    const authority = { tenantContext: authorized.tenantContext, now: authorized.now };
    const repository = authorized.runtime.inventory;
    switch (route.kind) {
      case "locations": return execute(() => repository.listLocations(authority), (value) => items(value, parseInventoryLocation));
      case "location_save": return execute(() => repository.saveLocation({ ...authority, ...(input as Extract<InventoryMutationInput, { kind: "location_save" }>).value }), locationMutation);
      case "location_archive": return execute(() => repository.archiveLocation({ ...authority, locationId: route.id, ...(input as Extract<InventoryMutationInput, { kind: "location_archive" }>).value }), locationMutation);
      case "balances": return execute(() => repository.listBalances({ ...authority, locationId: (input as { locationId: string }).locationId }), (value) => items(value, parseInventoryBalance));
      case "purchase_list": return execute(() => repository.listPurchaseOrders(authority), (value) => items(value, parsePurchaseOrder));
      case "purchase_get": return execute(() => repository.getPurchaseOrder({ ...authority, orderId: route.id }), parsePurchaseOrder);
      case "purchase_save": return execute(() => repository.savePurchaseOrder({ ...authority, ...(input as Extract<InventoryMutationInput, { kind: "purchase_save" }>).value }), (value) => mutation("purchase_order", value));
      case "purchase_transition": return execute(() => repository.transitionPurchaseOrder({ ...authority, orderId: route.id, ...(input as Extract<InventoryMutationInput, { kind: "purchase_transition" }>).value }), (value) => mutation("purchase_order", value));
      case "purchase_receive": return execute(() => repository.receivePurchaseOrder({ ...authority, orderId: route.id, ...(input as Extract<InventoryMutationInput, { kind: "purchase_receive" }>).value }), (value) => mutation("purchase_order", value));
      case "count_list": return execute(() => repository.listCounts(authority), (value) => items(value, parseInventoryCount));
      case "count_get": return execute(() => repository.getCount({ ...authority, countId: route.id }), parseInventoryCount);
      case "count_save": return execute(() => repository.saveCount({ ...authority, ...(input as Extract<InventoryMutationInput, { kind: "count_save" }>).value }), (value) => mutation("inventory_count", value));
      case "count_start": return execute(() => repository.startCount({ ...authority, countId: route.id, ...(input as unknown as { value: OperationValue }).value }), (value) => mutation("inventory_count", value));
      case "count_commit": return execute(() => repository.commitCount({ ...authority, countId: route.id, ...(input as unknown as { value: OperationValue }).value }), (value) => mutation("inventory_count", value));
      case "count_cancel": return execute(() => repository.cancelCount({ ...authority, countId: route.id, ...(input as unknown as { value: OperationValue }).value }), (value) => mutation("inventory_count", value));
      case "transfer_list": return execute(() => repository.listTransfers(authority), (value) => items(value, parseInventoryTransfer));
      case "transfer_get": return execute(() => repository.getTransfer({ ...authority, transferId: route.id }), parseInventoryTransfer);
      case "transfer_save": return execute(() => repository.saveTransfer({ ...authority, ...(input as Extract<InventoryMutationInput, { kind: "transfer_save" }>).value }), (value) => mutation("inventory_transfer", value));
      case "transfer_dispatch": return execute(() => repository.dispatchTransfer({ ...authority, transferId: route.id, ...(input as unknown as { value: OperationValue }).value }), (value) => mutation("inventory_transfer", value));
      case "transfer_receive": return execute(() => repository.receiveTransfer({ ...authority, transferId: route.id, ...(input as unknown as { value: OperationValue }).value }), (value) => mutation("inventory_transfer", value));
      case "transfer_cancel": return execute(() => repository.cancelTransfer({ ...authority, transferId: route.id, ...(input as unknown as { value: OperationValue }).value }), (value) => mutation("inventory_transfer", value));
    }
  };
}
