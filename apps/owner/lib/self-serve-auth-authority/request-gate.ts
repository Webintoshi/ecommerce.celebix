import {
  assertSaaSAuthAuthorityProfile,
  type SaaSAuthAuthorityProfile,
} from "../../../../packages/platform-config/src/saas.ts";
import type { SelfServeRequestGate, SelfServeRequestGateInput } from "../self-serve-http/runtime.ts";

export function createApprovedStagingSelfServeRequestGate(options: {
  authority: SaaSAuthAuthorityProfile;
  clock(): Date;
  maximumRegistrationsPerMinute?: number;
}): SelfServeRequestGate {
  const maximum = options.maximumRegistrationsPerMinute ?? 20;
  try { assertSaaSAuthAuthorityProfile(options.authority); } catch {
    throw new Error("owner_staging_request_gate_invalid");
  }
  if (typeof options.clock !== "function" ||
      !Number.isSafeInteger(maximum) || maximum < 1 || maximum > 120) {
    throw new Error("owner_staging_request_gate_invalid");
  }
  const acceptedAt: number[] = [];
  return Object.freeze({
    async verify(input: SelfServeRequestGateInput) {
      let current: Date;
      try { current = options.clock(); } catch { return "unavailable"; }
      if (!(current instanceof Date) || !Number.isFinite(current.getTime())) return "unavailable";
      if (input.kind === "callback_completion") {
        return input.edgeTrustContext && typeof input.edgeTrustContext === "object"
          ? "allowed"
          : "unauthorized";
      }
      try {
        const url = new URL(input.request.url);
        if (
          input.request.method !== "POST" || input.request.headers.get("origin") !== options.authority.ownerOrigin ||
          url.origin !== options.authority.ownerOrigin || url.pathname !== "/api/self-serve/register" ||
          url.search || url.hash
        ) return "forbidden";
      } catch { return "forbidden"; }
      const cutoff = current.getTime() - 60_000;
      while (acceptedAt.length > 0 && acceptedAt[0] <= cutoff) acceptedAt.shift();
      if (acceptedAt.length >= maximum) return "rate_limited";
      acceptedAt.push(current.getTime());
      return "allowed";
    },
  });
}
