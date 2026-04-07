import { createServerClient } from "@/lib/supabase";
import { buildStorefrontUrl, getStoreRuntime } from "@/lib/store-runtime";
import {
  buildGoogleMerchantFeedXml,
  DEFAULT_GOOGLE_MERCHANT_FEED_SETTINGS,
  normalizeGoogleMerchantFeedSettings,
  normalizeGoogleMerchantText,
  validateGoogleMerchantFeedItem,
  type GoogleMerchantFeedItem,
  type GoogleMerchantFeedSettings,
} from "@celebix/platform-config/src/google-merchant";
import type { MarketplaceListingStatus } from "@/types/marketplace";

type MerchantVariantRow = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  price: number | null;
  stock: number | null;
  images: string[] | null;
  raw_attributes?: unknown;
};

type MerchantProductRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  images: string[] | null;
  brand: string | null;
  gtin: string | null;
  sku: string | null;
  category: string | null;
  subcategory: string | null;
  status: string | null;
  is_active: boolean | null;
  variants?: MerchantVariantRow[] | null;
};

type MerchantCategoryRow = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
};

export type GoogleMerchantCatalogIssue = {
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  issues: string[];
};

export type GoogleMerchantListingSnapshot = {
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string | null;
  externalListingId: string;
  status: MarketplaceListingStatus;
  lastSyncedPrice: number | null;
  lastSyncedStock: number | null;
  payloadSnapshot: Record<string, unknown>;
  lastError: string | null;
};

export type GoogleMerchantCatalogSnapshot = {
  feedUrl: string;
  feedXml: string;
  settings: GoogleMerchantFeedSettings;
  totalVariants: number;
  validItems: number;
  issueCount: number;
  sampleIssues: GoogleMerchantCatalogIssue[];
  items: GoogleMerchantFeedItem[];
  listings: GoogleMerchantListingSnapshot[];
};

function isMissingProductsIsActiveColumn(error: unknown) {
  if (!error || typeof error !== "object" || !("message" in error)) {
    return false;
  }

  const message = String(error.message || "");
  return (
    message.includes("Could not find the 'is_active' column of 'products'") ||
    message.includes("column products.is_active does not exist") ||
    message.includes("column \"is_active\" of relation \"products\" does not exist") ||
    message.trim().length === 0
  );
}

async function runAdminProductsQuery<T>(
  buildQuery: (includeIsActiveFilter: boolean) => Promise<{ data: T; error: unknown }>,
) {
  const initial = await buildQuery(true);
  if (!isMissingProductsIsActiveColumn(initial.error)) {
    return initial;
  }

  return buildQuery(false);
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => asString(item))
        .filter(Boolean)
    : [];
}

function buildAbsoluteStorefrontAssetUrl(source?: string | null) {
  const normalized = asString(source);
  if (!normalized) {
    return "";
  }

  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return normalized;
  }

  if (normalized.startsWith("/")) {
    return buildStorefrontUrl(normalized);
  }

  return normalized;
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

function formatMerchantPrice(price: number, currency: string) {
  return `${price.toFixed(2)} ${currency}`;
}

