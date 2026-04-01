export type StoreTypographyFontCategory =
  | "sans-serif"
  | "serif"
  | "display"
  | "handwriting"
  | "monospace";

export type StoreTypographyWeight = "400" | "500" | "600" | "700" | "800";
export type StoreTypographyHeadingScale = "restrained" | "balanced" | "editorial";
export type StoreTypographyLetterSpacing = "tight" | "normal" | "airy";
export type StoreTypographyRoleMode = "body" | "heading" | "custom";

export interface StoreTypographyFontOption {
  family: string;
  category: StoreTypographyFontCategory;
  availableWeights: StoreTypographyWeight[];
  source: "google";
}

export interface StoreTypographyRoleFontOverride {
  mode: StoreTypographyRoleMode;
  font?: StoreTypographyFontOption | null;
}

export interface StoreTypographySettings {
  headingFont: StoreTypographyFontOption;
  bodyFont: StoreTypographyFontOption;
  menuFont: StoreTypographyRoleFontOverride;
  productTitleFont: StoreTypographyRoleFontOverride;
  headingWeight: StoreTypographyWeight;
  bodyWeight: StoreTypographyWeight;
  menuWeight: StoreTypographyWeight;
  productTitleWeight: StoreTypographyWeight;
  bodySizePx: number;
  menuSizePx: number;
  productCardTitleSizePx: number;
  productPageTitleSizePx: number;
  headingScale: StoreTypographyHeadingScale;
  letterSpacing: StoreTypographyLetterSpacing;
}

export interface TypographyChoiceOption<T extends string | number> {
  id: T;
  label: string;
  description: string;
  value: string;
}

const ALL_TYPOGRAPHY_WEIGHTS: StoreTypographyWeight[] = ["400", "500", "600", "700", "800"];

export const FEATURED_STORE_TYPOGRAPHY_FONT_OPTIONS: StoreTypographyFontOption[] = [
  { family: "Inter", category: "sans-serif", availableWeights: ALL_TYPOGRAPHY_WEIGHTS, source: "google" },
  { family: "Manrope", category: "sans-serif", availableWeights: ALL_TYPOGRAPHY_WEIGHTS, source: "google" },
  { family: "Plus Jakarta Sans", category: "sans-serif", availableWeights: ALL_TYPOGRAPHY_WEIGHTS, source: "google" },
  { family: "DM Sans", category: "sans-serif", availableWeights: ["400", "500", "600", "700"], source: "google" },
  { family: "Montserrat", category: "sans-serif", availableWeights: ["500", "600", "700", "800"], source: "google" },
  { family: "Playfair Display", category: "serif", availableWeights: ["500", "600", "700"], source: "google" },
  { family: "Cormorant Garamond", category: "serif", availableWeights: ["500", "600", "700"], source: "google" },
  { family: "Fraunces", category: "serif", availableWeights: ["500", "600", "700"], source: "google" },
];

export const STORE_TYPOGRAPHY_WEIGHT_OPTIONS: TypographyChoiceOption<StoreTypographyWeight>[] = [
  { id: "400", label: "Normal", description: "Daha sakin ve rahat okuma.", value: "400" },
  { id: "500", label: "Orta", description: "Daha belirgin ama hala dengeli.", value: "500" },
  { id: "600", label: "Yari kalin", description: "Premium ve kontrollu vurgu.", value: "600" },
  { id: "700", label: "Kalin", description: "Baslik ve urun isimlerinde guvenli secim.", value: "700" },
  { id: "800", label: "Cok kalin", description: "Daha iddiali vitrin etkisi.", value: "800" },
];

export const STORE_HEADING_SCALE_OPTIONS: TypographyChoiceOption<StoreTypographyHeadingScale>[] = [
  { id: "restrained", label: "Sakin", description: "Minimal ve kontrollu baslik hiyerarsisi.", value: "1.04" },
  { id: "balanced", label: "Dengeli", description: "Genel kullanim icin guvenli oran.", value: "1.12" },
  { id: "editorial", label: "Editoral", description: "Daha dramatik ve vitrin odakli boyut.", value: "1.2" },
];

export const STORE_LETTER_SPACING_OPTIONS: TypographyChoiceOption<StoreTypographyLetterSpacing>[] = [
  { id: "tight", label: "Siki", description: "Serif ve luks basliklarla iyi calisir.", value: "-0.035em" },
  { id: "normal", label: "Normal", description: "Cogu marka icin dengeli varsayilan.", value: "-0.015em" },
  { id: "airy", label: "Acik", description: "Sans basliklarda daha ferah gorunum verir.", value: "0.01em" },
];

