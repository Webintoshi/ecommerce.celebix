import { parseProduct, parseProductVariant } from "../catalog/validation.ts";
import {
  CATALOG_ONBOARDING_CHANNEL_KINDS,
  CATALOG_ONBOARDING_PRODUCT_TYPES,
  CATALOG_ONBOARDING_RESOURCE_KINDS,
  CATALOG_ONBOARDING_UNITS,
  type CatalogAdvancedCreateIntent,
  type CatalogCategory,
  type CatalogCategoryFields,
  type CatalogCategoryMutationResult,
  type CatalogOnboardingCategoryOption,
  type CatalogOnboardingChannelOption,
  type CatalogOnboardingIntent,
  type CatalogOnboardingInventoryAllocation,
  type CatalogOnboardingLocationOption,
  type CatalogOnboardingOptions,
  type CatalogOnboardingResourceIds,
  type CatalogOnboardingResourceOption,
  type CatalogOnboardingResult,
  type CatalogOnboardingUnitPricing,
  type CatalogOnboardingVariantIntent,
  type CatalogProductEditorProjection,
  type CatalogProductEditorVariant,
  type CatalogProductMerchandisingFields,
  type CatalogProductMerchandisingProfile,
  type CatalogQuickCreateIntent,
} from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKU = /^[A-Z0-9](?:[A-Z0-9._-]{0,63})$/;
const ATTRIBUTE_KEY = /^[\p{L}\p{N}](?:[\p{L}\p{N}_.: -]{0,63})$/u;
const GOOGLE_CATEGORY = /^[0-9]{1,20}$/;
const HS_CODE = /^[0-9]{4,12}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

function invalid(): never { throw new TypeError("catalog_onboarding_contract_invalid"); }

function dataRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  if (Object.getOwnPropertySymbols(value).length !== 0) invalid();
  const output: Record<string, unknown> = Object.create(null);
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!("value" in descriptor) || descriptor.enumerable !== true) invalid();
    output[key] = descriptor.value;
  }
  return output;
}

function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  const parsed = dataRecord(value);
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(parsed);
  if (required.some((key) => !Object.hasOwn(parsed, key)) || keys.some((key) => !allowed.has(key))) invalid();
  return parsed;
}

function denseArray(value: unknown, minimum: number, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < minimum || value.length > maximum) invalid();
  if (Object.getOwnPropertySymbols(value).length !== 0) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const allowed = new Set(["length", ...Array.from({ length: value.length }, (_, index) => String(index))]);
  if (Object.keys(descriptors).some((key) => !allowed.has(key))) invalid();
  const output: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) invalid();
    output.push(descriptor.value);
  }
  return output;
}

function text(value: unknown, minimum: number, maximum: number, pattern?: RegExp): string {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum || value !== value.trim() || CONTROL.test(value) || (pattern && !pattern.test(value))) invalid();
  return value;
}

function optionalText(record: Record<string, unknown>, key: string, minimum: number, maximum: number, pattern?: RegExp): string | undefined {
  return Object.hasOwn(record, key) ? text(record[key], minimum, maximum, pattern) : undefined;
}

function uuid(value: unknown): string { return text(value, 36, 36, UUID); }
function boolean(value: unknown): boolean { if (value !== true && value !== false) invalid(); return value; }
function integer(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) invalid();
  return value as number;
}
function timestamp(value: unknown): string {
  const candidate = text(value, 24, 24, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  if (new Date(candidate).toISOString() !== candidate) invalid();
  return candidate;
}
function enumValue<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) invalid();
  return value as T;
}

function uniqueIds(value: unknown, maximum: number): readonly string[] {
  const output = denseArray(value, 0, maximum).map(uuid);
  if (new Set(output).size !== output.length) invalid();
  return Object.freeze(output);
}

function attributes(value: unknown): Readonly<Record<string, string>> {
  const parsed = dataRecord(value);
  const entries = Object.entries(parsed);
  if (entries.length > 32 || JSON.stringify(parsed).length > 8_192) invalid();
  const output: Record<string, string> = {};
  for (const [key, nested] of entries) output[text(key, 1, 64, ATTRIBUTE_KEY)] = text(nested, 1, 256);
  return Object.freeze(output);
}

function inventory(value: unknown): readonly CatalogOnboardingInventoryAllocation[] {
  const output = denseArray(value, 0, 50).map((entry) => {
    const parsed = exact(entry, ["locationId", "quantity"]);
    return Object.freeze({ locationId: uuid(parsed.locationId), quantity: integer(parsed.quantity, 0) });
  });
  if (new Set(output.map(({ locationId }) => locationId)).size !== output.length) invalid();
  return Object.freeze(output);
}

