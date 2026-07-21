import {
  parseQuickOrderLinkListItem,
  parseQuickOrderLinkMutationResult,
  QUICK_ORDER_EXPIRY_HOURS,
  QUICK_ORDER_LINK_STATUSES,
  type QuickOrderAddress,
  type QuickOrderLinkStatus,
} from "@celebix/saas-contracts";

import { catalogApi } from "../catalog-ui/client.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CURSOR = /^[A-Za-z0-9_-]{1,1024}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.(?:\d{3}|\d{6})Z$/;
const EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i;
const CONTROL = /[\u0000-\u001f\u007f]/;
const SHARE_PATH = /^\/odeme\/hizli\/[A-Za-z0-9_-]{43}$/;
const MAX_COMPONENT_CENTS = 500_000_000_000_000;

const API_CODES = Object.freeze([
  "invalid_input", "unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled",
  "action_denied", "quick_link_not_found", "provider_not_ready", "catalog_item_unavailable",
  "stock_unavailable", "invalid_transition", "version_conflict", "operation_replayed",
  "operation_mismatch", "durable_authority_invalid", "unavailable", "commit_unknown",
] as const);
export type QuickLinkUiApiErrorCode = (typeof API_CODES)[number];

const MESSAGES: Readonly<Record<QuickLinkUiApiErrorCode, string>> = Object.freeze({
  invalid_input: "Gönderilen bilgiler geçersiz. Alanları kontrol edin.",
  unauthenticated: "Oturumunuz sona erdi. Yeniden giriş yapın.",
  membership_denied: "Bu mağazanın hızlı sipariş linklerini görüntüleme yetkiniz yok.",
  store_inactive: "Mağaza etkin olmadığı için hızlı sipariş linki kullanılamıyor.",
  feature_not_enabled: "Hızlı sipariş linki özelliği bu mağazada etkin değil.",
  action_denied: "Bu işlemi yapma yetkiniz yok.",
  quick_link_not_found: "Hızlı sipariş linki bulunamadı veya artık erişilemiyor.",
  provider_not_ready: "PayTR henüz hızlı ödeme linkleri için hazır değil.",
  catalog_item_unavailable: "Seçilen katalog ürünü artık kullanılamıyor.",
  stock_unavailable: "Seçilen ürün için yeterli stok bulunmuyor.",
  invalid_transition: "Bu link mevcut durumunda değiştirilemez.",
  version_conflict: "Bu link sizden önce başka bir işlem tarafından güncellendi.",
  operation_replayed: "İşlem güvenli biçimde yeniden oynatılamadı.",
  operation_mismatch: "İşlem güvenli biçimde tekrar edilemedi. Yeni bir deneme başlatın.",
  durable_authority_invalid: "Kalıcı hızlı sipariş yetkisi doğrulanamadı.",
  unavailable: "Hızlı sipariş hizmeti şu anda kullanılamıyor. Lütfen yeniden deneyin.",
  commit_unknown: "İşlemin sonucu doğrulanamadı. Listeyi yenileyin.",
});

export class QuickLinkUiApiError extends Error {
  readonly code: QuickLinkUiApiErrorCode;
  readonly status: number;

  constructor(code: QuickLinkUiApiErrorCode, status: number) {
    super(MESSAGES[code]);
    this.name = "QuickLinkUiApiError";
    this.code = code;
    this.status = status;
  }
}

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type RandomUUID = () => string;
type Catalog = Pick<typeof catalogApi, "listProducts" | "getProduct">;

export type QuickLinkCreateIntent = Readonly<{
  items: readonly Readonly<{ variantId: string; quantity: number }>[];
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shippingAddress: Readonly<QuickOrderAddress>;
  billingAddress: Readonly<QuickOrderAddress>;
  customerNote?: string;
  internalLabel?: string;
  shippingCents: number;
  discountCents: number;
  expiryHours: 4 | 12 | 24 | 48 | 72;
}>;

