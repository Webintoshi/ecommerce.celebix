import { CatalogRepositoryError } from "../catalog/errors.ts";
import { catalogAuthority, type ValidatedCatalogAuthority } from "../catalog/validation.ts";
import { CatalogMigrationRepositoryError, type CatalogMigrationErrorCode } from "./errors.ts";
import type { CatalogMigrationCategory, CatalogMigrationJob, CatalogMigrationMediaAuthority, CatalogMigrationProduct, CatalogMigrationTaxonomy } from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const SOURCE_ID = /^[1-9][0-9]{0,19}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKU = /^[A-Z0-9][A-Z0-9._-]{0,63}$/;
const BARCODE = /^[A-Za-z0-9._-]{1,128}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const DESCRIPTION_CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f]/;
const ATTRIBUTE_KEY = /^[\p{L}\p{N}][\p{L}\p{N} ._()/%+-]{0,63}$/u;
const MIGRATION_WEIGHT = /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,3})?$/;
const MAX_STOCK = 2_147_483_647;

function fail(code: CatalogMigrationErrorCode = "invalid_input"): never {
  throw new CatalogMigrationRepositoryError(code);
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail();
  return value as Record<string, unknown>;
}

export function exactCatalogMigrationInput(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  const parsed = object(value);
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(parsed, key)) || Object.keys(parsed).some((key) => !allowed.has(key))) fail();
  return parsed;
}

export function catalogMigrationUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) fail();
  return value;
}

export function catalogMigrationDigest(value: unknown): string {
  if (typeof value !== "string" || !DIGEST.test(value)) fail();
  return value;
}

export function catalogMigrationSourceProductId(value: unknown): string {
  if (typeof value !== "string" || !SOURCE_ID.test(value)) fail();
  return value;
}

export function catalogMigrationSafeFailureCode(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z0-9_]{1,64}$/.test(value)) fail();
  return value;
}

export function catalogMigrationInteger(value: unknown, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) fail();
  return value as number;
}

function text(value: unknown, minimum: number, maximum: number): string {
  if (typeof value !== "string" || value !== value.trim() || value.length < minimum || value.length > maximum || CONTROL.test(value)) fail();
  return value;
}

function description(value: unknown): string {
  if (typeof value !== "string" || value !== value.trim() || value.length < 1 || value.length > 10_000 || DESCRIPTION_CONTROL.test(value)) fail();
  return value;
}

function slug(value: unknown): string {
  const parsed = text(value, 1, 100);
  if (!SLUG.test(parsed)) fail();
  return parsed;
}

export function catalogMigrationAuthority(context: unknown, now: unknown): ValidatedCatalogAuthority {
  try { return catalogAuthority(context as never, now as never); }
  catch (error) {
    if (error instanceof CatalogRepositoryError) {
      const mapped = error.code === "invalid_input" ? "durable_authority_invalid" : error.code;
      if (["unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled", "durable_authority_invalid"].includes(mapped)) fail(mapped as CatalogMigrationErrorCode);
    }
    fail("durable_authority_invalid");
  }
}

export function catalogMigrationTaxonomies(value: unknown, maximum: number): readonly CatalogMigrationTaxonomy[] {
  if (!Array.isArray(value) || value.length > maximum) fail();
  const result = value.map((candidate) => {
    const parsed = exactCatalogMigrationInput(candidate, ["name", "slug"]);
    return Object.freeze({ name: text(parsed.name, 1, 120), slug: slug(parsed.slug) });
  });
  if (new Set(result.map((entry) => entry.slug)).size !== result.length) fail();
  return Object.freeze(result);
}

