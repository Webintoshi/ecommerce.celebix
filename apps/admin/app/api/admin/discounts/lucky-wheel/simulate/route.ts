import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_LUCKY_WHEEL_CONFIG_ID, simulateLuckyWheel } from "@/lib/lucky-wheel";
import { enforceLuckyWheelAdminRateLimit, luckyWheelSimulateSchema } from "@/app/api/admin/discounts/lucky-wheel/_shared";

export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = enforceLuckyWheelAdminRateLimit(request, "simulate:post", 10, 60_000);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const parsed = luckyWheelSimulateSchema.safeParse(body || {});
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Geçersiz simülasyon parametresi.",
          details: parsed.error.flatten(),
        },
        { status: 422 },
      );
    }

    const configId = parsed.data.configId || DEFAULT_LUCKY_WHEEL_CONFIG_ID;
    const simulation = await simulateLuckyWheel(configId, parsed.data.spinCount);
    return NextResponse.json({ success: true, simulation });
  } catch (error) {
    console.error("Lucky wheel simulate POST error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Simülasyon çalıştırılamadı.",
      },
      { status: 500 },
    );
  }
}