export type QuickLinkListResult = Readonly<{
  items: readonly ReturnType<typeof parseQuickOrderLinkListItem>[];
  nextCursor?: string;
}>;

export type QuickLinkShareResult = Readonly<{ url: string; expiresAt: string }>;
export type QuickLinkProviderResult = Readonly<{ status: "active" | "revoked"; version: number }>;
export type CatalogSearchVariant = Readonly<{
  variantId: string;
  title: string;
  sku?: string;
  priceCents: number;
  availableQuantity?: number;
}>;
export type CatalogSearchProduct = Readonly<{
  title: string;
  variants: readonly CatalogSearchVariant[];
}>;

function unavailable(status = 503): QuickLinkUiApiError {
  return new QuickLinkUiApiError("unavailable", status || 503);
}

function record(value: unknown): Record<string, unknown> | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null ? value as Record<string, unknown> : null;
  } catch { return null; }
}

function exactRecord(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> | null {
  const selected = record(value);
  if (selected === null) return null;
  try {
    const descriptors = Object.getOwnPropertyDescriptors(selected);
    const allowed = new Set([...required, ...optional]);
    const keys = Reflect.ownKeys(descriptors);
    if (
      required.some((key) => !Object.hasOwn(descriptors, key)) ||
      keys.some((key) => typeof key !== "string" || !allowed.has(key))
    ) return null;
    const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      if (typeof key !== "string") return null;
      const descriptor = descriptors[key];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
      copy[key] = descriptor.value;
    }
    return copy;
  } catch { return null; }
}

function denseArray(value: unknown, maximum: number): readonly unknown[] | null {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
    const lengthDescriptor = descriptors.length;
    if (!lengthDescriptor || !("value" in lengthDescriptor) || !Number.isSafeInteger(lengthDescriptor.value)) return null;
    const length = lengthDescriptor.value as number;
    if (length < 0 || length > maximum || Reflect.ownKeys(descriptors).length !== length + 1) return null;
    const result: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
      result.push(descriptor.value);
    }
    return result;
  } catch { return null; }
}

