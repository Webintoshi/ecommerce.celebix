import {
  parseStarterThemeCompositionConfig,
  type StarterCampaignPanelConfig,
  type StarterHeroSlideConfig,
  type StarterThemeComposition,
  type StarterThemeCompositionConfigV2,
  type StarterThemeSectionConfigV2,
} from "@celebix/saas-contracts";

export type StarterThemeEditorState = Omit<StarterThemeCompositionConfigV2, "schemaVersion">;
type HeroSection = Extract<StarterThemeSectionConfigV2, { kind: "hero" }>;
type SplitCampaignSection = Extract<StarterThemeSectionConfigV2, { kind: "split_campaign" }>;
type ValueSection = Extract<StarterThemeSectionConfigV2, { kind: "value_propositions" }>;
const VALUE_CONTROL = /[\u0000-\u001f\u007f]/;

export function buildStarterThemeComposition(input: StarterThemeEditorState): StarterThemeCompositionConfigV2 {
  return parseStarterThemeCompositionConfig({
    schemaVersion: 2,
    ...input,
    cart: { ...input.cart, showShippingProgress: false },
  }) as StarterThemeCompositionConfigV2;
}

function defaultFooter(): StarterThemeEditorState["footer"] {
  return Object.freeze({
    tone: "dark",
    groups: Object.freeze([
      Object.freeze({ heading: "Mağaza", links: Object.freeze([
        Object.freeze({ kind: "system", destination: "/products" }),
        Object.freeze({ kind: "system", destination: "/favorites" }),
      ]) }),
      Object.freeze({ heading: "Hesap", links: Object.freeze([
        Object.freeze({ kind: "system", destination: "/account" }),
      ]) }),
    ]),
    newsletter: Object.freeze({ enabled: false, heading: "Bizden haber alın", body: "Yeni ürün ve mağaza duyurularını e-postanızda alın.", consentLabel: "Aydınlatma metnini okudum ve iletişime izin veriyorum." }),
    social: Object.freeze([]),
  });
}

export function upgradeStarterThemeComposition(input: StarterThemeComposition): StarterThemeCompositionConfigV2 {
  if (input.schemaVersion === 2) return input;
  return buildStarterThemeComposition({
    visual: Object.freeze({ ...input.visual, headerWidth: "wide", headerLayout: "menu_logo_actions", sectionSpacing: "balanced" }),
    announcement: input.announcement,
    navigation: input.navigation,
    sections: Object.freeze(input.sections.map((section) => section.kind === "category_grid"
      ? Object.freeze({ ...section, layout: "grid" as const })
      : section)),
    productDetail: Object.freeze({
      ...input.productDetail,
      showBreadcrumbs: true,
      showApprovedReviews: true,
      showSizeGuide: true,
      informationSections: Object.freeze(["description", "materials_and_care", "certifications", "shipping_and_returns"] as const),
    }),
    cart: Object.freeze({ ...input.cart, showQuantitySelector: true }),
    footer: defaultFooter(),
  });
}

export function moveStarterSection(
  sections: readonly StarterThemeSectionConfigV2[],
  index: number,
  offset: -1 | 1,
): readonly StarterThemeSectionConfigV2[] {
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

export function updateStarterValueProposition(
  section: ValueSection,
  index: number,
  patch: Partial<ValueSection["items"][number]>,
): ValueSection {
  if (index < 0 || index >= section.items.length) return section;
  return Object.freeze({
    ...section,
    items: Object.freeze(section.items.map((item, position) => position === index
      ? Object.freeze({ ...item, ...patch })
      : item)),
  });
}

export function addStarterValueProposition(section: ValueSection): ValueSection {
  if (section.items.length >= 4) return section;
  return Object.freeze({
    ...section,
    items: Object.freeze([
      ...section.items,
      Object.freeze({ icon: "sparkles" as const, heading: "", body: "" }),
    ]),
  });
}

export function removeStarterValueProposition(section: ValueSection, index: number): ValueSection {
  if (section.items.length <= 2 || index < 0 || index >= section.items.length) return section;
  return Object.freeze({
    ...section,
    items: Object.freeze(section.items.filter((_, position) => position !== index)),
  });
}

export function isStarterValuePropositionDraftPublishable(section: ValueSection): boolean {
  return section.items.length >= 2
    && section.items.length <= 4
    && section.items.every(({ heading, body }) => heading.length >= 1
      && heading.length <= 120
      && heading === heading.trim()
      && !VALUE_CONTROL.test(heading)
      && body.length >= 1
      && body.length <= 300
      && body === body.trim()
      && !VALUE_CONTROL.test(body));
}

export function updateStarterNavigationRoots(
  navigation: StarterThemeEditorState["navigation"],
  rootCategoryIds: readonly string[],
): StarterThemeEditorState["navigation"] {
  return Object.freeze({ ...navigation, rootCategoryIds: Object.freeze([...rootCategoryIds]) });
}

export function starterThemeCategoryPlaceholderLabels(composition: StarterThemeComposition): readonly `PLACEHOLDER ${number}`[] {
  const configuredCategoryIds = new Set(composition.navigation.rootCategoryIds);
  for (const section of composition.sections) {
    if (section.kind !== "category_grid" || !section.enabled) continue;
    for (const categoryId of section.categoryIds) configuredCategoryIds.add(categoryId);
  }

  return Object.freeze(
    Array.from({ length: Math.min(4, configuredCategoryIds.size) }, (_, index) => `PLACEHOLDER ${index + 1}` as const),
  );
}

export function createStarterThemeEditorState(): StarterThemeEditorState {
  return Object.freeze({
    visual: Object.freeze({ colorScheme: "neutral", headingStyle: "serif", cornerStyle: "square", headerStyle: "overlay", productCardStyle: "editorial", productImageRatio: "portrait", headerWidth: "wide", headerLayout: "menu_logo_actions", sectionSpacing: "balanced" }),
    announcement: Object.freeze({ enabled: true, items: Object.freeze(["Güvenli alışveriş"]), destination: "/pages/odeme-teslimat" }),
    navigation: Object.freeze({ rootCategoryIds: Object.freeze([]) }),
    sections: Object.freeze([Object.freeze({ kind: "product_row", enabled: true, heading: "Yeni ürünler", source: "latest", limit: 8 })]),
    productDetail: Object.freeze({ galleryStyle: "grid", showSku: true, showBrand: true, showBreadcrumbs: true, showRelatedProducts: true, showApprovedReviews: true, mobileStickyPurchase: true, showSizeGuide: true, informationSections: Object.freeze(["description", "materials_and_care", "certifications", "shipping_and_returns"] as const) }),
    cart: Object.freeze({ showCheckoutReadiness: true, showShippingProgress: false, showQuantitySelector: true, trustMessage: "Güvenli ödeme" }),
    footer: defaultFooter(),
  });
}
