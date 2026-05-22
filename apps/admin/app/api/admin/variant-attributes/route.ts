import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  createStoredVariantAttribute,
  deleteStoredVariantAttribute,
  getStoredVariantAttributeById,
  getStoredVariantAttributes,
  isVariantAttributeTableMissing,
  isVariantAttributeValueTableMissing,
  updateStoredVariantAttribute,
} from "@/lib/db/variant-attributes";
import { backfillVariantAttributeRegistryFromCatalog } from "@/lib/variant-attribute-sync";
import {
  removeCatalogVariantAttributeSnapshots,
  syncCatalogVariantAttributeSnapshots,
  syncStoredVariantAttributeRegistrySnapshot,
} from "@/lib/variant-attribute-catalog-sync";
import { resolveAdminAssetUrl } from "@/lib/asset-url";
import { isIgnoredLegacyVariantAttributeName } from "@/lib/variant-attribute-legacy";
import { normalizeVisibleText } from "@/lib/text-encoding";

const OPTIONAL_ATTRIBUTE_COLUMNS = new Set(["is_active"]);
const OPTIONAL_VALUE_COLUMNS = new Set(["color_code", "image_url", "display_order", "is_active"]);

type VariantValueInput =
  | string
  | {
      value?: string;
      color_code?: string | null;
      colorCode?: string | null;
      image_url?: string | null;
      imageUrl?: string | null;
      display_order?: number;
      displayOrder?: number;
      is_active?: boolean;
      isActive?: boolean;
    };

function getMissingColumn(error: unknown, table: string): string | null {
  if (!error || typeof error !== "object" || !("message" in error)) return null;
  const message = String(error.message ?? "");
  const match = message.match(new RegExp(`Could not find the '([^']+)' column of '${table}'`, "i"));
  return match?.[1] ?? null;
}

function stripUnsupportedColumns<T extends Record<string, unknown>>(
  payload: T,
  error: unknown,
  table: string,
  allowedColumns: Set<string>,
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
  allowedColumns: Set<string>,
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

function normalizeValue(value: Record<string, unknown>) {
  const resolvedImageUrl = resolveAdminAssetUrl(
    typeof value.image_url === "string" ? value.image_url : null,
  );

  return {
    ...value,
    value: normalizeVisibleText(value.value, { collapseWhitespace: true }),
    color_code: typeof value.color_code === "string" ? value.color_code : null,
    image_url: resolvedImageUrl || null,
    display_order: typeof value.display_order === "number" ? value.display_order : 0,
    is_active: value.is_active !== false,
  };
}

function normalizeAttribute(attribute: Record<string, unknown>) {
  const values = Array.isArray(attribute.values)
    ? attribute.values
        .map((value) => normalizeValue((value ?? {}) as Record<string, unknown>))
        .filter((value) => value.is_active !== false)
        .sort((left, right) => left.display_order - right.display_order || left.value.localeCompare(right.value, "tr"))
    : [];

  return {
    ...attribute,
    slug:
      typeof attribute.slug === "string" && attribute.slug.trim().length > 0
        ? attribute.slug
        : normalizeVisibleText(attribute.name || "nitelik", { collapseWhitespace: true })
            .toLowerCase()
            .replace(/[^\w\s-]/g, "")
            .replace(/\s+/g, "-"),
    is_active: attribute.is_active !== false,
    values,
  };
}

async function purgeIgnoredVariantAttributes(supabase: ReturnType<typeof createServerClient>) {
  const storedAttributes = await getStoredVariantAttributes();
  const ignoredStoredAttributes = storedAttributes.filter((attribute) =>
    isIgnoredLegacyVariantAttributeName(attribute.name),
  );

  for (const attribute of ignoredStoredAttributes) {
    await deleteStoredVariantAttribute(attribute.id);
    try {
      await removeCatalogVariantAttributeSnapshots(supabase, {
        attributeId: attribute.id,
        attributeName: attribute.name,
        attributeSlug: attribute.slug,
      });
    } catch (cleanupError) {
      logCatalogVariantSyncError(cleanupError, "purge:stored");
    }
  }

  const { data, error } = await supabase
    .from("variant_attributes")
    .select("id,name,slug,is_active");

  if (error) {
    if (isVariantAttributeTableMissing(error) || isVariantAttributeValueTableMissing(error)) {
      return;
    }
    throw error;
  }

  const ignoredDatabaseAttributes = (data || []).filter((attribute: Record<string, unknown>) => (
    attribute.is_active !== false &&
    isIgnoredLegacyVariantAttributeName(typeof attribute.name === "string" ? attribute.name : null)
  ));

  for (const attribute of ignoredDatabaseAttributes) {
    const attributeId = String(attribute.id || "");
    if (!attributeId) continue;

    const { error: softDeleteError } = await supabase
      .from("variant_attributes")
      .update({ is_active: false })
      .eq("id", attributeId);

    if (softDeleteError && getMissingColumn(softDeleteError, "variant_attributes") === "is_active") {
      const { error: deleteValuesError } = await supabase
        .from("variant_attribute_values")
        .delete()
        .eq("attribute_id", attributeId);
      if (deleteValuesError && !isVariantAttributeValueTableMissing(deleteValuesError)) {
        throw deleteValuesError;
      }

      const { error: hardDeleteError } = await supabase
        .from("variant_attributes")
        .delete()
        .eq("id", attributeId);
      if (hardDeleteError && !isVariantAttributeTableMissing(hardDeleteError)) {
        throw hardDeleteError;
      }
    } else if (softDeleteError) {
      throw softDeleteError;
    }

    await deleteStoredVariantAttribute(attributeId);
    try {
      await removeCatalogVariantAttributeSnapshots(supabase, {
        attributeId,
        attributeName: typeof attribute.name === "string" ? attribute.name : null,
        attributeSlug: typeof attribute.slug === "string" ? attribute.slug : null,
      });
    } catch (cleanupError) {
      logCatalogVariantSyncError(cleanupError, "purge:database");
    }
  }
}

function isVariantAttributeRelationshipMissing(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("message" in error)) return false;
  const message = String(error.message ?? "");
  return /Could not find a relationship between 'variant_attributes' and 'variant_attribute_values' in the schema cache/i.test(
    message,
  );
}

