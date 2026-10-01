import type { PublicStorefront } from "@celebix/saas-contracts";
import { alplerThemeFor, type AlplerVisualTheme } from "../themes/alpler/theme.ts";
import { guzideThemeFor, type GuzideVisualTheme } from "../themes/guzide/theme.ts";

export type CheckoutVisualTheme = AlplerVisualTheme | GuzideVisualTheme;

// Checkout styling follows the tenant already resolved by the storefront runtime.
export function checkoutVisualThemeFor(storefront: Pick<PublicStorefront, "id">): CheckoutVisualTheme | undefined {
  return alplerThemeFor(storefront) ?? guzideThemeFor(storefront);
}
