import { createDefaultStarterThemeComposition, parseStorefrontDesignDocument, type StorefrontDesignDestinationOption, normalizeStorefrontDesignDocumentV5, type StorefrontDesignEditorWorkspace } from "@celebix/saas-contracts";
import { createPreviewStorefrontDesign } from "@celebix/storefront-design-ui";
import { fixtureAssets, fixtureDestinations, fixtureCategoryIds } from "./catalog-fixture";

export function initialDesignFixture(): StorefrontDesignEditorWorkspace {
  const composition = createDefaultStarterThemeComposition();
  const draft = normalizeStorefrontDesignDocumentV5({
    schemaVersion: 5,
    brand: { logo: null, favicon: null, primaryColor: "#846346", accentColor: "#312A25", backgroundColor: "#FFFDFC", textColor: "#312A25", fontFamily: "manrope" },
    typography: { headingFont: { family: "Manrope", category: "sans-serif", availableWeights: ["400", "700"], source: "google" }, bodyFont: { family: "Manrope", category: "sans-serif", availableWeights: ["400", "700"], source: "google" }, headingWeight: "700", bodyWeight: "400", headingSizePx: 40, bodySizePx: 16 },
    hero: { enabled: false, slides: [] },
    promotion: { headline: "Örnek koleksiyon", body: "", destination: { kind: "none" }, startsAt: null, endsAt: null, enabled: false },
    announcement: { items: ["İzole QA · gerçek müşteri verisi yok"], icon: "none", speed: "normal", direction: "left", animation: "continuous", enabled: true },
    composition: { ...composition, schemaVersion: 4, sections: [
      { sectionId: "home_categories_first", kind: "category_grid", enabled: true, heading: "Kolyeler koleksiyonu", layout: "duo", categoryIds: [fixtureCategoryIds[0]], categoryImages: [{categoryId:fixtureCategoryIds[0],assetId:fixtureAssets[1].id}] },
      { sectionId: "home_banner_between", kind: "banner", enabled: true, layout: "single", autoplay: false, presentation: "overlay", slides: [{slideId:"slide_fixture_banner",enabled:true,headline:"Koleksiyonlarımızı keşfedin",body:"Seçili tasarımlar",desktopImage:{kind:"asset",assetId:fixtureAssets[0].id},mobileImage:null,destination:{kind:"path",path:"/products"}}] },
      { sectionId: "home_categories_second", kind: "category_grid", enabled: true, heading: "Bileklik koleksiyonu", layout: "grid", categoryIds: [fixtureCategoryIds[1]], categoryImages: [{categoryId:fixtureCategoryIds[1],assetId:fixtureAssets[1].id}] },
      { sectionId: "home_products_first", kind: "product_row", enabled: true, heading: "Kolyeler", source: "category", categoryId:fixtureCategoryIds[0], limit: 4 },
      { sectionId: "home_products_second", kind: "product_row", enabled: true, heading: "Bileklikler", source: "category", categoryId:fixtureCategoryIds[1], limit: 4 },
      { sectionId: "home_story_last", kind: "brand_story", enabled: true, heading: "Mağazamızın hikâyesi", body: "Özenle seçilmiş tasarımlar." },
    ], footer: { ...composition.footer, groups: [{ heading: "QA Bilgi", links: [{ kind: "system", destination: "/products" }] }, composition.footer.groups[1]] } },
  });
  const publishedAt = "2026-09-14T00:00:00.000Z";
  const media = [];
  const destinations: readonly StorefrontDesignDestinationOption[] = fixtureDestinations;
  return { schemaVersion: 1, publishedVersion: 1, publishedAt, design: normalizeStorefrontDesignDocumentV5(draft),
    store: { name: "İzole QA Mağazası", timezone: "Europe/Istanbul" }, media: fixtureAssets.map(({kind,...asset})=>({...asset,assetKind:kind,reference:{kind:"asset" as const,assetId:asset.id}})), destinations };
}
