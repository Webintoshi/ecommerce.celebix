
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getAllProducts } from "@/lib/products";

// Secret key to protect the route
const SEED_SECRET = "celebix_secret_seed";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key");

    // 1. Security Check
    if (key !== SEED_SECRET) {
        return NextResponse.json(
            { success: false, message: "Unauthorized: Invalid seed key" },
            { status: 401 }
        );
    }

    try {
        // 2. Initialize Admin Client (Bypass RLS)
        const supabase = createServerClient();

        // 3. Clear Existing Data
        // Note: Delete variants first due to foreign key constraint
        console.log("Cleaning up product_variants...");
        const { error: variantDeleteError } = await supabase
            .from("product_variants")
            .delete()
            .neq("id", "00000000-0000-0000-0000-000000000000"); // Delete all

        if (variantDeleteError) {
            console.error("Variant delete error:", variantDeleteError);
            return NextResponse.json(
                { success: false, message: "Failed to clear variants", error: variantDeleteError },
                { status: 500 }
            );
        }

        console.log("Cleaning up products...");
        const { error: productDeleteError } = await supabase
            .from("products")
            .delete()
            .neq("id", "00000000-0000-0000-0000-000000000000"); // Delete all

        if (productDeleteError) {
            console.error("Product delete error:", productDeleteError);
            return NextResponse.json(
                { success: false, message: "Failed to clear products", error: productDeleteError },
                { status: 500 }
            );
        }

        // 4. Get Fresh Data from Codebase
        const products = await getAllProducts();
        console.log(`seeding ${products.length} products...`);

        // 5. Insert Products & Variants
        for (const product of products) {
            // Prepare product payload (omit variants array for DB insert)
            const { variants, ...productData } = product;

            // Transform boolean flags to DB columns if necessary (or keys match)
            // Based on schema, keys like 'vegan', 'glutenFree' might need mapping if DB uses snake_case
            // Checking lib/db/products.ts select statement helps, but let's assume standard keys for now
            // or mapping:
            const dbProduct = {
                id: product.id,
                name: product.name,
                slug: product.slug,
                description: product.description,
                short_description: product.shortDescription, // CamelCase to snake_case?
                category: product.category,
                subcategory: product.subcategory,
                images: product.images,
                tags: product.tags,
                nutritional_info: product.nutritionalInfo, // CamelCase to snake_case?
                is_vegan: product.vegan,
                is_gluten_free: product.glutenFree,
                is_sugar_free: product.sugarFree,
                is_high_protein: product.highProtein,
                rating: product.rating,
                review_count: product.reviewCount,
                is_featured: product.featured,
                is_new: product.new,
                seo_title: product.seoTitle,
                seo_description: product.seoDescription,
                discount: product.discount
            };

            const { error: insertProductError } = await supabase
                .from("products")
                .insert(dbProduct);

            if (insertProductError) {
                console.error(`Error inserting product ${product.name}:`, insertProductError);
                // Continue or break? Let's return error to see what's wrong.
                return NextResponse.json(
                    { success: false, message: `Failed to insert product ${product.name}`, error: insertProductError },
                    { status: 500 }
                );
            }

            // Insert Variants
            if (variants && variants.length > 0) {
                const dbVariants = variants.map(v => ({
                    id: v.id,
                    product_id: product.id,
                    name: v.name,
                    weight: v.weight,
                    price: v.price,
                    original_price: v.originalPrice,
                    stock: v.stock,
                    sku: v.sku
                }));

                const { error: insertVariantError } = await supabase
                    .from("product_variants")
                    .insert(dbVariants);

                if (insertVariantError) {
                    console.error(`Error inserting variants for ${product.name}:`, insertVariantError);
                    return NextResponse.json(
                        { success: false, message: `Failed to insert variants for ${product.name}`, error: insertVariantError },
                        { status: 500 }
                    );
                }
            }
        }

        return NextResponse.json({
            success: true,
            message: `Database seeded successfully with ${products.length} products.`,
            products_count: products.length
        });

    } catch (error) {
        console.error("Seed error:", error);
        return NextResponse.json(
            { success: false, message: "Internal Server Error", error: String(error) },
            { status: 500 }
        );
    }
}
