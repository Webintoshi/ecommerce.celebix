import {
  STOREFRONT_DESIGN_ANNOUNCEMENT_ANIMATIONS,
  STOREFRONT_DESIGN_ANNOUNCEMENT_DIRECTIONS,
  STOREFRONT_DESIGN_ANNOUNCEMENT_ICONS,
  STOREFRONT_DESIGN_ANNOUNCEMENT_SPEEDS,
  STOREFRONT_DESIGN_FONT_CATEGORIES,
  STOREFRONT_DESIGN_FONT_FAMILIES,
  STOREFRONT_DESIGN_FONT_WEIGHTS,
} from "./types.ts";
import { createDefaultStarterThemeComposition } from "./defaults.ts";
import { parseStarterThemeCompositionConfig } from "../storefront/validation.ts";
import type {
  DesignDestination,
  DesignMediaReference,
  PublicDesignDestination,
  PublicDesignMedia,
  PublicStorefrontDesign,
  StorefrontDesignAnnouncement,
  StorefrontDesignDestinationOption,
  StorefrontDesignDocument,
  StorefrontDesignHeroSlide,
  StorefrontDesignFontOption,
  StorefrontDesignMediaOption,
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

function parseMediaReference(value: unknown): DesignMediaReference {
  if (value === null) return null;
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
  if (parsed.kind !== "product" && parsed.kind !== "collection" && parsed.kind !== "page") invalid();
  return Object.freeze({ kind: parsed.kind, resourceId: uuid(parsed.resourceId) });
}

function parseAnnouncement(value: unknown): StorefrontDesignAnnouncement {
  const parsed = exact(value, ["items", "icon", "speed", "direction", "animation", "enabled"]);
  const items = Object.freeze(array(parsed.items, 1, 12).map((item) => text(item, 1, 120)));
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
  const parsed = root.schemaVersion === 3
    ? exact(root, ["schemaVersion", "brand", "hero", "promotion", "announcement", "composition"], ["typography"])
    : exact(root, ["schemaVersion", "brand", "hero", "promotion", "announcement"]);
  if (parsed.schemaVersion !== 1 && parsed.schemaVersion !== 2 && parsed.schemaVersion !== 3) invalid();

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
    heroSlides = Object.freeze(array(hero.slides, 1, 3).map((value) => {
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
    schemaVersion: 3,
    brand: Object.freeze({
      logo: parseMediaReference(brand.logo),
      favicon: parseMediaReference(brand.favicon),
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
    composition: parsed.schemaVersion === 3
      ? parseStarterThemeCompositionConfig(parsed.composition) as StorefrontDesignDocument["composition"]
      : createDefaultStarterThemeComposition(),
  });
}

export function getStorefrontDesignPublishIssue(value: StorefrontDesignDocument): StorefrontDesignPublishIssue | null {
  const design = parseStorefrontDesignDocument(value);
  const enabled = design.hero.slides
    .map((slide, slideIndex) => Object.freeze({ slide, slideIndex }))
    .filter(({ slide }) => slide.enabled);
  if (!enabled.length) return Object.freeze({ code: "hero_enabled_slide_missing" });
  for (const { slide, slideIndex } of enabled) {
    if (!slide.headline) return Object.freeze({ code: "hero_slide_headline_missing", slideIndex });
    if (slide.desktopImage === null) return Object.freeze({ code: "hero_slide_desktop_image_missing", slideIndex });
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
    announcement: parseAnnouncement(parsed.announcement),
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
  const parsed = exact(value, ["kind", "resourceId", "label", "path"]);
  if (parsed.kind !== "product" && parsed.kind !== "collection" && parsed.kind !== "page") invalid();
  return Object.freeze({ kind: parsed.kind, resourceId: uuid(parsed.resourceId), label: text(parsed.label, 1, 200), path: path(parsed.path) });
}

export function parseStorefrontDesignWorkspace(value: unknown): StorefrontDesignWorkspace {
  const parsed = exact(value, ["schemaVersion", "draftVersion", "publishedVersion", "draftUpdatedAt", "publishedAt", "draft", "published", "store", "media", "destinations"]);
  if (parsed.schemaVersion !== 1 && parsed.schemaVersion !== 2 && parsed.schemaVersion !== 3) invalid();
  const publishedVersion = positiveInteger(parsed.publishedVersion);
  const publishedAt = timestamp(parsed.publishedAt);
  const published = parsePublicStorefrontDesign(parsed.published);
  if (published.publicationVersion !== publishedVersion || published.publishedAt !== publishedAt) invalid();
  const store = exact(parsed.store, ["name", "timezone"]);
  const media = Object.freeze(array(parsed.media, 0, 500).map(parseMediaOption));
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
  });
}