function integer(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number | null {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum
    ? value as number
    : null;
}

function text(value: unknown, minimum: number, maximum: number, pattern?: RegExp): string | null {
  return typeof value === "string" && value.length >= minimum && value.length <= maximum &&
    value === value.trim() && !CONTROL.test(value) && (pattern === undefined || pattern.test(value))
    ? value
    : null;
}

function address(value: unknown): Readonly<QuickOrderAddress> | null {
  const selected = exactRecord(value, ["recipientName", "phone", "line1", "city", "country"], ["line2", "district", "postalCode"]);
  if (selected === null) return null;
  const recipientName = text(selected.recipientName, 1, 200);
  const phone = text(selected.phone, 3, 32);
  const line1 = text(selected.line1, 1, 300);
  const city = text(selected.city, 1, 200);
  const country = text(selected.country, 2, 2, /^[A-Z]{2}$/);
  const line2 = Object.hasOwn(selected, "line2") ? text(selected.line2, 1, 300) : undefined;
  const district = Object.hasOwn(selected, "district") ? text(selected.district, 1, 200) : undefined;
  const postalCode = Object.hasOwn(selected, "postalCode") ? text(selected.postalCode, 1, 32) : undefined;
  if (
    recipientName === null || phone === null || line1 === null || city === null || country === null ||
    line2 === null || district === null || postalCode === null
  ) return null;
  return Object.freeze({
    recipientName,
    phone,
    line1,
    ...(line2 === undefined ? {} : { line2 }),
    ...(district === undefined ? {} : { district }),
    city,
    ...(postalCode === undefined ? {} : { postalCode }),
    country,
  });
}

function createIntent(value: QuickLinkCreateIntent): Readonly<QuickLinkCreateIntent> {
  const selected = exactRecord(value, [
    "items", "customerName", "customerEmail", "customerPhone", "shippingAddress", "billingAddress",
    "shippingCents", "discountCents", "expiryHours",
  ], ["customerNote", "internalLabel"]);
  const rawItems = denseArray(selected?.items, 100);
  const shippingAddress = address(selected?.shippingAddress);
  const billingAddress = address(selected?.billingAddress);
  const customerName = text(selected?.customerName, 1, 200);
  const customerEmail = text(selected?.customerEmail, 3, 320, EMAIL);
  const customerPhone = text(selected?.customerPhone, 3, 32);
  const customerNote = selected && Object.hasOwn(selected, "customerNote") ? text(selected.customerNote, 1, 2_000) : undefined;
  const internalLabel = selected && Object.hasOwn(selected, "internalLabel") ? text(selected.internalLabel, 1, 200) : undefined;
  const shippingCents = integer(selected?.shippingCents, 0, MAX_COMPONENT_CENTS);
  const discountCents = integer(selected?.discountCents, 0, MAX_COMPONENT_CENTS);
  if (
    selected === null || rawItems === null || rawItems.length === 0 || shippingAddress === null || billingAddress === null ||
    customerName === null || customerEmail === null || customerPhone === null || customerNote === null || internalLabel === null ||
    shippingCents === null || discountCents === null || !QUICK_ORDER_EXPIRY_HOURS.includes(selected.expiryHours as never)
  ) throw new TypeError("quick_link_ui_client_invalid");
  const items = rawItems.map((raw) => {
    const item = exactRecord(raw, ["variantId", "quantity"]);
    const quantity = integer(item?.quantity, 1, 9_999);
    if (item === null || typeof item.variantId !== "string" || !UUID.test(item.variantId) || quantity === null) {
      throw new TypeError("quick_link_ui_client_invalid");
    }
    return Object.freeze({ variantId: item.variantId, quantity });
  });
  return Object.freeze({
    items: Object.freeze(items),
    customerName,
    customerEmail,
    customerPhone,
    shippingAddress,
    billingAddress,
    ...(customerNote === undefined ? {} : { customerNote }),
    ...(internalLabel === undefined ? {} : { internalLabel }),
    shippingCents,
    discountCents,
    expiryHours: selected.expiryHours as QuickLinkCreateIntent["expiryHours"],
  });
}

function safeCode(value: unknown): QuickLinkUiApiErrorCode {
  const selected = record(value);
  return selected !== null && typeof selected.code === "string" && API_CODES.includes(selected.code as QuickLinkUiApiErrorCode)
    ? selected.code as QuickLinkUiApiErrorCode
    : "unavailable";
}

async function json(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") throw unavailable(response.status);
  try { return await response.json(); }
  catch { throw unavailable(response.status); }
}

function listResult(value: unknown, pageSize: number): QuickLinkListResult {
  const selected = exactRecord(value, ["items"], ["nextCursor"]);
  const rawItems = denseArray(selected?.items, pageSize);
  if (selected === null || rawItems === null) throw unavailable();
  try {
    const items = Object.freeze(rawItems.map((item) => {
      const parsed = parseQuickOrderLinkListItem(item);
      if (parsed.currency !== "TRY") throw new TypeError("invalid");
      return parsed;
    }));
    if (!Object.hasOwn(selected, "nextCursor")) return Object.freeze({ items });
    if (
      typeof selected.nextCursor !== "string" || !CURSOR.test(selected.nextCursor) ||
      items.length === 0 || items.length !== pageSize
    ) throw new TypeError("invalid");
    return Object.freeze({ items, nextCursor: selected.nextCursor });
  } catch { throw unavailable(); }
}

function shareResult(value: unknown): QuickLinkShareResult {
  const selected = exactRecord(value, ["url", "expiresAt"]);
  if (selected === null || typeof selected.url !== "string" || typeof selected.expiresAt !== "string" || !ISO_UTC.test(selected.expiresAt)) {
    throw unavailable();
  }
  try {
    const url = new URL(selected.url);
    const expiresAt = new Date(selected.expiresAt);
    const millisecondCanonical = selected.expiresAt.replace(/(\.\d{3})\d{3}Z$/, "$1Z");
    if (
      url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.port !== "" ||
      url.search !== "" || url.hash !== "" || !SHARE_PATH.test(url.pathname) || url.href !== selected.url ||
      !Number.isFinite(expiresAt.getTime()) || expiresAt.toISOString() !== millisecondCanonical
    ) throw new TypeError("invalid");
  } catch { throw unavailable(); }
  return Object.freeze({ url: selected.url, expiresAt: selected.expiresAt });
}

function providerResult(value: unknown, expected: "active" | "revoked"): QuickLinkProviderResult {
  const selected = exactRecord(value, ["status", "version"]);
  const version = integer(selected?.version, 1);
  if (selected === null || selected.status !== expected || version === null) throw unavailable();
  return Object.freeze({ status: expected, version });
}

function linkId(value: string): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new TypeError("quick_link_ui_client_invalid");
  return value;
}

