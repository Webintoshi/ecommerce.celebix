import { NextRequest, NextResponse } from "next/server";
import type { PageApiResponse, PageCmsData, PageGEO, PageInput, StaticPageStatus } from "@/types/page";
import { isValidPage } from "@/types/page";

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

function createErrorResponse(error: unknown): NextResponse<PageApiResponse> {
  if (error instanceof APIError) {
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status: error.statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
    );
  }
  console.error("Unexpected API error:", error);
  return NextResponse.json(
    { success: false, error: "Internal server error", code: "INTERNAL_ERROR" },
    { status: 500, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
  );
}

function createSuccessResponse(data: Partial<PageApiResponse>, status: number = 200): NextResponse<PageApiResponse> {
  return NextResponse.json(
    { success: true, ...data },
    { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
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
  return /^[a-z0-9-]*$/.test(slug) && slug.length <= 100;
}

function sanitizeString(input: unknown, maxLength: number): string {
  if (typeof input !== "string") return "";
  return input.trim().slice(0, maxLength).replace(/[<>]/g, "");
}

function sanitizeContent(input: unknown, maxLength: number): string {
  if (typeof input !== "string") return "";
  return input.trim().slice(0, maxLength);
}

function isValidPageStatus(status: unknown): status is StaticPageStatus {
  return status === "published" || status === "draft" || status === "archived";
}

function extractExistingCmsData(geoData: unknown): PageCmsData | undefined {
  if (!geoData || typeof geoData !== "object") {
    return undefined;
  }

  const maybeCms = (geoData as { cms?: unknown }).cms;
  if (!maybeCms || typeof maybeCms !== "object") {
    return undefined;
  }

  const content = typeof (maybeCms as { content?: unknown }).content === "string"
    ? sanitizeContent((maybeCms as { content?: string }).content, 50000)
    : undefined;
  const status = isValidPageStatus((maybeCms as { status?: unknown }).status)
    ? (maybeCms as { status?: StaticPageStatus }).status
    : undefined;

  if (!content && !status) {
    return undefined;
  }

  return { content, status };
}

function normalizePageGeoData(
  geoData: unknown,
  cmsOverrides?: Partial<PageCmsData>,
): PageGEO {
  const baseGeoData = geoData && typeof geoData === "object" ? geoData as {
    keyTakeaways?: unknown;
    entities?: unknown;
  } : {};

  const existingCms = extractExistingCmsData(geoData);
  const mergedCms: PageCmsData = {
    content: cmsOverrides?.content ?? existingCms?.content ?? null,
    status: cmsOverrides?.status ?? existingCms?.status ?? null,
  };

  return {
    keyTakeaways: Array.isArray(baseGeoData.keyTakeaways)
      ? baseGeoData.keyTakeaways.map((k) => sanitizeString(k, 200))
      : [],
    entities: Array.isArray(baseGeoData.entities)
      ? baseGeoData.entities.map((e) => sanitizeString(e, 100))
      : [],
    cms: mergedCms,
  };
}

function validatePageInput(input: unknown): asserts input is PageInput {
  if (typeof input !== "object" || input === null) {
    throw new APIError("Invalid input: expected object", 400, "INVALID_INPUT");
  }

  const data = input as Record<string, unknown>;

  if (data.name !== undefined && (typeof data.name !== "string" || data.name.length > 200)) {
    throw new APIError("Invalid name", 400, "INVALID_NAME");
  }

  if (data.slug !== undefined && !validateSlug(data.slug)) {
    throw new APIError("Invalid slug", 400, "INVALID_SLUG");
  }

  if (data.seo_title !== undefined && (typeof data.seo_title !== "string" || data.seo_title.length > 200)) {
    throw new APIError("Invalid seo_title", 400, "INVALID_SEO_TITLE");
  }

  if (data.seo_description !== undefined && (typeof data.seo_description !== "string" || data.seo_description.length > 500)) {
    throw new APIError("Invalid seo_description", 400, "INVALID_SEO_DESCRIPTION");
  }

  if (data.faq !== undefined && !Array.isArray(data.faq)) {
    throw new APIError("Invalid faq", 400, "INVALID_FAQ");
  }

  if (data.geo_data !== undefined && (typeof data.geo_data !== "object" || data.geo_data === null)) {
    throw new APIError("Invalid geo_data", 400, "INVALID_GEO_DATA");
  }

  if (data.content !== undefined && typeof data.content !== "string") {
    throw new APIError("Invalid content", 400, "INVALID_CONTENT");
  }

  if (data.status !== undefined && !isValidPageStatus(data.status)) {
    throw new APIError("Invalid status", 400, "INVALID_STATUS");
  }
}

async function getSupabaseClient() {
  const { createServerClient } = await import("@/lib/supabase");
  return createServerClient();
}

// ============================================================================
// API HANDLERS
// ============================================================================

/**
 * GET /api/pages
 * 
 * Returns all active static pages ordered by sort_order
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const slug = searchParams.get("slug");
    const includeInactive = searchParams.get("include_inactive") === "1";

    const supabase = await getSupabaseClient();

    // Fetch single page by ID
    if (id) {
      if (!validateUUID(id)) {
        throw new APIError("Invalid page ID format", 400, "INVALID_ID");
      }

      const { data, error } = await supabase
        .from("pages")
        .select("*")
        .eq("id", id)
        .single();
      
      if (error) {
        if (error.code === "PGRST116") {
          throw new APIError("Page not found", 404, "NOT_FOUND");
        }
        throw new APIError("Database error", 500, "DB_ERROR");
      }

      return createSuccessResponse({ page: data });
    }

    // Fetch single page by slug
    if (slug !== null) {
      const { data, error } = await supabase
        .from("pages")
        .select("*")
        .eq("slug", slug)
        .eq("is_active", true)
        .single();
      
      if (error) {
        if (error.code === "PGRST116") {
          throw new APIError("Page not found", 404, "NOT_FOUND");
        }
        throw new APIError("Database error", 500, "DB_ERROR");
      }

      return createSuccessResponse({ page: data });
    }

    let pagesQuery = supabase
      .from("pages")
      .select("*")
      .order("sort_order", { ascending: true });

    if (!includeInactive) {
      pagesQuery = pagesQuery.eq("is_active", true);
    }

    const { data, error } = await pagesQuery;
    
    if (error) {
      throw new APIError("Database error", 500, "DB_ERROR");
    }

    return createSuccessResponse({ pages: data || [] });

  } catch (error) {
    return createErrorResponse(error);
  }
}

/**
 * PUT /api/pages
 * 
 * Update a static page (SEO fields, etc.)
 */
export async function PUT(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new APIError("Invalid JSON body", 400, "INVALID_JSON");
    }

    if (typeof body !== "object" || body === null) {
      throw new APIError("Invalid body", 400, "INVALID_BODY");
    }

    const { id, ...updates } = body as { id?: string } & Record<string, unknown>;

    if (!id) {
      throw new APIError("Page ID is required", 400, "MISSING_ID");
    }

    if (!validateUUID(id)) {
      throw new APIError("Invalid page ID format", 400, "INVALID_ID");
    }

    validatePageInput(updates);

    const supabase = await getSupabaseClient();
    const { data: existingPage, error: existingPageError } = await supabase
      .from("pages")
      .select("geo_data")
      .eq("id", id)
      .single();

    if (existingPageError) {
      if (existingPageError.code === "PGRST116") {
        throw new APIError("Page not found", 404, "NOT_FOUND");
      }

      throw new APIError("Database error", 500, "DB_ERROR");
    }

    // Build update object
    const updateData: PageInput = {};

    if (updates.name !== undefined) updateData.name = sanitizeString(updates.name, 200);
    if (updates.slug !== undefined) updateData.slug = sanitizeString(updates.slug, 100);
    if (updates.schema_type !== undefined) updateData.schema_type = sanitizeString(String(updates.schema_type), 50);
    if (updates.icon !== undefined) updateData.icon = updates.icon ? sanitizeString(String(updates.icon), 50) : undefined;
    if (updates.is_active !== undefined) updateData.is_active = Boolean(updates.is_active);
    if (updates.sort_order !== undefined) updateData.sort_order = typeof updates.sort_order === "number" ? updates.sort_order : parseInt(String(updates.sort_order), 10) || 0;

    // SEO fields
    if (updates.seo_title !== undefined) updateData.seo_title = updates.seo_title ? sanitizeString(updates.seo_title, 200) : null;
    if (updates.seo_description !== undefined) updateData.seo_description = updates.seo_description ? sanitizeString(updates.seo_description, 500) : null;
    if (updates.seo_keywords !== undefined) updateData.seo_keywords = Array.isArray(updates.seo_keywords) ? updates.seo_keywords.map(k => sanitizeString(k, 100)) : [];

    // Structured data
    if (updates.faq !== undefined && updates.faq !== null) {
      updateData.faq = updates.faq.map((item: { question: string; answer: string }) => ({
        question: sanitizeString(item.question, 500),
        answer: sanitizeString(item.answer, 2000)
      }));
    }

    const requestedStatus = isValidPageStatus(updates.status)
      ? updates.status
      : extractExistingCmsData(existingPage?.geo_data)?.status ?? undefined;
    const requestedContent = updates.content !== undefined
      ? sanitizeContent(updates.content, 50000)
      : extractExistingCmsData(existingPage?.geo_data)?.content ?? undefined;

    if (updates.status !== undefined) {
      updateData.is_active = updates.status === "published";
    }

    if (updates.geo_data !== undefined || updates.content !== undefined || updates.status !== undefined) {
      updateData.geo_data = normalizePageGeoData(
        updates.geo_data ?? existingPage?.geo_data,
        {
          content: requestedContent,
          status: requestedStatus,
        },
      );
    }

    if (Object.keys(updateData).length === 0) {
      throw new APIError("No fields to update", 400, "NO_FIELDS");
    }

    const { data, error } = await supabase
      .from("pages")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Page update error:", error);
      
      if (error.code === "PGRST116") {
        throw new APIError("Page not found", 404, "NOT_FOUND");
      }
      
      if (error.code === "23505") {
        throw new APIError("Page with this slug already exists", 409, "DUPLICATE_SLUG");
      }
      
      throw new APIError("Failed to update page", 500, "UPDATE_ERROR");
    }

    if (!isValidPage(data)) {
      throw new APIError("Invalid data returned from database", 500, "INVALID_RESPONSE");
    }

    return createSuccessResponse({ page: data }, 200);

  } catch (error) {
    return createErrorResponse(error);
  }
}

