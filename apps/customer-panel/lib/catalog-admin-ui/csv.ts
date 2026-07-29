import type { CatalogAdminImportRow } from "@celebix/saas-data";

export const CATALOG_IMPORT_CSV_HEADER =
  "title,slug,priceCents,sku,stockQuantity";
const CATALOG_IMPORT_CSV_HEADER_FIELDS = Object.freeze(
  CATALOG_IMPORT_CSV_HEADER.split(","),
);
export const CATALOG_IMPORT_CSV_MAX_BYTES = 131_072;
export const CATALOG_IMPORT_CSV_MAX_ROWS = 100;

const CONTROL = /[\u0000-\u001f\u007f]/;
const DECIMAL_INTEGER = /^(?:0|[1-9]\d*)$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKU = /^[A-Z0-9][A-Z0-9._-]{0,63}$/;

function invalid(): never {
  throw new Error("catalog_import_csv_invalid");
}

function parseCsvRows(source: string): readonly (readonly string[])[] {
  if (source.length === 0 || source.length > CATALOG_IMPORT_CSV_MAX_BYTES) {
    invalid();
  }

  const value = source.startsWith("\uFEFF") ? source.slice(1) : source;
  if (/\r(?!\n)/.test(value)) invalid();
  const normalized = value.replaceAll("\r\n", "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let quoteClosed = false;

  function pushField() {
    row.push(field);
    field = "";
    quoteClosed = false;
  }

  function pushRow() {
    pushField();
    rows.push(row);
    row = [];
  }

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index]!;
    if (quoted) {
      if (character === '"') {
        if (normalized[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          quoteClosed = true;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (quoteClosed && character !== "," && character !== "\n") invalid();
    if (character === '"') {
      if (field.length !== 0 || quoteClosed) invalid();
      quoted = true;
    } else if (character === ",") {
      pushField();
    } else if (character === "\n") {
      pushRow();
    } else {
      field += character;
    }
  }

  if (quoted) invalid();
  if (row.length > 0 || field.length > 0 || quoteClosed) pushRow();
  if (rows.at(-1)?.length === 1 && rows.at(-1)?.[0] === "") rows.pop();
  if (rows.some((entry) => entry.length === 1 && entry[0] === "")) invalid();
  return rows;
}

function canonicalText(
  value: string,
  minimum: number,
  maximum: number,
  pattern?: RegExp,
) {
  if (
    value.length < minimum ||
    value.length > maximum ||
    value !== value.trim() ||
    CONTROL.test(value) ||
    (pattern && !pattern.test(value))
  ) {
    invalid();
  }
  return value;
}

function integer(value: string) {
  if (!DECIMAL_INTEGER.test(value)) invalid();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) invalid();
  return parsed;
}

export function parseCatalogImportCsv(
  value: string,
): readonly CatalogAdminImportRow[] {
  const parsed = parseCsvRows(value);
  const header = parsed[0];
  if (
    header?.length !== CATALOG_IMPORT_CSV_HEADER_FIELDS.length ||
    header.some(
      (field, index) => field !== CATALOG_IMPORT_CSV_HEADER_FIELDS[index],
    ) ||
    parsed.length < 2 ||
    parsed.length > CATALOG_IMPORT_CSV_MAX_ROWS + 1
  ) {
    invalid();
  }

  const slugs = new Set<string>();
  const skus = new Set<string>();
  const rows = parsed.slice(1).map((fields) => {
    if (fields.length !== 5) invalid();
    const [rawTitle, rawSlug, rawPrice, rawSku, rawStock] = fields as readonly [
      string,
      string,
      string,
      string,
      string,
    ];
    const title = canonicalText(rawTitle, 1, 200);
    const slug = canonicalText(rawSlug, 3, 100, SLUG);
    const sku = rawSku === "" ? undefined : canonicalText(rawSku, 1, 64, SKU);
    const priceCents = integer(rawPrice);
    const stockQuantity = integer(rawStock);
    if (slugs.has(slug) || (sku !== undefined && skus.has(sku))) invalid();
    slugs.add(slug);
    if (sku !== undefined) skus.add(sku);
    return Object.freeze({
      title,
      slug,
      priceCents,
      ...(sku === undefined ? {} : { sku }),
      stockQuantity,
    });
  });

  return Object.freeze(rows);
}
