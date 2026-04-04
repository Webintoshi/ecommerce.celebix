import {
  createStoredVariantAttribute,
  getStoredVariantAttributes,
  isVariantAttributeTableMissing,
  isVariantAttributeValueTableMissing,
  updateStoredVariantAttribute,
} from "@/lib/db/variant-attributes";

type JsonObject = Record<string, unknown>;

type VariantAttributeValueInput = {
  value: string;
  color_code: string | null;
  image_url: string | null;
  display_order: number;
};

type VariantAttributeInput = {
  name: string;
  slug: string;
  values: VariantAttributeValueInput[];
};

type VariantAttributeRecord = {
  id: string;
  name: string;
  slug: string;
  is_active?: boolean;
  values: VariantAttributeValueRecord[];
};

type VariantAttributeValueRecord = {
  id: string;
  attribute_id: string;
  value: string;
  color_code?: string | null;
  image_url?: string | null;
  display_order?: number;
  is_active?: boolean;
};

const OPTIONAL_ATTRIBUTE_COLUMNS = new Set(["is_active"]);
const OPTIONAL_VALUE_COLUMNS = new Set(["color_code", "image_url", "display_order", "is_active"]);

function toOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/Ä±/g, "i")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/Ä±/g, "i")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function getMissingColumn(error: unknown, table: string): string | null {
  if (!error || typeof error !== "object" || !("message" in error)) return null;
  const message = String(error.message ?? "");

  const schemaCacheMatch = message.match(new RegExp(`Could not find the '([^']+)' column of '${table}'`, "i"));
  if (schemaCacheMatch?.[1]) {
    return schemaCacheMatch[1];
  }

  const relationMatch = message.match(new RegExp(`column [\"']([^\"']+)[\"'] of relation [\"']${table}[\"'] does not exist`, "i"));
  return relationMatch?.[1] ?? null;
}

function stripUnsupportedColumns<T extends Record<string, unknown>>(
  payload: T,
  error: unknown,
  table: string,
  allowedColumns: Set<string>
): T | null {
  const missingColumn = getMissingColumn(error, table);
  if (!missingColumn || !allowedColumns.has(missingColumn) || !(missingColumn in payload)) {
    return null;
  }

  const nextPayload = { ...payload };
  delete nextPayload[missingColumn];
  return nextPayload;
}

function stripUnsupportedColumnsFromArray<T extends Record<string, unknown>>(
  payloads: T[],
  error: unknown,
  table: string,
  allowedColumns: Set<string>
): T[] | null {
  const missingColumn = getMissingColumn(error, table);
  if (!missingColumn || !allowedColumns.has(missingColumn) || !payloads.some((payload) => missingColumn in payload)) {
    return null;
  }

  return payloads.map((payload) => {
    const nextPayload = { ...payload };
    delete nextPayload[missingColumn];
    return nextPayload;
  });
}

function isDefaultVariantValue(value: string): boolean {
  const normalizedValue = normalize(value);
  return normalizedValue === "default title" || normalizedValue === "varsayilan baslik";
}

function normalizeAttributeEntry(attribute: unknown): VariantAttributeValueInput & { name: string; slug: string } | null {
  if (!attribute || typeof attribute !== "object") return null;
  const record = attribute as JsonObject;
  const nestedAttribute = record.attribute && typeof record.attribute === "object" ? (record.attribute as JsonObject) : null;

  const rawName =
    toOptionalString(record.attributeName) ||
    toOptionalString(record.name) ||
    toOptionalString(nestedAttribute?.name) ||
    toOptionalString(record.linked_to);
  const rawValue = toOptionalString(record.value);

  if (!rawName || !rawValue || isDefaultVariantValue(rawValue)) {
    return null;
  }

  return {
    name: rawName,
    slug: toSlug(rawName) || "nitelik",
    value: rawValue,
    color_code: toOptionalString(record.color_code) || toOptionalString(record.colorCode),
    image_url: toOptionalString(record.image_url) || toOptionalString(record.imageUrl),
    display_order: typeof record.display_order === "number" ? record.display_order : typeof record.displayOrder === "number" ? record.displayOrder : 0,
  };
}

