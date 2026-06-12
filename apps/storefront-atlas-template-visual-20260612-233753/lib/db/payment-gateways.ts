import { createServerClient } from "@/lib/supabase";
import { normalizePaymentGateways } from "@/lib/payment-providers";
import { PaymentGateway, PaymentGatewayConfig } from "@/types/payment";

export async function getStoredPaymentGateways(): Promise<PaymentGatewayConfig[]> {
    const serverClient = createServerClient();

    const { data, error } = await serverClient
        .from("settings")
        .select("value")
        .eq("key", "payment_gateways")
        .single();

    if (error && error.code !== "PGRST116") {
        throw error;
    }

    return normalizePaymentGateways(data?.value || []);
}

export async function getPaymentGatewayById(id: string): Promise<PaymentGatewayConfig | null> {
    const gateways = await getStoredPaymentGateways();
    return gateways.find((gateway) => gateway.id === id) ?? null;
}

export async function getActivePaymentGatewayById(id: string): Promise<PaymentGatewayConfig | null> {
    const gateway = await getPaymentGatewayById(id);

    if (!gateway || gateway.status !== "active") {
        return null;
    }

    return gateway;
}

export async function getActivePaymentGatewaysByType(type: PaymentGateway): Promise<PaymentGatewayConfig[]> {
    const gateways = await getStoredPaymentGateways();

    return gateways.filter((gateway) => gateway.gateway === type && gateway.status === "active");
}
