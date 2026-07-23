import { createHash } from "node:crypto";

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter((entry) => entry[1] !== undefined)
    .sort((left, right) => left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0);
  return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`).join(",")}}`;
}

export function canonicalInventoryLines<T extends Readonly<{ lineId: string }>>(lines: readonly T[]): readonly T[] {
  return Object.freeze([...lines].sort((left, right) => left.lineId < right.lineId ? -1 : left.lineId > right.lineId ? 1 : 0));
}

export function inventoryFingerprint(
  kind: string,
  storeId: string,
  targetId: string | null,
  expectedVersion: number | null,
  payload: unknown,
): string {
  return createHash("sha256")
    .update(stable({ expectedVersion, kind, payload, storeId, targetId }), "utf8")
    .digest("hex");
}
