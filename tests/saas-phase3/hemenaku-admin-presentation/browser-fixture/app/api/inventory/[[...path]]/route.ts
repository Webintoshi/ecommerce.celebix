import { GET as fallbackGET } from "../../[...slug]/route";
import { COUNT, COUNT_ID, LOCATIONS, PURCHASE, PURCHASE_ID, TRANSFER, TRANSFER_ID } from "../../../mira-stock/stock-fixture";

async function selectedPath(context: { params: Promise<{ path?: string[] }> }) {
  return (await context.params).path?.join("/") ?? "";
}

export async function GET(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const path = await selectedPath(context);
  if (path === "locations") return Response.json({ items: LOCATIONS });
  if (path === "purchase-orders") return Response.json({ items: [PURCHASE] });
  if (path === `purchase-orders/${PURCHASE_ID}`) return Response.json(PURCHASE);
  if (path === "counts") return Response.json({ items: [COUNT] });
  if (path === `counts/${COUNT_ID}`) return Response.json(COUNT);
  if (path === "transfers") return Response.json({ items: [TRANSFER] });
  if (path === `transfers/${TRANSFER_ID}`) return Response.json(TRANSFER);
  return fallbackGET(request, { params: Promise.resolve({ slug: ["inventory", ...path.split("/").filter(Boolean)] }) });
}

export async function POST() {
  return Response.json({ code: "conflict" }, { status: 409 });
}
