import { NextRequest, NextResponse } from "next/server";
import { getLuckyWheelAdminConfig, saveLuckyWheelConfig, DEFAULT_LUCKY_WHEEL_CONFIG_ID } from "@/lib/lucky-wheel";
import { enforceLuckyWheelAdminRateLimit, luckyWheelConfigSchema } from "@/app/api/admin/discounts/lucky-wheel/_shared";

export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = enforceLuckyWheelAdminRateLimit(request, "config:get", 60, 60_000);
    if (rateLimitResponse) return rateLimitResponse;

    const configId = request.nextUrl.searchParams.get("configId") || DEFAULT_LUCKY_WHEEL_CONFIG_ID;
    const config = await getLuckyWheelAdminConfig(configId);
    return NextResponse.json({ success: true, config });
  } catch (error) {
    console.error("Lucky wheel config GET error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Şans çarkı konfigürasyonu alınamadı.",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const rateLimitResponse = enforceLuckyWheelAdminRateLimit(request, "config:put", 20, 60_000);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const parsed = luckyWheelConfigSchema.safeParse(body?.config || body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Geçersiz şans çarkı konfigürasyon verisi.",
          details: parsed.error.flatten(),
        },
        { status: 422 },
      );
    }

    const config = await saveLuckyWheelConfig(parsed.data);
    return NextResponse.json({ success: true, config });
  } catch (error) {
    console.error("Lucky wheel config PUT error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Şans çarkı konfigürasyonu kaydedilemedi.",
      },
      { status: 500 },
    );
  }
}