function normalizeLegacyVariantAttributeEntry(variant: unknown): VariantAttributeValueInput & { name: string; slug: string } | null {
  if (!variant || typeof variant !== "object") return null;
  const record = variant as JsonObject;

  const rawAttributeName = toOptionalString(record.group_name);
  const rawValue = toOptionalString(record.name);

  if (!rawAttributeName || !rawValue || isDefaultVariantValue(rawValue)) {
    return null;
  }

  const rawImages = Array.isArray(record.images) ? record.images : [];
  const primaryImage = rawImages.find((image): image is string => typeof image === "string" && image.trim().length > 0) ?? null;

  return {
    name: rawAttributeName,
    slug: toSlug(rawAttributeName) || "nitelik",
    value: rawValue,
    color_code: null,
    image_url: primaryImage,
    display_order: 0,
  };
}

function extractVariantAttributeInputs(variants: unknown[]): VariantAttributeInput[] {
  const attributeMap = new Map<string, VariantAttributeInput>();

  variants.forEach((variant) => {
    if (!variant || typeof variant !== "object") return;
    const attributes = Array.isArray((variant as JsonObject).attributes) ? ((variant as JsonObject).attributes as unknown[]) : [];

    attributes.forEach((attribute, index) => {
      const normalizedAttribute = normalizeAttributeEntry(attribute);
      if (!normalizedAttribute) return;

      const attributeKey = normalize(normalizedAttribute.name);
      const existingAttribute = attributeMap.get(attributeKey) ?? {
        name: normalizedAttribute.name,
        slug: normalizedAttribute.slug,
        values: [],
      };

      const valueKey = normalize(normalizedAttribute.value);
      const existingValue = existingAttribute.values.find((value) => normalize(value.value) === valueKey);
      if (!existingValue) {
        existingAttribute.values.push({
          value: normalizedAttribute.value,
          color_code: normalizedAttribute.color_code,
          image_url: normalizedAttribute.image_url,
          display_order: existingAttribute.values.length > 0 ? existingAttribute.values.length : index,
        });
      } else {
        if (!existingValue.color_code && normalizedAttribute.color_code) {
          existingValue.color_code = normalizedAttribute.color_code;
        }
        if (!existingValue.image_url && normalizedAttribute.image_url) {
          existingValue.image_url = normalizedAttribute.image_url;
        }
      }

      attributeMap.set(attributeKey, existingAttribute);
    });

    const legacyAttribute = normalizeLegacyVariantAttributeEntry(variant);
    if (!legacyAttribute) {
      return;
    }

    const attributeKey = normalize(legacyAttribute.name);
    const existingAttribute = attributeMap.get(attributeKey) ?? {
      name: legacyAttribute.name,
      slug: legacyAttribute.slug,
      values: [],
    };

    const valueKey = normalize(legacyAttribute.value);
    const existingValue = existingAttribute.values.find((value) => normalize(value.value) === valueKey);
    if (!existingValue) {
      existingAttribute.values.push({
        value: legacyAttribute.value,
        color_code: legacyAttribute.color_code,
        image_url: legacyAttribute.image_url,
        display_order: existingAttribute.values.length,
      });
    } else if (!existingValue.image_url && legacyAttribute.image_url) {
      existingValue.image_url = legacyAttribute.image_url;
    }

    attributeMap.set(attributeKey, existingAttribute);
  });

  return Array.from(attributeMap.values()).map((attribute) => ({
    ...attribute,
    values: attribute.values.map((value, index) => ({
      ...value,
      display_order: index,
    })),
  }));
}

async function readDatabaseAttributes(supabase: any): Promise<VariantAttributeRecord[] | null> {
  const { data: attributes, error: attributesError } = await supabase.from("variant_attributes").select("*").order("name");
  if (attributesError) {
    if (isVariantAttributeTableMissing(attributesError)) {
      return null;
    }
    throw attributesError;
  }

  const { data: values, error: valuesError } = await supabase
    .from("variant_attribute_values")
    .select("*")
    .order("display_order")
    .order("value");

  if (valuesError) {
    if (isVariantAttributeValueTableMissing(valuesError)) {
      return null;
    }
    throw valuesError;
  }

  const valueMap = new Map<string, VariantAttributeValueRecord[]>();
  (values || []).forEach((value: VariantAttributeValueRecord) => {
    const existingValues = valueMap.get(value.attribute_id) ?? [];
    existingValues.push(value);
    valueMap.set(value.attribute_id, existingValues);
  });

  return (attributes || []).map((attribute: VariantAttributeRecord) => ({
    ...attribute,
    values: (valueMap.get(attribute.id) ?? []).filter((value) => value.is_active !== false),
  }));
}

