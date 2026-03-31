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
import { syncCatalogVariantAttributeSnapshots } from "@/lib/variant-attribute-catalog-sync";

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
  return {
    ...value,
    color_code: typeof value.color_code === "string" ? value.color_code : null,
    image_url: typeof value.image_url === "string" ? value.image_url : null,
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
        : String(attribute.name || "nitelik")
            .toLowerCase()
            .replace(/[^\w\s-]/g, "")
            .replace(/\s+/g, "-"),
    is_active: attribute.is_active !== false,
    values,
  };
}

function logCatalogVariantSyncError(error: unknown, context: string) {
  console.error(`Variant attribute catalog snapshot sync failed (${context}):`, error);
}

function normalizeIncomingValue(input: VariantValueInput, index: number) {
  if (typeof input === "string") {
    return {
      value: input.trim(),
      color_code: null,
      image_url: null,
      display_order: index,
      is_active: true,
    };
  }

  const rawValue = typeof input?.value === "string" ? input.value.trim() : "";

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
  const { data, error } = await supabase
    .from("variant_attributes")
    .select(`
      *,
      values:variant_attribute_values(*)
    `)
    .eq("id", id)
    .single();

  if (error) {
    throw error;
  }

  return normalizeAttribute((data ?? {}) as Record<string, unknown>);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const withValues = searchParams.get("withValues") === "true";
    const id = searchParams.get("id");
    const supabase = createServerClient();

    if (id) {
      try {
        const attribute = await fetchAttributeWithValues(id);
        return NextResponse.json({ success: true, attribute });
      } catch (error: any) {
        if (isVariantAttributeTableMissing(error) || isVariantAttributeValueTableMissing(error)) {
          const attribute = await getStoredVariantAttributeById(id);
          if (!attribute) {
            return NextResponse.json({ success: false, error: "Nitelik bulunamadi" }, { status: 404 });
          }
          return NextResponse.json({ success: true, attribute });
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
        if (isVariantAttributeTableMissing(error) || isVariantAttributeValueTableMissing(error)) {
          return await getStoredVariantAttributes();
        }
        throw error;
      }

      return (data || [])
        .map((attribute) => normalizeAttribute((attribute ?? {}) as Record<string, unknown>))
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

    if (!name || !name.trim()) {
      return NextResponse.json({ success: false, error: "Nitelik adi gereklidir" }, { status: 400 });
    }

    if (!values || !Array.isArray(values) || values.length === 0) {
      return NextResponse.json({ success: false, error: "En az bir deger gereklidir" }, { status: 400 });
    }

    const normalizedValues = extractIncomingValues(values as VariantValueInput[], colorCodes, imageUrls);
    if (normalizedValues.length === 0) {
      return NextResponse.json({ success: false, error: "En az bir gecerli deger gereklidir" }, { status: 400 });
    }

    const supabase = createServerClient();
    const slug = name
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .substring(0, 100);

    let attributePayload: Record<string, unknown> = {
      name: name.trim(),
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
          name: name.trim(),
          slug: `${slug}-${Date.now().toString(36)}`,
          values: normalizedValues,
        });
        return NextResponse.json({ success: true, attribute: storedAttribute });
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
        return NextResponse.json({ success: true, attribute: storedAttribute ?? normalizeAttribute(attribute) });
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

    if (!id) {
      return NextResponse.json({ success: false, error: "Nitelik ID gereklidir" }, { status: 400 });
    }

    const supabase = createServerClient();
    let updatePayload: Record<string, unknown> = {};

    if (name !== undefined) updatePayload.name = name.trim();
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
            return NextResponse.json({ success: false, error: "Nitelik bulunamadi" }, { status: 404 });
          }
          if (!values || !Array.isArray(values)) {
            try {
              await syncCatalogVariantAttributeSnapshots(supabase);
            } catch (syncError) {
              logCatalogVariantSyncError(syncError, "update:fallback-no-values");
            }
            return NextResponse.json({ success: true, attribute: storedAttribute });
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
    const { error } = await supabase.from("variant_attributes").update({ is_active: false }).eq("id", id);

    if (error) {
      if (isVariantAttributeTableMissing(error)) {
        const deleted = await deleteStoredVariantAttribute(id);
        if (!deleted) {
          return NextResponse.json({ success: false, error: "Nitelik bulunamadi" }, { status: 404 });
        }
        try {
          await syncCatalogVariantAttributeSnapshots(supabase);
        } catch (syncError) {
          logCatalogVariantSyncError(syncError, "delete:fallback");
        }
        return NextResponse.json({ success: true, message: "Nitelik basariyla silindi" });
      }
      if (getMissingColumn(error, "variant_attributes") === "is_active") {
        await supabase.from("variant_attribute_values").delete().eq("attribute_id", id);
        const { error: deleteError } = await supabase.from("variant_attributes").delete().eq("id", id);
        if (deleteError) {
          throw deleteError;
        }
      } else {
        throw error;
      }
    }

    try {
      await syncCatalogVariantAttributeSnapshots(supabase);
    } catch (syncError) {
      logCatalogVariantSyncError(syncError, "delete");
    }
    return NextResponse.json({ success: true, message: "Nitelik basariyla silindi" });
  } catch (error: any) {
    console.error("Error deleting variant attribute:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete attribute" },
      { status: 500 },
    );
  }
}
