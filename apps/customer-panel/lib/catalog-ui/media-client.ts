import { parseProductMedia, type ProductMedia } from "../../../../packages/saas-contracts/src/media/index.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5_242_880;
const API_CODES = Object.freeze([
  "invalid_input", "unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled",
  "product_not_found", "variant_not_found", "media_not_found", "media_limit_reached", "version_conflict",
  "operation_mismatch", "origin_denied", "unavailable",
] as const);
export type ProductMediaApiErrorCode = (typeof API_CODES)[number];

const MESSAGES: Readonly<Record<ProductMediaApiErrorCode, string>> = Object.freeze({
  invalid_input: "Görsel geçersiz. PNG, JPEG veya WebP biçiminde ve en fazla 5 MB bir dosya seçin.",
  unauthenticated: "Oturumunuz sona erdi. Yeniden giriş yapın.",
  membership_denied: "Bu mağazada görsel yönetme yetkiniz yok.",
  store_inactive: "Mağaza etkin olmadığı için görsel işlemi yapılamıyor.",
  feature_not_enabled: "Planınızda ürün görselleri etkin değil.",
  product_not_found: "Ürün bulunamadı veya artık erişilemiyor.",
  variant_not_found: "Seçilen varyant bulunamadı.",
  media_not_found: "Görsel bulunamadı veya artık erişilemiyor.",
  media_limit_reached: "Bu ürün için görsel sınırına ulaştınız.",
  version_conflict: "Görsel sizden önce güncellendi. Liste yeniden yüklenecek.",
  operation_mismatch: "İşlem güvenli biçimde tekrar edilemedi. Yeni bir deneme başlatın.",
  origin_denied: "İstek güvenli panel kaynağından gelmedi.",
  unavailable: "Görsel hizmeti şu anda kullanılamıyor. Lütfen yeniden deneyin.",
});

export class ProductMediaApiError extends Error {
  readonly code: ProductMediaApiErrorCode;
  readonly status: number;
  constructor(code: ProductMediaApiErrorCode, status: number) {
    super(MESSAGES[code]);
    this.name = "ProductMediaApiError";
    this.code = code;
    this.status = status;
  }
}

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type UploadInput = Readonly<{ path: string; operationId: string; form: FormData; onProgress(value: number): void }>;
type Upload = (input: UploadInput) => Promise<Response>;

function record(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null ? value as Record<string, unknown> : null;
}
function id(value: string): string { if (!UUID.test(value)) throw new TypeError("media_client_invalid"); return value; }
function version(value: number): number { if (!Number.isSafeInteger(value) || value < 1) throw new TypeError("media_client_invalid"); return value; }
function operation(randomUUID: () => string): string { return id(randomUUID()); }
function errorCode(value: unknown): ProductMediaApiErrorCode {
  const body = record(value), code = body?.code;
  return typeof code === "string" && API_CODES.includes(code as ProductMediaApiErrorCode) ? code as ProductMediaApiErrorCode : "unavailable";
}
async function body(response: Response): Promise<unknown> {
  const type = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (type !== "application/json") throw new ProductMediaApiError("unavailable", response.status || 503);
  try { return await response.json(); } catch { throw new ProductMediaApiError("unavailable", response.status || 503); }
}
async function result(response: Response): Promise<Record<string, unknown>> {
  const parsed = await body(response);
  if (!response.ok) throw new ProductMediaApiError(errorCode(parsed), response.status);
  const selected = record(parsed);
  if (selected === null) throw new ProductMediaApiError("unavailable", 503);
  return selected;
}

function browserUpload(input: UploadInput): Promise<Response> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", input.path, true);
    request.withCredentials = true;
    request.responseType = "text";
    request.setRequestHeader("idempotency-key", input.operationId);
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0) input.onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    });
    request.addEventListener("load", () => {
      const type = request.getResponseHeader("content-type");
      resolve(new Response(request.responseText, { status: request.status, headers: type ? { "content-type": type } : undefined }));
    });
    request.addEventListener("error", () => reject(new ProductMediaApiError("unavailable", 503)));
    request.addEventListener("abort", () => reject(new ProductMediaApiError("unavailable", 503)));
    request.send(input.form);
  });
}

