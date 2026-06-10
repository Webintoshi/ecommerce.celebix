const PAYMENT_LOGO_BY_GATEWAY: Record<string, string> = {
  paytr: "/payment-logos/paytr.png",
  iyzico: "/payment-logos/iyzico.png",
  paynet: "/payment-logos/paynet.png",
  craftgate: "/payment-logos/craftgate.png",
  stripe: "/payment-logos/stripe.png",
  bank_transfer: "/payment-logos/bank-transfer.png",
  cod: "/payment-logos/cod.png",
};

export function getCheckoutPaymentLogo(gateway?: string | null): string | null {
  if (!gateway) return null;
  return PAYMENT_LOGO_BY_GATEWAY[gateway] ?? null;
}
