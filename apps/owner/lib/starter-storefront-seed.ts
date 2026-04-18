import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { StoreConfig } from "@celebix/platform-config";
import {
  createPaymentProviderCatalog,
  mergeStorePaymentGatewaysWithDefaults,
} from "@celebix/payment-core";
import { getStoreSupabaseSecret } from "@/lib/store-secrets";

type JsonRecord = Record<string, unknown>;

interface SeedResult {
  status: "seeded" | "skipped";
  message: string;
  counts?: {
    categories: number;
    products: number;
    variants: number;
    reviews: number;
    blogPosts: number;
  };
}

const STARTER_SOURCE_URL = process.env.OWNER_STARTER_THEME_SOURCE_URL?.trim() || "https://derycraft.com";
const STARTER_TARGET_RETRY_ATTEMPTS = 4;
const STARTER_TARGET_RETRY_DELAY_MS = 5000;
const PREFERRED_CATEGORY_SLUGS = [
  "cuzdan-kartlik",
  "apple-watch-saat-kayislari",
  "saat-kayislari",
  "canta-organizer",
  "aksesuar",
  "gunluk-yasam",
] as const;

const DEMO_REVIEWS = [
  {
    id: "2bf820d9-68bc-4d2e-94d1-17b6e1cc8101",
    name: "Ceren Y.",
    email: "ceren@example.com",
    rating: 5,
    title: "Isciligi cok temiz",
    body: "Dikis kalitesi ve deri dokusu bekledigimden iyi. Paketleme de oldukca duzenli geldi.",
  },
  {
    id: "0d8f9b5c-0ae5-4a23-8dcf-5eb58d9923d3",
    name: "Mert K.",
    email: "mert@example.com",
    rating: 5,
    title: "Gunluk kullanim icin ideal",
    body: "Hem sade hem premium duruyor. Urun gorselleriyle gercek urun hissi birebir.",
  },
  {
    id: "35bc9198-35c6-4457-b7b6-cb9437cf2139",
    name: "Seda O.",
    email: "seda@example.com",
    rating: 4,
    title: "Hediye icin guzel secim",
    body: "Kurumsal ve guven veren bir deneyim. Hediye olarak aldigim urun bekledigim kaliteyi verdi.",
  },
  {
    id: "c1308f1a-cb60-4df5-8a2d-b111e766ef6d",
    name: "Burak A.",
    email: "burak@example.com",
    rating: 5,
    title: "Renk secenekleri guzel",
    body: "Renk swatchlari sayesinde karar vermek kolay oldu. Uygulama hissi profesyonel.",
  },
  {
    id: "c4c27379-ecec-4651-ab1d-3e28065db8dc",
    name: "Asli T.",
    email: "asli@example.com",
    rating: 5,
    title: "Cok duzgun vitrinde duruyor",
    body: "Ana sayfa bloklari ve urun kartlari gercek magazaya yakin duruyor. Demo icin oldukca ikna edici.",
  },
  {
    id: "a055f792-6507-42b5-884d-c3dc264b3bab",
    name: "Emre D.",
    email: "emre@example.com",
    rating: 4,
    title: "Guven hissi iyi",
    body: "Kategori, vitrin ve yorum akisi birlikte oldugu icin site bos hissettirmiyor.",
  },
] as const;

function buildFallbackSourceCategories() {
  return [
    {
      id: "starter-cat-wallet",
      name: "Cuzdan & Kartlik",
      slug: "cuzdan-kartlik",
      description: "Gunluk tasinabilir premium deri seckileri.",
      image: "/placeholders/promo-banner-1.svg",
      sort_order: 1,
    },
    {
      id: "starter-cat-apple-watch",
      name: "Apple Watch Kayislari",
      slug: "apple-watch-saat-kayislari",
      description: "Akilli saat uyumlu premium kayis koleksiyonu.",
      image: "/placeholders/promo-banner-2.svg",
      sort_order: 2,
    },
    {
      id: "starter-cat-watch",
      name: "Saat Kayislari",
      slug: "saat-kayislari",
      description: "Klasik saatler icin secilen premium seri.",
      image: "/placeholders/promo-banner-3.svg",
      sort_order: 3,
    },
    {
      id: "starter-cat-bag",
      name: "Canta & Organizer",
      slug: "canta-organizer",
      description: "Gundelik duzen icin premium organizer urunleri.",
      image: "/placeholders/promo-banner-1.svg",
      sort_order: 4,
    },
    {
      id: "starter-cat-accessory",
      name: "Aksesuar",
      slug: "aksesuar",
      description: "Marka vitrini icin tamamlayici urunler.",
      image: "/placeholders/promo-banner-2.svg",
      sort_order: 5,
    },
    {
      id: "starter-cat-life",
      name: "Gunluk Yasam",
      slug: "gunluk-yasam",
      description: "Gundelik kullanimda premium detaylar.",
      image: "/placeholders/promo-banner-3.svg",
      sort_order: 6,
    },
  ] satisfies JsonRecord[];
}

