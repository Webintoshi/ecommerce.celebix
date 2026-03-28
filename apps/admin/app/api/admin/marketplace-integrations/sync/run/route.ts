import { NextRequest, NextResponse } from "next/server";
import { runMarketplaceSync } from "@/lib/db/marketplaces";
import { marketplaceManualSyncSchema } from "@/app/api/admin/marketplace-integrations/_shared";
import { isMarketplaceProvider } from "@/lib/marketplace-providers";

async function handleSyncRun(request: NextRequest, body?: unknown) {
  const parsedBody = marketplaceManualSyncSchema.safeParse(body || {});
  if (!parsedBody.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Sync parametreleri gecersiz.",
        details: parsedBody.error.flatten(),
      },
      { status: 422 },
    );
  }

  const provider = parsedBody.data.provider;
  if (provider && !isMarketplaceProvider(provider)) {
    return NextResponse.json({ success: false, error: "Gecersiz pazaryeri." }, { status: 404 });
  }

  const summary = await runMarketplaceSync({
    provider: provider && isMarketplaceProvider(provider) ? provider : undefined,
    forceOrders: parsedBody.data.forceOrders,
    forceReconciliation: parsedBody.data.forceReconciliation,
  });

  return NextResponse.json({ success: true, summary });
}

export async function GET(request: NextRequest) {
  try {
    const provider = request.nextUrl.searchParams.get("provider") || undefined;
    const forceOrders = request.nextUrl.searchParams.get("forceOrders") === "true";
    const forceReconciliation = request.nextUrl.searchParams.get("forceReconciliation") === "true";
    return handleSyncRun(request, { provider, forceOrders, forceReconciliation });
  } catch (error) {
    console.error("Marketplace scheduled sync error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Zamanlanmis senkronizasyon basarisiz.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    return handleSyncRun(request, body);
  } catch (error) {
    console.error("Marketplace manual sync run error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Senkronizasyon basarisiz.",
      },
      { status: 500 },
    );
  }
}
