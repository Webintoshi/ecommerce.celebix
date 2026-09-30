import type { PublicStorefront } from "@celebix/saas-contracts";

export type SioraVisualTheme = "siora-deniz";
export const SIORA_STOREFRONT_ID = "ff465e64-1491-40ef-8840-c66281155a1d";

// A visual theme is selected only after the runtime has resolved the tenant.
export function sioraThemeFor(storefront: Pick<PublicStorefront, "id">): SioraVisualTheme | undefined {
  return storefront.id === SIORA_STOREFRONT_ID
    ? "siora-deniz"
    : undefined;
}
