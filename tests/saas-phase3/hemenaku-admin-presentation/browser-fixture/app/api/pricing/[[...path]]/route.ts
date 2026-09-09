import { VARIANT_ID } from "../../../mira-catalog/catalog-fixture.ts";
import { PRICE_LIST, PRICE_LIST_ID, STOCK_PREVIEW_NOW } from "../../../mira-stock/stock-fixture.ts";

async function selectedPath(context: { params: Promise<{ path?: string[] }> }) {
  return (await context.params).path?.join("/") ?? "";
}

export async function GET(_request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const path = await selectedPath(context);
  if (path === "price-lists") return Response.json({ items: [PRICE_LIST] });
  if (path === `price-lists/${PRICE_LIST_ID}`) return Response.json(PRICE_LIST);
  return Response.json({ code: "not_found" }, { status: 404 });
}

export async function POST(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const path = await selectedPath(context);
  if (path === "preview") {
    const value = await request.json() as { channel?: string; variantIds?: string[] };
    const channel = value.channel === "quick_order" ? "quick_order" : "storefront";
    const variantIds = Array.isArray(value.variantIds) && value.variantIds.length ? value.variantIds : [VARIANT_ID];
    return Response.json({
      entries: variantIds.map((variantId) => ({ variantId, channel, basePriceCents: 249_900, effectivePriceCents: 229_900, sourceKind: "price_list", priceListId: PRICE_LIST_ID })),
      asOf: STOCK_PREVIEW_NOW,
    });
  }
  return Response.json({ code: "conflict" }, { status: 409 });
}
