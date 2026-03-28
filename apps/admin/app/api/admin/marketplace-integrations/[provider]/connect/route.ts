import { NextRequest, NextResponse } from "next/server";
import { saveMarketplaceConnection } from "@/lib/db/marketplaces";
import {
  enforceMarketplaceRateLimit,
  getMarketplaceProviderOrResponse,
  parseMarketplaceConnectionForProvider,
} from "@/app/api/admin/marketplace-integrations/_shared";

interface Params {
  params: Promise<{ provider: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const rateLimitResponse = enforceMarketplaceRateLimit(request, "connect", 10, 60_000);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { provider } = await params;
    const parsedProvider = getMarketplaceProviderOrResponse(provider);
    if (parsedProvider instanceof NextResponse) {
      return parsedProvider;
    }

    const body = await request.json();
    const parsedBody = parseMarketplaceConnectionForProvider(parsedProvider, body);
    if (!parsedBody.success) {
      return NextResponse.json(parsedBody.payload, { status: parsedBody.status });
    }

    const result = await saveMarketplaceConnection(parsedProvider, parsedBody.data);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Marketplace connect error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Baglanti kaydedilemedi.",
      },
      { status: 500 },
    );
  }
}