function logCatalogVariantSyncError(error: unknown, context: string) {
  console.error(`Variant attribute catalog snapshot sync failed (${context}):`, error);
}

function normalizeIncomingValue(input: VariantValueInput, index: number) {
  if (typeof input === "string") {
    return {
      value: normalizeVisibleText(input, { collapseWhitespace: true }),
      color_code: null,
      image_url: null,
      display_order: index,
      is_active: true,
    };
  }

  const rawValue = normalizeVisibleText(input?.value, { collapseWhitespace: true });

  return {
    value: rawValue,
    color_code:
      typeof input?.color_code === "string"
        ? input.color_code
        : typeof input?.colorCode === "string"
          ? input.colorCode
          : null,
    image_url:
      typeof input?.image_url === "string"
        ? input.image_url
        : typeof input?.imageUrl === "string"
          ? input.imageUrl
          : null,
    display_order:
      typeof input?.display_order === "number"
        ? input.display_order
        : typeof input?.displayOrder === "number"
          ? input.displayOrder
          : index,
    is_active:
      typeof input?.is_active === "boolean"
        ? input.is_active
        : typeof input?.isActive === "boolean"
          ? input.isActive
          : true,
  };
}

function extractIncomingValues(
  values: VariantValueInput[],
  colorCodes: Record<string, string> = {},
  imageUrls: Record<string, string> = {},
) {
  return values
    .map((value, index) => normalizeIncomingValue(value, index))
    .map((value) => ({
      ...value,
      color_code: value.color_code || colorCodes[value.value] || null,
      image_url: value.image_url || imageUrls[value.value] || null,
    }))
    .filter((value) => value.value.length > 0);
}

