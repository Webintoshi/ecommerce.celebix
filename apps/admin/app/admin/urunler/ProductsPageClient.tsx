"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  Eye,
  GripVertical,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Star,
  Trash2,
  Upload,
} from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { fetchAdminJson } from "@/lib/admin-client-fetch";
import { buildCategoryLabelMap, buildProductCategoryTree } from "@/lib/admin-product-categories";
import type {
  AdminPaginationMeta,
  AdminProductListItem,
  AdminProductVariant,
} from "@/lib/admin-data-types";
import { fetchCategories } from "@/lib/categories";
import { buildStorefrontProductUrl } from "@/lib/store-runtime";
import { cn } from "@/lib/utils";
import type { CategoryInfo } from "@/types/product";

const SURFACE_FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]/25 focus-visible:ring-offset-2 focus-visible:ring-offset-white";

const CATEGORY_BADGE_STYLES = [
  "border-[#FFD7BF] bg-[#FFF1E8] text-[#E85D04]",
  "border-[#DCE9FF] bg-[#F1F6FF] text-[#3B82F6]",
  "border-[#E6DCF9] bg-[#F6F1FF] text-[#8B5CF6]",
  "border-[#D8F0E0] bg-[#EAF8EF] text-[#16A34A]",
];

type Notice = {
  tone: "success" | "error";
  text: string;
};

type ProductLoadOptions = {
  allProducts?: boolean;
  searchQuery?: string;
  categoryFilter?: string;
  limit?: number;
};

type SortMode =
  | "newest"
  | "oldest"
  | "manual"
  | "name-asc"
  | "name-desc"
  | "price-desc"
  | "price-asc"
  | "stock-desc"
  | "stock-asc";

type StatusFilter = "all" | "active" | "draft" | "passive";
type StockFilter = "all" | "in-stock" | "low" | "out";
type BulkAction = "" | "publish" | "unpublish" | "bulk-stock" | "delete";

type HomepageCurationState = {
  featuredCategorySlugs: string[];
  featuredProductIdsByCategory: Record<string, string[]>;
  enforceFeaturedProductCaps: boolean;
};

type ProductsPageClientProps = {
  initialProducts?: AdminProductListItem[];
  initialCategories?: CategoryInfo[];
  initialPagination?: AdminPaginationMeta;
  initialError?: string;
};

const DEFAULT_HOMEPAGE_CURATION: HomepageCurationState = {
  featuredCategorySlugs: [],
  featuredProductIdsByCategory: {},
  enforceFeaturedProductCaps: false,
};

const MAX_HOMEPAGE_FEATURED_PRODUCTS_PER_CATEGORY = 4;
const MAX_HOMEPAGE_FEATURED_PRODUCTS_TOTAL = 16;

function formatCurrency(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value?: string | null, includeTime = false) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

function normalizeCategoryKey(value?: string | null) {
  return String(value || "").trim().toLocaleLowerCase("tr-TR");
}

function normalizeFeaturedProductIdsByCategory(value: unknown, featuredCategorySlugs: string[]) {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const allowedCategorySlugs = new Set(
    featuredCategorySlugs.map((entry) => normalizeCategoryKey(entry)).filter(Boolean),
  );

  let remainingCapacity = MAX_HOMEPAGE_FEATURED_PRODUCTS_TOTAL;

  return featuredCategorySlugs.reduce<Record<string, string[]>>((result, slug) => {
    const normalizedKey = normalizeCategoryKey(slug);
    if (!normalizedKey || !allowedCategorySlugs.has(normalizedKey) || remainingCapacity <= 0) {
      return result;
    }

    const rawValue = record[slug] ?? record[normalizedKey];
    const normalizedIds = Array.isArray(rawValue)
      ? rawValue
          .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
          .map((entry) => entry.trim())
          .filter((entry, index, source) => source.indexOf(entry) === index)
          .slice(0, Math.min(MAX_HOMEPAGE_FEATURED_PRODUCTS_PER_CATEGORY, remainingCapacity))
      : [];

    if (normalizedIds.length > 0) {
      result[normalizedKey] = normalizedIds;
      remainingCapacity -= normalizedIds.length;
    }

    return result;
  }, {});
}

function getCategoryBadgeStyle(index: number) {
  return CATEGORY_BADGE_STYLES[index % CATEGORY_BADGE_STYLES.length] || CATEGORY_BADGE_STYLES[0];
}

function getStockMeta(stock: number) {
  if (stock <= 0) {
    return {
      label: "Stok yok",
      tone: "border-[#F5D3D3] bg-[#FDECEC] text-[#EF4444]",
    };
  }

  if (stock <= 10) {
    return {
      label: `${stock} adet`,
      tone: "border-[#FCE1B5] bg-[#FFF7E8] text-[#B45309]",
    };
  }

  return {
    label: `${stock} adet`,
    tone: "border-[#CFECD7] bg-[#EAF8EF] text-[#16A34A]",
  };
}

function getProductStatusMeta(product: AdminProductListItem) {
  if (product.isDraft) {
    return {
      label: "Taslak",
      description: "Henüz yayına hazır değil",
      tone: "border-[#E6DCF9] bg-[#F3EEFF] text-[#8B5CF6]",
    };
  }

  if (!product.isActive || product.status === "inactive" || product.status === "archived") {
    return {
      label: "Pasif",
      description: "Vitrinde görünmüyor",
      tone: "border-[#F5D3D3] bg-[#FDECEC] text-[#EF4444]",
    };
  }

  return {
    label: "Aktif",
    description: null,
    tone: "border-[#CFECD7] bg-[#EAF8EF] text-[#16A34A]",
  };
}

function transformProduct(dbProduct: Record<string, unknown>): AdminProductListItem {
  const variants = (dbProduct.variants as Record<string, unknown>[]) || [];
  const normalizedSortOrder =
    Number(
      (dbProduct.sort_order as number | string | undefined) ??
        (dbProduct.sortOrder as number | string | undefined) ??
        0,
    ) || 0;

  return {
    id: dbProduct.id as string,
    name: dbProduct.name as string,
    slug: dbProduct.slug as string,
    sortOrder: normalizedSortOrder,
    createdAt: (dbProduct.created_at as string | undefined) || null,
    publishedAt: (dbProduct.published_at as string | undefined) || null,
    description: (dbProduct.description as string) || "",
    shortDescription: (dbProduct.short_description as string) || "",
    images: (dbProduct.images as string[]) || [],
    category: (dbProduct.category as string) || "",
    subcategory: (dbProduct.subcategory as string) || "",
    tags: (dbProduct.tags as string[]) || [],
    variants: variants.map((variant: Record<string, unknown>) => ({
      id: variant.id as string,
      name: (variant.name as string) || "Varsayılan",
      price: Number(variant.price) || 0,
      originalPrice: variant.original_price ? Number(variant.original_price) : undefined,
      stock: Number(variant.stock) || 0,
      sku: (variant.sku as string) || "",
    })),
    isActive:
      typeof dbProduct.is_active === "boolean"
        ? Boolean(dbProduct.is_active)
        : Boolean(dbProduct.isActive ?? true),
    isDraft: Boolean(dbProduct.is_draft ?? dbProduct.isDraft),
    status: ((dbProduct.status as string) || "published").toLowerCase(),
    featured: Boolean(dbProduct.is_featured ?? dbProduct.featured),
    isNew: Boolean(dbProduct.is_new ?? dbProduct.isNew),
  };
}

function renderPrice(primaryVariant: AdminProductVariant) {
  if (primaryVariant.originalPrice && primaryVariant.originalPrice > primaryVariant.price) {
    return (
      <div className="space-y-1">
        <div className="text-sm text-[#9CA3AF] line-through">
          {formatCurrency(primaryVariant.originalPrice)}
        </div>
        <div className="text-base font-semibold text-[#1F2937]">
          {formatCurrency(primaryVariant.price)}
        </div>
      </div>
    );
  }

  return <div className="text-base font-semibold text-[#1F2937]">{formatCurrency(primaryVariant.price)}</div>;
}