export const STORE_TYPOGRAPHY_ROLE_MODE_OPTIONS: TypographyChoiceOption<StoreTypographyRoleMode>[] = [
  { id: "body", label: "Govdeyi kullan", description: "Ek font yuklemeden mevcut govde fontunu kullanir.", value: "body" },
  { id: "heading", label: "Basligi kullan", description: "Ek font yuklemeden mevcut baslik fontunu kullanir.", value: "heading" },
  { id: "custom", label: "Ozel font", description: "Sadece bu alan icin farkli bir Google font kullanir.", value: "custom" },
];

export const STORE_BODY_SIZE_OPTIONS: TypographyChoiceOption<number>[] = [
  { id: 14, label: "14 px", description: "Daha kompakt govde akisi.", value: "14px" },
  { id: 15, label: "15 px", description: "Yogun katalog sayfalari icin dengeli.", value: "15px" },
  { id: 16, label: "16 px", description: "En guvenli varsayilan okuma boyutu.", value: "16px" },
  { id: 17, label: "17 px", description: "Daha premium ve ferah okuma.", value: "17px" },
  { id: 18, label: "18 px", description: "Buyuk ekranlarda rahat govde boyutu.", value: "18px" },
];

export const STORE_MENU_SIZE_OPTIONS: TypographyChoiceOption<number>[] = [
  { id: 13, label: "13 px", description: "Daha sik ve kompakt menu.", value: "13px" },
  { id: 14, label: "14 px", description: "Minimal menu baskisi.", value: "14px" },
  { id: 15, label: "15 px", description: "Dengeli ana menu boyutu.", value: "15px" },
  { id: 16, label: "16 px", description: "Daha belirgin navigation.", value: "16px" },
  { id: 17, label: "17 px", description: "Buyuk ekranlar icin daha iddiali menu.", value: "17px" },
];

export const STORE_PRODUCT_CARD_TITLE_SIZE_OPTIONS: TypographyChoiceOption<number>[] = [
  { id: 14, label: "14 px", description: "Kompakt urun karti basligi.", value: "14px" },
  { id: 15, label: "15 px", description: "Mobil ve grid icin dengeli.", value: "15px" },
  { id: 16, label: "16 px", description: "Varsayilan urun karti boyutu.", value: "16px" },
  { id: 17, label: "17 px", description: "Daha premium kart basligi.", value: "17px" },
  { id: 18, label: "18 px", description: "Genis kartlarda belirgin urun adi.", value: "18px" },
];

export const STORE_PRODUCT_PAGE_TITLE_SIZE_OPTIONS: TypographyChoiceOption<number>[] = [
  { id: 32, label: "32 px", description: "Daha sakin PDP basligi.", value: "32px" },
  { id: 36, label: "36 px", description: "Dengeli urun detay basligi.", value: "36px" },
  { id: 40, label: "40 px", description: "Premium PDP vitrin boyutu.", value: "40px" },
  { id: 44, label: "44 px", description: "Daha belirgin urun detay basligi.", value: "44px" },
  { id: 48, label: "48 px", description: "Buyuk ekranlar icin cesur PDP basligi.", value: "48px" },
];

const LEGACY_FONT_MAP = new Map<string, StoreTypographyFontOption>([
  ["inter", FEATURED_STORE_TYPOGRAPHY_FONT_OPTIONS[0]],
  ["manrope", FEATURED_STORE_TYPOGRAPHY_FONT_OPTIONS[1]],
  ["plus-jakarta", FEATURED_STORE_TYPOGRAPHY_FONT_OPTIONS[2]],
  ["dm-sans", FEATURED_STORE_TYPOGRAPHY_FONT_OPTIONS[3]],
  ["montserrat", FEATURED_STORE_TYPOGRAPHY_FONT_OPTIONS[4]],
  ["playfair", FEATURED_STORE_TYPOGRAPHY_FONT_OPTIONS[5]],
  ["cormorant", FEATURED_STORE_TYPOGRAPHY_FONT_OPTIONS[6]],
  ["fraunces", FEATURED_STORE_TYPOGRAPHY_FONT_OPTIONS[7]],
]);

const FEATURED_FONT_BY_FAMILY = new Map(
  FEATURED_STORE_TYPOGRAPHY_FONT_OPTIONS.map((option) => [option.family.toLocaleLowerCase("en-US"), option]),
);

