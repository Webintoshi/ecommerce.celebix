import { NextRequest, NextResponse } from "next/server";
import { deleteProduct } from "@/lib/db/products";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import {
    diffProductTags,
    syncProductTagSuggestions,
    validateAndNormalizeProductTags,
} from "@/lib/product-tags";
import { enqueueProductListingSync } from "@/lib/db/marketplace-sync";

function toNullableString(value: unknown): string | null {
    if (typeof value !== "string") {
        return null;
    }

    const normalized = value.trim();
    return normalized ? normalized : null;
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "Bilinmeyen hata";
}

function logTagSuggestionSyncError(error: unknown, context: string) {
    console.error(`Product tag suggestion sync failed (${context}):`, error);
}

function logMarketplaceQueueError(error: unknown, context: string) {
    console.error(`Marketplace queue sync failed (${context}):`, error);
}

// GET /api/products - Get all products or filter by query params
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");
        const featured = searchParams.get("featured");
        const bestseller = searchParams.get("bestseller");
        const category = searchParams.get("category");
        const slug = searchParams.get("slug");
        const search = searchParams.get("search");
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "20");
        const offset = (page - 1) * limit;

        let products;

        if (id) {
            // Fetch single product by ID from Supabase
            const { createServerClient } = await import("@/lib/supabase");
            const supabase = createServerClient();
            const { data, error } = await supabase
                .from("products")
                .select("*, variants:product_variants(*)")
                .eq("id", id)
                .single();
            if (error) throw error;
            return NextResponse.json({ success: true, product: data });
        } else if (slug) {
            // Fetch single product by slug from Supabase
            const { createServerClient } = await import("@/lib/supabase");
            const supabase = createServerClient();
            const { data, error } = await supabase
                .from("products")
                .select("*, variants:product_variants(*)")
                .eq("slug", slug)
                .single();
            if (error) {
                return NextResponse.json({ 
                    success: false, 
                    error: error.message 
                }, { status: 404 });
            }
            return NextResponse.json({ success: true, product: data });
        } else if (featured === "true") {
            const { createServerClient } = await import("@/lib/supabase");
            const supabase = createServerClient();
            const { data, error } = await supabase
                .from("products")
                .select("*, variants:product_variants(*)")
                .eq("is_featured", true)
                .limit(10);
            if (error) throw error;
            products = data || [];
        } else if (bestseller === "true") {
            const { createServerClient } = await import("@/lib/supabase");
            const supabase = createServerClient();
            const { data, error } = await supabase
                .from("products")
                .select("*, variants:product_variants(*)")
                .eq("is_bestseller", true)
                .limit(10);
            if (error) throw error;
            products = data || [];
        } else if (category) {
            // Fetch products by category from Supabase with pagination
            const { createServerClient } = await import("@/lib/supabase");
            const supabase = createServerClient();

            // Get total count
            const { count } = await supabase
                .from("products")
                .select("*", { count: "exact", head: true })
                .eq("category", category);

            // Get paginated data
            const { data, error } = await supabase
                .from("products")
                .select("*, variants:product_variants(*)")
                .eq("category", category)
                .range(offset, offset + limit - 1)
                .order("created_at", { ascending: false });

            if (error) throw error;
            return NextResponse.json({
                success: true,
                products: data || [],
                pagination: {
                    page,
                    limit,
                    total: count || 0,
                    totalPages: Math.ceil((count || 0) / limit)
                }
            });
        } else if (search) {
            const { createServerClient } = await import("@/lib/supabase");
            const supabase = createServerClient();
            const { data, error } = await supabase
                .from("products")
                .select("*, variants:product_variants(*)")
                .or(`name.ilike.%${search}%,description.ilike.%${search}%`)
                .limit(20);
            if (error) throw error;
            products = data || [];
        } else {
            // Fetch all products from Supabase with pagination
            const { createServerClient } = await import("@/lib/supabase");
            const supabase = createServerClient();

            // Get total count
            const { count } = await supabase
                .from("products")
                .select("*", { count: "exact", head: true });

            // Get paginated data
            const { data, error } = await supabase
                .from("products")
                .select("*, variants:product_variants(*)")
                .range(offset, offset + limit - 1)
                .order("created_at", { ascending: false });

            if (error) throw error;

            return NextResponse.json({
                success: true,
                products: data || [],
                pagination: {
                    page,
                    limit,
                    total: count || 0,
                    totalPages: Math.ceil((count || 0) / limit)
                }
            });
        }

        return NextResponse.json({ success: true, products });
    } catch (error) {
        console.error("Error fetching products:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Failed to fetch products" },
            { status: 500 }
        );
    }
}

