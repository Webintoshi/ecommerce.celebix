import { PaymentGatewayConfig } from "@/types/payment";

const API_URL = "/api/admin/payments";
const TEST_API_URL = "/api/admin/payments/test";

export const PaymentService = {
    async getAll(): Promise<PaymentGatewayConfig[]> {
        try {
            const res = await fetch(API_URL, {
                headers: {
                    "Content-Type": "application/json",
                },
            });

            if (!res.ok) throw new Error("Failed to fetch payment gateways");

            const data = await res.json();
            return data.gateways || [];
        } catch (error) {
            console.error("PaymentService.getAll error:", error);
            return []; // Fallback to empty array
        }
    },

    async saveAll(gateways: PaymentGatewayConfig[]): Promise<boolean> {
        try {
            const res = await fetch(API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ gateways })
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || "Failed to save settings");
            }

            return true;
        } catch (error) {
            console.error("PaymentService.saveAll error:", error);
            throw error;
        }
    },

    async testGateway(gatewayId: string): Promise<{ success: boolean; message?: string; error?: string }> {
        const res = await fetch(TEST_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ gatewayId }),
        });

        const data = await res.json();
        return {
            success: Boolean(data.success),
            message: data.message,
            error: data.error,
        };
    },
};
