import {
  normalizeStarterThemeCompositionV4,
  type BannerMediaReference,
  type PublicProduct,
  type PublicStarterNavigation,
  type PublicStarterReview,
  type PublicStarterHomeSection,
  type PublicStarterThemePresentationV3,
  type PublicStarterThemePresentationV4,
  type PublicStorefrontAsset,
  type StarterThemeComposition,
  type StarterThemeCompositionConfigV4,
  type StorefrontDesignDestinationOption,
  type StorefrontDesignMediaOption,
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
  navigation?: Readonly<{ status: StorefrontDesignPreviewResourceStatus; value?: PublicStarterNavigation }>;
  productDetail?: Readonly<{ status: StorefrontDesignPreviewResourceStatus; value?: PublicProduct }>;
  relatedProducts?: readonly StorefrontDesignPreviewProduct[];
  testimonials?: Readonly<{ status: StorefrontDesignPreviewResourceStatus; items: readonly PublicStarterReview[] }>;
  dependencyKey: string;
  productSources: readonly Readonly<{
    key: string;
    status: StorefrontDesignPreviewResourceStatus;
    items: readonly StorefrontDesignPreviewProduct[];
    categorySlug?: string;
  }>[];
  media?: readonly Readonly<{ id: string; status: StorefrontDesignPreviewResourceStatus; image?: PublicStorefrontAsset }>[];
  categorySections?: readonly Readonly<{ sectionId: string; status: StorefrontDesignPreviewResourceStatus; value?: NonNullable<PublicStarterThemePresentationV3["categoryShowcase"]> }>[];
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
  projection: Readonly<{ presentation: PublicStarterThemePresentationV4; productRows: readonly Readonly<{ key: string; items: readonly StorefrontDesignPreviewProduct[] }>[] }>;
  sectionStates: readonly DraftCampaignSectionState[];
}>;

export function previewProductSourceKey(section: Extract<StarterThemeCompositionConfigV4["sections"][number], { kind: "product_row" }>): string {
  return section.source === "manual" ? `manual:${section.sectionId}` : section.source === "category" ? `category:${section.categoryId}` : section.source;
}

export function storefrontDesignPreviewDependencyKey(compositionInput: StarterThemeComposition, previewProductId?: string): string {
  const composition = normalizeStarterThemeCompositionV4(compositionInput);
  const sourceLimits = new Map<string, number>();
  const assets = new Set<string>();
  if (composition.navigation.featuredAssetId) assets.add(composition.navigation.featuredAssetId);
  const hotspots = new Set<string>();
  const mediaIds = new Set<string>();
  for (const section of composition.sections) {
    if (!section.enabled) continue;
    if (section.kind === "product_row") {
      const key = previewProductSourceKey(section);
      sourceLimits.set(key, Math.max(sourceLimits.get(key) ?? 0, section.limit));
    } else if (section.kind === "banner") {
      for (const slide of section.slides.filter((slide) => slide.enabled)) {
        for (const reference of [slide.desktopImage, slide.mobileImage]) {
          if (reference?.kind === "asset") assets.add(reference.assetId);
          if (reference?.kind === "media") mediaIds.add(reference.mediaId);
        }
        if (slide.productId) hotspots.add(slide.productId);
      }
    } else if (section.kind === "category_grid") {
      for (const mapping of section.categoryImages ?? []) assets.add(mapping.assetId);
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
    media: [...mediaIds].sort(),
    categories: composition.sections.flatMap((section) => section.enabled && section.kind === "category_grid" ? [{ sectionId: section.sectionId, ids: section.categoryIds, images: section.categoryImages ?? null }] : []),
    manual: composition.sections.flatMap((section) => section.enabled && section.kind === "product_row" && section.source === "manual" ? [[section.sectionId, section.productIds ?? []]] : []),
    reviews: composition.sections.some((section) => section.enabled && section.kind === "testimonials"),
    previewProductId: previewProductId ?? null,
    navigation: composition.navigation,
  });
}

