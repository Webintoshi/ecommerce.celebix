import { NextRequest, NextResponse } from "next/server";
import { runMarketplaceSync } from "@/lib/db/marketplaces";
import { enforceMarketplaceRateLimit, getMarketplaceProviderOrResponse } from "@/app/api/admin/marketplace-integrations/_shared";

interface Params {
  params: Promise<{ provider: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const rateLimitResponse = enforceMarketplaceRateLimit(request, "sync", 10, 60_000);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { provider } = await params;
    const parsedProvider = getMarketplaceProviderOrResponse(provider);
    if (parsedProvider instanceof NextResponse) {
      return parsedProvider;
    }

    const summary = await runMarketplaceSync({
      provider: parsedProvider,
      forceOrders: true,
      forceReconciliation: true,
    });

    return NextResponse.json({ success: true, summary });
  } catch (error) {
    console.error("Marketplace manual sync error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Senkronizasyon basarisiz.",
      },
      { status: 500 },
    );
  }
}