function buildFallbackSourceProducts(store: StoreConfig) {
  const publishedAt = new Date().toISOString();
  const collections = [
    {
      category: "cuzdan-kartlik",
      subcategory: "cuzdan-kartlik",
      image: "/placeholders/promo-banner-1.svg",
      tags: ["kartlik", "minimal", "deri"],
      products: [
        { slug: "minimal-kartlik", name: "Minimal Kartlik", color: "Taba", price: 1290, stock: 12 },
        { slug: "cift-gozlu-kartlik", name: "Cift Gozlu Kartlik", color: "Siyah", price: 1390, stock: 9 },
        { slug: "ince-cuzdan", name: "Ince Cuzdan", color: "Kahve", price: 1490, stock: 7 },
        { slug: "gunluk-kartlik", name: "Gunluk Kartlik", color: "Lacivert", price: 1590, stock: 10 },
      ],
    },
    {
      category: "apple-watch-saat-kayislari",
      subcategory: "apple-watch-saat-kayislari",
      image: "/placeholders/promo-banner-2.svg",
      tags: ["apple watch", "kayis", "deri"],
      products: [
        { slug: "apple-watch-kayisi-klasik", name: "Apple Watch Kayisi Klasik", color: "Siyah", price: 1790, stock: 8 },
        { slug: "apple-watch-kayisi-vintage", name: "Apple Watch Kayisi Vintage", color: "Taba", price: 1890, stock: 6 },
        { slug: "apple-watch-kayisi-premium", name: "Apple Watch Kayisi Premium", color: "Kahve", price: 1990, stock: 5 },
        { slug: "apple-watch-kayisi-slim", name: "Apple Watch Kayisi Slim", color: "Krem", price: 1690, stock: 11 },
      ],
    },
    {
      category: "saat-kayislari",
      subcategory: "saat-kayislari",
      image: "/placeholders/promo-banner-3.svg",
      tags: ["saat", "kayis", "premium"],
      products: [
        { slug: "deri-saat-kayisi-klasik", name: "Deri Saat Kayisi Klasik", color: "Siyah", price: 1590, stock: 10 },
        { slug: "deri-saat-kayisi-vintage", name: "Deri Saat Kayisi Vintage", color: "Taba", price: 1690, stock: 8 },
        { slug: "deri-saat-kayisi-tekstur", name: "Deri Saat Kayisi Tekstur", color: "Kahve", price: 1790, stock: 6 },
        { slug: "deri-saat-kayisi-gunluk", name: "Deri Saat Kayisi Gunluk", color: "Bordo", price: 1490, stock: 12 },
      ],
    },
    {
      category: "canta-organizer",
      subcategory: "canta-organizer",
      image: "/placeholders/promo-banner-1.svg",
      tags: ["organizer", "canta", "gundelik"],
      products: [
        { slug: "organizer-canta", name: "Organizer Canta", color: "Kahve", price: 2390, stock: 5 },
        { slug: "tablet-organizer", name: "Tablet Organizer", color: "Siyah", price: 2290, stock: 7 },
        { slug: "seyahat-cantasi", name: "Seyahat Cantasi", color: "Taba", price: 2590, stock: 4 },
        { slug: "masaustu-organizer", name: "Masaustu Organizer", color: "Lacivert", price: 1990, stock: 9 },
      ],
    },
  ] as const;

  return collections.flatMap((collection, collectionIndex) =>
    collection.products.map((product, productIndex) => {
      const itemIndex = collectionIndex * 4 + productIndex + 1;
      const productName = `${store.name} ${product.name}`;

      return {
        id: `starter-product-${itemIndex}`,
        name: productName,
        slug: product.slug,
        short_description: `${product.name} icin hazir demo vitrin urunu.`,
        description: `${store.name} ilk kurulumunda kullanilan ${product.name.toLowerCase()} demo urunudur.`,
        images: [collection.image],
        images_v2: [
          {
            url: collection.image,
            alt: productName,
            is_primary: true,
            sort_order: 0,
          },
        ],
        category: collection.category,
        subcategory: collection.subcategory,
        tags: [...collection.tags],
        is_featured: true,
        is_bestseller: productIndex === 0,
        is_active: true,
        rating: 5,
        review_count: 0,
        status: "published",
        published_at: publishedAt,
        tax_rate: 10,
        brand: store.name,
        country_of_origin: "Turkiye",
        variants: [
          {
            id: `starter-variant-${itemIndex}`,
            name: product.color,
            sku: `STARTER-${itemIndex}-${product.color.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`,
            price: product.price,
            stock: product.stock,
            weight: "1",
            unit: "adet",
            images: [collection.image],
            attributes: [
              {
                attributeId: "color",
                attributeName: "Renk",
                valueId: product.color.toLocaleLowerCase("tr-TR").replace(/[^a-z0-9]+/g, "-"),
                value: product.color,
                displayOrder: 0,
              },
            ],
          },
        ],
      } satisfies JsonRecord;
    }),
  );
}

function normalizeSourceUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeApiAssetPath(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  if (!value.startsWith("https://derycraft.com/api/assets?src=")) {
    return value;
  }

  return value.replace("https://derycraft.com", "");
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringOrFallback(value: unknown, fallback: string): string {
  return stringOrNull(value) ?? fallback;
}

function numberOrFallback(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function arrayOfRecords(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === "object")
    : [];
}

function recordOrEmpty(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatSupabaseError(error: unknown, fallback: string): string {
  const record = recordOrEmpty(error);
  const message = typeof record.message === "string" && record.message.trim().length > 0
    ? record.message.trim()
    : null;
  const details = typeof record.details === "string" && record.details.trim().length > 0
    ? record.details.trim()
    : null;
  const hint = typeof record.hint === "string" && record.hint.trim().length > 0
    ? record.hint.trim()
    : null;
  const code = typeof record.code === "string" && record.code.trim().length > 0
    ? record.code.trim()
    : null;
  const parts = [message, details, hint, code].filter((value): value is string => Boolean(value));

  return parts.length > 0 ? parts.join(" | ") : fallback;
}

function isRetryableStarterTargetError(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message.toLowerCase()
    : formatSupabaseError(error, "").toLowerCase();

  if (!message) {
    return false;
  }

  return [
    "no available server",
    "fetch failed",
    "econnrefused",
    "connection refused",
    "connection terminated",
    "timeout",
    "timed out",
    "temporarily unavailable",
    "socket hang up",
    "network",
    "failed to fetch",
    "schema cache",
    "could not find the table",
    "relation",
    "does not exist",
    "pgrst",
  ].some((fragment) => message.includes(fragment));
}

async function withStarterTargetRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= STARTER_TARGET_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!isRetryableStarterTargetError(error) || attempt === STARTER_TARGET_RETRY_ATTEMPTS) {
        throw error;
      }

      await sleep(STARTER_TARGET_RETRY_DELAY_MS);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Starter target retry siniri asildi.");
}