function unresolvedStorefrontDesignPreviewResources(compositionInput: StarterThemeComposition, selectedStatus: "loading" | "unavailable", previewProductId?: string): StorefrontDesignPreviewResources {
  const composition = normalizeStarterThemeCompositionV4(compositionInput);
  const sources = new Set<string>(), assets = new Set<string>(), mediaIds = new Set<string>(), hotspots = new Set<string>(); let needsCategories = false;
  if (composition.navigation.featuredAssetId) assets.add(composition.navigation.featuredAssetId);
  for (const section of composition.sections) {
    if (!section.enabled) continue;
    if (section.kind === "product_row") sources.add(previewProductSourceKey(section));
    else if (section.kind === "banner") for (const slide of section.slides.filter((slide) => slide.enabled)) {
      for (const reference of [slide.desktopImage, slide.mobileImage]) {
        if (reference?.kind === "asset") assets.add(reference.assetId);
        if (reference?.kind === "media") mediaIds.add(reference.mediaId);
      }
      if (slide.productId) hotspots.add(slide.productId);
    }
    else if (section.kind === "split_campaign") for (const panel of section.panels) assets.add(panel.assetId);
    else if (section.kind === "brand_story" && section.assetId) assets.add(section.assetId);
    else if (section.kind === "category_grid") { needsCategories = true; for (const mapping of section.categoryImages ?? []) assets.add(mapping.assetId); }
  }
  return Object.freeze({ schemaVersion: 1, media: Object.freeze([...mediaIds].sort().map((id) => Object.freeze({ id, status: selectedStatus }))), categorySections: Object.freeze(composition.sections.flatMap((section) => section.enabled && section.kind === "category_grid" ? [Object.freeze({ sectionId: section.sectionId, status: selectedStatus })] : [])), dependencyKey: storefrontDesignPreviewDependencyKey(composition, previewProductId), navigation: Object.freeze({ status: selectedStatus }), productDetail: Object.freeze({ status: selectedStatus }), testimonials: Object.freeze({ status: selectedStatus, items: Object.freeze([]) }), productSources: Object.freeze([...sources].sort().map((key) => Object.freeze({ key, status: selectedStatus, items: Object.freeze([]) }))), assets: Object.freeze([...assets].sort().map((id) => Object.freeze({ id, status: selectedStatus }))), hotspots: Object.freeze([...hotspots].sort().map((productId) => Object.freeze({ productId, status: selectedStatus }))), categoryShowcase: Object.freeze({ status: needsCategories ? selectedStatus : "missing" as const }) });
}

export function unavailableStorefrontDesignPreviewResources(compositionInput: StarterThemeComposition, previewProductId?: string): StorefrontDesignPreviewResources {
  return unresolvedStorefrontDesignPreviewResources(compositionInput, "unavailable", previewProductId);
}

export function loadingStorefrontDesignPreviewResources(compositionInput: StarterThemeComposition, previewProductId?: string): StorefrontDesignPreviewResources {
  return unresolvedStorefrontDesignPreviewResources(compositionInput, "loading", previewProductId);
}

