import { XMLParser, XMLValidator } from "fast-xml-parser";
import { DomUtils, parseDocument } from "htmlparser2";
import type { ProductMeasurements } from "@celebix/saas-contracts";
import type { WooCommerceMigrationTaxonomy, WooCommerceMigrationWarningCounts } from "./woocommerce-migration.ts";

type SourceFields = Readonly<Record<string, string>>;
export interface QukasoftMigrationIssue {
  readonly code: "incomplete_variant" | "duplicate_variant" | "ambiguous_weight" | "conflicting_attribute";
  readonly sourceVariantIndex?: number;
  readonly field?: string;
  readonly values?: readonly string[];
}
export interface QukasoftMigrationSourceMetadata {
  readonly [key: string]: unknown;
  readonly provider: "qukasoft";
  readonly rawXml: string;
  readonly fields: SourceFields;
  readonly attributes: readonly SourceFields[];
  readonly variants: readonly SourceFields[];
  readonly weightCandidates: readonly string[];
  readonly issues: readonly QukasoftMigrationIssue[];
}
export interface QukasoftMigrationVariant {
  readonly title: string;
  readonly sku?: string;
  readonly barcode?: string;
  readonly priceCents: number;
  readonly compareAtCents?: number;
  readonly stockQuantity: number;
  readonly attributes: Readonly<Record<string, string>>;
  readonly measurements?: ProductMeasurements;
}
export interface QukasoftMigrationProduct {
  readonly sourceProductId: string;
  readonly title: string;
  readonly slug: string;
  readonly description?: string;
  readonly status: "active" | "draft";
  readonly categorySlugs: readonly string[];
  readonly brandSlugs: readonly string[];
  readonly variants: readonly QukasoftMigrationVariant[];
  readonly sourceImages: readonly string[];
  readonly sourceMetadata: QukasoftMigrationSourceMetadata;
}
export interface QukasoftMigrationWarningCounts extends WooCommerceMigrationWarningCounts {
  readonly incompleteVariants: number;
  readonly duplicateVariants: number;
  readonly ambiguousWeight: number;
  readonly conflictingAttributes: number;
}
export interface QukasoftMigrationManifest {
  readonly sourceDigest: string;
  readonly products: readonly QukasoftMigrationProduct[];
  readonly categories: readonly WooCommerceMigrationTaxonomy[];
  readonly brands: readonly WooCommerceMigrationTaxonomy[];
  readonly batches: readonly (readonly string[])[];
  readonly mediaCount: number;
  readonly warningCounts: QukasoftMigrationWarningCounts;
}

const SOURCE_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const ATTRIBUTE_KEY = /^[\p{L}\p{N}][\p{L}\p{N} ._()/%+-]{0,63}$/u;
const SOURCE_ID = /^[1-9][0-9]{0,19}$/;
const SKU = /^[A-Z0-9][A-Z0-9._-]{0,63}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_STOCK = 2_147_483_647;

