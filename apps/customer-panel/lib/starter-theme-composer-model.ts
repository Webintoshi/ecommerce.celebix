import {
  parseStarterThemeCompositionConfig,
  type StarterCampaignPanelConfig,
  type StarterHeroSlideConfig,
  type StarterThemeCompositionConfig,
  type StarterThemeSectionConfig,
} from "@celebix/saas-contracts";

export type StarterThemeEditorState = Omit<StarterThemeCompositionConfig, "schemaVersion">;
type HeroSection = Extract<StarterThemeSectionConfig, { kind: "hero" }>;
type SplitCampaignSection = Extract<StarterThemeSectionConfig, { kind: "split_campaign" }>;

export function buildStarterThemeComposition(input: StarterThemeEditorState): StarterThemeCompositionConfig {
  return parseStarterThemeCompositionConfig({
    schemaVersion: 1,
    ...input,
    cart: { ...input.cart, showShippingProgress: false },
  });
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

export function updateStarterHeroSlide(
  section: HeroSection,
  index: number,
  patch: Partial<StarterHeroSlideConfig>,
  remove: readonly ("eyebrow" | "body" | "mobileAssetId" | "productId")[] = [],
): HeroSection {
  if (index < 0 || index >= section.slides.length) return section;
  const updated = { ...section.slides[index], ...patch };
  for (const key of remove) delete updated[key];
  return Object.freeze({
    ...section,
    slides: Object.freeze(section.slides.map((slide, position) => position === index ? Object.freeze(updated) : slide)),
  });
}

export function addStarterHeroSlide(section: HeroSection, slide: StarterHeroSlideConfig): HeroSection {
  if (section.slides.length >= 3) return section;
  return Object.freeze({ ...section, slides: Object.freeze([...section.slides, Object.freeze({ ...slide })]) });
}

export function removeStarterHeroSlide(section: HeroSection, index: number): HeroSection {
  if (section.slides.length <= 1 || index < 0 || index >= section.slides.length) return section;
  return Object.freeze({ ...section, slides: Object.freeze(section.slides.filter((_, position) => position !== index)) });
}

export function updateStarterCampaignPanel(
  section: SplitCampaignSection,
  index: number,
  patch: Partial<StarterCampaignPanelConfig>,
  remove: readonly ("eyebrow" | "body")[] = [],
): SplitCampaignSection {
  if (index < 0 || index >= section.panels.length) return section;
  const updated = { ...section.panels[index], ...patch };
  for (const key of remove) delete updated[key];
  return Object.freeze({
    ...section,
    panels: Object.freeze(section.panels.map((panel, position) => position === index ? Object.freeze(updated) : panel)),
  });
}

export function addStarterCampaignPanel(section: SplitCampaignSection, panel: StarterCampaignPanelConfig): SplitCampaignSection {
  if (section.panels.length >= 2) return section;
  return Object.freeze({ ...section, panels: Object.freeze([...section.panels, Object.freeze({ ...panel })]) });
}

export function removeStarterCampaignPanel(section: SplitCampaignSection, index: number): SplitCampaignSection {
  if (section.panels.length <= 1 || index < 0 || index >= section.panels.length) return section;
  return Object.freeze({ ...section, panels: Object.freeze(section.panels.filter((_, position) => position !== index)) });
}

export function updateStarterNavigationRoots(
  navigation: StarterThemeEditorState["navigation"],
  rootCategoryIds: readonly string[],
): StarterThemeEditorState["navigation"] {
  return Object.freeze({ ...navigation, rootCategoryIds: Object.freeze([...rootCategoryIds]) });
}

export function createStarterThemeEditorState(): StarterThemeEditorState {
  return Object.freeze({
    visual: Object.freeze({ colorScheme: "neutral", headingStyle: "serif", cornerStyle: "soft", headerStyle: "overlay", productCardStyle: "editorial", productImageRatio: "portrait" }),
    announcement: Object.freeze({ enabled: true, items: Object.freeze(["Güvenli alışveriş"]), destination: "/pages/odeme-teslimat" }),
    navigation: Object.freeze({ rootCategoryIds: Object.freeze([]) }),
    sections: Object.freeze([Object.freeze({ kind: "product_row", enabled: true, heading: "Yeni ürünler", source: "latest", limit: 8 })]),
    productDetail: Object.freeze({ galleryStyle: "grid", showSku: true, showBrand: true, showRelatedProducts: true, mobileStickyPurchase: true }),
    cart: Object.freeze({ showCheckoutReadiness: true, showShippingProgress: false, trustMessage: "Güvenli ödeme" }),
  });
}
