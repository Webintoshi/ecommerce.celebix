"use client";

import { useCallback, useEffect, useState } from "react";

import { buildCategoryLabelMap, buildProductCategoryTree } from "@/lib/admin-product-categories";
import { fetchCategories } from "@/lib/categories";
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
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface AdminProductVariant {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  stock: number;
  sku: string;
}

interface AdminProductListItem {
  id: string;
  name: string;
  slug: string;
  description: string;
  shortDescription: string;
  images: string[];
  category: string;
  subcategory: string;
  tags: string[];
  variants: AdminProductVariant[];
  featured: boolean;
  isNew: boolean;
}

const CATEGORY_BADGE_STYLES = [
  { value: "all", label: "Tümü", color: "bg-gray-100 text-gray-700" },
  { value: "fistik-ezmesi", label: "Fıstık Ezmesi", color: "bg-amber-100 text-amber-700" },
  { value: "findik-ezmesi", label: "Fındık Ezmesi", color: "bg-orange-100 text-orange-700" },
  { value: "kuruyemis", label: "Kuruyemiş", color: "bg-green-100 text-green-700" },
];

function getCategoryBadgeStyle(index: number) {
  return CATEGORY_BADGE_STYLES[index % CATEGORY_BADGE_STYLES.length]?.color || "bg-gray-100 text-gray-700";
}

