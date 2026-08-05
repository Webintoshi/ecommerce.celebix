import type { StoreDomainDnsInstruction, StoreDomainUiStatus, StoreDomainView } from "@celebix/saas-contracts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const STATUSES = Object.freeze(["dns_pending", "hostname_pending", "ssl_pending", "origin_pending", "active", "action_required", "disabled"] as const);
const ERROR_CODES = Object.freeze([
  "invalid_input", "unauthenticated", "forbidden", "feature_not_enabled", "limit_reached",
  "hostname_already_claimed", "stale_version", "not_found", "operation_mismatch", "provider_unavailable", "unavailable",
] as const);
export type StoreDomainApiErrorCode = (typeof ERROR_CODES)[number];
const MESSAGES: Readonly<Record<StoreDomainApiErrorCode, string>> = Object.freeze({
  invalid_input: "Alan adını kontrol edin.", unauthenticated: "Oturumunuz sona erdi.", forbidden: "Bu işlem için yetkiniz yok.",
  feature_not_enabled: "Özel alan adı planınızda etkin değil.", limit_reached: "Alan adı sınırına ulaştınız.",
  hostname_already_claimed: "Bu alan adı başka bir mağazada kullanılıyor.", stale_version: "Alan adı güncellendi; tekrar deneyin.",
  not_found: "Alan adı bulunamadı.", operation_mismatch: "İşlem güvenle tekrar edilemedi.",
  provider_unavailable: "Alan adı hizmetine şu anda ulaşılamıyor.", unavailable: "Alan adı hizmetine şu anda ulaşılamıyor.",
});

export class StoreDomainApiError extends Error {
  constructor(readonly code: StoreDomainApiErrorCode = "unavailable", readonly status = 503) {
    super(MESSAGES[code]);
    this.name = "StoreDomainApiError";
  }
}

function record(value: unknown, keys?: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new StoreDomainApiError();
  const selected = value as Record<string, unknown>;
  if (keys && Object.keys(selected).sort().join(",") !== [...keys].sort().join(",")) throw new StoreDomainApiError();
  return selected;
}
function text(value: unknown, maximum: number): string {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || value !== value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) throw new StoreDomainApiError();
  return value;
}
function timestamp(value: unknown): string {
  const selected = text(value, 64);
  try { if (new Date(selected).toISOString() !== selected) throw new Error(); } catch { throw new StoreDomainApiError(); }
  return selected;
}
function identifier(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new StoreDomainApiError();
  return value;
}
function positive(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new StoreDomainApiError();
  return value as number;
}
function dns(value: unknown): StoreDomainDnsInstruction {
  const selected = record(value, ["type", "name", "value"]);
  if (selected.type !== "CNAME" && selected.type !== "TXT") throw new StoreDomainApiError();
  return Object.freeze({ type: selected.type, name: text(selected.name, 253), value: text(selected.value, 1_024) });
}
function parseDomain(value: unknown): StoreDomainView {
  const selected = record(value, ["schemaVersion", "id", "hostname", "hostnameType", "status", "primary", "uiStatus", "dnsInstructions", "verifiedAt", "version", "createdAt", "updatedAt"]);
  if (selected.schemaVersion !== 1 || typeof selected.hostname !== "string" || selected.hostname.length > 253 || !HOSTNAME.test(selected.hostname)
      || (selected.hostnameType !== "platform_subdomain" && selected.hostnameType !== "custom_domain")
      || (selected.status !== "pending" && selected.status !== "active" && selected.status !== "disabled")
      || typeof selected.primary !== "boolean" || !STATUSES.includes(selected.uiStatus as StoreDomainUiStatus)
      || !Array.isArray(selected.dnsInstructions) || selected.dnsInstructions.length > 8
      || (selected.verifiedAt !== null && typeof selected.verifiedAt !== "string")) throw new StoreDomainApiError();
  return Object.freeze({
    schemaVersion: 1,
    id: identifier(selected.id),
    hostname: selected.hostname,
    hostnameType: selected.hostnameType,
    status: selected.status,
    primary: selected.primary,
    uiStatus: selected.uiStatus as StoreDomainUiStatus,
    dnsInstructions: Object.freeze(selected.dnsInstructions.map(dns)),
    verifiedAt: selected.verifiedAt === null ? null : timestamp(selected.verifiedAt),
    version: positive(selected.version),
    createdAt: timestamp(selected.createdAt),
    updatedAt: timestamp(selected.updatedAt),
  }) as StoreDomainView;
}
async function responseJson(response: Response): Promise<unknown> {
  if (response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") throw new StoreDomainApiError("unavailable", response.status || 503);
  const declared = response.headers.get("content-length");
  if (declared && (!/^\d+$/u.test(declared) || Number(declared) > 131_072)) throw new StoreDomainApiError();
  let bytes: Uint8Array;
  try { bytes = new Uint8Array(await response.arrayBuffer()); } catch { throw new StoreDomainApiError(); }
  if (bytes.byteLength < 2 || bytes.byteLength > 131_072) { bytes.fill(0); throw new StoreDomainApiError(); }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new StoreDomainApiError(); }
  finally { bytes.fill(0); }
}
function errorCode(value: unknown): StoreDomainApiErrorCode {
  try {
    const code = record(value, ["code"]).code;
    return typeof code === "string" && ERROR_CODES.includes(code as StoreDomainApiErrorCode) ? code as StoreDomainApiErrorCode : "unavailable";
  } catch { return "unavailable"; }
}

