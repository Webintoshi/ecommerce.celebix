import type { StorefrontDesignFontOption, StorefrontDesignFontWeight, StorefrontDesignTypography } from "@celebix/saas-contracts";

export type TypographyRole = "heading" | "body";

export function normalizeTypographySearch(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function filterTypographyFonts(fonts: readonly StorefrontDesignFontOption[], query: string, selected: StorefrontDesignFontOption, limit = 80): readonly StorefrontDesignFontOption[] {
  const needle = normalizeTypographySearch(query);
  const matches = fonts.filter((font) => !needle || normalizeTypographySearch(`${font.family} ${font.category}`).includes(needle));
  const pinned = matches.some(({ family }) => family === selected.family) ? matches : [selected, ...matches];
  const seen = new Set<string>();
  return Object.freeze(pinned.filter(({ family }) => !seen.has(family) && Boolean(seen.add(family))).slice(0, Math.max(1, Math.min(200, Math.trunc(limit) || 80))));
}

function defaultWeight(role: TypographyRole, font: StorefrontDesignFontOption): StorefrontDesignFontWeight {
  const preferred = role === "heading" ? "700" : "400";
  return font.availableWeights.includes(preferred) ? preferred : font.availableWeights[0]!;
}

export function selectTypographyFont(typography: StorefrontDesignTypography, role: TypographyRole, font: StorefrontDesignFontOption): StorefrontDesignTypography {
  if (!font.availableWeights.length) return typography;
  if (role === "heading") return Object.freeze({ ...typography, headingFont: font, headingWeight: font.availableWeights.includes(typography.headingWeight) ? typography.headingWeight : defaultWeight(role, font) });
  return Object.freeze({ ...typography, bodyFont: font, bodyWeight: font.availableWeights.includes(typography.bodyWeight) ? typography.bodyWeight : defaultWeight(role, font) });
}

export function selectTypographyWeight(typography: StorefrontDesignTypography, role: TypographyRole, weight: StorefrontDesignFontWeight): StorefrontDesignTypography {
  const available = role === "heading" ? typography.headingFont.availableWeights : typography.bodyFont.availableWeights;
  if (!available.includes(weight)) return typography;
  return Object.freeze(role === "heading" ? { ...typography, headingWeight: weight } : { ...typography, bodyWeight: weight });
}

export function selectTypographySize(typography: StorefrontDesignTypography, role: TypographyRole, value: number): StorefrontDesignTypography {
  if (!Number.isFinite(value)) return typography;
  const minimum = role === "heading" ? 24 : 14, maximum = role === "heading" ? 72 : 20;
  const selected = Math.min(maximum, Math.max(minimum, Math.round(value)));
  return Object.freeze(role === "heading" ? { ...typography, headingSizePx: selected } : { ...typography, bodySizePx: selected });
}
