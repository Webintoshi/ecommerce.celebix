import "server-only";

import {
  parseCatalogProductListQuery,
  parseCatalogBulkProductIntent,
  parseProduct,
  parseProductVariant,
  type CatalogProductListQuery,
  type CatalogBulkProductIntent,
} from "@celebix/saas-contracts";
import type {
  CatalogProductFields,
  CatalogVariantFields,
} from "@celebix/saas-data";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CURSOR = /^[A-Za-z0-9_-]{1,2048}$/;
const BODY_MAXIMUM_BYTES = 32_768;
const QUERY_MAXIMUM_BYTES = 4_096;
const SYNTHETIC_PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const SYNTHETIC_VARIANT_ID = "22222222-2222-4222-8222-222222222222";
const SYNTHETIC_STORE_ID = "33333333-3333-4333-8333-333333333333";
const SYNTHETIC_TIME = "2026-01-01T00:00:00.000Z";

export type CatalogMutationKind =
  | "create_product"
  | "update_product"
  | "archive_product"
  | "restore_product"
  | "create_variant"
  | "update_variant"
  | "archive_variant"
  | "bulk_product";

export type CatalogMutationBodies = Readonly<{
  create_product: Readonly<{ product: CatalogProductFields; initialVariant: CatalogVariantFields }>;
  update_product: Readonly<{ expectedVersion: number; product: CatalogProductFields }>;
  archive_product: Readonly<{ expectedVersion: number }>;
  restore_product: Readonly<{ expectedVersion: number }>;
  create_variant: Readonly<{ variant: CatalogVariantFields }>;
  update_variant: Readonly<{ expectedVersion: number; variant: CatalogVariantFields }>;
  archive_variant: Readonly<{ expectedVersion: number }>;
  bulk_product: CatalogBulkProductIntent;
}>;

type Invalid = Readonly<{ kind: "invalid" }>;
const INVALID = Object.freeze({ kind: "invalid" as const });

function object(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null ? value as Record<string, unknown> : null;
}

function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> | null {
  const parsed = object(value);
  if (parsed === null) return null;
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((key) => !Object.hasOwn(parsed, key)) ||
    Object.keys(parsed).some((key) => !allowed.has(key))
  ) return null;
  return parsed;
}

function productFields(value: unknown): CatalogProductFields | null {
  const parsed = exact(value, ["slug", "title", "status", "currency"], ["description"]);
  if (parsed === null) return null;
  try {
    const product = parseProduct({
      id: SYNTHETIC_PRODUCT_ID,
      storeId: SYNTHETIC_STORE_ID,
      ...parsed,
      createdAt: SYNTHETIC_TIME,
      updatedAt: SYNTHETIC_TIME,
      version: 1,
    });
    if (product.status === "archived") return null;
    return Object.freeze({
      slug: product.slug,
      title: product.title,
      ...(product.description === undefined ? {} : { description: product.description }),
      status: product.status,
      currency: product.currency,
    });
  } catch { return null; }
}

function variantFields(value: unknown): CatalogVariantFields | null {
  const parsed = exact(
    value,
    ["title", "priceCents", "stockTracking", "stockQuantity", "attributes"],
    ["sku", "barcode", "compareAtCents", "costCents"],
  );
  if (parsed === null) return null;
  try {
    const variant = parseProductVariant({
      id: SYNTHETIC_VARIANT_ID,
      productId: SYNTHETIC_PRODUCT_ID,
      storeId: SYNTHETIC_STORE_ID,
      ...parsed,
      status: "active",
      createdAt: SYNTHETIC_TIME,
      updatedAt: SYNTHETIC_TIME,
      version: 1,
    });
    return Object.freeze({
      title: variant.title,
      ...(variant.sku === undefined ? {} : { sku: variant.sku }),
      ...(variant.barcode === undefined ? {} : { barcode: variant.barcode }),
      priceCents: variant.priceCents,
      ...(variant.compareAtCents === undefined ? {} : { compareAtCents: variant.compareAtCents }),
      ...(variant.costCents === undefined ? {} : { costCents: variant.costCents }),
      stockTracking: variant.stockTracking,
      stockQuantity: variant.stockQuantity,
      attributes: variant.attributes,
    });
  } catch { return null; }
}

function version(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 1 ? value as number : null;
}

function mutationBody<K extends CatalogMutationKind>(value: unknown, kind: K): CatalogMutationBodies[K] | null {
  if (kind === "bulk_product") {
    try { return parseCatalogBulkProductIntent(value) as CatalogMutationBodies[K]; }
    catch { return null; }
  }
  if (kind === "create_product") {
    const parsed = exact(value, ["product", "initialVariant"]);
    const product = productFields(parsed?.product);
    const initialVariant = variantFields(parsed?.initialVariant);
    return parsed && product && initialVariant
      ? Object.freeze({ product, initialVariant }) as CatalogMutationBodies[K]
      : null;
  }
  if (kind === "update_product") {
    const parsed = exact(value, ["expectedVersion", "product"]);
    const expectedVersion = version(parsed?.expectedVersion);
    const product = productFields(parsed?.product);
    return parsed && expectedVersion !== null && product
      ? Object.freeze({ expectedVersion, product }) as CatalogMutationBodies[K]
      : null;
  }
  if (kind === "archive_product" || kind === "restore_product" || kind === "archive_variant") {
    const parsed = exact(value, ["expectedVersion"]);
    const expectedVersion = version(parsed?.expectedVersion);
    return parsed && expectedVersion !== null
      ? Object.freeze({ expectedVersion }) as CatalogMutationBodies[K]
      : null;
  }
  if (kind === "create_variant") {
    const parsed = exact(value, ["variant"]);
    const variant = variantFields(parsed?.variant);
    return parsed && variant ? Object.freeze({ variant }) as CatalogMutationBodies[K] : null;
  }
  const parsed = exact(value, ["expectedVersion", "variant"]);
  const expectedVersion = version(parsed?.expectedVersion);
  const variant = variantFields(parsed?.variant);
  return parsed && expectedVersion !== null && variant
    ? Object.freeze({ expectedVersion, variant }) as CatalogMutationBodies[K]
    : null;
}

