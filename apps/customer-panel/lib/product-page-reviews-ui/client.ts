import { parseProductPageReviewSettings, type ProductPageReviewSettings } from "@celebix/saas-contracts";

const PATH = "/api/catalog/admin/product-page-reviews/settings";
const CODES = ["invalid_input", "unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled", "version_conflict", "operation_mismatch", "unavailable"] as const;
type Code = (typeof CODES)[number];
const MESSAGES: Record<Code, string> = {
  invalid_input: "Yorum yazma ayarı geçersiz.",
  unauthenticated: "Oturumunuz sona erdi. Yeniden giriş yapın.",
  membership_denied: "Bu ayarı değiştirme yetkiniz yok.",
  store_inactive: "Mağaza şu anda kullanılamıyor.",
  feature_not_enabled: "Yorum yönetimi planınızda etkin değil.",
  version_conflict: "Ayar sizden önce değişti. Seçiminiz korundu; güncel ayarı yükleyin.",
  operation_mismatch: "İşlem sonucu doğrulanamadı. Aynı işlemi yeniden deneyin.",
  unavailable: "Yorum yazma ayarı şu anda doğrulanamıyor. Yeniden deneyin.",
};
export class ProductPageReviewSettingsApiError extends Error {
  constructor(readonly code: Code, readonly status: number) { super(MESSAGES[code]); this.name = "ProductPageReviewSettingsApiError"; }
}
export type ProductPageReviewSettingsCommand = Readonly<{ expectedVersion: number; enabled: boolean }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function createProductPageReviewSettingsClient(fetcher: typeof fetch = fetch) {
  async function request(init: RequestInit): Promise<ProductPageReviewSettings> {
    const response = await fetcher(PATH, { credentials: "same-origin", cache: "no-store", ...init });
    let body: unknown;
    try {
      if (response.headers.get("content-type")?.split(";", 1)[0] !== "application/json") throw new Error("invalid_json");
      body = await response.json();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      throw new ProductPageReviewSettingsApiError("unavailable", 503);
    }
    if (!response.ok) {
      const code = typeof body === "object" && body !== null && "code" in body && CODES.includes(body.code as Code) ? body.code as Code : "unavailable";
      throw new ProductPageReviewSettingsApiError(code, response.status);
    }
    try { return parseProductPageReviewSettings(body); }
    catch { throw new ProductPageReviewSettingsApiError("unavailable", 503); }
  }
  return Object.freeze({
    get(signal?: AbortSignal) { return request({ method: "GET", ...(signal ? { signal } : {}) }); },
    save(command: ProductPageReviewSettingsCommand, operationId: string, signal?: AbortSignal) {
      if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 0 || typeof command.enabled !== "boolean" || !UUID.test(operationId)) throw new TypeError("product_page_reviews_client_invalid");
      return request({ method: "POST", headers: { "content-type": "application/json", "idempotency-key": operationId }, body: JSON.stringify({ expectedVersion: command.expectedVersion, enabled: command.enabled }), ...(signal ? { signal } : {}) });
    },
  });
}
export const productPageReviewSettingsApi = createProductPageReviewSettingsClient();
