import {
  STOREFRONT_DESIGN_ANNOUNCEMENT_ANIMATIONS,
  STOREFRONT_DESIGN_ANNOUNCEMENT_DIRECTIONS,
  STOREFRONT_DESIGN_ANNOUNCEMENT_ICONS,
  STOREFRONT_DESIGN_ANNOUNCEMENT_SPEEDS,
  STOREFRONT_DESIGN_FONT_CATEGORIES,
  STOREFRONT_DESIGN_FONT_FAMILIES,
  STOREFRONT_DESIGN_FONT_WEIGHTS,
} from "./types.ts";
import { STOREFRONT_ASSET_KINDS } from "../storefront-assets/types.ts";
import { createDefaultStarterThemeComposition } from "./defaults.ts";
import { normalizeStarterThemeCompositionV3, normalizeStarterThemeCompositionV4, parseBannerMediaReference, parseStarterThemeCompositionConfig } from "../storefront/validation.ts";
import type {
  DesignDestination,
  DesignMediaReference,
  PublicDesignDestination,
  PublicDesignMedia,
  PublicStorefrontDesign,
  StorefrontDesignAnnouncement,
  StorefrontDesignDestinationOption,
  StorefrontDesignDocument,
  StorefrontDesignDocumentV5,
  StorefrontDesignEditorWorkspace,
  StorefrontDesignEditorMediaOption,
  StorefrontDesignApplyMutation,
  StorefrontDesignHeroSlide,
  StorefrontDesignFontOption,
  StorefrontDesignMediaOption,
  StorefrontDesignAssetOption,
  StorefrontDesignPublishIssue,
  StorefrontDesignTypography,
  StorefrontDesignWorkspace,
} from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HEX_COLOR = /^#[0-9A-F]{6}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const PATH = /^\/(?:[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*)?$/;
const TIMEZONE = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)+$/;
const MEDIA_TYPES = Object.freeze(["image/jpeg", "image/png", "image/webp"] as const);
const FONT_FAMILY = /^[A-Za-z0-9][A-Za-z0-9 .&()+-]{0,119}$/;

function invalid(): never {
  throw new TypeError("storefront_design_contract_invalid");
}

function rejectAccessors(value: object): void {
  let descriptors: Record<PropertyKey, PropertyDescriptor>;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return invalid();
  }
  for (const descriptor of Object.values(descriptors)) {
    if (descriptor?.get || descriptor?.set) invalid();
  }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  let prototype: object | null;
  try {
    prototype = Object.getPrototypeOf(value);
  } catch {
    return invalid();
  }
  if (prototype !== Object.prototype && prototype !== null) invalid();
  rejectAccessors(value);
  return value as Record<string, unknown>;
}

function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  const parsed = record(value);
  const allowed = new Set([...required, ...optional]);
  let keys: string[];
  try {
    keys = Object.keys(parsed);
  } catch {
    return invalid();
  }
  if (required.some((key) => !Object.hasOwn(parsed, key)) || keys.some((key) => !allowed.has(key))) invalid();
  return parsed;
}

function array(value: unknown, minimum: number, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) invalid();
  rejectAccessors(value);
  const keys = Object.keys(value);
  if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) invalid();
  return value;
}

function text(value: unknown, minimum: number, maximum: number): string {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum || value !== value.trim() || CONTROL.test(value)) invalid();
  return value;
}

function uuid(value: unknown): string {
  const parsed = text(value, 36, 36);
  if (!UUID.test(parsed)) invalid();
  return parsed;
}

function positiveInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) invalid();
  return value as number;
}

function boundedInteger(value: unknown, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) invalid();
  return value as number;
}

function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") invalid();
  return value;
}

function oneOf<const T extends readonly string[]>(value: unknown, allowed: T): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) invalid();
  return value as T[number];
}

function color(value: unknown): string {
  const parsed = text(value, 7, 7);
  if (!HEX_COLOR.test(parsed)) invalid();
  return parsed;
}

function timestamp(value: unknown): string {
  const parsed = text(value, 24, 24);
  const date = new Date(parsed);
  if (!Number.isFinite(date.valueOf()) || date.toISOString() !== parsed) invalid();
  return parsed;
}

function optionalTimestamp(value: unknown): string | null {
  return value === null ? null : timestamp(value);
}

