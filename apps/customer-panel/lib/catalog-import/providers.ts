import { XMLParser } from "fast-xml-parser";

export type CatalogImportProvider =
  | "woocommerce"
  | "shopify"
  | "ideasoft"
  | "ticimax"
  | "tsoft"
  | "ikas"
  | "opencart"
  | "prestashop"
  | "magento"
  | "bigcommerce"
  | "wix"
  | "generic";

export type CatalogImportFormat = "csv" | "json" | "xml";

export interface CatalogImportVariant {
  readonly title: string;
  readonly sku?: string;
  readonly barcode?: string;
  readonly priceCents: number;
  readonly compareAtCents?: number;
  readonly costCents?: number;
  readonly stockQuantity: number;
  readonly attributes: Readonly<Record<string, string>>;
}

export interface CatalogImportProduct {
  readonly title: string;
  readonly slug: string;
  readonly description?: string;
  readonly status: "draft" | "active";
  readonly variants: readonly CatalogImportVariant[];
}

export interface CatalogImportParseResult {
  readonly products: readonly CatalogImportProduct[];
  readonly warnings: readonly string[];
  readonly skippedRows: number;
  readonly totalRows: number;
}

interface ProviderDefinition {
  readonly id: CatalogImportProvider;
  readonly label: string;
  readonly description: string;
  readonly templateHeaders: readonly string[];
  readonly templateRow: readonly string[];
  readonly aliases: Readonly<Partial<Record<Field, readonly string[]>>>;
}

type Field =
  | "title"
  | "slug"
  | "description"
  | "status"
  | "published"
  | "variantTitle"
  | "sku"
  | "barcode"
  | "price"
  | "salePrice"
  | "compareAt"
  | "cost"
  | "stock"
  | "option1Name"
  | "option1Value"
  | "option2Name"
  | "option2Value"
  | "option3Name"
  | "option3Value";

type SourceRecord = Readonly<Record<string, string>>;

const MAX_BYTES = 524_288;
const MAX_SOURCE_ROWS = 500;
const MAX_PRODUCTS = 100;
const MAX_VARIANTS = 50;
const CONTROL = /[\u0000-\u001f\u007f]/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKU = /^[A-Z0-9][A-Z0-9._-]{0,63}$/;
const INTEGER = /^(?:0|[1-9]\d*)$/;

const BASE_ALIASES: Readonly<Record<Field, readonly string[]>> = Object.freeze({
  title: ["title", "name", "product name", "urun adi", "ürün adı"],
  slug: ["slug", "handle", "url", "product url", "seo link", "seo url", "seo", "seo keyword", "url rewritten", "url key"],
  description: ["description", "body", "body html", "body (html)", "aciklama", "açıklama"],
  status: ["status", "durum"],
  published: ["published", "visible", "active", "product online", "in stock", "yayinda", "yayında"],
  variantTitle: ["variant", "variant title", "varyant", "varyant adi", "varyant adı", "model", "option set", "option value", "supplier reference"],
  sku: ["sku", "variant sku", "product code/sku", "reference", "stok kodu", "stock code"],
  barcode: ["barcode", "variant barcode", "barkod"],
  price: ["price", "regular price", "variant price", "satis fiyati", "satış fiyatı", "price tax excluded", "fiyat"],
  salePrice: [],
  compareAt: ["compare at price", "variant compare at price", "retail price", "piyasa fiyati", "piyasa fiyatı", "indirim oncesi fiyat", "indirim öncesi fiyat"],
  cost: ["cost", "cost per item", "maliyet"],
  stock: ["stock", "stock quantity", "variant inventory qty", "inventory", "quantity", "current stock", "qty", "stok", "stok adedi"],
  option1Name: ["option1 name", "option name"],
  option1Value: ["option1 value", "option value"],
  option2Name: ["option2 name"],
  option2Value: ["option2 value"],
  option3Name: ["option3 name"],
  option3Value: ["option3 value"],
});

