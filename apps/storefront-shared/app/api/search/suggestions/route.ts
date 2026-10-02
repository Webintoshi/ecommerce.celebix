import { resolveDefaultPublicStorefrontRuntime } from "../../../../lib/default-runtime.ts";
import { resolvePublicStorefrontRequest } from "../../../../lib/public-storefront.ts";
import { createSearchSuggestionsHandler } from "../../../../lib/search-suggestions.ts";

export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> {
  const runtime = await resolveDefaultPublicStorefrontRuntime();
  if (runtime === null) return Response.json({ error: "search_unavailable" }, { status: 503, headers: { "cache-control": "private, no-store" } });
  return createSearchSuggestionsHandler({
    resolveStorefront: headers => resolvePublicStorefrontRequest({ headers, repository: runtime.repository, now: new Date() }),
    search: runtime.content.search.bind(runtime.content),
  })(request);
}
