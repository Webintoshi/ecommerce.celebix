import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

// Static product data for migration
const PRODUCTS_TO_MIGRATE = [
    {
        name: "Şekersiz Fıstık Ezmesi",
        slug: "sekersiz-fistik-ezmesi",
        description: "Sadece kavrulmuş yer fıstığından üretilen saf fıstık ezmesi. Hiçbir katkı maddesi içermez. Yoğun fıstık aroması ve kremsi doku.",
        short_description: "Saf yer fıstığı, katkısız ve şekersiz.",
        images: ["/images/products/sekersiz-fistik-1.jpg"],
        category: "fistik-ezmesi",
        tags: ["şekersiz", "katkısız", "vegan", "protein"],
        is_featured: true,
        is_bestseller: true,
        seo_title: "Şekersiz Fıstık Ezmesi | Celebix E-ticaret",
        seo_description: "Sadece kavrulmuş yer fıstığından üretilen saf fıstık ezmesi. Katkısız ve şekersiz.",
        variants: [
            { name: "450g", sku: "EZM-FS-450", price: 199, original_price: 321, stock: 100, weight: "450g" },
            { name: "2 Adet - 900g", sku: "EZM-FS-450-2", price: 398.02, original_price: 642, stock: 75, weight: "900g" },
            { name: "3 Adet - 1350g", sku: "EZM-FS-450-3", price: 597.04, original_price: 963, stock: 45, weight: "1350g" },
        ]
    },
    {
        name: "Hurmalı Fıstık Ezmesi",
        slug: "hurmali-fistik-ezmesi",
        description: "Fıstık ezmesi ile hurmanın doğal tatlılığının birleşimi. Ekstra şeker eklenmeden, sadece hurmanın doğal tatlılığı.",
        short_description: "Doğal hurma tatlılığıyla fıstık ezmesi.",
        images: ["/images/products/hurmali-fistik-1.jpg"],
        category: "fistik-ezmesi",
        tags: ["hurmalı", "doğal tatlı", "vegan", "protein"],
        is_featured: true,
        is_bestseller: true,
        seo_title: "Hurmalı Fıstık Ezmesi | Celebix E-ticaret",
        seo_description: "Fıstık ezmesi ile hurmanın doğal tatlılığının birleşimi.",
        variants: [
            { name: "450g", sku: "EZM-FH-450", price: 225, original_price: 363, stock: 80, weight: "450g" },
            { name: "2 Adet - 900g", sku: "EZM-FH-450-2", price: 450, original_price: 726, stock: 50, weight: "900g" },
            { name: "3 Adet - 1350g", sku: "EZM-FH-450-3", price: 675, original_price: 1089, stock: 30, weight: "1350g" },
        ]
    },
    {
        name: "Ballı Fıstık Ezmesi",
        slug: "balli-fistik-ezmesi",
        description: "Yer fıstığı ile doğal arı balının birleşimi. Enerji veren, doyurucu bir doğal besin.",
        short_description: "Doğal bal ile tatlandırılmış fıstık ezmesi.",
        images: ["/images/products/balli-fistik-1.jpg"],
        category: "fistik-ezmesi",
        tags: ["ballı", "doğal", "enerji", "protein"],
        is_featured: true,
        is_bestseller: false,
        seo_title: "Ballı Fıstık Ezmesi | Celebix E-ticaret",
        seo_description: "Yer fıstığı ile doğal arı balının birleşimi.",
        variants: [
            { name: "450g", sku: "EZM-FB-450", price: 235, original_price: 379, stock: 60, weight: "450g" },
            { name: "2 Adet - 900g", sku: "EZM-FB-450-2", price: 470, original_price: 758, stock: 40, weight: "900g" },
        ]
    },
    {
        name: "Klasik Fıstık Ezmesi",
        slug: "klasik-fistik-ezmesi",
        description: "Klasik Amerikan tarzı fıstık ezmesi. Tuzsuz, şeker ilavesiz, sadece yer fıstığı.",
        short_description: "Klasik Amerikan tarzı fıstık ezmesi.",
        images: ["/images/products/klasik-fistik-1.jpg"],
        category: "fistik-ezmesi",
        tags: ["klasik", "tuzsuz", "katkısız", "vegan"],
        is_featured: true,
        is_bestseller: false,
        seo_title: "Klasik Fıstık Ezmesi | Celebix E-ticaret",
        seo_description: "Klasik Amerikan tarzı fıstık ezmesi.",
        variants: [
            { name: "450g", sku: "EZM-FK-450", price: 189, original_price: 305, stock: 90, weight: "450g" },
            { name: "2 Adet - 900g", sku: "EZM-FK-450-2", price: 378, original_price: 610, stock: 55, weight: "900g" },
        ]
    },
    {
        name: "Sütlü Fındık Kreması",
        slug: "sutlu-findik-kremasi",
        description: "Fındık kremanın yumuşacık tadı. Kahvaltıların vazgeçilmezi, çocukların favorisi.",
        short_description: "Yumuşak ve kremsi fındık kreması.",
        images: ["/images/products/sutlu-findik-1.jpg"],
        category: "findik-ezmesi",
        tags: ["sütlü", "kremsi", "kahvaltılık"],
        is_featured: true,
        is_bestseller: false,
        seo_title: "Sütlü Fındık Kreması | Celebix E-ticaret",
        seo_description: "Fındık kremanın yumuşacık tadı.",
        variants: [
            { name: "350g", sku: "EZM-FS-350", price: 179, original_price: 289, stock: 70, weight: "350g" },
            { name: "2 Adet - 700g", sku: "EZM-FS-350-2", price: 358, original_price: 578, stock: 45, weight: "700g" },
        ]
    },
    {
        name: "Kakaolu Fındık Ezmesi",
        slug: "kakaolu-findik-ezmesi",
        description: "Fındık ezmesi ile doğal kakaonun mükemmel uyumu. Çikolata severler için sağlıklı bir alternatif.",
        short_description: "Kakao ile zenginleştirilmiş fındık ezmesi.",
        images: ["/images/products/kakaolu-findik-1.jpg"],
        category: "findik-ezmesi",
        tags: ["kakaolu", "çikolatalı", "sağlıklı"],
        is_featured: true,
        is_bestseller: false,
        seo_title: "Kakaolu Fındık Ezmesi | Celebix E-ticaret",
        seo_description: "Fındık ezmesi ile doğal kakaonun mükemmel uyumu.",
        variants: [
            { name: "350g", sku: "EZM-FK-350", price: 189, original_price: 305, stock: 65, weight: "350g" },
            { name: "2 Adet - 700g", sku: "EZM-FK-350-2", price: 378, original_price: 610, stock: 40, weight: "700g" },
        ]
    },
    {
        name: "Yer Fıstığı",
        slug: "yer-fistigi",
        description: "Kavrulmuş kabuksuz yer fıstığı. Doypack paketli, taze ve lezzetli.",
        short_description: "Kavrulmuş kabuksuz yer fıstığı.",
        images: ["/images/products/yer-fistigi-1.jpg"],
        category: "kuruyemis",
        tags: ["kuruyemiş", "kavrulmuş", "protein"],
        is_featured: false,
        is_bestseller: false,
        seo_title: "Yer Fıstığı | Celebix E-ticaret",
        seo_description: "Kavrulmuş kabuksuz yer fıstığı.",
        variants: [
            { name: "500g", sku: "EZM-YF-500", price: 89, original_price: 144, stock: 120, weight: "500g" },
            { name: "1kg", sku: "EZM-YF-1000", price: 169, original_price: 273, stock: 80, weight: "1000g" },
        ]
    },
    {
        name: "Çiğ Badem",
        slug: "cig-badem",
        description: "Doğal çiğ badem. Kabuksuz, taze ve besleyici.",
        short_description: "Doğal çiğ badem.",
        images: ["/images/products/cig-badem-1.jpg"],
        category: "kuruyemis",
        tags: ["kuruyemiş", "çiğ", "badem", "protein"],
        is_featured: false,
        is_bestseller: false,
        seo_title: "Çiğ Badem | Celebix E-ticaret",
        seo_description: "Doğal çiğ badem. Kabuksuz, taze ve besleyici.",
        variants: [
            { name: "250g", sku: "EZM-CB-250", price: 119, original_price: 192, stock: 100, weight: "250g" },
            { name: "500g", sku: "EZM-CB-500", price: 229, original_price: 369, stock: 60, weight: "500g" },
        ]
    },
    {
        name: "Çiğ Fındık İçi",
        slug: "cig-findik-ic",
        description: "Doğal çiğ fındık içi. Kabuksuz, taze ve besleyici.",
        short_description: "Doğal çiğ fındık içi.",
        images: ["/images/products/cig-findik-1.jpg"],
        category: "kuruyemis",
        tags: ["kuruyemiş", "çiğ", "fındık"],
        is_featured: false,
        is_bestseller: false,
        seo_title: "Çiğ Fındık İçi | Celebix E-ticaret",
        seo_description: "Doğal çiğ fındık içi. Kabuksuz, taze ve besleyici.",
        variants: [
            { name: "250g", sku: "EZM-CF-250", price: 139, original_price: 224, stock: 90, weight: "250g" },
            { name: "500g", sku: "EZM-CF-500", price: 269, original_price: 434, stock: 55, weight: "500g" },
        ]
    },
];