function unitPricing(value: unknown): CatalogOnboardingUnitPricing {
  const parsed = exact(value, ["measuredQuantityMilli", "measuredUnit", "baseQuantityMilli", "baseUnit"]);
  return Object.freeze({
    measuredQuantityMilli: integer(parsed.measuredQuantityMilli, 1),
    measuredUnit: enumValue(parsed.measuredUnit, CATALOG_ONBOARDING_UNITS),
    baseQuantityMilli: integer(parsed.baseQuantityMilli, 1),
    baseUnit: enumValue(parsed.baseUnit, CATALOG_ONBOARDING_UNITS),
  });
}

function variantIntent(value: unknown, productType: "physical" | "digital"): CatalogOnboardingVariantIntent {
  const parsed = exact(value, [
    "title", "priceCents", "stockTracking", "stockQuantity", "attributes",
    "continueSellingWhenOutOfStock", "inventory",
  ], ["sku", "barcode", "compareAtCents", "costCents", "unitPricing", "shippingDesiMilli", "hsCode"]);
  const priceCents = integer(parsed.priceCents, 0);
  const compareAtCents = Object.hasOwn(parsed, "compareAtCents") ? integer(parsed.compareAtCents, 0) : undefined;
  if (compareAtCents !== undefined && compareAtCents < priceCents) invalid();
  if (productType === "digital" && (Object.hasOwn(parsed, "shippingDesiMilli") || Object.hasOwn(parsed, "hsCode"))) invalid();
  const output = {
    title: text(parsed.title, 1, 200),
    ...(Object.hasOwn(parsed, "sku") ? { sku: optionalText(parsed, "sku", 1, 64, SKU)! } : {}),
    ...(Object.hasOwn(parsed, "barcode") ? { barcode: optionalText(parsed, "barcode", 1, 128)! } : {}),
    priceCents,
    ...(compareAtCents === undefined ? {} : { compareAtCents }),
    ...(Object.hasOwn(parsed, "costCents") ? { costCents: integer(parsed.costCents, 0) } : {}),
    stockTracking: boolean(parsed.stockTracking),
    stockQuantity: integer(parsed.stockQuantity, 0),
    attributes: attributes(parsed.attributes),
    continueSellingWhenOutOfStock: boolean(parsed.continueSellingWhenOutOfStock),
    ...(Object.hasOwn(parsed, "unitPricing") ? { unitPricing: unitPricing(parsed.unitPricing) } : {}),
    ...(Object.hasOwn(parsed, "shippingDesiMilli") ? { shippingDesiMilli: integer(parsed.shippingDesiMilli, 0) } : {}),
    ...(Object.hasOwn(parsed, "hsCode") ? { hsCode: optionalText(parsed, "hsCode", 4, 12, HS_CODE)! } : {}),
    inventory: inventory(parsed.inventory),
  } satisfies CatalogOnboardingVariantIntent;
  return Object.freeze(output);
}

function merchandisingFields(value: unknown): CatalogProductMerchandisingFields {
  const parsed = exact(value, ["minimumPurchaseQuantity"], [
    "supplierName", "googleProductCategoryId", "seoTitle", "seoDescription", "maximumPurchaseQuantity",
  ]);
  const minimumPurchaseQuantity = integer(parsed.minimumPurchaseQuantity, 1);
  const maximumPurchaseQuantity = Object.hasOwn(parsed, "maximumPurchaseQuantity") ? integer(parsed.maximumPurchaseQuantity, 1) : undefined;
  if (maximumPurchaseQuantity !== undefined && maximumPurchaseQuantity < minimumPurchaseQuantity) invalid();
  return Object.freeze({
    ...(Object.hasOwn(parsed, "supplierName") ? { supplierName: optionalText(parsed, "supplierName", 1, 200)! } : {}),
    ...(Object.hasOwn(parsed, "googleProductCategoryId") ? { googleProductCategoryId: optionalText(parsed, "googleProductCategoryId", 1, 20, GOOGLE_CATEGORY)! } : {}),
    ...(Object.hasOwn(parsed, "seoTitle") ? { seoTitle: optionalText(parsed, "seoTitle", 1, 200)! } : {}),
    ...(Object.hasOwn(parsed, "seoDescription") ? { seoDescription: optionalText(parsed, "seoDescription", 1, 500)! } : {}),
    minimumPurchaseQuantity,
    ...(maximumPurchaseQuantity === undefined ? {} : { maximumPurchaseQuantity }),
  });
}

function resourceIds(value: unknown): CatalogOnboardingResourceIds {
  const parsed = exact(value, ["collections", "tags", "attributes", "extras", "definitions"], ["brand"]);
  return Object.freeze({
    ...(Object.hasOwn(parsed, "brand") ? { brand: uuid(parsed.brand) } : {}),
    collections: uniqueIds(parsed.collections, 50),
    tags: uniqueIds(parsed.tags, 50),
    attributes: uniqueIds(parsed.attributes, 50),
    extras: uniqueIds(parsed.extras, 50),
    definitions: uniqueIds(parsed.definitions, 50),
  });
}