function httpsUrl(value: unknown): string {
  const parsed = text(value, 1, 2048);
  let url: URL;
  try {
    url = new URL(parsed);
  } catch {
    return invalid();
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.toString() !== parsed) invalid();
  return parsed;
}

function path(value: unknown): string {
  const parsed = text(value, 1, 512);
  if (!PATH.test(parsed) || parsed.includes("..")) invalid();
  return parsed;
}

function timezone(value: unknown): string {
  const parsed = text(value, 3, 80);
  if (!TIMEZONE.test(parsed)) invalid();
  try {
    new Intl.DateTimeFormat("en", { timeZone: parsed }).format(0);
  } catch {
    return invalid();
  }
  return parsed;
}

function parseMediaReference(value: unknown, allowRetainedLegacy = false): DesignMediaReference {
  if (value === null) return null;
  if (allowRetainedLegacy && record(value).kind === "legacy_https") {
    const parsed = parseBannerMediaReference(value);
    if (parsed?.kind !== "legacy_https") invalid();
    return parsed;
  }
  const parsed = exact(value, ["kind", "mediaId"]);
  if (parsed.kind !== "media") invalid();
  return Object.freeze({ kind: "media", mediaId: uuid(parsed.mediaId) });
}

function parseDestination(value: unknown): DesignDestination {
  const base = record(value);
  if (base.kind === "none") {
    exact(base, ["kind"]);
    return Object.freeze({ kind: "none" });
  }
  const parsed = exact(base, ["kind", "resourceId"]);
  if (parsed.kind !== "product" && parsed.kind !== "collection" && parsed.kind !== "catalog_collection" && parsed.kind !== "page") invalid();
  return Object.freeze({ kind: parsed.kind, resourceId: uuid(parsed.resourceId) });
}

function parseAnnouncement(value: unknown, maximumLength = 120): StorefrontDesignAnnouncement {
  const parsed = exact(value, ["items", "icon", "speed", "direction", "animation", "enabled"]);
  const items = Object.freeze(array(parsed.items, 1, 12).map((item) => text(item, 1, maximumLength)));
  return Object.freeze({
    items,
    icon: oneOf(parsed.icon, STOREFRONT_DESIGN_ANNOUNCEMENT_ICONS),
    speed: oneOf(parsed.speed, STOREFRONT_DESIGN_ANNOUNCEMENT_SPEEDS),
    direction: oneOf(parsed.direction, STOREFRONT_DESIGN_ANNOUNCEMENT_DIRECTIONS),
    animation: oneOf(parsed.animation, STOREFRONT_DESIGN_ANNOUNCEMENT_ANIMATIONS),
    enabled: boolean(parsed.enabled),
  });
}

function legacyFontOption(value: unknown): StorefrontDesignFontOption {
  const family = oneOf(value, STOREFRONT_DESIGN_FONT_FAMILIES);
  const resolved = family === "manrope"
    ? { family: "Manrope", category: "sans-serif" as const }
    : family === "montserrat"
      ? { family: "Montserrat", category: "sans-serif" as const }
      : family === "playfair"
        ? { family: "Playfair Display", category: "serif" as const }
        : { family: "Inter", category: "sans-serif" as const };
  return Object.freeze({ ...resolved, availableWeights: Object.freeze([...STOREFRONT_DESIGN_FONT_WEIGHTS]), source: "google" as const });
}

function parseFontOption(value: unknown): StorefrontDesignFontOption {
  const parsed = exact(value, ["family", "category", "availableWeights", "source"]);
  const family = text(parsed.family, 1, 120);
  if (!FONT_FAMILY.test(family)) invalid();
  const availableWeights = Object.freeze(array(parsed.availableWeights, 1, STOREFRONT_DESIGN_FONT_WEIGHTS.length)
    .map((weight) => oneOf(weight, STOREFRONT_DESIGN_FONT_WEIGHTS)));
  if (new Set(availableWeights).size !== availableWeights.length) invalid();
  if (availableWeights.some((weight, index) => index > 0 && STOREFRONT_DESIGN_FONT_WEIGHTS.indexOf(weight) <= STOREFRONT_DESIGN_FONT_WEIGHTS.indexOf(availableWeights[index - 1]!))) invalid();
  if (parsed.source !== "google") invalid();
  return Object.freeze({
    family,
    category: oneOf(parsed.category, STOREFRONT_DESIGN_FONT_CATEGORIES),
    availableWeights,
    source: "google",
  });
}

