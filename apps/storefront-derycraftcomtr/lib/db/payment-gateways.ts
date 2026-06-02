import { maybeGetStorefrontSetting } from "@/lib/db/light-postgres-storefront-read";
import { createServerClient } from "@/lib/supabase";
import { getPaymentGatewayRuntimeStatus, normalizePaymentGateways } from "@/lib/payment-providers";
import { PaymentGateway, PaymentGatewayConfig } from "@/types/payment";

const DERYCRAFT_SOURCE_PUBLIC_PAYMENTS_URL = "https://derycraft.com/api/public/payments";

function getReadyActiveGateways(gateways: PaymentGatewayConfig[]) {
    return gateways.filter((gateway) => gateway.status === "active" && getPaymentGatewayRuntimeStatus(gateway).isReady);
}

async function getOperationalFallbackGateways(localSeeds: PaymentGatewayConfig[]): Promise<PaymentGatewayConfig[]> {
    const bankTransferSeed = localSeeds.find((gateway) => gateway.gateway === "bank_transfer");
    const codSeed = localSeeds.find((gateway) => gateway.gateway === "cod");
    const now = new Date().toISOString();

    try {
        const response = await fetch(DERYCRAFT_SOURCE_PUBLIC_PAYMENTS_URL, {
            cache: "no-store",
            headers: { Accept: "application/json" },
        });

        if (response.ok) {
            const payload = await response.json() as { gateways?: unknown[] };
            const hydrated = normalizePaymentGateways(
                (Array.isArray(payload.gateways) ? payload.gateways : []).map((gateway) => {
                    const raw = gateway as Record<string, unknown>;
                    const currentGateway = typeof raw.gateway === "string" ? raw.gateway : "";
                    const matchingSeed = localSeeds.find((seed) => seed.gateway === currentGateway);

                    return {
                        ...raw,
                        id: matchingSeed?.id ?? raw.id,
                        status: "active",
                        environment: currentGateway === "bank_transfer" || currentGateway === "cod" ? "production" : "sandbox",
                        createdAt: matchingSeed?.createdAt ?? now,
                        updatedAt: now,
                    };
                }),
            );

            const readyHydrated = getReadyActiveGateways(hydrated);
            if (readyHydrated.length > 0) {
                return readyHydrated;
            }
        }
    } catch (error) {
        console.warn("Payment gateway operational fallback fetch failed:", error);
    }

    if (codSeed) {
        return normalizePaymentGateways([{ ...codSeed, status: "active", updatedAt: now }])
            .filter((gateway) => getPaymentGatewayRuntimeStatus(gateway).isReady);
    }

    if (bankTransferSeed) {
        return normalizePaymentGateways([{ ...bankTransferSeed, status: "active", updatedAt: now }])
            .filter((gateway) => getPaymentGatewayRuntimeStatus(gateway).isReady);
    }

    return [];
}

export async function getStoredPaymentGateways(): Promise<PaymentGatewayConfig[]> {
    const lightPostgresValue = await maybeGetStorefrontSetting("payment_gateways");
    const lightPostgresGateways = normalizePaymentGateways(lightPostgresValue || []);
    if (getReadyActiveGateways(lightPostgresGateways).length > 0) {
        return lightPostgresGateways;
    }

    const serverClient = createServerClient();

    const { data, error } = await serverClient
        .from("settings")
        .select("value")
        .eq("key", "payment_gateways")
        .single();

    if (error && error.code !== "PGRST116") {
        throw error;
    }

    const supabaseGateways = normalizePaymentGateways(data?.value || []);
    if (getReadyActiveGateways(supabaseGateways).length > 0) {
        return supabaseGateways;
    }

    const operationalFallback = await getOperationalFallbackGateways(
        lightPostgresGateways.length > 0 ? lightPostgresGateways : supabaseGateways,
    );

    if (operationalFallback.length > 0) {
        return operationalFallback;
    }

    if (lightPostgresValue !== undefined && lightPostgresGateways.length > 0) {
        return lightPostgresGateways;
    }

    return supabaseGateways;
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
