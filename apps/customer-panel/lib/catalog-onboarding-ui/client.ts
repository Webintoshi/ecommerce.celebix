import {
  parseCatalogOnboardingIntent,
  parseCatalogOnboardingOptions,
  parseCatalogOnboardingResult,
  parseCatalogProductEditorProjection,
  parseCatalogCategoryFields,
  parseCatalogCategoryList,
  parseCatalogCategoryMutationResult,
  type CatalogCategory,
  type CatalogCategoryFields,
  type CatalogCategoryMutationResult,
  type CatalogOnboardingIntent,
  type CatalogOnboardingOptions,
  type CatalogOnboardingResourceIds,
  type CatalogOnboardingResult,
  type CatalogProductEditorProjection,
  type CatalogProductMerchandisingFields,
} from "@celebix/saas-contracts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const API_CODES = Object.freeze([
  "invalid_input", "unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled",
  "durable_authority_invalid", "product_limit_reached", "product_not_found", "catalog_conflict",
  "category_not_found", "category_in_use",
  "version_conflict", "invalid_transition", "media_incomplete", "operation_mismatch", "operation_not_found",
  "unavailable",
] as const);
export type CatalogOnboardingApiErrorCode = (typeof API_CODES)[number];

const MESSAGES: Readonly<Record<CatalogOnboardingApiErrorCode, string>> = Object.freeze({
  invalid_input: "Gönderilen ürün bilgileri geçersiz.",
  unauthenticated: "Oturumunuz sona erdi. Yeniden giriş yapın.",
  membership_denied: "Bu mağazada ürün yönetme yetkiniz yok.",
  store_inactive: "Mağaza şu anda ürün işlemlerine açık değil.",
  feature_not_enabled: "Ürün yönetimi mevcut planınızda etkin değil.",
  durable_authority_invalid: "Mağaza yetkisi doğrulanamadı.",
  product_limit_reached: "Planınızdaki ürün sınırına ulaştınız.",
  product_not_found: "Ürün bulunamadı veya artık erişilemiyor.",
  category_not_found: "Kategori bulunamadı veya artık erişilemiyor.",
  category_in_use: "Kategori alt kategorilerde veya etkin ürünlerde kullanılıyor.",
  catalog_conflict: "Bu ürün bilgileri mağazadaki başka bir kayıtla çakışıyor.",
  version_conflict: "Ürün sizden önce güncellendi. Sayfayı yenileyin.",
  invalid_transition: "Ürün bu durumda satışa açılamıyor.",
  media_incomplete: "Ürün görselleri henüz tamamlanmadı.",
  operation_mismatch: "İşlem güvenli biçimde tekrar edilemedi. Yeni bir deneme başlatın.",
  operation_not_found: "İşlem sonucu doğrulanamadı. Ürünü yenileyerek kontrol edin.",
  unavailable: "Ürün hizmeti şu anda kullanılamıyor. Lütfen yeniden deneyin.",
});

export class CatalogOnboardingApiError extends Error {
  readonly code: CatalogOnboardingApiErrorCode;
  readonly status: number;
  constructor(code: CatalogOnboardingApiErrorCode, status: number) {
    super(MESSAGES[code]);
    this.name = "CatalogOnboardingApiError";
    this.code = code;
    this.status = status;
  }
}

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type RandomUUID = () => string;
export type CatalogMerchandisingUpdate = Readonly<{
  expectedProfileVersion: number;
  profile: CatalogProductMerchandisingFields;
  categoryIds: readonly string[];
  resourceIds: CatalogOnboardingResourceIds;
  channelIds: readonly string[];
}>;

function record(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null ? value as Record<string, unknown> : null;
}

function safeCode(value: unknown): CatalogOnboardingApiErrorCode {
  const parsed = record(value);
  return parsed !== null && typeof parsed.code === "string" && API_CODES.includes(parsed.code as CatalogOnboardingApiErrorCode)
    ? parsed.code as CatalogOnboardingApiErrorCode
    : "unavailable";
}

function selectedId(value: string): string {
  if (!UUID.test(value)) throw new TypeError("catalog_onboarding_client_invalid");
  return value;
}

function positiveInteger(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError("catalog_onboarding_client_invalid");
  return value;
}

function mediaCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 16) throw new TypeError("catalog_onboarding_client_invalid");
  return value;
}

async function responseJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type");
  if (contentType === null || contentType.includes(",") || contentType.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    throw new CatalogOnboardingApiError("unavailable", response.status || 503);
  }
  try { return await response.json(); }
  catch { throw new CatalogOnboardingApiError("unavailable", response.status || 503); }
}

