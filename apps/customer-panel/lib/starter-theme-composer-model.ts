import { parseStarterThemeCompositionConfig, type StarterThemeCompositionConfig, type StarterThemeSectionConfig } from "@celebix/saas-contracts";

export type StarterThemeEditorState = Omit<StarterThemeCompositionConfig, "schemaVersion">;

export function buildStarterThemeComposition(input: StarterThemeEditorState): StarterThemeCompositionConfig {
  return parseStarterThemeCompositionConfig({ schemaVersion: 1, ...input });
}

export function moveStarterSection(
  sections: readonly StarterThemeSectionConfig[],
  index: number,
  offset: -1 | 1,
): readonly StarterThemeSectionConfig[] {
  const destination = index + offset;
  if (destination < 0 || destination >= sections.length) return sections;
  const next = [...sections];
  [next[index], next[destination]] = [next[destination]!, next[index]!];
  return Object.freeze(next);
}

export function createStarterThemeEditorState(): StarterThemeEditorState {
  return Object.freeze({
    visual: Object.freeze({ colorScheme: "neutral", headingStyle: "serif", cornerStyle: "soft", headerStyle: "overlay", productCardStyle: "editorial", productImageRatio: "portrait" }),
    announcement: Object.freeze({ enabled: true, items: Object.freeze(["Güvenli alışveriş"]), destination: "/pages/odeme-teslimat" }),
    navigation: Object.freeze({ rootCategoryIds: Object.freeze([]) }),
    sections: Object.freeze([Object.freeze({ kind: "product_row", enabled: true, heading: "Yeni ürünler", source: "latest", limit: 8 })]),
    productDetail: Object.freeze({ galleryStyle: "grid", showSku: true, showBrand: true, showRelatedProducts: true, mobileStickyPurchase: true }),
    cart: Object.freeze({ showCheckoutReadiness: true, showShippingProgress: true, trustMessage: "Güvenli ödeme" }),
  });
}
