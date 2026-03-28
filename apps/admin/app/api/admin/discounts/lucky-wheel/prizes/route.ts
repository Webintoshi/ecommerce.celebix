import { NextRequest, NextResponse } from "next/server";
import {
  createLuckyWheelPrize,
  deleteLuckyWheelPrize,
  DEFAULT_LUCKY_WHEEL_CONFIG_ID,
  listLuckyWheelPrizes,
  replaceLuckyWheelPrizes,
  updateLuckyWheelPrize,
} from "@/lib/lucky-wheel";
import {
  enforceLuckyWheelAdminRateLimit,
  luckyWheelPrizeCreateSchema,
  luckyWheelPrizeUpdateSchema,
  luckyWheelPrizesReplaceSchema,
} from "@/app/api/admin/discounts/lucky-wheel/_shared";

export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = enforceLuckyWheelAdminRateLimit(request, "prizes:get", 60, 60_000);
    if (rateLimitResponse) return rateLimitResponse;

    const configId = request.nextUrl.searchParams.get("configId") || DEFAULT_LUCKY_WHEEL_CONFIG_ID;
    const prizes = await listLuckyWheelPrizes(configId);
    return NextResponse.json({ success: true, prizes });
  } catch (error) {
    console.error("Lucky wheel prizes GET error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Şans çarkı ödülleri alınamadı.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = enforceLuckyWheelAdminRateLimit(request, "prizes:post", 20, 60_000);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const replaceParsed = luckyWheelPrizesReplaceSchema.safeParse(body);
    if (replaceParsed.success) {
      const configId = replaceParsed.data.configId || DEFAULT_LUCKY_WHEEL_CONFIG_ID;
      const prizes = await replaceLuckyWheelPrizes(configId, replaceParsed.data.prizes);
      return NextResponse.json({ success: true, prizes, mode: "replace" });
    }

    const createParsed = luckyWheelPrizeCreateSchema.safeParse(body);
    if (!createParsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Geçersiz şans çarkı ödül verisi.",
          details: createParsed.error.flatten(),
        },
        { status: 422 },
      );
    }

    const configId = createParsed.data.configId || DEFAULT_LUCKY_WHEEL_CONFIG_ID;
    const prize = await createLuckyWheelPrize(configId, createParsed.data.prize);
    return NextResponse.json({ success: true, prize, mode: "create" });
  } catch (error) {
    console.error("Lucky wheel prizes POST error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Şans çarkı ödül kaydı başarısız.",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const rateLimitResponse = enforceLuckyWheelAdminRateLimit(request, "prizes:put", 20, 60_000);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const parsed = luckyWheelPrizeUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Geçersiz şans çarkı ödül güncelleme verisi.",
          details: parsed.error.flatten(),
        },
        { status: 422 },
      );
    }

    const configId = parsed.data.configId || DEFAULT_LUCKY_WHEEL_CONFIG_ID;
    const prize = await updateLuckyWheelPrize(configId, parsed.data.prize);
    return NextResponse.json({ success: true, prize });
  } catch (error) {
    console.error("Lucky wheel prizes PUT error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Şans çarkı ödülü güncellenemedi.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const rateLimitResponse = enforceLuckyWheelAdminRateLimit(request, "prizes:delete", 20, 60_000);
    if (rateLimitResponse) return rateLimitResponse;

    const configId = request.nextUrl.searchParams.get("configId") || DEFAULT_LUCKY_WHEEL_CONFIG_ID;
    const prizeId = request.nextUrl.searchParams.get("id");
    if (!prizeId) {
      return NextResponse.json({ success: false, error: "Silinecek ödül id'si gerekli." }, { status: 422 });
    }

    await deleteLuckyWheelPrize(configId, prizeId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Lucky wheel prizes DELETE error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Şans çarkı ödülü silinemedi.",
      },
      { status: 500 },
    );
  }
}