function parseQuick(value: Record<string, unknown>): CatalogQuickCreateIntent {
  const parsed = exact(value, ["kind", "title", "priceCents", "publish"], ["stockQuantity", "categoryId"]);
  if (parsed.kind !== "quick") invalid();
  return Object.freeze({
    kind: "quick",
    title: text(parsed.title, 1, 200),
    priceCents: integer(parsed.priceCents, 0),
    publish: boolean(parsed.publish),
    ...(Object.hasOwn(parsed, "stockQuantity") ? { stockQuantity: integer(parsed.stockQuantity, 0) } : {}),
    ...(Object.hasOwn(parsed, "categoryId") ? { categoryId: uuid(parsed.categoryId) } : {}),
  });
}

function parseAdvanced(value: Record<string, unknown>): CatalogAdvancedCreateIntent {
  const parsed = exact(value, [
    "kind", "productType", "title", "publish", "variants", "categoryIds", "resourceIds", "channelIds", "profile",
  ], ["description"]);
  if (parsed.kind !== "advanced") invalid();
  const productType = enumValue(parsed.productType, CATALOG_ONBOARDING_PRODUCT_TYPES);
  return Object.freeze({
    kind: "advanced",
    productType,
    title: text(parsed.title, 1, 200),
    ...(Object.hasOwn(parsed, "description") ? { description: optionalText(parsed, "description", 1, 10_000)! } : {}),
    publish: boolean(parsed.publish),
    variants: Object.freeze(denseArray(parsed.variants, 1, 100).map((entry) => variantIntent(entry, productType))),
    categoryIds: uniqueIds(parsed.categoryIds, 8),
    resourceIds: resourceIds(parsed.resourceIds),
    channelIds: uniqueIds(parsed.channelIds, 32),
    profile: merchandisingFields(parsed.profile),
  });
}

export function parseCatalogOnboardingIntent(value: unknown): CatalogOnboardingIntent {
  const parsed = dataRecord(value);
  return parsed.kind === "quick" ? parseQuick(parsed) : parsed.kind === "advanced" ? parseAdvanced(parsed) : invalid();
}

function categoryOption(value: unknown): CatalogOnboardingCategoryOption {
  const parsed = exact(value, ["id", "name", "slug", "position"], ["parentId"]);
  return Object.freeze({ id: uuid(parsed.id), ...(Object.hasOwn(parsed, "parentId") ? { parentId: uuid(parsed.parentId) } : {}), name: text(parsed.name, 1, 120), slug: text(parsed.slug, 1, 100, SLUG), position: integer(parsed.position, 0) });
}
function resourceOption(value: unknown): CatalogOnboardingResourceOption {
  const parsed = exact(value, ["id", "kind", "name"]);
  return Object.freeze({ id: uuid(parsed.id), kind: enumValue(parsed.kind, CATALOG_ONBOARDING_RESOURCE_KINDS), name: text(parsed.name, 1, 200) });
}
function locationOption(value: unknown): CatalogOnboardingLocationOption {
  const parsed = exact(value, ["id", "name", "isDefault"]);
  return Object.freeze({ id: uuid(parsed.id), name: text(parsed.name, 1, 120), isDefault: boolean(parsed.isDefault) });
}
function channelOption(value: unknown): CatalogOnboardingChannelOption {
  const parsed = exact(value, ["id", "kind", "name"]);
  return Object.freeze({ id: uuid(parsed.id), kind: enumValue(parsed.kind, CATALOG_ONBOARDING_CHANNEL_KINDS), name: text(parsed.name, 1, 120) });
}

export function parseCatalogOnboardingOptions(value: unknown): CatalogOnboardingOptions {
  const parsed = exact(value, ["categories", "resources", "locations", "channels"]);
  return Object.freeze({
    categories: Object.freeze(denseArray(parsed.categories, 0, 500).map(categoryOption)),
    resources: Object.freeze(denseArray(parsed.resources, 0, 1_000).map(resourceOption)),
    locations: Object.freeze(denseArray(parsed.locations, 0, 100).map(locationOption)),
    channels: Object.freeze(denseArray(parsed.channels, 0, 100).map(channelOption)),
  });
}

function profile(value: unknown): CatalogProductMerchandisingProfile {
  const parsed = exact(value, ["productType", "minimumPurchaseQuantity", "version", "updatedAt"], [
    "supplierName", "googleProductCategoryId", "seoTitle", "seoDescription", "maximumPurchaseQuantity",
  ]);
  return Object.freeze({
    productType: enumValue(parsed.productType, CATALOG_ONBOARDING_PRODUCT_TYPES),
    ...merchandisingFields(Object.fromEntries(Object.entries(parsed).filter(([key]) => key !== "productType" && key !== "version" && key !== "updatedAt"))),
    version: integer(parsed.version, 1),
    updatedAt: timestamp(parsed.updatedAt),
  });
}

