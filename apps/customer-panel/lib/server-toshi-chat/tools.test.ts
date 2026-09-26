import assert from "node:assert/strict";
import test from "node:test";
import type { TenantContext } from "@celebix/saas-contracts";
import { createToshiTools } from "./tools.ts";

const STORE = "72000000-0000-4000-8000-000000000012";
const PRODUCT = "72000000-0000-4000-8000-000000000021";
const VARIANT = "72000000-0000-4000-8000-000000000022";
const NOW = new Date("2026-09-26T20:30:00.000Z");
function tenant(role = "store_owner"): TenantContext {
  return { schemaVersion: 1, requestId: PRODUCT, principal: { id: PRODUCT, issuer: "https://id.test", subject: "merchant" }, store: { id: STORE, slug: "store", status: "active" }, membership: { id: VARIANT, role, status: "active" }, entitlements: { schemaVersion: 1, planId: STORE, planCode: "starter", version: 1, status: "active", features: ["catalog"], limits: { products: 100, staff: 5, storageBytes: 1000000 }, validFrom: "2026-01-01T00:00:00.000Z" }, locale: "tr-TR" } as TenantContext;
}

test("catalog tool uses server search and effective prices with truthful partial results", async () => {
  let observed: unknown;
  const tools = createToshiTools({ tenantContext: tenant(), now: NOW, repositories: { catalog: {
    async listProducts(input: unknown) { observed = input; return { items: [{ id: PRODUCT, storeId: STORE, title: "Bilezik", currency: "TRY", status: "active" }], catalogTotal: 80, nextCursor: "more", variantSummaries: { [PRODUCT]: { variantId: VARIANT, priceCents: 100, effectivePriceCents: null, pricingMethod: "gold_gram", stockTracking: true, stockQuantity: 1, productStock: { trackedVariantCount: 3, untrackedVariantCount: 0, trackedQuantity: 9 } } } }; },
  } as never } });
  const result = await tools.execute("products_search", { query: "bilezik", status: null, stock: null });
  assert.equal((observed as any).tenantContext.store.id, STORE);
  assert.equal((observed as any).pageSize, 10);
  assert.equal((observed as any).search, "bilezik");
  assert.equal((result.result as any).hasMore, true);
  assert.equal((result.result as any).items[0].sellingPriceMinor, null);
  assert.equal((result.result as any).items[0].stock.trackedQuantity, 9);
  assert.deepEqual(result.sources, [{ label: "Ürünler", href: "/products" }]);
});

test("model cannot add tenant authority or execute a write tool", async () => {
  let calls = 0;
  const tools = createToshiTools({ tenantContext: tenant(), now: NOW, repositories: { catalog: { async listProducts() { calls++; throw Error("unexpected"); } } as never } });
  const spoof = await tools.execute("products_search", { query: null, status: null, stock: null, storeId: "other" });
  const write = await tools.execute("delete_product", { productId: PRODUCT });
  assert.equal((spoof.result as any).error, "invalid_arguments");
  assert.equal((write.result as any).error, "unsupported_tool");
  assert.equal(calls, 0);
});

test("tool arguments reject accessors without running them", async () => {
  let read = false;
  const args = { status: null, stock: null, get query() { read = true; return "bilezik"; } };
  const tools = createToshiTools({ tenantContext: tenant(), now: NOW, repositories: {} });
  assert.equal((await tools.execute("products_search", args).then(r => r.result) as any).error, "invalid_arguments");
  assert.equal(read, false);
});

test("cashier never receives or executes order and customer tools", async () => {
  let calls = 0;
  const tools = createToshiTools({ tenantContext: tenant("cashier"), now: NOW, repositories: { orders: { async listOrders() { calls++; } } as never } });
  assert.equal(tools.definitions.some(tool => tool.name === "orders_search"), false);
  assert.equal((await tools.execute("orders_search", { query: null, status: null }).then(r => r.result) as any).error, "permission_denied");
  assert.equal(calls, 0);
});

