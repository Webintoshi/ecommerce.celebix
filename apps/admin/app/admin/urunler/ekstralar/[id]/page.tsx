// =====================================================
// ADMIN - EDIT CUSTOMIZATION SCHEMA
// /admin/urunler/ekstralar/[id]
// =====================================================

import { Metadata } from "next";
import { notFound } from "next/navigation";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import { createServerClient } from "@/lib/supabase";
import { FormBuilder } from "@/components/admin/customization/form-builder";

export const metadata: Metadata = {
  title: `Sema Duzenle | ${STORE_RUNTIME.name} Admin`,
};

interface EditSchemaPageProps {
  params: Promise<{
    id: string;
  }>;
}

async function getSchemaWithDetails(id: string) {
  const supabase = createServerClient();
  
  const { data: schema, error: schemaError } = await supabase
    .from("product_customization_schemas")
    .select("*")
    .eq("id", id)
    .single();

  if (schemaError || !schema) {
    return null;
  }

  const { data: steps, error: stepsError } = await supabase
    .from("product_customization_steps")
    .select("*")
    .eq("schema_id", id)
    .order("sort_order", { ascending: true });

  if (stepsError) {
    console.error("Error fetching steps:", stepsError);
    return { ...schema, steps: [] };
  }

  // Fetch options for each step
  const stepsWithOptions = await Promise.all(
    (steps || []).map(async (step) => {
      const { data: options } = await supabase
        .from("product_customization_options")
        .select("*")
        .eq("step_id", step.id)
        .order("sort_order", { ascending: true });

      return {
        ...step,
        options: options || [],
      };
    })
  );

  return {
    ...schema,
    steps: stepsWithOptions,
  };
}

export default async function EditSchemaPage({ params }: EditSchemaPageProps) {
  const { id } = await params;
  const schema = await getSchemaWithDetails(id);

  if (!schema) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <FormBuilder initialSchema={schema} />
    </div>
  );
}
