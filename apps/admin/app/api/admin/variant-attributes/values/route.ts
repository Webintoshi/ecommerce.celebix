import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  addStoredVariantAttributeValue,
  deleteStoredVariantAttributeValue,
  getStoredVariantAttributes,
  isVariantAttributeTableMissing,
  isVariantAttributeValueTableMissing,
  updateStoredVariantAttributeValue,
} from "@/lib/db/variant-attributes";
import {
  removeCatalogVariantAttributeValueSnapshots,
  syncCatalogVariantAttributeSnapshots,
} from "@/lib/variant-attribute-catalog-sync";
import { resolveAdminAssetUrl } from "@/lib/asset-url";

const OPTIONAL_VALUE_COLUMNS = new Set(["color_code", "image_url", "display_order", "is_active"]);

function logCatalogVariantSyncError(error: unknown, context: string) {
  console.error(`Variant attribute catalog snapshot sync failed (${context}):`, error);
}

function getMissingColumn(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("message" in error)) return null;
  const message = String(error.message ?? "");
  const match = message.match(/Could not find the '([^']+)' column of 'variant_attribute_values'/i);
  return match?.[1] ?? null;
}

function stripUnsupportedColumns<T extends Record<string, unknown>>(payload: T, error: unknown): T | null {
  const missingColumn = getMissingColumn(error);
  if (!missingColumn || !OPTIONAL_VALUE_COLUMNS.has(missingColumn) || !(missingColumn in payload)) {
    return null;
  }

  const nextPayload = { ...payload };
  delete nextPayload[missingColumn];
  return nextPayload;
}

