import { createServerClient } from "@/lib/supabase";
import {
    createPaymentGatewayDefaults,
    getPaymentGatewayRuntimeStatus,
    normalizePaymentGateways,
} from "@/lib/payment-providers";
import { getPaymentMethods, type PaymentMethod } from "@/lib/db/settings";
import { PaymentGateway, PaymentGatewayConfig } from "@/types/payment";

const LEGACY_MANUAL_METHOD_MAP: Partial<Record<string, PaymentGateway>> = {
    "bank-transfer": "bank_transfer",
    "cash-on-delivery": "cod",
};

function buildLegacyManualPaymentGateway(method: PaymentMethod): PaymentGatewayConfig | null {
    const gatewayType = LEGACY_MANUAL_METHOD_MAP[method.type];
    if (!gatewayType || !method.enabled) {
        return null;
    }

    const base = createPaymentGatewayDefaults(gatewayType);

    return {
        ...base,
        id: gatewayType,
        name: method.name?.trim() || base.name,
        instructions: method.instructions?.trim() || "",
        status: "active",
        environment: "production",
        ...(gatewayType === "cod"
            ? {
                codSettings: {
                    ...base.codSettings,
                    instructions: method.instructions?.trim() || "",
                },
            }
            : {}),
    };
}

function shouldIncludeLegacyManualGateway(
    legacyGateway: PaymentGatewayConfig,
    storedGateways: PaymentGatewayConfig[],
): boolean {
    const activeStoredGateways = storedGateways.filter(
        (gateway) => gateway.gateway === legacyGateway.gateway && gateway.status === "active",
    );

    if (activeStoredGateways.length === 0) {
        return true;
    }

    if (legacyGateway.gateway === "bank_transfer" && legacyGateway.instructions.trim()) {
        return !activeStoredGateways.some((gateway) => getPaymentGatewayRuntimeStatus(gateway).isReady);
    }

    return false;
}

export async function getStoredPaymentGateways(): Promise<PaymentGatewayConfig[]> {
    const serverClient = createServerClient();

    const [{ data, error }, legacyMethods] = await Promise.all([
        serverClient
            .from("settings")
            .select("value")
            .eq("key", "payment_gateways")
            .single(),
        getPaymentMethods(),
    ]);

    if (error && error.code !== "PGRST116") {
        throw error;
    }

    const storedGateways = normalizePaymentGateways(data?.value || []);
    const legacyManualGateways = legacyMethods
        .map((method) => buildLegacyManualPaymentGateway(method))
        .filter((gateway): gateway is PaymentGatewayConfig => Boolean(gateway))
        .filter((gateway) => shouldIncludeLegacyManualGateway(gateway, storedGateways));

    return [...storedGateways, ...legacyManualGateways];
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
