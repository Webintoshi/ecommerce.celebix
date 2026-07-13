const SUCCESS_STATES = new Set([
  "tenant_created_session_pending",
  "tenant_recovered_session_pending",
  "tenant_already_created_session_pending",
]);

const ERROR_CODE_BY_STATE: Readonly<Record<string, ReadonlySet<string>>> = Object.freeze({
  rejected: new Set([
    "self_serve_callback_untrusted",
    "self_serve_callback_forbidden",
    "self_serve_callback_rate_limited",
    "self_serve_callback_gate_unavailable",
    "self_serve_callback_invalid",
    "self_serve_callback_query_too_large",
    "self_serve_oidc_provider_rejected",
    "self_serve_oidc_invalid_state",
    "self_serve_oidc_state_replayed",
    "self_serve_oidc_state_expired",
    "self_serve_oidc_nonce_mismatch",
    "self_serve_oidc_issuer_mismatch",
    "self_serve_oidc_audience_mismatch",
    "self_serve_oidc_invalid_callback",
    "self_serve_callback_unavailable",
  ]),
  failed: new Set(["self_serve_callback_unavailable"]),
  in_progress: new Set(["self_serve_completion_pending"]),
  restart_required: new Set(["self_serve_oidc_provider_unavailable", "self_serve_callback_restart_required"]),
  recovery_failed: new Set(["self_serve_callback_recovery_failed"]),
  commit_unknown: new Set(["self_serve_completion_reconciliation_required"]),
  reconciliation_required: new Set(["self_serve_completion_reconciliation_required"]),
  recovery_absent: new Set(["self_serve_completion_reconciliation_required"]),
  completion_state_unknown: new Set(["self_serve_completion_state_unknown"]),
  completion_failed: new Set(["self_serve_completion_rejected"]),
  completion_rejected: new Set(["self_serve_callback_unavailable", "self_serve_completion_rejected"]),
});

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === [...expected].sort()[index]);
}

function safeText(value: unknown, maximumLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximumLength &&
    value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
}

function safeHttpsUrl(value: unknown, hostname: string): value is string {
  if (!safeText(value, 1_024)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === hostname && !url.port &&
      !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function validateSafeBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("callback_response_invalid");
  const body = value as Record<string, unknown>;
  if (SUCCESS_STATES.has(String(body.state))) {
    const keys = ["panelUrl", "provisioningStatus", "session", "state", "storefrontUrl", "storeSlug"];
    if (
      !exactKeys(body, keys) || !safeText(body.storeSlug, 63) ||
      !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(body.storeSlug) ||
      !safeHttpsUrl(body.storefrontUrl, `${body.storeSlug}.celebix.site`) ||
      !safeHttpsUrl(body.panelUrl, "panel.celebix.site") ||
      body.provisioningStatus !== "ready" || body.session !== "pending"
    ) throw new Error("callback_response_invalid");
    return body;
  }

  const state = String(body.state);
  const allowedCodes = ERROR_CODE_BY_STATE[state];
  const restart = state === "restart_required";
  const keys = restart
    ? ["code", "message", "restartRegistration", "retryable", "state"]
    : ["code", "message", "retryable", "state"];
  if (
    !exactKeys(body, keys) || !allowedCodes || !allowedCodes.has(String(body.code)) ||
    typeof body.retryable !== "boolean" || !safeText(body.message, 512) ||
    (restart && (body.restartRegistration !== true || body.retryable !== false))
  ) throw new Error("callback_response_invalid");
  return body;
}

async function boundedBytes(response: Response, maximumBytes: number): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > 65_536 || !response.body) {
    throw new Error("callback_response_invalid");
  }
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximumBytes)) {
    throw new Error("callback_response_invalid");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximumBytes) throw new Error("callback_response_invalid");
      chunks.push(value);
    }
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error;
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export function safeCallbackJson(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function projectSafeCallbackResponse(response: Response, maximumBytes: number): Promise<Response> {
  if (!(response instanceof Response) || response.status < 200 || response.status > 599) {
    throw new Error("callback_response_invalid");
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(await boundedBytes(response, maximumBytes));
  } catch {
    throw new Error("callback_response_invalid");
  }
  let parsed: unknown;
  try { parsed = JSON.parse(text); }
  catch { throw new Error("callback_response_invalid"); }
  const body = validateSafeBody(parsed);
  const success = SUCCESS_STATES.has(String(body.state));
  if ((success && response.status !== 200) || (!success && response.status < 400 && response.status !== 202)) {
    throw new Error("callback_response_invalid");
  }
  return safeCallbackJson(body, response.status);
}
