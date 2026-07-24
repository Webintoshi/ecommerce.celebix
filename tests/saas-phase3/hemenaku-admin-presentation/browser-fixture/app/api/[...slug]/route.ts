const NOW = "2026-07-24T12:00:00.000Z";
const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const CUSTOMER_ID = "22222222-2222-4222-8222-222222222222";
const RESOURCE_ID = "33333333-3333-4333-8333-333333333333";
const STORE_ID = "44444444-4444-4444-8444-444444444444";
const LINE_ID = "66666666-6666-4666-8666-666666666666";

const ANALYTICS = Object.freeze({
  period: "month",
  rangeStart: "2026-07-01T00:00:00.000Z",
  rangeEnd: NOW,
  generatedAt: NOW,
  currency: "TRY",
  revenueCents: 1_250_000,
  orders: Object.freeze({ total: 24, paid: 20, cancelled: 2, refunded: 1 }),
  customers: Object.freeze({ total: 40, newInPeriod: 8 }),
  catalog: Object.freeze({ activeProducts: 9, lowStockVariants: 2 }),
  series: Object.freeze([
    Object.freeze({ startsAt: "2026-07-01T00:00:00.000Z", orders: 24, revenueCents: 1_250_000 }),
  ]),
  topProducts: Object.freeze([
    Object.freeze({ productId: RESOURCE_ID, title: "Keten Gömlek", quantity: 12, revenueCents: 750_000 }),
  ]),
});

const ORDER = Object.freeze({
  id: ORDER_ID,
  orderNumber: "HMK-1042",
  source: "storefront",
  customerName: "Ada Yılmaz",
  customerEmail: "ada@example.test",
  customerPhone: "+905551112233",
  currency: "TRY",
  totalCents: 12_500,
  subtotalCents: 11_000,
  shippingCents: 1_500,
  discountCents: 0,
  status: "confirmed",
  paymentStatus: "completed",
  itemCount: 1,
  shippingAddress: Object.freeze({
    recipientName: "Ada Yılmaz",
    line1: "İstiklal Caddesi 42",
    district: "Beyoğlu",
    city: "İstanbul",
    postalCode: "34430",
    country: "TR",
  }),
  items: Object.freeze([
    Object.freeze({
      id: LINE_ID,
      position: 1,
      productName: "Keten Gömlek",
      variantName: "M / Krem",
      sku: "KG-M-KREM",
      unitPriceCents: 11_000,
      quantity: 1,
      discountCents: 0,
      lineTotalCents: 11_000,
    }),
  ]),
  events: Object.freeze([]),
  notes: Object.freeze([]),
  version: 3,
  createdAt: NOW,
  updatedAt: NOW,
});

const CUSTOMER = Object.freeze({
  id: CUSTOMER_ID,
  status: "active",
  displayName: "Ada Yılmaz",
  firstName: "Ada",
  lastName: "Yılmaz",
  email: "ada@example.test",
  phone: "+905551112233",
  orderCount: 1,
  totalSpentCents: 12_500,
  currency: "TRY",
  tags: Object.freeze([]),
  addresses: Object.freeze([]),
  consents: Object.freeze([]),
  notes: Object.freeze([]),
  segments: Object.freeze([]),
  version: 2,
  createdAt: NOW,
  updatedAt: NOW,
});

const EXTRA = Object.freeze({
  id: RESOURCE_ID,
  kind: "extra",
  name: "Hediye paketi",
  slug: "hediye-paketi",
  description: "Krem renkli hediye paketi ve kart notu.",
  config: Object.freeze({
    options: Object.freeze(["Hediye paketi", "Kart notu"]),
    priceAdjustmentCents: 2_500,
  }),
  status: "active",
  productIds: Object.freeze([]),
  productCount: 0,
  version: 2,
  createdAt: NOW,
  updatedAt: NOW,
});

const PRODUCT = Object.freeze({
  id: RESOURCE_ID,
  storeId: STORE_ID,
  slug: "keten-gomlek",
  title: "Keten Gömlek",
  description: "Doğal keten gömlek.",
  status: "draft",
  currency: "TRY",
  createdAt: NOW,
  updatedAt: NOW,
  version: 3,
});

const PRODUCT_VARIANT = Object.freeze({
  id: "55555555-5555-4555-8555-555555555555",
  productId: RESOURCE_ID,
  storeId: STORE_ID,
  title: "M / Krem",
  sku: "KG-M-KREM",
  priceCents: 11_000,
  compareAtCents: 12_500,
  stockTracking: true,
  stockQuantity: 8,
  status: "active",
  attributes: Object.freeze({ beden: "M", renk: "Krem" }),
  createdAt: NOW,
  updatedAt: NOW,
  version: 2,
});