function parseTypography(value: unknown, legacyFontFamily: unknown): StorefrontDesignTypography {
  if (value === undefined) {
    const font = legacyFontOption(legacyFontFamily);
    return Object.freeze({ headingFont: font, bodyFont: font, headingWeight: "700", bodyWeight: "400", headingSizePx: 40, bodySizePx: 16 });
  }
  const parsed = exact(value, ["headingFont", "bodyFont", "headingWeight", "bodyWeight", "headingSizePx", "bodySizePx"]);
  const headingFont = parseFontOption(parsed.headingFont);
  const bodyFont = parseFontOption(parsed.bodyFont);
  const headingWeight = oneOf(parsed.headingWeight, STOREFRONT_DESIGN_FONT_WEIGHTS);
  const bodyWeight = oneOf(parsed.bodyWeight, STOREFRONT_DESIGN_FONT_WEIGHTS);
  if (!headingFont.availableWeights.includes(headingWeight) || !bodyFont.availableWeights.includes(bodyWeight)) invalid();
  return Object.freeze({
    headingFont,
    bodyFont,
    headingWeight,
    bodyWeight,
    headingSizePx: boundedInteger(parsed.headingSizePx, 24, 72),
    bodySizePx: boundedInteger(parsed.bodySizePx, 14, 20),
  });
}

export function parseStorefrontDesignDocument(value: unknown): StorefrontDesignDocument {
  const root = record(value);
  const parsed = root.schemaVersion === 3 || root.schemaVersion === 4 || root.schemaVersion === 5
    ? exact(root, ["schemaVersion", "brand", "hero", "promotion", "announcement", "composition"], ["typography"])
    : exact(root, ["schemaVersion", "brand", "hero", "promotion", "announcement"]);
  if (parsed.schemaVersion !== 1 && parsed.schemaVersion !== 2 && parsed.schemaVersion !== 3 && parsed.schemaVersion !== 4 && parsed.schemaVersion !== 5) invalid();

  if (parsed.schemaVersion === 5 && record(parsed.composition).schemaVersion !== 4) invalid();
  const brand = exact(parsed.brand, ["logo", "favicon", "primaryColor", "accentColor", "backgroundColor", "textColor", "fontFamily"]);
  const promotion = exact(parsed.promotion, ["headline", "body", "destination", "startsAt", "endsAt", "enabled"]);
  const startsAt = optionalTimestamp(promotion.startsAt);
  const endsAt = optionalTimestamp(promotion.endsAt);
  if ((startsAt === null) !== (endsAt === null) || (startsAt !== null && endsAt !== null && startsAt >= endsAt)) invalid();
  let heroEnabled: boolean;
  let heroSlides: readonly StorefrontDesignHeroSlide[];
  if (parsed.schemaVersion === 1) {
    const hero = exact(parsed.hero, ["headline", "body", "image", "destination", "enabled"]);
    heroEnabled = boolean(hero.enabled);
    heroSlides = Object.freeze([Object.freeze({
      headline: text(hero.headline, 1, 120),
      body: text(hero.body, 0, 500),
      desktopImage: parseMediaReference(hero.image),
      mobileImage: null,
      destination: parseDestination(hero.destination),
      enabled: true,
    })]);
  } else {
    const hero = exact(parsed.hero, ["enabled", "slides"]);
    heroEnabled = boolean(hero.enabled);
    if (parsed.schemaVersion === 5 && heroEnabled) invalid();
    heroSlides = Object.freeze(array(hero.slides, parsed.schemaVersion === 5 ? 0 : 1, parsed.schemaVersion === 5 ? 0 : 3).map((value) => {
      const slide = exact(value, ["headline", "body", "desktopImage", "mobileImage", "destination", "enabled"]);
      return Object.freeze({
        headline: text(slide.headline, 0, 120),
        body: text(slide.body, 0, 500),
        desktopImage: parseMediaReference(slide.desktopImage),
        mobileImage: parseMediaReference(slide.mobileImage),
        destination: parseDestination(slide.destination),
        enabled: boolean(slide.enabled),
      });
    }));
  }

  return Object.freeze({
    schemaVersion: parsed.schemaVersion === 5 ? 5 : 4,
    brand: Object.freeze({
      logo: parseMediaReference(brand.logo, parsed.schemaVersion === 5),
      favicon: parseMediaReference(brand.favicon, parsed.schemaVersion === 5),
      primaryColor: color(brand.primaryColor),
      accentColor: color(brand.accentColor),
      backgroundColor: color(brand.backgroundColor),
      textColor: color(brand.textColor),
      fontFamily: oneOf(brand.fontFamily, STOREFRONT_DESIGN_FONT_FAMILIES),
    }),
    hero: Object.freeze({ enabled: heroEnabled, slides: heroSlides }),
    promotion: Object.freeze({
      headline: text(promotion.headline, 1, 120),
      body: text(promotion.body, 0, 500),
      destination: parseDestination(promotion.destination),
      startsAt,
      endsAt,
      enabled: boolean(promotion.enabled),
    }),
    announcement: parseAnnouncement(parsed.announcement),
    typography: parseTypography(parsed.typography, brand.fontFamily),
    composition: parsed.schemaVersion === 5
      ? normalizeStarterThemeCompositionV4(parseStarterThemeCompositionConfig(parsed.composition))
      : parsed.schemaVersion === 3 || parsed.schemaVersion === 4
      ? normalizeStarterThemeCompositionV3(parseStarterThemeCompositionConfig(parsed.composition))
      : createDefaultStarterThemeComposition(),
  });
}

