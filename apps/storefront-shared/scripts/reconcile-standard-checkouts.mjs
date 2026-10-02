import "server-only";

import { createHash, randomUUID } from "node:crypto";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { types as nodeTypes } from "node:util";

const BATCH_LIMIT = 25;
const LEASE_WINDOW_MS = 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const NEEDS_UNKNOWN = new Set(["awaiting_customer", "submitted", "authorized"]);
const CANDIDATE_STATUSES = new Set([...NEEDS_UNKNOWN, "provider_outcome_unknown", "reconciliation_required"]);
const empty = () => ({ status: "failed", expired: 0, candidates: 0, captured: 0, failed: 0, processing: 0, rejected: 0, failures: 1 });
const fingerprint = (...values) => createHash("sha256").update(JSON.stringify(values), "utf8").digest("hex");

function exactDataRecord(value, keys) {
  if (typeof value !== "object" || value === null || Array.isArray(value) || nodeTypes.isProxy(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(descriptors).length === keys.length && keys.every((key) =>
    descriptors[key]?.enumerable && "value" in descriptors[key]);
}
function denseArray(value, maximum) {
  if (!Array.isArray(value) || nodeTypes.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype
    || value.length > maximum) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(descriptors).length === value.length + 1 && Array.from({ length: value.length }, (_, index) =>
    descriptors[String(index)]?.enumerable && "value" in descriptors[String(index)]).every(Boolean);
}
function executionScope(value) {
  if (!denseArray(value, 4) || value.length === 0) return null;
  const unique = new Set(); const result = [];
  for (const authority of value) {
    if (!exactDataRecord(authority, ["providerCode", "environment", "adapterVersion", "evidenceDigest"])
      || !["paytr_iframe", "iyzico_iframe"].includes(authority.providerCode)
      || !["test", "live"].includes(authority.environment)
      || !Number.isSafeInteger(authority.adapterVersion) || authority.adapterVersion < 1 || authority.adapterVersion > 2_147_483_647
      || typeof authority.evidenceDigest !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(authority.evidenceDigest)) return null;
    const key = `${authority.providerCode}:${authority.environment}`;
    if (unique.has(key)) return null;
    unique.add(key); result.push(Object.freeze({ ...authority }));
  }
  return Object.freeze(result);
}
function eligibleCandidate(candidate, authorities) {
  return exactDataRecord(candidate, ["attemptId", "attemptVersion", "attemptStatus", "credentialVersion",
    "providerReference", "providerCode", "environment", "adapterVersion", "evidenceDigest"])
    && typeof candidate.attemptId === "string" && UUID.test(candidate.attemptId)
    && Number.isSafeInteger(candidate.attemptVersion) && candidate.attemptVersion >= 1
    && CANDIDATE_STATUSES.has(candidate.attemptStatus)
    && Number.isSafeInteger(candidate.credentialVersion) && candidate.credentialVersion >= 1
    && (candidate.providerReference === null || (typeof candidate.providerReference === "string"
      && candidate.providerReference.length >= 1 && candidate.providerReference.length <= 256
      && candidate.providerReference === candidate.providerReference.trim()
      && !/[\u0000-\u001f\u007f-\u009f]/u.test(candidate.providerReference)))
    && authorities.some((authority) => authority.providerCode === candidate.providerCode
      && authority.environment === candidate.environment && authority.adapterVersion === candidate.adapterVersion
      && authority.evidenceDigest === candidate.evidenceDigest);
}

export async function runStandardCheckoutReconciliation(dependencies) {
  let expired = 0; let candidates = 0; let captured = 0; let failed = 0;
  let processing = 0; let rejected = 0; let failures = 0;
  const startedAt = dependencies?.now?.();
  const workerIdentity = dependencies?.randomUUID?.() ?? randomUUID();
  const authorities = executionScope(dependencies?.executionAuthorities);
  if (!(startedAt instanceof Date) || !Number.isFinite(startedAt.getTime()) || !UUID.test(workerIdentity)
    || authorities === null
    || typeof dependencies?.sessions?.expireCreated !== "function"
    || typeof dependencies?.sessions?.reconciliationCandidatesScoped !== "function"
    || typeof dependencies?.attempts?.markUnknown !== "function"
    || typeof dependencies?.runtime?.reconcile !== "function") return Object.freeze(empty());
  const workerId = `standard-checkout-${workerIdentity}`;
  const deadline = startedAt.getTime() + LEASE_WINDOW_MS;
  try { expired = await dependencies.sessions.expireCreated({ now: new Date(startedAt), limit: BATCH_LIMIT }); }
  catch { failures += 1; }
  let selected = [];
  try { selected = await dependencies.sessions.reconciliationCandidatesScoped({ now: new Date(startedAt), limit: BATCH_LIMIT, authorities }); }
  catch { failures += 1; }
  if (!denseArray(selected, BATCH_LIMIT)) {
    return Object.freeze({ status: "failed", expired, candidates: 0, captured, failed, processing, rejected, failures: failures + 1 });
  }
  candidates = selected.length;
  for (const candidate of selected) {
    // Eligibility is checked before any durable unknown transition or provider access.
    if (!eligibleCandidate(candidate, authorities)) { rejected += 1; failures += 1; continue; }
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
      executionAuthorities: infrastructure.executionAuthorities,
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
