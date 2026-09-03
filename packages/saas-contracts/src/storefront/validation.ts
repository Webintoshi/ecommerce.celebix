import type { HomepageSectionId, PublicImageMediaType, PublicProduct, PublicProductMedia, PublicProductMerchandising, PublicProductVariant, PublicStarterFooter, PublicStarterHomeSection, PublicStarterHomeSectionV2, PublicStarterNavigation, PublicStarterNavigationItem, PublicStarterReview, PublicStarterThemePresentation, PublicStarterThemePresentationV1, PublicStarterThemePresentationV2, PublicStarterThemePresentationV3, PublicStorefront, PublicStorefrontAsset, StarterCampaignPanelConfig, StarterFooterConfig, StarterHeroSlideConfig, StarterProductDetailConfigV2, StarterThemeComposition, StarterThemeCompositionConfig, StarterThemeCompositionConfigV2, StarterThemeCompositionConfigV3, StarterThemeSectionConfig, StarterThemeSectionConfigV2, StarterThemeSectionConfigV3, StarterThemeVisual, StarterThemeVisualV2 } from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const SKU = /^[A-Z0-9](?:[A-Z0-9._-]{0,63})$/;
const HOMEPAGE_SECTION_ID = /^home_[a-z0-9][a-z0-9_-]{2,74}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const DESCRIPTION_CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f]/;
const MEDIA_TYPES = Object.freeze(["image/jpeg", "image/png", "image/webp"] as const);
const COLOR_SCHEMES = Object.freeze(["neutral", "warm", "dark", "ocean"] as const);
const HEADING_STYLES = Object.freeze(["serif", "sans"] as const);
const CARD_STYLES = Object.freeze(["editorial", "compact"] as const);
const IMAGE_RATIOS = Object.freeze(["portrait", "square"] as const);
const MARQUEE_ICONS = Object.freeze(["none", "sparkle", "truck", "shield"] as const);
const MARQUEE_SPEEDS = Object.freeze(["slow", "normal", "fast"] as const);
const MARQUEE_DIRECTIONS = Object.freeze(["left", "right"] as const);
const MARQUEE_ANIMATIONS = Object.freeze(["continuous", "step"] as const);
const CORNER_STYLES = Object.freeze(["square", "soft"] as const);
const HEADER_STYLES = Object.freeze(["overlay", "solid"] as const);
const HEADER_WIDTHS = Object.freeze(["contained", "wide"] as const);
const HEADER_LAYOUTS = Object.freeze(["menu_logo_actions", "logo_menu_actions", "stacked"] as const);
const CATEGORY_SHOWCASE_LAYOUTS = Object.freeze(["duo", "grid"] as const);
const SECTION_SPACINGS = Object.freeze(["compact", "balanced", "airy"] as const);
const GALLERY_STYLES = Object.freeze(["grid", "rail"] as const);
const PRODUCT_ROW_SOURCES = Object.freeze(["latest", "sale", "category"] as const);
const VALUE_ICONS = Object.freeze(["sparkles", "cotton", "heart", "shield", "truck", "return"] as const);
const INFORMATION_SECTIONS = Object.freeze(["description", "materials_and_care", "certifications", "shipping_and_returns"] as const);
const FOOTER_TONES = Object.freeze(["light", "dark"] as const);
const FOOTER_POLICY_KEYS = Object.freeze(["privacy_security", "distance_sales", "kvkk", "payment_delivery", "cookie_usage", "returns_exchange", "membership"] as const);
const FOOTER_SYSTEM_DESTINATIONS = Object.freeze(["/", "/products", "/favorites", "/account"] as const);
const SOCIAL_NETWORKS = Object.freeze(["instagram", "facebook", "youtube", "pinterest", "tiktok", "x"] as const);
const SOCIAL_HOSTS = Object.freeze({
  instagram: Object.freeze(["instagram.com", "www.instagram.com"]),
  facebook: Object.freeze(["facebook.com", "www.facebook.com"]),
  youtube: Object.freeze(["youtube.com", "www.youtube.com"]),
  pinterest: Object.freeze(["pinterest.com", "www.pinterest.com"]),
  tiktok: Object.freeze(["tiktok.com", "www.tiktok.com"]),
  x: Object.freeze(["x.com", "www.x.com"]),
} as const);
const STOREFRONT_ASSET_HOSTS = Object.freeze(["media.celebix.site", "media.saas-staging.celebix.site"] as const);
const STOREFRONT_ASSET_PATH = /^\/stores\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/storefront\/(?:logo|hero|social|favicon|category)\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/;

function invalid(): never { throw new TypeError("storefront_contract_invalid"); }
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if (!descriptor.enumerable || !("value" in descriptor)) invalid();
  }
  return value as Record<string, unknown>;
}
function exact(value: unknown, required: readonly string[], optional: readonly string[] = []) {
  const parsed = record(value);
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(parsed, key)) || Object.keys(parsed).some((key) => !allowed.has(key))) invalid();
  return parsed;
}
function arrayValues(value: unknown, minimum: number, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < minimum || value.length > maximum) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor | undefined>;
  if (Reflect.ownKeys(value).length !== value.length + 1 || descriptors.length?.value !== value.length) invalid();
  const output: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    output.push(descriptor.value);
  }
  return Object.freeze(output);
}
function string(value: unknown, minimum: number, maximum: number, pattern?: RegExp): string {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum || value !== value.trim() || CONTROL.test(value) || (pattern && !pattern.test(value))) invalid();
  return value;
}
function description(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 10_000 || value !== value.trim() || DESCRIPTION_CONTROL.test(value)) invalid();
  return value;
}
function uuid(value: unknown): string { return string(value, 36, 36, UUID); }
function integer(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) invalid();
  return value as number;
}
function optionalInteger(parsed: Record<string, unknown>, key: string, minimum: number, maximum: number): number | undefined {
  return Object.hasOwn(parsed, key) ? integer(parsed[key], minimum, maximum) : undefined;
}
function boolean(value: unknown): boolean { if (typeof value !== "boolean") invalid(); return value; }
function oneOf<const T extends readonly string[]>(value: unknown, values: T): T[number] {
  if (typeof value !== "string" || !values.includes(value)) invalid();
  return value as T[number];
}
function mediaType(value: unknown): PublicImageMediaType {
  if (typeof value !== "string" || !MEDIA_TYPES.includes(value as PublicImageMediaType)) invalid();
  return value as PublicImageMediaType;
}
function httpsUrl(value: unknown, maximum = 2048): string {
  const raw = string(value, 1, maximum);
  let url: URL;
  try { url = new URL(raw); } catch { return invalid(); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.toString() !== raw) invalid();
  return raw;
}
function storefrontAssetUrl(value: unknown, selectedMediaType: PublicImageMediaType): string {
  const raw = httpsUrl(value);
  const url = new URL(raw);
  const expectedExtension = selectedMediaType === "image/jpeg" ? ".jpg" : selectedMediaType === "image/png" ? ".png" : ".webp";
  if (!STOREFRONT_ASSET_HOSTS.includes(url.hostname as (typeof STOREFRONT_ASSET_HOSTS)[number]) || url.port || url.search || !STOREFRONT_ASSET_PATH.test(url.pathname) || !url.pathname.endsWith(expectedExtension)) invalid();
  return raw;
}
function hostname(value: unknown): string { return string(value, 3, 253, HOSTNAME); }
function email(value: unknown): string {
  const selected = string(value, 3, 254);
  if (!/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(selected)) invalid();
  return selected;
}
function destination(value: unknown): string {
  const selected = string(value, 1, 512);
  if (selected === "/") return selected;
  if (!selected.startsWith("/") || selected.startsWith("//") || selected.includes("\\") || selected.includes("?") || selected.includes("#") || selected.includes("//")) invalid();
  const segments = selected.split("/");
  if (segments.some((segment, index) => index > 0 && (segment === "" || segment === "." || segment === ".."))) invalid();
  return selected;
}
function socialUrl(value: unknown, network: (typeof SOCIAL_NETWORKS)[number]): string {
  const selected = httpsUrl(value, 512);
  const parsed = new URL(selected);
  if (parsed.port || parsed.search || parsed.pathname === "/" || !SOCIAL_HOSTS[network].some((host) => host === parsed.hostname)) invalid();
  return selected;
}
function attributes(value: unknown): Readonly<Record<string, string>> {
  const parsed = record(value);
  if (Object.keys(parsed).length > 32) invalid();
  const output: Record<string, string> = {};
  for (const [key, nested] of Object.entries(parsed)) output[string(key, 1, 64)] = string(nested, 0, 256);
  return Object.freeze(output);
}

