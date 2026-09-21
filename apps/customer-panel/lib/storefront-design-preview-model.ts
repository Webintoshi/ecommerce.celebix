import {
  normalizeStarterThemeCompositionV3,
  type PublicStarterHomeSection,
  type PublicStarterThemePresentationV3,
  type PublicStorefrontAsset,
  type StarterThemeComposition,
  type StarterThemeCompositionConfigV3,
  type StorefrontDesignDestinationOption,
} from "@celebix/saas-contracts";
export type StorefrontDesignPreviewResourceStatus = "loading" | "ready" | "partial" | "empty" | "missing" | "unavailable";

export type StorefrontDesignPreviewProduct = Readonly<{
  id: string;
  slug: string;
  title: string;
  currency: "TRY";
  priceCents: number;
  compareAtCents?: number;
  available: boolean;
  brand?: Readonly<{ name: string }>;
  media: readonly Readonly<{ url: string; altText: string; width?: number; height?: number }>[];
}>;

export type StorefrontDesignPreviewResources = Readonly<{
  schemaVersion: 1;
  dependencyKey: string;
  productSources: readonly Readonly<{
    key: string;
    status: StorefrontDesignPreviewResourceStatus;
    items: readonly StorefrontDesignPreviewProduct[];
    categorySlug?: string;
  }>[];
  assets: readonly Readonly<{
    id: string;
    status: StorefrontDesignPreviewResourceStatus;
    image?: PublicStorefrontAsset;
  }>[];
  hotspots: readonly Readonly<{
    productId: string;
    status: StorefrontDesignPreviewResourceStatus;
    value?: Readonly<{ productSlug: string; title: string; priceCents: number; currency: "TRY" }>;
  }>[];
  categoryShowcase: Readonly<{
    status: StorefrontDesignPreviewResourceStatus;
    value?: NonNullable<PublicStarterThemePresentationV3["categoryShowcase"]>;
  }>;
}>;

export type DraftCampaignSectionState = Readonly<{
  sectionId: string;
  status: StorefrontDesignPreviewResourceStatus;
}>;

export type DraftCampaignProjection = Readonly<{
  projection: Readonly<{ presentation: PublicStarterThemePresentationV3; productRows: readonly Readonly<{ key: string; items: readonly StorefrontDesignPreviewProduct[] }>[] }>;
  sectionStates: readonly DraftCampaignSectionState[];
}>;

export function previewProductSourceKey(section: Extract<StarterThemeCompositionConfigV3["sections"][number], { kind: "product_row" }>): string {
  return section.source === "category" ? `category:${section.categoryId}` : section.source;
}

export function storefrontDesignPreviewDependencyKey(compositionInput: StarterThemeComposition): string {
  const composition = normalizeStarterThemeCompositionV3(compositionInput);
  const sourceLimits = new Map<string, number>();
  const assets = new Set<string>();
  const hotspots = new Set<string>();
  for (const section of composition.sections) {
    if (!section.enabled) continue;
    if (section.kind === "product_row") {
      const key = previewProductSourceKey(section);
      sourceLimits.set(key, Math.max(sourceLimits.get(key) ?? 0, section.limit));
    } else if (section.kind === "hero") {
      for (const slide of section.slides) {
        assets.add(slide.desktopAssetId);
        if (slide.mobileAssetId) assets.add(slide.mobileAssetId);
        if (slide.productId) hotspots.add(slide.productId);
      }
    } else if (section.kind === "split_campaign") {
      for (const panel of section.panels) assets.add(panel.assetId);
    } else if (section.kind === "brand_story" && section.assetId) {
      assets.add(section.assetId);
    }
  }
  return JSON.stringify({
    sources: [...sourceLimits].sort(([left], [right]) => left.localeCompare(right)),
    assets: [...assets].sort(),
    hotspots: [...hotspots].sort(),
    categoryShowcase: composition.sections.some((section) => section.enabled && section.kind === "category_grid"),
  });
}