// POST /api/products - Create a new product
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { variants, discount_rules, ...productData } = body;

        console.log('POST /api/products - productData.images:', productData.images);
        console.log('POST /api/products - body images count:', body.images?.length);

        const { createServerClient } = await import("@/lib/supabase");
        const supabase = createServerClient();

        // Validation: Zorunlu alanlar
        const validationErrors: string[] = [];
        if (!productData.name || productData.name.trim() === '') {
            validationErrors.push("Ürün adı gereklidir");
        }
        if (!productData.slug || productData.slug.trim() === '') {
            validationErrors.push("URL slug gereklidir");
        }
        if (!productData.description || productData.description.trim() === '') {
            validationErrors.push("Ürün açıklaması gereklidir");
        }
        if (!productData.short_description || productData.short_description.trim() === '') {
            validationErrors.push("Kısa açıklama gereklidir");
        }
        if (!productData.category) {
            validationErrors.push("Kategori seçilmelidir");
        }
        
        if (validationErrors.length > 0) {
            return NextResponse.json(
                { success: false, error: validationErrors.join(", "), code: "VALIDATION_ERROR" },
                { status: 400 }
            );
        }

        let normalizedTags: string[] = [];
        try {
            normalizedTags = validateAndNormalizeProductTags(productData.tags);
        } catch (error) {
            return NextResponse.json(
                {
                    success: false,
                    error: getErrorMessage(error),
                    code: "TAG_VALIDATION_ERROR",
                },
                { status: 400 }
            );
        }

        // 1. Slug benzersizlik kontrolü
        if (productData.slug) {
            const { data: existingProduct } = await supabase
                .from("products")
                .select("id")
                .eq("slug", productData.slug)
                .single();

            if (existingProduct) {
                const uniqueSlug = `${productData.slug}-${Date.now().toString(36)}`;
                productData.slug = uniqueSlug;
                console.log("Slug changed to:", uniqueSlug);
            }
        }

        // 2. Görselleri normalize et - images_v2 formatını düzelt (camelCase -> snake_case)
        let normalizedImagesV2 = productData.images_v2 || [];
        if (normalizedImagesV2.length > 0) {
            normalizedImagesV2 = normalizedImagesV2.map((img: Record<string, unknown>, idx: number) => ({
                url: img.url,
                alt: img.alt || "",
                is_primary: img.isPrimary !== undefined ? img.isPrimary : (idx === 0),
                sort_order: img.sortOrder !== undefined ? img.sortOrder : idx,
            }));
        }

        // images array'ini de güncelle (geriye uyumluluk için)
        const normalizedImages = productData.images || normalizedImagesV2.map((img: Record<string, unknown>) => img.url);

        // 3. Ana ürünü oluştur
        const { data: product, error: productError } = await supabase
            .from("products")
            .insert({
                name: productData.name,
                slug: productData.slug,
                description: productData.description || null,
                short_description: productData.short_description || null,
                images: normalizedImages,
                images_v2: normalizedImagesV2,
                category: productData.category || null,
                subcategory: toNullableString(productData.subcategory),
                tags: normalizedTags,
                is_active: productData.is_active !== false,
                is_featured: productData.is_featured || false,
                is_bestseller: productData.is_bestseller || false,
                is_new: productData.is_new || false,
                vegan: productData.vegan || false,
                gluten_free: productData.gluten_free || false,
                sugar_free: productData.sugar_free || false,
                high_protein: productData.high_protein || false,
                rating: productData.rating || 5,
                review_count: productData.review_count || 0,
                status: productData.status || 'published',
                is_draft: productData.is_draft || false,
                published_at: productData.published_at || new Date().toISOString(),
                tax_rate: productData.tax_rate || 10,
                brand: productData.brand || STORE_RUNTIME.defaultProductBrand,
                country_of_origin: productData.country_of_origin || 'Türkiye',
                sku: productData.sku || null,
                gtin: productData.gtin || null,
                dimensions: productData.dimensions || {},
                related_products: productData.related_products || [],
                complementary_products: productData.complementary_products || [],
                seo_title: productData.seo_title || null,
                seo_description: productData.seo_description || null,
                seo_keywords: productData.seo_keywords || [],
                seo_focus_keyword: productData.seo_focus_keyword || null,
                og_image: productData.og_image || null,
                canonical_url: productData.canonical_url || null,
                seo_robots: productData.seo_robots || 'index,follow',
                track_stock: productData.track_stock !== false,
                low_stock_threshold: productData.low_stock_threshold || 10,
                nutrition_basis: productData.nutrition_basis || 'per_100g',
                serving_size: productData.serving_size || 100,
                serving_per_container: productData.serving_per_container || 1,
                allergens: productData.allergens || [],
                vitamins: productData.vitamins || {},
                ingredients: productData.ingredients || null,
                storage_conditions: productData.storage_conditions || null,
                shelf_life_days: productData.shelf_life_days || null,
                calories: productData.calories || 0,
                protein: productData.protein || 0,
                carbs: productData.carbs || 0,
                fat: productData.fat || 0,
                fiber: productData.fiber || 0,
                sugar: productData.sugar || 0,
                saturated_fat: productData.saturated_fat || 0,
                sodium: productData.sodium || 0,
            })
            .select()
            .single();

        if (productError) {
            console.error("Product insert error:", productError);
            throw productError;
        }

        console.log("Product created with ID:", product.id);
        
        // 4. Varyantları ekle (benzersiz SKU oluştur)
        if (variants && Array.isArray(variants) && variants.length > 0) {
            console.log("Processing variants, count:", variants.length);
            console.log("Variants data:", JSON.stringify(variants, null, 2));
            
            const variantsToInsert = variants.map((v: Record<string, unknown>, idx: number) => ({
                product_id: product.id,
                name: v.name,
                weight: String(v.weight || 0),
                price: v.price || 0,
                original_price: v.original_price || null,
                cost: v.cost || null,
                stock: v.stock || 0,
                sku: v.sku || `EZM-${Date.now().toString(36)}-${idx}`,
                barcode: v.barcode || null,
                group_name: v.group_name || null,
                unit: v.unit || 'adet',
                max_purchase_quantity: v.max_purchase_quantity || null,
                warehouse_location: v.warehouse_location || null,
                images: v.images || [],
            }));

            console.log("Inserting variants:", JSON.stringify(variantsToInsert, null, 2));

            const { error: variantsError } = await supabase
                .from("product_variants")
                .insert(variantsToInsert);

            if (variantsError) {
                console.error("Variants insert error:", variantsError);
                throw variantsError;
            }
            console.log("Variants inserted successfully");
        } else {
            console.log("No variants to insert");
        }

        // 5. İndirim kurallarını product_discount_rules tablosuna kaydet
        if (discount_rules && Array.isArray(discount_rules) && discount_rules.length > 0) {
            console.log("Processing discount rules, count:", discount_rules.length);
            
            const discountRulesToInsert = discount_rules.map((rule: Record<string, unknown>) => ({
                product_id: product.id,
                name: rule.name,
                type: rule.type,
                config: rule.config || {},
                is_active: rule.isActive !== false,
                priority: 0,
            }));

            const { error: discountError } = await supabase
                .from("product_discount_rules")
                .insert(discountRulesToInsert);

            if (discountError) {
                console.error("Discount rules insert error:", discountError);
            } else {
                console.log("Discount rules inserted successfully");
            }
        }

        // 6. Tam ürünü döndür
        const { data: fullProduct } = await supabase
            .from("products")
            .select("*, variants:product_variants(*)")
            .eq("id", product.id)
            .single();

        if (normalizedTags.length > 0) {
            try {
                await syncProductTagSuggestions(supabase, { added: normalizedTags });
            } catch (error) {
                logTagSuggestionSyncError(error, "create");
            }
        }

        try {
            await enqueueProductListingSync(product.id);
        } catch (error) {
            logMarketplaceQueueError(error, "create");
        }

        return NextResponse.json({ success: true, product: fullProduct });
    } catch (error: unknown) {
        console.error("Error creating product:", error);
        console.error("Error details:", error?.details, error?.message, error?.code);
        return NextResponse.json(
            { success: false, error: error?.message || error?.details || "Failed to create product", code: error?.code },
            { status: 500 }
        );
    }
}