async function fetchAttributeWithValues(id: string) {
  const supabase = createServerClient();
  const joinedResult = await supabase
    .from("variant_attributes")
    .select(`
      *,
      values:variant_attribute_values(*)
    `)
    .eq("id", id)
    .single();

  if (!joinedResult.error) {
    return normalizeAttribute((joinedResult.data ?? {}) as Record<string, unknown>);
  }

  if (!isVariantAttributeRelationshipMissing(joinedResult.error)) {
    throw joinedResult.error;
  }

  const { data: attribute, error: attributeError } = await supabase
    .from("variant_attributes")
    .select("*")
    .eq("id", id)
    .single();

  if (attributeError) {
    if (isVariantAttributeTableMissing(attributeError) || isVariantAttributeValueTableMissing(attributeError)) {
      const storedAttribute = await getStoredVariantAttributeById(id);
      if (!storedAttribute) {
        return null;
      }
      return normalizeAttribute((storedAttribute ?? {}) as Record<string, unknown>);
    }
    throw attributeError;
  }

  const { data: values, error: valuesError } = await supabase
    .from("variant_attribute_values")
    .select("*")
    .eq("attribute_id", id)
    .order("display_order")
    .order("value");

  if (valuesError) {
    if (isVariantAttributeValueTableMissing(valuesError) || isVariantAttributeTableMissing(valuesError)) {
      const storedAttribute = await getStoredVariantAttributeById(id);
      if (!storedAttribute) {
        return null;
      }
      return normalizeAttribute((storedAttribute ?? {}) as Record<string, unknown>);
    }
    throw valuesError;
  }

  return normalizeAttribute({
    ...((attribute ?? {}) as Record<string, unknown>),
    values: values ?? [],
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const withValues = searchParams.get("withValues") === "true";
    const id = searchParams.get("id");
    const supabase = createServerClient();

    await purgeIgnoredVariantAttributes(supabase);

    if (id) {
      try {
        const attribute = await fetchAttributeWithValues(id);
        if (attribute && isIgnoredLegacyVariantAttributeName(typeof attribute.name === "string" ? attribute.name : null)) {
          return NextResponse.json({ success: false, error: "Nitelik bulunamadı" }, { status: 404 });
        }
        if (!attribute) {
          return NextResponse.json({ success: false, error: "Nitelik bulunamadı" }, { status: 404 });
        }
        return NextResponse.json({ success: true, attribute });
      } catch (error: any) {
        if (isVariantAttributeTableMissing(error) || isVariantAttributeValueTableMissing(error)) {
          try {
            await backfillVariantAttributeRegistryFromCatalog(supabase);
          } catch (backfillError) {
            console.error("Error backfilling variant attributes from catalog:", backfillError);
          }
          const attribute = await getStoredVariantAttributeById(id);
          if (!attribute) {
            return NextResponse.json({ success: false, error: "Nitelik bulunamadı" }, { status: 404 });
          }
          return NextResponse.json({
            success: true,
            attribute: normalizeAttribute((attribute ?? {}) as Record<string, unknown>),
          });
        }
        return NextResponse.json({ success: false, error: error.message }, { status: 404 });
      }
    }

    const readAttributes = async () => {
      const query = withValues
        ? supabase
            .from("variant_attributes")
            .select(`
              *,
              values:variant_attribute_values(*)
            `)
            .order("name")
        : supabase.from("variant_attributes").select("*").order("name");

      const { data, error } = await query;
      if (error) {
        if (withValues && isVariantAttributeRelationshipMissing(error)) {
          const { data: attributesData, error: attributesError } = await supabase
            .from("variant_attributes")
            .select("*")
            .order("name");

          if (attributesError) {
            if (isVariantAttributeTableMissing(attributesError) || isVariantAttributeValueTableMissing(attributesError)) {
              try {
                await backfillVariantAttributeRegistryFromCatalog(supabase);
              } catch (backfillError) {
                console.error("Error backfilling variant attributes from catalog:", backfillError);
              }
          return (await getStoredVariantAttributes()).map((attribute) =>
                normalizeAttribute((attribute ?? {}) as Record<string, unknown>),
              );
            }
            throw attributesError;
          }

          const { data: valuesData, error: valuesError } = await supabase
            .from("variant_attribute_values")
            .select("*")
            .order("display_order")
            .order("value");

          if (valuesError) {
            if (isVariantAttributeValueTableMissing(valuesError) || isVariantAttributeTableMissing(valuesError)) {
              try {
                await backfillVariantAttributeRegistryFromCatalog(supabase);
              } catch (backfillError) {
                console.error("Error backfilling variant attributes from catalog:", backfillError);
              }
              return (await getStoredVariantAttributes()).map((attribute) =>
                normalizeAttribute((attribute ?? {}) as Record<string, unknown>),
              );
            }
            throw valuesError;
          }

          const valuesByAttributeId = new Map<string, Record<string, unknown>[]>();
          for (const value of (valuesData || []) as Record<string, unknown>[]) {
            const attributeId = typeof value.attribute_id === "string" ? value.attribute_id : null;
            if (!attributeId) continue;
            const bucket = valuesByAttributeId.get(attributeId) ?? [];
            bucket.push(value);
            valuesByAttributeId.set(attributeId, bucket);
          }

          return (attributesData || [])
            .map((attribute) =>
              normalizeAttribute({
                ...((attribute ?? {}) as Record<string, unknown>),
                values: valuesByAttributeId.get(String((attribute as Record<string, unknown>).id ?? "")) ?? [],
              }),
            )
            .filter((attribute) => attribute.is_active !== false);
        }

        if (isVariantAttributeTableMissing(error) || isVariantAttributeValueTableMissing(error)) {
          try {
            await backfillVariantAttributeRegistryFromCatalog(supabase);
          } catch (backfillError) {
            console.error("Error backfilling variant attributes from catalog:", backfillError);
          }
          return (await getStoredVariantAttributes()).map((attribute) =>
            normalizeAttribute((attribute ?? {}) as Record<string, unknown>)
          );
        }
        throw error;
      }

      return (data || [])
        .map((attribute) => normalizeAttribute((attribute ?? {}) as Record<string, unknown>))
        .filter((attribute) => !isIgnoredLegacyVariantAttributeName(typeof attribute.name === "string" ? attribute.name : null))
        .filter((attribute) => attribute.is_active !== false);
    };

    let attributes = await readAttributes();
    if (attributes.length === 0) {
      try {
        await backfillVariantAttributeRegistryFromCatalog(supabase);
        attributes = await readAttributes();
      } catch (backfillError) {
        console.error("Error backfilling variant attributes from catalog:", backfillError);
      }
    }

    try {
      await syncStoredVariantAttributeRegistrySnapshot(supabase);
    } catch (snapshotError) {
      console.error("Error syncing variant attribute registry snapshot:", snapshotError);
    }

    return NextResponse.json({ success: true, attributes });
  } catch (error: any) {
    console.error("Error fetching variant attributes:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch attributes" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, values, colorCodes = {}, imageUrls = {} } = body;
    const normalizedName = normalizeVisibleText(name, { collapseWhitespace: true });

    if (!normalizedName) {
      return NextResponse.json({ success: false, error: "Nitelik adı gereklidir" }, { status: 400 });
    }

    if (!values || !Array.isArray(values) || values.length === 0) {
      return NextResponse.json({ success: false, error: "En az bir değer gereklidir" }, { status: 400 });
    }

    const normalizedValues = extractIncomingValues(values as VariantValueInput[], colorCodes, imageUrls);
    if (normalizedValues.length === 0) {
      return NextResponse.json({ success: false, error: "En az bir geçerli değer gereklidir" }, { status: 400 });
    }

    const supabase = createServerClient();
    const slug = normalizedName
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .substring(0, 100);

    let attributePayload: Record<string, unknown> = {
      name: normalizedName,
      slug: `${slug}-${Date.now().toString(36)}`,
      is_active: true,
    };

    let attribute: Record<string, unknown> | null = null;
    while (true) {
      const { data, error } = await supabase.from("variant_attributes").insert(attributePayload).select().single();
      if (!error) {
        attribute = (data ?? {}) as Record<string, unknown>;
        break;
      }
      if (isVariantAttributeTableMissing(error)) {
        const storedAttribute = await createStoredVariantAttribute({
          name: normalizedName,
          slug: `${slug}-${Date.now().toString(36)}`,
          values: normalizedValues,
        });
        return NextResponse.json({
          success: true,
          attribute: normalizeAttribute((storedAttribute ?? {}) as Record<string, unknown>),
        });
      }

      const nextPayload = stripUnsupportedColumns(
        attributePayload,
        error,
        "variant_attributes",
        OPTIONAL_ATTRIBUTE_COLUMNS,
      );
      if (!nextPayload) {
        throw error;
      }
      attributePayload = nextPayload;
    }

    let valuesToInsert = normalizedValues.map((value, index) => ({
        attribute_id: String(attribute.id),
        value: value.value,
        color_code: value.color_code,
        image_url: value.image_url,
        display_order: typeof value.display_order === "number" ? value.display_order : index,
        is_active: value.is_active !== false,
      }));

    let insertedValues: Record<string, unknown>[] = [];
    while (valuesToInsert.length > 0) {
      const { data, error } = await supabase.from("variant_attribute_values").insert(valuesToInsert).select();
      if (!error) {
        insertedValues = (data || []) as Record<string, unknown>[];
        break;
      }
      if (isVariantAttributeValueTableMissing(error)) {
        const storedAttribute = await updateStoredVariantAttribute(String(attribute.id), (currentAttribute) => ({
          ...currentAttribute,
          values: valuesToInsert.map((value, index) => ({
            id: crypto.randomUUID(),
            attribute_id: String(attribute?.id),
            value: String(value.value || ""),
            color_code: typeof value.color_code === "string" ? value.color_code : null,
            image_url: typeof value.image_url === "string" ? value.image_url : null,
            display_order: typeof value.display_order === "number" ? value.display_order : index,
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })),
        }));
        try {
          await syncCatalogVariantAttributeSnapshots(supabase);
        } catch (syncError) {
          logCatalogVariantSyncError(syncError, "create:fallback");
        }
        return NextResponse.json({
          success: true,
          attribute: normalizeAttribute(
            ((storedAttribute ?? normalizeAttribute(attribute)) ?? {}) as Record<string, unknown>
          ),
        });
      }

      const nextPayload = stripUnsupportedColumnsFromArray(
        valuesToInsert,
        error,
        "variant_attribute_values",
        OPTIONAL_VALUE_COLUMNS,
      );
      if (!nextPayload) {
        await supabase.from("variant_attributes").delete().eq("id", attribute.id);
        throw error;
      }
      valuesToInsert = nextPayload;
    }

    try {
      await syncCatalogVariantAttributeSnapshots(supabase);
    } catch (syncError) {
      logCatalogVariantSyncError(syncError, "create");
    }
    return NextResponse.json({
      success: true,
      attribute: {
        ...normalizeAttribute(attribute),
        values: insertedValues.map((value) => normalizeValue(value)),
      },
    });
  } catch (error: any) {
    console.error("Error creating variant attribute:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create attribute" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, is_active, values, colorCodes = {}, imageUrls = {} } = body;
    const normalizedName =
      name !== undefined ? normalizeVisibleText(name, { collapseWhitespace: true }) : undefined;

    if (!id) {
      return NextResponse.json({ success: false, error: "Nitelik ID gereklidir" }, { status: 400 });
    }

    const supabase = createServerClient();
    let updatePayload: Record<string, unknown> = {};

    if (normalizedName !== undefined) updatePayload.name = normalizedName;
    if (is_active !== undefined) updatePayload.is_active = is_active;

    if (Object.keys(updatePayload).length > 0) {
      while (true) {
        const { error } = await supabase.from("variant_attributes").update(updatePayload).eq("id", id);
        if (!error) {
          break;
        }
        if (isVariantAttributeTableMissing(error)) {
          const storedAttribute = await updateStoredVariantAttribute(id, (attribute) => ({
            ...attribute,
            ...(updatePayload.name !== undefined ? { name: String(updatePayload.name) } : {}),
            ...(updatePayload.is_active !== undefined ? { is_active: Boolean(updatePayload.is_active) } : {}),
          }));
          if (!storedAttribute) {
            return NextResponse.json({ success: false, error: "Nitelik bulunamadı" }, { status: 404 });
          }
          if (!values || !Array.isArray(values)) {
            try {
              await syncCatalogVariantAttributeSnapshots(supabase);
            } catch (syncError) {
              logCatalogVariantSyncError(syncError, "update:fallback-no-values");
            }
            return NextResponse.json({
              success: true,
              attribute: normalizeAttribute((storedAttribute ?? {}) as Record<string, unknown>),
            });
          }
          break;
        }

        const nextPayload = stripUnsupportedColumns(
          updatePayload,
          error,
          "variant_attributes",
          OPTIONAL_ATTRIBUTE_COLUMNS,
        );
        if (!nextPayload) {
          throw error;
        }
        updatePayload = nextPayload;
      }
    }

    if (values && Array.isArray(values)) {
      const normalizedValues = extractIncomingValues(values as VariantValueInput[], colorCodes, imageUrls);
      const { data: existingValues, error: existingValuesError } = await supabase
        .from("variant_attribute_values")
        .select("id, value")
        .eq("attribute_id", id);

      if (existingValuesError && !isVariantAttributeValueTableMissing(existingValuesError)) {
        throw existingValuesError;
      }

      const storedFallback = !existingValues || isVariantAttributeValueTableMissing(existingValuesError);
      const fallbackAttribute = storedFallback ? await getStoredVariantAttributeById(id) : null;
      const existingValueMap = new Map(
        (storedFallback ? fallbackAttribute?.values || [] : existingValues || []).map((value: any) => [value.value, value.id]),
      );

      let newValues = normalizedValues
        .filter((value) => value.value && !existingValueMap.has(value.value))
        .map((value, index) => ({
          attribute_id: id,
          value: value.value,
          color_code: value.color_code,
          image_url: value.image_url,
          display_order:
            typeof value.display_order === "number"
              ? value.display_order
              : (storedFallback ? fallbackAttribute?.values.length || 0 : existingValues?.length || 0) + index,
          is_active: value.is_active !== false,
        }));

      if (storedFallback) {
        const storedAttribute = await updateStoredVariantAttribute(id, (attribute) => {
          const existingValueSet = new Set(attribute.values.map((value) => value.value));
          const appendedValues = newValues
            .filter((value) => !existingValueSet.has(String(value.value || "")))
            .map((value, index) => ({
              id: crypto.randomUUID(),
              attribute_id: id,
              value: String(value.value || ""),
              color_code: typeof value.color_code === "string" ? value.color_code : null,
              image_url: typeof value.image_url === "string" ? value.image_url : null,
              display_order:
                typeof value.display_order === "number"
                  ? value.display_order
                  : attribute.values.length + index,
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }));
          return {
            ...attribute,
            values: [...attribute.values, ...appendedValues],
          };
        });
        try {
          await syncCatalogVariantAttributeSnapshots(supabase);
        } catch (syncError) {
          logCatalogVariantSyncError(syncError, "update:fallback-values");
        }
        return NextResponse.json({ success: true, attribute: storedAttribute });
      }

      while (newValues.length > 0) {
        const { error } = await supabase.from("variant_attribute_values").insert(newValues);
        if (!error) {
          break;
        }
        if (isVariantAttributeValueTableMissing(error)) {
          const storedAttribute = await updateStoredVariantAttribute(id, (attribute) => {
            const existingValueSet = new Set(attribute.values.map((value) => value.value));
            const appendedValues = newValues
              .filter((value) => !existingValueSet.has(String(value.value || "")))
              .map((value, index) => ({
                id: crypto.randomUUID(),
                attribute_id: id,
                value: String(value.value || ""),
                color_code: typeof value.color_code === "string" ? value.color_code : null,
                image_url: typeof value.image_url === "string" ? value.image_url : null,
                display_order:
                  typeof value.display_order === "number"
                    ? value.display_order
                    : attribute.values.length + index,
                is_active: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }));
            return {
              ...attribute,
              values: [...attribute.values, ...appendedValues],
            };
          });
          try {
            await syncCatalogVariantAttributeSnapshots(supabase);
          } catch (syncError) {
            logCatalogVariantSyncError(syncError, "update:fallback-insert-values");
          }
          return NextResponse.json({ success: true, attribute: storedAttribute });
        }

        const nextPayload = stripUnsupportedColumnsFromArray(
          newValues,
          error,
          "variant_attribute_values",
          OPTIONAL_VALUE_COLUMNS,
        );
        if (!nextPayload) {
          throw error;
        }
        newValues = nextPayload;
      }
    }

    const attribute = await fetchAttributeWithValues(id);
    try {
      await syncCatalogVariantAttributeSnapshots(supabase);
    } catch (syncError) {
      logCatalogVariantSyncError(syncError, "update");
    }
    return NextResponse.json({ success: true, attribute });
  } catch (error: any) {
    console.error("Error updating variant attribute:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update attribute" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "Nitelik ID gereklidir" }, { status: 400 });
    }

    const supabase = createServerClient();
    const storedAttribute = await getStoredVariantAttributeById(id);
    const attributeIdentity = storedAttribute
      ? { id: storedAttribute.id, name: storedAttribute.name, slug: storedAttribute.slug }
      : { id, name: null, slug: null };
    const { error } = await supabase.from("variant_attributes").update({ is_active: false }).eq("id", id);

    if (error) {
      if (isVariantAttributeTableMissing(error)) {
        await deleteStoredVariantAttribute(id);
        try {
          await removeCatalogVariantAttributeSnapshots(supabase, {
            attributeId: attributeIdentity.id,
            attributeName: attributeIdentity.name,
            attributeSlug: attributeIdentity.slug,
          });
        } catch (cleanupError) {
          logCatalogVariantSyncError(cleanupError, "delete:cleanup-fallback");
        }
        try {
          await syncCatalogVariantAttributeSnapshots(supabase);
        } catch (syncError) {
          logCatalogVariantSyncError(syncError, "delete:fallback");
        }
        return NextResponse.json({ success: true, message: "Nitelik başarıyla silindi" });
      }
      if (getMissingColumn(error, "variant_attributes") === "is_active") {
        const { error: deleteValuesError } = await supabase.from("variant_attribute_values").delete().eq("attribute_id", id);
        if (deleteValuesError && !isVariantAttributeValueTableMissing(deleteValuesError)) {
          throw deleteValuesError;
        }
        const { error: deleteError } = await supabase.from("variant_attributes").delete().eq("id", id);
        if (deleteError) {
          if (isVariantAttributeTableMissing(deleteError)) {
            await deleteStoredVariantAttribute(id);
            try {
              await removeCatalogVariantAttributeSnapshots(supabase, {
                attributeId: attributeIdentity.id,
                attributeName: attributeIdentity.name,
                attributeSlug: attributeIdentity.slug,
              });
            } catch (cleanupError) {
              logCatalogVariantSyncError(cleanupError, "delete:cleanup-fallback-hard-delete");
            }
            try {
              await syncCatalogVariantAttributeSnapshots(supabase);
            } catch (syncError) {
              logCatalogVariantSyncError(syncError, "delete:fallback-hard-delete");
            }
            return NextResponse.json({ success: true, message: "Nitelik başarıyla silindi" });
          }
          throw deleteError;
        }
      } else {
        throw error;
      }
    }

    await deleteStoredVariantAttribute(id);
    try {
      await removeCatalogVariantAttributeSnapshots(supabase, {
        attributeId: attributeIdentity.id,
        attributeName: attributeIdentity.name,
        attributeSlug: attributeIdentity.slug,
      });
    } catch (cleanupError) {
      logCatalogVariantSyncError(cleanupError, "delete:cleanup");
    }

    try {
      await syncCatalogVariantAttributeSnapshots(supabase);
    } catch (syncError) {
      logCatalogVariantSyncError(syncError, "delete");
    }
    return NextResponse.json({ success: true, message: "Nitelik başarıyla silindi" });
  } catch (error: any) {
    console.error("Error deleting variant attribute:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete attribute" },
      { status: 500 },
    );
  }
}
