import { parsePromotionAnalyticsDetailResult, parsePromotionCodeBatchListItem } from "@celebix/saas-contracts";
import { PROMOTION, PROMOTION_ID, PROMOTION_LIST_ITEM, PROMOTION_NOW } from "../../../mira-promotions/promotions-fixture.ts";

async function selectedPath(context: { params: Promise<{ path?: string[] }> }) {
  return (await context.params).path?.join("/") ?? "";
}

const unavailable = () => Response.json({ code: "promotion_unavailable" }, { status: 503 });
const rejectedMutation = () => Response.json({ code: "conflict" }, { status: 409 });

// Opt-in presentation data for bounded-table QA. The default error/empty states remain available.
const filledAnalytics = parsePromotionAnalyticsDetailResult({
  periodDays: 90,
  currencies: [
    { currency: "TRY", usageCount: 14, affectedOrders: 12, discountMinor: 90_000, grossRevenueMinor: 1_310_000, netRevenueMinor: 1_220_000, averageOrderMinor: 101_666, newCustomerOrders: 3, recoveredOrders: 2, recoveredRevenueMinor: 230_000 },
    { currency: "USD", usageCount: 3, affectedOrders: 3, discountMinor: 3_000, grossRevenueMinor: 24_000, netRevenueMinor: 21_000, averageOrderMinor: 7_000, newCustomerOrders: 1, recoveredOrders: 0, recoveredRevenueMinor: 0 },
  ],
  attribution: [
    { source: "instagram-qa-seasonal-jewelry-collection-campaign", medium: "social-qa-long-attribution-source", campaign: "Mira kontrollü kampanya / yeni sezon kuyumculuk koleksiyonu", currency: "TRY", orders: 9, revenueMinor: 950_000 },
    { source: "email", medium: "newsletter", campaign: "Mira QA tekrar alışveriş kampanyası", currency: "TRY", orders: 3, revenueMinor: 270_000 },
  ],
  topProducts: [
    { productId: "95000000-0000-4000-8000-000000000001", label: "Mira QA yeni sezon özel tasarım bileklik ve uzun ürün başlığı", currency: "TRY", quantity: 12, revenueMinor: 650_000 },
    { productId: "95000000-0000-4000-8000-000000000002", label: "MIRA_QA_UZUN_URUN_REFERANSI_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_ABCDEFGHIJKLMNOPQRSTUVWXYZ", currency: "TRY", quantity: 8, revenueMinor: 570_000 },
  ],
  topCategories: [
    { categoryId: null, label: "Yeni sezon özel koleksiyon / bileklikler ve kişiye özel tasarımlar", currency: "TRY", quantity: 20, revenueMinor: 1_220_000 },
  ],
});
const filledBatches = (["active", "paused", "revoked"] as const).map((status, index) => parsePromotionCodeBatchListItem({
  id: `94000000-0000-4000-8000-00000000000${index + 1}`,
  promotionId: PROMOTION_ID,
  version: 1,
  status,
  count: 100,
  prefix: ["MIRA_QA_", "VIP_QA_", "OLD_QA_"][index],
  codeLength: 32,
  perCustomerUsage: 1,
  expiresAt: null,
  createdAt: PROMOTION_NOW,
  updatedAt: PROMOTION_NOW,
  used: 12,
  held: 3,
  remaining: status === "active" ? 85 : 0,
}));
function hasFilledReferrer(request: Request) {
  try { return new URL(request.headers.get("referer") ?? "").searchParams.get("fixture") === "filled"; }
  catch { return false; }
}
function hasEmptyReferrer(request: Request) {
  try { return new URL(request.headers.get("referer") ?? "").searchParams.get("fixture") === "empty"; }
  catch { return false; }
}

export async function GET(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const path = await selectedPath(context);
  if (path === "") return Response.json({ items: hasEmptyReferrer(request) ? [] : [PROMOTION_LIST_ITEM], nextCursor: null });
  if (path === PROMOTION_ID) return Response.json(PROMOTION);
  if (path === `${PROMOTION_ID}/code-batches`) return Response.json({ items: hasFilledReferrer(request) ? filledBatches : [], nextCursor: null });
  if (path === "targets") return Response.json({ items: [], nextCursor: null });
  if (path === `${PROMOTION_ID}/analytics` && new URL(request.url).searchParams.get("days") === "90") return Response.json(filledAnalytics);
  const csvBatch = hasFilledReferrer(request) ? filledBatches.find(batch => path === `code-batches/${batch.id}/csv`) : undefined;
  if (csvBatch) return new Response(`code,status\r\n${csvBatch.prefix}SYNTHETICQA00000001,${csvBatch.status}\r\n`, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=\"mira-qa-codes.csv\"", "cache-control": "no-store" } });
  if (path === "overview" || path === `${PROMOTION_ID}/analytics`) return unavailable();
  return Response.json({ code: "not_found" }, { status: 404 });
}

export async function POST() {
  return rejectedMutation();
}

export async function PATCH() {
  return rejectedMutation();
}

export async function PUT() {
  return rejectedMutation();
}

export async function DELETE() {
  return rejectedMutation();
}
