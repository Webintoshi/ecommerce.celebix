const SKU = /^[A-Z0-9][A-Z0-9._-]{0,63}$/;

export function composeManualSku(value: string, skuPrefix: string | undefined): string {
  const suffix = value.trim().toUpperCase();
  if (!suffix) return "";
  const full = skuPrefix ? `${skuPrefix}-${suffix}` : suffix;
  if (full.length > 64 || !SKU.test(full) || (skuPrefix && !/^[A-Z0-9][A-Z0-9._-]*$/.test(suffix))) {
    throw new TypeError("invalid_sku");
  }
  return full;
}

export function manualSkuDisplay(fullSku: string, skuPrefix: string | undefined): Readonly<{ suffix: string; legacy: boolean }> {
  if (!skuPrefix || !fullSku) return Object.freeze({ suffix: fullSku, legacy: false });
  const marker = `${skuPrefix}-`;
  return fullSku.startsWith(marker)
    ? Object.freeze({ suffix: fullSku.slice(marker.length), legacy: false })
    : Object.freeze({ suffix: fullSku, legacy: true });
}
