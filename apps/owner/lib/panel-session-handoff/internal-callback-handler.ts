import {
  assertPersistentSelfServeRuntime,
  type PersistentSelfServeRuntime,
} from "../self-serve-http/runtime.ts";
import {
  classifyReconstructedOwnerCallbackRequest,
} from "../self-serve-http/internal-callback-gateway.ts";
import type { PostgresPanelBrowserBindingRepository } from "../panel-browser-binding/postgres-repository.ts";
import {
  assertVerifiedEdgeTrustBoundary,
  type VerifiedEdgeTrustBoundary,
} from "../self-serve-http/verified-edge-trust.ts";
import { createInitialCallbackPanelSessionHandoffExecutor } from "./initial-callback-executor.ts";
import {
  isInitialVerifiedCallbackGrantBoundaryForRuntime,
  type InitialVerifiedCallbackGrantBoundary,
} from "./initial-callback-grant.ts";
import {
  createFreshLoginRequiredResult,
  createSessionHandoffReadyResult,
  type OwnerPanelSessionHandoffInternalResult,
} from "./internal-response.ts";
import {
  isPostgresPanelSessionHandoffIssuerForBoundary,
  type PostgresPanelSessionHandoffIssuer,
} from "./postgres-handoff-issuer.ts";

const MAXIMUM_HANDOFF_MS = 10 * 60_000;
const handlerAuthorities = new WeakMap<object, VerifiedEdgeTrustBoundary>();

type HandlerAudit = (event: Readonly<{
  stage: "request_gate" | "callback" | "browser_claim" | "provider_rejection" | "handoff";
  outcome: "accepted" | "rejected" | "unavailable";
}>) => void | Promise<void>;

export interface OwnerPanelSessionInitialCallbackHandler {
  handle(
    request: Request,
    edgeTrustContext: unknown,
    browserBindingCredential: string,
  ): Promise<OwnerPanelSessionHandoffInternalResult>;
}

export function isOwnerPanelSessionInitialCallbackHandlerForBoundary(
  value: unknown,
  boundary: VerifiedEdgeTrustBoundary,
): value is OwnerPanelSessionInitialCallbackHandler {
  return Boolean(value && typeof value === "object" && handlerAuthorities.get(value) === boundary);
}

function invalid(): never {
  throw new Error("owner_panel_session_initial_callback_handler_invalid");
}

function auditSafely(audit: HandlerAudit, event: Parameters<HandlerAudit>[0]): void {
  try { void Promise.resolve(audit(Object.freeze({ ...event }))).catch(() => undefined); }
  catch { /* Audit is observational only. */ }
}

function trustedNow(clock: () => Date): Date {
  const value = clock();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) invalid();
  return new Date(value);
}

function canonicalExpiry(value: unknown): number {
  if (typeof value !== "string" || value.length > 32 || value.trim() !== value) invalid();
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) invalid();
  return milliseconds;
}

function canonicalBrowserBindingCredential(value: unknown): string {
  if (typeof value !== "string" || !/^pb1\.[A-Za-z0-9_-]{43}$/.test(value)) invalid();
  const token = value.slice(4);
  const bytes = Buffer.from(token, "base64url");
  if (bytes.byteLength !== 32 || bytes.toString("base64url") !== token) invalid();
  return value;
}

