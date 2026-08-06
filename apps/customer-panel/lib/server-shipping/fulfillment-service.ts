import type {
  BeginShippingQuoteInput,
  BeginShippingShipmentInput,
  ShippingAdminRepository,
} from "@celebix/saas-data";

import { runShippingFulfillmentJob } from "./fulfillment-worker.ts";
import type { ServerShippingRuntime } from "./runtime.ts";

export function createShippingFulfillmentService(runtime: ServerShippingRuntime) {
  async function run(jobId: string, requestId: string, now: Date) {
    return runShippingFulfillmentJob({ jobId, workerId: `panel.${requestId}`, runtime, now });
  }
  return Object.freeze({
    async beginQuote(input: BeginShippingQuoteInput & Readonly<{ requestId: string }>) {
      const { requestId, ...command } = input;
      const pending = await runtime.admin.beginQuote(command);
      await run(pending.jobId, requestId, input.now);
      const quote = await runtime.admin.currentQuote({ tenantContext: input.tenantContext, now: input.now, credential: pending.credential });
      if (quote === null) throw new Error("shipping_quote_unavailable");
      return quote;
    },
    async currentQuote(input: Parameters<ShippingAdminRepository["currentQuote"]>[0]) {
      return runtime.admin.currentQuote(input);
    },
    async beginShipment(input: BeginShippingShipmentInput & Readonly<{ requestId: string }>) {
      const { requestId, ...command } = input;
      const pending = await runtime.admin.beginShipment(command);
      await run(pending.jobId, requestId, input.now);
      const shipment = await runtime.admin.currentShipment({ tenantContext: input.tenantContext, now: input.now, shipmentId: pending.shipment.id });
      if (shipment === null) throw new Error("shipping_shipment_unavailable");
      return shipment;
    },
    async currentShipment(input: Parameters<ShippingAdminRepository["currentShipment"]>[0]) {
      return runtime.admin.currentShipment(input);
    },
    async currentShipmentForOrder(input: Parameters<ShippingAdminRepository["currentShipmentForOrder"]>[0]) {
      return runtime.admin.currentShipmentForOrder(input);
    },
  });
}
