function toOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeForMatch(...parts: Array<string | null | undefined>): string {
  return parts
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0131/g, "i")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cloneJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return { ...(value as Record<string, unknown>) };
}

function humanizeSlug(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export interface CelebixCategoryPathSegment {
  slug: string;
  name: string;
}

function normalizeCategoryPathSegment(value: unknown): CelebixCategoryPathSegment | null {
  if (typeof value === "string") {
    const slug = toOptionalString(value);
    return slug ? { slug, name: humanizeSlug(slug) } : null;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const slug = toOptionalString(record.slug);
  if (!slug) {
    return null;
  }

  return {
    slug,
    name: toOptionalString(record.name) || humanizeSlug(slug),
  };
}

function normalizeCategoryPath(value: unknown): CelebixCategoryPathSegment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();

  return value
    .map((segment) => normalizeCategoryPathSegment(segment))
    .filter((segment): segment is CelebixCategoryPathSegment => Boolean(segment))
    .filter((segment) => {
      if (seen.has(segment.slug)) {
        return false;
      }

      seen.add(segment.slug);
      return true;
    });
}

function buildFallbackCategoryPath(
  categorySlug: string | null,
  subcategorySlug: string | null,
): CelebixCategoryPathSegment[] {
  const path: CelebixCategoryPathSegment[] = [];

  if (categorySlug) {
    path.push({
      slug: categorySlug,
      name: humanizeSlug(categorySlug),
    });
  }

  if (subcategorySlug && subcategorySlug !== categorySlug) {
    path.push({
      slug: subcategorySlug,
      name: humanizeSlug(subcategorySlug),
    });
  }

  return path;
}

function alignCategoryPathWithExplicitSlugs(
  inputPath: CelebixCategoryPathSegment[],
  categorySlug: string | null,
  subcategorySlug: string | null,
): CelebixCategoryPathSegment[] {
  const nextPath = inputPath.map((segment) => ({ ...segment }));

  if (categorySlug) {
    if (nextPath.length === 0) {
      nextPath.push({
        slug: categorySlug,
        name: humanizeSlug(categorySlug),
      });
    } else if (nextPath[0]?.slug !== categorySlug) {
      nextPath[0] = {
        slug: categorySlug,
        name: humanizeSlug(categorySlug),
      };
    }
  }

  const normalizedSubcategorySlug =
    subcategorySlug && subcategorySlug !== categorySlug ? subcategorySlug : null;

  if (!normalizedSubcategorySlug) {
    return normalizeCategoryPath(nextPath);
  }

  if (nextPath.length === 0) {
    return buildFallbackCategoryPath(categorySlug, normalizedSubcategorySlug);
  }

  if (nextPath.length === 1) {
    nextPath.push({
      slug: normalizedSubcategorySlug,
      name: humanizeSlug(normalizedSubcategorySlug),
    });
    return normalizeCategoryPath(nextPath);
  }

  if (nextPath[nextPath.length - 1]?.slug !== normalizedSubcategorySlug) {
    nextPath[nextPath.length - 1] = {
      slug: normalizedSubcategorySlug,
      name: humanizeSlug(normalizedSubcategorySlug),
    };
  }

  return normalizeCategoryPath(nextPath);
}

export interface CelebixCategoryHierarchyMetadata {
  categorySlug: string | null;
  subcategorySlug: string | null;
  path: CelebixCategoryPathSegment[];
}

export function readCelebixCategoryHierarchyMetadata(value: unknown): CelebixCategoryHierarchyMetadata {
  const metadata = cloneJsonObject(value);
  const hierarchy = cloneJsonObject(metadata.celebix_category_hierarchy);
  const explicitPath = normalizeCategoryPath(hierarchy.path);
  const categorySlug = toOptionalString(hierarchy.categorySlug) || explicitPath[0]?.slug || null;
  const inferredSubcategorySlug =
    explicitPath.length > 1 ? explicitPath[explicitPath.length - 1]?.slug || null : null;
  const subcategorySlug = toOptionalString(hierarchy.subcategorySlug) || inferredSubcategorySlug;
  const path =
    explicitPath.length > 0
      ? alignCategoryPathWithExplicitSlugs(explicitPath, categorySlug, subcategorySlug)
      : buildFallbackCategoryPath(categorySlug, subcategorySlug);

  return {
    categorySlug,
    subcategorySlug,
    path,
  };
}

export function inferLegacySubcategorySlug(input: {
  category?: unknown;
  subcategory?: unknown;
  name?: unknown;
  slug?: unknown;
  tags?: unknown;
  metadata?: unknown;
}): string | null {
  const explicitSubcategory = toOptionalString(input.subcategory);
  if (explicitSubcategory) return explicitSubcategory;

  const storedHierarchy = readCelebixCategoryHierarchyMetadata(input.metadata);
  if (storedHierarchy.subcategorySlug) {
    return storedHierarchy.subcategorySlug;
  }

  if (storedHierarchy.path.length > 1) {
    return storedHierarchy.path[storedHierarchy.path.length - 1]?.slug || null;
  }

  const category = toOptionalString(input.category) || storedHierarchy.categorySlug;
  if (!category) return null;

  const tags = Array.isArray(input.tags)
    ? input.tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
    : [];
  const source = normalizeForMatch(
    toOptionalString(input.name),
    toOptionalString(input.slug),
    ...tags
  );

  if (!source) return null;

  if (category === "apple-watch-saat-kayislari") {
    if (source.includes("bund")) return "bund-apple-watch-kayisi";
    if (source.includes("cift katli")) return "cift-katli-apple-watch-kayisi";
    if (source.includes("tek katli")) return "tek-katli-apple-watch-kayisi";
    return null;
  }

  if (category === "saat-kayislari") {
    if (source.includes("bund")) return "bund-saat-kayislari";
    if (source.includes("cift katli")) return "cift-katli-saat-kayislari";
    if (source.includes("tek katli")) return "tek-katli-saat-kayislari";
    return null;
  }

  if (category === "aksesuar") {
    if (source.includes("airpods") || source.includes("airtag") || source.includes("apple")) {
      return "apple-aksesuarlari";
    }

    if (source.includes("bakim") || source.includes("leather balm") || source.includes("balm")) {
      return "bakim-urunleri";
    }

    if (source.includes("saat kesesi") || source.includes("watch pouch") || source.includes("watch case")) {
      return "saat-aksesuarlari";
    }

    if (
      source.includes("kalem") ||
      source.includes("bardak altligi") ||
      source.includes("tepsi") ||
      source.includes("desk")
    ) {
      return "ev-ofis";
    }

    if (
      source.includes("anahtar") ||
      source.includes("gozluk") ||
      source.includes("cakmak") ||
      source.includes("caki") ||
      source.includes("kablo") ||
      source.includes("tutun") ||
      source.includes("ruj")
    ) {
      return "gunluk-yasam";
    }
  }

  return null;
}

export function withCelebixCategoryHierarchyMetadata(
  metadata: unknown,
  input: {
    category?: unknown;
    subcategory?: unknown;
    categoryPath?: unknown;
    name?: unknown;
    slug?: unknown;
    tags?: unknown;
  }
): Record<string, unknown> {
  const nextMetadata = cloneJsonObject(metadata);
  const storedHierarchy = readCelebixCategoryHierarchyMetadata(metadata);
  let categorySlug = toOptionalString(input.category) || storedHierarchy.categorySlug;
  const subcategorySlug = inferLegacySubcategorySlug({
    category: categorySlug,
    subcategory: input.subcategory,
    name: input.name,
    slug: input.slug,
    tags: input.tags,
    metadata,
  });
  const explicitPath = normalizeCategoryPath(input.categoryPath);
  const preservedPath =
    explicitPath.length > 0
      ? explicitPath
      : storedHierarchy.path.length > 0 &&
          (!categorySlug || storedHierarchy.categorySlug === categorySlug) &&
          (!subcategorySlug || storedHierarchy.subcategorySlug === subcategorySlug)
        ? storedHierarchy.path
        : [];
  const path = alignCategoryPathWithExplicitSlugs(
    preservedPath.length > 0
      ? preservedPath
      : buildFallbackCategoryPath(categorySlug, subcategorySlug),
    categorySlug,
    subcategorySlug,
  );

  categorySlug = categorySlug || path[0]?.slug || null;
  const normalizedSubcategorySlug =
    subcategorySlug ||
    (path.length > 1 ? path[path.length - 1]?.slug || null : null);

  nextMetadata.celebix_category_hierarchy = {
    categorySlug,
    subcategorySlug:
      normalizedSubcategorySlug && normalizedSubcategorySlug !== categorySlug
        ? normalizedSubcategorySlug
        : null,
    path,
  };

  return nextMetadata;
}
