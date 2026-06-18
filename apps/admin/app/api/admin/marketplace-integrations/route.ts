import { NextResponse } from "next/server";
import { listMarketplaceIntegrations } from "@/lib/db/marketplaces";
import { MARKETPLACE_PROVIDER_DEFINITIONS } from "@/lib/marketplace-providers";
import { buildOptionalModuleDisabledPayload, isMissingDatabaseObjectError } from "@/lib/db/light-postgres-compat";

export async function GET() {
  try {
    const integrations = await listMarketplaceIntegrations();
    return NextResponse.json({ success: true, integrations });
  } catch (error) {
    console.error("Marketplace integrations list error:", error);
    if (isMissingDatabaseObjectError(error)) {
      return NextResponse.json({
        success: true,
        integrations: MARKETPLACE_PROVIDER_DEFINITIONS.map((provider) => ({
          provider,
          connection: null,
          queueStats: { queued: 0, failed: 0, manualActionRequired: 0 },
          listingStats: { total: 0, active: 0, error: 0 },
        })),
        ...buildOptionalModuleDisabledPayload("marketplace"),
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
