import { resolvePublicProductVariantMedia, type PublicProduct, type PublicProductMedia, type PublicProductVariant } from "@celebix/saas-contracts";

export type SioraColorGroup = Readonly<{
  key: string;
  label: string;
  variants: readonly PublicProductVariant[];
  media: PublicProductMedia | undefined;
}>;

const COLOR_KEYS = new Set(["renk", "color", "colour"]);
const normalizedKey = (key: string) => key.trim().toLocaleLowerCase("en-US");
const nonColorOptions = (variant: PublicProductVariant) => Object.entries(variant.attributes).filter(([key]) => !COLOR_KEYS.has(normalizedKey(key)));

function colorValue(variant: PublicProductVariant): string | undefined {
  return Object.entries(variant.attributes).find(([key, value]) => COLOR_KEYS.has(normalizedKey(key)) && value.trim())?.[1].trim();
}

function colorKey(variant: PublicProductVariant): string {
  return colorValue(variant)?.toLocaleLowerCase("tr-TR") ?? "__default__";
}

function colorLabel(value: string | undefined): string {
  if (!value) return "";
  if (value.toLocaleLowerCase("en-US").replace(/\u0307/g, "") === "mavi") return "Mavi";
  const label = value === value.toLocaleUpperCase("tr-TR") ? value.toLocaleLowerCase("tr-TR") : value;
  return label.replace(/(^|\s)\p{L}/gu, (letter) => letter.toLocaleUpperCase("tr-TR"));
}

export function sioraInitialVariant(product: PublicProduct): PublicProductVariant | undefined {
  const coverId = product.media[0]?.id;
  return (coverId ? product.variants.find((variant) => variant.available && variant.mediaIds?.includes(coverId)) : undefined)
    ?? product.variants.find(({ available }) => available)
    ?? product.variants[0];
}

export function sioraColorGroups(product: PublicProduct): readonly SioraColorGroup[] {
  const groups = new Map<string, { label: string; variants: PublicProductVariant[] }>();
  for (const variant of product.variants) {
    const key = colorKey(variant);
    const existing = groups.get(key);
    if (existing) existing.variants.push(variant);
    else groups.set(key, { label: colorLabel(colorValue(variant)), variants: [variant] });
  }
  const initial = sioraInitialVariant(product);
  const initialKey = initial ? colorKey(initial) : undefined;
  const ordered = [...groups.entries()];
  const initialIndex = ordered.findIndex(([key]) => key === initialKey);
  if (initialIndex > 0) ordered.unshift(...ordered.splice(initialIndex, 1));
  return ordered.map(([key, group]) => {
    const representative = group.variants.find(({ available }) => available) ?? group.variants[0];
    return { key, label: group.label, variants: group.variants, media: resolvePublicProductVariantMedia(product, representative?.id)[0] };
  });
}

function optionDisplay(value: string): string {
  const normalized = value.trim().toLocaleLowerCase("en-US").replace(/ı/g, "i");
  return ({ small: "S", medium: "M", large: "L" } as Readonly<Record<string, string>>)[normalized] ?? value;
}

export function sioraOptionLabel(variant: PublicProductVariant): string {
  const options = nonColorOptions(variant);
  return options.length ? options.map(([, value]) => optionDisplay(value)).join(" / ") : variant.title;
}

export function sioraHasSameOptions(left: PublicProductVariant, right: PublicProductVariant): boolean {
  const leftOptions = nonColorOptions(left);
  const rightOptions = new Map(nonColorOptions(right).map(([key, value]) => [normalizedKey(key), value]));
  return leftOptions.length === rightOptions.size && leftOptions.every(([key, value]) => rightOptions.get(normalizedKey(key)) === value);
}

export function sioraVariantForColor(group: SioraColorGroup, previousVariant?: PublicProductVariant): PublicProductVariant | undefined {
  return (previousVariant ? group.variants.find((variant) => variant.available && sioraHasSameOptions(variant, previousVariant)) : undefined)
    ?? group.variants.find(({ available }) => available)
    ?? group.variants[0];
}

export function sioraNeedsOptionChoice(group: SioraColorGroup): boolean {
  return group.variants.length > 1 || group.variants.some((variant) => nonColorOptions(variant).length > 0 || (!colorValue(variant) && !["", "varsayılan", "default"].includes(variant.title.trim().toLocaleLowerCase("tr-TR"))));
}
