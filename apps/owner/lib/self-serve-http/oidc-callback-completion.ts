import { OidcFlowError } from "../self-serve-oidc.ts";
import {
  assertPersistentSelfServeRuntime,
  type PersistentSelfServeRuntime,
  type SelfServeCallbackServiceResult,
  type SelfServeHttpAuditEvent,
  type SelfServeRequestGateDecision,
  type SelfServeRuntime,
} from "./runtime.ts";

class CallbackRequestError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
  }
}

type ParsedCallback =
  | { kind: "success"; state: string; code: string }
  | { kind: "provider_error"; state: string };

const SUCCESS_PARAMETERS = new Set(["state", "code"]);
const ERROR_PARAMETERS = new Set(["state", "error", "error_description", "error_uri"]);

function message(code: string): string {
  const messages: Record<string, string> = {
    self_serve_callback_method_not_allowed: "Kimlik doğrulama dönüşü yalnızca GET kabul eder.",
    self_serve_callback_untrusted: "Kimlik doğrulama dönüşü doğrulanamadı.",
    self_serve_callback_forbidden: "Kimlik doğrulama dönüşüne izin verilmedi.",
    self_serve_callback_rate_limited: "Kimlik doğrulama dönüşü şu anda sınırlandırıldı.",
    self_serve_callback_gate_unavailable: "Kimlik doğrulama güvenlik kontrolü şu anda kullanılamıyor.",
    self_serve_callback_invalid: "Kimlik doğrulama dönüşü geçerli değil.",
    self_serve_callback_query_too_large: "Kimlik doğrulama dönüşü izin verilen boyutu aşıyor.",
    self_serve_oidc_provider_rejected: "Kimlik sağlayıcı kayıt isteğini reddetti.",
    self_serve_oidc_provider_unavailable: "Kimlik sağlayıcı şu anda kullanılamıyor; kayıt yeniden başlatılmalı.",
    self_serve_callback_restart_required: "Kayıt işlemi güvenli şekilde yeniden başlatılmalı.",
    self_serve_callback_recovery_failed: "Kimlik doğrulama dönüşü güvenli şekilde kurtarılamadı.",
    self_serve_oidc_invalid_state: "Kimlik doğrulama durumu geçerli değil.",
    self_serve_oidc_state_replayed: "Kimlik doğrulama durumu daha önce kullanıldı.",
    self_serve_oidc_state_expired: "Kimlik doğrulama durumunun süresi doldu.",
    self_serve_oidc_nonce_mismatch: "Kimlik doğrulama yanıtı doğrulanamadı.",
    self_serve_oidc_issuer_mismatch: "Kimlik doğrulama yanıtı doğrulanamadı.",
    self_serve_oidc_audience_mismatch: "Kimlik doğrulama yanıtı doğrulanamadı.",
    self_serve_oidc_invalid_callback: "Kimlik doğrulama dönüşü geçerli değil.",
    self_serve_callback_unavailable: "Kimlik doğrulama işlemi güvenli şekilde tamamlanamadı.",
    self_serve_completion_pending: "Mağaza hazırlama işlemi sürüyor.",
    self_serve_completion_reconciliation_required: "Mağaza sonucu doğrulama bekliyor.",
    self_serve_completion_state_unknown: "Mağaza hazırlama durumu şu anda doğrulanamıyor.",
    self_serve_completion_rejected: "Mağaza hazırlama işlemi tamamlanamadı.",
  };
  return messages[code] ?? "Kimlik doğrulama işlemi tamamlanamadı.";
}

