import "server-only";

import { getOrSetCachedValue } from "@/lib/cache/memory-cache";
import { getTranslationSettings } from "@/lib/db/settings";
import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  type LocaleRoutingConfig,
  type StorefrontLocale,
} from "@/lib/i18n";
import { getForcedTurkishLocaleRoutingConfig } from "@/lib/storefront-locale-policy";

const LOCALE_ROUTING_CACHE_KEY = "storefront:locale-routing:v1";
const LOCALE_ROUTING_CACHE_TTL_MS = 15_000;

function dedupeLocales(locales: StorefrontLocale[]) {
  return Array.from(new Set(locales));
}

export function deriveLocaleRoutingConfig(input: {
  enabled?: boolean;
  sourceLocale?: string | null;
  enabledLocales?: string[] | null;
}): LocaleRoutingConfig {
  const sourceLocale = isSupportedLocale(input.sourceLocale)
    ? input.sourceLocale
    : DEFAULT_LOCALE;
  const enabledLocales = dedupeLocales(
    (Array.isArray(input.enabledLocales) ? input.enabledLocales : [])
      .filter(isSupportedLocale)
      .filter((locale) => locale !== sourceLocale),
  );
  const mode = input.enabled === true ? "prefixed" : "prefixless";
  const availableLocales =
    mode === "prefixed"
      ? dedupeLocales([sourceLocale, ...enabledLocales])
      : [sourceLocale];

  return {
    mode,
    sourceLocale,
    enabledLocales,
    availableLocales,
    showLocaleSwitcher: mode === "prefixed" && availableLocales.length > 1,
  };
}

export async function getLocaleRoutingConfig(): Promise<LocaleRoutingConfig> {
  return getOrSetCachedValue(LOCALE_ROUTING_CACHE_KEY, LOCALE_ROUTING_CACHE_TTL_MS, async () => {
    const forcedConfig = getForcedTurkishLocaleRoutingConfig();
    if (forcedConfig) {
      return forcedConfig;
    }

    const settings = await getTranslationSettings();
    return deriveLocaleRoutingConfig(settings);
  });
}
