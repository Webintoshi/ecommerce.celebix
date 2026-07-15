import { PANEL_BROWSER_BOOTSTRAP_URL } from "../../../../packages/platform-config/src/saas.ts";
import type { PanelBrowserBindingRegistrationStartResult } from "../panel-browser-binding/start-executor.ts";
import type { SelfServeRegistrationStartInput } from "../self-serve-registration-orchestrator.ts";
import {
  processSelfServeRegistrationRequest,
  type SelfServeRegistrationRequestResult,
} from "../self-serve-http/registration-request.ts";
import type { SelfServeRuntime } from "../self-serve-http/runtime.ts";
import { assertBrowserBoundRegistrationBridgeApproval } from "./activation.ts";
import { createOwnerPanelBootstrapAutoPostResponse } from "./auto-post-html.ts";

type BridgeAudit = (event: Readonly<{
  stage: "request" | "bootstrap" | "browser_response";
  outcome: "completed" | "rejected" | "unavailable";
}>) => void | Promise<void>;

function invalid(): never {
  throw new Error("browser_bound_registration_bridge_invalid");
}

function auditSafely(audit: BridgeAudit, event: Parameters<BridgeAudit>[0]): void {
  try { void Promise.resolve(audit(Object.freeze({ ...event }))).catch(() => undefined); }
  catch { /* Audit is observational only. */ }
}

function safeJson(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}

async function hardenFailure(
  result: Extract<SelfServeRegistrationRequestResult, { ok: false }>,
): Promise<Response> {
  let body: string;
  try { body = await result.response.text(); }
  catch {
    return safeJson({
      code: "self_serve_request_malformed",
      state: "rejected",
      retryable: false,
      message: "Kayıt isteği geçerli değil.",
    }, 400);
  }
  return new Response(body, {
    status: result.response.status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}

function unavailable(): Response {
  return safeJson({
    code: "self_serve_browser_bridge_unavailable",
    state: "failed",
    retryable: false,
    message: "Güvenli kayıt geçişi tamamlanamadı.",
  }, 503);
}

export function createBrowserBoundSelfServeRegistrationHandler(options: {
  activationApproval: unknown;
  runtime: SelfServeRuntime;
  registrationStartExecutor: Readonly<{
    execute(registration: SelfServeRegistrationStartInput): Promise<PanelBrowserBindingRegistrationStartResult>;
  }>;
  randomBytes(size: number): Uint8Array;
  panelBootstrapAuthority?: string;
  audit: BridgeAudit;
}) {
  assertBrowserBoundRegistrationBridgeApproval(options?.activationApproval);
  if (
    !options.runtime || !options.registrationStartExecutor ||
    typeof options.registrationStartExecutor.execute !== "function" ||
    typeof options.randomBytes !== "function" || typeof options.audit !== "function"
  ) invalid();
  const runtime = options.runtime;
  const execute = options.registrationStartExecutor.execute.bind(options.registrationStartExecutor);
  const randomBytes = options.randomBytes;
  const panelBootstrapAuthority = options.panelBootstrapAuthority ?? PANEL_BROWSER_BOOTSTRAP_URL;
  const audit = options.audit;

  return async function browserBoundSelfServeRegistrationHandler(request: Request): Promise<Response> {
    let processed: SelfServeRegistrationRequestResult;
    try { processed = await processSelfServeRegistrationRequest(runtime, request); }
    catch {
      auditSafely(audit, { stage: "request", outcome: "unavailable" });
      return unavailable();
    }
    if (!processed.ok) {
      auditSafely(audit, { stage: "request", outcome: "rejected" });
      return hardenFailure(processed);
    }
    auditSafely(audit, { stage: "request", outcome: "completed" });

    let started: PanelBrowserBindingRegistrationStartResult;
    try {
      started = await execute(processed.registration);
      if (started.panelBootstrapAuthority !== panelBootstrapAuthority) invalid();
    } catch {
      auditSafely(audit, { stage: "bootstrap", outcome: "unavailable" });
      return unavailable();
    }
    auditSafely(audit, { stage: "bootstrap", outcome: "completed" });

    try {
      const response = createOwnerPanelBootstrapAutoPostResponse({
        bootstrapCredential: started.bootstrapCredential,
        providerAuthorizationUrl: started.providerAuthorizationUrl,
        panelBootstrapAuthority,
        randomBytes,
      });
      auditSafely(audit, { stage: "browser_response", outcome: "completed" });
      return response;
    } catch {
      auditSafely(audit, { stage: "browser_response", outcome: "unavailable" });
      return unavailable();
    }
  };
}