export function normalizeStorefrontDesignDocumentV5(value: unknown): StorefrontDesignDocumentV5 {
  const raw = record(value);
  if (raw.schemaVersion === 5) {
    const parsed = parseStorefrontDesignDocument(raw);
    if (parsed.composition.schemaVersion !== 4) invalid();
    return Object.freeze({ ...parsed, schemaVersion: 5, composition: parsed.composition });
  }
  // Legacy published documents can retain URL references that the old draft editor could not accept.
  const heroRaw = record(raw.hero);
  const legacySlides = raw.schemaVersion === 1
    ? [{ headline: heroRaw.headline, body: heroRaw.body, desktopImage: heroRaw.image, mobileImage: null, destination: heroRaw.destination, enabled: true }]
    : array(heroRaw.slides, 1, 3).map((entry) => record(entry));
  const refs = legacySlides.map((entry) => ({ desktopImage: parseBannerMediaReference(entry.desktopImage), mobileImage: parseBannerMediaReference(entry.mobileImage) }));
  const sanitizedHero = raw.schemaVersion === 1
    ? { ...heroRaw, image: refs[0]!.desktopImage?.kind === "legacy_https" ? null : refs[0]!.desktopImage }
    : { ...heroRaw, slides: legacySlides.map((slide, index) => ({ ...slide, desktopImage: refs[index]!.desktopImage?.kind === "legacy_https" ? null : refs[index]!.desktopImage, mobileImage: refs[index]!.mobileImage?.kind === "legacy_https" ? null : refs[index]!.mobileImage })) };
  const brandRaw = record(raw.brand);
  const retainedBrand = { logo: parseMediaReference(brandRaw.logo, true), favicon: parseMediaReference(brandRaw.favicon, true) };
  const parsed = parseStorefrontDesignDocument({ ...raw, brand: { ...brandRaw, logo: retainedBrand.logo?.kind === "legacy_https" ? null : retainedBrand.logo, favicon: retainedBrand.favicon?.kind === "legacy_https" ? null : retainedBrand.favicon }, hero: sanitizedHero });
  const composition = normalizeStarterThemeCompositionV4(parsed.composition);
  const sections = [...composition.sections];
  if (parsed.hero.enabled) {
    let sectionId = "home_legacy_main_banner";
    let suffix = 2;
    while (sections.some((section) => section.sectionId === sectionId)) sectionId = `home_legacy_main_banner_${suffix++}`;
    sections.unshift(Object.freeze({ kind: "banner", sectionId: sectionId as `home_${string}`, enabled: true, layout: "slider", autoplay: true, presentation: "image_only", slides: Object.freeze(parsed.hero.slides.map((slide, index) => Object.freeze({ ...slide, ...refs[index]!, slideId: `slide_legacy_${index + 1}` }))) }));
  }
  return Object.freeze({ ...parsed, brand: Object.freeze({ ...parsed.brand, ...retainedBrand }), schemaVersion: 5, hero: Object.freeze({ enabled: false, slides: Object.freeze([]) }), composition: Object.freeze({ ...composition, sections: Object.freeze(sections) }) });
}

