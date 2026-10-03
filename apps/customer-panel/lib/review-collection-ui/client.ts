import { parseReviewCollectionOverview, parseReviewCollectionSettings, type ReviewCollectionSettings } from "@celebix/saas-contracts";
export class ReviewCollectionApiError extends Error {
  constructor(readonly code: string) { super(code === "version_conflict" ? "Ayarlar başka bir oturumda değişti. Güncel kaydı yeniden yükleyin." : code === "ineligible_order" ? "Sipariş artık yorum daveti için uygun değil." : code === "operation_mismatch" ? "İşlem bilgileri değişti. Yeniden deneyin." : "İşlem tamamlanamadı. Bilgileriniz korunuyor; tekrar deneyebilirsiniz."); }
}
export function createReviewCollectionApi(fetcher: typeof fetch = fetch) {
  async function request(path = "", value?: unknown, operationId?: string) {
    const response = await fetcher(`/api/catalog/admin/review-collection${path}`, { credentials: "same-origin", cache: "no-store", ...(value === undefined ? {} : { method: "POST", headers: { "content-type": "application/json", "idempotency-key": operationId! }, body: JSON.stringify(value) }) });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new ReviewCollectionApiError(typeof result?.code === "string" ? result.code : "unavailable");
    return result;
  }
  return Object.freeze({ async overview() { return parseReviewCollectionOverview(await request()); }, async saveSettings(value: ReviewCollectionSettings, operationId: string) { return parseReviewCollectionSettings(await request("/settings", { enabled: value.enabled, delayDays: value.delayDays, expectedVersion: value.version }, operationId)); }, async requestOrder(orderId: string, expectedVersion: number, operationId: string) { const result = await request("/request", { orderId, expectedVersion }, operationId); if (!Number.isSafeInteger(result?.queuedCount) || result.queuedCount < 0 || result.queuedCount > 100) throw new ReviewCollectionApiError("unavailable"); return Object.freeze({ queuedCount: result.queuedCount as number }); } });
}
export const reviewCollectionApi = createReviewCollectionApi();
