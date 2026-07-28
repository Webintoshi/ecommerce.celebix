export interface WooCommerceMigrationTaxonomy {
  readonly name: string;
  readonly slug: string;
}

export interface WooCommerceMigrationVariant {
  readonly title: "Varsayılan";
  readonly sku?: string;
  readonly barcode?: string;
  readonly priceCents: number;
  readonly compareAtCents?: number;
  readonly stockQuantity: number;
  readonly attributes: Readonly<Record<string, string>>;
}

export interface WooCommerceMigrationProduct {
  readonly sourceProductId: string;
  readonly title: string;
  readonly slug: string;
  readonly description?: string;
  readonly status: "draft" | "active";
  readonly categorySlugs: readonly string[];
  readonly brandSlugs: readonly string[];
  readonly variants: readonly WooCommerceMigrationVariant[];
  readonly sourceImages: readonly string[];
}

export interface WooCommerceMigrationWarningCounts {
  readonly availabilityStockMapped: number;
  readonly descriptionSanitized: number;
  readonly duplicateImagesRemoved: number;
  readonly missingImage: number;
  readonly missingPriceDrafted: number;
}

export interface WooCommerceMigrationManifest {
  readonly sourceDigest: string;
  readonly products: readonly WooCommerceMigrationProduct[];
  readonly categories: readonly WooCommerceMigrationTaxonomy[];
  readonly brands: readonly WooCommerceMigrationTaxonomy[];
  readonly batches: readonly (readonly string[])[];
  readonly mediaCount: number;
  readonly warningCounts: WooCommerceMigrationWarningCounts;
}

type SourceRecord = Readonly<Record<string, string>>;

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_ROWS = 2_500;
const MAX_IMAGES = 16;
const MAX_STOCK = 2_147_483_647;
const BATCH_SIZE = 25;
const SOURCE_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const CELL_CONTROL = /[\u0000-\u001f\u007f]/;
const SOURCE_ID = /^[1-9][0-9]{0,19}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKU = /^[A-Z0-9][A-Z0-9._-]{0,63}$/;
const INTEGER = /^(?:0|[1-9][0-9]*)$/;
const GRAMS = /^(?:0|[1-9][0-9]*)(?:[.,][0-9]{1,6})?$/;
const PERSISTED_GRAMS = /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,3})?$/;

const ALIASES = Object.freeze({
  sourceProductId: Object.freeze(["kimlik", "id"]),
  type: Object.freeze(["tur", "type"]),
  sku: Object.freeze(["stok kodu (sku)", "sku"]),
  barcode: Object.freeze(["gtin, upc, ean veya isbn", "gtin, upc, ean, or isbn"]),
  title: Object.freeze(["isim", "name"]),
  published: Object.freeze(["yayimlanmis", "published"]),
  description: Object.freeze(["aciklama", "description"]),
  inStock: Object.freeze(["stokta?", "in stock?"]),
  stock: Object.freeze(["stok", "stock"]),
  weight: Object.freeze(["agirlik (g)", "weight (g)"]),
  salePrice: Object.freeze(["indirimli satis fiyati", "sale price"]),
  regularPrice: Object.freeze(["normal fiyat", "regular price"]),
  categories: Object.freeze(["kategoriler", "categories"]),
  images: Object.freeze(["gorseller", "images"]),
  brands: Object.freeze(["markalar", "brands"]),
});

function invalid(): never {
  throw new Error("woocommerce_migration_source_invalid");
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return true;
  }
  return false;
}