function provider(
  id: CatalogImportProvider,
  label: string,
  description: string,
  templateHeaders: readonly string[],
  templateRow: readonly string[],
  aliases: ProviderDefinition["aliases"] = {},
): ProviderDefinition {
  return Object.freeze({ id, label, description, templateHeaders: Object.freeze(templateHeaders), templateRow: Object.freeze(templateRow), aliases: Object.freeze(aliases) });
}

export const CATALOG_IMPORT_PROVIDERS: readonly ProviderDefinition[] = Object.freeze([
  provider("woocommerce", "WooCommerce", "WooCommerce ürün dışa aktarımı", ["Name", "Slug", "Description", "SKU", "Regular price", "Sale price", "Stock", "Published", "Attribute 1 value(s)"], ["Örnek Ürün", "ornek-urun", "Açıklama", "WOO-1", "120", "100", "10", "1", "Standart"], { variantTitle: ["attribute 1 value(s)"], salePrice: ["sale price"] }),
  provider("shopify", "Shopify", "Shopify Products CSV", ["Handle", "Title", "Body (HTML)", "Published", "Option1 Name", "Option1 Value", "Option2 Name", "Option2 Value", "Option3 Name", "Option3 Value", "Variant SKU", "Variant Price", "Variant Compare At Price", "Variant Inventory Qty", "Variant Barcode", "Cost per item", "Status"], ["ornek-urun", "Örnek Ürün", "<p>Açıklama</p>", "TRUE", "Renk", "Siyah", "", "", "", "", "SHOP-1", "100", "120", "10", "8680000000001", "60", "active"]),
  provider("ideasoft", "IdeaSoft", "IdeaSoft ürün CSV", ["Urun Adi", "Seo Link", "Aciklama", "Stok Kodu", "Fiyat", "Stok Adedi", "Varyant Adi"], ["Örnek Ürün", "ornek-urun", "Açıklama", "IDEA-1", "100", "10", "Standart"]),
  provider("ticimax", "Ticimax", "Ticimax ürün CSV", ["Urun Adi", "SEO Url", "Aciklama", "Stok Kodu", "Barkod", "Satis Fiyati", "Piyasa Fiyati", "Stok", "Varyant"], ["Örnek Ürün", "ornek-urun", "Açıklama", "TICI-1", "8680000000001", "100", "120", "10", "Standart"]),
  provider("tsoft", "T-Soft", "T-Soft ürün CSV", ["Urun Adi", "Seo", "Aciklama", "Stok Kodu", "Fiyat", "Indirimli Fiyat", "Stok", "Varyant"], ["Örnek Ürün", "ornek-urun", "Açıklama", "TSOFT-1", "120", "100", "10", "Standart"], { salePrice: ["indirimli fiyat"] }),
  provider("ikas", "ikas", "ikas ürün CSV", ["name", "slug", "description", "sku", "price", "compare_at_price", "inventory", "status", "variant"], ["Örnek Ürün", "ornek-urun", "Açıklama", "IKAS-1", "100", "120", "10", "active", "Standart"], { compareAt: ["compare at price"] }),
  provider("opencart", "OpenCart", "OpenCart ürün CSV", ["name", "seo_keyword", "description", "sku", "price", "quantity", "status", "model"], ["Örnek Ürün", "ornek-urun", "Açıklama", "OPEN-1", "100", "10", "1", "Standart"]),
  provider("prestashop", "PrestaShop", "PrestaShop ürün CSV", ["Name", "URL rewritten", "Description", "Reference", "Price tax excluded", "Quantity", "Active", "Supplier reference"], ["Örnek Ürün", "ornek-urun", "Açıklama", "PRESTA-1", "100", "10", "1", "Standart"]),
  provider("magento", "Magento", "Magento ürün CSV", ["name", "url_key", "description", "sku", "price", "qty", "product_online", "weight"], ["Örnek Ürün", "ornek-urun", "Açıklama", "MAG-1", "100", "10", "1", "450"], { variantTitle: ["weight"] }),
  provider("bigcommerce", "BigCommerce", "BigCommerce ürün CSV", ["Product Name", "Product URL", "Description", "Product Code/SKU", "Price", "Retail Price", "Current Stock", "Visible", "Option Set"], ["Örnek Ürün", "ornek-urun", "Açıklama", "BIG-1", "100", "120", "10", "Y", "Standart"]),
  provider("wix", "Wix", "Wix ürün CSV", ["Name", "Slug", "Description", "SKU", "Price", "Discounted Price", "Inventory", "In Stock", "Option Value"], ["Örnek Ürün", "ornek-urun", "Açıklama", "WIX-1", "120", "100", "10", "TRUE", "Standart"], { salePrice: ["discounted price"] }),
  provider("generic", "Genel CSV", "Celebix veya genel ürün CSV", ["urun_adi", "slug", "aciklama", "sku", "fiyat", "indirim_oncesi_fiyat", "stok", "varyant"], ["Örnek Ürün", "ornek-urun", "Açıklama", "GEN-1", "100", "120", "10", "Standart"]),
]);