function parseStorefrontAsset(value: unknown): PublicStorefrontAsset {
  const parsed = exact(value, ["url", "mediaType", "altText", "width", "height"]);
  const selectedMediaType = mediaType(parsed.mediaType);
  return Object.freeze({ url: storefrontAssetUrl(parsed.url, selectedMediaType), mediaType: selectedMediaType, altText: string(parsed.altText, 1, 500), width: integer(parsed.width, 1, 8192), height: integer(parsed.height, 1, 8192) });
}

function parseTheme(value: unknown): PublicStarterThemePresentation["theme"] {
  const parsed = exact(value, ["colorScheme", "headingStyle", "productCardStyle", "productImageRatio", "homeProductLimit", "showBrandStory"]);
  const limit = integer(parsed.homeProductLimit, 4, 12);
  if (![4, 8, 12].includes(limit)) invalid();
  return Object.freeze({ colorScheme: oneOf(parsed.colorScheme, COLOR_SCHEMES), headingStyle: oneOf(parsed.headingStyle, HEADING_STYLES), productCardStyle: oneOf(parsed.productCardStyle, CARD_STYLES), productImageRatio: oneOf(parsed.productImageRatio, IMAGE_RATIOS), homeProductLimit: limit as 4 | 8 | 12, showBrandStory: boolean(parsed.showBrandStory) });
}

function parseHero(value: unknown): PublicStarterThemePresentation["hero"] {
  const parsed = exact(value, ["enabled", "headline", "body", "destination"], ["image"]);
  return Object.freeze({ enabled: boolean(parsed.enabled), headline: string(parsed.headline, 1, 160), body: string(parsed.body, 1, 1000), destination: destination(parsed.destination), ...(Object.hasOwn(parsed, "image") ? { image: parseStorefrontAsset(parsed.image) } : {}) });
}

function parsePromotion(value: unknown): NonNullable<PublicStarterThemePresentation["promotion"]> {
  const parsed = exact(value, ["headline", "destination"], ["body"]);
  return Object.freeze({ headline: string(parsed.headline, 1, 160), ...(Object.hasOwn(parsed, "body") ? { body: string(parsed.body, 1, 1000) } : {}), destination: destination(parsed.destination) });
}

function parseMarquee(value: unknown): NonNullable<PublicStarterThemePresentation["marquee"]> {
  const parsed = exact(value, ["items", "icon", "speed", "direction", "animation"]);
  if (!Array.isArray(parsed.items) || Object.getPrototypeOf(parsed.items) !== Array.prototype || parsed.items.length < 1 || parsed.items.length > 12) invalid();
  const keys = Reflect.ownKeys(parsed.items);
  const descriptors = Object.getOwnPropertyDescriptors(parsed.items) as unknown as Record<PropertyKey, PropertyDescriptor | undefined>;
  const length = descriptors.length;
  if (keys.length !== parsed.items.length + 1 || !length || !("value" in length) || length.value !== parsed.items.length) invalid();
  const selected: string[] = [];
  for (let index = 0; index < parsed.items.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    selected.push(string(descriptor.value, 1, 160));
  }
  const items = Object.freeze(selected);
  return Object.freeze({ items, icon: oneOf(parsed.icon, MARQUEE_ICONS), speed: oneOf(parsed.speed, MARQUEE_SPEEDS), direction: oneOf(parsed.direction, MARQUEE_DIRECTIONS), animation: oneOf(parsed.animation, MARQUEE_ANIMATIONS) });
}

function parseSeo(value: unknown): PublicStarterThemePresentation["seo"] {
  const parsed = exact(value, ["allowIndex"], ["title", "description", "socialImage"]);
  return Object.freeze({ ...(Object.hasOwn(parsed, "title") ? { title: string(parsed.title, 1, 160) } : {}), ...(Object.hasOwn(parsed, "description") ? { description: string(parsed.description, 1, 500) } : {}), allowIndex: boolean(parsed.allowIndex), ...(Object.hasOwn(parsed, "socialImage") ? { socialImage: parseStorefrontAsset(parsed.socialImage) } : {}) });
}

function parseCategoryShowcase(value: unknown): NonNullable<PublicStarterThemePresentation["categoryShowcase"]> {
  const parsed = exact(value, ["heading", "items"], ["layout"]);
  if (!Array.isArray(parsed.items) || Object.getPrototypeOf(parsed.items) !== Array.prototype || parsed.items.length < 1 || parsed.items.length > 8) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(parsed.items) as unknown as Record<PropertyKey, PropertyDescriptor | undefined>;
  if (Reflect.ownKeys(parsed.items).length !== parsed.items.length + 1 || descriptors.length?.value !== parsed.items.length) invalid();
  const items: Array<NonNullable<PublicStarterThemePresentation["categoryShowcase"]>["items"][number]> = [];
  const ids = new Set<string>(), slugs = new Set<string>();
  for (let index = 0; index < parsed.items.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    const item = exact(descriptor.value, ["id", "name", "slug", "image"]);
    const id = uuid(item.id), selectedSlug = string(item.slug, 1, 100, SLUG);
    if (ids.has(id) || slugs.has(selectedSlug)) invalid();
    ids.add(id); slugs.add(selectedSlug);
    items.push(Object.freeze({ id, name: string(item.name, 1, 160), slug: selectedSlug, image: parseStorefrontAsset(item.image) }));
  }
  const layout = Object.hasOwn(parsed, "layout") ? oneOf(parsed.layout, CATEGORY_SHOWCASE_LAYOUTS) : "grid";
  return Object.freeze({ heading: string(parsed.heading, 1, 160), layout, items: Object.freeze(items) });
}

