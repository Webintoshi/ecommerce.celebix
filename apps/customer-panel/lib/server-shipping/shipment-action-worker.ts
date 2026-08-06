import { createHash } from "node:crypto";

import type { ShippingShipmentActionClaim } from "@celebix/saas-data";
import type { ShippingProviderReadFailure } from "@celebix/shipping-adapters";

import type { ServerShippingRuntime } from "./runtime.ts";

export type ShippingShipmentActionOutcome = "empty" | "completed" | "failed" | "marked_unknown";

type Input = Readonly<{
  jobId: string;
  workerId: string;
  runtime: ServerShippingRuntime;
  now?: Date;
  signal?: AbortSignal;
}>;

async function fail(runtime: ServerShippingRuntime, claim: ShippingShipmentActionClaim, now: Date, failure: ShippingProviderReadFailure) {
  const safeCode = failure.kind === "credential_invalid"
    ? "credential_rejected"
    : failure.kind === "throttled" ? "provider_throttled" : failure.safeCode;
  await runtime.workflow.failShipmentAction({ claim, now, failureKind: failure.kind, safeCode });
  return "failed" as const;
}

async function unknown(runtime: ServerShippingRuntime, claim: ShippingShipmentActionClaim, now: Date, safeCode = "provider_outcome_unknown") {
  await runtime.workflow.markShipmentActionUnknown({ claim, now, eventId: runtime.generateId(), safeCode });
  return "marked_unknown" as const;
}

function providerFields(opened: Awaited<ReturnType<ServerShippingRuntime["workflow"]["openShipmentAction"]>>, shipment: Readonly<{
  providerReference: string; barcode?: string; trackingNumber?: string; handlerName?: string; handlerCode?: string;
  status: "draft" | "creating" | "ready" | "shipped" | "out_for_delivery" | "delivered" | "delayed" | "returning" | "returned" | "lost" | "cancelled" | "provider_outcome_unknown" | "attention_required";
  priceCents?: number;
}>) {
  const trackingNumber = shipment.trackingNumber ?? null;
  return Object.freeze({
    providerShipmentId: shipment.providerReference,
    barcode: shipment.barcode ?? opened.barcode,
    trackingNumber,
    carrier: trackingNumber === null ? null : shipment.handlerName ?? shipment.handlerCode ?? null,
    status: shipment.status,
    priceCents: shipment.priceCents ?? null,
  });
}

export async function runShippingShipmentActionJob(input: Input): Promise<ShippingShipmentActionOutcome> {
  const now = input.now === undefined ? new Date() : new Date(input.now.getTime());
  const claim = await input.runtime.workflow.claimShipmentAction({
    jobId: input.jobId, workerId: input.workerId, now, leaseSeconds: 45, leaseId: input.runtime.generateId(),
  });
  if (claim === null) return "empty";
  const opened = await input.runtime.workflow.openShipmentAction({ claim, now });
  try {
    let credential;
    try {
      credential = input.runtime.adapter.parseCredential({ token: new TextDecoder("utf-8", { fatal: true }).decode(opened.tokenBytes) });
    } catch {
      return fail(input.runtime, claim, now, Object.freeze({ kind: "credential_invalid", safeCode: "credential_rejected" }));
    }
    const signal = input.signal ?? AbortSignal.timeout(10_000);
    if (claim.actionKind === "label") {
      let result;
      try { result = await input.runtime.adapter.downloadLabel({ credential, providerReference: opened.providerReference, signal }); }
      catch { return fail(input.runtime, claim, now, Object.freeze({ kind: "temporary_failure", safeCode: "provider_temporarily_unavailable" })); }
      if (result.kind !== "succeeded") return fail(input.runtime, claim, now, result);
      const bytes = new Uint8Array(result.bytes);
      try {
        await input.runtime.workflow.completeShipmentAction({
          claim, now, eventId: input.runtime.generateId(), providerShipmentId: null, barcode: null,
          trackingNumber: null, carrier: null, status: null, priceCents: null, labelBytes: bytes,
          labelSha256: createHash("sha256").update(bytes).digest("hex"),
        });
      } finally { bytes.fill(0); }
      return "completed";
    }

    if (claim.actionKind === "refresh") {
      let result;
      try { result = await input.runtime.adapter.getShipment({ credential, providerReference: opened.providerReference, signal }); }
      catch { return fail(input.runtime, claim, now, Object.freeze({ kind: "temporary_failure", safeCode: "provider_temporarily_unavailable" })); }
      if (result.kind !== "succeeded") return fail(input.runtime, claim, now, result);
      await input.runtime.workflow.completeShipmentAction({
        claim, now, eventId: input.runtime.generateId(), ...providerFields(opened, result.shipment), labelBytes: null, labelSha256: null,
      });
      return "completed";
    }

    if (opened.barcode === null) return fail(input.runtime, claim, now, Object.freeze({ kind: "rejected", safeCode: "shipment_barcode_missing" }));
    let result;
    try {
      result = claim.actionKind === "cancel"
        ? await input.runtime.adapter.cancelShipment({ credential, providerReference: opened.providerReference, barcode: opened.barcode, signal })
        : await input.runtime.adapter.createReturnShipment({ credential, providerReference: opened.providerReference, barcode: opened.barcode, signal });
    } catch { return unknown(input.runtime, claim, now); }
    if (result.kind === "provider_outcome_unknown") return unknown(input.runtime, claim, now);
    if (result.kind !== "succeeded") return fail(input.runtime, claim, now, result);
    await input.runtime.workflow.completeShipmentAction({
      claim, now, eventId: input.runtime.generateId(), ...providerFields(opened, result.shipment), labelBytes: null, labelSha256: null,
    });
    return "completed";
  } finally { opened.tokenBytes.fill(0); }
}