function publicFooter(composition: StarterThemeCompositionConfigV4, destinations: readonly StorefrontDesignDestinationOption[]): PublicStarterThemePresentationV3["footer"] {
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
        const kind = link.kind === "category" ? "collection" : link.kind === "catalog_collection" ? "catalog_collection" : "page";
        const resourceId = link.kind === "category" ? link.categoryId : link.kind === "catalog_collection" ? link.resourceId : link.pageId;
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
  media?: readonly StorefrontDesignMediaOption[];
}>): DraftCampaignProjection {
  const composition = normalizeStarterThemeCompositionV4(input.composition);
  const sourceMap = new Map(input.resources.productSources.map((source) => [source.key, source]));
  const assetMap = new Map(input.resources.assets.map((asset) => [asset.id, asset]));
  const hotspotMap = new Map(input.resources.hotspots.map((hotspot) => [hotspot.productId, hotspot]));
  const mediaMap = new Map(input.resources.media?.map((media) => [media.id, media]));
  const imageResource = (reference: BannerMediaReference) => {
    if (!reference) return { status: "missing" as const };
    if (reference.kind === "asset") return assetMap.get(reference.assetId) ?? { status: "missing" as const };
    if (reference.kind === "legacy_https") return { status: "ready" as const, image: { url: reference.url, altText: "", mediaType: "image/webp" as const, width: 1, height: 1 } };
    const loaded = mediaMap.get(reference.mediaId);
    if (loaded) return loaded;
    const option = input.media?.find(({ id }) => id === reference.mediaId);
    return option ? { status: "ready" as const, image: { url: option.url, altText: option.altText, width: option.width, height: option.height, mediaType: option.mediaType } } : { status: "missing" as const };
  };
  const bannerDestination = (reference: Extract<StarterThemeCompositionConfigV4["sections"][number], { kind: "banner" }>["slides"][number]["destination"]) => {
    if (reference.kind === "none") return null;
    if (reference.kind === "path") return reference.path;
    return input.destinations.find((item) => item.kind === reference.kind && item.resourceId === reference.resourceId)?.path ?? null;
  };
  const sections: PublicStarterHomeSection[] = [];
  const rows: Array<Readonly<{ key: string; items: readonly StorefrontDesignPreviewProduct[] }>> = [];
  const states: DraftCampaignSectionState[] = [];
  let draftCategoryShowcase: NonNullable<PublicStarterThemePresentationV3["categoryShowcase"]> | undefined;

  for (const section of composition.sections) {
    if (!section.enabled) continue;
    if (section.kind === "banner") {
      const requestedStatuses: StorefrontDesignPreviewResourceStatus[] = [];
      const slides = section.slides.filter((slide) => slide.enabled).flatMap((slide) => {
        const desktop = imageResource(slide.desktopImage);
        if (slide.desktopImage) requestedStatuses.push(desktop.status);
        if (slide.mobileImage) requestedStatuses.push(imageResource(slide.mobileImage).status);
        if (slide.productId) requestedStatuses.push(hotspotMap.get(slide.productId)?.status ?? "missing");
        if (!desktop.image && section.presentation === "image_only") return [];
        const mobile = imageResource(slide.mobileImage);
        const hotspot = slide.productId ? hotspotMap.get(slide.productId) : undefined;
        return [Object.freeze({ slideId: slide.slideId, enabled: true, headline: slide.headline, body: slide.body,
          desktopImage: desktop.image ?? null, mobileImage: mobile.image ?? null, destination: bannerDestination(slide.destination),
          ...(slide.eyebrow ? { eyebrow: slide.eyebrow } : {}), ...(hotspot?.status === "ready" && hotspot.value ? { hotspot: hotspot.value } : {}),
        })];
      });
      sections.push(Object.freeze({ ...(section.style ? { style: section.style } : {}), kind: "banner", sectionId: section.sectionId, layout: section.layout, autoplay: section.autoplay, presentation: section.presentation, slides: Object.freeze(slides) }));
      states.push(Object.freeze({ sectionId: section.sectionId, status: requestedStatuses.length ? aggregateRequestedStatuses(requestedStatuses) : slides.length ? "ready" : "empty" }));
    } else if (section.kind === "category_grid") {
      const resolvedSection = input.resources.categorySections?.find((item) => item.sectionId === section.sectionId);
      const categoryResource = resolvedSection ?? input.resources.categoryShowcase;
      const available = new Map(categoryResource.value?.items.map((item) => [item.id, item]));
      const selected = Object.freeze(section.categoryIds.flatMap((id) => {
        const item = available.get(id);
        const overrideId = section.categoryImages?.find((mapping) => mapping.categoryId === id)?.assetId;
        const override = overrideId ? assetMap.get(overrideId) : undefined;
        return item && (!overrideId || override?.status === "ready" && override.image) ? [override?.image ? Object.freeze({ ...item, image: override.image }) : item] : [];
      }));
      const categoryStatus = categoryResource.status === "ready"
        ? selected.length === section.categoryIds.length ? (selected.length ? "ready" : "empty")
          : selected.length ? "partial" : "missing"
        : categoryResource.status;
      if (!draftCategoryShowcase) draftCategoryShowcase = Object.freeze({ heading: section.heading, layout: section.layout, items: selected });
      sections.push(Object.freeze({ ...(section.style ? { style: section.style } : {}), kind: "category_grid", sectionId: section.sectionId, heading: section.heading, layout: section.layout,
        items: Object.freeze(selected.map(({ name, slug, image }) => Object.freeze({ name, slug, image }))) }));
      states.push(Object.freeze({ sectionId: section.sectionId, status: categoryStatus }));
    } else if (section.kind === "product_row") {
      const source = sourceMap.get(previewProductSourceKey(section));
      const candidates = section.source === "manual" ? (section.productIds ?? []).flatMap((id) => { const item = source?.items.find((product) => product.id === id); return item ? [item] : []; }) : source?.items ?? [];
      const items = Object.freeze(candidates.filter(({ available }) => available).slice(0, section.limit));
      sections.push(Object.freeze({ ...(section.style ? { style: section.style } : {}),
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
      sections.push(Object.freeze({ ...(section.style ? { style: section.style } : {}), kind: "split_campaign", sectionId: section.sectionId, panels: Object.freeze(panels) }));
      states.push(Object.freeze({ sectionId: section.sectionId, status: aggregateRequestedStatuses(requestedStatuses) }));
    } else if (section.kind === "brand_story") {
      const asset = section.assetId ? assetMap.get(section.assetId) : undefined;
      sections.push(Object.freeze({ ...(section.style ? { style: section.style } : {}),
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
      sections.push(Object.freeze({ ...(section.style ? { style: section.style } : {}), kind: "value_propositions", sectionId: section.sectionId, items: section.items }));
      states.push(Object.freeze({ sectionId: section.sectionId, status: section.items.length ? "ready" : "empty" }));
    } else {
      const reviews = Object.freeze((input.resources.testimonials?.items ?? []).filter((review) => review.rating >= section.minimumRating).slice(0, section.limit));
      sections.push(Object.freeze({ ...(section.style ? { style: section.style } : {}), kind: "testimonials", sectionId: section.sectionId, heading: section.heading, items: reviews }));
      states.push(Object.freeze({ sectionId: section.sectionId, status: reviews.length ? "ready" : input.resources.testimonials?.status ?? "unavailable" }));
    }
  }

  const firstHero = sections.find((section): section is Extract<PublicStarterHomeSection, { kind: "banner" }> => section.kind === "banner")?.slides[0];
  const firstLimit = composition.sections.find((section): section is Extract<StarterThemeCompositionConfigV4["sections"][number], { kind: "product_row" }> => section.kind === "product_row")?.limit ?? 8;
  const presentation: PublicStarterThemePresentationV4 = Object.freeze({
    schemaVersion: 4,
    displayName: input.storeName,
    theme: Object.freeze({
      colorScheme: composition.visual.colorScheme,
      headingStyle: composition.visual.headingStyle,
      productCardStyle: composition.visual.productCardStyle,
      productImageRatio: composition.visual.productImageRatio,
      homeProductLimit: firstLimit,
      showBrandStory: composition.sections.some((section) => section.enabled && section.kind === "brand_story"),
    }),
    hero: Object.freeze({ enabled: false, headline: firstHero?.headline ?? input.storeName, body: firstHero?.body ?? "Ürünlerimizi keşfedin.", destination: firstHero?.destination ?? "/products", ...(firstHero?.desktopImage ? { image: firstHero.desktopImage } : {}) }),
    visual: composition.visual,
    ...(composition.announcement.enabled ? { announcement: Object.freeze({ items: composition.announcement.items, ...(composition.announcement.destination ? { destination: composition.announcement.destination } : {}) }) } : {}),
    navigation: input.resources.navigation?.value ?? Object.freeze({ items: Object.freeze((composition.navigation.rootLinks ?? composition.navigation.rootCategoryIds.map(resourceId => ({ kind: "category" as const, resourceId }))).flatMap((link) => {
      const kind = link.kind === "category" ? "collection" : "catalog_collection";
      const item = input.destinations.find((item) => item.kind === kind && item.resourceId === link.resourceId);
      const slug = item?.path.match(/^\/(?:categories|collections|kategori|koleksiyon)\/([a-z0-9-]+)$/)?.[1];
      return item && slug ? [{ name: item.label, slug, children: Object.freeze([]), ...(link.kind === "catalog_collection" ? { kind: link.kind, resourceId: link.resourceId, path: item.path } : {}) }] : [];
    })) }),
    sections: Object.freeze(sections),
    productDetail: composition.productDetail,
    cart: composition.cart,
    footer: publicFooter(composition, input.destinations),
    ...(draftCategoryShowcase ? { categoryShowcase: draftCategoryShowcase } : {}),
    seo: Object.freeze({ allowIndex: false }),
  });
  return Object.freeze({ projection: Object.freeze({ presentation, productRows: Object.freeze(rows) }), sectionStates: Object.freeze(states) });
}