function normalizeReturnedValue(value: Record<string, unknown>) {
  return {
    ...value,
    image_url: resolveAdminAssetUrl(typeof value.image_url === "string" ? value.image_url : null) || null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const attributeId = searchParams.get("attribute_id");
    const id = searchParams.get("id");
    const supabase = createServerClient();

    const query = supabase.from("variant_attribute_values").select("*").order("display_order").order("value");
    const scopedQuery = attributeId ? query.eq("attribute_id", attributeId) : id ? query.eq("id", id) : query;
    const { data, error } = await scopedQuery;

    if (error) {
      if (isVariantAttributeValueTableMissing(error) || isVariantAttributeTableMissing(error)) {
        const attributes = await getStoredVariantAttributes();
        const values = attributes.flatMap((attribute) => attribute.values);
        const filteredValues = attributeId
          ? values.filter((value) => value.attribute_id === attributeId)
          : id
            ? values.filter((value) => value.id === id)
            : values;
        return NextResponse.json({
          success: true,
          values: filteredValues.map((value) => normalizeReturnedValue((value ?? {}) as Record<string, unknown>)),
        });
      }

      throw error;
    }

    return NextResponse.json({
      success: true,
      values: (data || []).map((value) => normalizeReturnedValue((value ?? {}) as Record<string, unknown>)),
    });
  } catch (error: any) {
    console.error("Error fetching attribute values:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch values" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { attribute_id, value, color_code, display_order, image_url } = body;

    if (!attribute_id || !value || !value.trim()) {
      return NextResponse.json({ success: false, error: "Nitelik ID ve deger gereklidir" }, { status: 400 });
    }

    const supabase = createServerClient();
    let payload: Record<string, unknown> = {
      attribute_id,
      value: value.trim(),
      color_code: color_code || null,
      image_url: image_url || null,
      display_order: display_order || 0,
      is_active: true,
    };

    while (true) {
      const { data, error } = await supabase.from("variant_attribute_values").insert(payload).select().single();

      if (!error) {
        try {
          await syncCatalogVariantAttributeSnapshots(supabase);
        } catch (syncError) {
          logCatalogVariantSyncError(syncError, "create");
        }
        return NextResponse.json({
          success: true,
          value: normalizeReturnedValue((data ?? {}) as Record<string, unknown>),
        });
      }
      if (isVariantAttributeValueTableMissing(error) || isVariantAttributeTableMissing(error)) {
        const createdValue = await addStoredVariantAttributeValue({
          attribute_id,
          value: value.trim(),
          color_code: color_code || null,
          image_url: image_url || null,
          display_order: display_order || 0,
        });
        if (!createdValue) {
          return NextResponse.json({ success: false, error: "Nitelik bulunamadi" }, { status: 404 });
        }
        try {
          await syncCatalogVariantAttributeSnapshots(supabase);
        } catch (syncError) {
          logCatalogVariantSyncError(syncError, "create:fallback");
        }
        return NextResponse.json({
          success: true,
          value: normalizeReturnedValue((createdValue ?? {}) as Record<string, unknown>),
        });
      }

      if (error.code === "23505") {
        return NextResponse.json({ success: false, error: "Bu deger zaten mevcut" }, { status: 409 });
      }

      const nextPayload = stripUnsupportedColumns(payload, error);
      if (!nextPayload) {
        throw error;
      }
      payload = nextPayload;
    }
  } catch (error: any) {
    console.error("Error creating attribute value:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create value" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, value, color_code, image_url, display_order, is_active } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "Deger ID gereklidir" }, { status: 400 });
    }

    const supabase = createServerClient();
    let payload: Record<string, unknown> = {};

    if (value !== undefined) payload.value = value.trim();
    if (color_code !== undefined) payload.color_code = color_code;
    if (image_url !== undefined) payload.image_url = image_url;
    if (display_order !== undefined) payload.display_order = display_order;
    if (is_active !== undefined) payload.is_active = is_active;

    while (true) {
      const { data, error } = await supabase
        .from("variant_attribute_values")
        .update(payload)
        .eq("id", id)
        .select()
        .single();

      if (!error) {
        try {
          await syncCatalogVariantAttributeSnapshots(supabase);
        } catch (syncError) {
          logCatalogVariantSyncError(syncError, "update");
        }
        return NextResponse.json({
          success: true,
          value: normalizeReturnedValue((data ?? {}) as Record<string, unknown>),
        });
      }
      if (isVariantAttributeValueTableMissing(error) || isVariantAttributeTableMissing(error)) {
        const updatedValue = await updateStoredVariantAttributeValue(id, (currentValue) => ({
          ...currentValue,
          ...(value !== undefined ? { value: value.trim() } : {}),
          ...(color_code !== undefined ? { color_code } : {}),
          ...(image_url !== undefined ? { image_url } : {}),
          ...(display_order !== undefined ? { display_order } : {}),
          ...(is_active !== undefined ? { is_active } : {}),
        }));
        if (!updatedValue) {
          return NextResponse.json({ success: false, error: "Deger bulunamadi" }, { status: 404 });
        }
        try {
          await syncCatalogVariantAttributeSnapshots(supabase);
        } catch (syncError) {
          logCatalogVariantSyncError(syncError, "update:fallback");
        }
        return NextResponse.json({
          success: true,
          value: normalizeReturnedValue((updatedValue ?? {}) as Record<string, unknown>),
        });
      }

      if (error.code === "23505") {
        return NextResponse.json({ success: false, error: "Bu deger zaten mevcut" }, { status: 409 });
      }

      const nextPayload = stripUnsupportedColumns(payload, error);
      if (!nextPayload) {
        throw error;
      }
      payload = nextPayload;
    }
  } catch (error: any) {
    console.error("Error updating attribute value:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update value" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "Deger ID gereklidir" }, { status: 400 });
    }

    const supabase = createServerClient();
    const storedAttributes = await getStoredVariantAttributes();
    const storedValue = storedAttributes
      .flatMap((attribute) => attribute.values.map((value) => ({
        value,
        attributeId: attribute.id,
        attributeName: attribute.name,
      })))
      .find((entry) => entry.value.id === id) ?? null;
    const { error } = await supabase.from("variant_attribute_values").update({ is_active: false }).eq("id", id);

    if (error) {
      if (isVariantAttributeValueTableMissing(error) || isVariantAttributeTableMissing(error)) {
        const deleted = await deleteStoredVariantAttributeValue(id);
        if (!deleted) {
          return NextResponse.json({ success: false, error: "Deger bulunamadi" }, { status: 404 });
        }
        try {
          await removeCatalogVariantAttributeValueSnapshots(supabase, {
            valueId: id,
            attributeId: storedValue?.attributeId ?? null,
            attributeName: storedValue?.attributeName ?? null,
            value: storedValue?.value.value ?? null,
          });
        } catch (cleanupError) {
          logCatalogVariantSyncError(cleanupError, "delete:cleanup-fallback");
        }
        try {
          await syncCatalogVariantAttributeSnapshots(supabase);
        } catch (syncError) {
          logCatalogVariantSyncError(syncError, "delete:fallback");
        }
        return NextResponse.json({ success: true, message: "Deger basariyla silindi" });
      }
      if (getMissingColumn(error) === "is_active") {
        const { error: deleteError } = await supabase.from("variant_attribute_values").delete().eq("id", id);
        if (deleteError) {
          throw deleteError;
        }
      } else {
        throw error;
      }
    }

    await deleteStoredVariantAttributeValue(id);
    try {
      await removeCatalogVariantAttributeValueSnapshots(supabase, {
        valueId: id,
        attributeId: storedValue?.attributeId ?? null,
        attributeName: storedValue?.attributeName ?? null,
        value: storedValue?.value.value ?? null,
      });
    } catch (cleanupError) {
      logCatalogVariantSyncError(cleanupError, "delete:cleanup");
    }

    try {
      await syncCatalogVariantAttributeSnapshots(supabase);
    } catch (syncError) {
      logCatalogVariantSyncError(syncError, "delete");
    }
    return NextResponse.json({ success: true, message: "Deger basariyla silindi" });
  } catch (error: any) {
    console.error("Error deleting attribute value:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete value" },
      { status: 500 },
    );
  }
}
