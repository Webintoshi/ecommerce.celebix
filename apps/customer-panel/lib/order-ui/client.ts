import {
  ORDER_PAYMENT_STATUSES,
  ORDER_STATUSES,
  parseOrderDashboardSummary,
  parseOrderDetail,
  parseOrderListItem,
  type OrderAddress,
  type OrderDashboardSummary,
  type OrderDetail,
  type OrderListItem,
  type OrderPaymentStatus,
  type OrderStatus,
  type OrderTracking,
} from "@celebix/saas-contracts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CURSOR = /^[A-Za-z0-9_-]{1,1024}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const ERROR_CODES = Object.freeze([
  "invalid_input", "unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled",
  "order_not_found", "note_not_found", "invalid_transition", "version_conflict", "operation_replayed",
  "operation_mismatch", "durable_authority_invalid", "unavailable",
] as const);
export type OrderApiErrorCode = (typeof ERROR_CODES)[number];

const MESSAGES: Readonly<Record<OrderApiErrorCode, string>> = Object.freeze({
  invalid_input: "Gönderilen sipariş bilgileri geçersiz.",
  unauthenticated: "Oturumunuz sona erdi. Yeniden giriş yapın.",
  membership_denied: "Bu sipariş işlemi için yetkiniz yok.",
  store_inactive: "Mağaza şu anda sipariş işlemlerine kapalı.",
  feature_not_enabled: "Sipariş yönetimi mevcut planınızda etkin değil.",
  order_not_found: "Sipariş bulunamadı veya artık erişilemiyor.",
  note_not_found: "Dahili not bulunamadı veya artık erişilemiyor.",
  invalid_transition: "Bu durum geçişine izin verilmiyor.",
  version_conflict: "Sipariş sizden önce başka bir işlem tarafından güncellendi.",
  operation_replayed: "Bu işlem daha önce tamamlandı. Güncel sipariş yeniden yüklenecek.",
  operation_mismatch: "İşlem güvenli biçimde tekrar edilemedi.",
  durable_authority_invalid: "Sipariş yetkisi yeniden doğrulanamadı.",
  unavailable: "Sipariş hizmeti şu anda kullanılamıyor. Lütfen yeniden deneyin.",
});

export class OrderApiError extends Error {
  readonly code: OrderApiErrorCode;
  readonly status: number;

  constructor(code: OrderApiErrorCode, status: number) {
    super(MESSAGES[code]);
    this.name = "OrderApiError";
    this.code = code;
    this.status = status;
  }
}

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type RandomUUID = () => string;
export type OrderListResult = Readonly<{ items: readonly OrderListItem[]; nextCursor?: string }>;
export type OrderMutationResult = Readonly<{
  id: string;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  version: number;
  updatedAt: string;
  replayed: boolean;
}>;

function record(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null ? value as Record<string, unknown> : null;
}

function code(value: unknown): OrderApiErrorCode {
  const parsed = record(value);
  return parsed !== null && typeof parsed.code === "string" && ERROR_CODES.includes(parsed.code as OrderApiErrorCode)
    ? parsed.code as OrderApiErrorCode
    : "unavailable";
}

async function responseJson(response: Response): Promise<unknown> {
  if (response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    throw new OrderApiError("unavailable", response.status || 503);
  }
  try { return await response.json(); }
  catch { throw new OrderApiError("unavailable", response.status || 503); }
}

function id(value: string): string {
  if (!UUID.test(value)) throw new TypeError("order_client_invalid");
  return value;
}

function positiveVersion(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError("order_client_invalid");
  return value;
}

function parseMutation(value: unknown): OrderMutationResult {
  const parsed = record(value);
  if (parsed === null || Object.keys(parsed).sort().join(",") !== "id,paymentStatus,replayed,status,updatedAt,version") {
    throw new TypeError("order_response_invalid");
  }
  const projection = parseOrderListItem({
    id: parsed.id, orderNumber: "projection", source: "manual_import", customerName: "Projection",
    customerEmail: "projection@example.com", currency: "TRY", totalCents: 0, status: parsed.status,
    paymentStatus: parsed.paymentStatus, itemCount: 0, createdAt: parsed.updatedAt, updatedAt: parsed.updatedAt,
    version: parsed.version,
  });
  if (typeof parsed.replayed !== "boolean") throw new TypeError("order_response_invalid");
  return Object.freeze({
    id: projection.id,
    status: projection.status,
    paymentStatus: projection.paymentStatus,
    version: projection.version,
    updatedAt: projection.updatedAt,
    replayed: parsed.replayed,
  });
}

function safeParse<T>(parser: () => T): T {
  try { return parser(); }
  catch (error) {
    if (error instanceof OrderApiError) throw error;
    throw new OrderApiError("unavailable", 503);
  }
}

