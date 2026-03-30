export type StoreTypographyFontId =
  | "inter"
  | "manrope"
  | "plus-jakarta"
  | "dm-sans"
  | "montserrat"
  | "playfair"
  | "cormorant"
  | "fraunces";

export type StoreTypographyHeadingWeight = "600" | "700" | "800";
export type StoreTypographyBodyWeight = "400" | "500" | "600";
export type StoreTypographyBaseSize = "compact" | "balanced" | "comfortable";
export type StoreTypographyHeadingScale = "restrained" | "balanced" | "editorial";
export type StoreTypographyLetterSpacing = "tight" | "normal" | "airy";

export interface StoreTypographySettings {
  headingFamily: StoreTypographyFontId;
  bodyFamily: StoreTypographyFontId;
  headingWeight: StoreTypographyHeadingWeight;
  bodyWeight: StoreTypographyBodyWeight;
  baseSize: StoreTypographyBaseSize;
  headingScale: StoreTypographyHeadingScale;
  letterSpacing: StoreTypographyLetterSpacing;
}

export interface TypographyFontOption {
  id: StoreTypographyFontId;
  label: string;
  category: string;
  description: string;
  cssStack: string;
  previewStack: string;
  stylesheetToken: string;
}

export interface TypographyChoiceOption<T extends string> {
  id: T;
  label: string;
  description: string;
  value: string;
}

const FONT_OPTIONS: TypographyFontOption[] = [
  {
    id: "inter",
    label: "Inter",
    category: "Modern Sans",
    description: "Temiz, nötr ve e-ticaret arayüzleri için güvenli seçim.",
    cssStack: '"Inter", system-ui, sans-serif',
    previewStack: '"Inter", system-ui, sans-serif',
    stylesheetToken: "Inter:wght@400;500;600;700;800",
  },
  {
    id: "manrope",
    label: "Manrope",
    category: "Premium Sans",
    description: "Biraz daha güçlü ve premium görünen modern sans.",
    cssStack: '"Manrope", system-ui, sans-serif',
    previewStack: '"Manrope", system-ui, sans-serif',
    stylesheetToken: "Manrope:wght@400;500;600;700;800",
  },
  {
    id: "plus-jakarta",
    label: "Plus Jakarta Sans",
    category: "Refined Sans",
    description: "Yumuşak, çağdaş ve okunabilir sans aile.",
    cssStack: '"Plus Jakarta Sans", system-ui, sans-serif',
    previewStack: '"Plus Jakarta Sans", system-ui, sans-serif',
    stylesheetToken: "Plus+Jakarta+Sans:wght@400;500;600;700;800",
  },
  {
    id: "dm-sans",
    label: "DM Sans",
    category: "Commerce Sans",
    description: "Ürün kartları ve içerik bloklarında dengeli sonuç verir.",
    cssStack: '"DM Sans", system-ui, sans-serif',
    previewStack: '"DM Sans", system-ui, sans-serif',
    stylesheetToken: "DM+Sans:wght@400;500;600;700",
  },
  {
    id: "montserrat",
    label: "Montserrat",
    category: "Structured Sans",
    description: "Başlıklarda daha mimari ve güçlü bir duruş verir.",
    cssStack: '"Montserrat", system-ui, sans-serif',
    previewStack: '"Montserrat", system-ui, sans-serif',
    stylesheetToken: "Montserrat:wght@500;600;700;800",
  },
  {
    id: "playfair",
    label: "Playfair Display",
    category: "Editorial Serif",
    description: "Lüks, klasik ve vitrin odaklı başlıklar için güçlü seçim.",
    cssStack: '"Playfair Display", Georgia, serif',
    previewStack: '"Playfair Display", Georgia, serif',
    stylesheetToken: "Playfair+Display:wght@500;600;700",
  },
  {
    id: "cormorant",
    label: "Cormorant Garamond",
    category: "Luxury Serif",
    description: "Moda, takı ve premium zanaat markaları için rafine serif.",
    cssStack: '"Cormorant Garamond", Georgia, serif',
    previewStack: '"Cormorant Garamond", Georgia, serif',
    stylesheetToken: "Cormorant+Garamond:wght@500;600;700",
  },
  {
    id: "fraunces",
    label: "Fraunces",
    category: "Character Serif",
    description: "Daha karakterli, çağdaş ve dikkat çekici başlıklar üretir.",
    cssStack: '"Fraunces", Georgia, serif',
    previewStack: '"Fraunces", Georgia, serif',
    stylesheetToken: "Fraunces:wght@500;600;700",
  },
];

