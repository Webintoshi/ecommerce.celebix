import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { getStoreAnalyticsSummary } from "@/lib/analytics/store-analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { response } = await requireAdminApiAuth();

  if (response) {
    return response;
  }

  const summary = await getStoreAnalyticsSummary();
  const jsonResponse = NextResponse.json({
    success: true,
    data: summary,
  });

  jsonResponse.headers.set("Cache-Control", "no-store");
  return jsonResponse;
}
