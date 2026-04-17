import { createServerClient } from "@/lib/supabase";
import {
  getHomepageCurationSettings,
  getProductListingOrderPositions,
} from "@/lib/db/settings";
import type { HomepageCurationSettings } from "@/lib/db/settings";
import { runCategoriesQuery } from "@/lib/categories-query-compat";
import {
  getVariantAttributeRegistry,
  hydrateProductVariantSnapshots,
} from "@/lib/variant-attribute-hydration";
import { sortProductsByListingOrder } from "@celebix/platform-config/src/product-listing-order";
import type { StorefrontLocale } from "@/lib/i18n";
import { translateCategoryRecord, translateProductRecord, translateText } from "@/lib/translation";

interface RawHeroSlide {
  id?: string | number;
  desktop?: string;
  mobile?: string;
  image?: string;
  mobileImage?: string;
  desktopImage?: string;
  url?: string;
  alt?: string;
  title?: string;
  subtitle?: string;
  buttonText?: string;
  buttonLink?: string;
  link?: string;
  overlay?: {
    title?: string;
    subtitle?: string;
    ctaText?: string;
    ctaLink?: string;
  };
}

interface RawPromoBanner {
  id?: string | number;
  image?: string;
  mobileImage?: string;
  desktop?: string;
  mobile?: string;
  desktopImage?: string;
  title?: string;
  subtitle?: string;
  buttonText?: string;
  buttonLink?: string;
  link?: string;
  order?: number;
  badge?: string;
  color?: string;
  discount?: string;
  endDate?: string;
}

export interface HomepageHeroBanner {
  id: string | number;
  desktop: string;
  mobile: string;
  alt: string;
  link?: string;
  title?: string;
  subtitle?: string;
  buttonText?: string;
  buttonLink?: string;
}

export interface HomepageCategory {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  image?: string | null;
  productCount: number;
}

export interface HomepageData {
  heroBanners: HomepageHeroBanner[];
  categories: HomepageCategory[];
  featuredCategories: HomepageCategory[];
  products: Record<string, unknown>[];
  promoBanners: Record<string, unknown>[];
  allProducts: Record<string, unknown>[];
  testimonials: HomepageTestimonial[];
  homepageCuration: HomepageCurationSettings;
}

export interface HomepageTestimonial {
  id: string;
  name: string;
  rating: number;
  body: string;
  image?: string | null;
  title?: string | null;
}

function hydrateHomepageProducts(
  products: Record<string, unknown>[],
  registry: Awaited<ReturnType<typeof getVariantAttributeRegistry>>,
) {
  return products.map((product) => {
    const variants = Array.isArray(product.variants)
      ? hydrateProductVariantSnapshots(
          product.variants as Array<Record<string, unknown>>,
          registry,
        )
      : [];

    return {
      ...product,
      variants,
    };
  });
}

function normalizeHeroSlides(payload: unknown): HomepageHeroBanner[] {
  const rawSlides = Array.isArray(payload)
    ? (payload as RawHeroSlide[])
    : Array.isArray((payload as { slides?: unknown[] } | null)?.slides)
      ? ((payload as { slides: unknown[] }).slides as RawHeroSlide[])
      : Array.isArray((payload as { banners?: unknown[] } | null)?.banners)
        ? ((payload as { banners: unknown[] }).banners as RawHeroSlide[])
        : [];

  return rawSlides.reduce<HomepageHeroBanner[]>((result, slide, index) => {
      const desktop =
        slide.desktop ||
        slide.desktopImage ||
        slide.image ||
        slide.url ||
        slide.mobile ||
        slide.mobileImage ||
        "";

      const mobile =
        slide.mobile ||
        slide.mobileImage ||
        slide.image ||
        slide.desktop ||
        slide.desktopImage ||
        slide.url ||
        desktop;

      if (!desktop && !mobile) {
        return result;
      }

      const title = slide.overlay?.title || slide.title || "";
      const subtitle = slide.overlay?.subtitle || slide.subtitle || "";
      const rawId = slide.id;

      result.push({
        id:
          typeof rawId === "number" || typeof rawId === "string"
            ? rawId
            : index + 1,
        desktop,
        mobile: mobile || desktop,
        alt: slide.alt || title || `Hero Banner ${index + 1}`,
        link: slide.link || slide.overlay?.ctaLink || undefined,
        title,
        subtitle,
        buttonText: slide.overlay?.ctaText || slide.buttonText || "",
        buttonLink: slide.overlay?.ctaLink || slide.buttonLink || slide.link || "",
      });

      return result;
    }, []);
}