// Transform database product to frontend format
function transformProduct(dbProduct: Record<string, unknown>): AdminProductListItem {
  const variants = (dbProduct.variants as Record<string, unknown>[]) || [];
  return {
    id: dbProduct.id as string,
    name: dbProduct.name as string,
    slug: dbProduct.slug as string,
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

export default function ProductsPage() {
  const [products, setProducts] = useState<AdminProductListItem[]>([]);
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"grid" | "table">("table");
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "price" | "stock" | "newest">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  });
  const categoryTree = buildProductCategoryTree(categories);
  const categoryLabelMap = buildCategoryLabelMap(categories);
  const categoryFilters = [
    { value: "all", label: "Tümü", color: "bg-gray-100 text-gray-700" },
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

  const getCategoryLabel = (slug: string) =>
    categoryLabelMap.get(slug) || slug || "Kategorisiz";

  const getCategoryColor = (slug: string) =>
    categoryFilters.find((category) => category.value === slug)?.color || "bg-gray-100 text-gray-700";

  const loadProducts = useCallback(async (page: number = pagination.page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: pagination.limit.toString(),
      });
      const res = await fetch(`/api/products?${params}`);
      const data = await res.json();
      if (data.success && data.products) {
        setProducts(data.products.map(transformProduct));
        if (data.pagination) {
          setPagination(data.pagination);
        }
      }
    } catch (error) {
      console.error("Failed to load products:", error);
    } finally {
      setLoading(false);
    }
  }, [pagination.limit, pagination.page]);

  const loadCategories = async () => {
    try {
      const data = await fetchCategories();
      setCategories(data);
    } catch (error) {
      console.error("Failed to load categories:", error);
    }
  };

  useEffect(() => {
    void loadProducts();
    void loadCategories();
  }, [loadProducts]);

  const handleDelete = async (id: string) => {
    if (confirm("Bu ürünü silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.")) {
      try {
        const res = await fetch(`/api/products?id=${id}`, { method: "DELETE" });
        const data = await res.json();
        if (res.ok) {
          await loadProducts();
          setSelectedProducts(prev => prev.filter(pid => pid !== id));
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


  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedProducts(filteredProducts.map(p => p.id));
    } else {
      setSelectedProducts([]);
    }
  };

  const handleSelectProduct = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedProducts(prev => [...prev, id]);
    } else {
      setSelectedProducts(prev => prev.filter(pid => pid !== id));
    }
  };

  const getSortedProducts = () => {
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

  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.variants.some((variant) =>
        variant.sku.toLowerCase().includes(searchQuery.toLowerCase())
      );
    const matchesCategory =
      categoryFilter === "all" || product.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const sortedProducts = getSortedProducts();

  const stats = {
    total: products.length,
    featured: products.filter((product) => product.featured).length,
    new: products.filter((product) => product.isNew).length,
    lowStock: products.filter((product) => getPrimaryVariant(product).stock < 10).length,
    totalVariants: products.reduce((sum, product) => sum + product.variants.length, 0),
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] p-6 md:p-8">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold text-blue-600 uppercase tracking-widest">
            <Package className="w-3.5 h-3.5" />
            Envanter Yönetimi
          </div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Ürün Yönetimi</h1>
          <p className="text-gray-500 text-sm max-w-lg">
            Katalogunuzu yönetin, stok durumlarını takip edin ve ürünlerinizi optimize edin.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => loadProducts()}
            className="p-2.5 bg-white border border-gray-100 text-gray-400 hover:text-gray-900 rounded-xl hover:bg-gray-50 transition-all shadow-sm"
            title="Yenile"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Link
            href="/admin/urunler/yeni"
            className="px-5 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-gray-800 transition-all flex items-center gap-2 shadow-lg shadow-gray-900/10"
          >
            <Plus className="w-4 h-4" />
            YENİ ÜRÜN EKLE
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {[
          { label: "TOPLAM ÜRÜN", value: stats.total, icon: Package, color: "blue" },
          { label: "ÖNE ÇIKAN", value: stats.featured, icon: Star, color: "amber" },
          { label: "YENİ ÜRÜN", value: stats.new, icon: TrendingUp, color: "emerald" },
          { label: "AZ STOK", value: stats.lowStock, icon: AlertTriangle, color: "rose" },
          { label: "VARYANTLAR", value: stats.totalVariants, icon: Grid, color: "purple" },
        ].map((stat, i) => (
          <div key={i} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm group hover:shadow-md transition-all relative overflow-hidden">
            <div className={`w-10 h-10 bg-${stat.color}-50 text-${stat.color}-600 rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform relative z-10`}>
              <stat.icon className="w-5 h-5" />
            </div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest relative z-10">{stat.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1 relative z-10">{stat.value}</p>
            <div className={`absolute top-0 right-0 w-20 h-20 bg-${stat.color}-500/5 rounded-full -mr-10 -mt-10 blur-2xl`}></div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm mb-8 overflow-hidden">
        <div className="p-6">
          <div className="flex flex-col lg:flex-row items-center gap-4">
            {/* Search */}
            <div className="flex-1 w-full relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
              <input
                type="text"
                placeholder="Ürün adı, SKU veya barkod ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-transparent rounded-2xl focus:bg-white focus:border-blue-200 outline-none transition-all text-sm font-medium"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
              {/* Category Filter */}
              <div className="relative group min-w-[160px]">
                <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full appearance-none pl-11 pr-10 py-3 bg-gray-50 border border-transparent rounded-2xl focus:bg-white focus:border-blue-200 outline-none transition-all text-sm font-bold cursor-pointer"
                >
                  {categoryFilters.map((cat) => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                  <ChevronDown className="w-4 h-4" />
                </div>
              </div>

              {/* Sort */}
              <div className="relative group min-w-[160px]">
                <TrendingUp className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <select
                  value={`${sortBy}-${sortOrder}`}
                  onChange={(e) => {
                    const [newSort, newOrder] = e.target.value.split("-") as [
                      "name" | "price" | "stock" | "newest",
                      "asc" | "desc",
                    ];
                    setSortBy(newSort);
                    setSortOrder(newOrder);
                  }}
                  className="w-full appearance-none pl-11 pr-10 py-3 bg-gray-50 border border-transparent rounded-2xl focus:bg-white focus:border-blue-200 outline-none transition-all text-sm font-bold cursor-pointer"
                >
                  <option value="name-asc">İsim A-Z</option>
                  <option value="name-desc">İsim Z-A</option>
                  <option value="price-asc">Fiyat Artan</option>
                  <option value="price-desc">Fiyat Azalan</option>
                  <option value="stock-asc">Stok Artan</option>
                  <option value="stock-desc">Stok Azalan</option>
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                  <ChevronDown className="w-4 h-4" />
                </div>
              </div>

              {/* View Mode */}
              <div className="flex bg-gray-50 p-1.5 rounded-2xl border border-transparent">
                <button
                  onClick={() => setViewMode("table")}
                  className={cn(
                    "p-2 rounded-xl transition-all",
                    viewMode === "table" ? "bg-white text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-600"
                  )}
                >
                  <ListIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("grid")}
                  className={cn(
                    "p-2 rounded-xl transition-all",
                    viewMode === "grid" ? "bg-white text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-600"
                  )}
                >
                  <Grid className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Bulk Actions */}
          {selectedProducts.length > 0 && (
            <div className="mt-6 pt-6 border-t border-gray-50 flex items-center justify-between bg-blue-50/30 -mx-6 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="bg-blue-600 text-white text-[10px] font-black px-2 py-1 rounded-md">
                  {selectedProducts.length} SEÇİLDİ
                </div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Toplu İşlemler</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleBulkDelete}
                  className="px-4 py-2 bg-rose-50 text-rose-600 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-rose-500 hover:text-white transition-all shadow-sm"
                >
                  SİL
                </button>
                <button
                  onClick={() => setSelectedProducts([])}
                  className="px-4 py-2 bg-white border border-gray-100 text-gray-400 text-[10px] font-black uppercase tracking-widest rounded-xl hover:text-gray-900 transition-all shadow-sm"
                >
                  TEMİZLE
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Products Grid View */}
      {viewMode === "grid" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {sortedProducts.map((product) => (
            <div
              key={product.id}
              className="bg-white rounded-3xl shadow-lg border border-gray-200 hover:shadow-2xl hover:border-primary/30 transition-all group"
            >
              {/* Checkbox */}
              <div className="absolute top-4 left-4 z-10">
                <input
                  type="checkbox"
                  checked={selectedProducts.includes(product.id)}
                  onChange={(e) => handleSelectProduct(product.id, e.target.checked)}
                  className="w-5 h-5 rounded border-2 border-gray-300 focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer"
                />
              </div>

              {/* Image */}
              <div className="relative aspect-square bg-gradient-to-br from-gray-100 to-gray-200 rounded-t-3xl overflow-hidden">
                {product.images && product.images.length > 0 ? (
                  <img
                    src={product.images[0]}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    onError={(e) => {
                      e.currentTarget.src = '';
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-20 h-20 text-gray-300" />
                  </div>
                )}

                {/* Badges */}
                <div className="absolute top-4 right-4 flex flex-col gap-2">
                  {product.featured && (
                    <div className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-xs font-bold rounded-full shadow-lg">
                      <Star className="w-3 h-3 fill-current" />
                      Öne Çıkan
                    </div>
                  )}
                  {product.isNew && (
                    <div className="flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white text-xs font-bold rounded-full shadow-lg">
                      <CheckCircle className="w-3 h-3" />
                      Yeni
                    </div>
                  )}
                </div>
              </div>

              {/* Content */}
              <div className="p-6">
                {/* Category */}
                <div className="mb-3">
                  <span className={`px-3 py-1 text-xs font-semibold rounded-full ${getCategoryColor(product.category)}`}>
                    {getCategoryLabel(product.category)}
                  </span>
                </div>

                {/* Name */}
                <h3 className="font-bold text-gray-900 text-lg mb-2 line-clamp-2">
                  {product.name}
                </h3>

                {/* Variant Info */}
                <div className="text-sm text-gray-500 mb-3">
                  <span className="font-medium text-gray-700">{getPrimaryVariant(product).name}</span>
                  {product.variants.length > 1 && (
                    <span className="text-gray-500"> (+{product.variants.length - 1})</span>
                  )}
                </div>

                {/* Price & Stock */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    {getPrimaryVariant(product).originalPrice && getPrimaryVariant(product).originalPrice! > getPrimaryVariant(product).price ? (
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-red-600 line-through">
                          ₺{getPrimaryVariant(product).originalPrice}
                        </span>
                        <span className="text-2xl font-bold text-green-600">
                          ₺{getPrimaryVariant(product).price}
                        </span>
                      </div>
                    ) : (
                      <span className="text-2xl font-bold text-primary">
                        ₺{getPrimaryVariant(product).price}
                      </span>
                    )}
                  </div>
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold ${getPrimaryVariant(product).stock > 20
                    ? "bg-green-50 text-green-700"
                    : getPrimaryVariant(product).stock > 10
                      ? "bg-yellow-50 text-yellow-700"
                      : "bg-red-50 text-red-700"
                    }`}>
                    {getPrimaryVariant(product).stock > 20 ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : getPrimaryVariant(product).stock > 10 ? (
                      <AlertTriangle className="w-4 h-4" />
                    ) : (
                      <AlertTriangle className="w-4 h-4" />
                    )}
                    {getPrimaryVariant(product).stock}
                  </div>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-3 gap-2 pt-4 border-t border-gray-100">
                  <Link
                    href={`/urunler/${product.slug}`}
                    target="_blank"
                    className="flex items-center justify-center gap-1.5 px-2 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all text-xs font-semibold"
                    title="Görüntüle"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span className="hidden xl:inline">Gör</span>
                    <span className="inline xl:hidden">Görüntüle</span>
                  </Link>
                  <Link
                    href={`/admin/urunler/${product.id}/duzenle`}
                    className="flex items-center justify-center gap-1.5 px-2 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-all text-xs font-semibold"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    Düzenle
                  </Link>
                  <button
                    onClick={() => handleDelete(product.id)}
                    className="flex items-center justify-center gap-1.5 px-2 py-2.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-all text-xs font-semibold"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Sil
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Products Table View */}
      {viewMode === "table" && (
        <div className="bg-white rounded-3xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-gray-50 to-white border-b-2 border-gray-200">
                <tr>
                  <th className="px-4 py-4 text-left">
                    <input
                      type="checkbox"
                      checked={sortedProducts.length > 0 && selectedProducts.length === sortedProducts.length}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="w-5 h-5 rounded border-2 border-gray-300 focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer"
                    />
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Ürün
                  </th>
                  <th className="px-4 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Kategori
                  </th>
                  <th className="px-4 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                    SKU
                  </th>
                  <th className="px-4 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Fiyat
                  </th>
                  <th className="px-4 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Stok
                  </th>
                  <th className="px-4 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Durum
                  </th>
                  <th className="px-4 py-4 text-right text-xs font-bold text-gray-600 uppercase tracking-wider">
                    İşlemler
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedProducts.includes(product.id)}
                        onChange={(e) => handleSelectProduct(product.id, e.target.checked)}
                        className="w-5 h-5 rounded border-2 border-gray-300 focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        {product.images && product.images.length > 0 ? (
                          <img
                            src={product.images[0]}
                            alt={product.name}
                            className="w-14 h-14 rounded-xl object-cover border border-gray-200"
                          />
                        ) : (
                          <div className="w-14 h-14 bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl flex items-center justify-center">
                            <Package className="w-6 h-6 text-gray-400" />
                          </div>
                        )}
                        <div>
                          <div className="font-bold text-gray-900 mb-1">{product.name}</div>
                          <div className="text-xs text-gray-500">{getPrimaryVariant(product).name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`px-3 py-1.5 text-xs font-semibold rounded-full ${getCategoryColor(product.category)}`}>
                        {getCategoryLabel(product.category)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-600 font-mono">
                      {getPrimaryVariant(product).sku}
                    </td>
                    <td className="px-4 py-4">
                      {getPrimaryVariant(product).originalPrice && getPrimaryVariant(product).originalPrice! > getPrimaryVariant(product).price ? (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-red-600 line-through">
                            ₺{getPrimaryVariant(product).originalPrice}
                          </span>
                          <span className="text-lg font-bold text-green-600">
                            ₺{getPrimaryVariant(product).price}
                          </span>
                        </div>
                      ) : (
                        <span className="text-lg font-bold text-primary">
                          ₺{getPrimaryVariant(product).price}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold ${getPrimaryVariant(product).stock > 20
                        ? "bg-green-50 text-green-700"
                        : getPrimaryVariant(product).stock > 10
                          ? "bg-yellow-50 text-yellow-700"
                          : "bg-red-50 text-red-700"
                        }`}>
                        {getPrimaryVariant(product).stock > 20 ? (
                          <CheckCircle className="w-4 h-4" />
                        ) : getPrimaryVariant(product).stock > 10 ? (
                          <AlertTriangle className="w-4 h-4" />
                        ) : (
                          <AlertTriangle className="w-4 h-4" />
                        )}
                        {getPrimaryVariant(product).stock}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex gap-2">
                        {product.featured && (
                          <div className="flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-semibold rounded-full">
                            <Star className="w-3 h-3 fill-current" />
                            Öne Çıkan
                          </div>
                        )}
                        {product.isNew && (
                          <div className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                            <CheckCircle className="w-3 h-3" />
                            Yeni
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/urunler/${product.slug}`}
                          target="_blank"
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                          title="Görüntüle"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        <Link
                          href={`/admin/urunler/${product.id}/duzenle`}
                          className="p-2 text-gray-400 hover:text-primary hover:bg-primary/10 rounded-xl transition-colors"
                          title="Düzenle"
                        >
                          <Edit className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => handleDelete(product.id)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                          title="Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {sortedProducts.length === 0 && !loading && (
        <div className="bg-white rounded-3xl shadow-lg border border-gray-200 p-16 text-center">
          <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Package className="w-12 h-12 text-gray-400" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-3">Ürün Bulunamadı</h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Arama kriterlerinize veya filtre seçimlerinize uygun ürün bulunamadı.
            Lütfen farklı arama terimleri deneyin veya filtreleri temizleyin.
          </p>
          <Link
            href="/admin/urunler/yeni"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90 transition-all"
          >
            <Plus className="w-4 h-4" />
            İlk Ürünü Ekle
          </Link>
        </div>
      )}

      {/* Pagination Controls */}
      {!loading && pagination.totalPages > 1 && sortedProducts.length > 0 && (
        <div className="mt-8 flex items-center justify-between bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
          <div className="text-sm text-gray-600">
            Toplam <span className="font-bold text-gray-900">{pagination.total}</span> ürün
            • Sayfa <span className="font-bold text-gray-900">{pagination.page}</span> / {pagination.totalPages}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (pagination.page > 1) loadProducts(pagination.page - 1);
              }}
              disabled={pagination.page <= 1}
              className="px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium text-gray-700"
            >
              Önceki
            </button>

            <div className="flex gap-1">
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
                    onClick={() => loadProducts(pageNum)}
                    className={`w-10 h-10 rounded-lg font-medium transition-all ${
                      pagination.page === pageNum
                        ? "bg-primary text-white shadow-md"
                        : "bg-white border border-gray-200 hover:bg-gray-50 text-gray-700"
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => {
                if (pagination.page < pagination.totalPages) loadProducts(pagination.page + 1);
              }}
              disabled={pagination.page >= pagination.totalPages}
              className="px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium text-gray-700"
            >
              Sonraki
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
