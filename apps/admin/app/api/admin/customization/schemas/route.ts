import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import type { CustomizationStep } from "@/types/product-customization";

type CreateSchemaBody = {
  action: "create";
  name: string;
  description?: string;
  slug: string;
  settings?: Record<string, unknown>;
};

type DuplicateSchemaBody = {
  action: "duplicate";
  schemaId: string;
};

type SaveSchemaBody = {
  action: "save";
  schema: {
    id: string;
    name: string;
    description?: string;
    settings?: Record<string, unknown>;
  };
  steps: CustomizationStep[];
};

type PostBody = CreateSchemaBody | DuplicateSchemaBody | SaveSchemaBody;

function badRequest(message: string) {
  return NextResponse.json({ success: false, error: message }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = (await request.json()) as PostBody;

    if (body.action === "create") {
      if (!body.name || !body.slug) {
        return badRequest("name ve slug zorunludur");
      }

      const { data, error } = await supabase
        .from("product_customization_schemas")
        .insert({
          name: body.name,
          description: body.description || null,
          slug: body.slug,
          settings: body.settings || {},
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ success: true, schema: data });
    }

    if (body.action === "duplicate") {
      if (!body.schemaId) return badRequest("schemaId zorunludur");

      const { data: fullSchema, error: schemaError } = await supabase
        .from("product_customization_schemas")
        .select(
          `
          *,
          steps:product_customization_steps(
            *,
            options:product_customization_options(*)
          )
        `
        )
        .eq("id", body.schemaId)
        .single();

      if (schemaError || !fullSchema) throw schemaError;

      const { data: newSchema, error: createError } = await supabase
        .from("product_customization_schemas")
        .insert({
          name: `${fullSchema.name} (Kopya)`,
          slug: `${fullSchema.slug}-kopya-${Date.now()}`,
          description: fullSchema.description,
          settings: fullSchema.settings,
          is_active: false,
        })
        .select()
        .single();

      if (createError || !newSchema) throw createError;

      for (const step of fullSchema.steps || []) {
        const { data: newStep, error: stepError } = await supabase
          .from("product_customization_steps")
          .insert({
            schema_id: newSchema.id,
            type: step.type,
            key: step.key,
            label: step.label,
            placeholder: step.placeholder,
            help_text: step.help_text,
            is_required: step.is_required,
            validation_rules: step.validation_rules,
            grid_width: step.grid_width,
            style_config: step.style_config,
            show_conditions: step.show_conditions,
            price_config: step.price_config,
            default_value: step.default_value,
            sort_order: step.sort_order,
          })
          .select()
          .single();

        if (stepError || !newStep) throw stepError;

        if (step.options?.length) {
          const { error: optionsError } = await supabase
            .from("product_customization_options")
            .insert(
              step.options.map((option) => ({
                step_id: newStep.id,
                label: option.label,
                value: option.value,
                description: option.description,
                image_url: option.image_url,
                icon: option.icon,
                color: option.color,
                price_adjustment: option.price_adjustment,
                price_adjustment_type: option.price_adjustment_type,
                stock_quantity: option.stock_quantity,
                track_stock: option.track_stock,
                show_conditions: option.show_conditions,
                sort_order: option.sort_order,
                is_default: option.is_default,
                is_disabled: option.is_disabled,
              }))
            );

          if (optionsError) throw optionsError;
        }
      }

      return NextResponse.json({ success: true, schema: newSchema });
    }

    if (body.action === "save") {
      if (!body.schema?.id || !Array.isArray(body.steps)) {
        return badRequest("schema.id ve steps zorunludur");
      }

      const { error: schemaError } = await supabase
        .from("product_customization_schemas")
        .update({
          name: body.schema.name,
          description: body.schema.description,
          settings: body.schema.settings || {},
          updated_at: new Date().toISOString(),
        })
        .eq("id", body.schema.id);

      if (schemaError) throw schemaError;

      const { data: existingSteps, error: existingStepsError } = await supabase
        .from("product_customization_steps")
        .select("id")
        .eq("schema_id", body.schema.id);
      if (existingStepsError) throw existingStepsError;

      const existingIds = new Set((existingSteps || []).map((s) => s.id as string));
      const currentIds = new Set(
        body.steps.filter((s) => !s.id.startsWith("temp-")).map((s) => s.id)
      );
      const idsToDelete = Array.from(existingIds).filter((id) => !currentIds.has(id));

      if (idsToDelete.length > 0) {
        const { error: deleteStepsError } = await supabase
          .from("product_customization_steps")
          .delete()
          .in("id", idsToDelete);
        if (deleteStepsError) throw deleteStepsError;
      }

      for (const step of body.steps) {
        const stepData = {
          schema_id: body.schema.id,
          type: step.type,
          key: step.key,
          label: step.label,
          placeholder: step.placeholder,
          help_text: step.help_text,
          is_required: step.is_required,
          validation_rules: step.validation_rules,
          grid_width: step.grid_width,
          style_config: step.style_config,
          show_conditions: step.show_conditions,
          price_config: step.price_config,
          default_value: step.default_value,
          sort_order: step.sort_order,
        };

        let stepId = step.id;
        if (step.id.startsWith("temp-")) {
          const { data: newStep, error: insertError } = await supabase
            .from("product_customization_steps")
            .insert(stepData)
            .select("id")
            .single();
          if (insertError || !newStep) throw insertError;
          stepId = newStep.id;
        } else {
          const { error: updateError } = await supabase
            .from("product_customization_steps")
            .update(stepData)
            .eq("id", step.id);
          if (updateError) throw updateError;
        }

        if (!step.options || step.options.length === 0) continue;

        const { data: existingOptions, error: existingOptionsError } = await supabase
          .from("product_customization_options")
          .select("id")
          .eq("step_id", stepId);
        if (existingOptionsError) throw existingOptionsError;

        const existingOptIds = new Set((existingOptions || []).map((o) => o.id as string));
        const currentOptIds = new Set(
          step.options.filter((o) => !o.id?.startsWith("temp-")).map((o) => o.id)
        );
        const optIdsToDelete = Array.from(existingOptIds).filter((id) => !currentOptIds.has(id));

        if (optIdsToDelete.length > 0) {
          const { error: deleteOptionsError } = await supabase
            .from("product_customization_options")
            .delete()
            .in("id", optIdsToDelete);
          if (deleteOptionsError) throw deleteOptionsError;
        }

        for (const option of step.options) {
          const optionData = {
            step_id: stepId,
            label: option.label,
            value: option.value,
            description: option.description,
            image_url: option.image_url,
            icon: option.icon,
            color: option.color,
            price_adjustment: option.price_adjustment,
            price_adjustment_type: option.price_adjustment_type,
            stock_quantity: option.stock_quantity,
            track_stock: option.track_stock,
            show_conditions: option.show_conditions,
            sort_order: option.sort_order,
            is_default: option.is_default,
            is_disabled: option.is_disabled,
          };

          if (option.id?.startsWith("temp-")) {
            const { error: insertOptionError } = await supabase
              .from("product_customization_options")
              .insert(optionData);
            if (insertOptionError) throw insertOptionError;
          } else {
            const { error: updateOptionError } = await supabase
              .from("product_customization_options")
              .update(optionData)
              .eq("id", option.id);
            if (updateOptionError) throw updateOptionError;
          }
        }
      }

      return NextResponse.json({ success: true });
    }

    return badRequest("Geçersiz action");
  } catch (error: unknown) {
    const message =
      error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : "Beklenmeyen bir hata oluştu";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const supabase = createServerClient();
  try {
    const body = (await request.json()) as { id?: string; is_active?: boolean };
    if (!body.id || typeof body.is_active !== "boolean") {
      return badRequest("id ve is_active zorunludur");
    }

    const { error } = await supabase
      .from("product_customization_schemas")
      .update({ is_active: body.is_active })
      .eq("id", body.id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message =
      error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : "Beklenmeyen bir hata oluştu";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const supabase = createServerClient();
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return badRequest("id zorunludur");

    const { error } = await supabase
      .from("product_customization_schemas")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message =
      error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : "Beklenmeyen bir hata oluştu";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
