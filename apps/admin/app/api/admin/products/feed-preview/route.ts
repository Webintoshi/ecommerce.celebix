import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { fetchAndParseXmlProductFeed } from "@/lib/admin/product-feed-fetch";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const authResult = await requireAdminApiAuth();
  if (authResult.response) {
    return authResult.response;
  }

  try {
    const body = (await request.json().catch(() => null)) as
      | {
          url?: string;
        }
      | null;

    const feedUrl = body?.url?.trim();
    if (!feedUrl) {
      return NextResponse.json(
        { success: false, error: "Feed URL zorunludur." },
        { status: 400 },
      );
    }

    const { parseResult, source, host } = await fetchAndParseXmlProductFeed(feedUrl);

    return NextResponse.json({
      success: true,
      parseResult,
      meta: {
        source,
        host,
      },
    });
  } catch (error) {
    console.error("Admin feed preview route error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Feed işlenemedi.",
      },
      { status: 500 },
    );
  }
}
