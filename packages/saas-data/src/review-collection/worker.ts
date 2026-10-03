import { randomBytes, randomUUID } from "node:crypto";
import { reviewInvitationTokenHash, type ReviewCollectionRepository, type ReviewCollectionEmail, type ReviewCollectionSendResult } from "./repository.ts";
export type ReviewCollectionWorkerOptions = Readonly<{ repository: Pick<ReviewCollectionRepository, "claim" | "seal" | "finish">; now(): Date; send(email: ReviewCollectionEmail, idempotencyKey: string): Promise<ReviewCollectionSendResult>; token?: () => string; uuid?: () => string }>;
function escape(value: string): string { return value.replace(/[&<>"']/gu, value => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[value]!); }
export function renderReviewCollectionEmail(input: Readonly<{ recipient: string; storeName: string; productTitle: string; origin: string; token: string }>): ReviewCollectionEmail {
  reviewInvitationTokenHash(input.token);
  const origin = new URL(input.origin); if (origin.protocol !== "https:" || origin.origin !== input.origin) throw new Error("review_collection_email_invalid");
  const url = `${input.origin}/reviews/new#${input.token}`, unsubscribe = `${input.origin}/reviews/new#unsubscribe=${input.token}`;
  const subject = `${input.storeName}: ürün deneyiminizi paylaşın`;
  return Object.freeze({ fromLabel: input.storeName, to: input.recipient, subject,
    text: `${input.storeName}\n\n${input.productTitle} hakkında deneyiminizi paylaşır mısınız?\n\nYorum yazın: ${url}\n\nYorumunuz mağazanın incelemesinden sonra yayımlanır. Bağlantı 30 gün geçerlidir.\nYorum daveti almak istemiyorsanız: ${unsubscribe}`,
    html: `<div style="max-width:520px;margin:auto;padding:32px;font-family:Arial,sans-serif;color:#2b2b2b"><p>${escape(input.storeName)}</p><h1 style="font-size:24px">Deneyiminiz bizim için değerli</h1><p style="line-height:1.6">${escape(input.productTitle)} hakkında ne düşünüyorsunuz?</p><p style="margin:24px 0"><a href="${escape(url)}" style="display:inline-block;padding:14px 24px;border-radius:8px;background:#2b2b2b;color:#fff;text-decoration:none">Yorum yaz</a></p><p style="font-size:13px;line-height:1.6">Yorumunuz mağazanın incelemesinden sonra yayımlanır. Bağlantı 30 gün geçerlidir.</p><p style="font-size:12px"><a href="${escape(unsubscribe)}">Yorum davetlerini kapat</a></p></div>` });
}
export function createReviewCollectionWorker(options: ReviewCollectionWorkerOptions): Readonly<{ runOnce(): Promise<"empty" | "processed" | "failed"> }> {
  if (!options?.repository || typeof options.now !== "function" || typeof options.send !== "function") throw new Error("review_collection_worker_invalid");
  return Object.freeze({ async runOnce() {
    const now = options.now(), claims = await options.repository.claim({ now, leaseId: (options.uuid ?? randomUUID)() });
    if (!claims.length) return "empty";
    let failed = false, cursor = 0;
    const run = async () => { while (cursor < claims.length) {
      const claim = claims[cursor++]!;
      try {
        const current = options.now();
        let email = claim.email;
        if (claim.firstAttemptAt && (current.getTime() - Date.parse(claim.firstAttemptAt) >= 86_400_000 || !Number.isFinite(Date.parse(claim.firstAttemptAt)))) {
          await options.repository.finish({ id: claim.id, leaseId: claim.leaseId, now: current, result: { kind: "permanent", code: "idempotency_window_expired" } }); continue;
        }
        let tokenHash = "0".repeat(64);
        if (!email) {
          const token = (options.token ?? (() => randomBytes(32).toString("base64url")))();
          tokenHash = reviewInvitationTokenHash(token);
          email = renderReviewCollectionEmail({ recipient: claim.recipient, storeName: claim.storeName, productTitle: claim.productTitle, origin: claim.origin, token });
        }
        // Recheck lease, opt-out, order and automatic setting immediately before every send, including retries.
        email = await options.repository.seal({ id: claim.id, leaseId: claim.leaseId, now: current, tokenHash, email }) ?? undefined;
        if (!email) continue;
        let result: ReviewCollectionSendResult;
        try { result = await options.send(email, `review-request/v1/${claim.id}`); } catch { result = { kind: "retryable", code: "provider_network_error" }; }
        await options.repository.finish({ id: claim.id, leaseId: claim.leaseId, now: options.now(), result });
      } catch { failed = true; }
    } };
    await Promise.all(Array.from({ length: Math.min(2, claims.length) }, () => run()));
    return failed ? "failed" : "processed";
  } });
}
