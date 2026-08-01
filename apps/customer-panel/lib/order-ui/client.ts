import {
  ORDER_PAYMENT_STATUSES,
  ORDER_SORTS,
  ORDER_STATUSES,
  parseOrderDashboardSummary,
  parseOrderDetail,
  parseOrderDraftConversionResult,
  parseOrderDraftDetail,
  parseOrderDraftListItem,
  parseOrderDraftSaveIntent,
  parseOrderListItem,
  parseOrderNeighbors,
  type OrderAddress,
  type OrderDashboardSummary,
  type OrderDetail,
  type OrderDraftConversionResult,
  type OrderDraftDetail,
  type OrderDraftListItem,
  type OrderDraftSaveIntent,
  type OrderListItem,
  type OrderNeighbors,
  type OrderPaymentStatus,
  type OrderSort,
  type OrderStatus,
  type OrderTracking,
} from "@celebix/saas-contracts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CURSOR = /^[A-Za-z0-9_-]{1,1024}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[.]\d{3}Z$/;
const ERROR_CODES = Object.freeze([
  "invalid_input", "unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled",
  "order_not_found", "note_not_found", "draft_not_found", "draft_not_editable", "inventory_conflict",
  "catalog_conflict", "customer_conflict", "invalid_transition", "version_conflict", "operation_replayed",
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
  draft_not_found: "Taslak sipariş bulunamadı veya artık erişilemiyor.",
  draft_not_editable: "Bu taslak artık düzenlenemez.",
  inventory_conflict: "Taslağı siparişe dönüştürmek için yeterli stok yok.",
  catalog_conflict: "Taslakta seçilen ürün veya varyant artık kullanılamıyor.",
  customer_conflict: "Taslakta seçilen müşteri artık kullanılamıyor.",
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

function isOrderApiError(value: unknown): value is OrderApiError {
  try { return value instanceof OrderApiError; }
  catch { return false; }
}

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type RandomUUID = () => string;
export type OrderListResult = Readonly<{ items: readonly OrderListItem[]; nextCursor?: string }>;
export type OrderDraftListResult = Readonly<{ items: readonly OrderDraftListItem[]; nextCursor?: string }>;
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

function invalid(): never {
  throw new TypeError("order_client_invalid");
}

function local<T>(parser: () => T): T {
  try { return parser(); }
  catch { return invalid(); }
}

function exactDataObject(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return invalid();
  const allowed = new Set([...required, ...optional]);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string" || !allowed.has(key))) return invalid();
  if (required.some((key) => !keys.includes(key))) return invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const projection: Record<string, unknown> = {};
  for (const key of keys as string[]) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) return invalid();
    projection[key] = descriptor.value;
  }
  return Object.freeze(projection);
}

function text(value: unknown, min: number, max: number): string {
  if (typeof value !== "string" || value.length < min || value.length > max || value !== value.trim() || CONTROL.test(value)) return invalid();
  return value;
}

function optionalText(value: unknown, max: number): string | undefined {
  return value === undefined ? undefined : text(value, 1, max);
}

function parseShippingAddress(value: unknown): Readonly<OrderAddress> {
  const parsed = exactDataObject(value, ["recipientName", "line1", "city", "country"], ["line2", "district", "postalCode"]);
  const country = text(parsed.country, 2, 2);
  if (!/^[A-Z]{2}$/.test(country)) return invalid();
  const line2 = optionalText(parsed.line2, 300);
  const district = optionalText(parsed.district, 200);
  const postalCode = optionalText(parsed.postalCode, 32);
  return Object.freeze({
    recipientName: text(parsed.recipientName, 1, 200),
    line1: text(parsed.line1, 1, 300),
    ...(line2 === undefined ? {} : { line2 }),
    ...(district === undefined ? {} : { district }),
    city: text(parsed.city, 1, 200),
    ...(postalCode === undefined ? {} : { postalCode }),
    country,
  });
}

function strictTrackingUrl(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const url = text(value, 1, 2_048);
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "" || parsed.hash !== "" || parsed.href !== url) return invalid();
  return url;
}

function strictTimestamp(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const timestamp = text(value, 24, 24);
  if (!UTC_TIMESTAMP.test(timestamp) || new Date(timestamp).toISOString() !== timestamp) return invalid();
  return timestamp;
}

