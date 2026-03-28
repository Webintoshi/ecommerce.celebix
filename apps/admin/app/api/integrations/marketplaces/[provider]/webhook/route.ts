import { NextRequest, NextResponse } from "next/server";
import { recordMarketplaceWebhook, verifyMarketplaceWebhook } from "@/lib/db/marketplaces";
import { enforceMarketplaceRateLimit, getMarketplaceProviderOrResponse } from "@/app/api/admin/marketplace-integrations/_shared";

interface Params {
  params: Promise<{ provider: string }>;
}

function extractHeaders(request: NextRequest) {
  const headers: Record<string, string> = {};
  for (const [key, value] of request.headers.entries()) {
    headers[key] = value;
  }
  return headers;
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const rateLimitResponse = enforceMarketplaceRateLimit(request, "webhook", 120, 60_000);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { provider } = await params;
    const parsedProvider = getMarketplaceProviderOrResponse(provider);
    if (parsedProvider instanceof NextResponse) {
      return parsedProvider;
    }

    const rawBody = await request.text();
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody || "{}") as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "Webhook payload json formatinda degil.",
        },
        { status: 422 },
      );
    }
    const headers = extractHeaders(request);
    const verification = await verifyMarketplaceWebhook(parsedProvider, rawBody, headers);
    if (!verification.success) {
      return NextResponse.json(
        {
          success: false,
          error: verification.message || "Webhook imza dogrulamasi basarisiz.",
        },
        { status: verification.statusCode || 401 },
      );
    }

    const result = await recordMarketplaceWebhook(parsedProvider, payload, headers, {
      signatureValid: true,
      signatureMessage: verification.message || null,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Marketplace webhook error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Webhook islenemedi.",
      },
      { status: 500 },
    );
  }
}
