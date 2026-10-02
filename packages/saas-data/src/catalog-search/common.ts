import { createHash } from "node:crypto";
import { StorefrontContentRepositoryError } from "../storefront-content/errors.ts";
import { storefrontContentCursor, storefrontContentUuid } from "../storefront-content/validation.ts";

export const CATALOG_SEARCH_MAX_OFFSET = 10_000;
const MEILI_CURSOR = /^m1\.([a-f0-9]{64})\.(0|[1-9]\d{0,4})$/;
export function searchFailure(code: "invalid_input" | "unavailable" = "unavailable"): never {
  throw new StorefrontContentRepositoryError(code);
}
export function assertCatalogSearchServer(): void {
  if (typeof (globalThis as { window?: unknown }).window !== "undefined") searchFailure();
}
export function normalizeCatalogSearchQuery(query: string): string {
  if (typeof query !== "string") searchFailure("invalid_input");
  return query.normalize("NFKD").replace(/\u0307/g, "").replace(/ı/g, "i").toLowerCase().replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ");
}
export function catalogSearchScopeHash(storeId: string, query: string): string {
  return createHash("sha256").update(JSON.stringify(["catalog-search/v1", storeId, normalizeCatalogSearchQuery(query)])).digest("hex");
}
export function parseMeilisearchCursor(cursor: string): Readonly<{ scopeHash: string; offset: number }> {
  const match = MEILI_CURSOR.exec(cursor);
  if (!match || Number(match[2]) >= CATALOG_SEARCH_MAX_OFFSET) searchFailure("invalid_input");
  return { scopeHash: match[1]!, offset: Number(match[2]) };
}
export function isCatalogSearchCursor(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    if (value.startsWith("m1.")) parseMeilisearchCursor(value);
    else storefrontContentCursor(value);
    return true;
  } catch { return false; }
}
export function boundedInteger(value: unknown, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) searchFailure();
  return value as number;
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) searchFailure();
  return value as Record<string, unknown>;
}
export function documentId(storeId: string, productId: string): string {
  return `${storefrontContentUuid(storeId, "unavailable")}_${storefrontContentUuid(productId, "unavailable")}`;
}
