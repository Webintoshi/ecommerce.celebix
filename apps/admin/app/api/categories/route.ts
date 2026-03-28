import { NextRequest, NextResponse } from "next/server";
import type { CategoryApiResponse, CategoryInput } from "@/types/category";
import { isValidCategory } from "@/types/category";

// ============================================================================
// CONFIGURATION
// ============================================================================

const CACHE_MAX_AGE = 60; // 1 minute for admin panel freshness
const STALE_WHILE_REVALIDATE = 300; // 5 minutes stale-while-revalidate

// ============================================================================
// ERROR HANDLING
// ============================================================================

class APIError extends Error {
  constructor(
    message: string, 
    public statusCode: number,
    public code: string
  ) {
    super(message);
    this.name = "APIError";
  }
}

function createErrorResponse(error: unknown): NextResponse<CategoryApiResponse> {
  if (error instanceof APIError) {
    return NextResponse.json(
      { 
        success: false, 
        error: error.message,
        code: error.code 
      },
      { 
        status: error.statusCode,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }
      }
    );
  }

  console.error("Unexpected API error:", error);
  return NextResponse.json(
    { 
      success: false, 
      error: "Internal server error",
      code: "INTERNAL_ERROR"
    },
    { 
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    }
  );
}

function createSuccessResponse(
  data: Partial<CategoryApiResponse>,
  status: number = 200,
  cache: boolean = true
): NextResponse<CategoryApiResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (cache) {
    headers["Cache-Control"] = `public, max-age=${CACHE_MAX_AGE}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`;
  } else {
    headers["Cache-Control"] = "no-store";
  }

  return NextResponse.json(
    { success: true, ...data },
    { status, headers }
  );
}

// ============================================================================
// VALIDATION
// ============================================================================

function validateUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

function validateSlug(slug: unknown): boolean {
  if (typeof slug !== "string") return false;
  return /^[a-z0-9-]+$/.test(slug) && slug.length >= 1 && slug.length <= 100;
}

function sanitizeString(input: unknown, maxLength: number): string {
  if (typeof input !== "string") return "";
  return input
    .trim()
    .slice(0, maxLength)
    .replace(/[<>]/g, ""); // Basic XSS prevention
}