export function getStorefrontDesignPublishIssue(value: StorefrontDesignDocument): StorefrontDesignPublishIssue | null {
  const design = parseStorefrontDesignDocument(value);
  if (design.schemaVersion === 5) return null;
  const enabled = design.hero.slides
    .map((slide, slideIndex) => Object.freeze({ slide, slideIndex }))
    .filter(({ slide }) => slide.enabled);
  if (design.hero.enabled && !enabled.length) return Object.freeze({ code: "hero_enabled_slide_missing" });
  for (const { slide, slideIndex } of design.hero.enabled ? enabled : []) {
    if (!slide.headline) return Object.freeze({ code: "hero_slide_headline_missing", slideIndex });
    if (slide.desktopImage === null) return Object.freeze({ code: "hero_slide_desktop_image_missing", slideIndex });
  }
  for (const section of design.composition.sections) {
    if (!section.enabled) continue;
    const sectionId = "sectionId" in section ? section.sectionId : undefined;
    if (section.kind === "product_row" && section.source === "manual" && !section.productIds?.length) {
      return Object.freeze({ code: "product_row_selection_missing", ...(sectionId ? { sectionId } : {}) });
    }
    // Absent mappings can use the tenant's legacy image library. Explicit mappings
    // represent the editor's selection and must cover every visible card.
    if (section.kind === "category_grid" && section.categoryImages) {
      const categoryId = section.categoryIds.find((id) => !section.categoryImages?.some((image) => image.categoryId === id));
      if (categoryId) return Object.freeze({ code: "category_grid_image_missing", ...(sectionId ? { sectionId } : {}), categoryId });
    }
  }
  return null;
}

function parsePublicMedia(value: unknown): PublicDesignMedia {
  if (value === null) return null;
  const parsed = exact(value, ["url", "altText"]);
  return Object.freeze({ url: httpsUrl(parsed.url), altText: text(parsed.altText, 0, 500) });
}

function parsePublicDestination(value: unknown): PublicDesignDestination {
  if (value === null) return null;
  const parsed = exact(value, ["path"]);
  return Object.freeze({ path: path(parsed.path) });
}

export function parsePublicStorefrontDesign(value: unknown): PublicStorefrontDesign {
  const parsed = exact(value, ["schemaVersion", "publicationVersion", "publishedAt", "brand", "hero", "promotion", "announcement"], ["typography"]);
  if (parsed.schemaVersion !== 1 && parsed.schemaVersion !== 2) invalid();
  const brand = exact(parsed.brand, ["logo", "favicon", "primaryColor", "accentColor", "backgroundColor", "textColor", "fontFamily"]);
  const promotion = exact(parsed.promotion, ["headline", "body", "destination", "startsAt", "endsAt", "enabled"]);
  const startsAt = optionalTimestamp(promotion.startsAt);
  const endsAt = optionalTimestamp(promotion.endsAt);
  if ((startsAt === null) !== (endsAt === null) || (startsAt !== null && endsAt !== null && startsAt >= endsAt)) invalid();
  let heroEnabled: boolean;
  let heroSlides: readonly PublicStorefrontDesign["hero"]["slides"][number][];
  if (parsed.schemaVersion === 1) {
    const hero = exact(parsed.hero, ["headline", "body", "image", "destination", "enabled"]);
    heroEnabled = boolean(hero.enabled);
    heroSlides = Object.freeze([Object.freeze({
      headline: text(hero.headline, 1, 120),
      body: text(hero.body, 0, 500),
      desktopImage: parsePublicMedia(hero.image),
      mobileImage: null,
      destination: parsePublicDestination(hero.destination),
    })]);
  } else {
    const hero = exact(parsed.hero, ["enabled", "slides"]);
    heroEnabled = boolean(hero.enabled);
    heroSlides = Object.freeze(array(hero.slides, 0, 3).map((value) => {
      const slide = exact(value, ["headline", "body", "desktopImage", "mobileImage", "destination"]);
      return Object.freeze({
        headline: text(slide.headline, 0, 120),
        body: text(slide.body, 0, 500),
        desktopImage: parsePublicMedia(slide.desktopImage),
        mobileImage: parsePublicMedia(slide.mobileImage),
        destination: parsePublicDestination(slide.destination),
      });
    }));
  }

  return Object.freeze({
    schemaVersion: 2,
    publicationVersion: positiveInteger(parsed.publicationVersion),
    publishedAt: timestamp(parsed.publishedAt),
    brand: Object.freeze({
      logo: parsePublicMedia(brand.logo),
      favicon: parsePublicMedia(brand.favicon),
      primaryColor: color(brand.primaryColor),
      accentColor: color(brand.accentColor),
      backgroundColor: color(brand.backgroundColor),
      textColor: color(brand.textColor),
      fontFamily: oneOf(brand.fontFamily, STOREFRONT_DESIGN_FONT_FAMILIES),
    }),
    hero: Object.freeze({ enabled: heroEnabled, slides: heroSlides }),
    promotion: Object.freeze({
      headline: text(promotion.headline, 1, 120),
      body: text(promotion.body, 0, 500),
      destination: parsePublicDestination(promotion.destination),
      startsAt,
      endsAt,
      enabled: boolean(promotion.enabled),
    }),
    announcement: parseAnnouncement(parsed.announcement, 160),
    typography: parseTypography(parsed.typography, brand.fontFamily),
  });
}

