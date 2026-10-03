import type { PublicStorefront } from "@celebix/saas-contracts";
import type { PublicStorefrontRepository } from "@celebix/saas-data";

import { SIORA_STOREFRONT_ID } from "./theme.ts";

export type SioraCartRecommendation = Readonly<{
  id: string;
  slug: string;
  title: string;
  priceCents: number;
  media: Readonly<{ url: string; altText: string; width?: number; height?: number }>;
}>;

export type SioraCartRecommendationResolution = Readonly<{ kind: "not_found" | "unavailable" }> | Readonly<{
  kind: "active";
  context: Readonly<{ storefront: PublicStorefront; runtime: Readonly<{ repository: Pick<PublicStorefrontRepository, "queryPublicCatalog"> }> }>;
}>;

const HEADERS = Object.freeze({ "cache-control": "no-store", "x-content-type-options": "nosniff" });

function response(suggestions: readonly SioraCartRecommendation[], status: number): Response {
  return Response.json({ suggestions }, { status, headers: HEADERS });
}

export function createSioraCartRecommendationsGet(resolve: () => Promise<SioraCartRecommendationResolution>, now: () => Date = () => new Date()) {
  return async function GET(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (request.method !== "GET" || url.pathname !== "/api/cart/recommendations" || url.search || url.hash) return response([], 400);

      const selected = await resolve();
      if (selected.kind === "not_found") return response([], 404);
      if (selected.kind !== "active") return response([], 503);
      const { storefront, runtime } = selected.context;
      if (storefront.id !== SIORA_STOREFRONT_ID) return response([], 404);
      if (!runtime.repository.queryPublicCatalog) return response([], 503);

      const page = await runtime.repository.queryPublicCatalog({
        storefront, now: now(), categorySlug: null, query: "", filter: "available", order: "featured", offset: 0, limit: 12,
      });
      const suggestions: SioraCartRecommendation[] = [];
      for (const product of page.items) {
        if (product.status !== "active" || !product.available) continue;
        const image = product.media.find((media) => media.url && media.mediaType.startsWith("image/"));
        if (!image) continue;
        suggestions.push({
          id: product.id, slug: product.slug, title: product.title, priceCents: product.priceCents,
          media: { url: image.url, altText: image.altText, ...(image.width === undefined ? {} : { width: image.width }), ...(image.height === undefined ? {} : { height: image.height }) },
        });
        if (suggestions.length === 12) break;
      }
      return response(suggestions, 200);
    } catch {
      return response([], 503);
    }
  };
}
