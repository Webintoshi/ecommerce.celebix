import type { CatalogAdminImportRow } from "@celebix/saas-data";
import type { CatalogImportFormat } from "@celebix/saas-contracts";

const HEADERS = Object.freeze({
  native_csv: Object.freeze(["title", "slug", "priceCents", "sku", "stockQuantity"]),
  shopify_csv: Object.freeze(["Handle", "Title", "Variant SKU", "Variant Price", "Variant Inventory Qty"]),
} satisfies Readonly<Record<CatalogImportFormat, readonly string[]>>);
const CONTROL = /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/;
const CELL_CONTROL = /[\u0000-\u001f\u007f]/;
const SURROGATE = /[\ud800-\udfff]/;
const FORMULA = /^[=+\-@]/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKU = /^[A-Z0-9][A-Z0-9._-]{0,63}$/;
const INTEGER = /^(?:0|[1-9]\d*)$/;
const MONEY = /^(?:0|[1-9]\d*)(?:\.(\d{1,2}))?$/;

function invalid(): never { throw new Error("catalog_import_csv_invalid"); }

function parseStrictCsv(content: string, expectedHeaders: readonly string[]): readonly (readonly string[])[] {
  if (!content || CONTROL.test(content) || SURROGATE.test(content) || Buffer.byteLength(content, "utf8") > 131_072) invalid();
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let quoteClosed = false;
  const finishField = () => { record.push(field); field = ""; quoted = false; quoteClosed = false; };
  const finishRecord = () => { finishField(); records.push(record); record = []; };

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]!;
    if (quoted) {
      if (character !== '"') { field += character; continue; }
      if (content[index + 1] === '"') { field += '"'; index += 1; continue; }
      quoted = false;
      quoteClosed = true;
      continue;
    }
    if (quoteClosed && character !== "," && character !== "\n" && character !== "\r") invalid();
    if (character === '"') {
      if (field || quoteClosed) invalid();
      quoted = true;
    } else if (character === ",") {
      finishField();
    } else if (character === "\n") {
      finishRecord();
    } else if (character === "\r") {
      if (content[index + 1] !== "\n") invalid();
      finishRecord();
      index += 1;
    } else {
      field += character;
    }
  }
  if (quoted) invalid();
  if (field || record.length || !/\r?\n$/.test(content)) finishRecord();
  if (records.length < 2 || records.length > 101 || records.some((entry) => entry.length !== expectedHeaders.length)) invalid();
  if (records[0]!.some((entry, index) => entry !== expectedHeaders[index])) invalid();
  const rows = records.slice(1);
  if (rows.some((entry) => entry.every((value) => value === ""))) invalid();
  return rows;
}

function safeInteger(value: string): number {
  if (!INTEGER.test(value)) invalid();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) invalid();
  return parsed;
}

function price(value: string): number {
  const match = MONEY.exec(value);
  if (!match) invalid();
  const whole = Number(value.split(".", 1)[0]);
  const cents = Number((match[1] ?? "").padEnd(2, "0"));
  const parsed = whole * 100 + cents;
  if (!Number.isSafeInteger(parsed)) invalid();
  return parsed;
}

function common(title: string, slug: string, rawSku: string, rawPrice: string, rawStock: string, shopify: boolean): CatalogAdminImportRow {
  const cells = [title, slug, rawSku, rawPrice, rawStock];
  if (cells.some((cell) => FORMULA.test(cell)) || title.length < 1 || title.length > 200 || title !== title.trim() || slug.length < 3 || slug.length > 100 || !SLUG.test(slug) || rawSku !== rawSku.trim() || (rawSku && !SKU.test(rawSku))) invalid();
  const row = {
    title,
    slug,
    priceCents: shopify ? price(rawPrice) : safeInteger(rawPrice),
    ...(rawSku ? { sku: rawSku } : {}),
    stockQuantity: safeInteger(rawStock),
  };
  return Object.freeze(row);
}

function assertUnique(rows: readonly CatalogAdminImportRow[]) {
  const slugs = new Set<string>();
  const skus = new Set<string>();
  for (const row of rows) {
    if (slugs.has(row.slug) || (row.sku !== undefined && skus.has(row.sku))) invalid();
    slugs.add(row.slug);
    if (row.sku !== undefined) skus.add(row.sku);
  }
}

export function parseCatalogCsv(input: Readonly<{ format: CatalogImportFormat; content: string }>): readonly CatalogAdminImportRow[] {
  if (!input || typeof input !== "object" || !Object.hasOwn(HEADERS, input.format) || typeof input.content !== "string") invalid();
  const headers = HEADERS[input.format];
  const rows = parseStrictCsv(input.content, headers);
  if (rows.some((row) => row.some((cell) => CELL_CONTROL.test(cell)))) invalid();
  const canonical = rows.map((row) => input.format === "native_csv"
    ? common(row[0]!, row[1]!, row[3]!, row[2]!, row[4]!, false)
    : common(row[1]!, row[0]!, row[2]!, row[3]!, row[4]!, true));
  assertUnique(canonical);
  return Object.freeze(canonical);
}
