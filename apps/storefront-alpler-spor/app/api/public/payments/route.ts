import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
    getPaymentGatewayRuntimeStatus,
    normalizePaymentGateways,
    sanitizePublicPaymentGateway,
} from "@/lib/payment-providers";

export async function GET() {
    try {
        const supabase = createServerClient();

        const { data, error } = await supabase
            .from("settings")
            .select("value")
            .eq("key", "payment_gateways")
            .single();

        if (error && error.code !== "PGRST116") {
            throw error;
        }

        const activeGateways = normalizePaymentGateways(data?.value || [])
            .filter((gateway) => gateway.status === "active" && getPaymentGatewayRuntimeStatus(gateway).isReady)
            .map((gateway) => sanitizePublicPaymentGateway(gateway));

        return NextResponse.json({ success: true, gateways: activeGateways });
    } catch (error) {
        console.error("Public Payments Error:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Unknown error", gateways: [] },
            { status: 500 },
        );
    }
}