function unresolvedStorefrontDesignPreviewResources(compositionInput: StarterThemeComposition, selectedStatus: "loading" | "unavailable"): StorefrontDesignPreviewResources {
  const composition = normalizeStarterThemeCompositionV3(compositionInput);
  const sources = new Set<string>(), assets = new Set<string>(), hotspots = new Set<string>(); let needsCategories = false;
  for (const section of composition.sections) {
    if (!section.enabled) continue;
    if (section.kind === "product_row") sources.add(previewProductSourceKey(section));
    else if (section.kind === "hero") for (const slide of section.slides) { assets.add(slide.desktopAssetId); if (slide.mobileAssetId) assets.add(slide.mobileAssetId); if (slide.productId) hotspots.add(slide.productId); }
    else if (section.kind === "split_campaign") for (const panel of section.panels) assets.add(panel.assetId);
    else if (section.kind === "brand_story" && section.assetId) assets.add(section.assetId);
    else if (section.kind === "category_grid") needsCategories = true;
  }
  return Object.freeze({ schemaVersion: 1, dependencyKey: storefrontDesignPreviewDependencyKey(composition), productSources: Object.freeze([...sources].sort().map((key) => Object.freeze({ key, status: selectedStatus, items: Object.freeze([]) }))), assets: Object.freeze([...assets].sort().map((id) => Object.freeze({ id, status: selectedStatus }))), hotspots: Object.freeze([...hotspots].sort().map((productId) => Object.freeze({ productId, status: selectedStatus }))), categoryShowcase: Object.freeze({ status: needsCategories ? selectedStatus : "missing" as const }) });
}

export function unavailableStorefrontDesignPreviewResources(compositionInput: StarterThemeComposition): StorefrontDesignPreviewResources {
  return unresolvedStorefrontDesignPreviewResources(compositionInput, "unavailable");
}

export function loadingStorefrontDesignPreviewResources(compositionInput: StarterThemeComposition): StorefrontDesignPreviewResources {
  return unresolvedStorefrontDesignPreviewResources(compositionInput, "loading");
}

function publicFooter(composition: StarterThemeCompositionConfigV3, destinations: readonly StorefrontDesignDestinationOption[]): PublicStarterThemePresentationV3["footer"] {
  const destination = new Map(destinations.map((item) => [`${item.kind}:${item.resourceId}`, item]));
  const fixed = Object.freeze({
    privacy_security: ["Gizlilik ve Güvenlik", "/policies/privacy-security"],
    distance_sales: ["Mesafeli Satış Sözleşmesi", "/policies/distance-sales"],
    kvkk: ["KVKK", "/policies/kvkk"],
    payment_delivery: ["Ödeme ve Teslimat", "/policies/payment-delivery"],
    cookie_usage: ["Çerez Kullanımı", "/policies/cookies"],
    returns_exchange: ["İade ve Değişim", "/policies/returns-exchanges"],
    membership: ["Üyelik Sözleşmesi", "/policies/membership"],
  } as const);
  const system = Object.freeze({ "/": "Ana Sayfa", "/products": "Tüm Ürünler", "/favorites": "Favoriler", "/account": "Hesabım" } as const);
  return Object.freeze({
    tone: composition.footer.tone,
    groups: Object.freeze(composition.footer.groups.map((group) => Object.freeze({
      heading: group.heading,
      links: Object.freeze(group.links.flatMap((link) => {
        if (link.kind === "system") return [Object.freeze({ label: system[link.destination], destination: link.destination })];
        if (link.kind === "fixed_policy") {
          const selected = fixed[link.policyKey];
          return [Object.freeze({ label: selected[0], destination: selected[1] })];
        }
        const kind = link.kind === "category" ? "collection" : "page";
        const resourceId = link.kind === "category" ? link.categoryId : link.pageId;
        const selected = destination.get(`${kind}:${resourceId}`);
        return selected ? [Object.freeze({ label: selected.label, destination: selected.path })] : [];
      })),
    }))),
    newsletter: composition.footer.newsletter,
    social: composition.footer.social,
  });
}

function aggregateRequestedStatuses(statuses: readonly StorefrontDesignPreviewResourceStatus[]): StorefrontDesignPreviewResourceStatus {
  if (statuses.length === 0) return "empty";
  const ready = statuses.filter((status) => status === "ready").length;
  if (ready === statuses.length) return "ready";
  if (ready > 0) return "partial";
  if (statuses.includes("loading")) return "loading";
  if (statuses.includes("unavailable")) return "unavailable";
  if (statuses.includes("partial")) return "partial";
  return "missing";
}

