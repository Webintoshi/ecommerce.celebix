import { createHash } from "node:crypto";

export type CacheDataClass = "analytics" | "catalog" | "promotions" | "settings";

function normalized(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(normalized);
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(object).sort()) result[key] = normalized(object[key]);
    return result;
  }
  throw new Error("cache_key_input_invalid");
}

function segment(value: string): string {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(value)) throw new Error("cache_key_segment_invalid");
  return value;
}

export function hashNormalizedInput(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(normalized(value))).digest("hex");
}

export function buildNamespaceKey(namespace: string, storeId: string, dataClass: CacheDataClass): string {
  if (!/^[a-z0-9][a-z0-9:_-]{2,63}$/i.test(namespace) || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(storeId)) throw new Error("cache_key_segment_invalid");
  return `${namespace}:store:${storeId}:${dataClass}:namespace`;
}

export function buildCacheEntryKey(input: Readonly<{
  namespace: string;
  storeId: string;
  dataClass: CacheDataClass;
  schemaVersion: string;
  namespaceToken: string;
  scope: string;
  input: unknown;
}>): string {
  return `${buildNamespaceKey(input.namespace, input.storeId, input.dataClass).replace(/:namespace$/, "")}:${segment(input.schemaVersion)}:${segment(input.namespaceToken)}:${segment(input.scope)}:${hashNormalizedInput(input.input)}`;
}