// Categories data
const CATEGORIES_TO_MIGRATE = [
    { name: "Fıstık Ezmeleri", slug: "fistik-ezmesi", description: "Doğal ve katkısız fıstık ezmeleri", image: "/images/categories/fistik.jpg", sort_order: 1 },
    { name: "Fındık Ezmeleri", slug: "findik-ezmesi", description: "Kremsi ve lezzetli fındık ezmeleri", image: "/images/categories/findik.jpg", sort_order: 2 },
    { name: "Kuruyemişler", slug: "kuruyemis", description: "Taze ve doğal kuruyemişler", image: "/images/categories/kuruyemis.jpg", sort_order: 3 },
];

export async function POST(request: NextRequest) {
    try {
        const serverClient = createServerClient();

        const results = {
            categories: { inserted: 0, errors: [] as string[] },
            products: { inserted: 0, errors: [] as string[] },
            variants: { inserted: 0, errors: [] as string[] },
        };

        // Step 1: Insert categories
        for (const category of CATEGORIES_TO_MIGRATE) {
            const { error } = await serverClient
                .from("categories")
                .upsert(category, { onConflict: "slug" });

            if (error) {
                results.categories.errors.push(`${category.name}: ${error.message}`);
            } else {
                results.categories.inserted++;
            }
        }

        // Step 2: Insert products and variants
        for (const productData of PRODUCTS_TO_MIGRATE) {
            const { variants, ...product } = productData;

            // Insert product
            const { data: insertedProduct, error: productError } = await serverClient
                .from("products")
                .upsert(product, { onConflict: "slug" })
                .select()
                .single();

            if (productError) {
                results.products.errors.push(`${product.name}: ${productError.message}`);
                continue;
            }

            results.products.inserted++;

            // Insert variants
            for (const variant of variants) {
                const { error: variantError } = await serverClient
                    .from("product_variants")
                    .upsert({
                        product_id: insertedProduct.id,
                        ...variant,
                    }, { onConflict: "sku" });

                if (variantError) {
                    results.variants.errors.push(`${product.name} - ${variant.name}: ${variantError.message}`);
                } else {
                    results.variants.inserted++;
                }
            }
        }

        return NextResponse.json({
            success: true,
            message: "Migration completed",
            results,
        });

    } catch (error) {
        console.error("Migration error:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Migration failed" },
            { status: 500 }
        );
    }
}
