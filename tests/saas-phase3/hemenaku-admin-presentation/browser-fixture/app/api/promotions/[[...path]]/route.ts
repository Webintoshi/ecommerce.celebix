import { PROMOTION, PROMOTION_ID, PROMOTION_LIST_ITEM } from "../../../mira-promotions/promotions-fixture.ts";

async function selectedPath(context: { params: Promise<{ path?: string[] }> }) {
  return (await context.params).path?.join("/") ?? "";
}

const unavailable = () => Response.json({ code: "promotion_unavailable" }, { status: 503 });
const rejectedMutation = () => Response.json({ code: "conflict" }, { status: 409 });

export async function GET(_request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const path = await selectedPath(context);
  if (path === "") return Response.json({ items: [PROMOTION_LIST_ITEM], nextCursor: null });
  if (path === PROMOTION_ID) return Response.json(PROMOTION);
  if (path === `${PROMOTION_ID}/code-batches`) return Response.json({ items: [], nextCursor: null });
  if (path === "targets") return Response.json({ items: [], nextCursor: null });
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
