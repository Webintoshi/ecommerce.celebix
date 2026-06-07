import { NextRequest, NextResponse } from "next/server";
import { getMarketplaceProviderSyncLogs } from "@/lib/db/marketplaces";
import { getMarketplaceProviderOrResponse } from "@/app/api/admin/marketplace-integrations/_shared";
import {
  getOptionalAdminModuleState,
  isOptionalAdminModuleUnavailable,
} from "@/lib/optional-admin-modules";

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

    const limit = Number(request.nextUrl.searchParams.get("limit") || "30");
    const logs = await getMarketplaceProviderSyncLogs(parsedProvider, Number.isFinite(limit) ? limit : 30);
    return NextResponse.json({ success: true, logs });
  } catch (error) {
    console.error("Marketplace sync logs error:", error);
    if (isOptionalAdminModuleUnavailable("marketplace", error)) {
      return NextResponse.json({
        success: true,
        logs: [],
        ...getOptionalAdminModuleState("marketplace"),
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Hata gunlugu alinamadi.",
      },
      { status: 500 },
    );
  }
}
