import { mirrorCategoryImageToR2 } from "@/lib/category-media-import";
import {
  readCelebixCategoryHierarchyMetadata,
  type CelebixCategoryPathSegment,
} from "@celebix/platform-config";

type JsonObject = Record<string, unknown>;

const OPTIONAL_CATEGORY_COLUMNS = new Set([
  "parent_id",
  "icon",
  "is_active",
  "seo_title",
  "seo_description",
  "seo_keywords",
  "faq",
  "geo_data",
]);

const GENERIC_COMMERCE_TYPE_SLUGS = new Set([
  "simple",
  "variable",
  "variation",
  "grouped",
  "external",
  "downloadable",
  "virtual",
]);

const GENERIC_COMMERCE_CATEGORY_SLUGS = new Set([
  "uncategorized",
]);

function toOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function humanizeSlug(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function extractLastTaxonomySegment(value: string | null): string | null {
  if (!value) return null;
  const segments = value.split(">").map((item) => item.trim()).filter(Boolean);
  return segments[segments.length - 1] || value.trim() || null;
}

function getMissingCategoryColumn(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("message" in error)) return null;
  const message = String(error.message ?? "");
  const match =
    message.match(/Could not find the '([^']+)' column of 'categories'/i) ||
    message.match(/column categories\.([a-z_]+) does not exist/i);
  return match?.[1] ?? null;
}

function stripUnsupportedCategoryColumn<T extends Record<string, unknown>>(
  payload: T,
  error: unknown
): T | null {
  const missingColumn = getMissingCategoryColumn(error);
  if (!missingColumn || !OPTIONAL_CATEGORY_COLUMNS.has(missingColumn) || !(missingColumn in payload)) {
    return null;
  }

  const nextPayload = { ...payload };
  delete nextPayload[missingColumn];
  return nextPayload;
}

function chooseLabelForSlug(slug: string | null, candidates: Array<string | null | undefined>): string | null {
  if (!slug) return null;

  for (const candidate of candidates) {
    const normalizedCandidate = toOptionalString(candidate);
    if (normalizedCandidate && toSlug(normalizedCandidate) === slug) {
      return normalizedCandidate;
    }
  }

  return humanizeSlug(slug);
}

export interface ProductCategoryHierarchy {
  categorySlug: string | null;
  categoryName: string | null;
  categoryImageUrl?: string | null;
  subcategorySlug: string | null;
  subcategoryName: string | null;
  subcategoryImageUrl?: string | null;
  path: Array<{
    slug: string;
    name: string | null;
  }>;
}

function normalizeStoredHierarchyPath(
  path: CelebixCategoryPathSegment[],
): Array<{ slug: string; name: string | null }> {
  const seen = new Set<string>();

  return path
    .filter((segment) => {
      if (!segment.slug || seen.has(segment.slug)) {
        return false;
      }

      seen.add(segment.slug);
      return true;
    })
    .map((segment) => ({
      slug: segment.slug,
      name: segment.name || humanizeSlug(segment.slug),
    }));
}

function buildFallbackHierarchyPath(
  categorySlug: string | null,
  categoryName: string | null,
  subcategorySlug: string | null,
  subcategoryName: string | null,
): Array<{ slug: string; name: string | null }> {
  const path: Array<{ slug: string; name: string | null }> = [];

  if (categorySlug) {
    path.push({
      slug: categorySlug,
      name: categoryName || humanizeSlug(categorySlug),
    });
  }

  if (subcategorySlug && subcategorySlug !== categorySlug) {
    path.push({
      slug: subcategorySlug,
      name: subcategoryName || humanizeSlug(subcategorySlug),
    });
  }

  return path;
}

function alignHierarchyPathWithSlugs(
  inputPath: Array<{ slug: string; name: string | null }>,
  categorySlug: string | null,
  categoryName: string | null,
  subcategorySlug: string | null,
  subcategoryName: string | null,
): Array<{ slug: string; name: string | null }> {
  const nextPath = inputPath.map((segment) => ({ ...segment }));

  if (categorySlug) {
    if (nextPath.length === 0) {
      nextPath.push({
        slug: categorySlug,
        name: categoryName || humanizeSlug(categorySlug),
      });
    } else if (nextPath[0]?.slug !== categorySlug) {
      nextPath[0] = {
        slug: categorySlug,
        name: categoryName || humanizeSlug(categorySlug),
      };
    } else if (!nextPath[0]?.name && categoryName) {
      nextPath[0].name = categoryName;
    }
  }

  const normalizedSubcategorySlug =
    subcategorySlug && subcategorySlug !== categorySlug ? subcategorySlug : null;

  if (!normalizedSubcategorySlug) {
    return nextPath;
  }

  if (nextPath.length === 0) {
    return buildFallbackHierarchyPath(
      categorySlug,
      categoryName,
      normalizedSubcategorySlug,
      subcategoryName,
    );
  }

  if (nextPath.length === 1) {
    nextPath.push({
      slug: normalizedSubcategorySlug,
      name: subcategoryName || humanizeSlug(normalizedSubcategorySlug),
    });
    return nextPath;
  }

  if (nextPath[nextPath.length - 1]?.slug !== normalizedSubcategorySlug) {
    nextPath[nextPath.length - 1] = {
      slug: normalizedSubcategorySlug,
      name: subcategoryName || humanizeSlug(normalizedSubcategorySlug),
    };
  } else if (!nextPath[nextPath.length - 1]?.name && subcategoryName) {
    nextPath[nextPath.length - 1].name = subcategoryName;
  }

  return nextPath;
}