const PROVIDER_IDS = new Set(CATALOG_IMPORT_PROVIDERS.map(({ id }) => id));
const UNSUPPORTED_HEADERS = new Set(["images", "image", "image src", "media", "tags", "etiketler", "category", "categories", "kategori", "seo title", "seo description"]);

function invalid(): never {
  throw new Error("catalog_import_source_invalid");
}

function normalizeHeader(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("ı", "i")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function buildCatalogImportTemplate(selected: CatalogImportProvider): string {
  const definition = CATALOG_IMPORT_PROVIDERS.find(({ id }) => id === selected);
  if (!definition) invalid();
  return `${definition.templateHeaders.map(csvCell).join(",")}\n${definition.templateRow.map(csvCell).join(",")}\n`;
}

function delimiter(firstLine: string): string {
  const counts = new Map([[",", 0], [";", 0], ["\t", 0]]);
  let quoted = false;
  for (let index = 0; index < firstLine.length; index += 1) {
    const character = firstLine[index]!;
    if (character === '"') {
      if (quoted && firstLine[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && counts.has(character)) {
      counts.set(character, (counts.get(character) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? ",";
}

function csvRows(source: string): readonly (readonly string[])[] {
  const clean = source.startsWith("\uFEFF") ? source.slice(1) : source;
  if (/\r(?!\n)/.test(clean)) invalid();
  const normalized = clean.replaceAll("\r\n", "\n");
  const selectedDelimiter = delimiter(normalized.split("\n", 1)[0] ?? "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let closed = false;

  const pushField = () => { row.push(field.trim()); field = ""; closed = false; };
  const pushRow = () => { pushField(); if (row.some(Boolean)) rows.push(row); row = []; };

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index]!;
    if (quoted) {
      if (character === '"') {
        if (normalized[index + 1] === '"') { field += '"'; index += 1; }
        else { quoted = false; closed = true; }
      } else field += character;
    } else if (character === '"') {
      if (field || closed) invalid();
      quoted = true;
    } else if (closed && character !== selectedDelimiter && character !== "\n") invalid();
    else if (character === selectedDelimiter) pushField();
    else if (character === "\n") pushRow();
    else field += character;
  }
  if (quoted) invalid();
  if (row.length || field || closed) pushRow();
  if (rows.length < 2 || rows.length > MAX_SOURCE_ROWS + 1) invalid();
  const width = rows[0]!.length;
  if (width < 2 || rows.some((entry) => entry.length !== width)) invalid();
  return Object.freeze(rows.map((entry) => Object.freeze(entry)));
}

function recordsFromCsv(source: string): readonly SourceRecord[] {
  const rows = csvRows(source);
  const headers = rows[0]!.map(normalizeHeader);
  if (new Set(headers).size !== headers.length || headers.some((header) => !header || CONTROL.test(header))) invalid();
  return Object.freeze(rows.slice(1).map((row) => Object.freeze(Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])))));
}

function plainRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  return value as Record<string, unknown>;
}

function scalar(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value).trim();
  invalid();
}

function sourceRecord(value: unknown): SourceRecord {
  const selected = plainRecord(value);
  if (Object.keys(selected).length < 2 || Object.keys(selected).length > 128) invalid();
  return Object.freeze(Object.fromEntries(Object.entries(selected).map(([key, entry]) => [normalizeHeader(key), scalar(entry)])));
}

function recordsFromJson(source: string): readonly SourceRecord[] {
  let parsed: unknown;
  try { parsed = JSON.parse(source); } catch { invalid(); }
  const rows = Array.isArray(parsed) ? parsed : plainRecord(parsed).products;
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > MAX_SOURCE_ROWS) invalid();
  return Object.freeze(rows.map(sourceRecord));
}

