import type { AnalyticsDeliveryErrorCode, AnalyticsOutboxClaim, AnalyticsOutboxRepository } from "@celebix/saas-data";
import type { UmamiPublicCollectorConfig } from "./config.ts";

export type AnalyticsDeliveryResult = Readonly<{ claimed: number; delivered: number; retried: number; terminal: number }>;
export type DeliveryDependencies = Readonly<{ now(): Date; fetch: typeof globalThis.fetch; userAgent: string; timeoutMs: number }>;

type DeliveryOutcome = "delivered" | "retried" | "terminal";
const CLAIM_LIMIT = 25;
const LEASE_MS = 30_000;
const CONCURRENCY = 4;
const ATTEMPT_CAP = 10;

function currentNow(dependencies: DeliveryDependencies): Date {
  const value = dependencies.now();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error("analytics_delivery_invalid");
  return new Date(value);
}

function validateDependencies(dependencies: DeliveryDependencies): void {
  if (!dependencies || typeof dependencies.fetch !== "function" || typeof dependencies.now !== "function" || typeof dependencies.userAgent !== "string" || !/^[\x21-\x7e]{1,128}$/.test(dependencies.userAgent) || !Number.isSafeInteger(dependencies.timeoutMs) || dependencies.timeoutMs < 100 || dependencies.timeoutMs > 30_000) {
    throw new Error("analytics_delivery_invalid");
  }
}

function retryAt(now: Date, attemptCount: number): Date {
  const delay = Math.min(60_000 * (2 ** Math.max(0, attemptCount - 1)), 6 * 60 * 60_000);
  return new Date(now.getTime() + delay);
}

function body(claim: AnalyticsOutboxClaim): string {
  return JSON.stringify({
    type: "event",
    payload: {
      website: claim.websiteId,
      hostname: claim.hostname,
      url: "/checkout/complete",
      name: "purchase",
      data: { value: claim.payload.valueCents / 100, currency: claim.payload.currency, source: claim.payload.source },
    },
  });
}

async function recordFailure(repository: AnalyticsOutboxRepository, claim: AnalyticsOutboxClaim, dependencies: DeliveryDependencies, errorCode: AnalyticsDeliveryErrorCode): Promise<DeliveryOutcome> {
  const now = currentNow(dependencies);
  const terminal = claim.attemptCount >= ATTEMPT_CAP;
  try {
    await repository.failed({ eventId: claim.eventId, leaseToken: claim.leaseToken, now, errorCode, retryAt: terminal ? new Date(now) : retryAt(now, claim.attemptCount), terminal });
    return terminal ? "terminal" : "retried";
  } catch {
    return "retried";
  }
}

async function deliverClaim(repository: AnalyticsOutboxRepository, collector: UmamiPublicCollectorConfig, dependencies: DeliveryDependencies, claim: AnalyticsOutboxClaim): Promise<DeliveryOutcome> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), dependencies.timeoutMs);
  let response: Response;
  try {
    response = await dependencies.fetch(`${collector.collectorOrigin}/api/send`, {
      method: "POST",
      headers: Object.freeze({ "content-type": "application/json", "user-agent": dependencies.userAgent }),
      body: body(claim),
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
  } catch {
    return recordFailure(repository, claim, dependencies, "collector_unavailable");
  } finally {
    clearTimeout(timeout);
  }

  if (!(response instanceof Response)) return recordFailure(repository, claim, dependencies, "collector_response_invalid");
  if (response.status !== 200) {
    void response.body?.cancel().catch(() => undefined);
    return recordFailure(repository, claim, dependencies, response.ok ? "collector_response_invalid" : "collector_rejected");
  }
  void response.body?.cancel().catch(() => undefined);
  try {
    await repository.delivered({ eventId: claim.eventId, leaseToken: claim.leaseToken, now: currentNow(dependencies) });
    return "delivered";
  } catch {
    return "retried";
  }
}

async function mapConcurrent<T, R>(values: readonly T[], concurrency: number, operation: (value: T) => Promise<R>): Promise<readonly R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await operation(values[index]!);
    }
  });
  await Promise.all(workers);
  return Object.freeze(results);
}

export async function deliverAnalyticsOutbox(repository: AnalyticsOutboxRepository, collector: UmamiPublicCollectorConfig, dependencies: DeliveryDependencies): Promise<AnalyticsDeliveryResult> {
  validateDependencies(dependencies);
  if (!repository || typeof repository.claim !== "function" || typeof repository.delivered !== "function" || typeof repository.failed !== "function" || !collector || collector.mode !== "approved_staging") {
    throw new Error("analytics_delivery_invalid");
  }
  const claims = await repository.claim({ now: currentNow(dependencies), limit: CLAIM_LIMIT, leaseMs: LEASE_MS });
  const outcomes = await mapConcurrent(claims, CONCURRENCY, (claim) => deliverClaim(repository, collector, dependencies, claim));
  return Object.freeze({
    claimed: claims.length,
    delivered: outcomes.filter((value) => value === "delivered").length,
    retried: outcomes.filter((value) => value === "retried").length,
    terminal: outcomes.filter((value) => value === "terminal").length,
  });
}
