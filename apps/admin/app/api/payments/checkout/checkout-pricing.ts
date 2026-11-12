import { resolveVariantDisplayPricing, type ProductDiscountRule } from "@celebix/platform-config/src/product-pricing";
import { getShippingRatePrice, getShippingRatesForLocation, type ShippingZone } from "@celebix/platform-config/src/shipping";
import { calculatePrice } from "../../../../lib/customization/price-calculator";
import { evaluateConditions } from "../../../../lib/customization/conditional-logic";
import type { Coupon } from "../../../../lib/supabase";
import type { CartCustomizationPayload, CustomizationSchema, CustomizationStep, SelectionValue } from "../../../../types/product-customization";

type CheckoutProduct = { id: string; name: string; category?: string | null; is_active?: boolean | null };
type CheckoutVariant = { id: string; product_id: string; name: string; price: number; original_price?: number | null; is_active?: boolean | null };
type CheckoutAddress = Record<string, unknown> & { country?: string; city?: string };
export type CheckoutSchema = CustomizationSchema & { steps: CustomizationStep[] };

export type CheckoutPricingData = {
    products: CheckoutProduct[];
    variants: CheckoutVariant[];
    rules: Record<string, ProductDiscountRule[]>;
    schemas: ReadonlyMap<string, CheckoutSchema>;
    shippingZones: ShippingZone[];
    coupon: Coupon | null;
    applyCoupon(coupon: Coupon, subtotal: number): number;
};

export class CheckoutInputError extends Error {}

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
const INVALID_ITEM = "Sepetinizdeki bir ürün veya seçeneği artık siparişe uygun değil.";
const INVALID_CUSTOMIZATION = "Ürün kişiselleştirmesi güncellendi. Sepetinizi kontrol edin.";
const INVALID_SHIPPING = "Teslimat adresi için geçerli bir kargo yöntemi seçin.";

function record(input: unknown): Record<string, unknown> | null {
    return input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : null;
}

function shortText(input: unknown, limit: number): string | undefined {
    if (input == null || input === "") return undefined;
    if (typeof input !== "string" || input.length > limit) throw new CheckoutInputError("Sipariş bilgilerini kontrol edin.");
    return input.trim() || undefined;
}

function address(input: unknown): CheckoutAddress {
    const row = record(input);
    if (!row) throw new CheckoutInputError("Teslimat ve fatura adresini kontrol edin.");
    const output: CheckoutAddress = {};
    for (const [key, value] of Object.entries(row)) {
        if (/^[a-z][a-z0-9_]{0,63}$/iu.test(key) && !Object.hasOwn(Object.prototype, key)) {
            const text = shortText(value, 1000);
            if (text !== undefined) Object.defineProperty(output, key, { value: text, enumerable: true });
        }
    }
    return output;
}

export function parseCheckoutInput(body: unknown) {
    const row = record(body);
    const paymentMethod = shortText(row?.paymentMethod, 128);
    if (!paymentMethod) throw new CheckoutInputError("Ödeme yöntemi seçilmelidir.");
    if (!Array.isArray(row?.items) || row.items.length === 0 || row.items.length > 100) throw new CheckoutInputError(INVALID_ITEM);
    const items = row.items.map((entry: unknown) => {
        const item = record(entry);
        if (!item || typeof item.productId !== "string" || !UUID.test(item.productId) ||
            typeof item.variantId !== "string" || !UUID.test(item.variantId) ||
            typeof item.quantity !== "number" || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 10000) {
            throw new CheckoutInputError(INVALID_ITEM);
        }
        return { productId: item.productId.toLowerCase(), variantId: item.variantId.toLowerCase(), quantity: item.quantity, customization: item.customization };
    });
    const contactEmail = shortText(row.contactEmail, 254);
    if (!contactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(contactEmail)) throw new CheckoutInputError("Geçerli bir e-posta adresi girin.");
    const shippingAddress = address(row.shippingAddress);
    const shippingMethod = record(row.shippingMethod);
    return {
        items,
        paymentMethod,
        shippingAddress,
        billingAddress: row.billingAddress == null ? shippingAddress : address(row.billingAddress),
        shippingRateId: shortText(shippingMethod?.id, 128),
        couponCode: shortText(row.couponCode, 128)?.toUpperCase(),
        contactEmail,
        notes: shortText(row.notes, 2000),
        abandonedCartSessionId: shortText(row.abandonedCartSessionId, 256),
    };
}