function findXmlProducts(value: unknown, depth = 0): readonly unknown[] | null {
  if (depth > 8 || value === null || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const nested = findXmlProducts(entry, depth + 1);
      if (nested) return nested;
    }
    return null;
  }
  const selected = value as Record<string, unknown>;
  for (const [key, entry] of Object.entries(selected)) {
    if (["product", "item", "entry"].includes(normalizeHeader(key))) return Array.isArray(entry) ? entry : [entry];
  }
  for (const entry of Object.values(selected)) {
    const nested = findXmlProducts(entry, depth + 1);
    if (nested) return nested;
  }
  return null;
}

function recordsFromXml(source: string): readonly SourceRecord[] {
  let parsed: unknown;
  try {
    parsed = new XMLParser({ ignoreAttributes: false, processEntities: false, allowBooleanAttributes: false, trimValues: true, parseTagValue: false, parseAttributeValue: false }).parse(source);
  } catch { invalid(); }
  const rows = findXmlProducts(parsed);
  if (!rows || rows.length < 1 || rows.length > MAX_SOURCE_ROWS) invalid();
  return Object.freeze(rows.map(sourceRecord));
}

function mergedAliases(definition: ProviderDefinition, field: Field): readonly string[] {
  return Object.freeze([...(definition.aliases[field] ?? []), ...BASE_ALIASES[field]].map(normalizeHeader));
}

function field(record: SourceRecord, definition: ProviderDefinition, selected: Field): string {
  for (const alias of mergedAliases(definition, selected)) {
    const value = record[alias];
    if (value !== undefined && value !== "") return value;
  }
  return "";
}

function text(value: string, minimum: number, maximum: number): string {
  const selected = value.trim();
  if (selected.length < minimum || selected.length > maximum || CONTROL.test(selected)) invalid();
  return selected;
}

function slug(value: string, fallback: string): string {
  const selected = (value || fallback)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("ı", "i")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (selected.length < 3 || selected.length > 100 || !SLUG.test(selected)) invalid();
  return selected;
}

function exactSlug(value: string): string {
  if (value.length < 3 || value.length > 100 || value !== value.trim() || !SLUG.test(value)) invalid();
  return value;
}

function integer(value: string): number {
  if (!INTEGER.test(value)) invalid();
  const selected = Number(value);
  if (!Number.isSafeInteger(selected)) invalid();
  return selected;
}

