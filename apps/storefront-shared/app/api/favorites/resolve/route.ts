import { StorefrontContentRepositoryError } from "@celebix/saas-data";

import { readFavoriteResolutionRequest } from "@/lib/favorites.ts";
import { resolveStorefrontPage } from "@/lib/page-context.ts";

const JSON_HEADERS = Object.freeze({ "cache-control": "no-store", "content-type": "application/json; charset=utf-8", "referrer-policy": "no-referrer" });

function json(body: unknown, status: number) { return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS }); }

export async function POST(request: Request) {
  const selected = await resolveStorefrontPage();
  if (selected.kind !== "active") return json({ code: selected.kind === "not_found" ? "not_found" : "unavailable" }, selected.kind === "not_found" ? 404 : 503);
  const { runtime, storefront } = selected.context;
  try {
    const productIds = await readFavoriteResolutionRequest(request, new URL(storefront.canonicalUrl).origin);
    const items = await runtime.content.resolveProductIds({ hostname: storefront.hostname, now: new Date(), productIds });
    return json({ items }, 200);
  } catch (error) {
    if (error instanceof TypeError && error.message === "storefront_favorites_request_invalid") return json({ code: "invalid_request" }, 403);
    if (error instanceof StorefrontContentRepositoryError && error.code === "invalid_input") return json({ code: "invalid_request" }, 400);
    return json({ code: "unavailable" }, 503);
  }
}

export function GET() { return new Response(null, { status: 405, headers: { allow: "POST", "cache-control": "no-store" } }); }
