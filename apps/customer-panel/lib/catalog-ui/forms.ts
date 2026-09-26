import type { ProductStatus, ProductMeasurements } from "@celebix/saas-contracts";

import { parseTurkishMoneyToCents } from "./money.ts";
import { parseProductMeasurements, type ProductMeasurementDraft } from "./product-measurements.ts";

export type CatalogProductFields = Readonly<{
  slug: string;
  title: string;
  description?: string;
  status: Exclude<ProductStatus, "archived">;
  currency: string;
}>;

export type CatalogVariantFields = Readonly<{
  title: string;
  sku?: string;
  barcode?: string;
  priceCents: number;
  compareAtCents?: number;
  costCents?: number;
  stockTracking: boolean;
  stockQuantity: number;
  attributes: Readonly<Record<string, string>>;
  measurements?: ProductMeasurements | null;
}>;

type Valid<T> = Readonly<{ ok: true; value: T }>;
type Invalid = Readonly<{ ok: false; message: string }>;
export type CatalogFormResult<T> = Valid<T> | Invalid;

const CONTROL = /[\u0000-\u001f\u007f]/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKU = /^[A-Z0-9](?:[A-Z0-9._-]{0,63})$/;

const CREATE_KEYS = Object.freeze([
  "title", "slug", "description", "status", "currency", "variantTitle", "sku", "barcode",
  "price", "compareAt", "cost", "stockTracking", "stockQuantity", "measurements",
] as const);
const PRODUCT_KEYS = Object.freeze(["title", "slug", "description", "status", "currency"] as const);
const VARIANT_KEYS = Object.freeze([
  "title", "sku", "barcode", "price", "compareAt", "cost", "stockTracking", "stockQuantity", "measurements",
] as const);

function invalid(message: string): Invalid {
  return Object.freeze({ ok: false, message });
}

function record(value: unknown, allowed: readonly string[]): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const parsed = value as Record<string, unknown>;
  return Object.keys(parsed).every((key) => allowed.includes(key)) ? parsed : null;
}

function text(value: unknown, minimum: number, maximum: number, pattern?: RegExp): string | null {
  return typeof value === "string" &&
    value.length >= minimum && value.length <= maximum &&
    value === value.trim() && !CONTROL.test(value) &&
    (pattern === undefined || pattern.test(value))
    ? value
    : null;
}

function optionalText(value: unknown, maximum: number, pattern?: RegExp): string | undefined | null {
  if (value === "") return undefined;
  return text(value, 1, maximum, pattern);
}

function productFields(value: unknown, allowed = PRODUCT_KEYS): CatalogFormResult<CatalogProductFields> {
  const parsed = record(value, allowed);
  if (parsed === null) return invalid("Formda beklenmeyen bir alan var.");
  const title = text(parsed.title, 1, 200);
  const slug = text(parsed.slug, 3, 100, SLUG);
  const description = optionalText(parsed.description, 10_000);
  const status = parsed.status === "draft" || parsed.status === "active" ? parsed.status : null;
  if (title === null) return invalid("Ürün adı zorunludur.");
  if (slug === null) return invalid("URL anahtarı küçük harf, rakam ve tire içermelidir.");
  if (description === null) return invalid("Açıklama geçersiz.");
  if (status === null) return invalid("Ürün durumu geçersiz.");
  if (parsed.currency !== "TRY") return invalid("Para birimi bu pilotta TRY olmalıdır.");
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      slug,
      title,
      ...(description === undefined ? {} : { description }),
      status,
      currency: "TRY",
    }),
  });
}

function variantAttributes(value: unknown): Readonly<Record<string, string>> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const entries = Object.entries(value);
  if (!entries.every(([, entry]) => typeof entry === "string")) return null;
  return Object.freeze(Object.fromEntries(entries));
}