function validateCategoryInput(input: unknown): asserts input is CategoryInput {
  if (typeof input !== "object" || input === null) {
    throw new APIError("Invalid input: expected object", 400, "INVALID_INPUT");
  }

  const data = input as Record<string, unknown>;

  // Validate string fields
  if (data.name !== undefined && (typeof data.name !== "string" || data.name.length > 200)) {
    throw new APIError("Invalid name: must be a string with max 200 characters", 400, "INVALID_NAME");
  }

  if (data.slug !== undefined && !validateSlug(data.slug)) {
    throw new APIError("Invalid slug: must be lowercase alphanumeric with hyphens", 400, "INVALID_SLUG");
  }

  if (data.description !== undefined && typeof data.description !== "string") {
    throw new APIError("Invalid description: must be a string", 400, "INVALID_DESCRIPTION");
  }

  // Validate SEO fields
  if (data.seo_title !== undefined && (typeof data.seo_title !== "string" || data.seo_title.length > 200)) {
    throw new APIError("Invalid seo_title: must be a string with max 200 characters", 400, "INVALID_SEO_TITLE");
  }

  if (data.seo_description !== undefined && (typeof data.seo_description !== "string" || data.seo_description.length > 500)) {
    throw new APIError("Invalid seo_description: must be a string with max 500 characters", 400, "INVALID_SEO_DESCRIPTION");
  }

  // Validate FAQ
  if (data.faq !== undefined) {
    if (!Array.isArray(data.faq)) {
      throw new APIError("Invalid faq: must be an array", 400, "INVALID_FAQ");
    }
    
    for (const item of data.faq) {
      if (
        typeof item !== "object" || 
        item === null ||
        typeof (item as { question?: string }).question !== "string" ||
        typeof (item as { answer?: string }).answer !== "string"
      ) {
        throw new APIError("Invalid faq item: must have question and answer strings", 400, "INVALID_FAQ_ITEM");
      }
    }
  }

  // Validate GEO data
  if (data.geo_data !== undefined) {
    if (typeof data.geo_data !== "object" || data.geo_data === null) {
      throw new APIError("Invalid geo_data: must be an object", 400, "INVALID_GEO_DATA");
    }
    
    const geo = data.geo_data as { keyTakeaways?: unknown; entities?: unknown };
    
    if (geo.keyTakeaways !== undefined && !Array.isArray(geo.keyTakeaways)) {
      throw new APIError("Invalid geo_data.keyTakeaways: must be an array", 400, "INVALID_GEO_TAKEAWAYS");
    }
    
    if (geo.entities !== undefined && !Array.isArray(geo.entities)) {
      throw new APIError("Invalid geo_data.entities: must be an array", 400, "INVALID_GEO_ENTITIES");
    }
  }
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

async function getSupabaseClient() {
  const { createServerClient } = await import("@/lib/supabase");
  return createServerClient();
}

// ============================================================================
// API HANDLERS
// ============================================================================

/**
 * GET /api/categories
 * 
 * Query Parameters:
 * - id: Fetch single category by UUID
 * - slug: Fetch single category by slug
 * 
 * Returns:
 * - All active categories (ordered by sort_order) if no params
 * - Single category if id or slug provided
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const slug = searchParams.get("slug");

    const supabase = await getSupabaseClient();

    // Fetch single category by ID
    if (id) {
      if (!validateUUID(id)) {
        throw new APIError("Invalid category ID format", 400, "INVALID_ID");
      }

      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("id", id)
        .single();
      
      if (error) {
        if (error.code === "PGRST116") {
          throw new APIError("Category not found", 404, "NOT_FOUND");
        }
        throw new APIError("Database error", 500, "DB_ERROR");
      }

      if (!data) {
        throw new APIError("Category not found", 404, "NOT_FOUND");
      }

      return createSuccessResponse({ category: data });
    }

    // Fetch single category by slug
    if (slug) {
      if (!validateSlug(slug)) {
        throw new APIError("Invalid slug format", 400, "INVALID_SLUG");
      }

      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("slug", slug)
        .eq("is_active", true)
        .single();
      
      if (error) {
        if (error.code === "PGRST116") {
          throw new APIError("Category not found", 404, "NOT_FOUND");
        }
        throw new APIError("Database error", 500, "DB_ERROR");
      }

      if (!data) {
        throw new APIError("Category not found", 404, "NOT_FOUND");
      }

      return createSuccessResponse({ category: data });
    }

    // Fetch all active categories
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    
    if (error) {
      throw new APIError("Database error", 500, "DB_ERROR");
    }

    return createSuccessResponse({ categories: data || [] });

  } catch (error) {
    return createErrorResponse(error);
  }
}

/**
 * PUT /api/categories
 * 
 * Body: {
 *   id: string (required)
 *   ...fields to update
 * }
 * 
 * Updates a category with the provided fields.
 * Only updates fields that are explicitly provided (partial update).
 */
export async function PUT(request: NextRequest) {
  try {
    // Parse and validate body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new APIError("Invalid JSON body", 400, "INVALID_JSON");
    }

    if (typeof body !== "object" || body === null) {
      throw new APIError("Invalid body: expected object", 400, "INVALID_BODY");
    }

    const { id, ...updates } = body as { id?: string } & Record<string, unknown>;

    // Validate ID
    if (!id) {
      throw new APIError("Category ID is required", 400, "MISSING_ID");
    }

    if (!validateUUID(id)) {
      throw new APIError("Invalid category ID format", 400, "INVALID_ID");
    }

    // Validate input fields
    validateCategoryInput(updates);

    // Build update object with sanitized values
    const updateData: CategoryInput = {};

    // Core fields
    if (updates.name !== undefined) {
      updateData.name = sanitizeString(updates.name, 200);
    }
    if (updates.slug !== undefined) {
      updateData.slug = sanitizeString(updates.slug.toLowerCase(), 100);
    }
    if (updates.description !== undefined) {
      updateData.description = sanitizeString(updates.description, 2000);
    }
    if (updates.image !== undefined) {
      updateData.image = updates.image ? sanitizeString(updates.image, 500) : null;
    }
    if (updates.icon !== undefined) {
      updateData.icon = updates.icon ? sanitizeString(updates.icon, 50) : null;
    }
    if (updates.sort_order !== undefined) {
      updateData.sort_order = typeof updates.sort_order === "number" 
        ? updates.sort_order 
        : parseInt(String(updates.sort_order), 10) || 0;
    }
    if (updates.is_active !== undefined) {
      updateData.is_active = Boolean(updates.is_active);
    }

    // SEO fields
    if (updates.seo_title !== undefined) {
      updateData.seo_title = updates.seo_title ? sanitizeString(updates.seo_title, 200) : null;
    }
    if (updates.seo_description !== undefined) {
      updateData.seo_description = updates.seo_description 
        ? sanitizeString(updates.seo_description, 500) 
        : null;
    }
    if (updates.seo_keywords !== undefined) {
      updateData.seo_keywords = Array.isArray(updates.seo_keywords)
        ? updates.seo_keywords.map((k: string) => sanitizeString(k, 100))
        : [];
    }

    // Structured data fields
    if (updates.faq !== undefined && updates.faq !== null) {
      updateData.faq = updates.faq.map((item: { question: string; answer: string }) => ({
        question: sanitizeString(item.question, 500),
        answer: sanitizeString(item.answer, 2000)
      }));
    }
    if (updates.geo_data !== undefined && updates.geo_data !== null) {
      updateData.geo_data = {
        keyTakeaways: ((updates.geo_data as { keyTakeaways?: string[] }).keyTakeaways || [])
          .map((k: string) => sanitizeString(k, 200)),
        entities: ((updates.geo_data as { entities?: string[] }).entities || [])
          .map((e: string) => sanitizeString(e, 100))
      };
    }

    // If no fields to update
    if (Object.keys(updateData).length === 0) {
      throw new APIError("No fields to update", 400, "NO_FIELDS");
    }

    // Perform update
    const supabase = await getSupabaseClient();

    const { data, error } = await supabase
      .from("categories")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Category update error:", error);
      
      if (error.code === "PGRST116") {
        throw new APIError("Category not found", 404, "NOT_FOUND");
      }
      
      if (error.code === "23505") { // Unique violation
        throw new APIError("Category with this slug already exists", 409, "DUPLICATE_SLUG");
      }
      
      throw new APIError("Failed to update category", 500, "UPDATE_ERROR");
    }

    if (!data) {
      throw new APIError("Category not found", 404, "NOT_FOUND");
    }

    // Validate response
    if (!isValidCategory(data)) {
      throw new APIError("Invalid data returned from database", 500, "INVALID_RESPONSE");
    }

    // Purge cache (in production, trigger cache invalidation here)
    return createSuccessResponse({ category: data }, 200, false);

  } catch (error) {
    return createErrorResponse(error);
  }
}