function money(value: string): number {
  const selected = value.replace(/[₺$€£\s]/g, "");
  if (!selected || selected.startsWith("-")) invalid();
  const comma = selected.lastIndexOf(",");
  const dot = selected.lastIndexOf(".");
  let normalized = selected;
  if (comma >= 0 && dot >= 0) normalized = comma > dot ? selected.replaceAll(".", "").replace(",", ".") : selected.replaceAll(",", "");
  else if (comma >= 0) normalized = /^\d{1,3}(?:\.\d{3})*,\d{1,2}$/.test(selected) || /^\d+,\d{1,2}$/.test(selected) ? selected.replaceAll(".", "").replace(",", ".") : selected.replaceAll(",", "");
  else if ((selected.match(/\./g) ?? []).length > 1) normalized = selected.replaceAll(".", "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) invalid();
  const [whole, fraction = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) invalid();
  return cents;
}

function optionalMoney(value: string, minimum: number): number | undefined {
  if (!value) return undefined;
  const selected = money(value);
  return selected >= minimum ? selected : undefined;
}

function sku(value: string): string | undefined {
  if (!value) return undefined;
  const selected = value.trim().toUpperCase();
  if (!SKU.test(selected)) invalid();
  return selected;
}

function barcode(value: string): string | undefined {
  if (!value) return undefined;
  return text(value, 1, 128);
}

function description(value: string): string | undefined {
  if (!value) return undefined;
  const selected = value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return selected ? text(selected, 1, 10_000) : undefined;
}

function truthy(value: string): boolean {
  return ["1", "true", "yes", "y", "evet", "active", "published"].includes(value.trim().toLowerCase());
}

function rowDisabled(record: SourceRecord, definition: ProviderDefinition, canonical: boolean): boolean {
  if (canonical) return false;
  const status = field(record, definition, "status").toLowerCase();
  const published = field(record, definition, "published");
  if (["archived", "inactive", "disabled", "kapali", "kapalı"].includes(status)) return true;
  if (definition.id === "ikas" && status === "draft") return true;
  if (definition.id === "opencart" && status === "0") return true;
  return Boolean(published) && !truthy(published);
}

function productStatus(record: SourceRecord, definition: ProviderDefinition, canonical: boolean): "draft" | "active" {
  if (canonical) return "draft";
  const status = field(record, definition, "status").toLowerCase();
  const published = field(record, definition, "published");
  return ["active", "published"].includes(status) || (definition.id === "opencart" && status === "1") || truthy(published) ? "active" : "draft";
}

function prices(record: SourceRecord, definition: ProviderDefinition, canonical: boolean): Readonly<{ priceCents: number; compareAtCents?: number }> {
  const basePrice = canonical ? integer(record.pricecents ?? "") : money(field(record, definition, "price"));
  if (!canonical) {
    const rawSalePrice = field(record, definition, "salePrice");
    if (rawSalePrice) {
      const salePrice = money(rawSalePrice);
      if (salePrice > basePrice) invalid();
      return Object.freeze(salePrice < basePrice ? { priceCents: salePrice, compareAtCents: basePrice } : { priceCents: basePrice });
    }
  }
  const compareAtCents = optionalMoney(field(record, definition, "compareAt"), basePrice);
  return Object.freeze(compareAtCents === undefined ? { priceCents: basePrice } : { priceCents: basePrice, compareAtCents });
}

function attributes(record: SourceRecord, definition: ProviderDefinition): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const index of [1, 2, 3] as const) {
    const name = field(record, definition, `option${index}Name` as Field);
    const value = field(record, definition, `option${index}Value` as Field);
    if (name && value) result[text(name, 1, 64)] = text(value, 1, 256);
  }
  return Object.freeze(result);
}

function unsupported(record: SourceRecord): boolean {
  return Object.entries(record).some(([key, value]) => value && UNSUPPORTED_HEADERS.has(key));
}

function canonicalHeader(record: SourceRecord): boolean {
  return ["title", "slug", "pricecents", "sku", "stockquantity"].every((key) => Object.hasOwn(record, key));
}

