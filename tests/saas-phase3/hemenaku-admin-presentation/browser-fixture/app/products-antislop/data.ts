import type { CatalogOnboardingOptions, CatalogProductListVariantSummary, Product } from "@celebix/saas-contracts";

export const FIXTURE_NOW = "2026-10-28T09:00:00.000Z";
export const fixtureId = (group: string, index: number) => `${group}-0000-4000-8000-${String(index).padStart(12, "0")}`;
export const STORE_ID = fixtureId("ac100000", 1);
export const OPTIONS: CatalogOnboardingOptions = Object.freeze({
  categories: Object.freeze([
    { id: fixtureId("ac300000", 1), name: "Örnek Giyim", slug: "ornek-giyim", position: 0 },
    { id: fixtureId("ac300000", 2), parentId: fixtureId("ac300000", 1), name: "Örnek Üst Giyim", slug: "ornek-ust-giyim", position: 1 },
    { id: fixtureId("ac300000", 3), name: "Örnek Aksesuar", slug: "ornek-aksesuar", position: 2 },
  ]),
  resources: Object.freeze([
    { id: fixtureId("ac400000", 1), kind: "brand" as const, name: "Örnek Marka A" },
    { id: fixtureId("ac400000", 2), kind: "brand" as const, name: "Örnek Marka B" },
    { id: fixtureId("ac500000", 1), kind: "collection" as const, name: "Örnek Sonbahar" },
    { id: fixtureId("ac500000", 2), kind: "collection" as const, name: "Örnek Temel Ürünler" },
  ]),
  locations: Object.freeze([]),
  channels: Object.freeze([]),
});

export type FixtureProductRecord = {
  product: Product;
  variant: CatalogProductListVariantSummary;
  barcode: string;
  categoryId: string;
  brandId: string;
  collectionId: string;
};

/** Deliberately synthetic products; no customer, asset or production data is used. */
export function createFixtureProducts(): FixtureProductRecord[] {
  const names = ["Keten Gömlek", "Pamuk Tişört", "Omuz Çantası", "Triko Hırka", "Kanvas Pantolon", "Dokuma Atkı"];
  return Array.from({ length: 123 }, (_, offset) => {
    const index = offset + 1;
    const number = String(index).padStart(3, "0");
    const stockTracking = index % 4 !== 0;
    return {
      product: {
        id: fixtureId("ac200000", index), storeId: STORE_ID,
        slug: `ornek-urun-${number}`, title: `Örnek ${number} ${names[offset % names.length]}`,
        description: "Yerel görsel ve etkileşim senaryosu için örnek ürün.",
        status: index % 7 === 0 ? "archived" : index % 3 === 0 ? "draft" : "active",
        currency: "TRY", version: 1,
        createdAt: new Date(Date.UTC(2026, 9, 1, 9, offset)).toISOString(),
        updatedAt: new Date(Date.UTC(2026, 9, 2, 9, offset)).toISOString(),
      },
      variant: {
        variantId: fixtureId("ac600000", index),
        sku: index === 123 ? "ORNEK-123-UZUN-SKU-".padEnd(64, "X") : index === 122 ? "ORNEK-122-DENIM-COLOR" : `ORNEK-${number}`,
        priceCents: 39_900 + index * 500,
        ...(index % 3 === 0 ? { compareAtCents: 49_900 + index * 500 } : {}),
        stockTracking, stockQuantity: stockTracking ? index % 5 === 0 ? 0 : index % 9 + 1 : 0,
      },
      barcode: `869100000${String(index).padStart(4, "0")}`,
      categoryId: OPTIONS.categories[offset % 3].id,
      brandId: OPTIONS.resources[offset % 2].id,
      collectionId: OPTIONS.resources[2 + offset % 2].id,
    };
  });
}