function parseVisual(value: unknown): StarterThemeVisual {
  const parsed = exact(value, ["colorScheme", "headingStyle", "cornerStyle", "headerStyle", "productCardStyle", "productImageRatio"]);
  return Object.freeze({
    colorScheme: oneOf(parsed.colorScheme, COLOR_SCHEMES),
    headingStyle: oneOf(parsed.headingStyle, HEADING_STYLES),
    cornerStyle: oneOf(parsed.cornerStyle, CORNER_STYLES),
    headerStyle: oneOf(parsed.headerStyle, HEADER_STYLES),
    productCardStyle: oneOf(parsed.productCardStyle, CARD_STYLES),
    productImageRatio: oneOf(parsed.productImageRatio, IMAGE_RATIOS),
  });
}

function parseVisualV2(value: unknown): StarterThemeVisualV2 {
  const parsed = exact(value, ["colorScheme", "headingStyle", "cornerStyle", "headerStyle", "productCardStyle", "productImageRatio", "headerWidth", "headerLayout", "sectionSpacing"]);
  return Object.freeze({
    colorScheme: oneOf(parsed.colorScheme, COLOR_SCHEMES),
    headingStyle: oneOf(parsed.headingStyle, HEADING_STYLES),
    cornerStyle: oneOf(parsed.cornerStyle, CORNER_STYLES),
    headerStyle: oneOf(parsed.headerStyle, HEADER_STYLES),
    productCardStyle: oneOf(parsed.productCardStyle, CARD_STYLES),
    productImageRatio: oneOf(parsed.productImageRatio, IMAGE_RATIOS),
    headerWidth: oneOf(parsed.headerWidth, HEADER_WIDTHS),
    headerLayout: oneOf(parsed.headerLayout, HEADER_LAYOUTS),
    sectionSpacing: oneOf(parsed.sectionSpacing, SECTION_SPACINGS),
  });
}

function uuidArray(value: unknown, minimum: number, maximum: number): readonly string[] {
  const selected = arrayValues(value, minimum, maximum).map(uuid);
  if (new Set(selected).size !== selected.length) invalid();
  return Object.freeze(selected);
}

function parseHeroSlideConfig(value: unknown): StarterHeroSlideConfig {
  const parsed = exact(value, ["heading", "desktopAssetId", "destination"], ["eyebrow", "body", "mobileAssetId", "productId"]);
  return Object.freeze({
    ...(Object.hasOwn(parsed, "eyebrow") ? { eyebrow: string(parsed.eyebrow, 1, 80) } : {}),
    heading: string(parsed.heading, 1, 160),
    ...(Object.hasOwn(parsed, "body") ? { body: string(parsed.body, 1, 500) } : {}),
    desktopAssetId: uuid(parsed.desktopAssetId),
    ...(Object.hasOwn(parsed, "mobileAssetId") ? { mobileAssetId: uuid(parsed.mobileAssetId) } : {}),
    destination: destination(parsed.destination),
    ...(Object.hasOwn(parsed, "productId") ? { productId: uuid(parsed.productId) } : {}),
  });
}

function parseCampaignPanelConfig(value: unknown): StarterCampaignPanelConfig {
  const parsed = exact(value, ["heading", "assetId", "destination"], ["eyebrow", "body"]);
  return Object.freeze({
    ...(Object.hasOwn(parsed, "eyebrow") ? { eyebrow: string(parsed.eyebrow, 1, 80) } : {}),
    heading: string(parsed.heading, 1, 160),
    ...(Object.hasOwn(parsed, "body") ? { body: string(parsed.body, 1, 500) } : {}),
    assetId: uuid(parsed.assetId),
    destination: destination(parsed.destination),
  });
}

function parseConfigSection(value: unknown): StarterThemeSectionConfig {
  const candidate = record(value);
  const kind = oneOf(candidate.kind, Object.freeze(["hero", "category_grid", "product_row", "split_campaign", "brand_story"] as const));
  if (kind === "hero") {
    const parsed = exact(candidate, ["kind", "enabled", "slides"]);
    return Object.freeze({ kind, enabled: boolean(parsed.enabled), slides: Object.freeze(arrayValues(parsed.slides, 1, 3).map(parseHeroSlideConfig)) });
  }
  if (kind === "category_grid") {
    const parsed = exact(candidate, ["kind", "enabled", "heading", "categoryIds"]);
    return Object.freeze({ kind, enabled: boolean(parsed.enabled), heading: string(parsed.heading, 1, 160), categoryIds: uuidArray(parsed.categoryIds, 0, 8) });
  }
  if (kind === "product_row") {
    const parsed = exact(candidate, ["kind", "enabled", "heading", "source", "limit"], ["categoryId"]);
    const source = oneOf(parsed.source, PRODUCT_ROW_SOURCES);
    const limit = integer(parsed.limit, 4, 12);
    if (![4, 8, 12].includes(limit) || (source === "category") !== Object.hasOwn(parsed, "categoryId")) invalid();
    return Object.freeze({ kind, enabled: boolean(parsed.enabled), heading: string(parsed.heading, 1, 160), source, ...(source === "category" ? { categoryId: uuid(parsed.categoryId) } : {}), limit: limit as 4 | 8 | 12 });
  }
  if (kind === "split_campaign") {
    const parsed = exact(candidate, ["kind", "enabled", "panels"]);
    return Object.freeze({ kind, enabled: boolean(parsed.enabled), panels: Object.freeze(arrayValues(parsed.panels, 0, 2).map(parseCampaignPanelConfig)) });
  }
  const parsed = exact(candidate, ["kind", "enabled", "heading", "body"], ["eyebrow", "assetId", "destination"]);
  return Object.freeze({
    kind: "brand_story",
    enabled: boolean(parsed.enabled),
    ...(Object.hasOwn(parsed, "eyebrow") ? { eyebrow: string(parsed.eyebrow, 1, 80) } : {}),
    heading: string(parsed.heading, 1, 160),
    body: string(parsed.body, 1, 1000),
    ...(Object.hasOwn(parsed, "assetId") ? { assetId: uuid(parsed.assetId) } : {}),
    ...(Object.hasOwn(parsed, "destination") ? { destination: destination(parsed.destination) } : {}),
  });
}

function parseConfigSectionV2(value: unknown): StarterThemeSectionConfigV2 {
  const candidate = record(value);
  if (candidate.kind === "category_grid") {
    const parsed = exact(candidate, ["kind", "enabled", "heading", "categoryIds", "layout"]);
    return Object.freeze({
      kind: "category_grid",
      enabled: boolean(parsed.enabled),
      heading: string(parsed.heading, 1, 160),
      categoryIds: uuidArray(parsed.categoryIds, 0, 8),
      layout: oneOf(parsed.layout, CATEGORY_SHOWCASE_LAYOUTS),
    });
  }
  if (candidate.kind === "value_propositions") {
    const parsed = exact(candidate, ["kind", "enabled", "items"]);
    const items = Object.freeze(arrayValues(parsed.items, 2, 4).map((entry) => {
      const item = exact(entry, ["icon", "heading", "body"]);
      return Object.freeze({ icon: oneOf(item.icon, VALUE_ICONS), heading: string(item.heading, 1, 120), body: string(item.body, 1, 300) });
    }));
    const headings = items.map(({ heading }) => heading);
    if (new Set(headings).size !== headings.length) invalid();
    return Object.freeze({ kind: "value_propositions", enabled: boolean(parsed.enabled), items });
  }
  if (candidate.kind === "testimonials") {
    const parsed = exact(candidate, ["kind", "enabled", "heading", "source", "limit", "minimumRating"]);
    const limit = integer(parsed.limit, 3, 9);
    const minimumRating = integer(parsed.minimumRating, 4, 5);
    if (![3, 6, 9].includes(limit) || ![4, 5].includes(minimumRating) || parsed.source !== "approved_product_reviews") invalid();
    return Object.freeze({ kind: "testimonials", enabled: boolean(parsed.enabled), heading: string(parsed.heading, 1, 160), source: "approved_product_reviews", limit: limit as 3 | 6 | 9, minimumRating: minimumRating as 4 | 5 });
  }
  const legacy = parseConfigSection(candidate);
  if (legacy.kind === "category_grid") invalid();
  return legacy;
}

