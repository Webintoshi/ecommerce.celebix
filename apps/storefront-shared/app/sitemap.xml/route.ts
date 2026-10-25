import { headers } from "next/headers";
import { resolveDefaultPublicStorefrontRuntime } from "@/lib/default-runtime.ts";
import { createSitemapIndexResponse } from "@/lib/sitemap-public-routes.ts";

export const dynamic = "force-dynamic";
export async function GET() {
  const runtime = await resolveDefaultPublicStorefrontRuntime();
  return createSitemapIndexResponse({ headers: await headers(), runtime, now: new Date() });
}
