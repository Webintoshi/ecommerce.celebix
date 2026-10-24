export type ProductPageReviewSettings = Readonly<{ enabled: boolean; version: number }>;
export type ProductPageReviewAvailability = Readonly<{ enabled: false } | { enabled: true; state: "guest" | "available" | "submitted" }>;

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError("product_page_review_invalid");
  const parsed = value as Record<string, unknown>;
  if (Object.keys(parsed).length !== keys.length || keys.some(key => !Object.hasOwn(parsed, key))) throw new TypeError("product_page_review_invalid");
  return parsed;
}
export function parseProductPageReviewSettings(value: unknown): ProductPageReviewSettings {
  const parsed = record(value, ["enabled", "version"]);
  if (typeof parsed.enabled !== "boolean" || !Number.isSafeInteger(parsed.version) || (parsed.version as number) < 0) throw new TypeError("product_page_review_invalid");
  return Object.freeze({ enabled: parsed.enabled, version: parsed.version as number });
}
export function parseProductPageReviewAvailability(value: unknown): ProductPageReviewAvailability {
  if (value && typeof value === "object" && (value as Record<string, unknown>).enabled === false) { record(value, ["enabled"]); return Object.freeze({ enabled: false }); }
  const parsed = record(value, ["enabled", "state"]);
  if (parsed.enabled !== true || !["guest", "available", "submitted"].includes(String(parsed.state))) throw new TypeError("product_page_review_invalid");
  return Object.freeze({ enabled: true, state: parsed.state as "guest" | "available" | "submitted" });
}
