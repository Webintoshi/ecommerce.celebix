import type { PublicProductSearch } from "@celebix/saas-contracts";
import type { PublicStorefrontContentRepository } from "@celebix/saas-data";
import { productPath } from "./storefront-routes.ts";

type Scope = Readonly<{ kind: "active"; storefront: { hostname: string; locale: string } }> | Readonly<{ kind: "not_found" | "unavailable" }>;
export type SearchSuggestion = Readonly<{ id: string; title: string; href: string; priceCents: number; currency: string; available: boolean; imageUrl: string | null; imageAlt: string }>;
export function createSearchSuggestionsHandler(dependencies: Readonly<{
  resolveStorefront(headers: Headers): Promise<Scope>;
  search: PublicStorefrontContentRepository["search"];
}>) {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  return async (request: Request): Promise<Response> => {
    const parameters = new URL(request.url).searchParams;
    const query = (parameters.get("q") ?? "").trim();
    if (parameters.getAll("q").length > 1 || /[\u0000-\u001f\u007f-\u009f]/u.test(query) || new TextEncoder().encode(query).byteLength > 100) return json({ error: "invalid_query" }, 400);
    if (query.length < 2) return json({ items: [] });
    try {
      const selected = await dependencies.resolveStorefront(request.headers);
      if (selected.kind !== "active") return json({ error: "search_unavailable" }, selected.kind === "not_found" ? 404 : 503);
      const result: PublicProductSearch = await dependencies.search({ hostname: selected.storefront.hostname, now: new Date(), query, limit: 8 });
      const items: SearchSuggestion[] = result.items.slice(0, 8).map(product => ({
        id: product.id, title: product.title, href: productPath(selected.storefront.locale, product.slug),
        priceCents: product.priceCents, currency: product.currency, available: product.available,
        imageUrl: product.media[0]?.url ?? null, imageAlt: product.media[0]?.altText ?? product.title,
      }));
      return json({ items });
    } catch { return json({ error: "search_unavailable" }, 503); }
  };
}
