import type { SelfServeRequestGate, SelfServeRequestGateInput } from "./runtime.ts";

const TRUST_CAPABILITY = Symbol("phase2b1b2b_verified_edge_trust");
const boundaries = new WeakSet<object>();

type VerifiedContext = Readonly<{ [TRUST_CAPABILITY]: object }>;

export interface VerifiedEdgeTrustBoundary {
  readonly requestGate: SelfServeRequestGate;
  invokeWithVerifiedContext<T>(invoke: (context: unknown) => Promise<T>): Promise<T>;
}

export function assertVerifiedEdgeTrustBoundary(value: unknown): asserts value is VerifiedEdgeTrustBoundary {
  if (!value || typeof value !== "object" || !boundaries.has(value)) {
    throw new Error("verified_edge_trust_boundary_invalid");
  }
}

export function createVerifiedEdgeTrustBoundary(registrationRequestGate?: SelfServeRequestGate): VerifiedEdgeTrustBoundary {
  if (registrationRequestGate !== undefined && typeof registrationRequestGate.verify !== "function") {
    throw new Error("verified_edge_trust_boundary_invalid");
  }
  const token = Object.freeze({});
  const active = new WeakSet<object>();

  const requestGate: SelfServeRequestGate = Object.freeze({
    async verify(input: SelfServeRequestGateInput) {
      if (input.kind !== "callback_completion") {
        if (!registrationRequestGate) return "unauthorized";
        try {
          const decision = await registrationRequestGate.verify(input);
          return ["allowed", "unauthorized", "forbidden", "rate_limited", "unavailable"].includes(decision)
            ? decision
            : "unavailable";
        } catch {
          return "unavailable";
        }
      }
      const context = input.edgeTrustContext;
      if (
        !context || typeof context !== "object" || !active.has(context) ||
        (context as Partial<VerifiedContext>)[TRUST_CAPABILITY] !== token ||
        !Object.isFrozen(context) || !Object.isSealed(context)
      ) return "unauthorized";
      return "allowed";
    },
  });

  const boundary: VerifiedEdgeTrustBoundary = {
    requestGate,
    async invokeWithVerifiedContext<T>(invoke: (context: unknown) => Promise<T>): Promise<T> {
      if (typeof invoke !== "function") throw new Error("verified_edge_trust_boundary_invalid");
      const context = {} as VerifiedContext;
      Object.defineProperty(context, TRUST_CAPABILITY, {
        configurable: false,
        enumerable: false,
        writable: false,
        value: token,
      });
      Object.freeze(context);
      active.add(context);
      try {
        return await invoke(context);
      } finally {
        active.delete(context);
      }
    },
  };
  boundaries.add(boundary);
  return Object.freeze(boundary);
}