/**
 * POST /api/categories
 * 
 * Creates a new category.
 * Required fields: name, slug
 */
export async function POST(request: NextRequest) {
  try {
    // Parse and validate body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new APIError("Invalid JSON body", 400, "INVALID_JSON");
    }

    if (typeof body !== "object" || body === null) {
      throw new APIError("Invalid body: expected object", 400, "INVALID_BODY");
    }

    const data = body as Record<string, unknown>;

    // Validate required fields
    if (!data.name || typeof data.name !== "string" || data.name.length === 0) {
      throw new APIError("Name is required", 400, "MISSING_NAME");
    }

    if (!data.slug || !validateSlug(String(data.slug))) {
      throw new APIError("Valid slug is required", 400, "MISSING_SLUG");
    }

    const supabase = await getSupabaseClient();

    const { data: newCategory, error } = await supabase
      .from("categories")
      .insert({
        name: sanitizeString(data.name, 200),
        slug: sanitizeString(String(data.slug).toLowerCase(), 100),
        description: data.description ? sanitizeString(String(data.description), 2000) : null,
        image: data.image ? sanitizeString(String(data.image), 500) : null,
        icon: data.icon ? sanitizeString(String(data.icon), 50) : "📦",
        sort_order: typeof data.sort_order === "number" ? data.sort_order : 0,
        is_active: data.is_active !== false,
        seo_title: data.seo_title ? sanitizeString(String(data.seo_title), 200) : null,
        seo_description: data.seo_description 
          ? sanitizeString(String(data.seo_description), 500) 
          : null,
        seo_keywords: Array.isArray(data.seo_keywords) ? data.seo_keywords : [],
        faq: Array.isArray(data.faq) ? data.faq : [],
        geo_data: data.geo_data || { keyTakeaways: [], entities: [] }
      })
      .select()
      .single();

    if (error) {
      console.error("Category creation error:", error);
      
      if (error.code === "23505") {
        throw new APIError("Category with this slug already exists", 409, "DUPLICATE_SLUG");
      }
      
      throw new APIError("Failed to create category", 500, "CREATE_ERROR");
    }

    if (!isValidCategory(newCategory)) {
      throw new APIError("Invalid data returned from database", 500, "INVALID_RESPONSE");
    }

    return createSuccessResponse({ category: newCategory }, 201, false);

  } catch (error) {
    return createErrorResponse(error);
  }
}

/**
 * DELETE /api/categories?id={uuid}
 * 
 * Soft-deletes a category by setting is_active to false.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      throw new APIError("Category ID is required", 400, "MISSING_ID");
    }

    if (!validateUUID(id)) {
      throw new APIError("Invalid category ID format", 400, "INVALID_ID");
    }

    const supabase = await getSupabaseClient();

    // Soft delete (set is_active to false)
    const { error } = await supabase
      .from("categories")
      .update({ is_active: false })
      .eq("id", id);

    if (error) {
      console.error("Category delete error:", error);
      throw new APIError("Failed to delete category", 500, "DELETE_ERROR");
    }

    return createSuccessResponse({}, 200, false);

  } catch (error) {
    return createErrorResponse(error);
  }
}
