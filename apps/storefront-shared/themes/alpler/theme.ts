import type { PublicStorefront } from "@celebix/saas-contracts";

export type AlplerVisualTheme = "alpler-deniz";
export const ALPLER_STOREFRONT_ID = "9f1f6aed-8719-407e-b64c-fd8e956d3277";

export function alplerThemeFor(storefront: Pick<PublicStorefront, "id">): AlplerVisualTheme | undefined {
  return storefront.id === ALPLER_STOREFRONT_ID ? "alpler-deniz" : undefined;
}
