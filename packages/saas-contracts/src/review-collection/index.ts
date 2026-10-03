export type ReviewCollectionSettings = Readonly<{ enabled: boolean; delayDays: number; version: number }>;
export type ReviewSubmission = Readonly<{ reviewerName: string; rating: number; title?: string; body: string }>;
export type ReviewRequestStatus = "queued" | "leased" | "sent" | "completed" | "failed" | "suppressed" | "requires_review";
export type ReviewRequestSummary = Readonly<{ id: string; orderId: string; orderNumber: string; productTitle: string; customerName: string; status: ReviewRequestStatus; scheduledAt: string; updatedAt: string; errorCode?: string }>;
export type ReviewEligibleOrder = Readonly<{ id: string; orderNumber: string; customerName: string; version: number; deliveredAt: string; productCount: number }>;
export type ReviewCollectionOverview = Readonly<{ settings: ReviewCollectionSettings; requests: readonly ReviewRequestSummary[]; eligibleOrders: readonly ReviewEligibleOrder[] }>;
export type ReviewInvitation = Readonly<{ kind: "available" | "completed"; productTitle: string; storeName: string }>;
function invalid(): never { throw new TypeError("review_collection_invalid"); }
function record(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid();
  const parsed = value as Record<string, unknown>, keys = new Set([...required, ...optional]);
  if (required.some(key => !Object.hasOwn(parsed, key)) || Object.keys(parsed).some(key => !keys.has(key))) invalid();
  return parsed;
}
function integer(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): number { if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) invalid(); return value as number; }
function text(value: unknown, max: number): string { if (typeof value !== "string" || value.length < 1 || value.length > max || value !== value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) invalid(); return value; }
function uuid(value: unknown): string { const result = text(value, 36); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(result)) invalid(); return result; }
function timestamp(value: unknown): string { const result = text(value, 40); if (!Number.isFinite(Date.parse(result))) invalid(); return result; }
export function createDefaultReviewCollectionSettings(): ReviewCollectionSettings { return Object.freeze({ enabled: false, delayDays: 7, version: 0 }); }
export function parseReviewCollectionSettings(value: unknown): ReviewCollectionSettings { const parsed = record(value, ["enabled", "delayDays", "version"]); if (typeof parsed.enabled !== "boolean") invalid(); return Object.freeze({ enabled: parsed.enabled, delayDays: integer(parsed.delayDays, 1, 60), version: integer(parsed.version, 0) }); }
export function parseReviewSubmission(value: unknown): ReviewSubmission { const parsed = record(value, ["reviewerName", "rating", "body"], ["title"]); return Object.freeze({ reviewerName: text(parsed.reviewerName, 120), rating: integer(parsed.rating, 1, 5), ...(parsed.title === undefined ? {} : { title: text(parsed.title, 200) }), body: text(parsed.body, 2000) }); }
export function parseReviewCollectionOverview(value: unknown): ReviewCollectionOverview {
  const parsed = record(value, ["settings", "requests", "eligibleOrders"]);
  if (!Array.isArray(parsed.requests) || parsed.requests.length > 200 || !Array.isArray(parsed.eligibleOrders) || parsed.eligibleOrders.length > 100) invalid();
  const requests = parsed.requests.map(value => {
    const r = record(value, ["id", "orderId", "orderNumber", "productTitle", "customerName", "status", "scheduledAt", "updatedAt"], ["errorCode"]);
    if (!["queued", "leased", "sent", "completed", "failed", "suppressed", "requires_review"].includes(String(r.status))) invalid();
    return Object.freeze({ id: uuid(r.id), orderId: uuid(r.orderId), orderNumber: text(r.orderNumber, 100), productTitle: text(r.productTitle, 200), customerName: text(r.customerName, 200), status: r.status as ReviewRequestStatus, scheduledAt: timestamp(r.scheduledAt), updatedAt: timestamp(r.updatedAt), ...(r.errorCode === undefined ? {} : { errorCode: text(r.errorCode, 64) }) });
  });
  const eligibleOrders = parsed.eligibleOrders.map(value => { const r = record(value, ["id", "orderNumber", "customerName", "version", "deliveredAt", "productCount"]); return Object.freeze({ id: uuid(r.id), orderNumber: text(r.orderNumber, 100), customerName: text(r.customerName, 200), version: integer(r.version, 1), deliveredAt: timestamp(r.deliveredAt), productCount: integer(r.productCount, 1, 100) }); });
  return Object.freeze({ settings: parseReviewCollectionSettings(parsed.settings), requests: Object.freeze(requests), eligibleOrders: Object.freeze(eligibleOrders) });
}
export function parseReviewInvitation(value: unknown): ReviewInvitation { const parsed = record(value, ["kind", "productTitle", "storeName"]); if (parsed.kind !== "available" && parsed.kind !== "completed") invalid(); return Object.freeze({ kind: parsed.kind, productTitle: text(parsed.productTitle, 200), storeName: text(parsed.storeName, 120) }); }
