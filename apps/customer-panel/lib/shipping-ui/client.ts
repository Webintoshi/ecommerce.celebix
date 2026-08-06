import {
  parseShippingConnection,
  parseShipment,
  parseShippingQuoteSession,
  type Shipment,
  parseShippingResource,
  type ShippingConnection,
  type ShippingPackage,
  type ShippingQuoteSession,
  type ShippingResource,
} from "@celebix/saas-contracts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const TOKEN = /^[\x21-\x7e]{16,4096}$/u;
const ERROR_CODES = Object.freeze([
  "invalid_input", "unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled",
  "origin_denied", "version_conflict", "operation_mismatch", "not_found", "resource_invalid",
  "already_revoked", "commit_unknown", "unavailable",
] as const);
export type ShippingSettingsErrorCode = (typeof ERROR_CODES)[number];
const MESSAGES: Readonly<Record<ShippingSettingsErrorCode, string>> = Object.freeze({
  invalid_input: "Bilgileri kontrol edin.", unauthenticated: "Oturumunuz sona erdi.", membership_denied: "Bu işlem için yetkiniz yok.",
  store_inactive: "Mağaza etkin değil.", feature_not_enabled: "Kargo entegrasyonu planınızda etkin değil.", origin_denied: "İstek doğrulanamadı.",
  version_conflict: "Bağlantı değişti; tekrar deneyin.", operation_mismatch: "İşlem güvenle tekrar edilemedi.", not_found: "Bağlantı bulunamadı.",
  resource_invalid: "Marka veya adres seçimini kontrol edin.", already_revoked: "Bağlantı zaten kaldırılmış.",
  commit_unknown: "İşlem sonucu doğrulanamadı.", unavailable: "Kargo hizmetine şu anda ulaşılamıyor.",
});

export type ShippingSettingsWorkspace = Readonly<{
  connection: ShippingConnection | null;
  resources: readonly ShippingResource[];
}>;

export class ShippingSettingsApiError extends Error {
  constructor(readonly code: ShippingSettingsErrorCode = "unavailable", readonly status = 503) {
    super(MESSAGES[code]);
    this.name = "ShippingSettingsApiError";
  }
}

function unavailable(): never { throw new Error("shipping_settings_unavailable"); }
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) unavailable();
  const selected = value as Record<string, unknown>;
  if (Object.keys(selected).sort().join(",") !== [...keys].sort().join(",")) unavailable();
  return selected;
}

function workspace(value: unknown): ShippingSettingsWorkspace {
  const selected = record(value, ["connection", "resources"]);
  if (!Array.isArray(selected.resources) || selected.resources.length > 300) unavailable();
  try {
    const connection = selected.connection === null ? null : parseShippingConnection(selected.connection);
    const resources = Object.freeze(selected.resources.map((entry) => parseShippingResource(entry)));
    if (new Set(resources.map(({ id }) => id)).size !== resources.length) unavailable();
    return Object.freeze({ connection, resources });
  } catch { return unavailable(); }
}