export function createCatalogOnboardingClient(options?: Readonly<{ fetch?: Fetch; randomUUID?: RandomUUID }>) {
  const fetchImpl = options?.fetch ?? ((input, init) => fetch(input, init));
  const randomUUID = options?.randomUUID ?? (() => crypto.randomUUID());

  async function request(path: string, init: RequestInit): Promise<unknown> {
    let response: Response;
    try { response = await fetchImpl(path, init); }
    catch { throw new CatalogOnboardingApiError("unavailable", 503); }
    const body = await responseJson(response);
    if (!response.ok) throw new CatalogOnboardingApiError(safeCode(body), response.status);
    return body;
  }

  async function mutation(path: string, method: "POST" | "PATCH", body: unknown): Promise<unknown> {
    const operationId = randomUUID();
    if (!UUID.test(operationId)) throw new TypeError("catalog_onboarding_client_invalid");
    return request(path, {
      method,
      credentials: "same-origin",
      headers: { "content-type": "application/json", "idempotency-key": operationId },
      body: JSON.stringify(body),
    });
  }

  return Object.freeze({
    async getOptions(signal?: AbortSignal): Promise<CatalogOnboardingOptions> {
      const body = await request("/api/catalog/onboarding/options", {
        method: "GET", credentials: "same-origin", cache: "no-store", ...(signal ? { signal } : {}),
      });
      try { return parseCatalogOnboardingOptions(body); }
      catch { throw new CatalogOnboardingApiError("unavailable", 503); }
    },

    async createProduct(input: CatalogOnboardingIntent): Promise<CatalogOnboardingResult> {
      let intent: CatalogOnboardingIntent;
      try { intent = parseCatalogOnboardingIntent(input); }
      catch { throw new TypeError("catalog_onboarding_client_invalid"); }
      const body = await mutation("/api/catalog/onboarding/products", "POST", intent);
      try { return parseCatalogOnboardingResult(body); }
      catch { throw new CatalogOnboardingApiError("unavailable", 503); }
    },

    async getProductEditor(productId: string, signal?: AbortSignal): Promise<CatalogProductEditorProjection> {
      const body = await request(`/api/catalog/products/${selectedId(productId)}/merchandising`, {
        method: "GET", credentials: "same-origin", cache: "no-store", ...(signal ? { signal } : {}),
      });
      try { return parseCatalogProductEditorProjection(body); }
      catch { throw new CatalogOnboardingApiError("unavailable", 503); }
    },

    async updateMerchandising(productId: string, input: CatalogMerchandisingUpdate): Promise<CatalogOnboardingResult> {
      const body = await mutation(`/api/catalog/products/${selectedId(productId)}/merchandising`, "PATCH", {
        ...input,
        expectedProfileVersion: positiveInteger(input.expectedProfileVersion),
      });
      try { return parseCatalogOnboardingResult(body); }
      catch { throw new CatalogOnboardingApiError("unavailable", 503); }
    },

    async publishAfterMedia(productId: string, input: Readonly<{ expectedProductVersion: number; expectedMediaCount: number }>): Promise<CatalogOnboardingResult> {
      const body = await mutation(`/api/catalog/products/${selectedId(productId)}/publish-after-media`, "POST", {
        expectedProductVersion: positiveInteger(input.expectedProductVersion),
        expectedMediaCount: mediaCount(input.expectedMediaCount),
      });
      try { return parseCatalogOnboardingResult(body); }
      catch { throw new CatalogOnboardingApiError("unavailable", 503); }
    },

    async listCategories(signal?: AbortSignal): Promise<readonly CatalogCategory[]> {
      const body = await request("/api/catalog/onboarding/categories", {
        method: "GET", credentials: "same-origin", cache: "no-store", ...(signal ? { signal } : {}),
      });
      try { return parseCatalogCategoryList(body); }
      catch { throw new CatalogOnboardingApiError("unavailable", 503); }
    },

    async createCategory(fields: CatalogCategoryFields): Promise<CatalogCategoryMutationResult> {
      let parsed: CatalogCategoryFields;
      try { parsed = parseCatalogCategoryFields(fields); }
      catch { throw new TypeError("catalog_onboarding_client_invalid"); }
      const body = await mutation("/api/catalog/onboarding/categories", "POST", parsed);
      try { return parseCatalogCategoryMutationResult(body); }
      catch { throw new CatalogOnboardingApiError("unavailable", 503); }
    },

    async updateCategory(categoryId: string, input: Readonly<{ expectedVersion: number; fields: CatalogCategoryFields }>): Promise<CatalogCategoryMutationResult> {
      let fields: CatalogCategoryFields;
      try { fields = parseCatalogCategoryFields(input.fields); }
      catch { throw new TypeError("catalog_onboarding_client_invalid"); }
      const body = await mutation(`/api/catalog/onboarding/categories/${selectedId(categoryId)}`, "PATCH", {
        expectedVersion: positiveInteger(input.expectedVersion), fields,
      });
      try { return parseCatalogCategoryMutationResult(body); }
      catch { throw new CatalogOnboardingApiError("unavailable", 503); }
    },

    async archiveCategory(categoryId: string, expectedVersion: number): Promise<CatalogCategoryMutationResult> {
      const body = await mutation(`/api/catalog/onboarding/categories/${selectedId(categoryId)}/archive`, "POST", {
        expectedVersion: positiveInteger(expectedVersion),
      });
      try { return parseCatalogCategoryMutationResult(body); }
      catch { throw new CatalogOnboardingApiError("unavailable", 503); }
    },
  });
}

export const catalogOnboardingClient = createCatalogOnboardingClient();