async function fetchJson(url: string): Promise<JsonRecord> {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "CelebixStarterStorefront/1.0",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Starter source fetch failed (${response.status}) for ${url}`);
  }

  return (await response.json()) as JsonRecord;
}

function buildStoreInfoValue(store: StoreConfig) {
  return {
    name: store.name,
    email: store.branding?.supportEmail?.trim() || `destek@${store.domains.storefront}`,
    phone: store.branding?.supportPhone?.trim() || "+90 532 000 00 00",
    address: `${store.name} Studio, Istanbul / Turkiye`,
    currency: "TRY",
    taxRate: 10,
    timezone: "Europe/Istanbul",
    logoUrl: "/logo.webp",
    faviconUrl: "/icons/default-favicon.ico",
    socialInstagram: "",
    socialTwitter: "",
    typography: {
      headingFontFamily: "\"Times New Roman\", serif",
      bodyFontFamily: "system-ui, sans-serif",
    },
  };
}

function buildHomepageCurationValue(
  categories: JsonRecord[],
  products: Array<{
    id: unknown;
    category?: string | null;
    subcategory?: string | null;
  }>,
) {
  const availableCategorySlugs = categories
    .map((category) => stringOrNull(category.slug))
    .filter((slug): slug is string => Boolean(slug));

  const featuredCategorySlugs = PREFERRED_CATEGORY_SLUGS
    .filter((slug) => availableCategorySlugs.includes(slug))
    .slice(0, 4);
  const featuredProductIdsByCategory = featuredCategorySlugs.reduce<Record<string, string[]>>(
    (result, categorySlug) => {
      const productIds = products
        .filter((product) => product.category === categorySlug || product.subcategory === categorySlug)
        .map((product) => stringOrNull(product.id))
        .filter((productId): productId is string => Boolean(productId))
        .slice(0, 4);

      if (productIds.length > 0) {
        result[categorySlug] = productIds;
      }

      return result;
    },
    {},
  );

  return {
    featuredCategorySlugs,
    featuredProductIdsByCategory,
    enforceFeaturedProductCaps: true,
    updatedAt: new Date().toISOString(),
  };
}

function buildAnnouncementBarValue(store: StoreConfig) {
  return {
    enabled: true,
    text: `${store.name} vitrinine hos geldiniz. Ilk koleksiyonu hemen inceleyin.`,
    ctaLabel: "Koleksiyonu Gor",
    ctaUrl: "/urunler",
  };
}

function buildMarqueeSettingsValue(store: StoreConfig) {
  return {
    enabled: true,
    speed: "normal",
    direction: "left",
    items: [
      { id: "marquee-1", text: `${store.name} icin premium starter vitrin`, icon: "award" },
      { id: "marquee-2", text: "Kategori ve urun bloklari adminden yonetilir", icon: "sparkle", badge: "hazir" },
      { id: "marquee-3", text: "Yorum, blog ve banner alanlari tek panelden baglidir", icon: "shield" },
      {
        id: "marquee-4",
        text: store.branding?.supportPhone?.trim() || "+90 532 000 00 00",
        icon: "truck",
        badge: "destek",
      },
    ],
  };
}

function buildSeoSettingsValue(store: StoreConfig) {
  return {
    titleTemplate: `%s | ${store.name}`,
    defaultTitle: `${store.name} | Premium Starter Storefront`,
    defaultDescription:
      `${store.name} icin Celebix uzerinde hazirlanan premium starter storefront. Urunler, kategoriler ve vitrin icerikleri adminden yonetilir.`,
    indexable: true,
    nofollow: false,
    ogImage: "/logo.webp",
  };
}

function mapCategory(category: JsonRecord) {
  return {
    id: category.id,
    name: stringOrFallback(category.name, "Kategori"),
    slug: stringOrFallback(category.slug, "kategori"),
    description: stringOrNull(category.description) || stringOrFallback(category.name, "Kategori"),
    image: normalizeApiAssetPath(category.image),
    parent_id: category.parent_id ?? null,
    sort_order: numberOrFallback(category.sort_order, 0),
  };
}

function mapProduct(product: JsonRecord, store: StoreConfig) {
  return {
    id: product.id,
    name: stringOrFallback(product.name, "Demo Urun"),
    slug: stringOrFallback(product.slug, `urun-${String(product.id ?? "demo")}`),
    description: stringOrFallback(product.description, ""),
    short_description: stringOrFallback(product.short_description, ""),
    images: Array.isArray(product.images)
      ? product.images.map((image) => normalizeApiAssetPath(image)).filter(Boolean)
      : [],
    images_v2: Array.isArray(product.images_v2)
      ? product.images_v2.map((image, index) => {
          const imageRecord = recordOrEmpty(image);
          return {
            alt: stringOrFallback(imageRecord.alt, stringOrFallback(product.name, "Demo Urun")),
            url: normalizeApiAssetPath(imageRecord.url),
            is_primary: Boolean(imageRecord.is_primary ?? index === 0),
            sort_order: numberOrFallback(imageRecord.sort_order, index),
          };
        })
      : [],
    category: stringOrNull(product.category),
    subcategory: stringOrNull(product.subcategory),
    tags: Array.isArray(product.tags) ? product.tags : [],
    is_featured: Boolean(product.is_featured),
    is_bestseller: Boolean(product.is_bestseller),
    is_active: product.is_active !== false,
    is_new: Boolean(product.is_new),
    vegan: Boolean(product.vegan),
    gluten_free: Boolean(product.gluten_free),
    sugar_free: Boolean(product.sugar_free),
    high_protein: Boolean(product.high_protein),
    rating: Number(product.rating || 5),
    review_count: Number(product.review_count || 0),
    seo_title: stringOrFallback(product.seo_title, stringOrFallback(product.name, "Demo Urun")),
    seo_description: stringOrFallback(product.seo_description, stringOrFallback(product.short_description, "")),
    status: stringOrFallback(product.status, "published"),
    is_draft: Boolean(product.is_draft),
    published_at: stringOrFallback(product.published_at, new Date().toISOString()),
    tax_rate: Number(product.tax_rate || 10),
    brand: stringOrFallback(product.brand, store.name),
    country_of_origin: stringOrFallback(product.country_of_origin, "Turkiye"),
    sku: stringOrNull(product.sku),
    gtin: stringOrNull(product.gtin),
    dimensions: recordOrEmpty(product.dimensions),
    related_products: Array.isArray(product.related_products) ? product.related_products : [],
    complementary_products: Array.isArray(product.complementary_products) ? product.complementary_products : [],
    seo_keywords: Array.isArray(product.seo_keywords) ? product.seo_keywords : [],
    seo_focus_keyword: stringOrNull(product.seo_focus_keyword),
    og_image: normalizeApiAssetPath(product.og_image ?? null),
    canonical_url: stringOrNull(product.canonical_url),
    seo_robots: stringOrFallback(product.seo_robots, "index,follow"),
    track_stock: product.track_stock !== false,
    low_stock_threshold: Number(product.low_stock_threshold || 10),
    allergens: Array.isArray(product.allergens) ? product.allergens : [],
    nutrition_basis: stringOrFallback(product.nutrition_basis, "per_100g"),
    serving_size: Number(product.serving_size || 100),
    serving_per_container: Number(product.serving_per_container || 1),
    vitamins: recordOrEmpty(product.vitamins),
    ingredients: product.ingredients ?? null,
    storage_conditions: product.storage_conditions ?? null,
    shelf_life_days: product.shelf_life_days ?? null,
    calories: Number(product.calories || 0),
    protein: Number(product.protein || 0),
    carbs: Number(product.carbs || 0),
    fat: Number(product.fat || 0),
    fiber: Number(product.fiber || 0),
    sugar: Number(product.sugar || 0),
    saturated_fat: Number(product.saturated_fat || 0),
    sodium: Number(product.sodium || 0),
    shopify_metadata: recordOrEmpty(product.shopify_metadata),
    shopify_metafields: recordOrEmpty(product.shopify_metafields),
  };
}

function mapVariants(products: JsonRecord[]) {
  return products.flatMap((product) => {
    const variants = arrayOfRecords(product.variants);

    return variants.map((variant) => ({
      id: variant.id,
      product_id: product.id,
      name: stringOrFallback(variant.name, "Standart"),
      sku: stringOrNull(variant.sku),
      price: Number(variant.price || 0),
      original_price: variant.original_price ?? null,
      stock: Number(variant.stock || 0),
      weight: stringOrFallback(variant.weight, "0"),
      cost: variant.cost ?? null,
      barcode: variant.barcode ?? null,
      group_name: variant.group_name ?? null,
      images: Array.isArray(variant.images)
        ? variant.images.map((image) => normalizeApiAssetPath(image)).filter(Boolean)
        : [],
      unit: stringOrFallback(variant.unit, "adet"),
      max_purchase_quantity: variant.max_purchase_quantity ?? null,
      warehouse_location: variant.warehouse_location ?? null,
      attributes: arrayOfRecords(variant.attributes ?? variant.raw_attributes).map((attribute) => ({
        ...attribute,
        image_url: normalizeApiAssetPath(attribute.image_url ?? attribute.imageUrl ?? null),
        imageUrl: normalizeApiAssetPath(attribute.imageUrl ?? attribute.image_url ?? null),
      })),
      shopify_metadata: recordOrEmpty(variant.shopify_metadata),
    }));
  });
}

function buildVariantRegistry(products: JsonRecord[]) {
  const attributeMap = new Map<string, JsonRecord>();

  for (const product of products) {
    for (const variant of arrayOfRecords(product.variants)) {
      for (const attribute of arrayOfRecords(variant.attributes ?? variant.raw_attributes)) {
        const attributeId = stringOrFallback(
          attribute.attributeId ?? attribute.attribute_id ?? attribute.id,
          `attr-${String(attribute.name || attribute.attributeName || "secenek").toLowerCase()}`,
        );
        const attributeName = stringOrFallback(attribute.attributeName ?? attribute.name, "Secenek");
        const valueId = stringOrFallback(
          attribute.valueId ?? attribute.attribute_value_id ?? attribute.id,
          `${attributeId}-${String(attribute.value || "value").toLowerCase()}`,
        );
        const value = stringOrNull(attribute.value);

        if (!value) {
          continue;
        }

        const group = attributeMap.get(attributeId) ?? {
          id: attributeId,
          name: attributeName,
          is_active: true,
          values: [],
        };

        const values = Array.isArray(group.values) ? (group.values as JsonRecord[]) : [];
        if (!values.find((entry) => entry.id === valueId)) {
          values.push({
            id: valueId,
            attribute_id: attributeId,
            value,
            display_order: numberOrFallback(attribute.displayOrder ?? attribute.display_order, values.length),
            color_code: attribute.color_code ?? attribute.colorCode ?? null,
            image_url: normalizeApiAssetPath(attribute.image_url ?? attribute.imageUrl ?? null),
            is_active: true,
          });
        }

        group.values = values;
        attributeMap.set(attributeId, group);
      }
    }
  }

  return { attributes: Array.from(attributeMap.values()) };
}

function buildPromoBanners(categories: Array<ReturnType<typeof mapCategory>>) {
  return categories.slice(0, 3).map((category, index) => ({
    id: `promo-${index + 1}`,
    image: normalizeApiAssetPath(category.image),
    mobileImage: normalizeApiAssetPath(category.image),
    title: category.name,
    subtitle: category.description || "Premium starter secimi",
    buttonText: "Incele",
    buttonLink: `/${category.slug}`,
    order: index + 1,
    badge: index === 0 ? "One Cikan" : index === 1 ? "Yeni" : "Secki",
  }));
}

function buildHeroBanners(store: StoreConfig, sourceHeroBanners: unknown) {
  const heroSlides = arrayOfRecords(sourceHeroBanners);
  const storeTitle = store.name;
  const storeSubtitle =
    store.branding?.tagline?.trim() ||
    "Hazir premium starter theme sayesinde kategori, urun ve yorum bloklari ilk gunden dolu gelir.";

  if (heroSlides.length === 0) {
    return [
      {
        id: "hero-1",
        desktop: "/placeholders/promo-banner-1.svg",
        mobile: "/placeholders/promo-banner-1.svg",
        alt: storeTitle,
        title: `${storeTitle} icin premium starter vitrin`,
        subtitle: storeSubtitle,
        buttonText: "Koleksiyonu Incele",
        buttonLink: "/urunler",
      },
    ];
  }

  return heroSlides.slice(0, 2).map((banner, index) => ({
    id: banner.id ?? `hero-${index + 1}`,
    desktop: normalizeApiAssetPath(banner.desktop ?? banner.image ?? banner.mobile ?? ""),
    mobile: normalizeApiAssetPath(banner.mobile ?? banner.desktop ?? banner.image ?? ""),
    alt: storeTitle,
    title: index === 0 ? `${storeTitle} icin premium starter vitrin` : "Editor secimi",
    subtitle: index === 0 ? storeSubtitle : "Bu vitrindeki icerikler admin panelinden duzenlenebilir.",
    buttonText: "Koleksiyonu Incele",
    buttonLink: "/urunler",
  }));
}

function buildReviewRows(products: JsonRecord[]) {
  return products.slice(0, DEMO_REVIEWS.length).map((product, index) => {
    const demoReview = DEMO_REVIEWS[index];
    const productVariants = arrayOfRecords(product.variants);

    return {
      id: demoReview.id,
      product_id: product.id,
      variant_id: productVariants[0]?.id ?? null,
      customer_id: null,
      reviewer_name: demoReview.name,
      reviewer_email: demoReview.email,
      rating: demoReview.rating,
      title: demoReview.title,
      body: demoReview.body,
      image_urls:
        Array.isArray(product.images) && product.images[0]
          ? [normalizeApiAssetPath(product.images[0])]
          : [],
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: null,
    };
  });
}

function buildBlogPosts(
  store: StoreConfig,
  categories: Array<ReturnType<typeof mapCategory>>,
  products: Array<ReturnType<typeof mapProduct>>,
) {
  return [
    {
      id: "7e8f8fd7-5ba9-4e2d-b6f0-d61ff685f6f0",
      title: `${store.name} vitrini nasil konumlanir`,
      slug: "starter-vitrin-nasil-konumlanir",
      excerpt:
        "Starter storefront theme uzerinde kategori, urun ve vitrin bloklarini nasil hizli sekilde kurabileceginizi anlatiyor.",
      content:
        "Bu yazi, Celebix starter theme uzerinde marka omurgasini nasil hizli kurdugumuzu gosteren ornek bir blog icerigidir.",
      featured_image: normalizeApiAssetPath(categories[0]?.image || "/placeholder.svg"),
      author: "Celebix Studio",
      status: "published",
      published_at: new Date().toISOString(),
    },
    {
      id: "8a3f7c1d-041f-4455-992e-f2a3f93dc8d2",
      title: "Premium PDP kurgusu icin gerekli bloklar",
      slug: "premium-pdp-kurgusu-icin-gerekli-bloklar",
      excerpt:
        "Urun gorselleri, yorumlar, swatchlar ve kisisellestirme alanlari birarada nasil calisir.",
      content:
        "Bu demo blog yazisi, yeni magaza projelerinde kullanilan PDP omurgasini aciklamak icin eklendi.",
      featured_image: normalizeApiAssetPath(products[0]?.images?.[0] || "/placeholder.svg"),
      author: "Celebix Studio",
      status: "published",
      published_at: new Date().toISOString(),
    },
    {
      id: "5d0fbe4a-2f4b-4da6-b1f7-88a748ca3b90",
      title: "Owner panelden tek tikla magaza hazirlama",
      slug: "owner-panelden-tek-tikla-magaza-hazirlama",
      excerpt:
        "Provisioning, starter seed ve storefront deploy zincirini daha okunur anlatan bir ornek icerik.",
      content:
        "Bu yazi, owner panel otomasyonu ile yeni bir magazayi nasil hazirlayabileceginizi gosteren starter iceriktir.",
      featured_image: normalizeApiAssetPath(categories[1]?.image || "/placeholder.svg"),
      author: "Celebix Studio",
      status: "published",
      published_at: new Date().toISOString(),
    },
  ];
}

function buildStorefrontSiteUrl(store: StoreConfig): string {
  return `https://${store.domains.storefront}`;
}

