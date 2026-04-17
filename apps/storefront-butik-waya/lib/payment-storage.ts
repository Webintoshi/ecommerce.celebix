import { PaymentGatewayConfig } from "@/types/payment";

const STORAGE_KEY = "celebix_storefront_payment_gateways";

export function getStoredPaymentGateways(): PaymentGatewayConfig[] {
    if (typeof window === "undefined") return [];

    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (error) {
        console.error("Error loading payment gateways from storage:", error);
    }

    return [];
}

export function savePaymentGateways(gateways: PaymentGatewayConfig[]): void {
    if (typeof window === "undefined") return;

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(gateways));
    } catch (error) {
        console.error("Error saving payment gateways to storage:", error);
    }
}

export function addStoredPaymentGateway(gateway: PaymentGatewayConfig): void {
    const gateways = getStoredPaymentGateways();
    const existingIndex = gateways.findIndex(g => g.id === gateway.id);

    if (existingIndex >= 0) {
        gateways[existingIndex] = gateway;
    } else {
        gateways.push(gateway);
    }

    savePaymentGateways(gateways);
}

export function deleteStoredPaymentGateway(id: string): void {
    const gateways = getStoredPaymentGateways();
    const filtered = gateways.filter(g => g.id !== id);
    savePaymentGateways(filtered);
}

export function updateStoredPaymentGateway(id: string, updates: Partial<PaymentGatewayConfig>): void {
    const gateways = getStoredPaymentGateways();
    const index = gateways.findIndex(g => g.id === id);

    if (index >= 0) {
        gateways[index] = { ...gateways[index], ...updates };
        savePaymentGateways(gateways);
    }
}
