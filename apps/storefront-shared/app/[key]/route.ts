import { headers } from "next/headers";
import { resolveDefaultPublicStorefrontRuntime } from "@/lib/default-runtime.ts";
import { createIndexNowKeyResponse, isIndexNowKeyFile } from "@/lib/seo-public-routes.ts";
import { createSitemapPageResponse, parseSitemapKeyFile } from "@/lib/sitemap-public-routes.ts";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: Readonly<{ params: Promise<{ key: string }> }>) {
  const { key } = await params;
  const shard = parseSitemapKeyFile(key);
  if (!shard && !isIndexNowKeyFile(key)) return new Response(null, { status: 404, headers: { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } });
  const runtime = await resolveDefaultPublicStorefrontRuntime();
  if (shard) return createSitemapPageResponse({ headers: await headers(), runtime, now: new Date(), ...shard });
  return createIndexNowKeyResponse({ headers: await headers(), reader: runtime?.seo, now: new Date(), keyFile: key });
}
