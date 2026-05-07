import { getStoreInfo } from "@/lib/db/settings";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";
import { repairDisplayText } from "@/lib/display-text";

export type StorefrontProfile = {
  name: string;
  email: string;
  phone: string;
  phoneLink: string;
  address: string;
  currency: string;
  timezone: string;
  logoUrl?: string;
  faviconUrl?: string;
  socialInstagram?: string;
  socialTwitter?: string;
  tagline: string;
  description: string;
  mapSearchUrl: string;
};

const DEFAULT_ADDRESS =
  "Mağaza adresi ve fiziksel deneyim bilgileri admin genel ayarlarından girildiğinde bu alan otomatik güncellenir.";

export async function getStorefrontProfile(): Promise<StorefrontProfile> {
  const storeInfo = await getStoreInfo();
  const name = repairDisplayText(storeInfo?.name || STOREFRONT_RUNTIME.name);
  const email = storeInfo?.email || STOREFRONT_RUNTIME.supportEmail;
  const phone = storeInfo?.phone || STOREFRONT_RUNTIME.supportPhone;
  const address = repairDisplayText(storeInfo?.address || DEFAULT_ADDRESS);

  return {
    name,
    email,
    phone,
    phoneLink: phone.replace(/\s+/g, ""),
    address,
    currency: storeInfo?.currency || "TRY",
    timezone: storeInfo?.timezone || "Europe/Istanbul",
    logoUrl: storeInfo?.logoUrl,
    faviconUrl: storeInfo?.faviconUrl,
    socialInstagram: storeInfo?.socialInstagram || STOREFRONT_RUNTIME.socialInstagram,
    socialTwitter: storeInfo?.socialTwitter || STOREFRONT_RUNTIME.socialTwitter,
    tagline: repairDisplayText(STOREFRONT_RUNTIME.tagline),
    description: repairDisplayText(STOREFRONT_RUNTIME.description),
    mapSearchUrl: storeInfo?.address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(storeInfo.address)}`
      : STOREFRONT_RUNTIME.siteUrl,
  };
}