export const DEFAULT_STORE_TYPOGRAPHY: StoreTypographySettings = {
  headingFont: FEATURED_STORE_TYPOGRAPHY_FONT_OPTIONS[5],
  bodyFont: FEATURED_STORE_TYPOGRAPHY_FONT_OPTIONS[0],
  menuFont: { mode: "body" },
  productTitleFont: { mode: "body" },
  headingWeight: "700",
  bodyWeight: "400",
  menuWeight: "600",
  productTitleWeight: "600",
  bodySizePx: 16,
  menuSizePx: 15,
  productCardTitleSizePx: 16,
  productPageTitleSizePx: 44,
  headingScale: "balanced",
  letterSpacing: "normal",
};

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function uniqueWeights(weights: StoreTypographyWeight[]): StoreTypographyWeight[] {
  return ALL_TYPOGRAPHY_WEIGHTS.filter((weight) => weights.includes(weight));
}

function normalizeFontCategory(value?: string | null): StoreTypographyFontCategory {
  const normalized = (value ?? "").trim().toLocaleLowerCase("en-US");

  if (normalized.includes("handwriting")) return "handwriting";
  if (normalized.includes("mono")) return "monospace";
  if (normalized.includes("display")) return "display";
  if (normalized.includes("serif")) return normalized.includes("sans") ? "sans-serif" : "serif";
  return "sans-serif";
}

function normalizeAvailableWeights(input: unknown, fallback: StoreTypographyWeight[] = ALL_TYPOGRAPHY_WEIGHTS): StoreTypographyWeight[] {
  if (!Array.isArray(input)) {
    return fallback;
  }

  const normalized = input
    .map((value) => String(value).replace(/[^0-9]/g, "") as StoreTypographyWeight)
    .filter((value): value is StoreTypographyWeight => ALL_TYPOGRAPHY_WEIGHTS.includes(value));

  return normalized.length > 0 ? uniqueWeights(normalized) : fallback;
}

