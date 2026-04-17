import { buildGoogleMerchantFeedXml, normalizeGoogleMerchantFeedSettings, normalizeGoogleMerchantText, validateGoogleMerchantFeedItem, type GoogleMerchantFeedItem } from "@celebix/platform-config/src/google-merchant";
import { resolveStorefrontDirectAssetUrl } from "@/lib/asset-url";
import { fetchCategoriesServer } from "@/lib/categories";
import { buildLocalizedPath } from "@/lib/i18n";
import { getAllProducts } from "@/lib/products";
import { getRequestOrigin } from "@/lib/request-origin";
import { createServerClient } from "@/lib/supabase";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

type CategoryRecord = {
  id: string;
  name: string;
  slug: string;
  parent_id?: string | null;
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => asString(item)).filter(Boolean)
    : [];
}

function normalizeVariantAttributes(rawAttributes: unknown) {
  const map = new Map<string, string>();

  if (Array.isArray(rawAttributes)) {
    for (const entry of rawAttributes) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const key = asString(
        record.attributeName || record.attribute_name || record.name || record.key || record.code,
      ).toLocaleLowerCase("tr");
      const value = asString(record.value || record.label || record.displayValue || record.text);
      if (key && value) {
        map.set(key, value);
      }
    }
    return map;
  }

  if (rawAttributes && typeof rawAttributes === "object") {
    for (const [key, value] of Object.entries(rawAttributes as Record<string, unknown>)) {
      const normalizedValue = asString(value);
      if (key && normalizedValue) {
        map.set(key.toLocaleLowerCase("tr"), normalizedValue);
      }
    }
  }

  return map;
}

function getAttributeValue(attributes: Map<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = attributes.get(key.toLocaleLowerCase("tr"));
    if (value) {
      return value;
    }
  }

  return undefined;
}

function buildVariantTitle(productName: string, variantName: string) {
  const cleanVariantName = asString(variantName);
  if (!cleanVariantName) {
    return productName;
  }

  const normalizedVariantName = cleanVariantName.toLocaleLowerCase("tr");
  if (
    ["standart", "default", "varsayilan"].includes(normalizedVariantName) ||
    productName.toLocaleLowerCase("tr").includes(normalizedVariantName)
  ) {
    return productName;
  }

  return `${productName} - ${cleanVariantName}`;
}

function buildProductType(product: { category?: string | null; subcategory?: string | null }, categoryMap: Map<string, CategoryRecord>) {
  const parts: string[] = [];
  const categoryKey = asString(product.category);
  const subcategoryKey = asString(product.subcategory);
  const category = categoryMap.get(categoryKey);
  const subcategory = categoryMap.get(subcategoryKey);

  if (category?.name) {
    parts.push(category.name);
  } else if (categoryKey) {
    parts.push(categoryKey);
  }

  if (subcategory?.name) {
    parts.push(subcategory.name);
  } else if (subcategoryKey && subcategoryKey !== categoryKey) {
    parts.push(subcategoryKey);
  }

  return parts.join(" > ") || undefined;
}

function formatMerchantPrice(price: number, currency: string) {
  return `${price.toFixed(2)} ${currency}`;
}

async function fetchGoogleMerchantSettings() {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("marketplace_provider_connections")
      .select("settings")
      .eq("provider", "google_merchant")
      .maybeSingle();

    if (error) {
      return normalizeGoogleMerchantFeedSettings({});
    }

    return normalizeGoogleMerchantFeedSettings((data?.settings as Record<string, unknown> | null) || {});
  } catch {
    return normalizeGoogleMerchantFeedSettings({});
  }
}

export async function buildGoogleMerchantFeedForStorefront() {
  const [settings, products, categories, requestOrigin] = await Promise.all([
    fetchGoogleMerchantSettings(),
    getAllProducts(),
    fetchCategoriesServer(),
    getRequestOrigin(),
  ]);

  const categoryMap = new Map<string, CategoryRecord>();
  for (const category of (categories || []) as CategoryRecord[]) {
    categoryMap.set(category.slug, category);
    categoryMap.set(category.id, category);
  }

  const items: GoogleMerchantFeedItem[] = [];

  for (const product of products) {
    const productImages = asStringArray(product.images);

    for (const variant of product.variants || []) {
      const variantImages = asStringArray(variant.images);
      const mergedImages = [...variantImages, ...productImages]
        .map((image) => {
          const direct = resolveStorefrontDirectAssetUrl(image);
          if (direct.startsWith("http://") || direct.startsWith("https://")) {
            return direct;
          }
          if (direct.startsWith("/")) {
            return new URL(direct, requestOrigin).toString();
          }
          return direct;
        })
        .filter(Boolean)
        .filter((image, index, array) => array.indexOf(image) === index);

      const attributes = normalizeVariantAttributes(
        (variant as { raw_attributes?: unknown }).raw_attributes,
      );
      const gtin = asString(product.gtin) || asString(variant.barcode);
      const mpn = asString(variant.sku) || asString(product.sku);
      const item: GoogleMerchantFeedItem = {
        id: asString(variant.sku) || asString(variant.barcode) || `${product.id}-${variant.id}`,
        title: normalizeGoogleMerchantText(
          buildVariantTitle(product.name, variant.name),
          150,
        ),
        description: normalizeGoogleMerchantText(
          asString(product.description) || asString(product.shortDescription) || product.name,
          5000,
        ),
        link: new URL(
          buildLocalizedPath(`/urunler/${product.slug}`, settings.contentLanguage as never),
          requestOrigin,
        ).toString(),
        imageLink: mergedImages[0] || "",
        additionalImageLinks: mergedImages.slice(1, 10),
        availability: Number(variant.stock) > 0 ? "in_stock" : "out_of_stock",
        price:
          Number.isFinite(Number(variant.price)) && Number(variant.price) > 0
            ? formatMerchantPrice(Number(variant.price), settings.currency)
            : "",
        condition: settings.defaultCondition,
        brand: asString(product.brand) || STOREFRONT_RUNTIME.name,
        gtin: gtin || undefined,
        mpn: mpn || undefined,
        identifierExists: gtin || mpn ? undefined : "no",
        itemGroupId: product.id,
        productType: buildProductType(product, categoryMap),
        googleProductCategory: settings.googleProductCategory,
        color: getAttributeValue(attributes, ["renk", "color"]),
        size: getAttributeValue(attributes, ["boyut", "size"]),
        material: getAttributeValue(attributes, ["materyal", "material"]),
        customLabel0: settings.customLabel0,
      };

      if (validateGoogleMerchantFeedItem(item).length === 0) {
        items.push(item);
      }
    }
  }

  return buildGoogleMerchantFeedXml({
    title: `${STOREFRONT_RUNTIME.name} Google Merchant Feed`,
    link: new URL("/", requestOrigin).toString(),
    description: `${STOREFRONT_RUNTIME.name} catalog feed for Google Merchant Center`,
    items,
  });
}
