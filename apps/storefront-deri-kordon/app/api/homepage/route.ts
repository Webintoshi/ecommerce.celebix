import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

interface RawHeroSlide {
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

function normalizeHeroSlides(payload: unknown) {
    const rawSlides = Array.isArray((payload as { slides?: unknown[] } | null)?.slides)
        ? ((payload as { slides: unknown[] }).slides as RawHeroSlide[])
        : [];

    return rawSlides
        .map((slide, index) => {
            const desktop =
                slide.desktop ||
                slide.image ||
                slide.desktopImage ||
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

            return {
                id: index + 1,
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

export async function GET(request: NextRequest) {
    try {
        const supabase = createServerClient();

        // Parallel data fetching for performance
        const [
            heroBannersData,
            categoriesData,
            productsData,
            promoBannersData
        ] = await Promise.all([
            // Hero banners
            supabase
                .from("settings")
                .select("value")
                .eq("key", "hero_banners")
                .single(),
            
            // Categories
            supabase
                .from("categories")
                .select("*")
                .eq("is_active", true)
                .order("sort_order", { ascending: true })
                .limit(6),
            
            // Products - limited to 8
            supabase
                .from("products")
                .select("*, variants:product_variants(*)")
                .eq("is_active", true)
                .eq("status", "published")
                .limit(8),
            
            // Promo banners
            supabase
                .from("settings")
                .select("value")
                .eq("key", "promo_banners")
                .single()
        ]);

        // Process hero banners
        const heroBanners = normalizeHeroSlides(heroBannersData.data?.value);

        // Process categories
        const categories = (categoriesData.data || []).map(cat => ({
            id: cat.id,
            name: cat.name,
            slug: cat.slug,
            description: cat.description,
            image: cat.image,
            productCount: 0 // Can be calculated if needed
        }));

        // Process products
        const products = productsData.data || [];

        // Process promo banners
        const promoBanners = promoBannersData.data?.value?.banners || [];

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
