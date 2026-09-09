export const NOW = "2026-09-09T09:00:00.000Z";
export const STORE_ID = "91000000-0000-4000-8000-000000000001";
export const PRODUCT_ID = "91000000-0000-4000-8000-000000000002";
export const VARIANT_ID = "91000000-0000-4000-8000-000000000003";
export const CATEGORY_ID = "91000000-0000-4000-8000-000000000004";
export const BRAND_ID = "91000000-0000-4000-8000-000000000005";
export const COLLECTION_ID = "91000000-0000-4000-8000-000000000006";
export const EXTRA_ID = "91000000-0000-4000-8000-000000000007";
export const CHANNEL_ID = "91000000-0000-4000-8000-000000000008";

export const PRODUCT = Object.freeze({
  id: PRODUCT_ID,
  storeId: STORE_ID,
  slug: "mira-keten-ceket",
  title: "Mira Keten Ceket",
  description: "Doğal dokulu, hafif ve mevsim geçişlerine uygun keten ceket.",
  status: "active",
  currency: "TRY",
  createdAt: NOW,
  updatedAt: NOW,
  version: 4,
});

export const VARIANT = Object.freeze({
  id: VARIANT_ID,
  productId: PRODUCT_ID,
  storeId: STORE_ID,
  title: "M / Taş",
  sku: "MIRA-KTN-M-TAS",
  barcode: "8690000000123",
  priceCents: 249_900,
  compareAtCents: 279_900,
  costCents: 120_000,
  stockTracking: true,
  stockQuantity: 8,
  status: "active",
  attributes: Object.freeze({ Renk: "Taş", Beden: "M" }),
  createdAt: NOW,
  updatedAt: NOW,
  version: 3,
});

export const CATEGORIES = Object.freeze([
  Object.freeze({ id: CATEGORY_ID, name: "Giyim", slug: "giyim", position: 0, depth: 1, status: "active", version: 2, createdAt: NOW, updatedAt: NOW }),
]);

export const OPTIONS = Object.freeze({
  categories: Object.freeze([{ id: CATEGORY_ID, name: "Giyim", slug: "giyim", position: 0 }]),
  resources: Object.freeze([
    { id: BRAND_ID, kind: "brand", name: "Celebix Atelier" },
    { id: COLLECTION_ID, kind: "collection", name: "Sonbahar Seçkisi" },
    { id: EXTRA_ID, kind: "extra", name: "Hediye paketi" },
  ]),
  locations: Object.freeze([{ id: STORE_ID, name: "Merkez depo", isDefault: true }]),
  channels: Object.freeze([{ id: CHANNEL_ID, kind: "storefront", name: "Online mağaza" }]),
});

export const PROFILE = Object.freeze({
  productType: "physical",
  supplierName: "Celebix Atelier",
  seoTitle: "Mira Keten Ceket",
  seoDescription: "Doğal dokulu keten ceket.",
  minimumPurchaseQuantity: 1,
  maximumPurchaseQuantity: 4,
  version: 2,
  updatedAt: NOW,
});

export const RESOURCE_IDS = Object.freeze({
  brand: BRAND_ID,
  collections: Object.freeze([COLLECTION_ID]),
  tags: Object.freeze([]),
  attributes: Object.freeze([]),
  extras: Object.freeze([EXTRA_ID]),
  definitions: Object.freeze([]),
});

export const EDITOR = Object.freeze({
  product: PRODUCT,
  variants: Object.freeze([{ variant: VARIANT, continueSellingWhenOutOfStock: false, shippingDesiMilli: 1_500, hsCode: "620432", inventory: Object.freeze([{ locationId: STORE_ID, quantity: 8 }]) }]),
  profile: PROFILE,
  categoryIds: Object.freeze([CATEGORY_ID]),
  resourceIds: RESOURCE_IDS,
  channelIds: Object.freeze([CHANNEL_ID]),
  mediaCount: 0,
});

const resource = (id: string, kind: string, name: string, slug: string, config: Record<string, unknown> = {}) => Object.freeze({
  id, kind, name, slug, description: `${name} katalog kaydı.`, config: Object.freeze(config), status: "active", productIds: Object.freeze([PRODUCT_ID]), productCount: 1, version: 2, createdAt: NOW, updatedAt: NOW,
});

export const RESOURCES = Object.freeze({
  brand: resource(BRAND_ID, "brand", "Celebix Atelier", "celebix-atelier"),
  collection: resource(COLLECTION_ID, "collection", "Sonbahar Seçkisi", "sonbahar-seckisi", { featured: true }),
  extra: resource(EXTRA_ID, "extra", "Hediye paketi", "hediye-paketi", { options: ["Kraft", "Krem"], priceAdjustmentCents: 2_500 }),
  attribute: resource("91000000-0000-4000-8000-000000000009", "attribute", "Beden", "beden", { values: ["S", "M", "L"] }),
  definition: resource("91000000-0000-4000-8000-000000000010", "definition", "Kumaş", "kumas", { key: "material", value: "Keten" }),
  tag: resource("91000000-0000-4000-8000-000000000011", "tag", "Yeni sezon", "yeni-sezon"),
});

export const MODEL = Object.freeze({ analyticsAvailable: false, storeSlug: "mira-katalog-fixture", membershipLabel: "QA fixture — canlı değil", planCode: "growth", planVersion: 3, entitlementStatus: "active" as const, storefrontHostname: "fixture.invalid", locale: "tr-TR" });
