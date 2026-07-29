import {
  CATALOG_ADMIN_RESOURCE_KINDS,
  CATALOG_IMPORT_STATUSES,
  PRODUCT_REVIEW_STATUSES,
  type CatalogAdminImportJob,
  type CatalogAdminImportRow,
  type CatalogAdminJson,
  type CatalogAdminMutationResult,
  type CatalogAdminResource,
  type CatalogImportPreview,
  type ProductReview,
} from "./types.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKU = /^[A-Z0-9][A-Z0-9._-]{0,63}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const KEY = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

function invalid(): never {
  throw new Error("catalog_admin_contract_invalid");
}
function object(value: unknown) {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    invalid();
  return value as Record<string, unknown>;
}
function exact(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
) {
  const parsed = object(value);
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((key) => !Object.hasOwn(parsed, key)) ||
    Object.keys(parsed).some((key) => !allowed.has(key))
  )
    invalid();
  return parsed;
}
function text(value: unknown, min: number, max: number, pattern?: RegExp) {
  if (
    typeof value !== "string" ||
    value.length < min ||
    value.length > max ||
    value !== value.trim() ||
    CONTROL.test(value) ||
    (pattern && !pattern.test(value))
  )
    invalid();
  return value;
}
function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < min ||
    (value as number) > max
  )
    invalid();
  return value as number;
}
function timestamp(value: unknown) {
  const result = text(value, 24, 24);
  if (new Date(result).toISOString() !== result) invalid();
  return result;
}
function uuid(value: unknown) {
  return text(value, 36, 36, UUID);
}
function importRows(value: unknown): readonly CatalogAdminImportRow[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100)
    invalid();
  const rows = Object.freeze(
    value.map((entry) => {
      const parsed = exact(
        entry,
        ["title", "slug", "priceCents", "stockQuantity"],
        ["sku"],
      );
      return Object.freeze({
        title: text(parsed.title, 1, 200),
        slug: text(parsed.slug, 3, 100, SLUG),
        priceCents: integer(parsed.priceCents),
        ...(parsed.sku === undefined
          ? {}
          : { sku: text(parsed.sku, 1, 64, SKU) }),
        stockQuantity: integer(parsed.stockQuantity),
      });
    }),
  );
  if (new TextEncoder().encode(JSON.stringify(rows)).byteLength > 131072)
    invalid();
  return rows;
}
function json(value: unknown, depth = 0): CatalogAdminJson {
  if (depth > 6) invalid();
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value)) invalid();
    return value;
  }
  if (typeof value === "string") return text(value, 0, 1000);
  if (Array.isArray(value)) {
    if (value.length > 64) invalid();
    return Object.freeze(value.map((entry) => json(entry, depth + 1)));
  }
  const parsed = object(value);
  if (
    Object.keys(parsed).length > 64 ||
    Object.keys(parsed).some((key) => !KEY.test(key))
  )
    invalid();
  const result = Object.freeze(
    Object.fromEntries(
      Object.entries(parsed).map(([key, nested]) => [
        key,
        json(nested, depth + 1),
      ]),
    ),
  );
  if (JSON.stringify(result).length > 8192) invalid();
  return result;
}

export function parseCatalogAdminResource(
  value: unknown,
): CatalogAdminResource {
  const parsed = exact(
    value,
    [
      "id",
      "kind",
      "name",
      "slug",
      "config",
      "status",
      "productIds",
      "productCount",
      "version",
      "createdAt",
      "updatedAt",
    ],
    ["description"],
  );
  if (
    !CATALOG_ADMIN_RESOURCE_KINDS.includes(parsed.kind as never) ||
    !["active", "archived"].includes(String(parsed.status))
  )
    invalid();
  const config = json(parsed.config);
  if (typeof config !== "object" || config === null || Array.isArray(config))
    invalid();
  const resourceConfig = config as Readonly<Record<string, CatalogAdminJson>>;
  if (!Array.isArray(parsed.productIds) || parsed.productIds.length > 100)
    invalid();
  const productIds = Object.freeze(parsed.productIds.map(uuid));
  if (
    new Set(productIds).size !== productIds.length ||
    integer(parsed.productCount) !== productIds.length
  )
    invalid();
  return Object.freeze({
    id: uuid(parsed.id),
    kind: parsed.kind as CatalogAdminResource["kind"],
    name: text(parsed.name, 1, 120),
    slug: text(parsed.slug, 1, 120, SLUG),
    ...(parsed.description === undefined
      ? {}
      : { description: text(parsed.description, 1, 2000) }),
    config: resourceConfig,
    status: parsed.status as CatalogAdminResource["status"],
    productIds,
    productCount: productIds.length,
    version: integer(parsed.version, 1),
    createdAt: timestamp(parsed.createdAt),
    updatedAt: timestamp(parsed.updatedAt),
  });
}

