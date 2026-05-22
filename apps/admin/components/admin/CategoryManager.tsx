"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  fetchCategories,
  addCategory,
  updateCategory,
  deleteCategory,
} from "@/lib/categories";
import { CategoryInfo } from "@/types/product";
import {
  Plus,
  Edit,
  Trash2,
  Search,
  ChevronRight,
  ChevronDown,
  Image as ImageIcon,
  X,
  Check,
  AlertCircle,
  Loader2,
  Save,
  FolderTree,
  BadgeCheck,
  Star,
  GitBranch,
  Filter,
} from "lucide-react";
import { fetchAdminJson } from "@/lib/admin-client-fetch";
import {
  SUPPORTED_IMAGE_ACCEPT,
  SUPPORTED_IMAGE_FORMATS_WITH_GIF_LABEL,
} from "@celebix/platform-config/src/image-formats";

interface CategoryFormData {
  id?: string;
  name: string;
  slug: string;
  description: string;
  image: string;
  icon: string;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
  seo_title: string;
  seo_description: string;
}

interface Toast {
  id: string;
  type: "success" | "error" | "info";
  message: string;
}

const INPUT_CLASSNAME =
  "w-full rounded-2xl border border-[#E7EAF0] bg-white px-4 py-3 text-sm text-[#1F2937] outline-none transition duration-200 placeholder:text-[#9CA3AF] focus:border-[#FF6A00]/50 focus:ring-4 focus:ring-[rgba(255,106,0,0.14)]";

const SECTION_CLASSNAME =
  "rounded-[24px] border border-[#E7EAF0] bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.05)] md:p-6";

const SURFACE_FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)]";

const ACTION_BUTTON_CLASSNAME =
  "inline-flex h-10 items-center justify-center gap-2 rounded-2xl border bg-white px-3.5 text-sm font-medium transition hover:bg-[#F9FAFB]";

const MAX_HOMEPAGE_FEATURED_CATEGORIES = 4;
const MAX_HOMEPAGE_FEATURED_PRODUCTS_TOTAL = 16;

interface HomepageCurationState {
  featuredCategorySlugs: string[];
  featuredProductIdsByCategory: Record<string, string[]>;
  enforceFeaturedProductCaps: boolean;
}

function normalizeHomepageFeaturedProductIdsByCategory(
  value: unknown,
  featuredCategorySlugs: string[],
): Record<string, string[]> {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const allowedSlugs = new Set(featuredCategorySlugs);

  let remainingCapacity = MAX_HOMEPAGE_FEATURED_PRODUCTS_TOTAL;

  return featuredCategorySlugs.reduce<Record<string, string[]>>((result, slug) => {
    const normalizedKey = slug.trim();
    if (!normalizedKey || !allowedSlugs.has(normalizedKey) || remainingCapacity <= 0) {
      return result;
    }

    const rawValue = record[slug] ?? record[normalizedKey];
    const normalizedIds = Array.isArray(rawValue)
      ? rawValue
          .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
          .map((entry) => entry.trim())
          .filter((entry, index, source) => source.indexOf(entry) === index)
          .slice(0, Math.min(4, remainingCapacity))
      : [];

    if (normalizedIds.length > 0) {
      result[normalizedKey] = normalizedIds;
      remainingCapacity -= normalizedIds.length;
    }

    return result;
  }, {});
}

