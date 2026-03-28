import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, getRequestIp } from "@/lib/api-rate-limit";
import { DEFAULT_LUCKY_WHEEL_CONFIG_ID, spinLuckyWheel } from "@/lib/lucky-wheel";

const spinSchema = z.object({
  configId: z.string().uuid().optional(),
  userName: z.string().trim().min(2).max(80),
  userEmail: z.string().trim().email().optional(),
  userPhone: z.string().trim().min(7).max(20).optional(),
  fingerprint: z.string().trim().min(6).max(200),
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const requestIp = getRequestIp(request);
    const ipRateLimit = checkRateLimit({
      key: `lucky-wheel:spin:ip:${requestIp}`,
      limit: 8,
      windowMs: 60_000,
    });
    if (!ipRateLimit.allowed) {
      return NextResponse.json({ success: false, error: "Rate limit aşıldı." }, { status: 429 });
    }

    const body = await request.json();
    const parsed = spinSchema.safeParse(body || {});
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Geçersiz spin verisi.",
          details: parsed.error.flatten(),
        },
        { status: 422 },
      );
    }

    if (!parsed.data.userEmail && !parsed.data.userPhone) {
      return NextResponse.json(
        {
          success: false,
          error: "Email veya telefon alanı zorunludur.",
        },
        { status: 422 },
      );
    }

    const fingerprintRateLimit = checkRateLimit({
      key: `lucky-wheel:spin:fingerprint:${parsed.data.fingerprint}`,
      limit: 6,
      windowMs: 60_000,
    });
    if (!fingerprintRateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Cihaz için hız limiti aşıldı. Lütfen biraz sonra tekrar deneyin.",
        },
        { status: 429 },
      );
    }

    const result = await spinLuckyWheel({
      configId: parsed.data.configId || DEFAULT_LUCKY_WHEEL_CONFIG_ID,
      userName: parsed.data.userName,
      userEmail: parsed.data.userEmail,
      userPhone: parsed.data.userPhone,
      fingerprint: parsed.data.fingerprint,
      idempotencyKey: parsed.data.idempotencyKey || randomUUID(),
      requestIp,
      requestUserAgent: request.headers.get("user-agent") || undefined,
    });

    const status = result.success ? 200 : result.canSpin ? 409 : 422;
    return NextResponse.json(result, { status });
  } catch (error) {
    console.error("Lucky wheel spins POST error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Spin işlemi başarısız.",
      },
      { status: 500 },
    );
  }
}
