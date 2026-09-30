import { headers } from "next/headers";
import { resolveDefaultPublicStorefrontRuntime } from "@/lib/default-runtime.ts";
import { createRobotsResponse } from "@/lib/seo-public-routes.ts";

export const dynamic = "force-dynamic";
export async function GET() {
  const runtime = await resolveDefaultPublicStorefrontRuntime();
  return createRobotsResponse({ headers: await headers(), reader: runtime?.seo, now: new Date() });
}