function normalizeHeader(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("ı", "i")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function parseCsvRows(source: string): readonly (readonly string[])[] {
  const bytes = new TextEncoder().encode(source).byteLength;
  if (bytes < 1 || bytes > MAX_BYTES || SOURCE_CONTROL.test(source) || hasUnpairedSurrogate(source)) invalid();
  const clean = source.startsWith("\uFEFF") ? source.slice(1) : source;
  const normalized = clean.replaceAll("\r\n", "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let quoteClosed = false;
  const pushField = () => { row.push(field); field = ""; quoteClosed = false; };
  const pushRow = () => {
    pushField();
    if (row.some((value) => value !== "")) rows.push(row);
    row = [];
  };

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index]!;
    if (quoted) {
      if (character === "\r") { field += "\n"; continue; }
      if (character !== '"') { field += character; continue; }
      if (normalized[index + 1] === '"') { field += '"'; index += 1; continue; }
      quoted = false;
      quoteClosed = true;
      continue;
    }
    if (quoteClosed && character !== "," && character !== "\n") invalid();
    if (character === '"') {
      if (field || quoteClosed) invalid();
      quoted = true;
    } else if (character === "\r") invalid();
    else if (character === ",") pushField();
    else if (character === "\n") pushRow();
    else field += character;
  }
  if (quoted) invalid();
  if (row.length || field || quoteClosed) pushRow();
  if (rows.length < 2 || rows.length > MAX_ROWS + 1) invalid();
  const width = rows[0]!.length;
  if (width < 10 || rows.some((entry) => entry.length !== width)) invalid();
  return Object.freeze(rows.map((entry) => Object.freeze(entry)));
}

function records(source: string): readonly SourceRecord[] {
  const rows = parseCsvRows(source);
  const headers = rows[0]!.map(normalizeHeader);
  if (headers.some((header) => !header || CELL_CONTROL.test(header)) || new Set(headers).size !== headers.length) invalid();
  for (const aliases of Object.values(ALIASES)) {
    if (!aliases.some((alias) => headers.includes(alias))) invalid();
  }
  return Object.freeze(rows.slice(1).map((row) => {
    if (row.some((cell) => SOURCE_CONTROL.test(cell) || hasUnpairedSurrogate(cell))) invalid();
    return Object.freeze(Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
  }));
}

function field(record: SourceRecord, key: keyof typeof ALIASES): string {
  for (const alias of ALIASES[key]) {
    if (Object.hasOwn(record, alias)) return record[alias] ?? "";
  }
  invalid();
}

function boundedText(value: string, minimum: number, maximum: number): string {
  const selected = value.trim();
  if (selected.length < minimum || selected.length > maximum || CELL_CONTROL.test(selected) || hasUnpairedSurrogate(selected)) invalid();
  return selected;
}

function decodeEntities(value: string): string {
  const named: Readonly<Record<string, string>> = Object.freeze({
    amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"',
  });
  return value
    .replace(/&#x([0-9a-f]{1,6});/gi, (_match, digits: string) => {
      const code = Number.parseInt(digits, 16);
      return Number.isSafeInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : invalid();
    })
    .replace(/&#([0-9]{1,7});/g, (_match, digits: string) => {
      const code = Number(digits);
      return Number.isSafeInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : invalid();
    })
    .replace(/&([a-z]+);/gi, (match, name: string) => named[name.toLowerCase()] ?? match);
}

function safeDescription(value: string): Readonly<{ value?: string; sanitized: boolean }> {
  if (!value) return Object.freeze({ sanitized: false });
  const withoutExecutable = value
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi, " ")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<[^>]*>/g, " ");
  const selected = decodeEntities(withoutExecutable)
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!selected) return Object.freeze({ sanitized: value !== selected });
  if (selected.length > 10_000 || SOURCE_CONTROL.test(selected) || hasUnpairedSurrogate(selected)) invalid();
  return Object.freeze({ value: selected, sanitized: selected !== value });
}