// PUT /api/products - Update a product
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, variants, discount_rules, deleted_images, ...updates } = body;
        let normalizedUpdatedTags: string[] | undefined;

        console.log("PUT /api/products - ID:", id);
        console.log("PUT /api/products - Updates:", updates);
        console.log("PUT /api/products - Variants:", variants);
        console.log("PUT /api/products - Discount rules:", discount_rules);
        console.log("PUT /api/products - Deleted images:", deleted_images);

        if (!id) {
            return NextResponse.json(
                { success: false, error: "Product ID is required" },
                { status: 400 }
            );
        }

        const { createServerClient } = await import("@/lib/supabase");
        const supabase = createServerClient();
        if (updates.tags !== undefined) {
            try {
                normalizedUpdatedTags = validateAndNormalizeProductTags(updates.tags);
            } catch (error) {
                return NextResponse.json(
                    {
                        success: false,
                        error: getErrorMessage(error),
                        code: "TAG_VALIDATION_ERROR",
                    },
                    { status: 400 }
                );
            }
        }

        // 1. Slug benzersizlik kontrolü (güncelleme sırasında)
        if (updates.slug) {
            const { data: existingProduct } = await supabase
                .from("products")
                .select("id")
                .eq("slug", updates.slug)
                .neq("id", id)
                .single();

            if (existingProduct) {
                updates.slug = `${updates.slug}-${Date.now().toString(36)}`;
                console.log("Slug changed to:", updates.slug);
            }
        }

        // 2. Mevcut ürünü al (görselleri filtrelemek için)
        const { data: existingProduct } = await supabase
            .from("products")
            .select("images,tags")
            .eq("id", id)
            .single();

        // 3. Silinen görselleri R2'den de sil
        if (deleted_images && Array.isArray(deleted_images)) {
            const { deleteFromR2 } = await import("@/lib/r2");
            for (const key of deleted_images) {
                await deleteFromR2(key);
            }
        }

        // 4. Görselleri normalize et - SADECE explicitly gönderildiyse
        let normalizedImagesV2 = Array.isArray(updates.images_v2)
            ? updates.images_v2
            : undefined;
        let finalImages = Array.isArray(updates.images) ? updates.images : undefined;
        
        // Eğer görseller gönderilmemişse, mevcut değerleri koru (undefined bırak)
        if (normalizedImagesV2 !== undefined) {
            if (normalizedImagesV2.length > 0) {
                normalizedImagesV2 = normalizedImagesV2.map((img: Record<string, unknown>, idx: number) => ({
                    url: img.url,
                    alt: img.alt || "",
                    is_primary: img.isPrimary !== undefined ? img.isPrimary : (idx === 0),
                    sort_order: img.sortOrder !== undefined ? img.sortOrder : idx,
                }));
            }
        }

        if (finalImages !== undefined) {
            if (deleted_images && Array.isArray(deleted_images) && existingProduct?.images) {
                finalImages = finalImages.filter((img: string) => !deleted_images.includes(img));
            }
        } else if (normalizedImagesV2 !== undefined) {
            // images gönderilmemiş ama images_v2 gönderilmişse
            finalImages = normalizedImagesV2.map((img: Record<string, unknown>) => img.url);
        }

        // 5. Build update object - SADECE gönderilen alanları içerecek
        const updateData: Record<string, unknown> = {};
        
        // Sadece undefined olmayan alanları ekle
        if (updates.name !== undefined) updateData.name = updates.name;
        if (updates.slug !== undefined) updateData.slug = updates.slug;
        if (updates.description !== undefined) updateData.description = updates.description;
        if (updates.short_description !== undefined) updateData.short_description = updates.short_description;
        
        // Görseller SADECE explicitly gönderildiyse güncelle
        if (finalImages !== undefined) updateData.images = finalImages;
        if (normalizedImagesV2 !== undefined) updateData.images_v2 = normalizedImagesV2;
        
        if (updates.category !== undefined) updateData.category = updates.category;
        if (updates.subcategory !== undefined) updateData.subcategory = toNullableString(updates.subcategory);
        if (normalizedUpdatedTags !== undefined) updateData.tags = normalizedUpdatedTags;
        if (updates.is_active !== undefined) updateData.is_active = updates.is_active;
        if (updates.is_featured !== undefined) updateData.is_featured = updates.is_featured;
        if (updates.is_bestseller !== undefined) updateData.is_bestseller = updates.is_bestseller;
        if (updates.is_new !== undefined) updateData.is_new = updates.is_new;
        if (updates.vegan !== undefined) updateData.vegan = updates.vegan;
        if (updates.gluten_free !== undefined) updateData.gluten_free = updates.gluten_free;
        if (updates.sugar_free !== undefined) updateData.sugar_free = updates.sugar_free;
        if (updates.high_protein !== undefined) updateData.high_protein = updates.high_protein;
        if (updates.rating !== undefined) updateData.rating = updates.rating;
        if (updates.review_count !== undefined) updateData.review_count = updates.review_count;
        if (updates.status !== undefined) updateData.status = updates.status;
        if (updates.is_draft !== undefined) updateData.is_draft = updates.is_draft;
        if (updates.published_at !== undefined) updateData.published_at = updates.published_at;
        if (updates.tax_rate !== undefined) updateData.tax_rate = updates.tax_rate;
        if (updates.brand !== undefined) updateData.brand = updates.brand;
        if (updates.country_of_origin !== undefined) updateData.country_of_origin = updates.country_of_origin;
        if (updates.sku !== undefined) updateData.sku = updates.sku;
        if (updates.gtin !== undefined) updateData.gtin = updates.gtin;
        if (updates.dimensions !== undefined) updateData.dimensions = updates.dimensions;
        if (updates.related_products !== undefined) updateData.related_products = updates.related_products;
        if (updates.complementary_products !== undefined) updateData.complementary_products = updates.complementary_products;
        
        // SEO alanları
        if (updates.seo_title !== undefined) updateData.seo_title = updates.seo_title;
        if (updates.seo_description !== undefined) updateData.seo_description = updates.seo_description;
        if (updates.seo_keywords !== undefined) updateData.seo_keywords = updates.seo_keywords;
        if (updates.seo_focus_keyword !== undefined) updateData.seo_focus_keyword = updates.seo_focus_keyword;
        if (updates.og_image !== undefined) updateData.og_image = updates.og_image;
        if (updates.canonical_url !== undefined) updateData.canonical_url = updates.canonical_url;
        if (updates.seo_robots !== undefined) updateData.seo_robots = updates.seo_robots;
        if (updates.faq !== undefined) updateData.faq = updates.faq;
        if (updates.geo_data !== undefined) updateData.geo_data = updates.geo_data;
        
        // Diğer alanlar
        if (updates.track_stock !== undefined) updateData.track_stock = updates.track_stock;
        if (updates.low_stock_threshold !== undefined) updateData.low_stock_threshold = updates.low_stock_threshold;
        if (updates.nutrition_basis !== undefined) updateData.nutrition_basis = updates.nutrition_basis;
        if (updates.serving_size !== undefined) updateData.serving_size = updates.serving_size;
        if (updates.serving_per_container !== undefined) updateData.serving_per_container = updates.serving_per_container;
        if (updates.allergens !== undefined) updateData.allergens = updates.allergens;
        if (updates.vitamins !== undefined) updateData.vitamins = updates.vitamins;
        if (updates.ingredients !== undefined) updateData.ingredients = updates.ingredients;
        if (updates.storage_conditions !== undefined) updateData.storage_conditions = updates.storage_conditions;
        if (updates.shelf_life_days !== undefined) updateData.shelf_life_days = updates.shelf_life_days;
        if (updates.calories !== undefined) updateData.calories = updates.calories;
        if (updates.protein !== undefined) updateData.protein = updates.protein;
        if (updates.carbs !== undefined) updateData.carbs = updates.carbs;
        if (updates.fat !== undefined) updateData.fat = updates.fat;
        if (updates.fiber !== undefined) updateData.fiber = updates.fiber;
        if (updates.sugar !== undefined) updateData.sugar = updates.sugar;
        if (updates.saturated_fat !== undefined) updateData.saturated_fat = updates.saturated_fat;
        if (updates.sodium !== undefined) updateData.sodium = updates.sodium;

        console.log("Update data:", updateData);

        // Ana ürünü güncelle
        if (Object.keys(updateData).length > 0) {
            const { error: productError } = await supabase
                .from("products")
                .update(updateData)
                .eq("id", id);

            if (productError) {
                console.error("Product update error:", productError);
                throw new Error(`Product update failed: ${productError.message}`);
            }
        }

        // 6. Varyantları güncelle
        if (variants && Array.isArray(variants)) {
            console.log("Updating variants, count:", variants.length);

            // VALIDATION: En az bir varyant zorunlu
            if (variants.length === 0) {
                return NextResponse.json(
                    { success: false, error: "En az bir varyant zorunludur" },
                    { status: 400 }
                );
            }

            // VALIDATION: Her varyantın zorunlu alanlarını kontrol et
            for (const v of variants) {
                if (!v.name || !v.name.trim()) {
                    return NextResponse.json(
                        { success: false, error: "Tüm varyantların ismi olmalıdır" },
                        { status: 400 }
                    );
                }
                if (v.price === undefined || v.price === null || v.price < 0) {
                    return NextResponse.json(
                        { success: false, error: "Tüm varyantların geçerli bir fiyatı olmalıdır" },
                        { status: 400 }
                    );
                }
                if (v.stock === undefined || v.stock === null || v.stock < 0) {
                    return NextResponse.json(
                        { success: false, error: "Tüm varyantların geçerli bir stok değeri olmalıdır" },
                        { status: 400 }
                    );
                }
            }

            const { data: existingVariants } = await supabase
                .from("product_variants")
                .select("id, product_id")
                .eq("product_id", id);

            const { data: variantsWithOrders } = await supabase
                .from("order_items")
                .select("variant_id")
                .in("variant_id", existingVariants?.map(v => v.id) || [])
                .neq("variant_id", null);

            const orderedVariantIds = new Set(variantsWithOrders?.map(v => v.variant_id) || []);

            // MEVCUT VARYANTLARLA KARŞILAŞTIR
            // Sadece gelen listede OLMAYAN mevcut varyantları sil
            // Frontend'den gelen 'variant-' ile başlayan ID'ler yeni varyantlardır
            const incomingVariantIds = new Set(
                variants
                    .filter((v: Record<string, unknown>) => v.id && !String(v.id).startsWith("variant-")) // Sadece gerçek UUID'ler (yeni varyantlar hariç)
                    .map((v: Record<string, unknown>) => String(v.id))
            );

            const variantsToDelete = existingVariants
                ?.filter(v =>
                    !incomingVariantIds.has(v.id) && // Gelen listede yok
                    !orderedVariantIds.has(v.id)    // Siparişi de yok
                )
                .map(v => v.id) || [];

            console.log("Variants to delete:", variantsToDelete);

            if (variantsToDelete.length > 0) {
                const { error: deleteError } = await supabase
                    .from("product_variants")
                    .delete()
                    .in("id", variantsToDelete);

                if (deleteError) {
                    console.error("Variants delete error:", deleteError);
                    throw new Error(`Variants delete failed: ${deleteError.message}`);
                }
                console.log("Deleted variants:", variantsToDelete.length);
            }

            const newVariants = variants.filter((v: Record<string, unknown>) => !v.id || String(v.id).startsWith("variant-"));
            const existingVariantsToUpdate = variants.filter((v: Record<string, unknown>) => v.id && !String(v.id).startsWith("variant-") && !orderedVariantIds.has(String(v.id)));

            for (const v of existingVariantsToUpdate) {
                const { error: updateError } = await supabase
                    .from("product_variants")
                    .update({
                        name: v.name,
                        weight: String(v.weight || 0),
                        price: v.price || 0,
                        original_price: v.original_price || null,
                        cost: v.cost || null,
                        stock: v.stock || 0,
                        sku: v.sku || `EZM-${Date.now().toString(36)}`,
                        barcode: v.barcode || null,
                        group_name: v.group_name || null,
                        unit: v.unit || 'adet',
                        max_purchase_quantity: v.max_purchase_quantity || null,
                        warehouse_location: v.warehouse_location || null,
                        images: v.images || [],
                    })
                    .eq("id", v.id);

                if (updateError) {
                    console.error("Variant update error:", updateError);
                }
            }

            if (newVariants.length > 0) {
                const variantsToInsert = newVariants.map((v: Record<string, unknown>, idx: number) => ({
                    product_id: id,
                    name: v.name,
                    weight: String(v.weight || 0),
                    price: v.price || 0,
                    original_price: v.original_price || null,
                    cost: v.cost || null,
                    stock: v.stock || 0,
                    sku: v.sku || `EZM-${Date.now().toString(36)}-${idx}`,
                    barcode: v.barcode || null,
                    group_name: v.group_name || null,
                    unit: v.unit || 'adet',
                    max_purchase_quantity: v.max_purchase_quantity || null,
                    warehouse_location: v.warehouse_location || null,
                    images: v.images || [],
                }));

                console.log("Inserting variants:", variantsToInsert);

                const { error: variantsError } = await supabase
                    .from("product_variants")
                    .insert(variantsToInsert);

                if (variantsError) {
                    console.error("Variants insert error:", variantsError);
                    throw new Error(`Variants insert failed: ${variantsError.message}`);
                }
            }
        }

        // 7. İndirim kurallarını güncelle
        if (discount_rules && Array.isArray(discount_rules)) {
            console.log("Updating discount rules, count:", discount_rules.length);
            
            // Mevcut indirim kurallarını sil
            const { error: deleteDiscountError } = await supabase
                .from("product_discount_rules")
                .delete()
                .eq("product_id", id);

            if (deleteDiscountError) {
                console.error("Delete discount rules error:", deleteDiscountError);
            }

            // Yeni indirim kurallarını ekle
            if (discount_rules.length > 0) {
                const discountRulesToInsert = discount_rules.map((rule: Record<string, unknown>) => ({
                    product_id: id,
                    name: rule.name,
                    type: rule.type,
                    config: rule.config || {},
                    is_active: rule.isActive !== false,
                    priority: 0,
                }));

                const { error: discountError } = await supabase
                    .from("product_discount_rules")
                    .insert(discountRulesToInsert);

                if (discountError) {
                    console.error("Discount rules insert error:", discountError);
                } else {
                    console.log("Discount rules updated successfully");
                }
            }
        }

        // 8. Güncellenmiş ürünü variant'larla birlikte döndür
        const { data: fullProduct, error: fetchError } = await supabase
            .from("products")
            .select("*, variants:product_variants(*)")
            .eq("id", id)
            .single();

        if (fetchError) {
            console.error("Fetch updated product error:", fetchError);
        }

        if (normalizedUpdatedTags !== undefined) {
            try {
                const previousTags = validateAndNormalizeProductTags(existingProduct?.tags || []);
                const tagDiff = diffProductTags(previousTags, normalizedUpdatedTags);
                await syncProductTagSuggestions(supabase, tagDiff);
            } catch (error) {
                logTagSuggestionSyncError(error, "update");
            }
        }

        try {
            await enqueueProductListingSync(id);
        } catch (error) {
            logMarketplaceQueueError(error, "update");
        }

        return NextResponse.json({ success: true, product: fullProduct });
    } catch (error) {
        console.error("Error updating product:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Failed to update product" },
            { status: 500 }
        );
    }
}

// DELETE /api/products - Delete a product
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json(
                { success: false, error: "Product ID is required" },
                { status: 400 }
            );
        }

        const { createServerClient } = await import("@/lib/supabase");
        const supabase = createServerClient();
        const { data: existingProduct } = await supabase
            .from("products")
            .select("tags")
            .eq("id", id)
            .single();

        await deleteProduct(id);

        try {
            const removedTags = validateAndNormalizeProductTags(existingProduct?.tags || []);
            if (removedTags.length > 0) {
                await syncProductTagSuggestions(supabase, { removed: removedTags });
            }
        } catch (error) {
            logTagSuggestionSyncError(error, "delete");
        }

        return NextResponse.json({ success: true, message: "Product deleted" });
    } catch (error) {
        console.error("Error deleting product:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Failed to delete product" },
            { status: 500 }
        );
    }
}
