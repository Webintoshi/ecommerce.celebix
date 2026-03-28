import { OrderItemCustomization } from "@/types/product-customization";

type StoredCustomization = Partial<OrderItemCustomization> & {
  step_values?: Record<string, unknown>;
  calculated_price?: number;
};

export function normalizeStoredCustomization(
  raw: StoredCustomization | null | undefined
): OrderItemCustomization | null {
  if (!raw) return null;

  if (Array.isArray(raw.selections) && raw.price_breakdown) {
    return {
      id: raw.id || "",
      order_item_id: raw.order_item_id || "",
      schema_id: raw.schema_id,
      schema_version: raw.schema_version || 1,
      schema_snapshot: raw.schema_snapshot || {
        id: raw.schema_id || "",
        name: "Ekstra Ozellikler",
        slug: "ekstra-ozellikler",
        is_active: true,
        sort_order: 0,
        settings: {},
      },
      selections: raw.selections,
      price_breakdown: raw.price_breakdown,
      custom_text_content: raw.custom_text_content,
      uploaded_files: raw.uploaded_files || [],
      production_notes: raw.production_notes,
      production_status: raw.production_status || "pending",
      created_at: raw.created_at,
    };
  }

  const stepValues = raw.step_values || {};
  const legacySelections = Object.entries(stepValues).map(([stepKey, value]) => ({
    step_id: "",
    step_key: stepKey,
    step_label: stepKey,
    type: "text" as const,
    value: value as string | number | boolean | string[],
    display_value: Array.isArray(value) ? value.join(", ") : String(value),
    price_adjustment: 0,
  }));

  const legacyPrice = Number(raw.calculated_price || 0);
  return {
    id: raw.id || "",
    order_item_id: raw.order_item_id || "",
    schema_id: raw.schema_id,
    schema_version: 1,
    schema_snapshot: {
      id: raw.schema_id || "",
      name: "Ekstra Ozellikler",
      slug: "ekstra-ozellikler",
      is_active: true,
      sort_order: 0,
      settings: {},
    },
    selections: legacySelections,
    price_breakdown: {
      base_price: 0,
      adjustments: [],
      total_adjustment: legacyPrice,
      final_price: legacyPrice,
    },
    custom_text_content: raw.custom_text_content,
    uploaded_files: raw.uploaded_files || [],
    production_status: "pending",
    created_at: raw.created_at,
  };
}
