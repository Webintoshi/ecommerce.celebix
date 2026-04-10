import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "../../..");
const OWNER_ENV_PATH = path.join(ROOT, "apps", "owner", ".env.local");

const DEMO_REVIEWS = [
  {
    id: "2bf820d9-68bc-4d2e-94d1-17b6e1cc8101",
    name: "Ceren Y.",
    email: "ceren@example.com",
    rating: 5,
    title: "Isçiligi cok temiz",
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
];

const STORE_INFO_VALUE = {
  name: "Test1 Atelier",
  email: "destek@test1.46.225.183.57.sslip.io",
  phone: "+90 532 000 00 00",
  address: "Galata, Beyoglu / Istanbul",
  currency: "TRY",
  taxRate: 10,
  timezone: "Europe/Istanbul",
  logoUrl: "/logo.webp",
  faviconUrl: "/icons/default-favicon.ico",
  socialInstagram: "https://instagram.com/celebix.co",
  socialTwitter: "https://x.com/celebixco",
  typography: {
    headingFontFamily: "\"Times New Roman\", serif",
    bodyFontFamily: "system-ui, sans-serif",
  },
};

const ANNOUNCEMENT_BAR_VALUE = {
  enabled: true,
  text: "Ilk sipariste %10 hos geldin indirimi",
  ctaLabel: "Koleksiyonu Gor",
  ctaUrl: "/urunler",
};

const MARQUEE_SETTINGS_VALUE = {
  enabled: true,
  speed: "normal",
  direction: "left",
  items: [
    { id: "marquee-1", text: "El isciligiyle hazirlanan premium koleksiyon", icon: "award" },
    { id: "marquee-2", text: "Ayni gun kargo hazirlik akisi", icon: "truck", badge: "hizli" },
    { id: "marquee-3", text: "Kisisellestirme ve hediye notu destegi", icon: "heart" },
    { id: "marquee-4", text: "Marka ayarlari degistikce storefront otomatik guncellenir", icon: "sparkle" },
  ],
};

const SEO_SETTINGS_VALUE = {
  titleTemplate: "%s | Test1 Atelier",
  defaultTitle: "Test1 Atelier | Demo Premium Storefront",
  defaultDescription:
    "Celebix uzerinde olusturulan premium demo magazasi. Urun, kategori ve icerik akisi adminden yonetilir.",
  indexable: true,
  nofollow: false,
  ogImage: "/logo.webp",
};

function readEnvFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const env = {};

  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    env[key] = value;
  }

  return env;
}

function getArgValue(flag, fallback = null) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return fallback;
  }

  return process.argv[index + 1] ?? fallback;
}

