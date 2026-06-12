import type { PaymentGatewayConfig } from "@/types/payment";
import { normalizePaymentGateways } from "./payment-providers";

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
