import {
  parseProduct,
  parseProductVariant,
  type Product,
  type ProductStatus,
  type ProductVariant,
} from "@celebix/saas-contracts";

import type { CatalogProductFields, CatalogVariantFields } from "./forms.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CURSOR = /^[A-Za-z0-9_-]{1,2048}$/;
const API_CODES = Object.freeze([
  "invalid_input", "unauthenticated", "membership_denied", "product_limit_reached",
  "product_not_found", "variant_not_found", "slug_conflict", "sku_conflict",
  "version_conflict", "operation_mismatch", "unavailable",
] as const);
export type CatalogApiErrorCode = (typeof API_CODES)[number];

const TURKISH_MESSAGES: Readonly<Record<CatalogApiErrorCode, string>> = Object.freeze({
  invalid_input: "Gönderilen bilgiler geçersiz. Alanları kontrol edin.",
  unauthenticated: "Oturumunuz sona erdi. Yeniden giriş yapın.",
  membership_denied: "Bu mağazada ürün yönetme yetkiniz yok.",
  product_limit_reached: "Planınızdaki ürün sınırına ulaştınız.",
  product_not_found: "Ürün bulunamadı veya artık erişilemiyor.",
  variant_not_found: "Varyant bulunamadı veya artık erişilemiyor.",
  slug_conflict: "Bu URL anahtarı başka bir üründe kullanılıyor.",
  sku_conflict: "Bu SKU mağazada başka bir varyantta kullanılıyor.",
  version_conflict: "Bu kayıt sizden önce başka bir işlem tarafından güncellendi.",
  operation_mismatch: "İşlem güvenli biçimde tekrar edilemedi. Yeni bir deneme başlatın.",
  unavailable: "Ürün hizmeti şu anda kullanılamıyor. Lütfen yeniden deneyin.",
});

export class CatalogApiError extends Error {
  readonly code: CatalogApiErrorCode;
  readonly status: number;

  constructor(code: CatalogApiErrorCode, status: number) {
    super(TURKISH_MESSAGES[code]);
    this.name = "CatalogApiError";
    this.code = code;
    this.status = status;
  }
}

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type RandomUUID = () => string;

export type ProductListResult = Readonly<{ items: readonly Product[]; nextCursor?: string }>;
export type ProductDetailResult = Readonly<{ product: Product; variants: readonly ProductVariant[] }>;
export type CreateProductResult = Readonly<{ product: Product; initialVariant: ProductVariant; replayed: boolean }>;
export type ProductMutationResult = Readonly<{ product: Product; replayed: boolean }>;
export type VariantMutationResult = Readonly<{ variant: ProductVariant; replayed: boolean }>;
export type CatalogDashboardSummary = Readonly<{
  totalProducts: number;
  activeProducts: number;
  draftProducts: number;
  productLimit: number;
  activeVariants: number;
  outOfStockVariants: number;
  productsWithoutMedia: number;
  activeMedia: number;
}>;

const SUMMARY_KEYS = Object.freeze([
  "activeMedia",
  "activeProducts",
  "activeVariants",
  "draftProducts",
  "outOfStockVariants",
  "productLimit",
  "productsWithoutMedia",
  "totalProducts",
]);

function record(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null ? value as Record<string, unknown> : null;
}

function replayed(value: unknown): boolean {
  if (value === true || value === false) return value;
  throw new TypeError("catalog_response_invalid");
}

function safeErrorCode(value: unknown): CatalogApiErrorCode {
  const parsed = record(value);
  return parsed !== null && typeof parsed.code === "string" && API_CODES.includes(parsed.code as CatalogApiErrorCode)
    ? parsed.code as CatalogApiErrorCode
    : "unavailable";
}

async function json(response: Response): Promise<unknown> {
  const type = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (type !== "application/json") throw new CatalogApiError("unavailable", response.status || 503);
  try { return await response.json(); }
  catch { throw new CatalogApiError("unavailable", response.status || 503); }
}

function productId(value: string): string {
  if (!UUID.test(value)) throw new TypeError("catalog_client_invalid");
  return value;
}

function version(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError("catalog_client_invalid");
  return value;
}

function count(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new CatalogApiError("unavailable", 503);
  }
  return value as number;
}

function parseCatalogDashboardSummary(value: unknown): CatalogDashboardSummary {
  const parsed = record(value);
  if (parsed === null || JSON.stringify(Object.keys(parsed).sort()) !== JSON.stringify(SUMMARY_KEYS)) {
    throw new CatalogApiError("unavailable", 503);
  }
  const summary = Object.freeze({
    totalProducts: count(parsed.totalProducts),
    activeProducts: count(parsed.activeProducts),
    draftProducts: count(parsed.draftProducts),
    productLimit: count(parsed.productLimit),
    activeVariants: count(parsed.activeVariants),
    outOfStockVariants: count(parsed.outOfStockVariants),
    productsWithoutMedia: count(parsed.productsWithoutMedia),
    activeMedia: count(parsed.activeMedia),
  });
  if (
    summary.activeProducts + summary.draftProducts !== summary.totalProducts ||
    summary.outOfStockVariants > summary.activeVariants ||
    summary.productsWithoutMedia > summary.totalProducts
  ) {
    throw new CatalogApiError("unavailable", 503);
  }
  return summary;
}

