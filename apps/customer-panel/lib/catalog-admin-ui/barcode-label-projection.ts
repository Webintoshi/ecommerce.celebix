import {
  parseBarcodeLabelRows,
  type BarcodeLabelRow,
} from "@celebix/saas-contracts";

function record(value: unknown): Record<string, unknown> | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return null;
  }
  return value as Record<string, unknown>;
}

function ownValue(value: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && "value" in descriptor
    ? descriptor.value
    : undefined;
}

export function projectBarcodeLabelProducts(
  value: unknown,
): readonly BarcodeLabelRow[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  const rows: BarcodeLabelRow[] = [];

  for (const entry of value) {
    const detail = record(entry);
    const product = detail === null ? null : record(ownValue(detail, "product"));
    const variants = detail === null ? null : ownValue(detail, "variants");
    if (product === null || !Array.isArray(variants)) continue;

    for (const entryVariant of variants) {
      if (rows.length === 500) break;
      const variant = record(entryVariant);
      if (variant === null) continue;
      const barcode = ownValue(variant, "barcode");
      if (barcode === undefined) continue;
      const sku = ownValue(variant, "sku");
      const candidate = {
        productId: ownValue(product, "id"),
        variantId: ownValue(variant, "id"),
        productTitle: ownValue(product, "title"),
        variantTitle: ownValue(variant, "title"),
        ...(sku === undefined ? {} : { sku }),
        barcode,
      };
      try {
        rows.push(parseBarcodeLabelRows([candidate])[0]!);
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
      }
    }
    if (rows.length === 500) break;
  }

  return parseBarcodeLabelRows(rows);
}
