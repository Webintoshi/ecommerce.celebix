import "server-only";

import { randomUUID } from "node:crypto";

import { resolveDefaultServerPanelAccessRuntime } from "../server-panel-access/default.ts";
import { resolveServerShippingRuntime } from "../server-shipping/runtime.ts";
import { runShippingFulfillmentJob } from "../server-shipping/fulfillment-worker.ts";
import { runShippingShipmentActionJob } from "../server-shipping/shipment-action-worker.ts";
import { runShippingValidationJob } from "../server-shipping/validation-worker.ts";
import { createShippingHttpHandlers } from "./handler.ts";

async function runtime() {
  return resolveServerShippingRuntime(await resolveDefaultServerPanelAccessRuntime());
}

const handlers = createShippingHttpHandlers({
  resolveRuntime: runtime,
  now: () => new Date(),
  requestId: randomUUID,
  validateJob: ({ jobId, workerId, runtime: selectedRuntime }) => runShippingValidationJob({
    jobId,
    workerId,
    runtime: selectedRuntime,
  }),
  fulfillJob: ({ jobId, workerId, runtime: selectedRuntime, now }) => runShippingFulfillmentJob({
    jobId,
    workerId,
    runtime: selectedRuntime,
    now,
  }),
  shipmentActionJob: ({ jobId, workerId, runtime: selectedRuntime, now }) => runShippingShipmentActionJob({
    jobId, workerId, runtime: selectedRuntime, now,
  }),
});

export const handleShippingConnection = handlers.connection;
export const handleShippingConnectionResources = handlers.resources;
export const handleShippingConnectionRevoke = handlers.revoke;

type OrderRouteContext = Readonly<{ params: Promise<Readonly<{ orderId: string }>> }>;
type ShipmentRouteContext = Readonly<{ params: Promise<Readonly<{ orderId: string; shipmentId: string }>> }>;

export async function handleShippingQuote(request: Request, context: OrderRouteContext) {
  const { orderId } = await context.params;
  return handlers.quote(request, orderId);
}

export async function handleShippingShipment(request: Request, context: OrderRouteContext) {
  const { orderId } = await context.params;
  return handlers.shipment(request, orderId);
}

export async function handleShippingShipmentForOrder(request: Request, context: OrderRouteContext) {
  const { orderId } = await context.params;
  return handlers.shipmentForOrder(request, orderId);
}

export async function handleShippingShipmentDetail(request: Request, context: ShipmentRouteContext) {
  const { orderId, shipmentId } = await context.params;
  return handlers.shipmentDetail(request, orderId, shipmentId);
}

export async function handleShippingShipmentAction(request: Request, context: ShipmentRouteContext, action: "refresh" | "cancel" | "return") {
  const { orderId, shipmentId } = await context.params;
  return handlers.shipmentAction(request, orderId, shipmentId, action);
}

export async function handleShippingShipmentLabel(request: Request, context: ShipmentRouteContext) {
  const { orderId, shipmentId } = await context.params;
  return handlers.shipmentLabel(request, orderId, shipmentId);
}
