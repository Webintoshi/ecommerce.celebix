import { createHash } from "node:crypto";

import type { ShippingFulfillmentClaim } from "@celebix/saas-data";

import type { ServerShippingRuntime } from "./runtime.ts";

export type ShippingFulfillmentJobOutcome = "empty" | "completed" | "failed" | "requeued" | "marked_unknown";

type Input = Readonly<{
  jobId: string;
  workerId: string;
  runtime: ServerShippingRuntime;
  now?: Date;
  signal?: AbortSignal;
}>;

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`).join(",")}}`;
}

function digest(value: unknown): string {
  return createHash("sha256").update(stable(value), "utf8").digest("hex");
}

function addressText(value: unknown, maximum: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= maximum && value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value) ? value : null;
}

async function fail(
  runtime: ServerShippingRuntime,
  claim: ShippingFulfillmentClaim,
  now: Date,
  result: Readonly<{ kind: "credential_invalid" | "rejected" | "throttled" | "temporary_failure"; safeCode?: string; retryAfterSeconds?: number }>,
): Promise<ShippingFulfillmentJobOutcome> {
  const failureKind = result.kind === "credential_invalid" ? "rejected" : result.kind;
  const retryAfterSeconds = failureKind === "throttled"
    ? Math.min(result.retryAfterSeconds ?? 30, 900)
    : failureKind === "temporary_failure" ? 30 : null;
  const safeCode = result.kind === "credential_invalid"
    ? "credential_rejected"
    : result.safeCode ?? (failureKind === "throttled" ? "provider_throttled" : failureKind === "temporary_failure" ? "provider_temporarily_unavailable" : "provider_rejected");
  return runtime.workflow.failFulfillment({
    claim, now, failureKind, safeCode, retryAfterSeconds,
  });
}

async function quote(runtime: ServerShippingRuntime, opened: Awaited<ReturnType<ServerShippingRuntime["workflow"]["openFulfillment"]>>, now: Date, signal: AbortSignal) {
  let credential;
  try {
    const token = new TextDecoder("utf-8", { fatal: true }).decode(opened.tokenBytes);
    credential = runtime.adapter.parseCredential({ token });
  } catch {
    return fail(runtime, opened.claim, now, { kind: "credential_invalid", safeCode: "credential_rejected" });
  }
  const result = await runtime.adapter.quotePackages({ credential, packages: opened.packages, codAmountCents: 0, signal });
  if (result.kind !== "succeeded") return fail(runtime, opened.claim, now, result);
  const handlers = new Map(opened.handlers.map((handler) => [handler.handlerCode, handler.id]));
  const options = result.options.map((option) => {
    const handlerResourceId = handlers.get(option.handlerCode);
    if (!handlerResourceId) throw new Error("shipping_handler_binding_invalid");
    const canonical = {
      handlerResourceId, handlerCode: option.handlerCode, handlerName: option.handlerName, desiKg: option.desiKg,
      priceCents: option.priceCents, codFeeCents: option.codFeeCents ?? null,
    };
    return Object.freeze({ id: runtime.generateId(), ...canonical, digest: digest(canonical) });
  });
  if (options.length < 1) return fail(runtime, opened.claim, now, { kind: "temporary_failure", safeCode: "provider_quote_empty" });
  await runtime.workflow.completeQuote({ claim: opened.claim, now, options });
  return "completed" as const;
}