function parseTracking(value: unknown): Readonly<OrderTracking> {
  const parsed = exactDataObject(value, ["carrier", "trackingNumber"], ["trackingUrl", "shippedAt"]);
  const trackingUrl = strictTrackingUrl(parsed.trackingUrl);
  const shippedAt = strictTimestamp(parsed.shippedAt);
  return Object.freeze({
    carrier: text(parsed.carrier, 1, 100),
    trackingNumber: text(parsed.trackingNumber, 1, 200),
    ...(trackingUrl === undefined ? {} : { trackingUrl }),
    ...(shippedAt === undefined ? {} : { shippedAt }),
  });
}

function parseListInput(value: unknown) {
  const parsed = exactDataObject(value, [], ["pageSize", "cursor", "status", "search", "sort"]);
  const pageSize = parsed.pageSize ?? 20;
  if (!Number.isSafeInteger(pageSize) || (pageSize as number) < 1 || (pageSize as number) > 100) return invalid();
  if (parsed.cursor !== undefined && (typeof parsed.cursor !== "string" || !CURSOR.test(parsed.cursor))) return invalid();
  if (parsed.status !== undefined && (typeof parsed.status !== "string" || !ORDER_STATUSES.includes(parsed.status as OrderStatus))) return invalid();
  if (parsed.search !== undefined) text(parsed.search, 1, 200);
  const sort = parsed.sort ?? "newest";
  if (typeof sort !== "string" || !ORDER_SORTS.includes(sort as OrderSort)) return invalid();
  return Object.freeze({
    pageSize: pageSize as number,
    ...(parsed.cursor === undefined ? {} : { cursor: parsed.cursor as string }),
    ...(parsed.status === undefined ? {} : { status: parsed.status as OrderStatus }),
    ...(parsed.search === undefined ? {} : { search: parsed.search as string }),
    sort: sort as OrderSort,
  });
}

function parseVersionedTransition(value: unknown, key: "nextStatus" | "nextPaymentStatus") {
  const parsed = exactDataObject(value, ["expectedVersion", key]);
  const next = parsed[key];
  if (typeof next !== "string") return invalid();
  if (key === "nextStatus" ? !ORDER_STATUSES.includes(next as OrderStatus) : !ORDER_PAYMENT_STATUSES.includes(next as OrderPaymentStatus)) return invalid();
  return Object.freeze({ expectedVersion: positiveVersion(parsed.expectedVersion), next });
}

function parseShippingUpdate(value: unknown) {
  const parsed = exactDataObject(value, ["expectedVersion", "shippingAddress"], ["tracking"]);
  const shippingAddress = parseShippingAddress(parsed.shippingAddress);
  const tracking = parsed.tracking === undefined ? undefined : parseTracking(parsed.tracking);
  return Object.freeze({
    expectedVersion: positiveVersion(parsed.expectedVersion),
    shippingAddress,
    ...(tracking === undefined ? {} : { tracking }),
  });
}

function code(value: unknown): OrderApiErrorCode {
  const parsed = record(value);
  return parsed !== null && typeof parsed.code === "string" && ERROR_CODES.includes(parsed.code as OrderApiErrorCode)
    ? parsed.code as OrderApiErrorCode
    : "unavailable";
}

async function responseJson(response: Response): Promise<unknown> {
  try {
    if (response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
      throw new OrderApiError("unavailable", response.status || 503);
    }
    return await response.json();
  } catch (error) {
    if (isOrderApiError(error)) throw error;
    throw new OrderApiError("unavailable", 503);
  }
}

function id(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new TypeError("order_client_invalid");
  return value;
}

function positiveVersion(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new TypeError("order_client_invalid");
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
    if (isOrderApiError(error)) throw error;
    throw new OrderApiError("unavailable", 503);
  }
}