function normalizeApiAssetPath(value) {
  if (typeof value !== "string") {
    return value;
  }

  if (!value.startsWith("https://derycraft.com/api/assets?src=")) {
    return value;
  }

  return value.replace("https://derycraft.com", "");
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "CelebixDemoSeeder/1.0",
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Fetch failed (${response.status}) for ${url}`);
  }

  return response.json();
}

async function resolveTargetStoreSecrets(slug) {
  const env = readEnvFile(OWNER_ENV_PATH);
  const owner = createClient(
    env.NEXT_PUBLIC_OWNER_SUPABASE_URL,
    env.OWNER_SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  const { data: storeRow, error: storeError } = await owner
    .from("owner_stores")
    .select("id, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (storeError) {
    throw new Error(`Owner store lookup failed: ${storeError.message}`);
  }

  if (!storeRow?.id) {
    throw new Error(`Store bulunamadi: ${slug}`);
  }

  const { data: secretRow, error: secretError } = await owner
    .from("owner_store_secrets")
    .select("store_id, supabase_url, supabase_service_role_key, supabase_anon_key")
    .eq("store_id", storeRow.id)
    .maybeSingle();

  if (secretError) {
    throw new Error(`Store secret lookup failed: ${secretError.message}`);
  }

  if (!secretRow?.supabase_url || !secretRow.supabase_service_role_key) {
    throw new Error(`Store secret eksik: ${slug}`);
  }

  return {
    storeId: storeRow.id,
    url: secretRow.supabase_url,
    serviceRoleKey: secretRow.supabase_service_role_key,
    anonKey: secretRow.supabase_anon_key ?? null,
  };
}

function buildVariantRegistry(products) {
  const attributeMap = new Map();

  for (const product of products) {
    const variants = Array.isArray(product.variants) ? product.variants : [];

    for (const variant of variants) {
      const attributes = Array.isArray(variant.attributes)
        ? variant.attributes
        : Array.isArray(variant.raw_attributes)
          ? variant.raw_attributes
          : [];

      for (const rawAttribute of attributes) {
        const attribute = rawAttribute && typeof rawAttribute === "object" ? rawAttribute : null;
        if (!attribute) {
          continue;
        }

        const attributeId = String(
          attribute.attributeId ||
            attribute.attribute_id ||
            attribute.id ||
            `attr-${String(attribute.name || attribute.attributeName || "secenek").toLowerCase()}`,
        );
        const attributeName = String(attribute.attributeName || attribute.name || "Secenek");
        const valueId = String(
          attribute.valueId ||
            attribute.attribute_value_id ||
            attribute.id ||
            `${attributeId}-${String(attribute.value || "value").toLowerCase()}`,
        );

        const value = String(attribute.value || "").trim();
        if (!value) {
          continue;
        }

        const group = attributeMap.get(attributeId) ?? {
          id: attributeId,
          name: attributeName,
          is_active: true,
          values: [],
        };

        if (!group.values.find((entry) => entry.id === valueId)) {
          group.values.push({
            id: valueId,
            attribute_id: attributeId,
            value,
            display_order:
              typeof attribute.displayOrder === "number"
                ? attribute.displayOrder
                : typeof attribute.display_order === "number"
                  ? attribute.display_order
                  : group.values.length,
            color_code: attribute.color_code ?? attribute.colorCode ?? null,
            image_url: normalizeApiAssetPath(attribute.image_url ?? attribute.imageUrl ?? null),
            is_active: true,
          });
        }

        attributeMap.set(attributeId, group);
      }
    }
  }

  return Array.from(attributeMap.values());
}

function mapCategory(category) {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description ?? category.name,
    image: normalizeApiAssetPath(category.image),
    parent_id: category.parent_id ?? null,
    sort_order: typeof category.sort_order === "number" ? category.sort_order : 0,
  };
}

function mapProduct(product) {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description ?? "",
    short_description: product.short_description ?? "",
    images: Array.isArray(product.images)
      ? product.images.map((image) => normalizeApiAssetPath(image)).filter(Boolean)
      : [],
    images_v2: Array.isArray(product.images_v2)
      ? product.images_v2.map((image, index) => ({
          alt: image.alt || product.name,
          url: normalizeApiAssetPath(image.url),
          is_primary: Boolean(image.is_primary ?? index === 0),
          sort_order: typeof image.sort_order === "number" ? image.sort_order : index,
        }))
      : [],
    category: product.category ?? null,
    subcategory: product.subcategory ?? null,
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
    seo_title: product.seo_title ?? product.name,
    seo_description: product.seo_description ?? product.short_description ?? "",
    status: product.status ?? "published",
    is_draft: Boolean(product.is_draft),
    published_at: product.published_at ?? new Date().toISOString(),
    tax_rate: Number(product.tax_rate || 10),
    brand: product.brand ?? "Test1 Atelier",
    country_of_origin: product.country_of_origin ?? "Turkiye",
    sku: product.sku ?? null,
    gtin: product.gtin ?? null,
    dimensions: product.dimensions ?? {},
    related_products: Array.isArray(product.related_products) ? product.related_products : [],
    complementary_products: Array.isArray(product.complementary_products)
      ? product.complementary_products
      : [],
    seo_keywords: Array.isArray(product.seo_keywords) ? product.seo_keywords : [],
    seo_focus_keyword: product.seo_focus_keyword ?? null,
    og_image: product.og_image ? normalizeApiAssetPath(product.og_image) : null,
    canonical_url: product.canonical_url ?? null,
    seo_robots: product.seo_robots ?? "index,follow",
    track_stock: product.track_stock !== false,
    low_stock_threshold: Number(product.low_stock_threshold || 10),
    allergens: Array.isArray(product.allergens) ? product.allergens : [],
    nutrition_basis: product.nutrition_basis ?? "per_100g",
    serving_size: Number(product.serving_size || 100),
    serving_per_container: Number(product.serving_per_container || 1),
    vitamins: product.vitamins ?? {},
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
    shopify_metadata: product.shopify_metadata ?? {},
    shopify_metafields: product.shopify_metafields ?? {},
  };
}

function mapVariants(products) {
  return products.flatMap((product) => {
    const variants = Array.isArray(product.variants) ? product.variants : [];

    return variants.map((variant) => ({
      id: variant.id,
      product_id: product.id,
      name: variant.name ?? "Standart",
      sku: variant.sku ?? null,
      price: Number(variant.price || 0),
      original_price: variant.original_price ?? null,
      stock: Number(variant.stock || 0),
      weight: variant.weight ?? "0",
      cost: variant.cost ?? null,
      barcode: variant.barcode ?? null,
      group_name: variant.group_name ?? null,
      images: Array.isArray(variant.images)
        ? variant.images.map((image) => normalizeApiAssetPath(image)).filter(Boolean)
        : [],
      unit: variant.unit ?? "adet",
      max_purchase_quantity: variant.max_purchase_quantity ?? null,
      warehouse_location: variant.warehouse_location ?? null,
      attributes: Array.isArray(variant.attributes)
        ? variant.attributes.map((attribute) => ({
            ...attribute,
            image_url: normalizeApiAssetPath(attribute.image_url ?? attribute.imageUrl ?? null),
            imageUrl: normalizeApiAssetPath(attribute.imageUrl ?? attribute.image_url ?? null),
          }))
        : Array.isArray(variant.raw_attributes)
          ? variant.raw_attributes.map((attribute) => ({
              ...attribute,
              image_url: normalizeApiAssetPath(attribute.image_url ?? attribute.imageUrl ?? null),
              imageUrl: normalizeApiAssetPath(attribute.imageUrl ?? attribute.image_url ?? null),
            }))
          : [],
      shopify_metadata: variant.shopify_metadata ?? {},
    }));
  });
}

function buildPromoBanners(categories) {
  return categories.slice(0, 3).map((category, index) => ({
    id: `promo-${index + 1}`,
    image: normalizeApiAssetPath(category.image),
    mobileImage: normalizeApiAssetPath(category.image),
    title: category.name,
    subtitle: category.description || "Demo vitrin",
    buttonText: "Incele",
    buttonLink: `/${category.slug}`,
    order: index + 1,
    badge: index === 0 ? "One Cikan" : index === 1 ? "Yeni" : "Secki",
  }));
}

function buildHeroBanners(sourceHeroBanners) {
  const normalized = Array.isArray(sourceHeroBanners) ? sourceHeroBanners : [];

  if (normalized.length === 0) {
    return [
      {
        id: "hero-1",
        desktop: "/placeholders/promo-banner-1.svg",
        mobile: "/placeholders/promo-banner-1.svg",
        alt: "Test1 Atelier",
        title: "Premium Starter Theme",
        subtitle: "Adminden yonetilen kategori, urun ve hikaye bloklari tek vitrine donusur.",
        buttonText: "Koleksiyonu Incele",
        buttonLink: "/urunler",
      },
    ];
  }

  return normalized.slice(0, 2).map((banner, index) => ({
    id: banner.id ?? `hero-${index + 1}`,
    desktop: normalizeApiAssetPath(banner.desktop || banner.image || banner.mobile || ""),
    mobile: normalizeApiAssetPath(banner.mobile || banner.desktop || banner.image || ""),
    alt: "Test1 Atelier",
    title: index === 0 ? "Premium Starter Theme" : "Editor Seckisi",
    subtitle:
      index === 0
        ? "Deri urunler, kategori bloklari ve musteri yorumlariyla dolu bir demo storefront."
        : "Hazir vitrin mantigi sayesinde yeni projeler tasarimsiz bos acilmaz.",
    buttonText: "Koleksiyonu Incele",
    buttonLink: "/urunler",
  }));
}

function buildReviewRows(products) {
  return products.slice(0, DEMO_REVIEWS.length).map((product, index) => {
    const demoReview = DEMO_REVIEWS[index];

    return {
      id: demoReview.id,
      product_id: product.id,
      variant_id: Array.isArray(product.variants) && product.variants[0]?.id ? product.variants[0].id : null,
      customer_id: null,
      reviewer_name: demoReview.name,
      reviewer_email: demoReview.email,
      rating: demoReview.rating,
      title: demoReview.title,
      body: demoReview.body,
      image_urls: Array.isArray(product.images) && product.images[0]
        ? [normalizeApiAssetPath(product.images[0])]
        : [],
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: null,
    };
  });
}

async function main() {
  const slug = getArgValue("--slug", "test1");
  const sourceStorefrontUrl = getArgValue("--source", "https://derycraft.com");
  const normalizedSource = sourceStorefrontUrl.replace(/\/+$/, "");

  const targetSecrets = await resolveTargetStoreSecrets(slug);
  const target = createClient(targetSecrets.url, targetSecrets.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const [homepagePayload, categoriesPayload, productsPayload] = await Promise.all([
    fetchJson(`${normalizedSource}/api/homepage`),
    fetchJson(`${normalizedSource}/api/categories`),
    fetchJson(`${normalizedSource}/api/products?limit=12`),
  ]);

  const preferredSlugs = [
    "cuzdan-kartlik",
    "apple-watch-saat-kayislari",
    "saat-kayislari",
    "canta-organizer",
    "aksesuar",
    "gunluk-yasam",
  ];

  const topLevelCategories = (categoriesPayload.categories ?? [])
    .filter((category) => preferredSlugs.includes(category.slug))
    .sort((left, right) => preferredSlugs.indexOf(left.slug) - preferredSlugs.indexOf(right.slug));

  const mappedCategories = topLevelCategories.map(mapCategory);
  const sourceProducts = (productsPayload.products ?? [])
    .filter(
      (product) =>
        preferredSlugs.includes(product.category) || preferredSlugs.includes(product.subcategory),
    )
    .slice(0, 10);
  const mappedProducts = sourceProducts.map(mapProduct);
  const mappedVariants = mapVariants(sourceProducts);
  const mappedReviews = buildReviewRows(sourceProducts);
  const heroBanners = buildHeroBanners(homepagePayload.heroBanners);
  const promoBanners =
    Array.isArray(homepagePayload.promoBanners) && homepagePayload.promoBanners.length > 0
      ? homepagePayload.promoBanners.map((banner) => ({
          ...banner,
          image: normalizeApiAssetPath(banner.image),
          mobileImage: normalizeApiAssetPath(banner.mobileImage),
          desktop: normalizeApiAssetPath(banner.desktop),
          mobile: normalizeApiAssetPath(banner.mobile),
        }))
      : buildPromoBanners(mappedCategories);
  const reviewCountByProductId = new Map();
  const ratingByProductId = new Map();

  for (const review of mappedReviews) {
    const currentCount = reviewCountByProductId.get(review.product_id) ?? 0;
    reviewCountByProductId.set(review.product_id, currentCount + 1);

    const currentRatings = ratingByProductId.get(review.product_id) ?? [];
    currentRatings.push(review.rating);
    ratingByProductId.set(review.product_id, currentRatings);
  }

  const productsWithRatings = mappedProducts.map((product) => {
    const ratings = ratingByProductId.get(product.id) ?? [];
    const reviewCount = reviewCountByProductId.get(product.id) ?? 0;
    const rating = ratings.length > 0
      ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length
      : product.rating;

    return {
      ...product,
      rating,
      review_count: reviewCount,
    };
  });

  const variantRegistry = {
    attributes: buildVariantRegistry(sourceProducts),
  };

  const productIds = productsWithRatings.map((product) => product.id);

  const { error: categoriesError } = await target
    .from("categories")
    .upsert(mappedCategories, { onConflict: "id" });

  if (categoriesError) {
    throw new Error(`Categories seed failed: ${categoriesError.message}`);
  }

  const { error: productsError } = await target
    .from("products")
    .upsert(productsWithRatings, { onConflict: "id" });

  if (productsError) {
    throw new Error(`Products seed failed: ${productsError.message}`);
  }

  if (productIds.length > 0) {
    const { error: variantsDeleteError } = await target
      .from("product_variants")
      .delete()
      .in("product_id", productIds);

    if (variantsDeleteError) {
      throw new Error(`Variants cleanup failed: ${variantsDeleteError.message}`);
    }
  }

  if (mappedVariants.length > 0) {
    const { error: variantsInsertError } = await target
      .from("product_variants")
      .insert(mappedVariants);

    if (variantsInsertError) {
      throw new Error(`Variants seed failed: ${variantsInsertError.message}`);
    }
  }

  const { error: reviewsUpsertError } = await target
    .from("product_reviews")
    .upsert(mappedReviews, { onConflict: "id" });

  if (reviewsUpsertError) {
    throw new Error(`Reviews seed failed: ${reviewsUpsertError.message}`);
  }

  const settingsPayload = [
    { key: "store_info", value: STORE_INFO_VALUE },
    { key: "announcement_bar", value: ANNOUNCEMENT_BAR_VALUE },
    { key: "marquee_settings", value: MARQUEE_SETTINGS_VALUE },
    { key: "seo_settings", value: SEO_SETTINGS_VALUE },
    { key: "hero_banners", value: heroBanners },
    { key: "promo_banners", value: promoBanners },
    { key: "variant_attributes_registry", value: variantRegistry },
  ];

  const { error: settingsError } = await target
    .from("settings")
    .upsert(settingsPayload, { onConflict: "key" });

  if (settingsError) {
    throw new Error(`Settings seed failed: ${settingsError.message}`);
  }

  const blogPosts = [
    {
      id: "7e8f8fd7-5ba9-4e2d-b6f0-d61ff685f6f0",
      title: "Demo Atolye Magazasi Nasil Konumlanir",
      slug: "demo-atolye-magazasi-nasil-konumlanir",
      excerpt: "Starter storefront theme uzerinde kategori, urun ve vitrin bloklarini nasil hizli sekilde kurabileceginizi anlatiyor.",
      content: "Bu yazi, Celebix starter theme uzerinde marka omurgasini nasil hizli kurdugumuzu gosteren ornek bir blog icerigidir.",
      featured_image: normalizeApiAssetPath(mappedCategories[0]?.image || "/placeholder.svg"),
      author: "Celebix Studio",
      status: "published",
      published_at: new Date().toISOString(),
    },
    {
      id: "8a3f7c1d-041f-4455-992e-f2a3f93dc8d2",
      title: "Premium PDP Kurgusu Icin Gerekli Bloklar",
      slug: "premium-pdp-kurgusu-icin-gerekli-bloklar",
      excerpt: "Urun gorselleri, yorumlar, swatchlar ve kisisellestirme alanlari birarada nasil calisir.",
      content: "Bu demo blog yazisi, yeni magaza projelerinde kullanilan PDP omurgasini aciklamak icin eklendi.",
      featured_image: normalizeApiAssetPath(productsWithRatings[0]?.images?.[0] || "/placeholder.svg"),
      author: "Celebix Studio",
      status: "published",
      published_at: new Date().toISOString(),
    },
    {
      id: "5d0fbe4a-2f4b-4da6-b1f7-88a748ca3b90",
      title: "Owner Panelden Tek Tikla Magaza Hazirlama",
      slug: "owner-panelden-tek-tikla-magaza-hazirlama",
      excerpt: "Provisioning, demo seed ve storefront deploy zincirini daha okunur anlatan bir ornek icerik.",
      content: "Bu yazi, owner panel otomasyonu ile yeni bir magazayi nasil hazirlayabileceginizi gosteren placeholder bir iceriktir.",
      featured_image: normalizeApiAssetPath(mappedCategories[1]?.image || "/placeholder.svg"),
      author: "Celebix Studio",
      status: "published",
      published_at: new Date().toISOString(),
    },
  ];

  const { error: blogError } = await target
    .from("blog_posts")
    .upsert(blogPosts, { onConflict: "id" });

  if (blogError) {
    throw new Error(`Blog seed failed: ${blogError.message}`);
  }

  console.log(
    JSON.stringify(
      {
        slug,
        categories: mappedCategories.length,
        products: productsWithRatings.length,
        variants: mappedVariants.length,
        reviews: mappedReviews.length,
        blogPosts: blogPosts.length,
        source: normalizedSource,
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
