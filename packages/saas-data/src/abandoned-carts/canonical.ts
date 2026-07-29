import { createHash } from "node:crypto";

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, nested]) => nested !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${stableSerialize(nested)}`).join(",")}}`;
}

export function abandonedCartFingerprint(kind: string, storeId: string, payload: unknown): string {
  return createHash("sha256").update(stableSerialize({ kind, storeId, payload }), "utf8").digest("hex");
}
