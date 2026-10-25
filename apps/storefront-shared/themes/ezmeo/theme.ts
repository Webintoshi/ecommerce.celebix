import type { PublicStorefront } from "@celebix/saas-contracts";

export const EZMEO_STOREFRONT_ID = "7892a771-67a9-42d7-9b36-f4c3e8562e95";
export type EzmeoVisualTheme = "ezmeo-deniz";

export function ezmeoThemeFor(storefront: Pick<PublicStorefront, "id">): EzmeoVisualTheme | undefined {
  return storefront.id === EZMEO_STOREFRONT_ID ? "ezmeo-deniz" : undefined;
}