export function catalogMigrationCategories(value: unknown, maximum: number): readonly CatalogMigrationCategory[] {
  if (!Array.isArray(value) || value.length > maximum) fail();
  const knownDepth = new Map<string, number>();
  const result = value.map((candidate) => {
    const parsed = exactCatalogMigrationInput(candidate, ["name", "slug"], ["parentSlug"]);
    const selectedSlug = slug(parsed.slug);
    const parentSlug = parsed.parentSlug === undefined ? undefined : slug(parsed.parentSlug);
    if (knownDepth.has(selectedSlug) || parentSlug === selectedSlug) fail();
    const depth = parentSlug === undefined ? 1 : (knownDepth.get(parentSlug) ?? 0) + 1;
    if (depth < 1 || depth > 8 || (parentSlug !== undefined && !knownDepth.has(parentSlug))) fail();
    knownDepth.set(selectedSlug, depth);
    return Object.freeze({ name: text(parsed.name, 1, 120), slug: selectedSlug, ...(parentSlug ? { parentSlug } : {}) });
  });
  return Object.freeze(result);
}

function stringArray(value: unknown, maximum: number, parser: (candidate: unknown) => string): readonly string[] {
  if (!Array.isArray(value) || value.length > maximum) fail();
  const parsed = value.map(parser);
  if (new Set(parsed).size !== parsed.length) fail();
  return Object.freeze(parsed);
}

function attributes(value: unknown): Readonly<Record<string, string>> {
  const parsed = object(value);
  const entries = Object.entries(parsed);
  if (entries.length > 32) fail();
  const result: Record<string, string> = {};
  for (const [key, selected] of entries) {
    if (!ATTRIBUTE_KEY.test(key)) fail();
    const parsedValue = text(selected, 1, 200);
    if (key === "Ağırlık (g)" && (
      !MIGRATION_WEIGHT.test(parsedValue) ||
      !Number.isFinite(Number(parsedValue)) ||
      Number(parsedValue) <= 0 ||
      Number(parsedValue) > 1_000_000
    )) fail();
    result[key] = parsedValue;
  }
  return Object.freeze(result);
}

export function catalogMigrationProducts(value: unknown): readonly CatalogMigrationProduct[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 25) fail();
  const products = value.map((candidate) => {
    const parsed = exactCatalogMigrationInput(candidate, ["sourceProductId", "title", "slug", "status", "categorySlugs", "brandSlugs", "variant", "sourceImageDigests"], ["description"]);
    const sourceProductId = text(parsed.sourceProductId, 1, 20);
    if (!SOURCE_ID.test(sourceProductId)) fail();
    const status = parsed.status;
    if (status !== "draft" && status !== "active") fail();
    const variant = exactCatalogMigrationInput(parsed.variant, ["title", "priceCents", "stockQuantity", "attributes"], ["sku", "barcode", "compareAtCents"]);
    const sku = variant.sku === undefined ? undefined : text(variant.sku, 1, 64);
    if (sku !== undefined && !SKU.test(sku)) fail();
    const barcode = variant.barcode === undefined ? undefined : text(variant.barcode, 1, 128);
    if (barcode !== undefined && !BARCODE.test(barcode)) fail();
    const priceCents = catalogMigrationInteger(variant.priceCents, 0, Number.MAX_SAFE_INTEGER);
    const compareAtCents = variant.compareAtCents === undefined ? undefined : catalogMigrationInteger(variant.compareAtCents, priceCents, Number.MAX_SAFE_INTEGER);
    return Object.freeze({
      sourceProductId,
      title: text(parsed.title, 1, 200),
      slug: slug(parsed.slug),
      ...(parsed.description === undefined ? {} : { description: description(parsed.description) }),
      status,
      categorySlugs: stringArray(parsed.categorySlugs, 8, slug),
      brandSlugs: stringArray(parsed.brandSlugs, 16, slug),
      variant: Object.freeze({
        title: text(variant.title, 1, 120),
        ...(sku === undefined ? {} : { sku }),
        ...(barcode === undefined ? {} : { barcode }),
        priceCents,
        ...(compareAtCents === undefined ? {} : { compareAtCents }),
        stockQuantity: catalogMigrationInteger(variant.stockQuantity, 0, MAX_STOCK),
        attributes: attributes(variant.attributes),
      }),
      sourceImageDigests: stringArray(parsed.sourceImageDigests, 16, catalogMigrationDigest),
    });
  });
  for (const selector of [
    (entry: CatalogMigrationProduct) => entry.sourceProductId,
    (entry: CatalogMigrationProduct) => entry.slug,
  ]) if (new Set(products.map(selector)).size !== products.length) fail();
  for (const selector of [
    (entry: CatalogMigrationProduct) => entry.variant.sku,
    (entry: CatalogMigrationProduct) => entry.variant.barcode,
  ]) {
    const selected = products.map(selector).filter((entry): entry is string => entry !== undefined);
    if (new Set(selected).size !== selected.length) fail();
  }
  return Object.freeze(products);
}

