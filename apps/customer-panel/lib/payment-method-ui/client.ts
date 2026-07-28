import {
  parseMerchantPaymentMethod,
  parsePaymentMethodMutationResult,
  parsePaymentMethodReorderResult,
  parsePaymentProviderCatalog,
  type MerchantAdminJson,
  type MerchantPaymentMethod,
  type PaymentMethodKind,
  type PaymentMethodMutationResult,
  type PaymentMethodReorderResult,
  type PaymentMethodState,
  type PaymentProviderCatalogEntry,
} from "@celebix/saas-contracts";

const MAX_RESPONSE_BYTES = 524_288;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SAFE_CODES = Object.freeze([
  "invalid_input", "unauthenticated", "membership_denied", "store_inactive",
  "feature_not_enabled", "profile_not_found", "profile_not_active",
  "provider_capability_mismatch", "record_not_found", "invalid_transition",
  "version_conflict", "provider_already_active", "method_already_exists", "operation_mismatch", "operation_not_found",
  "durable_authority_invalid", "unavailable",
] as const);
type PaymentMethodApiErrorCode = (typeof SAFE_CODES)[number];

const MESSAGES: Readonly<Record<PaymentMethodApiErrorCode, string>> = Object.freeze({
  invalid_input: "Gönderilen ödeme yöntemi bilgileri geçersiz.",
  unauthenticated: "Oturumunuz sona erdi.",
  membership_denied: "Bu işlem için yetkiniz yok.",
  store_inactive: "Mağaza işlemlere kapalı.",
  feature_not_enabled: "Ödeme ayarları planınızda etkin değil.",
  profile_not_found: "Ödeme sağlayıcısı bağlantısı bulunamadı.",
  profile_not_active: "Ödeme sağlayıcısı bağlantısı etkin değil.",
  provider_capability_mismatch: "Sağlayıcı bu ödeme yöntemini desteklemiyor.",
  record_not_found: "Ödeme yöntemi bulunamadı.",
  invalid_transition: "Bu durum değişikliği artık uygulanamaz.",
  version_conflict: "Ödeme ayarları sizden önce güncellendi.",
  provider_already_active: "Başka bir ödeme sağlayıcısı zaten etkin. Önce etkin sağlayıcıyı devre dışı bırakın.",
  method_already_exists: "Bu ödeme yöntemi zaten mevcut.",
  operation_mismatch: "İşlem güvenle tekrar edilemedi.",
  operation_not_found: "İşlem kanıtı bulunamadı.",
  durable_authority_invalid: "Yetki yeniden doğrulanamadı.",
  unavailable: "Ödeme ayarları şu anda kullanılamıyor.",
});

export interface SavePaymentMethodCommand {
  readonly methodId: string;
  readonly expectedVersion: number;
  readonly kind: PaymentMethodKind;
  readonly profileId: string | null;
  readonly providerCode: string | null;
  readonly label: string;
  readonly config: Readonly<Record<string, MerchantAdminJson>>;
}

export interface SetPaymentMethodStateCommand {
  readonly expectedVersion: number;
  readonly state: PaymentMethodState;
  readonly emergencyReason: string | null;
}

export interface PaymentMethodOrderCommand {
  readonly id: string;
  readonly expectedVersion: number;
  readonly position: number;
}

export class PaymentMethodApiError extends Error {
  constructor(
    readonly code: PaymentMethodApiErrorCode,
    readonly status: number,
  ) {
    super(MESSAGES[code]);
    this.name = "PaymentMethodApiError";
  }
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function unavailable(status = 503): PaymentMethodApiError {
  return new PaymentMethodApiError("unavailable", status || 503);
}

function operationId(value: string): string {
  if (!UUID.test(value)) throw unavailable();
  return value;
}

function methodId(value: string): string {
  if (!UUID.test(value)) throw unavailable();
  return value;
}

function exactDataObject(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
    const actual = Reflect.ownKeys(descriptors);
    if (
      actual.length !== keys.length
      || actual.some((key) => typeof key !== "string" || !keys.includes(key))
      || keys.some((key) => !Object.hasOwn(descriptors, key))
    ) return null;
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of actual) {
      if (typeof key !== "string") return null;
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
      result[key] = descriptor.value;
    }
    return result;
  } catch {
    return null;
  }
}

function denseArray(value: unknown, maximum: number): readonly unknown[] | null {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
    if (Reflect.ownKeys(descriptors).length !== value.length + 1) return null;
    const result: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
      result.push(descriptor.value);
    }
    return result;
  } catch {
    return null;
  }
}

