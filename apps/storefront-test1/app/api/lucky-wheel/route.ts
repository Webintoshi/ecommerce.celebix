import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_LUCKY_WHEEL_CONFIG_ID, getLuckyWheelPublicData } from "@/lib/lucky-wheel";

export async function GET(request: NextRequest) {
  try {
    const configId = request.nextUrl.searchParams.get("id") || DEFAULT_LUCKY_WHEEL_CONFIG_ID;
    const { config, prizes } = await getLuckyWheelPublicData(configId);

    if (!config) {
      return NextResponse.json(
        {
          success: false,
          error: "Aktif şans çarkı bulunamadı.",
        },
        { status: 404 },
      );
    }

    const publicPrizes = prizes.map((prize) => ({
      id: prize.id,
      name: prize.name,
      description: prize.description,
      prize_type: prize.prize_type,
      color_hex: prize.color_hex,
      icon_emoji: prize.icon_emoji,
      image_url: prize.image_url,
      display_order: prize.display_order,
    }));

    return NextResponse.json({
      success: true,
      config: {
        id: config.id,
        name: config.name,
        is_active: config.is_active,
        wheel_segments: config.wheel_segments,
        primary_color: config.primary_color,
        secondary_color: config.secondary_color,
        require_membership: config.require_membership,
        require_email_verified: config.require_email_verified,
        start_date: config.start_date,
        end_date: config.end_date,
      },
      prizes: publicPrizes,
    });
  } catch (error) {
    console.error("Lucky wheel public GET error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Şans çarkı verisi alınamadı.",
      },
      { status: 500 },
    );
  }
}

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: "Bu endpoint artık action tabanlı POST desteklemiyor. /api/lucky-wheel/spins veya /api/lucky-wheel/eligibility kullanın.",
    },
    { status: 410 },
  );
}
