import { StorefrontContentRepositoryError } from "@celebix/saas-data";
import { loadPublicSeoSettings } from "@/lib/public-seo-read.ts";
import { renderSitemapPage } from "@/lib/sitemap.ts";
import { resolveStorefrontPage } from "@/lib/page-context.ts";
import { requireStorefrontPage, StorefrontUnavailableError } from "@/lib/page-resolution.ts";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: Readonly<{ params: Promise<{ kind: string; page: string }> }>) {
  const { kind, page } = await params;
  if (kind !== "products" && kind !== "content" || !/^(?:0|[1-9]\d{0,3})$/.test(page)) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  const { runtime, storefront } = requireStorefrontPage(await resolveStorefrontPage());
  if (!runtime.content.getSitemapPage) throw new StorefrontUnavailableError();

  try {
    const settings = await loadPublicSeoSettings(runtime.seo, storefront.hostname);
    const allowIndex = storefront.hostname === storefront.primaryHostname && (settings ? settings.allowIndex && settings.eligible : storefront.presentation.seo.allowIndex);
    if (!allowIndex) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    const entries = await runtime.content.getSitemapPage({ hostname: storefront.hostname, now: new Date(), kind, page: Number(page) });
    return new Response(renderSitemapPage(storefront.canonicalUrl, entries), { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof StorefrontContentRepositoryError && (error.code === "not_found" || error.code === "invalid_input")) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    throw new StorefrontUnavailableError();
  }
}