export function createOrderApiClient(options?: Readonly<{ fetch?: Fetch; randomUUID?: RandomUUID }>) {
  const configured = local(() => exactDataObject(options ?? {}, [], ["fetch", "randomUUID"]));
  if (configured.fetch !== undefined && typeof configured.fetch !== "function") invalid();
  if (configured.randomUUID !== undefined && typeof configured.randomUUID !== "function") invalid();
  const fetchImpl = (configured.fetch as Fetch | undefined) ?? ((input, init) => fetch(input, init));
  const randomUUID = (configured.randomUUID as RandomUUID | undefined) ?? (() => crypto.randomUUID());

  async function request(path: string, init: RequestInit): Promise<unknown> {
    let response: Response;
    try { response = await fetchImpl(path, init); }
    catch { throw new OrderApiError("unavailable", 503); }
    const body = await responseJson(response);
    try {
      if (!response.ok) throw new OrderApiError(code(body), response.status);
      return body;
    } catch (error) {
      if (isOrderApiError(error)) throw error;
      throw new OrderApiError("unavailable", 503);
    }
  }

  async function mutation(path: string, method: "PATCH" | "POST", body: unknown): Promise<OrderMutationResult> {
    const operationId = local(() => randomUUID());
    if (typeof operationId !== "string" || !UUID.test(operationId)) throw new TypeError("order_client_invalid");
    const result = await request(path, {
      method,
      credentials: "same-origin",
      headers: { "content-type": "application/json", "idempotency-key": operationId },
      body: local(() => JSON.stringify(body)),
    });
    return safeParse(() => parseMutation(result));
  }

  async function draftMutation<T>(
    path: string,
    body: unknown,
    parser: (value: unknown) => T,
  ): Promise<T> {
    const operationId = local(() => randomUUID());
    if (typeof operationId !== "string" || !UUID.test(operationId)) throw new TypeError("order_client_invalid");
    const result = await request(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", "idempotency-key": operationId },
      body: local(() => JSON.stringify(body)),
    });
    return safeParse(() => parser(result));
  }

  return Object.freeze({
    async getDashboardSummary(): Promise<Readonly<OrderDashboardSummary>> {
      const body = await request("/api/orders/summary", { method: "GET", credentials: "same-origin", cache: "no-store" });
      return safeParse(() => parseOrderDashboardSummary(body));
    },

    async listOrders(input: Readonly<{ pageSize?: number; cursor?: string; status?: OrderStatus; search?: string; sort?: OrderSort }> = {}): Promise<OrderListResult> {
      const parsed = local(() => parseListInput(input));
      const { pageSize } = parsed;
      const query = new URLSearchParams({ pageSize: String(pageSize) });
      if (parsed.cursor !== undefined) query.set("cursor", parsed.cursor);
      if (parsed.status !== undefined) query.set("status", parsed.status);
      if (parsed.search !== undefined) query.set("search", parsed.search);
      query.set("sort", parsed.sort);
      const result = await request(`/api/orders?${query}`, { method: "GET", credentials: "same-origin", cache: "no-store" });
      return safeParse(() => {
        const body = record(result);
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
      const order = local(() => id(orderId));
      const body = await request(`/api/orders/${order}`, { method: "GET", credentials: "same-origin", cache: "no-store" });
      return safeParse(() => parseOrderDetail(body));
    },

    async getOrderNeighbors(orderId: string): Promise<Readonly<OrderNeighbors>> {
      const order = local(() => id(orderId));
      const body = await request(`/api/orders/${order}/neighbors`, { method: "GET", credentials: "same-origin", cache: "no-store" });
      return safeParse(() => parseOrderNeighbors(body));
    },

    transitionStatus(orderId: string, input: Readonly<{ expectedVersion: number; nextStatus: OrderStatus }>) {
      const order = local(() => id(orderId));
      const parsed = local(() => parseVersionedTransition(input, "nextStatus"));
      return mutation(`/api/orders/${order}/status`, "PATCH", { expectedVersion: parsed.expectedVersion, nextStatus: parsed.next });
    },

    transitionPayment(orderId: string, input: Readonly<{ expectedVersion: number; nextPaymentStatus: OrderPaymentStatus }>) {
      const order = local(() => id(orderId));
      const parsed = local(() => parseVersionedTransition(input, "nextPaymentStatus"));
      return mutation(`/api/orders/${order}/payment`, "PATCH", { expectedVersion: parsed.expectedVersion, nextPaymentStatus: parsed.next });
    },

    updateShipping(orderId: string, input: Readonly<{ expectedVersion: number; shippingAddress: Readonly<OrderAddress>; tracking?: Readonly<OrderTracking> }>) {
      const order = local(() => id(orderId));
      const parsed = local(() => parseShippingUpdate(input));
      return mutation(`/api/orders/${order}/shipping`, "PATCH", parsed);
    },

    addNote(orderId: string, body: string) {
      const order = local(() => id(orderId));
      const note = local(() => text(body, 1, 2_000));
      return mutation(`/api/orders/${order}/notes`, "POST", Object.freeze({ body: note }));
    },

    archiveNote(orderId: string, noteId: string) {
      const order = local(() => id(orderId));
      const note = local(() => id(noteId));
      return mutation(`/api/orders/${order}/notes/${note}/archive`, "POST", Object.freeze({}));
    },
    async listDrafts(input: Readonly<{ pageSize?: number; cursor?: string }> = {}): Promise<OrderDraftListResult> {
      const parsed = local(() => exactDataObject(input, [], ["pageSize", "cursor"]));
      const pageSize = parsed.pageSize ?? 20;
      if (!Number.isSafeInteger(pageSize) || (pageSize as number) < 1 || (pageSize as number) > 100) invalid();
      if (parsed.cursor !== undefined && (typeof parsed.cursor !== "string" || !CURSOR.test(parsed.cursor))) invalid();
      const query = new URLSearchParams({ pageSize: String(pageSize) });
      if (parsed.cursor !== undefined) query.set("cursor", parsed.cursor as string);
      const result = await request("/api/orders/drafts?" + query.toString(), {
        method: "GET", credentials: "same-origin", cache: "no-store",
      });
      return safeParse(() => {
        const body = record(result);
        if (
          body === null || !Array.isArray(body.items) ||
          !["items", "items,nextCursor"].includes(Object.keys(body).sort().join(","))
        ) throw new TypeError("order_response_invalid");
        if (body.nextCursor !== undefined && (typeof body.nextCursor !== "string" || !CURSOR.test(body.nextCursor))) {
          throw new TypeError("order_response_invalid");
        }
        return Object.freeze({
          items: Object.freeze(body.items.map(parseOrderDraftListItem)),
          ...(body.nextCursor === undefined ? {} : { nextCursor: body.nextCursor }),
        });
      });
    },

    async getDraft(draftId: string): Promise<Readonly<OrderDraftDetail>> {
      const draft = local(() => id(draftId));
      const result = await request("/api/orders/drafts/" + draft, {
        method: "GET", credentials: "same-origin", cache: "no-store",
      });
      return safeParse(() => parseOrderDraftDetail(result));
    },

    createDraft(intent: Readonly<OrderDraftSaveIntent>): Promise<Readonly<OrderDraftDetail>> {
      const parsed = local(() => parseOrderDraftSaveIntent(intent));
      if (parsed.expectedVersion !== undefined) invalid();
      return draftMutation("/api/orders/drafts", parsed, parseOrderDraftDetail);
    },

    updateDraft(draftId: string, intent: Readonly<OrderDraftSaveIntent>): Promise<Readonly<OrderDraftDetail>> {
      const draft = local(() => id(draftId));
      const parsed = local(() => parseOrderDraftSaveIntent(intent));
      if (parsed.expectedVersion === undefined) invalid();
      return draftMutation("/api/orders/drafts/" + draft, parsed, parseOrderDraftDetail);
    },

    archiveDraft(draftId: string, input: Readonly<{ expectedVersion: number }>): Promise<Readonly<OrderDraftDetail>> {
      const draft = local(() => id(draftId));
      const parsed = local(() => exactDataObject(input, ["expectedVersion"]));
      const expectedVersion = local(() => positiveVersion(parsed.expectedVersion));
      return draftMutation("/api/orders/drafts/" + draft + "/archive", { expectedVersion }, parseOrderDraftDetail);
    },

    convertDraft(
      draftId: string,
      input: Readonly<{ expectedVersion: number }>,
    ): Promise<Readonly<OrderDraftConversionResult>> {
      const draft = local(() => id(draftId));
      const parsed = local(() => exactDataObject(input, ["expectedVersion"]));
      const expectedVersion = local(() => positiveVersion(parsed.expectedVersion));
      return draftMutation("/api/orders/drafts/" + draft + "/convert", { expectedVersion }, parseOrderDraftConversionResult);
    },
  });
}

export const orderApi = createOrderApiClient();