test("order detail projection excludes contact address notes and external tracking URLs", async () => {
  const tools = createToshiTools({ tenantContext: tenant(), now: NOW, repositories: { orders: { async getOrder() { return { id: PRODUCT, orderNumber: "WEB-000001", source: "storefront", customerName: "Ad", customerEmail: "private@example.test", customerPhone: "SECRET_PHONE", shippingAddress: { line1: "SECRET_ADDRESS" }, notes: [{ body: "SECRET_NOTE" }], tracking: { carrier: "Kargo", trackingUrl: "https://external.test/SECRET" }, currency: "TRY", totalCents: 1489, subtotalCents: 1489, shippingCents: 0, discountCents: 0, paymentStatus: "completed", status: "confirmed", createdAt: NOW.toISOString(), items: [{ productName: "Ürün", quantity: 1, unitPriceCents: 1489, lineTotalCents: 1489 }] }; } } as never } });
  const result = await tools.execute("order_details", { orderId: PRODUCT });
  const text = JSON.stringify(result);
  assert.equal(text.includes("SECRET"), false);
  assert.equal(text.includes("private@example.test"), false);
  assert.equal((result.result as any).orderNumber, "WEB-000001");
  assert.equal((result.result as any).totalMinor, 1489);
  assert.deepEqual(result.sources, [{ label: "WEB-000001", href: `/orders/${PRODUCT}` }]);
});

test("variant grams retain scaled values and unit without becoming stock quantity", async () => {
  const tools = createToshiTools({ tenantContext: tenant(), now: NOW, repositories: { catalog: { async getProductDetails() { return { product: { id: PRODUCT, title: "Yüzük", currency: "TRY", status: "active" }, variants: [{ id: VARIANT, title: "14 ayar", stockQuantity: 3, stockTracking: true, priceCents: 1000, measurements: { weight: { valueMilli: 14890, unit: "g" } }, barcode: "9900000000000" }] }; } } as never } });
  const result = await tools.execute("product_details", { productId: PRODUCT });
  assert.deepEqual((result.result as any).variants[0].measurements.weight, { valueMilli: 14890, unit: "g" });
  assert.equal((result.result as any).variants[0].stockQuantity, 3);
});

test("panel help answers gram and manual POS workflow with internal sources", async () => {
  const tools = createToshiTools({ tenantContext: tenant(), now: NOW, repositories: {} });
  const result = await tools.execute("panel_help", { query: "gram ağırlık 14,89" });
  assert.ok(JSON.stringify(result.result).includes("14,89"));
  assert.ok(result.sources.every(source => source.href.startsWith("/") && !source.href.startsWith("//")));
  const pos = await tools.execute("panel_help", { query: "pos mağazada ödeme" });
  assert.ok(JSON.stringify(pos.result).includes("manuel"));
});

test("sales range uses store timezone and only currency aggregates reach the model", async () => {
  let observed: any;
  const tools = createToshiTools({ tenantContext: tenant(), now: NOW, repositories: { analytics: { async commerceTimezone() { return "Europe/Istanbul"; }, async commerceSnapshot(input: unknown) { observed = input; return { currencies: [{ currency: "TRY", paidOrders: 2, grossRevenueMinor: 4500, refundedMinor: 200 }], carts: [{ privateNote: "PRIVATE_CART" }], attribution: [{ privateVisitor: "PRIVATE_VISITOR" }], rangeStart: (input as any).rangeStart.toISOString(), rangeEnd: (input as any).rangeEnd.toISOString() }; } } as never } });
  const result = await tools.execute("sales_summary", { period: "today", from: null, to: null });
  assert.equal(observed.rangeStart.toISOString(), "2026-09-25T21:00:00.000Z");
  assert.equal((result.result as any).currencies[0].netRevenueMinor, 4300);
  assert.equal(JSON.stringify(result).includes("PRIVATE_"), false);
});

test("warehouse low stock filters real quantities without inventing reserved or available balances", async () => {
  const tools = createToshiTools({ tenantContext: tenant(), now: NOW, repositories: { inventory: {
    async listLocations() { return [{ id: STORE, name: "Ana depo", status: "active", isDefault: true }]; },
    async listBalances() { return [{ locationId: STORE, variantId: VARIANT, quantity: 3 }, { locationId: STORE, variantId: PRODUCT, quantity: 12 }]; },
  } as never } });
  const result = await tools.execute("inventory_balances", { locationId: null, maximumQuantity: 5 });
  assert.equal((result.result as any).matchingVariants, 1);
  assert.equal((result.result as any).items[0].quantity, 3);
  assert.equal((result.result as any).items[0].reserved, undefined);
  assert.equal((result.result as any).scope, "location");
});
