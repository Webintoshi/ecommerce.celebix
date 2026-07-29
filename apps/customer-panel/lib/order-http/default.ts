import "server-only";

import { randomUUID } from "node:crypto";

import { resolveDefaultServerPanelAccessRuntime } from "../server-panel-access/default.ts";
import { resolveServerOrdersRuntime } from "../server-orders/runtime.ts";
import { createOrderHttpHandlers } from "./handler.ts";

async function resolveDefaultServerOrdersRuntime() {
  return resolveServerOrdersRuntime(await resolveDefaultServerPanelAccessRuntime());
}

const handlers = createOrderHttpHandlers({
  resolveRuntime: resolveDefaultServerOrdersRuntime,
  now: () => new Date(),
  requestId: randomUUID,
});

type OrderRouteContext = Readonly<{
  params: Promise<Readonly<{ orderId: string }>>;
}>;

type OrderNoteRouteContext = Readonly<{
  params: Promise<Readonly<{ orderId: string; noteId: string }>>;
}>;

export const handleDefaultOrderGetDashboardSummary = handlers.getDashboardSummary;
export const handleDefaultOrderList = handlers.listOrders;

export async function handleDefaultOrderGet(request: Request, context: OrderRouteContext) {
  const { orderId } = await context.params;
  return handlers.getOrder(request, orderId);
}

export async function handleDefaultOrderTransitionStatus(request: Request, context: OrderRouteContext) {
  const { orderId } = await context.params;
  return handlers.transitionStatus(request, orderId);
}

export async function handleDefaultOrderTransitionPayment(request: Request, context: OrderRouteContext) {
  const { orderId } = await context.params;
  return handlers.transitionPayment(request, orderId);
}

export async function handleDefaultOrderUpdateShipping(request: Request, context: OrderRouteContext) {
  const { orderId } = await context.params;
  return handlers.updateShipping(request, orderId);
}

export async function handleDefaultOrderAddNote(request: Request, context: OrderRouteContext) {
  const { orderId } = await context.params;
  return handlers.addNote(request, orderId);
}

export async function handleDefaultOrderArchiveNote(request: Request, context: OrderNoteRouteContext) {
  const { orderId, noteId } = await context.params;
  return handlers.archiveNote(request, orderId, noteId);
}
