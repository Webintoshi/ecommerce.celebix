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
