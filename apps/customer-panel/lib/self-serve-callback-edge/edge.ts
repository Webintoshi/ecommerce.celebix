import { PANEL_OIDC_CALLBACK_URL } from "../../../../packages/platform-config/src/saas.ts";

import { projectSafeCallbackResponse, safeCallbackJson } from "./safe-response.ts";

const approvals = new WeakSet<object>();
const ALLOWED_PARAMETERS = {
  success: new Set(["state", "code"]),
  error: new Set(["state", "error", "error_description", "error_uri"]),
};
const PRIVATE_HEADERS = [
  "authorization",
  "cookie",
  "x-celebix-callback-key-id",
  "x-celebix-callback-timestamp",
  "x-celebix-callback-signature",
  "x-celebix-edge-trust",
  "x-celebix-tenant-id",
  "x-celebix-principal-id",
  "x-celebix-store-id",
  "x-celebix-session-id",
  "x-celebix-return-url",
];

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

function exactAuthority(value: string): string {
  try {
    const url = new URL(value);
    if (
      value !== PANEL_OIDC_CALLBACK_URL || url.protocol !== "https:" || url.username || url.password ||
      url.port || url.search || url.hash || `${url.origin}${url.pathname}` !== value
    ) invalid();
    return value;
  } catch {
    return invalid();
  }
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

function validateRawQuery(rawQuery: string): URLSearchParams {
  if (!rawQuery) throw new Error("invalid");
  for (const pair of rawQuery.split("&")) {
    if (!pair) throw new Error("invalid");
    const equals = pair.indexOf("=");
    const pieces = equals < 0 ? [pair] : [pair.slice(0, equals), pair.slice(equals + 1)];
    for (const piece of pieces) decodeURIComponent(piece.replaceAll("+", " "));
  }
  return new URLSearchParams(rawQuery);
}

function exactSingle(search: URLSearchParams, name: string, maximum: number): string {
  const values = search.getAll(name);
  const value = values[0];
  if (
    values.length !== 1 || !value || value !== value.trim() || value.length > maximum ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) throw new Error("invalid");
  return value;
}

function validateCallbackRequest(request: Request, authority: string, maximumQueryBytes: number): string {
  if (request.method !== "GET") throw Object.assign(new Error("invalid"), { status: 405 });
  for (const name of PRIVATE_HEADERS) if (request.headers.has(name)) throw new Error("invalid");
  const url = new URL(request.url);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || `${url.origin}${url.pathname}` !== authority) {
    throw new Error("invalid");
  }
  const marker = request.url.indexOf("?");
  const rawQuery = marker < 0 ? "" : request.url.slice(marker + 1);
  if (new TextEncoder().encode(rawQuery).byteLength > maximumQueryBytes) {
    throw Object.assign(new Error("invalid"), { status: 413 });
  }
  const search = validateRawQuery(rawQuery);
  const names = [...search.keys()];
  if (names.some((name, index) => names.indexOf(name) !== index)) throw new Error("invalid");
  const hasCode = search.has("code");
  const hasError = search.has("error");
  if (hasCode === hasError) throw new Error("invalid");
  const allowed = hasError ? ALLOWED_PARAMETERS.error : ALLOWED_PARAMETERS.success;
  if (names.some((name) => !allowed.has(name))) throw new Error("invalid");
  const state = exactSingle(search, "state", 1_024);
  if (state.length < 16) throw new Error("invalid");
  if (hasCode) exactSingle(search, "code", 4_096);
  else {
    exactSingle(search, "error", 256);
    if (search.has("error_description")) exactSingle(search, "error_description", 1_024);
    if (search.has("error_uri")) exactSingle(search, "error_uri", 1_024);
  }
  return request.url;
}

export function createDisabledCustomerPanelSelfServeCallbackEdge() {
  return async function disabledCustomerPanelSelfServeCallbackEdge(_request: Request): Promise<Response> {
    return controlled({ code: "panel_auth_disabled" }, 503);
  };
}

export function createCustomerPanelSelfServeCallbackEdge(options: CallbackEdgeOptions) {
  assertCustomerPanelCallbackEdgeApproval(options?.activationApproval);
  const authority = exactAuthority(options.publicCallbackAuthority);
  const maximumQueryBytes = boundedInteger(options.maximumQueryBytes, 16_384);
  const maximumResponseBytes = boundedInteger(options.maximumResponseBytes, 65_536);
  if (!options.transport || typeof options.transport.forward !== "function" || typeof options.audit !== "function") invalid();
  const transport = options.transport;
  const audit = options.audit;

  return async function customerPanelSelfServeCallbackEdge(request: Request): Promise<Response> {
    let callbackUrl: string;
    try {
      callbackUrl = validateCallbackRequest(request, authority, maximumQueryBytes);
    } catch (error) {
      const status = error && typeof error === "object" && "status" in error && [405, 413].includes(Number(error.status))
        ? Number(error.status)
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
