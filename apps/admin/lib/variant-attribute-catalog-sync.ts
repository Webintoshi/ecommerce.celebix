import {
  getStoredVariantAttributes,
  isVariantAttributeTableMissing,
  isVariantAttributeValueTableMissing,
  saveStoredVariantAttributes,
} from "@/lib/db/variant-attributes";

type JsonObject = Record<string, unknown>;

type RegistryValue = {
  id: string;
  attribute_id: string;
  value: string;
  display_order?: number | null;
  color_code?: string | null;
  image_url?: string | null;
};

type RegistryAttribute = {
  id: string;
  name: string;
  values: RegistryValue[];
};

type RegistryMatch = {
  attribute: RegistryAttribute;
  value: RegistryValue;
};

function toOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\u0131\u0130]/g, "i")
    .replace(/[\u011f\u011e]/g, "g")
    .replace(/[\u00fc\u00dc]/g, "u")
    .replace(/[\u015f\u015e]/g, "s")
    .replace(/[\u00f6\u00d6]/g, "o")
    .replace(/[\u00e7\u00c7]/g, "c")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function getMissingColumn(error: unknown, tableName: string): string | null {
  if (!error || typeof error !== "object" || !("message" in error)) return null;
  const message = String(error.message ?? "");
  const schemaCacheMatch = message.match(new RegExp(`Could not find the '([^']+)' column of '${tableName}'`, "i"));
  if (schemaCacheMatch?.[1]) {
    return schemaCacheMatch[1];
  }

  const relationMatch = message.match(
    new RegExp(`column [\"']([^\"']+)[\"'] of relation [\"']${tableName}[\"'] does not exist`, "i"),
  );
  return relationMatch?.[1] ?? null;
}

async function readVariantAttributeRegistry(supabase: any): Promise<RegistryAttribute[]> {
  const { data: attributes, error: attributesError } = await supabase.from("variant_attributes").select("id,name");
  if (attributesError) {
    if (isVariantAttributeTableMissing(attributesError) || isVariantAttributeValueTableMissing(attributesError)) {
      const storedAttributes = await getStoredVariantAttributes();
      return storedAttributes.map((attribute) => ({
        id: attribute.id,
        name: attribute.name,
        values: attribute.values
          .filter((value) => value.is_active !== false)
          .map((value) => ({
            id: value.id,
            attribute_id: value.attribute_id,
            value: value.value,
            display_order: value.display_order ?? null,
            color_code: value.color_code ?? null,
            image_url: value.image_url ?? null,
          })),
      }));
    }
    throw attributesError;
  }

  const { data: values, error: valuesError } = await supabase
    .from("variant_attribute_values")
    .select("id,attribute_id,value,display_order,color_code,image_url,is_active")
    .order("display_order")
    .order("value");

  if (valuesError) {
    if (isVariantAttributeValueTableMissing(valuesError) || isVariantAttributeTableMissing(valuesError)) {
      const storedAttributes = await getStoredVariantAttributes();
      return storedAttributes.map((attribute) => ({
        id: attribute.id,
        name: attribute.name,
        values: attribute.values
          .filter((value) => value.is_active !== false)
          .map((value) => ({
            id: value.id,
            attribute_id: value.attribute_id,
            value: value.value,
            color_code: value.color_code ?? null,
            image_url: value.image_url ?? null,
          })),
      }));
    }
    throw valuesError;
  }

  const valueMap = new Map<string, RegistryValue[]>();
  for (const row of values || []) {
    if ((row as { is_active?: boolean }).is_active === false) {
      continue;
    }

    const list = valueMap.get(row.attribute_id) ?? [];
    list.push({
      id: row.id,
      attribute_id: row.attribute_id,
      value: row.value,
      display_order: row.display_order ?? null,
      color_code: row.color_code ?? null,
      image_url: row.image_url ?? null,
    });
    valueMap.set(row.attribute_id, list);
  }

  return (attributes || []).map((attribute: { id: string; name: string }) => ({
    id: attribute.id,
    name: attribute.name,
    values: valueMap.get(attribute.id) ?? [],
  }));
}

function toStoredVariantAttributes(registry: RegistryAttribute[]) {
  return registry.map((attribute) => ({
    id: attribute.id,
    name: attribute.name,
    is_active: true,
    values: attribute.values.map((value, index) => ({
      id: value.id,
      attribute_id: value.attribute_id,
      value: value.value,
      color_code: value.color_code ?? null,
      image_url: value.image_url ?? null,
      display_order: typeof value.display_order === "number" ? value.display_order : index,
      is_active: true,
    })),
  }));
}

export async function syncStoredVariantAttributeRegistrySnapshot(supabase: any): Promise<RegistryAttribute[]> {
  const registry = await readVariantAttributeRegistry(supabase);
  if (registry.length > 0) {
    await saveStoredVariantAttributes(toStoredVariantAttributes(registry));
  }
  return registry;
}

