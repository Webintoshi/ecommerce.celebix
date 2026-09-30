import { StorefrontContentRepositoryError } from "@celebix/saas-data";
import { loadPublicSeoSettings } from "@/lib/public-seo-read.ts";
import { renderSitemapIndex } from "@/lib/sitemap.ts";
import { resolveStorefrontPage } from "@/lib/page-context.ts";
import { requireStorefrontPage, StorefrontUnavailableError } from "@/lib/page-resolution.ts";

export const dynamic = "force-dynamic";
export async function GET() {
  const { runtime, storefront } = requireStorefrontPage(await resolveStorefrontPage());
  if (!runtime.content.getSitemapIndex) throw new StorefrontUnavailableError();
  try {
    const settings = await loadPublicSeoSettings(runtime.seo, storefront.hostname);
    const allowIndex = storefront.hostname === storefront.primaryHostname && (settings ? settings.allowIndex && settings.eligible : storefront.presentation.seo.allowIndex);
    const shards = await runtime.content.getSitemapIndex({ hostname: storefront.hostname, now: new Date() });
    const xml = renderSitemapIndex(storefront.canonicalUrl, allowIndex ? shards : []);
    return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof StorefrontContentRepositoryError && error.code === "not_found") return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    throw new StorefrontUnavailableError();
  }
}