export function createOwnerPanelSessionInitialCallbackHandler(input: {
  runtime: PersistentSelfServeRuntime;
  edgeTrustBoundary: VerifiedEdgeTrustBoundary;
  initialCallbackGrantBoundary: InitialVerifiedCallbackGrantBoundary;
  issuer: PostgresPanelSessionHandoffIssuer;
  browserBindingRepository: Pick<PostgresPanelBrowserBindingRepository, "claimCallback">;
  clock(): Date;
  audit: HandlerAudit;
}): OwnerPanelSessionInitialCallbackHandler {
  if (!input) invalid();
  assertPersistentSelfServeRuntime(input.runtime);
  assertVerifiedEdgeTrustBoundary(input.edgeTrustBoundary);
  if (!isInitialVerifiedCallbackGrantBoundaryForRuntime(input.initialCallbackGrantBoundary, input.runtime)) invalid();
  if (!isPostgresPanelSessionHandoffIssuerForBoundary(input.issuer, input.initialCallbackGrantBoundary)) invalid();
  if (!input.browserBindingRepository || typeof input.browserBindingRepository.claimCallback !== "function") invalid();
  if (typeof input.clock !== "function" || typeof input.audit !== "function") invalid();
  trustedNow(input.clock);
  const runtime = input.runtime;
  const boundary = input.edgeTrustBoundary;
  const clock = input.clock;
  const audit = input.audit;
  const claimBrowserCallback = input.browserBindingRepository.claimCallback.bind(input.browserBindingRepository);
  const executor = createInitialCallbackPanelSessionHandoffExecutor({
    runtime,
    boundary: input.initialCallbackGrantBoundary,
    issuer: input.issuer,
  });

  const handler: OwnerPanelSessionInitialCallbackHandler = Object.freeze({
    async handle(
      request: Request,
      edgeTrustContext: unknown,
      browserBindingCredential: string,
    ): Promise<OwnerPanelSessionHandoffInternalResult> {
      const gateInput = { kind: "callback_completion" as const, request, edgeTrustContext };
      try {
        const runtimeDecision = await runtime.verifyRequest(gateInput);
        if (runtimeDecision !== "allowed") {
          auditSafely(audit, { stage: "request_gate", outcome: runtimeDecision === "unavailable" ? "unavailable" : "rejected" });
          return createFreshLoginRequiredResult(runtimeDecision === "unavailable" ? "callback_unavailable" : "callback_not_granted");
        }
        const boundaryDecision = await boundary.requestGate.verify(gateInput);
        if (boundaryDecision !== "allowed") {
          auditSafely(audit, { stage: "request_gate", outcome: boundaryDecision === "unavailable" ? "unavailable" : "rejected" });
          return createFreshLoginRequiredResult(boundaryDecision === "unavailable" ? "callback_unavailable" : "callback_not_granted");
        }
      } catch {
        auditSafely(audit, { stage: "request_gate", outcome: "unavailable" });
        return createFreshLoginRequiredResult("callback_unavailable");
      }

      let callback: ReturnType<typeof classifyReconstructedOwnerCallbackRequest>;
      try { callback = classifyReconstructedOwnerCallbackRequest(request); }
      catch {
        auditSafely(audit, { stage: "callback", outcome: "rejected" });
        return createFreshLoginRequiredResult("callback_not_granted");
      }

      let claimed: Awaited<ReturnType<typeof claimBrowserCallback>>;
      try {
        const credential = canonicalBrowserBindingCredential(browserBindingCredential);
        claimed = await claimBrowserCallback({
          rawState: callback.state,
          browserBindingCredential: credential,
          now: trustedNow(clock),
        });
      } catch {
        auditSafely(audit, { stage: "browser_claim", outcome: "unavailable" });
        return createFreshLoginRequiredResult("callback_unavailable");
      }
      if (claimed.kind !== "browser_callback_claimed") {
        const unavailable = claimed.kind === "commit_unknown" || claimed.kind === "unavailable";
        auditSafely(audit, { stage: "browser_claim", outcome: unavailable ? "unavailable" : "rejected" });
        return createFreshLoginRequiredResult(
          claimed.kind === "callback_replayed"
            ? "callback_replayed"
            : unavailable ? "callback_unavailable" : "callback_not_granted",
        );
      }
      auditSafely(audit, { stage: "browser_claim", outcome: "accepted" });

      if (callback.kind === "provider_error") {
        try {
          await runtime.rejectProviderCallback(callback.state);
          auditSafely(audit, { stage: "provider_rejection", outcome: "accepted" });
          return createFreshLoginRequiredResult("provider_rejected");
        } catch {
          auditSafely(audit, { stage: "provider_rejection", outcome: "unavailable" });
          return createFreshLoginRequiredResult("callback_unavailable");
        }
      }

      let executed: Awaited<ReturnType<typeof executor.execute>>;
      try { executed = await executor.execute({ state: callback.state, code: callback.code }); }
      catch {
        auditSafely(audit, { stage: "callback", outcome: "unavailable" });
        return createFreshLoginRequiredResult("callback_unavailable");
      }
      if (executed.kind === "initial_callback_replayed") {
        auditSafely(audit, { stage: "callback", outcome: "rejected" });
        return createFreshLoginRequiredResult("callback_replayed");
      }
      if (executed.kind !== "initial_callback_granted") {
        auditSafely(audit, { stage: "callback", outcome: "rejected" });
        return createFreshLoginRequiredResult("callback_not_granted");
      }
      const handoff = executed.value.handoff;
      if (handoff.kind !== "handoff_created" && handoff.kind !== "handoff_replayed") {
        auditSafely(audit, { stage: "handoff", outcome: handoff.kind === "unavailable" ? "unavailable" : "rejected" });
        return createFreshLoginRequiredResult(handoff.kind === "unavailable" ? "handoff_unavailable" : "handoff_rejected");
      }
      try {
        const now = trustedNow(clock).getTime();
        const expires = canonicalExpiry(handoff.expiresAt);
        if (expires <= now || expires > now + MAXIMUM_HANDOFF_MS) invalid();
        const result = createSessionHandoffReadyResult(handoff.credential, handoff.expiresAt);
        auditSafely(audit, { stage: "handoff", outcome: "accepted" });
        return result;
      } catch {
        auditSafely(audit, { stage: "handoff", outcome: "rejected" });
        return createFreshLoginRequiredResult("handoff_rejected");
      }
    },
  });
  handlerAuthorities.set(handler, boundary);
  return handler;
}