export const STORE_HEADING_FONT_OPTIONS = FONT_OPTIONS.filter((option) =>
  ["manrope", "plus-jakarta", "montserrat", "playfair", "cormorant", "fraunces"].includes(option.id),
);

export const STORE_BODY_FONT_OPTIONS = FONT_OPTIONS.filter((option) =>
  ["inter", "manrope", "plus-jakarta", "dm-sans"].includes(option.id),
);

export const STORE_HEADING_WEIGHT_OPTIONS: TypographyChoiceOption<StoreTypographyHeadingWeight>[] = [
  { id: "600", label: "Yari Kalin", description: "Daha zarif ve premium bir denge.", value: "600" },
  { id: "700", label: "Kalin", description: "E-ticaret için en güvenli ve dengeli seçim.", value: "700" },
  { id: "800", label: "Cok Kalin", description: "Daha vurucu kahraman alanlari ve banner basliklari.", value: "800" },
];

export const STORE_BODY_WEIGHT_OPTIONS: TypographyChoiceOption<StoreTypographyBodyWeight>[] = [
  { id: "400", label: "Normal", description: "Uzun icerik ve urun detaylari icin en rahat okuma.", value: "400" },
  { id: "500", label: "Orta", description: "Biraz daha belirgin ama hala rahat govde metni.", value: "500" },
  { id: "600", label: "Guclu", description: "Kompakt ve daha iddiali metin tonu.", value: "600" },
];

export const STORE_BASE_SIZE_OPTIONS: TypographyChoiceOption<StoreTypographyBaseSize>[] = [
  { id: "compact", label: "Kompakt", description: "Daha yogun ve urun odakli arayuzler icin.", value: "15px" },
  { id: "balanced", label: "Dengeli", description: "Genel kullanim icin en guvenli boyut.", value: "16px" },
  { id: "comfortable", label: "Rahat", description: "Daha premium ve daha ferah okuma deneyimi.", value: "17px" },
];

export const STORE_HEADING_SCALE_OPTIONS: TypographyChoiceOption<StoreTypographyHeadingScale>[] = [
  { id: "restrained", label: "Sakin", description: "Minimal ve kontrollu baslik hiyerarsisi.", value: "1.04" },
  { id: "balanced", label: "Dengeli", description: "Hero ve kart basliklari icin standart oran.", value: "1.12" },
  { id: "editorial", label: "Editoral", description: "Daha dramatik ve vitrin odakli baslik boyutu.", value: "1.2" },
];

export const STORE_LETTER_SPACING_OPTIONS: TypographyChoiceOption<StoreTypographyLetterSpacing>[] = [
  { id: "tight", label: "Siki", description: "Serif ve luks basliklarla iyi calisir.", value: "-0.035em" },
  { id: "normal", label: "Normal", description: "Cogu marka icin dengeli varsayilan.", value: "-0.015em" },
  { id: "airy", label: "Acik", description: "Sans basliklarda daha ferah gorunum verir.", value: "0.01em" },
];

export const DEFAULT_STORE_TYPOGRAPHY: StoreTypographySettings = {
  headingFamily: "playfair",
  bodyFamily: "inter",
  headingWeight: "700",
  bodyWeight: "400",
  baseSize: "balanced",
  headingScale: "balanced",
  letterSpacing: "normal",
};

const FONT_OPTION_MAP = new Map(FONT_OPTIONS.map((option) => [option.id, option]));

function isValidChoice<T extends string>(
  value: string | undefined,
  options: readonly TypographyChoiceOption<T>[],
): value is T {
  return options.some((option) => option.id === value);
}

