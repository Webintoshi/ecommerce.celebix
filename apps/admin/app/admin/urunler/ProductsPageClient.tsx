"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { buildCategoryLabelMap, buildProductCategoryTree } from "@/lib/admin-product-categories";
import { fetchCategories } from "@/lib/categories";
import type {
  AdminPaginationMeta,
  AdminProductListItem,
  AdminProductVariant,
} from "@/lib/admin-data-types";
import type { CategoryInfo } from "@/types/product";
import {
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  Package,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Eye,
  RefreshCw,
  Grid,
  List as ListIcon,
  Star,
  ChevronDown,
  Loader2,
  ArrowUp,
  ArrowDown,
  GripVertical,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { buildStorefrontProductUrl } from "@/lib/store-runtime";
import { fetchAdminJson } from "@/lib/admin-client-fetch";

const CATEGORY_BADGE_STYLES = [
  { value: "all", label: "Tümü", color: "border-stone-200 bg-stone-100 text-stone-700" },
  { value: "fistik-ezmesi", label: "Fıstık Ezmesi", color: "border-amber-200 bg-amber-100 text-amber-800" },
  { value: "findik-ezmesi", label: "Fındık Ezmesi", color: "border-orange-200 bg-orange-100 text-orange-800" },
  { value: "kuruyemis", label: "Kuruyemiş", color: "border-emerald-200 bg-emerald-100 text-emerald-800" },
];

const SURFACE_FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FE6100]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f6efe8]";

function getCategoryBadgeStyle(index: number) {
  return (
    CATEGORY_BADGE_STYLES[index % CATEGORY_BADGE_STYLES.length]?.color ||
    "border-stone-200 bg-stone-100 text-stone-700"
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function getStockMeta(stock: number) {
  if (stock > 20) {
    return {
      label: "Stok iyi",
      tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
      icon: CheckCircle,
    };
  }

  if (stock > 10) {
    return {
      label: "Takipte",
      tone: "border-amber-200 bg-amber-50 text-amber-700",
      icon: AlertTriangle,
    };
  }

  return {
    label: "Kritik stok",
    tone: "border-rose-200 bg-rose-50 text-rose-700",
    icon: AlertTriangle,
  };
}

function renderPrice(primaryVariant: AdminProductVariant) {
  if (primaryVariant.originalPrice && primaryVariant.originalPrice > primaryVariant.price) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-stone-400 line-through">
          {formatCurrency(primaryVariant.originalPrice)}
        </span>
        <span className="text-lg font-semibold text-[#C94E00]">{formatCurrency(primaryVariant.price)}</span>
      </div>
    );
  }

  return <span className="text-lg font-semibold text-[#C94E00]">{formatCurrency(primaryVariant.price)}</span>;
}

// Transform database product to frontend format
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
    description: (dbProduct.description as string) || "",
    shortDescription: (dbProduct.short_description as string) || "",
    images: (dbProduct.images as string[]) || [],
    category: (dbProduct.category as string) || "",
    subcategory: (dbProduct.subcategory as string) || "",
    tags: (dbProduct.tags as string[]) || [],
    variants: variants.map((v: Record<string, unknown>) => ({
      id: v.id as string,
      name: v.name as string,
      price: Number(v.price) || 0,
      originalPrice: v.original_price ? Number(v.original_price) : undefined,
      stock: Number(v.stock) || 0,
      sku: (v.sku as string) || "",
    })),
    featured: Boolean(dbProduct.is_featured),
    isNew: Boolean(dbProduct.is_new),
  };
}

type ProductsPageClientProps = {
  initialProducts?: AdminProductListItem[];
  initialCategories?: CategoryInfo[];
  initialPagination?: AdminPaginationMeta;
  initialError?: string;
};

