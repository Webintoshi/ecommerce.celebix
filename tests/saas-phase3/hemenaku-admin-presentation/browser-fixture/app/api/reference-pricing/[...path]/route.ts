const SET_ID = "20000000-0000-4000-8000-000000000001";
const VARIANT_ID = "40000000-0000-4000-8000-000000000001";
const USD = "30000000-0000-4000-8000-000000000001";
const EUR = "30000000-0000-4000-8000-000000000002";
const GOLD = "30000000-0000-4000-8000-000000000003";
const NOW = "2026-09-20T12:00:00.000000Z";
const definitions = Object.freeze([
  { id: USD, kind: "usd", label: "USD satış", createdAt: NOW },
  { id: EUR, kind: "eur", label: "EUR satış", createdAt: NOW },
  { id: GOLD, kind: "gold_gram", label: "22 ayar gram satış", referencePurity: "0.916", createdAt: NOW },
]);
const set = Object.freeze({
  setId: SET_ID, version: 1, stateVersion: 2, isActive: true, createdAt: NOW,
  values: Object.freeze([
    { referenceId: USD, kind: "usd", label: "USD satış", rateTry: "40.5", active: true },
    { referenceId: EUR, kind: "eur", label: "EUR satış", rateTry: "46.2", active: true },
    { referenceId: GOLD, kind: "gold_gram", label: "22 ayar gram satış", referencePurity: "0.916", rateTry: "5000", active: true },
  ]),
});
const policy = Object.freeze({ method: "gold_gram", referenceId: GOLD, metalGrams: "2.5", purityMode: "direct", laborMode: "per_item_try", laborAmount: "750", upliftPercent: "0", allowFullDiscount: false });

async function selectedPath(context: { params: Promise<{ path: string[] }> }) {
  return (await context.params).path.join("/");
}

export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  const path = await selectedPath(context);
  if (path === "definitions") return Response.json({ items: definitions });
  if (path === "sets") return Response.json({ activeSetId: SET_ID, stateVersion: 2, items: [{ setId: SET_ID, version: 1, createdAt: NOW, isActive: true }], nextCursor: null });
  if (path === "sets/current" || path === `sets/${SET_ID}`) return Response.json(set);
  if (path === `policies/${VARIANT_ID}`) return Response.json({ variantId: VARIANT_ID, variantVersion: 4, version: 1, policy, updatedAt: NOW });
  return Response.json({ code: "not_found" }, { status: 404 });
}

export async function POST(_request: Request) {
  // This browser fixture never writes a reference, policy or product.
  return Response.json({ code: "conflict" }, { status: 409 });
}
