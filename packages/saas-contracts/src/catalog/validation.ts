import {
  PRODUCT_STATUSES,
  VARIANT_STATUSES,
  type Product,
  type ProductStatus,
  type ProductVariant,
  type VariantStatus,
} from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKU = /^[A-Z0-9](?:[A-Z0-9._-]{0,63})$/;
const ATTRIBUTE_KEY = /^[A-Za-z0-9](?:[A-Za-z0-9_.:-]{0,63})$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

function invalid(): never {
  throw new TypeError("catalog_contract_invalid");
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  return value as Record<string, unknown>;
}

function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  const parsed = record(value);
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(parsed);
  if (required.some((key) => !Object.hasOwn(parsed, key)) || keys.some((key) => !allowed.has(key))) invalid();
  return parsed;
}

function string(value: unknown, minimum: number, maximum: number, pattern?: RegExp): string {
  if (
    typeof value !== "string" ||
    value.length < minimum ||
    value.length > maximum ||
    value !== value.trim() ||
    CONTROL.test(value) ||
    (pattern !== undefined && !pattern.test(value))
  ) invalid();
  return value;
}

function uuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) invalid();
  return value;
}

function timestamp(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) invalid();
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) invalid();
  return value;
}

function safeInteger(value: unknown, minimum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) invalid();
  return value as number;
}

function status<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) invalid();
  return value as T;
}

function optionalString(
  value: Record<string, unknown>,
  key: string,
  minimum: number,
  maximum: number,
  pattern?: RegExp,
): string | undefined {
  if (!Object.hasOwn(value, key)) return undefined;
  return string(value[key], minimum, maximum, pattern);
}

function attributes(value: unknown): Readonly<Record<string, string>> {
  const parsed = record(value);
  const entries = Object.entries(parsed);
  if (entries.length > 32 || JSON.stringify(parsed).length > 8_192) invalid();
  const output: Record<string, string> = {};
  for (const [key, nested] of entries) {
    string(key, 1, 64, ATTRIBUTE_KEY);
    output[key] = string(nested, 0, 256);
  }
  return Object.freeze(output);
}

export function parseProduct(value: unknown): Product {
  const parsed = exact(
    value,
    ["id", "storeId", "slug", "title", "status", "currency", "createdAt", "updatedAt", "version"],
    ["description"],
  );
  const product = {
    id: uuid(parsed.id),
    storeId: uuid(parsed.storeId),
    slug: string(parsed.slug, 3, 100, SLUG),
    title: string(parsed.title, 1, 200),
    ...(Object.hasOwn(parsed, "description")
      ? { description: string(parsed.description, 1, 10_000) }
      : {}),
    status: status<ProductStatus>(parsed.status, PRODUCT_STATUSES),
    currency: string(parsed.currency, 3, 3, /^[A-Z]{3}$/),
    createdAt: timestamp(parsed.createdAt),
    updatedAt: timestamp(parsed.updatedAt),
    version: safeInteger(parsed.version, 1),
  } satisfies Product;
  if (product.updatedAt < product.createdAt) invalid();
  return Object.freeze(product);
}

export function parseProductVariant(value: unknown): ProductVariant {
  const parsed = exact(
    value,
    [
      "id", "productId", "storeId", "title", "priceCents", "stockTracking",
      "stockQuantity", "status", "attributes", "createdAt", "updatedAt", "version",
    ],
    ["sku", "barcode", "compareAtCents", "costCents"],
  );
  const priceCents = safeInteger(parsed.priceCents, 0);
  const compareAtCents = Object.hasOwn(parsed, "compareAtCents")
    ? safeInteger(parsed.compareAtCents, 0)
    : undefined;
  if (compareAtCents !== undefined && compareAtCents < priceCents) invalid();
  const variant = {
    id: uuid(parsed.id),
    productId: uuid(parsed.productId),
    storeId: uuid(parsed.storeId),
    title: string(parsed.title, 1, 200),
    ...(Object.hasOwn(parsed, "sku") ? { sku: optionalString(parsed, "sku", 1, 64, SKU)! } : {}),
    ...(Object.hasOwn(parsed, "barcode") ? { barcode: optionalString(parsed, "barcode", 1, 128)! } : {}),
    priceCents,
    ...(compareAtCents === undefined ? {} : { compareAtCents }),
    ...(Object.hasOwn(parsed, "costCents") ? { costCents: safeInteger(parsed.costCents, 0) } : {}),
    stockTracking: parsed.stockTracking === true
      ? true
      : parsed.stockTracking === false
        ? false
        : invalid(),
    stockQuantity: safeInteger(parsed.stockQuantity, 0),
    status: status<VariantStatus>(parsed.status, VARIANT_STATUSES),
    attributes: attributes(parsed.attributes),
    createdAt: timestamp(parsed.createdAt),
    updatedAt: timestamp(parsed.updatedAt),
    version: safeInteger(parsed.version, 1),
  } satisfies ProductVariant;
  if (variant.updatedAt < variant.createdAt) invalid();
  return Object.freeze(variant);
}
