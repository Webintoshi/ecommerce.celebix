import type { CatalogAdminJson, CatalogAdminResource } from "@celebix/saas-contracts";
import { measurementsToDraft, parseProductMeasurements, type ProductMeasurementDraft } from "../catalog-ui/product-measurements.ts";

const UNITS = { weight: ["g", "kg"], volume: ["ml", "l"], length: ["cm", "m"], width: ["cm", "m"], height: ["cm", "m"] } as const;
type Field = keyof typeof UNITS | "packageCount";
const SPACES = "[ \\u00a0\\u202f]*";
const QUANTITY = new RegExp(`^${SPACES}(\\d+(?:[,.]\\d{1,3})?)${SPACES}([a-z]+)${SPACES}$`, "i");
const COUNT = new RegExp(`^${SPACES}(\\d+)${SPACES}(?:adet)?${SPACES}$`, "i");

export function parseAttributeMeasurementValue(field: string, raw: string): ProductMeasurementDraft | undefined {
  if (typeof raw !== "string" || raw.length > 100) return undefined;
  let draft: ProductMeasurementDraft;
  if (field === "packageCount") {
    const match = COUNT.exec(raw);
    if (!match) return undefined;
    draft = { packageCount: match[1]! };
  } else {
    if (!Object.hasOwn(UNITS, field)) return undefined;
    const match = QUANTITY.exec(raw), unit = match?.[2]?.toLowerCase();
    if (!match || !unit || !(UNITS[field as keyof typeof UNITS] as readonly string[]).includes(unit)) return undefined;
    draft = { [field]: match[1]!, [`${field}Unit`]: unit };
  }
  const parsed = parseProductMeasurements(draft);
  return parsed.ok && parsed.value ? Object.freeze(measurementsToDraft(parsed.value)) : undefined;
}

export function attributeValueIdentity(config: Readonly<Record<string, CatalogAdminJson>>, raw: string): string {
  const field = config.measurementField;
  const draft = typeof field === "string" ? parseAttributeMeasurementValue(field, raw) : undefined;
  if (draft) {
    const parsed = parseProductMeasurements(draft);
    if (parsed.ok && parsed.value) {
      if (field === "packageCount") return `packageCount:${parsed.value.packageCount}`;
      const measured = parsed.value[field as keyof typeof UNITS];
      if (measured) {
        const multiplier = measured.unit === "kg" || measured.unit === "l" ? 1000n : measured.unit === "m" ? 100n : 1n;
        return `${field}:${BigInt(measured.valueMilli) * multiplier}`;
      }
    }
  }
  return raw.trim().toLocaleLowerCase("tr-TR");
}

export function attributeMeasurementDraft(resources: readonly CatalogAdminResource[], attributes: Readonly<Record<string, string>>): ProductMeasurementDraft {
  const selected = new Map<Field, { identity: string; draft: ProductMeasurementDraft }>();
  const conflicts = new Set<Field>();
  for (const resource of resources) {
    if (resource.kind !== "attribute" || resource.status !== "active" || resource.config.enabled === false) continue;
    const field = resource.config.measurementField, key = resource.config.key === undefined ? resource.slug : resource.config.key;
    if (typeof field !== "string" || typeof key !== "string" || !Object.hasOwn(attributes, key)) continue;
    const raw = attributes[key]!, draft = parseAttributeMeasurementValue(field, raw);
    if (!draft) continue;
    const identity = attributeValueIdentity(resource.config, raw), previous = selected.get(field as Field);
    if (previous && previous.identity !== identity) conflicts.add(field as Field);
    else if (!previous) selected.set(field as Field, { identity, draft });
  }
  return Object.freeze(Object.assign({}, ...[...selected].filter(([field]) => !conflicts.has(field)).map(([, value]) => value.draft)));
}
