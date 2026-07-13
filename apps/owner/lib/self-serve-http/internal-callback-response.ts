type ResponseMatrixEntry = Readonly<{
  state: string;
  code: string | null;
  statuses: readonly number[];
  retryable: boolean | null;
  restartRegistration: true | null;
  keys: readonly string[];
  message: string | null;
}>;

const SUCCESS_KEYS = Object.freeze([
  "state",
  "storeSlug",
  "storefrontUrl",
  "panelUrl",
  "provisioningStatus",
  "session",
]);
const ERROR_KEYS = Object.freeze(["code", "state", "retryable", "message"]);
const RESTART_KEYS = Object.freeze(["code", "state", "retryable", "restartRegistration", "message"]);

const RESPONSE_MATRIX: readonly ResponseMatrixEntry[] = Object.freeze([
  Object.freeze({ state: "tenant_created_session_pending", code: null, statuses: Object.freeze([200]), retryable: null, restartRegistration: null, keys: SUCCESS_KEYS, message: null }),
  Object.freeze({ state: "tenant_recovered_session_pending", code: null, statuses: Object.freeze([200]), retryable: null, restartRegistration: null, keys: SUCCESS_KEYS, message: null }),
  Object.freeze({ state: "tenant_already_created_session_pending", code: null, statuses: Object.freeze([200]), retryable: null, restartRegistration: null, keys: SUCCESS_KEYS, message: null }),
  Object.freeze({ state: "rejected", code: "self_serve_callback_method_not_allowed", statuses: Object.freeze([405]), retryable: false, restartRegistration: null, keys: ERROR_KEYS, message: "Kimlik doğrulama dönüşü yalnızca GET kabul eder." }),
  Object.freeze({ state: "rejected", code: "self_serve_callback_untrusted", statuses: Object.freeze([401]), retryable: false, restartRegistration: null, keys: ERROR_KEYS, message: "Kimlik doğrulama dönüşü doğrulanamadı." }),
  Object.freeze({ state: "rejected", code: "self_serve_callback_forbidden", statuses: Object.freeze([403]), retryable: false, restartRegistration: null, keys: ERROR_KEYS, message: "Kimlik doğrulama dönüşüne izin verilmedi." }),
  Object.freeze({ state: "rejected", code: "self_serve_callback_rate_limited", statuses: Object.freeze([429]), retryable: true, restartRegistration: null, keys: ERROR_KEYS, message: "Kimlik doğrulama dönüşü şu anda sınırlandırıldı." }),
  Object.freeze({ state: "rejected", code: "self_serve_callback_gate_unavailable", statuses: Object.freeze([503]), retryable: true, restartRegistration: null, keys: ERROR_KEYS, message: "Kimlik doğrulama güvenlik kontrolü şu anda kullanılamıyor." }),
  Object.freeze({ state: "rejected", code: "self_serve_callback_invalid", statuses: Object.freeze([400]), retryable: false, restartRegistration: null, keys: ERROR_KEYS, message: "Kimlik doğrulama dönüşü geçerli değil." }),
  Object.freeze({ state: "rejected", code: "self_serve_callback_query_too_large", statuses: Object.freeze([413]), retryable: false, restartRegistration: null, keys: ERROR_KEYS, message: "Kimlik doğrulama dönüşü izin verilen boyutu aşıyor." }),
  Object.freeze({ state: "rejected", code: "self_serve_oidc_provider_rejected", statuses: Object.freeze([400]), retryable: false, restartRegistration: null, keys: ERROR_KEYS, message: "Kimlik sağlayıcı kayıt isteğini reddetti." }),
  Object.freeze({ state: "rejected", code: "self_serve_oidc_invalid_state", statuses: Object.freeze([400]), retryable: false, restartRegistration: null, keys: ERROR_KEYS, message: "Kimlik doğrulama durumu geçerli değil." }),
  Object.freeze({ state: "rejected", code: "self_serve_oidc_state_expired", statuses: Object.freeze([410]), retryable: false, restartRegistration: null, keys: ERROR_KEYS, message: "Kimlik doğrulama durumunun süresi doldu." }),
  Object.freeze({ state: "rejected", code: "self_serve_oidc_nonce_mismatch", statuses: Object.freeze([400]), retryable: false, restartRegistration: null, keys: ERROR_KEYS, message: "Kimlik doğrulama yanıtı doğrulanamadı." }),
  Object.freeze({ state: "rejected", code: "self_serve_oidc_issuer_mismatch", statuses: Object.freeze([400]), retryable: false, restartRegistration: null, keys: ERROR_KEYS, message: "Kimlik doğrulama yanıtı doğrulanamadı." }),
  Object.freeze({ state: "rejected", code: "self_serve_oidc_audience_mismatch", statuses: Object.freeze([400]), retryable: false, restartRegistration: null, keys: ERROR_KEYS, message: "Kimlik doğrulama yanıtı doğrulanamadı." }),
  Object.freeze({ state: "rejected", code: "self_serve_oidc_invalid_callback", statuses: Object.freeze([400]), retryable: false, restartRegistration: null, keys: ERROR_KEYS, message: "Kimlik doğrulama dönüşü geçerli değil." }),
  Object.freeze({ state: "rejected", code: "self_serve_callback_unavailable", statuses: Object.freeze([503]), retryable: true, restartRegistration: null, keys: ERROR_KEYS, message: "Kimlik doğrulama işlemi güvenli şekilde tamamlanamadı." }),
  Object.freeze({ state: "failed", code: "self_serve_callback_unavailable", statuses: Object.freeze([503]), retryable: false, restartRegistration: null, keys: ERROR_KEYS, message: "Kimlik doğrulama işlemi güvenli şekilde tamamlanamadı." }),
  Object.freeze({ state: "in_progress", code: "self_serve_completion_pending", statuses: Object.freeze([202]), retryable: true, restartRegistration: null, keys: ERROR_KEYS, message: "Mağaza hazırlama işlemi sürüyor." }),
  Object.freeze({ state: "restart_required", code: "self_serve_callback_restart_required", statuses: Object.freeze([409]), retryable: false, restartRegistration: true, keys: RESTART_KEYS, message: "Kayıt işlemi güvenli şekilde yeniden başlatılmalı." }),
  Object.freeze({ state: "restart_required", code: "self_serve_oidc_provider_unavailable", statuses: Object.freeze([503]), retryable: false, restartRegistration: true, keys: RESTART_KEYS, message: "Kimlik sağlayıcı şu anda kullanılamıyor; kayıt yeniden başlatılmalı." }),
  Object.freeze({ state: "recovery_failed", code: "self_serve_callback_recovery_failed", statuses: Object.freeze([409, 503]), retryable: false, restartRegistration: null, keys: ERROR_KEYS, message: "Kimlik doğrulama dönüşü güvenli şekilde kurtarılamadı." }),
  Object.freeze({ state: "commit_unknown", code: "self_serve_completion_reconciliation_required", statuses: Object.freeze([409]), retryable: false, restartRegistration: null, keys: ERROR_KEYS, message: "Mağaza sonucu doğrulama bekliyor." }),
  Object.freeze({ state: "reconciliation_required", code: "self_serve_completion_reconciliation_required", statuses: Object.freeze([409]), retryable: false, restartRegistration: null, keys: ERROR_KEYS, message: "Mağaza sonucu doğrulama bekliyor." }),
  Object.freeze({ state: "recovery_absent", code: "self_serve_completion_reconciliation_required", statuses: Object.freeze([409]), retryable: false, restartRegistration: null, keys: ERROR_KEYS, message: "Mağaza sonucu doğrulama bekliyor." }),
  Object.freeze({ state: "completion_state_unknown", code: "self_serve_completion_state_unknown", statuses: Object.freeze([503]), retryable: false, restartRegistration: null, keys: ERROR_KEYS, message: "Mağaza hazırlama durumu şu anda doğrulanamıyor." }),
  Object.freeze({ state: "completion_failed", code: "self_serve_completion_rejected", statuses: Object.freeze([409]), retryable: false, restartRegistration: null, keys: ERROR_KEYS, message: "Mağaza hazırlama işlemi tamamlanamadı." }),
  Object.freeze({ state: "completion_rejected", code: "self_serve_completion_rejected", statuses: Object.freeze([409]), retryable: false, restartRegistration: null, keys: ERROR_KEYS, message: "Mağaza hazırlama işlemi tamamlanamadı." }),
  Object.freeze({ state: "completion_rejected", code: "self_serve_callback_unavailable", statuses: Object.freeze([503]), retryable: false, restartRegistration: null, keys: ERROR_KEYS, message: "Kimlik doğrulama işlemi güvenli şekilde tamamlanamadı." }),
]);

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}