export function parseCatalogMigrationJob(value: unknown, expectedReplay: boolean): CatalogMigrationJob {
  const parsed = exactCatalogMigrationInput(value, ["jobId", "sourceDigest", "status", "totalProducts", "importedProducts", "totalMedia", "committedMedia", "failedMedia", "categoryCount", "brandCount", "version", "updatedAt", "replayed"]);
  const status = parsed.status;
  if (!["processing", "media_processing", "completed", "completed_with_failures"].includes(status as string) || parsed.replayed !== expectedReplay) fail("unavailable");
  const updatedAt = text(parsed.updatedAt, 24, 24);
  const timestamp = new Date(updatedAt);
  if (!Number.isFinite(timestamp.getTime()) || timestamp.toISOString() !== updatedAt) fail("unavailable");
  const totalProducts = catalogMigrationInteger(parsed.totalProducts, 1, 2_500);
  const importedProducts = catalogMigrationInteger(parsed.importedProducts, 0, totalProducts);
  const totalMedia = catalogMigrationInteger(parsed.totalMedia, 0, 40_000);
  const committedMedia = catalogMigrationInteger(parsed.committedMedia, 0, totalMedia);
  const failedMedia = catalogMigrationInteger(parsed.failedMedia, 0, totalMedia);
  if (committedMedia + failedMedia > totalMedia) fail("unavailable");
  return Object.freeze({
    jobId: catalogMigrationUuid(parsed.jobId), sourceDigest: catalogMigrationDigest(parsed.sourceDigest), status: status as CatalogMigrationJob["status"],
    totalProducts, importedProducts, totalMedia, committedMedia, failedMedia,
    categoryCount: catalogMigrationInteger(parsed.categoryCount, 0, 100), brandCount: catalogMigrationInteger(parsed.brandCount, 0, 50),
    version: catalogMigrationInteger(parsed.version, 1, Number.MAX_SAFE_INTEGER), updatedAt, replayed: expectedReplay,
  });
}

export function parseCatalogMigrationMediaAuthority(value: unknown): CatalogMigrationMediaAuthority {
  const parsed = exactCatalogMigrationInput(value, ["jobId", "sourceProductId", "productId", "variantId", "ordinal", "sourceUrlDigest", "status"], ["committedMediaId"]);
  if (parsed.status !== "pending" && parsed.status !== "failed" && parsed.status !== "committed") fail("unavailable");
  const committedMediaId = parsed.committedMediaId === undefined ? undefined : catalogMigrationUuid(parsed.committedMediaId);
  if ((parsed.status === "committed") !== (committedMediaId !== undefined)) fail("unavailable");
  return Object.freeze({
    jobId: catalogMigrationUuid(parsed.jobId), sourceProductId: catalogMigrationSourceProductId(parsed.sourceProductId),
    productId: catalogMigrationUuid(parsed.productId), variantId: catalogMigrationUuid(parsed.variantId),
    ordinal: catalogMigrationInteger(parsed.ordinal, 0, 15), sourceUrlDigest: catalogMigrationDigest(parsed.sourceUrlDigest),
    status: parsed.status, ...(committedMediaId === undefined ? {} : { committedMediaId }),
  });
}
