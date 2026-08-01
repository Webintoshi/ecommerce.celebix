import type { PublicImageMediaType, PublicProduct, PublicProductMedia, PublicProductVariant, PublicStarterHomeSection, PublicStarterNavigation, PublicStarterNavigationItem, PublicStarterThemePresentation, PublicStarterThemePresentationV1, PublicStarterThemePresentationV2, PublicStorefront, PublicStorefrontAsset, StarterCampaignPanelConfig, StarterHeroSlideConfig, StarterThemeCompositionConfig, StarterThemeSectionConfig, StarterThemeVisual } from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const SKU = /^[A-Z0-9](?:[A-Z0-9._-]{0,63})$/;
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
const GALLERY_STYLES = Object.freeze(["grid", "rail"] as const);
const PRODUCT_ROW_SOURCES = Object.freeze(["latest", "sale", "category"] as const);
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
  if (!selected.startsWith("/") || selected.startsWith("//") || selected.includes("\\") || selected.includes("?") || selected.includes("#") || selected.includes("//")) invalid();
  const segments = selected.split("/");
  if (segments.some((segment, index) => index > 0 && (segment === "" || segment === "." || segment === ".."))) invalid();
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
  const parsed = exact(value, ["heading", "items"]);
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
  return Object.freeze({ heading: string(parsed.heading, 1, 160), items: Object.freeze(items) });
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
    return Object.freeze({ kind, enabled: boolean(parsed.enabled), heading: string(parsed.heading, 1, 160), categoryIds: uuidArray(parsed.categoryIds, 1, 8) });
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
    return Object.freeze({ kind, enabled: boolean(parsed.enabled), panels: Object.freeze(arrayValues(parsed.panels, 1, 2).map(parseCampaignPanelConfig)) });
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

