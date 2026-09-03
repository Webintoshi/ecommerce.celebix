import {
  ABANDONED_CART_SORTS,
  ABANDONED_CART_STATUSES,
  parseAbandonedCartDetail,
  parseAbandonedCartListItem,
  parseAbandonedCartMutationResult,
  parseAbandonedCartSummary,
  type AbandonedCartDetail,
  type AbandonedCartListItem,
  type AbandonedCartMutationResult,
  type AbandonedCartSort,
  type AbandonedCartStatus,
  type AbandonedCartSummary,
} from "@celebix/saas-contracts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CURSOR = /^[A-Za-z0-9_-]{1,1024}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const ERROR_CODES = Object.freeze(["invalid_input", "unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled", "cart_not_found", "invalid_transition", "version_conflict", "operation_replayed", "operation_mismatch", "durable_authority_invalid", "unavailable"] as const);
export type AbandonedCartApiErrorCode = (typeof ERROR_CODES)[number];
const MESSAGES: Readonly<Record<AbandonedCartApiErrorCode, string>> = Object.freeze({ invalid_input: "Gönderilen sepet bilgileri geçersiz.", unauthenticated: "Oturumunuz sona erdi. Yeniden giriş yapın.", membership_denied: "Bu sepet işlemi için yetkiniz yok.", store_inactive: "Mağaza şu anda sepet işlemlerine kapalı.", feature_not_enabled: "Terk edilen sepet yönetimi planınızda etkin değil.", cart_not_found: "Sepet bulunamadı veya artık erişilemiyor.", invalid_transition: "Bu sepet durumu değiştirilemiyor.", version_conflict: "Sepet başka bir işlem tarafından güncellendi.", operation_replayed: "Bu işlem daha önce tamamlandı.", operation_mismatch: "İşlem güvenli biçimde tekrar edilemedi.", durable_authority_invalid: "Sepet yetkisi yeniden doğrulanamadı.", unavailable: "Terk edilen sepet hizmeti şu anda kullanılamıyor." });

export class AbandonedCartApiError extends Error {
  readonly code: AbandonedCartApiErrorCode; readonly status: number;
  constructor(code: AbandonedCartApiErrorCode, status: number) { super(MESSAGES[code]); this.name = "AbandonedCartApiError"; this.code = code; this.status = status; }
}

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type Options = Readonly<{ fetch?: Fetch; randomUUID?: () => string }>;
export type AbandonedCartListResult = Readonly<{ items: readonly AbandonedCartListItem[]; nextCursor?: string }>;

function invalid(): never { throw new TypeError("abandoned_cart_client_invalid"); }
function record(value: unknown): Record<string, unknown> | null { if (typeof value !== "object" || value === null || Array.isArray(value)) return null; const prototype = Object.getPrototypeOf(value); return prototype === Object.prototype || prototype === null ? value as Record<string, unknown> : null; }
function exactOptions(value: unknown): Options { const parsed = record(value); if (parsed === null || Object.keys(parsed).some((key) => !["fetch", "randomUUID"].includes(key)) || (parsed.fetch !== undefined && typeof parsed.fetch !== "function") || (parsed.randomUUID !== undefined && typeof parsed.randomUUID !== "function")) invalid(); return parsed as Options; }
function identifier(value: unknown): string { if (typeof value !== "string" || !UUID.test(value)) invalid(); return value; }
function version(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 1) invalid(); return value as number; }
function apiCode(value: unknown): AbandonedCartApiErrorCode { const parsed = record(value); return parsed !== null && typeof parsed.code === "string" && ERROR_CODES.includes(parsed.code as AbandonedCartApiErrorCode) ? parsed.code as AbandonedCartApiErrorCode : "unavailable"; }