function homepageSectionId(value: unknown): HomepageSectionId {
  if (typeof value !== "string" || value.length < 8 || value.length > 80 || !HOMEPAGE_SECTION_ID.test(value)) invalid();
  return value as HomepageSectionId;
}

function parseConfigSectionV3(value: unknown): StarterThemeSectionConfigV3 {
  const candidate = record(value);
  const sectionId = homepageSectionId(candidate.sectionId);
  const legacyCandidate = Object.fromEntries(Object.entries(candidate).filter(([key]) => key !== "sectionId"));
  const section = parseConfigSectionV2(legacyCandidate);
  return Object.freeze({ ...section, sectionId }) as StarterThemeSectionConfigV3;
}

function versionHomepageSections(sections: readonly StarterThemeSectionConfigV2[]): readonly StarterThemeSectionConfigV3[] {
  const occurrences = new Map<string, number>();
  return Object.freeze(sections.map((section) => {
    const occurrence = (occurrences.get(section.kind) ?? 0) + 1;
    occurrences.set(section.kind, occurrence);
    return Object.freeze({ ...section, sectionId: `home_${section.kind}_${occurrence}` }) as StarterThemeSectionConfigV3;
  }));
}

export function normalizeStarterThemeCompositionV3(value: StarterThemeComposition): StarterThemeCompositionConfigV3 {
  const parsed = parseStarterThemeCompositionConfig(value);
  if (parsed.schemaVersion === 3) return parsed;
  if (parsed.schemaVersion === 1) {
    const upgraded = parseStarterThemeCompositionConfig({
      ...parsed,
      schemaVersion: 2,
      visual: { ...parsed.visual, headerWidth: "wide", headerLayout: "menu_logo_actions", sectionSpacing: "balanced" },
      sections: parsed.sections.map((section) => section.kind === "category_grid" ? { ...section, layout: "grid" } : section),
      productDetail: { ...parsed.productDetail, showBreadcrumbs: true, showApprovedReviews: true, showSizeGuide: true, informationSections: ["description", "materials_and_care", "certifications", "shipping_and_returns"] },
      cart: { ...parsed.cart, showQuantitySelector: true },
      footer: {
        tone: "dark",
        groups: [
          { heading: "Mağaza", links: [{ kind: "system", destination: "/products" }] },
          { heading: "Hesap", links: [{ kind: "system", destination: "/account" }] },
        ],
        newsletter: { enabled: false, heading: "Bizden haber alın", body: "Yeni ürün ve mağaza duyurularını e-postanızda alın.", consentLabel: "Aydınlatma metnini okudum ve iletişime izin veriyorum." },
        social: [],
      },
    });
    if (upgraded.schemaVersion !== 2) invalid();
    return Object.freeze({ ...upgraded, schemaVersion: 3, sections: versionHomepageSections(upgraded.sections) });
  }
  return Object.freeze({ ...parsed, schemaVersion: 3, sections: versionHomepageSections(parsed.sections) });
}

function parseProductDetailV2(value: unknown): StarterProductDetailConfigV2 {
  const parsed = exact(value, ["galleryStyle", "showSku", "showBrand", "showBreadcrumbs", "showRelatedProducts", "showApprovedReviews", "mobileStickyPurchase", "showSizeGuide", "informationSections"]);
  const informationSections = Object.freeze(arrayValues(parsed.informationSections, 1, 4).map((entry) => oneOf(entry, INFORMATION_SECTIONS)));
  if (new Set(informationSections).size !== informationSections.length) invalid();
  return Object.freeze({
    galleryStyle: oneOf(parsed.galleryStyle, GALLERY_STYLES),
    showSku: boolean(parsed.showSku),
    showBrand: boolean(parsed.showBrand),
    showBreadcrumbs: boolean(parsed.showBreadcrumbs),
    showRelatedProducts: boolean(parsed.showRelatedProducts),
    showApprovedReviews: boolean(parsed.showApprovedReviews),
    mobileStickyPurchase: boolean(parsed.mobileStickyPurchase),
    showSizeGuide: boolean(parsed.showSizeGuide),
    informationSections,
  });
}

function parseFooterLinkConfig(value: unknown): StarterFooterConfig["groups"][number]["links"][number] {
  const candidate = record(value);
  if (candidate.kind === "fixed_policy") {
    const parsed = exact(candidate, ["kind", "policyKey"]);
    return Object.freeze({ kind: "fixed_policy", policyKey: oneOf(parsed.policyKey, FOOTER_POLICY_KEYS) });
  }
  if (candidate.kind === "category") {
    const parsed = exact(candidate, ["kind", "categoryId"]);
    return Object.freeze({ kind: "category", categoryId: uuid(parsed.categoryId) });
  }
  if (candidate.kind === "page") {
    const parsed = exact(candidate, ["kind", "pageId"]);
    return Object.freeze({ kind: "page", pageId: uuid(parsed.pageId) });
  }
  if (candidate.kind === "system") {
    const parsed = exact(candidate, ["kind", "destination"]);
    return Object.freeze({ kind: "system", destination: oneOf(parsed.destination, FOOTER_SYSTEM_DESTINATIONS) });
  }
  return invalid();
}

function parseFooterConfig(value: unknown): StarterFooterConfig {
  const parsed = exact(value, ["tone", "groups", "newsletter", "social"]);
  const groups = Object.freeze(arrayValues(parsed.groups, 2, 4).map((entry) => {
    const group = exact(entry, ["heading", "links"]);
    const links = Object.freeze(arrayValues(group.links, 1, 8).map(parseFooterLinkConfig));
    if (new Set(links.map((link) => JSON.stringify(link))).size !== links.length) invalid();
    return Object.freeze({ heading: string(group.heading, 1, 80), links });
  }));
  if (new Set(groups.map(({ heading }) => heading)).size !== groups.length) invalid();
  const newsletter = exact(parsed.newsletter, ["enabled", "heading", "body", "consentLabel"]);
  const social = Object.freeze(arrayValues(parsed.social, 0, 6).map((entry) => {
    const item = exact(entry, ["network", "url"]);
    const network = oneOf(item.network, SOCIAL_NETWORKS);
    return Object.freeze({ network, url: socialUrl(item.url, network) });
  }));
  if (new Set(social.map(({ network }) => network)).size !== social.length) invalid();
  return Object.freeze({
    tone: oneOf(parsed.tone, FOOTER_TONES),
    groups,
    newsletter: Object.freeze({ enabled: boolean(newsletter.enabled), heading: string(newsletter.heading, 1, 120), body: string(newsletter.body, 1, 500), consentLabel: string(newsletter.consentLabel, 1, 300) }),
    social,
  });
}

