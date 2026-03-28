import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_LUCKY_WHEEL_CONFIG_ID, listLuckyWheelSpins } from "@/lib/lucky-wheel";
import { enforceLuckyWheelAdminRateLimit } from "@/app/api/admin/discounts/lucky-wheel/_shared";

export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = enforceLuckyWheelAdminRateLimit(request, "spins:get", 60, 60_000);
    if (rateLimitResponse) return rateLimitResponse;

    const configId = request.nextUrl.searchParams.get("configId") || DEFAULT_LUCKY_WHEEL_CONFIG_ID;
    const limitParam = Number(request.nextUrl.searchParams.get("limit") || "100");
    const limit = Number.isFinite(limitParam) ? limitParam : 100;

    const { spins, stats } = await listLuckyWheelSpins(configId, limit);
    return NextResponse.json({ success: true, spins, stats });
  } catch (error) {
    console.error("Lucky wheel spins GET error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Şans çarkı spin verileri alınamadı.",
      },
      { status: 500 },
    );
  }
}
