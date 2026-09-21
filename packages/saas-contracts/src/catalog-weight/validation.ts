import {
  CATALOG_WEIGHT_PROFILE_MODES,
  CATALOG_WEIGHT_SALES_UNITS,
  CATALOG_WEIGHT_SCOPES,
  CATALOG_WEIGHT_SOURCES,
  type CatalogWeightDeclaration,
  type CatalogWeightEditorProjection,
  type CatalogWeightSaveIntent,
} from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const DIGEST = /^[0-9a-f]{64}$/u;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;

function invalid(): never { throw new TypeError("catalog_weight_contract_invalid"); }
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid();
  return value as Record<string, unknown>;
}
function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  const parsed = record(value);
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(parsed, key)) || Object.keys(parsed).some((key) => !allowed.has(key))) invalid();
  return parsed;
}
function text(value: unknown, minimum: number, maximum: number, pattern?: RegExp): string {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum || value !== value.trim() || CONTROL.test(value) || (pattern && !pattern.test(value))) invalid();
  return value;
}
function integer(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) invalid();
  return value as number;
}
function boolean(value: unknown): boolean { if (value !== true && value !== false) invalid(); return value; }
function enumValue<T extends string>(value: unknown, allowed: readonly T[]): T { if (typeof value !== "string" || !allowed.includes(value as T)) invalid(); return value as T; }
function nullable<T>(value: unknown, parser: (input: unknown) => T): T | null { return value === null ? null : parser(value); }
function timestamp(value: unknown): string {
  const candidate = text(value, 24, 24, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
  if (new Date(candidate).toISOString() !== candidate) invalid();
  return candidate;
}
function declaration(value: unknown): CatalogWeightDeclaration {
  const parsed = exact(value, [
    "id", "productId", "variantId", "gramsMilli", "scope", "salesUnit", "approximate",
    "toleranceBasisPoints", "source", "sourceExcerpt", "sourceDigest", "sourceProductVersion",
    "pricingVerified", "version", "updatedAt",
  ]);
  const source = enumValue(parsed.source, CATALOG_WEIGHT_SOURCES);
  const sourceExcerpt = nullable(parsed.sourceExcerpt, (input) => text(input, 1, 240));
  const sourceDigest = nullable(parsed.sourceDigest, (input) => text(input, 64, 64, DIGEST));
  const sourceProductVersion = nullable(parsed.sourceProductVersion, (input) => integer(input, 1));
  if (source === "description" ? sourceExcerpt === null || sourceDigest === null || sourceProductVersion === null : sourceExcerpt !== null || sourceDigest !== null || sourceProductVersion !== null) invalid();
  return Object.freeze({
    id: text(parsed.id, 36, 36, UUID),
    productId: text(parsed.productId, 36, 36, UUID),
    variantId: nullable(parsed.variantId, (input) => text(input, 36, 36, UUID)),
    gramsMilli: integer(parsed.gramsMilli, 1, 1_000_000_000),
    scope: enumValue(parsed.scope, CATALOG_WEIGHT_SCOPES),
    salesUnit: enumValue(parsed.salesUnit, CATALOG_WEIGHT_SALES_UNITS),
    approximate: boolean(parsed.approximate),
    toleranceBasisPoints: nullable(parsed.toleranceBasisPoints, (input) => integer(input, 1, 10_000)),
    source,
    sourceExcerpt,
    sourceDigest,
    sourceProductVersion,
    pricingVerified: boolean(parsed.pricingVerified),
    version: integer(parsed.version, 1),
    updatedAt: timestamp(parsed.updatedAt),
  });
}

export function parseCatalogWeightEditorProjection(value: unknown): CatalogWeightEditorProjection {
  const parsed = exact(value, ["profileMode", "productVersion", "declarations"]);
  if (!Array.isArray(parsed.declarations) || parsed.declarations.length > 101) invalid();
  const declarations = Object.freeze(parsed.declarations.map(declaration));
  if (new Set(declarations.map(({ id }) => id)).size !== declarations.length) invalid();
  return Object.freeze({
    profileMode: nullable(parsed.profileMode, (input) => enumValue(input, CATALOG_WEIGHT_PROFILE_MODES)),
    productVersion: integer(parsed.productVersion, 1),
    declarations,
  });
}

export function parseCatalogWeightSaveIntent(value: unknown): CatalogWeightSaveIntent {
  const parsed = exact(value, ["operationId", "expectedProductVersion", "expectedDeclarationVersion", "target", "declaration"]);
  const target = exact(parsed.target, ["level", "variantId"]);
  const level = enumValue(target.level, ["product", "variant"] as const);
  const variantId = nullable(target.variantId, (input) => text(input, 36, 36, UUID));
  if ((level === "product") !== (variantId === null)) invalid();
  const fields = exact(parsed.declaration, ["gramsMilli", "scope", "salesUnit", "approximate", "toleranceBasisPoints"]);
  const approximate = boolean(fields.approximate);
  const toleranceBasisPoints = nullable(fields.toleranceBasisPoints, (input) => integer(input, 1, 10_000));
  if (!approximate && toleranceBasisPoints !== null) invalid();
  return Object.freeze({
    operationId: text(parsed.operationId, 36, 36, UUID),
    expectedProductVersion: integer(parsed.expectedProductVersion, 1),
    expectedDeclarationVersion: integer(parsed.expectedDeclarationVersion, 0),
    target: Object.freeze({ level, variantId }),
    declaration: Object.freeze({
      gramsMilli: integer(fields.gramsMilli, 1, 1_000_000_000),
      scope: enumValue(fields.scope, CATALOG_WEIGHT_SCOPES),
      salesUnit: enumValue(fields.salesUnit, CATALOG_WEIGHT_SALES_UNITS),
      approximate,
      toleranceBasisPoints,
    }),
  });
}
