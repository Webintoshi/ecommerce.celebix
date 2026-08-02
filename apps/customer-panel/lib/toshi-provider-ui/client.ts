import {
  TOSHI_PROVIDERS,
  parseToshiProviderConnection,
  parseToshiProviderConnectionList,
  type ToshiProvider,
  type ToshiProviderConnection,
} from "@celebix/saas-contracts";

const BASE = "/api/settings/artificial-intelligence/providers";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const API_KEY = /^[\x21-\x7e]{1,16384}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const MAXIMUM_RESPONSE_BYTES = 65_536;

export const TOSHI_PROVIDER_API_ERROR_CODES = Object.freeze([
  "invalid_input", "unauthenticated", "membership_denied", "origin_denied",
  "store_inactive", "feature_not_enabled", "credential_invalid", "model_unavailable",
  "rate_limited", "quota_exceeded", "provider_timeout", "provider_unavailable",
  "version_conflict", "operation_mismatch", "operation_not_found",
  "durable_authority_invalid", "unavailable",
] as const);

export type ToshiProviderApiErrorCode = (typeof TOSHI_PROVIDER_API_ERROR_CODES)[number];

const MESSAGES: Readonly<Record<ToshiProviderApiErrorCode, string>> = Object.freeze({
  invalid_input: "Bilgileri kontrol edin.",
  unauthenticated: "Oturumunuz sona erdi. Yeniden giriş yapın.",
  membership_denied: "Bu işlem için yetkiniz yok.",
  origin_denied: "Güvenlik doğrulaması başarısız oldu.",
  store_inactive: "Mağaza şu anda aktif değil.",
  feature_not_enabled: "Bu özellik planınızda etkin değil.",
  credential_invalid: "API anahtarı doğrulanamadı.",
  model_unavailable: "Kullanılabilir bir model bulunamadı.",
  rate_limited: "Sağlayıcı istek sınırına ulaştı. Biraz sonra tekrar deneyin.",
  quota_exceeded: "Sağlayıcı kotası doldu.",
  provider_timeout: "Sağlayıcı zamanında yanıt vermedi.",
  provider_unavailable: "Sağlayıcıya şu anda ulaşılamıyor.",
  version_conflict: "Ayar başka bir oturumda değişti. Sayfa yenilendi.",
  operation_mismatch: "İşlem güvenle tekrarlanamadı.",
  operation_not_found: "İşlem kaydı bulunamadı.",
  durable_authority_invalid: "Mağaza yetkisi yenilenmeli.",
  unavailable: "İşlem şu anda tamamlanamadı.",
});

export class ToshiProviderApiError extends Error {
  readonly code: ToshiProviderApiErrorCode;

  constructor(code: ToshiProviderApiErrorCode = "unavailable") {
    super(MESSAGES[code]);
    this.name = "ToshiProviderApiError";
    this.code = code;
  }
}

export interface ToshiProviderApi {
  list(signal?: AbortSignal): Promise<readonly ToshiProviderConnection[]>;
  connect(provider: ToshiProvider, input: Readonly<{ apiKey: string; expectedVersion: number }>, signal?: AbortSignal): Promise<ToshiProviderConnection>;
  selectModel(provider: ToshiProvider, input: Readonly<{ model: string; expectedVersion: number }>, signal?: AbortSignal): Promise<ToshiProviderConnection>;
  setDefault(provider: ToshiProvider, expectedVersion: number, signal?: AbortSignal): Promise<ToshiProviderConnection>;
  revoke(provider: ToshiProvider, expectedVersion: number, signal?: AbortSignal): Promise<ToshiProviderConnection>;
}

function invalid(): never { throw new ToshiProviderApiError("invalid_input"); }

function selectedProvider(value: unknown): ToshiProvider {
  if (!TOSHI_PROVIDERS.includes(value as never)) invalid();
  return value as ToshiProvider;
}

function version(value: unknown, minimum: 0 | 1): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) invalid();
  return value as number;
}

function operation(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) invalid();
  return value;
}

