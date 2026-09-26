import {
  normalizeStarterThemeCompositionV3,
  type HomepageSectionId,
  type StorefrontDesignDestinationOption,
  type StorefrontDesignAssetOption,
  type StorefrontDesignDocument,
  type StorefrontDesignMediaOption,
} from "@celebix/saas-contracts";

export type HomepageQualityCategory = "hero" | "categories" | "shopping" | "trust" | "content" | "accessibility";
export type HomepageQualityResult = Readonly<{
  score: number;
  label: "Başlangıç" | "İyi gidiyor" | "Yayına hazır" | "Çok başarılı";
  categories: readonly Readonly<{ key: HomepageQualityCategory; earned: number; available: number }>[];
  recommendations: readonly Readonly<{ code: string; message: string; points: number; targetSectionId?: HomepageSectionId }>[];
}>;

type Recommendation = HomepageQualityResult["recommendations"][number];

const CATEGORY_POINTS = Object.freeze({ hero: 20, categories: 20, shopping: 20, trust: 15, content: 15, accessibility: 10 } as const);

function contrastRatio(first: string, second: string): number {
  const luminance = (color: string): number => {
    const rgb = [color.slice(1, 3), color.slice(3, 5), color.slice(5, 7)].map((part) => Number.parseInt(part, 16) / 255).map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!;
  };
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function qualityLabel(score: number): HomepageQualityResult["label"] {
  if (score >= 90) return "Çok başarılı";
  if (score >= 70) return "Yayına hazır";
  if (score >= 40) return "İyi gidiyor";
  return "Başlangıç";
}

export function scoreHomepageQuality(input: Readonly<{
  design: StorefrontDesignDocument;
  media: readonly StorefrontDesignMediaOption[];
  destinations: readonly StorefrontDesignDestinationOption[];
  assets?: readonly StorefrontDesignAssetOption[];
}>): HomepageQualityResult {
  const composition = normalizeStarterThemeCompositionV3(input.design.composition);
  const visible = composition.sections.filter(({ enabled }) => enabled);
  const mediaById = new Map(input.media.map((item) => [item.id, item]));
  const assetsById = new Map((input.assets ?? []).map(item => [item.id,item]));
  const destinationsById = new Map(input.destinations.map((item) => [`${item.kind}:${item.resourceId}`, item]));
  const destinationPaths = new Set(["/", "/products", "/favorites", "/account", ...input.destinations.map(({ path }) => path)]);
  const recommendations: Recommendation[] = [];

  const destinationExists = (destination: StorefrontDesignDocument["hero"]["slides"][number]["destination"]): boolean => destination.kind === "none" || destinationsById.has(`${destination.kind}:${destination.resourceId}`);
  const enabledHeroSlides = input.design.hero.enabled ? input.design.hero.slides.filter(({ enabled }) => enabled) : [];
  const legacyHero = !input.design.hero.enabled ? visible.find(section=>section.kind === "hero") : undefined;
  const heroEnabled = input.design.hero.enabled || Boolean(legacyHero);
  const heroReady = legacyHero?.kind === "hero" ? legacyHero.slides.length > 0 && legacyHero.slides.every(slide => slide.heading.trim().length > 0 && assetsById.get(slide.desktopAssetId)?.kind === "hero" && destinationPaths.has(slide.destination)) : enabledHeroSlides.length > 0 && enabledHeroSlides.every((slide) => slide.headline.trim().length > 0 && slide.desktopImage?.kind === "media" && mediaById.has(slide.desktopImage.mediaId) && destinationExists(slide.destination));
  const hero = heroReady ? CATEGORY_POINTS.hero : 0;
  if (heroEnabled && !heroReady) recommendations.push(Object.freeze({ code: "homepage_add_hero", message: "Ana bannerı görseli ve hedefiyle tamamlayın.", points: 20 }));

  const categorySection = visible.find((section) => section.kind === "category_grid");
  const categoriesReady = categorySection?.kind === "category_grid" && categorySection.categoryIds.length > 0 && categorySection.categoryIds.every((categoryId) => destinationsById.has(`collection:${categoryId}`) && assetsById.get(categorySection.categoryImages?.find(item => item.categoryId === categoryId)?.assetId ?? "")?.kind === "category");
  const categories = categoriesReady ? CATEGORY_POINTS.categories : 0;
  if (!categoriesReady) recommendations.push(Object.freeze({ code: "homepage_add_categories", message: "Müşterilerin keşfedebileceği kategori vitrini ekleyin.", points: 20, ...(categorySection ? { targetSectionId: categorySection.sectionId } : {}) }));

  const productSections = visible.filter((section) => section.kind === "product_row");
  const shoppingReady = productSections.some((section) => section.kind === "product_row" && (section.source === "manual" ? (section.productIds ?? []).every(id => destinationsById.has(`product:${id}`)) && (section.productIds ?? []).some(id => destinationsById.get(`product:${id}`)?.available !== false) : section.source !== "category" || destinationsById.has(`collection:${section.categoryId}`)));
  const shopping = shoppingReady ? CATEGORY_POINTS.shopping : 0;
  if (!shoppingReady) recommendations.push(Object.freeze({ code: "homepage_add_products", message: "Alışverişi başlatan bir ürün bölümü ekleyin.", points: 20, ...(productSections[0] ? { targetSectionId: productSections[0].sectionId } : {}) }));

  const values = visible.find((section) => section.kind === "value_propositions");
  const valuesReady = values?.kind === "value_propositions" && values.items.length >= 2 && values.items.every(({ heading, body }) => heading.trim().length > 0 && body.trim().length > 0);
  const reviews = visible.find((section) => section.kind === "testimonials");
  const reviewsReady = reviews?.kind === "testimonials" && reviews.heading.trim().length > 0;
  const trust = (valuesReady ? 8 : 0) + (reviewsReady ? 7 : 0);
  if (!valuesReady) recommendations.push(Object.freeze({ code: "homepage_add_values", message: "Mağazanızın doğrulanabilir değerlerini gösterin.", points: 8, ...(values ? { targetSectionId: values.sectionId } : {}) }));
  if (!reviewsReady) recommendations.push(Object.freeze({ code: "homepage_add_reviews", message: "Onaylı müşteri yorumları bölümünü ekleyin.", points: 7, ...(reviews ? { targetSectionId: reviews.sectionId } : {}) }));

  const story = visible.find((section) => section.kind === "brand_story");
  const storyReady = story?.kind === "brand_story" && story.heading.trim().length > 0 && story.body.trim().length > 0 && (!story.assetId || assetsById.get(story.assetId)?.kind === "hero") && (!story.destination || destinationPaths.has(story.destination));
  const campaign = visible.find((section) => section.kind === "split_campaign");
  const campaignReady = campaign?.kind === "split_campaign" && campaign.panels.length > 0 && campaign.panels.every(({ heading, assetId, destination }) => heading.trim().length > 0 && assetsById.get(assetId)?.kind === "hero" && destinationPaths.has(destination));
  const content = (storyReady ? 8 : 0) + (campaignReady ? 7 : 0);
  if (!storyReady) recommendations.push(Object.freeze({ code: "homepage_add_brand_story", message: "Markanızın hikâyesini kısa ve net biçimde anlatın.", points: 8, ...(story ? { targetSectionId: story.sectionId } : {}) }));
  if (!campaignReady) recommendations.push(Object.freeze({ code: "homepage_add_campaign", message: "Görsel ve hedefi doğrulanmış kampanya alanı ekleyin.", points: 7, ...(campaign ? { targetSectionId: campaign.sectionId } : {}) }));

  const referencedMediaIds = new Set<string>();
  for (const slide of enabledHeroSlides) {
    if (slide.desktopImage?.kind === "media") referencedMediaIds.add(slide.desktopImage.mediaId);
    if (slide.mobileImage?.kind === "media") referencedMediaIds.add(slide.mobileImage.mediaId);
  }
  const referencedAssetIds = new Set<string>();
  for (const section of visible) {
    if (section.kind === "hero" && !input.design.hero.enabled) for(const slide of section.slides){referencedAssetIds.add(slide.desktopAssetId);if(slide.mobileAssetId)referencedAssetIds.add(slide.mobileAssetId);}
    if (section.kind === "category_grid") for (const mapping of section.categoryImages ?? []) referencedAssetIds.add(mapping.assetId);
    if (section.kind === "brand_story" && section.assetId) referencedAssetIds.add(section.assetId);
    if (section.kind === "split_campaign") for (const panel of section.panels) referencedAssetIds.add(panel.assetId);
  }
  const hasReferencedImages = referencedMediaIds.size + referencedAssetIds.size > 0;
  const mediaAccessible = hasReferencedImages && [...referencedMediaIds].every((mediaId) => (mediaById.get(mediaId)?.altText.trim().length ?? 0) > 0) && [...referencedAssetIds].every(assetId => (assetsById.get(assetId)?.altText.trim().length ?? 0) > 0);
  const contrastAccessible = contrastRatio(input.design.brand.textColor, input.design.brand.backgroundColor) >= 4.5;
  const accessibility = (mediaAccessible ? 5 : 0) + (contrastAccessible ? 5 : 0);
  if (hasReferencedImages && !mediaAccessible) recommendations.push(Object.freeze({ code: "homepage_add_alt_text", message: "Kullanılan görsellere açıklayıcı alternatif metin ekleyin.", points: 5 }));
  if (!contrastAccessible) recommendations.push(Object.freeze({ code: "homepage_fix_contrast", message: "Metin ve zemin kontrastını okunabilir düzeye getirin.", points: 5 }));

  const categoriesResult = Object.freeze([
    Object.freeze({ key: "hero" as const, earned: hero, available: heroEnabled ? CATEGORY_POINTS.hero : 0 }),
    Object.freeze({ key: "categories" as const, earned: categories, available: CATEGORY_POINTS.categories }),
    Object.freeze({ key: "shopping" as const, earned: shopping, available: CATEGORY_POINTS.shopping }),
    Object.freeze({ key: "trust" as const, earned: trust, available: CATEGORY_POINTS.trust }),
    Object.freeze({ key: "content" as const, earned: content, available: CATEGORY_POINTS.content }),
    Object.freeze({ key: "accessibility" as const, earned: accessibility, available: hasReferencedImages ? CATEGORY_POINTS.accessibility : 5 }),
  ]);
  const available = categoriesResult.reduce((total, category) => total + category.available, 0);
  const score = Math.round(categoriesResult.reduce((total, category) => total + category.earned, 0) / available * 100);
  const orderedRecommendations = Object.freeze([...recommendations]
    .sort((left, right) => right.points - left.points || left.code.localeCompare(right.code, "en"))
    .slice(0, 5));

  return Object.freeze({ score, label: qualityLabel(score), categories: categoriesResult, recommendations: orderedRecommendations });
}