export function parseStarterThemeCompositionConfig(value: unknown): StarterThemeComposition {
  const root = record(value);
  const retail = root.schemaVersion === 2 || root.schemaVersion === 3;
  const versioned = root.schemaVersion === 3;
  const parsed = exact(root, retail ? ["schemaVersion", "visual", "announcement", "navigation", "sections", "productDetail", "cart", "footer"] : ["schemaVersion", "visual", "announcement", "navigation", "sections", "productDetail", "cart"]);
  if (parsed.schemaVersion !== 1 && parsed.schemaVersion !== 2 && parsed.schemaVersion !== 3) invalid();
  const announcementValue = exact(parsed.announcement, ["enabled", "items"], ["destination"]);
  const announcementItems = Object.freeze(arrayValues(announcementValue.items, 0, 12).map((item) => string(item, 1, 160)));
  const announcementEnabled = boolean(announcementValue.enabled);
  if (announcementEnabled && announcementItems.length === 0) invalid();
  const navigationValue = exact(parsed.navigation, ["rootCategoryIds"], ["featuredCategoryId", "featuredAssetId"]);
  const hasFeaturedCategory = Object.hasOwn(navigationValue, "featuredCategoryId");
  const hasFeaturedAsset = Object.hasOwn(navigationValue, "featuredAssetId");
  if (hasFeaturedCategory !== hasFeaturedAsset) invalid();
  const sectionValues = arrayValues(parsed.sections, 0, 12);
  const sections = versioned
    ? Object.freeze(sectionValues.map(parseConfigSectionV3))
    : retail
      ? Object.freeze(sectionValues.map(parseConfigSectionV2))
    : Object.freeze(sectionValues.map(parseConfigSection));
  const singletonKinds = new Set<string>();
  const sectionIds = new Set<string>();
  let productRows = 0;
  for (const section of sections) {
    if ("sectionId" in section) {
      if (typeof section.sectionId !== "string") invalid();
      if (sectionIds.has(section.sectionId)) invalid();
      sectionIds.add(section.sectionId);
    }
    if (section.kind === "product_row") {
      productRows += 1;
      if (productRows > 4) invalid();
      continue;
    }
    if (singletonKinds.has(section.kind)) invalid();
    singletonKinds.add(section.kind);
  }
  const cartValue = exact(parsed.cart, retail
    ? ["showCheckoutReadiness", "showShippingProgress", "showQuantitySelector"]
    : ["showCheckoutReadiness", "showShippingProgress"], ["trustMessage"]);
  const common = {
    announcement: Object.freeze({ enabled: announcementEnabled, items: announcementItems, ...(Object.hasOwn(announcementValue, "destination") ? { destination: destination(announcementValue.destination) } : {}) }),
    navigation: Object.freeze({ rootCategoryIds: uuidArray(navigationValue.rootCategoryIds, 0, 8), ...(hasFeaturedCategory ? { featuredCategoryId: uuid(navigationValue.featuredCategoryId), featuredAssetId: uuid(navigationValue.featuredAssetId) } : {}) }),
    sections,
    cart: Object.freeze({ showCheckoutReadiness: boolean(cartValue.showCheckoutReadiness), showShippingProgress: boolean(cartValue.showShippingProgress), ...(retail ? { showQuantitySelector: boolean(cartValue.showQuantitySelector) } : {}), ...(Object.hasOwn(cartValue, "trustMessage") ? { trustMessage: string(cartValue.trustMessage, 1, 160) } : {}) }),
  };
  if (versioned) return Object.freeze({ schemaVersion: 3, visual: parseVisualV2(parsed.visual), ...common, productDetail: parseProductDetailV2(parsed.productDetail), footer: parseFooterConfig(parsed.footer) } as StarterThemeCompositionConfigV3);
  if (retail) return Object.freeze({ schemaVersion: 2, visual: parseVisualV2(parsed.visual), ...common, productDetail: parseProductDetailV2(parsed.productDetail), footer: parseFooterConfig(parsed.footer) } as StarterThemeCompositionConfigV2);
  const productDetailValue = exact(parsed.productDetail, ["galleryStyle", "showSku", "showBrand", "showRelatedProducts", "mobileStickyPurchase"]);
  return Object.freeze({ schemaVersion: 1, visual: parseVisual(parsed.visual), ...common, productDetail: Object.freeze({ galleryStyle: oneOf(productDetailValue.galleryStyle, GALLERY_STYLES), showSku: boolean(productDetailValue.showSku), showBrand: boolean(productDetailValue.showBrand), showRelatedProducts: boolean(productDetailValue.showRelatedProducts), mobileStickyPurchase: boolean(productDetailValue.mobileStickyPurchase) }) } as StarterThemeCompositionConfig);
}

function parsePublicNavigationItem(value: unknown, depth: number): PublicStarterNavigationItem {
  const parsed = exact(value, ["name", "slug", "children"], ["featured"]);
  const rawChildren = arrayValues(parsed.children, 0, 8);
  if (depth >= 2 && rawChildren.length > 0) invalid();
  const children = Object.freeze(rawChildren.map((child) => parsePublicNavigationItem(child, depth + 1)));
  const childSlugs = children.map((child) => child.slug);
  if (new Set(childSlugs).size !== childSlugs.length) invalid();
  let featured: PublicStarterNavigationItem["featured"];
  if (Object.hasOwn(parsed, "featured")) {
    const selected = exact(parsed.featured, ["name", "slug", "image"]);
    featured = Object.freeze({ name: string(selected.name, 1, 160), slug: string(selected.slug, 1, 100, SLUG), image: parseStorefrontAsset(selected.image) });
  }
  return Object.freeze({ name: string(parsed.name, 1, 160), slug: string(parsed.slug, 1, 100, SLUG), children, ...(featured ? { featured } : {}) });
}

function parseNavigation(value: unknown): PublicStarterNavigation {
  const parsed = exact(value, ["items"]);
  const items = Object.freeze(arrayValues(parsed.items, 0, 8).map((item) => parsePublicNavigationItem(item, 0)));
  const slugs = items.map((item) => item.slug);
  if (new Set(slugs).size !== slugs.length) invalid();
  return Object.freeze({ items });
}

function parseAnnouncement(value: unknown): NonNullable<PublicStarterThemePresentationV2["announcement"]> {
  const parsed = exact(value, ["items"], ["destination"]);
  return Object.freeze({ items: Object.freeze(arrayValues(parsed.items, 1, 12).map((item) => string(item, 1, 160))), ...(Object.hasOwn(parsed, "destination") ? { destination: destination(parsed.destination) } : {}) });
}

function parsePublicReview(value: unknown): PublicStarterReview {
  const parsed = exact(value, ["reviewerName", "rating", "body"], ["title", "merchantReply"]);
  const rating = integer(parsed.rating, 1, 5) as 1 | 2 | 3 | 4 | 5;
  return Object.freeze({
    reviewerName: string(parsed.reviewerName, 1, 120),
    rating,
    ...(Object.hasOwn(parsed, "title") ? { title: string(parsed.title, 1, 200) } : {}),
    body: string(parsed.body, 1, 2000),
    ...(Object.hasOwn(parsed, "merchantReply") ? { merchantReply: string(parsed.merchantReply, 1, 1000) } : {}),
  });
}

