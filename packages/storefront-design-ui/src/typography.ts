import {
  type StorefrontDesignFontCategory,
  type StorefrontDesignFontOption,
  type StorefrontDesignFontWeight,
  type StorefrontDesignTypography,
} from "@celebix/saas-contracts";

const FAMILY = /^[A-Za-z0-9][A-Za-z0-9 .&()+-]{0,119}$/;
const FONT_CATEGORIES = Object.freeze(["sans-serif", "serif", "display", "handwriting", "monospace"] as const);
const FONT_WEIGHTS = Object.freeze(["400", "500", "600", "700", "800"] as const);
const CATEGORIES = new Set<string>(FONT_CATEGORIES);
const WEIGHTS = new Set<string>(FONT_WEIGHTS);

export type StorefrontTypographyStyle = Readonly<{
  "--store-heading-font": string;
  "--store-body-font": string;
  "--store-heading-weight": string;
  "--store-body-weight": string;
  "--store-heading-size": string;
  "--store-body-size": string;
}>;

export type StorefrontTypographyResources = Readonly<{
  stylesheetUrl: string;
  style: StorefrontTypographyStyle;
}>;

function invalid(): never {
  throw new TypeError("storefront_typography_invalid");
}

function validateFont(value: StorefrontDesignFontOption): StorefrontDesignFontOption {
  if (!value || typeof value !== "object" || value.source !== "google") invalid();
  if (typeof value.family !== "string" || value.family.trim() !== value.family || !FAMILY.test(value.family)) invalid();
  if (!CATEGORIES.has(value.category)) invalid();
  if (!Array.isArray(value.availableWeights) || value.availableWeights.length < 1 || value.availableWeights.length > FONT_WEIGHTS.length) invalid();
  const unique = new Set<string>();
  for (const weight of value.availableWeights) {
    if (!WEIGHTS.has(weight) || unique.has(weight)) invalid();
    unique.add(weight);
  }
  return value;
}

function validateWeight(font: StorefrontDesignFontOption, value: StorefrontDesignFontWeight): StorefrontDesignFontWeight {
  if (!WEIGHTS.has(value) || !font.availableWeights.includes(value)) invalid();
  return value;
}

function validateSize(value: number, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) invalid();
  return value;
}

function fallback(category: StorefrontDesignFontCategory): string {
  if (category === "serif") return 'Georgia, "Times New Roman", serif';
  if (category === "monospace") return "ui-monospace, SFMono-Regular, monospace";
  if (category === "handwriting") return "cursive";
  return "ui-sans-serif, system-ui, sans-serif";
}

function stack(font: StorefrontDesignFontOption): string {
  return `"${font.family}", ${fallback(font.category)}`;
}

function familyToken(family: string): string {
  return encodeURIComponent(family).replaceAll("%20", "+");
}

export function createStorefrontTypographyResources(value: StorefrontDesignTypography): StorefrontTypographyResources {
  if (!value || typeof value !== "object") invalid();
  const headingFont = validateFont(value.headingFont);
  const bodyFont = validateFont(value.bodyFont);
  const headingWeight = validateWeight(headingFont, value.headingWeight);
  const bodyWeight = validateWeight(bodyFont, value.bodyWeight);
  const headingSize = validateSize(value.headingSizePx, 24, 72);
  const bodySize = validateSize(value.bodySizePx, 14, 20);

  const selected = new Map<string, Readonly<{ family: string; weights: Set<StorefrontDesignFontWeight> }>>();
  for (const [font, weight] of [[headingFont, headingWeight], [bodyFont, bodyWeight]] as const) {
    const key = font.family.toLocaleLowerCase("en-US");
    const existing = selected.get(key);
    if (existing) existing.weights.add(weight);
    else selected.set(key, { family: font.family, weights: new Set([weight]) });
  }
  const familyQuery = [...selected.values()].map(({ family, weights }) => {
    const ordered = [...weights].sort((left, right) => Number(left) - Number(right));
    return `family=${familyToken(family)}:wght@${ordered.join(";")}`;
  }).join("&");
  const style = Object.freeze({
    "--store-heading-font": stack(headingFont),
    "--store-body-font": stack(bodyFont),
    "--store-heading-weight": headingWeight,
    "--store-body-weight": bodyWeight,
    "--store-heading-size": `${headingSize}px`,
    "--store-body-size": `${bodySize}px`,
  });
  return Object.freeze({
    stylesheetUrl: `https://fonts.googleapis.com/css2?${familyQuery}&display=swap`,
    style,
  });
}
