import { createHash } from "node:crypto";

import {
  catalogProductListQueryDigest,
  type CatalogProductListQuery,
  type CatalogProductSort,
} from "@celebix/saas-contracts";

import { CatalogRepositoryError } from "./errors.ts";
import { CATALOG_UUID } from "./validation.ts";

export interface CatalogCursorAnchor {
  readonly timestamp: string | null;
  readonly title: string | null;
  readonly id: string;
}

type PackedAnchor = readonly [string | null, string | null, string];
type CatalogCursor = readonly [2, string, string, PackedAnchor];

function fail(): never { throw new CatalogRepositoryError("invalid_input"); }

function queryFingerprint(query: CatalogProductListQuery): string {
  return createHash("sha256")
    .update(catalogProductListQueryDigest(query), "utf8")
    .digest("base64url");
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).sort().join(",") === [...expected].sort().join(",");
}

function validTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { return new Date(value).toISOString() === value; }
  catch { return false; }
}

function validAnchor(value: unknown, sort: CatalogProductSort): value is CatalogCursorAnchor {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const parsed = value as Record<string, unknown>;
  if (!exactKeys(parsed, ["timestamp", "title", "id"]) || typeof parsed.id !== "string" || !CATALOG_UUID.test(parsed.id)) return false;
  const timestampSort = sort === "updated-desc" || sort === "created-desc" || sort === "created-asc";
  if (timestampSort) return validTimestamp(parsed.timestamp) && parsed.title === null;
  return parsed.timestamp === null && typeof parsed.title === "string" && parsed.title.length >= 1 && parsed.title.length <= 200 && parsed.title === parsed.title.trim();
}

export function encodeCursor(storeId: string, query: CatalogProductListQuery, anchor: CatalogCursorAnchor): string {
  if (!CATALOG_UUID.test(storeId) || !validAnchor(anchor, query.sort)) fail();
  const encoded = Buffer.from(JSON.stringify([
    2,
    storeId,
    queryFingerprint(query),
    [anchor.timestamp, anchor.title, anchor.id],
  ] satisfies CatalogCursor), "utf8").toString("base64url");
  if (encoded.length > 2_048) fail();
  return encoded;
}

export function decodeCursor(
  value: string | undefined,
  storeId: string,
  query: CatalogProductListQuery,
): CatalogCursorAnchor | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length < 1 || value.length > 2_048 || !/^[A-Za-z0-9_-]+$/.test(value)) fail();
  try {
    const decoded = Buffer.from(value, "base64url");
    if (decoded.toString("base64url") !== value) fail();
    const parsed = JSON.parse(decoded.toString("utf8")) as unknown;
    if (
      !Array.isArray(parsed) || parsed.length !== 4 || parsed[0] !== 2 || parsed[1] !== storeId ||
      typeof parsed[2] !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(parsed[2]) ||
      !Array.isArray(parsed[3]) || parsed[3].length !== 3
    ) fail();
    const storedAnchor = parsed[3] as unknown[];
    const anchor = { timestamp: storedAnchor[0], title: storedAnchor[1], id: storedAnchor[2] };
    if (
      parsed[2] !== queryFingerprint(query) ||
      !validAnchor(anchor, query.sort)
    ) fail();
    return Object.freeze(anchor) as CatalogCursorAnchor;
  } catch (error) {
    if (error instanceof CatalogRepositoryError) throw error;
    fail();
  }
}