function parsePublicHomeSection(value: unknown, retail = false): PublicStarterHomeSection {
  const rawCandidate = record(value);
  const sectionId = Object.hasOwn(rawCandidate, "sectionId") ? homepageSectionId(rawCandidate.sectionId) : undefined;
  const candidate = record(Object.fromEntries(Object.entries(rawCandidate).filter(([key]) => key !== "sectionId")));
  const resolved = <T extends object>(section: T): Readonly<T & { sectionId?: HomepageSectionId }> => Object.freeze({
    ...section,
    ...(sectionId ? { sectionId } : {}),
  });
  if (retail && candidate.kind === "value_propositions") {
    const parsed = exact(candidate, ["kind", "items"]);
    const items = Object.freeze(arrayValues(parsed.items, 2, 4).map((entry) => {
      const item = exact(entry, ["icon", "heading", "body"]);
      return Object.freeze({ icon: oneOf(item.icon, VALUE_ICONS), heading: string(item.heading, 1, 120), body: string(item.body, 1, 300) });
    }));
    if (new Set(items.map(({ heading }) => heading)).size !== items.length) invalid();
    return resolved({ kind: "value_propositions" as const, items });
  }
  if (retail && candidate.kind === "testimonials") {
    const parsed = exact(candidate, ["kind", "heading", "items"]);
    return resolved({ kind: "testimonials" as const, heading: string(parsed.heading, 1, 160), items: Object.freeze(arrayValues(parsed.items, 1, 9).map(parsePublicReview)) });
  }
  const kind = oneOf(candidate.kind, Object.freeze(["hero", "category_grid", "product_row", "split_campaign", "brand_story"] as const));
  if (kind === "hero") {
    const parsed = exact(candidate, ["kind", "slides"]);
    const slides = Object.freeze(arrayValues(parsed.slides, 1, 3).map((slide) => {
      const selected = exact(slide, ["heading", "destination"], ["eyebrow", "body", "desktopImage", "mobileImage", "hotspot"]);
      let hotspot: Readonly<{ productSlug: string; title: string; priceCents: number; currency: "TRY" }> | undefined;
      if (Object.hasOwn(selected, "hotspot")) {
        const raw = exact(selected.hotspot, ["productSlug", "title", "priceCents", "currency"]);
        if (raw.currency !== "TRY") invalid();
        hotspot = Object.freeze({ productSlug: string(raw.productSlug, 3, 100, SLUG), title: string(raw.title, 1, 200), priceCents: integer(raw.priceCents, 0), currency: "TRY" });
      }
      return Object.freeze({ ...(Object.hasOwn(selected, "eyebrow") ? { eyebrow: string(selected.eyebrow, 1, 80) } : {}), heading: string(selected.heading, 1, 160), ...(Object.hasOwn(selected, "body") ? { body: string(selected.body, 1, 500) } : {}), ...(Object.hasOwn(selected, "desktopImage") ? { desktopImage: parseStorefrontAsset(selected.desktopImage) } : {}), ...(Object.hasOwn(selected, "mobileImage") ? { mobileImage: parseStorefrontAsset(selected.mobileImage) } : {}), destination: destination(selected.destination), ...(hotspot ? { hotspot } : {}) });
    }));
    return resolved({ kind, slides });
  }
  if (kind === "category_grid") {
    const parsed = exact(candidate, ["kind", "heading", "items"], ["layout"]);
    const items = Object.freeze(arrayValues(parsed.items, 1, 8).map((item) => {
      const selected = exact(item, ["name", "slug", "image"]);
      return Object.freeze({ name: string(selected.name, 1, 160), slug: string(selected.slug, 1, 100, SLUG), image: parseStorefrontAsset(selected.image) });
    }));
    if (new Set(items.map((item) => item.slug)).size !== items.length) invalid();
    return resolved({
      kind,
      heading: string(parsed.heading, 1, 160),
      layout: Object.hasOwn(parsed, "layout") ? oneOf(parsed.layout, CATEGORY_SHOWCASE_LAYOUTS) : "grid",
      items,
    });
  }
  if (kind === "product_row") {
    const parsed = exact(candidate, ["kind", "key", "heading", "source", "limit"], ["categorySlug"]);
    const source = oneOf(parsed.source, PRODUCT_ROW_SOURCES);
    const limit = integer(parsed.limit, 4, 12);
    if (![4, 8, 12].includes(limit) || (source === "category") !== Object.hasOwn(parsed, "categorySlug")) invalid();
    return resolved({ kind, key: string(parsed.key, 1, 64, SLUG), heading: string(parsed.heading, 1, 160), source, ...(source === "category" ? { categorySlug: string(parsed.categorySlug, 1, 100, SLUG) } : {}), limit: limit as 4 | 8 | 12 });
  }
  if (kind === "split_campaign") {
    const parsed = exact(candidate, ["kind", "panels"]);
    const panels = Object.freeze(arrayValues(parsed.panels, 1, 2).map((panel) => {
      const selected = exact(panel, ["heading", "image", "destination"], ["eyebrow", "body"]);
      return Object.freeze({ ...(Object.hasOwn(selected, "eyebrow") ? { eyebrow: string(selected.eyebrow, 1, 80) } : {}), heading: string(selected.heading, 1, 160), ...(Object.hasOwn(selected, "body") ? { body: string(selected.body, 1, 500) } : {}), image: parseStorefrontAsset(selected.image), destination: destination(selected.destination) });
    }));
    return resolved({ kind, panels });
  }
  const parsed = exact(candidate, ["kind", "heading", "body"], ["eyebrow", "image", "destination"]);
  return resolved({ kind: "brand_story" as const, ...(Object.hasOwn(parsed, "eyebrow") ? { eyebrow: string(parsed.eyebrow, 1, 80) } : {}), heading: string(parsed.heading, 1, 160), body: string(parsed.body, 1, 1000), ...(Object.hasOwn(parsed, "image") ? { image: parseStorefrontAsset(parsed.image) } : {}), ...(Object.hasOwn(parsed, "destination") ? { destination: destination(parsed.destination) } : {}) });
}

function parsePublicFooter(value: unknown): PublicStarterFooter {
  const parsed = exact(value, ["tone", "groups", "newsletter", "social"]);
  const groups = Object.freeze(arrayValues(parsed.groups, 2, 4).map((entry) => {
    const group = exact(entry, ["heading", "links"]);
    const links = Object.freeze(arrayValues(group.links, 1, 8).map((entry) => {
      const link = exact(entry, ["label", "destination"]);
      return Object.freeze({ label: string(link.label, 1, 120), destination: destination(link.destination) });
    }));
    if (new Set(links.map(({ destination: selected }) => selected)).size !== links.length) invalid();
    return Object.freeze({ heading: string(group.heading, 1, 80), links });
  }));
  if (new Set(groups.map(({ heading }) => heading)).size !== groups.length) invalid();
  const newsletter = exact(parsed.newsletter, ["enabled", "heading", "body", "consentLabel"]);
  const social = Object.freeze(arrayValues(parsed.social, 0, 6).map((entry) => {
    const item = exact(entry, ["network", "url"]);
    const network = oneOf(item.network, SOCIAL_NETWORKS);
    return Object.freeze({ network, url: socialUrl(item.url, network) });
  }));
  if (new Set(social.map(({ network }) => network)).size !== social.length) invalid();
  return Object.freeze({
    tone: oneOf(parsed.tone, FOOTER_TONES), groups,
    newsletter: Object.freeze({ enabled: boolean(newsletter.enabled), heading: string(newsletter.heading, 1, 120), body: string(newsletter.body, 1, 500), consentLabel: string(newsletter.consentLabel, 1, 300) }),
    social,
  });
}

