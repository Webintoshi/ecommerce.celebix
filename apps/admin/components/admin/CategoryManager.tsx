"use client";

import { useState, useEffect, useCallback } from "react";
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
  "w-full rounded-2xl border border-[#eadfD4] bg-white/95 px-4 py-3 text-sm text-[#2f241d] shadow-[0_8px_24px_rgba(125,92,67,0.06)] outline-none transition duration-200 placeholder:text-[#9a8778] focus:border-[#FE6100]/40 focus:ring-4 focus:ring-[#FE6100]/15";

const SECTION_CLASSNAME =
  "rounded-[28px] border border-[#eadfd4] bg-gradient-to-br from-white via-[#fffdfa] to-[#f9f3ed] p-5 shadow-[0_22px_50px_rgba(86,55,24,0.08)] md:p-6";

const MAX_HOMEPAGE_FEATURED_CATEGORIES = 4;

interface HomepageCurationState {
  featuredCategorySlugs: string[];
  enforceFeaturedProductCaps: boolean;
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
  const categoryOrderMap = new Map(
    orderedCategories.map((category, index) => [category.slug, index]),
  );

  const filteredTree = searchQuery
    ? tree.filter(
        (cat) =>
          cat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          cat.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : tree;

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
  const filteredResults = filteredTree.length;
  const homepageFeaturedCount = featuredCategorySlugs.length;

  const handleHomepageFeatureToggle = async (category: CategoryInfo) => {
    const isFeatured = featuredCategorySlugs.includes(category.slug);

    if (!isFeatured && category.is_active === false) {
      showToast("error", "Pasif koleksiyonlar ana sayfa vitrini icin secilemez.");
      return;
    }

    if (!isFeatured && homepageFeaturedCount >= MAX_HOMEPAGE_FEATURED_CATEGORIES) {
      showToast("error", "Ana sayfada en fazla 4 koleksiyon yildizlanabilir.");
      return;
    }

    const previousSlugs = featuredCategorySlugs;
    const nextSlugs = isFeatured
      ? featuredCategorySlugs.filter((entry) => entry !== category.slug)
      : sortHomepageFeaturedSlugs([...featuredCategorySlugs, category.slug]);

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
              enforceFeaturedProductCaps: homepageCuration.enforceFeaturedProductCaps,
            },
          }),
        },
      });

      setHomepageCuration((current) => ({
        ...current,
        featuredCategorySlugs: nextSlugs,
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
      }));
      showToast("error", "Ana sayfa vitrini guncellenemedi");
    } finally {
      setFeaturedSavingSlug(null);
    }
  };

  const renderCategoryRow = (category: CategoryInfo, level: number = 0) => {
    const hasChildren = category.children && category.children.length > 0;
    const isExpanded = expandedIds.has(category.id);
    const shouldRenderImage = Boolean(category.image) && !imageErrors[category.id];
    const isHomepageFeatured = featuredCategorySlugs.includes(category.slug);
    const isHomepageFeatureSaving = featuredSavingSlug === category.slug;

    return (
      <div key={category.id} className="space-y-3">
        <div
          className={`group relative overflow-hidden rounded-[24px] border px-4 py-4 shadow-[0_18px_40px_rgba(94,61,32,0.08)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_48px_rgba(94,61,32,0.12)] sm:px-5 ${
            category.is_active !== false
              ? "border-[#ecdccf] bg-gradient-to-r from-white via-[#fffdfb] to-[#fbf4ee]"
              : "border-[#ebe2da] bg-gradient-to-r from-[#f8f1eb] via-[#f5efe8] to-[#f2ece6] opacity-80"
          }`}
          style={{ marginLeft: `${level * 22}px` }}
        >
          <div
            className="pointer-events-none absolute inset-y-4 left-0 w-1 rounded-r-full bg-gradient-to-b from-[#FE6100] to-[#ff8a3d]"
            style={{ opacity: Math.max(0.2, 1 - level * 0.18) }}
          />

          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
              <button
                type="button"
                onClick={() => toggleExpand(category.id)}
                aria-expanded={hasChildren ? isExpanded : undefined}
                aria-label={
                  hasChildren
                    ? isExpanded
                      ? `${category.name} alt koleksiyonlarını daralt`
                      : `${category.name} alt koleksiyonlarını genişlet`
                    : `${category.name} koleksiyonunun alt koleksiyonu yok`
                }
                disabled={!hasChildren}
                className={`mt-1 inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20 ${
                  hasChildren
                    ? "border-[#f2d6c2] bg-white text-[#7b5f49] hover:border-[#FE6100]/35 hover:text-[#FE6100]"
                    : "cursor-default border-transparent bg-transparent text-[#d1c2b4]"
                }`}
              >
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>

              <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-[20px] border border-white/70 bg-gradient-to-br from-[#fff3e9] to-[#f2dfcf] shadow-[0_12px_24px_rgba(254,97,0,0.12)]">
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
                  <div className="flex h-full w-full items-center justify-center text-[0px] text-transparent" aria-hidden="true">
                    {category.icon || "📦"}
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1 space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-base font-semibold tracking-[-0.02em] text-[#241913]">
                    {category.name}
                  </h3>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                      category.is_active !== false
                        ? "bg-[#fff0e5] text-[#c65500]"
                        : "bg-white/80 text-[#8f7e71]"
                    }`}
                  >
                    {category.is_active !== false ? "Aktif" : "Pasif"}
                  </span>
                  {hasChildren && (
                    <span className="inline-flex items-center rounded-full border border-[#eadfd5] bg-white/85 px-2.5 py-1 text-[11px] font-medium text-[#7b6758]">
                      {category.children?.length} alt koleksiyon
                    </span>
                  )}
                  {level > 0 && (
                    <span className="inline-flex items-center rounded-full border border-[#eedfce] bg-[#fbf5ef] px-2.5 py-1 text-[11px] font-medium text-[#8a6b52]">
                      Seviye {level + 1}
                    </span>
                  )}
                  {isHomepageFeatured && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                      <Star className="h-3 w-3 fill-current" />
                      Ana sayfa vitrini
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-sm text-[#776557]">
                  <span className="rounded-full bg-white/80 px-3 py-1 font-medium text-[#5c4738] shadow-sm">
                    /{category.slug}
                  </span>
                  <span className="rounded-full border border-[#eadfd5] bg-[#faf6f1] px-3 py-1 text-xs font-medium">
                    Sıra {category.sort_order || 0}
                  </span>
                </div>

                <p className="line-clamp-2 text-sm leading-6 text-[#7f6d5f]">
                  {category.description?.trim() || "Bu koleksiyon için henüz açıklama eklenmedi."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end lg:self-center">
              <button
                type="button"
                onClick={() => void handleHomepageFeatureToggle(category)}
                disabled={isHomepageFeatureSaving}
                aria-label={
                  isHomepageFeatured
                    ? `${category.name} koleksiyonunu ana sayfa vitrinden kaldir`
                    : `${category.name} koleksiyonunu ana sayfa vitrini icin yildizla`
                }
                className={`inline-flex h-11 items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-medium shadow-sm transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20 ${
                  isHomepageFeatured
                    ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                    : "border-[#ead9cb] bg-white text-[#654c3c] hover:border-[#FE6100]/30 hover:text-[#FE6100]"
                } ${isHomepageFeatureSaving ? "cursor-wait opacity-70" : ""}`}
              >
                {isHomepageFeatureSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Star className={`h-4 w-4 ${isHomepageFeatured ? "fill-current" : ""}`} />
                )}
                <span className="hidden sm:inline">
                  {isHomepageFeatured ? "Vitrinde" : "Yildizla"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleEdit(category)}
                aria-label={`${category.name} koleksiyonunu düzenle`}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-[#ead9cb] bg-white px-4 text-sm font-medium text-[#654c3c] shadow-sm transition hover:border-[#FE6100]/30 hover:text-[#FE6100] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20"
              >
                <Edit className="h-4 w-4" />
                <span className="hidden sm:inline">Düzenle</span>
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirm({ id: category.id, name: category.name })}
                aria-label={`${category.name} koleksiyonunu sil`}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-[#f1d3d0] bg-white px-4 text-sm font-medium text-[#9f4940] shadow-sm transition hover:border-[#d96457] hover:bg-[#fff5f4] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-200"
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">Sil</span>
              </button>
            </div>
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="space-y-3 border-l border-dashed border-[#ead7c7] pl-3 sm:pl-4">
            {category.children?.map((child) => renderCategoryRow(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#faf7f2] via-[#f6efe8] to-[#efe5da] px-1 pb-8 text-[#2d221c]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 top-12 h-72 w-72 rounded-full bg-[#FE6100]/8 blur-3xl" />
        <div className="absolute right-0 top-0 h-80 w-80 rounded-full bg-amber-200/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-96 w-96 rounded-full bg-orange-100/20 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-[1480px] space-y-6">
        <section className="overflow-hidden rounded-[32px] border border-[#f0ddd0] bg-gradient-to-br from-white via-[#fffdf9] to-[#f8f0e7] shadow-[0_28px_90px_rgba(100,62,27,0.12)]">
          <div className="border-b border-[#f2e3d6] px-6 py-6 md:px-8 md:py-7">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-0">
                <div className="inline-flex w-fit items-center rounded-full border border-[#FE6100]/20 bg-gradient-to-r from-[#FE6100]/10 to-[#ffb074]/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#c75400]">
                  Koleksiyonlar
                </div>
              </div>

              <button
                type="button"
                onClick={handleNew}
                className="inline-flex items-center justify-center gap-2 rounded-[22px] bg-gradient-to-r from-[#FE6100] to-[#e85a00] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_rgba(254,97,0,0.26)] transition hover:translate-y-[-1px] hover:from-[#f05c00] hover:to-[#d84f00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20"
              >
                <Plus className="h-4 w-4" />
                Yeni Koleksiyon
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-px bg-gradient-to-r from-[#f0ddd0] via-[#f7ebe2] to-[#f0ddd0] md:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Toplam koleksiyon", value: categories.length, tone: "text-[#241913]" },
              { label: "Aktif koleksiyon", value: activeCollections, tone: "text-emerald-700" },
              { label: "Alt koleksiyon", value: childCollections, tone: "text-[#b05b1f]" },
              { label: "Filtrelenen sonuç", value: filteredResults, tone: "text-[#6f5647]" },
            ].map((stat) => (
              <div key={stat.label} className="bg-white/85 px-5 py-4 md:px-6 md:py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8c7768]">{stat.label}</p>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <p className={`text-3xl font-semibold tracking-[-0.04em] ${stat.tone}`}>{stat.value}</p>
                  <p className="text-xs text-[#a18e81]">Koleksiyonlar</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[30px] border border-[#ecdccd] bg-gradient-to-br from-white/95 via-[#fffdfa] to-[#f6eee6] p-5 shadow-[0_24px_55px_rgba(98,64,33,0.09)] md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#ad7c56]">Tarama ve kontrol</p>
              <h2 className="text-xl font-semibold tracking-[-0.03em] text-[#241913]">Koleksiyon listesi</h2>
              <p className="text-sm leading-6 text-[#786658]">
                Koleksiyonları ad veya açıklama ile filtreleyin, hiyerarşiyi koruyarak daha rahat inceleyin.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#7d6a5d]">
              <span className="rounded-full border border-[#ebdccc] bg-white px-3 py-1.5 shadow-sm">
                Ana koleksiyon: {rootCollections}
              </span>
              <span className="rounded-full border border-[#ebdccc] bg-white px-3 py-1.5 shadow-sm">
                Gösterilen: {filteredResults}
              </span>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 rounded-[26px] border border-[#efdfd1] bg-gradient-to-r from-[#fffaf6] to-white p-3 shadow-inner sm:flex-row sm:items-center sm:p-4">
            <label htmlFor="collection-search" className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#b08d73]" />
              <input
                id="collection-search"
                type="text"
                placeholder="Koleksiyon ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-[20px] border border-[#ecdccd] bg-white pl-11 pr-4 py-3 text-sm text-[#2f241d] shadow-[0_12px_30px_rgba(99,67,37,0.06)] outline-none transition placeholder:text-[#a08e82] focus:border-[#FE6100]/40 focus:ring-4 focus:ring-[#FE6100]/15"
              />
            </label>

            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="inline-flex items-center justify-center gap-2 rounded-[18px] border border-[#ead7c8] bg-white px-4 py-3 text-sm font-medium text-[#6d5849] shadow-sm transition hover:border-[#FE6100]/30 hover:text-[#FE6100] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20"
              >
                <X className="h-4 w-4" />
                Temizle
              </button>
            ) : null}
          </div>
        </section>

        {loading ? (
          <section className="rounded-[30px] border border-[#eadbcd] bg-white/85 p-5 shadow-[0_24px_55px_rgba(98,64,33,0.08)] md:p-6">
            <div className="space-y-4">
              {[0, 1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="animate-pulse rounded-[26px] border border-[#efe3d8] bg-gradient-to-r from-white to-[#faf4ee] p-5"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-2xl bg-[#f1e5d9]" />
                    <div className="h-14 w-14 rounded-[20px] bg-[#f3e7db]" />
                    <div className="flex-1 space-y-3">
                      <div className="h-4 w-48 rounded-full bg-[#ecdccc]" />
                      <div className="h-3 w-32 rounded-full bg-[#f0e4d9]" />
                      <div className="h-3 w-full max-w-xl rounded-full bg-[#f4ebe3]" />
                    </div>
                    <div className="hidden gap-3 sm:flex">
                      <div className="h-11 w-24 rounded-2xl bg-[#f3e6d9]" />
                      <div className="h-11 w-20 rounded-2xl bg-[#f8dfdc]" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : categories.length === 0 ? (
          <section className="rounded-[30px] border border-[#eadccd] bg-gradient-to-br from-white via-[#fffdf9] to-[#f8efe6] p-10 text-center shadow-[0_24px_55px_rgba(98,64,33,0.08)]">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[28px] bg-gradient-to-br from-[#fff0e3] to-[#f6deca] shadow-[0_18px_35px_rgba(254,97,0,0.12)]">
              <FolderTree className="h-9 w-9 text-[#FE6100]" />
            </div>
            <div className="mx-auto mt-6 max-w-xl space-y-3">
              <h3 className="text-2xl font-semibold tracking-[-0.03em] text-[#241913]">Henüz koleksiyon yok</h3>
              <p className="text-sm leading-7 text-[#7b685a]">
                Vitrin yapısını oluşturmak için ilk koleksiyonunuzu ekleyin. Hazırlanan liste, alt
                koleksiyonları da aynı ekranda net bir hiyerarşiyle gösterecek.
              </p>
            </div>
            <button
              type="button"
              onClick={handleNew}
              className="mt-6 inline-flex items-center gap-2 rounded-[20px] bg-gradient-to-r from-[#FE6100] to-[#e85a00] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_rgba(254,97,0,0.24)] transition hover:translate-y-[-1px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20"
            >
              <Plus className="h-4 w-4" />
              Yeni Koleksiyon
            </button>
          </section>
        ) : (
          <section className="rounded-[30px] border border-[#eadccd] bg-gradient-to-br from-white via-[#fffdfa] to-[#f9f2eb] p-4 shadow-[0_24px_60px_rgba(98,64,33,0.09)] md:p-5">
            <div className="mb-4 flex flex-col gap-2 px-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-[-0.03em] text-[#241913]">Koleksiyon ağacı</h2>
                <p className="text-sm text-[#7b685a]">Hiyerarşi, durum ve düzenleme aksiyonları tek listede.</p>
              </div>
            </div>

            {filteredTree.length > 0 ? (
              <div className="space-y-3">{filteredTree.map((category) => renderCategoryRow(category))}</div>
            ) : (
              <div className="rounded-[26px] border border-dashed border-[#ead8c8] bg-[#fffaf6] p-10 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[24px] bg-[#fff1e7] text-[#FE6100] shadow-sm">
                  <Search className="h-7 w-7" />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-[#241913]">Aramanızla eşleşen koleksiyon bulunamadı</h3>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#7a6859]">
                  Farklı bir ad veya açıklama deneyin. Liste davranışı değişmeden yalnızca mevcut sonuçlar filtrelenir.
                </p>
              </div>
            )}
          </section>
        )}
      </div>

      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6">
          <div className="absolute inset-0 bg-[#2d1f16]/45 backdrop-blur-sm" onClick={() => setIsFormOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="collection-form-title"
            className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-[32px] border border-[#efddcf] bg-gradient-to-br from-white via-[#fffdfa] to-[#f8efe6] shadow-[0_34px_100px_rgba(52,34,18,0.28)]"
          >
            <div className="sticky top-0 z-10 border-b border-[#efdfd0] bg-white/95 px-6 py-5 backdrop-blur md:px-8">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ad7b56]">Form sayfası</p>
                  <h2 id="collection-form-title" className="text-2xl font-semibold tracking-[-0.04em] text-[#241913]">
                    {editingCategory ? "Koleksiyon Düzenle" : "Yeni Koleksiyon"}
                  </h2>
                  <p className="text-sm leading-6 text-[#7a6859]">
                    Koleksiyon bilgilerini, görselini ve vitrin ayarlarını tek akışta düzenleyin.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  aria-label="Koleksiyon formunu kapat"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#ead9cb] bg-white text-[#6b584b] shadow-sm transition hover:border-[#FE6100]/30 hover:text-[#FE6100] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6 md:px-8 md:py-7">
                <section className={SECTION_CLASSNAME}>
                  <div className="mb-5 space-y-1.5">
                    <h3 className="text-lg font-semibold text-[#241913]">Temel Bilgiler</h3>
                    <p className="text-sm text-[#7b685a]">Koleksiyonun görünen adını, bağlantısını ve ağaçtaki konumunu belirleyin.</p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label htmlFor="collection-name" className="mb-2 block text-sm font-medium text-[#4c392d]">
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
                      <label htmlFor="collection-slug" className="mb-2 block text-sm font-medium text-[#4c392d]">
                        URL Slug <span className="text-[#d04f45]">*</span>
                      </label>
                      <div className="flex items-center gap-2 rounded-[22px] border border-[#eadfd4] bg-white px-4 shadow-[0_8px_24px_rgba(125,92,67,0.06)] focus-within:border-[#FE6100]/40 focus-within:ring-4 focus-within:ring-[#FE6100]/15">
                        <span className="text-sm text-[#927f72]">/</span>
                        <input
                          id="collection-slug"
                          type="text"
                          value={formData.slug}
                          onChange={(e) => setFormData((prev) => ({ ...prev, slug: generateSlug(e.target.value) }))}
                          className="min-w-0 flex-1 bg-transparent py-3 text-sm text-[#2f241d] outline-none placeholder:text-[#9a8778]"
                          placeholder="fistik-ezmesi"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="collection-parent" className="mb-2 block text-sm font-medium text-[#4c392d]">
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
                      <label htmlFor="collection-description" className="mb-2 block text-sm font-medium text-[#4c392d]">
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
                    <h3 className="text-lg font-semibold text-[#241913]">Görsel</h3>
                    <p className="text-sm text-[#7b685a]">Liste ve vitrin alanlarında kullanılacak görseli yükleyin veya yenileyin.</p>
                  </div>

                  <div className="rounded-[28px] border border-dashed border-[#e8d4c4] bg-gradient-to-br from-[#fffaf6] to-white p-5 text-center transition hover:border-[#FE6100]/35 md:p-7">
                    {formData.image ? (
                      <div className="space-y-4">
                        <div className="relative mx-auto inline-flex">
                          <img src={formData.image} alt="Preview" className="max-h-56 rounded-[24px] border border-[#f1dfd1] shadow-[0_18px_35px_rgba(94,61,32,0.12)]" />
                          <button
                            type="button"
                            onClick={() => setFormData((prev) => ({ ...prev, image: "" }))}
                            aria-label="Yüklenen görseli kaldır"
                            className="absolute -right-3 -top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#cf4e43] text-white shadow-lg transition hover:bg-[#b94136] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-200"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        <p className="text-sm text-[#7b685a]">Görseli değiştirmek için yeni bir dosya seçin veya mevcut görseli kaldırın.</p>
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
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[24px] bg-gradient-to-br from-[#fff0e4] to-[#f7decb] shadow-[0_16px_28px_rgba(254,97,0,0.12)]">
                          {uploading ? <Loader2 className="h-7 w-7 animate-spin text-[#FE6100]" /> : <ImageIcon className="h-7 w-7 text-[#FE6100]" />}
                        </div>
                        <p className="mt-4 text-sm font-medium text-[#4e3b2f]">
                          {uploading ? "Görsel yükleniyor..." : "Görsel yüklemek için tıklayın"}
                        </p>
                        <p className="mt-1 text-xs text-[#8d7a6d]">{SUPPORTED_IMAGE_FORMATS_WITH_GIF_LABEL} - Max 5MB</p>
                      </label>
                    )}
                  </div>
                </section>

                <section className={SECTION_CLASSNAME}>
                  <div className="mb-5 space-y-1.5">
                    <h3 className="text-lg font-semibold text-[#241913]">SEO Ayarları</h3>
                    <p className="text-sm text-[#7b685a]">Arama görünümlerinde kullanilacak başlık ve açıklamayi dengeleyin.</p>
                  </div>

                  <div className="grid gap-4">
                    <div>
                      <label htmlFor="collection-seo-title" className="mb-2 block text-sm font-medium text-[#4c392d]">
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
                      <p className="mt-2 text-xs text-[#917f72]">{formData.seo_title.length}/60 karakter</p>
                    </div>

                    <div>
                      <label htmlFor="collection-seo-description" className="mb-2 block text-sm font-medium text-[#4c392d]">
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
                      <p className="mt-2 text-xs text-[#917f72]">{formData.seo_description.length}/160 karakter</p>
                    </div>
                  </div>
                </section>

                <section className={SECTION_CLASSNAME}>
                  <div className="mb-5 space-y-1.5">
                    <h3 className="text-lg font-semibold text-[#241913]">Ayarlar</h3>
                    <p className="text-sm text-[#7b685a]">Koleksiyonun vitrin sırasını ve aktif durumunu buradan yönetin.</p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label htmlFor="collection-sort-order" className="mb-2 block text-sm font-medium text-[#4c392d]">
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

                    <div className="rounded-[22px] border border-[#eaded2] bg-white/80 p-4 shadow-sm">
                      <label className="flex cursor-pointer items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-[#4c392d]">Aktif durumu</p>
                          <p className="mt-1 text-xs text-[#8b786b]">Pasif koleksiyonlar listede daha soluk görünür.</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={formData.is_active}
                          onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
                          className="h-5 w-5 rounded border-gray-300 text-[#FE6100] focus:ring-[#FE6100]"
                        />
                      </label>
                    </div>
                  </div>
                </section>
              </div>

              <div className="sticky bottom-0 border-t border-[#efdfd0] bg-white/95 px-6 py-4 backdrop-blur md:px-8">
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="inline-flex items-center justify-center rounded-[18px] border border-[#ead9cb] bg-white px-5 py-3 text-sm font-medium text-[#654c3c] shadow-sm transition hover:border-[#FE6100]/30 hover:text-[#FE6100] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20"
                  >
                    İptal
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center justify-center gap-2 rounded-[18px] bg-gradient-to-r from-[#FE6100] to-[#e85a00] px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_rgba(254,97,0,0.24)] transition hover:from-[#ef5d00] hover:to-[#d85100] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20"
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
          <div className="absolute inset-0 bg-[#2d1f16]/45 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-collection-title"
            className="relative w-full max-w-md overflow-hidden rounded-[30px] border border-[#efd9d3] bg-gradient-to-br from-white via-[#fffdfa] to-[#fbf1ef] shadow-[0_34px_90px_rgba(52,34,18,0.28)]"
          >
            <div className="border-b border-[#f3dfda] px-6 py-5">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-[22px] bg-gradient-to-br from-[#fff0ec] to-[#ffd9d4] text-[#c24d42] shadow-sm">
                  <AlertCircle className="h-7 w-7" />
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b46d63]">Silme onayı</p>
                  <h3 id="delete-collection-title" className="text-xl font-semibold tracking-[-0.03em] text-[#2f1e18]">
                    Koleksiyonu Sil
                  </h3>
                  <p className="text-sm leading-6 text-[#7e675d]">Bu işlem geri alınamaz ve mevcut bağlantıları etkileyebilir.</p>
                </div>
              </div>
            </div>

            <div className="px-6 py-5">
              <div className="rounded-[22px] border border-[#f1dfd8] bg-white/85 p-4 text-sm leading-6 text-[#5f4a3c] shadow-sm">
                <strong className="font-semibold text-[#2f1e18]">{deleteConfirm.name}</strong> koleksiyonu
                sistemden kaldırılacak.
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-[#f3dfda] bg-white/90 px-6 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="inline-flex items-center justify-center rounded-[18px] border border-[#ead9cb] bg-white px-5 py-3 text-sm font-medium text-[#654c3c] shadow-sm transition hover:border-[#FE6100]/25 hover:text-[#FE6100] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="inline-flex items-center justify-center rounded-[18px] bg-gradient-to-r from-[#d55649] to-[#c44639] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_30px_rgba(213,86,73,0.24)] transition hover:from-[#c94a3d] hover:to-[#b63d32] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-200"
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
            className={`flex items-start gap-3 rounded-[22px] border px-4 py-3.5 shadow-[0_24px_50px_rgba(45,31,22,0.18)] backdrop-blur ${
              toast.type === "success"
                ? "border-emerald-200 bg-white text-emerald-800"
                : toast.type === "error"
                  ? "border-red-200 bg-white text-red-700"
                  : "border-[#f1dcc8] bg-white text-[#a65a24]"
            }`}
          >
            <div
              className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-full ${
                toast.type === "success"
                  ? "bg-emerald-100 text-emerald-700"
                  : toast.type === "error"
                    ? "bg-red-100 text-red-600"
                    : "bg-[#fff1e6] text-[#FE6100]"
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