function sanitizeFontFamily(value: string | undefined | null): string {
  return (value ?? "").replace(/["']/g, "").trim().replace(/\s+/g, " ").slice(0, 120);
}

function coerceLegacyFont(value: string): StoreTypographyFontOption | null {
  const normalized = value.trim().toLocaleLowerCase("en-US");
  const legacy = LEGACY_FONT_MAP.get(normalized);
  if (legacy) {
    return legacy;
  }

  return FEATURED_FONT_BY_FAMILY.get(normalized) ?? null;
}

export function buildTypographyFallbackStack(category: StoreTypographyFontCategory): string {
  switch (category) {
    case "serif":
      return "Georgia, serif";
    case "monospace":
      return 'ui-monospace, "SFMono-Regular", "JetBrains Mono", monospace';
    case "display":
    case "handwriting":
    case "sans-serif":
    default:
      return "system-ui, sans-serif";
  }
}

export function buildTypographyFontCssStack(font: StoreTypographyFontOption): string {
  return `"${font.family}", ${buildTypographyFallbackStack(font.category)}`;
}

export function normalizeStoreTypographyFontOption(
  input: unknown,
  fallback: StoreTypographyFontOption,
): StoreTypographyFontOption {
  if (typeof input === "string") {
    const legacy = coerceLegacyFont(input);
    if (legacy) {
      return legacy;
    }

    const customFamily = sanitizeFontFamily(input);
    return customFamily
      ? {
          family: customFamily,
          category: fallback.category,
          availableWeights: fallback.availableWeights,
          source: "google",
        }
      : fallback;
  }

  if (input && typeof input === "object") {
    const record = input as Record<string, unknown>;
    const explicitFamily = sanitizeFontFamily(typeof record.family === "string" ? record.family : undefined);
    const legacyId = typeof record.id === "string" ? coerceLegacyFont(record.id) : null;
    const family = explicitFamily || legacyId?.family || fallback.family;
    const category = normalizeFontCategory(
      typeof record.category === "string" ? record.category : legacyId?.category ?? fallback.category,
    );
    const availableWeights = normalizeAvailableWeights(
      record.availableWeights,
      legacyId?.availableWeights ?? fallback.availableWeights,
    );

    return {
      family,
      category,
      availableWeights,
      source: "google",
    };
  }

  return fallback;
}

function normalizeRoleMode(value: unknown, fallback: StoreTypographyRoleMode): StoreTypographyRoleMode {
  return value === "body" || value === "heading" || value === "custom" ? value : fallback;
}

function normalizeWeight(value: unknown, fallback: StoreTypographyWeight): StoreTypographyWeight {
  return ALL_TYPOGRAPHY_WEIGHTS.includes(String(value) as StoreTypographyWeight)
    ? (String(value) as StoreTypographyWeight)
    : fallback;
}

function normalizeSizePx(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(numeric) ? clampNumber(Math.round(numeric), min, max) : fallback;
}

function normalizeLegacyBaseSize(value: unknown, fallback: number): number {
  switch (value) {
    case "compact":
      return 15;
    case "balanced":
      return 16;
    case "comfortable":
      return 17;
    default:
      return fallback;
  }
}

function normalizeHeadingScale(value: unknown): StoreTypographyHeadingScale {
  return value === "restrained" || value === "balanced" || value === "editorial"
    ? value
    : DEFAULT_STORE_TYPOGRAPHY.headingScale;
}

function normalizeLetterSpacing(value: unknown): StoreTypographyLetterSpacing {
  return value === "tight" || value === "normal" || value === "airy"
    ? value
    : DEFAULT_STORE_TYPOGRAPHY.letterSpacing;
}

function normalizeRoleOverride(
  input: unknown,
  fallbackMode: StoreTypographyRoleMode,
  fallbackFont: StoreTypographyFontOption,
): StoreTypographyRoleFontOverride {
  if (!input || typeof input !== "object") {
    return { mode: fallbackMode };
  }

  const record = input as Record<string, unknown>;
  const mode = normalizeRoleMode(record.mode, fallbackMode);
  if (mode !== "custom") {
    return { mode };
  }

  return {
    mode,
    font: normalizeStoreTypographyFontOption(record.font, fallbackFont),
  };
}

export function normalizeStoreTypographySettings(
  input?: Partial<StoreTypographySettings> | Record<string, unknown> | null,
): StoreTypographySettings {
  const record = (input ?? {}) as Record<string, unknown>;
  const headingFont = normalizeStoreTypographyFontOption(
    record.headingFont ?? record.headingFamily,
    DEFAULT_STORE_TYPOGRAPHY.headingFont,
  );
  const bodyFont = normalizeStoreTypographyFontOption(
    record.bodyFont ?? record.bodyFamily,
    DEFAULT_STORE_TYPOGRAPHY.bodyFont,
  );

  const menuFont = normalizeRoleOverride(
    record.menuFont,
    DEFAULT_STORE_TYPOGRAPHY.menuFont.mode,
    bodyFont,
  );
  const productTitleFont = normalizeRoleOverride(
    record.productTitleFont,
    DEFAULT_STORE_TYPOGRAPHY.productTitleFont.mode,
    bodyFont,
  );

  return {
    headingFont,
    bodyFont,
    menuFont,
    productTitleFont,
    headingWeight: normalizeWeight(record.headingWeight, DEFAULT_STORE_TYPOGRAPHY.headingWeight),
    bodyWeight: normalizeWeight(record.bodyWeight, DEFAULT_STORE_TYPOGRAPHY.bodyWeight),
    menuWeight: normalizeWeight(record.menuWeight, DEFAULT_STORE_TYPOGRAPHY.menuWeight),
    productTitleWeight: normalizeWeight(record.productTitleWeight, DEFAULT_STORE_TYPOGRAPHY.productTitleWeight),
    bodySizePx: normalizeSizePx(
      record.bodySizePx ?? normalizeLegacyBaseSize(record.baseSize, DEFAULT_STORE_TYPOGRAPHY.bodySizePx),
      DEFAULT_STORE_TYPOGRAPHY.bodySizePx,
      14,
      18,
    ),
    menuSizePx: normalizeSizePx(record.menuSizePx, DEFAULT_STORE_TYPOGRAPHY.menuSizePx, 13, 17),
    productCardTitleSizePx: normalizeSizePx(
      record.productCardTitleSizePx,
      DEFAULT_STORE_TYPOGRAPHY.productCardTitleSizePx,
      14,
      18,
    ),
    productPageTitleSizePx: normalizeSizePx(
      record.productPageTitleSizePx,
      DEFAULT_STORE_TYPOGRAPHY.productPageTitleSizePx,
      32,
      48,
    ),
    headingScale: normalizeHeadingScale(record.headingScale),
    letterSpacing: normalizeLetterSpacing(record.letterSpacing),
  };
}

export function resolveStoreTypographyRoleFont(
  typographyInput: Partial<StoreTypographySettings> | Record<string, unknown> | null | undefined,
  role: "heading" | "body" | "menu" | "productTitle",
): StoreTypographyFontOption {
  const typography = normalizeStoreTypographySettings(typographyInput);

  if (role === "heading") return typography.headingFont;
  if (role === "body") return typography.bodyFont;

  const roleConfig = role === "menu" ? typography.menuFont : typography.productTitleFont;

  if (roleConfig.mode === "heading") return typography.headingFont;
  if (roleConfig.mode === "custom" && roleConfig.font) return roleConfig.font;
  return typography.bodyFont;
}

function resolveFontWeights(font: StoreTypographyFontOption, requestedWeights: StoreTypographyWeight[]): StoreTypographyWeight[] {
  const supportedWeights = font.availableWeights.length > 0 ? font.availableWeights : ALL_TYPOGRAPHY_WEIGHTS;
  return uniqueWeights(requestedWeights.filter((weight) => supportedWeights.includes(weight)));
}

function buildStylesheetToken(font: StoreTypographyFontOption, weights: StoreTypographyWeight[]): string {
  const tokenFamily = font.family.trim().replace(/\s+/g, "+");
  const resolvedWeights = resolveFontWeights(font, weights);

  if (resolvedWeights.length === 0) {
    return tokenFamily;
  }

  return `${tokenFamily}:wght@${resolvedWeights.join(";")}`;
}

export function collectStoreTypographyFonts(
  input?: Partial<StoreTypographySettings> | Record<string, unknown> | null,
): Array<{ font: StoreTypographyFontOption; weights: StoreTypographyWeight[] }> {
  const typography = normalizeStoreTypographySettings(input);
  const grouped = new Map<string, { font: StoreTypographyFontOption; weights: Set<StoreTypographyWeight> }>();

  const register = (font: StoreTypographyFontOption, weight: StoreTypographyWeight) => {
    const key = font.family.trim().toLocaleLowerCase("en-US");
    const current = grouped.get(key);

    if (current) {
      current.weights.add(weight);
      return;
    }

    grouped.set(key, {
      font,
      weights: new Set([weight]),
    });
  };

  register(typography.headingFont, typography.headingWeight);
  register(typography.bodyFont, typography.bodyWeight);
  register(resolveStoreTypographyRoleFont(typography, "menu"), typography.menuWeight);
  register(resolveStoreTypographyRoleFont(typography, "productTitle"), typography.productTitleWeight);

  return Array.from(grouped.values()).map(({ font, weights }) => ({
    font,
    weights: resolveFontWeights(font, Array.from(weights)),
  }));
}

export function buildStoreTypographyCssVariables(
  input?: Partial<StoreTypographySettings> | Record<string, unknown> | null,
): Record<string, string> {
  const typography = normalizeStoreTypographySettings(input);
  const headingScale =
    STORE_HEADING_SCALE_OPTIONS.find((option) => option.id === typography.headingScale)?.value ?? "1.12";
  const letterSpacing =
    STORE_LETTER_SPACING_OPTIONS.find((option) => option.id === typography.letterSpacing)?.value ?? "-0.015em";
  const bodyTracking = typography.bodySizePx >= 17 ? "0.002em" : "0em";

  return {
    "--store-font-heading": buildTypographyFontCssStack(typography.headingFont),
    "--store-font-body": buildTypographyFontCssStack(typography.bodyFont),
    "--store-font-menu": buildTypographyFontCssStack(resolveStoreTypographyRoleFont(typography, "menu")),
    "--store-font-product-title": buildTypographyFontCssStack(resolveStoreTypographyRoleFont(typography, "productTitle")),
    "--store-font-heading-weight": typography.headingWeight,
    "--store-font-body-weight": typography.bodyWeight,
    "--store-font-menu-weight": typography.menuWeight,
    "--store-font-product-title-weight": typography.productTitleWeight,
    "--store-font-base-size": `${typography.bodySizePx}px`,
    "--store-font-menu-size": `${typography.menuSizePx}px`,
    "--store-font-product-card-size": `${typography.productCardTitleSizePx}px`,
    "--store-font-product-page-size": `${typography.productPageTitleSizePx}px`,
    "--store-font-heading-scale": headingScale,
    "--store-font-heading-tracking": letterSpacing,
    "--store-font-body-tracking": bodyTracking,
  };
}

export function buildStoreTypographyStylesheetUrl(
  input?: Partial<StoreTypographySettings> | Record<string, unknown> | null,
): string {
  const usedFonts = collectStoreTypographyFonts(input);
  const familyQuery = usedFonts
    .map(({ font, weights }) => `family=${buildStylesheetToken(font, weights)}`)
    .join("&");

  return `https://fonts.googleapis.com/css2?${familyQuery}&display=swap`;
}