function invalidCustomization(): never {
    throw new CheckoutInputError(INVALID_CUSTOMIZATION);
}

function validateStepValue(step: CustomizationStep, value: unknown, values: Record<string, unknown>): SelectionValue["value"] {
    const rules = step.validation_rules ?? {};
    switch (step.type) {
        case "select":
        case "radio_group":
        case "image_select":
        case "multi_select": {
            const isMultiple = step.type === "multi_select";
            const selected = isMultiple ? value : [value];
            if (!Array.isArray(selected) || selected.length === 0 || new Set(selected).size !== selected.length ||
                selected.length < (rules.min_selections ?? 0) || selected.length > (rules.max_selections ?? 100) ||
                selected.some((entry) => typeof entry !== "string" || !step.options?.some((option) =>
                    option.value === entry && !option.is_disabled && evaluateConditions(option.show_conditions, values)))) invalidCustomization();
            return isMultiple ? selected : selected[0];
        }
        case "text":
        case "textarea":
            if (typeof value !== "string" || value.length === 0 || value.length > Math.min(rules.max_length ?? 10000, 10000) ||
                value.length < (rules.min_length ?? 0) || (rules.pattern && !new RegExp(rules.pattern, "u").test(value))) invalidCustomization();
            return value;
        case "number":
            if (typeof value !== "number" || !Number.isFinite(value) || value < (rules.min_value ?? -Infinity) || value > (rules.max_value ?? Infinity)) invalidCustomization();
            return value;
        case "checkbox":
            if (value !== true) invalidCustomization();
            return value;
        case "date":
            if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value) || !Number.isFinite(Date.parse(value)) ||
                (rules.min_date && value < rules.min_date) || (rules.max_date && value > rules.max_date)) invalidCustomization();
            return value;
        case "color_picker":
            if (typeof value !== "string" || !/^#[0-9a-f]{6}$/iu.test(value)) invalidCustomization();
            return value;
        default:
            return invalidCustomization();
    }
}

function resolveCustomization(input: unknown, schema: CheckoutSchema | undefined, basePrice: number): CartCustomizationPayload | null {
    if (!schema) {
        if (input != null) invalidCustomization();
        return null;
    }

    const values = Object.create(null) as Record<string, unknown>;
    if (input != null) {
        const request = record(input);
        if (request?.schema_id !== schema.id || !Array.isArray(request.selections) || request.selections.length > schema.steps.length ||
            request.custom_text_content || (Array.isArray(request.uploaded_files) && request.uploaded_files.length > 0)) invalidCustomization();
        for (const candidate of request.selections) {
            const selection = record(candidate);
            if (!selection || typeof selection.step_key !== "string" || Object.hasOwn(values, selection.step_key) ||
                selection.value === false ||
                !schema.steps.some((step) => step.key === selection.step_key && step.id === selection.step_id)) invalidCustomization();
            values[selection.step_key] = selection.value;
        }
    }

    for (const step of schema.steps) {
        if (step.type === "checkbox" && !Object.hasOwn(values, step.key)) values[step.key] = false;
    }
    const visibleSteps = schema.steps.filter((step) => evaluateConditions(step.show_conditions, values));
    if (Object.keys(values).some((key) => values[key] !== false && !visibleSteps.some((step) => step.key === key))) invalidCustomization();

    const selectedSteps = visibleSteps.filter((step) => Object.hasOwn(values, step.key) && values[step.key] !== false);
    if (visibleSteps.some((step) => step.is_required && !selectedSteps.includes(step))) invalidCustomization();
    if (selectedSteps.length === 0) return null;

    const validated = selectedSteps.map((step) => ({ step, value: validateStepValue(step, values[step.key], values) }));
    const priceBreakdown = calculatePrice(basePrice, visibleSteps, values);
    return {
        schema_id: schema.id,
        schema_snapshot: {
            id: schema.id, name: schema.name, slug: schema.slug, description: schema.description,
            is_active: schema.is_active, sort_order: schema.sort_order, settings: schema.settings ?? {},
        },
        price_breakdown: priceBreakdown,
        selections: validated.map(({ step, value }) => ({
            step_id: step.id,
            step_key: step.key,
            step_label: step.label,
            type: step.type,
            value,
            display_value: (Array.isArray(value) ? value : [value])
                .map((entry) => step.options?.find((option) => option.value === entry)?.label ?? String(entry)).join(", "),
            price_adjustment: priceBreakdown.adjustments.find((adjustment) => adjustment.step_key === step.key)?.adjustment_amount ?? 0,
        })),
    };
}

