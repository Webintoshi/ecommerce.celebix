import { createHash } from "node:crypto";

export function stableCatalogMigrationJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableCatalogMigrationJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, nested]) => nested !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableCatalogMigrationJson(nested)}`)
    .join(",")}}`;
}

export function catalogMigrationFingerprint(kind: string, storeId: string, payload: unknown): string {
  return createHash("sha256")
    .update(stableCatalogMigrationJson({ kind, storeId, payload }), "utf8")
    .digest("hex");
}