// These records are deliberately and visibly test-only. They still travel through
// the exact production Toshi read contracts; production components contain no seed data.
const TOSHI_TEST_PRODUCT_ID = "77777777-7777-4777-8777-777777777777";
const TOSHI_TEST_PRODUCT = Object.freeze({
  id: TOSHI_TEST_PRODUCT_ID,
  storeId: STORE_ID,
  slug: "toshi-tarayici-test-urunu",
  title: "Toshi Tarayıcı Test Ürünü",
  description: "Yalnızca yerel tarayıcı kabul testi kaydı.",
  status: "active",
  currency: "TRY",
  createdAt: NOW,
  updatedAt: NOW,
  version: 1,
});
const TOSHI_TEST_VARIANT = Object.freeze({
  id: "88888888-8888-4888-8888-888888888888",
  productId: TOSHI_TEST_PRODUCT_ID,
  storeId: STORE_ID,
  title: "Tarayıcı testi varyantı",
  sku: "TOSHI-TEST-SKU",
  priceCents: 10_000,
  stockTracking: true,
  stockQuantity: 0,
  status: "active",
  attributes: Object.freeze({ test: "browser" }),
  createdAt: NOW,
  updatedAt: NOW,
  version: 1,
});
const TOSHI_TEST_CUSTOMER = Object.freeze({
  id: "99999999-9999-4999-8999-999999999999",
  status: "active",
  displayName: "Toshi Tarayıcı Test Müşterisi",
  firstName: "Toshi",
  lastName: "Test Müşterisi",
  email: "toshi-browser@example.test",
  phone: "+905551112233",
  orderCount: 1,
  totalSpentCents: 25_000,
  currency: "TRY",
  tags: Object.freeze([]),
  version: 1,
  createdAt: NOW,
  updatedAt: NOW,
});
const TOSHI_TEST_ORDER = Object.freeze({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  orderNumber: "TOSHI-TEST-1042",
  source: "storefront",
  customerName: "Toshi Tarayıcı Test Müşterisi",
  customerEmail: "toshi-browser@example.test",
  currency: "TRY",
  totalCents: 25_000,
  status: "pending",
  paymentStatus: "pending",
  itemCount: 1,
  createdAt: NOW,
  updatedAt: NOW,
  version: 1,
});

async function route(context: { params: Promise<{ slug: string[] }> }) {
  return (await context.params).slug.join("/");
}

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string[] }> },
) {
  const slug = await route(context);
  const search = new URL(request.url).searchParams;
  if (slug === "analytics/dashboard") return Response.json(ANALYTICS);
  if (slug === `orders/${ORDER_ID}`) return Response.json(ORDER);
  if (slug === `customers/${CUSTOMER_ID}`) return Response.json(CUSTOMER);
  if (slug === `catalog/admin/resources/extra/${RESOURCE_ID}`) return Response.json(EXTRA);
  if (slug === "catalog/summary") return Response.json({
    totalProducts: 1,
    activeProducts: 1,
    draftProducts: 0,
    productLimit: 100,
    activeVariants: 1,
    outOfStockVariants: 1,
    productsWithoutMedia: 1,
    activeMedia: 0,
  });
  if (slug === "orders/summary") return Response.json({
    totalOrders: 5,
    pendingOrders: 2,
    fulfilledOrders: 3,
    revenueCents: 125_000,
    currency: "TRY",
    asOf: NOW,
  });
  if (slug === "customers/summary") return Response.json({
    active: 7,
    archived: 1,
    consentedEmail: 4,
    totalSpentCents: 125_000,
    currency: "TRY",
    asOf: NOW,
  });
  if (slug === "orders/abandoned-carts/summary") return Response.json({
    abandoned: 1,
    recovered: 2,
    lostValueCents: 10_000,
    recoveredValueCents: 20_000,
    currency: "TRY",
    asOf: NOW,
  });
  if (slug === `catalog/products/${TOSHI_TEST_PRODUCT_ID}`) return Response.json({
    product: TOSHI_TEST_PRODUCT,
    variants: [TOSHI_TEST_VARIANT],
  });
  if (slug === `catalog/products/${RESOURCE_ID}`) return Response.json({
    product: PRODUCT,
    variants: [PRODUCT_VARIANT],
  });
  if (slug === "catalog/products") {
    if (search.get("limit") === "20" && search.size === 2) {
      if (search.get("status") === "active") return Response.json({ items: [TOSHI_TEST_PRODUCT] });
      if (search.get("status") === "draft") return Response.json({ items: [] });
    }
    return Response.json({ items: [PRODUCT] });
  }
  if (slug === "customers" && search.get("pageSize") === "10" && search.get("search") && search.size === 2) {
    return Response.json({ items: [TOSHI_TEST_CUSTOMER] });
  }
  if (
    slug === "orders" && search.get("pageSize") === "10" && search.get("sort") === "newest" &&
    search.get("search") && search.size === 3
  ) return Response.json({ items: [TOSHI_TEST_ORDER] });
  if (slug === "inventory/locations") {
    return Response.json({
      items: [{
        id: STORE_ID,
        name: "Merkez depo",
        isDefault: true,
        status: "active",
        archiveEligibility: { canArchive: false, reason: "default" },
        version: 2,
        createdAt: NOW,
        updatedAt: NOW,
      }],
    });
  }
  return Response.json({ code: "invalid_input" }, { status: 400 });
}