async function fetchAttributeBySlugOrName(
  supabase: any,
  input: { slug: string; name: string }
): Promise<VariantAttributeRecord | null> {
  const { data: bySlug, error: slugError } = await supabase
    .from("variant_attributes")
    .select("*")
    .eq("slug", input.slug)
    .maybeSingle();

  if (slugError) {
    if (isVariantAttributeTableMissing(slugError)) {
      return null;
    }
    throw slugError;
  }

  if (bySlug) {
    return {
      ...(bySlug as VariantAttributeRecord),
      values: [],
    };
  }

  const { data: byName, error: nameError } = await supabase
    .from("variant_attributes")
    .select("*")
    .eq("name", input.name)
    .maybeSingle();

  if (nameError) {
    if (isVariantAttributeTableMissing(nameError)) {
      return null;
    }
    throw nameError;
  }

  return byName
    ? {
        ...(byName as VariantAttributeRecord),
        values: [],
      }
    : null;
}

async function createDatabaseAttribute(supabase: any, input: VariantAttributeInput): Promise<VariantAttributeRecord> {
  let payload: Record<string, unknown> = {
    name: input.name,
    slug: input.slug,
    is_active: true,
  };

  while (true) {
    const { data, error } = await supabase.from("variant_attributes").insert(payload).select("*").single();
    if (!error) {
      return {
        ...(data as VariantAttributeRecord),
        values: [],
      };
    }

    if (error.code === "23505") {
      const existing = await fetchAttributeBySlugOrName(supabase, input);
      if (existing) {
        return existing;
      }
    }

    const nextPayload = stripUnsupportedColumns(payload, error, "variant_attributes", OPTIONAL_ATTRIBUTE_COLUMNS);
    if (!nextPayload) {
      throw error;
    }

    payload = nextPayload;
  }
}

async function updateDatabaseValue(
  supabase: any,
  id: string,
  patch: Record<string, unknown>
): Promise<void> {
  if (Object.keys(patch).length === 0) return;

  let payload = { ...patch };
  while (true) {
    const { error } = await supabase.from("variant_attribute_values").update(payload).eq("id", id);
    if (!error) {
      return;
    }

    const nextPayload = stripUnsupportedColumns(payload, error, "variant_attribute_values", OPTIONAL_VALUE_COLUMNS);
    if (!nextPayload) {
      throw error;
    }

    payload = nextPayload;
  }
}

async function insertDatabaseValues(
  supabase: any,
  attributeId: string,
  values: VariantAttributeValueInput[]
): Promise<void> {
  if (values.length === 0) return;

  let payloads = values.map((value, index) => ({
    attribute_id: attributeId,
    value: value.value,
    color_code: value.color_code,
    image_url: value.image_url,
    display_order: typeof value.display_order === "number" ? value.display_order : index,
    is_active: true,
  }));

  while (payloads.length > 0) {
    const { error } = await supabase.from("variant_attribute_values").insert(payloads);
    if (!error) {
      return;
    }

    if (error.code === "23505") {
      return;
    }

    const nextPayload = stripUnsupportedColumnsFromArray(
      payloads,
      error,
      "variant_attribute_values",
      OPTIONAL_VALUE_COLUMNS
    );
    if (!nextPayload) {
      throw error;
    }

    payloads = nextPayload;
  }
}