export function createOrderApiClient(options?: Readonly<{ fetch?: Fetch; randomUUID?: RandomUUID }>) {
  const fetchImpl = options?.fetch ?? ((input, init) => fetch(input, init));
  const randomUUID = options?.randomUUID ?? (() => crypto.randomUUID());

  async function request(path: string, init: RequestInit): Promise<unknown> {
    let response: Response;
    try { response = await fetchImpl(path, init); }
    catch { throw new OrderApiError("unavailable", 503); }
    const body = await responseJson(response);
    if (!response.ok) throw new OrderApiError(code(body), response.status);
    return body;
  }

  async function mutation(path: string, method: "PATCH" | "POST", body: unknown): Promise<OrderMutationResult> {
    const operationId = randomUUID();
    if (!UUID.test(operationId)) throw new TypeError("order_client_invalid");
    const result = await request(path, {
      method,
      credentials: "same-origin",
      headers: { "content-type": "application/json", "idempotency-key": operationId },
      body: JSON.stringify(body),
    });
    return safeParse(() => parseMutation(result));
  }

  return Object.freeze({
    async getDashboardSummary(): Promise<Readonly<OrderDashboardSummary>> {
      const body = await request("/api/orders/summary", { method: "GET", credentials: "same-origin", cache: "no-store" });
      return safeParse(() => parseOrderDashboardSummary(body));
    },

    async listOrders(input: Readonly<{ pageSize?: number; cursor?: string; status?: OrderStatus; search?: string }> = {}): Promise<OrderListResult> {
      const pageSize = input.pageSize ?? 20;
      if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new TypeError("order_client_invalid");
      if (input.cursor !== undefined && !CURSOR.test(input.cursor)) throw new TypeError("order_client_invalid");
      if (input.status !== undefined && !ORDER_STATUSES.includes(input.status)) throw new TypeError("order_client_invalid");
      if (input.search !== undefined && (input.search.length < 1 || input.search.length > 200 || input.search !== input.search.trim() || CONTROL.test(input.search))) {
        throw new TypeError("order_client_invalid");
      }
      const query = new URLSearchParams({ pageSize: String(pageSize) });
      if (input.cursor !== undefined) query.set("cursor", input.cursor);
      if (input.status !== undefined) query.set("status", input.status);
      if (input.search !== undefined) query.set("search", input.search);
      const body = record(await request(`/api/orders?${query}`, { method: "GET", credentials: "same-origin", cache: "no-store" }));
      return safeParse(() => {
        if (body === null || !Array.isArray(body.items) || !["items", "items,nextCursor"].includes(Object.keys(body).sort().join(","))) {
          throw new TypeError("order_response_invalid");
        }
        if (body.nextCursor !== undefined && (typeof body.nextCursor !== "string" || !CURSOR.test(body.nextCursor))) {
          throw new TypeError("order_response_invalid");
        }
        return Object.freeze({
          items: Object.freeze(body.items.map(parseOrderListItem)),
          ...(body.nextCursor === undefined ? {} : { nextCursor: body.nextCursor }),
        });
      });
    },

    async getOrder(orderId: string): Promise<Readonly<OrderDetail>> {
      const body = await request(`/api/orders/${id(orderId)}`, { method: "GET", credentials: "same-origin", cache: "no-store" });
      return safeParse(() => parseOrderDetail(body));
    },

    transitionStatus(orderId: string, input: Readonly<{ expectedVersion: number; nextStatus: OrderStatus }>) {
      if (!ORDER_STATUSES.includes(input.nextStatus)) throw new TypeError("order_client_invalid");
      return mutation(`/api/orders/${id(orderId)}/status`, "PATCH", { expectedVersion: positiveVersion(input.expectedVersion), nextStatus: input.nextStatus });
    },

    transitionPayment(orderId: string, input: Readonly<{ expectedVersion: number; nextPaymentStatus: OrderPaymentStatus }>) {
      if (!ORDER_PAYMENT_STATUSES.includes(input.nextPaymentStatus)) throw new TypeError("order_client_invalid");
      return mutation(`/api/orders/${id(orderId)}/payment`, "PATCH", { expectedVersion: positiveVersion(input.expectedVersion), nextPaymentStatus: input.nextPaymentStatus });
    },

    updateShipping(orderId: string, input: Readonly<{ expectedVersion: number; shippingAddress: Readonly<OrderAddress>; tracking?: Readonly<OrderTracking> }>) {
      return mutation(`/api/orders/${id(orderId)}/shipping`, "PATCH", { expectedVersion: positiveVersion(input.expectedVersion), shippingAddress: input.shippingAddress, ...(input.tracking === undefined ? {} : { tracking: input.tracking }) });
    },

    addNote(orderId: string, body: string) {
      if (body.length < 1 || body.length > 2_000 || body !== body.trim() || CONTROL.test(body)) throw new TypeError("order_client_invalid");
      return mutation(`/api/orders/${id(orderId)}/notes`, "POST", { body });
    },

    archiveNote(orderId: string, noteId: string) {
      return mutation(`/api/orders/${id(orderId)}/notes/${id(noteId)}/archive`, "POST", {});
    },
  });
}

export const orderApi = createOrderApiClient();
