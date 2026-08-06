import {
  parseShippingConnection,
  parseShippingResource,
  type ShippingConnection,
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
