import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

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
