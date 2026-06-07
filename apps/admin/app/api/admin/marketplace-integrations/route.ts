import { NextResponse } from "next/server";
import { listMarketplaceIntegrations } from "@/lib/db/marketplaces";
import {
  getOptionalAdminModuleState,
  isOptionalAdminModuleUnavailable,
} from "@/lib/optional-admin-modules";

export async function GET() {
  try {
    const integrations = await listMarketplaceIntegrations();
    return NextResponse.json({ success: true, integrations });
  } catch (error) {
    console.error("Marketplace integrations list error:", error);
    if (isOptionalAdminModuleUnavailable("marketplace", error)) {
      return NextResponse.json({
        success: true,
        integrations: [],
        ...getOptionalAdminModuleState("marketplace"),
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Pazaryeri entegrasyonlari alinamadi.",
      },
      { status: 500 },
    );
  }
}