function listInput(value: Readonly<{ pageSize?: number; cursor?: string; status?: QuickOrderLinkStatus }> = {}) {
  const selected = exactRecord(value, [], ["pageSize", "cursor", "status"]);
  const pageSize = selected && Object.hasOwn(selected, "pageSize") ? integer(selected.pageSize, 1, 100) : 20;
  if (
    selected === null || pageSize === null ||
    (selected.cursor !== undefined && (typeof selected.cursor !== "string" || !CURSOR.test(selected.cursor))) ||
    (selected.status !== undefined && !QUICK_ORDER_LINK_STATUSES.includes(selected.status as QuickOrderLinkStatus))
  ) throw new TypeError("quick_link_ui_client_invalid");
  return Object.freeze({
    pageSize,
    ...(selected.cursor === undefined ? {} : { cursor: selected.cursor as string }),
    ...(selected.status === undefined ? {} : { status: selected.status as QuickOrderLinkStatus }),
  });
}

function searchText(value: string): string {
  if (typeof value !== "string") throw new TypeError("quick_link_ui_client_invalid");
  const selected = value.trim();
  if (selected.length > 100 || CONTROL.test(selected)) throw new TypeError("quick_link_ui_client_invalid");
  return selected.toLocaleLowerCase("tr-TR");
}

function includesQuery(values: readonly (string | undefined)[], query: string): boolean {
  return values.some((value) => value?.toLocaleLowerCase("tr-TR").includes(query));
}