function buildCsv(rows: AdminProductListItem[]) {
  const header = [
    "Ürün Adı",
    "Slug",
    "Kategori",
    "SKU",
    "Fiyat",
    "Stok",
    "Durum",
    "Yayında",
  ];

  const lines = rows.map((product) => {
    const primaryVariant = product.variants[0];
    const statusMeta = getProductStatusMeta(product);
    return [
      product.name,
      product.slug,
      product.category || "",
      primaryVariant?.sku || "",
      String(primaryVariant?.price || 0),
      String(primaryVariant?.stock || 0),
      statusMeta.label,
      product.isActive ? "Evet" : "Hayır",
    ]
      .map((value) => `"${String(value).replaceAll('"', '""')}"`)
      .join(",");
  });

  return [header.join(","), ...lines].join("\n");
}

export default function ProductsPageClient({
  initialProducts = [],
  initialCategories = [],
  initialPagination = {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  },
  initialError = "",
}: ProductsPageClientProps) {
  const [products, setProducts] = useState<AdminProductListItem[]>(initialProducts);
  const [categories, setCategories] = useState<CategoryInfo[]>(initialCategories);
  const [homepageCuration, setHomepageCuration] = useState<HomepageCurationState>(DEFAULT_HOMEPAGE_CURATION);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<BulkAction>("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(initialError);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pagination, setPagination] = useState<AdminPaginationMeta>(initialPagination);
  const [rowsPerPage, setRowsPerPage] = useState(initialPagination.limit > 0 ? initialPagination.limit : 20);
  const [reorderMode, setReorderMode] = useState(false);
  const [reorderingProductId, setReorderingProductId] = useState<string | null>(null);
  const [togglingFeaturedProductIds, setTogglingFeaturedProductIds] = useState<string[]>([]);
  const [togglingPublishProductIds, setTogglingPublishProductIds] = useState<string[]>([]);
  const [isBulkStockModalOpen, setIsBulkStockModalOpen] = useState(false);
  const [bulkStockValue, setBulkStockValue] = useState("");
  const [bulkStockSubmitting, setBulkStockSubmitting] = useState(false);
  const hasLoadedInitialDataRef = useRef(false);
  const hasMountedFiltersRef = useRef(false);
  const pagedPageRef = useRef(initialPagination.page);
  const rowsPerPageRef = useRef(initialPagination.limit > 0 ? initialPagination.limit : 20);
  const catalogStateRef = useRef<{
    searchQuery: string;
    categoryFilter: string;
    sortMode: SortMode;
    page: number;
  }>({
    searchQuery: "",
    categoryFilter: "all",
    sortMode: "newest",
    page: initialPagination.page,
  });

  const categoryTree = buildProductCategoryTree(categories);
  const categoryLabelMap = buildCategoryLabelMap(categories);
  const categoryFilters = [
    { value: "all", label: "Tümü", color: "border-[#E7EAF0] bg-[#F9FAFB] text-[#6B7280]" },
    ...categoryTree.map((category, index) => ({
      value: category.slug,
      label: category.name,
      color: getCategoryBadgeStyle(index),
    })),
  ];

  const getPrimaryVariant = (product: AdminProductListItem) =>
    product.variants[0] || {
      id: "",
      name: "Varsayılan",
      price: 0,
      originalPrice: undefined,
      stock: 0,
      sku: "",
    };

  const getCategoryLabel = (slug: string) => categoryLabelMap.get(slug) || slug || "Kategorisiz";

  const getCategoryColor = (slug: string) =>
    categoryFilters.find((category) => category.value === slug)?.color ||
    "border-[#E7EAF0] bg-[#F9FAFB] text-[#6B7280]";

  const resolveHomepageCategorySlugForProduct = useCallback(
    (product: Pick<AdminProductListItem, "category" | "subcategory">) => {
      const featuredCategorySlugs = homepageCuration.featuredCategorySlugs.map((entry) =>
        normalizeCategoryKey(entry),
      );
      const primaryCategory = normalizeCategoryKey(product.category);
      if (primaryCategory && featuredCategorySlugs.includes(primaryCategory)) {
        return primaryCategory;
      }

      const secondaryCategory = normalizeCategoryKey(product.subcategory);
      if (secondaryCategory && featuredCategorySlugs.includes(secondaryCategory)) {
        return secondaryCategory;
      }

      return null;
    },
    [homepageCuration.featuredCategorySlugs],
  );

  const getHomepageFeaturedState = useCallback(
    (product: AdminProductListItem) => {
      const totalFeaturedProductCount = Object.values(
        homepageCuration.featuredProductIdsByCategory,
      ).reduce((sum, ids) => sum + ids.length, 0);

      if (!homepageCuration.enforceFeaturedProductCaps) {
        return {
          disabled: false,
          reason: null as string | null,
          homepageCategorySlug: null as string | null,
          featured: Boolean(product.featured),
        };
      }

      if (homepageCuration.featuredCategorySlugs.length === 0) {
        return {
          disabled: true,
          reason: "Önce koleksiyonlardan en az 1 ana sayfa kategorisi seçin.",
          homepageCategorySlug: null,
          featured: false,
        };
      }

      const homepageCategorySlug = resolveHomepageCategorySlugForProduct(product);
      if (!homepageCategorySlug) {
        return {
          disabled: true,
          reason: "Sadece ana sayfa için seçilen kategorilerdeki ürünler öne çıkarılabilir.",
          homepageCategorySlug: null,
          featured: false,
        };
      }

      const featuredProductIds =
        homepageCuration.featuredProductIdsByCategory[homepageCategorySlug] || [];
      const isFeatured = featuredProductIds.includes(product.id);

      if (!isFeatured && totalFeaturedProductCount >= MAX_HOMEPAGE_FEATURED_PRODUCTS_TOTAL) {
        return {
          disabled: true,
          reason: "Ana sayfa vitrini için toplam en fazla 16 ürün seçilebilir.",
          homepageCategorySlug,
          featured: false,
        };
      }

      if (!isFeatured && featuredProductIds.length >= MAX_HOMEPAGE_FEATURED_PRODUCTS_PER_CATEGORY) {
        return {
          disabled: true,
          reason: "Bir kategori içinde en fazla 4 ürün öne çıkarılabilir.",
          homepageCategorySlug,
          featured: false,
        };
      }

      return {
        disabled: false,
        reason: null as string | null,
        homepageCategorySlug,
        featured: isFeatured,
      };
    },
    [
      homepageCuration.enforceFeaturedProductCaps,
      homepageCuration.featuredCategorySlugs.length,
      homepageCuration.featuredProductIdsByCategory,
      resolveHomepageCategorySlugForProduct,
    ],
  );

  const loadProducts = useCallback(
    async (page: number = pagedPageRef.current, options?: ProductLoadOptions) => {
      setLoading(true);
      try {
        setErrorMessage("");
        const trimmedSearchQuery = (options?.searchQuery ?? searchQuery).trim();
        const effectiveCategoryFilter = options?.categoryFilter ?? categoryFilter;
        const shouldLoadAllProducts = options?.allProducts ?? reorderMode;
        const effectiveLimit = options?.limit ?? rowsPerPageRef.current;
        const params = new URLSearchParams();

        if (shouldLoadAllProducts) {
          params.set("all", "true");
        } else {
          params.set("page", page.toString());
          params.set("limit", effectiveLimit.toString());
        }

        if (trimmedSearchQuery) {
          params.set("search", trimmedSearchQuery);
        }

        if (effectiveCategoryFilter !== "all") {
          params.set("category", effectiveCategoryFilter);
        }

        const data = await fetchAdminJson<{
          success: boolean;
          products?: Record<string, unknown>[];
          pagination?: AdminPaginationMeta;
          error?: string;
        }>(`/api/products?${params.toString()}`, { timeoutMs: 12000 });

        if (data.success && data.products) {
          setProducts(data.products.map(transformProduct));
          if (shouldLoadAllProducts) {
            const totalProducts = data.pagination?.total ?? data.products.length;
            setPagination({
              page: 1,
              limit: totalProducts > 0 ? totalProducts : effectiveLimit,
              total: totalProducts,
              totalPages: totalProducts > 0 ? 1 : 0,
            });
            pagedPageRef.current = 1;
          } else if (data.pagination) {
            setPagination(data.pagination);
            pagedPageRef.current = data.pagination.page;
          }
        } else {
          setErrorMessage(data.error || "Ürün verileri alınamadı.");
        }
      } catch (error) {
        console.error("Failed to load products:", error);
        setErrorMessage(error instanceof Error ? error.message : "Ürün verileri yüklenemedi.");
      } finally {
        setLoading(false);
      }
    },
    [categoryFilter, reorderMode, searchQuery],
  );

  const loadCategories = async () => {
    try {
      const [categoryData, homepageCurationResponse] = await Promise.all([
        fetchCategories(),
        fetchAdminJson<{
          homepageCuration?: {
            featuredCategorySlugs?: string[];
            featuredProductIdsByCategory?: Record<string, string[]>;
            enforceFeaturedProductCaps?: boolean;
          };
        }>("/api/settings?type=homepage-curation", { timeoutMs: 10000 }),
      ]);

      setCategories(categoryData);

      const featuredCategorySlugs = Array.isArray(homepageCurationResponse.homepageCuration?.featuredCategorySlugs)
        ? homepageCurationResponse.homepageCuration.featuredCategorySlugs.filter(
            (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
          )
        : [];

      setHomepageCuration({
        featuredCategorySlugs,
        featuredProductIdsByCategory: normalizeFeaturedProductIdsByCategory(
          homepageCurationResponse.homepageCuration?.featuredProductIdsByCategory,
          featuredCategorySlugs,
        ),
        enforceFeaturedProductCaps: Boolean(
          homepageCurationResponse.homepageCuration?.enforceFeaturedProductCaps,
        ),
      });
    } catch (error) {
      console.error("Failed to load categories:", error);
      setErrorMessage((current) => current || "Kategori verileri yüklenemedi.");
    }
  };

  const loadHomepageCuration = useCallback(async () => {
    try {
      const response = await fetchAdminJson<{
        homepageCuration?: {
          featuredCategorySlugs?: string[];
          featuredProductIdsByCategory?: Record<string, string[]>;
          enforceFeaturedProductCaps?: boolean;
        };
      }>("/api/settings?type=homepage-curation", { timeoutMs: 10000 });

      const featuredCategorySlugs = Array.isArray(response.homepageCuration?.featuredCategorySlugs)
        ? response.homepageCuration.featuredCategorySlugs.filter(
            (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
          )
        : [];

      setHomepageCuration({
        featuredCategorySlugs,
        featuredProductIdsByCategory: normalizeFeaturedProductIdsByCategory(
          response.homepageCuration?.featuredProductIdsByCategory,
          featuredCategorySlugs,
        ),
        enforceFeaturedProductCaps: Boolean(response.homepageCuration?.enforceFeaturedProductCaps),
      });
    } catch (error) {
      console.error("Failed to load homepage curation:", error);
    }
  }, []);

  useEffect(() => {
    if (hasLoadedInitialDataRef.current) {
      return;
    }

    hasLoadedInitialDataRef.current = true;
    if (initialProducts.length === 0) {
      void loadProducts();
    }
    if (initialCategories.length === 0) {
      void loadCategories();
    }
  }, [initialCategories.length, initialProducts.length, loadProducts]);

  useEffect(() => {
    void loadHomepageCuration();
  }, [loadHomepageCuration]);

  useEffect(() => {
    if (!hasMountedFiltersRef.current) {
      hasMountedFiltersRef.current = true;
      return;
    }

    if (reorderMode) {
      return;
    }

    setSelectedProducts([]);
    const timeout = window.setTimeout(() => {
      void loadProducts(1, { limit: rowsPerPageRef.current });
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [categoryFilter, loadProducts, reorderMode, searchQuery]);

  const handleEnterReorderMode = async () => {
    if (reorderingProductId) {
      return;
    }

    catalogStateRef.current = {
      searchQuery,
      categoryFilter,
      sortMode,
      page: pagedPageRef.current,
    };

    setSelectedProducts([]);
    setSearchQuery("");
    setCategoryFilter("all");
    setSortMode("manual");
    setReorderMode(true);
    await loadProducts(1, {
      allProducts: true,
      searchQuery: "",
      categoryFilter: "all",
    });
  };

  const handleExitReorderMode = async () => {
    const previousCatalogState = catalogStateRef.current;

    setSelectedProducts([]);
    setReorderMode(false);
    setSearchQuery(previousCatalogState.searchQuery);
    setCategoryFilter(previousCatalogState.categoryFilter);
    setSortMode(previousCatalogState.sortMode);

    await loadProducts(previousCatalogState.page, {
      allProducts: false,
      searchQuery: previousCatalogState.searchQuery,
      categoryFilter: previousCatalogState.categoryFilter,
      limit: rowsPerPageRef.current,
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Bu ürünü silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.")) {
      return;
    }

    try {
      await fetchAdminJson(`/api/products?id=${id}`, {
        timeoutMs: 12000,
        init: { method: "DELETE" },
      });
      await loadProducts();
      setSelectedProducts((current) => current.filter((entry) => entry !== id));
      setNotice({ tone: "success", text: "Ürün silindi." });
    } catch (error) {
      console.error("Failed to delete product:", error);
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Ürün silinemedi.",
      });
    }
  };

  const handleToggleFeatured = async (product: AdminProductListItem) => {
    const homepageFeaturedState = getHomepageFeaturedState(product);
    const nextFeatured = !homepageFeaturedState.featured;

    if (nextFeatured && homepageFeaturedState.disabled) {
      setNotice({
        tone: "error",
        text: homepageFeaturedState.reason || "Bu ürün öne çıkarılamıyor.",
      });
      return;
    }

    setTogglingFeaturedProductIds((current) => [...current, product.id]);
    setNotice(null);

    try {
      if (homepageCuration.enforceFeaturedProductCaps) {
        const homepageCategorySlug = homepageFeaturedState.homepageCategorySlug;
        if (!homepageCategorySlug) {
          throw new Error("Ürün için geçerli bir ana sayfa kategorisi bulunamadı.");
        }

        const previousHomepageCuration = homepageCuration;
        const previousProductIds =
          homepageCuration.featuredProductIdsByCategory[homepageCategorySlug] || [];
        const nextProductIds = nextFeatured
          ? [...previousProductIds, product.id]
          : previousProductIds.filter((entry) => entry !== product.id);
        const nextFeaturedProductIdsByCategory = {
          ...homepageCuration.featuredProductIdsByCategory,
        };

        if (nextProductIds.length > 0) {
          nextFeaturedProductIdsByCategory[homepageCategorySlug] = nextProductIds;
        } else {
          delete nextFeaturedProductIdsByCategory[homepageCategorySlug];
        }

        const optimisticHomepageCuration: HomepageCurationState = {
          ...homepageCuration,
          featuredProductIdsByCategory: nextFeaturedProductIdsByCategory,
        };

        setHomepageCuration(optimisticHomepageCuration);

        try {
          const response = await fetchAdminJson<{
            homepageCuration?: {
              featuredCategorySlugs?: string[];
              featuredProductIdsByCategory?: Record<string, string[]>;
              enforceFeaturedProductCaps?: boolean;
            };
          }>("/api/settings", {
            timeoutMs: 12000,
            init: {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                type: "homepage-curation",
                homepageCuration: optimisticHomepageCuration,
              }),
            },
          });

          const normalizedFeaturedCategorySlugs = Array.isArray(response.homepageCuration?.featuredCategorySlugs)
            ? response.homepageCuration.featuredCategorySlugs.filter(
                (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
              )
            : optimisticHomepageCuration.featuredCategorySlugs;

          setHomepageCuration({
            featuredCategorySlugs: normalizedFeaturedCategorySlugs,
            featuredProductIdsByCategory: normalizeFeaturedProductIdsByCategory(
              response.homepageCuration?.featuredProductIdsByCategory,
              normalizedFeaturedCategorySlugs,
            ),
            enforceFeaturedProductCaps: Boolean(
              response.homepageCuration?.enforceFeaturedProductCaps ??
                optimisticHomepageCuration.enforceFeaturedProductCaps,
            ),
          });
        } catch (error) {
          setHomepageCuration(previousHomepageCuration);
          throw error;
        }
      } else {
        setProducts((current) =>
          current.map((entry) =>
            entry.id === product.id ? { ...entry, featured: nextFeatured } : entry,
          ),
        );

        try {
          await fetchAdminJson("/api/products", {
            timeoutMs: 12000,
            init: {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                id: product.id,
                is_featured: nextFeatured,
              }),
            },
          });
        } catch (error) {
          setProducts((current) =>
            current.map((entry) =>
              entry.id === product.id ? { ...entry, featured: product.featured } : entry,
            ),
          );
          throw error;
        }
      }

      setNotice({
        tone: "success",
        text: nextFeatured
          ? `${product.name} öne çıkarıldı.`
          : `${product.name} öne çıkanlardan kaldırıldı.`,
      });
    } catch (error) {
      console.error("Failed to toggle featured product:", error);
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Öne çıkan durumu güncellenemedi.",
      });
    } finally {
      setTogglingFeaturedProductIds((current) => current.filter((entry) => entry !== product.id));
    }
  };

  const handleTogglePublished = async (product: AdminProductListItem, nextValue: boolean) => {
    setNotice(null);
    setTogglingPublishProductIds((current) => [...current, product.id]);
    setProducts((current) =>
      current.map((entry) =>
        entry.id === product.id
          ? {
              ...entry,
              isActive: nextValue,
              publishedAt: nextValue ? entry.publishedAt || new Date().toISOString() : entry.publishedAt,
            }
          : entry,
      ),
    );

    try {
      await fetchAdminJson("/api/products", {
        timeoutMs: 12000,
        init: {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: product.id,
            is_active: nextValue,
            published_at: nextValue ? product.publishedAt || new Date().toISOString() : product.publishedAt,
          }),
        },
      });

      setNotice({
        tone: "success",
        text: nextValue ? "Ürün yayına alındı." : "Ürün yayından kaldırıldı.",
      });
    } catch (error) {
      console.error("Failed to update product visibility:", error);
      setProducts((current) =>
        current.map((entry) =>
          entry.id === product.id
            ? {
                ...entry,
                isActive: product.isActive,
                publishedAt: product.publishedAt,
              }
            : entry,
        ),
      );
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Ürün görünürlüğü güncellenemedi.",
      });
    } finally {
      setTogglingPublishProductIds((current) => current.filter((entry) => entry !== product.id));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedProducts.length === 0) {
      return;
    }

    if (!confirm(`${selectedProducts.length} ürünü silmek istediğinizden emin misiniz?`)) {
      return;
    }

    try {
      setNotice(null);
      await Promise.all(
        selectedProducts.map((id) =>
          fetchAdminJson(`/api/products?id=${id}`, {
            timeoutMs: 12000,
            init: { method: "DELETE" },
          }),
        ),
      );
      await loadProducts();
      setSelectedProducts([]);
      setNotice({ tone: "success", text: "Seçili ürünler silindi." });
    } catch (error) {
      console.error("Failed to delete products:", error);
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Toplu silme işlemi tamamlanamadı.",
      });
    }
  };

  const handleBulkPublish = async (nextValue: boolean) => {
    const targetIds = selectedProducts.filter((id) => {
      const product = products.find((entry) => entry.id === id);
      return product && product.isActive !== nextValue;
    });

    if (targetIds.length === 0) {
      setNotice({
        tone: "error",
        text: nextValue ? "Seçili ürünlerin tamamı zaten yayında." : "Seçili ürünlerin tamamı zaten yayında değil.",
      });
      return;
    }

    const previousProducts = products;
    setTogglingPublishProductIds((current) => [...current, ...targetIds]);
    setProducts((current) =>
      current.map((product) =>
        targetIds.includes(product.id)
          ? {
              ...product,
              isActive: nextValue,
              publishedAt: nextValue ? product.publishedAt || new Date().toISOString() : product.publishedAt,
            }
          : product,
      ),
    );

    try {
      await Promise.all(
        targetIds.map((id) => {
          const product = previousProducts.find((entry) => entry.id === id);
          return fetchAdminJson("/api/products", {
            timeoutMs: 12000,
            init: {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                id,
                is_active: nextValue,
                published_at:
                  nextValue && product ? product.publishedAt || new Date().toISOString() : product?.publishedAt,
              }),
            },
          });
        }),
      );

      setNotice({
        tone: "success",
        text: nextValue
          ? `${targetIds.length} ürün yayına alındı.`
          : `${targetIds.length} ürün yayından kaldırıldı.`,
      });
    } catch (error) {
      console.error("Failed to bulk update product visibility:", error);
      setProducts(previousProducts);
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Toplu görünürlük güncellenemedi.",
      });
    } finally {
      setTogglingPublishProductIds((current) =>
        current.filter((entry) => !targetIds.includes(entry)),
      );
    }
  };

  const closeBulkStockModal = () => {
    if (bulkStockSubmitting) {
      return;
    }

    setIsBulkStockModalOpen(false);
    setBulkStockValue("");
  };

  const handleBulkStockUpdate = async () => {
    const parsedStock = Number(bulkStockValue);

    if (!Number.isFinite(parsedStock) || parsedStock < 0) {
      setNotice({ tone: "error", text: "Geçerli bir stok sayısı girin." });
      return;
    }

    try {
      setBulkStockSubmitting(true);
      setNotice(null);

      const data = await fetchAdminJson<{
        success: boolean;
        updatedProducts: number;
        updatedVariants: number;
        stock: number;
      }>("/api/admin/products/bulk-stock", {
        timeoutMs: 20000,
        init: {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            productIds: selectedProducts,
            stock: parsedStock,
          }),
        },
      });

      await loadProducts();
      setSelectedProducts([]);
      setIsBulkStockModalOpen(false);
      setBulkStockValue("");
      setNotice({
        tone: "success",
        text: `${data.updatedProducts} ürünün ${data.updatedVariants} varyantı için stok ${data.stock} olarak güncellendi.`,
      });
    } catch (error) {
      console.error("Failed to bulk update stock:", error);
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Toplu stok güncellenemedi.",
      });
    } finally {
      setBulkStockSubmitting(false);
    }
  };

  const handleSelectAll = (checked: boolean, source: AdminProductListItem[]) => {
    if (checked) {
      setSelectedProducts(source.map((product) => product.id));
      return;
    }

    setSelectedProducts([]);
  };

  const handleSelectProduct = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedProducts((current) => [...new Set([...current, id])]);
      return;
    }

    setSelectedProducts((current) => current.filter((entry) => entry !== id));
  };

  const persistManualOrder = async (reorderedProducts: AdminProductListItem[]) => {
    setProducts(reorderedProducts);
    setNotice(null);

    try {
      await fetchAdminJson("/api/admin/products/reorder", {
        timeoutMs: 15000,
        init: {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            orderedIds: reorderedProducts.map((product) => product.id),
          }),
        },
      });

      await loadProducts(pagination.page);
      setNotice({
        tone: "success",
        text: "Ürün sıralaması güncellendi.",
      });
    } catch (error) {
      console.error("Failed to reorder products:", error);
      await loadProducts(pagination.page);
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Ürün sıralaması güncellenemedi.",
      });
    } finally {
      setReorderingProductId(null);
    }
  };

  const filteredProducts = products.filter((product) => {
    const primaryVariant = getPrimaryVariant(product);
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && !product.isDraft && product.isActive) ||
      (statusFilter === "draft" && product.isDraft) ||
      (statusFilter === "passive" && !product.isDraft && !product.isActive);

    const matchesStock =
      stockFilter === "all" ||
      (stockFilter === "in-stock" && primaryVariant.stock > 10) ||
      (stockFilter === "low" && primaryVariant.stock > 0 && primaryVariant.stock <= 10) ||
      (stockFilter === "out" && primaryVariant.stock <= 0);

    return matchesStatus && matchesStock;
  });

  const getSortedProducts = () => {
    if (sortMode === "manual") {
      return [...filteredProducts].sort((a, b) => a.sortOrder - b.sortOrder);
    }

    return [...filteredProducts].sort((a, b) => {
      const aVariant = getPrimaryVariant(a);
      const bVariant = getPrimaryVariant(b);

      switch (sortMode) {
        case "oldest":
          return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
        case "name-asc":
          return a.name.localeCompare(b.name, "tr");
        case "name-desc":
          return b.name.localeCompare(a.name, "tr");
        case "price-asc":
          return aVariant.price - bVariant.price;
        case "price-desc":
          return bVariant.price - aVariant.price;
        case "stock-asc":
          return aVariant.stock - bVariant.stock;
        case "stock-desc":
          return bVariant.stock - aVariant.stock;
        case "newest":
        default:
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      }
    });
  };

  const sortedProducts = getSortedProducts();
  const canUseManualReorder = reorderMode && sortMode === "manual" && reorderingProductId === null;
  const activeProducts = products.filter((product) => !product.isDraft && product.isActive).length;
  const draftProducts = products.filter((product) => product.isDraft).length;
  const lowStockProducts = products.filter((product) => getPrimaryVariant(product).stock <= 10).length;
  const startRow = reorderMode ? (sortedProducts.length > 0 ? 1 : 0) : (pagination.page - 1) * pagination.limit + 1;
  const endRow = reorderMode ? sortedProducts.length : startRow + sortedProducts.length - 1;

  const handleManualReorder = async (productId: string, direction: "up" | "down") => {
    if (!canUseManualReorder) {
      return;
    }

    const currentIndex = sortedProducts.findIndex((product) => product.id === productId);
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= sortedProducts.length) {
      return;
    }

    const reorderedProducts = [...sortedProducts];
    [reorderedProducts[currentIndex], reorderedProducts[targetIndex]] = [
      reorderedProducts[targetIndex],
      reorderedProducts[currentIndex],
    ];

    setReorderingProductId(productId);
    await persistManualOrder(reorderedProducts);
  };

  const handleRowsPerPageChange = (nextValue: number) => {
    rowsPerPageRef.current = nextValue;
    setRowsPerPage(nextValue);

    if (!reorderMode) {
      void loadProducts(1, { limit: nextValue });
    }
  };

  const handleClearFilters = () => {
    setSearchQuery("");
    setCategoryFilter("all");
    setStatusFilter("all");
    setStockFilter("all");
    setSortMode("newest");
    setSelectedProducts([]);
  };

  const handleBulkActionApply = async () => {
    if (!bulkAction || selectedProducts.length === 0) {
      return;
    }

    if (bulkAction === "delete") {
      await handleBulkDelete();
    } else if (bulkAction === "bulk-stock") {
      setIsBulkStockModalOpen(true);
    } else if (bulkAction === "publish") {
      await handleBulkPublish(true);
    } else if (bulkAction === "unpublish") {
      await handleBulkPublish(false);
    }

    setBulkAction("");
  };

  const handleExport = () => {
    const csv = buildCsv(sortedProducts);
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `urun-listesi-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const tableSelectionActive = sortedProducts.length > 0 && selectedProducts.length === sortedProducts.length;

  return (
    <main role="main" aria-busy={loading} className="min-h-screen bg-[#F7F8FA]">
      <div className="mx-auto max-w-[1680px] px-4 py-4 md:px-6 md:py-6 xl:px-8">
        <div className="space-y-5">
          <section className="rounded-[28px] border border-[#E7EAF0] bg-white px-6 py-6 shadow-[0_18px_40px_rgba(15,23,42,0.04)] md:px-8">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
              <div className="space-y-3">
                <span className="inline-flex w-fit items-center rounded-full border border-[#FFD7BF] bg-[#FFF1E8] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#E85D04]">
                  Celebix Admin
                </span>
                <div>
                  <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[#1F2937] md:text-[34px]">
                    Ürün Yönetimi
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm text-[#6B7280] md:text-[15px]">
                    Ürünlerinizi yönetin, envanter durumunu ve görünürlüğünü kontrol edin.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 xl:justify-end">
                <button
                  type="button"
                  onClick={() => void (reorderMode ? handleExitReorderMode() : handleEnterReorderMode())}
                  disabled={loading || reorderingProductId !== null}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium transition-colors",
                    reorderMode
                      ? "border-[#FFD7BF] bg-[#FFF1E8] text-[#E85D04]"
                      : "border-[#E7EAF0] bg-white text-[#374151] hover:bg-[#F9FAFB]",
                    SURFACE_FOCUS_RING,
                  )}
                >
                  <GripVertical className="h-4 w-4" />
                  {reorderMode ? "Sıralamayı Bitir" : "Sıralamayı Düzenle"}
                </button>

                <button
                  type="button"
                  onClick={() => void loadProducts()}
                  className={cn(
                    "inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#E7EAF0] bg-white text-[#6B7280] transition-colors hover:bg-[#F9FAFB] hover:text-[#1F2937]",
                    SURFACE_FOCUS_RING,
                  )}
                  aria-label="Ürün listesini yenile"
                >
                  <RefreshCw className={cn("h-4 w-4", loading ? "animate-spin" : "")} />
                </button>

                <Link
                  href="/admin/urunler/toplu-yukle"
                  className={cn(
                    "inline-flex items-center gap-2 rounded-2xl border border-[#E7EAF0] bg-white px-4 py-2.5 text-sm font-medium text-[#374151] transition-colors hover:bg-[#F9FAFB]",
                    SURFACE_FOCUS_RING,
                  )}
                >
                  <Upload className="h-4 w-4" />
                  İçe Aktar
                </Link>

                <button
                  type="button"
                  onClick={handleExport}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-2xl border border-[#E7EAF0] bg-white px-4 py-2.5 text-sm font-medium text-[#374151] transition-colors hover:bg-[#F9FAFB]",
                    SURFACE_FOCUS_RING,
                  )}
                >
                  <Download className="h-4 w-4" />
                  Dışa Aktar
                </button>

                <Link
                  href="/admin/urunler/yeni"
                  className={cn(
                    "inline-flex items-center gap-2 rounded-2xl bg-[#FF6A00] px-4 py-2.5 text-sm font-medium text-white shadow-[0_10px_24px_rgba(255,106,0,0.18)] transition-colors hover:bg-[#E85D04]",
                    SURFACE_FOCUS_RING,
                  )}
                >
                  <Plus className="h-4 w-4" />
                  Yeni Ürün Ekle
                </Link>
              </div>
            </div>
          </section>

          {(errorMessage || notice) && (
            <div aria-live="polite" className="space-y-3">
              {errorMessage ? (
                <div className="rounded-2xl border border-[#F5D3D3] bg-[#FDECEC] px-4 py-3 text-sm font-medium text-[#B91C1C]">
                  {errorMessage}
                </div>
              ) : null}

              {notice ? (
                <div
                  className={cn(
                    "rounded-2xl border px-4 py-3 text-sm font-medium",
                    notice.tone === "success"
                      ? "border-[#CFECD7] bg-[#EAF8EF] text-[#166534]"
                      : "border-[#F5D3D3] bg-[#FDECEC] text-[#B91C1C]",
                  )}
                >
                  {notice.text}
                </div>
              ) : null}
            </div>
          )}

          <section className="rounded-[28px] border border-[#E7EAF0] bg-white shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
            <div className="border-b border-[#EEF1F4] px-6 py-5 md:px-8">
              <div className="grid gap-4 xl:grid-cols-[minmax(320px,1.8fr)_repeat(4,minmax(0,1fr))_auto]">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Ürün adı, SKU veya kategori ara..."
                    className={cn(
                      "h-12 w-full rounded-2xl border border-[#E7EAF0] bg-white pl-11 pr-4 text-sm text-[#1F2937] placeholder:text-[#9CA3AF]",
                      SURFACE_FOCUS_RING,
                    )}
                  />
                </label>

                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                  className={cn(
                    "h-12 rounded-2xl border border-[#E7EAF0] bg-white px-4 text-sm text-[#374151]",
                    SURFACE_FOCUS_RING,
                  )}
                >
                  {categoryFilters.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>

                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                  className={cn(
                    "h-12 rounded-2xl border border-[#E7EAF0] bg-white px-4 text-sm text-[#374151]",
                    SURFACE_FOCUS_RING,
                  )}
                >
                  <option value="all">Tüm durumlar</option>
                  <option value="active">Aktif</option>
                  <option value="draft">Taslak</option>
                  <option value="passive">Pasif</option>
                </select>

                <select
                  value={stockFilter}
                  onChange={(event) => setStockFilter(event.target.value as StockFilter)}
                  className={cn(
                    "h-12 rounded-2xl border border-[#E7EAF0] bg-white px-4 text-sm text-[#374151]",
                    SURFACE_FOCUS_RING,
                  )}
                >
                  <option value="all">Tüm stoklar</option>
                  <option value="in-stock">Stok iyi</option>
                  <option value="low">Düşük stok</option>
                  <option value="out">Stok yok</option>
                </select>

                <select
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as SortMode)}
                  disabled={reorderMode}
                  className={cn(
                    "h-12 rounded-2xl border border-[#E7EAF0] bg-white px-4 text-sm text-[#374151] disabled:cursor-not-allowed disabled:bg-[#F9FAFB] disabled:text-[#9CA3AF]",
                    SURFACE_FOCUS_RING,
                  )}
                >
                  <option value="newest">Sıralama: En yeni</option>
                  <option value="oldest">Sıralama: En eski</option>
                  <option value="name-asc">Sıralama: Ad (A-Z)</option>
                  <option value="name-desc">Sıralama: Ad (Z-A)</option>
                  <option value="price-desc">Sıralama: Fiyat yüksek</option>
                  <option value="price-asc">Sıralama: Fiyat düşük</option>
                  <option value="stock-desc">Sıralama: Stok yüksek</option>
                  <option value="stock-asc">Sıralama: Stok düşük</option>
                  <option value="manual">Sıralama: Manuel</option>
                </select>

                <button
                  type="button"
                  onClick={handleClearFilters}
                  className={cn(
                    "inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-[#E7EAF0] bg-white px-4 text-sm font-medium text-[#374151] transition-colors hover:bg-[#F9FAFB]",
                    SURFACE_FOCUS_RING,
                  )}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Filtreleri Temizle
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[#6B7280]">
                <span className="inline-flex items-center rounded-full border border-[#EEF1F4] bg-[#F9FAFB] px-3 py-1.5">
                  {sortedProducts.length} ürün görüntüleniyor
                </span>
                <span className="inline-flex items-center rounded-full border border-[#EEF1F4] bg-[#F9FAFB] px-3 py-1.5">
                  {activeProducts} aktif
                </span>
                <span className="inline-flex items-center rounded-full border border-[#EEF1F4] bg-[#F9FAFB] px-3 py-1.5">
                  {draftProducts} taslak
                </span>
                <span className="inline-flex items-center rounded-full border border-[#EEF1F4] bg-[#F9FAFB] px-3 py-1.5">
                  {lowStockProducts} düşük stok
                </span>
                {reorderMode ? (
                  <span className="inline-flex items-center rounded-full border border-[#FFD7BF] bg-[#FFF1E8] px-3 py-1.5 text-[#E85D04]">
                    Manuel sıralama modu açık
                  </span>
                ) : null}
              </div>
            </div>

            <div className="border-b border-[#EEF1F4] px-6 py-4 md:px-8">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-3 rounded-2xl border border-[#E7EAF0] bg-white px-4 py-2.5 text-sm text-[#374151]">
                    <input
                      type="checkbox"
                      checked={tableSelectionActive}
                      onChange={(event) => handleSelectAll(event.target.checked, sortedProducts)}
                      aria-label="Görüntülenen tüm ürünleri seç"
                      className={cn(
                        "h-4 w-4 rounded border-[#D1D5DB] text-[#FF6A00] accent-[#FF6A00]",
                        SURFACE_FOCUS_RING,
                      )}
                    />
                    Tümünü seç
                  </label>

                  <select
                    value={bulkAction}
                    onChange={(event) => setBulkAction(event.target.value as BulkAction)}
                    className={cn(
                      "h-11 rounded-2xl border border-[#E7EAF0] bg-white px-4 text-sm text-[#374151]",
                      SURFACE_FOCUS_RING,
                    )}
                  >
                    <option value="">Toplu İşlemler</option>
                    <option value="publish">Yayına Al</option>
                    <option value="unpublish">Yayından Kaldır</option>
                    <option value="bulk-stock">Toplu Stok Güncelle</option>
                    <option value="delete">Sil</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => void handleBulkActionApply()}
                    disabled={!bulkAction || selectedProducts.length === 0}
                    className={cn(
                      "inline-flex h-11 items-center justify-center rounded-2xl bg-[#1F2937] px-4 text-sm font-medium text-white transition-colors hover:bg-[#111827] disabled:cursor-not-allowed disabled:bg-[#D1D5DB]",
                      SURFACE_FOCUS_RING,
                    )}
                  >
                    Uygula
                  </button>

                  <span className="text-sm text-[#6B7280]">{selectedProducts.length} ürün seçildi</span>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-sm text-[#6B7280]">
                  <span>
                    {startRow > 0 ? `${startRow} - ${endRow}` : 0} / {reorderMode ? sortedProducts.length : pagination.total} ürün
                  </span>
                  <label className="inline-flex items-center gap-2 rounded-2xl border border-[#E7EAF0] bg-white px-3 py-2">
                    <span>Satır sayısı</span>
                    <select
                      value={rowsPerPage}
                      onChange={(event) => handleRowsPerPageChange(Number(event.target.value))}
                      disabled={reorderMode}
                      className="bg-transparent text-[#374151] focus:outline-none disabled:text-[#9CA3AF]"
                    >
                      {[10, 20, 25, 50].map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!reorderMode && pagination.totalPages > 1 ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void loadProducts(pagination.page - 1)}
                        disabled={pagination.page <= 1}
                        className={cn(
                          "inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#E7EAF0] bg-white text-[#6B7280] transition-colors hover:bg-[#F9FAFB] disabled:cursor-not-allowed disabled:opacity-50",
                          SURFACE_FOCUS_RING,
                        )}
                        aria-label="Önceki sayfa"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="min-w-[48px] text-center text-sm font-medium text-[#374151]">
                        {pagination.page} / {pagination.totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => void loadProducts(pagination.page + 1)}
                        disabled={pagination.page >= pagination.totalPages}
                        className={cn(
                          "inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#E7EAF0] bg-white text-[#6B7280] transition-colors hover:bg-[#F9FAFB] disabled:cursor-not-allowed disabled:opacity-50",
                          SURFACE_FOCUS_RING,
                        )}
                        aria-label="Sonraki sayfa"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="hidden lg:block overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="border-b border-[#EEF1F4] bg-[#FCFDFE] text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6B7280]">
                    <th className="px-5 py-4">Sıra</th>
                    <th className="px-4 py-4">Seç</th>
                    <th className="px-5 py-4">Ürün</th>
                    <th className="px-4 py-4">Kategori</th>
                    <th className="px-4 py-4">SKU</th>
                    <th className="px-4 py-4">Fiyat</th>
                    <th className="px-4 py-4">Stok</th>
                    <th className="px-4 py-4">Durum</th>
                    <th className="px-4 py-4 text-center">Yayında</th>
                    <th className="px-5 py-4 text-right">İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && sortedProducts.length === 0
                    ? Array.from({ length: 8 }).map((_, index) => (
                        <tr key={`skeleton-${index}`} className="border-b border-[#EEF1F4]">
                          <td className="px-5 py-5" colSpan={10}>
                            <div className="h-12 animate-pulse rounded-2xl bg-[#F3F4F6]" />
                          </td>
                        </tr>
                      ))
                    : null}

                  {!loading && sortedProducts.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-5 py-14 text-center">
                        <div className="mx-auto max-w-md space-y-3">
                          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#E7EAF0] bg-[#F9FAFB] text-[#9CA3AF]">
                            <Package className="h-6 w-6" />
                          </div>
                          <h3 className="text-lg font-semibold text-[#1F2937]">Ürün bulunamadı</h3>
                          <p className="text-sm leading-6 text-[#6B7280]">
                            Mevcut filtrelerle eşleşen ürün yok. Filtreleri temizleyip tekrar deneyin veya yeni ürün ekleyin.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : null}

                  {sortedProducts.map((product, index) => {
                    const primaryVariant = getPrimaryVariant(product);
                    const stockMeta = getStockMeta(primaryVariant.stock);
                    const statusMeta = getProductStatusMeta(product);
                    const isFeaturedUpdating = togglingFeaturedProductIds.includes(product.id);
                    const isPublishUpdating = togglingPublishProductIds.includes(product.id);
                    const homepageFeaturedState = getHomepageFeaturedState(product);
                    const isFeatured = homepageFeaturedState.featured;
                    const canMoveUp = reorderMode && index > 0;
                    const canMoveDown = reorderMode && index < sortedProducts.length - 1;

                    return (
                      <tr key={product.id} className="border-b border-[#EEF1F4] align-top transition-colors hover:bg-[#FAFBFC]">
                        <td className="px-5 py-4">
                          <div className="flex items-start gap-3">
                            <div className="mt-1 flex h-9 w-9 items-center justify-center rounded-2xl border border-[#E7EAF0] bg-white text-[#9CA3AF]">
                              <GripVertical className="h-4 w-4" />
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-[#1F2937]">{product.sortOrder}</div>
                              <div className="mt-1 text-xs text-[#9CA3AF]">
                                {formatDate(product.createdAt, true)}
                              </div>
                              {reorderMode ? (
                                <div className="mt-3 flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void handleManualReorder(product.id, "up")}
                                    disabled={!canMoveUp || reorderingProductId !== null}
                                    className={cn(
                                      "inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#E7EAF0] bg-white text-[#6B7280] transition-colors hover:bg-[#F9FAFB] disabled:cursor-not-allowed disabled:opacity-40",
                                      SURFACE_FOCUS_RING,
                                    )}
                                  >
                                    <ArrowUp className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleManualReorder(product.id, "down")}
                                    disabled={!canMoveDown || reorderingProductId !== null}
                                    className={cn(
                                      "inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#E7EAF0] bg-white text-[#6B7280] transition-colors hover:bg-[#F9FAFB] disabled:cursor-not-allowed disabled:opacity-40",
                                      SURFACE_FOCUS_RING,
                                    )}
                                  >
                                    <ArrowDown className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <input
                            type="checkbox"
                            checked={selectedProducts.includes(product.id)}
                            onChange={(event) => handleSelectProduct(product.id, event.target.checked)}
                            aria-label={`${product.name} ürününü seç`}
                            className={cn(
                              "mt-2 h-4 w-4 rounded border-[#D1D5DB] text-[#FF6A00] accent-[#FF6A00]",
                              SURFACE_FOCUS_RING,
                            )}
                          />
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex min-w-[280px] items-start gap-4">
                            {product.images.length > 0 ? (
                              <img
                                src={product.images[0]}
                                alt={product.name}
                                className="h-16 w-16 rounded-2xl border border-[#E7EAF0] object-cover"
                              />
                            ) : (
                              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#E7EAF0] bg-[#F9FAFB] text-[#9CA3AF]">
                                <Package className="h-5 w-5" />
                              </div>
                            )}

                            <div className="min-w-0">
                              <div className="truncate text-[15px] font-semibold text-[#1F2937]">
                                {product.name}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <span className={cn("inline-flex rounded-full border px-3 py-1.5 text-xs font-medium", getCategoryColor(product.category))}>
                            {getCategoryLabel(product.category)}
                          </span>
                        </td>

                        <td className="px-4 py-4 text-sm font-medium text-[#374151]">
                          {primaryVariant.sku || "-"}
                        </td>

                        <td className="px-4 py-4">{renderPrice(primaryVariant)}</td>

                        <td className="px-4 py-4">
                          <span
                            className={cn(
                              "inline-flex min-w-[88px] items-center justify-center whitespace-nowrap rounded-full border px-3 py-1.5 text-center text-sm font-medium leading-none",
                              stockMeta.tone,
                            )}
                          >
                            {stockMeta.label}
                          </span>
                        </td>

                        <td className="px-4 py-4">
                          <div className="space-y-2">
                            <span className={cn("inline-flex rounded-full border px-3 py-1.5 text-xs font-medium", statusMeta.tone)}>
                              {statusMeta.label}
                            </span>
                            {statusMeta.description ? (
                              <div className="text-xs text-[#6B7280]">{statusMeta.description}</div>
                            ) : null}
                          </div>
                        </td>

                        <td className="px-4 py-4 text-center">
                          <div className="flex flex-col items-center gap-2">
                            <Switch
                              checked={product.isActive}
                              onCheckedChange={(checked) => void handleTogglePublished(product, checked)}
                              disabled={isPublishUpdating}
                              aria-label={`${product.name} ürününü ${product.isActive ? "yayından kaldır" : "yayına al"}`}
                              className={cn(
                                "h-8 w-[54px] border border-[#E7EAF0] p-[3px] data-[state=checked]:border-[#FF6A00] data-[state=checked]:bg-[#FF6A00] data-[state=unchecked]:bg-[#E5E7EB]",
                                isPublishUpdating ? "opacity-70" : "",
                              )}
                              thumbClassName="h-[22px] w-[22px] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.18)] data-[state=checked]:translate-x-[22px] data-[state=unchecked]:translate-x-0"
                            />
                            <span className={cn("text-xs font-medium", product.isActive ? "text-[#E85D04]" : "text-[#9CA3AF]")}>
                              {isPublishUpdating ? "Kaydediliyor" : product.isActive ? "Açık" : "Kapalı"}
                            </span>
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={buildStorefrontProductUrl(product.slug)}
                              target="_blank"
                              rel="noreferrer"
                              className={cn(
                                "inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#E7EAF0] bg-white text-[#6B7280] transition-colors hover:bg-[#F9FAFB] hover:text-[#1F2937]",
                                SURFACE_FOCUS_RING,
                              )}
                              aria-label={`${product.name} vitrinde görüntüle`}
                            >
                              <Eye className="h-4 w-4" />
                            </Link>

                            <Link
                              href={`/admin/urunler/${product.id}/duzenle`}
                              className={cn(
                                "inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#E7EAF0] bg-white text-[#1F2937] transition-colors hover:bg-[#F9FAFB]",
                                SURFACE_FOCUS_RING,
                              )}
                              aria-label={`${product.name} düzenle`}
                            >
                              <Edit3 className="h-4 w-4" />
                            </Link>

                            <button
                              type="button"
                              onClick={() => void handleToggleFeatured(product)}
                              disabled={isFeaturedUpdating || (!isFeatured && homepageFeaturedState.disabled)}
                              className={cn(
                                "inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                                isFeatured
                                  ? "border-[#FFD7BF] bg-[#FFF1E8] text-[#E85D04]"
                                  : "border-[#E7EAF0] bg-white text-[#6B7280] hover:bg-[#F9FAFB] hover:text-[#1F2937]",
                                SURFACE_FOCUS_RING,
                              )}
                              aria-label={`${product.name} öne çıkar`}
                              title={homepageFeaturedState.reason || "Öne çıkar"}
                            >
                              {isFeaturedUpdating ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Star className={cn("h-4 w-4", isFeatured ? "fill-current" : "")} />
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => void handleDelete(product.id)}
                              className={cn(
                                "inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#F5D3D3] bg-white text-[#EF4444] transition-colors hover:bg-[#FDECEC]",
                                SURFACE_FOCUS_RING,
                              )}
                              aria-label={`${product.name} sil`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="space-y-4 p-4 lg:hidden">
              {loading && sortedProducts.length === 0
                ? Array.from({ length: 4 }).map((_, index) => (
                    <div key={`mobile-skeleton-${index}`} className="h-40 animate-pulse rounded-[24px] bg-[#F3F4F6]" />
                  ))
                : null}

              {!loading && sortedProducts.length === 0 ? (
                <div className="rounded-[24px] border border-[#E7EAF0] bg-[#FCFDFE] px-5 py-10 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#E7EAF0] bg-white text-[#9CA3AF]">
                    <Package className="h-6 w-6" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-[#1F2937]">Ürün bulunamadı</h3>
                  <p className="mt-2 text-sm leading-6 text-[#6B7280]">
                    Filtreleri temizleyin veya yeni bir ürün ekleyin.
                  </p>
                </div>
              ) : null}

              {sortedProducts.map((product, index) => {
                const primaryVariant = getPrimaryVariant(product);
                const stockMeta = getStockMeta(primaryVariant.stock);
                const statusMeta = getProductStatusMeta(product);
                const isFeaturedUpdating = togglingFeaturedProductIds.includes(product.id);
                const isPublishUpdating = togglingPublishProductIds.includes(product.id);
                const homepageFeaturedState = getHomepageFeaturedState(product);
                const isFeatured = homepageFeaturedState.featured;

                return (
                  <article
                    key={product.id}
                    className="rounded-[24px] border border-[#E7EAF0] bg-white p-4 shadow-[0_14px_28px_rgba(15,23,42,0.04)]"
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedProducts.includes(product.id)}
                        onChange={(event) => handleSelectProduct(product.id, event.target.checked)}
                        aria-label={`${product.name} ürününü seç`}
                        className={cn(
                          "mt-1 h-4 w-4 rounded border-[#D1D5DB] text-[#FF6A00] accent-[#FF6A00]",
                          SURFACE_FOCUS_RING,
                        )}
                      />

                      {product.images.length > 0 ? (
                        <img
                          src={product.images[0]}
                          alt={product.name}
                          className="h-16 w-16 rounded-2xl border border-[#E7EAF0] object-cover"
                        />
                      ) : (
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#E7EAF0] bg-[#F9FAFB] text-[#9CA3AF]">
                          <Package className="h-5 w-5" />
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-[15px] font-semibold text-[#1F2937]">{product.name}</h3>
                          </div>
                          <Switch
                            checked={product.isActive}
                            onCheckedChange={(checked) => void handleTogglePublished(product, checked)}
                            disabled={isPublishUpdating}
                            aria-label={`${product.name} görünürlüğünü değiştir`}
                            className={cn(
                              "h-8 w-[54px] border border-[#E7EAF0] p-[3px] data-[state=checked]:border-[#FF6A00] data-[state=checked]:bg-[#FF6A00] data-[state=unchecked]:bg-[#E5E7EB]",
                              isPublishUpdating ? "opacity-70" : "",
                            )}
                            thumbClassName="h-[22px] w-[22px] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.18)] data-[state=checked]:translate-x-[22px] data-[state=unchecked]:translate-x-0"
                          />
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className={cn("inline-flex rounded-full border px-3 py-1 text-xs font-medium", getCategoryColor(product.category))}>
                            {getCategoryLabel(product.category)}
                          </span>
                          <span className={cn("inline-flex rounded-full border px-3 py-1 text-xs font-medium", statusMeta.tone)}>
                            {statusMeta.label}
                          </span>
                          <span className={cn("inline-flex rounded-full border px-3 py-1 text-xs font-medium", stockMeta.tone)}>
                            {stockMeta.label}
                          </span>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-[#6B7280]">
                          <div>
                            <div className="text-xs uppercase tracking-[0.14em] text-[#9CA3AF]">SKU</div>
                            <div className="mt-1 font-medium text-[#374151]">{primaryVariant.sku || "-"}</div>
                          </div>
                          <div>
                            <div className="text-xs uppercase tracking-[0.14em] text-[#9CA3AF]">Fiyat</div>
                            <div className="mt-1">{renderPrice(primaryVariant)}</div>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between gap-2">
                          <div className="text-xs text-[#9CA3AF]">
                            {product.sortOrder} • {formatDate(product.createdAt, true)}
                          </div>
                          <div className="flex items-center gap-2">
                            {reorderMode ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => void handleManualReorder(product.id, "up")}
                                  disabled={index === 0 || reorderingProductId !== null}
                                  className={cn(
                                    "inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-[#E7EAF0] bg-white text-[#6B7280] disabled:opacity-40",
                                    SURFACE_FOCUS_RING,
                                  )}
                                >
                                  <ArrowUp className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleManualReorder(product.id, "down")}
                                  disabled={index === sortedProducts.length - 1 || reorderingProductId !== null}
                                  className={cn(
                                    "inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-[#E7EAF0] bg-white text-[#6B7280] disabled:opacity-40",
                                    SURFACE_FOCUS_RING,
                                  )}
                                >
                                  <ArrowDown className="h-4 w-4" />
                                </button>
                              </>
                            ) : null}
                            <Link
                              href={`/admin/urunler/${product.id}/duzenle`}
                              className={cn(
                                "inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-[#E7EAF0] bg-white text-[#1F2937]",
                                SURFACE_FOCUS_RING,
                              )}
                            >
                              <Edit3 className="h-4 w-4" />
                            </Link>
                            <button
                              type="button"
                              onClick={() => void handleToggleFeatured(product)}
                              disabled={isFeaturedUpdating || (!isFeatured && homepageFeaturedState.disabled)}
                              className={cn(
                                "inline-flex h-9 w-9 items-center justify-center rounded-2xl border disabled:opacity-50",
                                isFeatured
                                  ? "border-[#FFD7BF] bg-[#FFF1E8] text-[#E85D04]"
                                  : "border-[#E7EAF0] bg-white text-[#6B7280]",
                                SURFACE_FOCUS_RING,
                              )}
                            >
                              {isFeaturedUpdating ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Star className={cn("h-4 w-4", isFeatured ? "fill-current" : "")} />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(product.id)}
                              className={cn(
                                "inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-[#F5D3D3] bg-white text-[#EF4444]",
                                SURFACE_FOCUS_RING,
                              )}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      {isBulkStockModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/45 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-stock-modal-title"
            aria-describedby="bulk-stock-modal-description"
            className="w-full max-w-md rounded-[28px] border border-[#E7EAF0] bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.18)]"
          >
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#E85D04]">Toplu stok güncelle</p>
              <h2 id="bulk-stock-modal-title" className="text-2xl font-semibold tracking-[-0.04em] text-[#1F2937]">
                Seçili ürünlerin stoklarını güncelle
              </h2>
              <p id="bulk-stock-modal-description" className="text-sm leading-6 text-[#6B7280]">
                Seçilen {selectedProducts.length} ürünün tüm varyant stokları aynı değere çekilecek.
              </p>
            </div>

            <div className="mt-6 space-y-3">
              <label htmlFor="bulk-stock-input" className="block text-sm font-medium text-[#374151]">
                Yeni stok değeri
              </label>
              <input
                id="bulk-stock-input"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={bulkStockValue}
                onChange={(event) => setBulkStockValue(event.target.value)}
                placeholder="Örnek: 25"
                className={cn(
                  "h-12 w-full rounded-2xl border border-[#E7EAF0] bg-white px-4 text-sm text-[#1F2937] placeholder:text-[#9CA3AF]",
                  SURFACE_FOCUS_RING,
                )}
              />
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeBulkStockModal}
                disabled={bulkStockSubmitting}
                className={cn(
                  "inline-flex h-11 items-center rounded-2xl border border-[#E7EAF0] bg-white px-4 text-sm font-medium text-[#374151] transition-colors hover:bg-[#F9FAFB] disabled:opacity-50",
                  SURFACE_FOCUS_RING,
                )}
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => void handleBulkStockUpdate()}
                disabled={bulkStockSubmitting}
                className={cn(
                  "inline-flex h-11 items-center gap-2 rounded-2xl bg-[#FF6A00] px-4 text-sm font-medium text-white transition-colors hover:bg-[#E85D04] disabled:opacity-50",
                  SURFACE_FOCUS_RING,
                )}
              >
                {bulkStockSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Kaydet
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
