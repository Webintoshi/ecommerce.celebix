import "server-only";

import crypto from "node:crypto";
import {
  DEFAULT_STORE_TRANSLATION_SETTINGS,
  normalizeStoreTranslationSettings,
  type StoreTranslationLocale,
} from "@celebix/platform-config/src/translation";
import { createServerClient } from "@/lib/supabase";
import { getTranslationSettings } from "@/lib/db/settings";

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
export type CatalogTranslationWarmupScope = "products" | "categories" | "all";

type WarmupDescriptor = {
  sourceText: string;
  context: string;
  format: TranslationFormat;
};

type TranslationCacheRow = {
  cache_key: string;
};

type TranslationApiResponse = {
  translations?: Array<{ text?: string }>;
};

export type CatalogTranslationWarmupSummary = {
  locale: StoreTranslationLocale;
  scope: CatalogTranslationWarmupScope;
  productsProcessed: number;
  categoriesProcessed: number;
  newCacheEntries: number;
};

function sanitizeTranslatableText(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function hasHtmlLikeContent(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
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

async function readExistingCacheKeys(cacheKeys: string[]) {
  if (cacheKeys.length === 0) {
    return new Set<string>();
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("translation_cache")
    .select("cache_key")
    .in("cache_key", cacheKeys);

  if (error) {
    throw new Error(`Ceviri cache kayitlari okunamadi: ${error.message}`);
  }

  return new Set(((data as TranslationCacheRow[] | null) || []).map((row) => row.cache_key));
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
    throw new Error(`Ceviri cache kayitlari yazilamadi: ${error.message}`);
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

async function warmTranslationEntries(
  descriptors: WarmupDescriptor[],
  locale: StoreTranslationLocale,
  sourceLocale: StoreTranslationLocale,
  apiKey: string,
) {
  const normalizedDescriptors = descriptors
    .map((descriptor) => ({
      ...descriptor,
      sourceText: sanitizeTranslatableText(descriptor.sourceText),
    }))
    .filter((descriptor) => descriptor.sourceText.length > 0);

  if (normalizedDescriptors.length === 0) {
    return 0;
  }

  const uniqueDescriptors = Array.from(
    new Map(
      normalizedDescriptors.map((descriptor) => {
        const cacheKey = buildCacheKey(
          sourceLocale,
          locale,
          descriptor.context,
          descriptor.format,
          descriptor.sourceText,
        );

        return [
          cacheKey,
          {
            ...descriptor,
            cacheKey,
          },
        ];
      }),
    ).values(),
  );

  const existingCacheKeys = await readExistingCacheKeys(uniqueDescriptors.map((entry) => entry.cacheKey));
  const missingDescriptors = uniqueDescriptors.filter((entry) => !existingCacheKeys.has(entry.cacheKey));

  if (missingDescriptors.length === 0) {
    return 0;
  }

  const translatedEntries: Array<{
    cacheKey: string;
    sourceLocale: StoreTranslationLocale;
    targetLocale: StoreTranslationLocale;
    context: string;
    format: TranslationFormat;
    sourceText: string;
    translatedText: string;
  }> = [];

  const groups = new Map<string, typeof missingDescriptors>();
  for (const descriptor of missingDescriptors) {
    const key = `${descriptor.context}::${descriptor.format}`;
    const currentGroup = groups.get(key) || [];
    currentGroup.push(descriptor);
    groups.set(key, currentGroup);
  }

  for (const group of groups.values()) {
    for (let index = 0; index < group.length; index += MAX_BATCH_SIZE) {
      const batch = group.slice(index, index + MAX_BATCH_SIZE);
      const translatedBatch = await requestDeepLTranslations(
        apiKey,
        sourceLocale,
        locale,
        batch.map((entry) => entry.sourceText),
        batch[0]?.context || "catalog",
        batch[0]?.format || "text",
      );

      batch.forEach((entry, batchIndex) => {
        translatedEntries.push({
          cacheKey: entry.cacheKey,
          sourceLocale,
          targetLocale: locale,
          context: entry.context,
          format: entry.format,
          sourceText: entry.sourceText,
          translatedText: sanitizeTranslatableText(translatedBatch[batchIndex]) || entry.sourceText,
        });
      });
    }
  }

  await writeTranslationCache(translatedEntries);
  return translatedEntries.length;
}

async function warmProductTranslations(
  locale: StoreTranslationLocale,
  sourceLocale: StoreTranslationLocale,
  apiKey: string,
) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("products")
    .select(`
      id,
      name,
      description,
      short_description,
      seo_title,
      seo_description,
      variants:product_variants(name, group_name)
    `)
    .eq("is_active", true)
    .or("status.eq.published,status.is.null")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Urunler okunamadi: ${error.message}`);
  }

  const products = (data || []) as Array<{
    name?: string | null;
    description?: string | null;
    short_description?: string | null;
    seo_title?: string | null;
    seo_description?: string | null;
    variants?: Array<{ name?: string | null; group_name?: string | null }> | null;
  }>;

  const productDescriptors = products.flatMap((product) => [
    { sourceText: product.name || "", context: "product", format: "text" as const },
    {
      sourceText: product.description || "",
      context: "product",
      format: hasHtmlLikeContent(product.description || "") ? "html" : "text",
    },
    { sourceText: product.short_description || "", context: "product", format: "text" as const },
    { sourceText: product.seo_title || "", context: "product", format: "text" as const },
    { sourceText: product.seo_description || "", context: "product", format: "text" as const },
  ]);

  const variantDescriptors = products.flatMap((product) =>
    (product.variants || []).flatMap((variant) => [
      { sourceText: variant.name || "", context: "product-variant", format: "text" as const },
      { sourceText: variant.group_name || "", context: "product-variant", format: "text" as const },
    ]),
  );

  const [productCacheEntries, variantCacheEntries] = await Promise.all([
    warmTranslationEntries(productDescriptors, locale, sourceLocale, apiKey),
    warmTranslationEntries(variantDescriptors, locale, sourceLocale, apiKey),
  ]);

  return {
    productsProcessed: products.length,
    newCacheEntries: productCacheEntries + variantCacheEntries,
  };
}

async function warmCategoryTranslations(
  locale: StoreTranslationLocale,
  sourceLocale: StoreTranslationLocale,
  apiKey: string,
) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, description, seo_title, seo_description")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(`Kategoriler okunamadi: ${error.message}`);
  }

  const categories = (data || []) as Array<{
    name?: string | null;
    description?: string | null;
    seo_title?: string | null;
    seo_description?: string | null;
  }>;

  const descriptors = categories.flatMap((category) => [
    { sourceText: category.name || "", context: "category", format: "text" as const },
    {
      sourceText: category.description || "",
      context: "category",
      format: hasHtmlLikeContent(category.description || "") ? "html" : "text",
    },
    { sourceText: category.seo_title || "", context: "category", format: "text" as const },
    { sourceText: category.seo_description || "", context: "category", format: "text" as const },
  ]);

  const newCacheEntries = await warmTranslationEntries(descriptors, locale, sourceLocale, apiKey);
  return {
    categoriesProcessed: categories.length,
    newCacheEntries,
  };
}

export async function warmCatalogTranslations(
  locale: StoreTranslationLocale,
  scope: CatalogTranslationWarmupScope,
): Promise<CatalogTranslationWarmupSummary> {
  const settings = await getConfiguredTranslationSettings();

  if (!settings.enabled) {
    throw new Error("Canli ceviri kapali. Once ceviriyi etkinlestirin.");
  }

  if (!settings.translateCatalog) {
    throw new Error("Katalog cevirisi kapali. Once katalog cevirisini etkinlestirin.");
  }

  if (!settings.apiKey) {
    throw new Error("DeepL API anahtari bulunamadi.");
  }

  if (locale === settings.sourceLocale) {
    throw new Error("Kaynak dil icin katalog warm-up calistirilamaz.");
  }

  if (!settings.enabledLocales.includes(locale)) {
    throw new Error("Secilen hedef dil ceviri ayarlarinda etkin degil.");
  }

  if (!supportsDeepLLocale(locale) || !supportsDeepLLocale(settings.sourceLocale)) {
    throw new Error("Secilen dil DeepL ile desteklenmiyor.");
  }

  const summary: CatalogTranslationWarmupSummary = {
    locale,
    scope,
    productsProcessed: 0,
    categoriesProcessed: 0,
    newCacheEntries: 0,
  };

  if (scope === "products" || scope === "all") {
    const productSummary = await warmProductTranslations(locale, settings.sourceLocale, settings.apiKey);
    summary.productsProcessed = productSummary.productsProcessed;
    summary.newCacheEntries += productSummary.newCacheEntries;
  }

  if (scope === "categories" || scope === "all") {
    const categorySummary = await warmCategoryTranslations(locale, settings.sourceLocale, settings.apiKey);
    summary.categoriesProcessed = categorySummary.categoriesProcessed;
    summary.newCacheEntries += categorySummary.newCacheEntries;
  }

  return summary;
}