export function parseProductReview(value: unknown): ProductReview {
  const parsed = exact(
    value,
    [
      "id",
      "productId",
      "productTitle",
      "reviewerName",
      "rating",
      "body",
      "status",
      "version",
      "createdAt",
      "updatedAt",
    ],
    ["title", "merchantReply"],
  );
  if (!PRODUCT_REVIEW_STATUSES.includes(parsed.status as never)) invalid();
  return Object.freeze({
    id: uuid(parsed.id),
    productId: uuid(parsed.productId),
    productTitle: text(parsed.productTitle, 1, 200),
    reviewerName: text(parsed.reviewerName, 1, 120),
    rating: integer(parsed.rating, 1, 5),
    ...(parsed.title === undefined
      ? {}
      : { title: text(parsed.title, 1, 200) }),
    body: text(parsed.body, 1, 5000),
    status: parsed.status as ProductReview["status"],
    ...(parsed.merchantReply === undefined
      ? {}
      : { merchantReply: text(parsed.merchantReply, 1, 2000) }),
    version: integer(parsed.version, 1),
    createdAt: timestamp(parsed.createdAt),
    updatedAt: timestamp(parsed.updatedAt),
  });
}

export function parseCatalogAdminImportJob(
  value: unknown,
): CatalogAdminImportJob {
  const parsed = exact(
    value,
    [
      "id",
      "fileName",
      "status",
      "totalRows",
      "succeededRows",
      "failedRows",
      "version",
      "createdAt",
      "updatedAt",
    ],
    ["errorSummary"],
  );
  if (!CATALOG_IMPORT_STATUSES.includes(parsed.status as never)) invalid();
  const totalRows = integer(parsed.totalRows, 1, 100);
  const succeededRows = integer(parsed.succeededRows, 0, totalRows);
  const failedRows = integer(parsed.failedRows, 0, totalRows);
  if (succeededRows + failedRows !== totalRows) invalid();
  return Object.freeze({
    id: uuid(parsed.id),
    fileName: text(parsed.fileName, 1, 200),
    status: parsed.status as CatalogAdminImportJob["status"],
    totalRows,
    succeededRows,
    failedRows,
    ...(parsed.errorSummary === undefined
      ? {}
      : { errorSummary: text(parsed.errorSummary, 1, 1000) }),
    version: integer(parsed.version, 1),
    createdAt: timestamp(parsed.createdAt),
    updatedAt: timestamp(parsed.updatedAt),
  });
}

export function parseCatalogAdminMutationResult(
  value: unknown,
): CatalogAdminMutationResult {
  const parsed = exact(value, [
    "id",
    "version",
    "status",
    "updatedAt",
    "replayed",
  ]);
  if (typeof parsed.replayed !== "boolean") invalid();
  return Object.freeze({
    id: uuid(parsed.id),
    version: integer(parsed.version, 1),
    status: text(parsed.status, 1, 32),
    updatedAt: timestamp(parsed.updatedAt),
    replayed: parsed.replayed,
  });
}

export function parseCatalogImportPreview(
  value: unknown,
): CatalogImportPreview {
  const parsed = exact(value, [
    "id",
    "format",
    "fileName",
    "digest",
    "status",
    "rows",
    "totalRows",
    "version",
    "expiresAt",
    "createdAt",
    "updatedAt",
  ]);
  if (
    !["native_csv", "shopify_csv"].includes(String(parsed.format)) ||
    !["prepared", "consumed", "expired"].includes(String(parsed.status))
  )
    invalid();
  const rows = importRows(parsed.rows);
  if (integer(parsed.totalRows, 1, 100) !== rows.length) invalid();
  return Object.freeze({
    id: uuid(parsed.id),
    format: parsed.format as CatalogImportPreview["format"],
    fileName: text(parsed.fileName, 1, 200),
    digest: text(parsed.digest, 64, 64, DIGEST),
    status: parsed.status as CatalogImportPreview["status"],
    rows,
    totalRows: rows.length,
    version: integer(parsed.version, 1),
    expiresAt: timestamp(parsed.expiresAt),
    createdAt: timestamp(parsed.createdAt),
    updatedAt: timestamp(parsed.updatedAt),
  });
}
