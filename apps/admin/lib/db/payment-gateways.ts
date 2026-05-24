import { maybeGetAdminSetting } from "@/lib/db/light-postgres-read";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import { createServerClient } from "@/lib/supabase";
import { getPaymentGatewayRuntimeStatus, normalizePaymentGateways } from "@/lib/payment-providers";
import { PaymentGateway, PaymentGatewayConfig } from "@/types/payment";

const DERYCRAFT_SOURCE_PUBLIC_PAYMENTS_URL = "https://derycraft.com/api/public/payments";

function getReadyActiveGateways(gateways: PaymentGatewayConfig[]) {
    return gateways.filter((gateway) => gateway.status === "active" && getPaymentGatewayRuntimeStatus(gateway).isReady);
}

async function getOperationalFallbackGateways(localSeeds: PaymentGatewayConfig[]): Promise<PaymentGatewayConfig[]> {
    if (STORE_RUNTIME.slug !== "derycraftcomtr") {
        return [];
    }

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

            if (hydrated.length > 0) {
                return hydrated;
            }
        }
    } catch (error) {
        console.warn("Admin payment gateway operational fallback fetch failed:", error);
    }

    if (bankTransferSeed) {
        return normalizePaymentGateways([{ ...bankTransferSeed, status: "active", updatedAt: now }]);
    }

    if (codSeed) {
        return normalizePaymentGateways([{ ...codSeed, status: "active", updatedAt: now }]);
    }

    return [];
}

export async function getStoredPaymentGateways(): Promise<PaymentGatewayConfig[]> {
    const lightPostgresValue = await maybeGetAdminSetting("payment_gateways");
    const lightPostgresGateways = normalizePaymentGateways(lightPostgresValue || []);
    if (lightPostgresGateways.length > 0) {
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

    const normalized = normalizePaymentGateways(data?.value || []);
    if (normalized.length > 0) {
        return normalized;
    }

    const operationalFallback = await getOperationalFallbackGateways(
        lightPostgresGateways.length > 0 ? lightPostgresGateways : normalized,
    );

    if (operationalFallback.length > 0) {
        return operationalFallback;
    }

    return normalized;
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