function createRegistryIndexes(registry: RegistryAttribute[]) {
  const byValueId = new Map<string, RegistryMatch>();
  const byAttributeAndValue = new Map<string, RegistryMatch>();
  const byAttributeNameAndValue = new Map<string, RegistryMatch>();
  const byValue = new Map<string, RegistryMatch[]>();

  for (const attribute of registry) {
    const normalizedAttributeName = normalizeToken(attribute.name);

    for (const value of attribute.values) {
      const match = { attribute, value };
      const normalizedValue = normalizeToken(value.value);
      byValueId.set(value.id, match);
      byAttributeAndValue.set(`${attribute.id}:${normalizedValue}`, match);
      byAttributeNameAndValue.set(`${normalizedAttributeName}:${normalizedValue}`, match);
      const existing = byValue.get(normalizedValue) ?? [];
      existing.push(match);
      byValue.set(normalizedValue, existing);
    }
  }

  return {
    byValueId,
    byAttributeAndValue,
    byAttributeNameAndValue,
    byValue,
  };
}

function findRegistryMatch(
  entry: JsonObject,
  indexes: ReturnType<typeof createRegistryIndexes>,
): RegistryMatch | null {
  const rawValueId =
    toOptionalString(entry.valueId) ||
    toOptionalString(entry.attribute_value_id) ||
    toOptionalString(entry.id);
  if (rawValueId && indexes.byValueId.has(rawValueId)) {
    return indexes.byValueId.get(rawValueId) ?? null;
  }

  const rawValue = toOptionalString(entry.value);
  if (!rawValue) {
    return null;
  }

  const normalizedValue = normalizeToken(rawValue);
  const rawAttributeId =
    toOptionalString(entry.attributeId) ||
    toOptionalString(entry.attribute_id) ||
    (entry.attribute && typeof entry.attribute === "object" ? toOptionalString((entry.attribute as JsonObject).id) : null);

  if (rawAttributeId) {
    const byId = indexes.byAttributeAndValue.get(`${rawAttributeId}:${normalizedValue}`);
    if (byId) {
      return byId;
    }
  }

  const rawAttributeName =
    toOptionalString(entry.attributeName) ||
    toOptionalString(entry.name) ||
    toOptionalString(entry.linked_to) ||
    (entry.attribute && typeof entry.attribute === "object"
      ? toOptionalString((entry.attribute as JsonObject).name)
      : null);

  if (rawAttributeName) {
    const byName = indexes.byAttributeNameAndValue.get(`${normalizeToken(rawAttributeName)}:${normalizedValue}`);
    if (byName) {
      return byName;
    }
  }

  const valueMatches = indexes.byValue.get(normalizedValue) ?? [];
  return valueMatches.length === 1 ? valueMatches[0] : null;
}

function syncSnapshotEntry(
  entry: JsonObject,
  match: RegistryMatch,
): JsonObject {
  const colorCode = match.value.color_code ?? null;
  const imageUrl = match.value.image_url ?? null;

  return {
    ...entry,
    attributeId: match.attribute.id,
    attribute_id: match.attribute.id,
    attributeName: match.attribute.name,
    linked_to: toOptionalString(entry.linked_to) ?? match.attribute.name,
    valueId: match.value.id,
    attribute_value_id: match.value.id,
    value: match.value.value,
    displayOrder: match.value.display_order ?? null,
    display_order: match.value.display_order ?? null,
    colorCode,
    color_code: colorCode,
    imageUrl,
    image_url: imageUrl,
    attribute: {
      id: match.attribute.id,
      name: match.attribute.name,
    },
  };
}

export async function syncCatalogVariantAttributeSnapshots(supabase: any): Promise<void> {
  const registry = await syncStoredVariantAttributeRegistrySnapshot(supabase);
  if (registry.length === 0) {
    return;
  }

  const indexes = createRegistryIndexes(registry);
  const { data: variants, error } = await supabase.from("product_variants").select("id,attributes");

  if (error) {
    const missingColumn = getMissingColumn(error, "product_variants");
    if (missingColumn === "attributes") {
      return;
    }
    throw error;
  }

  for (const variant of variants || []) {
    const currentAttributes = Array.isArray(variant.attributes) ? variant.attributes : [];
    if (currentAttributes.length === 0) {
      continue;
    }

    let changed = false;
    const nextAttributes = currentAttributes.map((attribute) => {
      const entry = attribute && typeof attribute === "object" ? (attribute as JsonObject) : null;
      if (!entry) {
        return attribute;
      }

      const match = findRegistryMatch(entry, indexes);
      if (!match) {
        return attribute;
      }

      const syncedEntry = syncSnapshotEntry(entry, match);
      if (JSON.stringify(syncedEntry) !== JSON.stringify(entry)) {
        changed = true;
      }
      return syncedEntry;
    });

    if (!changed) {
      continue;
    }

    const { error: updateError } = await supabase
      .from("product_variants")
      .update({ attributes: nextAttributes })
      .eq("id", variant.id);

    if (updateError) {
      throw updateError;
    }
  }
}
