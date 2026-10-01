import type { PublicStorefront } from "@celebix/saas-contracts";
export type CheckoutVisualTheme = "shared-checkout";

// Every active store uses the shared checkout; branding still comes from its resolved runtime.
export function checkoutVisualThemeFor(_storefront: Pick<PublicStorefront, "id">): CheckoutVisualTheme {
  return "shared-checkout";
}