async function syncStoredAttributes(inputs: VariantAttributeInput[]): Promise<void> {
  const existingAttributes = await getStoredVariantAttributes();

  for (const input of inputs) {
    const existingAttribute =
      existingAttributes.find((attribute) => normalize(attribute.slug) === normalize(input.slug)) ||
      existingAttributes.find((attribute) => normalize(attribute.name) === normalize(input.name));

    if (!existingAttribute) {
      const created = await createStoredVariantAttribute({
        name: input.name,
        slug: input.slug,
        values: input.values,
      });
      existingAttributes.push(created);
      continue;
    }

    await updateStoredVariantAttribute(existingAttribute.id, (currentAttribute) => {
      const nextValues = [...currentAttribute.values];
      let mutated = false;

      input.values.forEach((incomingValue, index) => {
        const existingValueIndex = nextValues.findIndex((value) => normalize(value.value) === normalize(incomingValue.value));
        if (existingValueIndex === -1) {
          nextValues.push({
            id: crypto.randomUUID(),
            attribute_id: currentAttribute.id,
            value: incomingValue.value,
            color_code: incomingValue.color_code,
            image_url: incomingValue.image_url,
            display_order: nextValues.length > 0 ? nextValues.length : index,
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          mutated = true;
          return;
        }

        const existingValue = nextValues[existingValueIndex];
        const nextValue = {
          ...existingValue,
          color_code: existingValue.color_code || incomingValue.color_code,
          image_url: existingValue.image_url || incomingValue.image_url,
          updated_at:
            (!existingValue.color_code && incomingValue.color_code) || (!existingValue.image_url && incomingValue.image_url)
              ? new Date().toISOString()
              : existingValue.updated_at,
        };

        if (
          nextValue.color_code !== existingValue.color_code ||
          nextValue.image_url !== existingValue.image_url
        ) {
          nextValues[existingValueIndex] = nextValue;
          mutated = true;
        }
      });

      if (!mutated) {
        return currentAttribute;
      }

      return {
        ...currentAttribute,
        values: nextValues,
      };
    });
  }
}

async function syncDatabaseAttributes(supabase: any, inputs: VariantAttributeInput[]): Promise<void> {
  const existingAttributes = (await readDatabaseAttributes(supabase)) ?? [];

  for (const input of inputs) {
    let existingAttribute =
      existingAttributes.find((attribute) => normalize(attribute.slug) === normalize(input.slug)) ||
      existingAttributes.find((attribute) => normalize(attribute.name) === normalize(input.name));

    if (!existingAttribute) {
      existingAttribute = await createDatabaseAttribute(supabase, input);
      existingAttribute.values = [];
      existingAttributes.push(existingAttribute);
    }

    const existingValues = Array.isArray(existingAttribute.values) ? existingAttribute.values : [];
    const valuesToInsert: VariantAttributeValueInput[] = [];

    for (const incomingValue of input.values) {
      const existingValue = existingValues.find((value) => normalize(value.value) === normalize(incomingValue.value));
      if (!existingValue) {
        valuesToInsert.push(incomingValue);
        continue;
      }

      const patch: Record<string, unknown> = {};
      if (!existingValue.color_code && incomingValue.color_code) {
        patch.color_code = incomingValue.color_code;
      }
      if (!existingValue.image_url && incomingValue.image_url) {
        patch.image_url = incomingValue.image_url;
      }
      if (Object.keys(patch).length > 0) {
        await updateDatabaseValue(supabase, existingValue.id, patch);
      }
    }

    await insertDatabaseValues(supabase, existingAttribute.id, valuesToInsert);
  }
}

export async function syncVariantAttributeRegistryFromVariants(supabase: any, variants: unknown[]): Promise<void> {
  const inputs = extractVariantAttributeInputs(variants);
  if (inputs.length === 0) return;

  const existingAttributes = await readDatabaseAttributes(supabase);
  if (existingAttributes === null) {
    await syncStoredAttributes(inputs);
    return;
  }

  await syncDatabaseAttributes(supabase, inputs);
}

export async function backfillVariantAttributeRegistryFromCatalog(supabase: any): Promise<void> {
  const { data, error } = await supabase.from("product_variants").select("attributes,name,group_name,images");
  if (error) {
    const missingColumn = getMissingColumn(error, "product_variants");
    if (missingColumn === "group_name" || missingColumn === "images") {
      const fallbackResult = await supabase.from("product_variants").select("attributes,name,group_name");
      if (fallbackResult.error) {
        const fallbackMissingColumn = getMissingColumn(fallbackResult.error, "product_variants");
        if (fallbackMissingColumn === "group_name") {
          const attributesOnlyResult = await supabase.from("product_variants").select("attributes");
          if (attributesOnlyResult.error) {
            const finalMissingColumn = getMissingColumn(attributesOnlyResult.error, "product_variants");
            if (finalMissingColumn === "attributes") {
              return;
            }
            throw attributesOnlyResult.error;
          }

          const variants = (attributesOnlyResult.data || []).map((row: { attributes?: unknown[] }) => ({
            attributes: Array.isArray(row.attributes) ? row.attributes : [],
          }));

          await syncVariantAttributeRegistryFromVariants(supabase, variants);
          return;
        }
        throw fallbackResult.error;
      }

      const variants = (fallbackResult.data || []).map((row: { attributes?: unknown[]; name?: string; group_name?: string }) => ({
        attributes: Array.isArray(row.attributes) ? row.attributes : [],
        name: row.name,
        group_name: row.group_name,
      }));

      await syncVariantAttributeRegistryFromVariants(supabase, variants);
      return;
    }
    if (missingColumn === "attributes") {
      return;
    }
    throw error;
  }

  const variants = (data || []).map((row: { attributes?: unknown[]; name?: string; group_name?: string; images?: unknown[] }) => ({
    attributes: Array.isArray(row.attributes) ? row.attributes : [],
    name: row.name,
    group_name: row.group_name,
    images: Array.isArray(row.images) ? row.images : [],
  }));

  await syncVariantAttributeRegistryFromVariants(supabase, variants);
}