async function ensureStorePaymentGateways(
  target: ReturnType<typeof createClient<any>>,
  store: StoreConfig,
): Promise<string | null> {
  const storefrontUrl = buildStorefrontSiteUrl(store);
  const paymentCatalog = createPaymentProviderCatalog({ storefrontUrl });
  const { data, error } = await target
    .from("settings")
    .select("value")
    .eq("key", "payment_gateways")
    .maybeSingle();

  if (error) {
    return `Payment gateway sablonlari guncellenemedi: ${error.message}`;
  }

  const existingGateways = paymentCatalog.normalizePaymentGateways(data?.value);
  const mergedGateways = mergeStorePaymentGatewaysWithDefaults({
    storefrontUrl,
    existingGateways,
  });
  const { error: upsertError } = await target.from("settings").upsert(
    {
      key: "payment_gateways",
      value: mergedGateways,
    },
    { onConflict: "key" },
  );

  if (upsertError) {
    return `Payment gateway sablonlari yazilamadi: ${upsertError.message}`;
  }

  return null;
}

async function hasCatalogContent(target: ReturnType<typeof createClient<any>>) {
  const [categories, products, blogPosts] = await Promise.all([
    target.from("categories").select("id", { count: "exact", head: true }),
    target.from("products").select("id", { count: "exact", head: true }),
    target.from("blog_posts").select("id", { count: "exact", head: true }),
  ]);

  if (categories.error) {
    throw new Error(
      `Starter content kontrolu basarisiz: ${formatSupabaseError(categories.error, "categories tablosu okunamadi.")}`,
    );
  }

  if (products.error) {
    throw new Error(
      `Starter content kontrolu basarisiz: ${formatSupabaseError(products.error, "products tablosu okunamadi.")}`,
    );
  }

  if (blogPosts.error) {
    throw new Error(
      `Starter content kontrolu basarisiz: ${formatSupabaseError(blogPosts.error, "blog_posts tablosu okunamadi.")}`,
    );
  }

  return (categories.count ?? 0) > 0 || (products.count ?? 0) > 0 || (blogPosts.count ?? 0) > 0;
}