function currencyAmount(value: number): number {
    const cents = Math.round(value * 100);
    if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(cents)) throw new Error("Invalid stored checkout price");
    return cents / 100;
}

export function priceCheckout(input: ReturnType<typeof parseCheckoutInput>, data: CheckoutPricingData) {
    const products = new Map(data.products.map((product) => [product.id, product]));
    const variants = new Map(data.variants.map((variant) => [variant.id, variant]));
    const items = input.items.map((item) => {
        const product = products.get(item.productId);
        const variant = variants.get(item.variantId);
        if (!product || product.is_active !== true || !variant || variant.is_active === false || variant.product_id !== product.id) {
            throw new CheckoutInputError(INVALID_ITEM);
        }
        const basePrice = resolveVariantDisplayPricing({
            price: currencyAmount(variant.price),
            originalPrice: variant.original_price,
        }, data.rules[product.id]).price;
        const customization = resolveCustomization(item.customization, data.schemas.get(product.id), basePrice);
        const price = currencyAmount(customization?.price_breakdown.final_price ?? basePrice);
        return {
            productId: product.id,
            variantId: variant.id,
            productName: product.name,
            variantName: variant.name,
            price,
            quantity: item.quantity,
            total: currencyAmount(price * item.quantity),
            category: product.category ?? undefined,
            customization,
        };
    });

    const subtotal = currencyAmount(items.reduce((total, item) => total + item.total, 0));
    const rates = getShippingRatesForLocation(data.shippingZones, input.shippingAddress)
        .filter((rate) => rate.price !== 0 || rate.minOrder == null || subtotal >= rate.minOrder);
    const rate = input.shippingRateId ? rates.find((option) => option.id === input.shippingRateId) : rates[0];
    if (!rate) throw new CheckoutInputError(INVALID_SHIPPING);
    const shippingCost = currencyAmount(getShippingRatePrice(rate, subtotal));
    let discount = 0;
    if (input.couponCode) {
        if (!data.coupon || !["percentage", "fixed"].includes(data.coupon.type) || subtotal < data.coupon.min_order) {
            throw new CheckoutInputError("Kupon bu sipariş için geçerli değil.");
        }
        discount = currencyAmount(Math.min(subtotal, data.applyCoupon(data.coupon, subtotal)));
    }
    return { items, shippingCost, discount };
}

export function checkoutPaymentItems(gateway: string, pricing: ReturnType<typeof priceCheckout>) {
    if (!["stripe", "iyzico", "craftgate"].includes(gateway)) return pricing.items;

    // Allocate the coupon in cents, splitting Stripe quantities only when needed.
    let subtotalCents = pricing.items.reduce((total, item) => total + Math.round(item.total * 100), 0);
    let discountCents = Math.round(pricing.discount * 100);
    const items = pricing.items.flatMap((item) => {
        const lineCents = Math.round(item.total * 100);
        const share = subtotalCents === 0 ? 0 : Math.round(discountCents * (lineCents / subtotalCents));
        subtotalCents -= lineCents;
        discountCents -= share;
        const discountedCents = lineCents - share;
        if (discountedCents === 0) return [];
        if (gateway !== "stripe") return [{ ...item, total: discountedCents / 100 }];

        const baseUnitCents = Math.floor(discountedCents / item.quantity);
        const higherQuantity = discountedCents % item.quantity;
        return [
            { unitCents: baseUnitCents, quantity: item.quantity - higherQuantity },
            { unitCents: baseUnitCents + 1, quantity: higherQuantity },
        ].filter(({ unitCents, quantity }) => unitCents > 0 && quantity > 0)
            .map(({ unitCents, quantity }) => ({ ...item, quantity, price: unitCents / 100, total: unitCents * quantity / 100 }));
    });
    if (pricing.shippingCost > 0) {
        items.push({ productId: "shipping", variantId: "shipping", productName: "Kargo", variantName: "Kargo",
            price: pricing.shippingCost, quantity: 1, total: pricing.shippingCost, category: undefined, customization: null });
    }
    return items;
}
