const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PHASES = Object.freeze([
  "build_pending", "credentials_unverified", "evidence_pending", "running", "rejected",
  "ready_to_activate", "active",
] as const);
const CODES = Object.freeze([
  "invalid_input", "unauthenticated", "membership_denied", "store_inactive",
  "feature_not_enabled", "provider_disabled", "operation_mismatch", "profile_not_found",
  "profile_not_eligible", "profile_not_active", "version_conflict", "already_bound",
  "durable_authority_invalid", "run_not_found", "run_closed", "lease_conflict",
  "stale_evidence", "lease_lost", "case_not_found", "callback_mismatch", "timeout_mismatch",
  "evidence_incomplete", "evidence_mismatch", "single_provider_boundary_invalid",
  "method_not_found", "invalid_transition", "already_active", "attestation_not_found",
  "provider_already_active", "unavailable",
] as const);

export type IyzicoActivationState = Readonly<{
  phase: (typeof PHASES)[number];
  canBegin: boolean;
  canActivate: boolean;
  methodId: string | null;
  expectedMethodVersion: number | null;
}>;

type ErrorCode = (typeof CODES)[number];
const MESSAGES: Readonly<Record<ErrorCode, string>> = Object.freeze({
  invalid_input: "Iyzico aktivasyon isteği geçersiz.",
  unauthenticated: "Oturumunuz sona erdi.",
  membership_denied: "Bu işlem için yetkiniz yok.",
  store_inactive: "Mağaza işlemlere kapalı.",
  feature_not_enabled: "Ödeme entegrasyonları planınızda etkin değil.",
  provider_disabled: "Iyzico entegrasyonu şu anda kapalı.",
  operation_mismatch: "İşlem güvenle tekrar edilemedi.",
  profile_not_found: "Iyzico bağlantısı bulunamadı.",
  profile_not_eligible: "Iyzico test bağlantısı aktivasyona uygun değil.",
  profile_not_active: "Iyzico bağlantısı etkin değil.",
  version_conflict: "Iyzico ayarları sizden önce güncellendi.",
  already_bound: "Iyzico bağlantısı zaten başka bir çalışma kanıtına bağlı.",
  durable_authority_invalid: "Iyzico çalışma yetkisi doğrulanamadı.",
  run_not_found: "Iyzico sandbox doğrulaması bulunamadı.",
  run_closed: "Iyzico sandbox doğrulaması kapanmış.",
  lease_conflict: "Iyzico sandbox doğrulaması başka bir işleyicide.",
  stale_evidence: "Iyzico sandbox kanıtı güncel değil; testi yeniden başlatın.",
  lease_lost: "Iyzico doğrulama görevi yeniden kuyruğa alındı.",
  case_not_found: "Iyzico sandbox test senaryosu eksik.",
  callback_mismatch: "Iyzico callback tekrar testi doğrulanamadı.",
  timeout_mismatch: "Iyzico zaman aşımı kurtarma testi doğrulanamadı.",
  evidence_incomplete: "Iyzico sandbox testleri henüz tamamlanmadı.",
  evidence_mismatch: "Iyzico sandbox kanıtı beklenen çalışmayla eşleşmedi.",
  single_provider_boundary_invalid: "Tek etkin ödeme sağlayıcısı sınırı doğrulanamadı.",
  method_not_found: "Iyzico ödeme yöntemi bulunamadı.",
  invalid_transition: "Iyzico ödeme yöntemi bu durumda etkinleştirilemez.",
  already_active: "Iyzico ödeme yöntemi zaten etkin.",
  attestation_not_found: "Iyzico sandbox onayı bulunamadı.",
  provider_already_active: "Başka bir ödeme sağlayıcısı etkin. Önce onu devre dışı bırakın.",
  unavailable: "Iyzico aktivasyonu şu anda kullanılamıyor.",
});

export class IyzicoActivationApiError extends Error {
  constructor(readonly code: ErrorCode, readonly status: number) {
    super(MESSAGES[code]);
    this.name = "IyzicoActivationApiError";
  }
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function unavailable(status = 503): IyzicoActivationApiError {
  return new IyzicoActivationApiError("unavailable", status || 503);
}

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  if (Reflect.ownKeys(descriptors).length !== keys.length
    || keys.some((key) => !Object.hasOwn(descriptors, key))
    || Reflect.ownKeys(descriptors).some((key) => typeof key !== "string" || !keys.includes(key))) return null;
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
    result[key] = descriptor.value;
  }
  return result;
}

function parseState(value: unknown): IyzicoActivationState {
  const parsed = exact(value, ["phase", "canBegin", "canActivate", "methodId", "expectedMethodVersion"]);
  if (!parsed || !PHASES.includes(parsed.phase as never)
    || typeof parsed.canBegin !== "boolean" || typeof parsed.canActivate !== "boolean") throw unavailable();
  const methodId = parsed.methodId === null ? null
    : typeof parsed.methodId === "string" && UUID.test(parsed.methodId) ? parsed.methodId : undefined;
  const methodVersion = parsed.expectedMethodVersion === null ? null
    : Number.isSafeInteger(parsed.expectedMethodVersion) && (parsed.expectedMethodVersion as number) >= 1
      ? parsed.expectedMethodVersion as number : undefined;
  if (methodId === undefined || methodVersion === undefined
    || (methodId === null) !== (methodVersion === null)
    || parsed.canActivate !== (parsed.phase === "ready_to_activate")
    || parsed.canBegin !== (parsed.phase === "evidence_pending" || parsed.phase === "rejected")
    || ((parsed.phase === "ready_to_activate" || parsed.phase === "active") !== (methodId !== null))) {
    throw unavailable();
  }
  return Object.freeze({
    phase: parsed.phase as IyzicoActivationState["phase"],
    canBegin: parsed.canBegin,
    canActivate: parsed.canActivate,
    methodId,
    expectedMethodVersion: methodVersion,
  });
}

export function createIyzicoActivationApi(
  fetcher: Fetcher = fetch,
  uuid: () => string = crypto.randomUUID.bind(crypto),
) {
  async function request(path: string, init: RequestInit): Promise<IyzicoActivationState> {
    try {
      const response = await fetcher(path, { ...init, credentials: "same-origin", cache: "no-store" });
      const value = await response.json() as unknown;
      if (!response.ok) {
        const error = exact(value, ["code"]);
        const code = error && typeof error.code === "string" && CODES.includes(error.code as never)
          ? error.code as ErrorCode : "unavailable";
        throw new IyzicoActivationApiError(code, response.status);
      }
      return parseState(value);
    } catch (error) {
      if (error instanceof IyzicoActivationApiError) throw error;
      throw unavailable();
    }
  }

  function post(path: string, body: unknown): Promise<IyzicoActivationState> {
    const operation = uuid();
    if (!UUID.test(operation)) throw unavailable();
    return request(path, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": operation },
      body: JSON.stringify(body),
    });
  }

  return Object.freeze({
    current: () => request("/api/payment-providers/iyzico/sandbox-activation/current", { method: "GET" }),
    begin: () => post("/api/payment-providers/iyzico/sandbox-activation/begin", {}),
    activate: (methodId: string, expectedMethodVersion: number) => post(
      "/api/payment-providers/iyzico/sandbox-activation/activate",
      { methodId, expectedMethodVersion },
    ),
  });
}

export const iyzicoActivationApi = createIyzicoActivationApi();