export async function seedStarterStorefrontContent(
  store: StoreConfig,
  options?: { force?: boolean; sourceStorefrontUrl?: string },
): Promise<SeedResult> {
  const secrets = await getStoreSupabaseSecret(store.slug);

  if (!secrets?.supabase_url || !secrets.supabase_service_role_key) {
    throw new Error(`Starter content icin store secrets eksik: ${store.slug}`);
  }

  const target = createClient(secrets.supabase_url, secrets.supabase_service_role_key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return withStarterTargetRetry(async () => {
    const paymentGatewayWarning = await ensureStorePaymentGateways(target, store);

    if (!options?.force) {
      const contentExists = await hasCatalogContent(target);

      if (contentExists) {
        return {
          status: "skipped",
          message: paymentGatewayWarning
            ? `Starter storefront content atlandi; store zaten kategori veya urun iceriyor. Not: ${paymentGatewayWarning}`
            : "Starter storefront content atlandi; payment gateway sablonlari guncellendi ve store zaten kategori veya urun iceriyor.",
        } satisfies SeedResult;
      }
    }

    const sourceBase = normalizeSourceUrl(options?.sourceStorefrontUrl || STARTER_SOURCE_URL);
    let homepagePayload: JsonRecord;
    let categoriesPayload: JsonRecord;
    let productsPayload: JsonRecord;

    try {
      [homepagePayload, categoriesPayload, productsPayload] = await Promise.all([
        fetchJson(`${sourceBase}/api/homepage`),
        fetchJson(`${sourceBase}/api/categories`),
        fetchJson(`${sourceBase}/api/products?limit=12`),
      ]);
    } catch {
      homepagePayload = {};
      categoriesPayload = { categories: buildFallbackSourceCategories() };
      productsPayload = { products: buildFallbackSourceProducts(store) };
    }

    const sourceCategories = arrayOfRecords(categoriesPayload.categories)
      .filter((category) => {
        const slug = stringOrNull(category.slug);
        return Boolean(slug && PREFERRED_CATEGORY_SLUGS.includes(slug as (typeof PREFERRED_CATEGORY_SLUGS)[number]));
      })
      .sort((left, right) => {
        const leftSlug = stringOrFallback(left.slug, "");
        const rightSlug = stringOrFallback(right.slug, "");
        return PREFERRED_CATEGORY_SLUGS.indexOf(leftSlug as (typeof PREFERRED_CATEGORY_SLUGS)[number]) -
          PREFERRED_CATEGORY_SLUGS.indexOf(rightSlug as (typeof PREFERRED_CATEGORY_SLUGS)[number]);
      });

    const mappedCategories = sourceCategories.map(mapCategory);
    const sourceProducts = arrayOfRecords(productsPayload.products)
      .filter((product) => {
        const category = stringOrNull(product.category);
        const subcategory = stringOrNull(product.subcategory);
        return Boolean(
          (category &&
            PREFERRED_CATEGORY_SLUGS.includes(category as (typeof PREFERRED_CATEGORY_SLUGS)[number])) ||
            (subcategory &&
              PREFERRED_CATEGORY_SLUGS.includes(subcategory as (typeof PREFERRED_CATEGORY_SLUGS)[number])),
        );
      })
      .slice(0, 16);

    if (mappedCategories.length === 0 || sourceProducts.length === 0) {
      throw new Error("Starter source magazadan yeterli kategori veya urun okunamadi.");
    }

    const mappedProducts = sourceProducts.map((product) => mapProduct(product, store));
    const mappedVariants = mapVariants(sourceProducts);
    const mappedReviews = buildReviewRows(sourceProducts);
    const heroBanners = buildHeroBanners(store, homepagePayload.heroBanners);
    const promoBanners =
      arrayOfRecords(homepagePayload.promoBanners).length > 0
        ? arrayOfRecords(homepagePayload.promoBanners).map((banner) => ({
            ...banner,
            image: normalizeApiAssetPath(banner.image),
            mobileImage: normalizeApiAssetPath(banner.mobileImage),
            desktop: normalizeApiAssetPath(banner.desktop),
            mobile: normalizeApiAssetPath(banner.mobile),
          }))
        : buildPromoBanners(mappedCategories);

    const ratingByProductId = new Map<unknown, number[]>();
    const reviewCountByProductId = new Map<unknown, number>();

    for (const review of mappedReviews) {
      reviewCountByProductId.set(review.product_id, (reviewCountByProductId.get(review.product_id) ?? 0) + 1);
      const ratings = ratingByProductId.get(review.product_id) ?? [];
      ratings.push(review.rating);
      ratingByProductId.set(review.product_id, ratings);
    }

    const productsWithRatings = mappedProducts.map((product) => {
      const ratings = ratingByProductId.get(product.id) ?? [];
      const reviewCount = reviewCountByProductId.get(product.id) ?? 0;
      const rating =
        ratings.length > 0 ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : product.rating;

      return {
        ...product,
        rating,
        review_count: reviewCount,
      };
    });

    const blogPosts = buildBlogPosts(store, mappedCategories, productsWithRatings);
    const productIds = productsWithRatings.map((product) => product.id);
    const settingsPayload = [
      { key: "store_info", value: buildStoreInfoValue(store) },
      { key: "announcement_bar", value: buildAnnouncementBarValue(store) },
      { key: "marquee_settings", value: buildMarqueeSettingsValue(store) },
      { key: "seo_settings", value: buildSeoSettingsValue(store) },
      { key: "homepage_curation", value: buildHomepageCurationValue(mappedCategories, mappedProducts) },
      { key: "hero_banners", value: heroBanners },
      { key: "promo_banners", value: promoBanners },
      { key: "variant_attributes_registry", value: buildVariantRegistry(sourceProducts) },
    ];

    const { error: categoriesError } = await target.from("categories").upsert(mappedCategories, { onConflict: "id" });
    if (categoriesError) {
      throw new Error(`Starter categories seed failed: ${formatSupabaseError(categoriesError, "categories yazilamadi.")}`);
    }

    const { error: productsError } = await target.from("products").upsert(productsWithRatings, { onConflict: "id" });
    if (productsError) {
      throw new Error(`Starter products seed failed: ${formatSupabaseError(productsError, "products yazilamadi.")}`);
    }

    if (productIds.length > 0) {
      const { error: variantsDeleteError } = await target.from("product_variants").delete().in("product_id", productIds);
      if (variantsDeleteError) {
        throw new Error(
          `Starter variants cleanup failed: ${formatSupabaseError(variantsDeleteError, "product_variants temizlenemedi.")}`,
        );
      }
    }

    if (mappedVariants.length > 0) {
      const { error: variantsInsertError } = await target.from("product_variants").insert(mappedVariants);
      if (variantsInsertError) {
        throw new Error(
          `Starter variants seed failed: ${formatSupabaseError(variantsInsertError, "product_variants yazilamadi.")}`,
        );
      }
    }

    const { error: reviewsError } = await target.from("product_reviews").upsert(mappedReviews, { onConflict: "id" });
    if (reviewsError) {
      throw new Error(`Starter reviews seed failed: ${formatSupabaseError(reviewsError, "product_reviews yazilamadi.")}`);
    }

    const { error: settingsError } = await target.from("settings").upsert(settingsPayload, { onConflict: "key" });
    if (settingsError) {
      throw new Error(`Starter settings seed failed: ${formatSupabaseError(settingsError, "settings yazilamadi.")}`);
    }

    const { error: blogError } = await target.from("blog_posts").upsert(blogPosts, { onConflict: "id" });
    if (blogError) {
      throw new Error(`Starter blog seed failed: ${formatSupabaseError(blogError, "blog_posts yazilamadi.")}`);
    }

    return {
      status: "seeded",
      message: paymentGatewayWarning
        ? `Starter storefront content basariyla yazildi. Not: ${paymentGatewayWarning}`
        : "Starter storefront content basariyla yazildi.",
      counts: {
        categories: mappedCategories.length,
        products: productsWithRatings.length,
        variants: mappedVariants.length,
        reviews: mappedReviews.length,
        blogPosts: blogPosts.length,
      },
    } satisfies SeedResult;
  });
}
