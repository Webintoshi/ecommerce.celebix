const DEFAULT_SITE_URL = "https://store.celebix.co";
const DEFAULT_STORE_NAME = "Yeni Magaza";
const DEFAULT_TAGLINE = "Ozenle secilmis urunler, guvenli alisveris ve hizli teslimat.";
const DEFAULT_DESCRIPTION =
  "Yeni sezon urunleri, secili koleksiyonlar ve marka hikayesi tek bir modern alisveris deneyiminde bulusur.";
const DEFAULT_SUPPORT_EMAIL = "destek@store.celebix.co";
const DEFAULT_SUPPORT_PHONE = "+90 532 000 00 00";
const DEFAULT_LOGO_PATH = "/placeholder-storefront-logo.svg";

function normalizeUrl(value: string | undefined, fallback: string): string {
  const raw = value?.trim();

  if (!raw) {
    return fallback;
  }

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw;
  }

  return `https://${raw}`;
}

function normalizePhoneLink(phone: string): string {
  return phone.replace(/\s+/g, "");
}

const siteUrl = normalizeUrl(process.env.NEXT_PUBLIC_SITE_URL, DEFAULT_SITE_URL);
const databaseMode =
  process.env.DATABASE_MODE ||
  process.env.NEXT_PUBLIC_RUNTIME_DATABASE_MODE ||
  "full_supabase";

export const STOREFRONT_RUNTIME = {
  name: process.env.NEXT_PUBLIC_STORE_NAME || DEFAULT_STORE_NAME,
  tagline: process.env.NEXT_PUBLIC_STORE_TAGLINE || DEFAULT_TAGLINE,
  description: process.env.NEXT_PUBLIC_STORE_DESCRIPTION || DEFAULT_DESCRIPTION,
  databaseMode,
  siteUrl,
  logoPath: process.env.NEXT_PUBLIC_STORE_LOGO || DEFAULT_LOGO_PATH,
  supportEmail: process.env.NEXT_PUBLIC_STORE_SUPPORT_EMAIL || DEFAULT_SUPPORT_EMAIL,
  supportPhone: process.env.NEXT_PUBLIC_STORE_SUPPORT_PHONE || DEFAULT_SUPPORT_PHONE,
  supportPhoneLink: normalizePhoneLink(
    process.env.NEXT_PUBLIC_STORE_SUPPORT_PHONE || DEFAULT_SUPPORT_PHONE
  ),
  socialInstagram:
    process.env.NEXT_PUBLIC_STORE_INSTAGRAM || "https://instagram.com/celebix.co",
  socialFacebook:
    process.env.NEXT_PUBLIC_STORE_FACEBOOK || "https://facebook.com/celebixco",
  socialTwitter:
    process.env.NEXT_PUBLIC_STORE_TWITTER || "https://twitter.com/celebixco",
  shippingMessage:
    process.env.NEXT_PUBLIC_FREE_SHIPPING_TEXT ||
    "Yeni sezon vitrini yayinda",
  gtmId: process.env.NEXT_PUBLIC_GTM_ID || "",
} as const;

export function absoluteStorefrontUrl(pathname = "/"): string {
  return new URL(pathname, STOREFRONT_RUNTIME.siteUrl).toString();
}
