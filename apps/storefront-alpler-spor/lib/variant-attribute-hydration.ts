import { getSetting } from "@/lib/db/settings";
import { createServerClient } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";

type JsonObject = Record<string, unknown>;

type HydratableVariant = {
  name?: string | null;
  group_name?: string | null;
  groupName?: string | null;
  attributes?: unknown[];
  raw_attributes?: unknown[];
};

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

function isColorGroupName(value: unknown) {
  const normalized = toOptionalString(value)?.toLocaleLowerCase("tr") ?? "";
  return (
    normalized.includes("renk") ||
    normalized.includes("color") ||
    normalized.includes("colour")
  );
}

function createPrivilegedServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return null;
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function normalizeStoredRegistryPayload(
  registry: { attributes?: unknown[] } | null,
): RegistryAttribute[] {
  const rawAttributes = Array.isArray(registry?.attributes) ? registry.attributes : [];

  return rawAttributes
    .map((attribute) => {
      const record = attribute && typeof attribute === "object" ? (attribute as JsonObject) : null;
      if (!record) {
        return null;
      }

      const values = Array.isArray(record.values)
        ? record.values
            .map((value) => {
              const valueRecord = value && typeof value === "object" ? (value as JsonObject) : null;
              const normalizedValue = toOptionalString(valueRecord?.value);
              const id = toOptionalString(valueRecord?.id);
              const attributeId = toOptionalString(valueRecord?.attribute_id) || toOptionalString(record.id);
              if (!valueRecord || !normalizedValue || !id || !attributeId || valueRecord.is_active === false) {
                return null;
              }

              return {
                id,
                attribute_id: attributeId,
                value: normalizedValue,
                display_order:
                  typeof valueRecord.display_order === "number" ? valueRecord.display_order : null,
                color_code: toOptionalString(valueRecord.color_code),
                image_url: toOptionalString(valueRecord.image_url),
              };
            })
            .filter((value): value is RegistryValue => Boolean(value))
        : [];

      const id = toOptionalString(record.id);
      const name = toOptionalString(record.name);
      if (!id || !name || record.is_active === false) {
        return null;
      }

      return {
        id,
        name,
        values,
      };
    })
    .filter((attribute): attribute is RegistryAttribute => Boolean(attribute));
}

