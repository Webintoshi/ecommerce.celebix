import { NextRequest, NextResponse } from "next/server";
import { listMarketplaceListings } from "@/lib/db/marketplaces";
import { getMarketplaceProviderOrResponse } from "@/app/api/admin/marketplace-integrations/_shared";

interface Params {
  params: Promise<{ provider: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { provider } = await params;
    const parsedProvider = getMarketplaceProviderOrResponse(provider);
    if (parsedProvider instanceof NextResponse) {
      return parsedProvider;
    }

    const limit = Number(request.nextUrl.searchParams.get("limit") || "40");
    const listings = await listMarketplaceListings(parsedProvider, Number.isFinite(limit) ? limit : 40);
    return NextResponse.json({ success: true, listings });
  } catch (error) {
    console.error("Marketplace listings error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Listing eslemeleri alinamadi.",
      },
      { status: 500 },
    );
  }
}
