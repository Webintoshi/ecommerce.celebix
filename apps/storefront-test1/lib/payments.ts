import {
    PaymentGateway,
    PaymentGatewayConfig,
    PaymentGatewayFormState,
    PaymentMethodStatus,
} from "@/types/payment";
import { PaymentService } from "./payment-service";
import {
    createPaymentGatewayDefaults,
    getPaymentProviderDefinition,
    normalizePaymentGateways,
} from "./payment-providers";

let paymentGateways: PaymentGatewayConfig[] = [];

export async function getPaymentGateways(): Promise<PaymentGatewayConfig[]> {
    try {
        const fromApi = await PaymentService.getAll();
        paymentGateways = normalizePaymentGateways(fromApi);
    } catch (error) {
        console.error("Failed to fetch gateways:", error);
    }

    return paymentGateways;
}

export function getPaymentGatewayById(id: string): PaymentGatewayConfig | undefined {
    return paymentGateways.find((gateway) => gateway.id === id);
}

export function getPaymentGatewayByType(type: PaymentGateway): PaymentGatewayConfig | undefined {
    return paymentGateways.find((gateway) => gateway.gateway === type);
}

export async function getActivePaymentGateways(): Promise<PaymentGatewayConfig[]> {
    try {
        const response = await fetch("/api/public/payments");
        if (!response.ok) {
            return [];
        }

        const data = await response.json();
        return normalizePaymentGateways(data.gateways || []);
    } catch (error) {
        console.error("getActivePaymentGateways error:", error);
        return [];
    }
}

export function getPaymentGatewaysByStatus(status: PaymentMethodStatus): PaymentGatewayConfig[] {
    return paymentGateways.filter((gateway) => gateway.status === status);
}

export async function addPaymentGateway(data: PaymentGatewayFormState): Promise<PaymentGatewayConfig> {
    await getPaymentGateways();

    const now = new Date().toISOString();
    const newGateway: PaymentGatewayConfig = {
        ...data,
        id: data.id || `pg-${Date.now()}-${data.gateway}`,
        updatedAt: now,
        createdAt: data.createdAt || now,
    };

    const updatedGateways = [...paymentGateways, newGateway];
    await PaymentService.saveAll(updatedGateways);
    paymentGateways = updatedGateways;

    return newGateway;
}

export async function updatePaymentGateway(id: string, data: Partial<PaymentGatewayFormState>): Promise<void> {
    const index = paymentGateways.findIndex((gateway) => gateway.id === id);

    if (index === -1) {
        return;
    }

    paymentGateways[index] = {
        ...paymentGateways[index],
        ...data,
        updatedAt: new Date().toISOString(),
    };

    await PaymentService.saveAll(paymentGateways);
}

export async function deletePaymentGateway(id: string): Promise<void> {
    paymentGateways = paymentGateways.filter((gateway) => gateway.id !== id);
    await PaymentService.saveAll(paymentGateways);
}

export async function togglePaymentGatewayStatus(id: string, status: PaymentMethodStatus): Promise<void> {
    const gateway = getPaymentGatewayById(id);
    if (!gateway) {
        return;
    }

    gateway.status = status;
    gateway.updatedAt = new Date().toISOString();
    await PaymentService.saveAll(paymentGateways);
}

export async function testPaymentGatewayConnection(id: string): Promise<boolean> {
    const gateway = getPaymentGatewayById(id);
    if (!gateway) {
        return false;
    }

    if (gateway.gateway === "bank_transfer") {
        return Boolean(gateway.bankAccount.bankName && gateway.bankAccount.iban && gateway.bankAccount.accountHolder);
    }

    if (gateway.gateway === "cod") {
        return true;
    }

    const result = await PaymentService.testGateway(id);
    return result.success;
}

export function validatePaymentGatewayConfig(
    config: Partial<PaymentGatewayFormState>,
    gateway: PaymentGateway,
): string[] {
    const errors: string[] = [];
    const definition = getPaymentProviderDefinition(gateway);

    if (!config.name?.trim()) {
        errors.push("Odeme yontemi adi gereklidir.");
    }

    definition.credentialFields.forEach((field) => {
        const value = config.credentials?.[field.key];
        if (field.required && (!value || !value.trim())) {
            errors.push(`${field.label} gereklidir.`);
        }
    });

    if (gateway === "bank_transfer") {
        if (!config.bankAccount?.bankName?.trim()) {
            errors.push("Banka adi gereklidir.");
        }
        if (!config.bankAccount?.iban?.trim()) {
            errors.push("IBAN gereklidir.");
        }
        if (!config.bankAccount?.accountHolder?.trim()) {
            errors.push("Hesap sahibi gereklidir.");
        }
    }

    if (gateway === "cod" && (config.codSettings?.maxOrderAmount ?? 0) < (config.codSettings?.minOrderAmount ?? 0)) {
        errors.push("Kapida odeme maksimum tutari minimum tutardan kucuk olamaz.");
    }

    if (config.environment === "production" && config.status === "active") {
        const missingRequiredCredentials = definition.credentialFields.some((field) => field.required && !config.credentials?.[field.key]?.trim());
        if (missingRequiredCredentials) {
            errors.push("Canli ortamda aktif etmek icin zorunlu API bilgileri doldurulmalidir.");
        }
    }

    return errors;
}

export function getPaymentGatewayStats() {
    const active = paymentGateways.filter((gateway) => gateway.status === "active").length;
    const inactive = paymentGateways.filter((gateway) => gateway.status === "inactive").length;
    const testMode = paymentGateways.filter((gateway) => gateway.status === "test").length;
    const production = paymentGateways.filter((gateway) => gateway.environment === "production").length;
    const sandbox = paymentGateways.filter((gateway) => gateway.environment === "sandbox").length;

    return {
        total: paymentGateways.length,
        active,
        inactive,
        testMode,
        production,
        sandbox,
    };
}

export async function updatePaymentGatewayOrder(ids: string[]): Promise<void> {
    paymentGateways = ids
        .map((id) => getPaymentGatewayById(id))
        .filter((gateway): gateway is PaymentGatewayConfig => Boolean(gateway));

    await PaymentService.saveAll(paymentGateways);
}

export async function duplicatePaymentGateway(id: string): Promise<PaymentGatewayConfig> {
    const original = getPaymentGatewayById(id);
    if (!original) {
        throw new Error("Payment gateway not found");
    }

    const duplicate: PaymentGatewayConfig = {
        ...original,
        id: `pg-${Date.now()}-${original.gateway}`,
        name: `${original.name} (Kopya)`,
        status: "inactive",
        credentials: Object.fromEntries(Object.keys(original.credentials).map((key) => [key, ""])),
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
    };

    return addPaymentGateway(duplicate);
}

export function getDefaultPaymentGatewayConfig(gateway: PaymentGateway): PaymentGatewayFormState {
    return createPaymentGatewayDefaults(gateway);
}
