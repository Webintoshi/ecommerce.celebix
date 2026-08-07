import { loadStorefrontFontCatalog } from "../../../../lib/storefront-fonts/catalog.ts";

export async function GET(): Promise<Response> {
  const catalog = await loadStorefrontFontCatalog(fetch);
  return Response.json(catalog, {
    headers: {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
    },
  });
}
