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

export interface CelebixCategoryHierarchyMetadata {
  categorySlug: string | null;
  subcategorySlug: string | null;
}

export function readCelebixCategoryHierarchyMetadata(value: unknown): CelebixCategoryHierarchyMetadata {
  const metadata = cloneJsonObject(value);
  const hierarchy = cloneJsonObject(metadata.celebix_category_hierarchy);

  return {
    categorySlug: toOptionalString(hierarchy.categorySlug),
    subcategorySlug: toOptionalString(hierarchy.subcategorySlug),
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
    name?: unknown;
    slug?: unknown;
    tags?: unknown;
  }
): Record<string, unknown> {
  const nextMetadata = cloneJsonObject(metadata);
  const categorySlug = toOptionalString(input.category);
  const subcategorySlug = inferLegacySubcategorySlug({
    category: categorySlug,
    subcategory: input.subcategory,
    name: input.name,
    slug: input.slug,
    tags: input.tags,
    metadata,
  });

  nextMetadata.celebix_category_hierarchy = {
    categorySlug,
    subcategorySlug,
  };

  return nextMetadata;
}