async function responseJson(response: Response): Promise<unknown> {
  if (!(response instanceof Response) || !(response.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) throw new ToshiProviderApiError();
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAXIMUM_RESPONSE_BYTES)) throw new ToshiProviderApiError();
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAXIMUM_RESPONSE_BYTES) { bytes.fill(0); throw new ToshiProviderApiError(); }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown; }
  catch { throw new ToshiProviderApiError(); }
  finally { bytes.fill(0); }
}

function errorCode(value: unknown): ToshiProviderApiErrorCode {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return "unavailable";
  const keys = Object.keys(value);
  const code = (value as Record<string, unknown>).code;
  return keys.length === 1 && TOSHI_PROVIDER_API_ERROR_CODES.includes(code as never)
    ? code as ToshiProviderApiErrorCode
    : "unavailable";
}

export function createToshiProviderApi(
  fetcher: typeof fetch = fetch,
  uuid: () => string = crypto.randomUUID.bind(crypto),
): ToshiProviderApi {
  if (typeof fetcher !== "function" || typeof uuid !== "function") invalid();

  async function request<T>(path: string, parser: (value: unknown) => T, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetcher(path, Object.freeze({ credentials: "same-origin", cache: "no-store", ...init }));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      throw new ToshiProviderApiError();
    }
    const value = await responseJson(response);
    if (!response.ok) throw new ToshiProviderApiError(errorCode(value));
    try { return parser(value); } catch (error) {
      if (error instanceof ToshiProviderApiError) throw error;
      throw new ToshiProviderApiError();
    }
  }

  function mutate(
    method: "POST" | "PATCH" | "DELETE",
    path: string,
    value: unknown,
    signal?: AbortSignal,
  ): Promise<ToshiProviderConnection> {
    const id = operation(uuid());
    return request(path, parseToshiProviderConnection, {
      method,
      headers: Object.freeze({ "content-type": "application/json", "idempotency-key": id }),
      body: JSON.stringify(value),
      signal,
    });
  }

  return Object.freeze({
    list(signal?: AbortSignal) {
      return request(BASE, (value) => parseToshiProviderConnectionList(value).items, { method: "GET", signal });
    },
    connect(providerValue: ToshiProvider, input: Readonly<{ apiKey: string; expectedVersion: number }>, signal?: AbortSignal) {
      const provider = selectedProvider(providerValue);
      if (typeof input !== "object" || input === null || Object.keys(input).sort().join(",") !== "apiKey,expectedVersion" || typeof input.apiKey !== "string" || !API_KEY.test(input.apiKey)) invalid();
      return mutate("POST", `${BASE}/${provider}/connect`, { apiKey: input.apiKey, expectedVersion: version(input.expectedVersion, 0) }, signal);
    },
    selectModel(providerValue: ToshiProvider, input: Readonly<{ model: string; expectedVersion: number }>, signal?: AbortSignal) {
      const provider = selectedProvider(providerValue);
      if (typeof input !== "object" || input === null || Object.keys(input).sort().join(",") !== "expectedVersion,model" || typeof input.model !== "string" || input.model.length < 1 || input.model !== input.model.trim() || CONTROL.test(input.model) || new TextEncoder().encode(input.model).byteLength > 160) invalid();
      return mutate("PATCH", `${BASE}/${provider}/model`, { selectedModel: input.model, expectedVersion: version(input.expectedVersion, 1) }, signal);
    },
    setDefault(providerValue: ToshiProvider, expectedVersion: number, signal?: AbortSignal) {
      const provider = selectedProvider(providerValue);
      return mutate("POST", `${BASE}/${provider}/default`, { expectedVersion: version(expectedVersion, 1) }, signal);
    },
    revoke(providerValue: ToshiProvider, expectedVersion: number, signal?: AbortSignal) {
      const provider = selectedProvider(providerValue);
      return mutate("DELETE", `${BASE}/${provider}`, { expectedVersion: version(expectedVersion, 1) }, signal);
    },
  });
}