export function createCatalogApiClient(options?: Readonly<{ fetch?: Fetch; randomUUID?: RandomUUID }>) {
  const fetchImpl = options?.fetch ?? ((input, init) => fetch(input, init));
  const randomUUID = options?.randomUUID ?? (() => crypto.randomUUID());

  async function request(path: string, init: RequestInit): Promise<unknown> {
    const response = await fetchImpl(path, init);
    const body = await json(response);
    if (!response.ok) throw new CatalogApiError(safeErrorCode(body), response.status);
    return body;
  }

  async function mutation(path: string, method: "POST" | "PATCH", body: unknown): Promise<unknown> {
    const operationId = randomUUID();
    if (!UUID.test(operationId)) throw new TypeError("catalog_client_invalid");
    return request(path, {
      method,
      credentials: "same-origin",
      headers: { "content-type": "application/json", "idempotency-key": operationId },
      body: JSON.stringify(body),
    });
  }

  return Object.freeze({
    async getDashboardSummary(): Promise<CatalogDashboardSummary> {
      return parseCatalogDashboardSummary(await request("/api/catalog/summary", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      }));
    },

    async listProducts(input: Readonly<{ status?: Exclude<ProductStatus, "archived">; cursor?: string }> = {}): Promise<ProductListResult> {
      if (input.cursor !== undefined && !CURSOR.test(input.cursor)) throw new TypeError("catalog_client_invalid");
      if (input.status !== undefined && input.status !== "draft" && input.status !== "active") {
        throw new TypeError("catalog_client_invalid");
      }
      const query = new URLSearchParams({ limit: "20" });
      if (input.status !== undefined) query.set("status", input.status);
      if (input.cursor !== undefined) query.set("cursor", input.cursor);
      const body = record(await request(`/api/catalog/products?${query}`, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      }));
      if (body === null || !Array.isArray(body.items)) throw new CatalogApiError("unavailable", 503);
      const items = Object.freeze(body.items.map(parseProduct));
      if (body.nextCursor !== undefined && (typeof body.nextCursor !== "string" || !CURSOR.test(body.nextCursor))) {
        throw new CatalogApiError("unavailable", 503);
      }
      return Object.freeze({ items, ...(body.nextCursor === undefined ? {} : { nextCursor: body.nextCursor }) });
    },

    async getProduct(id: string): Promise<ProductDetailResult> {
      const body = record(await request(`/api/catalog/products/${productId(id)}`, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      }));
      if (body === null || !Array.isArray(body.variants)) throw new CatalogApiError("unavailable", 503);
      return Object.freeze({ product: parseProduct(body.product), variants: Object.freeze(body.variants.map(parseProductVariant)) });
    },

    async createProduct(input: Readonly<{ product: CatalogProductFields; initialVariant: CatalogVariantFields }>): Promise<CreateProductResult> {
      const body = record(await mutation("/api/catalog/products", "POST", input));
      if (body === null) throw new CatalogApiError("unavailable", 503);
      return Object.freeze({ product: parseProduct(body.product), initialVariant: parseProductVariant(body.initialVariant), replayed: replayed(body.replayed) });
    },

    async updateProduct(id: string, input: Readonly<{ expectedVersion: number; product: CatalogProductFields }>): Promise<ProductMutationResult> {
      const body = record(await mutation(`/api/catalog/products/${productId(id)}`, "PATCH", {
        expectedVersion: version(input.expectedVersion),
        product: input.product,
      }));
      if (body === null) throw new CatalogApiError("unavailable", 503);
      return Object.freeze({ product: parseProduct(body.product), replayed: replayed(body.replayed) });
    },

    async archiveProduct(id: string, expectedVersion: number): Promise<ProductMutationResult> {
      const body = record(await mutation(`/api/catalog/products/${productId(id)}/archive`, "POST", { expectedVersion: version(expectedVersion) }));
      if (body === null) throw new CatalogApiError("unavailable", 503);
      return Object.freeze({ product: parseProduct(body.product), replayed: replayed(body.replayed) });
    },

    async createVariant(id: string, input: Readonly<{ variant: CatalogVariantFields }>): Promise<VariantMutationResult> {
      const body = record(await mutation(`/api/catalog/products/${productId(id)}/variants`, "POST", input));
      if (body === null) throw new CatalogApiError("unavailable", 503);
      return Object.freeze({ variant: parseProductVariant(body.variant), replayed: replayed(body.replayed) });
    },

    async updateVariant(id: string, variantId: string, input: Readonly<{ expectedVersion: number; variant: CatalogVariantFields }>): Promise<VariantMutationResult> {
      const body = record(await mutation(`/api/catalog/products/${productId(id)}/variants/${productId(variantId)}`, "PATCH", {
        expectedVersion: version(input.expectedVersion),
        variant: input.variant,
      }));
      if (body === null) throw new CatalogApiError("unavailable", 503);
      return Object.freeze({ variant: parseProductVariant(body.variant), replayed: replayed(body.replayed) });
    },

    async archiveVariant(id: string, variantId: string, expectedVersion: number): Promise<VariantMutationResult> {
      const body = record(await mutation(`/api/catalog/products/${productId(id)}/variants/${productId(variantId)}/archive`, "POST", { expectedVersion: version(expectedVersion) }));
      if (body === null) throw new CatalogApiError("unavailable", 503);
      return Object.freeze({ variant: parseProductVariant(body.variant), replayed: replayed(body.replayed) });
    },
  });
}

export const catalogApi = createCatalogApiClient();