export function createStoreDomainApiClient(fetcher: typeof fetch = fetch, uuid: () => string = crypto.randomUUID.bind(crypto)) {
  async function request(path: string, init?: RequestInit): Promise<unknown> {
    let response: Response;
    try { response = await fetcher(path, { credentials: "same-origin", cache: "no-store", ...init }); }
    catch { throw new StoreDomainApiError(); }
    const value = await responseJson(response);
    if (!response.ok) throw new StoreDomainApiError(errorCode(value), response.status);
    return value;
  }
  function mutation(path: string, method: "POST" | "DELETE", body: unknown): Promise<StoreDomainView> {
    const operationId = uuid();
    if (!UUID.test(operationId)) throw new StoreDomainApiError("invalid_input", 400);
    return request(path, { method, headers: { "content-type": "application/json", "idempotency-key": operationId }, body: JSON.stringify(body) })
      .then((value) => parseDomain(record(value, ["domain"]).domain));
  }
  function version(value: number): number {
    if (!Number.isSafeInteger(value) || value < 1) throw new StoreDomainApiError("invalid_input", 400);
    return value;
  }
  function domainId(value: string): string {
    if (!UUID.test(value)) throw new StoreDomainApiError("invalid_input", 400);
    return value;
  }
  return Object.freeze({
    async list(): Promise<readonly StoreDomainView[]> {
      const value = record(await request("/api/store-domains"), ["items"]);
      if (!Array.isArray(value.items) || value.items.length > 16) throw new StoreDomainApiError();
      return Object.freeze(value.items.map(parseDomain));
    },
    create(value: string) {
      const hostname = typeof value === "string" ? value.trim().toLowerCase() : "";
      if (!HOSTNAME.test(hostname) || hostname.length > 253) throw new StoreDomainApiError("invalid_input", 400);
      return mutation("/api/store-domains", "POST", { hostname });
    },
    recheck(id: string, expectedVersion: number) { return mutation(`/api/store-domains/${domainId(id)}/recheck`, "POST", { expectedVersion: version(expectedVersion) }); },
    makePrimary(id: string, expectedVersion: number) { return mutation(`/api/store-domains/${domainId(id)}/primary`, "POST", { expectedVersion: version(expectedVersion) }); },
    remove(id: string, expectedVersion: number) { return mutation(`/api/store-domains/${domainId(id)}`, "DELETE", { expectedVersion: version(expectedVersion) }); },
  });
}

export const storeDomainApi = createStoreDomainApiClient();