function normalizePromoBanners(payload: unknown) {
  const rawBanners = Array.isArray(payload)
    ? (payload as RawPromoBanner[])
    : Array.isArray((payload as { banners?: unknown[] } | null)?.banners)
      ? ((payload as { banners: unknown[] }).banners as RawPromoBanner[])
      : Array.isArray((payload as { slides?: unknown[] } | null)?.slides)
        ? ((payload as { slides: unknown[] }).slides as RawPromoBanner[])
        : [];

  return rawBanners
    .map((banner, index) => {
      const image =
        banner.image ||
        banner.desktop ||
        banner.desktopImage ||
        banner.mobile ||
        banner.mobileImage ||
        "";

      if (!image) {
        return null;
      }

      const rawId = banner.id;

      return {
        id:
          typeof rawId === "number" || typeof rawId === "string"
            ? rawId
            : index + 1,
        image,
        mobileImage: banner.mobileImage || banner.mobile || image,
        title: banner.title || `Kampanya ${index + 1}`,
        subtitle: banner.subtitle || "",
        buttonText: banner.buttonText || "Incele",
        buttonLink: banner.buttonLink || banner.link || "/urunler",
        order: typeof banner.order === "number" ? banner.order : index + 1,
        badge: banner.badge,
        color: banner.color,
        discount: banner.discount,
        endDate: banner.endDate,
      };
    })
    .filter((banner): banner is NonNullable<typeof banner> => Boolean(banner));
}

async function fetchHomepageCategories(supabase: ReturnType<typeof createServerClient>) {
  const result = await runCategoriesQuery((includeIsActiveFilter) => {
    let query = supabase
      .from("categories")
      .select("*")
      .is("parent_id", null);

    if (includeIsActiveFilter) {
      query = query.eq("is_active", true);
    }

    return query;
  });

  if (result.error) {
    throw result.error;
  }

  return [...(result.data ?? [])]
    .sort((left, right) => {
      const leftCreatedAt =
        typeof left.created_at === "string" ? Date.parse(left.created_at) : Number.NaN;
      const rightCreatedAt =
        typeof right.created_at === "string" ? Date.parse(right.created_at) : Number.NaN;
      const hasCreatedAtOrdering =
        Number.isFinite(leftCreatedAt) || Number.isFinite(rightCreatedAt);

      if (hasCreatedAtOrdering && leftCreatedAt !== rightCreatedAt) {
        return (Number.isFinite(rightCreatedAt) ? rightCreatedAt : -Infinity) -
          (Number.isFinite(leftCreatedAt) ? leftCreatedAt : -Infinity);
      }

      const leftSortOrder =
        typeof left.sort_order === "number" ? left.sort_order : Number.MAX_SAFE_INTEGER;
      const rightSortOrder =
        typeof right.sort_order === "number" ? right.sort_order : Number.MAX_SAFE_INTEGER;

      if (leftSortOrder !== rightSortOrder) {
        return leftSortOrder - rightSortOrder;
      }

      return String(left.name ?? "").localeCompare(String(right.name ?? ""), "tr");
    })
    .slice(0, 6);
}

