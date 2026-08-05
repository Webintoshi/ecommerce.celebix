import { createHash } from "node:crypto";

import type { OrderEmailClaim, OrderEmailWorkflowRepository, UnsealedOrderEmailClaim } from "@celebix/saas-data";

import { retryDelayMs, type OrderEmailSendResult } from "./resend.ts";
import { openOrderEmailRequest, sealOrderEmailRequest, type OrderEmailKeyring, type OrderEmailProviderRequest } from "./seal.ts";
import { renderOrderEmail } from "./template.ts";

export type OrderEmailWorker = Readonly<{ runOnce(): Promise<"empty" | "processed" | "failed"> }>;
export type OrderEmailWorkerOptions = Readonly<{
  repository: OrderEmailWorkflowRepository;
  keyring: OrderEmailKeyring;
  deliveryMode: "test" | "live";
  testRecipient?: string;
  senderEmail: string;
  workerId: string;
  now(): Date;
  leaseDurationMs: number;
  claimLimit: number;
  concurrency: number;
  send(request: OrderEmailProviderRequest, idempotencyKey: string): Promise<OrderEmailSendResult>;
}>;

const WORKER = /^[A-Za-z0-9._-]{1,128}$/u;
const EMAIL = /^[^@\s]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?[.][A-Za-z]{2,63}$/u;
function invalid(): never { throw new Error("order_email_worker_invalid"); }
function displayName(value: string): string {
  const selected = value.replace(/[<>"]/gu, "").trim().slice(0, 160);
  return selected.length > 0 ? selected : "Celebix Mağaza";
}
function mask(value: string): string {
  const [local, domain] = value.split("@");
  if (!local || !domain) invalid();
  return `${local.slice(0, Math.min(8, Math.max(1, local.length)))}•••@${domain}`;
}
function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function time(options: OrderEmailWorkerOptions): Date {
  const selected = options.now();
  if (!(selected instanceof Date) || !Number.isFinite(selected.getTime())) invalid();
  return new Date(selected.getTime());
}
function validate(options: OrderEmailWorkerOptions): OrderEmailWorkerOptions {
  if (!options.repository || typeof options.repository.claim !== "function" || typeof options.repository.seal !== "function" || typeof options.repository.accept !== "function" || typeof options.repository.fail !== "function" || typeof options.send !== "function" || typeof options.now !== "function" || !WORKER.test(options.workerId) || !EMAIL.test(options.senderEmail) || (options.deliveryMode === "test") !== (typeof options.testRecipient === "string") || (options.testRecipient && !EMAIL.test(options.testRecipient)) || options.leaseDurationMs !== 90_000 || options.claimLimit < 1 || options.claimLimit > 25 || options.concurrency < 1 || options.concurrency > 2) invalid();
  return Object.freeze({ ...options });
}

function requestFor(options: OrderEmailWorkerOptions, claim: UnsealedOrderEmailClaim): OrderEmailProviderRequest {
  const rendered = renderOrderEmail({ eventType: claim.eventType, recipientKind: claim.recipientKind, storeId: claim.storeId, orderId: claim.orderId, projection: claim.projection });
  const recipient = options.deliveryMode === "test" ? options.testRecipient! : claim.projection.recipient;
  return Object.freeze({
    from: `${displayName(claim.projection.senderLabel)} <${options.senderEmail}>`,
    to: recipient,
    ...(claim.projection.replyTo ? { replyTo: claim.projection.replyTo } : {}),
    subject: options.deliveryMode === "test" ? `[TEST] ${rendered.subject}` : rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
}

async function persistFailure(
  options: OrderEmailWorkerOptions,
  claim: OrderEmailClaim,
  leaseId: string,
  now: Date,
  code: string,
  requestedRetry: boolean,
  expiresAt?: Date,
): Promise<void> {
  let retryable = requestedRetry && claim.attemptCount < 8;
  let nextAttemptAt: Date | undefined;
  if (retryable) {
    nextAttemptAt = new Date(now.getTime() + retryDelayMs(claim.attemptCount as 1 | 2 | 3 | 4 | 5 | 6 | 7));
    if (expiresAt && nextAttemptAt >= expiresAt) { retryable = false; nextAttemptAt = undefined; code = "idempotency_window_expired"; }
  }
  await options.repository.fail({ deliveryId: claim.deliveryId, leaseId, workerId: options.workerId, now, errorCode: code, retryable, ...(nextAttemptAt ? { nextAttemptAt } : {}) });
}

async function processClaim(options: OrderEmailWorkerOptions, claim: OrderEmailClaim, leaseId: string, now: Date): Promise<boolean> {
  let request: OrderEmailProviderRequest;
  let expiresAt: Date;
  if (claim.kind === "unsealed") {
    try { request = requestFor(options, claim); }
    catch { await persistFailure(options, claim, leaseId, now, "template_invalid", false); return true; }
    const firstAttemptAt = new Date(now.getTime());
    expiresAt = new Date(now.getTime() + 86_400_000);
    try {
      const envelope = sealOrderEmailRequest(request, options.keyring);
      await options.repository.seal({
        deliveryId: claim.deliveryId, leaseId, workerId: options.workerId, now,
        sealKeyId: envelope.keyId, sealedRequest: envelope.bytes, requestDigest: envelope.digest,
        recipientDigest: digest(request.to.toLowerCase()), recipientMask: mask(request.to.toLowerCase()),
        firstAttemptAt, idempotencyExpiresAt: expiresAt,
      });
    } catch { await persistFailure(options, claim, leaseId, now, "payload_seal_invalid", false); return true; }
  } else {
    expiresAt = new Date(claim.idempotencyExpiresAt);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now) {
      await persistFailure(options, claim, leaseId, now, "idempotency_window_expired", false);
      return true;
    }
    try {
      request = openOrderEmailRequest({ version: "oe1", keyId: claim.sealKeyId, bytes: Buffer.from(claim.sealedRequest, "base64"), digest: claim.requestDigest }, options.keyring);
    } catch { await persistFailure(options, claim, leaseId, now, "payload_integrity_invalid", false); return true; }
  }
  let selected: OrderEmailSendResult;
  try { selected = await options.send(request, claim.idempotencyKey); }
  catch { selected = Object.freeze({ kind: "retryable", code: "provider_network_error" }); }
  if (selected.kind === "accepted") {
    await options.repository.accept({ deliveryId: claim.deliveryId, leaseId, workerId: options.workerId, now, providerMessageId: selected.providerMessageId });
  } else {
    await persistFailure(options, claim, leaseId, now, selected.code, selected.kind === "retryable", expiresAt);
  }
  return true;
}

export function createOrderEmailWorker(source: OrderEmailWorkerOptions): OrderEmailWorker {
  const options = validate(source);
  return Object.freeze({
    async runOnce() {
      const now = time(options);
      let batch;
      try { batch = await options.repository.claim({ workerId: options.workerId, now, leaseExpiresAt: new Date(now.getTime() + options.leaseDurationMs), limit: options.claimLimit }); }
      catch { return "failed" as const; }
      if (batch.kind === "empty") return "empty" as const;
      let cursor = 0;
      let failed = false;
      const run = async () => {
        while (cursor < batch.items.length) {
          const index = cursor; cursor += 1;
          try { await processClaim(options, batch.items[index]!, batch.leaseId, now); }
          catch { failed = true; }
        }
      };
      await Promise.all(Array.from({ length: Math.min(options.concurrency, batch.items.length) }, () => run()));
      return failed ? "failed" as const : "processed" as const;
    },
  });
}
