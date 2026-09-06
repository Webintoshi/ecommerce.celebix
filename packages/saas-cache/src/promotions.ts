import { parsePromotionRuleDocument, type PromotionRuleDocument } from "@celebix/saas-contracts";

import type { Cache } from "./cache.ts";

export type CompiledPromotionDefinition = Readonly<{
  id: string;
  version: number;
  ruleDocument: PromotionRuleDocument;
}>;

export type CompiledPromotionReadModel = Readonly<{
  schemaVersion: 1;
  storeId: string;
  currency: string;
  salesChannel: "storefront" | "quick_order";
  definitions: readonly CompiledPromotionDefinition[];
}>;

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("promotion_cache_projection_invalid");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join("\0") !== [...keys].sort().join("\0")) throw new Error("promotion_cache_projection_invalid");
  return record;
}

function uuid(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) throw new Error("promotion_cache_projection_invalid");
  return value;
}

export function parseCompiledPromotionReadModel(value: unknown): CompiledPromotionReadModel {
  const root = exact(value, ["schemaVersion", "storeId", "currency", "salesChannel", "definitions"]);
  if (root.schemaVersion !== 1 || typeof root.currency !== "string" || !/^[A-Z]{3}$/.test(root.currency) || (root.salesChannel !== "storefront" && root.salesChannel !== "quick_order") || !Array.isArray(root.definitions) || root.definitions.length > 100) throw new Error("promotion_cache_projection_invalid");
  const definitions = root.definitions.map((candidate) => {
    const selected = exact(candidate, ["id", "version", "ruleDocument"]), id = uuid(selected.id);
    if (!Number.isSafeInteger(selected.version) || (selected.version as number) < 1) throw new Error("promotion_cache_projection_invalid");
    return Object.freeze({ id, version: selected.version as number, ruleDocument: parsePromotionRuleDocument(selected.ruleDocument) });
  });
  if (new Set(definitions.map((definition) => definition.id)).size !== definitions.length || definitions.some((definition, index) => index > 0 && definitions[index - 1]!.id >= definition.id)) throw new Error("promotion_cache_projection_invalid");
  return Object.freeze({ schemaVersion: 1, storeId: uuid(root.storeId), currency: root.currency, salesChannel: root.salesChannel, definitions: Object.freeze(definitions) });
}

export async function readCompiledPromotionModel(input: Readonly<{
  cache: Cache;
  storeId: string;
  currency: string;
  salesChannel: "storefront" | "quick_order";
  ttlSeconds: number;
  load(): Promise<CompiledPromotionReadModel>;
}>): Promise<CompiledPromotionReadModel> {
  const expectedStore = uuid(input.storeId);
  if (!/^[A-Z]{3}$/.test(input.currency) || !Number.isSafeInteger(input.ttlSeconds) || input.ttlSeconds < 1 || input.ttlSeconds > 86_400) throw new Error("promotion_cache_input_invalid");
  const bind = (value: unknown) => {
    const parsed = parseCompiledPromotionReadModel(value);
    if (parsed.storeId !== expectedStore || parsed.currency !== input.currency || parsed.salesChannel !== input.salesChannel) throw new Error("promotion_cache_projection_invalid");
    return parsed;
  };
  return input.cache.readThrough({
    storeId: expectedStore,
    dataClass: "promotions",
    schemaVersion: "evaluator-v1",
    scope: "compiled-active",
    input: Object.freeze({ currency: input.currency, salesChannel: input.salesChannel }),
    ttlSeconds: input.ttlSeconds,
    parser: bind,
    load: async () => bind(await input.load()),
  });
}
