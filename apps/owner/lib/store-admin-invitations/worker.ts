import { randomUUID } from "node:crypto";
import type { InvitationDeliveryConfig } from "./delivery-config.ts";
import type { InvitationDeliveryJob, InvitationSafeError, InvitationSettlement, InvitationWorkflowRepository } from "./repository.ts";
import { openInvitationRequest } from "./request-seal.ts";
import { sendInvitationEmail } from "./resend.ts";
import type { InvitationPayloadKeyring } from "./seal.ts";

interface Dependencies { repository: InvitationWorkflowRepository; config: InvitationDeliveryConfig; keyring: InvitationPayloadKeyring; workerId: string; clock(): Date; fetch?: typeof fetch; timeoutMs?: number; batchSize?: number; leaseMs?: number; runMs?: number }
export interface InvitationWorkerReport { kind: "completed" | "configuration_blocked" | "persistence_unavailable" | "already_running"; claimed: number; sent: number; settled: number; skipped: number; providerAccepted: number }
function bounded(value: number, max: number) { if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new Error("store_admin_invitation_worker_invalid"); return value; }
function safeError(code: string): InvitationSafeError {
  switch (code) {
    case "provider_timeout": return "provider_timeout";
    case "provider_rate_limited": return "provider_rate_limited";
    case "provider_configuration_invalid": return "configuration_unavailable";
    case "provider_response_invalid": return "invalid_response";
    case "provider_request_concurrent": case "provider_unavailable": case "provider_network_error": return "provider_unavailable";
    default: return "provider_rejected";
  }
}

export function createInvitationWorker(d: Dependencies) {
  const config = Object.freeze({ ...d.config }), workerId = d.workerId;
  if (!/^[A-Za-z0-9_-]{1,80}$/u.test(workerId)) throw new Error("store_admin_invitation_worker_invalid");
  const timeoutMs = bounded(d.timeoutMs ?? 10_000, 30_000), batchSize = bounded(d.batchSize ?? 5, 20);
  const leaseMs = bounded(d.leaseMs ?? 120_000, 300_000), runMs = bounded(d.runMs ?? 60_000, 300_000);
  if (leaseMs <= timeoutMs + 1_000) throw new Error("store_admin_invitation_worker_invalid");
  let running = false;
  function now() { const value = d.clock(); if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error("clock_invalid"); return new Date(value); }
  function open(job: InvitationDeliveryJob) {
    if (job.storeId !== config.allowedStoreId || job.sealVersion !== "ar1" || job.rendererVersion !== 1 || job.idempotencyKey !== `store-admin-invitation/v1/${job.invitationId}/${job.generation}`) throw new Error("configuration_blocked");
    const bytes = Buffer.from(job.ciphertext, "hex");
    try {
      const request = openInvitationRequest({ version: "ar1", keyId: job.keyId, bytes, digest: job.ciphertextDigest }, { invitationId: job.invitationId, generation: job.generation }, d.keyring);
      if (request.to !== config.allowedRecipient || request.from !== config.sender) throw new Error("configuration_blocked");
      return request;
    } finally { bytes.fill(0); }
  }
  return Object.freeze({
    async runOnce(): Promise<Readonly<InvitationWorkerReport>> {
      const report: InvitationWorkerReport = { kind: "completed", claimed: 0, sent: 0, settled: 0, skipped: 0, providerAccepted: 0 };
      if (running) return Object.freeze({ ...report, kind: "already_running" });
      running = true;
      try {
        const started = now(), stopAt = started.getTime() + runMs, wallStop = Date.now() + runMs, leaseId = randomUUID();
        const leaseExpiresAt = new Date(started.getTime() + leaseMs);
        const claimed = await d.repository.claim({ workerId, leaseId, now: started, leaseExpiresAt, limit: batchSize }, job => {
          try { open(job); return true; } catch { return false; }
        });
        if (!("value" in claimed)) {
          report.kind = claimed.kind === "configuration_blocked" ? "configuration_blocked" : "persistence_unavailable";
          return Object.freeze(report);
        }
        report.claimed = claimed.value.items.length;
        for (const job of claimed.value.items) {
          const at = now();
          if (at.getTime() + timeoutMs >= stopAt || Date.now() + timeoutMs >= wallStop || at.getTime() >= leaseExpiresAt.getTime()) { report.skipped++; continue; }
          const lease = { deliveryId: job.deliveryId, leaseId, workerId };
          let settlement: InvitationSettlement;
          if (job.attemptCount > 8 || at.getTime() + timeoutMs >= Date.parse(job.replayDeadline)) {
            settlement = { ...lease, now: at, resultKind: "outcome_unknown", providerMessageId: null, safeErrorCode: null, nextAttemptAt: null };
          } else {
            // Decrypt again under the persisted generation just before the fresh SQL fence.
            const request = open(job);
            const authorized = await d.repository.authorize({ ...lease, now: now() });
            if (!("value" in authorized)) {
              report.skipped++;
              if (authorized.kind !== "invitation_unavailable" && authorized.kind !== "stale_lease") report.kind = "persistence_unavailable";
              continue;
            }
            const fence = authorized.value, beforeSend = now();
            if (fence.deliveryId !== job.deliveryId || fence.invitationId !== job.invitationId || fence.storeId !== job.storeId || fence.generation !== job.generation || fence.attemptCount !== job.attemptCount || beforeSend.getTime() < at.getTime() || beforeSend.getTime() + timeoutMs >= Math.min(Date.parse(fence.expiresAt), Date.parse(fence.leaseExpiresAt), leaseExpiresAt.getTime(), Date.parse(job.replayDeadline), stopAt) || Date.now() + timeoutMs >= wallStop) { report.skipped++; continue; }
            const response = await sendInvitationEmail(request, { apiKey: config.apiKey, idempotencyKey: job.idempotencyKey, timeoutMs, ...(d.fetch ? { fetch: d.fetch } : {}) });
            report.sent++;
            const settledAt = now();
            if (response.kind === "accepted" && /^[A-Za-z0-9_-]{1,200}$/u.test(response.providerMessageId)) {
              report.providerAccepted++;
              settlement = { ...lease, now: settledAt, resultKind: "provider_accepted", providerMessageId: response.providerMessageId, safeErrorCode: null, nextAttemptAt: null };
            } else {
              const nextAttemptAt = new Date(settledAt.getTime() + Math.min(3_600_000, 30_000 * 2 ** (job.attemptCount - 1)));
              const resultKind = response.kind === "permanent" ? "failed" : job.attemptCount >= 8 || nextAttemptAt.getTime() + 300_000 >= Date.parse(job.replayDeadline) ? "outcome_unknown" : "retry";
              settlement = { ...lease, now: settledAt, resultKind, providerMessageId: null, safeErrorCode: response.kind === "accepted" ? "invalid_response" : safeError(response.code), nextAttemptAt: resultKind === "retry" ? nextAttemptAt : null };
            }
          }
          let settled = await d.repository.settle(settlement);
          if (settled.kind === "commit_unknown") {
            // Replay only this settlement intent, never the provider send. Repository acquires a fresh connection.
            settled = await d.repository.settle({ ...settlement, now: now() });
          }
          if ("value" in settled) report.settled++;
          else { report.kind = "persistence_unavailable"; break; }
        }
      } catch { report.kind = "persistence_unavailable"; }
      finally { running = false; }
      return Object.freeze(report);
    },
  });
}