function json(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

function audit(
  runtime: PersistentSelfServeRuntime,
  event: Omit<SelfServeHttpAuditEvent, "operation">,
): void {
  runtime.audit({ operation: "callback_completion", ...event });
}

function auditCompletionResponse(runtime: PersistentSelfServeRuntime, response: Response): void {
  audit(runtime, {
    stage: "tenant_completion",
    outcome: response.status < 300 ? (response.status === 202 ? "pending" : "completed") : "failed",
    retryable: response.status === 202,
    statusCategory: response.status < 300 ? "2xx" : response.status < 500 ? "4xx" : "5xx",
  });
}

function gateResponse(decision: Exclude<SelfServeRequestGateDecision, "allowed">): Response {
  const mapped = {
    unauthorized: { code: "self_serve_callback_untrusted", status: 401, retryable: false },
    forbidden: { code: "self_serve_callback_forbidden", status: 403, retryable: false },
    rate_limited: { code: "self_serve_callback_rate_limited", status: 429, retryable: true },
    unavailable: { code: "self_serve_callback_gate_unavailable", status: 503, retryable: true },
  }[decision];
  return json({ code: mapped.code, state: "rejected", retryable: mapped.retryable, message: message(mapped.code) }, mapped.status);
}

function exactCallbackUrl(request: Request, runtime: PersistentSelfServeRuntime): URL {
  let url: URL;
  try { url = new URL(request.url); }
  catch { throw new CallbackRequestError("self_serve_callback_invalid", 400); }
  if (
    url.protocol !== "https:" || url.username || url.password || url.hash ||
    `${url.origin}${url.pathname}` !== runtime.callbackAuthority
  ) throw new CallbackRequestError("self_serve_callback_invalid", 400);
  const marker = request.url.indexOf("?");
  const rawQuery = marker < 0 ? "" : request.url.slice(marker + 1);
  if (new TextEncoder().encode(rawQuery).byteLength > runtime.bodyPolicy.maximumCallbackQueryBytes) {
    throw new CallbackRequestError("self_serve_callback_query_too_large", 413);
  }
  return url;
}

function validateRawQuery(rawQuery: string): void {
  if (!rawQuery) throw new CallbackRequestError("self_serve_callback_invalid", 400);
  for (const pair of rawQuery.split("&")) {
    if (!pair) throw new CallbackRequestError("self_serve_callback_invalid", 400);
    const equals = pair.indexOf("=");
    const parts = equals < 0 ? [pair] : [pair.slice(0, equals), pair.slice(equals + 1)];
    for (const part of parts) {
      try { decodeURIComponent(part.replaceAll("+", " ")); }
      catch { throw new CallbackRequestError("self_serve_callback_invalid", 400); }
    }
  }
}

function exactSingle(search: URLSearchParams, name: string, maximumLength: number): string {
  const values = search.getAll(name);
  const value = values[0];
  if (
    values.length !== 1 || typeof value !== "string" || !value || value !== value.trim() ||
    value.length > maximumLength || /[\u0000-\u001f\u007f]/.test(value)
  ) throw new CallbackRequestError("self_serve_callback_invalid", 400);
  return value;
}

function parseCallback(url: URL): ParsedCallback {
  const rawQuery = url.search.startsWith("?") ? url.search.slice(1) : url.search;
  validateRawQuery(rawQuery);
  const names = [...url.searchParams.keys()];
  if (names.some((name, index) => names.indexOf(name) !== index)) {
    throw new CallbackRequestError("self_serve_callback_invalid", 400);
  }
  const hasCode = url.searchParams.has("code");
  const hasError = url.searchParams.has("error");
  if (hasCode === hasError) throw new CallbackRequestError("self_serve_callback_invalid", 400);
  const allowed = hasError ? ERROR_PARAMETERS : SUCCESS_PARAMETERS;
  if (names.some((name) => !allowed.has(name))) {
    throw new CallbackRequestError("self_serve_callback_invalid", 400);
  }
  const state = exactSingle(url.searchParams, "state", 1_024);
  if (state.length < 16) throw new CallbackRequestError("self_serve_callback_invalid", 400);
  if (hasError) {
    exactSingle(url.searchParams, "error", 256);
    for (const optional of ["error_description", "error_uri"] as const) {
      if (url.searchParams.has(optional)) exactSingle(url.searchParams, optional, 1_024);
    }
    return { kind: "provider_error", state };
  }
  return { kind: "success", state, code: exactSingle(url.searchParams, "code", 4_096) };
}

function oidcError(error: OidcFlowError): Response {
  if (error.code === "oidc_provider_unavailable") {
    return json({
      code: "self_serve_oidc_provider_unavailable",
      state: "restart_required",
      retryable: false,
      restartRegistration: true,
      message: message("self_serve_oidc_provider_unavailable"),
    }, 503);
  }
  const mapped: Partial<Record<string, { status: number; retryable: boolean }>> = {
    oidc_invalid_state: { status: 400, retryable: false },
    oidc_state_replayed: { status: 409, retryable: false },
    oidc_state_expired: { status: 410, retryable: false },
    oidc_nonce_mismatch: { status: 400, retryable: false },
    oidc_issuer_mismatch: { status: 400, retryable: false },
    oidc_audience_mismatch: { status: 400, retryable: false },
    oidc_invalid_callback: { status: 400, retryable: false },
    oidc_provider_rejected: { status: 400, retryable: false },
    oidc_disabled: { status: 503, retryable: true },
  };
  const controlled = mapped[error.code] ?? { status: 503, retryable: true };
  const code = error.code === "oidc_disabled" ? "self_serve_callback_unavailable" : `self_serve_${error.code}`;
  return json({ code, state: "rejected", retryable: controlled.retryable, message: message(code) }, controlled.status);
}

function completionResponse(result: SelfServeCallbackServiceResult): Response {
  if (
    result.kind === "tenant_created_session_pending" ||
    result.kind === "tenant_recovered_session_pending" ||
    result.kind === "tenant_already_created_session_pending"
  ) {
    return json({
      state: result.kind,
      storeSlug: result.storeSlug,
      storefrontUrl: result.storefrontUrl,
      panelUrl: result.panelUrl,
      provisioningStatus: result.provisioningStatus,
      session: "pending",
    }, 200);
  }
  if (result.kind === "in_progress") {
    return json({ code: "self_serve_completion_pending", state: result.kind, retryable: true, message: message("self_serve_completion_pending") }, 202);
  }
  if (result.kind === "restart_required") {
    return json({
      code: "self_serve_callback_restart_required",
      state: result.kind,
      retryable: false,
      restartRegistration: true,
      message: message("self_serve_callback_restart_required"),
    }, 409);
  }
  if (result.kind === "recovery_failed") {
    return json({
      code: "self_serve_callback_recovery_failed",
      state: result.kind,
      retryable: false,
      message: message("self_serve_callback_recovery_failed"),
    }, result.unavailable ? 503 : 409);
  }
  if (result.kind === "commit_unknown" || result.kind === "reconciliation_required" || result.kind === "recovery_absent") {
    return json({
      code: "self_serve_completion_reconciliation_required",
      state: result.kind,
      retryable: false,
      message: message("self_serve_completion_reconciliation_required"),
    }, 409);
  }
  if (result.kind === "completion_state_unknown") {
    return json({ code: "self_serve_completion_state_unknown", state: result.kind, retryable: false, message: message("self_serve_completion_state_unknown") }, 503);
  }
  if (result.kind === "completion_failed") {
    return json({ code: "self_serve_completion_rejected", state: result.kind, retryable: false, message: message("self_serve_completion_rejected") }, 409);
  }
  if (result.kind === "rejected") {
    const status = result.error.retryable ? 503 : 409;
    return json({
      code: result.error.retryable ? "self_serve_callback_unavailable" : "self_serve_completion_rejected",
      state: "completion_rejected",
      retryable: false,
      message: message(result.error.retryable ? "self_serve_callback_unavailable" : "self_serve_completion_rejected"),
    }, status);
  }
  return json({
    code: "self_serve_completion_state_unknown",
    state: "completion_state_unknown",
    retryable: false,
    message: message("self_serve_completion_state_unknown"),
  }, 503);
}

export function createSelfServeOidcCallbackCompletionHandler(runtime: SelfServeRuntime) {
  assertPersistentSelfServeRuntime(runtime);
  return async function selfServeOidcCallbackCompletionHandler(
    request: Request,
    edgeTrustContext: unknown,
  ): Promise<Response> {
    let decision: SelfServeRequestGateDecision;
    try { decision = await runtime.verifyRequest({ kind: "callback_completion", request, edgeTrustContext }); }
    catch { decision = "unavailable"; }
    if (decision !== "allowed") {
      audit(runtime, { stage: "request_gate", outcome: "rejected", retryable: decision === "rate_limited" || decision === "unavailable", statusCategory: decision === "unavailable" ? "5xx" : "4xx" });
      return gateResponse(decision);
    }

    let callback: ParsedCallback;
    try {
      if (request.method !== "GET") throw new CallbackRequestError("self_serve_callback_method_not_allowed", 405);
      callback = parseCallback(exactCallbackUrl(request, runtime));
    } catch (error) {
      const controlled = error instanceof CallbackRequestError
        ? error
        : new CallbackRequestError("self_serve_callback_invalid", 400);
      audit(runtime, { stage: "request_validation", outcome: "rejected", retryable: false, statusCategory: "4xx" });
      return json({ code: controlled.code, state: "rejected", retryable: false, message: message(controlled.code) }, controlled.status);
    }

    try {
      if (callback.kind === "provider_error") {
        await runtime.rejectProviderCallback(callback.state);
        audit(runtime, { stage: "provider", outcome: "rejected", retryable: false, statusCategory: "4xx" });
        return json({
          code: "self_serve_oidc_provider_rejected",
          state: "rejected",
          retryable: false,
          message: message("self_serve_oidc_provider_rejected"),
        }, 400);
      }
      const result = await runtime.completeCallback({ state: callback.state, code: callback.code });
      const response = completionResponse(result);
      auditCompletionResponse(runtime, response);
      return response;
    } catch (error) {
      let response: Response;
      if (error instanceof OidcFlowError && error.code === "oidc_state_replayed") {
        response = completionResponse(await runtime.recoverConsumedCallback(callback.state));
        auditCompletionResponse(runtime, response);
        return response;
      } else {
        response = error instanceof OidcFlowError
          ? oidcError(error)
          : json({ code: "self_serve_callback_unavailable", state: "failed", retryable: false, message: message("self_serve_callback_unavailable") }, 503);
      }
      audit(runtime, { stage: error instanceof OidcFlowError ? "provider" : "persistence", outcome: "failed", retryable: response.status === 202, statusCategory: response.status >= 500 ? "5xx" : "4xx" });
      return response;
    }
  };
}
