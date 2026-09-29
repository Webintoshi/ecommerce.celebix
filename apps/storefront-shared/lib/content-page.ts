import { FIXED_STOREFRONT_POLICIES } from "@celebix/saas-contracts";
import type { PublicContentPage, PublicContentV2 } from "@celebix/saas-data";
import { normalizeProductDescriptionHtml } from "@celebix/platform-config/src/product-description-rich-text.ts";
import { contentPath } from "./content-locale.ts";

export function buildPublicContentPage(source: PublicContentPage, expectedSlug: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(expectedSlug) || source.slug !== expectedSlug || !source.title || (source.body != null && typeof source.body !== "string")) throw new TypeError("storefront_content_page_invalid");
  const body = source.body ?? "";
  const html = body.trim() ? normalizeProductDescriptionHtml(body, source.title) : "";
  return Object.freeze({ ...source, route: `/pages/${source.slug}`, html });
}

export function buildPublicContentPageV2(source: PublicContentV2, expectedSlug: string, defaultLocale: string) {
  if (source.kind !== "page" || source.slug !== expectedSlug) throw new TypeError("storefront_content_page_invalid");
  return Object.freeze({ ...source, route: contentPath("page", source.slug, source.locale, defaultLocale), html: source.body.trim() ? normalizeProductDescriptionHtml(source.body, source.title) : "" });
}


// Compatibility for announcement links saved before fixed policies had canonical routes.
export function legacyPolicyPageRoute(slug: string): string | null {
  const keys: Readonly<Record<string, string>> = {
    "gizlilik-guvenlik": "privacy_security", "gizlilik-ve-guvenlik": "privacy_security",
    "mesafeli-satis-sozlesmesi": "distance_sales", "kvkk": "kvkk",
    "odeme-teslimat": "payment_delivery", "odeme-ve-teslimat": "payment_delivery",
    "cerez-kullanimi": "cookie_usage", "iade-degisim": "returns_exchanges",
    "iade-ve-degisim": "returns_exchanges", "uyelik-sozlesmesi": "membership",
  };
  return FIXED_STOREFRONT_POLICIES.find((policy) => policy.key === keys[slug])?.route ?? null;
}
