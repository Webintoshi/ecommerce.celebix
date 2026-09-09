import { CATEGORIES, EDITOR, EXTRA_ID, NOW, OPTIONS, PRODUCT, PRODUCT_ID, RESOURCES, VARIANT, VARIANT_ID } from "../../../mira-catalog/catalog-fixture";
import { GET as fallbackGET, PATCH as fallbackPATCH } from "../../[...slug]/route";

async function selectedPath(context: { params: Promise<{ path?: string[] }> }) {
  return (await context.params).path?.join("/") ?? "";
}

function fallbackContext(path: string) {
  return { params: Promise.resolve({ slug: ["catalog", ...path.split("/").filter(Boolean)] }) };
}

function fixtureMutationTarget(path: string) {
  return path === "products" || path === `products/${PRODUCT_ID}` || path.startsWith(`products/${PRODUCT_ID}/`) ||
    path.startsWith("admin/resources/") || path === "admin/reviews";
}

export async function GET(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const path = await selectedPath(context);
  if (path === "summary") return Response.json({ totalProducts: 1, activeProducts: 1, draftProducts: 0, productLimit: 100, activeVariants: 1, outOfStockVariants: 0, productsWithoutMedia: 1, activeMedia: 0 });
  if (path === "products") {
    const search = new URL(request.url).searchParams;
    const query = search.get("q")?.trim().toLocaleLowerCase("tr-TR");
    const requestedStatus = search.get("status");
    const stock = search.get("stock");
    const relationMismatch = (search.has("category") && search.get("category") !== CATEGORIES[0].id) ||
      (search.has("brand") && search.get("brand") !== RESOURCES.brand.id) ||
      (search.has("collection") && search.get("collection") !== RESOURCES.collection.id);
    const matches = !search.has("cursor") && !relationMismatch &&
      (!requestedStatus || requestedStatus === PRODUCT.status) &&
      (!query || `${PRODUCT.title} ${VARIANT.sku}`.toLocaleLowerCase("tr-TR").includes(query)) &&
      (!stock || stock === "in-stock");
    const items = matches ? [PRODUCT] : [];
    return Response.json({
      items,
      catalogTotal: 1,
      variantSummaries: matches ? { [PRODUCT_ID]: { variantId: VARIANT_ID, sku: VARIANT.sku, priceCents: VARIANT.priceCents, compareAtCents: VARIANT.compareAtCents, stockTracking: true, stockQuantity: VARIANT.stockQuantity } } : {},
    });
  }
  if (path === `products/${PRODUCT_ID}`) return Response.json({ product: PRODUCT, variants: [VARIANT] });
  if (path === `products/${PRODUCT_ID}/merchandising`) return Response.json(EDITOR);
  if (path === `products/${PRODUCT_ID}/media`) return Response.json({ media: [] });
  if (path === "onboarding/options") return Response.json(OPTIONS);
  if (path === "onboarding/categories") return Response.json(CATEGORIES);
  if (path === "admin/reviews") return Response.json({ items: [{ id: "91000000-0000-4000-8000-000000000012", productId: PRODUCT_ID, productTitle: PRODUCT.title, reviewerName: "Ada Yılmaz", rating: 5, title: "Dokusu çok iyi", body: "Kesimi ve kumaşı beklediğim gibi.", status: "pending", version: 1, createdAt: NOW, updatedAt: NOW }] });
  const resourceMatch = /^admin\/resources\/(collection|brand|attribute|extra|definition|tag)(?:\/([0-9a-f-]+))?$/.exec(path);
  if (resourceMatch) {
    const item = RESOURCES[resourceMatch[1] as keyof typeof RESOURCES];
    if (!resourceMatch[2]) return Response.json({ items: [item] });
    if (resourceMatch[2] === item.id || resourceMatch[2] === EXTRA_ID) return Response.json(item);
  }
  return fallbackGET(request, fallbackContext(path));
}

export async function POST(_request: Request, context: { params: Promise<{ path?: string[] }> }) {
  if (!fixtureMutationTarget(await selectedPath(context))) return Response.json({ code: "invalid_input" }, { status: 400 });
  return Response.json({ code: "version_conflict" }, { status: 409 });
}

export async function PATCH(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const path = await selectedPath(context);
  if (!fixtureMutationTarget(path)) return fallbackPATCH(request, fallbackContext(path));
  return Response.json({ code: "version_conflict" }, { status: 409 });
}
