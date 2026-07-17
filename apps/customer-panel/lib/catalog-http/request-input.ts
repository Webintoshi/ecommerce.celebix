import "server-only";

import {
  parseProduct,
  parseProductVariant,
  type ProductStatus,
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
  | "create_variant"
  | "update_variant"
  | "archive_variant";

export type CatalogMutationBodies = Readonly<{
  create_product: Readonly<{ product: CatalogProductFields; initialVariant: CatalogVariantFields }>;
  update_product: Readonly<{ expectedVersion: number; product: CatalogProductFields }>;
  archive_product: Readonly<{ expectedVersion: number }>;
  create_variant: Readonly<{ variant: CatalogVariantFields }>;
  update_variant: Readonly<{ expectedVersion: number; variant: CatalogVariantFields }>;
  archive_variant: Readonly<{ expectedVersion: number }>;
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
  if (kind === "archive_product" || kind === "archive_variant") {
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
  status?: ProductStatus;
}>;

export function readCatalogListInput(request: Request): Invalid | Readonly<{ kind: "valid"; value: CatalogListInput }> {
  let url: URL;
  try { url = new URL(request.url); } catch { return INVALID; }
  const raw = url.search.startsWith("?") ? url.search.slice(1) : url.search;
  if (
    new TextEncoder().encode(raw).byteLength > QUERY_MAXIMUM_BYTES ||
    raw.includes("%") || raw.includes("+") ||
    (raw !== "" && (raw.startsWith("&") || raw.endsWith("&") || raw.includes("&&")))
  ) return INVALID;
  const entries = [...url.searchParams.entries()];
  if (
    entries.some(([key]) => key !== "limit" && key !== "cursor" && key !== "status") ||
    new Set(entries.map(([key]) => key)).size !== entries.length
  ) return INVALID;
  const limit = url.searchParams.get("limit");
  const pageSize = limit === null ? 20 : /^(?:[1-9]|[1-9]\d|100)$/.test(limit) ? Number(limit) : null;
  const cursor = url.searchParams.get("cursor");
  const status = url.searchParams.get("status");
  if (
    pageSize === null ||
    (cursor !== null && !CURSOR.test(cursor)) ||
    (status !== null && status !== "draft" && status !== "active" && status !== "archived")
  ) return INVALID;
  return Object.freeze({
    kind: "valid" as const,
    value: Object.freeze({
      pageSize,
      ...(cursor === null ? {} : { cursor }),
      ...(status === null ? {} : { status }),
    }),
  });
}

export function readCatalogPathId(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}
