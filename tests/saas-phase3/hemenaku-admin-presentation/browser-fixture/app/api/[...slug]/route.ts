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

async function route(context: { params: Promise<{ slug: string[] }> }) {
  return (await context.params).slug.join("/");
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string[] }> },
) {
  const slug = await route(context);
  if (slug === "analytics/dashboard") return Response.json(ANALYTICS);
  if (slug === `orders/${ORDER_ID}`) return Response.json(ORDER);
  if (slug === `customers/${CUSTOMER_ID}`) return Response.json(CUSTOMER);
  if (slug === `catalog/admin/resources/extra/${RESOURCE_ID}`) return Response.json(EXTRA);
  if (slug === "catalog/products") {
    return Response.json({
      items: [{
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
      }],
    });
  }
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
