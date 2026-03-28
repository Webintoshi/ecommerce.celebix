import { NextResponse } from "next/server";
import { listMarketplaceIntegrations } from "@/lib/db/marketplaces";

export async function GET() {
  try {
    const integrations = await listMarketplaceIntegrations();
    return NextResponse.json({ success: true, integrations });
  } catch (error) {
    console.error("Marketplace integrations list error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Pazaryeri entegrasyonlari alinamadi.",
      },
      { status: 500 },
    );
  }
}
