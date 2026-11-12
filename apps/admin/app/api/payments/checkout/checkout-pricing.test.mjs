import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import ts from "typescript";

const typescript = registerHooks({
    resolve(specifier, context, nextResolve) {
        try {
            return nextResolve(specifier, context);
        } catch (error) {
            if (error.code !== "ERR_MODULE_NOT_FOUND" || specifier.endsWith(".ts")) throw error;
            return nextResolve(`${specifier}.ts`, context);
        }
    },
    load(url, context, nextLoad) {
        if (!url.endsWith(".ts")) return nextLoad(url, context);
        const source = ts.transpileModule(readFileSync(new URL(url), "utf8"), {
            compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext },
        }).outputText;
        return { format: "module", shortCircuit: true, source };
    },
});
const { CheckoutInputError, checkoutPaymentItems, parseCheckoutInput, priceCheckout } = await import("./checkout-pricing.ts");
typescript.deregister();

const productId = "10000000-0000-4000-8000-000000000001";
const variantId = "10000000-0000-4000-8000-000000000002";
const product = { id: productId, name: "Test product", category: "Test", is_active: true };
const variant = { id: variantId, product_id: productId, name: "Test variant", price: 100 };
const request = {
    paymentMethod: "gateway", contactEmail: "guest@example.test",
    shippingAddress: { city: "İstanbul", country: "Türkiye", firstName: "Guest" },
    items: [{ productId, variantId, quantity: 2 }],
};
const coupon = { id: "coupon", code: "SAVE10", type: "percentage", value: 10, min_order: 100, max_uses: null, used_count: 0, starts_at: null, expires_at: null, is_active: true };

function data(overrides = {}) {
    return {
        products: [product], variants: [variant], rules: {}, schemas: new Map(), coupon,
        shippingZones: [
            { id: "ist", name: "İstanbul", countries: ["İstanbul"], rates: [
                { id: "standard", name: "Standard", price: 49, minOrder: 200 },
                { id: "express", name: "Express", price: 65 },
                { id: "free", name: "Free", price: 0, minOrder: 300 },
                { id: "disabled", name: "Disabled", price: 0, enabled: false },
            ] },
            { id: "tr", name: "Türkiye", countries: ["Türkiye"], rates: [{ id: "national", name: "National", price: 80 }] },
        ],
        applyCoupon(stored, subtotal) { return subtotal * stored.value / 100; },
        ...overrides,
    };
}

test("checkout uses stored catalog, shipping and coupon amounts for an ordinary order", () => {
    const input = parseCheckoutInput({ ...request, customerId: "ignored", shippingCost: 1, discount: 1, couponCode: "save10",
        items: [{ ...request.items[0], price: 1, total: 1, productName: "Ignored" }] });
    const pricing = priceCheckout(input, data({ rules: { [productId]: [{ type: "percentage", config: { discount_percent: 10 } }] } }));
    assert.equal(input.couponCode, "SAVE10");
    assert.equal(Object.hasOwn(input, "customerId"), false);
    assert.deepEqual(pricing.items[0], { productId, variantId, productName: product.name, variantName: variant.name,
        price: 90, quantity: 2, total: 180, category: product.category, customization: null });
    assert.equal(pricing.shippingCost, 49);
    assert.equal(pricing.discount, 18);
});

test("variant pricing preserves an existing markdown and an eligible shipping threshold", () => {
    const pricing = priceCheckout(parseCheckoutInput(request), data({
        variants: [{ ...variant, original_price: 140 }],
        rules: { [productId]: [{ type: "fixed", config: { discount_amount: 30 } }] },
    }));
    assert.equal(pricing.items[0].price, 100);
    assert.equal(pricing.shippingCost, 0);
});

test("checkout rejects unavailable products, unrelated variants, invalid quantities and unavailable shipping", () => {
    const input = parseCheckoutInput(request);
    assert.throws(() => parseCheckoutInput({ ...request, items: [{ ...request.items[0], quantity: 0.5 }] }), CheckoutInputError);
    assert.throws(() => priceCheckout(input, data({ products: [{ ...product, is_active: false }] })), CheckoutInputError);
    assert.throws(() => priceCheckout(input, data({ variants: [{ ...variant, product_id: variantId }] })), CheckoutInputError);
    for (const id of ["national", "disabled", "free"]) {
        assert.throws(() => priceCheckout(parseCheckoutInput({ ...request, shippingMethod: { id } }), data()), CheckoutInputError);
    }
    assert.throws(() => priceCheckout(parseCheckoutInput({ ...request, couponCode: "SAVE10" }), data({ coupon: null })), CheckoutInputError);
});

test("provider items include shipping and reconcile a coupon to exact cents", () => {
    const input = parseCheckoutInput({ ...request, shippingMethod: { id: "express" }, couponCode: "SAVE10" });
    const pricing = priceCheckout(input, data({ applyCoupon: () => 10.01 }));
    for (const gateway of ["stripe", "iyzico", "craftgate"]) {
        const items = checkoutPaymentItems(gateway, pricing);
        assert.equal(items.at(-1)?.productName, "Kargo");
        const cents = items.reduce((sum, item) => sum + (gateway === "stripe" ? item.quantity * Math.round(item.price * 100) : Math.round(item.total * 100)), 0);
        assert.equal(cents, 25499);
    }
    assert.equal(checkoutPaymentItems("paytr", pricing), pricing.items);
});

test("checkout rebuilds a validated customization with the current schema and option price", () => {
    const schema = {
        id: "schema", slug: "test", name: "Test", is_active: true, sort_order: 0, settings: {},
        steps: [{ id: "finish", schema_id: "schema", key: "finish", label: "Finish", type: "select", is_required: true,
            sort_order: 0, grid_width: "full", style_config: {}, validation_rules: {}, options: [
                { id: "option", step_id: "finish", value: "brushed", label: "Brushed", price_adjustment: 12.5,
                    price_adjustment_type: "fixed", track_stock: false, sort_order: 0, is_default: false, is_disabled: false },
            ] }],
    };
    const catalog = data({ schemas: new Map([[productId, schema]]) });
    const customization = { schema_id: schema.id, schema_snapshot: { name: "Ignored" }, price_breakdown: { final_price: 1 },
        selections: [{ step_id: "finish", step_key: "finish", value: "brushed", price_adjustment: 1, display_value: "Ignored" }] };
    const input = parseCheckoutInput({ ...request, items: [{ ...request.items[0], customization }] });
    const pricing = priceCheckout(input, catalog);
    assert.equal(pricing.items[0].price, 112.5);
    assert.equal(pricing.items[0].customization?.schema_snapshot.name, "Test");
    assert.equal(pricing.items[0].customization?.selections[0].display_value, "Brushed");
    assert.throws(() => priceCheckout(parseCheckoutInput(request), catalog), CheckoutInputError);
});
