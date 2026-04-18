type VariantRecord = {
  stock?: number | null;
  attributes?: unknown;
  raw_attributes?: unknown;
};

export type OrderedVariantAttributeValue = {
  key: string;
  value: string;
  image_url?: string | null;
  color_code?: string | null;
  variantIndex: number;
  displayOrder: number;
  sourceIndex: number;
};

export type OrderedVariantAttributeGroup = {
  id: string;
  name: string;
  groupOrder: number;
  values: OrderedVariantAttributeValue[];
};

export type ProductCardSwatch = {
  key: string;
  value: string;
  image_url?: string | null;
  color_code?: string | null;
};

function toOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function getAttributeId(attribute: Record<string, unknown>, fallbackIndex: number): string {
  const nestedAttribute =
    attribute.attribute && typeof attribute.attribute === "object"
      ? (attribute.attribute as Record<string, unknown>)
      : null;

  return (
    toOptionalString(attribute.attributeId) ||
    toOptionalString(attribute.attribute_id) ||
    toOptionalString(nestedAttribute?.id) ||
    toOptionalString(attribute.name) ||
    `attribute-${fallbackIndex}`
  );
}

function getAttributeName(attribute: Record<string, unknown>): string {
  const nestedAttribute =
    attribute.attribute && typeof attribute.attribute === "object"
      ? (attribute.attribute as Record<string, unknown>)
      : null;

  return (
    toOptionalString(attribute.attributeName) ||
    toOptionalString(attribute.name) ||
    toOptionalString(nestedAttribute?.name) ||
    "Seçenek"
  );
}

function getValueKey(attribute: Record<string, unknown>, value: string, fallbackIndex: number): string {
  return (
    toOptionalString(attribute.valueId) ||
    toOptionalString(attribute.attribute_value_id) ||
    toOptionalString(attribute.id) ||
    `${value}-${fallbackIndex}`
  );
}

function getDisplayOrder(attribute: Record<string, unknown>, fallbackOrder: number): number {
  const rawDisplayOrder = attribute.display_order ?? attribute.displayOrder;
  return typeof rawDisplayOrder === "number" ? rawDisplayOrder : Number.MAX_SAFE_INTEGER - 1 + fallbackOrder;
}

function hasDisplayableValue(attribute: Record<string, unknown>) {
  return Boolean(toOptionalString(attribute.value));
}

function normalizeAttributeRecord(
  attribute: Record<string, unknown>,
  fallbackKey?: string,
): Record<string, unknown> | null {
  const nestedAttribute =
    attribute.attribute && typeof attribute.attribute === "object"
      ? (attribute.attribute as Record<string, unknown>)
      : null;
  const name =
    toOptionalString(attribute.attributeName) ||
    toOptionalString(attribute.attribute_name) ||
    toOptionalString(attribute.name) ||
    toOptionalString(attribute.key) ||
    toOptionalString(attribute.code) ||
    toOptionalString(attribute.linked_to) ||
    toOptionalString(nestedAttribute?.name) ||
    fallbackKey ||
    "Seçenek";
  const value =
    toOptionalString(attribute.value) ||
    toOptionalString(attribute.label) ||
    toOptionalString(attribute.displayValue) ||
    toOptionalString(attribute.text);

  if (!value) {
    return null;
  }

  const attributeId =
    toOptionalString(attribute.attributeId) ||
    toOptionalString(attribute.attribute_id) ||
    toOptionalString(nestedAttribute?.id) ||
    name;
  const valueId =
    toOptionalString(attribute.valueId) ||
    toOptionalString(attribute.attribute_value_id) ||
    toOptionalString(attribute.id) ||
    `${attributeId}-${value}`;
  const colorCode =
    toOptionalString(attribute.color_code) || toOptionalString(attribute.colorCode);
  const imageUrl =
    toOptionalString(attribute.image_url) || toOptionalString(attribute.imageUrl);

  return {
    ...attribute,
    id: valueId,
    valueId: valueId,
    attribute_value_id: valueId,
    attributeId,
    attribute_id: attributeId,
    attributeName: name,
    attribute_name: name,
    name,
    linked_to: toOptionalString(attribute.linked_to) || name,
    value,
    color_code: colorCode,
    colorCode,
    image_url: imageUrl,
    imageUrl,
    attribute:
      nestedAttribute || {
        id: attributeId,
        name,
      },
  };
}

