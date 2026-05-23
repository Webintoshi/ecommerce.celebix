import { NextRequest, NextResponse } from "next/server";
import { shouldUseLightPostgresAdmin } from "@/lib/db/admin-database-mode";
import { queryAdminLightPostgres } from "@/lib/db/light-postgres-client";
import { maybeGetAdminSetting } from "@/lib/db/light-postgres-read";
import { createServerClient } from "@/lib/supabase";

type HomepageCategoryRow = {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    image: string | null;
};

type HomepageProductRow = {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    short_description: string | null;
    category: string | null;
    images: unknown;
    images_v2: unknown;
    tags: unknown;
    seo_title: string | null;
    seo_description: string | null;
    seo_keywords: unknown;
    status: string | null;
    is_active: boolean | null;
    is_featured: boolean | null;
    created_at: string | null;
    updated_at: string | null;
};

type HomepageVariantRow = {
    id: string;
    product_id: string;
    name: string;
    sku: string | null;
    barcode: string | null;
    price: number | string | null;
    original_price: number | string | null;
    stock: number | string | null;
    weight: string | null;
    images: unknown;
    attributes: unknown;
    created_at: string | null;
    updated_at: string | null;
};

function normalizeSettingItems(value: unknown, key: "slides" | "banners") {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        const record = value as Record<string, unknown>;
        const items = record[key];
        return Array.isArray(items) ? items : [];
    }

    return Array.isArray(value) ? value : [];
}

async function getLightPostgresHomepagePayload() {
    if (!shouldUseLightPostgresAdmin()) {
        return undefined;
    }

    const [heroSetting, promoSetting, categories, products] = await Promise.all([
        maybeGetAdminSetting("hero_banners"),
        maybeGetAdminSetting("promo_banners"),
        queryAdminLightPostgres<HomepageCategoryRow>(
            `
                select id, name, slug, description, image
                from public.categories
                where coalesce(is_active, true) = true
                  and parent_id is null
                order by sort_order asc, name asc
                limit 6
            `,
        ),
        queryAdminLightPostgres<HomepageProductRow>(
            `
                select
                    id,
                    name,
                    slug,
                    description,
                    short_description,
                    category,
                    images,
                    images_v2,
                    tags,
                    seo_title,
                    seo_description,
                    seo_keywords,
                    status,
                    is_active,
                    is_featured,
                    created_at,
                    updated_at
                from public.products
                where coalesce(is_active, true) = true
                  and (status = 'published' or status is null)
                order by created_at desc nulls last
                limit 8
            `,
        ),
    ]);

    const productIds = products.map((product) => product.id);
    const variants = productIds.length
        ? await queryAdminLightPostgres<HomepageVariantRow>(
            `
                select
                    id,
                    product_id,
                    name,
                    sku,
                    barcode,
                    price,
                    original_price,
                    stock,
                    weight,
                    images,
                    attributes,
                    created_at,
                    updated_at
                from public.product_variants
                where product_id::text = any($1::text[])
                order by created_at asc nulls last, id asc
            `,
            [productIds],
        )
        : [];

    const variantsByProduct = new Map<string, HomepageVariantRow[]>();
    for (const variant of variants) {
        const productVariants = variantsByProduct.get(variant.product_id) ?? [];
        productVariants.push(variant);
        variantsByProduct.set(variant.product_id, productVariants);
    }

    return {
        heroBanners: normalizeSettingItems(heroSetting, "slides"),
        categories: categories.map((category) => ({
            id: category.id,
            name: category.name,
            slug: category.slug,
            description: category.description,
            image: category.image,
            productCount: 0,
        })),
        products: products.map((product) => ({
            ...product,
            variants: variantsByProduct.get(product.id) ?? [],
        })),
        promoBanners: normalizeSettingItems(promoSetting, "banners"),
        timestamp: new Date().toISOString(),
    };
}

export async function GET(request: NextRequest) {
    try {
        const lightPostgresPayload = await getLightPostgresHomepagePayload();
        if (lightPostgresPayload !== undefined) {
            return NextResponse.json(lightPostgresPayload);
        }

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
        const heroBanners = heroBannersData.data?.value?.slides || [];

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
