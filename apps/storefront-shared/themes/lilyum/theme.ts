import type { PublicStorefront } from "@celebix/saas-contracts";

export const LILYUM_STOREFRONT_ID = "89e1e15f-8282-4e9b-ae3e-f417501bd54a";
export type LilyumVisualTheme = "lilyum-deniz";
export function lilyumThemeFor(storefront: Pick<PublicStorefront, "id">): LilyumVisualTheme | undefined {
  return storefront.id === LILYUM_STOREFRONT_ID ? "lilyum-deniz" : undefined;
}
