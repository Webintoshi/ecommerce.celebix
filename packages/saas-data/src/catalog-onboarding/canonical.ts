import { createHash } from "node:crypto";

export function stableCatalogOnboardingJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableCatalogOnboardingJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, nested]) => nested !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableCatalogOnboardingJson(nested)}`)
    .join(",")}}`;
}

export function catalogOnboardingFingerprint(kind: string, storeId: string, payload: unknown): string {
  return createHash("sha256")
    .update(stableCatalogOnboardingJson({ kind, storeId, payload }), "utf8")
    .digest("hex");
}