function invalid(): never { throw new Error("qukasoft_migration_source_invalid"); }
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return true;
  }
  return false;
}
function text(value: string, maximum: number): string {
  const selected = value.trim();
  if (!selected || selected.length > maximum || CONTROL.test(selected) || hasUnpairedSurrogate(selected)) invalid();
  return selected;
}
function htmlText(value: string): string {
  const clean = value.replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ");
  return DomUtils.textContent(parseDocument(clean, { decodeEntities: true }))
    .replace(/[ \t\u00a0]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
function normalized(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replaceAll("ı", "i");
}
function attributeKey(value: string): string {
  const selected = normalized(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!/^[a-z0-9][a-z0-9_]{0,63}$/.test(selected)) invalid();
  return selected;
}
function slug(value: string): string {
  const selected = normalized(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (selected.length > 100 || !SLUG.test(selected)) invalid();
  return selected;
}
function sku(value: string): string {
  const selected = normalized(text(value, 200)).toUpperCase().replace(/\s+/g, "-").replaceAll(",", ".");
  if (!SKU.test(selected)) invalid();
  return selected;
}
function optionSku(value: string): string {
  const selected = normalized(value).toUpperCase().replaceAll(",", ".").replace(/[^A-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return selected || "SECENEK";
}
function money(value: string): number {
  const selected = value.trim();
  if (!/^(?:0|[1-9][0-9]*)(?:[.,][0-9]{1,2})?$/.test(selected)) invalid();
  const [whole, fraction = ""] = selected.replace(",", ".").split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) invalid();
  return cents;
}
function stock(value: string): number {
  if (!/^(?:0|[1-9][0-9]*)$/.test(value.trim())) invalid();
  const selected = Number(value);
  if (!Number.isSafeInteger(selected) || selected > MAX_STOCK) invalid();
  return selected;
}
function weight(value: string): string | undefined {
  const selected = value.trim().replace(",", ".").replace(/(\.[0-9]*?)0+$/, "$1").replace(/\.$/, "");
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,3})?$/.test(selected) || Number(selected) <= 0 || Number(selected) > 1_000_000) return undefined;
  return selected;
}
function milli(value: string): number {
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
}
function barcode(value: string): string {
  const selected = text(value, 128);
  if (!/^[A-Za-z0-9._-]+$/.test(selected)) invalid();
  return selected;
}
function scalarFields(value: unknown): SourceFields {
  const fields = Object.entries(record(value)).filter((entry): entry is [string, string] => typeof entry[1] === "string");
  return Object.freeze(Object.fromEntries(fields));
}
function nestedFields(value: unknown, key: string): readonly SourceFields[] {
  if (value === undefined || value === "") return Object.freeze([]);
  const candidates = record(value)[key];
  if (!Array.isArray(candidates)) invalid();
  return Object.freeze(candidates.map(scalarFields));
}
function rawProducts(source: string): readonly string[] {
  const rows: string[] = [];
  let start: number | undefined;
  for (const match of source.matchAll(/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<[^>]*>/g)) {
    const token = match[0];
    if (/^<product(?:\s|>)/.test(token)) {
      if (start !== undefined) invalid();
      start = match.index;
    } else if (/^<\/product\s*>$/.test(token)) {
      if (start === undefined) invalid();
      rows.push(source.slice(start, match.index + token.length));
      start = undefined;
    }
  }
  if (start !== undefined) invalid();
  return Object.freeze(rows);
}
function sourceRows(source: string): readonly Readonly<{ fields: SourceFields; attributes: readonly SourceFields[]; variants: readonly SourceFields[]; rawXml: string }>[] {
  if (typeof source !== "string" || new TextEncoder().encode(source).byteLength > 4 * 1024 * 1024 || SOURCE_CONTROL.test(source) || hasUnpairedSurrogate(source) || /<!DOCTYPE|<!ENTITY/i.test(source)) invalid();
  try {
    if (XMLValidator.validate(source) !== true) invalid();
    const parsed = record(new XMLParser({ ignoreDeclaration: true, ignoreAttributes: false, parseTagValue: false, parseAttributeValue: false, trimValues: false, processEntities: true, isArray: (name) => ["product", "variant", "attribute"].includes(name) }).parse(source));
    if (Object.keys(parsed).join(",") !== "products") invalid();
    const root = record(parsed.products);
    if (Object.keys(root).join(",") !== "product" || !Array.isArray(root.product) || root.product.length < 1 || root.product.length > 2500) invalid();
    const raw = rawProducts(source);
    if (raw.length !== root.product.length) invalid();
    return Object.freeze(root.product.map((value, index) => {
      const selected = record(value);
      return Object.freeze({ fields: scalarFields(selected), attributes: nestedFields(selected.attributes, "attribute"), variants: nestedFields(selected.variants, "variant"), rawXml: raw[index]! });
    }));
  } catch { invalid(); }
}

function categories(rows: readonly SourceFields[]): Readonly<{ values: readonly WooCommerceMigrationTaxonomy[]; memberships: readonly (readonly string[])[] }> {
  const paths = rows.map((row) => {
    const raw = row.category?.trim() || [row.main_category, row.top_category, row.sub_category].filter((value) => value?.trim()).join(" >>> ");
    if (!raw) return [];
    const names = raw.split(/\s*>{1,3}\s*/).map((value) => text(htmlText(value), 120));
    if (names.length > 8) invalid();
    return names.map((name) => ({ name, slug: slug(name) }));
  });
  const nodes = new Map<string, { name: string; slug: string; parentKey?: string }>();
  const owners = new Map<string, Set<string>>();
  for (const path of paths) {
    const segments: string[] = [];
    for (const node of path) {
      const parentKey = segments.join(">");
      segments.push(node.slug);
      const key = segments.join(">");
      const existing = nodes.get(key);
      if (existing && existing.name !== node.name) invalid();
      nodes.set(key, { ...node, ...(parentKey ? { parentKey } : {}) });
      const selected = owners.get(node.slug) ?? new Set<string>();
      selected.add(key); owners.set(node.slug, selected);
    }
  }
  const resolved = new Map([...nodes].map(([key, node]) => [key, (owners.get(node.slug)?.size ?? 0) > 1 ? key.replaceAll(">", "-") : node.slug]));
  if (new Set(resolved.values()).size !== resolved.size || nodes.size > 100) invalid();
  const values = [...nodes].map(([key, node]) => {
    const selected = resolved.get(key)!;
    if (selected.length > 100) invalid();
    return Object.freeze({ name: node.name, slug: selected, ...(node.parentKey ? { parentSlug: resolved.get(node.parentKey)! } : {}) });
  });
  return Object.freeze({ values: Object.freeze(values), memberships: Object.freeze(paths.map((path) => Object.freeze(path.map((_node, index) => resolved.get(path.slice(0, index + 1).map((node) => node.slug).join(">"))!).reverse()))) });
}

export async function compileQukasoftMigration(source: string): Promise<QukasoftMigrationManifest> {
  const rows = sourceRows(source);
  const warningCounts = { availabilityStockMapped: 0, descriptionSanitized: 0, duplicateImagesRemoved: 0, missingImage: 0, missingPriceDrafted: 0, incompleteVariants: 0, duplicateVariants: 0, ambiguousWeight: 0, conflictingAttributes: 0 };
  const selectedCategories = categories(rows.map(({ fields }) => fields));
  const brands = new Map<string, WooCommerceMigrationTaxonomy>();
  const sourceIds = new Set<string>(), skus = new Set<string>(), barcodes = new Set<string>();
  const prepared = rows.map((row) => {
    const sourceProductId = text(row.fields.id ?? "", 20);
    if (!SOURCE_ID.test(sourceProductId) || sourceIds.has(sourceProductId)) invalid();
    sourceIds.add(sourceProductId);
    const title = text(htmlText(row.fields.name ?? ""), 200);
    return { ...row, sourceProductId, title, baseSlug: slug(title) };
  });
  const slugCounts = new Map<string, number>();
  for (const row of prepared) slugCounts.set(row.baseSlug, (slugCounts.get(row.baseSlug) ?? 0) + 1);
  let mediaCount = 0;
  const products = prepared.map((row, productIndex) => {
    const fields = row.fields;
    if (fields.currency?.trim() !== "TRY" || !["0", "1"].includes(fields.active?.trim() ?? "")) invalid();
    const issues: QukasoftMigrationIssue[] = [];
    const attributeValues = new Map<string, string[]>();
    const attributeLabels = new Map<string, string>();
    for (const entry of row.attributes) {
      const label = text(htmlText(entry.name ?? ""), 64), value = text(htmlText(entry.value ?? ""), 200);
      if (!ATTRIBUTE_KEY.test(label)) invalid();
      const key = attributeKey(label);
      if (!attributeLabels.has(key)) attributeLabels.set(key, label);
      const values = attributeValues.get(key) ?? [];
      if (!values.includes(value)) values.push(value);
      attributeValues.set(key, values);
    }
    const attributes: Record<string, string> = Object.fromEntries([...attributeValues].map(([key, values]) => {
      if (values.length > 1) { issues.push(Object.freeze({ code: "conflicting_attribute", field: attributeLabels.get(key)!, values: Object.freeze(values) })); warningCounts.conflictingAttributes += 1; }
      return [key, text(values.join(" / "), 200)];
    }));
    for (const [key, value] of [["birim", fields.unit], ["kdv_orani", fields.tax]]) if (value?.trim()) attributes[key!] = text(value, 200);
    const descriptionSource = fields.detail?.trim() ? fields.detail : fields.description ?? "";
    const description = htmlText(descriptionSource);
    if (description.length > 10000 || SOURCE_CONTROL.test(description)) invalid();
    if (description !== descriptionSource) warningCounts.descriptionSanitized += 1;
    const weightCandidates = Object.freeze([...new Set([...description.matchAll(/(?:^|[^\d.,])(\d+(?:[.,]\d+)?)\s*gram/gi)].map((match) => weight(match[1]!)).filter((value): value is string => value !== undefined))]);
    if (weightCandidates.length > 1) { issues.push(Object.freeze({ code: "ambiguous_weight", values: weightCandidates })); warningCounts.ambiguousWeight += 1; }
    const baseWeight = weightCandidates.length === 1 ? weightCandidates[0] : undefined;
    const parentSku = fields.productCode?.trim() ? sku(fields.productCode) : `QUKASOFT-${row.sourceProductId}`;
    const variants: QukasoftMigrationVariant[] = [];
    const duplicateRows = new Set<string>();
    const candidates = row.variants.length ? row.variants : [fields];
    for (const [sourceVariantIndex, selected] of candidates.entries()) {
      const child = row.variants.length > 0;
      if (child) {
        const missing = ["quantity", "barcode", "price"].filter((key) => !selected[key]?.trim());
        if (missing.length) { issues.push(Object.freeze({ code: "incomplete_variant", sourceVariantIndex, values: Object.freeze(missing) })); warningCounts.incompleteVariants += 1; continue; }
        const signature = JSON.stringify(Object.entries(selected).sort(([left], [right]) => left.localeCompare(right)));
        if (duplicateRows.has(signature)) { issues.push(Object.freeze({ code: "duplicate_variant", sourceVariantIndex })); warningCounts.duplicateVariants += 1; continue; }
        duplicateRows.add(signature);
      }
      const choiceAttributes: Record<string, string> = {};
      const choices: string[] = [];
      if (child) for (const ordinal of [1, 2]) {
        const name = selected[`name${ordinal}`]?.trim(), value = selected[`value${ordinal}`]?.trim();
        if (!name && !value) continue;
        if (!name || !value || !ATTRIBUTE_KEY.test(name)) invalid();
        choiceAttributes[attributeKey(text(name, 64))] = text(value, 200); choices.push(value);
      }
      if (child && choices.length === 0) invalid();
      const selectedWeight = Object.entries(choiceAttributes).find(([key]) => normalized(key).toLowerCase() === "gram")?.[1];
      const grams = selectedWeight === undefined ? baseWeight : weight(selectedWeight);
      if (selectedWeight !== undefined && grams === undefined) invalid();
      const variantAttributes = { ...attributes, ...choiceAttributes, ...(grams ? { "Ağırlık (g)": grams } : {}) };
      if (Object.keys(variantAttributes).length > 32) invalid();
      const measurements: ProductMeasurements = {
        ...(grams ? { weight: Object.freeze({ valueMilli: milli(grams), unit: "g" as const }) } : {}),
      };
      const rawLength = Object.entries(choiceAttributes).find(([key]) => normalized(key).toLowerCase() === "uzunluk")?.[1];
      if (rawLength) {
        const match = /^(\d+(?:[.,]\d+)?)\s*(CM|M)$/i.exec(rawLength);
        const parsed = match ? weight(match[1]!) : undefined;
        if (parsed && match) Object.assign(measurements, { length: Object.freeze({ valueMilli: milli(parsed), unit: match[2]!.toLowerCase() as "cm" | "m" }) });
      }
      const title = child ? text(choices.join(" / "), 120) : "Varsayılan";
      const suffix = child ? `-${optionSku(choices.join("-"))}` : "";
      let selectedSku = child ? `${parentSku.slice(0, 64 - suffix.length)}${suffix}` : parentSku;
      if (selectedSku.length > 64 || !SKU.test(selectedSku)) invalid();
      if (skus.has(selectedSku)) {
        if (!child) invalid();
        const indexSuffix = `-${sourceVariantIndex + 1}`;
        selectedSku = `${selectedSku.slice(0, 64 - indexSuffix.length)}${indexSuffix}`;
        if (skus.has(selectedSku)) invalid();
      }
      skus.add(selectedSku);
      const selectedBarcode = selected.barcode?.trim() ? barcode(selected.barcode) : undefined;
      if (selectedBarcode && barcodes.has(selectedBarcode)) invalid();
      if (selectedBarcode) barcodes.add(selectedBarcode);
      if (!selected.price?.trim()) invalid();
      const priceCents = money(selected.price);
      const listPriceCents = !child && fields.listPrice?.trim() ? money(fields.listPrice) : undefined;
      variants.push(Object.freeze({ title, sku: selectedSku, ...(selectedBarcode ? { barcode: selectedBarcode } : {}), priceCents,
        ...(listPriceCents !== undefined && listPriceCents > priceCents ? { compareAtCents: listPriceCents } : {}),
        stockQuantity: stock(selected.quantity ?? ""), attributes: Object.freeze(variantAttributes),
        ...(Object.keys(measurements).length ? { measurements: Object.freeze(measurements) } : {}),
      }));
    }
    if (variants.length === 0 || variants.length > 50) invalid();
    const sourceImages: string[] = [];
    const imageFields = Object.entries(fields).filter(([key]) => /^image[1-9][0-9]*$/.test(key)).sort(([left], [right]) => Number(left.slice(5)) - Number(right.slice(5)));
    for (const [, raw] of imageFields) {
      if (!raw.trim()) continue;
      const image = text(raw, 2048);
      let url: URL;
      try { url = new URL(image); } catch { invalid(); }
      if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || url.href !== image) invalid();
      if (sourceImages.includes(image)) { warningCounts.duplicateImagesRemoved += 1; continue; }
      sourceImages.push(image);
    }
    if (sourceImages.length > 16) invalid();
    if (sourceImages.length === 0) warningCounts.missingImage += 1;
    mediaCount += sourceImages.length;
    const brandName = fields.brand?.trim() ? text(htmlText(fields.brand), 120) : undefined;
    const brandSlug = brandName ? slug(brandName) : undefined;
    if (brandSlug && brandName && !brands.has(brandSlug)) brands.set(brandSlug, Object.freeze({ name: brandName, slug: brandSlug }));
    const selectedSlug = (slugCounts.get(row.baseSlug) ?? 0) > 1 ? `${row.baseSlug}-${row.sourceProductId}` : row.baseSlug;
    if (selectedSlug.length > 100) invalid();
    return Object.freeze({ sourceProductId: row.sourceProductId, title: row.title, slug: selectedSlug,
      ...(description ? { description } : {}), status: fields.active.trim() === "1" ? "active" as const : "draft" as const,
      categorySlugs: selectedCategories.memberships[productIndex]!, brandSlugs: Object.freeze(brandSlug ? [brandSlug] : []),
      variants: Object.freeze(variants), sourceImages: Object.freeze(sourceImages),
      sourceMetadata: Object.freeze({ provider: "qukasoft" as const, rawXml: row.rawXml, fields, attributes: row.attributes, variants: row.variants, weightCandidates, issues: Object.freeze(issues) }),
    });
  });
  if (brands.size > 50 || new Set(products.map(({ slug }) => slug)).size !== products.length) invalid();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  const sourceDigest = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  const batches: (readonly string[])[] = [];
  for (let index = 0; index < products.length; index += 25) batches.push(Object.freeze(products.slice(index, index + 25).map(({ sourceProductId }) => sourceProductId)));
  return Object.freeze({ sourceDigest, products: Object.freeze(products), categories: selectedCategories.values, brands: Object.freeze([...brands.values()]), batches: Object.freeze(batches), mediaCount, warningCounts: Object.freeze(warningCounts) });
}