async function responseJson(response: Response): Promise<unknown> {
  if (response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") unavailable();
  const declared = response.headers.get("content-length");
  if (declared && (!/^\d+$/u.test(declared) || Number(declared) > 131_072)) unavailable();
  const bytes = new Uint8Array(await response.arrayBuffer());
  try {
    if (bytes.byteLength < 2 || bytes.byteLength > 131_072) unavailable();
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch { return unavailable(); }
  finally { bytes.fill(0); }
}

function errorCode(value: unknown): ShippingSettingsErrorCode {
  try {
    const code = record(value, ["code"]).code;
    return typeof code === "string" && ERROR_CODES.includes(code as ShippingSettingsErrorCode) ? code as ShippingSettingsErrorCode : "unavailable";
  } catch { return "unavailable"; }
}

export function createShippingSettingsApi(fetcher: typeof fetch = fetch, uuid: () => string = crypto.randomUUID.bind(crypto)) {
  async function request(path: string, init?: RequestInit): Promise<ShippingSettingsWorkspace> {
    let response: Response;
    try { response = await fetcher(path, { credentials: "same-origin", cache: "no-store", ...init }); }
    catch { throw new ShippingSettingsApiError(); }
    const value = await responseJson(response);
    if (!response.ok) throw new ShippingSettingsApiError(errorCode(value), response.status);
    return workspace(value);
  }
  function operationId(): string {
    const value = uuid();
    if (!UUID.test(value)) throw new ShippingSettingsApiError("invalid_input", 400);
    return value;
  }
  function mutation(path: string, method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>, signal?: AbortSignal) {
    return request(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify({ operationId: operationId(), ...body }), signal });
  }
  return Object.freeze({
    current(signal?: AbortSignal) { return request("/api/settings/shipping/connection", { signal }); },
    saveConnection(token: string, signal?: AbortSignal) {
      if (typeof token !== "string" || !TOKEN.test(token)) throw new ShippingSettingsApiError("invalid_input", 400);
      return mutation("/api/settings/shipping/connection", "POST", { token }, signal);
    },
    selectResources(input: Readonly<{ brandResourceId: string; addressResourceId: string; codDeliveredMarksPaid: boolean }>, signal?: AbortSignal) {
      if (!input || !UUID.test(input.brandResourceId) || !UUID.test(input.addressResourceId) || typeof input.codDeliveredMarksPaid !== "boolean") throw new ShippingSettingsApiError("invalid_input", 400);
      return mutation("/api/settings/shipping/connection/resources", "PATCH", { ...input }, signal);
    },
    revoke(signal?: AbortSignal) { return mutation("/api/settings/shipping/connection/revoke", "DELETE", {}, signal); },
  });
}

export const shippingSettingsApi = createShippingSettingsApi();

const QUOTE_CREDENTIAL = /^[A-Za-z0-9_-]{32,512}$/u;
const FULFILLMENT_ERROR_CODES = Object.freeze([
  ...ERROR_CODES,
  "order_not_found", "order_version_mismatch", "order_not_fulfillable", "currency_unsupported",
  "provider_not_ready", "quote_not_found", "quote_expired", "quote_not_ready", "option_invalid",
  "shipment_exists", "operation_not_found",
] as const);
type ShippingFulfillmentErrorCode = (typeof FULFILLMENT_ERROR_CODES)[number];
const FULFILLMENT_MESSAGES: Readonly<Record<ShippingFulfillmentErrorCode, string>> = Object.freeze({
  ...MESSAGES,
  order_not_found: "Sipariş bulunamadı.", order_version_mismatch: "Sipariş değişti; yeniden yükleyin.",
  order_not_fulfillable: "Bu sipariş kargoya uygun değil.", currency_unsupported: "Para birimi desteklenmiyor.",
  provider_not_ready: "Önce Basit Kargo bağlantısını tamamlayın.", quote_not_found: "Kargo teklifi bulunamadı.",
  quote_expired: "Kargo teklifi sona erdi; yeniden fiyat alın.", quote_not_ready: "Kargo teklifi henüz hazır değil.",
  option_invalid: "Kargo seçeneği geçerli değil.", shipment_exists: "Bu sipariş için kargo zaten oluşturulmuş.",
  operation_not_found: "İşlem bulunamadı.",
});

export class ShippingFulfillmentApiError extends Error {
  constructor(readonly code: ShippingFulfillmentErrorCode = "unavailable", readonly status = 503) {
    super(FULFILLMENT_MESSAGES[code]);
    this.name = "ShippingFulfillmentApiError";
  }
}

function fulfillmentCode(value: unknown): ShippingFulfillmentErrorCode {
  try {
    const code = record(value, ["code"]).code;
    return typeof code === "string" && FULFILLMENT_ERROR_CODES.includes(code as ShippingFulfillmentErrorCode)
      ? code as ShippingFulfillmentErrorCode
      : "unavailable";
  } catch { return "unavailable"; }
}

function packageInput(value: ShippingPackage): Readonly<ShippingPackage> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "depthCm,heightCm,weightKg,widthCm") throw new ShippingFulfillmentApiError("invalid_input", 400);
  const dimensions = [value.heightCm, value.widthCm, value.depthCm, value.weightKg];
  if (dimensions.some((entry) => typeof entry !== "number" || !Number.isFinite(entry) || entry < 0.001 || entry > 10_000)) throw new ShippingFulfillmentApiError("invalid_input", 400);
  return Object.freeze({ heightCm: value.heightCm, widthCm: value.widthCm, depthCm: value.depthCm, weightKg: value.weightKg });
}