export function deriveCategoryHierarchyFromProduct(input: {
  category?: unknown;
  subcategory?: unknown;
  shopifyMetadata?: JsonObject;
  shopifyMetafields?: JsonObject;
}): ProductCategoryHierarchy {
  let categorySlug = toOptionalString(input.category);
  let subcategorySlug = toOptionalString(input.subcategory);
  const shopifyMetadata = input.shopifyMetadata || {};
  const shopifyMetafields = input.shopifyMetafields || {};
  const storedHierarchy = readCelebixCategoryHierarchyMetadata(shopifyMetadata);
  const storedPath = normalizeStoredHierarchyPath(storedHierarchy.path);

  const rawType = toOptionalString(shopifyMetadata.type);
  const rawProductCategory = extractLastTaxonomySegment(toOptionalString(shopifyMetadata.product_category));
  const rawWatchAccessoryStyle = toOptionalString(shopifyMetafields.watch_accessory_style);
  const normalizedRawType = normalizeImportCategoryCandidate(rawType, { allowGenericType: false, allowGenericCategory: false });
  const normalizedRawProductCategory = normalizeImportCategoryCandidate(rawProductCategory, {
    allowGenericType: false,
    allowGenericCategory: false,
  });
  const fallbackRawProductCategory = normalizeImportCategoryCandidate(rawProductCategory, {
    allowGenericType: false,
    allowGenericCategory: true,
  });

  if (categorySlug && GENERIC_COMMERCE_TYPE_SLUGS.has(categorySlug)) {
    categorySlug =
      toSlug(normalizedRawProductCategory || rawWatchAccessoryStyle || fallbackRawProductCategory || normalizedRawType) || categorySlug;
  }

  if (subcategorySlug && GENERIC_COMMERCE_TYPE_SLUGS.has(subcategorySlug)) {
    subcategorySlug = null;
  }

  if (subcategorySlug && categorySlug && subcategorySlug === categorySlug) {
    subcategorySlug = null;
  }

  const categoryName =
    chooseLabelForSlug(categorySlug, [rawProductCategory, rawType, rawWatchAccessoryStyle]) ||
    storedPath[0]?.name ||
    null;
  const subcategoryName =
    chooseLabelForSlug(subcategorySlug, [rawWatchAccessoryStyle, rawType, rawProductCategory]) ||
    (storedPath.length > 1 ? storedPath[storedPath.length - 1]?.name || null : null);
  const path = alignHierarchyPathWithSlugs(
    storedPath.length > 0
      ? storedPath
      : buildFallbackHierarchyPath(categorySlug, categoryName, subcategorySlug, subcategoryName),
    categorySlug,
    categoryName,
    subcategorySlug,
    subcategoryName,
  );

  return {
    categorySlug,
    categoryName,
    subcategorySlug,
    subcategoryName,
    path,
  };
}

function normalizeImportCategoryCandidate(
  value: string | null,
  options: {
    allowGenericType: boolean;
    allowGenericCategory: boolean;
  }
): string {
  const normalizedValue = toOptionalString(value);
  if (!normalizedValue) return "";

  const slug = toSlug(normalizedValue);
  if (!options.allowGenericType && GENERIC_COMMERCE_TYPE_SLUGS.has(slug)) {
    return "";
  }

  if (!options.allowGenericCategory && GENERIC_COMMERCE_CATEGORY_SLUGS.has(slug)) {
    return "";
  }

  return normalizedValue;
}

async function getCategoryBySlug(supabase: any, slug: string) {
  const { data, error } = await supabase
    .from("categories")
    .select("id, slug, name, parent_id, image")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as { id: string; slug: string; name: string | null; parent_id: string | null; image: string | null } | null;
}

async function createCategoryRecord(
  supabase: any,
  payload: Record<string, unknown>
): Promise<{ id: string; slug: string; name: string | null; parent_id: string | null; image: string | null }> {
  let insertPayload = { ...payload };

  while (true) {
    const { data, error } = await supabase
      .from("categories")
      .insert(insertPayload)
      .select("id, slug, name, parent_id, image")
      .single();

    if (!error) {
      return data;
    }

    if (error.code === "23505") {
      const existing = await getCategoryBySlug(supabase, String(payload.slug));
      if (existing) {
        return existing;
      }
    }

    const nextPayload = stripUnsupportedCategoryColumn(insertPayload, error);
    if (!nextPayload) {
      throw error;
    }
    insertPayload = nextPayload;
  }
}

