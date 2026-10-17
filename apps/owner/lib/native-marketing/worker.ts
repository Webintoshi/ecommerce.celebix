import { createHash, randomBytes } from "node:crypto";
import { NativeMarketingError, type NativeMarketingClaim, type NativeMarketingLeaseInput, type NativeMarketingWorkflowRepository, type UnsealedNativeMarketingClaim } from "@celebix/saas-data";
import { renderNativeMarketingEmail } from "@celebix/saas-data/native-marketing-templates";
import { marketingPublicOrigin } from "./config.ts";
import { retryDelayMs, type NativeMarketingEmailSendResult } from "./resend.ts";
import { openNativeMarketingRequest, sealNativeMarketingRequest, type NativeMarketingProviderRequest, type NativeMarketingKeyring } from "./seal.ts";

export type NativeMarketingWorkerOptions = Readonly<{
  repository: NativeMarketingWorkflowRepository; keyring: NativeMarketingKeyring; deliveryMode: "test" | "live"; testRecipient?: string;
  senderEmail: string; publicOrigin: string; postalAddress?: string; storeIds: readonly string[] | "*"; workerId: string; now(): Date; token?(): string;
  send(request: NativeMarketingProviderRequest, idempotencyKey: string): Promise<NativeMarketingEmailSendResult>;
}>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const EMAIL = /^[^@\s]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?[.][A-Za-z]{2,63}$/u;
function invalid(): never { throw new Error("native_marketing_worker_invalid"); }
function now(options: NativeMarketingWorkerOptions): Date {
  const value = options.now(); if (!(value instanceof Date) || !Number.isFinite(value.getTime())) invalid(); return new Date(value.getTime());
}
function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function token(options: NativeMarketingWorkerOptions): string {
  const value = options.token ? options.token() : randomBytes(32).toString("base64url");
  if (!/^[A-Za-z0-9_-]{43}$/u.test(value)) invalid(); return value;
}
function sender(label: string, address: string): string {
  if (typeof label !== "string" || /[\u0000-\u001f\u007f-\u009f]/u.test(label)) invalid();
  const name = label.replace(/[<>"\\]/gu, "").trim().slice(0, 160); if (!name) invalid(); return `${name} <${address}>`;
}
function requestFor(options: NativeMarketingWorkerOptions, claim: UnsealedNativeMarketingClaim) {
  if (options.deliveryMode === "test" && (!claim.projection.isTest || claim.projection.recipient.toLowerCase() !== options.testRecipient!.toLowerCase())) invalid();
  const unsubscribeToken = token(options), recoveryToken = claim.projection.recoveryNeeded ? token(options) : undefined;
  if (recoveryToken === unsubscribeToken) invalid();
  const unsubscribeUrl = `${options.publicOrigin}/api/marketing/unsubscribe?token=${unsubscribeToken}`;
  const recoveryUrl = recoveryToken ? `${claim.projection.storefrontOrigin}/cart/recover#token=${recoveryToken}` : undefined;
  const rendered = renderNativeMarketingEmail({ storeId: claim.storeId, projection: claim.projection, unsubscribeUrl, ...(recoveryUrl ? { recoveryUrl } : {}), ...(options.postalAddress ? { postalAddress: options.postalAddress } : {}) });
  const request: NativeMarketingProviderRequest = Object.freeze({
    from: sender(claim.projection.storeName, options.senderEmail), to: options.deliveryMode === "test" ? options.testRecipient! : claim.projection.recipient,
    subject: options.deliveryMode === "test" || claim.projection.isTest ? `[TEST] ${rendered.subject}` : rendered.subject,
    html: rendered.html, text: rendered.text,
    headers: Object.freeze({ "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }),
    tags: Object.freeze([{ name: "tenant_id", value: claim.storeId }, { name: "delivery_id", value: claim.deliveryId }] as const),
  });
  return { request, unsubscribeTokenDigest: digest(unsubscribeToken), ...(recoveryToken ? { recoveryTokenDigest: digest(recoveryToken) } : {}) };
}
async function failure(options: NativeMarketingWorkerOptions, claim: NativeMarketingClaim, lease: NativeMarketingLeaseInput, code: string, retryable: boolean, expiresAt?: Date, retryAfterMs?: number): Promise<void> {
  let result: "retryable" | "permanent" | "uncertain" = retryable ? "retryable" : "permanent";
  let nextAttemptAt: Date | undefined;
  if (retryable) {
    if (claim.attemptCount >= 8) result = code === "provider_daily_quota_exceeded" ? "permanent" : "uncertain";
    else {
      const delay = Math.max(retryDelayMs(claim.attemptCount as 1 | 2 | 3 | 4 | 5 | 6 | 7), retryAfterMs ?? 0);
      nextAttemptAt = code === "provider_daily_quota_exceeded"
        ? new Date(Date.UTC(lease.now.getUTCFullYear(), lease.now.getUTCMonth(), lease.now.getUTCDate() + 1, 0, 1))
        : new Date(lease.now.getTime() + delay);
      if (expiresAt && nextAttemptAt.getTime() + 5_000 >= expiresAt.getTime()) {
        // A quota rejection was not accepted by the provider. Preserve that signal
        // so the repository pauses the shared sender, even when this job must stop.
        result = code === "provider_daily_quota_exceeded" ? "permanent" : "uncertain";
        if (code !== "provider_daily_quota_exceeded") code = "idempotency_window_expired";
        nextAttemptAt = undefined;
      }
    }
  }
  if (code === "idempotency_window_expired") result = "uncertain";
  await options.repository.finish({ ...lease, result: { kind: result, code, ...(nextAttemptAt ? { nextAttemptAt } : {}) } });
}
async function processClaim(options: NativeMarketingWorkerOptions, claim: NativeMarketingClaim, leaseId: string, leaseExpiresAt: Date): Promise<void> {
  if (!UUID.test(claim.storeId) || !UUID.test(claim.deliveryId) || !Number.isSafeInteger(claim.attemptCount) || claim.attemptCount < 1 || claim.attemptCount > 8 || claim.idempotencyKey !== `native-marketing/v1/${claim.deliveryId}`) invalid();
  if (options.storeIds !== "*" && !options.storeIds.includes(claim.storeId)) invalid();
  let lease = { deliveryId: claim.deliveryId, leaseId, workerId: options.workerId, now: now(options) };
  let request: NativeMarketingProviderRequest, expiresAt: Date;
  if (claim.kind === "unsealed") {
    try {
      const rendered = requestFor(options, claim), envelope = sealNativeMarketingRequest(rendered.request, options.keyring, claim);
      expiresAt = new Date(lease.now.getTime() + 86_400_000);
      await options.repository.seal({ ...lease, sealKeyId: envelope.keyId, sealedRequest: envelope.bytes, requestDigest: envelope.digest, unsubscribeTokenDigest: rendered.unsubscribeTokenDigest, ...(rendered.recoveryTokenDigest ? { recoveryTokenDigest: rendered.recoveryTokenDigest } : {}), firstAttemptAt: lease.now, idempotencyExpiresAt: expiresAt });
      request = rendered.request;
    } catch (error) {
      if (error instanceof NativeMarketingError && error.code === "delivery_deferred") return;
      await failure(options, claim, lease, "payload_seal_invalid", false); return;
    }
  } else {
    expiresAt = new Date(claim.idempotencyExpiresAt);
    const firstAttemptAt = new Date(claim.firstAttemptAt);
    if (!Number.isFinite(expiresAt.getTime()) || !Number.isFinite(firstAttemptAt.getTime()) || expiresAt.getTime() > firstAttemptAt.getTime() + 86_400_000 || expiresAt.getTime() <= lease.now.getTime() + 5_000) {
      await failure(options, claim, lease, "idempotency_window_expired", false); return;
    }
    try { request = openNativeMarketingRequest({ version: "nm1", keyId: claim.sealKeyId, bytes: Buffer.from(claim.sealedRequest, "base64"), digest: claim.requestDigest }, options.keyring, claim); }
    catch { await failure(options, claim, lease, "payload_integrity_invalid", false); return; }
  }
  if (options.deliveryMode === "test" && request.to.toLowerCase() !== options.testRecipient!.toLowerCase()) {
    await failure(options, claim, lease, "test_recipient_mismatch", false); return;
  }
  lease = { ...lease, now: now(options) };
  // Leave enough time for the bounded provider call and its durable receipt write.
  // The unchanged lease expires naturally if preparing this batch took too long.
  if (lease.now.getTime() + 15_000 >= leaseExpiresAt.getTime()) return;
  if (expiresAt.getTime() <= lease.now.getTime() + 5_000) { await failure(options, claim, lease, "idempotency_window_expired", false); return; }
  // Eligibility is evaluated after opening/sealing and immediately before every provider attempt.
  if (!await options.repository.authorize(lease)) return;
  const dispatchAt = now(options);
  if (dispatchAt.getTime() + 15_000 >= leaseExpiresAt.getTime()) return;
  if (dispatchAt.getTime() + 5_000 >= expiresAt.getTime()) {
    await failure(options, claim, { ...lease, now: dispatchAt }, "idempotency_window_expired", false); return;
  }
  let result: NativeMarketingEmailSendResult;
  try { result = await options.send(request, claim.idempotencyKey); }
  catch { result = { kind: "retryable", code: "provider_network_error" }; }
  lease = { ...lease, now: now(options) };
  if (result.kind === "accepted") await options.repository.finish({ ...lease, result });
  else await failure(options, claim, lease, result.code, result.kind === "retryable", expiresAt, result.retryAfterMs);
}
export function createNativeMarketingWorker(source: NativeMarketingWorkerOptions) {
  if (!/^[A-Za-z0-9._-]{1,128}$/u.test(source.workerId) || !EMAIL.test(source.senderEmail) || (source.deliveryMode !== "test" && source.deliveryMode !== "live") || (source.deliveryMode === "test" && (!source.testRecipient || !EMAIL.test(source.testRecipient))) || (source.deliveryMode === "live" && !source.postalAddress) || (source.storeIds !== "*" && (!source.storeIds.length || source.storeIds.some(id => !UUID.test(id))))) invalid();
  marketingPublicOrigin(source.publicOrigin);
  const options = Object.freeze({ ...source }), repository = options.repository; let running = false;
  return Object.freeze({ async runOnce(): Promise<"empty" | "processed" | "failed"> {
    if (running) return "empty"; running = true;
    try {
      const current = now(options), leaseExpiresAt = new Date(current.getTime() + 90_000), batch = await repository.claim({ workerId: options.workerId, now: current, leaseExpiresAt, limit: 20, storeIds: options.storeIds, testOnly: options.deliveryMode === "test" });
      if (batch.kind === "empty") return "empty";
      if (!UUID.test(batch.leaseId) || batch.items.length > 20) invalid();
      let cursor = 0, failed = false;
      const run = async () => { while (cursor < batch.items.length) { const index = cursor++; try { await processClaim(options, batch.items[index]!, batch.leaseId, leaseExpiresAt); } catch { failed = true; } } };
      await Promise.all(Array.from({ length: Math.min(2, batch.items.length) }, run));
      return failed ? "failed" : "processed";
    } catch { return "failed"; } finally { running = false; }
  } });
}
