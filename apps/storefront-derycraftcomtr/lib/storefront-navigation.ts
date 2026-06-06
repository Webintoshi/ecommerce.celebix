import "server-only";

import { createServerClient } from "@/lib/supabase";
import { runCategoriesQuery } from "@/lib/categories-query-compat";
import { maybeListStorefrontCategories } from "@/lib/db/light-postgres-storefront-read";
import { translateCategoryCollection } from "@/lib/translation";
import type { StorefrontLocale } from "@/lib/i18n";

type CategorySourceRecord = {
  id: string;
  name: string;
  slug: string;
  parent_id?: string | null;
  parentId?: string | null;
  sort_order?: number | null;
  sortOrder?: number | null;
  is_active?: boolean | null;
  isActive?: boolean | null;
  description?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
};

export type StorefrontNavigationChild = {
  id: string;
  name: string;
  slug: string;
};

export type StorefrontNavigationCategory = StorefrontNavigationChild & {
  children: StorefrontNavigationChild[];
};

export type StorefrontFooterCategory = StorefrontNavigationChild;

function normalizeCategoryKey(value: string) {
  return value
    .toLocaleLowerCase("tr")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getCategoryPriority(category: { name: string; slug: string }) {
  const normalized = normalizeCategoryKey(`${category.slug} ${category.name}`);

  if (normalized.includes("cuzdan") || normalized.includes("kartlik")) {
    return 0;
  }

  if (normalized.includes("apple watch")) {
    return 1;
  }

  if (normalized.includes("saat kayis") || normalized.includes("watch strap")) {
    return 2;
  }

  if (normalized.includes("canta") || normalized.includes("organizer")) {
    return 3;
  }

  if (normalized.includes("aksesuar")) {
    return 4;
  }

  return 99;
}

function getParentId(category: CategorySourceRecord) {
  return category.parent_id ?? category.parentId ?? null;
}

function getSortOrder(category: CategorySourceRecord) {
  return Number(category.sort_order ?? category.sortOrder ?? 0);
}

function isActiveCategory(category: CategorySourceRecord) {
  const value = category.is_active ?? category.isActive;
  return value !== false;
}

function toNavigationChild(category: CategorySourceRecord): StorefrontNavigationChild {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
  };
}

async function listCategorySourceRecords(locale: StorefrontLocale) {
  const lightPostgresCategories = await maybeListStorefrontCategories();
  if (lightPostgresCategories !== undefined) {
    return translateCategoryCollection(lightPostgresCategories, locale);
  }

  const supabase = createServerClient();
  const { data, error } = await runCategoriesQuery((includeIsActiveFilter) => {
    let query = supabase
      .from("categories")
      .select("*")
      .order("sort_order", { ascending: true });

    if (includeIsActiveFilter) {
      query = query.eq("is_active", true);
    }

    return query;
  });

  if (error) {
    console.error("Failed to load storefront navigation categories:", error);
    return [];
  }

  return translateCategoryCollection((data as CategorySourceRecord[] | null) || [], locale);
}

export async function getStorefrontNavigationCategories(
  locale: StorefrontLocale,
): Promise<StorefrontNavigationCategory[]> {
  const categories = await listCategorySourceRecords(locale);
  const activeCategories = categories
    .filter((category): category is CategorySourceRecord => Boolean(category?.id && category.slug))
    .filter(isActiveCategory)
    .sort((left, right) => {
      const sortDiff = getSortOrder(left) - getSortOrder(right);
      if (sortDiff !== 0) {
        return sortDiff;
      }

      return left.name.localeCompare(right.name, "tr");
    });

  const childrenByParent = new Map<string, StorefrontNavigationChild[]>();

  for (const category of activeCategories) {
    const parentId = getParentId(category);
    if (!parentId) {
      continue;
    }

    const siblings = childrenByParent.get(parentId) || [];
    siblings.push(toNavigationChild(category));
    childrenByParent.set(parentId, siblings);
  }

  return activeCategories
    .filter((category) => !getParentId(category))
    .map((category) => ({
      ...toNavigationChild(category),
      children: (childrenByParent.get(category.id) || []).sort((left, right) =>
        left.name.localeCompare(right.name, "tr"),
      ),
      priority: getCategoryPriority(category),
      sortOrder: getSortOrder(category),
    }))
    .sort((left, right) => {
      const priorityDiff = left.priority - right.priority;
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      const sortDiff = left.sortOrder - right.sortOrder;
      if (sortDiff !== 0) {
        return sortDiff;
      }

      return left.name.localeCompare(right.name, "tr");
    })
    .map(({ priority: _priority, sortOrder: _sortOrder, ...category }) => category);
}

export function getFooterCategoriesFromNavigation(
  navigationCategories: StorefrontNavigationCategory[],
): StorefrontFooterCategory[] {
  return navigationCategories.map(({ id, name, slug }) => ({ id, name, slug }));
}