type ProductLoadOptions = {
  allProducts?: boolean;
  searchQuery?: string;
  categoryFilter?: string;
};

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
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"grid" | "table">("table");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(initialError);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [sortBy, setSortBy] = useState<"manual" | "name" | "price" | "stock">("manual");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [reorderMode, setReorderMode] = useState(false);
  const [pagination, setPagination] = useState<AdminPaginationMeta>(initialPagination);
  const [isBulkStockModalOpen, setIsBulkStockModalOpen] = useState(false);
  const [bulkStockValue, setBulkStockValue] = useState("");
  const [bulkStockSubmitting, setBulkStockSubmitting] = useState(false);
  const [reorderingProductId, setReorderingProductId] = useState<string | null>(null);
  const [draggedProductId, setDraggedProductId] = useState<string | null>(null);
  const [dragOverProductId, setDragOverProductId] = useState<string | null>(null);
  const hasLoadedInitialDataRef = useRef(false);
  const hasMountedFiltersRef = useRef(false);
  const pagedPageRef = useRef(initialPagination.page);
  const catalogStateRef = useRef({
    searchQuery: "",
    categoryFilter: "all",
    sortBy: "manual" as "manual" | "name" | "price" | "stock",
    sortOrder: "asc" as "asc" | "desc",
    viewMode: "table" as "grid" | "table",
    page: initialPagination.page,
  });
  const categoryTree = buildProductCategoryTree(categories);
  const categoryLabelMap = buildCategoryLabelMap(categories);
  const categoryFilters = [
    { value: "all", label: "Tümü", color: "border-stone-200 bg-stone-100 text-stone-700" },
    ...categoryTree.map((category, index) => ({
      value: category.slug,
      label: category.name,
      color: getCategoryBadgeStyle(index),
    })),
  ];

  const getPrimaryVariant = (product: AdminProductListItem) =>
    product.variants[0] || {
      id: "",
      name: "Varyant yok",
      price: 0,
      originalPrice: undefined,
      stock: 0,
      sku: "",
    };

  const getCategoryLabel = (slug: string) => categoryLabelMap.get(slug) || slug || "Kategorisiz";

  const getCategoryColor = (slug: string) =>
    categoryFilters.find((category) => category.value === slug)?.color ||
    "border-stone-200 bg-stone-100 text-stone-700";

  const loadProducts = useCallback(
    async (page: number = pagination.page, options?: ProductLoadOptions) => {
      setLoading(true);
      try {
        setErrorMessage("");
        const trimmedSearchQuery = (options?.searchQuery ?? searchQuery).trim();
        const effectiveCategoryFilter = options?.categoryFilter ?? categoryFilter;
        const shouldLoadAllProducts = options?.allProducts ?? reorderMode;
        const params = new URLSearchParams();

        if (shouldLoadAllProducts) {
          params.set("all", "true");
        } else {
          params.set("page", page.toString());
          params.set("limit", pagination.limit.toString());
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
        }>(`/api/products?${params}`, { timeoutMs: 12000 });

        if (data.success && data.products) {
          setProducts(data.products.map(transformProduct));
          if (shouldLoadAllProducts) {
            const totalProducts = data.pagination?.total ?? data.products.length;
            setPagination({
              page: 1,
              limit: totalProducts > 0 ? totalProducts : pagination.limit,
              total: totalProducts,
              totalPages: totalProducts > 0 ? 1 : 0,
            });
          } else if (data.pagination) {
            setPagination(data.pagination);
            pagedPageRef.current = data.pagination.page;
          } else {
            setPagination((current) => ({
              ...current,
              page,
            }));
            pagedPageRef.current = page;
          }
        } else {
          setErrorMessage(data.error || "Ürün verileri alınamadı.");
        }
      } catch (error) {
        console.error("Failed to load products:", error);
        setErrorMessage("Ürün verileri şu anda getirilemedi.");
      } finally {
        setLoading(false);
      }
    },
    [categoryFilter, pagination.limit, pagination.page, reorderMode, searchQuery],
  );

  const loadCategories = async () => {
    try {
      const data = await fetchCategories();
      setCategories(data);
    } catch (error) {
      console.error("Failed to load categories:", error);
      setErrorMessage((current) => current || "Kategori verileri şu anda getirilemedi.");
    }
  };

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
    if (!hasMountedFiltersRef.current) {
      hasMountedFiltersRef.current = true;
      return;
    }

    if (reorderMode) {
      return;
    }

    setSelectedProducts([]);
    const timeout = window.setTimeout(() => {
      void loadProducts(1);
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [categoryFilter, loadProducts, reorderMode, searchQuery]);

  const handleEnterReorderMode = async () => {
    if (reorderingProductId) {
      return;
    }

    catalogStateRef.current = {
      searchQuery,
      categoryFilter,
      sortBy,
      sortOrder,
      viewMode,
      page: pagedPageRef.current,
    };

    setSelectedProducts([]);
    setSearchQuery("");
    setCategoryFilter("all");
    setSortBy("manual");
    setSortOrder("asc");
    setViewMode("table");
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
    setSortBy(previousCatalogState.sortBy);
    setSortOrder(previousCatalogState.sortOrder);
    setViewMode(previousCatalogState.viewMode);

    await loadProducts(previousCatalogState.page, {
      allProducts: false,
      searchQuery: previousCatalogState.searchQuery,
      categoryFilter: previousCatalogState.categoryFilter,
    });
  };

  const handleDelete = async (id: string) => {
    if (confirm("Bu ürünü silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.")) {
      try {
        const res = await fetch(`/api/products?id=${id}`, { method: "DELETE" });
        const data = await res.json();
        if (res.ok) {
          await loadProducts();
          setSelectedProducts((prev) => prev.filter((pid) => pid !== id));
        } else {
          alert(data.error || "Ürün silinirken bir hata oluştu");
        }
      } catch (error) {
        console.error("Failed to delete product:", error);
        alert("Ürün silinirken bir hata oluştu");
      }
    }
  };

  const handleBulkDelete = async () => {
    if (selectedProducts.length === 0) return;
    if (confirm(`${selectedProducts.length} ürünü silmek istediğinizden emin misiniz?`)) {
      try {
        setNotice(null);
        for (const id of selectedProducts) {
          await fetch(`/api/products?id=${id}`, { method: "DELETE" });
        }
        await loadProducts();
        setSelectedProducts([]);
      } catch (error) {
        console.error("Failed to delete products:", error);
      }
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
      setNotice({ tone: "error", text: "Geçerli bir stok sayısı girmelisiniz." });
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

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedProducts(filteredProducts.map((p) => p.id));
    } else {
      setSelectedProducts([]);
    }
  };

  const handleSelectProduct = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedProducts((prev) => [...prev, id]);
    } else {
      setSelectedProducts((prev) => prev.filter((pid) => pid !== id));
    }
  };

  const getSortedProducts = () => {
    if (sortBy === "manual") {
      return filteredProducts;
    }

    return [...filteredProducts].sort((a, b) => {
      let comparison = 0;
      const aPrimaryVariant = getPrimaryVariant(a);
      const bPrimaryVariant = getPrimaryVariant(b);

      if (sortBy === "price") {
        comparison = aPrimaryVariant.price - bPrimaryVariant.price;
      } else if (sortBy === "stock") {
        comparison = aPrimaryVariant.stock - bPrimaryVariant.stock;
      } else {
        comparison = a.name.localeCompare(b.name);
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });
  };

  const canUseManualReorder = reorderMode && sortBy === "manual" && reorderingProductId === null;

  const buildReorderedProducts = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) {
      return sortedProducts;
    }

    const nextProducts = [...sortedProducts];
    const sourceIndex = nextProducts.findIndex((product) => product.id === sourceId);
    const targetIndex = nextProducts.findIndex((product) => product.id === targetId);

    if (sourceIndex < 0 || targetIndex < 0) {
      return sortedProducts;
    }

    const [movedProduct] = nextProducts.splice(sourceIndex, 1);
    nextProducts.splice(targetIndex, 0, movedProduct);
    return nextProducts;
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
        text: "Ürün sıralaması güncellendi. Storefront aynı sırayı kullanacak.",
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
      setDraggedProductId(null);
      setDragOverProductId(null);
    }
  };

  const handleManualReorder = async (productId: string, direction: "up" | "down") => {
    if (sortBy !== "manual" || reorderingProductId || !reorderMode) {
      return;
    }

    const currentIndex = sortedProducts.findIndex((product) => product.id === productId);
    if (currentIndex < 0) {
      return;
    }

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= sortedProducts.length) {
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

  const handleDragStart = (event: React.DragEvent<HTMLElement>, productId: string) => {
    if (!canUseManualReorder) {
      return;
    }

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", productId);
    setDraggedProductId(productId);
    setDragOverProductId(productId);
  };

  const handleDragEnd = () => {
    setDraggedProductId(null);
    setDragOverProductId(null);
  };

  const handleDragOver = (event: React.DragEvent<HTMLElement>, productId: string) => {
    if (!draggedProductId || draggedProductId === productId || !canUseManualReorder) {
      return;
    }

    event.preventDefault();
    if (dragOverProductId !== productId) {
      setDragOverProductId(productId);
    }
  };

  const handleDrop = async (event: React.DragEvent<HTMLElement>, productId: string) => {
    event.preventDefault();

    if (!draggedProductId || draggedProductId === productId || !canUseManualReorder) {
      handleDragEnd();
      return;
    }

    setReorderingProductId(draggedProductId);
    const reorderedProducts = buildReorderedProducts(draggedProductId, productId);
    await persistManualOrder(reorderedProducts);
  };

  const filteredProducts = products;
  const sortedProducts = getSortedProducts();
  const stats = {
    total: pagination.total || products.length,
    featured: products.filter((product) => product.featured).length,
    new: products.filter((product) => product.isNew).length,
    lowStock: products.filter((product) => getPrimaryVariant(product).stock < 10).length,
    totalVariants: products.reduce((sum, product) => sum + product.variants.length, 0),
  };
  const activeCategoryLabel = categoryFilters.find((item) => item.value === categoryFilter)?.label || "Tümü";
  const activeFilterCount = Number(Boolean(searchQuery.trim())) + Number(categoryFilter !== "all");
  const visibleCount = sortedProducts.length;
  const bulkCountLabel = `${selectedProducts.length} ürün seçildi`;
  const isManualSortActive = sortBy === "manual";

  return (
    <main
      role="main"
      aria-busy={loading}
      className="min-h-screen bg-gradient-to-br from-[#faf8f5] via-[#f5efe8] to-[#efe5dc]"
    >
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 right-[-8rem] h-[24rem] w-[24rem] rounded-full bg-[#FE6100]/10 blur-3xl" />
        <div className="absolute left-[-6rem] top-[28%] h-[20rem] w-[20rem] rounded-full bg-amber-200/30 blur-3xl" />
        <div className="absolute bottom-[-6rem] right-[20%] h-[18rem] w-[18rem] rounded-full bg-orange-100/40 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-[1600px] px-4 py-6 md:px-6 md:py-8 lg:px-8">
        <div className="space-y-8">
          <section className="overflow-hidden rounded-[30px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfa] to-[#faf4ed] shadow-[0_24px_80px_rgba(254,97,0,0.12)]">
            <div className="border-b border-[#FE6100]/8 px-6 py-6 md:px-8 md:py-7">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                <div className="max-w-3xl space-y-4">
                  <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#FE6100]/20 bg-gradient-to-r from-[#FE6100]/10 to-[#FF8B3D]/5 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#FE6100]">
                    <Package className="h-3.5 w-3.5" />
                    Katalog Yönetimi
                  </div>

                  <div>
                    <h1 className="text-3xl font-semibold tracking-[-0.04em] text-stone-950 md:text-[40px]">
                      Ürünler
                    </h1>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600 md:text-[15px]">
                      Ürün kataloğunu, stok sinyallerini ve vitrin görünürlüğünü tek ekranda daha net,
                      sakin ve premium bir operasyon akışıyla yönetin.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
                    <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/60 bg-gradient-to-r from-amber-50 to-orange-50 px-3 py-1.5 text-amber-800">
                      <TrendingUp className="h-3.5 w-3.5" />
                      {stats.total.toLocaleString("tr-TR")} ürünlük katalog
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white/80 px-3 py-1.5 text-stone-700">
                      <Filter className="h-3.5 w-3.5" />
                      Kategori: {activeCategoryLabel}
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white/80 px-3 py-1.5 text-stone-700">
                      <ListIcon className="h-3.5 w-3.5" />
                      Görünüm: {viewMode === "table" ? "Tablo" : "Kart"}
                    </div>
                    {reorderMode ? (
                      <div className="inline-flex items-center gap-2 rounded-full border border-[#FE6100]/20 bg-[#FE6100]/10 px-3 py-1.5 text-[#C94E00]">
                        <GripVertical className="h-3.5 w-3.5" />
                        Manuel sıralama açık
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 xl:justify-end">
                  <button
                    type="button"
                    onClick={() => void (reorderMode ? handleExitReorderMode() : handleEnterReorderMode())}
                    disabled={loading || reorderingProductId !== null}
                    aria-label={reorderMode ? "Manuel sıralamayı bitir" : "Manuel sıralama modunu başlat"}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition-all shadow-sm",
                      SURFACE_FOCUS_RING,
                      reorderMode
                        ? "border border-amber-200 bg-amber-100 text-amber-900 hover:bg-amber-200"
                        : "border border-[#FE6100]/15 bg-white text-[#C94E00] hover:bg-[#fff5ee]",
                      loading || reorderingProductId !== null ? "cursor-not-allowed opacity-60" : "",
                    )}
                  >
                    <GripVertical className="h-4 w-4" />
                    {reorderMode ? "Sıralamayı Bitir" : "Sıralamayı Düzenle"}
                  </button>

                  <button
                    type="button"
                    onClick={() => void loadProducts()}
                    aria-label="Ürün listesini yenile"
                    className={cn(
                      "inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-stone-200 bg-white text-stone-500 shadow-sm transition-all hover:border-[#FE6100]/20 hover:bg-[#fff7f1] hover:text-[#C94E00]",
                      SURFACE_FOCUS_RING,
                    )}
                  >
                    <RefreshCw className={cn("h-4 w-4", loading ? "animate-spin" : "")} />
                  </button>

                  <Link
                    href="/admin/urunler/yeni"
                    className={cn(
                      "inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#FE6100] to-[#E45700] px-4 py-2.5 text-sm font-medium text-white shadow-[0_16px_32px_rgba(254,97,0,0.24)] transition-all hover:from-[#E45700] hover:to-[#D34D00]",
                      SURFACE_FOCUS_RING,
                    )}
                  >
                    <Plus className="h-4 w-4" />
                    Yeni Ürün
                  </Link>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-px bg-gradient-to-r from-[#FE6100]/10 via-[#FF8B3D]/5 to-[#FE6100]/10 md:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: "Görünen ürün",
                  value: visibleCount.toLocaleString("tr-TR"),
                  hint: reorderMode ? "Sıralama için tüm liste açık" : "Mevcut liste sonucu",
                },
                {
                  label: "Seçili ürün",
                  value: selectedProducts.length.toLocaleString("tr-TR"),
                  hint: "Toplu işlemlere hazır seçim",
                },
                {
                  label: "Aktif filtre",
                  value: activeFilterCount.toLocaleString("tr-TR"),
                  hint: activeFilterCount > 0 ? "Arama veya kategori uygulandı" : "Tüm katalog gösteriliyor",
                },
                {
                  label: "Düşük stok riski",
                  value: stats.lowStock.toLocaleString("tr-TR"),
                  hint: "İlk varyant stoğu 10 altı ürünler",
                },
              ].map((item) => (
                <div key={item.label} className="border border-white/70 bg-white/70 px-5 py-5 backdrop-blur-sm md:px-6">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">{item.label}</p>
                  <p className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-stone-950 md:text-[30px]">{item.value}</p>
                  <p className="mt-1 text-sm text-stone-600">{item.hint}</p>
                </div>
              ))}
            </div>
          </section>

          <div aria-live="polite" className="space-y-3">
            {errorMessage ? (
              <div className="rounded-[24px] border border-rose-200 bg-gradient-to-r from-rose-50 to-red-50 px-5 py-4 text-sm font-medium text-rose-700 shadow-sm">
                {errorMessage}
              </div>
            ) : null}

            {notice ? (
              <div
                className={cn(
                  "rounded-[24px] px-5 py-4 text-sm font-medium shadow-sm",
                  notice.tone === "success"
                    ? "border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-800"
                    : "border border-rose-200 bg-gradient-to-r from-rose-50 to-red-50 text-rose-800",
                )}
              >
                {notice.text}
              </div>
            ) : null}
          </div>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {[
              {
                label: "Toplam ürün",
                value: stats.total.toLocaleString("tr-TR"),
                hint: "Listeye dahil tüm ürünler",
                icon: Package,
                tone: "border-stone-200 bg-stone-50 text-stone-700",
              },
              {
                label: "Öne çıkan",
                value: stats.featured.toLocaleString("tr-TR"),
                hint: "Vitrin önceliği verilenler",
                icon: Star,
                tone: "border-amber-200 bg-amber-50 text-amber-700",
              },
              {
                label: "Yeni ürün",
                value: stats.new.toLocaleString("tr-TR"),
                hint: "Yeni etiketi taşıyanlar",
                icon: TrendingUp,
                tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
              },
              {
                label: "Az stok",
                value: stats.lowStock.toLocaleString("tr-TR"),
                hint: "Hızlı aksiyon gerektirenler",
                icon: AlertTriangle,
                tone: "border-rose-200 bg-rose-50 text-rose-700",
              },
              {
                label: "Toplam varyant",
                value: stats.totalVariants.toLocaleString("tr-TR"),
                hint: "Katalog derinliği",
                icon: Grid,
                tone: "border-orange-200 bg-orange-50 text-orange-700",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="overflow-hidden rounded-[28px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] shadow-[0_18px_55px_rgba(0,0,0,0.08)]"
              >
                <div className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-stone-600">{item.label}</p>
                      <p className="mt-2 text-[30px] font-semibold tracking-[-0.05em] text-stone-950">{item.value}</p>
                      <p className="mt-1 text-sm text-stone-500">{item.hint}</p>
                    </div>
                    <div className={cn("flex h-12 w-12 items-center justify-center rounded-2xl border shadow-sm", item.tone)}>
                      <item.icon className="h-5 w-5" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </section>

          <section className="overflow-hidden rounded-[30px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfa] to-[#faf4ed] shadow-[0_24px_70px_rgba(72,36,8,0.08)]">
            <div className="border-b border-[#FE6100]/8 px-6 py-6 md:px-8">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#C94E00]">
                      Filtreler ve Kontroller
                    </p>
                    <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-stone-950 md:text-2xl">
                      Katalog görünümünü rafine edin
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
                      Arama, kategori, sıralama ve görünüm tercihleriniz aynı yüzeyde; daha sakin,
                      daha hızlı ve daha okunur bir ürün operasyonu için düzenlendi.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-stone-600">
                    <span className="rounded-full border border-stone-200 bg-white px-3 py-1.5">
                      Görünen {visibleCount.toLocaleString("tr-TR")} ürün
                    </span>
                    {searchQuery.trim() ? (
                      <span className="rounded-full border border-[#FE6100]/15 bg-[#fff4ec] px-3 py-1.5 text-[#C94E00]">
                        Arama: {searchQuery}
                      </span>
                    ) : null}
                    {categoryFilter !== "all" ? (
                      <span className="rounded-full border border-stone-200 bg-white px-3 py-1.5">
                        {activeCategoryLabel}
                      </span>
                    ) : null}
                    {reorderMode ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-800">
                        Sıralama modu açık
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="grid w-full gap-3 md:grid-cols-2 xl:w-auto xl:min-w-[680px] xl:grid-cols-[minmax(240px,1.2fr)_180px_220px_auto]">
                  <label className="relative block">
                    <span className="sr-only">Ürün ara</span>
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                    <input
                      type="text"
                      placeholder="Ürün adı, SKU veya barkod ara"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      disabled={reorderMode}
                      aria-label="Ürün adı, SKU veya barkoda göre ara"
                      className={cn(
                        "w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 pl-11 text-sm font-medium text-stone-900 shadow-sm transition-all placeholder:text-stone-400",
                        SURFACE_FOCUS_RING,
                        reorderMode ? "cursor-not-allowed bg-stone-100 text-stone-400" : "hover:border-[#FE6100]/20",
                      )}
                    />
                  </label>

                  <div className="relative">
                    <Filter className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      disabled={reorderMode}
                      aria-label="Kategori filtresi"
                      className={cn(
                        "w-full appearance-none rounded-2xl border border-stone-200 bg-white py-3 pl-11 pr-10 text-sm font-medium text-stone-900 shadow-sm transition-all",
                        SURFACE_FOCUS_RING,
                        reorderMode ? "cursor-not-allowed bg-stone-100 text-stone-400" : "hover:border-[#FE6100]/20",
                      )}
                    >
                      {categoryFilters.map((cat) => (
                        <option key={cat.value} value={cat.value}>
                          {cat.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  </div>

                  <div className="relative">
                    <TrendingUp className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                    <select
                      value={`${sortBy}-${sortOrder}`}
                      onChange={(e) => {
                        const [newSort, newOrder] = e.target.value.split("-") as [
                          "manual" | "name" | "price" | "stock",
                          "asc" | "desc",
                        ];
                        setSortBy(newSort);
                        setSortOrder(newOrder);
                      }}
                      disabled={reorderMode}
                      aria-label="Ürün sıralaması"
                      className={cn(
                        "w-full appearance-none rounded-2xl border border-stone-200 bg-white py-3 pl-11 pr-10 text-sm font-medium text-stone-900 shadow-sm transition-all",
                        SURFACE_FOCUS_RING,
                        reorderMode ? "cursor-not-allowed bg-stone-100 text-stone-400" : "hover:border-[#FE6100]/20",
                      )}
                    >
                      <option value="manual-asc">Manuel sıra</option>
                      <option value="name-asc">İsim: A-Z</option>
                      <option value="name-desc">İsim: Z-A</option>
                      <option value="price-asc">Fiyat: artan</option>
                      <option value="price-desc">Fiyat: azalan</option>
                      <option value="stock-asc">Stok: artan</option>
                      <option value="stock-desc">Stok: azalan</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  </div>

                  <div
                    role="group"
                    aria-label="Ürün görünüm modu"
                    className="inline-flex w-full items-center gap-1 rounded-[22px] border border-stone-200 bg-[#f7f1eb] p-1.5 shadow-inner xl:w-auto xl:justify-self-end"
                  >
                    <button
                      type="button"
                      onClick={() => setViewMode("table")}
                      disabled={reorderMode}
                      aria-pressed={viewMode === "table"}
                      aria-label="Tablo görünümünü seç"
                      className={cn(
                        "inline-flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition-all xl:flex-none",
                        SURFACE_FOCUS_RING,
                        viewMode === "table"
                          ? "bg-white text-stone-900 shadow-sm"
                          : "text-stone-500 hover:text-[#C94E00]",
                        reorderMode ? "cursor-not-allowed opacity-40" : "",
                      )}
                    >
                      <ListIcon className="h-4 w-4" />
                      Tablo
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("grid")}
                      disabled={reorderMode}
                      aria-pressed={viewMode === "grid"}
                      aria-label="Kart görünümünü seç"
                      className={cn(
                        "inline-flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition-all xl:flex-none",
                        SURFACE_FOCUS_RING,
                        viewMode === "grid"
                          ? "bg-white text-stone-900 shadow-sm"
                          : "text-stone-500 hover:text-[#C94E00]",
                        reorderMode ? "cursor-not-allowed opacity-40" : "",
                      )}
                    >
                      <Grid className="h-4 w-4" />
                      Kart
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {selectedProducts.length > 0 ? (
              <div className="border-b border-[#FE6100]/8 bg-gradient-to-r from-[#fff5ee] via-[#fffaf6] to-[#fff5ee] px-6 py-4 md:px-8">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="rounded-full bg-gradient-to-r from-[#FE6100] to-[#E45700] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-white">
                      {bulkCountLabel}
                    </div>
                    <p className="text-sm text-stone-600">
                      Seçili ürünler için stok güncelleme veya silme işlemini hızlıca uygulayın.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setBulkStockValue("");
                        setIsBulkStockModalOpen(true);
                      }}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 transition-all hover:bg-emerald-100",
                        SURFACE_FOCUS_RING,
                      )}
                    >
                      Stok Güncelle
                    </button>
                    <button
                      type="button"
                      onClick={handleBulkDelete}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 transition-all hover:bg-rose-100",
                        SURFACE_FOCUS_RING,
                      )}
                    >
                      Sil
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedProducts([])}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition-all hover:bg-stone-50",
                        SURFACE_FOCUS_RING,
                      )}
                    >
                      Seçimi Temizle
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {isManualSortActive ? (
              <div className="border-b border-[#FE6100]/8 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 px-6 py-4 md:px-8">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-amber-900">Manuel katalog sıralaması aktif</p>
                    <p className="mt-1 text-sm text-amber-800/90">
                      Tutamacı sürükleyip bırakın veya "Yukarı taşı" ve "Aşağı taşı" kontrollerini kullanın.
                      Kaydedilen sıra vitrin görünümüne aynı şekilde yansır.
                    </p>
                  </div>
                  <div className="inline-flex items-center rounded-full border border-amber-200 bg-white/70 px-3 py-1.5 text-xs font-medium text-amber-800">
                    {reorderMode ? "Tam düzenleme modu" : "Ön izleme bilgilendirmesi"}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="px-4 py-4 md:px-6 md:py-6">
              {loading && sortedProducts.length === 0 ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div
                      key={index}
                      className="animate-pulse rounded-[26px] border border-[#FE6100]/8 bg-white/80 p-5"
                    >
                      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.85fr_0.65fr_0.75fr_0.45fr] lg:items-center">
                        <div className="flex items-center gap-4">
                          <div className="h-16 w-16 rounded-2xl bg-stone-100" />
                          <div className="space-y-3">
                            <div className="h-4 w-36 rounded-full bg-stone-200" />
                            <div className="h-3 w-24 rounded-full bg-stone-100" />
                          </div>
                        </div>
                        <div className="space-y-3">
                          <div className="h-6 w-24 rounded-full bg-stone-200" />
                          <div className="h-3 w-20 rounded-full bg-stone-100" />
                        </div>
                        <div className="space-y-3">
                          <div className="h-4 w-20 rounded-full bg-stone-200" />
                          <div className="h-3 w-14 rounded-full bg-stone-100" />
                        </div>
                        <div className="space-y-3">
                          <div className="h-8 w-28 rounded-full bg-stone-200" />
                          <div className="h-3 w-24 rounded-full bg-stone-100" />
                        </div>
                        <div className="flex gap-2 lg:justify-end">
                          <div className="h-10 w-10 rounded-2xl bg-stone-100" />
                          <div className="h-10 w-10 rounded-2xl bg-stone-100" />
                          <div className="h-10 w-10 rounded-2xl bg-stone-100" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {!loading && sortedProducts.length === 0 ? (
                <div className="rounded-[30px] border border-dashed border-[#FE6100]/20 bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] px-6 py-14 text-center shadow-[0_16px_45px_rgba(72,36,8,0.05)] md:px-10">
                  <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-[#FE6100]/10 bg-[#fff4ec] text-[#C94E00]">
                    <Package className="h-10 w-10" />
                  </div>
                  <h3 className="mt-6 text-2xl font-semibold tracking-[-0.04em] text-stone-950">Ürün bulunamadı</h3>
                  <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-stone-600 md:text-[15px]">
                    Arama veya filtre seçimlerinize uygun ürün görünmüyor. Filtreleri sadeleştirerek listeyi
                    genişletebilir ya da kataloğa yeni ürün ekleyebilirsiniz.
                  </p>
                  <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                    <Link
                      href="/admin/urunler/yeni"
                      className={cn(
                        "inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#FE6100] to-[#E45700] px-5 py-3 text-sm font-medium text-white shadow-[0_16px_32px_rgba(254,97,0,0.24)] transition-all hover:from-[#E45700] hover:to-[#D34D00]",
                        SURFACE_FOCUS_RING,
                      )}
                    >
                      <Plus className="h-4 w-4" />
                      Yeni Ürün Ekle
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery("");
                        setCategoryFilter("all");
                      }}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-5 py-3 text-sm font-medium text-stone-700 transition-all hover:bg-stone-50",
                        SURFACE_FOCUS_RING,
                      )}
                    >
                      Filtreleri Temizle
                    </button>
                  </div>
                </div>
              ) : null}

              {sortedProducts.length > 0 && viewMode === "grid" ? (
                <div className={cn("grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4", loading ? "opacity-70" : "")}>
                  {sortedProducts.map((product) => {
                    const primaryVariant = getPrimaryVariant(product);
                    const stockMeta = getStockMeta(primaryVariant.stock);
                    const StockIcon = stockMeta.icon;

                    return (
                      <article
                        key={product.id}
                        onDragOver={(event) => handleDragOver(event, product.id)}
                        onDrop={(event) => void handleDrop(event, product.id)}
                        className={cn(
                          "overflow-hidden rounded-[28px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] shadow-[0_18px_55px_rgba(72,36,8,0.08)] transition-all",
                          dragOverProductId === product.id && draggedProductId !== product.id
                            ? "ring-2 ring-[#FE6100]/40 ring-offset-2 ring-offset-[#f5eee8]"
                            : "hover:-translate-y-0.5 hover:shadow-[0_24px_65px_rgba(72,36,8,0.12)]",
                        )}
                      >
                        <div className="relative aspect-[1.08/1] overflow-hidden bg-gradient-to-br from-[#f4ece4] to-[#eadbcf]">
                          <div className="absolute left-4 top-4 z-10">
                            <input
                              type="checkbox"
                              checked={selectedProducts.includes(product.id)}
                              onChange={(e) => handleSelectProduct(product.id, e.target.checked)}
                              aria-label={`${product.name} ürününü seç`}
                              className={cn(
                                "h-5 w-5 rounded border-stone-300 text-[#FE6100] shadow-sm accent-[#FE6100]",
                                SURFACE_FOCUS_RING,
                              )}
                            />
                          </div>

                          {product.images && product.images.length > 0 ? (
                            <img
                              src={product.images[0]}
                              alt={product.name}
                              className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                              onError={(e) => {
                                e.currentTarget.src = "";
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-stone-400">
                              <Package className="h-14 w-14" />
                            </div>
                          )}

                          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/30 to-transparent" />

                          <div className="absolute right-4 top-4 flex flex-col items-end gap-2">
                            {product.featured ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/60 bg-white/90 px-3 py-1 text-xs font-medium text-amber-800 backdrop-blur-sm">
                                <Star className="h-3 w-3 fill-current" />
                                Öne çıkan
                              </span>
                            ) : null}
                            {product.isNew ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/60 bg-white/90 px-3 py-1 text-xs font-medium text-emerald-700 backdrop-blur-sm">
                                <CheckCircle className="h-3 w-3" />
                                Yeni
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div className="space-y-5 p-5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={cn("inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium", getCategoryColor(product.category))}>
                              {getCategoryLabel(product.category)}
                            </span>
                            <span className="inline-flex items-center rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-stone-600">
                              {product.variants.length} varyant
                            </span>
                          </div>

                          <div>
                            <h3 className="text-lg font-semibold tracking-[-0.03em] text-stone-950 line-clamp-2">
                              {product.name}
                            </h3>
                            <p className="mt-2 text-sm text-stone-600">
                              {primaryVariant.name}
                              {product.variants.length > 1 ? ` +${product.variants.length - 1} varyant` : ""}
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-2xl border border-stone-200 bg-white/80 p-4">
                              <p className="text-xs font-medium uppercase tracking-[0.16em] text-stone-400">Fiyat</p>
                              <div className="mt-2">{renderPrice(primaryVariant)}</div>
                            </div>
                            <div className="rounded-2xl border border-stone-200 bg-white/80 p-4">
                              <p className="text-xs font-medium uppercase tracking-[0.16em] text-stone-400">Stok</p>
                              <div className={cn("mt-2 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium", stockMeta.tone)}>
                                <StockIcon className="h-4 w-4" />
                                {primaryVariant.stock}
                              </div>
                            </div>
                          </div>

                          {isManualSortActive ? (
                            <div className="rounded-[22px] border border-[#FE6100]/10 bg-[#fff8f3] p-4">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                  <div
                                    draggable={canUseManualReorder}
                                    onDragStart={(event) => handleDragStart(event, product.id)}
                                    onDragEnd={handleDragEnd}
                                    aria-label={`${product.name} ürününü sürükleyerek yeniden sırala`}
                                    className={cn(
                                      "inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-stone-200 bg-white text-stone-500 shadow-sm",
                                      canUseManualReorder ? "cursor-grab hover:text-[#C94E00]" : "cursor-not-allowed opacity-40",
                                      draggedProductId === product.id ? "cursor-grabbing text-[#C94E00]" : "",
                                    )}
                                    title="Sürükleyerek sırala"
                                  >
                                    <GripVertical className="h-4 w-4" />
                                  </div>
                                  <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">Sıra</p>
                                    <p className="text-sm font-semibold text-stone-700">{product.sortOrder || "Oto"}</p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void handleManualReorder(product.id, "up")}
                                    disabled={!reorderMode || reorderingProductId !== null || sortedProducts[0]?.id === product.id}
                                    aria-label={`${product.name} ürününü yukarı taşı`}
                                    title="Yukarı taşı"
                                    className={cn(
                                      "inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-stone-200 bg-white text-stone-500 shadow-sm transition-all hover:text-[#C94E00] disabled:cursor-not-allowed disabled:opacity-40",
                                      SURFACE_FOCUS_RING,
                                    )}
                                  >
                                    <ArrowUp className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleManualReorder(product.id, "down")}
                                    disabled={!reorderMode || reorderingProductId !== null || sortedProducts[sortedProducts.length - 1]?.id === product.id}
                                    aria-label={`${product.name} ürününü aşağı taşı`}
                                    title="Aşağı taşı"
                                    className={cn(
                                      "inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-stone-200 bg-white text-stone-500 shadow-sm transition-all hover:text-[#C94E00] disabled:cursor-not-allowed disabled:opacity-40",
                                      SURFACE_FOCUS_RING,
                                    )}
                                  >
                                    <ArrowDown className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : null}

                          <div className="grid grid-cols-3 gap-2 pt-1">
                            <Link
                              href={buildStorefrontProductUrl(product.slug)}
                              target="_blank"
                              rel="noreferrer"
                              className={cn(
                                "inline-flex items-center justify-center gap-2 rounded-2xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-medium text-stone-700 transition-all hover:bg-stone-50 hover:text-[#C94E00]",
                                SURFACE_FOCUS_RING,
                              )}
                              aria-label={`${product.name} ürününü vitrinde görüntüle`}
                            >
                              <Eye className="h-4 w-4" />
                              Gör
                            </Link>
                            <Link
                              href={`/admin/urunler/${product.id}/duzenle`}
                              className={cn(
                                "inline-flex items-center justify-center gap-2 rounded-2xl bg-[#1f1c19] px-3 py-2.5 text-sm font-medium text-white transition-all hover:bg-black",
                                SURFACE_FOCUS_RING,
                              )}
                            >
                              <Edit className="h-4 w-4" />
                              Düzenle
                            </Link>
                            <button
                              type="button"
                              onClick={() => void handleDelete(product.id)}
                              className={cn(
                                "inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-medium text-rose-700 transition-all hover:bg-rose-100",
                                SURFACE_FOCUS_RING,
                              )}
                              aria-label={`${product.name} ürününü sil`}
                            >
                              <Trash2 className="h-4 w-4" />
                              Sil
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : null}

              {sortedProducts.length > 0 && viewMode === "table" ? (
                <div className={cn("space-y-4", loading ? "opacity-70" : "")}>
                  <div className="rounded-[28px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] shadow-[0_18px_55px_rgba(72,36,8,0.08)]">
                    <div className="flex flex-col gap-3 border-b border-[#FE6100]/8 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-lg font-semibold tracking-[-0.03em] text-stone-950">Tablo görünümü</h3>
                        <p className="mt-1 text-sm text-stone-600">
                          Daha yoğun katalog kontrolü, net kolon ayrımı ve mobilde okunur kart yedeği.
                        </p>
                      </div>
                      <label className="inline-flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 shadow-sm">
                        <input
                          type="checkbox"
                          checked={sortedProducts.length > 0 && selectedProducts.length === sortedProducts.length}
                          onChange={(e) => handleSelectAll(e.target.checked)}
                          aria-label="Görüntülenen tüm ürünleri seç"
                          className={cn(
                            "h-5 w-5 rounded border-stone-300 text-[#FE6100] accent-[#FE6100]",
                            SURFACE_FOCUS_RING,
                          )}
                        />
                        Tümünü seç
                      </label>
                    </div>

                    <div className="space-y-3 p-4 lg:hidden">
                      {sortedProducts.map((product) => {
                        const primaryVariant = getPrimaryVariant(product);
                        const stockMeta = getStockMeta(primaryVariant.stock);
                        const StockIcon = stockMeta.icon;

                        return (
                          <article
                            key={product.id}
                            onDragOver={(event) => handleDragOver(event, product.id)}
                            onDrop={(event) => void handleDrop(event, product.id)}
                            className={cn(
                              "rounded-[24px] border border-stone-200 bg-white p-4 shadow-sm",
                              dragOverProductId === product.id && draggedProductId !== product.id
                                ? "ring-2 ring-[#FE6100]/40 ring-offset-2 ring-offset-[#f5eee8]"
                                : "",
                            )}
                          >
                            <div className="flex items-start gap-4">
                              <input
                                type="checkbox"
                                checked={selectedProducts.includes(product.id)}
                                onChange={(e) => handleSelectProduct(product.id, e.target.checked)}
                                aria-label={`${product.name} ürününü seç`}
                                className={cn(
                                  "mt-1 h-5 w-5 rounded border-stone-300 text-[#FE6100] accent-[#FE6100]",
                                  SURFACE_FOCUS_RING,
                                )}
                              />
                              {product.images && product.images.length > 0 ? (
                                <img
                                  src={product.images[0]}
                                  alt={product.name}
                                  className="h-16 w-16 rounded-2xl border border-stone-200 object-cover"
                                />
                              ) : (
                                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-stone-200 bg-stone-100 text-stone-400">
                                  <Package className="h-6 w-6" />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4 className="truncate text-base font-semibold text-stone-950">{product.name}</h4>
                                  {product.featured ? (
                                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                                      Öne çıkan
                                    </span>
                                  ) : null}
                                  {product.isNew ? (
                                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                                      Yeni
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-1 text-sm text-stone-600">{primaryVariant.name}</p>
                                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                                  <div>
                                    <p className="text-xs uppercase tracking-[0.16em] text-stone-400">Kategori</p>
                                    <span className={cn("mt-1 inline-flex rounded-full border px-3 py-1 text-xs font-medium", getCategoryColor(product.category))}>
                                      {getCategoryLabel(product.category)}
                                    </span>
                                  </div>
                                  <div>
                                    <p className="text-xs uppercase tracking-[0.16em] text-stone-400">SKU</p>
                                    <p className="mt-1 font-mono text-sm text-stone-700">{primaryVariant.sku || "-"}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs uppercase tracking-[0.16em] text-stone-400">Fiyat</p>
                                    <div className="mt-1">{renderPrice(primaryVariant)}</div>
                                  </div>
                                  <div>
                                    <p className="text-xs uppercase tracking-[0.16em] text-stone-400">Stok</p>
                                    <span className={cn("mt-1 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium", stockMeta.tone)}>
                                      <StockIcon className="h-4 w-4" />
                                      {primaryVariant.stock}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-stone-200 bg-stone-50/70 p-3">
                              <div className="flex items-center gap-3">
                                <div
                                  draggable={canUseManualReorder}
                                  onDragStart={(event) => handleDragStart(event, product.id)}
                                  onDragEnd={handleDragEnd}
                                  aria-label={`${product.name} ürününü sürükleyerek yeniden sırala`}
                                  className={cn(
                                    "inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-stone-200 bg-white text-stone-500",
                                    canUseManualReorder ? "cursor-grab hover:text-[#C94E00]" : "cursor-not-allowed opacity-40",
                                    draggedProductId === product.id ? "cursor-grabbing text-[#C94E00]" : "",
                                  )}
                                  title="Sürükleyerek sırala"
                                >
                                  <GripVertical className="h-4 w-4" />
                                </div>
                                <div>
                                  <p className="text-xs uppercase tracking-[0.16em] text-stone-400">Sıra</p>
                                  <p className="text-sm font-semibold text-stone-700">{product.sortOrder || "Oto"}</p>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => void handleManualReorder(product.id, "up")}
                                  disabled={!reorderMode || sortBy !== "manual" || reorderingProductId !== null || sortedProducts[0]?.id === product.id}
                                  aria-label={`${product.name} ürününü yukarı taşı`}
                                  title="Yukarı taşı"
                                  className={cn(
                                    "inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-stone-200 bg-white text-stone-500 transition-all hover:text-[#C94E00] disabled:cursor-not-allowed disabled:opacity-40",
                                    SURFACE_FOCUS_RING,
                                  )}
                                >
                                  <ArrowUp className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleManualReorder(product.id, "down")}
                                  disabled={!reorderMode || sortBy !== "manual" || reorderingProductId !== null || sortedProducts[sortedProducts.length - 1]?.id === product.id}
                                  aria-label={`${product.name} ürününü aşağı taşı`}
                                  title="Aşağı taşı"
                                  className={cn(
                                    "inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-stone-200 bg-white text-stone-500 transition-all hover:text-[#C94E00] disabled:cursor-not-allowed disabled:opacity-40",
                                    SURFACE_FOCUS_RING,
                                  )}
                                >
                                  <ArrowDown className="h-4 w-4" />
                                </button>
                                <Link
                                  href={buildStorefrontProductUrl(product.slug)}
                                  target="_blank"
                                  rel="noreferrer"
                                  aria-label={`${product.name} ürününü vitrinde görüntüle`}
                                  className={cn(
                                    "inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-stone-200 bg-white text-stone-500 transition-all hover:text-[#C94E00]",
                                    SURFACE_FOCUS_RING,
                                  )}
                                >
                                  <Eye className="h-4 w-4" />
                                </Link>
                                <Link
                                  href={`/admin/urunler/${product.id}/duzenle`}
                                  aria-label={`${product.name} ürününü düzenle`}
                                  className={cn(
                                    "inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[#1f1c19] text-white transition-all hover:bg-black",
                                    SURFACE_FOCUS_RING,
                                  )}
                                >
                                  <Edit className="h-4 w-4" />
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => void handleDelete(product.id)}
                                  aria-label={`${product.name} ürününü sil`}
                                  className={cn(
                                    "inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 transition-all hover:bg-rose-100",
                                    SURFACE_FOCUS_RING,
                                  )}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>

                    <div className="hidden overflow-x-auto lg:block">
                      <table className="w-full min-w-[1180px]">
                        <thead className="bg-[#fcf6f0] text-left">
                          <tr className="border-b border-[#FE6100]/8">
                            <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Sıra</th>
                            <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Seç</th>
                            <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Ürün</th>
                            <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Kategori</th>
                            <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">SKU</th>
                            <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Fiyat</th>
                            <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Stok</th>
                            <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Durum</th>
                            <th className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">İşlemler</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedProducts.map((product) => {
                            const primaryVariant = getPrimaryVariant(product);
                            const stockMeta = getStockMeta(primaryVariant.stock);
                            const StockIcon = stockMeta.icon;

                            return (
                              <tr
                                key={product.id}
                                onDragOver={(event) => handleDragOver(event, product.id)}
                                onDrop={(event) => void handleDrop(event, product.id)}
                                className={cn(
                                  "border-b border-stone-100 transition-colors hover:bg-[#fffaf6]",
                                  dragOverProductId === product.id && draggedProductId !== product.id ? "bg-[#fff1e7]" : "",
                                )}
                              >
                                <td className="px-4 py-4">
                                  <div className="flex items-center gap-3">
                                    <div
                                      draggable={canUseManualReorder}
                                      onDragStart={(event) => handleDragStart(event, product.id)}
                                      onDragEnd={handleDragEnd}
                                      aria-label={`${product.name} ürününü sürükleyerek yeniden sırala`}
                                      className={cn(
                                        "inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-stone-200 bg-white text-stone-500 shadow-sm",
                                        canUseManualReorder ? "cursor-grab hover:text-[#C94E00]" : "cursor-not-allowed opacity-40",
                                        draggedProductId === product.id ? "cursor-grabbing text-[#C94E00]" : "",
                                      )}
                                      title="Sürükleyerek sırala"
                                    >
                                      <GripVertical className="h-4 w-4" />
                                    </div>
                                    <div className="space-y-2">
                                      <div className="text-sm font-semibold text-stone-700">{product.sortOrder || "Oto"}</div>
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => void handleManualReorder(product.id, "up")}
                                          disabled={!reorderMode || sortBy !== "manual" || reorderingProductId !== null || sortedProducts[0]?.id === product.id}
                                          aria-label={`${product.name} ürününü yukarı taşı`}
                                          title="Yukarı taşı"
                                          className={cn(
                                            "inline-flex h-8 w-8 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-500 transition-all hover:text-[#C94E00] disabled:cursor-not-allowed disabled:opacity-40",
                                            SURFACE_FOCUS_RING,
                                          )}
                                        >
                                          <ArrowUp className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => void handleManualReorder(product.id, "down")}
                                          disabled={!reorderMode || sortBy !== "manual" || reorderingProductId !== null || sortedProducts[sortedProducts.length - 1]?.id === product.id}
                                          aria-label={`${product.name} ürününü aşağı taşı`}
                                          title="Aşağı taşı"
                                          className={cn(
                                            "inline-flex h-8 w-8 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-500 transition-all hover:text-[#C94E00] disabled:cursor-not-allowed disabled:opacity-40",
                                            SURFACE_FOCUS_RING,
                                          )}
                                        >
                                          <ArrowDown className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-4 align-top">
                                  <input
                                    type="checkbox"
                                    checked={selectedProducts.includes(product.id)}
                                    onChange={(e) => handleSelectProduct(product.id, e.target.checked)}
                                    aria-label={`${product.name} ürününü seç`}
                                    className={cn(
                                      "mt-2 h-5 w-5 rounded border-stone-300 text-[#FE6100] accent-[#FE6100]",
                                      SURFACE_FOCUS_RING,
                                    )}
                                  />
                                </td>
                                <td className="px-4 py-4">
                                  <div className="flex items-center gap-4">
                                    {product.images && product.images.length > 0 ? (
                                      <img
                                        src={product.images[0]}
                                        alt={product.name}
                                        className="h-16 w-16 rounded-2xl border border-stone-200 object-cover"
                                      />
                                    ) : (
                                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-stone-200 bg-stone-100 text-stone-400">
                                        <Package className="h-6 w-6" />
                                      </div>
                                    )}
                                    <div className="min-w-0">
                                      <div className="truncate text-base font-semibold text-stone-950">{product.name}</div>
                                      <div className="mt-1 text-sm text-stone-600">{primaryVariant.name}</div>
                                      <div className="mt-2 text-xs text-stone-400">
                                        {product.variants.length} varyant • {product.slug}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-4 align-top">
                                  <span className={cn("inline-flex rounded-full border px-3 py-1.5 text-xs font-medium", getCategoryColor(product.category))}>
                                    {getCategoryLabel(product.category)}
                                  </span>
                                </td>
                                <td className="px-4 py-4 align-top font-mono text-sm text-stone-600">
                                  {primaryVariant.sku || "-"}
                                </td>
                                <td className="px-4 py-4 align-top">{renderPrice(primaryVariant)}</td>
                                <td className="px-4 py-4 align-top">
                                  <span className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium", stockMeta.tone)}>
                                    <StockIcon className="h-4 w-4" />
                                    {primaryVariant.stock}
                                  </span>
                                </td>
                                <td className="px-4 py-4 align-top">
                                  <div className="flex flex-wrap gap-2">
                                    {product.featured ? (
                                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                                        <Star className="h-3 w-3 fill-current" />
                                        Öne çıkan
                                      </span>
                                    ) : null}
                                    {product.isNew ? (
                                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                                        <CheckCircle className="h-3 w-3" />
                                        Yeni
                                      </span>
                                    ) : null}
                                  </div>
                                </td>
                                <td className="px-4 py-4 text-right align-top">
                                  <div className="flex items-center justify-end gap-2">
                                    <Link
                                      href={buildStorefrontProductUrl(product.slug)}
                                      target="_blank"
                                      rel="noreferrer"
                                      aria-label={`${product.name} ürününü vitrinde görüntüle`}
                                      className={cn(
                                        "inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-stone-200 bg-white text-stone-500 transition-all hover:text-[#C94E00]",
                                        SURFACE_FOCUS_RING,
                                      )}
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Link>
                                    <Link
                                      href={`/admin/urunler/${product.id}/duzenle`}
                                      aria-label={`${product.name} ürününü düzenle`}
                                      className={cn(
                                        "inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[#1f1c19] text-white transition-all hover:bg-black",
                                        SURFACE_FOCUS_RING,
                                      )}
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Link>
                                    <button
                                      type="button"
                                      onClick={() => void handleDelete(product.id)}
                                      aria-label={`${product.name} ürününü sil`}
                                      className={cn(
                                        "inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 transition-all hover:bg-rose-100",
                                        SURFACE_FOCUS_RING,
                                      )}
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
                  </div>
                </div>
              ) : null}

              {!loading && !reorderMode && pagination.totalPages > 1 && sortedProducts.length > 0 ? (
                <div className="mt-6 rounded-[26px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] px-5 py-4 shadow-[0_16px_45px_rgba(72,36,8,0.06)]">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-sm font-medium text-stone-600">
                        Toplam <span className="font-semibold text-stone-950">{pagination.total.toLocaleString("tr-TR")}</span> ürün
                      </p>
                      <p className="mt-1 text-sm text-stone-500">
                        Sayfa <span className="font-semibold text-stone-800">{pagination.page}</span> / {pagination.totalPages}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (pagination.page > 1) void loadProducts(pagination.page - 1);
                        }}
                        disabled={pagination.page <= 1}
                        className={cn(
                          "inline-flex items-center justify-center rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition-all hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50",
                          SURFACE_FOCUS_RING,
                        )}
                      >
                        Önceki
                      </button>

                      {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => {
                        let pageNum;
                        if (pagination.totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (pagination.page <= 3) {
                          pageNum = i + 1;
                        } else if (pagination.page >= pagination.totalPages - 2) {
                          pageNum = pagination.totalPages - 4 + i;
                        } else {
                          pageNum = pagination.page - 2 + i;
                        }

                        return (
                          <button
                            key={pageNum}
                            type="button"
                            onClick={() => void loadProducts(pageNum)}
                            aria-label={`Sayfa ${pageNum}`}
                            className={cn(
                              "inline-flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-medium transition-all",
                              SURFACE_FOCUS_RING,
                              pagination.page === pageNum
                                ? "bg-gradient-to-r from-[#FE6100] to-[#E45700] text-white shadow-[0_12px_24px_rgba(254,97,0,0.22)]"
                                : "border border-stone-200 bg-white text-stone-700 hover:bg-stone-50",
                            )}
                          >
                            {pageNum}
                          </button>
                        );
                      })}

                      <button
                        type="button"
                        onClick={() => {
                          if (pagination.page < pagination.totalPages) void loadProducts(pagination.page + 1);
                        }}
                        disabled={pagination.page >= pagination.totalPages}
                        className={cn(
                          "inline-flex items-center justify-center rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition-all hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50",
                          SURFACE_FOCUS_RING,
                        )}
                      >
                        Sonraki
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>

      {isBulkStockModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-stock-modal-title"
            aria-describedby="bulk-stock-modal-description"
            className="w-full max-w-md rounded-[30px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.22)]"
          >
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#C94E00]">Toplu stok işlemi</p>
              <h2 id="bulk-stock-modal-title" className="text-2xl font-semibold tracking-[-0.04em] text-stone-950">
                Toplu stok güncelle
              </h2>
              <p id="bulk-stock-modal-description" className="text-sm leading-6 text-stone-600">
                Seçilen {selectedProducts.length} ürünün tüm varyant stokları aynı değere çekilecek. Bu işlem
                ürün veri yapısını değiştirmez, yalnızca stok değerlerini günceller.
              </p>
            </div>

            <div className="mt-6 space-y-3">
              <label htmlFor="bulk-stock-input" className="block text-sm font-medium text-stone-700">
                Yeni stok sayısı
              </label>
              <input
                id="bulk-stock-input"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={bulkStockValue}
                onChange={(event) => setBulkStockValue(event.target.value)}
                className={cn(
                  "w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-900 shadow-sm transition-all placeholder:text-stone-400",
                  SURFACE_FOCUS_RING,
                )}
                placeholder="Örnek: 25"
              />
              <p className="text-xs leading-5 text-stone-500">
                Girilen değer, seçtiğiniz tüm ürünlerin tüm varyantlarına aynı şekilde uygulanır.
              </p>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeBulkStockModal}
                disabled={bulkStockSubmitting}
                className={cn(
                  "inline-flex items-center rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition-all hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50",
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
                  "inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-700 px-4 py-2.5 text-sm font-medium text-white shadow-[0_12px_24px_rgba(5,150,105,0.18)] transition-all hover:from-emerald-700 hover:to-emerald-800 disabled:cursor-not-allowed disabled:opacity-60",
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
