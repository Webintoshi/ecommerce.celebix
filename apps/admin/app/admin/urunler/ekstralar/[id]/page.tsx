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

async function getAssignmentOptions() {
  const supabase = createServerClient();

  const [{ data: products, error: productsError }, { data: categories, error: categoriesError }] =
    await Promise.all([
      supabase
        .from("products")
        .select("id,name,slug,category")
        .order("name", { ascending: true }),
      supabase
        .from("categories")
        .select("id,name,slug,parent_id,sort_order")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
    ]);

  if (productsError) {
    console.error("Error fetching customization products:", productsError);
  }

  if (categoriesError) {
    console.error("Error fetching customization categories:", categoriesError);
  }

  return {
    products: products || [],
    categories: categories || [],
  };
}

export default async function EditSchemaPage({ params }: EditSchemaPageProps) {
  const { id } = await params;
  const [schema, assignmentOptions] = await Promise.all([
    getSchemaWithDetails(id),
    getAssignmentOptions(),
  ]);

  if (!schema) {
    notFound();
  }

  const supabase = createServerClient();
  const [{ data: productAssignments }, { data: categoryAssignments }] = await Promise.all([
    supabase
      .from("product_schema_assignments")
      .select("product_id")
      .eq("schema_id", id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("category_schema_assignments")
      .select("category_id")
      .eq("schema_id", id),
  ]);

  return (
    <div className="min-h-screen bg-gray-50">
      <FormBuilder
        initialSchema={schema}
        initialProductAssignments={(productAssignments || []).map((assignment) => assignment.product_id)}
        initialCategoryAssignments={(categoryAssignments || []).map((assignment) => assignment.category_id)}
        availableProducts={assignmentOptions.products}
        availableCategories={assignmentOptions.categories}
      />
    </div>
  );
}
