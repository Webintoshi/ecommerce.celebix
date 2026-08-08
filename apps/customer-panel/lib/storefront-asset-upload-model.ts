import type { StorefrontAssetKind } from "@celebix/saas-contracts";

export type StorefrontAssetRatio = "1:1" | "3:4" | "4:5" | "16:9";

export type StorefrontAssetRatioOption = Readonly<{
  value: StorefrontAssetRatio;
  label: string;
  hint: string;
  width: number;
  height: number;
}>;

const RATIO_OPTIONS = Object.freeze({
  "1:1": Object.freeze({ value: "1:1", label: "Kare", hint: "Logo ve kare görseller", width: 1, height: 1 }),
  "3:4": Object.freeze({ value: "3:4", label: "Dikey", hint: "Telefon ve ürün vitrini", width: 3, height: 4 }),
  "4:5": Object.freeze({ value: "4:5", label: "Dikey geniş", hint: "Koleksiyon vitrini", width: 4, height: 5 }),
  "16:9": Object.freeze({ value: "16:9", label: "Yatay", hint: "Masaüstü banner", width: 16, height: 9 }),
} satisfies Record<StorefrontAssetRatio, StorefrontAssetRatioOption>);

const OPTIONS_BY_KIND = Object.freeze({
  hero: Object.freeze([RATIO_OPTIONS["16:9"], RATIO_OPTIONS["3:4"]]),
  category: Object.freeze([RATIO_OPTIONS["1:1"], RATIO_OPTIONS["3:4"], RATIO_OPTIONS["4:5"]]),
  logo: Object.freeze([RATIO_OPTIONS["1:1"], RATIO_OPTIONS["16:9"]]),
  social: Object.freeze([RATIO_OPTIONS["1:1"], RATIO_OPTIONS["16:9"]]),
  favicon: Object.freeze([RATIO_OPTIONS["1:1"]]),
} satisfies Record<StorefrontAssetKind, readonly StorefrontAssetRatioOption[]>);

function validDimension(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

export function storefrontAssetRatioOptions(kind: StorefrontAssetKind): readonly StorefrontAssetRatioOption[] {
  return OPTIONS_BY_KIND[kind];
}

export function storefrontAssetRatioMatches(width: number, height: number, ratio: StorefrontAssetRatio): boolean {
  if (!validDimension(width) || !validDimension(height)) return false;
  const option = RATIO_OPTIONS[ratio];
  const expected = option.width / option.height;
  return Math.abs((width / height) - expected) / expected <= 0.02;
}

export function storefrontAssetRatioLabel(width: number, height: number): string {
  for (const ratio of Object.keys(RATIO_OPTIONS) as StorefrontAssetRatio[]) {
    if (storefrontAssetRatioMatches(width, height, ratio)) return ratio;
  }
  return "Özel oran";
}
