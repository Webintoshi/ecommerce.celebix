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

// A separate stable key lets both native operations retain their own replay records.
export function inventoryActivationOperationId(storeId: string, operationId: string, kind: string): string {
  const bytes = createHash("sha256").update(`celebix.inventory.activate.v1:${storeId}:${operationId}:${kind}`, "utf8").digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