function safeText(value: unknown, maximumLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximumLength &&
    value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
}

function exactHttps(value: unknown, hostname: string): value is string {
  if (!safeText(value, 1_024)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === hostname && !url.port && !url.username &&
      !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function validate(value: unknown, status: number): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("internal_callback_response_invalid");
  const body = value as Record<string, unknown>;
  const state = typeof body.state === "string" ? body.state : "";
  const code = typeof body.code === "string" ? body.code : null;
  const semantic = RESPONSE_MATRIX.find((entry) => entry.state === state && entry.code === code);
  if (!semantic || !semantic.statuses.includes(status) || !exactKeys(body, semantic.keys)) {
    throw new Error("internal_callback_response_invalid");
  }
  if (semantic.code === null) {
    if (
      !safeText(body.storeSlug, 63) || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(body.storeSlug) ||
      !exactHttps(body.storefrontUrl, `${body.storeSlug}.celebix.site`) || !exactHttps(body.panelUrl, "panel.celebix.site") ||
      body.provisioningStatus !== "ready" || body.session !== "pending"
    ) throw new Error("internal_callback_response_invalid");
    return {
      state: semantic.state,
      storeSlug: body.storeSlug,
      storefrontUrl: body.storefrontUrl,
      panelUrl: body.panelUrl,
      provisioningStatus: "ready",
      session: "pending",
    };
  }
  if (
    body.retryable !== semantic.retryable || body.message !== semantic.message ||
    (semantic.restartRegistration === true && body.restartRegistration !== true)
  ) throw new Error("internal_callback_response_invalid");
  return {
    code: semantic.code,
    state: semantic.state,
    retryable: semantic.retryable,
    ...(semantic.restartRegistration === true ? { restartRegistration: true } : {}),
    message: semantic.message,
  };
}

async function boundedBytes(response: Response, maximumBytes: number): Promise<Uint8Array> {
  if (!response.body) throw new Error("internal_callback_response_invalid");
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximumBytes)) {
    throw new Error("internal_callback_response_invalid");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximumBytes) throw new Error("internal_callback_response_invalid");
      chunks.push(value);
    }
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error;
  }
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export function ownerInternalCallbackJson(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function projectOwnerInternalCallbackResponse(response: Response, maximumBytes: number): Promise<Response> {
  if (!(response instanceof Response) || !Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > 65_536) {
    throw new Error("internal_callback_response_invalid");
  }
  let parsed: unknown;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(await boundedBytes(response, maximumBytes));
    parsed = JSON.parse(text);
  } catch {
    throw new Error("internal_callback_response_invalid");
  }
  const body = validate(parsed, response.status);
  return ownerInternalCallbackJson(body, response.status);
}