function canonicalize(records: readonly SourceRecord[], definition: ProviderDefinition): CatalogImportParseResult {
  const groups = new Map<string, { title: string; slug: string; description?: string; status: "draft" | "active"; variants: CatalogImportVariant[] }>();
  const seenSkus = new Set<string>();
  let skippedRows = 0;
  let unsupportedFields = false;
  let canonicalMode = false;

  for (const record of records) {
    const canonical = definition.id === "generic" && canonicalHeader(record);
    canonicalMode ||= canonical;
    if (rowDisabled(record, definition, canonical)) { skippedRows += 1; continue; }
    unsupportedFields ||= unsupported(record);
    const rawTitle = field(record, definition, "title");
    const rawSlug = field(record, definition, "slug");
    const existingKey = canonical
      ? exactSlug(rawSlug)
      : rawSlug
        ? slug(rawSlug, rawTitle)
        : rawTitle
          ? slug("", rawTitle)
          : "";
    if (!existingKey) invalid();
    const existing = groups.get(existingKey);
    const titleValue = rawTitle ? text(rawTitle, 1, 200) : existing?.title;
    if (!titleValue) invalid();
    if (canonical && existing) invalid();

    const selectedPrices = prices(record, definition, canonical);
    const priceCents = selectedPrices.priceCents;
    const rawStock = canonical ? record.stockquantity ?? "" : field(record, definition, "stock");
    const stockQuantity = integer(rawStock || "0");
    const selectedSku = sku(field(record, definition, "sku"));
    if (selectedSku && seenSkus.has(selectedSku)) invalid();
    if (selectedSku) seenSkus.add(selectedSku);
    const selectedAttributes = attributes(record, definition);
    const rawVariantTitle = field(record, definition, "variantTitle") || Object.values(selectedAttributes).join(" / ");
    const costCents = optionalMoney(field(record, definition, "cost"), 0);
    const variant: CatalogImportVariant = Object.freeze({
      title: rawVariantTitle ? text(rawVariantTitle, 1, 200) : "Varsayılan",
      ...(selectedSku ? { sku: selectedSku } : {}),
      ...(barcode(field(record, definition, "barcode")) ? { barcode: barcode(field(record, definition, "barcode")) } : {}),
      priceCents,
      ...(selectedPrices.compareAtCents !== undefined ? { compareAtCents: selectedPrices.compareAtCents } : {}),
      ...(costCents !== undefined ? { costCents } : {}),
      stockQuantity,
      attributes: selectedAttributes,
    });
    const selectedDescription = description(field(record, definition, "description"));
    if (!existing) {
      groups.set(existingKey, { title: titleValue, slug: existingKey, ...(selectedDescription ? { description: selectedDescription } : {}), status: productStatus(record, definition, canonical), variants: [variant] });
    } else {
      if (existing.variants.length >= MAX_VARIANTS) invalid();
      existing.variants.push(variant);
      if (!existing.description && selectedDescription) existing.description = selectedDescription;
      if (productStatus(record, definition, canonical) === "active") existing.status = "active";
    }
    if (groups.size > MAX_PRODUCTS) invalid();
  }

  if (groups.size < 1 || (canonicalMode && groups.size + skippedRows !== records.length)) invalid();
  const products = Object.freeze([...groups.values()].map((entry) => Object.freeze({
    title: entry.title,
    slug: entry.slug,
    ...(entry.description ? { description: entry.description } : {}),
    status: entry.status,
    variants: Object.freeze(entry.variants),
  })));
  return Object.freeze({ products, warnings: Object.freeze(unsupportedFields ? ["unsupported_fields_ignored"] : []), skippedRows, totalRows: records.length });
}

export function parseCatalogImportSource(
  source: string,
  options: Readonly<{ provider: CatalogImportProvider; format: CatalogImportFormat }>,
): CatalogImportParseResult {
  if (typeof source !== "string" || new TextEncoder().encode(source).byteLength < 1 || new TextEncoder().encode(source).byteLength > MAX_BYTES || !PROVIDER_IDS.has(options.provider) || !["csv", "json", "xml"].includes(options.format)) invalid();
  const definition = CATALOG_IMPORT_PROVIDERS.find(({ id }) => id === options.provider);
  if (!definition) invalid();
  const records = options.format === "csv" ? recordsFromCsv(source) : options.format === "json" ? recordsFromJson(source) : recordsFromXml(source);
  return canonicalize(records, definition);
}