export function createProductMediaApiClient(options?: Readonly<{ fetch?: Fetch; upload?: Upload; randomUUID?: () => string }>) {
  const fetchImpl = options?.fetch ?? ((input, init) => fetch(input, init));
  const uploadImpl = options?.upload ?? browserUpload;
  const randomUUID = options?.randomUUID ?? (() => crypto.randomUUID());
  async function jsonMutation(path: string, method: "POST" | "PATCH", payload: unknown): Promise<Record<string, unknown>> {
    return result(await fetchImpl(path, { method, credentials: "same-origin", headers: { "content-type": "application/json", "idempotency-key": operation(randomUUID) }, body: JSON.stringify(payload) }));
  }
  function mutationMedia(value: Record<string, unknown>): Readonly<{ media: ProductMedia; replayed: boolean }> {
    if (typeof value.replayed !== "boolean") throw new ProductMediaApiError("unavailable", 503);
    return Object.freeze({ media: parseProductMedia(value.media), replayed: value.replayed });
  }
  return Object.freeze({
    async list(productId: string): Promise<readonly ProductMedia[]> {
      const selected = id(productId);
      const response = await result(await fetchImpl(`/api/catalog/products/${selected}/media`, { method: "GET", credentials: "same-origin", cache: "no-store" }));
      if (!Array.isArray(response.media)) throw new ProductMediaApiError("unavailable", 503);
      return Object.freeze(response.media.map(parseProductMedia));
    },
    async upload(productId: string, input: Readonly<{ file: File; altText: string; variantId?: string; onProgress(value: number): void }>) {
      const selected = id(productId);
      if (!(input.file instanceof File) || !MEDIA_TYPES.has(input.file.type) || input.file.size < 1 || input.file.size > MAX_BYTES || input.altText.trim() !== input.altText || input.altText.length > 500 || (input.variantId !== undefined && !UUID.test(input.variantId))) throw new ProductMediaApiError("invalid_input", 400);
      const form = new FormData(); form.set("file", input.file); form.set("altText", input.altText); if (input.variantId !== undefined) form.set("variantId", input.variantId);
      const response = mutationMedia(await result(await uploadImpl({ path: `/api/catalog/products/${selected}/media`, operationId: operation(randomUUID), form, onProgress: input.onProgress })));
      input.onProgress(100);
      return response;
    },
    async updateAlt(productId: string, mediaId: string, input: Readonly<{ expectedVersion: number; altText: string }>) {
      if (input.altText.trim() !== input.altText || input.altText.length > 500) throw new ProductMediaApiError("invalid_input", 400);
      return mutationMedia(await jsonMutation(`/api/catalog/products/${id(productId)}/media/${id(mediaId)}`, "PATCH", { expectedVersion: version(input.expectedVersion), altText: input.altText }));
    },
    async reorder(productId: string, orderedMediaIds: readonly string[]): Promise<readonly ProductMedia[]> {
      if (!Array.isArray(orderedMediaIds) || orderedMediaIds.length > 16 || orderedMediaIds.some((value) => !UUID.test(value)) || new Set(orderedMediaIds).size !== orderedMediaIds.length) throw new ProductMediaApiError("invalid_input", 400);
      const response = await jsonMutation(`/api/catalog/products/${id(productId)}/media/reorder`, "POST", { orderedMediaIds });
      if (!Array.isArray(response.media)) throw new ProductMediaApiError("unavailable", 503);
      return Object.freeze(response.media.map(parseProductMedia));
    },
    async archive(productId: string, mediaId: string, expectedVersion: number) {
      return mutationMedia(await jsonMutation(`/api/catalog/products/${id(productId)}/media/${id(mediaId)}/archive`, "POST", { expectedVersion: version(expectedVersion) }));
    },
  });
}

export const productMediaApi = createProductMediaApiClient();
