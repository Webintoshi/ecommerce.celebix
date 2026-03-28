import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { normalizePaymentGateways } from "@/lib/payment-providers";

export async function GET(req: NextRequest) {
    try {
        const supabase = createServerClient();
        const authHeader = req.headers.get("Authorization");

        if (!authHeader) {
            return NextResponse.json({ success: false, error: "Yetkisiz erisim." }, { status: 401 });
        }

        const token = authHeader.replace("Bearer ", "");
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return NextResponse.json({ success: false, error: "Gecersiz oturum." }, { status: 401 });
        }

        const { data, error } = await supabase
            .from("settings")
            .select("value")
            .eq("key", "payment_gateways")
            .single();

        if (error && error.code !== "PGRST116") {
            throw error;
        }

        return NextResponse.json({
            success: true,
            gateways: normalizePaymentGateways(data?.value || []),
        });
    } catch (error) {
        console.error("Get Payments Error:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 },
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        const supabase = createServerClient();
        const authHeader = req.headers.get("Authorization");

        if (!authHeader) {
            return NextResponse.json({ success: false, error: "Yetkisiz erisim." }, { status: 401 });
        }

        const token = authHeader.replace("Bearer ", "");
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return NextResponse.json({ success: false, error: "Gecersiz oturum." }, { status: 401 });
        }

        const body = await req.json();
        if (!Array.isArray(body.gateways)) {
            return NextResponse.json({ success: false, error: "Invalid data format." }, { status: 400 });
        }

        const gateways = normalizePaymentGateways(body.gateways);

        const { error } = await supabase
            .from("settings")
            .upsert({
                key: "payment_gateways",
                value: gateways,
                updated_at: new Date().toISOString(),
            }, { onConflict: "key" });

        if (error) {
            throw error;
        }

        return NextResponse.json({ success: true, message: "Odeme ayarlari kaydedildi.", gateways });
    } catch (error) {
        console.error("Save Payments Error:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 },
        );
    }
}