function normalizeHomepageFeaturedCategorySlugs(value: unknown): string[] {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const slugs = Array.isArray(record.featuredCategorySlugs)
    ? record.featuredCategorySlugs.filter(
        (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
      )
    : [];

  return slugs
    .map((entry) => entry.trim())
    .filter((entry, index, source) => source.indexOf(entry) === index)
    .slice(0, MAX_HOMEPAGE_FEATURED_CATEGORIES);
}

function flattenCategoryTree(categories: CategoryInfo[]): CategoryInfo[] {
  return categories.flatMap((category) => [
    category,
    ...flattenCategoryTree(category.children || []),
  ]);
}

function filterCategoryTree(categories: CategoryInfo[], query: string): CategoryInfo[] {
  const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");

  if (!normalizedQuery) {
    return categories;
  }

  return categories.reduce<CategoryInfo[]>((result, category) => {
    const filteredChildren = filterCategoryTree(category.children || [], normalizedQuery);
    const matches =
      category.name.toLocaleLowerCase("tr-TR").includes(normalizedQuery) ||
      (category.description || "").toLocaleLowerCase("tr-TR").includes(normalizedQuery);

    if (matches || filteredChildren.length > 0) {
      result.push({
        ...category,
        children: matches ? category.children || [] : filteredChildren,
      });
    }

    return result;
  }, []);
}

function buildCategoryAncestorIdChain(
  category: CategoryInfo,
  categoryById: Map<string, CategoryInfo>,
): string[] {
  const ancestorIds: string[] = [];
  let currentParentId = category.parent_id;

  while (currentParentId) {
    ancestorIds.push(currentParentId);
    currentParentId = categoryById.get(currentParentId)?.parent_id || null;
  }

  return ancestorIds;
}

export default function CategoryManager() {
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingCategory, setEditingCategory] = useState<CategoryInfo | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState<CategoryFormData>({
    name: "",
    slug: "",
    description: "",
    image: "",
    icon: "",
    parent_id: null,
    sort_order: 0,
    is_active: true,
    seo_title: "",
    seo_description: "",
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [featuredCategorySlugs, setFeaturedCategorySlugs] = useState<string[]>([]);
  const [homepageCuration, setHomepageCuration] = useState<HomepageCurationState>({
    featuredCategorySlugs: [],
    featuredProductIdsByCategory: {},
    enforceFeaturedProductCaps: false,
  });
  const [featuredSavingSlug, setFeaturedSavingSlug] = useState<string | null>(null);

  const showToast = (type: Toast["type"], message: string) => {
    const id = Date.now().toString();
    setToast({ id, type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const loadCategories = useCallback(async () => {
    setLoading(true);
    try {
      const [data, homepageCurationResponse] = await Promise.all([
        fetchCategories({ fresh: true }),
        fetchAdminJson<{
          homepageCuration?: {
            featuredCategorySlugs?: string[];
            featuredProductIdsByCategory?: Record<string, string[]>;
            enforceFeaturedProductCaps?: boolean;
          };
        }>(
          "/api/settings?type=homepage-curation",
          { timeoutMs: 10000 },
        ),
      ]);
      const normalizedFeaturedCategorySlugs = normalizeHomepageFeaturedCategorySlugs(
        homepageCurationResponse.homepageCuration,
      );
      setCategories(data);
      setImageErrors({});
      setFeaturedCategorySlugs(normalizedFeaturedCategorySlugs);
      setHomepageCuration({
        featuredCategorySlugs: normalizedFeaturedCategorySlugs,
        featuredProductIdsByCategory: normalizeHomepageFeaturedProductIdsByCategory(
          homepageCurationResponse.homepageCuration?.featuredProductIdsByCategory,
          normalizedFeaturedCategorySlugs,
        ),
        enforceFeaturedProductCaps: Boolean(
          homepageCurationResponse.homepageCuration?.enforceFeaturedProductCaps,
        ),
      });
    } catch (error) {
      console.error("Failed to load categories:", error);
      showToast("error", "Koleksiyonlar yüklenirken bir hata oluştu");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const buildTree = (cats: CategoryInfo[], parentId: string | null = null): CategoryInfo[] => {
    return cats
      .filter((c) => c.parent_id === parentId)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((cat) => ({
        ...cat,
        children: buildTree(cats, cat.id),
      }));
  };

  const tree = buildTree(categories);
  const orderedCategories = flattenCategoryTree(tree);
  const categoryOrderMap = useMemo(
    () => new Map(orderedCategories.map((category, index) => [category.slug, index])),
    [orderedCategories],
  );
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const categoryBySlug = useMemo(
    () => new Map(categories.map((category) => [category.slug, category])),
    [categories],
  );
  const featuredCategories = useMemo(
    () =>
      featuredCategorySlugs
        .map((slug) => categoryBySlug.get(slug))
        .filter((category): category is CategoryInfo => Boolean(category)),
    [categoryBySlug, featuredCategorySlugs],
  );

  const filteredTree = filterCategoryTree(tree, searchQuery);

  useEffect(() => {
    if (featuredCategories.length === 0) {
      return;
    }

    setExpandedIds((current) => {
      const next = new Set(current);

      featuredCategories.forEach((category) => {
        buildCategoryAncestorIdChain(category, categoryById).forEach((ancestorId) => {
          next.add(ancestorId);
        });
      });

      return next;
    });
  }, [categoryById, featuredCategories]);

  const sortHomepageFeaturedSlugs = (slugs: string[]) =>
    [...new Set(slugs)]
      .sort((left, right) => {
        const leftPriority = categoryOrderMap.get(left) ?? Number.MAX_SAFE_INTEGER;
        const rightPriority = categoryOrderMap.get(right) ?? Number.MAX_SAFE_INTEGER;

        if (leftPriority !== rightPriority) {
          return leftPriority - rightPriority;
        }

        return left.localeCompare(right, "tr");
      })
      .slice(0, MAX_HOMEPAGE_FEATURED_CATEGORIES);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleEdit = (category: CategoryInfo) => {
    setEditingCategory(category);
    setFormData({
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description || "",
      image: category.image || "",
      icon: category.icon || "",
      parent_id: category.parent_id || null,
      sort_order: category.sort_order || 0,
      is_active: category.is_active !== false,
      seo_title: (category as any).seo_title || "",
      seo_description: (category as any).seo_description || "",
    });
    setIsFormOpen(true);
  };

  const handleNew = () => {
    setEditingCategory(null);
    setFormData({
      name: "",
      slug: "",
      description: "",
      image: "",
      icon: "",
      parent_id: null,
      sort_order: categories.length,
      is_active: true,
      seo_title: "",
      seo_description: "",
    });
    setIsFormOpen(true);
  };

  const generateSlug = (name: string) => {
    const turkishToEnglish: Record<string, string> = {
      "ş": "s",
      "Ş": "s",
      "ı": "i",
      "İ": "i",
      "ğ": "g",
      "Ğ": "g",
      "ü": "u",
      "Ü": "u",
      "ö": "o",
      "Ö": "o",
      "ç": "c",
      "Ç": "c",
    };
    return name
      .split("")
      .map((char) => turkishToEnglish[char] || char)
      .join("")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  };

  const handleNameChange = (name: string) => {
    setFormData((prev) => ({
      ...prev,
      name,
      slug: prev.slug === generateSlug(prev.name) || !prev.slug ? generateSlug(name) : prev.slug,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      showToast("error", "Koleksiyon adı zorunludur");
      return;
    }

    if (!formData.slug.trim()) {
      showToast("error", "URL slug zorunludur");
      return;
    }

    setSaving(true);
    try {
      const categoryData = {
        name: formData.name,
        slug: formData.slug,
        description: formData.description,
        image: formData.image,
        icon: formData.icon || "📦",
        parent_id: formData.parent_id,
        sort_order: formData.sort_order,
        is_active: formData.is_active,
        seo_title: formData.seo_title,
        seo_description: formData.seo_description,
      };

      if (editingCategory) {
        await updateCategory(editingCategory.id, categoryData);
        showToast("success", "Koleksiyon başarıyla güncellendi");
      } else {
        await addCategory(categoryData);
        showToast("success", "Koleksiyon başarıyla oluşturuldu");
      }

      setIsFormOpen(false);
      loadCategories();
    } catch (error: any) {
      console.error("Error saving category:", error);
      showToast("error", error?.message || "Bir hata oluştu");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;

    try {
      await deleteCategory(deleteConfirm.id);
      showToast("success", "Koleksiyon başarıyla silindi");
      setDeleteConfirm(null);
      loadCategories();
    } catch (error: any) {
      console.error("Error deleting category:", error);
      showToast("error", error?.message || "Silme işlemi başarısız");
    }
  };

  const handleImageUpload = async (file: File) => {
    if (!file) return;

    setUploading(true);
    try {
      const formDataUpload = new FormData();
      formDataUpload.append("file", file);
      formDataUpload.append("folder", "categories");

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formDataUpload,
      });

      const data = await response.json();

      if (data.url) {
        setFormData((prev) => ({ ...prev, image: data.url }));
        showToast("success", "Görsel yüklendi");
      }
    } catch (error) {
      console.error("Upload failed:", error);
      showToast("error", "Görsel yüklenirken hata oluştu");
    } finally {
      setUploading(false);
    }
  };

  const parentOptions = [
    { value: "", label: "Ana Koleksiyon (Yok)" },
    ...categories
      .filter((c) => c.id !== editingCategory?.id)
      .map((c) => ({ value: c.id, label: c.name })),
  ];

  const activeCollections = categories.filter((category) => category.is_active !== false).length;
  const childCollections = categories.filter((category) => category.parent_id).length;
  const rootCollections = tree.length;
  const filteredResults = flattenCategoryTree(filteredTree).length;
  const homepageFeaturedCount = featuredCategorySlugs.length;
  const hiddenFeaturedCount = Math.max(0, homepageFeaturedCount - featuredCategories.length);

  const handleHomepageFeatureToggle = async (category: CategoryInfo) => {
    const isFeatured = featuredCategorySlugs.includes(category.slug);

    if (!isFeatured && category.is_active === false) {
      showToast("error", "Pasif koleksiyonlar ana sayfa vitrini icin secilemez.");
      return;
    }

    if (!isFeatured && homepageFeaturedCount >= MAX_HOMEPAGE_FEATURED_CATEGORIES) {
      const selectedCategoryNames = featuredCategories
        .map((entry) => entry.name)
        .filter(Boolean)
        .join(", ");

      showToast(
        "error",
        selectedCategoryNames
          ? `Ana sayfada en fazla 4 koleksiyon yildizlanabilir. Secili koleksiyonlar: ${selectedCategoryNames}`
          : "Ana sayfada en fazla 4 koleksiyon yildizlanabilir.",
      );
      return;
    }

    const previousSlugs = featuredCategorySlugs;
    const nextSlugs = isFeatured
      ? featuredCategorySlugs.filter((entry) => entry !== category.slug)
      : sortHomepageFeaturedSlugs([...featuredCategorySlugs, category.slug]);
    const nextFeaturedProductIdsByCategory = normalizeHomepageFeaturedProductIdsByCategory(
      homepageCuration.featuredProductIdsByCategory,
      nextSlugs,
    );

    setFeaturedSavingSlug(category.slug);
    setFeaturedCategorySlugs(nextSlugs);

    try {
      await fetchAdminJson("/api/settings", {
        timeoutMs: 10000,
        init: {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "homepage-curation",
            homepageCuration: {
              featuredCategorySlugs: nextSlugs,
              featuredProductIdsByCategory: nextFeaturedProductIdsByCategory,
              enforceFeaturedProductCaps: homepageCuration.enforceFeaturedProductCaps,
            },
          }),
        },
      });

      setHomepageCuration((current) => ({
        ...current,
        featuredCategorySlugs: nextSlugs,
        featuredProductIdsByCategory: nextFeaturedProductIdsByCategory,
      }));

      showToast(
        "success",
        isFeatured
          ? `${category.name} ana sayfa vitrinden kaldirildi`
          : `${category.name} ana sayfa vitrini icin yildizlandi`,
      );
    } catch (error) {
      console.error("Failed to update homepage curation:", error);
      setFeaturedCategorySlugs(previousSlugs);
      setHomepageCuration((current) => ({
        ...current,
        featuredCategorySlugs: previousSlugs,
        featuredProductIdsByCategory: normalizeHomepageFeaturedProductIdsByCategory(
          current.featuredProductIdsByCategory,
          previousSlugs,
        ),
      }));
      showToast("error", "Ana sayfa vitrini guncellenemedi");
    } finally {
      setFeaturedSavingSlug(null);
    }
  };

  const handleClearHomepageFeaturedCategories = async () => {
    const previousSlugs = featuredCategorySlugs;
    const previousHomepageCuration = homepageCuration;

    setFeaturedCategorySlugs([]);
    setHomepageCuration((current) => ({
      ...current,
      featuredCategorySlugs: [],
      featuredProductIdsByCategory: {},
    }));

    try {
      await fetchAdminJson("/api/settings", {
        timeoutMs: 10000,
        init: {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "homepage-curation",
            homepageCuration: {
              featuredCategorySlugs: [],
              featuredProductIdsByCategory: {},
              enforceFeaturedProductCaps: homepageCuration.enforceFeaturedProductCaps,
            },
          }),
        },
      });

      showToast("success", "Ana sayfa vitrini icin secilen koleksiyonlar temizlendi");
    } catch (error) {
      console.error("Failed to clear homepage curation categories:", error);
      setFeaturedCategorySlugs(previousSlugs);
      setHomepageCuration(previousHomepageCuration);
      showToast("error", "Ana sayfa vitrini secimleri temizlenemedi");
    }
  };

  const renderCategoryRow = (category: CategoryInfo, level: number = 0) => {
    const hasChildren = category.children && category.children.length > 0;
    const isExpanded = Boolean(hasChildren && (searchQuery.trim() ? true : expandedIds.has(category.id)));
    const shouldRenderImage = Boolean(category.image) && !imageErrors[category.id];
    const isHomepageFeatured = featuredCategorySlugs.includes(category.slug);
    const isHomepageFeatureSaving = featuredSavingSlug === category.slug;
    const isActive = category.is_active !== false;
    const childCount = category.children?.length || 0;
    const productCount = category.productCount || 0;
    const hierarchyLabel = level === 0 ? "Ana koleksiyon" : "Alt koleksiyon";

    return (
      <div key={category.id} className="space-y-2">
        <div
          className={`group relative rounded-[22px] border bg-white px-4 py-4 transition duration-200 hover:border-[#DDE2EA] hover:bg-[#FCFDFE] hover:shadow-[0_16px_34px_rgba(15,23,42,0.06)] sm:px-5 ${
            isActive
              ? "border-[#E7EAF0]"
              : "border-[#EEF1F4] opacity-75"
          }`}
          style={{ marginLeft: `${level * 24}px` }}
        >
          {level > 0 ? (
            <div className="pointer-events-none absolute inset-y-5 -left-3 w-px bg-[#DDE2EA]" aria-hidden="true" />
          ) : null}

          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => toggleExpand(category.id)}
                  aria-expanded={isExpanded}
                  aria-label={
                    isExpanded
                      ? `${category.name} alt koleksiyonlarını daralt`
                      : `${category.name} alt koleksiyonlarını genişlet`
                  }
                  className={`mt-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#E7EAF0] bg-white text-[#6B7280] transition hover:border-[#FFD7BF] hover:bg-[#FFF1E8] hover:text-[#E85D04] ${SURFACE_FOCUS_RING}`}
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
              ) : (
                <span
                  className="mt-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-[#D1D5DB]"
                  aria-hidden="true"
                >
                  <ChevronRight className="h-4 w-4" />
                </span>
              )}

              <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-2xl border border-[#E7EAF0] bg-[#F9FAFB]">
                {shouldRenderImage ? (
                  <img
                    src={category.image}
                    alt={category.name}
                    className="h-full w-full object-cover"
                    onError={() =>
                      setImageErrors((current) => ({
                        ...current,
                        [category.id]: true,
                      }))
                    }
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[#9CA3AF]" aria-hidden="true">
                    <ImageIcon className="h-5 w-5" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-base font-semibold tracking-[-0.02em] text-[#1F2937]">
                    {category.name}
                  </h3>
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                      isActive
                        ? "border-[#BFE8CC] bg-[#EAF8EF] text-[#16A34A]"
                        : "border-[#E7EAF0] bg-[#F9FAFB] text-[#6B7280]"
                    }`}
                  >
                    {isActive ? "Aktif" : "Pasif"}
                  </span>
                  {hasChildren && (
                    <span className="inline-flex items-center rounded-full border border-[#D7E5FF] bg-[#EAF2FF] px-2.5 py-1 text-[11px] font-medium text-[#3B82F6]">
                      {childCount} alt koleksiyon
                    </span>
                  )}
                  <span className="inline-flex items-center rounded-full border border-[#E7EAF0] bg-white px-2.5 py-1 text-[11px] font-medium text-[#6B7280]">
                    Sıra {category.sort_order || 0}
                  </span>
                  {isHomepageFeatured && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-[#FFD7BF] bg-[#FFF1E8] px-2.5 py-1 text-[11px] font-medium text-[#E85D04]">
                      <Star className="h-3 w-3 fill-current" />
                      Vitrinde
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-sm text-[#6B7280]">
                  <span>{hierarchyLabel}</span>
                  <span className="text-[#D1D5DB]">•</span>
                  <span>{productCount} ürün</span>
                  {level > 0 ? (
                    <>
                      <span className="text-[#D1D5DB]">•</span>
                      <span>Seviye {level + 1}</span>
                    </>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-end xl:self-center">
              <button
                type="button"
                onClick={() => void handleHomepageFeatureToggle(category)}
                disabled={isHomepageFeatureSaving}
                aria-label={
                  isHomepageFeatured
                    ? `${category.name} koleksiyonunu ana sayfa vitrinden kaldir`
                    : `${category.name} koleksiyonunu ana sayfa vitrini icin yildizla`
                }
                className={`${ACTION_BUTTON_CLASSNAME} ${SURFACE_FOCUS_RING} ${
                  isHomepageFeatured
                    ? "border-[#FFD7BF] bg-[#FFF1E8] text-[#E85D04] hover:bg-[#FFE7D6]"
                    : "border-[#E7EAF0] text-[#374151] hover:border-[#FFD7BF] hover:text-[#E85D04]"
                } ${isHomepageFeatureSaving ? "cursor-wait opacity-70" : ""}`}
              >
                {isHomepageFeatureSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Star className={`h-4 w-4 ${isHomepageFeatured ? "fill-current" : ""}`} />
                )}
                <span className="hidden sm:inline">
                  {isHomepageFeatured ? "Vitrinde" : "Yıldızla"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleEdit(category)}
                aria-label={`${category.name} koleksiyonunu düzenle`}
                className={`${ACTION_BUTTON_CLASSNAME} border-[#E7EAF0] text-[#1F2937] hover:border-[#DDE2EA] ${SURFACE_FOCUS_RING}`}
              >
                <Edit className="h-4 w-4" />
                <span className="hidden sm:inline">Düzenle</span>
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirm({ id: category.id, name: category.name })}
                aria-label={`${category.name} koleksiyonunu sil`}
                className={`${ACTION_BUTTON_CLASSNAME} border-[#F5D3D3] text-[#EF4444] hover:bg-[#FDECEC] ${SURFACE_FOCUS_RING}`}
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">Sil</span>
              </button>
            </div>
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="space-y-2 border-l border-dashed border-[#DDE2EA] pl-3 sm:pl-4">
            {category.children?.map((child) => renderCategoryRow(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F7F8FA] px-1 pb-8 text-[#1F2937]">
      <div className="mx-auto max-w-[1480px] space-y-6">
        <section className="rounded-[28px] border border-[#E7EAF0] bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.05)] md:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E85D04]">Celebix Admin</p>
              <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[#1F2937] md:text-4xl">
                Koleksiyonlar
              </h1>
              <p className="text-sm leading-6 text-[#6B7280] md:text-base">
                Koleksiyonları yönetin, vitrini düzenleyin ve hiyerarşiyi kolayca kontrol edin.
              </p>
            </div>

            <button
              type="button"
              onClick={handleNew}
              className={`inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#FF6A00] px-5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(255,106,0,0.22)] transition hover:bg-[#E85D04] ${SURFACE_FOCUS_RING}`}
            >
              <Plus className="h-4 w-4" />
              Yeni Koleksiyon
            </button>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Toplam Koleksiyon",
              value: categories.length,
              detail: "koleksiyon",
              icon: FolderTree,
              tone: "text-[#1F2937]",
            },
            {
              label: "Aktif Koleksiyon",
              value: activeCollections,
              detail: "yayında",
              icon: BadgeCheck,
              tone: "text-[#16A34A]",
            },
            {
              label: "Alt Koleksiyon",
              value: childCollections,
              detail: "hiyerarşik öğe",
              icon: GitBranch,
              tone: "text-[#3B82F6]",
            },
            {
              label: "Filtrelenen Sonuç",
              value: filteredResults,
              detail: searchQuery ? "eşleşme" : "gösterilen",
              icon: Filter,
              tone: "text-[#E85D04]",
            },
          ].map((stat) => {
            const Icon = stat.icon;

            return (
              <div
                key={stat.label}
                className="min-h-[132px] rounded-[24px] border border-[#E7EAF0] bg-white p-5 shadow-[0_14px_32px_rgba(15,23,42,0.04)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#EEF1F4] bg-[#F9FAFB] text-[#6B7280]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className={`text-3xl font-semibold tracking-[-0.04em] ${stat.tone}`}>{stat.value}</p>
                </div>
                <div className="mt-4">
                  <p className="text-sm font-semibold text-[#374151]">{stat.label}</p>
                  <p className="mt-1 text-sm text-[#9CA3AF]">{stat.detail}</p>
                </div>
              </div>
            );
          })}
        </section>

        <section className="rounded-[28px] border border-[#E7EAF0] bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.05)] md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E85D04]">Tarama ve kontrol</p>
              <h2 className="text-xl font-semibold tracking-[-0.03em] text-[#1F2937]">Koleksiyon listesi</h2>
              <p className="max-w-2xl text-sm leading-6 text-[#6B7280]">
                Koleksiyonları ad veya açıklama ile filtreleyin, hiyerarşiyi koruyarak daha rahat inceleyin.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#6B7280]">
              <span className="rounded-full border border-[#E7EAF0] bg-[#F9FAFB] px-3 py-1.5">
                Ana koleksiyon: {rootCollections}
              </span>
              <span className="rounded-full border border-[#E7EAF0] bg-[#F9FAFB] px-3 py-1.5">
                Gösterilen: {filteredResults}
              </span>
            </div>
          </div>

          <div className="mt-5 rounded-[24px] border border-[#EEF1F4] bg-[#FCFDFE] p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#FFD7BF] bg-[#FFF1E8] text-[#E85D04]">
                  <Star className="h-4 w-4" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-sm font-semibold text-[#1F2937]">Ana Sayfa Vitrini</h3>
                  <p className="max-w-2xl text-sm leading-6 text-[#6B7280]">
                    Seçili koleksiyonlar burada her zaman görünür. Gizli kalmış eski seçimler varsa buradan kaldırabilirsiniz.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[#FFD7BF] bg-[#FFF1E8] px-3 py-1.5 text-xs font-medium text-[#E85D04]">
                  {homepageFeaturedCount}/4 seçili
                </span>
                {hiddenFeaturedCount > 0 ? (
                  <span className="rounded-full border border-[#E7EAF0] bg-white px-3 py-1.5 text-xs font-medium text-[#6B7280]">
                    {hiddenFeaturedCount} eski seçim gizli
                  </span>
                ) : null}
                {homepageFeaturedCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => void handleClearHomepageFeaturedCategories()}
                    className={`inline-flex items-center justify-center gap-2 rounded-2xl border border-[#E7EAF0] bg-white px-4 py-2.5 text-sm font-medium text-[#374151] transition hover:border-[#FFD7BF] hover:text-[#E85D04] ${SURFACE_FOCUS_RING}`}
                  >
                    <X className="h-4 w-4" />
                    Tümünü temizle
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {featuredCategories.length > 0 ? (
                featuredCategories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => void handleHomepageFeatureToggle(category)}
                    className={`inline-flex items-center gap-2 rounded-full border border-[#FFD7BF] bg-[#FFF1E8] px-3 py-2 text-sm font-medium text-[#E85D04] transition hover:bg-[#FFE7D6] ${SURFACE_FOCUS_RING}`}
                  >
                    <Star className="h-3.5 w-3.5 fill-current" />
                    <span>{category.name}</span>
                    <X className="h-3.5 w-3.5" />
                  </button>
                ))
              ) : (
                <p className="text-sm text-[#6B7280]">
                  Şu anda ana sayfa vitrini için seçili koleksiyon yok.
                </p>
              )}
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 rounded-[24px] border border-[#E7EAF0] bg-white p-3 sm:flex-row sm:items-center sm:p-4">
            <label htmlFor="collection-search" className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
              <input
                id="collection-search"
                type="text"
                placeholder="Koleksiyon ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-2xl border border-[#E7EAF0] bg-white py-3 pl-11 pr-4 text-sm text-[#1F2937] outline-none transition placeholder:text-[#9CA3AF] focus:border-[#FF6A00]/50 focus:ring-4 focus:ring-[rgba(255,106,0,0.14)]"
              />
            </label>

            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className={`inline-flex items-center justify-center gap-2 rounded-2xl border border-[#E7EAF0] bg-white px-4 py-3 text-sm font-medium text-[#374151] transition hover:border-[#FFD7BF] hover:text-[#E85D04] ${SURFACE_FOCUS_RING}`}
              >
                <X className="h-4 w-4" />
                Temizle
              </button>
            ) : null}
          </div>
        </section>

        {loading ? (
          <section className="rounded-[28px] border border-[#E7EAF0] bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.05)] md:p-6">
            <div className="space-y-4">
              {[0, 1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="animate-pulse rounded-[22px] border border-[#EEF1F4] bg-[#FCFDFE] p-5"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-2xl bg-[#EEF1F4]" />
                    <div className="h-14 w-14 rounded-2xl bg-[#EEF1F4]" />
                    <div className="flex-1 space-y-3">
                      <div className="h-4 w-48 rounded-full bg-[#E7EAF0]" />
                      <div className="h-3 w-32 rounded-full bg-[#EEF1F4]" />
                      <div className="h-3 w-full max-w-xl rounded-full bg-[#EEF1F4]" />
                    </div>
                    <div className="hidden gap-3 sm:flex">
                      <div className="h-10 w-24 rounded-2xl bg-[#EEF1F4]" />
                      <div className="h-10 w-20 rounded-2xl bg-[#EEF1F4]" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : categories.length === 0 ? (
          <section className="rounded-[28px] border border-[#E7EAF0] bg-white p-10 text-center shadow-[0_18px_45px_rgba(15,23,42,0.05)]">
            <div className="mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-[24px] border border-[#FFD7BF] bg-[#FFF1E8] text-[#E85D04]">
              <FolderTree className="h-8 w-8" />
            </div>
            <div className="mx-auto mt-6 max-w-xl space-y-3">
              <h3 className="text-2xl font-semibold tracking-[-0.03em] text-[#1F2937]">Henüz koleksiyon yok</h3>
              <p className="text-sm leading-7 text-[#6B7280]">
                Vitrin yapısını oluşturmak için ilk koleksiyonunuzu ekleyin. Hazırlanan liste, alt
                koleksiyonları da aynı ekranda net bir hiyerarşiyle gösterecek.
              </p>
            </div>
            <button
              type="button"
              onClick={handleNew}
              className={`mt-6 inline-flex items-center gap-2 rounded-2xl bg-[#FF6A00] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(255,106,0,0.22)] transition hover:bg-[#E85D04] ${SURFACE_FOCUS_RING}`}
            >
              <Plus className="h-4 w-4" />
              Yeni Koleksiyon
            </button>
          </section>
        ) : (
          <section className="rounded-[28px] border border-[#E7EAF0] bg-white p-4 shadow-[0_18px_45px_rgba(15,23,42,0.05)] md:p-5">
            <div className="mb-4 flex flex-col gap-2 px-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-[-0.03em] text-[#1F2937]">Koleksiyon ağacı</h2>
                <p className="text-sm text-[#6B7280]">Hiyerarşi, durum ve düzenleme aksiyonları tek listede.</p>
              </div>
            </div>

            {filteredTree.length > 0 ? (
              <div className="space-y-2">{filteredTree.map((category) => renderCategoryRow(category))}</div>
            ) : (
              <div className="rounded-[24px] border border-dashed border-[#DDE2EA] bg-[#FCFDFE] p-10 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] border border-[#FFD7BF] bg-[#FFF1E8] text-[#E85D04]">
                  <Search className="h-7 w-7" />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-[#1F2937]">Aramanızla eşleşen koleksiyon bulunamadı</h3>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#6B7280]">
                  Farklı bir ad veya açıklama deneyin. Liste davranışı değişmeden yalnızca mevcut sonuçlar filtrelenir.
                </p>
              </div>
            )}
          </section>
        )}
      </div>

      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6">
          <div className="absolute inset-0 bg-[#111827]/45 backdrop-blur-sm" onClick={() => setIsFormOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="collection-form-title"
            className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-[#E7EAF0] bg-white shadow-[0_34px_100px_rgba(15,23,42,0.22)]"
          >
            <div className="sticky top-0 z-10 border-b border-[#EEF1F4] bg-white/95 px-6 py-5 backdrop-blur md:px-8">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E85D04]">Form sayfası</p>
                  <h2 id="collection-form-title" className="text-2xl font-semibold tracking-[-0.04em] text-[#1F2937]">
                    {editingCategory ? "Koleksiyon Düzenle" : "Yeni Koleksiyon"}
                  </h2>
                  <p className="text-sm leading-6 text-[#6B7280]">
                    Koleksiyon bilgilerini, görselini ve vitrin ayarlarını tek akışta düzenleyin.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  aria-label="Koleksiyon formunu kapat"
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#E7EAF0] bg-white text-[#6B7280] transition hover:border-[#FFD7BF] hover:text-[#E85D04] ${SURFACE_FOCUS_RING}`}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6 md:px-8 md:py-7">
                <section className={SECTION_CLASSNAME}>
                  <div className="mb-5 space-y-1.5">
                    <h3 className="text-lg font-semibold text-[#1F2937]">Temel Bilgiler</h3>
                    <p className="text-sm text-[#6B7280]">Koleksiyonun görünen adını, bağlantısını ve ağaçtaki konumunu belirleyin.</p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label htmlFor="collection-name" className="mb-2 block text-sm font-medium text-[#374151]">
                        Koleksiyon Adı <span className="text-[#d04f45]">*</span>
                      </label>
                      <input
                        id="collection-name"
                        type="text"
                        value={formData.name}
                        onChange={(e) => handleNameChange(e.target.value)}
                        className={INPUT_CLASSNAME}
                        placeholder="Örn: Fıstık Ezmesi"
                        required
                      />
                    </div>

                    <div>
                      <label htmlFor="collection-slug" className="mb-2 block text-sm font-medium text-[#374151]">
                        URL Slug <span className="text-[#d04f45]">*</span>
                      </label>
                      <div className="flex items-center gap-2 rounded-2xl border border-[#E7EAF0] bg-white px-4 focus-within:border-[#FF6A00]/50 focus-within:ring-4 focus-within:ring-[rgba(255,106,0,0.14)]">
                        <span className="text-sm text-[#9CA3AF]">/</span>
                        <input
                          id="collection-slug"
                          type="text"
                          value={formData.slug}
                          onChange={(e) => setFormData((prev) => ({ ...prev, slug: generateSlug(e.target.value) }))}
                          className="min-w-0 flex-1 bg-transparent py-3 text-sm text-[#1F2937] outline-none placeholder:text-[#9CA3AF]"
                          placeholder="fistik-ezmesi"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="collection-parent" className="mb-2 block text-sm font-medium text-[#374151]">
                        Üst Koleksiyon
                      </label>
                      <select
                        id="collection-parent"
                        value={formData.parent_id || ""}
                        onChange={(e) => setFormData((prev) => ({ ...prev, parent_id: e.target.value || null }))}
                        className={INPUT_CLASSNAME}
                      >
                        {parentOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label htmlFor="collection-description" className="mb-2 block text-sm font-medium text-[#374151]">
                        Açıklama
                      </label>
                      <textarea
                        id="collection-description"
                        value={formData.description}
                        onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                        rows={4}
                        className={`${INPUT_CLASSNAME} resize-none`}
                        placeholder="Koleksiyon açıklamasi..."
                      />
                    </div>
                  </div>
                </section>

                <section className={SECTION_CLASSNAME}>
                  <div className="mb-5 space-y-1.5">
                    <h3 className="text-lg font-semibold text-[#1F2937]">Görsel</h3>
                    <p className="text-sm text-[#6B7280]">Liste ve vitrin alanlarında kullanılacak görseli yükleyin veya yenileyin.</p>
                  </div>

                  <div className="rounded-[24px] border border-dashed border-[#DDE2EA] bg-[#FCFDFE] p-5 text-center transition hover:border-[#FFD7BF] md:p-7">
                    {formData.image ? (
                      <div className="space-y-4">
                        <div className="relative mx-auto inline-flex">
                          <img src={formData.image} alt="Preview" className="max-h-56 rounded-[22px] border border-[#E7EAF0] shadow-[0_16px_34px_rgba(15,23,42,0.08)]" />
                          <button
                            type="button"
                            onClick={() => setFormData((prev) => ({ ...prev, image: "" }))}
                            aria-label="Yüklenen görseli kaldır"
                            className="absolute -right-3 -top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#cf4e43] text-white shadow-lg transition hover:bg-[#b94136] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-200"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        <p className="text-sm text-[#6B7280]">Görseli değiştirmek için yeni bir dosya seçin veya mevcut görseli kaldırın.</p>
                      </div>
                    ) : (
                      <label className="block cursor-pointer">
                        <input
                          type="file"
                          accept={SUPPORTED_IMAGE_ACCEPT}
                          className="hidden"
                          onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])}
                          disabled={uploading}
                        />
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] border border-[#FFD7BF] bg-[#FFF1E8] text-[#E85D04]">
                          {uploading ? <Loader2 className="h-7 w-7 animate-spin" /> : <ImageIcon className="h-7 w-7" />}
                        </div>
                        <p className="mt-4 text-sm font-medium text-[#374151]">
                          {uploading ? "Görsel yükleniyor..." : "Görsel yüklemek için tıklayın"}
                        </p>
                        <p className="mt-1 text-xs text-[#9CA3AF]">{SUPPORTED_IMAGE_FORMATS_WITH_GIF_LABEL} - Max 5MB</p>
                      </label>
                    )}
                  </div>
                </section>

                <section className={SECTION_CLASSNAME}>
                  <div className="mb-5 space-y-1.5">
                    <h3 className="text-lg font-semibold text-[#1F2937]">SEO Ayarları</h3>
                    <p className="text-sm text-[#6B7280]">Arama görünümlerinde kullanilacak başlık ve açıklamayi dengeleyin.</p>
                  </div>

                  <div className="grid gap-4">
                    <div>
                      <label htmlFor="collection-seo-title" className="mb-2 block text-sm font-medium text-[#374151]">
                        SEO Başlığı
                      </label>
                      <input
                        id="collection-seo-title"
                        type="text"
                        value={formData.seo_title}
                        onChange={(e) => setFormData((prev) => ({ ...prev, seo_title: e.target.value }))}
                        className={INPUT_CLASSNAME}
                        placeholder="Fıstık Ezmesi | Celebix E-ticaret"
                        maxLength={60}
                      />
                      <p className="mt-2 text-xs text-[#9CA3AF]">{formData.seo_title.length}/60 karakter</p>
                    </div>

                    <div>
                      <label htmlFor="collection-seo-description" className="mb-2 block text-sm font-medium text-[#374151]">
                        Meta Açıklama
                      </label>
                      <textarea
                        id="collection-seo-description"
                        value={formData.seo_description}
                        onChange={(e) => setFormData((prev) => ({ ...prev, seo_description: e.target.value }))}
                        rows={3}
                        className={`${INPUT_CLASSNAME} resize-none`}
                        placeholder="En taze fıstık ezmesi çeşitleri..."
                        maxLength={160}
                      />
                      <p className="mt-2 text-xs text-[#9CA3AF]">{formData.seo_description.length}/160 karakter</p>
                    </div>
                  </div>
                </section>

                <section className={SECTION_CLASSNAME}>
                  <div className="mb-5 space-y-1.5">
                    <h3 className="text-lg font-semibold text-[#1F2937]">Ayarlar</h3>
                    <p className="text-sm text-[#6B7280]">Koleksiyonun vitrin sırasını ve aktif durumunu buradan yönetin.</p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label htmlFor="collection-sort-order" className="mb-2 block text-sm font-medium text-[#374151]">
                        Sıralama
                      </label>
                      <input
                        id="collection-sort-order"
                        type="number"
                        value={formData.sort_order}
                        onChange={(e) => setFormData((prev) => ({ ...prev, sort_order: parseInt(e.target.value) || 0 }))}
                        className={INPUT_CLASSNAME}
                        min={0}
                      />
                    </div>

                    <div className="rounded-[22px] border border-[#E7EAF0] bg-[#FCFDFE] p-4">
                      <label className="flex cursor-pointer items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-[#374151]">Aktif durumu</p>
                          <p className="mt-1 text-xs text-[#6B7280]">Pasif koleksiyonlar listede daha soluk görünür.</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={formData.is_active}
                          onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
                          className="h-5 w-5 rounded border-gray-300 text-[#FF6A00] focus:ring-[#FF6A00]"
                        />
                      </label>
                    </div>
                  </div>
                </section>
              </div>

              <div className="sticky bottom-0 border-t border-[#EEF1F4] bg-white/95 px-6 py-4 backdrop-blur md:px-8">
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className={`inline-flex items-center justify-center rounded-2xl border border-[#E7EAF0] bg-white px-5 py-3 text-sm font-medium text-[#374151] transition hover:border-[#FFD7BF] hover:text-[#E85D04] ${SURFACE_FOCUS_RING}`}
                  >
                    İptal
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className={`inline-flex items-center justify-center gap-2 rounded-2xl bg-[#FF6A00] px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(255,106,0,0.22)] transition hover:bg-[#E85D04] disabled:cursor-not-allowed disabled:opacity-50 ${SURFACE_FOCUS_RING}`}
                  >
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Kaydediliyor...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        Kaydet
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#111827]/45 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-collection-title"
            className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-[#E7EAF0] bg-white shadow-[0_34px_90px_rgba(15,23,42,0.22)]"
          >
            <div className="border-b border-[#EEF1F4] px-6 py-5">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-[22px] border border-[#F5D3D3] bg-[#FDECEC] text-[#EF4444]">
                  <AlertCircle className="h-7 w-7" />
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#EF4444]">Silme onayı</p>
                  <h3 id="delete-collection-title" className="text-xl font-semibold tracking-[-0.03em] text-[#1F2937]">
                    Koleksiyonu Sil
                  </h3>
                  <p className="text-sm leading-6 text-[#6B7280]">Bu işlem geri alınamaz ve mevcut bağlantıları etkileyebilir.</p>
                </div>
              </div>
            </div>

            <div className="px-6 py-5">
              <div className="rounded-[22px] border border-[#EEF1F4] bg-[#FCFDFE] p-4 text-sm leading-6 text-[#6B7280]">
                <strong className="font-semibold text-[#1F2937]">{deleteConfirm.name}</strong> koleksiyonu
                sistemden kaldırılacak.
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-[#EEF1F4] bg-white/95 px-6 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className={`inline-flex items-center justify-center rounded-2xl border border-[#E7EAF0] bg-white px-5 py-3 text-sm font-medium text-[#374151] transition hover:border-[#FFD7BF] hover:text-[#E85D04] ${SURFACE_FOCUS_RING}`}
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="inline-flex items-center justify-center rounded-2xl bg-[#EF4444] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_26px_rgba(239,68,68,0.22)] transition hover:bg-[#DC2626] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-200"
              >
                Sil
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          aria-live="polite"
          aria-atomic="true"
          className="fixed bottom-4 right-4 z-50 max-w-sm"
        >
          <div
            className={`flex items-start gap-3 rounded-[22px] border px-4 py-3.5 shadow-[0_24px_50px_rgba(15,23,42,0.16)] backdrop-blur ${
              toast.type === "success"
                ? "border-emerald-200 bg-white text-emerald-800"
                : toast.type === "error"
                  ? "border-red-200 bg-white text-red-700"
                  : "border-[#FFD7BF] bg-white text-[#E85D04]"
            }`}
          >
            <div
              className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-full ${
                toast.type === "success"
                  ? "bg-emerald-100 text-emerald-700"
                  : toast.type === "error"
                    ? "bg-red-100 text-red-600"
                    : "bg-[#FFF1E8] text-[#E85D04]"
              }`}
            >
              {toast.type === "success" && <Check className="h-4 w-4" />}
              {toast.type === "error" && <AlertCircle className="h-4 w-4" />}
              {toast.type === "info" && <BadgeCheck className="h-4 w-4" />}
            </div>
            <div>
              <p className="text-sm font-semibold">
                {toast.type === "success" ? "İşlem tamamlandı" : toast.type === "error" ? "Bir sorun oluştu" : "Bilgilendirme"}
              </p>
              <p className="mt-1 text-sm leading-5 opacity-90">{toast.message}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
