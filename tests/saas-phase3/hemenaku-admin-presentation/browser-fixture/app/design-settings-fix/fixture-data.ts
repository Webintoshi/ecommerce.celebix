import { createDefaultStarterThemeComposition, parseStorefrontDesignDocument, type StorefrontDesignDestinationOption, type StorefrontDesignWorkspace } from "@celebix/saas-contracts";
import { createPreviewStorefrontDesign } from "@celebix/storefront-design-ui";

export function initialDesignFixture(): StorefrontDesignWorkspace {
  const composition = createDefaultStarterThemeComposition();
  const draft = parseStorefrontDesignDocument({
    schemaVersion: 4,
    brand: { logo: null, favicon: null, primaryColor: "#846346", accentColor: "#312A25", backgroundColor: "#FFFDFC", textColor: "#312A25", fontFamily: "manrope" },
    typography: { headingFont: { family: "Manrope", category: "sans-serif", availableWeights: ["400", "700"], source: "google" }, bodyFont: { family: "Manrope", category: "sans-serif", availableWeights: ["400", "700"], source: "google" }, headingWeight: "700", bodyWeight: "400", headingSizePx: 40, bodySizePx: 16 },
    hero: { enabled: true, slides: [{ headline: "İzole Tasarım Mağazası", body: "Yalnız test verisi · canlı mağazaya bağlı değildir", desktopImage: { kind: "media", mediaId: "71000000-0000-4000-8000-000000000001" }, mobileImage: null, destination: { kind: "none" }, enabled: true }] },
    promotion: { headline: "Örnek koleksiyon", body: "", destination: { kind: "none" }, startsAt: null, endsAt: null, enabled: false },
    announcement: { items: ["İzole QA · gerçek müşteri verisi yok"], icon: "none", speed: "normal", direction: "left", animation: "continuous", enabled: true },
    composition: { ...composition, sections: [
      { sectionId: "home_products_first", kind: "product_row", enabled: true, heading: "01 · İlk ürün satırı", source: "latest", limit: 4 },
      { sectionId: "home_categories_second", kind: "category_grid", enabled: true, heading: "02 · Kategoriler", layout: "grid", categoryIds: [] },
      { sectionId: "home_products_third", kind: "product_row", enabled: true, heading: "03 · İkinci ürün satırı", source: "latest", limit: 4 },
    ], footer: { ...composition.footer, groups: [{ heading: "QA Bilgi", links: [{ kind: "system", destination: "/products" }] }, composition.footer.groups[1]] } },
  });
  const publishedAt = "2026-09-14T00:00:00.000Z";
  const media = [{ id: "71000000-0000-4000-8000-000000000001", url: "https://fixture.invalid/qa-banner.png", altText: "İzole QA banner", mediaType: "image/png" as const, width: 1200, height: 600 }];
  const destinations: readonly StorefrontDesignDestinationOption[] = [
    { kind: "collection", resourceId: "91000000-0000-4000-8000-000000000004", label: "Giyim · izole QA", path: "/collections/giyim" },
  ];
  return { schemaVersion: 3, draftVersion: 1, publishedVersion: 1, draftUpdatedAt: publishedAt, publishedAt, draft,
    published: createPreviewStorefrontDesign({ draft, publishedVersion: 1, publishedAt, media, destinations }),
    store: { name: "İzole QA Mağazası", timezone: "Europe/Istanbul" }, media, destinations };
}
