import type { ProductMeasurements } from "@celebix/saas-contracts";

export type MeasurementKey = "weight" | "volume" | "length" | "width" | "depth" | "height" | "area";
export type ProductMeasurementDraft = Readonly<Partial<Record<MeasurementKey | `${MeasurementKey}Unit` | "packageCount", string>>>;
export const MEASUREMENT_FIELDS = [
  { key: "weight", label: "Ağırlık", units: ["g", "kg"] },
  { key: "volume", label: "Hacim", units: ["ml", "l"] },
  { key: "length", label: "Uzunluk", units: ["cm", "m"] },
  { key: "width", label: "En", units: ["cm", "m"] },
  { key: "depth", label: "Boy", units: ["cm", "m"] },
  { key: "height", label: "Yükseklik", units: ["cm", "m"] },
  { key: "area", label: "Alan", units: ["m2"] },
] as const;

export type MeasurementResult = Readonly<{ ok: true; value: ProductMeasurements | undefined }> | Readonly<{ ok: false; error: string; field: MeasurementKey | "packageCount" }>;
export function parseProductMeasurements(draft?: ProductMeasurementDraft): MeasurementResult {
  if (draft === undefined) return { ok: true, value: undefined };
  if (typeof draft !== "object" || draft === null || Array.isArray(draft)) return { ok: false, field: "weight", error: "Ölçü bilgileri geçersiz." };
  const allowedKeys = [...MEASUREMENT_FIELDS.flatMap(({ key }) => [key, `${key}Unit`]), "packageCount"];
  const prototype = Object.getPrototypeOf(draft);
  if ((prototype !== Object.prototype && prototype !== null) || Object.getOwnPropertySymbols(draft).length || Object.keys(draft).some((key) => !allowedKeys.includes(key))) return { ok: false, field: "weight", error: "Ölçü bilgileri geçersiz." };
  const measurements: Record<string, unknown> = {};
  for (const { key, label, units } of MEASUREMENT_FIELDS) {
    const raw = draft[key];
    if (raw === undefined || (typeof raw === "string" && raw.trim() === "")) continue;
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    const unit = draft[`${key}Unit`] ?? units[0];
    if (trimmed.length > 32 || !/^\d+(?:[,.]\d{1,3})?$/.test(trimmed) || !(units as readonly string[]).includes(unit)) {
      return { ok: false, field: key, error: `${label} için pozitif bir değer ve geçerli bir birim girin; en fazla üç ondalık basamak kullanın.` };
    }
    const [whole, fraction = ""] = trimmed.replace(",", ".").split(".");
    const scaled = BigInt(`${whole}${fraction.padEnd(3, "0")}`);
    if (scaled <= 0n || scaled > BigInt(Number.MAX_SAFE_INTEGER)) return { ok: false, field: key, error: `${label} pozitif ve geçerli bir değer olmalıdır.` };
    measurements[key] = { valueMilli: Number(scaled), unit };
  }
  const packageCount = draft.packageCount;
  if (packageCount !== undefined && (typeof packageCount !== "string" || packageCount.trim() !== "")) {
    const value = typeof packageCount === "string" && /^\d{1,16}$/.test(packageCount.trim()) ? Number(packageCount.trim()) : NaN;
    if (!Number.isSafeInteger(value) || value <= 0) return { ok: false, field: "packageCount", error: "Paket içeriği pozitif tam sayı olmalıdır." };
    measurements.packageCount = value;
  }
  return { ok: true, value: Object.keys(measurements).length ? measurements as ProductMeasurements : undefined };
}

export function formatMeasurementValue(valueMilli: number): string {
  const value = BigInt(valueMilli);
  const fraction = String(value % 1000n).padStart(3, "0").replace(/0+$/, "");
  return `${value / 1000n}${fraction ? `,${fraction}` : ""}`;
}

export function measurementsToDraft(measurements?: ProductMeasurements): ProductMeasurementDraft {
  if (!measurements) return {};
  const draft: Partial<Record<MeasurementKey | `${MeasurementKey}Unit` | "packageCount", string>> = {};
  for (const { key } of MEASUREMENT_FIELDS) {
    const value = measurements[key];
    if (value) { draft[key] = formatMeasurementValue(value.valueMilli); draft[`${key}Unit`] = value.unit; }
  }
  if (measurements.packageCount !== undefined) draft.packageCount = String(measurements.packageCount);
  return draft;
}

export function readProductMeasurementForm(data: FormData): ProductMeasurementDraft | undefined {
  if (!data.has("measurementsPresent")) return undefined;
  const fields: Record<string, string> = {};
  for (const key of [...MEASUREMENT_FIELDS.flatMap(({ key }) => [key, `${key}Unit`]), "packageCount"]) {
    const value = data.get(`measurement-${key}`);
    if (typeof value === "string") fields[key] = value;
  }
  return fields;
}

export function measurementSummary(measurements?: ProductMeasurements): readonly string[] {
  if (!measurements) return [];
  const values: string[] = [];
  for (const { key, label } of MEASUREMENT_FIELDS) {
    const value = measurements[key];
    if (value) values.push(`${label}: ${formatMeasurementValue(value.valueMilli)} ${value.unit === "m2" ? "m²" : value.unit}`);
  }
  if (measurements.packageCount !== undefined) values.push(`Paket içeriği: ${measurements.packageCount} adet`);
  return values;
}
