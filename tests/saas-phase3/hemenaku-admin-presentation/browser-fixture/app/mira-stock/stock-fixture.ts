import { PRODUCT_ID, STORE_ID, VARIANT_ID } from "../mira-catalog/catalog-fixture.ts";

export const STOCK_NOW = "2026-09-09T10:00:00.000Z";
export const STOCK_PREVIEW_NOW = "2026-09-09T10:00:00.000000Z";
export const LOCATION_ID = STORE_ID;
export const DESTINATION_ID = "92000000-0000-4000-8000-000000000001";
export const PURCHASE_ID = "92000000-0000-4000-8000-000000000002";
export const COUNT_ID = "92000000-0000-4000-8000-000000000003";
export const TRANSFER_ID = "92000000-0000-4000-8000-000000000004";
export const PRICE_LIST_ID = "92000000-0000-4000-8000-000000000005";
export const LINE_ID = "92000000-0000-4000-8000-000000000006";

export const LOCATIONS = Object.freeze([
  Object.freeze({ id: LOCATION_ID, name: "Merkez depo", isDefault: true, status: "active", archiveEligibility: Object.freeze({ canArchive: false, reason: "default" }), version: 2, createdAt: STOCK_NOW, updatedAt: STOCK_NOW }),
  Object.freeze({ id: DESTINATION_ID, name: "Kadıköy depo", isDefault: false, status: "active", archiveEligibility: Object.freeze({ canArchive: true, reason: null }), version: 1, createdAt: STOCK_NOW, updatedAt: STOCK_NOW }),
]);

export const PURCHASE = Object.freeze({
  id: PURCHASE_ID,
  locationId: LOCATION_ID,
  supplierName: "Celebix Atelier",
  status: "partially_received",
  lines: Object.freeze([Object.freeze({ id: LINE_ID, variantId: VARIANT_ID, orderedQuantity: 12, receivedQuantity: 5, unitCostCents: 120_000, lineCostCents: 1_440_000 })]),
  totalCostCents: 1_440_000,
  version: 3,
  createdAt: STOCK_NOW,
  updatedAt: STOCK_NOW,
});

export const COUNT = Object.freeze({
  id: COUNT_ID,
  locationId: LOCATION_ID,
  status: "counting",
  lines: Object.freeze([Object.freeze({ id: LINE_ID, variantId: VARIANT_ID, expectedQuantity: 8, countedQuantity: 7 })]),
  version: 2,
  createdAt: STOCK_NOW,
  updatedAt: STOCK_NOW,
});

export const TRANSFER = Object.freeze({
  id: TRANSFER_ID,
  sourceLocationId: LOCATION_ID,
  destinationLocationId: DESTINATION_ID,
  status: "in_transit",
  lines: Object.freeze([Object.freeze({ id: LINE_ID, variantId: VARIANT_ID, quantity: 3 })]),
  version: 2,
  createdAt: STOCK_NOW,
  updatedAt: STOCK_NOW,
});

export const PRICE_LIST = Object.freeze({
  id: PRICE_LIST_ID,
  name: "Sadakat fiyatları",
  status: "draft",
  items: Object.freeze([Object.freeze({ variantId: VARIANT_ID, priceCents: 229_900 })]),
  rules: Object.freeze([Object.freeze({ channel: "storefront", priority: 10 })]),
  version: 2,
  createdAt: STOCK_NOW,
  updatedAt: STOCK_NOW,
});

export const VARIANT_CHOICE = Object.freeze({
  productId: PRODUCT_ID,
  productTitle: "Mira Keten Ceket",
  variantId: VARIANT_ID,
  variantTitle: "M / Taş",
  sku: "MIRA-KTN-M-TAS",
});