function variantFields(
  value: unknown,
  attributes: Readonly<Record<string, string>>,
  allowed = VARIANT_KEYS,
): CatalogFormResult<CatalogVariantFields> {
  const parsed = record(value, allowed);
  if (parsed === null) return invalid("Formda beklenmeyen bir alan var.");
  const measurements = parseProductMeasurements(parsed.measurements as ProductMeasurementDraft | undefined);
  if (!measurements.ok) return invalid(measurements.error);
  const preservedAttributes = variantAttributes(attributes);
  if (preservedAttributes === null) return invalid("Varyant nitelikleri geçersiz.");
  const title = text(parsed.title, 1, 200);
  const sku = optionalText(parsed.sku, 64, SKU);
  const barcode = optionalText(parsed.barcode, 128);
  if (title === null) return invalid("Varyant adı zorunludur.");
  if (sku === null) return invalid("SKU yalnız büyük harf, rakam, nokta, tire ve alt çizgi içerebilir.");
  if (barcode === null) return invalid("Barkod geçersiz.");
  if (typeof parsed.price !== "string") return invalid("Satış fiyatı geçersiz.");
  let priceCents: number;
  let compareAtCents: number | undefined;
  let costCents: number | undefined;
  try {
    priceCents = parseTurkishMoneyToCents(parsed.price);
    compareAtCents = parsed.compareAt === "" ? undefined : parseTurkishMoneyToCents(String(parsed.compareAt));
    costCents = parsed.cost === "" ? undefined : parseTurkishMoneyToCents(String(parsed.cost));
  } catch {
    return invalid("Para alanlarında virgülden sonra en fazla iki basamak kullanın.");
  }
  if (compareAtCents !== undefined && compareAtCents < priceCents) {
    return invalid("Karşılaştırma fiyatı satış fiyatından düşük olamaz.");
  }
  if (parsed.stockTracking !== true && parsed.stockTracking !== false) {
    return invalid("Stok takibi seçimi geçersiz.");
  }
  if (typeof parsed.stockQuantity !== "string" || !/^(?:0|[1-9]\d*)$/.test(parsed.stockQuantity)) {
    return invalid("Stok adedi sıfır veya pozitif tam sayı olmalıdır.");
  }
  const stockQuantity = Number(parsed.stockQuantity);
  if (!Number.isSafeInteger(stockQuantity)) return invalid("Stok adedi geçersiz.");
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      title,
      ...(sku === undefined ? {} : { sku }),
      ...(barcode === undefined ? {} : { barcode }),
      priceCents,
      ...(compareAtCents === undefined ? {} : { compareAtCents }),
      ...(costCents === undefined ? {} : { costCents }),
      stockTracking: parsed.stockTracking,
      stockQuantity,
      attributes: preservedAttributes,
      ...(measurements.value === undefined ? {} : { measurements: measurements.value }),
    }),
  });
}

function version(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 1 ? value as number : null;
}

export function buildCreateProductPayload(value: unknown): CatalogFormResult<Readonly<{
  product: CatalogProductFields;
  initialVariant: CatalogVariantFields;
}>> {
  const parsed = record(value, CREATE_KEYS);
  if (parsed === null) return invalid("Formda beklenmeyen bir alan var.");
  const product = productFields({
    title: parsed.title,
    slug: parsed.slug,
    description: parsed.description,
    status: parsed.status,
    currency: parsed.currency,
  });
  if (!product.ok) return product;
  const initialVariant = variantFields({
    title: parsed.variantTitle,
    sku: parsed.sku,
    barcode: parsed.barcode,
    price: parsed.price,
    compareAt: parsed.compareAt,
    cost: parsed.cost,
    stockTracking: parsed.stockTracking,
    stockQuantity: parsed.stockQuantity,
    ...(parsed.measurements === undefined ? {} : { measurements: parsed.measurements }),
  }, Object.freeze({}));
  if (!initialVariant.ok) return initialVariant;
  return Object.freeze({
    ok: true,
    value: Object.freeze({ product: product.value, initialVariant: initialVariant.value }),
  });
}

export function buildProductUpdatePayload(
  value: unknown,
  expectedVersion: unknown,
): CatalogFormResult<Readonly<{ expectedVersion: number; product: CatalogProductFields }>> {
  const parsedVersion = version(expectedVersion);
  if (parsedVersion === null) return invalid("Ürün sürümü geçersiz.");
  const product = productFields(value);
  return product.ok
    ? Object.freeze({ ok: true, value: Object.freeze({ expectedVersion: parsedVersion, product: product.value }) })
    : product;
}

