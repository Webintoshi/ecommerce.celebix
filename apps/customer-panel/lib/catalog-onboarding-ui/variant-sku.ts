type Attributes = Readonly<Record<string, string>>;

const SKU = /^[A-Z0-9][A-Z0-9._-]{0,63}$/;
const COLOR_KEYS = new Set(["RENK", "RENGI", "URUN-RENGI", "RENK-SECENEGI", "COLOR", "COLOUR"]);
const SIZE_KEYS = new Set(["BEDEN", "SIZE", "NUMARA"]);

function asciiUppercase(value: string): string {
  return value.replaceAll("ı", "i").normalize("NFKD").replace(/\p{M}/gu, "").toUpperCase();
}

function attributeToken(value: string): string {
  return asciiUppercase(value).replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function variantSuffix(attributes: Attributes): string | undefined {
  const entries = Object.entries(attributes);
  const selected = entries.find(([key]) => COLOR_KEYS.has(attributeToken(key)))
    ?? entries.find(([key]) => SIZE_KEYS.has(attributeToken(key)));
  if (!selected) return undefined;
  const suffix = attributeToken(selected[1]);
  if (!suffix) throw new TypeError("invalid_sku");
  return suffix;
}

export function composeVariantSku(baseSku: string, attributes: Attributes): string {
  if (baseSku === "") return "";
  const base = asciiUppercase(baseSku);
  if (!SKU.test(base)) throw new TypeError("invalid_sku");
  const suffix = variantSuffix(attributes);
  const sku = suffix === undefined ? base : `${base}-${suffix}`;
  if (!SKU.test(sku)) throw new TypeError("invalid_sku");
  return sku;
}

export function assignVariantSkus<T extends { sku: string; attributes: Attributes }>(
  baseSku: string, rows: readonly T[], previousBaseSku?: string,
): readonly T[] {
  return Object.freeze(rows.map((row) => {
    if (row.sku !== "") {
      if (previousBaseSku === undefined) return row;
      try { if (row.sku !== composeVariantSku(previousBaseSku, row.attributes)) return row; }
      catch (error) { if (error instanceof TypeError) return row; throw error; }
    }
    const sku = composeVariantSku(baseSku, row.attributes);
    return sku === row.sku ? row : Object.freeze({ ...row, sku });
  }));
}

export function deriveProductBaseSku(variants: readonly { sku?: string; attributes: Attributes }[]): string {
  const standard = variants.find(({ sku, attributes }) => sku !== undefined && SKU.test(sku) && Object.keys(attributes).length === 0);
  if (standard?.sku) return standard.sku;
  for (const variant of variants) {
    if (!variant.sku || !SKU.test(variant.sku)) continue;
    let suffix: string | undefined;
    try { suffix = variantSuffix(variant.attributes); }
    catch (error) { if (error instanceof TypeError) continue; throw error; }
    if (suffix === undefined || !variant.sku.endsWith(`-${suffix}`)) continue;
    const base = variant.sku.slice(0, -(suffix.length + 1));
    if (SKU.test(base)) return base;
  }
  return variants.find(({ sku }) => sku !== undefined && SKU.test(sku))?.sku ?? "";
}