export function composeDraftCampaignProjection(input: Readonly<{
  composition: StarterThemeComposition;
  storeName: string;
  destinations: readonly StorefrontDesignDestinationOption[];
  resources: StorefrontDesignPreviewResources;
}>): DraftCampaignProjection {
  const composition = normalizeStarterThemeCompositionV3(input.composition);
  const sourceMap = new Map(input.resources.productSources.map((source) => [source.key, source]));
  const assetMap = new Map(input.resources.assets.map((asset) => [asset.id, asset]));
  const hotspotMap = new Map(input.resources.hotspots.map((hotspot) => [hotspot.productId, hotspot]));
  const sections: PublicStarterHomeSection[] = [];
  const rows: Array<Readonly<{ key: string; items: readonly StorefrontDesignPreviewProduct[] }>> = [];
  const states: DraftCampaignSectionState[] = [];
  let draftCategoryShowcase: NonNullable<PublicStarterThemePresentationV3["categoryShowcase"]> | undefined;

  for (const section of composition.sections) {
    if (!section.enabled) continue;
    if (section.kind === "hero") {
      const requestedStatuses: StorefrontDesignPreviewResourceStatus[] = [];
      const slides = section.slides.flatMap((slide) => {
        const desktop = assetMap.get(slide.desktopAssetId);
        requestedStatuses.push(desktop?.status ?? "missing");
        if (slide.mobileAssetId) requestedStatuses.push(assetMap.get(slide.mobileAssetId)?.status ?? "missing");
        if (slide.productId) requestedStatuses.push(hotspotMap.get(slide.productId)?.status ?? "missing");
        if (desktop?.status !== "ready" || !desktop.image) return [];
        const mobile = slide.mobileAssetId ? assetMap.get(slide.mobileAssetId) : undefined;
        const hotspot = slide.productId ? hotspotMap.get(slide.productId) : undefined;
        return [Object.freeze({
          ...(slide.eyebrow ? { eyebrow: slide.eyebrow } : {}),
          heading: slide.heading,
          ...(slide.body ? { body: slide.body } : {}),
          desktopImage: desktop.image,
          ...(mobile?.status === "ready" && mobile.image ? { mobileImage: mobile.image } : {}),
          destination: slide.destination,
          ...(hotspot?.status === "ready" && hotspot.value ? { hotspot: hotspot.value } : {}),
        })];
      });
      sections.push(Object.freeze({ kind: "hero", sectionId: section.sectionId, slides: Object.freeze(slides) }));
      states.push(Object.freeze({ sectionId: section.sectionId, status: aggregateRequestedStatuses(requestedStatuses) }));
    } else if (section.kind === "category_grid") {
      const available = new Map(input.resources.categoryShowcase.value?.items.map((item) => [item.id, item]));
      const selected = Object.freeze(section.categoryIds.flatMap((id) => {
        const item = available.get(id);
        return item ? [item] : [];
      }));
      const categoryStatus = input.resources.categoryShowcase.status === "ready"
        ? selected.length === section.categoryIds.length ? (selected.length ? "ready" : "empty")
          : selected.length ? "partial" : "missing"
        : input.resources.categoryShowcase.status;
      if (!draftCategoryShowcase) draftCategoryShowcase = Object.freeze({ heading: section.heading, layout: section.layout, items: selected });
      sections.push(Object.freeze({ kind: "category_grid", sectionId: section.sectionId, heading: section.heading, layout: section.layout,
        items: Object.freeze(selected.map(({ name, slug, image }) => Object.freeze({ name, slug, image }))) }));
      states.push(Object.freeze({ sectionId: section.sectionId, status: categoryStatus }));
    } else if (section.kind === "product_row") {
      const source = sourceMap.get(previewProductSourceKey(section));
      const items = Object.freeze((source?.items ?? []).slice(0, section.limit).filter(({ available }) => available));
      sections.push(Object.freeze({
        kind: "product_row",
        sectionId: section.sectionId,
        key: section.sectionId,
        heading: section.heading,
        source: section.source,
        ...(section.source === "category" && source?.categorySlug ? { categorySlug: source.categorySlug } : {}),
        limit: section.limit,
      }));
      rows.push(Object.freeze({ key: section.sectionId, items }));
      states.push(Object.freeze({ sectionId: section.sectionId, status: source?.status === "ready" && items.length === 0 ? "empty" : source?.status ?? "unavailable" }));
    } else if (section.kind === "split_campaign") {
      const requestedStatuses = section.panels.map((panel) => assetMap.get(panel.assetId)?.status ?? "missing");
      const panels = section.panels.flatMap((panel) => {
        const asset = assetMap.get(panel.assetId);
        return asset?.status === "ready" && asset.image ? [Object.freeze({
          ...(panel.eyebrow ? { eyebrow: panel.eyebrow } : {}),
          heading: panel.heading,
          ...(panel.body ? { body: panel.body } : {}),
          image: asset.image,
          destination: panel.destination,
        })] : [];
      });
      sections.push(Object.freeze({ kind: "split_campaign", sectionId: section.sectionId, panels: Object.freeze(panels) }));
      states.push(Object.freeze({ sectionId: section.sectionId, status: aggregateRequestedStatuses(requestedStatuses) }));
    } else if (section.kind === "brand_story") {
      const asset = section.assetId ? assetMap.get(section.assetId) : undefined;
      sections.push(Object.freeze({
        kind: "brand_story",
        sectionId: section.sectionId,
        ...(section.eyebrow ? { eyebrow: section.eyebrow } : {}),
        heading: section.heading,
        body: section.body,
        ...(asset?.status === "ready" && asset.image ? { image: asset.image } : {}),
        ...(section.destination ? { destination: section.destination } : {}),
      }));
      states.push(Object.freeze({ sectionId: section.sectionId, status: section.assetId ? asset?.status ?? "missing" : "ready" }));
    } else if (section.kind === "value_propositions") {
      sections.push(Object.freeze({ kind: "value_propositions", sectionId: section.sectionId, items: section.items }));
      states.push(Object.freeze({ sectionId: section.sectionId, status: section.items.length ? "ready" : "empty" }));
    } else {
      sections.push(Object.freeze({ kind: "testimonials", sectionId: section.sectionId, heading: section.heading, items: Object.freeze([]) }));
      states.push(Object.freeze({ sectionId: section.sectionId, status: "unavailable" }));
    }
  }

  const firstHero = sections.find((section): section is Extract<PublicStarterHomeSection, { kind: "hero" }> => section.kind === "hero")?.slides[0];
  const firstLimit = composition.sections.find((section): section is Extract<StarterThemeCompositionConfigV3["sections"][number], { kind: "product_row" }> => section.kind === "product_row")?.limit ?? 8;
  const presentation: PublicStarterThemePresentationV3 = Object.freeze({
    schemaVersion: 3,
    displayName: input.storeName,
    theme: Object.freeze({
      colorScheme: composition.visual.colorScheme,
      headingStyle: composition.visual.headingStyle,
      productCardStyle: composition.visual.productCardStyle,
      productImageRatio: composition.visual.productImageRatio,
      homeProductLimit: firstLimit,
      showBrandStory: composition.sections.some((section) => section.enabled && section.kind === "brand_story"),
    }),
    hero: Object.freeze({ enabled: Boolean(firstHero), headline: firstHero?.heading ?? input.storeName, body: firstHero?.body ?? "Ürünlerimizi keşfedin.", destination: firstHero?.destination ?? "/products", ...(firstHero?.desktopImage ? { image: firstHero.desktopImage } : {}) }),
    visual: composition.visual,
    ...(composition.announcement.enabled ? { announcement: Object.freeze({ items: composition.announcement.items, ...(composition.announcement.destination ? { destination: composition.announcement.destination } : {}) }) } : {}),
    navigation: Object.freeze({ items: Object.freeze([]) }),
    sections: Object.freeze(sections),
    productDetail: composition.productDetail,
    cart: composition.cart,
    footer: publicFooter(composition, input.destinations),
    ...(draftCategoryShowcase ? { categoryShowcase: draftCategoryShowcase } : {}),
    seo: Object.freeze({ allowIndex: false }),
  });
  return Object.freeze({ projection: Object.freeze({ presentation, productRows: Object.freeze(rows) }), sectionStates: Object.freeze(states) });
}