/**
 * POST /api/pages
 * 
 * Create a new static page (admin use)
 */
export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new APIError("Invalid JSON body", 400, "INVALID_JSON");
    }

    if (typeof body !== "object" || body === null) {
      throw new APIError("Invalid body", 400, "INVALID_BODY");
    }

    const data = body as Record<string, unknown>;

    if (!data.name || typeof data.name !== "string" || data.name.length === 0) {
      throw new APIError("Name is required", 400, "MISSING_NAME");
    }

    if (data.slug !== undefined && !validateSlug(String(data.slug))) {
      throw new APIError("Valid slug is required", 400, "MISSING_SLUG");
    }

    const supabase = await getSupabaseClient();
    const requestedStatus = isValidPageStatus(data.status)
      ? data.status
      : data.is_active === false
        ? "draft"
        : "published";
    const requestedContent = data.content !== undefined
      ? sanitizeContent(data.content, 50000)
      : "";

    const { data: newPage, error } = await supabase
      .from("pages")
      .insert({
        name: sanitizeString(data.name, 200),
        slug: data.slug ? sanitizeString(String(data.slug), 100) : "",
        schema_type: data.schema_type ? sanitizeString(String(data.schema_type), 50) : "WebPage",
        icon: data.icon ? sanitizeString(String(data.icon), 50) : null,
        is_active: requestedStatus === "published",
        sort_order: typeof data.sort_order === "number" ? data.sort_order : 0,
        seo_title: data.seo_title ? sanitizeString(String(data.seo_title), 200) : null,
        seo_description: data.seo_description ? sanitizeString(String(data.seo_description), 500) : null,
        seo_keywords: Array.isArray(data.seo_keywords) ? data.seo_keywords : [],
        faq: Array.isArray(data.faq) ? data.faq : [],
        geo_data: normalizePageGeoData(
          data.geo_data,
          {
            content: requestedContent,
            status: requestedStatus,
          },
        ),
      })
      .select()
      .single();

    if (error) {
      console.error("Page creation error:", error);
      
      if (error.code === "23505") {
        throw new APIError("Page with this slug already exists", 409, "DUPLICATE_SLUG");
      }
      
      throw new APIError("Failed to create page", 500, "CREATE_ERROR");
    }

    if (!isValidPage(newPage)) {
      throw new APIError("Invalid data returned from database", 500, "INVALID_RESPONSE");
    }

    return createSuccessResponse({ page: newPage }, 201);

  } catch (error) {
    return createErrorResponse(error);
  }
}