export function createQuickLinkUiClient(options?: Readonly<{ fetch?: Fetch; randomUUID?: RandomUUID; catalog?: Catalog }>) {
  let fetchImpl: Fetch;
  let randomUUID: RandomUUID;
  let catalog: Catalog;
  try {
    if (options !== undefined && exactRecord(options, [], ["fetch", "randomUUID", "catalog"]) === null) {
      throw new TypeError("invalid");
    }
    fetchImpl = options?.fetch ?? ((input, init) => fetch(input, init));
    randomUUID = options?.randomUUID ?? (() => crypto.randomUUID());
    catalog = options?.catalog ?? catalogApi;
    if (
      typeof fetchImpl !== "function" || typeof randomUUID !== "function" ||
      typeof catalog?.listProducts !== "function" || typeof catalog?.getProduct !== "function"
    ) throw new TypeError("invalid");
  } catch { throw new TypeError("quick_link_ui_client_invalid"); }

  async function request(path: string, init: RequestInit): Promise<unknown> {
    let response: Response;
    try { response = await fetchImpl(path, init); }
    catch { throw unavailable(); }
    const body = await json(response);
    if (!response.ok) throw new QuickLinkUiApiError(safeCode(body), response.status);
    return body;
  }

  async function mutation(path: string, body: unknown, idempotent = true): Promise<unknown> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (idempotent) {
      let operationId: string;
      try { operationId = randomUUID(); }
      catch { throw new TypeError("quick_link_ui_client_invalid"); }
      if (typeof operationId !== "string" || !UUID.test(operationId)) throw new TypeError("quick_link_ui_client_invalid");
      headers["idempotency-key"] = operationId;
    }
    return request(path, {
      method: "POST",
      credentials: "same-origin",
      headers,
      body: JSON.stringify(body),
    });
  }

  return Object.freeze({
    async listLinks(input: Readonly<{ pageSize?: number; cursor?: string; status?: QuickOrderLinkStatus }> = {}): Promise<QuickLinkListResult> {
      const selected = listInput(input);
      const query = new URLSearchParams({ pageSize: String(selected.pageSize) });
      if (selected.cursor !== undefined) query.set("cursor", selected.cursor);
      if (selected.status !== undefined) query.set("status", selected.status);
      return listResult(await request(`/api/orders/quick-links?${query}`, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      }), selected.pageSize);
    },

    async createLink(input: QuickLinkCreateIntent): Promise<QuickLinkShareResult> {
      return shareResult(await mutation("/api/orders/quick-links", createIntent(input)));
    },

    async cancelLink(id: string, expectedVersion: number) {
      const version = integer(expectedVersion, 1);
      if (version === null) throw new TypeError("quick_link_ui_client_invalid");
      try {
        const result = parseQuickOrderLinkMutationResult(await mutation(
          `/api/orders/quick-links/${linkId(id)}/cancel`,
          { expectedVersion: version },
        ));
        if (result.id !== id || result.status !== "cancelled" || result.version !== version + 1) throw new TypeError("invalid");
        return result;
      } catch (error) {
        if (error instanceof QuickLinkUiApiError) throw error;
        if (error instanceof TypeError && error.message === "quick_link_ui_client_invalid") throw error;
        throw unavailable();
      }
    },

    async duplicateLink(id: string): Promise<QuickLinkShareResult> {
      return shareResult(await mutation(`/api/orders/quick-links/${linkId(id)}/duplicate`, {}));
    },

    async revealUrl(id: string): Promise<QuickLinkShareResult> {
      return shareResult(await mutation(`/api/orders/quick-links/${linkId(id)}/url`, {}, false));
    },

    async activateProvider(): Promise<QuickLinkProviderResult> {
      return providerResult(await mutation("/api/orders/quick-links/provider/activate", {}), "active");
    },

    async revokeProvider(): Promise<QuickLinkProviderResult> {
      return providerResult(await mutation("/api/orders/quick-links/provider/revoke", {}), "revoked");
    },

    async searchProducts(rawQuery: string): Promise<readonly CatalogSearchProduct[]> {
      const query = searchText(rawQuery);
      if (query === "") return Object.freeze([]);
      const page = await catalog.listProducts({ status: "active" });
      const details = await Promise.all(page.items.map((product) => catalog.getProduct(product.id)));
      const results = details.flatMap(({ product, variants }) => {
        const productMatches = includesQuery([product.title, product.slug], query);
        const selected = variants.flatMap((variant) => {
          if (
            variant.status !== "active" || (variant.stockTracking && variant.stockQuantity < 1) ||
            (!productMatches && !includesQuery([variant.title, variant.sku, variant.barcode], query))
          ) return [];
          return [Object.freeze({
            variantId: variant.id,
            title: variant.title,
            ...(variant.sku === undefined ? {} : { sku: variant.sku }),
            priceCents: variant.priceCents,
            ...(variant.stockTracking ? { availableQuantity: variant.stockQuantity } : {}),
          })];
        });
        return selected.length === 0
          ? []
          : [Object.freeze({ title: product.title, variants: Object.freeze(selected) })];
      });
      return Object.freeze(results.slice(0, 12));
    },
  });
}

export const quickLinkUi = createQuickLinkUiClient();