function parseMediaOption(value: unknown): StorefrontDesignMediaOption {
  const parsed = exact(value, ["id", "url", "altText", "mediaType", "width", "height"]);
  if (typeof parsed.mediaType !== "string" || !MEDIA_TYPES.includes(parsed.mediaType as (typeof MEDIA_TYPES)[number])) invalid();
  if (!Number.isSafeInteger(parsed.width) || (parsed.width as number) < 1 || (parsed.width as number) > 8192) invalid();
  if (!Number.isSafeInteger(parsed.height) || (parsed.height as number) < 1 || (parsed.height as number) > 8192) invalid();
  return Object.freeze({
    id: uuid(parsed.id),
    url: httpsUrl(parsed.url),
    altText: text(parsed.altText, 0, 500),
    mediaType: parsed.mediaType as StorefrontDesignMediaOption["mediaType"],
    width: parsed.width as number,
    height: parsed.height as number,
  });
}

function parseDestinationOption(value: unknown): StorefrontDesignDestinationOption {
  const parsed = exact(value, ["kind", "resourceId", "label", "path"], ["searchTerms", "categoryIds", "imageUrl", "priceCents", "available"]);
  if (parsed.kind !== "product" && ["searchTerms", "categoryIds", "imageUrl", "priceCents", "available"].some((key) => Object.hasOwn(parsed, key))) invalid();
  if (parsed.kind !== "product" && parsed.kind !== "collection" && parsed.kind !== "catalog_collection" && parsed.kind !== "page") invalid();
  return Object.freeze({ kind: parsed.kind, resourceId: uuid(parsed.resourceId), label: text(parsed.label, 1, 200), path: path(parsed.path),
    ...(Object.hasOwn(parsed, "searchTerms") ? { searchTerms: Object.freeze(array(parsed.searchTerms, 0, 100).map((item) => text(item, 1, 200))) } : {}),
    ...(Object.hasOwn(parsed, "categoryIds") ? { categoryIds: Object.freeze(array(parsed.categoryIds, 0, 100).map(uuid)) } : {}),
    ...(Object.hasOwn(parsed, "imageUrl") ? { imageUrl: httpsUrl(parsed.imageUrl) } : {}),
    ...(Object.hasOwn(parsed, "priceCents") ? { priceCents: boundedInteger(parsed.priceCents, 0, Number.MAX_SAFE_INTEGER) } : {}),
    ...(Object.hasOwn(parsed, "available") ? { available: boolean(parsed.available) } : {}),
  });
}

