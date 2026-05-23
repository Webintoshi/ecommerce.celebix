import { NextResponse } from "next/server";
import { getStoredPaymentGateways } from "@/lib/db/payment-gateways";
import {
    getPaymentGatewayRuntimeStatus,
    sanitizePublicPaymentGateway,
} from "@/lib/payment-providers";

export async function GET() {
    try {
        const activeGateways = (await getStoredPaymentGateways())
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
