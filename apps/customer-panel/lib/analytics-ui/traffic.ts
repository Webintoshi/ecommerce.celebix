export type AnalyticsTrafficMetricType =
  | "path"
  | "referrer"
  | "device"
  | "country";

function analyticsTrafficRows(
  selected: unknown,
): readonly Readonly<{ label: string; value: number }>[] | null {
  if (!selected || typeof selected !== "object" || Array.isArray(selected))
    return null;
  const rows = (selected as Record<string, unknown>).items;
  if (!Array.isArray(rows)) return null;
  return Object.freeze(
    rows.flatMap((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
      const row = entry as Record<string, unknown>;
      return typeof row.label === "string" &&
        row.label.length >= 1 &&
        row.label.length <= 200 &&
        Number.isSafeInteger(row.value) &&
        Number(row.value) >= 0
        ? [Object.freeze({ label: row.label, value: Number(row.value) })]
        : [];
    }),
  );
}

export function analyticsTrafficMetric(
  value: unknown,
  type: AnalyticsTrafficMetricType,
): readonly Readonly<{ label: string; value: number }>[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const metrics = (value as Record<string, unknown>).metrics;
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics))
    return null;
  return analyticsTrafficRows((metrics as Record<string, unknown>)[type]);
}

export function analyticsTrafficSources(
  value: unknown,
): readonly Readonly<{ label: string; value: number }>[] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return analyticsTrafficRows((value as Record<string, unknown>).sources);
}

/** Null means the event measurement failed; an empty map is a measured empty result. */
export function analyticsTrafficEvents(value: unknown): Readonly<Record<string, number>> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rows = analyticsTrafficRows((value as Record<string, unknown>).events);
  return rows === null ? null : Object.freeze(Object.fromEntries(rows.map((row) => [row.label, row.value])));
}

export function analyticsProductMetricCount(
  value: unknown,
  type: "views" | "adds",
  productId: string,
): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rows = analyticsTrafficRows((value as Record<string, unknown>)[type]);
  if (rows === null) return null;
  return rows.find((row) => row.label === productId)?.value ?? 0;
}

/** Build once per payload so each product row can read its count without reparsing. */
export function analyticsProductMetricIndex(
  value: unknown,
  type: "views" | "adds",
): ReadonlyMap<string, number> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rows = analyticsTrafficRows((value as Record<string, unknown>)[type]);
  if (rows === null) return null;
  const index = new Map<string, number>();
  for (const row of rows) {
    // Match the existing find() semantics when the provider repeats a product.
    if (!index.has(row.label)) index.set(row.label, row.value);
  }
  return index;
}

export function analyticsIndexedProductMetricCount(
  index: ReadonlyMap<string, number> | null,
  productId: string,
): number | null {
  return index === null ? null : index.get(productId) ?? 0;
}
