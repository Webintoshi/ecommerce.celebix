import { NextRequest, NextResponse } from "next/server";
import { testMarketplaceConnection } from "@/lib/db/marketplaces";
import { enforceMarketplaceRateLimit, getMarketplaceProviderOrResponse } from "@/app/api/admin/marketplace-integrations/_shared";

interface Params {
  params: Promise<{ provider: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const rateLimitResponse = enforceMarketplaceRateLimit(request, "test", 20, 60_000);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { provider } = await params;
    const parsedProvider = getMarketplaceProviderOrResponse(provider);
    if (parsedProvider instanceof NextResponse) {
      return parsedProvider;
    }

    const result = await testMarketplaceConnection(parsedProvider);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("Marketplace test error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Baglanti testi basarisiz.",
      },
      { status: 500 },
    );
  }
}
