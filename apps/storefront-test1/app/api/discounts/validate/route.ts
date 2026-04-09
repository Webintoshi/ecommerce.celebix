import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyCoupon, getCouponByCode } from "@/lib/db/coupons";

const validateSchema = z.object({
  code: z.string().trim().min(3).max(40),
  subtotal: z.number().min(0),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = validateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Geçersiz kupon verisi." },
        { status: 422 }
      );
    }

    const normalizedCode = parsed.data.code.toUpperCase();
    const coupon = await getCouponByCode(normalizedCode);

    if (!coupon) {
      return NextResponse.json(
        { success: false, error: "Kupon kodu geçersiz veya kullanım dışı." },
        { status: 404 }
      );
    }

    const subtotal = parsed.data.subtotal;
    if (subtotal < Number(coupon.min_order || 0)) {
      return NextResponse.json(
        {
          success: false,
          error: `Bu kupon için minimum sipariş tutarı ${Number(coupon.min_order || 0)} TL.`,
        },
        { status: 422 }
      );
    }

    const discountAmount = applyCoupon(coupon, subtotal);
    if (discountAmount <= 0) {
      return NextResponse.json(
        { success: false, error: "Kupon bu sepet için uygulanamadı." },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      coupon: {
        code: coupon.code,
        type: coupon.type,
        value: Number(coupon.value) || 0,
        minOrder: Number(coupon.min_order) || 0,
      },
      discountAmount,
      finalSubtotal: Math.max(0, subtotal - discountAmount),
    });
  } catch (error) {
    console.error("Error validating coupon:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Kupon doğrulama başarısız.",
      },
      { status: 500 }
    );
  }
}
