import { createHash } from "node:crypto";

import type {
  FailShippingValidationInput,
  ShippingValidationClaim,
  ShippingValidationResource,
} from "@celebix/saas-data";
import type { ShippingProviderReadFailure } from "@celebix/shipping-adapters";

import type { ServerShippingRuntime } from "./runtime.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const WORKER = /^[A-Za-z0-9._-]{1,128}$/;
const DECODER = new TextDecoder("utf-8", { fatal: true });

function invalid(): never { throw new Error("shipping_validation_worker_invalid"); }
function digest(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }

function failureInput(claim: ShippingValidationClaim, now: Date, failure: ShippingProviderReadFailure): FailShippingValidationInput {
  if (failure.kind === "throttled") return Object.freeze({
    claim, now, failureKind: "throttled", safeCode: "provider_throttled", retryAfterSeconds: failure.retryAfterSeconds,
  });
  if (failure.kind === "temporary_failure") return Object.freeze({
    claim, now, failureKind: "temporary_failure", safeCode: failure.safeCode, retryAfterSeconds: 30,
  });
  return Object.freeze({ claim, now, failureKind: failure.kind, safeCode: failure.safeCode, retryAfterSeconds: null });
}

async function finalizeFailure(
  runtime: ServerShippingRuntime,
  claim: ShippingValidationClaim,
  now: Date,
  failure: ShippingProviderReadFailure,
): Promise<"requeued" | "rejected"> {
  const outcome = await runtime.workflow.failValidation(failureInput(claim, now, failure));
  return outcome === "requeued" ? "requeued" : "rejected";
}

function validationResource(
  runtime: ServerShippingRuntime,
  kind: "brand" | "address" | "handler",
  providerResourceId: string,
  label: string,
  active: boolean,
): ShippingValidationResource {
  const id = runtime.generateId();
  if (typeof id !== "string" || !UUID.test(id)) invalid();
  return Object.freeze({
    id, kind, providerResourceId, label, active,
    digest: digest(JSON.stringify(["shipping-resource", 1, kind, providerResourceId, label, active])),
  });
}

export async function runShippingValidationJob(input: Readonly<{
  jobId: string;
  workerId: string;
  runtime: ServerShippingRuntime;
  now?: Date;
}>): Promise<"completed" | "requeued" | "rejected"> {
  if (
    !input || typeof input.jobId !== "string" || !UUID.test(input.jobId) ||
    typeof input.workerId !== "string" || !WORKER.test(input.workerId) || !input.runtime
  ) invalid();
  const now = input.now === undefined ? new Date() : new Date(input.now.getTime());
  if (!Number.isFinite(now.getTime())) invalid();
  const leaseId = input.runtime.generateId();
  if (!UUID.test(leaseId)) invalid();
  const claim = await input.runtime.workflow.claimValidation({
    jobId: input.jobId, workerId: input.workerId, now, leaseSeconds: 60, leaseId,
  });
  if (claim === null) return "requeued";
  const opened = await input.runtime.workflow.openClaimedCredential({ claim, now });
  try {
    let token: string;
    try { token = DECODER.decode(opened.tokenBytes); }
    catch {
      return finalizeFailure(input.runtime, claim, now, Object.freeze({ kind: "credential_invalid", safeCode: "credential_invalid" }));
    }
    let credential;
    try { credential = input.runtime.adapter.parseCredential({ token }); }
    catch {
      return finalizeFailure(input.runtime, claim, now, Object.freeze({ kind: "credential_invalid", safeCode: "credential_invalid" }));
    }
    const verified = await input.runtime.adapter.verifyCredential({ credential, signal: AbortSignal.timeout(10_000) });
    if (verified.kind !== "succeeded") return finalizeFailure(input.runtime, claim, now, verified);
    const brands = await input.runtime.adapter.listBrands({ credential, signal: AbortSignal.timeout(10_000) });
    if (brands.kind !== "succeeded") return finalizeFailure(input.runtime, claim, now, brands);
    const addresses = await input.runtime.adapter.listSenderAddresses({ credential, signal: AbortSignal.timeout(10_000) });
    if (addresses.kind !== "succeeded") return finalizeFailure(input.runtime, claim, now, addresses);
    const handlers = await input.runtime.adapter.listHandlers({ credential, signal: AbortSignal.timeout(10_000) });
    if (handlers.kind !== "succeeded") return finalizeFailure(input.runtime, claim, now, handlers);
    const resources = Object.freeze([
      ...brands.resources.map((entry) => validationResource(input.runtime, "brand", entry.providerResourceId, entry.label, entry.active)),
      ...addresses.resources.map((entry) => validationResource(input.runtime, "address", entry.providerResourceId, entry.label, entry.active)),
      ...handlers.handlers.map((entry) => validationResource(input.runtime, "handler", entry.handlerCode, entry.handlerName, entry.active)),
    ]);
    await input.runtime.workflow.completeValidation({
      claim, now, accountIdentityDigest: digest(verified.accountIdentity), resources,
    });
    return "completed";
  } finally { opened.tokenBytes.fill(0); }
}
