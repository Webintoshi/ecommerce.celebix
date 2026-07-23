export interface BarcodeLabelRow {
  readonly productId: string;
  readonly variantId: string;
  readonly productTitle: string;
  readonly variantTitle: string;
  readonly sku?: string;
  readonly barcode: string;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SKU = /^[A-Z0-9][A-Z0-9._-]{0,63}$/;
const BARCODE = /^[A-Za-z0-9]{6,64}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

function invalid(): never {
  throw new TypeError("invalid_barcode_label_rows");
}

function exactRow(value: unknown): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    invalid();
  }
  const row = value as Record<string, unknown>;
  const required = [
    "productId",
    "variantId",
    "productTitle",
    "variantTitle",
    "barcode",
  ];
  const allowed = new Set([...required, "sku"]);
  if (
    required.some((key) => !Object.hasOwn(row, key)) ||
    Object.keys(row).some((key) => !allowed.has(key))
  ) {
    invalid();
  }
  return row;
}

function text(
  value: unknown,
  minimum: number,
  maximum: number,
  pattern?: RegExp,
): string {
  if (
    typeof value !== "string" ||
    value.length < minimum ||
    value.length > maximum ||
    value !== value.trim() ||
    CONTROL.test(value) ||
    (pattern !== undefined && !pattern.test(value))
  ) {
    invalid();
  }
  return value;
}

function parseExactBarcodeLabelRow(value: unknown): BarcodeLabelRow {
  const row = exactRow(value);
  return {
    productId: text(row.productId, 36, 36, UUID),
    variantId: text(row.variantId, 36, 36, UUID),
    productTitle: text(row.productTitle, 1, 200),
    variantTitle: text(row.variantTitle, 1, 200),
    ...(row.sku === undefined
      ? {}
      : { sku: text(row.sku, 1, 64, SKU) }),
    barcode: text(row.barcode, 6, 64, BARCODE),
  };
}

export function parseBarcodeLabelRows(
  value: unknown,
): readonly BarcodeLabelRow[] {
  if (!Array.isArray(value) || value.length > 500) invalid();
  return Object.freeze(
    value.map((row) => Object.freeze(parseExactBarcodeLabelRow(row))),
  );
}
