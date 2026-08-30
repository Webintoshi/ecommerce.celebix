import { handleDefaultCatalogBulkProducts } from "@/lib/catalog-http/default";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleDefaultCatalogBulkProducts(request);
}