async function readRegistryFromClient(
  supabase: ReturnType<typeof createServerClient> | ReturnType<typeof createPrivilegedServerClient>,
) {
  if (!supabase) {
    return null;
  }

  const { data: attributes, error: attributesError } = await supabase.from("variant_attributes").select("id,name");

  if (!attributesError) {
    const { data: values, error: valuesError } = await supabase
      .from("variant_attribute_values")
      .select("id,attribute_id,value,display_order,color_code,image_url,is_active")
      .order("display_order")
      .order("value");

    if (!valuesError) {
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
  }

  const { data: settingRow, error: settingsError } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "variant_attributes_registry")
    .maybeSingle();

  if (settingsError) {
    return null;
  }

  return normalizeStoredRegistryPayload(
    (settingRow?.value as { attributes?: unknown[] } | null) ?? null,
  );
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
      const currentMatches = byValue.get(normalizedValue) ?? [];
      currentMatches.push(match);
      byValue.set(normalizedValue, currentMatches);
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
  const rawValueId = toOptionalString(entry.valueId) || toOptionalString(entry.attribute_value_id) || toOptionalString(entry.id);
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

function buildHydratedAttribute(entry: JsonObject, match: RegistryMatch): JsonObject {
  const colorCode = match.value.color_code ?? null;
  const imageUrl = match.value.image_url ?? null;

  return {
    ...entry,
    id: toOptionalString(entry.id) ?? match.value.id,
    valueId: match.value.id,
    attribute_value_id: match.value.id,
    attributeId: match.attribute.id,
    attribute_id: match.attribute.id,
    attributeName: match.attribute.name,
    name: match.attribute.name,
    linked_to: toOptionalString(entry.linked_to) ?? match.attribute.name,
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

function dedupeAttributes(attributes: JsonObject[]) {
  const seen = new Set<string>();

  return attributes.filter((attribute) => {
    const rawValue = toOptionalString(attribute.value);
    if (!rawValue) {
      return false;
    }

    const rawAttributeName =
      toOptionalString(attribute.attributeName) ||
      toOptionalString(attribute.name) ||
      (attribute.attribute && typeof attribute.attribute === "object"
        ? toOptionalString((attribute.attribute as JsonObject).name)
        : null) ||
      "secenek";

    const key = `${normalizeToken(rawAttributeName)}:${normalizeToken(rawValue)}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export async function getVariantAttributeRegistry(): Promise<RegistryAttribute[]> {
  const registryFromServerClient = await readRegistryFromClient(createServerClient());
  if (registryFromServerClient && registryFromServerClient.length > 0) {
    return registryFromServerClient;
  }

  const settingsRegistry = await getSetting("variant_attributes_registry");
  const normalizedSettingsRegistry = normalizeStoredRegistryPayload(
    (settingsRegistry as { attributes?: unknown[] } | null) ?? null,
  );
  if (normalizedSettingsRegistry.length > 0) {
    return normalizedSettingsRegistry;
  }

  const privilegedRegistry = await readRegistryFromClient(createPrivilegedServerClient());
  return privilegedRegistry ?? [];
}

export function hydrateVariantAttributes(rawAttributes: unknown[], registry: RegistryAttribute[]): JsonObject[] {
  if (!Array.isArray(rawAttributes) || rawAttributes.length === 0 || registry.length === 0) {
    return [];
  }

  const indexes = createRegistryIndexes(registry);
  const hydrated = rawAttributes
    .map((attribute) => {
      const entry = attribute && typeof attribute === "object" ? (attribute as JsonObject) : null;
      if (!entry) {
        return null;
      }

      const match = findRegistryMatch(entry, indexes);
      if (!match) {
        return entry;
      }

      return buildHydratedAttribute(entry, match);
    })
    .filter((attribute): attribute is JsonObject => Boolean(attribute));

  return dedupeAttributes(hydrated);
}

export function inferVariantAttributesFromName(variantName: string, registry: RegistryAttribute[]): JsonObject[] {
  const normalizedName = normalizeToken(variantName);
  if (!normalizedName || registry.length === 0) {
    return [];
  }

  for (const attribute of registry) {
    for (const value of attribute.values) {
      if (normalizeToken(value.value) !== normalizedName) {
        continue;
      }

      return [
        {
          id: value.id,
          valueId: value.id,
          attribute_value_id: value.id,
          attributeId: attribute.id,
          attribute_id: attribute.id,
          attributeName: attribute.name,
          name: attribute.name,
          linked_to: attribute.name,
          value: value.value,
          displayOrder: value.display_order ?? null,
          display_order: value.display_order ?? null,
          colorCode: value.color_code ?? null,
          color_code: value.color_code ?? null,
          imageUrl: value.image_url ?? null,
          image_url: value.image_url ?? null,
          attribute: {
            id: attribute.id,
            name: attribute.name,
          },
        },
      ];
    }
  }

  return [];
}

export function hydrateProductVariantSnapshots<T extends HydratableVariant>(
  variants: T[],
  registry: RegistryAttribute[],
): Array<T & { attributes: JsonObject[]; raw_attributes: JsonObject[] }> {
  if (!Array.isArray(variants) || variants.length === 0) {
    return [];
  }

  return variants.map((variant) => {
    const rawAttributes = Array.isArray(variant.raw_attributes)
      ? variant.raw_attributes
      : Array.isArray(variant.attributes)
        ? variant.attributes
        : [];

    let attributes = hydrateVariantAttributes(rawAttributes, registry);

    if (
      attributes.length === 0 &&
      (isColorGroupName(variant.group_name) || isColorGroupName(variant.groupName))
    ) {
      attributes = inferVariantAttributesFromName(variant.name || "", registry);
    }

    return {
      ...variant,
      attributes,
      raw_attributes: rawAttributes as JsonObject[],
    };
  });
}
