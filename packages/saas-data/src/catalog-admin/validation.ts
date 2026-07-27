import { CATALOG_ADMIN_RESOURCE_KINDS, PRODUCT_REVIEW_STATUSES, type CatalogAdminJson, type CatalogAdminResourceKind, type ProductReviewStatus } from "@celebix/saas-contracts";
import { catalogAuthority } from "../catalog/validation.ts";
import { CatalogAdminRepositoryError } from "./errors.ts";
import type { CatalogAdminImportProduct, CatalogAdminImportRow, CatalogAdminImportVariant } from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKU = /^[A-Z0-9][A-Z0-9._-]{0,63}$/;
const KEY = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const ATTRIBUTE_KEY = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
function fail(code: ConstructorParameters<typeof CatalogAdminRepositoryError>[0] = "invalid_input"): never { throw new CatalogAdminRepositoryError(code); }
function object(value: unknown): Record<string, unknown> { if (typeof value !== "object" || value === null || Array.isArray(value) || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) fail(); return value as Record<string, unknown>; }
export function exactCatalogAdminInput(value: unknown, required: readonly string[], optional: readonly string[] = []) { const result = object(value); const allowed = new Set([...required, ...optional]); if (required.some((key) => !Object.hasOwn(result, key)) || Object.keys(result).some((key) => !allowed.has(key))) fail(); return result; }
export function catalogAdminUuid(value: unknown): string { if (typeof value !== "string" || !UUID.test(value)) fail(); return value; }
export function catalogAdminVersion(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 1) fail(); return value as number; }
export function catalogAdminText(value: unknown, min: number, max: number, pattern?: RegExp): string { if (typeof value !== "string" || value.length < min || value.length > max || value !== value.trim() || CONTROL.test(value) || (pattern && !pattern.test(value))) fail(); return value; }
export function catalogAdminSlug(value: unknown) { return catalogAdminText(value, 1, 120, SLUG); }
export function catalogImportFormat(value: unknown): "native_csv" | "shopify_csv" { if (value !== "native_csv" && value !== "shopify_csv") fail(); return value; }
export function catalogImportDigest(value: unknown): string { return catalogAdminText(value, 64, 64, /^[a-f0-9]{64}$/); }
function catalogAdminProductSlug(value: unknown) { return catalogAdminText(value, 3, 100, SLUG); }
export function catalogAdminKind(value: unknown): CatalogAdminResourceKind { if (!CATALOG_ADMIN_RESOURCE_KINDS.includes(value as never)) fail(); return value as CatalogAdminResourceKind; }
export function catalogAdminReviewStatus(value: unknown, allowPending = true): ProductReviewStatus { if (!PRODUCT_REVIEW_STATUSES.includes(value as never) || (!allowPending && value === "pending")) fail(); return value as ProductReviewStatus; }
function json(value: unknown, depth = 0): CatalogAdminJson { if (depth > 6) fail(); if (value === null || typeof value === "boolean") return value; if (typeof value === "number") { if (!Number.isSafeInteger(value)) fail(); return value; } if (typeof value === "string") return catalogAdminText(value, 0, 1000); if (Array.isArray(value)) { if (value.length > 64) fail(); return Object.freeze(value.map((entry) => json(entry, depth + 1))); } const parsed = object(value); if (Object.keys(parsed).length > 64 || Object.keys(parsed).some((key) => !KEY.test(key))) fail(); return Object.freeze(Object.fromEntries(Object.entries(parsed).map(([key, nested]) => [key, json(nested, depth + 1)]))); }
export function catalogAdminConfig(value: unknown): Readonly<Record<string, CatalogAdminJson>> { const result = json(value); if (typeof result !== "object" || result === null || Array.isArray(result) || JSON.stringify(result).length > 8192) fail(); return result as Readonly<Record<string, CatalogAdminJson>>; }
export function uniqueCatalogIds(value: unknown): readonly string[] { if (!Array.isArray(value) || value.length > 100) fail(); const ids = Object.freeze(value.map(catalogAdminUuid)); if (new Set(ids).size !== ids.length) fail(); return ids; }
export function catalogAdminImportRows(value: unknown): readonly CatalogAdminImportRow[] { if (!Array.isArray(value) || value.length < 1 || value.length > 100) fail(); const rows = Object.freeze(value.map((entry) => { const row = exactCatalogAdminInput(entry, ["title", "slug", "priceCents", "stockQuantity"], ["sku"]); if (!Number.isSafeInteger(row.priceCents) || (row.priceCents as number) < 0 || !Number.isSafeInteger(row.stockQuantity) || (row.stockQuantity as number) < 0) fail(); const sku = row.sku === undefined ? undefined : catalogAdminText(row.sku, 1, 64, SKU); return Object.freeze({ title: catalogAdminText(row.title, 1, 200), slug: catalogAdminProductSlug(row.slug), priceCents: row.priceCents as number, ...(sku === undefined ? {} : { sku }), stockQuantity: row.stockQuantity as number }); })); if (Buffer.byteLength(JSON.stringify(rows), "utf8") > 131_072) fail(); return rows; }