export function parseStarterThemeCompositionConfig(value: unknown): StarterThemeCompositionConfig {
  const parsed = exact(value, ["schemaVersion", "visual", "announcement", "navigation", "sections", "productDetail", "cart"]);
  if (parsed.schemaVersion !== 1) invalid();
  const announcementValue = exact(parsed.announcement, ["enabled", "items"], ["destination"]);
  const announcementItems = Object.freeze(arrayValues(announcementValue.items, 0, 12).map((item) => string(item, 1, 160)));
  const announcementEnabled = boolean(announcementValue.enabled);
  if (announcementEnabled && announcementItems.length === 0) invalid();
  const navigationValue = exact(parsed.navigation, ["rootCategoryIds"], ["featuredCategoryId", "featuredAssetId"]);
  const hasFeaturedCategory = Object.hasOwn(navigationValue, "featuredCategoryId");
  const hasFeaturedAsset = Object.hasOwn(navigationValue, "featuredAssetId");
  if (hasFeaturedCategory !== hasFeaturedAsset) invalid();
  const sections = Object.freeze(arrayValues(parsed.sections, 1, 12).map(parseConfigSection));
  const singletonKinds = new Set<string>();
  for (const section of sections) {
    if (section.kind === "product_row") continue;
    if (singletonKinds.has(section.kind)) invalid();
    singletonKinds.add(section.kind);
  }
  const productDetailValue = exact(parsed.productDetail, ["galleryStyle", "showSku", "showBrand", "showRelatedProducts", "mobileStickyPurchase"]);
  const cartValue = exact(parsed.cart, ["showCheckoutReadiness", "showShippingProgress"], ["trustMessage"]);
  return Object.freeze({
    schemaVersion: 1,
    visual: parseVisual(parsed.visual),
    announcement: Object.freeze({ enabled: announcementEnabled, items: announcementItems, ...(Object.hasOwn(announcementValue, "destination") ? { destination: destination(announcementValue.destination) } : {}) }),
    navigation: Object.freeze({ rootCategoryIds: uuidArray(navigationValue.rootCategoryIds, 0, 8), ...(hasFeaturedCategory ? { featuredCategoryId: uuid(navigationValue.featuredCategoryId), featuredAssetId: uuid(navigationValue.featuredAssetId) } : {}) }),
    sections,
    productDetail: Object.freeze({ galleryStyle: oneOf(productDetailValue.galleryStyle, GALLERY_STYLES), showSku: boolean(productDetailValue.showSku), showBrand: boolean(productDetailValue.showBrand), showRelatedProducts: boolean(productDetailValue.showRelatedProducts), mobileStickyPurchase: boolean(productDetailValue.mobileStickyPurchase) }),
    cart: Object.freeze({ showCheckoutReadiness: boolean(cartValue.showCheckoutReadiness), showShippingProgress: boolean(cartValue.showShippingProgress), ...(Object.hasOwn(cartValue, "trustMessage") ? { trustMessage: string(cartValue.trustMessage, 1, 160) } : {}) }),
  });
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

function parsePublicHomeSection(value: unknown): PublicStarterHomeSection {
  const candidate = record(value);
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
    return Object.freeze({ kind, slides });
  }
  if (kind === "category_grid") {
    const parsed = exact(candidate, ["kind", "heading", "items"]);
    const items = Object.freeze(arrayValues(parsed.items, 1, 8).map((item) => {
      const selected = exact(item, ["name", "slug", "image"]);
      return Object.freeze({ name: string(selected.name, 1, 160), slug: string(selected.slug, 1, 100, SLUG), image: parseStorefrontAsset(selected.image) });
    }));
    if (new Set(items.map((item) => item.slug)).size !== items.length) invalid();
    return Object.freeze({ kind, heading: string(parsed.heading, 1, 160), items });
  }
  if (kind === "product_row") {
    const parsed = exact(candidate, ["kind", "key", "heading", "source", "limit"], ["categorySlug"]);
    const source = oneOf(parsed.source, PRODUCT_ROW_SOURCES);
    const limit = integer(parsed.limit, 4, 12);
    if (![4, 8, 12].includes(limit) || (source === "category") !== Object.hasOwn(parsed, "categorySlug")) invalid();
    return Object.freeze({ kind, key: string(parsed.key, 1, 64, SLUG), heading: string(parsed.heading, 1, 160), source, ...(source === "category" ? { categorySlug: string(parsed.categorySlug, 1, 100, SLUG) } : {}), limit: limit as 4 | 8 | 12 });
  }
  if (kind === "split_campaign") {
    const parsed = exact(candidate, ["kind", "panels"]);
    const panels = Object.freeze(arrayValues(parsed.panels, 1, 2).map((panel) => {
      const selected = exact(panel, ["heading", "image", "destination"], ["eyebrow", "body"]);
      return Object.freeze({ ...(Object.hasOwn(selected, "eyebrow") ? { eyebrow: string(selected.eyebrow, 1, 80) } : {}), heading: string(selected.heading, 1, 160), ...(Object.hasOwn(selected, "body") ? { body: string(selected.body, 1, 500) } : {}), image: parseStorefrontAsset(selected.image), destination: destination(selected.destination) });
    }));
    return Object.freeze({ kind, panels });
  }
  const parsed = exact(candidate, ["kind", "heading", "body"], ["eyebrow", "image", "destination"]);
  return Object.freeze({ kind: "brand_story", ...(Object.hasOwn(parsed, "eyebrow") ? { eyebrow: string(parsed.eyebrow, 1, 80) } : {}), heading: string(parsed.heading, 1, 160), body: string(parsed.body, 1, 1000), ...(Object.hasOwn(parsed, "image") ? { image: parseStorefrontAsset(parsed.image) } : {}), ...(Object.hasOwn(parsed, "destination") ? { destination: destination(parsed.destination) } : {}) });
}

function parseProductDetail(value: unknown): PublicStarterThemePresentationV2["productDetail"] {
  const parsed = exact(value, ["galleryStyle", "showSku", "showBrand", "showRelatedProducts", "mobileStickyPurchase"]);
  return Object.freeze({ galleryStyle: oneOf(parsed.galleryStyle, GALLERY_STYLES), showSku: boolean(parsed.showSku), showBrand: boolean(parsed.showBrand), showRelatedProducts: boolean(parsed.showRelatedProducts), mobileStickyPurchase: boolean(parsed.mobileStickyPurchase) });
}

function parseCartOptions(value: unknown): PublicStarterThemePresentationV2["cart"] {
  const parsed = exact(value, ["showCheckoutReadiness", "showShippingProgress"], ["trustMessage"]);
  return Object.freeze({ showCheckoutReadiness: boolean(parsed.showCheckoutReadiness), showShippingProgress: boolean(parsed.showShippingProgress), ...(Object.hasOwn(parsed, "trustMessage") ? { trustMessage: string(parsed.trustMessage, 1, 160) } : {}) });
}

