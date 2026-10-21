import { resolveStorefrontPage } from '../../../../lib/page-context.ts';
import { createCatalogPageHandler } from "../../../../lib/catalog-page.ts";

export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> {
  const selected = await resolveStorefrontPage();
  const runtime = selected.kind === 'active' ? selected.context.runtime : null;
  if (!runtime?.repository.queryPublicCatalog) return Response.json({ error: "catalog_unavailable" }, { status: 503, headers: { "cache-control": "private, no-store" } });
  return createCatalogPageHandler({
    resolveStorefront: async () => selected.kind === 'active' ? { kind: 'active', storefront: selected.context.storefront } : selected,
    queryCatalog: runtime.repository.queryPublicCatalog.bind(runtime.repository),
    queryCollection: runtime.repository.queryPublicCollection?.bind(runtime.repository),
  })(request);
}
