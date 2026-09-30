import type { PublicStorefront } from "@celebix/saas-contracts";

export type GuzideVisualTheme = "guzide-deniz";

// Select the visual theme only after the runtime has resolved an active tenant.
export function guzideThemeFor(storefront: Pick<PublicStorefront, "id">): GuzideVisualTheme | undefined {
  return storefront.id === "a828862c-4cc1-475a-89cc-5fbee31eb43f"
    ? "guzide-deniz"
    : undefined;
}
