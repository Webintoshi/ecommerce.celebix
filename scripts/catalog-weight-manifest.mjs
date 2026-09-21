import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { extractCatalogWeightDeclaration } from "../packages/saas-contracts/src/catalog-weight/parser.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA = /^[0-9a-f]{40}$/u;

function fail() { throw new TypeError("catalog_weight_manifest_invalid"); }
function string(value, pattern) { if (typeof value !== "string" || !pattern.test(value)) fail(); return value; }
function integer(value, minimum = 0) { if (!Number.isSafeInteger(value) || value < minimum) fail(); return value; }
function digest(value) { return createHash("sha256").update(value, "utf8").digest("hex"); }
function derivedUuid(value) {
  const hex = digest(value).slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = "8";
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}
function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freeze(nested);
  return Object.freeze(value);
}
function target(product) {
  if (product.variants.length !== 1) return Object.freeze({ level: "product", variantId: null, expectedVariantVersion: null });
  const variant = product.variants[0];
  return Object.freeze({ level: "variant", variantId: string(variant.id, UUID), expectedVariantVersion: integer(variant.version, 1) });
}
function baseEntry(product) {
  if (!product || typeof product !== "object" || Array.isArray(product)) fail();
  const variants = product.variants;
  if (!Array.isArray(variants) || variants.length > 100) fail();
  const productId = string(product.id, UUID);
  const title = typeof product.title === "string" && product.title.trim() === product.title && product.title.length > 0 && product.title.length <= 200 ? product.title : fail();
  const status = ["active", "draft", "archived"].includes(product.status) ? product.status : fail();
  const productVersion = integer(product.version, 1);
  for (const variant of variants) {
    string(variant.id, UUID); integer(variant.version, 1);
    if (typeof variant.title !== "string" || variant.title.length < 1 || variant.title.length > 200) fail();
  }
  if (new Set(variants.map(({ id }) => id)).size !== variants.length) fail();
  const description = product.description === null || product.description === undefined ? "" : String(product.description);
  return { productId, title, status, productVersion, description, variants, target: target({ variants }) };
}

function classify(product, batchOperationId) {
  const base = baseEntry(product);
  const sourceDigest = digest(base.description);
  const extraction = extractCatalogWeightDeclaration(base.description);
  const common = {
    productId: base.productId,
    target: base.target,
    sourceQuote: extraction.kind === "single" || extraction.kind === "range" ? extraction.sourceExcerpt : null,
    sourceDigest,
    sourceProductVersion: base.productVersion,
    extractedGramsMilli: extraction.kind === "single" ? extraction.gramsMilli : null,
    extractedRangeGramsMilli: extraction.kind === "range"
      ? Object.freeze({ minimum: extraction.minimumGramsMilli, maximum: extraction.maximumGramsMilli }) : null,
    conflictingGramsMilli: extraction.kind === "conflict" ? extraction.valuesGramsMilli : null,
    scope: extraction.kind === "single" || extraction.kind === "range" ? extraction.scope : "unspecified",
    salesUnit: extraction.kind === "single" || extraction.kind === "range" ? extraction.salesUnit : "unspecified",
    approximate: extraction.kind === "single" ? extraction.approximate : null,
    toleranceBasisPoints: extraction.kind === "single" ? extraction.toleranceBasisPoints : null,
    existingValue: null,
    pricingVerified: false,
    importOperationId: derivedUuid(`${batchOperationId}:import:${base.productId}:${base.target.variantId ?? "product"}`),
    declarationId: derivedUuid(`${batchOperationId}:declaration:${base.productId}:${base.target.variantId ?? "product"}`),
  };
  if (product.existingDeclaration !== null && product.existingDeclaration !== undefined) {
    return freeze({ ...common, group: 5, action: "skip", skipReason: "declared_weight_preserved", existingValue: "declared_weight_present" });
  }
  if (product.pricingPolicy?.method === "gold_gram" && product.pricingPolicy.metalGrams !== null && product.pricingPolicy.metalGrams !== undefined) {
    return freeze({ ...common, group: 5, action: "skip", skipReason: "pricing_weight_preserved", existingValue: "pricing_policy_present" });
  }
  if (extraction.kind === "conflict") return freeze({ ...common, group: 3, action: "manual_review", skipReason: extraction.reason });
  if (extraction.kind === "none") return freeze({ ...common, group: 4, action: "skip", skipReason: extraction.reason });
  if (extraction.kind === "range") return freeze({ ...common, group: 2, action: "manual_review", skipReason: "range_weight" });
  if (extraction.approximate) return freeze({ ...common, group: 2, action: "manual_review", skipReason: extraction.toleranceBasisPoints === null ? "approximate_weight" : "tolerance_weight" });
  if (base.variants.length !== 1) return freeze({ ...common, group: 6, action: "manual_review", skipReason: base.variants.length === 0 ? "no_variant_target" : "multiple_variant_target" });
  return freeze({ ...common, group: 1, action: "import_declared_weight", skipReason: null });
}

export function buildCatalogWeightManifest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail();
  const storeId = string(input.storeId, UUID);
  const tenantSlug = typeof input.tenantSlug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(input.tenantSlug) ? input.tenantSlug : fail();
  const sourceHead = string(input.sourceHead, SHA);
  const operationId = string(input.operationId, UUID);
  const auditPrincipalId = string(input.auditPrincipalId, UUID);
  const generatedAt = typeof input.generatedAt === "string" && new Date(input.generatedAt).toISOString() === input.generatedAt ? input.generatedAt : fail();
  if (!Array.isArray(input.products) || input.products.length > 100_000) fail();
  const sortedProducts = [...input.products].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  if (new Set(sortedProducts.map(({ id }) => id)).size !== sortedProducts.length) fail();
  const entries = Object.freeze(sortedProducts.map((product) => classify(product, operationId)));
  const counts = { products: entries.length, variants: sortedProducts.reduce((sum, product) => sum + product.variants.length, 0), group1: 0, group2: 0, group3: 0, group4: 0, group5: 0, group6: 0, eligibleWrites: 0 };
  for (const entry of entries) {
    counts[`group${entry.group}`] += 1;
    if (entry.action === "import_declared_weight") counts.eligibleWrites += 1;
  }
  return freeze({
    schemaVersion: 1,
    storeId,
    tenantSlug,
    sourceHead,
    generatedAt,
    operationId,
    auditPrincipalId,
    profileOperationId: derivedUuid(`${operationId}:profile:${storeId}`),
    counts,
    protectedChanges: { price: 0, stock: 0, pricingPolicy: 0, activationGate: 0 },
    entries,
  });
}

async function readStandardInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const lines = Buffer.concat(chunks).toString("utf8").split(/\r?\n/u).filter(Boolean);
  return lines.map((line) => JSON.parse(line));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [storeId, tenantSlug, sourceHead, generatedAt, operationId, auditPrincipalId] = process.argv.slice(2);
  const products = await readStandardInput();
  process.stdout.write(`${JSON.stringify(buildCatalogWeightManifest({ storeId, tenantSlug, sourceHead, generatedAt, operationId, auditPrincipalId, products }), null, 2)}\n`);
}
