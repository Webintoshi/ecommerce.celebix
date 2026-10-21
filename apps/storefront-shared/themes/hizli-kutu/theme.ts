import type { PublicStorefront } from "@celebix/saas-contracts";

export const HIZLI_KUTU_STOREFRONT_ID = "eae7be09-f362-4681-9df7-18de95eff4cf";
export type HizliVisualTheme = "hizli-kutu-deniz";
export function hizliThemeFor(storefront: Pick<PublicStorefront, "id">): HizliVisualTheme | undefined {
  return storefront.id === HIZLI_KUTU_STOREFRONT_ID ? "hizli-kutu-deniz" : undefined;
}
