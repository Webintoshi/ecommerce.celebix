import type { PublicDesignMedia, PublicStorefront } from "@celebix/saas-contracts";
import { lilyumThemeFor, LILYUM_STOREFRONT_ID } from "./theme.ts";

export const LILYUM_REFINED_LOGO = "/themes/lilyum/logo-refined-v1.webp";
const ORIGINAL_PATH = `/stores/${LILYUM_STOREFRONT_ID}/design/c9c0df33-d646-59a4-ba36-a538b32d2a31.jpg`;
type LilyumLogo = NonNullable<PublicDesignMedia>;

export function lilyumLogoFor<T extends LilyumLogo>(storefront: Pick<PublicStorefront, "id">, logo: T): T;
export function lilyumLogoFor<T extends LilyumLogo>(storefront: Pick<PublicStorefront, "id">, logo: T | undefined): T | undefined;
export function lilyumLogoFor<T extends LilyumLogo>(storefront: Pick<PublicStorefront, "id">, logo: T | null): T | null;
export function lilyumLogoFor<T extends LilyumLogo>(storefront: Pick<PublicStorefront, "id">, logo: T | null | undefined): T | null | undefined;
export function lilyumLogoFor<T extends LilyumLogo>(storefront: Pick<PublicStorefront, "id">, logo: T | null | undefined): T | null | undefined {
  if (!logo || !lilyumThemeFor(storefront)) return logo;
  try {
    // Only migrate the original file; subsequently published admin logos win.
    if (new URL(logo.url).pathname !== ORIGINAL_PATH) return logo;
  } catch { return logo; }
  return { ...logo, url: LILYUM_REFINED_LOGO };
}
