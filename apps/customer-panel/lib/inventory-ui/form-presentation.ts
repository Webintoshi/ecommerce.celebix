import type { InventoryVariantChoice } from "./form-choices.ts";

export function inventoryVariantLabel(choice: InventoryVariantChoice): string {
  return `${choice.productTitle}${choice.variantTitle ? ` — ${choice.variantTitle}` : ""}${choice.sku ? ` (${choice.sku})` : ""}`;
}

export function inventoryVariantOptions(
  variants: readonly InventoryVariantChoice[],
  query: string,
  selectedId: string,
): readonly InventoryVariantChoice[] {
  const terms = query.trim().toLocaleLowerCase("tr-TR").split(/\s+/).filter(Boolean);
  const selected = variants.find(variant => variant.variantId === selectedId);
  const matches = variants.filter(variant => variant.variantId !== selectedId && terms.every(term =>
    inventoryVariantLabel(variant).toLocaleLowerCase("tr-TR").includes(term),
  )).slice(0, 50);
  return selected ? [selected, ...matches] : matches;
}
