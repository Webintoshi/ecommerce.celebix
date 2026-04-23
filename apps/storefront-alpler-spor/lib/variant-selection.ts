type VariantRecord = {
  name?: string | null;
  group_name?: string | null;
  groupName?: string | null;
  stock?: number | null;
  attributes?: Array<Record<string, unknown>>;
  raw_attributes?: Array<Record<string, unknown>>;
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

type InferredAttributeKind = "number" | "size" | "generic";

type InferredAttributeDescriptor = {
  name: string;
  kind: InferredAttributeKind;
};

const GENERIC_VARIANT_NAME_TOKENS = new Set([
  "default",
  "defaulttitle",
  "tekvaryant",
  "standart",
  "varsayilan",
  "varyant",
]);

function getStoredVariantAttributes(variant: VariantRecord) {
  if (Array.isArray(variant.attributes)) {
    return variant.attributes;
  }

  if (Array.isArray(variant.raw_attributes)) {
    return variant.raw_attributes;
  }

  return [];
}

function getMeaningfulVariantName(value: unknown) {
  const normalized = toOptionalString(value);
  if (!normalized) {
    return null;
  }

  const token = normalized
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");

  if (GENERIC_VARIANT_NAME_TOKENS.has(token)) {
    return null;
  }

  return normalized;
}

function isNumericLikeVariantValue(value: string) {
  return /^(?:eu|us|uk)?\s*\d{1,3}(?:[.,]\d+)?$/i.test(value.trim());
}

function isSizeLikeVariantValue(value: string) {
  const token = value.trim().toLowerCase().replace(/\s+/g, "");
  return [
    "xxs",
    "xs",
    "s",
    "m",
    "l",
    "xl",
    "xxl",
    "xxxl",
    "2xl",
    "3xl",
    "4xl",
    "5xl",
  ].includes(token);
}

function getInferredAttributeDescriptor(variants: VariantRecord[]): InferredAttributeDescriptor {
  const explicitGroupName = variants
    .map((variant) => toOptionalString(variant.group_name) || toOptionalString(variant.groupName))
    .find((value): value is string => Boolean(value));

  if (explicitGroupName) {
    return { name: explicitGroupName, kind: "generic" };
  }

  const names = variants
    .map((variant) => getMeaningfulVariantName(variant.name))
    .filter((value): value is string => Boolean(value));

  if (names.length === 0) {
    return { name: "Secenek", kind: "generic" };
  }

  const numericLikeCount = names.filter(isNumericLikeVariantValue).length;
  const sizeLikeCount = names.filter(isSizeLikeVariantValue).length;
  const majorityThreshold = Math.max(2, Math.ceil(names.length / 2));

  if (numericLikeCount >= majorityThreshold) {
    return { name: "Numara", kind: "number" };
  }

  if (sizeLikeCount >= majorityThreshold) {
    return { name: "Beden", kind: "size" };
  }

  return { name: "Secenek", kind: "generic" };
}

export function getResolvedVariantAttributes(
  variant: VariantRecord,
  allVariants: VariantRecord[] = [],
) {
  const storedAttributes = getStoredVariantAttributes(variant);
  if (storedAttributes.length > 0) {
    return storedAttributes;
  }

  const inferredValue = getMeaningfulVariantName(variant.name);
  if (!inferredValue) {
    return [];
  }

  const descriptor = getInferredAttributeDescriptor(allVariants.length > 0 ? allVariants : [variant]);

  if (descriptor.kind === "number" && !isNumericLikeVariantValue(inferredValue)) {
    return [];
  }

  if (descriptor.kind === "size" && !isSizeLikeVariantValue(inferredValue)) {
    return [];
  }

  const attributeId = descriptor.name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  const valueId = `${attributeId}-${inferredValue
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")}`;

  return [
    {
      id: valueId,
      valueId,
      attribute_value_id: valueId,
      attributeId,
      attribute_id: attributeId,
      attributeName: descriptor.name,
      name: descriptor.name,
      value: inferredValue,
      displayOrder: 0,
      display_order: 0,
      attribute: {
        id: attributeId,
        name: descriptor.name,
      },
    },
  ];
}

export function getOrderedVariantAttributeGroups(
  variants: VariantRecord[],
): OrderedVariantAttributeGroup[] {
  const groupMap = new Map<string, OrderedVariantAttributeGroup>();
  let sourceIndex = 0;

  variants.forEach((variant, variantIndex) => {
    const attributes = getResolvedVariantAttributes(variant, variants);

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
  const preferredValue =
    preferredGroup.values.find(
      (value) =>
        isNumericLikeVariantValue(value.value) || isSizeLikeVariantValue(value.value),
    ) ?? preferredGroup.values[0];

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