export function buildVariantCreatePayload(
  value: unknown,
): CatalogFormResult<Readonly<{ variant: CatalogVariantFields }>> {
  const variant = variantFields(value, Object.freeze({}));
  return variant.ok
    ? Object.freeze({ ok: true, value: Object.freeze({ variant: variant.value }) })
    : variant;
}

export function buildVariantBatchPayload(
  rows: readonly Readonly<{ title: string; sku: string; barcode: string; price: string; compareAt: string; cost: string; stockQuantity: string; attributes: Readonly<Record<string, string>>; measurements?: ProductMeasurementDraft; continueSellingWhenOutOfStock?: boolean; shippingDesi?: string; hsCode?: string }>[],
): CatalogFormResult<Readonly<{ variants: readonly CatalogVariantFields[] }>> {
  if (rows.length < 1 || rows.length > 100) return invalid("1–100 varyant seçin.");
  const variants: CatalogVariantFields[] = [];
  const combinations = new Set<string>();
  for (const row of rows) {
    if (record(row, [...VARIANT_KEYS, "attributes", "continueSellingWhenOutOfStock", "shippingDesi", "hsCode"]) === null) return invalid("Formda beklenmeyen bir alan var.");
    const { attributes: selectedAttributes, continueSellingWhenOutOfStock, shippingDesi, hsCode, ...fields } = row;
    if (continueSellingWhenOutOfStock !== undefined && continueSellingWhenOutOfStock !== false) return invalid("Toplu varyant eklerken stok bitince satış seçeneğini kapatın.");
    if ((shippingDesi !== undefined && shippingDesi !== "") || (hsCode !== undefined && hsCode !== "")) return invalid("Toplu varyant eklerken kargo bilgilerini boş bırakın.");
    const parsed = variantFields({ ...fields, stockTracking: true }, selectedAttributes);
    if (!parsed.ok) return parsed;
    const attributes = parsed.value.attributes;
    if (Object.keys(attributes).length < 1 || Object.keys(attributes).length > 3) return invalid("Varyant için 1–3 nitelik seçin.");
    const combination = JSON.stringify(Object.entries(attributes).sort(([a], [b]) => a.localeCompare(b)));
    if (combinations.has(combination)) return invalid("Aynı nitelik kombinasyonu iki kez seçilemez.");
    combinations.add(combination);
    variants.push(parsed.value);
  }
  return Object.freeze({ ok: true, value: Object.freeze({ variants: Object.freeze(variants) }) });
}

export function buildVariantUpdatePayload(
  value: unknown,
  expectedVersion: unknown,
  existingAttributes: Readonly<Record<string, string>>,
): CatalogFormResult<Readonly<{ expectedVersion: number; variant: CatalogVariantFields }>> {
  const parsedVersion = version(expectedVersion);
  if (parsedVersion === null) return invalid("Varyant sürümü geçersiz.");
  const variant = variantFields(value, existingAttributes);
  return variant.ok
    ? Object.freeze({
      ok: true,
      value: Object.freeze({ expectedVersion: parsedVersion, variant: Object.freeze({ ...variant.value,
        ...(typeof value === "object" && value !== null && (value as { measurements?: unknown }).measurements !== undefined && variant.value.measurements === undefined ? { measurements: null } : {}),
      }) }),
    })
    : variant;
}

export function buildVariantPayload(
  value: unknown,
): CatalogFormResult<Readonly<{ variant: CatalogVariantFields }>>;
export function buildVariantPayload(
  value: unknown,
  expectedVersion: number,
  existingAttributes: Readonly<Record<string, string>>,
): CatalogFormResult<Readonly<{ expectedVersion: number; variant: CatalogVariantFields }>>;
export function buildVariantPayload(
  value: unknown,
  expectedVersion?: unknown,
  existingAttributes?: Readonly<Record<string, string>>,
): CatalogFormResult<Readonly<{ expectedVersion?: number; variant: CatalogVariantFields }>> {
  if (expectedVersion === undefined) return buildVariantCreatePayload(value);
  if (existingAttributes === undefined) return invalid("Varyant nitelikleri geçersiz.");
  return buildVariantUpdatePayload(value, expectedVersion, existingAttributes);
}