export function createShippingFulfillmentApi(fetcher: typeof fetch = fetch, uuid: () => string = crypto.randomUUID.bind(crypto)) {
  function operationId(): string {
    const value = uuid();
    if (!UUID.test(value)) throw new ShippingFulfillmentApiError("invalid_input", 400);
    return value;
  }
  async function request(path: string, init?: RequestInit): Promise<unknown> {
    let response: Response;
    try { response = await fetcher(path, { credentials: "same-origin", cache: "no-store", ...init }); }
    catch { throw new ShippingFulfillmentApiError(); }
    const value = await responseJson(response);
    if (!response.ok) throw new ShippingFulfillmentApiError(fulfillmentCode(value), response.status);
    return value;
  }
  function path(orderId: string, suffix: string): string {
    if (!UUID.test(orderId)) throw new ShippingFulfillmentApiError("invalid_input", 400);
    return `/api/orders/${orderId}/shipping/${suffix}`;
  }
  function mutation(selectedPath: string, body: Record<string, unknown>, signal?: AbortSignal) {
    return request(selectedPath, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operationId: operationId(), ...body }), signal,
    });
  }
  return Object.freeze({
    async quote(orderId: string, expectedOrderVersion: number, packages: readonly ShippingPackage[], signal?: AbortSignal): Promise<ShippingQuoteSession> {
      if (!Number.isSafeInteger(expectedOrderVersion) || expectedOrderVersion < 1 || !Array.isArray(packages) || packages.length < 1 || packages.length > 20) throw new ShippingFulfillmentApiError("invalid_input", 400);
      const value = await mutation(path(orderId, "quotes"), { expectedOrderVersion, packages: packages.map(packageInput) }, signal);
      try { return parseShippingQuoteSession(record(value, ["quote"]).quote); } catch { throw new ShippingFulfillmentApiError(); }
    },
    async createShipment(orderId: string, expectedOrderVersion: number, quoteCredential: string, optionId: string, signal?: AbortSignal): Promise<Shipment> {
      if (!Number.isSafeInteger(expectedOrderVersion) || expectedOrderVersion < 1 || !QUOTE_CREDENTIAL.test(quoteCredential) || !UUID.test(optionId)) throw new ShippingFulfillmentApiError("invalid_input", 400);
      const value = await mutation(path(orderId, "shipments"), { expectedOrderVersion, quoteCredential, optionId }, signal);
      try { return parseShipment(record(value, ["shipment"]).shipment); } catch { throw new ShippingFulfillmentApiError(); }
    },
    async shipment(orderId: string, shipmentId: string, signal?: AbortSignal): Promise<Shipment> {
      if (!UUID.test(shipmentId)) throw new ShippingFulfillmentApiError("invalid_input", 400);
      const value = await request(path(orderId, `shipments/${shipmentId}`), { signal });
      try { return parseShipment(record(value, ["shipment"]).shipment); } catch { throw new ShippingFulfillmentApiError(); }
    },
    async currentShipmentForOrder(orderId: string, signal?: AbortSignal): Promise<Shipment | null> {
      const value = await request(path(orderId, "shipments"), { signal });
      try {
        const selected = record(value, ["shipment"]).shipment;
        return selected === null ? null : parseShipment(selected);
      } catch { throw new ShippingFulfillmentApiError(); }
    },
  });
}

export const shippingFulfillmentApi = createShippingFulfillmentApi();
