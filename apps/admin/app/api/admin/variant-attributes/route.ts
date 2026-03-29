import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

const OPTIONAL_ATTRIBUTE_COLUMNS = new Set(["is_active"]);
const OPTIONAL_VALUE_COLUMNS = new Set(["color_code", "image_url", "display_order", "is_active"]);

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
        return NextResponse.json({ success: false, error: error.message }, { status: 404 });
      }
    }

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
      throw error;
    }

    const attributes = (data || [])
      .map((attribute) => normalizeAttribute((attribute ?? {}) as Record<string, unknown>))
      .filter((attribute) => attribute.is_active !== false);

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

    let valuesToInsert = values
      .filter((value: string) => value && value.trim())
      .map((value: string, index: number) => ({
        attribute_id: String(attribute.id),
        value: value.trim(),
        color_code: colorCodes[value.trim()] || null,
        image_url: imageUrls[value.trim()] || null,
        display_order: index,
        is_active: true,
      }));

    let insertedValues: Record<string, unknown>[] = [];
    while (valuesToInsert.length > 0) {
      const { data, error } = await supabase.from("variant_attribute_values").insert(valuesToInsert).select();
      if (!error) {
        insertedValues = (data || []) as Record<string, unknown>[];
        break;
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
      const { data: existingValues, error: existingValuesError } = await supabase
        .from("variant_attribute_values")
        .select("id, value")
        .eq("attribute_id", id);

      if (existingValuesError) {
        throw existingValuesError;
      }

      const existingValueMap = new Map((existingValues || []).map((value) => [value.value, value.id]));
      let newValues = values
        .filter((value: string) => value && value.trim() && !existingValueMap.has(value.trim()))
        .map((value: string, index: number) => ({
          attribute_id: id,
          value: value.trim(),
          color_code: colorCodes[value.trim()] || null,
          image_url: imageUrls[value.trim()] || null,
          display_order: (existingValues?.length || 0) + index,
          is_active: true,
        }));

      while (newValues.length > 0) {
        const { error } = await supabase.from("variant_attribute_values").insert(newValues);
        if (!error) {
          break;
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

    return NextResponse.json({ success: true, message: "Nitelik basariyla silindi" });
  } catch (error: any) {
    console.error("Error deleting variant attribute:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete attribute" },
      { status: 500 },
    );
  }
}
