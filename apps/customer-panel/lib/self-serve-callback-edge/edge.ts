import { projectSafeCallbackResponse, safeCallbackJson } from "./safe-response.ts";
import {
  CallbackRequestValidationError,
  validateCustomerPanelCallbackAuthority,
  validateCustomerPanelCallbackRequest,
} from "./callback-request.ts";

const approvals = new WeakSet<object>();

export type CustomerPanelCallbackEdgeApproval = Readonly<{
  purpose: "phase2b1b2b_customer_panel_callback_edge";
  environment: "disposable_test" | "approved_staging";
  publicActivation: "disabled_default_route";
  transport: "authenticated_injected_only";
  sessions: "forbidden";
  providerNetworking: "forbidden";
}>;

type CallbackEdgeOptions = {
  activationApproval: unknown;
  publicCallbackAuthority: string;
  maximumQueryBytes: number;
  maximumResponseBytes: number;
  transport: { forward(callbackUrl: string): Promise<Response> };
  audit(event: Readonly<Record<string, string>>): void | Promise<void>;
};

function invalid(): never {
  throw new Error("customer_panel_callback_edge_invalid");
}

export function createCustomerPanelCallbackEdgeApproval(
  environment: "disposable_test" | "approved_staging",
): CustomerPanelCallbackEdgeApproval {
  if (environment !== "disposable_test" && environment !== "approved_staging") invalid();
  const approval: CustomerPanelCallbackEdgeApproval = {
    purpose: "phase2b1b2b_customer_panel_callback_edge",
    environment,
    publicActivation: "disabled_default_route",
    transport: "authenticated_injected_only",
    sessions: "forbidden",
    providerNetworking: "forbidden",
  };
  approvals.add(approval);
  return Object.freeze(approval);
}

export function assertCustomerPanelCallbackEdgeApproval(value: unknown): asserts value is CustomerPanelCallbackEdgeApproval {
  if (!value || typeof value !== "object" || !approvals.has(value)) invalid();
}

function boundedInteger(value: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) invalid();
  return value;
}

function auditSafely(audit: CallbackEdgeOptions["audit"], event: Readonly<Record<string, string>>): void {
  try { void Promise.resolve(audit(Object.freeze(event))).catch(() => undefined); }
  catch { /* Auditing cannot affect callback control flow. */ }
}

function controlled(body: Record<string, unknown>, status: number): Response {
  return safeCallbackJson(body, status);
}

export function createDisabledCustomerPanelSelfServeCallbackEdge() {
  return async function disabledCustomerPanelSelfServeCallbackEdge(_request: Request): Promise<Response> {
    return controlled({ code: "panel_auth_disabled" }, 503);
  };
}

export function createCustomerPanelSelfServeCallbackEdge(options: CallbackEdgeOptions) {
  assertCustomerPanelCallbackEdgeApproval(options?.activationApproval);
  let authority: string;
  try { authority = validateCustomerPanelCallbackAuthority(options.publicCallbackAuthority); }
  catch { return invalid(); }
  const maximumQueryBytes = boundedInteger(options.maximumQueryBytes, 16_384);
  const maximumResponseBytes = boundedInteger(options.maximumResponseBytes, 65_536);
  if (!options.transport || typeof options.transport.forward !== "function" || typeof options.audit !== "function") invalid();
  const transport = options.transport;
  const audit = options.audit;

  return async function customerPanelSelfServeCallbackEdge(request: Request): Promise<Response> {
    let callbackUrl: string;
    try {
      callbackUrl = validateCustomerPanelCallbackRequest(request, authority, maximumQueryBytes).callbackUrl;
    } catch (error) {
      const status = error instanceof CallbackRequestValidationError && [405, 413].includes(error.status)
        ? error.status
        : 400;
      auditSafely(audit, { stage: "public_validation", outcome: "rejected" });
      return controlled({ code: "panel_callback_invalid", state: "rejected", retryable: false }, status);
    }

    let ownerResponse: Response;
    try {
      ownerResponse = await transport.forward(callbackUrl);
    } catch {
      auditSafely(audit, { stage: "owner_transport", outcome: "unknown" });
      return controlled({ code: "panel_callback_transport_unknown", state: "transport_unknown", retryable: true }, 503);
    }
    try {
      const response = await projectSafeCallbackResponse(ownerResponse, maximumResponseBytes);
      auditSafely(audit, { stage: "owner_response", outcome: "projected" });
      return response;
    } catch {
      auditSafely(audit, { stage: "owner_response", outcome: "rejected" });
      return controlled({ code: "panel_callback_unavailable", state: "failed", retryable: true }, 503);
    }
  };
}
