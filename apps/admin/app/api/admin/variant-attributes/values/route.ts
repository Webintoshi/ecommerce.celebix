import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

// POST /api/admin/variant-attributes/values - Yeni değer ekle
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { attribute_id, value, color_code, display_order, image_url } = body;

    if (!attribute_id || !value || !value.trim()) {
      return NextResponse.json(
        { success: false, error: "Nitelik ID ve değer gereklidir" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    const { data, error } = await supabase
      .from("variant_attribute_values")
      .insert({
        attribute_id,
        value: value.trim(),
        color_code: color_code || null,
        image_url: image_url || null,
        display_order: display_order || 0,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      // Unique constraint hatası kontrolü
      if (error.code === "23505") {
        return NextResponse.json(
          { success: false, error: "Bu değer zaten mevcut" },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json({ success: true, value: data });
  } catch (error: any) {
    console.error("Error creating attribute value:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create value" },
      { status: 500 }
    );
  }
}

// PUT /api/admin/variant-attributes/values - Değer güncelle
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, value, color_code, image_url, display_order, is_active } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Değer ID gereklidir" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    const updateData: any = {};
    if (value !== undefined) updateData.value = value.trim();
    if (color_code !== undefined) updateData.color_code = color_code;
    if (image_url !== undefined) updateData.image_url = image_url;
    if (display_order !== undefined) updateData.display_order = display_order;
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data, error } = await supabase
      .from("variant_attribute_values")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { success: false, error: "Bu değer zaten mevcut" },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json({ success: true, value: data });
  } catch (error: any) {
    console.error("Error updating attribute value:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update value" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/variant-attributes/values - Değer sil (soft delete)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Değer ID gereklidir" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    const { error } = await supabase
      .from("variant_attribute_values")
      .update({ is_active: false })
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: "Değer başarıyla silindi",
    });
  } catch (error: any) {
    console.error("Error deleting attribute value:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete value" },
      { status: 500 }
    );
  }
}
