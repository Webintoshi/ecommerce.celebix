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

export const ALPLER_SPOR_STORE_ADDRESS = "Ordu, Altınordu, Zübeyde Hanım Cad., 46A";

const ADDRESS_PLACEHOLDER_PATTERNS = [
  "mağaza adresi",
  "magaza adresi",
  "admin genel ayar",
  "storefront ayar",
  "otomatik güncellen",
  "burada görün",
  "adres bilgisi",
];

export function resolveStoreAddress(rawAddress: string | null | undefined) {
  const normalized = repairDisplayText(rawAddress || "").trim();

  if (!normalized) {
    return ALPLER_SPOR_STORE_ADDRESS;
  }

  const lowered = normalized.toLocaleLowerCase("tr-TR");
  if (ADDRESS_PLACEHOLDER_PATTERNS.some((pattern) => lowered.includes(pattern))) {
    return ALPLER_SPOR_STORE_ADDRESS;
  }

  return normalized;
}

export async function getStorefrontProfile(): Promise<StorefrontProfile> {
  const storeInfo = await getStoreInfo();
  const name = repairDisplayText(storeInfo?.name || STOREFRONT_RUNTIME.name);
  const email = storeInfo?.email || STOREFRONT_RUNTIME.supportEmail;
  const phone = storeInfo?.phone || STOREFRONT_RUNTIME.supportPhone;
  const address = resolveStoreAddress(storeInfo?.address);

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
    mapSearchUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
  };
}