function parsePresentationV1(value: unknown): PublicStarterThemePresentationV1 {
  const parsed = exact(value, ["schemaVersion", "displayName", "theme", "hero", "seo"], ["supportEmail", "logo", "promotion", "marquee", "categoryShowcase"]);
  if (parsed.schemaVersion !== 1) invalid();
  return Object.freeze({ schemaVersion: 1, displayName: string(parsed.displayName, 1, 160), ...(Object.hasOwn(parsed, "supportEmail") ? { supportEmail: email(parsed.supportEmail) } : {}), ...(Object.hasOwn(parsed, "logo") ? { logo: parseStorefrontAsset(parsed.logo) } : {}), theme: parseTheme(parsed.theme), hero: parseHero(parsed.hero), ...(Object.hasOwn(parsed, "promotion") ? { promotion: parsePromotion(parsed.promotion) } : {}), ...(Object.hasOwn(parsed, "marquee") ? { marquee: parseMarquee(parsed.marquee) } : {}), ...(Object.hasOwn(parsed, "categoryShowcase") ? { categoryShowcase: parseCategoryShowcase(parsed.categoryShowcase) } : {}), seo: parseSeo(parsed.seo) });
}

function parsePresentationV2(value: unknown): PublicStarterThemePresentationV2 {
  const parsed = exact(value, ["schemaVersion", "displayName", "theme", "hero", "visual", "navigation", "sections", "productDetail", "cart", "seo"], ["supportEmail", "logo", "promotion", "marquee", "categoryShowcase", "announcement"]);
  if (parsed.schemaVersion !== 2) invalid();
  const sections = Object.freeze(arrayValues(parsed.sections, 1, 12).map(parsePublicHomeSection));
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

export function parsePublicStarterThemePresentation(value: unknown): PublicStarterThemePresentation {
  const parsed = record(value);
  if (parsed.schemaVersion === 1) return parsePresentationV1(parsed);
  if (parsed.schemaVersion === 2) return parsePresentationV2(parsed);
  return invalid();
}

export function parsePublicStorefront(value: unknown): PublicStorefront {
  const parsed = exact(value, ["schemaVersion", "id", "name", "slug", "hostname", "primaryHostname", "canonicalUrl", "currency", "locale", "themeKey", "presentation"]);
  const selectedHostname = hostname(parsed.hostname);
  const primaryHostname = hostname(parsed.primaryHostname);
  const canonicalUrl = httpsUrl(parsed.canonicalUrl);
  if (parsed.schemaVersion !== 2 || parsed.currency !== "TRY" || parsed.locale !== "tr" || canonicalUrl !== `https://${selectedHostname}/`) invalid();
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

export function parsePublicProduct(value: unknown): PublicProduct {
  const parsed = exact(value, ["id", "slug", "title", "currency", "status", "priceCents", "available", "variants", "media"], ["description", "compareAtCents"]);
  if (parsed.currency !== "TRY" || parsed.status !== "active" || !Array.isArray(parsed.variants) || !Array.isArray(parsed.media) || parsed.variants.length < 1 || parsed.variants.length > 100 || parsed.media.length > 16) invalid();
  const priceCents = integer(parsed.priceCents, 0);
  const compareAtCents = optionalInteger(parsed, "compareAtCents", priceCents, Number.MAX_SAFE_INTEGER);
  const variants = Object.freeze(parsed.variants.map(parsePublicProductVariant));
  const media = Object.freeze(parsed.media.map(parsePublicProductMedia));
  for (let index = 1; index < media.length; index += 1) if (media[index - 1]!.sortOrder >= media[index]!.sortOrder) invalid();
  const id = uuid(parsed.id);
  if (media.some((item) => item.productId !== id)) invalid();
  return Object.freeze({ id, slug: string(parsed.slug, 3, 100, SLUG), title: string(parsed.title, 1, 200), ...(Object.hasOwn(parsed, "description") ? { description: description(parsed.description) } : {}), currency: "TRY", status: "active", priceCents, ...(compareAtCents === undefined ? {} : { compareAtCents }), available: boolean(parsed.available), variants, media });
}