export function parseStorefrontDesignWorkspace(value: unknown): StorefrontDesignWorkspace {
  const parsed = exact(value, ["schemaVersion", "draftVersion", "publishedVersion", "draftUpdatedAt", "publishedAt", "draft", "published", "store", "media", "destinations"], ["assets", "publishedDraft"]);
  if (parsed.schemaVersion !== 1 && parsed.schemaVersion !== 2 && parsed.schemaVersion !== 3) invalid();
  const publishedVersion = positiveInteger(parsed.publishedVersion);
  const publishedAt = timestamp(parsed.publishedAt);
  const published = parsePublicStorefrontDesign(parsed.published);
  if (published.publicationVersion !== publishedVersion || published.publishedAt !== publishedAt) invalid();
  const store = exact(parsed.store, ["name", "timezone"]);
  const media = Object.freeze(array(parsed.media, 0, 500).map(parseMediaOption));
  const assets = Object.hasOwn(parsed, "assets") ? Object.freeze(array(parsed.assets, 0, 2000).map((value): StorefrontDesignAssetOption => {
    const item = exact(value, ["id", "url", "altText", "mediaType", "width", "height", "kind"]);
    const { kind: _kind, ...media } = item;
    return Object.freeze({ ...parseMediaOption(media), kind: oneOf(item.kind, ["logo", "hero", "social", "favicon", "category", "collection"] as const) });
  })) : undefined;
  if (assets && new Set(assets.map((item) => item.id)).size !== assets.length) invalid();
  const destinations = Object.freeze(array(parsed.destinations, 0, 2_000).map(parseDestinationOption));
  if (new Set(media.map((item) => item.id)).size !== media.length) invalid();
  if (new Set(destinations.map((item) => `${item.kind}:${item.resourceId}`)).size !== destinations.length) invalid();

  return Object.freeze({
    schemaVersion: 3,
    draftVersion: positiveInteger(parsed.draftVersion),
    publishedVersion,
    draftUpdatedAt: timestamp(parsed.draftUpdatedAt),
    publishedAt,
    draft: parseStorefrontDesignDocument(parsed.draft),
    published,
    store: Object.freeze({ name: text(store.name, 1, 160), timezone: timezone(store.timezone) }),
    media,
    destinations,
    ...(assets ? { assets } : {}),
    ...(Object.hasOwn(parsed, "publishedDraft") ? { publishedDraft: parseStorefrontDesignDocument(parsed.publishedDraft) } : {}),
  });
}

export function parseStorefrontDesignEditorWorkspace(value: unknown): StorefrontDesignEditorWorkspace {
  const parsed = exact(value, ["schemaVersion", "publishedVersion", "publishedAt", "design", "store", "media", "destinations"]);
  if (parsed.schemaVersion !== 1) invalid();
  const store = exact(parsed.store, ["name", "timezone"]);
  const media = Object.freeze(array(parsed.media, 0, Number.MAX_SAFE_INTEGER).map((entry): StorefrontDesignEditorMediaOption => {
    const choice = exact(entry, ["id", "url", "altText", "mediaType", "width", "height", "reference"], ["assetKind"]);
    const { reference: rawReference, assetKind, ...option } = choice;
    const reference = parseBannerMediaReference(rawReference);
    const selected = parseMediaOption(option);
    if (!reference || reference.kind === "legacy_https" || selected.id !== (reference.kind === "media" ? reference.mediaId : reference.assetId)) invalid();
    if (reference.kind === "asset") return Object.freeze({ ...selected, reference, assetKind: oneOf(assetKind, STOREFRONT_ASSET_KINDS) });
    if (Object.hasOwn(choice, "assetKind")) invalid();
    return Object.freeze({ ...selected, reference });
  }));
  if (new Set(media.map(({ reference }) => `${reference.kind}:${reference.kind === "media" ? reference.mediaId : reference.assetId}`)).size !== media.length) invalid();
  const destinations = Object.freeze(array(parsed.destinations, 0, Number.MAX_SAFE_INTEGER).map(parseDestinationOption));
  if (new Set(destinations.map((entry) => `${entry.kind}:${entry.resourceId}`)).size !== destinations.length) invalid();
  return Object.freeze({ schemaVersion: 1, publishedVersion: positiveInteger(parsed.publishedVersion), publishedAt: timestamp(parsed.publishedAt), design: normalizeStorefrontDesignDocumentV5(parsed.design), store: Object.freeze({ name: text(store.name, 1, 160), timezone: timezone(store.timezone) }), media, destinations });
}

export function parseStorefrontDesignApplyMutation(value: unknown): StorefrontDesignApplyMutation {
  const parsed = exact(value, ["publishedVersion", "publishedAt", "design", "published"]);
  const publishedVersion = positiveInteger(parsed.publishedVersion);
  const publishedAt = timestamp(parsed.publishedAt);
  const published = parsePublicStorefrontDesign(parsed.published);
  if (published.publicationVersion !== publishedVersion || published.publishedAt !== publishedAt) invalid();
  return Object.freeze({ publishedVersion, publishedAt, design: normalizeStorefrontDesignDocumentV5(parsed.design), published });
}
