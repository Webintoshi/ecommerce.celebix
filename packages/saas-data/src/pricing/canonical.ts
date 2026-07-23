import { createHash } from "node:crypto";
import type { PriceListItem, PriceListRule } from "@celebix/saas-contracts";
function stable(value: unknown): string { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; return `{${Object.entries(value as Record<string, unknown>).filter(([, nested]) => nested !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`).join(",")}}`; }
export function canonicalPricingItems(items: readonly PriceListItem[]): readonly PriceListItem[] { return Object.freeze([...items].sort((left, right) => left.variantId < right.variantId ? -1 : left.variantId > right.variantId ? 1 : 0)); }
export function canonicalPricingRules(rules: readonly PriceListRule[]): readonly PriceListRule[] { return Object.freeze([...rules].sort((left, right) => stable(left) < stable(right) ? -1 : stable(left) > stable(right) ? 1 : 0)); }
export function pricingFingerprint(kind: string, storeId: string, priceListId: string, expectedVersion: number | null, payload: unknown): string { return createHash("sha256").update(stable({ expectedVersion, kind, payload, priceListId, storeId }), "utf8").digest("hex"); }
export function deterministicPricingCreateId(storeId: string, operationId: string, payload: unknown): string {
  const bytes = createHash("sha256").update(stable({ kind: "pricing_create_id_v1", operationId, payload, storeId }), "utf8").digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function equalPricingProjection(left: unknown, right: unknown): boolean { return stable(left) === stable(right); }
