import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

// GET /api/admin/variant-attributes - Tüm nitelikleri getir
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const withValues = searchParams.get("withValues") === "true";
    const id = searchParams.get("id");

    const supabase = createServerClient();

    // Tek bir nitelik detayı
    if (id) {
      let query = supabase
        .from("variant_attributes")
        .select(`
          *,
          values:variant_attribute_values(*)
        `)
        .eq("id", id)
        .single();

      const { data, error } = await query;

      if (error) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 404 }
        );
      }

      return NextResponse.json({ success: true, attribute: data });
    }

    // Tüm nitelikler
    let query = supabase
      .from("variant_attributes")
      .select("*")
      .eq("is_active", true)
      .order("name");

    if (withValues) {
      query = supabase
        .from("variant_attributes")
        .select(`
          *,
          values:variant_attribute_values(
            *,
            attribute:variant_attributes(id, name, slug)
          )
        `)
        .eq("is_active", true)
        .eq("values.is_active", true)
        .order("name");
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, attributes: data || [] });
  } catch (error: any) {
    console.error("Error fetching variant attributes:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch attributes" },
      { status: 500 }
    );
  }
}

// POST /api/admin/variant-attributes - Yeni nitelik oluştur
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, values, colorCodes = {}, imageUrls = {} } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: "Nitelik adı gereklidir" },
        { status: 400 }
      );
    }

    if (!values || !Array.isArray(values) || values.length === 0) {
      return NextResponse.json(
        { success: false, error: "En az bir değer gereklidir" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Slug oluştur
    const slug = name
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .substring(0, 100);

    // Nitelik grubunu oluştur
    const { data: attribute, error: attributeError } = await supabase
      .from("variant_attributes")
      .insert({
        name: name.trim(),
        slug: `${slug}-${Date.now().toString(36)}`, // Benzersiz slug
        is_active: true,
      })
      .select()
      .single();

    if (attributeError) {
      throw attributeError;
    }

    // Değerleri oluştur
    const valuesToInsert = values
      .filter((v: string) => v && v.trim())
      .map((value: string, index: number) => ({
        attribute_id: attribute.id,
        value: value.trim(),
        color_code: colorCodes[value.trim()] || null,
        image_url: imageUrls[value.trim()] || null,
        display_order: index,
        is_active: true,
      }));

    const { data: insertedValues, error: valuesError } = await supabase
      .from("variant_attribute_values")
      .insert(valuesToInsert)
      .select();

    if (valuesError) {
      // Değerler eklenemezse niteliği de sil
      await supabase.from("variant_attributes").delete().eq("id", attribute.id);
      throw valuesError;
    }

    return NextResponse.json({
      success: true,
      attribute: {
        ...attribute,
        values: insertedValues || [],
      },
    });
  } catch (error: any) {
    console.error("Error creating variant attribute:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create attribute" },
      { status: 500 }
    );
  }
}

// PUT /api/admin/variant-attributes - Nitelik güncelle
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, is_active, values, colorCodes = {}, imageUrls = {} } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Nitelik ID gereklidir" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Nitelik grubunu güncelle
    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (is_active !== undefined) updateData.is_active = is_active;

    let attribute;
    if (Object.keys(updateData).length > 0) {
      const { data, error } = await supabase
        .from("variant_attributes")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      attribute = data;
    }

    // Değerleri güncelle/ekle/sil
    if (values && Array.isArray(values)) {
      // Mevcut değerleri al
      const { data: existingValues } = await supabase
        .from("variant_attribute_values")
        .select("id, value")
        .eq("attribute_id", id);

      const existingValueMap = new Map(
        existingValues?.map((v) => [v.value, v.id]) || []
      );

      // Yeni değerleri ekle
      const newValues = values.filter((v: string) => v && v.trim() && !existingValueMap.has(v.trim()));
      if (newValues.length > 0) {
        const valuesToInsert = newValues.map((value: string, index: number) => ({
          attribute_id: id,
          value: value.trim(),
          color_code: colorCodes[value.trim()] || null,
          image_url: imageUrls[value.trim()] || null,
          display_order: (existingValues?.length || 0) + index,
          is_active: true,
        }));

        await supabase.from("variant_attribute_values").insert(valuesToInsert);
      }
    }

    // Güncellenmiş niteliği getir
    const { data: updatedAttribute, error: fetchError } = await supabase
      .from("variant_attributes")
      .select(`
        *,
        values:variant_attribute_values(*)
      `)
      .eq("id", id)
      .single();

    if (fetchError) throw fetchError;

    return NextResponse.json({
      success: true,
      attribute: updatedAttribute,
    });
  } catch (error: any) {
    console.error("Error updating variant attribute:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update attribute" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/variant-attributes - Nitelik sil (soft delete)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Nitelik ID gereklidir" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Soft delete - is_active = false
    const { error } = await supabase
      .from("variant_attributes")
      .update({ is_active: false })
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: "Nitelik başarıyla silindi",
    });
  } catch (error: any) {
    console.error("Error deleting variant attribute:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete attribute" },
      { status: 500 }
    );
  }
}
