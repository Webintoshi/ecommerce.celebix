import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_LUCKY_WHEEL_CONFIG_ID, getLuckyWheelPublicData } from "@/lib/lucky-wheel";

function normalizeFeatureFlag(value: string | undefined): string {
  return value?.trim().replace(/^["']|["']$/g, "").toLowerCase() ?? "";
}

function isLuckyWheelDisabledByConfig(): boolean {
  const flag = normalizeFeatureFlag(
    process.env.OPTIONAL_MODULE_LUCKY_WHEEL || process.env.NEXT_PUBLIC_OPTIONAL_MODULE_LUCKY_WHEEL,
  );

  return flag === "disabled" || flag === "off" || flag === "false" || flag === "0";
}

function isMissingLuckyWheelTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as { code?: unknown; message?: unknown; details?: unknown };
  const text = [record.message, record.details]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  return (
    record.code === "42P01" ||
    text.includes("lucky_wheel_configs") ||
    text.includes("lucky_wheel_prizes") ||
    text.includes("compatibility table") ||
    text.includes("does not exist") ||
    text.includes("schema cache")
  );
}

function optionalModuleDisabledResponse() {
  return NextResponse.json(
    {
      success: false,
      code: "optional_module_disabled",
      error: "Şans çarkı modülü bu mağazada etkin değil.",
    },
    { status: 404 },
  );
}

export async function GET(request: NextRequest) {
  try {
    if (isLuckyWheelDisabledByConfig()) {
      return optionalModuleDisabledResponse();
    }

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
    if (isMissingLuckyWheelTableError(error)) {
      return optionalModuleDisabledResponse();
    }

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