export function createAbandonedCartApiClient(rawOptions: Options = {}) {
  const options = exactOptions(rawOptions);
  const fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
  const randomUUID = options.randomUUID ?? (() => crypto.randomUUID());
  async function request(path: string, init: RequestInit): Promise<unknown> {
    let response: Response; try { response = await fetchImpl(path, init); } catch { throw new AbandonedCartApiError("unavailable", 503); }
    if (response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") throw new AbandonedCartApiError("unavailable", 503);
    let body: unknown; try { body = await response.json(); } catch { throw new AbandonedCartApiError("unavailable", 503); }
    if (!response.ok) throw new AbandonedCartApiError(apiCode(body), response.status);
    return body;
  }
  function safe<T>(parser: () => T): T { try { return parser(); } catch (error) { if (error instanceof AbandonedCartApiError) throw error; throw new AbandonedCartApiError("unavailable", 503); } }
  async function mutation(id: string, leaf: "recovered" | "archive", expectedVersion: number): Promise<Readonly<AbandonedCartMutationResult>> {
    const cartId = identifier(id); const operationId = identifier(randomUUID()); const parsedVersion = version(expectedVersion);
    const body = await request(`/api/orders/abandoned-carts/${cartId}/${leaf}`, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "idempotency-key": operationId }, body: JSON.stringify({ expectedVersion: parsedVersion }) });
    return safe(() => parseAbandonedCartMutationResult(body));
  }
  return Object.freeze({
    async issueRecoveryLink(id: string): Promise<Readonly<{ url: string; expiresAt: string }>> {
      const body = await request(`/api/orders/abandoned-carts/${identifier(id)}/recovery-link`, { method: "POST", credentials: "same-origin" });
      return safe(() => { const row = record(body); if (row === null || Object.keys(row).sort().join(",") !== "expiresAt,url" || typeof row.url !== "string" || typeof row.expiresAt !== "string") throw new TypeError(); const url = new URL(row.url); if (url.protocol !== "https:" || url.username || url.password || url.search || url.pathname !== "/cart/recover" || !/^#token=[A-Za-z0-9_-]{43}$/.test(url.hash)) throw new TypeError(); return Object.freeze({ url: row.url, expiresAt: row.expiresAt }); });
    },
    async recordRecoveryAttempt(id: string, kind: "contacted" | "note", note?: string): Promise<Readonly<{ cartId: string; kind: "contacted" | "note"; recordedAt: string; replayed: boolean }>> {
      const cartId = identifier(id); const operationId = identifier(randomUUID());
      if ((kind === "contacted" && note !== undefined) || (kind === "note" && (typeof note !== "string" || note !== note.trim() || note.length < 1 || note.length > 1000 || CONTROL.test(note)))) invalid();
      const leaf = kind === "contacted" ? "mark-contacted" : "note";
      const body = await request(`/api/orders/abandoned-carts/${cartId}/${leaf}`, { method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json", "idempotency-key": operationId }, body: JSON.stringify(kind === "contacted" ? {} : { note }) });
      return safe(() => { const row = record(body); if (row === null || Object.keys(row).sort().join(",") !== "cartId,kind,recordedAt,replayed"
        || row.cartId !== cartId || row.kind !== kind || typeof row.recordedAt !== "string" || !Number.isFinite(new Date(row.recordedAt).getTime()) || typeof row.replayed !== "boolean") throw new TypeError();
      return Object.freeze({ cartId, kind, recordedAt: row.recordedAt, replayed: row.replayed }); });
    },
    async getSummary(): Promise<Readonly<AbandonedCartSummary>> { const body = await request("/api/orders/abandoned-carts/summary", { method: "GET", credentials: "same-origin", cache: "no-store" }); return safe(() => parseAbandonedCartSummary(body)); },
    async list(input: Readonly<{ pageSize?: number; cursor?: string; status?: AbandonedCartStatus; search?: string; sort?: AbandonedCartSort }> = {}): Promise<AbandonedCartListResult> {
      const parsed = record(input); if (parsed === null || Object.keys(parsed).some((key) => !["pageSize", "cursor", "status", "search", "sort"].includes(key))) invalid();
      const pageSize = parsed.pageSize ?? 20; if (!Number.isSafeInteger(pageSize) || (pageSize as number) < 1 || (pageSize as number) > 100) invalid();
      if (parsed.cursor !== undefined && (typeof parsed.cursor !== "string" || !CURSOR.test(parsed.cursor))) invalid();
      if (parsed.status !== undefined && (typeof parsed.status !== "string" || !ABANDONED_CART_STATUSES.includes(parsed.status as AbandonedCartStatus))) invalid();
      if (parsed.search !== undefined && (typeof parsed.search !== "string" || parsed.search.length < 1 || parsed.search.length > 200 || parsed.search.trim() !== parsed.search || CONTROL.test(parsed.search))) invalid();
      const sort = parsed.sort ?? "newest"; if (typeof sort !== "string" || !ABANDONED_CART_SORTS.includes(sort as AbandonedCartSort)) invalid();
      const query = new URLSearchParams({ pageSize: String(pageSize) }); if (parsed.cursor !== undefined) query.set("cursor", parsed.cursor as string); if (parsed.status !== undefined) query.set("status", parsed.status as string); if (parsed.search !== undefined) query.set("search", parsed.search as string); query.set("sort", sort);
      const body = await request(`/api/orders/abandoned-carts?${query}`, { method: "GET", credentials: "same-origin", cache: "no-store" });
      return safe(() => { const envelope = record(body); if (envelope === null || !Array.isArray(envelope.items) || !["items", "items,nextCursor"].includes(Object.keys(envelope).sort().join(",")) || (envelope.nextCursor !== undefined && (typeof envelope.nextCursor !== "string" || !CURSOR.test(envelope.nextCursor)))) throw new TypeError(); return Object.freeze({ items: Object.freeze(envelope.items.map(parseAbandonedCartListItem)), ...(envelope.nextCursor === undefined ? {} : { nextCursor: envelope.nextCursor }) }); });
    },
    async get(id: string): Promise<Readonly<AbandonedCartDetail>> { const body = await request(`/api/orders/abandoned-carts/${identifier(id)}`, { method: "GET", credentials: "same-origin", cache: "no-store" }); return safe(() => parseAbandonedCartDetail(body)); },
    markRecovered(id: string, expectedVersion: number) { return mutation(id, "recovered", expectedVersion); },
    archive(id: string, expectedVersion: number) { return mutation(id, "archive", expectedVersion); },
  });
}

export const abandonedCartApi = createAbandonedCartApiClient();
