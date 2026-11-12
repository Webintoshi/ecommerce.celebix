import { normalizeShippingZones } from "@celebix/platform-config/src/shipping";
import { applyCoupon, getCouponByCode } from "@/lib/db/coupons";
import { getProductDiscountRulesMap } from "@/lib/product-pricing";
import { createServerClient } from "@/lib/supabase";
import { createSessionServerClient } from "@/lib/supabase-server";
import type { CheckoutPricingData, CheckoutSchema, parseCheckoutInput } from "./checkout-pricing";

type Database = ReturnType<typeof createServerClient>;
type CheckoutProduct = CheckoutPricingData["products"][number] & { subcategory?: string | null };

function isMissingTable(error: { code: string } | null) {
    return error?.code === "42P01" || error?.code === "PGRST205";
}

function productCategorySlugs(product: CheckoutProduct) {
    return [product.subcategory, product.category].flatMap((value) => typeof value === "string" && value.trim() ? [value.trim()] : []);
}

async function loadCheckoutSchemas(db: Database, products: CheckoutProduct[]): Promise<Map<string, CheckoutSchema>> {
    const result = new Map<string, CheckoutSchema>();
    if (products.length === 0) return result;

    const directAssignments = await db.from("product_schema_assignments").select("product_id,schema_id,sort_order")
        .in("product_id", products.map((product) => product.id)).order("is_default", { ascending: false }).order("sort_order");
    if (directAssignments.error && !isMissingTable(directAssignments.error)) throw directAssignments.error;

    const slugs = [...new Set(products.flatMap(productCategorySlugs))];
    const categories = slugs.length ? await db.from("categories").select("id,slug").in("slug", slugs) : null;
    if (categories?.error && !isMissingTable(categories.error)) throw categories.error;
    const categoriesBySlug = new Map((categories?.data ?? []).map((category) => [category.slug, category.id]));
    const categoryAssignments = categoriesBySlug.size
        ? await db.from("category_schema_assignments").select("category_id,schema_id").in("category_id", [...categoriesBySlug.values()])
        : null;
    if (categoryAssignments?.error && !isMissingTable(categoryAssignments.error)) throw categoryAssignments.error;

    const assignedSchemaIds = [...new Set([...(directAssignments.data ?? []), ...(categoryAssignments?.data ?? [])].map((row) => row.schema_id))];
    if (assignedSchemaIds.length === 0) return result;
    const { data, error } = await db.from("product_customization_schemas")
        .select("*,steps:product_customization_steps(*,options:product_customization_options(*))")
        .in("id", assignedSchemaIds).eq("is_active", true);
    if (error) throw error;

    const active = new Map((data ?? []).map((row) => {
        const schema = row as CheckoutSchema;
        schema.steps.sort((left, right) => left.sort_order - right.sort_order);
        for (const step of schema.steps) step.options?.sort((left, right) => left.sort_order - right.sort_order);
        return [schema.id, schema];
    }));
    for (const product of products) {
        const direct = (directAssignments.data ?? []).filter((assignment) => assignment.product_id === product.id)
            .map((assignment, index) => ({ ...assignment, order: assignment.sort_order ?? index }))
            .sort((left, right) => left.order - right.order);
        const categoryIds = productCategorySlugs(product).map((slug) => categoriesBySlug.get(slug));
        const fromCategories = categoryIds.flatMap((categoryId) => (categoryAssignments?.data ?? [])
            .filter((assignment) => assignment.category_id === categoryId));
        const assigned = [...direct, ...fromCategories].map((assignment) => active.get(assignment.schema_id)).find(Boolean);
        if (assigned) result.set(product.id, assigned);
    }
    return result;
}

export async function loadCheckoutPricingData(input: ReturnType<typeof parseCheckoutInput>): Promise<CheckoutPricingData> {
    const db = createServerClient();
    const productIds = [...new Set(input.items.map((item) => item.productId))];
    const variantIds = [...new Set(input.items.map((item) => item.variantId))];
    const [products, variants, shipping, rules, coupon] = await Promise.all([
        db.from("products").select("*").in("id", productIds),
        db.from("product_variants").select("*").in("id", variantIds),
        db.from("settings").select("value").eq("key", "shipping_options").maybeSingle(),
        getProductDiscountRulesMap(db, productIds),
        input.couponCode ? getCouponByCode(input.couponCode) : null,
    ]);
    if (products.error) throw products.error;
    if (variants.error) throw variants.error;
    if (shipping.error) throw shipping.error;
    const schemas = await loadCheckoutSchemas(db, products.data ?? []);
    return { products: products.data ?? [], variants: variants.data ?? [], shippingZones: normalizeShippingZones(shipping.data?.value), rules, schemas, coupon, applyCoupon };
}

export async function resolveCheckoutCustomer(contactEmail: string) {
    const session = await createSessionServerClient();
    const { data: { user } } = await session.auth.getUser();
    const db = createServerClient();
    if (user) {
        const customer = await db.from("customers").select("id").eq("user_id", user.id).maybeSingle();
        if (customer.error) throw customer.error;
        if (customer.data) return { customerId: customer.data.id, saveAddress: true };
    }

    const existing = await db.from("customers").select("id").eq("email", contactEmail).maybeSingle();
    if (existing.error) throw existing.error;
    // Guest checkout must not overwrite the contact or addresses of an existing customer.
    return { customerId: existing.data?.id, saveAddress: !existing.data };
}
