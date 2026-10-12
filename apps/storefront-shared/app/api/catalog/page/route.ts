import { resolveDefaultPublicStorefrontRuntime } from "../../../../lib/default-runtime.ts";
import { resolvePublicStorefrontRequest } from "../../../../lib/public-storefront.ts";
import { createCatalogPageHandler } from "../../../../lib/catalog-page.ts";

export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> {
  const runtime = await resolveDefaultPublicStorefrontRuntime();
  if (!runtime?.repository.queryPublicCatalog) return Response.json({ error: "catalog_unavailable" }, { status: 503, headers: { "cache-control": "private, no-store" } });
  return createCatalogPageHandler({
    resolveStorefront: headers => resolvePublicStorefrontRequest({ headers, repository: runtime.repository, now: new Date() }),
    queryCatalog: runtime.repository.queryPublicCatalog.bind(runtime.repository),
    queryCollection: runtime.repository.queryPublicCollection?.bind(runtime.repository),
  })(request);
}
