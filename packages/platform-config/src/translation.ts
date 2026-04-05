export const STORE_TRANSLATION_LOCALES = ["tr", "en", "de", "ru", "ar", "ka"] as const;

export type StoreTranslationLocale = (typeof STORE_TRANSLATION_LOCALES)[number];
export type TranslationProvider = "deepl";

export interface StoreTranslationSettings {
  enabled: boolean;
  provider: TranslationProvider;
  sourceLocale: StoreTranslationLocale;
  enabledLocales: StoreTranslationLocale[];
  apiKey?: string;
  translateCatalog: boolean;
  translateSeo: boolean;
  translateUi: boolean;
}

export const DEFAULT_STORE_TRANSLATION_SETTINGS: StoreTranslationSettings = {
  enabled: false,
  provider: "deepl",
  sourceLocale: "tr",
  enabledLocales: ["en", "de", "ru", "ar", "ka"],
  apiKey: "",
  translateCatalog: true,
  translateSeo: true,
  translateUi: true,
};

function isStoreTranslationLocale(value: unknown): value is StoreTranslationLocale {
  return (
    typeof value === "string" &&
    (STORE_TRANSLATION_LOCALES as readonly string[]).includes(value)
  );
}

function normalizeEnabledLocales(value: unknown): StoreTranslationLocale[] {
  const locales = Array.isArray(value) ? value.filter(isStoreTranslationLocale) : [];
  const filtered = locales.filter((locale) => locale !== "tr");

  return filtered.length > 0 ? Array.from(new Set(filtered)) : DEFAULT_STORE_TRANSLATION_SETTINGS.enabledLocales;
}

export function normalizeStoreTranslationSettings(
  value?: Partial<StoreTranslationSettings> | null,
  fallback: StoreTranslationSettings = DEFAULT_STORE_TRANSLATION_SETTINGS,
): StoreTranslationSettings {
  return {
    enabled: value?.enabled === true,
    provider: value?.provider === "deepl" ? "deepl" : fallback.provider,
    sourceLocale: isStoreTranslationLocale(value?.sourceLocale) ? value.sourceLocale : fallback.sourceLocale,
    enabledLocales: normalizeEnabledLocales(value?.enabledLocales),
    apiKey: typeof value?.apiKey === "string" ? value.apiKey.trim() : fallback.apiKey || "",
    translateCatalog: value?.translateCatalog !== false,
    translateSeo: value?.translateSeo !== false,
    translateUi: value?.translateUi !== false,
  };
}

