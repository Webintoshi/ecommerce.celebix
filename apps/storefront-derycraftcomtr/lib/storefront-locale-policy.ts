import type { LocaleRoutingConfig, StorefrontLocale } from "@/lib/i18n";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

const TURKISH_ONLY_HOST_MARKERS = ["derycraft.com.tr"];
const ENGLISH_MARKERS =
  /\b(?:about|products?|stores?|home|contact|corporate|handmade|leather|wallets?|watch|straps?|bands?|accessories|discover|returns?|privacy|checkout|premium storefront)\b/i;
const TURKISH_MARKERS =
  /[çğıöşüÇĞİÖŞÜ]|\b(?:urun|ürün|hakkimizda|hakkımızda|magaza|mağaza|iletisim|iletişim|gizlilik|iade|kurumsal|ana sayfa|odeme|ödeme|deri|kayis|kayış|aksesuar)\b/i;

export function isTurkishOnlyStorefront() {
  const siteUrl = STOREFRONT_RUNTIME.siteUrl.toLocaleLowerCase("en-US");

  return (
    STOREFRONT_RUNTIME.slug === "derycraftcomtr" ||
    TURKISH_ONLY_HOST_MARKERS.some((marker) => siteUrl.includes(marker))
  );
}

export function getForcedTurkishLocaleRoutingConfig(): LocaleRoutingConfig | null {
  if (!isTurkishOnlyStorefront()) {
    return null;
  }

  return {
    mode: "prefixless",
    sourceLocale: "tr",
    enabledLocales: [],
    availableLocales: ["tr"],
    showLocaleSwitcher: false,
  };
}

export function shouldBypassTranslationsForLocale(locale: StorefrontLocale) {
  return isTurkishOnlyStorefront() && locale === "tr";
}

export function shouldUseTurkishTextFallback(value?: string | null) {
  const normalized = typeof value === "string" ? value.trim() : "";

  if (!isTurkishOnlyStorefront() || !normalized) {
    return false;
  }

  return ENGLISH_MARKERS.test(normalized) && !TURKISH_MARKERS.test(normalized);
}