function slug(value: string): string {
  const selected = decodeEntities(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("ı", "i")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (selected.length < 1 || selected.length > 100 || !SLUG.test(selected)) invalid();
  return selected;
}

function canonicalSku(value: string): string | undefined {
  if (!value.trim()) return undefined;
  if (CELL_CONTROL.test(value) || hasUnpairedSurrogate(value)) invalid();
  const selected = value.trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("ı", "i")
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replaceAll(",", ".");
  if (!SKU.test(selected)) invalid();
  return selected;
}

function canonicalBarcode(value: string): string | undefined {
  if (!value.trim()) return undefined;
  return boundedText(value, 1, 128);
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

function canonicalStock(raw: string, availability: string): Readonly<{ quantity: number; mapped: boolean }> {
  const selected = raw.trim();
  if (selected) {
    if (!INTEGER.test(selected)) invalid();
    const quantity = Number(selected);
    if (!Number.isSafeInteger(quantity) || quantity > MAX_STOCK) invalid();
    return Object.freeze({ quantity, mapped: false });
  }
  const state = availability.trim().toLowerCase();
  if (state === "1" || state === "true" || state === "backorder") return Object.freeze({ quantity: 1, mapped: true });
  if (state === "0" || state === "false") return Object.freeze({ quantity: 0, mapped: true });
  invalid();
}

function canonicalWeight(value: string): string | undefined {
  const selected = value.trim();
  if (!selected) return undefined;
  if (!GRAMS.test(selected)) invalid();
  const normalized = selected.replace(",", ".").replace(/\.0+$/, "").replace(/(\.[0-9]*?)0+$/, "$1");
  if (!PERSISTED_GRAMS.test(normalized)) invalid();
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 1_000_000) invalid();
  return normalized;
}

function taxonomy(value: string, maximum: number): readonly WooCommerceMigrationTaxonomy[] {
  const result: WooCommerceMigrationTaxonomy[] = [];
  const seen = new Set<string>();
  for (const raw of value.split(",")) {
    if (!raw.trim()) continue;
    const name = boundedText(decodeEntities(raw), 1, 120);
    const selectedSlug = slug(name);
    if (seen.has(selectedSlug)) continue;
    seen.add(selectedSlug);
    result.push(Object.freeze({ name, slug: selectedSlug }));
  }
  if (result.length > maximum) invalid();
  return Object.freeze(result);
}

function canonicalImage(value: string): string {
  if (value !== value.trim() || value.length < 1 || value.length > 2_048 || CELL_CONTROL.test(value) || hasUnpairedSurrogate(value)) invalid();
  let parsed: URL;
  try { parsed = new URL(value); } catch { invalid(); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || parsed.hash || !parsed.hostname || parsed.href !== value) invalid();
  return value;
}

function images(value: string): Readonly<{ values: readonly string[]; removed: number }> {
  const selected: string[] = [];
  const seen = new Set<string>();
  let removed = 0;
  for (const raw of value.split(",")) {
    if (!raw.trim()) continue;
    const image = canonicalImage(raw.trim());
    if (seen.has(image)) { removed += 1; continue; }
    seen.add(image);
    selected.push(image);
  }
  if (selected.length > MAX_IMAGES) invalid();
  return Object.freeze({ values: Object.freeze(selected), removed });
}

function published(value: string): boolean {
  return ["1", "true", "yes", "evet", "published"].includes(value.trim().toLowerCase());
}

function appendTaxonomy(target: WooCommerceMigrationTaxonomy[], seen: Set<string>, values: readonly WooCommerceMigrationTaxonomy[]) {
  for (const item of values) {
    if (seen.has(item.slug)) continue;
    seen.add(item.slug);
    target.push(item);
  }
}

async function sha256(source: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) invalid();
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function compileWooCommerceMigration(source: string): Promise<WooCommerceMigrationManifest> {
  if (typeof source !== "string") invalid();
  const parsedRecords = records(source);
  const prepared = parsedRecords.map((record) => {
    const sourceProductId = boundedText(field(record, "sourceProductId"), 1, 20);
    if (!SOURCE_ID.test(sourceProductId) || field(record, "type").trim().toLowerCase() !== "simple") invalid();
    const title = boundedText(decodeEntities(field(record, "title")), 1, 200);
    return Object.freeze({ record, sourceProductId, title, baseSlug: slug(title) });
  });
  const sourceIds = new Set<string>();
  const skus = new Set<string>();
  const barcodes = new Set<string>();
  const baseSlugCounts = new Map<string, number>();
  for (const row of prepared) {
    if (sourceIds.has(row.sourceProductId)) invalid();
    sourceIds.add(row.sourceProductId);
    baseSlugCounts.set(row.baseSlug, (baseSlugCounts.get(row.baseSlug) ?? 0) + 1);
  }

  const categories: WooCommerceMigrationTaxonomy[] = [];
  const brands: WooCommerceMigrationTaxonomy[] = [];
  const categorySet = new Set<string>();
  const brandSet = new Set<string>();
  const warningCounts = {
    availabilityStockMapped: 0,
    descriptionSanitized: 0,
    duplicateImagesRemoved: 0,
    missingImage: 0,
    missingPriceDrafted: 0,
  };
  let mediaCount = 0;
  const products = prepared.map(({ record, sourceProductId, title, baseSlug }) => {
    const selectedSku = canonicalSku(field(record, "sku"));
    const selectedBarcode = canonicalBarcode(field(record, "barcode"));
    if (selectedSku && skus.has(selectedSku)) invalid();
    if (selectedBarcode && barcodes.has(selectedBarcode)) invalid();
    if (selectedSku) skus.add(selectedSku);
    if (selectedBarcode) barcodes.add(selectedBarcode);

    const regular = field(record, "regularPrice").trim();
    const sale = field(record, "salePrice").trim();
    const hasPrice = Boolean(regular || sale);
    const regularCents = regular ? money(regular) : undefined;
    const saleCents = sale ? money(sale) : undefined;
    if (saleCents !== undefined && regularCents !== undefined && saleCents > regularCents) invalid();
    const priceCents = saleCents ?? regularCents ?? 0;
    const compareAtCents = saleCents !== undefined && regularCents !== undefined && saleCents < regularCents ? regularCents : undefined;
    if (!hasPrice) warningCounts.missingPriceDrafted += 1;

    const selectedStock = canonicalStock(field(record, "stock"), field(record, "inStock"));
    if (selectedStock.mapped) warningCounts.availabilityStockMapped += 1;
    const selectedWeight = canonicalWeight(field(record, "weight"));
    const selectedDescription = safeDescription(field(record, "description"));
    if (selectedDescription.sanitized) warningCounts.descriptionSanitized += 1;
    const selectedCategories = taxonomy(field(record, "categories"), 8);
    const selectedBrands = taxonomy(field(record, "brands"), 8);
    appendTaxonomy(categories, categorySet, selectedCategories);
    appendTaxonomy(brands, brandSet, selectedBrands);
    const selectedImages = images(field(record, "images"));
    warningCounts.duplicateImagesRemoved += selectedImages.removed;
    if (selectedImages.values.length === 0) warningCounts.missingImage += 1;
    mediaCount += selectedImages.values.length;
    const selectedSlug = (baseSlugCounts.get(baseSlug) ?? 0) > 1 ? `${baseSlug}-${sourceProductId}` : baseSlug;
    if (selectedSlug.length > 100 || !SLUG.test(selectedSlug)) invalid();
    const attributes = Object.freeze({ ...(selectedWeight ? { "Ağırlık (g)": selectedWeight } : {}) });
    const variant = Object.freeze({
      title: "Varsayılan" as const,
      ...(selectedSku ? { sku: selectedSku } : {}),
      ...(selectedBarcode ? { barcode: selectedBarcode } : {}),
      priceCents,
      ...(compareAtCents !== undefined ? { compareAtCents } : {}),
      stockQuantity: selectedStock.quantity,
      attributes,
    });
    return Object.freeze({
      sourceProductId,
      title,
      slug: selectedSlug,
      ...(selectedDescription.value ? { description: selectedDescription.value } : {}),
      status: hasPrice && published(field(record, "published")) ? "active" as const : "draft" as const,
      categorySlugs: Object.freeze(selectedCategories.map(({ slug: selected }) => selected)),
      brandSlugs: Object.freeze(selectedBrands.map(({ slug: selected }) => selected)),
      variants: Object.freeze([variant]),
      sourceImages: selectedImages.values,
    });
  });
  const batches: (readonly string[])[] = [];
  for (let index = 0; index < products.length; index += BATCH_SIZE) {
    batches.push(Object.freeze(products.slice(index, index + BATCH_SIZE).map(({ sourceProductId }) => sourceProductId)));
  }
  return Object.freeze({
    sourceDigest: await sha256(source),
    products: Object.freeze(products),
    categories: Object.freeze(categories),
    brands: Object.freeze(brands),
    batches: Object.freeze(batches),
    mediaCount,
    warningCounts: Object.freeze(warningCounts),
  });
}