function buildMerchantProductPath(slug: string, contentLanguage: string) {
  const locale = contentLanguage.toLocaleLowerCase("tr");
  const localePrefix = ["tr", "en", "de", "ru", "ar", "ka"].includes(locale) ? `/${locale}` : "";
  return `${localePrefix}/urunler/${slug}`;
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

function buildProductType(
  product: MerchantProductRow,
  categoryMap: Map<string, MerchantCategoryRow>,
) {
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

async function fetchCategoriesMap() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id,name,slug,parent_id")
    .order("sort_order", { ascending: true });

  if (error) {
    console.warn("Google Merchant category fetch failed:", error);
    return new Map<string, MerchantCategoryRow>();
  }

  const map = new Map<string, MerchantCategoryRow>();
  for (const category of (data || []) as MerchantCategoryRow[]) {
    map.set(category.slug, category);
    map.set(category.id, category);
  }

  return map;
}

async function fetchPublishedProducts() {
  const supabase = createServerClient();
  const { data, error } = await runAdminProductsQuery((includeIsActiveFilter) => {
    let query = supabase
      .from("products")
      .select(
        "id,name,slug,description,short_description,images,brand,gtin,sku,category,subcategory,status,is_active,variants:product_variants(id,name,sku,barcode,price,stock,images,raw_attributes:attributes)",
      )
      .or("status.eq.published,status.is.null");

    if (includeIsActiveFilter) {
      query = query.eq("is_active", true);
    }

    return query;
  });

  if (error) {
    throw error;
  }

  return (data || []) as MerchantProductRow[];
}

export async function buildGoogleMerchantCatalogSnapshot(
  inputSettings?: Record<string, unknown> | null,
): Promise<GoogleMerchantCatalogSnapshot> {
  const storeRuntime = getStoreRuntime();
  const settings = normalizeGoogleMerchantFeedSettings(inputSettings);
  const [products, categoryMap] = await Promise.all([
    fetchPublishedProducts(),
    fetchCategoriesMap(),
  ]);

  const issues: GoogleMerchantCatalogIssue[] = [];
  const items: GoogleMerchantFeedItem[] = [];
  const listings: GoogleMerchantListingSnapshot[] = [];
  const feedUrl = buildStorefrontUrl("/google-merchant.xml");
  const defaultBrand = storeRuntime.defaultProductBrand || storeRuntime.name;

  let totalVariants = 0;

  for (const product of products) {
    const productImages = asStringArray(product.images);
    const variants = Array.isArray(product.variants) ? product.variants : [];

    for (const variant of variants) {
      totalVariants += 1;

      const variantImages = asStringArray(variant.images);
      const mergedImages = [...variantImages, ...productImages]
        .map((image) => buildAbsoluteStorefrontAssetUrl(image))
        .filter(Boolean)
        .filter((image, index, array) => array.indexOf(image) === index);

      const attributes = normalizeVariantAttributes(variant.raw_attributes);
      const brand = asString(product.brand) || defaultBrand;
      const gtin = asString(product.gtin) || asString(variant.barcode);
      const mpn = asString(variant.sku) || asString(product.sku);
      const title = normalizeGoogleMerchantText(
        buildVariantTitle(product.name, variant.name),
        150,
      );
      const description = normalizeGoogleMerchantText(
        asString(product.description) ||
          asString(product.short_description) ||
          product.name,
        5000,
      );
      const price = Number(variant.price);
      const item: GoogleMerchantFeedItem = {
        id: asString(variant.sku) || asString(variant.barcode) || `${product.id}-${variant.id}`,
        title,
        description,
        link: buildStorefrontUrl(buildMerchantProductPath(product.slug, settings.contentLanguage)),
        imageLink: mergedImages[0] || "",
        additionalImageLinks: mergedImages.slice(1, 10),
        availability: Number(variant.stock) > 0 ? "in_stock" : "out_of_stock",
        price: Number.isFinite(price) && price > 0
          ? formatMerchantPrice(price, settings.currency)
          : "",
        condition: settings.defaultCondition,
        brand: brand || undefined,
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

      const itemIssues = validateGoogleMerchantFeedItem(item);
      if (!Number.isFinite(price) || price <= 0) {
        itemIssues.push("price gecersiz");
      }

      if (itemIssues.length > 0) {
        issues.push({
          productId: product.id,
          variantId: variant.id,
          productName: product.name,
          variantName: variant.name,
          issues: itemIssues,
        });
      }

      items.push(item);
      listings.push({
        productId: product.id,
        variantId: variant.id,
        productName: product.name,
        variantName: variant.name,
        sku: variant.sku,
        externalListingId: item.id,
        status: itemIssues.length > 0 ? "error" : "active",
        lastSyncedPrice: Number.isFinite(price) ? price : null,
        lastSyncedStock: Number.isFinite(Number(variant.stock)) ? Number(variant.stock) : null,
        payloadSnapshot: item as unknown as Record<string, unknown>,
        lastError: itemIssues.length > 0 ? itemIssues.join("; ") : null,
      });
    }
  }

  return {
    feedUrl,
    feedXml: buildGoogleMerchantFeedXml({
      title: `${storeRuntime.name} Google Merchant Feed`,
      link: buildStorefrontUrl("/"),
      description: `${storeRuntime.name} catalog feed for Google Merchant Center`,
      items: items.filter((_, index) => listings[index]?.status === "active"),
    }),
    settings,
    totalVariants,
    validItems: listings.filter((listing) => listing.status === "active").length,
    issueCount: issues.length,
    sampleIssues: issues.slice(0, 10),
    items,
    listings,
  };
}

export async function syncGoogleMerchantCatalogSnapshot(
  inputSettings?: Record<string, unknown> | null,
) {
  const supabase = createServerClient();
  const snapshot = await buildGoogleMerchantCatalogSnapshot(inputSettings);
  const syncedAt = new Date().toISOString();

  await supabase.from("marketplace_listings").delete().eq("provider", "google_merchant");

  if (snapshot.listings.length > 0) {
    const payload = snapshot.listings.map((listing) => ({
      provider: "google_merchant",
      product_id: listing.productId,
      variant_id: listing.variantId,
      external_listing_id: listing.externalListingId,
      external_sku: listing.sku,
      status: listing.status,
      last_synced_price: listing.lastSyncedPrice,
      last_synced_stock: listing.lastSyncedStock,
      payload_snapshot: listing.payloadSnapshot,
      last_error: listing.lastError,
    }));

    const { error: upsertError } = await supabase.from("marketplace_listings").upsert(payload, {
      onConflict: "provider,variant_id",
    });
    if (upsertError) {
      throw upsertError;
    }
  }

  const settingsPatch = {
    ...snapshot.settings,
    feedUrl: snapshot.feedUrl,
    feedItemCount: snapshot.validItems,
    feedIssueCount: snapshot.issueCount,
    lastFeedGeneratedAt: syncedAt,
  };

  await supabase
    .from("marketplace_provider_connections")
    .update({
      last_sync_at: syncedAt,
      settings: settingsPatch,
    })
    .eq("provider", "google_merchant");

  await supabase.from("marketplace_sync_logs").insert({
    provider: "google_merchant",
    direction: "system",
    entity_type: "feed_sync",
    entity_id: "google_merchant",
    status: "synced",
    payload: {
      feedUrl: snapshot.feedUrl,
      validItems: snapshot.validItems,
      issueCount: snapshot.issueCount,
      totalVariants: snapshot.totalVariants,
      sampleIssues: snapshot.sampleIssues,
    },
  });

  return snapshot;
}