function editorVariant(value: unknown): CatalogProductEditorVariant {
  const parsed = exact(value, ["variant", "continueSellingWhenOutOfStock", "inventory"], ["unitPricing", "shippingDesiMilli", "hsCode"]);
  return Object.freeze({
    variant: parseProductVariant(parsed.variant),
    continueSellingWhenOutOfStock: boolean(parsed.continueSellingWhenOutOfStock),
    ...(Object.hasOwn(parsed, "unitPricing") ? { unitPricing: unitPricing(parsed.unitPricing) } : {}),
    ...(Object.hasOwn(parsed, "shippingDesiMilli") ? { shippingDesiMilli: integer(parsed.shippingDesiMilli, 0) } : {}),
    ...(Object.hasOwn(parsed, "hsCode") ? { hsCode: optionalText(parsed, "hsCode", 4, 12, HS_CODE)! } : {}),
    inventory: inventory(parsed.inventory),
  });
}

export function parseCatalogProductEditorProjection(value: unknown): CatalogProductEditorProjection {
  const parsed = exact(value, ["product", "variants", "profile", "categoryIds", "resourceIds", "channelIds", "mediaCount"]);
  const product = parseProduct(parsed.product);
  const variants = Object.freeze(denseArray(parsed.variants, 1, 100).map(editorVariant));
  if (variants.some(({ variant }) => variant.productId !== product.id || variant.storeId !== product.storeId)) invalid();
  return Object.freeze({ product, variants, profile: profile(parsed.profile), categoryIds: uniqueIds(parsed.categoryIds, 8), resourceIds: resourceIds(parsed.resourceIds), channelIds: uniqueIds(parsed.channelIds, 32), mediaCount: integer(parsed.mediaCount, 0, 100) });
}

export function parseCatalogOnboardingResult(value: unknown): CatalogOnboardingResult {
  const parsed = exact(value, ["product", "variants", "profile", "categoryIds", "resourceIds", "channelIds", "mediaCount", "replayed"]);
  const product = parseProduct(parsed.product);
  const variants = Object.freeze(denseArray(parsed.variants, 1, 100).map(parseProductVariant));
  if (variants.some((variant) => variant.productId !== product.id || variant.storeId !== product.storeId)) invalid();
  return Object.freeze({ product, variants, profile: profile(parsed.profile), categoryIds: uniqueIds(parsed.categoryIds, 8), resourceIds: resourceIds(parsed.resourceIds), channelIds: uniqueIds(parsed.channelIds, 32), mediaCount: integer(parsed.mediaCount, 0, 100), replayed: boolean(parsed.replayed) });
}

export function parseCatalogCategoryFields(value: unknown): CatalogCategoryFields {
  const parsed = exact(value, ["name", "position"], ["parentId"]);
  return Object.freeze({
    name: text(parsed.name, 1, 120),
    ...(Object.hasOwn(parsed, "parentId") ? { parentId: uuid(parsed.parentId) } : {}),
    position: integer(parsed.position, 0, 9_999),
  });
}

export function parseCatalogCategory(value: unknown): CatalogCategory {
  const parsed = exact(value, [
    "id", "name", "slug", "position", "depth", "status", "version", "createdAt", "updatedAt",
  ], ["parentId", "archivedAt"]);
  const status = enumValue(parsed.status, ["active", "archived"] as const);
  if ((status === "active") === Object.hasOwn(parsed, "archivedAt")) invalid();
  return Object.freeze({
    id: uuid(parsed.id),
    ...(Object.hasOwn(parsed, "parentId") ? { parentId: uuid(parsed.parentId) } : {}),
    name: text(parsed.name, 1, 120),
    slug: text(parsed.slug, 1, 100, SLUG),
    position: integer(parsed.position, 0, 9_999),
    depth: integer(parsed.depth, 1, 8),
    status,
    version: integer(parsed.version, 1),
    createdAt: timestamp(parsed.createdAt),
    updatedAt: timestamp(parsed.updatedAt),
    ...(Object.hasOwn(parsed, "archivedAt") ? { archivedAt: timestamp(parsed.archivedAt) } : {}),
  });
}

export function parseCatalogCategoryList(value: unknown): readonly CatalogCategory[] {
  return Object.freeze(denseArray(value, 0, 500).map(parseCatalogCategory));
}

export function parseCatalogCategoryMutationResult(value: unknown): CatalogCategoryMutationResult {
  const parsed = exact(value, ["category", "replayed"]);
  return Object.freeze({ category: parseCatalogCategory(parsed.category), replayed: boolean(parsed.replayed) });
}