function parseProductDetail(value: unknown): PublicStarterThemePresentationV2["productDetail"] {
  const parsed = exact(value, ["galleryStyle", "showSku", "showBrand", "showRelatedProducts", "mobileStickyPurchase"]);
  return Object.freeze({ galleryStyle: oneOf(parsed.galleryStyle, GALLERY_STYLES), showSku: boolean(parsed.showSku), showBrand: boolean(parsed.showBrand), showRelatedProducts: boolean(parsed.showRelatedProducts), mobileStickyPurchase: boolean(parsed.mobileStickyPurchase) });
}

function parseCartOptions(value: unknown): PublicStarterThemePresentationV2["cart"] {
  const parsed = exact(value, ["showCheckoutReadiness", "showShippingProgress", "showQuantitySelector"], ["trustMessage"]);
  return Object.freeze({ showCheckoutReadiness: boolean(parsed.showCheckoutReadiness), showShippingProgress: boolean(parsed.showShippingProgress), showQuantitySelector: boolean(parsed.showQuantitySelector), ...(Object.hasOwn(parsed, "trustMessage") ? { trustMessage: string(parsed.trustMessage, 1, 160) } : {}) });
}

function parsePresentationV1(value: unknown): PublicStarterThemePresentationV1 {
  const parsed = exact(value, ["schemaVersion", "displayName", "theme", "hero", "seo"], ["supportEmail", "logo", "promotion", "marquee", "categoryShowcase"]);
  if (parsed.schemaVersion !== 1) invalid();
  return Object.freeze({ schemaVersion: 1, displayName: string(parsed.displayName, 1, 160), ...(Object.hasOwn(parsed, "supportEmail") ? { supportEmail: email(parsed.supportEmail) } : {}), ...(Object.hasOwn(parsed, "logo") ? { logo: parseStorefrontAsset(parsed.logo) } : {}), theme: parseTheme(parsed.theme), hero: parseHero(parsed.hero), ...(Object.hasOwn(parsed, "promotion") ? { promotion: parsePromotion(parsed.promotion) } : {}), ...(Object.hasOwn(parsed, "marquee") ? { marquee: parseMarquee(parsed.marquee) } : {}), ...(Object.hasOwn(parsed, "categoryShowcase") ? { categoryShowcase: parseCategoryShowcase(parsed.categoryShowcase) } : {}), seo: parseSeo(parsed.seo) });
}

function parsePresentationV2(value: unknown): PublicStarterThemePresentationV2 {
  const parsed = exact(value, ["schemaVersion", "displayName", "theme", "hero", "visual", "navigation", "sections", "productDetail", "cart", "seo"], ["supportEmail", "logo", "promotion", "marquee", "categoryShowcase", "announcement"]);
  if (parsed.schemaVersion !== 2) invalid();
  const sections = Object.freeze(arrayValues(parsed.sections, 0, 12).map((section) => parsePublicHomeSection(section, false) as PublicStarterHomeSectionV2));
  const singletonKinds = new Set<string>();
  const keys = new Set<string>();
  for (const section of sections) {
    if (section.kind === "product_row") {
      if (keys.has(section.key)) invalid();
      keys.add(section.key);
      continue;
    }
    if (singletonKinds.has(section.kind)) invalid();
    singletonKinds.add(section.kind);
  }
  return Object.freeze({
    schemaVersion: 2,
    displayName: string(parsed.displayName, 1, 160),
    ...(Object.hasOwn(parsed, "supportEmail") ? { supportEmail: email(parsed.supportEmail) } : {}),
    ...(Object.hasOwn(parsed, "logo") ? { logo: parseStorefrontAsset(parsed.logo) } : {}),
    theme: parseTheme(parsed.theme),
    hero: parseHero(parsed.hero),
    ...(Object.hasOwn(parsed, "promotion") ? { promotion: parsePromotion(parsed.promotion) } : {}),
    ...(Object.hasOwn(parsed, "marquee") ? { marquee: parseMarquee(parsed.marquee) } : {}),
    ...(Object.hasOwn(parsed, "categoryShowcase") ? { categoryShowcase: parseCategoryShowcase(parsed.categoryShowcase) } : {}),
    visual: parseVisual(parsed.visual),
    ...(Object.hasOwn(parsed, "announcement") ? { announcement: parseAnnouncement(parsed.announcement) } : {}),
    navigation: parseNavigation(parsed.navigation),
    sections,
    productDetail: parseProductDetail(parsed.productDetail),
    cart: parseCartOptions(parsed.cart),
    seo: parseSeo(parsed.seo),
  });
}

function parsePresentationV3(value: unknown): PublicStarterThemePresentationV3 {
  const parsed = exact(value, ["schemaVersion", "displayName", "theme", "hero", "visual", "navigation", "sections", "productDetail", "cart", "footer", "seo"], ["supportEmail", "logo", "promotion", "marquee", "categoryShowcase", "announcement"]);
  if (parsed.schemaVersion !== 3) invalid();
  const sections = Object.freeze(arrayValues(parsed.sections, 0, 12).map((section) => parsePublicHomeSection(section, true)));
  const singletonKinds = new Set<string>(), keys = new Set<string>();
  for (const section of sections) {
    if (section.kind === "product_row") { if (keys.has(section.key)) invalid(); keys.add(section.key); continue; }
    if (singletonKinds.has(section.kind)) invalid();
    singletonKinds.add(section.kind);
  }
  return Object.freeze({
    schemaVersion: 3,
    displayName: string(parsed.displayName, 1, 160),
    ...(Object.hasOwn(parsed, "supportEmail") ? { supportEmail: email(parsed.supportEmail) } : {}),
    ...(Object.hasOwn(parsed, "logo") ? { logo: parseStorefrontAsset(parsed.logo) } : {}),
    theme: parseTheme(parsed.theme), hero: parseHero(parsed.hero),
    ...(Object.hasOwn(parsed, "promotion") ? { promotion: parsePromotion(parsed.promotion) } : {}),
    ...(Object.hasOwn(parsed, "marquee") ? { marquee: parseMarquee(parsed.marquee) } : {}),
    ...(Object.hasOwn(parsed, "categoryShowcase") ? { categoryShowcase: parseCategoryShowcase(parsed.categoryShowcase) } : {}),
    visual: parseVisualV2(parsed.visual),
    ...(Object.hasOwn(parsed, "announcement") ? { announcement: parseAnnouncement(parsed.announcement) } : {}),
    navigation: parseNavigation(parsed.navigation), sections,
    productDetail: parseProductDetailV2(parsed.productDetail), cart: parseCartOptions(parsed.cart),
    footer: parsePublicFooter(parsed.footer), seo: parseSeo(parsed.seo),
  });
}

