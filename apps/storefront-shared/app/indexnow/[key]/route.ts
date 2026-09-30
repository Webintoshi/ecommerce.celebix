import { headers } from "next/headers";
import { resolveDefaultPublicStorefrontRuntime } from "@/lib/default-runtime.ts";
import { createIndexNowKeyResponse } from "@/lib/seo-public-routes.ts";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: Readonly<{ params: Promise<{ key: string }> }>) {
  const { key } = await params;
  const runtime = await resolveDefaultPublicStorefrontRuntime();
  return createIndexNowKeyResponse({ headers: await headers(), reader: runtime?.seo, now: new Date(), keyFile: key });
}
