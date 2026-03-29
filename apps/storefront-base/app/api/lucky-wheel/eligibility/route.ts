import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, getRequestIp } from "@/lib/api-rate-limit";
import { checkLuckyWheelEligibility, DEFAULT_LUCKY_WHEEL_CONFIG_ID } from "@/lib/lucky-wheel";

const eligibilitySchema = z.object({
  configId: z.string().uuid().optional(),
  userEmail: z.string().trim().email().optional(),
  userPhone: z.string().trim().min(7).max(20).optional(),
  fingerprint: z.string().trim().min(6).max(200),
});

export async function POST(request: NextRequest) {
  try {
    const ip = getRequestIp(request);
    const ipRateLimit = checkRateLimit({
      key: `lucky-wheel:eligibility:ip:${ip}`,
      limit: 40,
      windowMs: 60_000,
    });
    if (!ipRateLimit.allowed) {
      return NextResponse.json({ success: false, error: "Rate limit aşıldı." }, { status: 429 });
    }

    const body = await request.json();
    const parsed = eligibilitySchema.safeParse(body || {});
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Geçersiz uygunluk kontrol verisi.",
          details: parsed.error.flatten(),
        },
        { status: 422 },
      );
    }

    const result = await checkLuckyWheelEligibility({
      configId: parsed.data.configId || DEFAULT_LUCKY_WHEEL_CONFIG_ID,
      userEmail: parsed.data.userEmail,
      userPhone: parsed.data.userPhone,
      fingerprint: parsed.data.fingerprint,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Lucky wheel eligibility POST error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Uygunluk kontrolü başarısız.",
      },
      { status: 500 },
    );
  }
}