async function fetchHomepageCategoriesWithCuration(
  supabase: ReturnType<typeof createServerClient>,
  featuredCategorySlugs: string[],
) {
  const featuredSlugs = featuredCategorySlugs.filter(Boolean).slice(0, 4);

  if (featuredSlugs.length > 0) {
    const curatedResult = await runCategoriesQuery((includeIsActiveFilter) => {
      let query = supabase
        .from("categories")
        .select("*")
        .in("slug", featuredSlugs)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (includeIsActiveFilter) {
        query = query.eq("is_active", true);
      }

      return query;
    });

    if (curatedResult.error) {
      throw curatedResult.error;
    }

    if ((curatedResult.data?.length ?? 0) > 0) {
      const orderMap = new Map(featuredSlugs.map((slug, index) => [slug, index]));
      return (curatedResult.data ?? []).sort((left, right) => {
        const leftPriority = orderMap.get(left.slug) ?? 99;
        const rightPriority = orderMap.get(right.slug) ?? 99;
        return leftPriority - rightPriority;
      });
    }
  }

  const result = await runCategoriesQuery((includeIsActiveFilter) => {
    let query = supabase
      .from("categories")
      .select("*")
      .is("parent_id", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .limit(8);

    if (includeIsActiveFilter) {
      query = query.eq("is_active", true);
    }

    return query;
  });

  if (result.error) {
    throw result.error;
  }

  return result.data ?? [];
}

function withHomepageFeaturedFlag<T extends Record<string, unknown>>(product: T) {
  return {
    ...product,
    featured:
      typeof product.featured === "boolean"
        ? product.featured
        : Boolean(product.is_featured),
  };
}

async function fetchAllProductsForShowcase(supabase: ReturnType<typeof createServerClient>) {
  const strictQuery = await supabase
    .from("products")
    .select("*, variants:product_variants(*, raw_attributes:attributes)")
    .eq("is_active", true)
    .or("status.eq.published,status.is.null")
    .order("created_at", { ascending: false });

  if (!strictQuery.error && (strictQuery.data?.length ?? 0) > 0) {
    return strictQuery.data ?? [];
  }

  const publishedQuery = await supabase
    .from("products")
    .select("*, variants:product_variants(*, raw_attributes:attributes)")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (!publishedQuery.error && (publishedQuery.data?.length ?? 0) > 0) {
    return publishedQuery.data ?? [];
  }

  const fallbackQuery = await supabase
    .from("products")
    .select("*, variants:product_variants(*, raw_attributes:attributes)")
    .order("created_at", { ascending: false });

  if (fallbackQuery.error) {
    console.error("Failed to fetch all products for showcase:", fallbackQuery.error);
    return [];
  }

  return fallbackQuery.data ?? [];
}

async function translateHeroBanners(
  heroBanners: HomepageHeroBanner[],
  locale: StorefrontLocale,
) {
  return Promise.all(
    heroBanners.map(async (banner) => ({
      ...banner,
      title: banner.title ? await translateText(banner.title, { locale, context: "homepage-hero" }) : banner.title,
      subtitle: banner.subtitle
        ? await translateText(banner.subtitle, { locale, context: "homepage-hero" })
        : banner.subtitle,
      buttonText: banner.buttonText
        ? await translateText(banner.buttonText, { locale, context: "homepage-hero" })
        : banner.buttonText,
      alt: banner.alt ? await translateText(banner.alt, { locale, context: "homepage-hero" }) : banner.alt,
    })),
  );
}

async function fetchHomepageTestimonials(supabase: ReturnType<typeof createServerClient>) {
  const { data, error } = await supabase
    .from("product_reviews")
    .select("id, reviewer_name, rating, body, title, image_urls")
    .eq("status", "approved")
    .order("approved_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(6);

  if (error) {
    console.error("Failed to fetch homepage testimonials:", error);
    return [];
  }

  return (
    data?.map((review) => ({
      id: review.id,
      name: review.reviewer_name,
      rating: Number(review.rating || 0),
      body: review.body || "",
      title: review.title || null,
      image:
        Array.isArray(review.image_urls) && review.image_urls.length > 0
          ? review.image_urls[0]
          : null,
    })) ?? []
  );
}

export async function getHomepageData(locale: StorefrontLocale = "tr"): Promise<HomepageData> {
  const supabase = createServerClient();

  const [
    heroBannersData,
    homepageCuration,
    promoBannersData,
    allProductsData,
    attributeRegistry,
    testimonialsData,
    productListingOrder,
  ] = await Promise.all([
    supabase
      .from("settings")
      .select("value")
      .eq("key", "hero_banners")
      .maybeSingle(),
    getHomepageCurationSettings(),
    supabase
      .from("settings")
      .select("value")
      .eq("key", "promo_banners")
      .maybeSingle(),
    fetchAllProductsForShowcase(supabase),
    getVariantAttributeRegistry(),
    fetchHomepageTestimonials(supabase),
    getProductListingOrderPositions(),
  ]);

  const [categoriesData, featuredCategoriesData] = await Promise.all([
    fetchHomepageCategories(supabase),
    homepageCuration.featuredCategorySlugs.length > 0
      ? fetchHomepageCategoriesWithCuration(supabase, homepageCuration.featuredCategorySlugs)
      : fetchHomepageCategoriesWithCuration(supabase, []),
  ]);

  const heroBanners = normalizeHeroSlides(heroBannersData.data?.value);
  const featuredCategoryOrder =
    homepageCuration.featuredCategorySlugs.length > 0
      ? new Map(homepageCuration.featuredCategorySlugs.map((slug, index) => [slug, index]))
      : null;

  const categoryBase = (categoriesData || [])
    .filter((category) => category.slug && category.name)
    .map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description || null,
      image: category.image,
      productCount: typeof category.product_count === "number" ? category.product_count : 0,
      seo_title: category.seo_title || null,
      seo_description: category.seo_description || null,
    }));

  const featuredCategoryBase = (featuredCategoriesData || [])
    .filter((category) => category.slug && category.name)
    .sort((left, right) => {
      if (featuredCategoryOrder) {
        const leftPriority = featuredCategoryOrder.get(left.slug) ?? 99;
        const rightPriority = featuredCategoryOrder.get(right.slug) ?? 99;

        if (leftPriority !== rightPriority) {
          return leftPriority - rightPriority;
        }
      }

      const leftSort = typeof left.sort_order === "number" ? left.sort_order : Number.MAX_SAFE_INTEGER;
      const rightSort = typeof right.sort_order === "number" ? right.sort_order : Number.MAX_SAFE_INTEGER;

      if (leftSort !== rightSort) {
        return leftSort - rightSort;
      }

      return String(left.name).localeCompare(String(right.name), "tr");
    })
    .map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description || null,
      image: category.image,
      productCount: typeof category.product_count === "number" ? category.product_count : 0,
      seo_title: category.seo_title || null,
      seo_description: category.seo_description || null,
    }));

  const translatedCategories = await Promise.all(
    categoryBase.map(async (category) => {
      const translated = await translateCategoryRecord(category, locale);
      return {
        id: translated.id,
        name: translated.name || category.name,
        slug: translated.slug,
        description: translated.description || null,
        image: translated.image,
        productCount: translated.productCount,
      } satisfies HomepageCategory;
    }),
  );
  const translatedFeaturedCategories = await Promise.all(
    featuredCategoryBase.map(async (category) => {
      const translated = await translateCategoryRecord(category, locale);
      return {
        id: translated.id,
        name: translated.name || category.name,
        slug: translated.slug,
        description: translated.description || null,
        image: translated.image,
        productCount: translated.productCount,
      } satisfies HomepageCategory;
    }),
  );

  const orderedShowcaseProducts = sortProductsByListingOrder(
    (allProductsData || []) as Array<{ id: string; created_at?: string | null; name?: string | null } & Record<string, unknown>>,
    productListingOrder,
  );

  const translatedHeroBanners = await translateHeroBanners(heroBanners, locale);
  const translatedProducts = await Promise.all(
    orderedShowcaseProducts.slice(0, 8).map((product) => translateProductRecord(product, locale)),
  );
  const translatedShowcaseProducts = await Promise.all(
    orderedShowcaseProducts.map((product) => translateProductRecord(product, locale)),
  );

  return {
    heroBanners: translatedHeroBanners,
    categories: translatedCategories,
    featuredCategories: translatedFeaturedCategories,
    products: hydrateHomepageProducts(
      (translatedProducts || []).map((product) => withHomepageFeaturedFlag(product)),
      attributeRegistry,
    ),
    promoBanners: normalizePromoBanners(promoBannersData.data?.value),
    allProducts: hydrateHomepageProducts(
      (translatedShowcaseProducts || []).map((product) =>
        withHomepageFeaturedFlag(product),
      ),
      attributeRegistry,
    ),
    testimonials: testimonialsData,
    homepageCuration,
  };
}
