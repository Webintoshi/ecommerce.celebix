import "server-only";

import crypto from "node:crypto";
import {
  DEFAULT_STORE_TRANSLATION_SETTINGS,
  normalizeStoreTranslationSettings,
  type StoreTranslationLocale,
} from "@celebix/platform-config/src/translation";
import { createServerClient } from "@/lib/supabase";
import { getTranslationSettings } from "@/lib/db/settings";
import { shouldBypassTranslationsForLocale } from "@/lib/storefront-locale-policy";

const DEEPL_FREE_API_URL = "https://api-free.deepl.com/v2/translate";
const MAX_BATCH_SIZE = 40;

const DEEPL_TARGET_LANGUAGE_MAP: Record<StoreTranslationLocale, string> = {
  tr: "TR",
  en: "EN-US",
  de: "DE",
  ru: "RU",
  ar: "AR",
  ka: "KA",
};

type TranslationFormat = "text" | "html";

type TranslationOptions = {
  locale: StoreTranslationLocale;
  context: string;
  format?: TranslationFormat;
  sourceLocale?: StoreTranslationLocale;
};

type TranslationCacheRow = {
  cache_key: string;
  translated_text: string;
};

type TranslationApiResponse = {
  translations?: Array<{ text?: string }>;
};

function hasHtmlLikeContent(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function sanitizeTranslatableText(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function supportsDeepLLocale(locale: StoreTranslationLocale) {
  return Boolean(DEEPL_TARGET_LANGUAGE_MAP[locale]);
}

function buildCacheKey(
  sourceLocale: StoreTranslationLocale,
  targetLocale: StoreTranslationLocale,
  context: string,
  format: TranslationFormat,
  sourceText: string,
) {
  return crypto
    .createHash("sha256")
    .update(["deepl", sourceLocale, targetLocale, context, format, sourceText].join("::"))
    .digest("hex");
}

async function getConfiguredTranslationSettings() {
  const settings = normalizeStoreTranslationSettings(await getTranslationSettings());
  const envApiKey = process.env.DEEPL_API_KEY?.trim() || "";

  return {
    ...settings,
    apiKey: settings.apiKey || envApiKey || DEFAULT_STORE_TRANSLATION_SETTINGS.apiKey || "",
  };
}

function shouldTranslateLocale(settings: Awaited<ReturnType<typeof getConfiguredTranslationSettings>>, locale: StoreTranslationLocale) {
  return (
    settings.enabled &&
    Boolean(settings.apiKey) &&
    supportsDeepLLocale(locale) &&
    locale !== settings.sourceLocale &&
    settings.enabledLocales.includes(locale)
  );
}

function shouldTranslateBetweenLocales(
  settings: Awaited<ReturnType<typeof getConfiguredTranslationSettings>>,
  sourceLocale: StoreTranslationLocale,
  targetLocale: StoreTranslationLocale,
) {
  if (
    !settings.enabled ||
    !settings.apiKey ||
    sourceLocale === targetLocale ||
    !supportsDeepLLocale(sourceLocale) ||
    !supportsDeepLLocale(targetLocale)
  ) {
    return false;
  }

  if (sourceLocale === settings.sourceLocale) {
    return settings.enabledLocales.includes(targetLocale);
  }

  if (targetLocale === settings.sourceLocale) {
    return settings.enabledLocales.includes(sourceLocale);
  }

  return settings.enabledLocales.includes(sourceLocale) && settings.enabledLocales.includes(targetLocale);
}

async function readTranslationCache(cacheKeys: string[]) {
  if (cacheKeys.length === 0) {
    return new Map<string, string>();
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("translation_cache")
    .select("cache_key, translated_text")
    .in("cache_key", cacheKeys);

  if (error) {
    console.error("Failed to read translation cache:", error);
    return new Map<string, string>();
  }

  return new Map(
    ((data as TranslationCacheRow[] | null) || []).map((row) => [row.cache_key, row.translated_text]),
  );
}

async function writeTranslationCache(
  entries: Array<{
    cacheKey: string;
    sourceLocale: StoreTranslationLocale;
    targetLocale: StoreTranslationLocale;
    context: string;
    format: TranslationFormat;
    sourceText: string;
    translatedText: string;
  }>,
) {
  if (entries.length === 0) {
    return;
  }

  const supabase = createServerClient();
  const { error } = await supabase.from("translation_cache").upsert(
    entries.map((entry) => ({
      cache_key: entry.cacheKey,
      provider: "deepl",
      source_locale: entry.sourceLocale,
      target_locale: entry.targetLocale,
      context_text: entry.context,
      content_format: entry.format,
      source_text: entry.sourceText,
      translated_text: entry.translatedText,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "cache_key" },
  );

  if (error) {
    console.error("Failed to write translation cache:", error);
  }
}

async function requestDeepLTranslations(
  apiKey: string,
  sourceLocale: StoreTranslationLocale,
  targetLocale: StoreTranslationLocale,
  texts: string[],
  context: string,
  format: TranslationFormat,
) {
  const params = new URLSearchParams();
  params.set("source_lang", DEEPL_TARGET_LANGUAGE_MAP[sourceLocale]);
  params.set("target_lang", DEEPL_TARGET_LANGUAGE_MAP[targetLocale]);
  params.set("context", context);

  if (format === "html") {
    params.set("tag_handling", "html");
  }

  for (const text of texts) {
    params.append("text", text);
  }

  const response = await fetch(DEEPL_FREE_API_URL, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepL translation failed (${response.status}): ${errorText || response.statusText}`);
  }

  const payload = (await response.json()) as TranslationApiResponse;
  return (payload.translations || []).map((entry) => sanitizeTranslatableText(entry.text));
}

export async function translateTextsBetweenLocales(
  values: Array<string | null | undefined>,
  options: {
    sourceLocale: StoreTranslationLocale;
    targetLocale: StoreTranslationLocale;
    context: string;
    format?: TranslationFormat;
  },
) {
  const settings = await getConfiguredTranslationSettings();
  const format = options.format || "text";

  if (!shouldTranslateBetweenLocales(settings, options.sourceLocale, options.targetLocale)) {
    return values.map((value) => value || "");
  }

  const normalizedValues = values.map((value) => sanitizeTranslatableText(value));
  const descriptors = normalizedValues.map((sourceText) => ({
    sourceText,
    cacheKey: buildCacheKey(
      options.sourceLocale,
      options.targetLocale,
      options.context,
      format,
      sourceText,
    ),
  }));

  const uniqueCacheKeys = Array.from(
    new Set(
      descriptors
        .filter((entry) => entry.sourceText.length > 0)
        .map((entry) => entry.cacheKey),
    ),
  );

  const cacheMap = await readTranslationCache(uniqueCacheKeys);
  const missingTexts = Array.from(
    new Map(
      descriptors
        .filter((entry) => entry.sourceText.length > 0 && !cacheMap.has(entry.cacheKey))
        .map((entry) => [entry.cacheKey, entry.sourceText]),
    ).entries(),
  );

  if (missingTexts.length > 0) {
    const translatedEntries: Array<{
      cacheKey: string;
      sourceLocale: StoreTranslationLocale;
      targetLocale: StoreTranslationLocale;
      context: string;
      format: TranslationFormat;
      sourceText: string;
      translatedText: string;
    }> = [];

    for (let index = 0; index < missingTexts.length; index += MAX_BATCH_SIZE) {
      const batch = missingTexts.slice(index, index + MAX_BATCH_SIZE);
      const batchTexts = batch.map((entry) => entry[1]);

      try {
        const translatedBatch = await requestDeepLTranslations(
          settings.apiKey,
          options.sourceLocale,
          options.targetLocale,
          batchTexts,
          options.context,
          format,
        );

        batch.forEach(([cacheKey, sourceText], batchIndex) => {
          const translatedText = sanitizeTranslatableText(translatedBatch[batchIndex]) || sourceText;
          cacheMap.set(cacheKey, translatedText);
          translatedEntries.push({
            cacheKey,
            sourceLocale: options.sourceLocale,
            targetLocale: options.targetLocale,
            context: options.context,
            format,
            sourceText,
            translatedText,
          });
        });
      } catch (error) {
        console.error("DeepL translation request failed:", error);
        batch.forEach(([cacheKey, sourceText]) => {
          cacheMap.set(cacheKey, sourceText);
        });
      }
    }

    await writeTranslationCache(translatedEntries);
  }

  return descriptors.map(({ sourceText, cacheKey }) => {
    if (!sourceText) {
      return "";
    }

    return cacheMap.get(cacheKey) || sourceText;
  });
}

export async function translateTexts(
  values: Array<string | null | undefined>,
  options: TranslationOptions,
) {
  const settings = await getConfiguredTranslationSettings();
  const sourceLocale = options.sourceLocale || settings.sourceLocale;
  return translateTextsBetweenLocales(values, {
    sourceLocale,
    targetLocale: options.locale,
    context: options.context,
    format: options.format,
  });
}

export async function translateText(value: string | null | undefined, options: TranslationOptions) {
  const [translated] = await translateTexts([value], {
    ...options,
    format: hasHtmlLikeContent(value || "") ? "html" : options.format,
  });
  return translated;
}

export async function translateProductRecord<
  T extends {
    name?: string | null;
    description?: string | null;
    shortDescription?: string | null;
    short_description?: string | null;
    seoTitle?: string | null;
    seo_title?: string | null;
    seoDescription?: string | null;
    seo_description?: string | null;
    variants?: Array<{
      name?: string | null;
      group_name?: string | null;
      groupName?: string | null;
    }> | null;
  },
>(product: T, locale: StoreTranslationLocale) {
  const settings = await getConfiguredTranslationSettings();
  return translateProductRecordWithSettings(product, locale, settings);
}

async function translateProductRecordWithSettings<
  T extends {
    name?: string | null;
    description?: string | null;
    shortDescription?: string | null;
    short_description?: string | null;
    seoTitle?: string | null;
    seo_title?: string | null;
    seoDescription?: string | null;
    seo_description?: string | null;
    variants?: Array<{
      name?: string | null;
      group_name?: string | null;
      groupName?: string | null;
    }> | null;
  },
>(
  product: T,
  locale: StoreTranslationLocale,
  settings: Awaited<ReturnType<typeof getConfiguredTranslationSettings>>,
) {
  if (!product) {
    return product;
  }

  if (!settings.translateCatalog || !shouldTranslateLocale(settings, locale)) {
    return product;
  }

  const [name, description, shortDescription, seoTitle, seoDescription] = await translateTexts(
    [
      product.name,
      product.description,
      product.shortDescription ?? product.short_description,
      product.seoTitle ?? product.seo_title,
      product.seoDescription ?? product.seo_description,
    ],
    {
      locale,
      context: "product",
    },
  );

  const variantList = Array.isArray(product.variants) ? product.variants : [];
  const translatedVariants = variantList.length
    ? await (async () => {
        const sourceTexts = variantList.flatMap((variant) => [
          variant?.name,
          variant?.group_name ?? variant?.groupName,
        ]);
        const translatedTexts = await translateTexts(sourceTexts, {
          locale,
          context: "product-variant",
        });

        let cursor = 0;
        return variantList.map((variant) => {
          const translatedName = translatedTexts[cursor++] || variant?.name || "";
          const translatedGroupName =
            translatedTexts[cursor++] || variant?.group_name || variant?.groupName || "";

          return {
            ...variant,
            name: translatedName,
            group_name: translatedGroupName,
            groupName: translatedGroupName,
          };
        });
      })()
    : variantList;

  return {
    ...product,
    translationSourceName: product.name || "",
    name,
    description,
    shortDescription,
    short_description: shortDescription,
    seoTitle,
    seo_title: seoTitle,
    seoDescription,
    seo_description: seoDescription,
    variants: translatedVariants,
  };
}

export async function translateCategoryRecord<
  T extends {
    name?: string | null;
    description?: string | null;
    seo_title?: string | null;
    seo_description?: string | null;
  },
>(category: T, locale: StoreTranslationLocale) {
  const settings = await getConfiguredTranslationSettings();
  return translateCategoryRecordWithSettings(category, locale, settings);
}

async function translateCategoryRecordWithSettings<
  T extends {
    name?: string | null;
    description?: string | null;
    seo_title?: string | null;
    seo_description?: string | null;
  },
>(
  category: T,
  locale: StoreTranslationLocale,
  settings: Awaited<ReturnType<typeof getConfiguredTranslationSettings>>,
) {
  if (!category) {
    return category;
  }

  if (!settings.translateCatalog || !shouldTranslateLocale(settings, locale)) {
    return category;
  }

  const [name, description, seoTitle, seoDescription] = await translateTexts(
    [category.name, category.description, category.seo_title, category.seo_description],
    {
      locale,
      context: "category",
    },
  );

  return {
    ...category,
    name,
    description,
    seo_title: seoTitle,
    seo_description: seoDescription,
  };
}

export async function translateProductCollection<
  T extends {
    name?: string | null;
    description?: string | null;
    shortDescription?: string | null;
    short_description?: string | null;
    seoTitle?: string | null;
    seo_title?: string | null;
    seoDescription?: string | null;
    seo_description?: string | null;
    variants?: Array<{
      name?: string | null;
      group_name?: string | null;
      groupName?: string | null;
    }> | null;
  },
>(products: T[], locale: StoreTranslationLocale) {
  const settings = await getConfiguredTranslationSettings();
  return Promise.all(
    products.map((product) => translateProductRecordWithSettings(product, locale, settings)),
  );
}

export async function translateCategoryCollection<
  T extends {
    name?: string | null;
    description?: string | null;
    seo_title?: string | null;
    seo_description?: string | null;
  },
>(categories: T[], locale: StoreTranslationLocale) {
  const settings = await getConfiguredTranslationSettings();
  return Promise.all(
    categories.map((category) => translateCategoryRecordWithSettings(category, locale, settings)),
  );
}

export async function translateSearchQueryToSourceLocale(
  value: string | null | undefined,
  locale: StoreTranslationLocale,
) {
  const settings = await getConfiguredTranslationSettings();
  const normalizedValue = sanitizeTranslatableText(value);

  if (!normalizedValue || !settings.translateCatalog || locale === settings.sourceLocale) {
    return normalizedValue;
  }

  const [translated] = await translateTextsBetweenLocales([normalizedValue], {
    sourceLocale: locale,
    targetLocale: settings.sourceLocale,
    context: "product-search-query",
  });

  return translated || normalizedValue;
}

export async function translateHomepageSectionCopy(locale: StoreTranslationLocale) {
  const settings = await getConfiguredTranslationSettings();
  if (!settings.translateUi || !shouldTranslateLocale(settings, locale)) {
    return {
      categoriesEyebrow: "Koleksiyonlar",
      categoriesHeading: "Kategoriler",
      viewAllLabel: "Tümünü Gör",
      testimonialsHeading: "Müşteri Yorumları",
      testimonialsCountLabel: "1581 değerlendirmeden",
      productGroups: [
        { title: "Çok Satanlar", subtitle: "Seçili Koleksiyon" },
        { title: "Apple Watch Kayışları", subtitle: "Öne Çıkanlar" },
        { title: "Aksesuarlar", subtitle: "Tamamlayıcılar" },
        { title: "Deri Saat Kayışları", subtitle: "Klasik Seçim" },
      ],
    };
  }

  const [
    categoriesEyebrow,
    categoriesHeading,
    viewAllLabel,
    testimonialsHeading,
    testimonialsCountLabel,
  ] = await translateTexts(
    [
      "Koleksiyonlar",
      "Kategoriler",
      "Tümünü Gör",
      "Müşteri Yorumları",
      "1581 değerlendirmeden",
    ],
    {
      locale,
      context: "homepage-ui",
    },
  );

  const groupRows = await translateTexts(
    [
      "Çok Satanlar",
      "Seçili Koleksiyon",
      "Apple Watch Kayışları",
      "Öne Çıkanlar",
      "Aksesuarlar",
      "Tamamlayıcılar",
      "Deri Saat Kayışları",
      "Klasik Seçim",
    ],
    {
      locale,
      context: "homepage-groups",
    },
  );

  return {
    categoriesEyebrow,
    categoriesHeading,
    viewAllLabel,
    testimonialsHeading,
    testimonialsCountLabel,
    productGroups: [
      { title: groupRows[0], subtitle: groupRows[1] },
      { title: groupRows[2], subtitle: groupRows[3] },
      { title: groupRows[4], subtitle: groupRows[5] },
      { title: groupRows[6], subtitle: groupRows[7] },
    ],
  };
}

export async function translateUiStrings(
  values: Record<string, string>,
  locale: StoreTranslationLocale,
  context: string,
) {
  if (shouldBypassTranslationsForLocale(locale)) {
    return values;
  }

  const settings = await getConfiguredTranslationSettings();
  if (!settings.translateUi || !shouldTranslateLocale(settings, locale)) {
    return values;
  }

  const entries = Object.entries(values);
  const translated = await translateTexts(
    entries.map((entry) => entry[1]),
    {
      locale,
      context,
    },
  );

  return Object.fromEntries(entries.map(([key], index) => [key, translated[index]])) as Record<string, string>;
}

export async function translateSeoStrings(
  values: Array<string | null | undefined>,
  locale: StoreTranslationLocale,
  context: string,
) {
  if (shouldBypassTranslationsForLocale(locale)) {
    return values.map((value) => value || "");
  }

  const settings = await getConfiguredTranslationSettings();
  if (!settings.translateSeo || !shouldTranslateLocale(settings, locale)) {
    return values.map((value) => value || "");
  }

  return translateTexts(values, {
    locale,
    context,
  });
}
