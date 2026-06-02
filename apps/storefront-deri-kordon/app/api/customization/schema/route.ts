import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { translateDerycraftCustomizationSchema } from "@/lib/derycraft-english-fallback";
import { DEFAULT_LOCALE, isSupportedLocale, type StorefrontLocale } from "@/lib/i18n";
import type {
  CustomizationOption,
  CustomizationSchema,
  CustomizationStep,
} from "@/types/product-customization";

type ProductRow = {
  id: string;
  category?: string | null;
  subcategory?: string | null;
};

type SchemaAssignmentRow = {
  schema_id: string;
  is_default: boolean;
  sort_order: number | null;
};

type CategorySchemaAssignmentRow = {
  schema_id: string;
  category_id: string;
  created_at?: string | null;
};

type CategoryRow = {
  id: string;
  slug: string;
};

type SchemaRow = {
  id: string;
  is_active: boolean;
};

type CustomizationSchemaPayload = CustomizationSchema & { steps: CustomizationStep[] };

function resolveRequestedLocale(request: NextRequest): StorefrontLocale {
  const requestedLocale = request.nextUrl.searchParams.get("locale");
  if (isSupportedLocale(requestedLocale)) {
    return requestedLocale;
  }

  const headerLocale = request.headers.get("x-celebix-locale");
  return isSupportedLocale(headerLocale) ? headerLocale : DEFAULT_LOCALE;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Beklenmeyen bir hata oluştu";
}

async function loadSchemaPayload(
  supabase: ReturnType<typeof createServerClient>,
  schemaId: string,
): Promise<CustomizationSchemaPayload | null> {
  const { data: schemaData, error: schemaError } = await supabase
    .from("product_customization_schemas")
    .select("*")
    .eq("id", schemaId)
    .single();

  if (schemaError) {
    throw schemaError;
  }

  if (!schemaData?.is_active) {
    return null;
  }

  const { data: stepsData, error: stepsError } = await supabase
    .from("product_customization_steps")
    .select("*")
    .eq("schema_id", schemaId)
    .order("sort_order", { ascending: true });

  if (stepsError) {
    throw stepsError;
  }

  const steps = (stepsData || []) as CustomizationStep[];
  const stepIds = steps.map((step) => step.id);

  const optionsByStepId = new Map<string, CustomizationOption[]>();
  if (stepIds.length > 0) {
    const { data: optionsData, error: optionsError } = await supabase
      .from("product_customization_options")
      .select("*")
      .in("step_id", stepIds)
      .order("sort_order", { ascending: true });

    if (optionsError) {
      throw optionsError;
    }

    for (const option of (optionsData || []) as CustomizationOption[]) {
      const bucket = optionsByStepId.get(option.step_id) || [];
      bucket.push(option);
      optionsByStepId.set(option.step_id, bucket);
    }
  }

  return {
    ...(schemaData as CustomizationSchema),
    steps: steps.map((step) => ({
      ...step,
      options: optionsByStepId.get(step.id) || [],
    })),
  };
}

async function resolveAssignedSchemaId(
  supabase: ReturnType<typeof createServerClient>,
  product: ProductRow,
) {
  const { data: productAssignments, error: productAssignmentError } = await supabase
    .from("product_schema_assignments")
    .select("schema_id,is_default,sort_order")
    .eq("product_id", product.id)
    .order("is_default", { ascending: false })
    .order("sort_order", { ascending: true });

  if (productAssignmentError) {
    throw productAssignmentError;
  }

  const categorySlugs = [product.subcategory, product.category]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value): value is string => value.length > 0);

  let matchedCategories: CategoryRow[] = [];
  let categoryAssignments: CategorySchemaAssignmentRow[] = [];

  if (categorySlugs.length > 0) {
    const { data: categoriesData, error: categoriesError } = await supabase
      .from("categories")
      .select("id,slug")
      .in("slug", categorySlugs);

    if (categoriesError) {
      throw categoriesError;
    }

    matchedCategories = (categoriesData as CategoryRow[] | null) || [];
    const categoryIds = matchedCategories.map((category) => category.id);

    if (categoryIds.length > 0) {
      const { data: assignmentRows, error: categoryAssignmentsError } = await supabase
        .from("category_schema_assignments")
        .select("schema_id,category_id,created_at")
        .in("category_id", categoryIds);

      if (categoryAssignmentsError) {
        throw categoryAssignmentsError;
      }

      categoryAssignments = (assignmentRows as CategorySchemaAssignmentRow[] | null) || [];
    }
  }

  const categorySlugOrder = new Map<string, number>();
  categorySlugs.forEach((slug, index) => categorySlugOrder.set(slug, index));

  const categoriesById = new Map<string, string>();
  matchedCategories.forEach((category) => {
    categoriesById.set(category.id, category.slug);
  });

  const candidates = [
    ...((productAssignments as SchemaAssignmentRow[] | null) || []).map((assignment, index) => ({
      schema_id: assignment.schema_id,
      priority: 0,
      sort_order: assignment.sort_order ?? index,
      specificity: -1,
      created_at: "",
    })),
    ...categoryAssignments.map((assignment, index) => ({
      schema_id: assignment.schema_id,
      priority: 1,
      sort_order: index,
      specificity:
        categorySlugOrder.get(categoriesById.get(assignment.category_id) || "") ??
        Number.MAX_SAFE_INTEGER,
      created_at: assignment.created_at || "",
    })),
  ]
    .sort((left, right) => {
      if (left.priority !== right.priority) return left.priority - right.priority;
      if (left.specificity !== right.specificity) return left.specificity - right.specificity;
      if (left.sort_order !== right.sort_order) return left.sort_order - right.sort_order;
      return left.created_at.localeCompare(right.created_at);
    })
    .filter(
      (candidate, index, all) =>
        all.findIndex((entry) => entry.schema_id === candidate.schema_id) === index,
    );

  if (candidates.length === 0) {
    return null;
  }

  const { data: schemas, error: schemaError } = await supabase
    .from("product_customization_schemas")
    .select("id,is_active")
    .in(
      "id",
      candidates.map((candidate) => candidate.schema_id),
    );

  if (schemaError) {
    throw schemaError;
  }

  const activeSchemaIds = new Set(
    ((schemas as SchemaRow[] | null) || [])
      .filter((schema) => schema.is_active)
      .map((schema) => schema.id),
  );

  return candidates.find((candidate) => activeSchemaIds.has(candidate.schema_id))?.schema_id || null;
}

export async function GET(request: NextRequest) {
  const supabase = createServerClient();
  const locale = resolveRequestedLocale(request);

  try {
    const { searchParams } = new URL(request.url);
    const schemaId = searchParams.get("schemaId");
    const productId = searchParams.get("productId");

    let resolvedSchemaId = schemaId;

    if (!resolvedSchemaId && productId) {
      const { data: productData, error: productError } = await supabase
        .from("products")
        .select("id,category,subcategory")
        .eq("id", productId)
        .single();

      if (productError) {
        throw productError;
      }

      if (productData) {
        resolvedSchemaId = await resolveAssignedSchemaId(supabase, productData as ProductRow);
      }
    }

    if (!resolvedSchemaId) {
      return NextResponse.json({ success: true, schema: null });
    }

    const schema = await loadSchemaPayload(supabase, resolvedSchemaId);
    return NextResponse.json({
      success: true,
      schema: schema ? translateDerycraftCustomizationSchema(schema, locale) : null,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}