function jsonContentType(request: Request): boolean {
  const value = request.headers.get("content-type");
  return value !== null &&
    !value.includes(",") &&
    /^application\/json(?:\s*;\s*charset=(?:utf-8|"utf-8"))?$/i.test(value) &&
    request.headers.get("transfer-encoding") === null;
}

async function boundedJson(request: Request): Promise<unknown | null> {
  if (!jsonContentType(request) || request.body === null) return null;
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^(?:0|[1-9]\d*)$/.test(declared) || Number(declared) > BODY_MAXIMUM_BYTES)) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      if (!(next.value instanceof Uint8Array)) return null;
      total += next.value.byteLength;
      if (total > BODY_MAXIMUM_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(new Uint8Array(next.value));
    }
  } catch { return null; }
  if (total === 0) return null;
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let raw: string;
  try { raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return null; }
  try { return JSON.parse(raw); }
  catch { return null; }
}

export async function readCatalogMutationInput<K extends CatalogMutationKind>(
  request: Request,
  kind: K,
): Promise<Invalid | Readonly<{ kind: "valid"; operationId: string; value: CatalogMutationBodies[K] }>> {
  const operationId = request.headers.get("idempotency-key");
  if (operationId === null || !UUID.test(operationId)) return INVALID;
  const raw = await boundedJson(request);
  const value = raw === null ? null : mutationBody(raw, kind);
  return value === null
    ? INVALID
    : Object.freeze({ kind: "valid" as const, operationId, value });
}

export type CatalogListInput = Readonly<{
  pageSize: number;
  cursor?: string;
}> & Omit<CatalogProductListQuery, "sort"> & Readonly<{ sort?: CatalogProductListQuery["sort"] }>;

export function readCatalogListInput(request: Request): Invalid | Readonly<{ kind: "valid"; value: CatalogListInput }> {
  let url: URL;
  try { url = new URL(request.url); } catch { return INVALID; }
  const raw = url.search.startsWith("?") ? url.search.slice(1) : url.search;
  if (
    new TextEncoder().encode(raw).byteLength > QUERY_MAXIMUM_BYTES ||
    (raw !== "" && (raw.startsWith("&") || raw.endsWith("&") || raw.includes("&&")))
  ) return INVALID;
  const entries: [string, string][] = [];
  const seen = new Set<string>();
  for (const part of raw === "" ? [] : raw.split("&")) {
    const separator = part.indexOf("=");
    const rawKey = separator === -1 ? part : part.slice(0, separator);
    const rawValue = separator === -1 ? "" : part.slice(separator + 1);
    if (rawKey === "" || rawKey.includes("%") || rawKey.includes("+")) return INVALID;
    let key: string;
    let value: string;
    try {
      key = decodeURIComponent(rawKey);
      value = decodeURIComponent(rawValue.replaceAll("+", " "));
    } catch { return INVALID; }
    if (seen.has(key)) return INVALID;
    seen.add(key);
    entries.push([key, value]);
  }
  if (
    entries.some(([key]) => !["limit", "cursor", "q", "status", "stock", "category", "brand", "collection", "sort"].includes(key))
  ) return INVALID;
  const parameters = new Map(entries);
  const limit = parameters.get("limit") ?? null;
  const pageSize = limit === null ? 20 : /^(?:20|50|100)$/.test(limit) ? Number(limit) : null;
  const cursor = parameters.get("cursor") ?? null;
  if (pageSize === null || (cursor !== null && !CURSOR.test(cursor))) return INVALID;
  let query: CatalogProductListQuery;
  try {
    query = parseCatalogProductListQuery({
      ...(parameters.has("q") ? { search: parameters.get("q") } : {}),
      ...(parameters.has("status") ? { status: parameters.get("status") } : {}),
      ...(parameters.has("stock") ? { stock: parameters.get("stock") } : {}),
      ...(parameters.has("category") ? { categoryId: parameters.get("category") } : {}),
      ...(parameters.has("brand") ? { brandId: parameters.get("brand") } : {}),
      ...(parameters.has("collection") ? { collectionId: parameters.get("collection") } : {}),
      ...(parameters.has("sort") ? { sort: parameters.get("sort") } : {}),
    });
  } catch { return INVALID; }
  return Object.freeze({
    kind: "valid" as const,
    value: Object.freeze({
      pageSize,
      ...(cursor === null ? {} : { cursor }),
      ...(query.search === undefined ? {} : { search: query.search }),
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.stock === undefined ? {} : { stock: query.stock }),
      ...(query.categoryId === undefined ? {} : { categoryId: query.categoryId }),
      ...(query.brandId === undefined ? {} : { brandId: query.brandId }),
      ...(query.collectionId === undefined ? {} : { collectionId: query.collectionId }),
      ...(parameters.has("sort") ? { sort: query.sort } : {}),
    }),
  });
}

export function readCatalogPathId(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}
