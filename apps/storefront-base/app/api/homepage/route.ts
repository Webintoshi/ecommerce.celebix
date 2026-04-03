import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
    getVariantAttributeRegistry,
    hydrateProductVariantSnapshots,
} from "@/lib/variant-attribute-hydration";

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

function hydrateHomepageProducts(
    products: Record<string, unknown>[],
    registry: Awaited<ReturnType<typeof getVariantAttributeRegistry>>,
) {
    return products.map((product) => ({
        ...product,
        variants: Array.isArray(product.variants)
            ? hydrateProductVariantSnapshots(
                product.variants as Array<Record<string, unknown>>,
                registry,
            )
            : [],
    }));
}

function normalizeHeroSlides(payload: unknown) {
    const rawSlides = Array.isArray(payload)
        ? (payload as RawHeroSlide[])
        : Array.isArray((payload as { slides?: unknown[] } | null)?.slides)
            ? ((payload as { slides: unknown[] }).slides as RawHeroSlide[])
            : Array.isArray((payload as { banners?: unknown[] } | null)?.banners)
                ? ((payload as { banners: unknown[] }).banners as RawHeroSlide[])
                : [];

    return rawSlides
        .map((slide, index) => {
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
                return null;
            }

            const title = slide.overlay?.title || slide.title || "";
            const subtitle = slide.overlay?.subtitle || slide.subtitle || "";
            const rawId = slide.id;

            return {
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
            };
        })
        .filter((slide): slide is NonNullable<typeof slide> => Boolean(slide));
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
    const activeQuery = await supabase
        .from("categories")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .limit(6);

    if (!activeQuery.error && (activeQuery.data?.length ?? 0) > 0) {
        return activeQuery.data ?? [];
    }

    const fallbackQuery = await supabase
        .from("categories")
        .select("*")
        .order("sort_order", { ascending: true })
        .limit(6);

    if (fallbackQuery.error) {
        throw fallbackQuery.error;
    }

    return fallbackQuery.data ?? [];
}

async function fetchHomepageProducts(supabase: ReturnType<typeof createServerClient>) {
    const strictQuery = await supabase
        .from("products")
        .select("*, variants:product_variants(*, raw_attributes:attributes)")
        .eq("is_active", true)
        .or("status.eq.published,status.is.null")
        .order("created_at", { ascending: false })
        .limit(8);

    if (!strictQuery.error && (strictQuery.data?.length ?? 0) > 0) {
        return strictQuery.data ?? [];
    }

    const publishedQuery = await supabase
        .from("products")
        .select("*, variants:product_variants(*, raw_attributes:attributes)")
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(8);

    if (!publishedQuery.error && (publishedQuery.data?.length ?? 0) > 0) {
        return publishedQuery.data ?? [];
    }

    const fallbackQuery = await supabase
        .from("products")
        .select("*, variants:product_variants(*, raw_attributes:attributes)")
        .order("created_at", { ascending: false })
        .limit(8);

    if (fallbackQuery.error) {
        throw fallbackQuery.error;
    }

    return fallbackQuery.data ?? [];
}

export async function GET(request: NextRequest) {
    try {
        const supabase = createServerClient();

        const [
            heroBannersData,
            categoriesData,
            productsData,
            promoBannersData,
            attributeRegistry,
        ] = await Promise.all([
            supabase
                .from("settings")
                .select("value")
                .eq("key", "hero_banners")
                .maybeSingle(),
            fetchHomepageCategories(supabase),
            fetchHomepageProducts(supabase),
            supabase
                .from("settings")
                .select("value")
                .eq("key", "promo_banners")
                .maybeSingle(),
            getVariantAttributeRegistry(),
        ]);

        // Process hero banners
        const heroBanners = normalizeHeroSlides(heroBannersData.data?.value);

        // Process categories
        const categories = (categoriesData || []).map(cat => ({
            id: cat.id,
            name: cat.name,
            slug: cat.slug,
            description: cat.description,
            image: cat.image,
            productCount: typeof cat.product_count === "number" ? cat.product_count : 0
        }));

        const products = hydrateHomepageProducts(productsData || [], attributeRegistry);

        // Process promo banners
        const promoBanners = normalizePromoBanners(promoBannersData.data?.value);

        return NextResponse.json({
            heroBanners,
            categories,
            products,
            promoBanners,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error("Homepage data API error:", error);
        return NextResponse.json(
            { error: "Failed to fetch homepage data" },
            { status: 500 }
        );
    }
}