async function shipment(runtime: ServerShippingRuntime, opened: Awaited<ReturnType<ServerShippingRuntime["workflow"]["openFulfillment"]>>, now: Date, signal: AbortSignal) {
  const order = opened.order;
  if (!order) throw new Error("shipping_order_authority_missing");
  const recipientName = addressText(order.shippingAddress.recipientName, 200) ?? order.customerName;
  const phone = addressText(order.customerPhone, 32);
  const city = addressText(order.shippingAddress.city, 160);
  const town = addressText(order.shippingAddress.district, 160) ?? city;
  const line1 = addressText(order.shippingAddress.line1, 300);
  const line2 = addressText(order.shippingAddress.line2, 300);
  const postalCode = addressText(order.shippingAddress.postalCode, 32);
  const country = addressText(order.shippingAddress.country, 2);
  if (!phone || !city || !town || !line1) return fail(runtime, opened.claim, now, { kind: "rejected", safeCode: "shipping_recipient_incomplete" });
  let credential;
  try {
    const token = new TextDecoder("utf-8", { fatal: true }).decode(opened.tokenBytes);
    credential = runtime.adapter.parseCredential({ token });
  } catch {
    return fail(runtime, opened.claim, now, { kind: "rejected", safeCode: "credential_rejected" });
  }
  let result;
  try {
    result = await runtime.adapter.createShipment({
      credential, reference: order.orderNumber, handlerCode: order.handlerCode, direction: "outgoing",
      ...(opened.brandProviderResourceId === null ? {} : { brandId: opened.brandProviderResourceId }),
      ...(opened.addressProviderResourceId === null ? {} : { addressId: opened.addressProviderResourceId }),
      recipient: {
        name: recipientName, phone, city, town,
        address: [line1, line2, postalCode, country].filter((part): part is string => part !== null).join(", "),
      },
      items: order.items.map((item) => ({ reference: item.sku ?? item.orderItemId, name: item.productName, quantity: item.quantity })),
      packages: opened.packages, codAmountCents: order.codAmountCents,
      ...(order.codAmountCents > 0 ? { codPaymentType: "cash" as const } : {}), signal,
    });
  } catch {
    await runtime.workflow.markShipmentUnknown({ claim: opened.claim, now, eventId: runtime.generateId(), safeCode: "provider_outcome_unknown" });
    return "marked_unknown" as const;
  }
  if (result.kind === "provider_outcome_unknown") {
    await runtime.workflow.markShipmentUnknown({ claim: opened.claim, now, eventId: runtime.generateId(), safeCode: "provider_outcome_unknown" });
    return "marked_unknown" as const;
  }
  if (result.kind !== "succeeded") return fail(runtime, opened.claim, now, result);
  if (!result.shipment.barcode) {
    await runtime.workflow.markShipmentUnknown({ claim: opened.claim, now, eventId: runtime.generateId(), safeCode: "provider_response_incomplete" });
    return "marked_unknown" as const;
  }
  const trackingNumber = result.shipment.trackingNumber ?? null;
  const carrier = trackingNumber === null ? null : result.shipment.handlerName ?? result.shipment.handlerCode ?? null;
  await runtime.workflow.completeShipment({
    claim: opened.claim, now, eventId: runtime.generateId(), providerShipmentId: result.shipment.providerReference,
    barcode: result.shipment.barcode, trackingNumber: carrier === null ? null : trackingNumber,
    trackingUrl: null, carrier, priceCents: result.shipment.priceCents ?? null,
  });
  return "completed" as const;
}

export async function runShippingFulfillmentJob(input: Input): Promise<ShippingFulfillmentJobOutcome> {
  const now = input.now === undefined ? new Date() : new Date(input.now.getTime());
  const claim = await input.runtime.workflow.claimFulfillment({
    jobId: input.jobId, workerId: input.workerId, now, leaseSeconds: 45, leaseId: input.runtime.generateId(),
  });
  if (claim === null) return "empty";
  const opened = await input.runtime.workflow.openFulfillment({ claim, now });
  try {
    const signal = input.signal ?? AbortSignal.timeout(10_000);
    if (claim.jobKind === "create_shipment") return await shipment(input.runtime, opened, now, signal);
    try { return await quote(input.runtime, opened, now, signal); }
    catch { return await fail(input.runtime, claim, now, { kind: "temporary_failure", safeCode: "shipping_worker_failure" }); }
  } finally {
    opened.tokenBytes.fill(0);
  }
}
