import "server-only";

import { createHash, randomUUID } from "node:crypto";
import process from "node:process";
import { pathToFileURL } from "node:url";

const BATCH_LIMIT = 25;
const LEASE_WINDOW_MS = 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const NEEDS_UNKNOWN = new Set(["awaiting_customer", "submitted", "authorized"]);
const empty = () => ({ status: "failed", expired: 0, candidates: 0, captured: 0, failed: 0, processing: 0, rejected: 0, failures: 1 });
const fingerprint = (...values) => createHash("sha256").update(JSON.stringify(values), "utf8").digest("hex");

export async function runStandardCheckoutReconciliation(dependencies) {
  let expired = 0; let candidates = 0; let captured = 0; let failed = 0;
  let processing = 0; let rejected = 0; let failures = 0;
  const startedAt = dependencies?.now?.();
  const workerIdentity = dependencies?.randomUUID?.() ?? randomUUID();
  if (!(startedAt instanceof Date) || !Number.isFinite(startedAt.getTime()) || !UUID.test(workerIdentity)
    || typeof dependencies?.sessions?.expireCreated !== "function"
    || typeof dependencies?.sessions?.reconciliationCandidates !== "function"
    || typeof dependencies?.attempts?.markUnknown !== "function"
    || typeof dependencies?.runtime?.reconcile !== "function") return Object.freeze(empty());
  const workerId = `standard-checkout-${workerIdentity}`;
  const deadline = startedAt.getTime() + LEASE_WINDOW_MS;
  try { expired = await dependencies.sessions.expireCreated({ now: new Date(startedAt), limit: BATCH_LIMIT }); }
  catch { failures += 1; }
  let selected = [];
  try { selected = await dependencies.sessions.reconciliationCandidates({ now: new Date(startedAt), limit: BATCH_LIMIT }); }
  catch { failures += 1; }
  if (!Array.isArray(selected) || selected.length > BATCH_LIMIT) {
    return Object.freeze({ status: "failed", expired, candidates: 0, captured, failed, processing, rejected, failures: failures + 1 });
  }
  candidates = selected.length;
  for (const candidate of selected) {
    const selectedNow = dependencies.now();
    if (!(selectedNow instanceof Date) || !Number.isFinite(selectedNow.getTime()) || selectedNow.getTime() >= deadline - 5_000) {
      failures += 1; continue;
    }
    let expectedVersion = candidate.attemptVersion;
    if (NEEDS_UNKNOWN.has(candidate.attemptStatus)) {
      const operationId = dependencies.randomUUID?.() ?? randomUUID();
      if (!UUID.test(operationId)) { failures += 1; continue; }
      try {
        const mutation = await dependencies.attempts.markUnknown({
          attemptId: candidate.attemptId,
          operationId,
          fingerprint: fingerprint("standard-checkout-expired-unknown", candidate.attemptId, candidate.attemptVersion, operationId),
          expectedVersion: candidate.attemptVersion,
          credentialVersion: candidate.credentialVersion,
          providerReference: candidate.providerReference,
          safeCode: "checkout_hold_expired",
          now: new Date(selectedNow),
        });
        if (mutation?.attemptId !== candidate.attemptId || mutation?.status !== "provider_outcome_unknown"
          || mutation?.version !== candidate.attemptVersion + 1) { failures += 1; continue; }
        expectedVersion = mutation.version;
      } catch { failures += 1; continue; }
    }
    const operationId = dependencies.randomUUID?.() ?? randomUUID();
    const leaseId = dependencies.randomUUID?.() ?? randomUUID();
    if (!UUID.test(candidate.attemptId) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1
      || !UUID.test(operationId) || !UUID.test(leaseId)) { failures += 1; continue; }
    try {
      const result = await dependencies.runtime.reconcile({
        attemptId: candidate.attemptId, operationId, expectedVersion, workerId, leaseId,
      });
      if (result?.kind === "captured") captured += 1;
      else if (result?.kind === "failed") failed += 1;
      else if (result?.kind === "processing") processing += 1;
      else { rejected += 1; failures += 1; }
    } catch { failures += 1; }
  }
  return Object.freeze({
    status: failures === 0 ? "completed" : "failed",
    expired, candidates, captured, failed, processing, rejected, failures,
  });
}

async function main() {
  if (process.argv.length !== 2) return empty();
  const { resolveDefaultStandardCheckoutReconciliationRuntime } = await import("../lib/default-runtime.ts");
  const infrastructure = await resolveDefaultStandardCheckoutReconciliationRuntime();
  if (infrastructure === null) return empty();
  try {
    return await runStandardCheckoutReconciliation({
      sessions: infrastructure.sessions,
      attempts: infrastructure.attempts,
      runtime: infrastructure.runtime,
      now: () => new Date(),
      randomUUID,
    });
  } finally {
    await infrastructure.close().catch(() => undefined);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await main().catch(() => empty());
  const serialized = `${JSON.stringify(result)}\n`;
  if (result.status === "failed" || result.failures !== 0) {
    process.stderr.write(serialized); process.exitCode = 1;
  } else process.stdout.write(serialized);
}
