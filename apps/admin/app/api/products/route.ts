import { NextRequest, NextResponse } from "next/server";
import { deriveCategoryHierarchyFromProduct, ensureProductCategoryHierarchy } from "@/lib/category-records";
import { deleteProduct } from "@/lib/db/products";
import { mirrorImportedProductMediaToR2 } from "@/lib/product-media-import";
import {
    normalizeProductCanonicalUrl,
    normalizeProductSEOKeywords,
    normalizeProductSEORobots,
    normalizeProductSEOText,
} from "@/lib/product-seo";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import { resolveAdminAssetUrl } from "@/lib/asset-url";
import { resolveAdminDatabaseMode } from "@/lib/db/admin-database-mode";
import { normalizeVisibleText, normalizeVisibleTextFields, repairMojibakeIfNeeded } from "@/lib/text-encoding";
import { getProductDiscountRulesMap } from "@/lib/product-pricing";
import {
    diffProductTags,
    syncProductTagSuggestions,
    validateAndNormalizeProductTags,
} from "@/lib/product-tags";
import {
    getProductListingOrderPositions,
    getStoreInfo,
} from "@/lib/db/settings";
import { enqueueProductListingSync } from "@/lib/db/marketplace-sync";
import { syncVariantAttributeRegistryFromVariants } from "@/lib/variant-attribute-sync";
import { buildGeneratedSku } from "@/lib/sku";
import { inferLegacySubcategorySlug, withCelebixCategoryHierarchyMetadata } from "@celebix/platform-config";
import { sortProductsByListingOrder } from "@celebix/platform-config/src/product-listing-order";
import {
    extractPlainTextFromProductDescription,
    normalizeProductDescriptionHtml,
} from "@celebix/platform-config/src/product-description-rich-text";
import { resolveVariantDisplayPricing, type ProductDiscountRule } from "@celebix/platform-config/src/product-pricing";

export const runtime = "nodejs";

function toNullableString(value: unknown): string | null {
    if (typeof value !== "string") {
        return null;
    }

    const normalized = normalizeVisibleText(value, { collapseWhitespace: true });
    return normalized ? normalized : null;
}

function toJsonObject(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

function toJsonArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

const PRODUCT_VISIBLE_TEXT_KEYS = [
    "name",
    "short_description",
    "brand",
    "country_of_origin",
    "ingredients",
    "storage_conditions",
    "seo_title",
    "seo_description",
    "seo_focus_keyword",
    "og_image",
];

function normalizeProductInputFields<T extends Record<string, unknown>>(record: T): T {
    const normalized = normalizeVisibleTextFields(record, {
        keys: PRODUCT_VISIBLE_TEXT_KEYS,
        collapseWhitespace: true,
    }) as Record<string, unknown>;

    if (typeof normalized.description === "string") {
        normalized.description = normalizeVisibleText(normalized.description, { trim: false });
    }

    return normalized as T;
}

function normalizeVariantAttributeInput(value: unknown): unknown {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return value;
    }

    const record = value as Record<string, unknown>;
    return normalizeVisibleTextFields(record, {
        keys: ["name", "label", "value"],
        collapseWhitespace: true,
    });
}

function normalizeVariantInputRecords<T>(variants: T[] | undefined): T[] | undefined {
    if (!Array.isArray(variants)) {
        return variants;
    }

    return variants.map((variant) => {
        if (!variant || typeof variant !== "object" || Array.isArray(variant)) {
            return variant;
        }

        const record = normalizeVisibleTextFields(variant as Record<string, unknown>, {
            keys: ["name", "group_name", "unit", "warehouse_location"],
            collapseWhitespace: true,
        });

        if (Array.isArray(record.attributes)) {
            record.attributes = record.attributes.map(normalizeVariantAttributeInput);
        }

        return record as T;
    });
}

function readCategoryPathInput(value: Record<string, unknown>): unknown {
    if ("categoryPath" in value) {
        return value.categoryPath;
    }

    if ("category_path" in value) {
        return value.category_path;
    }

    return undefined;
}

function logTagSuggestionSyncError(error: unknown, context: string) {
    console.error(`Product tag suggestion sync failed (${context}):`, error);
}

function logMarketplaceQueueError(error: unknown, context: string) {
    console.error(`Marketplace queue sync failed (${context}):`, error);
}

function logVariantAttributeSyncError(error: unknown, context: string) {
    console.error(`Variant attribute registry sync failed (${context}):`, error);
}

const OPTIONAL_PRODUCT_COLUMNS = new Set([
    "images_v2",
    "faq",
    "geo_data",
    "subcategory",
    "is_active",
    "is_new",
    "vegan",
    "gluten_free",
    "sugar_free",
    "high_protein",
    "rating",
    "review_count",
    "status",
    "is_draft",
    "published_at",
    "tax_rate",
    "brand",
    "country_of_origin",
    "sku",
    "gtin",
    "dimensions",
    "related_products",
    "complementary_products",
    "seo_keywords",
    "seo_focus_keyword",
    "og_image",
    "canonical_url",
    "seo_robots",
    "track_stock",
    "low_stock_threshold",
    "nutrition_basis",
    "serving_size",
    "serving_per_container",
    "allergens",
    "vitamins",
    "ingredients",
    "storage_conditions",
    "shelf_life_days",
    "calories",
    "protein",
    "carbs",
    "fat",
    "fiber",
    "sugar",
    "saturated_fat",
    "sodium",
    "shopify_metadata",
    "shopify_metafields",
]);

const OPTIONAL_PRODUCT_VARIANT_COLUMNS = new Set([
    "cost",
    "barcode",
    "group_name",
    "unit",
    "max_purchase_quantity",
    "warehouse_location",
    "images",
    "attributes",
    "shopify_metadata",
]);