export function parsePublicStarterThemePresentation(value: unknown): PublicStarterThemePresentation {
  const parsed = record(value);
  if (parsed.schemaVersion === 1) return parsePresentationV1(parsed);
  if (parsed.schemaVersion === 2) return parsePresentationV2(parsed);
  if (parsed.schemaVersion === 3) return parsePresentationV3(parsed);
  return invalid();
}

export function parsePublicStorefront(value: unknown): PublicStorefront {
  const parsed = exact(value, ["schemaVersion", "id", "name", "slug", "hostname", "primaryHostname", "canonicalUrl", "currency", "locale", "themeKey", "presentation"]);
  const selectedHostname = hostname(parsed.hostname);
  const primaryHostname = hostname(parsed.primaryHostname);
  const canonicalUrl = httpsUrl(parsed.canonicalUrl);
  if (parsed.schemaVersion !== 2 || parsed.currency !== "TRY" || parsed.locale !== "tr" || canonicalUrl !== `https://${primaryHostname}/`) invalid();
  return Object.freeze({ schemaVersion: 2, id: uuid(parsed.id), name: string(parsed.name, 1, 160), slug: string(parsed.slug, 3, 63, SLUG), hostname: selectedHostname, primaryHostname, canonicalUrl, currency: "TRY", locale: "tr", themeKey: string(parsed.themeKey, 1, 80), presentation: parsePublicStarterThemePresentation(parsed.presentation) });
}

export function parsePublicProductMedia(value: unknown): PublicProductMedia {
  const parsed = exact(value, ["id", "productId", "url", "mediaType", "altText", "sortOrder"], ["variantId", "width", "height"]);
  const width = optionalInteger(parsed, "width", 1, 8192);
  const height = optionalInteger(parsed, "height", 1, 8192);
  if ((width === undefined) !== (height === undefined)) invalid();
  return Object.freeze({ id: uuid(parsed.id), productId: uuid(parsed.productId), ...(Object.hasOwn(parsed, "variantId") ? { variantId: uuid(parsed.variantId) } : {}), url: httpsUrl(parsed.url), mediaType: mediaType(parsed.mediaType), altText: string(parsed.altText, 0, 500), ...(width === undefined ? {} : { width, height }), sortOrder: integer(parsed.sortOrder, 0, 15) });
}

export function parsePublicProductVariant(value: unknown): PublicProductVariant {
  const parsed = exact(value, ["id", "title", "priceCents", "stockTracking", "stockQuantity", "available", "attributes"], ["sku", "compareAtCents"]);
  const priceCents = integer(parsed.priceCents, 0);
  const compareAtCents = optionalInteger(parsed, "compareAtCents", priceCents, Number.MAX_SAFE_INTEGER);
  return Object.freeze({ id: uuid(parsed.id), title: string(parsed.title, 1, 200), ...(Object.hasOwn(parsed, "sku") ? { sku: string(parsed.sku, 1, 64, SKU) } : {}), priceCents, ...(compareAtCents === undefined ? {} : { compareAtCents }), stockTracking: boolean(parsed.stockTracking), stockQuantity: integer(parsed.stockQuantity, 0), available: boolean(parsed.available), attributes: attributes(parsed.attributes) });
}

function parsePublicProductMerchandising(value: unknown): PublicProductMerchandising {
  const parsed = exact(value, ["highlights", "certifications"], ["materialsAndCare", "sizeGuide"]);
  const highlights = Object.freeze(arrayValues(parsed.highlights, 0, 12).map((item) => string(item, 1, 300)));
  const certifications = Object.freeze(arrayValues(parsed.certifications, 0, 12).map((item) => string(item, 1, 200)));
  if (new Set(highlights).size !== highlights.length || new Set(certifications).size !== certifications.length) invalid();
  let sizeGuide: PublicProductMerchandising["sizeGuide"];
  if (Object.hasOwn(parsed, "sizeGuide")) {
    const selected = exact(parsed.sizeGuide, ["heading", "body"]);
    sizeGuide = Object.freeze({ heading: string(selected.heading, 1, 120), body: description(selected.body) });
  }
  return Object.freeze({ highlights, ...(Object.hasOwn(parsed, "materialsAndCare") ? { materialsAndCare: description(parsed.materialsAndCare) } : {}), certifications, ...(sizeGuide ? { sizeGuide } : {}) });
}

export function parsePublicProduct(value: unknown): PublicProduct {
  const parsed = exact(value, ["id", "slug", "title", "currency", "status", "priceCents", "available", "variants", "media"], ["primaryCategoryId", "description", "compareAtCents", "brand", "categoryPath", "merchandising", "reviews"]);
  if (parsed.currency !== "TRY" || parsed.status !== "active" || !Array.isArray(parsed.variants) || !Array.isArray(parsed.media) || parsed.variants.length < 1 || parsed.variants.length > 100 || parsed.media.length > 16) invalid();
  const priceCents = integer(parsed.priceCents, 0);
  const compareAtCents = optionalInteger(parsed, "compareAtCents", priceCents, Number.MAX_SAFE_INTEGER);
  const variants = Object.freeze(parsed.variants.map(parsePublicProductVariant));
  const media = Object.freeze(parsed.media.map(parsePublicProductMedia));
  for (let index = 1; index < media.length; index += 1) if (media[index - 1]!.sortOrder >= media[index]!.sortOrder) invalid();
  const id = uuid(parsed.id);
  if (media.some((item) => item.productId !== id)) invalid();
  const categoryPath = Object.hasOwn(parsed, "categoryPath") ? Object.freeze(arrayValues(parsed.categoryPath, 0, 8).map((value) => { const item = exact(value, ["name", "slug"]); return Object.freeze({ name: string(item.name, 1, 120), slug: string(item.slug, 1, 100, SLUG) }); })) : undefined;
  const brand = Object.hasOwn(parsed, "brand") ? (() => { const value = exact(parsed.brand, ["name", "slug"]); return Object.freeze({ name: string(value.name, 1, 200), slug: string(value.slug, 1, 100, SLUG) }); })() : undefined;
  const merchandising = Object.hasOwn(parsed, "merchandising") ? parsePublicProductMerchandising(parsed.merchandising) : undefined;
  const reviews = Object.hasOwn(parsed, "reviews") ? Object.freeze(arrayValues(parsed.reviews, 0, 20).map(parsePublicReview)) : undefined;
  return Object.freeze({ id, ...(Object.hasOwn(parsed, "primaryCategoryId") ? { primaryCategoryId: uuid(parsed.primaryCategoryId) } : {}), slug: string(parsed.slug, 3, 100, SLUG), title: string(parsed.title, 1, 200), ...(Object.hasOwn(parsed, "description") ? { description: description(parsed.description) } : {}), ...(brand ? { brand } : {}), ...(categoryPath ? { categoryPath } : {}), currency: "TRY", status: "active", priceCents, ...(compareAtCents === undefined ? {} : { compareAtCents }), available: boolean(parsed.available), variants, media, ...(merchandising ? { merchandising } : {}), ...(reviews ? { reviews } : {}) });
}
