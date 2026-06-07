import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_LUCKY_WHEEL_CONFIG_ID,
  getLuckyWheelAdminConfig,
  listLuckyWheelPrizes,
  listLuckyWheelSpins,
  replaceLuckyWheelPrizes,
  saveLuckyWheelConfig,
  simulateLuckyWheel,
} from "@/lib/lucky-wheel";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import {
  getOptionalAdminModuleFailurePayload,
  getOptionalAdminModuleState,
  isOptionalAdminModuleUnavailable,
} from "@/lib/optional-admin-modules";

const DEPRECATION_MESSAGE = "Bu endpoint deprecate edildi. /api/admin/discounts/lucky-wheel/* endpointlerini kullanın.";

export async function GET(request: NextRequest) {
  try {
    const { response } = await requireAdminApiAuth();
    if (response) {
      return response;
    }

    const action = request.nextUrl.searchParams.get("action");
    const configId = request.nextUrl.searchParams.get("id") || DEFAULT_LUCKY_WHEEL_CONFIG_ID;

    if (action === "stats") {
      const { spins, stats } = await listLuckyWheelSpins(configId, 200);
      return NextResponse.json({ success: true, deprecated: true, deprecationMessage: DEPRECATION_MESSAGE, stats, spins });
    }

    if (action === "prizes") {
      const prizes = await listLuckyWheelPrizes(configId);
      return NextResponse.json({ success: true, deprecated: true, deprecationMessage: DEPRECATION_MESSAGE, prizes });
    }

    const config = await getLuckyWheelAdminConfig(configId);
    return NextResponse.json({
      success: true,
      deprecated: true,
      deprecationMessage: DEPRECATION_MESSAGE,
      configs: config ? [config] : [],
      config,
    });
  } catch (error) {
    console.error("Deprecated lucky wheel admin GET error:", error);
    if (isOptionalAdminModuleUnavailable("lucky_wheel", error)) {
      const action = request.nextUrl.searchParams.get("action");
      if (action === "stats") {
        return NextResponse.json({
          success: true,
          deprecated: true,
          deprecationMessage: DEPRECATION_MESSAGE,
          spins: [],
          stats: null,
          ...getOptionalAdminModuleState("lucky_wheel"),
        });
      }

      if (action === "prizes") {
        return NextResponse.json({
          success: true,
          deprecated: true,
          deprecationMessage: DEPRECATION_MESSAGE,
          prizes: [],
          ...getOptionalAdminModuleState("lucky_wheel"),
        });
      }

      return NextResponse.json({
        success: true,
        deprecated: true,
        deprecationMessage: DEPRECATION_MESSAGE,
        configs: [],
        config: null,
        ...getOptionalAdminModuleState("lucky_wheel"),
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "İşlem başarısız.",
        deprecated: true,
        deprecationMessage: DEPRECATION_MESSAGE,
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { response } = await requireAdminApiAuth();
    if (response) {
      return response;
    }

    const body = await request.json();
    const action = String(body?.action || "");
    const configId = body?.configId || DEFAULT_LUCKY_WHEEL_CONFIG_ID;

    if (action === "save") {
      if (body?.config) {
        await saveLuckyWheelConfig({
          ...body.config,
          id: body.config.id || configId,
        });
      }
      if (Array.isArray(body?.prizes)) {
        await replaceLuckyWheelPrizes(configId, body.prizes);
      }
      return NextResponse.json({
        success: true,
        deprecated: true,
        deprecationMessage: DEPRECATION_MESSAGE,
        message: "Kaydedildi.",
      });
    }

    if (action === "simulate") {
      const simulation = await simulateLuckyWheel(configId, Number(body?.spinCount || 1000));
      return NextResponse.json({
        success: true,
        deprecated: true,
        deprecationMessage: DEPRECATION_MESSAGE,
        simulation,
      });
    }

    if (action === "toggle" && body?.config) {
      const current = await getLuckyWheelAdminConfig(configId);
      if (!current) throw new Error("Lucky Wheel konfigürasyonu bulunamadı.");
      const config = await saveLuckyWheelConfig({
        ...current,
        is_active: Boolean(body.config.is_active),
      });
      return NextResponse.json({
        success: true,
        deprecated: true,
        deprecationMessage: DEPRECATION_MESSAGE,
        config,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: "Geçersiz action.",
        deprecated: true,
        deprecationMessage: DEPRECATION_MESSAGE,
      },
      { status: 422 },
    );
  } catch (error) {
    console.error("Deprecated lucky wheel admin POST error:", error);
    if (isOptionalAdminModuleUnavailable("lucky_wheel", error)) {
      return NextResponse.json(
        {
          deprecated: true,
          deprecationMessage: DEPRECATION_MESSAGE,
          ...getOptionalAdminModuleFailurePayload("lucky_wheel"),
        },
        { status: 501 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "İşlem başarısız.",
        deprecated: true,
        deprecationMessage: DEPRECATION_MESSAGE,
      },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  const { response } = await requireAdminApiAuth();
  if (response) {
    return response;
  }

  return NextResponse.json(
    {
      success: false,
      deprecated: true,
      deprecationMessage: DEPRECATION_MESSAGE,
      error: "Silme işlemi deprecate endpointte desteklenmiyor.",
    },
    { status: 410 },
  );
}