const LIGHT_POSTGRES_PRODUCT_JSON_COLUMNS = [
    "images_v2",
    "dimensions",
    "faq",
    "geo_data",
    "vitamins",
    "shopify_metadata",
    "shopify_metafields",
] as const;

const LIGHT_POSTGRES_VARIANT_JSON_COLUMNS = [
    "attributes",
    "shopify_metadata",
] as const;

const ALLOWED_TAX_RATES = new Set([0, 1, 8, 10, 20]);

function normalizeTaxRate(value: unknown): number {
    if (typeof value === "number" && ALLOWED_TAX_RATES.has(value)) {
        return value;
    }

    if (typeof value === "string") {
        const parsed = Number.parseInt(value, 10);
        if (ALLOWED_TAX_RATES.has(parsed)) {
            return parsed;
        }
    }

    return 0;
}

function isLightPostgresAdminRuntime() {
    return resolveAdminDatabaseMode() === "light_postgres";
}

function serializeLightPostgresJsonValue(value: unknown): unknown {
    if (value === undefined || value === null || typeof value === "string") {
        return value;
    }

    if (Array.isArray(value) || typeof value === "object") {
        return JSON.stringify(value);
    }

    return value;
}

function prepareLightPostgresMutationPayload<T extends Record<string, unknown>>(
    payload: T,
    jsonColumns: readonly string[],
): T {
    if (!isLightPostgresAdminRuntime()) {
        return payload;
    }

    const nextPayload = { ...payload };
    for (const column of jsonColumns) {
        if (column in nextPayload) {
            nextPayload[column] = serializeLightPostgresJsonValue(nextPayload[column]);
        }
    }

    return nextPayload as T;
}

function prepareProductMutationPayload<T extends Record<string, unknown>>(payload: T): T {
    return prepareLightPostgresMutationPayload(payload, LIGHT_POSTGRES_PRODUCT_JSON_COLUMNS);
}

function prepareVariantMutationPayload<T extends Record<string, unknown>>(payload: T): T {
    return prepareLightPostgresMutationPayload(payload, LIGHT_POSTGRES_VARIANT_JSON_COLUMNS);
}

async function deleteProductVariantsById(supabase: any, variantIds: string[]) {
    for (const variantId of variantIds) {
        const { error } = await supabase
            .from("product_variants")
            .delete()
            .eq("id", variantId);

        if (error) {
            throw error;
        }
    }
}

function getMissingTableColumn(error: unknown, tableName: string): string | null {
    if (!error || typeof error !== "object" || !("message" in error)) return null;
    const message = String(error.message ?? "");
    const schemaCacheMatch = message.match(new RegExp(`Could not find the '([^']+)' column of '${tableName}'`, "i"));
    if (schemaCacheMatch?.[1]) {
        return schemaCacheMatch[1];
    }

    const relationMatch = message.match(new RegExp(`column [\"']([^\"']+)[\"'] of relation [\"']${tableName}[\"'] does not exist`, "i"));
    return relationMatch?.[1] ?? null;
}

function stripUnsupportedTableColumn<T extends Record<string, unknown>>(
    payload: T,
    error: unknown,
    tableName: string,
    allowedColumns: Set<string>
): T | null {
    const missingColumn = getMissingTableColumn(error, tableName);
    if (!missingColumn || !allowedColumns.has(missingColumn) || !(missingColumn in payload)) {
        return null;
    }

    const nextPayload = { ...payload };
    delete nextPayload[missingColumn];
    return nextPayload;
}

function normalizeAssetUrl(value: unknown): string | null {
    if (typeof value !== "string") {
        return null;
    }

    const normalized = resolveAdminAssetUrl(value);
    return normalized || value;
}

function normalizeImageArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((item) => normalizeAssetUrl(item))
        .filter((item): item is string => Boolean(item));
}

function normalizeImagesV2(value: unknown): unknown[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.map((item) => {
        if (!item || typeof item !== "object") {
            return item;
        }

        const record = item as Record<string, unknown>;
        return {
            ...record,
            url: normalizeAssetUrl(record.url) || record.url,
            alt: normalizeVisibleText(record.alt, { collapseWhitespace: true }),
        };
    });
}

function normalizeVariantAttributes(value: unknown): unknown[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.map((item) => {
        if (!item || typeof item !== "object") {
            return item;
        }

        const record = normalizeVisibleTextFields(item as Record<string, unknown>, {
            keys: ["name", "label", "value"],
            collapseWhitespace: true,
        });
        return {
            ...record,
            image_url: normalizeAssetUrl(record.image_url),
        };
    });
}

function normalizeVariantRecord(value: unknown, rules: ProductDiscountRule[] = []) {
    if (!value || typeof value !== "object") {
        return value;
    }

    const record = value as Record<string, unknown>;
    const pricing = resolveVariantDisplayPricing(
        {
            price: Number(record.price || 0),
            originalPrice: record.original_price ? Number(record.original_price) : undefined,
        },
        rules,
    );
    return {
        ...record,
        price: pricing.price,
        original_price: pricing.originalPrice ?? null,
        images: normalizeImageArray(record.images),
        attributes: normalizeVariantAttributes(record.attributes),
    };
}

function normalizeStoredProductDescription(value: unknown): string | null {
    const normalized = normalizeProductDescriptionHtml(
        repairMojibakeIfNeeded(typeof value === "string" ? value : ""),
    );
    return normalized || null;
}

function hasVisibleProductDescription(value: unknown): boolean {
    return extractPlainTextFromProductDescription(typeof value === "string" ? value : "").trim().length > 0;
}