function importInteger(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 0) fail(); return value as number; }
function catalogAdminImportAttributes(value: unknown): Readonly<Record<string, string>> {
  const selected = object(value);
  if (Object.keys(selected).length > 32 || Object.keys(selected).some((key) => !ATTRIBUTE_KEY.test(key))) fail();
  return Object.freeze(Object.fromEntries(Object.entries(selected).map(([key, entry]) => [key, catalogAdminText(entry, 0, 256)])));
}
function catalogAdminImportVariant(value: unknown): CatalogAdminImportVariant {
  const variant = exactCatalogAdminInput(value, ["title", "priceCents", "stockQuantity", "attributes"], ["sku", "barcode", "compareAtCents", "costCents"]);
  const priceCents = importInteger(variant.priceCents);
  const compareAtCents = variant.compareAtCents === undefined ? undefined : importInteger(variant.compareAtCents);
  const costCents = variant.costCents === undefined ? undefined : importInteger(variant.costCents);
  if (compareAtCents !== undefined && compareAtCents < priceCents) fail();
  const selectedSku = variant.sku === undefined ? undefined : catalogAdminText(variant.sku, 1, 64, SKU);
  const selectedBarcode = variant.barcode === undefined ? undefined : catalogAdminText(variant.barcode, 1, 128);
  return Object.freeze({
    title: catalogAdminText(variant.title, 1, 200),
    ...(selectedSku ? { sku: selectedSku } : {}),
    ...(selectedBarcode ? { barcode: selectedBarcode } : {}),
    priceCents,
    ...(compareAtCents !== undefined ? { compareAtCents } : {}),
    ...(costCents !== undefined ? { costCents } : {}),
    stockQuantity: importInteger(variant.stockQuantity),
    attributes: catalogAdminImportAttributes(variant.attributes),
  });
}
export function catalogAdminImportProducts(value: unknown): readonly CatalogAdminImportProduct[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) fail();
  const slugs = new Set<string>();
  const skus = new Set<string>();
  let variantCount = 0;
  const products = value.map((entry) => {
    const product = exactCatalogAdminInput(entry, ["title", "slug", "status", "variants"], ["description"]);
    if (!Array.isArray(product.variants) || product.variants.length < 1 || product.variants.length > 50 || !["draft", "active"].includes(String(product.status))) fail();
    const selectedSlug = catalogAdminProductSlug(product.slug);
    if (slugs.has(selectedSlug)) fail();
    slugs.add(selectedSlug);
    const variants = Object.freeze(product.variants.map((variant) => {
      const selected = catalogAdminImportVariant(variant);
      if (selected.sku && skus.has(selected.sku)) fail();
      if (selected.sku) skus.add(selected.sku);
      variantCount += 1;
      if (variantCount > 500) fail();
      return selected;
    }));
    const selectedDescription = product.description === undefined ? undefined : catalogAdminText(product.description, 1, 10_000);
    return Object.freeze({ title: catalogAdminText(product.title, 1, 200), slug: selectedSlug, ...(selectedDescription ? { description: selectedDescription } : {}), status: product.status as "draft" | "active", variants });
  });
  if (JSON.stringify(products).length > 120_000) fail();
  return Object.freeze(products);
}
export { catalogAuthority };