function isValidFontChoice(
  value: string | undefined,
  options: readonly TypographyFontOption[],
): value is StoreTypographyFontId {
  return options.some((option) => option.id === value);
}

export function normalizeStoreTypographySettings(
  input?: Partial<StoreTypographySettings> | null,
): StoreTypographySettings {
  const headingFamily = isValidFontChoice(input?.headingFamily, STORE_HEADING_FONT_OPTIONS)
    ? input.headingFamily
    : DEFAULT_STORE_TYPOGRAPHY.headingFamily;
  const bodyFamily = isValidFontChoice(input?.bodyFamily, STORE_BODY_FONT_OPTIONS)
    ? input.bodyFamily
    : DEFAULT_STORE_TYPOGRAPHY.bodyFamily;

  return {
    headingFamily,
    bodyFamily,
    headingWeight: isValidChoice(input?.headingWeight, STORE_HEADING_WEIGHT_OPTIONS)
      ? input.headingWeight
      : DEFAULT_STORE_TYPOGRAPHY.headingWeight,
    bodyWeight: isValidChoice(input?.bodyWeight, STORE_BODY_WEIGHT_OPTIONS)
      ? input.bodyWeight
      : DEFAULT_STORE_TYPOGRAPHY.bodyWeight,
    baseSize: isValidChoice(input?.baseSize, STORE_BASE_SIZE_OPTIONS)
      ? input.baseSize
      : DEFAULT_STORE_TYPOGRAPHY.baseSize,
    headingScale: isValidChoice(input?.headingScale, STORE_HEADING_SCALE_OPTIONS)
      ? input.headingScale
      : DEFAULT_STORE_TYPOGRAPHY.headingScale,
    letterSpacing: isValidChoice(input?.letterSpacing, STORE_LETTER_SPACING_OPTIONS)
      ? input.letterSpacing
      : DEFAULT_STORE_TYPOGRAPHY.letterSpacing,
  };
}

export function getFontOptionById(fontId: StoreTypographyFontId): TypographyFontOption {
  return FONT_OPTION_MAP.get(fontId) ?? FONT_OPTION_MAP.get(DEFAULT_STORE_TYPOGRAPHY.bodyFamily)!;
}

export function buildStoreTypographyCssVariables(
  input?: Partial<StoreTypographySettings> | null,
): Record<string, string> {
  const typography = normalizeStoreTypographySettings(input);
  const headingFont = getFontOptionById(typography.headingFamily);
  const bodyFont = getFontOptionById(typography.bodyFamily);
  const baseSize = STORE_BASE_SIZE_OPTIONS.find((option) => option.id === typography.baseSize)?.value ?? "16px";
  const headingScale =
    STORE_HEADING_SCALE_OPTIONS.find((option) => option.id === typography.headingScale)?.value ?? "1.12";
  const letterSpacing =
    STORE_LETTER_SPACING_OPTIONS.find((option) => option.id === typography.letterSpacing)?.value ?? "-0.015em";
  const bodyTracking = typography.baseSize === "comfortable" ? "0.002em" : "0em";

  return {
    "--store-font-heading": headingFont.cssStack,
    "--store-font-body": bodyFont.cssStack,
    "--store-font-heading-weight": typography.headingWeight,
    "--store-font-body-weight": typography.bodyWeight,
    "--store-font-base-size": baseSize,
    "--store-font-heading-scale": headingScale,
    "--store-font-heading-tracking": letterSpacing,
    "--store-font-body-tracking": bodyTracking,
  };
}

export function buildStoreTypographyStylesheetUrl(
  input?: Partial<StoreTypographySettings> | null,
): string {
  const typography = normalizeStoreTypographySettings(input);
  const usedFonts = Array.from(
    new Set([typography.headingFamily, typography.bodyFamily].map((fontId) => getFontOptionById(fontId))),
  );
  const familyQuery = usedFonts.map((font) => `family=${font.stylesheetToken}`).join("&");
  return `https://fonts.googleapis.com/css2?${familyQuery}&display=swap`;
}