function normalizeProductRecord(
    value: unknown,
    rulesMap: Record<string, ProductDiscountRule[]> = {},
) {
    if (!value || typeof value !== "object") {
        return value;
    }

    const record = value as Record<string, unknown>;
    const productRules =
        typeof record.id === "string"
            ? rulesMap[record.id] || []
            : [];
    return {
        ...record,
        images: normalizeImageArray(record.images),
        images_v2: normalizeImagesV2(record.images_v2),
        og_image: normalizeAssetUrl(record.og_image),
        discount_rules: productRules,
        variants: Array.isArray(record.variants)
            ? record.variants.map((variant) => normalizeVariantRecord(variant, productRules))
            : record.variants,
    };
}

function normalizeProductsPayload(
    value: unknown,
    rulesMap: Record<string, ProductDiscountRule[]> = {},
) {
    if (Array.isArray(value)) {
        return value.map((item) => normalizeProductRecord(item, rulesMap));
    }

    return normalizeProductRecord(value, rulesMap);
}

const SEARCH_RESULT_SCAN_LIMIT = 2000;

function dedupeStringList(values: Array<string | null | undefined>) {
    return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function buildListingPagination(page: number, limit: number, total: number) {
    return {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
    };
}

function paginateOrderedProducts<T>(products: T[], page: number, limit: number) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.max(1, limit);
    const offset = (safePage - 1) * safeLimit;
    return products.slice(offset, offset + safeLimit);
}

function attachListingPositions<T extends Record<string, unknown> & { id: string }>(
    products: T[],
    positions: Record<string, number>,
): Array<T & { sort_order: number }> {
    return products.map((product, index) => ({
        ...product,
        sort_order:
            typeof positions[product.id] === "number"
                ? positions[product.id]
                : (index + 1) * 10,
    }));
}

async function fetchProductsForListing(
    supabase: any,
    options: {
        category?: string | null;
        matchedProductIds?: string[] | null;
        featured?: boolean;
        bestseller?: boolean;
    },
) {
    let query = supabase
        .from("products")
        .select("*, variants:product_variants(*)")
        .order("created_at", { ascending: false });

    if (options.category) {
        query = query.eq("category", options.category);
    }

    if (options.matchedProductIds) {
        query = query.in("id", options.matchedProductIds);
    }

    if (options.featured) {
        query = query.eq("is_featured", true);
    }

    if (options.bestseller) {
        query = query.eq("is_bestseller", true);
    }

    return query;
}

