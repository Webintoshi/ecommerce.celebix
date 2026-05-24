import { NextRequest, NextResponse } from "next/server";
import { getAdminAuthContext } from "@/lib/admin-auth";
import { getStoredPaymentGateways } from "@/lib/db/payment-gateways";
import { normalizePaymentGateways } from "@/lib/payment-providers";
import { createServerClient } from "@/lib/supabase";

export async function GET(_request: NextRequest) {
  try {
    const auth = await getAdminAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: "Yetkisiz erişim." }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      gateways: await getStoredPaymentGateways(),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAdminAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: "Yetkisiz erişim." }, { status: 401 });
    }

    const supabase = createServerClient();
    const body = await request.json();

    if (!Array.isArray(body.gateways)) {
      return NextResponse.json({ success: false, error: "Invalid data format." }, { status: 400 });
    }

    const gateways = normalizePaymentGateways(body.gateways);
    const { error } = await supabase.from("settings").upsert(
      {
        key: "payment_gateways",
        value: gateways,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, message: "Ödeme ayarları kaydedildi.", gateways });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
