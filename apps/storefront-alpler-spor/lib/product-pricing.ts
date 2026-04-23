import type { ProductDiscountRule } from "@celebix/platform-config/src/product-pricing";

function isMissingProductDiscountRulesTable(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  if ("code" in error && error.code === "42P01") {
    return true;
  }

  if (!("message" in error)) {
    return false;
  }

  const message = String(error.message ?? "");
  return /product_discount_rules/i.test(message);
}

export async function getProductDiscountRulesMap(
  supabase: any,
  productIds: string[],
): Promise<Record<string, ProductDiscountRule[]>> {
  if (!Array.isArray(productIds) || productIds.length === 0) {
    return {};
  }

  const uniqueIds = [...new Set(productIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return {};
  }

  const { data, error } = await supabase
    .from("product_discount_rules")
    .select("id, product_id, type, config, is_active, starts_at, ends_at, priority")
    .in("product_id", uniqueIds);

  if (error) {
    if (isMissingProductDiscountRulesTable(error)) {
      return {};
    }

    throw error;
  }

  const rulesMap: Record<string, ProductDiscountRule[]> = {};

  for (const row of data || []) {
    const productId = String(row.product_id || "");
    if (!productId) {
      continue;
    }

    if (!rulesMap[productId]) {
      rulesMap[productId] = [];
    }

    rulesMap[productId].push({
      id: row.id ? String(row.id) : undefined,
      type: row.type,
      config:
        row.config && typeof row.config === "object" && !Array.isArray(row.config)
          ? (row.config as Record<string, unknown>)
          : {},
      is_active: row.is_active,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      priority: typeof row.priority === "number" ? row.priority : 0,
    });
  }

  return rulesMap;
}
