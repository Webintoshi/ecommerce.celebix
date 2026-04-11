import { getSetting, setSetting } from "@/lib/db/settings";
import type { VariantAttribute, VariantAttributeValue } from "@/types/variant-attributes";
import { isIgnoredLegacyVariantAttributeName } from "@/lib/variant-attribute-legacy";

const VARIANT_ATTRIBUTES_SETTING_KEY = "variant_attributes_registry";

type VariantAttributeRecord = VariantAttribute & {
  values: VariantAttributeValue[];
};

type VariantAttributeRegistry = {
  attributes: VariantAttributeRecord[];
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeValue(
  value: Partial<VariantAttributeValue> & Pick<VariantAttributeValue, "value">,
  attributeId: string,
  displayOrder = 0,
): VariantAttributeValue {
  return {
    id: typeof value.id === "string" && value.id ? value.id : crypto.randomUUID(),
    attribute_id: attributeId,
    value: value.value.trim(),
    color_code: typeof value.color_code === "string" && value.color_code ? value.color_code : null,
    image_url: typeof value.image_url === "string" && value.image_url ? value.image_url : null,
    display_order: typeof value.display_order === "number" ? value.display_order : displayOrder,
    is_active: value.is_active !== false,
    created_at: typeof value.created_at === "string" ? value.created_at : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function normalizeAttribute(attribute: Partial<VariantAttributeRecord>): VariantAttributeRecord {
  const id = typeof attribute.id === "string" && attribute.id ? attribute.id : crypto.randomUUID();
  const values = Array.isArray(attribute.values)
    ? attribute.values
        .map((value, index) => normalizeValue(value, id, index))
        .filter((value) => value.is_active !== false)
        .sort((left, right) => left.display_order - right.display_order || left.value.localeCompare(right.value, "tr"))
    : [];

  return {
    id,
    name: typeof attribute.name === "string" && attribute.name ? attribute.name : "Yeni Nitelik",
    slug:
      typeof attribute.slug === "string" && attribute.slug
        ? attribute.slug
        : slugify(typeof attribute.name === "string" ? attribute.name : "nitelik"),
    is_active: attribute.is_active !== false,
    created_at: typeof attribute.created_at === "string" ? attribute.created_at : new Date().toISOString(),
    updated_at: new Date().toISOString(),
    values,
  };
}

export function isVariantAttributeTableMissing(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("message" in error)) return false;
  const message = String(error.message ?? "");
  return (
    /Could not find the table 'public\.variant_attributes' in the schema cache/i.test(message) ||
    /relation ["']public\.variant_attributes["'] does not exist/i.test(message) ||
    /relation ["']variant_attributes["'] does not exist/i.test(message)
  );
}

export function isVariantAttributeValueTableMissing(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("message" in error)) return false;
  const message = String(error.message ?? "");
  return (
    /Could not find the table 'public\.variant_attribute_values' in the schema cache/i.test(message) ||
    /relation ["']public\.variant_attribute_values["'] does not exist/i.test(message) ||
    /relation ["']variant_attribute_values["'] does not exist/i.test(message)
  );
}

export async function getStoredVariantAttributes(): Promise<VariantAttributeRecord[]> {
  const registry = (await getSetting(VARIANT_ATTRIBUTES_SETTING_KEY)) as VariantAttributeRegistry | null;
  const attributes = Array.isArray(registry?.attributes) ? registry.attributes : [];
  const normalizedAttributes = attributes
    .map((attribute) => normalizeAttribute(attribute))
    .filter((attribute) => attribute.is_active !== false)
    .filter((attribute) => !isIgnoredLegacyVariantAttributeName(attribute.name))
    .sort((left, right) => left.name.localeCompare(right.name, "tr"));

  if (normalizedAttributes.length !== attributes.length) {
    await saveStoredVariantAttributes(normalizedAttributes);
  }

  return normalizedAttributes;
}

export async function saveStoredVariantAttributes(attributes: VariantAttributeRecord[]) {
  await setSetting(VARIANT_ATTRIBUTES_SETTING_KEY, {
    attributes: attributes.map((attribute) => normalizeAttribute(attribute)),
  });
}

export async function getStoredVariantAttributeById(id: string): Promise<VariantAttributeRecord | null> {
  const attributes = await getStoredVariantAttributes();
  return attributes.find((attribute) => attribute.id === id) ?? null;
}

export async function createStoredVariantAttribute(input: {
  name: string;
  slug?: string;
  values: Array<{
    value: string;
    color_code?: string | null;
    image_url?: string | null;
    display_order?: number;
    is_active?: boolean;
  }>;
}): Promise<VariantAttributeRecord> {
  const attributes = await getStoredVariantAttributes();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const attribute = normalizeAttribute({
    id,
    name: input.name.trim(),
    slug: input.slug || slugify(input.name),
    is_active: true,
    created_at: now,
    updated_at: now,
    values: input.values.map((value, index) =>
      normalizeValue(
        {
          ...value,
          created_at: now,
          updated_at: now,
        },
        id,
        typeof value.display_order === "number" ? value.display_order : index,
      ),
    ),
  });

  attributes.push(attribute);
  await saveStoredVariantAttributes(attributes);
  return attribute;
}

export async function updateStoredVariantAttribute(
  id: string,
  updater: (attribute: VariantAttributeRecord) => VariantAttributeRecord,
): Promise<VariantAttributeRecord | null> {
  const attributes = await getStoredVariantAttributes();
  const index = attributes.findIndex((attribute) => attribute.id === id);
  if (index === -1) return null;

  const updated = normalizeAttribute({
    ...updater(attributes[index]),
    id,
    updated_at: new Date().toISOString(),
  });

  attributes[index] = updated;
  await saveStoredVariantAttributes(attributes);
  return updated;
}

export async function deleteStoredVariantAttribute(id: string): Promise<boolean> {
  const attributes = await getStoredVariantAttributes();
  const nextAttributes = attributes.filter((attribute) => attribute.id !== id);
  if (nextAttributes.length === attributes.length) return false;

  await saveStoredVariantAttributes(nextAttributes);
  return true;
}

export async function addStoredVariantAttributeValue(input: {
  attribute_id: string;
  value: string;
  color_code?: string | null;
  image_url?: string | null;
  display_order?: number;
}): Promise<VariantAttributeValue | null> {
  const updated = await updateStoredVariantAttribute(input.attribute_id, (attribute) => {
    const nextValue = normalizeValue(
      {
        value: input.value,
        color_code: input.color_code ?? null,
        image_url: input.image_url ?? null,
        display_order: input.display_order ?? attribute.values.length,
        is_active: true,
      },
      attribute.id,
      input.display_order ?? attribute.values.length,
    );

    return {
      ...attribute,
      values: [...attribute.values, nextValue],
    };
  });

  return updated?.values.find((value) => value.value === input.value.trim()) ?? null;
}

export async function updateStoredVariantAttributeValue(
  id: string,
  updater: (value: VariantAttributeValue) => VariantAttributeValue,
): Promise<VariantAttributeValue | null> {
  const attributes = await getStoredVariantAttributes();
  let updatedValue: VariantAttributeValue | null = null;

  const nextAttributes = attributes.map((attribute) => {
    const valueIndex = attribute.values.findIndex((value) => value.id === id);
    if (valueIndex === -1) return attribute;

    const nextValues = [...attribute.values];
    updatedValue = normalizeValue(
      {
        ...updater(nextValues[valueIndex]),
        id,
        attribute_id: attribute.id,
      },
      attribute.id,
      nextValues[valueIndex].display_order,
    );
    nextValues[valueIndex] = updatedValue;

    return normalizeAttribute({
      ...attribute,
      values: nextValues,
      updated_at: new Date().toISOString(),
    });
  });

  if (!updatedValue) return null;

  await saveStoredVariantAttributes(nextAttributes);
  return updatedValue;
}

export async function deleteStoredVariantAttributeValue(id: string): Promise<boolean> {
  const attributes = await getStoredVariantAttributes();
  let removed = false;

  const nextAttributes = attributes.map((attribute) => {
    const nextValues = attribute.values.filter((value) => value.id !== id);
    if (nextValues.length !== attribute.values.length) {
      removed = true;
      return normalizeAttribute({
        ...attribute,
        values: nextValues,
        updated_at: new Date().toISOString(),
      });
    }

    return attribute;
  });

  if (!removed) return false;

  await saveStoredVariantAttributes(nextAttributes);
  return true;
}