async function findMatchingProductIdsForSearch(supabase: any, rawSearch: string) {
    const trimmedSearch = rawSearch.trim();

    if (!trimmedSearch) {
        return [];
    }

    const ilikePattern = `%${trimmedSearch}%`;
    const [
        productsByName,
        productsByDescription,
        productsBySku,
        variantsBySku,
        variantsByBarcode,
    ] = await Promise.all([
        supabase.from("products").select("id").ilike("name", ilikePattern).limit(SEARCH_RESULT_SCAN_LIMIT),
        supabase.from("products").select("id").ilike("description", ilikePattern).limit(SEARCH_RESULT_SCAN_LIMIT),
        supabase.from("products").select("id").ilike("sku", ilikePattern).limit(SEARCH_RESULT_SCAN_LIMIT),
        supabase.from("product_variants").select("product_id").ilike("sku", ilikePattern).limit(SEARCH_RESULT_SCAN_LIMIT),
        supabase.from("product_variants").select("product_id").ilike("barcode", ilikePattern).limit(SEARCH_RESULT_SCAN_LIMIT),
    ]);

    const searchError =
        productsByName.error ||
        productsByDescription.error ||
        productsBySku.error ||
        variantsBySku.error ||
        variantsByBarcode.error;

    if (searchError) {
        throw searchError;
    }

    return dedupeStringList([
        ...(productsByName.data || []).map((product: { id?: string | null }) => product.id),
        ...(productsByDescription.data || []).map((product: { id?: string | null }) => product.id),
        ...(productsBySku.data || []).map((product: { id?: string | null }) => product.id),
        ...(variantsBySku.data || []).map((variant: { product_id?: string | null }) => variant.product_id),
        ...(variantsByBarcode.data || []).map((variant: { product_id?: string | null }) => variant.product_id),
    ]);
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
        const fetchAll = searchParams.get("all") === "true";
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "20");
        const { createServerClient } = await import("@/lib/supabase");
        const supabase = createServerClient();
        const productListingOrder = await getProductListingOrderPositions();

        let products;

        if (id) {
            // Fetch single product by ID from Supabase
            const { data, error } = await supabase
                .from("products")
                .select("*, variants:product_variants(*)")
                .eq("id", id)
                .single();
            if (error) throw error;
            return NextResponse.json({
                success: true,
                product: normalizeProductsPayload(
                    data,
                    await getProductDiscountRulesMap(supabase, [id]),
                ),
            });
        } else if (slug) {
            // Fetch single product by slug from Supabase
            const { data, error } = await supabase
                .from("products")
                .select("*, variants:product_variants(*)")
                .eq("slug", slug)
                .order("updated_at", { ascending: false })
                .order("created_at", { ascending: false })
                .limit(1);
            if (error || !data?.[0]) {
                return NextResponse.json({ 
                    success: false, 
                    error: error?.message || "Product not found"
                }, { status: 404 });
            }
            return NextResponse.json({
                success: true,
                product: normalizeProductsPayload(
                    data[0],
                    await getProductDiscountRulesMap(supabase, [String(data[0].id)]),
                ),
            });
        } else if (featured === "true") {
            const { data, error } = await fetchProductsForListing(supabase, {
                featured: true,
            });
            if (error) throw error;
            products = attachListingPositions(sortProductsByListingOrder((data || []) as Array<Record<string, unknown> & {
                id: string;
                created_at?: string | null;
                name?: string | null;
            }>, productListingOrder).slice(0, 10), productListingOrder);
        } else if (bestseller === "true") {
            const { data, error } = await fetchProductsForListing(supabase, {
                bestseller: true,
            });
            if (error) throw error;
            products = attachListingPositions(sortProductsByListingOrder((data || []) as Array<Record<string, unknown> & {
                id: string;
                created_at?: string | null;
                name?: string | null;
            }>, productListingOrder).slice(0, 10), productListingOrder);
        } else {
            // Fetch all products from Supabase with pagination
            const trimmedSearch = search?.trim() || "";

            if (category || trimmedSearch) {
                const matchedProductIds = trimmedSearch
                    ? await findMatchingProductIdsForSearch(supabase, trimmedSearch)
                    : null;

                if (trimmedSearch && matchedProductIds && matchedProductIds.length === 0) {
                    return NextResponse.json({
                        success: true,
                        products: [],
                        pagination: {
                            page,
                            limit,
                            total: 0,
                            totalPages: 0,
                        },
                    });
                }

                const { data, error } = await fetchProductsForListing(supabase, {
                    category,
                    matchedProductIds,
                });
                if (error) throw error;
                const orderedProducts = sortProductsByListingOrder((data || []) as Array<Record<string, unknown> & {
                    id: string;
                    created_at?: string | null;
                    name?: string | null;
                }>, productListingOrder);
                const listedProducts = fetchAll
                    ? orderedProducts
                    : paginateOrderedProducts(orderedProducts, page, limit);
                const effectiveLimit = fetchAll ? Math.max(orderedProducts.length, 1) : limit;
                const effectivePage = fetchAll ? 1 : page;

                return NextResponse.json({
                    success: true,
                    products: normalizeProductsPayload(
                        attachListingPositions(listedProducts, productListingOrder),
                        await getProductDiscountRulesMap(
                            supabase,
                            listedProducts.map((product) => String(product.id)),
                        ),
                    ),
                    pagination: buildListingPagination(effectivePage, effectiveLimit, orderedProducts.length),
                });
            }

            const { data, error } = await fetchProductsForListing(supabase, {});
            if (error) throw error;
            const orderedProducts = sortProductsByListingOrder((data || []) as Array<Record<string, unknown> & {
                id: string;
                created_at?: string | null;
                name?: string | null;
            }>, productListingOrder);
            const listedProducts = fetchAll
                ? orderedProducts
                : paginateOrderedProducts(orderedProducts, page, limit);
            const effectiveLimit = fetchAll ? Math.max(orderedProducts.length, 1) : limit;
            const effectivePage = fetchAll ? 1 : page;

            return NextResponse.json({
                success: true,
                products: normalizeProductsPayload(
                    attachListingPositions(listedProducts, productListingOrder),
                    await getProductDiscountRulesMap(
                        supabase,
                        listedProducts.map((product) => String(product.id)),
                    ),
                ),
                pagination: buildListingPagination(effectivePage, effectiveLimit, orderedProducts.length),
            });
        }

        return NextResponse.json({
            success: true,
            products: normalizeProductsPayload(
                products,
                await getProductDiscountRulesMap(
                    supabase,
                    Array.isArray(products) ? products.map((product) => String(product.id)) : [],
                ),
            ),
        });
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
        const { variants, discount_rules, ...rawProductData } = body;
        const productData = normalizeProductInputFields(rawProductData);
        let preparedVariants: any[] = normalizeVariantInputRecords(Array.isArray(variants) ? variants : []) || [];

        console.log('POST /api/products - productData.images:', productData.images);
        console.log('POST /api/products - body images count:', body.images?.length);

        const { createServerClient } = await import("@/lib/supabase");
        const supabase = createServerClient();

        // Validation: Zorunlu alanlar
        const validationErrors: string[] = [];
        const normalizedDescription = normalizeStoredProductDescription(productData.description);
        const normalizedShortDescription = toNullableString(productData.short_description);
        if (!productData.name || productData.name.trim() === '') {
            validationErrors.push("Ürün adı gereklidir");
        }
        if (!productData.slug || productData.slug.trim() === '') {
            validationErrors.push("URL slug gereklidir");
        }
        if (!hasVisibleProductDescription(normalizedDescription)) {
            validationErrors.push("Ürün açıklaması gereklidir");
        }
        if (!normalizedShortDescription) {
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

        // Limit dışı etiketleri importu bloklamadan sessizce atla.
        const normalizedTags = validateAndNormalizeProductTags(productData.tags, { mode: "lenient" });

        // 1. Slug benzersizlik kontrolü
        if (productData.slug) {
            const { data: existingProducts } = await supabase
                .from("products")
                .select("id")
                .eq("slug", productData.slug)
                .limit(1);

            if ((existingProducts?.length ?? 0) > 0) {
                const uniqueSlug = `${productData.slug}-${Date.now().toString(36)}`;
                productData.slug = uniqueSlug;
                console.log("Slug changed to:", uniqueSlug);
            }
        }

        // 2. Görselleri normalize et - images_v2 formatını düzelt (camelCase -> snake_case)
        let normalizedImagesV2 = Array.isArray(productData.images_v2) ? productData.images_v2 : [];
        if (normalizedImagesV2.length > 0) {
            normalizedImagesV2 = normalizedImagesV2.map((img: Record<string, unknown>, idx: number) => ({
                url: img.url,
                alt: normalizeVisibleText(img.alt, { collapseWhitespace: true }),
                is_primary: img.isPrimary !== undefined ? img.isPrimary : (idx === 0),
                sort_order: img.sortOrder !== undefined ? img.sortOrder : idx,
            }));
        }

        // images array'ini de güncelle (geriye uyumluluk için)
        let normalizedImages = Array.isArray(productData.images)
            ? productData.images
            : normalizedImagesV2.map((img: Record<string, unknown>) => img.url);

        const mirroredMedia = await mirrorImportedProductMediaToR2({
            slug: typeof productData.slug === "string" ? productData.slug : undefined,
            productName: typeof productData.name === "string" ? productData.name : undefined,
            imageUrls: normalizedImages,
            imagesV2: normalizedImagesV2,
            variants: preparedVariants,
        });

        normalizedImages = mirroredMedia.imageUrls ?? normalizedImages;
        normalizedImagesV2 = mirroredMedia.imagesV2 ?? normalizedImagesV2;
        preparedVariants = normalizeVariantInputRecords(mirroredMedia.variants ?? preparedVariants) || [];

        const primaryCategoryImage =
            normalizedImages.find((image: unknown): image is string => typeof image === "string" && Boolean(image.trim())) || null;
        const categoryPathInput = readCategoryPathInput(productData);
        const resolvedSubcategory = inferLegacySubcategorySlug({
            category: productData.category,
            subcategory: productData.subcategory,
            name: productData.name,
            slug: productData.slug,
            tags: normalizedTags,
            metadata: productData.shopify_metadata,
        });
        const normalizedShopifyMetadata = withCelebixCategoryHierarchyMetadata(productData.shopify_metadata, {
            category: productData.category,
            subcategory: resolvedSubcategory,
            categoryPath: categoryPathInput,
            name: productData.name,
            slug: productData.slug,
            tags: normalizedTags,
        });

        await ensureProductCategoryHierarchy(
            supabase,
            {
                ...deriveCategoryHierarchyFromProduct({
                    category: productData.category,
                    subcategory: resolvedSubcategory,
                    shopifyMetadata: normalizedShopifyMetadata,
                    shopifyMetafields: toJsonObject(productData.shopify_metafields),
                }),
                categoryImageUrl: primaryCategoryImage,
                subcategoryImageUrl: primaryCategoryImage,
            }
        );

        const normalizedSeoTitle = normalizeProductSEOText(productData.seo_title);
        const normalizedSeoDescription = normalizeProductSEOText(productData.seo_description);
        const normalizedSeoKeywords = normalizeProductSEOKeywords(productData.seo_keywords);
        const normalizedSeoFocusKeyword = normalizeProductSEOText(productData.seo_focus_keyword);
        const normalizedCanonicalUrl = normalizeProductCanonicalUrl(productData.canonical_url);
        const canonicalInputProvided =
            productData.canonical_url !== undefined &&
            productData.canonical_url !== null &&
            String(productData.canonical_url).trim().length > 0;
        const normalizedOgImage = normalizeProductSEOText(
            normalizeAssetUrl(productData.og_image) ??
                (typeof productData.og_image === "string"
                    ? productData.og_image
                    : normalizedImages[0]),
        );
        const normalizedSeoRobots = normalizeProductSEORobots(
            productData.seo_robots,
            productData.is_active !== false,
        );

        if (canonicalInputProvided && !normalizedCanonicalUrl) {
            return NextResponse.json(
                { success: false, error: "Canonical URL gecersiz" },
                { status: 400 }
            );
        }

        // 3. Ana ürünü oluştur
        const normalizedStatus =
            typeof productData.status === "string" && productData.status.trim()
                ? productData.status
                : "published";
        const normalizedIsDraft =
            productData.is_draft === true || normalizedStatus !== "published";
        const normalizedPublishedAt =
            productData.published_at ??
            (normalizedStatus === "published" && normalizedIsDraft !== true
                ? new Date().toISOString()
                : null);
        const storeInfo = await getStoreInfo().catch(() => null);
        const defaultProductBrand =
            toNullableString(productData.brand) ??
            toNullableString(storeInfo?.name) ??
            STORE_RUNTIME.defaultProductBrand;

        let productInsertPayload: Record<string, unknown> = prepareProductMutationPayload({
                name: productData.name,
                slug: productData.slug,
                description: normalizedDescription,
                short_description: normalizedShortDescription,
                images: normalizedImages,
                images_v2: normalizedImagesV2,
                category: productData.category || null,
                subcategory: resolvedSubcategory,
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
                status: normalizedStatus,
                is_draft: normalizedIsDraft,
                published_at: normalizedPublishedAt,
                tax_rate: normalizeTaxRate(productData.tax_rate),
                brand: defaultProductBrand,
                country_of_origin: productData.country_of_origin || 'Türkiye',
                sku: productData.sku || null,
                gtin: productData.gtin || null,
                dimensions: productData.dimensions || {},
                related_products: productData.related_products || [],
                complementary_products: productData.complementary_products || [],
                seo_title: normalizedSeoTitle,
                seo_description: normalizedSeoDescription,
                seo_keywords: normalizedSeoKeywords,
                seo_focus_keyword: normalizedSeoFocusKeyword,
                og_image: normalizedOgImage,
                canonical_url: normalizedCanonicalUrl,
                seo_robots: normalizedSeoRobots,
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
                shopify_metadata: normalizedShopifyMetadata,
                shopify_metafields: toJsonObject(productData.shopify_metafields),
        });
        let product: ({ id: string } & Record<string, unknown>) | null = null;

        while (true) {
            const { data: insertedProduct, error: productError } = await supabase
                .from("products")
                .insert(productInsertPayload)
                .select()
                .single();

            if (!productError) {
                product = insertedProduct;
                break;
            }

            console.error("Product insert error:", productError);
            const nextPayload = stripUnsupportedTableColumn(
                productInsertPayload,
                productError,
                "products",
                OPTIONAL_PRODUCT_COLUMNS
            );

            if (!nextPayload) {
                throw productError;
            }

            productInsertPayload = nextPayload;
        }

        if (!product || typeof product.id !== "string") {
            throw new Error("Product insert did not return a valid product ID");
        }

        console.log("Product created with ID:", product.id);
        
        // 4. Varyantları ekle (benzersiz SKU oluştur)
        if (preparedVariants.length > 0) {
            console.log("Processing variants, count:", preparedVariants.length);
            console.log("Variants data:", JSON.stringify(preparedVariants, null, 2));
            
            const variantsToInsert = preparedVariants.map((v: Record<string, unknown>, idx: number) => prepareVariantMutationPayload({
                product_id: product.id,
                name: v.name,
                weight: String(v.weight || 0),
                price: v.price || 0,
                original_price: v.original_price || null,
                cost: v.cost || null,
                stock: v.stock || 0,
                sku: v.sku || buildGeneratedSku({ context: `${product.id}-${String(v.name || idx)}`, index: idx }),
                barcode: v.barcode || null,
                group_name: v.group_name || null,
                unit: v.unit || 'adet',
                max_purchase_quantity: v.max_purchase_quantity || null,
                warehouse_location: v.warehouse_location || null,
                images: v.images || [],
                attributes: toJsonArray(v.attributes),
                shopify_metadata: toJsonObject(v.shopify_metadata),
            }));

            console.log("Inserting variants:", JSON.stringify(variantsToInsert, null, 2));

            let variantsPayload = variantsToInsert;

            while (true) {
                const { error: variantsError } = await supabase
                    .from("product_variants")
                    .insert(variantsPayload);

                if (!variantsError) {
                    break;
                }

                console.error("Variants insert error:", variantsError);

                const nextPayload = variantsPayload
                    .map((variant) =>
                        stripUnsupportedTableColumn(
                            variant as Record<string, unknown>,
                            variantsError,
                            "product_variants",
                            OPTIONAL_PRODUCT_VARIANT_COLUMNS
                        )
                    );

                if (nextPayload.some((variant) => variant === null)) {
                    throw variantsError;
                }

                variantsPayload = nextPayload as typeof variantsToInsert;
            }
            console.log("Variants inserted successfully");

            try {
                await syncVariantAttributeRegistryFromVariants(supabase, preparedVariants);
            } catch (error) {
                logVariantAttributeSyncError(error, "create");
            }
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

        return NextResponse.json({ success: true, product: normalizeProductsPayload(fullProduct) });
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
        const { id, variants, discount_rules, deleted_images, ...rawUpdates } = body;
        const updates = normalizeProductInputFields(rawUpdates);
        let preparedVariants: any[] | undefined = normalizeVariantInputRecords(
            Array.isArray(variants) ? variants : undefined,
        );
        let normalizedUpdatedTags: string[] | undefined;
        const normalizedDescription =
            updates.description !== undefined
                ? normalizeStoredProductDescription(updates.description)
                : undefined;
        const normalizedShortDescription =
            updates.short_description !== undefined
                ? toNullableString(updates.short_description)
                : undefined;

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
            normalizedUpdatedTags = validateAndNormalizeProductTags(updates.tags, { mode: "lenient" });
        }

        // 1. Slug benzersizlik kontrolü (güncelleme sırasında)
        if (updates.slug) {
            const { data: existingProducts } = await supabase
                .from("products")
                .select("id")
                .eq("slug", updates.slug)
                .neq("id", id)
                .limit(1);

            if ((existingProducts?.length ?? 0) > 0) {
                updates.slug = `${updates.slug}-${Date.now().toString(36)}`;
                console.log("Slug changed to:", updates.slug);
            }
        }

        // 2. Mevcut ürünü al (görselleri filtrelemek için)
        const { data: existingProduct } = await supabase
            .from("products")
            .select("images,tags,slug,name,category,subcategory,is_featured,is_active,shopify_metadata,shopify_metafields")
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
                    alt: normalizeVisibleText(img.alt, { collapseWhitespace: true }),
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
        if (normalizedImagesV2 !== undefined || finalImages !== undefined || preparedVariants !== undefined) {
            const mirroredMedia = await mirrorImportedProductMediaToR2({
                slug: typeof updates.slug === "string"
                    ? updates.slug
                    : typeof existingProduct?.slug === "string"
                        ? existingProduct.slug
                        : String(id),
                productName: typeof updates.name === "string"
                    ? updates.name
                    : typeof existingProduct?.name === "string"
                        ? existingProduct.name
                        : String(id),
                imageUrls: finalImages,
                imagesV2: normalizedImagesV2,
                variants: preparedVariants,
            });

            if (mirroredMedia.imageUrls !== undefined) {
                finalImages = mirroredMedia.imageUrls;
            }
            if (mirroredMedia.imagesV2 !== undefined) {
                normalizedImagesV2 = mirroredMedia.imagesV2;
            }
            if (mirroredMedia.variants !== undefined) {
                preparedVariants = normalizeVariantInputRecords(mirroredMedia.variants);
            }
        }

        const primaryCategoryImage =
            (finalImages || existingProduct?.images || []).find(
                (image: unknown): image is string => typeof image === "string" && Boolean(image.trim())
            ) || null;
        const effectiveCategory = updates.category !== undefined ? updates.category : existingProduct?.category;
        const effectiveName = updates.name !== undefined ? updates.name : existingProduct?.name;
        const effectiveSlug = updates.slug !== undefined ? updates.slug : existingProduct?.slug;
        const effectiveTags = normalizedUpdatedTags !== undefined ? normalizedUpdatedTags : existingProduct?.tags;
        const effectiveIsActive =
            updates.is_active !== undefined
                ? Boolean(updates.is_active)
                : existingProduct?.is_active !== false;
        const categoryPathInput = readCategoryPathInput(updates);
        const mergedShopifyMetadata = withCelebixCategoryHierarchyMetadata(
            updates.shopify_metadata !== undefined ? updates.shopify_metadata : existingProduct?.shopify_metadata,
            {
                category: effectiveCategory,
                subcategory: updates.subcategory !== undefined ? updates.subcategory : existingProduct?.subcategory,
                categoryPath: categoryPathInput,
                name: effectiveName,
                slug: effectiveSlug,
                tags: effectiveTags,
            }
        );
        const resolvedSubcategory = inferLegacySubcategorySlug({
            category: effectiveCategory,
            subcategory: updates.subcategory !== undefined ? updates.subcategory : existingProduct?.subcategory,
            name: effectiveName,
            slug: effectiveSlug,
            tags: effectiveTags,
            metadata: mergedShopifyMetadata,
        });

        await ensureProductCategoryHierarchy(
            supabase,
            {
                ...deriveCategoryHierarchyFromProduct({
                    category: effectiveCategory,
                    subcategory: resolvedSubcategory,
                    shopifyMetadata: mergedShopifyMetadata,
                    shopifyMetafields: updates.shopify_metafields !== undefined
                        ? toJsonObject(updates.shopify_metafields)
                        : toJsonObject(existingProduct?.shopify_metafields),
                }),
                categoryImageUrl: primaryCategoryImage,
                subcategoryImageUrl: primaryCategoryImage,
            }
        );

        const normalizedSeoTitle =
            updates.seo_title !== undefined
                ? normalizeProductSEOText(updates.seo_title)
                : undefined;
        const normalizedSeoDescription =
            updates.seo_description !== undefined
                ? normalizeProductSEOText(updates.seo_description)
                : undefined;
        const normalizedSeoKeywords =
            updates.seo_keywords !== undefined
                ? normalizeProductSEOKeywords(updates.seo_keywords)
                : undefined;
        const normalizedSeoFocusKeyword =
            updates.seo_focus_keyword !== undefined
                ? normalizeProductSEOText(updates.seo_focus_keyword)
                : undefined;
        const normalizedCanonicalUrl =
            updates.canonical_url !== undefined
                ? normalizeProductCanonicalUrl(updates.canonical_url)
                : undefined;
        const canonicalInputProvided =
            updates.canonical_url !== undefined &&
            updates.canonical_url !== null &&
            String(updates.canonical_url).trim().length > 0;
        const normalizedSeoRobots =
            updates.seo_robots !== undefined
                ? normalizeProductSEORobots(updates.seo_robots, effectiveIsActive)
                : undefined;
        const normalizedOgImage =
            updates.og_image !== undefined
                ? normalizeProductSEOText(
                    normalizeAssetUrl(updates.og_image) ??
                        (typeof updates.og_image === "string" ? updates.og_image : null),
                )
                : undefined;

        if (canonicalInputProvided && !normalizedCanonicalUrl) {
            return NextResponse.json(
                { success: false, error: "Canonical URL gecersiz" },
                { status: 400 }
            );
        }

        const updateData: Record<string, unknown> = {};
        
        // Sadece undefined olmayan alanları ekle
        if (updates.name !== undefined) updateData.name = updates.name;
        if (updates.slug !== undefined) updateData.slug = updates.slug;
        if (updates.description !== undefined) updateData.description = normalizedDescription;
        if (updates.short_description !== undefined) updateData.short_description = normalizedShortDescription;
        
        // Görseller SADECE explicitly gönderildiyse güncelle
        if (finalImages !== undefined) updateData.images = finalImages;
        if (normalizedImagesV2 !== undefined) updateData.images_v2 = normalizedImagesV2;
        
        if (updates.category !== undefined) updateData.category = updates.category;
        if (updates.subcategory !== undefined || resolvedSubcategory) updateData.subcategory = resolvedSubcategory;
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
        if (updates.tax_rate !== undefined) updateData.tax_rate = normalizeTaxRate(updates.tax_rate);
        if (updates.brand !== undefined) updateData.brand = updates.brand;
        if (updates.country_of_origin !== undefined) updateData.country_of_origin = updates.country_of_origin;
        if (updates.sku !== undefined) updateData.sku = updates.sku;
        if (updates.gtin !== undefined) updateData.gtin = updates.gtin;
        if (updates.dimensions !== undefined) updateData.dimensions = updates.dimensions;
        if (updates.related_products !== undefined) updateData.related_products = updates.related_products;
        if (updates.complementary_products !== undefined) updateData.complementary_products = updates.complementary_products;
        
        // SEO alanları
        if (updates.seo_title !== undefined) updateData.seo_title = normalizedSeoTitle;
        if (updates.seo_description !== undefined) updateData.seo_description = normalizedSeoDescription;
        if (updates.seo_keywords !== undefined) updateData.seo_keywords = normalizedSeoKeywords;
        if (updates.seo_focus_keyword !== undefined) updateData.seo_focus_keyword = normalizedSeoFocusKeyword;
        if (updates.og_image !== undefined) updateData.og_image = normalizedOgImage;
        if (updates.canonical_url !== undefined) updateData.canonical_url = normalizedCanonicalUrl;
        if (updates.seo_robots !== undefined) updateData.seo_robots = normalizedSeoRobots;
        if (updates.faq !== undefined) updateData.faq = updates.faq;
        if (updates.geo_data !== undefined) updateData.geo_data = updates.geo_data;
        if (
            updates.shopify_metadata !== undefined ||
            categoryPathInput !== undefined ||
            updates.category !== undefined ||
            updates.subcategory !== undefined ||
            updates.name !== undefined ||
            updates.slug !== undefined ||
            normalizedUpdatedTags !== undefined
        ) {
            updateData.shopify_metadata = mergedShopifyMetadata;
        }
        if (updates.shopify_metafields !== undefined) updateData.shopify_metafields = toJsonObject(updates.shopify_metafields);
        
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
            let productUpdatePayload = prepareProductMutationPayload(updateData);

            while (true) {
                const { error: productError } = await supabase
                    .from("products")
                    .update(productUpdatePayload)
                    .eq("id", id);

                if (!productError) {
                    break;
                }

                console.error("Product update error:", productError);

                const nextPayload = stripUnsupportedTableColumn(
                    productUpdatePayload,
                    productError,
                    "products",
                    OPTIONAL_PRODUCT_COLUMNS
                );

                if (!nextPayload) {
                    throw new Error(`Product update failed: ${productError.message}`);
                }

                productUpdatePayload = nextPayload;
            }
        }

        // 6. Varyantları güncelle
        if (preparedVariants && Array.isArray(preparedVariants)) {
            console.log("Updating variants, count:", preparedVariants.length);

            // VALIDATION: En az bir varyant zorunlu
            if (preparedVariants.length === 0) {
                return NextResponse.json(
                    { success: false, error: "En az bir varyant zorunludur" },
                    { status: 400 }
                );
            }

            // VALIDATION: Her varyantın zorunlu alanlarını kontrol et
            for (const v of preparedVariants) {
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
                preparedVariants
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
                try {
                    await deleteProductVariantsById(supabase, variantsToDelete);
                } catch (deleteError: any) {
                    console.error("Variants delete error:", deleteError);
                    throw new Error(`Variants delete failed: ${deleteError.message}`);
                }
                console.log("Deleted variants:", variantsToDelete.length);
            }

            const newVariants = preparedVariants.filter((v: Record<string, unknown>) => !v.id || String(v.id).startsWith("variant-"));
            const existingVariantsToUpdate = preparedVariants.filter((v: Record<string, unknown>) => v.id && !String(v.id).startsWith("variant-") && !orderedVariantIds.has(String(v.id)));

            for (const v of existingVariantsToUpdate) {
                let variantUpdatePayload: Record<string, unknown> = prepareVariantMutationPayload({
                    name: v.name,
                    weight: String(v.weight || 0),
                    price: v.price || 0,
                    original_price: v.original_price || null,
                    cost: v.cost || null,
                    stock: v.stock || 0,
                    sku: v.sku || buildGeneratedSku({ context: `${id}-${String(v.id || v.name || "variant")}` }),
                    barcode: v.barcode || null,
                    group_name: v.group_name || null,
                    unit: v.unit || 'adet',
                    max_purchase_quantity: v.max_purchase_quantity || null,
                    warehouse_location: v.warehouse_location || null,
                    images: v.images || [],
                    attributes: toJsonArray(v.attributes),
                    shopify_metadata: toJsonObject(v.shopify_metadata),
                });

                while (true) {
                    const { error: updateError } = await supabase
                        .from("product_variants")
                        .update(variantUpdatePayload)
                        .eq("id", v.id);

                    if (!updateError) {
                        break;
                    }

                    console.error("Variant update error:", updateError);
                    const nextPayload = stripUnsupportedTableColumn(
                        variantUpdatePayload,
                        updateError,
                        "product_variants",
                        OPTIONAL_PRODUCT_VARIANT_COLUMNS
                    );

                    if (!nextPayload) {
                        throw new Error(`Variant update failed: ${updateError.message}`);
                    }

                    variantUpdatePayload = nextPayload;
                }
            }

            if (newVariants.length > 0) {
                const variantsToInsert = newVariants.map((v: Record<string, unknown>, idx: number) => prepareVariantMutationPayload({
                    product_id: id,
                    name: v.name,
                    weight: String(v.weight || 0),
                    price: v.price || 0,
                    original_price: v.original_price || null,
                    cost: v.cost || null,
                    stock: v.stock || 0,
                    sku: v.sku || buildGeneratedSku({ context: `${id}-${String(v.name || idx)}`, index: idx }),
                    barcode: v.barcode || null,
                    group_name: v.group_name || null,
                    unit: v.unit || 'adet',
                    max_purchase_quantity: v.max_purchase_quantity || null,
                    warehouse_location: v.warehouse_location || null,
                    images: v.images || [],
                    attributes: toJsonArray(v.attributes),
                    shopify_metadata: toJsonObject(v.shopify_metadata),
                }));

                console.log("Inserting variants:", variantsToInsert);

                let newVariantsPayload = variantsToInsert;

                while (true) {
                    const { error: variantsError } = await supabase
                        .from("product_variants")
                        .insert(newVariantsPayload);

                    if (!variantsError) {
                        break;
                    }

                    console.error("Variants insert error:", variantsError);

                    const nextPayload = newVariantsPayload
                        .map((variant) =>
                            stripUnsupportedTableColumn(
                                variant as Record<string, unknown>,
                                variantsError,
                                "product_variants",
                                OPTIONAL_PRODUCT_VARIANT_COLUMNS
                            )
                        );

                    if (nextPayload.some((variant) => variant === null)) {
                        throw new Error(`Variants insert failed: ${variantsError.message}`);
                    }

                    newVariantsPayload = nextPayload as typeof variantsToInsert;
                }
            }

            try {
                await syncVariantAttributeRegistryFromVariants(supabase, preparedVariants);
            } catch (error) {
                logVariantAttributeSyncError(error, "update");
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
                const previousTags = validateAndNormalizeProductTags(existingProduct?.tags || [], { mode: "lenient" });
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

        return NextResponse.json({ success: true, product: normalizeProductsPayload(fullProduct) });
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
            const removedTags = validateAndNormalizeProductTags(existingProduct?.tags || [], { mode: "lenient" });
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