async function readJson(response: Response): Promise<unknown> {
  const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  const length = response.headers.get("content-length");
  if (
    mediaType !== "application/json"
    || (length !== null && (!/^(?:0|[1-9]\d*)$/.test(length) || Number(length) > MAX_RESPONSE_BYTES))
    || response.body === null
  ) throw unavailable(response.status);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let joined: Uint8Array | undefined;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw unavailable(response.status);
      }
      chunks.push(new Uint8Array(next.value));
    }
    if (total < 2) throw unavailable(response.status);
    joined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(joined));
  } catch (error) {
    if (error instanceof PaymentMethodApiError) throw error;
    throw unavailable(response.status);
  } finally {
    joined?.fill(0);
    for (const chunk of chunks) chunk.fill(0);
  }
}

function safeCode(value: unknown): PaymentMethodApiErrorCode {
  const parsed = exactDataObject(value, ["code"]);
  return parsed && typeof parsed.code === "string" && SAFE_CODES.includes(parsed.code as PaymentMethodApiErrorCode)
    ? parsed.code as PaymentMethodApiErrorCode
    : "unavailable";
}

function itemArray(value: unknown): readonly unknown[] {
  const parsed = exactDataObject(value, ["items"]);
  const items = parsed ? denseArray(parsed.items, 100) : null;
  if (items === null) throw unavailable();
  return items;
}

export function createPaymentMethodApi(
  fetcher: Fetcher = fetch,
  uuid: () => string = crypto.randomUUID.bind(crypto),
): Readonly<{
  catalog(): Promise<readonly PaymentProviderCatalogEntry[]>;
  list(): Promise<readonly MerchantPaymentMethod[]>;
  save(input: SavePaymentMethodCommand): Promise<PaymentMethodMutationResult>;
  setState(methodId: string, input: SetPaymentMethodStateCommand): Promise<PaymentMethodMutationResult>;
  reorder(items: readonly PaymentMethodOrderCommand[]): Promise<PaymentMethodReorderResult>;
}> {
  async function request(path: string, init: RequestInit): Promise<unknown> {
    try {
      const response = await fetcher(path, {
        ...init,
        credentials: "same-origin",
        cache: "no-store",
      });
      const value = await readJson(response);
      if (!response.ok) throw new PaymentMethodApiError(safeCode(value), response.status);
      return value;
    } catch (error) {
      if (error instanceof PaymentMethodApiError) throw error;
      throw unavailable();
    }
  }

  function get(path: string): Promise<unknown> {
    return request(path, { method: "GET" });
  }

  function post(path: string, value: unknown): Promise<unknown> {
    const key = operationId(uuid());
    let body: string;
    try { body = JSON.stringify(value); } catch { throw unavailable(); }
    return request(path, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": key },
      body,
    });
  }

  function mutation(value: unknown): PaymentMethodMutationResult {
    try { return parsePaymentMethodMutationResult(value); } catch { throw unavailable(); }
  }

  return Object.freeze({
    async catalog(): Promise<readonly PaymentProviderCatalogEntry[]> {
      try { return parsePaymentProviderCatalog(itemArray(await get("/api/payment-providers/catalog"))); }
      catch (error) { if (error instanceof PaymentMethodApiError) throw error; throw unavailable(); }
    },
    async list(): Promise<readonly MerchantPaymentMethod[]> {
      try { return Object.freeze(itemArray(await get("/api/payment-methods")).map(parseMerchantPaymentMethod)); }
      catch (error) { if (error instanceof PaymentMethodApiError) throw error; throw unavailable(); }
    },
    async save(input: SavePaymentMethodCommand): Promise<PaymentMethodMutationResult> {
      return mutation(await post("/api/payment-methods", input));
    },
    async setState(id: string, input: SetPaymentMethodStateCommand): Promise<PaymentMethodMutationResult> {
      const selected = methodId(id);
      const result = mutation(await post(`/api/payment-methods/${selected}/state`, input));
      if (result.id !== selected || result.state !== input.state) throw unavailable();
      return result;
    },
    async reorder(items: readonly PaymentMethodOrderCommand[]): Promise<PaymentMethodReorderResult> {
      try { return parsePaymentMethodReorderResult(await post("/api/payment-methods/reorder", { items })); }
      catch (error) { if (error instanceof PaymentMethodApiError) throw error; throw unavailable(); }
    },
  });
}

export const paymentMethodApi = createPaymentMethodApi();
