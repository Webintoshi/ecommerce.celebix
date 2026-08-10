import type { MerchantAdminJson } from "@celebix/saas-contracts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

export type CategoryShowcaseRow = Readonly<{ categoryId: string; assetId: string }>;
export type CategoryShowcaseLayout = "duo" | "grid";

function invalid(): never {
  throw new TypeError("category_showcase_invalid");
}

export function buildCategoryShowcaseConfig(value: Readonly<{
  heading: string;
  enabled: boolean;
  layout: CategoryShowcaseLayout;
  rows: readonly CategoryShowcaseRow[];
}>): Readonly<Record<string, MerchantAdminJson>> {
  if (typeof value !== "object" || value === null || typeof value.heading !== "string" || typeof value.enabled !== "boolean" || (value.layout !== "duo" && value.layout !== "grid") || !Array.isArray(value.rows)) invalid();
  const heading = value.heading.trim();
  if (heading.length < 1 || heading.length > 160 || CONTROL.test(heading)) invalid();
  if (value.rows.length < 1 || value.rows.length > 8) invalid();
  const categories = new Set<string>();
  const assets = new Set<string>();
  const items = value.rows.map((row) => {
    if (typeof row !== "object" || row === null || !UUID.test(row.categoryId) || !UUID.test(row.assetId)) invalid();
    if (categories.has(row.categoryId) || assets.has(row.assetId)) invalid();
    categories.add(row.categoryId); assets.add(row.assetId);
    return Object.freeze({ categoryId: row.categoryId, assetId: row.assetId });
  });
  return Object.freeze({ heading, enabled: value.enabled, layout: value.layout, items: Object.freeze(items) });
}
