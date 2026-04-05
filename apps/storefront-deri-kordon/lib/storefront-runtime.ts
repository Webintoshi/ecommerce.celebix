const DEFAULT_SITE_URL = "https://derycraft.com";
const DEFAULT_STORE_NAME = "DeryCraft";
const DEFAULT_TAGLINE = "El yapimi hakiki deri kordonlar ve premium aksesuarlar.";
const DEFAULT_DESCRIPTION =
  "Roarcraft kalitesinde, yuzde yuz el yapimi hakiki deri kordonlar, Apple Watch kayislari ve premium deri aksesuarlar.";
const DEFAULT_SUPPORT_EMAIL = "bilgi@derycraft.com";
const DEFAULT_SUPPORT_PHONE = "+90 555 000 00 00";
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

export const STOREFRONT_RUNTIME = {
  name: process.env.NEXT_PUBLIC_STORE_NAME || DEFAULT_STORE_NAME,
  tagline: process.env.NEXT_PUBLIC_STORE_TAGLINE || DEFAULT_TAGLINE,
  description: process.env.NEXT_PUBLIC_STORE_DESCRIPTION || DEFAULT_DESCRIPTION,
  siteUrl,
  logoPath: process.env.NEXT_PUBLIC_STORE_LOGO || DEFAULT_LOGO_PATH,
  supportEmail: process.env.NEXT_PUBLIC_STORE_SUPPORT_EMAIL || DEFAULT_SUPPORT_EMAIL,
  supportPhone: process.env.NEXT_PUBLIC_STORE_SUPPORT_PHONE || DEFAULT_SUPPORT_PHONE,
  supportPhoneLink: normalizePhoneLink(
    process.env.NEXT_PUBLIC_STORE_SUPPORT_PHONE || DEFAULT_SUPPORT_PHONE
  ),
  socialInstagram:
    process.env.NEXT_PUBLIC_STORE_INSTAGRAM || "https://instagram.com/ornekmagaza",
  socialFacebook:
    process.env.NEXT_PUBLIC_STORE_FACEBOOK || "https://facebook.com/ornekmagaza",
  socialTwitter:
    process.env.NEXT_PUBLIC_STORE_TWITTER || "https://twitter.com/ornekmagaza",
  shippingMessage:
    process.env.NEXT_PUBLIC_FREE_SHIPPING_TEXT || "500 TL uzeri siparislerde ucretsiz kargo",
  gtmId: process.env.NEXT_PUBLIC_GTM_ID || "",
} as const;

export function absoluteStorefrontUrl(pathname = "/"): string {
  return new URL(pathname, STOREFRONT_RUNTIME.siteUrl).toString();
}