async function updateCategoryRecord(supabase: any, id: string, payload: Record<string, unknown>) {
  if (Object.keys(payload).length === 0) return;

  let updatePayload = { ...payload };
  while (true) {
    const { error } = await supabase
      .from("categories")
      .update(updatePayload)
      .eq("id", id);

    if (!error) {
      return;
    }

    const nextPayload = stripUnsupportedCategoryColumn(updatePayload, error);
    if (!nextPayload) {
      throw error;
    }
    updatePayload = nextPayload;
  }
}

async function ensureCategoryRecord(
  supabase: any,
  input: { slug: string | null; name: string | null; imageUrl?: string | null; parentId?: string | null },
  cache: Map<string, string>
): Promise<{ id: string; slug: string; name: string | null; parent_id: string | null; image: string | null } | null> {
  if (!input.slug) return null;

  const desiredName = input.name || humanizeSlug(input.slug);
  const mirroredImageUrl = input.imageUrl
    ? await mirrorCategoryImageToR2(input.imageUrl, {
        slug: input.slug,
        name: desiredName,
        cache,
      })
    : null;
  const existing = await getCategoryBySlug(supabase, input.slug);

  if (existing) {
    const needsParentUpdate =
      input.parentId !== undefined &&
      (existing.parent_id || null) !== (input.parentId || null);

    const shouldReviveName = !existing.name || existing.name.trim().length === 0;
    const shouldAssignImage = !existing.image && mirroredImageUrl;

    if (needsParentUpdate || shouldReviveName || shouldAssignImage) {
      await updateCategoryRecord(supabase, existing.id, {
        ...(needsParentUpdate ? { parent_id: input.parentId || null } : {}),
        ...(shouldReviveName ? { name: desiredName } : {}),
        ...(shouldAssignImage ? { image: mirroredImageUrl } : {}),
        is_active: true,
      });
      return {
        ...existing,
        name: shouldReviveName ? desiredName : existing.name,
        parent_id: needsParentUpdate ? input.parentId || null : existing.parent_id,
        image: shouldAssignImage ? mirroredImageUrl : existing.image,
      };
    }

    await updateCategoryRecord(supabase, existing.id, { is_active: true });
    return existing;
  }

  return createCategoryRecord(supabase, {
    name: desiredName,
    slug: input.slug,
    description: null,
    image: mirroredImageUrl,
    parent_id: input.parentId || null,
    sort_order: 0,
    icon: "paket",
    is_active: true,
    seo_title: null,
    seo_description: null,
    seo_keywords: [],
    faq: [],
    geo_data: { keyTakeaways: [], entities: [] },
  });
}

export async function ensureProductCategoryHierarchy(
  supabase: any,
  hierarchy: ProductCategoryHierarchy
): Promise<void> {
  if (!hierarchy.categorySlug) return;
  const cache = new Map<string, string>();
  const path =
    hierarchy.path.length > 0
      ? hierarchy.path
      : buildFallbackHierarchyPath(
          hierarchy.categorySlug,
          hierarchy.categoryName,
          hierarchy.subcategorySlug,
          hierarchy.subcategoryName,
        );

  let parentId: string | null = null;

  for (let index = 0; index < path.length; index += 1) {
    const segment = path[index];
    const record = await ensureCategoryRecord(
      supabase,
      {
        slug: segment.slug,
        name: segment.name || humanizeSlug(segment.slug),
        imageUrl:
          index === 0
            ? hierarchy.categoryImageUrl
            : index === path.length - 1
              ? hierarchy.subcategoryImageUrl || hierarchy.categoryImageUrl
              : null,
        parentId,
      },
      cache,
    );

    if (!record?.id) {
      return;
    }

    parentId = record.id;
  }
}

async function getChildCategoryIds(supabase: any, parentId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id")
    .eq("parent_id", parentId);

  if (error) {
    throw error;
  }

  return (data || []).map((row: { id: string }) => row.id);
}

export async function deleteCategoryHierarchy(
  supabase: any,
  categoryId: string,
  softDelete: boolean
): Promise<void> {
  const childIds = await getChildCategoryIds(supabase, categoryId);
  for (const childId of childIds) {
    await deleteCategoryHierarchy(supabase, childId, softDelete);
  }

  if (softDelete) {
    let deletePayload: Record<string, unknown> = { is_active: false };

    while (true) {
      const { error } = await supabase
        .from("categories")
        .update(deletePayload)
        .eq("id", categoryId);

      if (!error) {
        return;
      }

      const nextPayload = stripUnsupportedCategoryColumn(deletePayload, error);
      if (!nextPayload) {
        throw error;
      }

      if (!("is_active" in nextPayload)) {
        await deleteCategoryHierarchy(supabase, categoryId, false);
        return;
      }

      deletePayload = nextPayload;
    }
  }

  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", categoryId);

  if (error) {
    throw error;
  }
}
