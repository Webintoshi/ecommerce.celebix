import { CloudflareCustomHostnameError } from "./cloudflare.ts";
import type { CustomHostnameProvider, StoreDomainWorkflowClaim, StoreDomainWorkflowPersistence } from "./types.ts";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type ResolveCname = (hostname: string) => Promise<readonly string[]>;

const RETRY_SECONDS = Object.freeze([30, 60, 120, 300, 600, 1800, 3600]);
const WORKER_ID = /^[A-Za-z0-9._-]{1,128}$/u;

function nextCheck(now: Date, attempt: number, ready = false): Date {
  const seconds = ready ? 3600 : RETRY_SECONDS[Math.min(Math.max(attempt - 1, 0), RETRY_SECONDS.length - 1)]!;
  return new Date(now.getTime() + seconds * 1000);
}

function safeProviderCode(caught: CloudflareCustomHostnameError): string {
  return `provider_${caught.code}`;
}

async function dnsStatus(resolveCname: ResolveCname, hostname: string, target: string): Promise<"pending" | "ready" | "mismatch"> {
  try {
    const records = await resolveCname(hostname);
    if (!Array.isArray(records) || records.length === 0) return "pending";
    const normalized = records.map((entry) => entry.toLowerCase().replace(/\.$/u, ""));
    return normalized.includes(target) ? "ready" : "mismatch";
  } catch { return "pending"; }
}

async function originStatus(fetchImpl: FetchLike, claim: StoreDomainWorkflowClaim): Promise<"ready" | "failed"> {
  try {
    const response = await fetchImpl(`https://${claim.hostname}/api/health`, {
      method: "GET", headers: { accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok || response.headers.get("content-type")?.split(";", 1)[0] !== "application/json") return "failed";
    const raw = await response.text();
    if (raw.length < 2 || raw.length > 4096) return "failed";
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.getPrototypeOf(parsed) !== Object.prototype) return "failed";
    const value = parsed as Record<string, unknown>;
    if (Object.keys(value).sort().join(",") !== "hostname,schemaVersion,status,storeId") return "failed";
    return value.schemaVersion === 1 && value.status === "ok" && value.storeId === claim.storeId && value.hostname === claim.hostname ? "ready" : "failed";
  } catch { return "failed"; }
}

export type StoreDomainReconcilerResult = "empty" | "updated" | "retry_scheduled" | "failed";

export function createStoreDomainReconciler(input: Readonly<{
  workflow: StoreDomainWorkflowPersistence;
  provider: CustomHostnameProvider;
  resolveCname: ResolveCname;
  fetch: FetchLike;
  workerId: string;
  cnameTarget: string;
  now: () => Date;
}>): Readonly<{ runOnce(): Promise<StoreDomainReconcilerResult> }> {
  if (!input || !WORKER_ID.test(input.workerId) || typeof input.now !== "function") throw new TypeError("store_domain_reconciler_invalid");
  const { workflow, provider, resolveCname, fetch: fetchImpl, workerId, cnameTarget } = input;

  return Object.freeze({
    async runOnce() {
      const now = input.now();
      let claims: readonly StoreDomainWorkflowClaim[];
      try { claims = await workflow.claim({ workerId, now, leaseExpiresAt: new Date(now.getTime() + 30_000), limit: 1 }); }
      catch { return "failed"; }
      const claim = claims[0];
      if (!claim) return "empty";
      try {
        if (claim.requestedRemoval) {
          try { await provider.remove(claim.providerHostnameId); }
          catch (caught) {
            if (!(caught instanceof CloudflareCustomHostnameError) || caught.code !== "not_found") throw caught;
          }
          await workflow.complete({
            domainId: claim.domainId, leaseId: claim.leaseId, workerId, now,
            hostnameStatus: "deleted", sslStatus: "deleted", dnsStatus: "pending", originStatus: "pending",
            safeProviderErrorCode: null, nextCheckAt: nextCheck(now, claim.attemptCount, true),
          });
          return "updated";
        }
        const snapshot = await provider.get(claim.providerHostnameId);
        if (snapshot.hostname !== claim.hostname) throw new CloudflareCustomHostnameError("malformed_response");
        const dns = await dnsStatus(resolveCname, claim.hostname, cnameTarget);
        const origin = snapshot.hostnameStatus === "active" && snapshot.sslStatus === "active" && dns === "ready"
          ? await originStatus(fetchImpl, claim) : "pending";
        const ready = snapshot.hostnameStatus === "active" && snapshot.sslStatus === "active" && dns === "ready" && origin === "ready";
        await workflow.complete({
          domainId: claim.domainId, leaseId: claim.leaseId, workerId, now,
          hostnameStatus: snapshot.hostnameStatus, sslStatus: snapshot.sslStatus, dnsStatus: dns, originStatus: origin,
          safeProviderErrorCode: null, nextCheckAt: nextCheck(now, claim.attemptCount, ready),
        });
        return "updated";
      } catch (caught) {
        if (caught instanceof CloudflareCustomHostnameError) {
          try {
            await workflow.fail({
              domainId: claim.domainId, leaseId: claim.leaseId, workerId, now,
              errorCode: safeProviderCode(caught), retryAt: nextCheck(now, claim.attemptCount), terminal: !caught.retryable,
            });
          } catch { return "failed"; }
          return caught.retryable ? "retry_scheduled" : "failed";
        }
        return "failed";
      }
    },
  });
}
