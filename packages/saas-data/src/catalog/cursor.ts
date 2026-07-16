import type { Product, ProductStatus } from "@celebix/saas-contracts";

import { CatalogRepositoryError } from "./errors.ts";
import { CATALOG_UUID } from "./validation.ts";

interface CatalogCursor {
  readonly version: 1;
  readonly storeId: string;
  readonly status: ProductStatus | null;
  readonly createdAt: string;
  readonly id: string;
}

function fail(): never { throw new CatalogRepositoryError("invalid_input"); }

export function encodeCursor(storeId: string, status: ProductStatus | undefined, product: Product): string {
  return Buffer.from(JSON.stringify({
    version: 1,
    storeId,
    status: status ?? null,
    createdAt: product.createdAt,
    id: product.id,
  } satisfies CatalogCursor), "utf8").toString("base64url");
}

export function decodeCursor(
  value: string | undefined,
  storeId: string,
  status: ProductStatus | undefined,
): CatalogCursor | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length < 1 || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) fail();
  try {
    const decoded = Buffer.from(value, "base64url");
    if (decoded.toString("base64url") !== value) fail();
    const parsed = JSON.parse(decoded.toString("utf8")) as Record<string, unknown>;
    if (
      typeof parsed !== "object" || parsed === null || Array.isArray(parsed) ||
      Object.keys(parsed).sort().join(",") !== "createdAt,id,status,storeId,version" ||
      parsed.version !== 1 || parsed.storeId !== storeId || parsed.status !== (status ?? null) ||
      typeof parsed.createdAt !== "string" || new Date(parsed.createdAt).toISOString() !== parsed.createdAt ||
      typeof parsed.id !== "string" || !CATALOG_UUID.test(parsed.id)
    ) fail();
    return Object.freeze(parsed) as unknown as CatalogCursor;
  } catch (error) {
    if (error instanceof CatalogRepositoryError) throw error;
    fail();
  }
}
