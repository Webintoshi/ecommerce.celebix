import type { CatalogAdminResource } from "@celebix/saas-contracts";
import type { VariantDraft } from "../../components/catalog-onboarding/ProductVariantBuilder.tsx";
import { buildVariantMatrix, type VariantMatrixOption } from "./variant-matrix.ts";

export type CatalogAttributeChoice = Readonly<{ id: string; name: string; key: string; values: readonly string[] }>;

export function attributeChoices(resources: readonly CatalogAdminResource[]): readonly CatalogAttributeChoice[] {
  return Object.freeze(resources.filter((resource) => resource.kind === "attribute" && resource.status === "active").flatMap((resource) => {
    const raw = resource.config.values;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(resource.slug) || !Array.isArray(raw) || raw.length < 1 || raw.length > 64 ||
      raw.some((value) => typeof value !== "string" || value.trim() !== value || value.length < 1 || value.length > 100) ||
      new Set(raw.map((value) => String(value).toLocaleLowerCase("tr-TR"))).size !== raw.length) {
      return [];
    }
    return [Object.freeze({ id: resource.id, name: resource.name, key: resource.slug, values: Object.freeze([...raw] as string[]) })];
  }));
}

export function variantAttributeKey(attributes: Readonly<Record<string, string>>): string {
  return JSON.stringify(Object.entries(attributes).map(([key, value]) => [key.toLocaleLowerCase("tr-TR"), value.toLocaleLowerCase("tr-TR")]).sort(([left], [right]) => left.localeCompare(right, "tr-TR")));
}

export function reconcileVariantRows(options: readonly VariantMatrixOption[], current: readonly VariantDraft[]): Readonly<{
  kept: readonly VariantDraft[];
  removed: readonly VariantDraft[];
}> {
  const matrix = options.length ? buildVariantMatrix(options) : null;
  const validKeys = new Set(matrix?.ok ? matrix.value.map((candidate) => variantAttributeKey(candidate.attributes)) : []);
  return Object.freeze({
    kept: Object.freeze(current.filter((row) => validKeys.has(variantAttributeKey(row.attributes)))),
    removed: Object.freeze(current.filter((row) => !validKeys.has(variantAttributeKey(row.attributes)))),
  });
}

export function updateSharedVariantDefault(
  rows: readonly VariantDraft[], field: "price" | "stockQuantity", previous: string, next: string,
): readonly VariantDraft[] {
  return Object.freeze(rows.map((row) => row[field] === previous ? Object.freeze({ ...row, [field]: next }) : row));
}

export function mergeSelectedVariants(input: Readonly<{
  options: readonly VariantMatrixOption[];
  selectedKeys: readonly string[];
  current: readonly VariantDraft[];
  existing: readonly Readonly<Record<string, string>>[];
  defaultPrice: string;
  defaultStock: string;
}>): Readonly<{ ok: false; error: string }> | Readonly<{ ok: true; value: readonly VariantDraft[] }> {
  const matrix = buildVariantMatrix(input.options);
  if (!matrix.ok) return matrix;
  const candidates = new Map(matrix.value.map((candidate) => [variantAttributeKey(candidate.attributes), candidate]));
  const selected = new Set(input.selectedKeys);
  if (selected.size !== input.selectedKeys.length || selected.size === 0 || selected.size > 100 || [...selected].some((key) => !candidates.has(key)))
    return Object.freeze({ ok: false, error: "En az bir geçerli varyant kombinasyonu seçin." });
  const existing = new Set(input.existing.map(variantAttributeKey));
  if ([...selected].some((key) => existing.has(key))) return Object.freeze({ ok: false, error: "Bu varyant kombinasyonu üründe zaten var." });
  const current = new Map(input.current.map((row) => [variantAttributeKey(row.attributes), row]));
  const output = input.selectedKeys.map((key) => {
    const previous = current.get(key);
    if (previous) return previous;
    const candidate = candidates.get(key)!;
    return Object.freeze({
      title: candidate.title, sku: "", barcode: "", price: input.defaultPrice, compareAt: "", cost: "",
      stockQuantity: input.defaultStock, continueSellingWhenOutOfStock: false, shippingDesi: "", hsCode: "",
      attributes: candidate.attributes,
    } satisfies VariantDraft);
  });
  return Object.freeze({ ok: true, value: Object.freeze(output) });
}
