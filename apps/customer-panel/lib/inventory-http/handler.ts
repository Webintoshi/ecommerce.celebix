import {
  parseInventoryBalance,
  parseInventoryCount,
  parseInventoryLocation,
  parseInventoryMutationResult,
  parseInventoryTransfer,
  parsePurchaseOrder,
  type TenantContext,
} from "@celebix/saas-contracts";
import { InventoryRepositoryError } from "@celebix/saas-data";

import { readOrderPanelSessionCookie } from "../order-http/request-input.ts";
import type { ServerPanelAccessResult } from "../server-panel-access/access.ts";
import type { ServerInventoryRuntime } from "../server-inventory/runtime.ts";
import { classifyInventoryRequest, inventoryOriginApproved, type InventoryRoute } from "./request-authority.ts";
import { readInventoryGetInput, readInventoryMutationInput, type InventoryMutationInput } from "./request-input.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
type Dependencies = Readonly<{ resolveRuntime(): Promise<ServerInventoryRuntime | null>; now(): Date; requestId(): string }>;
type Authorized = Readonly<{ runtime: ServerInventoryRuntime; tenantContext: TenantContext; now: Date }>;
type OperationValue = Readonly<{ operationId: string; expectedVersion: number }>;

function response(value: unknown, status = 200, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  return Response.json(value, { status, headers });
}
function error(code: string, status: number, extra?: HeadersInit): Response { return response({ code }, status, extra); }
function repositoryError(value: unknown): Response {
  if (!(value instanceof InventoryRepositoryError)) return error("unavailable", 503);
  if (value.code === "invalid_input") return error("invalid_input", 400);
  if (value.code === "resource_not_found") return error("not_found", 404);
  if (["unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled", "durable_authority_invalid"].includes(value.code)) return error("forbidden", 403);
  if (["invalid_transition", "version_conflict", "operation_mismatch", "over_receipt", "inventory_conflict", "active_hold_conflict", "insufficient_stock"].includes(value.code)) return error("conflict", 409);
  return error("unavailable", 503);
}
function items(value: unknown, parser: (entry: unknown) => unknown): Readonly<{ items: readonly unknown[] }> {
  if (!Array.isArray(value) || value.length > 500) throw new TypeError("inventory_http_output_invalid");
  return Object.freeze({ items: Object.freeze(value.map(parser)) });
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
    access = await runtime.access.resolveCredential({ credential: cookie.credential, requestId, now: new Date(now) });
  } catch { return error("unavailable", 503); }
  if (access.kind === "unauthenticated") return error("unauthenticated", 401);
  if (access.kind === "unauthorized") return error("forbidden", 403);
  if (access.kind !== "authenticated") return error("unavailable", 503);
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
      case "balances": return execute(() => repository.listBalances({ ...authority, locationId: (input as { locationId: string }).locationId }), (value) => items(value, parseInventoryBalance));
      case "purchase_list": return execute(() => repository.listPurchaseOrders(authority), (value) => items(value, parsePurchaseOrder));
      case "purchase_get": return execute(() => repository.getPurchaseOrder({ ...authority, orderId: route.id }), parsePurchaseOrder);
      case "purchase_save": return execute(() => repository.savePurchaseOrder({ ...authority, ...(input as Extract<InventoryMutationInput, { kind: "purchase_save" }>).value }), parseInventoryMutationResult);
      case "purchase_transition": return execute(() => repository.transitionPurchaseOrder({ ...authority, orderId: route.id, ...(input as Extract<InventoryMutationInput, { kind: "purchase_transition" }>).value }), parseInventoryMutationResult);
      case "purchase_receive": return execute(() => repository.receivePurchaseOrder({ ...authority, orderId: route.id, ...(input as Extract<InventoryMutationInput, { kind: "purchase_receive" }>).value }), parseInventoryMutationResult);
      case "count_list": return execute(() => repository.listCounts(authority), (value) => items(value, parseInventoryCount));
      case "count_get": return execute(() => repository.getCount({ ...authority, countId: route.id }), parseInventoryCount);
      case "count_save": return execute(() => repository.saveCount({ ...authority, ...(input as Extract<InventoryMutationInput, { kind: "count_save" }>).value }), parseInventoryMutationResult);
      case "count_start": return execute(() => repository.startCount({ ...authority, countId: route.id, ...(input as unknown as { value: OperationValue }).value }), parseInventoryMutationResult);
      case "count_commit": return execute(() => repository.commitCount({ ...authority, countId: route.id, ...(input as unknown as { value: OperationValue }).value }), parseInventoryMutationResult);
      case "count_cancel": return execute(() => repository.cancelCount({ ...authority, countId: route.id, ...(input as unknown as { value: OperationValue }).value }), parseInventoryMutationResult);
      case "transfer_list": return execute(() => repository.listTransfers(authority), (value) => items(value, parseInventoryTransfer));
      case "transfer_get": return execute(() => repository.getTransfer({ ...authority, transferId: route.id }), parseInventoryTransfer);
      case "transfer_save": return execute(() => repository.saveTransfer({ ...authority, ...(input as Extract<InventoryMutationInput, { kind: "transfer_save" }>).value }), parseInventoryMutationResult);
      case "transfer_dispatch": return execute(() => repository.dispatchTransfer({ ...authority, transferId: route.id, ...(input as unknown as { value: OperationValue }).value }), parseInventoryMutationResult);
      case "transfer_receive": return execute(() => repository.receiveTransfer({ ...authority, transferId: route.id, ...(input as unknown as { value: OperationValue }).value }), parseInventoryMutationResult);
      case "transfer_cancel": return execute(() => repository.cancelTransfer({ ...authority, transferId: route.id, ...(input as unknown as { value: OperationValue }).value }), parseInventoryMutationResult);
    }
  };
}
