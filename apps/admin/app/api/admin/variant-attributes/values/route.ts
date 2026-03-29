import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

const OPTIONAL_VALUE_COLUMNS = new Set(["color_code", "image_url", "display_order", "is_active"]);

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
        return NextResponse.json({ success: true, value: data });
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
        return NextResponse.json({ success: true, value: data });
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
    const { error } = await supabase.from("variant_attribute_values").update({ is_active: false }).eq("id", id);

    if (error) {
      if (getMissingColumn(error) === "is_active") {
        const { error: deleteError } = await supabase.from("variant_attribute_values").delete().eq("id", id);
        if (deleteError) {
          throw deleteError;
        }
      } else {
        throw error;
      }
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
