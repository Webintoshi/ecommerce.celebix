import { NextRequest, NextResponse } from "next/server";
import { runMarketplaceSync } from "@/lib/db/marketplaces";
import { createServerClient } from "@/lib/supabase";
import { enforceMarketplaceRateLimit, getMarketplaceProviderOrResponse } from "@/app/api/admin/marketplace-integrations/_shared";
import { isRedisLockError } from "@/lib/redis";
import { syncGoogleMerchantCatalogSnapshot } from "@/lib/google-merchant";
import {
  getOptionalAdminModuleFailurePayload,
  isOptionalAdminModuleUnavailable,
} from "@/lib/optional-admin-modules";

interface Params {
  params: Promise<{ provider: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const rateLimitResponse = await enforceMarketplaceRateLimit(request, "sync", 10, 60_000);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { provider } = await params;
    const parsedProvider = getMarketplaceProviderOrResponse(provider);
    if (parsedProvider instanceof NextResponse) {
      return parsedProvider;
    }

    if (parsedProvider === "google_merchant") {
      const supabase = createServerClient();
      const { data: connection, error: connectionError } = await supabase
        .from("marketplace_provider_connections")
        .select("settings")
        .eq("provider", "google_merchant")
        .maybeSingle();

      if (connectionError) {
        throw connectionError;
      }

      const summary = await syncGoogleMerchantCatalogSnapshot(
        (connection?.settings as Record<string, unknown> | null) || {},
      );

      return NextResponse.json({
        success: true,
        summary: {
          provider: "google_merchant",
          feedUrl: summary.feedUrl,
          totalVariants: summary.totalVariants,
          validItems: summary.validItems,
          issueCount: summary.issueCount,
          sampleIssues: summary.sampleIssues,
        },
      });
    }

    const summary = await runMarketplaceSync({
      provider: parsedProvider,
      forceOrders: true,
      forceReconciliation: true,
      failOnLockedProvider: true,
    });

    return NextResponse.json({ success: true, summary });
  } catch (error) {
    console.error("Marketplace manual sync error:", error);
    if (isOptionalAdminModuleUnavailable("marketplace", error)) {
      return NextResponse.json(
        getOptionalAdminModuleFailurePayload("marketplace"),
        { status: 501 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Senkronizasyon basarisiz.",
      },
      { status: isRedisLockError(error) ? 409 : 500 },
    );
  }
}
