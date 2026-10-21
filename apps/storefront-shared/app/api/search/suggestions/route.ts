import { resolveStorefrontPage } from '../../../../lib/page-context.ts';
import { createSearchSuggestionsHandler } from "../../../../lib/search-suggestions.ts";

export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> {
  const selected = await resolveStorefrontPage();
  const runtime = selected.kind === 'active' ? selected.context.runtime : null;
  if (runtime === null) return Response.json({ error: "search_unavailable" }, { status: 503, headers: { "cache-control": "private, no-store" } });
  return createSearchSuggestionsHandler({
    resolveStorefront: async () => selected.kind === 'active' ? { kind: 'active', storefront: selected.context.storefront } : selected,
    search: runtime.content.search.bind(runtime.content),
  })(request);
}