export function normalizeVariantAttributeEntries(attributes: unknown): Record<string, unknown>[] {
  if (Array.isArray(attributes)) {
    return attributes
      .map((attribute) => {
        if (!attribute || typeof attribute !== "object") {
          return null;
        }

        return normalizeAttributeRecord(attribute as Record<string, unknown>);
      })
      .filter((attribute): attribute is Record<string, unknown> => Boolean(attribute));
  }

  if (attributes && typeof attributes === "object") {
    return Object.entries(attributes as Record<string, unknown>)
      .map(([key, value]) => {
        const normalizedValue = toOptionalString(value);
        if (!normalizedValue) {
          return null;
        }

        return normalizeAttributeRecord(
          {
            key,
            name: key,
            attributeName: key,
            value: normalizedValue,
          },
          key,
        );
      })
      .filter((attribute): attribute is Record<string, unknown> => Boolean(attribute));
  }

  return [];
}

function getVariantAttributes(variant: VariantRecord) {
  const normalizedAttributes = normalizeVariantAttributeEntries(variant.attributes);
  if (normalizedAttributes.length > 0) {
    return normalizedAttributes.filter(hasDisplayableValue);
  }

  return normalizeVariantAttributeEntries(variant.raw_attributes).filter(hasDisplayableValue);
}

export function getOrderedVariantAttributeGroups(
  variants: VariantRecord[],
): OrderedVariantAttributeGroup[] {
  const groupMap = new Map<string, OrderedVariantAttributeGroup>();
  let sourceIndex = 0;

  variants.forEach((variant, variantIndex) => {
    const attributes = getVariantAttributes(variant);

    attributes.forEach((attribute, attributeIndex) => {
      const record =
        attribute && typeof attribute === "object" ? (attribute as Record<string, unknown>) : null;
      if (!record) return;

      const value = toOptionalString(record.value);
      if (!value) return;

      const attributeId = getAttributeId(record, attributeIndex);
      const attributeName = getAttributeName(record);
      const existingGroup = groupMap.get(attributeId);
      const group: OrderedVariantAttributeGroup =
        existingGroup ??
        {
          id: attributeId,
          name: attributeName,
          groupOrder: attributeIndex,
          values: [],
        };

      group.groupOrder = Math.min(group.groupOrder, attributeIndex);
      group.name = attributeName;

      const valueKey = getValueKey(record, value, attributeIndex);
      const existingValue = group.values.find((entry) => entry.key === valueKey);
      const displayOrder = getDisplayOrder(record, group.values.length);

      if (!existingValue) {
        group.values.push({
          key: valueKey,
          value,
          image_url: toOptionalString(record.image_url),
          color_code: toOptionalString(record.color_code),
          variantIndex,
          displayOrder,
          sourceIndex,
        });
      } else {
        existingValue.displayOrder = Math.min(existingValue.displayOrder, displayOrder);
        existingValue.sourceIndex = Math.min(existingValue.sourceIndex, sourceIndex);
        existingValue.image_url = existingValue.image_url || toOptionalString(record.image_url);
        existingValue.color_code = existingValue.color_code || toOptionalString(record.color_code);
      }

      sourceIndex += 1;
      groupMap.set(attributeId, group);
    });
  });

  return Array.from(groupMap.values())
    .map((group) => ({
      ...group,
      values: [...group.values].sort(
        (left, right) =>
          left.displayOrder - right.displayOrder ||
          left.sourceIndex - right.sourceIndex ||
          left.value.localeCompare(right.value, "tr"),
      ),
    }))
    .sort(
      (left, right) =>
        left.groupOrder - right.groupOrder || left.name.localeCompare(right.name, "tr"),
    );
}

export function findPreferredVariantIndex(variants: VariantRecord[]): number {
  if (!Array.isArray(variants) || variants.length === 0) {
    return 0;
  }

  const groups = getOrderedVariantAttributeGroups(variants);
  if (groups.length === 0 || groups[0].values.length === 0) {
    return 0;
  }

  const preferredGroup = groups.find(isVisualAttributeGroup) ?? groups[0];
  const preferredValue = preferredGroup.values[0];

  return preferredValue?.variantIndex ?? 0;
}

function isVisualAttributeGroup(group: OrderedVariantAttributeGroup) {
  const lowerName = group.name.toLowerCase();
  const nameSuggestsColor =
    lowerName.includes("renk") || lowerName.includes("color") || lowerName.includes("rengi");

  return nameSuggestsColor || group.values.some((value) => value.image_url || value.color_code);
}

export function getProductCardSwatches(variants: VariantRecord[], maxCount = 4): ProductCardSwatch[] {
  if (!Array.isArray(variants) || variants.length === 0) {
    return [];
  }

  const groups = getOrderedVariantAttributeGroups(variants);
  const swatchGroup = groups.find(isVisualAttributeGroup);
  if (!swatchGroup) {
    return [];
  }

  return swatchGroup.values.slice(0, maxCount).map((value) => ({
    key: value.key,
    value: value.value,
    image_url: value.image_url ?? null,
    color_code: value.color_code ?? null,
  }));
}
