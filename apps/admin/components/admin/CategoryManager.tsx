"use client";

import { useState, useEffect, useCallback } from "react";
import { 
  fetchCategories, 
  addCategory, 
  updateCategory, 
  deleteCategory 
} from "@/lib/categories";
import { CategoryInfo } from "@/types/product";
import { 
  Plus, 
  Edit, 
  Trash2, 
  Search, 
  ChevronRight, 
  ChevronDown,
  GripVertical,
  Image as ImageIcon,
  X,
  Check,
  AlertCircle,
  Loader2,
  Upload,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Save
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";

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

export default function CategoryManager() {
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [loading, setLoading] = useState(true);
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
    seo_description: ""
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{id: string; name: string} | null>(null);

  const showToast = (type: Toast["type"], message: string) => {
    const id = Date.now().toString();
    setToast({ id, type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const loadCategories = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCategories({ fresh: true });
      setCategories(data);
    } catch (error) {
      console.error("Failed to load categories:", error);
      showToast("error", "Kategoriler yüklenirken bir hata oluştu");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const buildTree = (cats: CategoryInfo[], parentId: string | null = null): CategoryInfo[] => {
    return cats
      .filter(c => c.parent_id === parentId)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map(cat => ({
        ...cat,
        children: buildTree(cats, cat.id)
      }));
  };

  const flatCategories = categories.filter(c => !c.parent_id);
  const tree = buildTree(categories);

  const filteredTree = searchQuery 
    ? tree.filter(cat => 
        cat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cat.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : tree;

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
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
      seo_description: (category as any).seo_description || ""
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
      seo_description: ""
    });
    setIsFormOpen(true);
  };

  const generateSlug = (name: string) => {
    const turkishToEnglish: Record<string, string> = {
      'ş': 's', 'Ş': 's',
      'ı': 'i', 'İ': 'i',
      'ğ': 'g', 'Ğ': 'g',
      'ü': 'u', 'Ü': 'u',
      'ö': 'o', 'Ö': 'o',
      'ç': 'c', 'Ç': 'c',
    };
    return name
      .split('')
      .map(char => turkishToEnglish[char] || char)
      .join('')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const handleNameChange = (name: string) => {
    setFormData(prev => ({
      ...prev,
      name,
      slug: prev.slug === generateSlug(prev.name) || !prev.slug 
        ? generateSlug(name) 
        : prev.slug
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      showToast("error", "Kategori adı zorunludur");
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
        seo_description: formData.seo_description
      };

      if (editingCategory) {
        await updateCategory(editingCategory.id, categoryData);
        showToast("success", "Kategori başarıyla güncellendi");
      } else {
        await addCategory(categoryData);
        showToast("success", "Kategori başarıyla oluşturuldu");
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
      showToast("success", "Kategori başarıyla silindi");
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
      formDataUpload.append('file', file);
      formDataUpload.append('folder', 'categories');

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formDataUpload,
      });

      const data = await response.json();
      
      if (data.url) {
        setFormData(prev => ({ ...prev, image: data.url }));
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
    { value: "", label: "Ana Kategori (Yok)" },
    ...categories
      .filter(c => c.id !== editingCategory?.id)
      .map(c => ({ value: c.id, label: c.name }))
  ];

  const renderCategoryRow = (category: CategoryInfo, level: number = 0) => {
    const hasChildren = category.children && category.children.length > 0;
    const isExpanded = expandedIds.has(category.id);

    return (
      <div key={category.id}>
        <div 
          className={`flex items-center gap-3 p-4 hover:bg-gray-50 border-b border-gray-100 transition-colors ${!category.is_active ? 'opacity-50' : ''}`}
          style={{ paddingLeft: `${level * 24 + 16}px` }}
        >
          <button 
            onClick={() => toggleExpand(category.id)}
            className={`p-1 hover:bg-gray-200 rounded transition-colors ${!hasChildren ? 'invisible' : ''}`}
          >
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>

          <div className="w-10 h-10 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
            {category.image ? (
              <img 
                src={category.image} 
                alt={category.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xl">
                {category.icon || "📦"}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-gray-900 truncate">{category.name}</h3>
              {!category.is_active && (
                <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded">Pasif</span>
              )}
              {hasChildren && (
                <span className="text-xs text-gray-400">({category.children?.length} alt)</span>
              )}
            </div>
            <p className="text-sm text-gray-500 truncate">/{category.slug}</p>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => handleEdit(category)}
              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Düzenle"
            >
              <Edit className="w-4 h-4" />
            </button>
            <button
              onClick={() => setDeleteConfirm({ id: category.id, name: category.name })}
              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Sil"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
        {hasChildren && isExpanded && category.children?.map(child => renderCategoryRow(child, level + 1))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Koleksiyonlar</h1>
          <p className="text-sm text-gray-500 mt-1">Kategorileri ve alt kategorileri yönetin</p>
        </div>
        <button
          onClick={handleNew}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Yeni Koleksiyon
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Kategori ara..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </div>

      {/* Category Tree */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : categories.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Plus className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Henüz koleksiyon yok</h3>
          <p className="text-gray-500 mb-4">İlk koleksiyonunuzu oluşturarak başlayın</p>
          <button
            onClick={handleNew}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Koleksiyon Oluştur
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="divide-y divide-gray-100">
            {filteredTree.map(category => renderCategoryRow(category))}
          </div>
        </div>
      )}

      {/* Category Form Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsFormOpen(false)} />
          <div className="relative bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editingCategory ? "Koleksiyon Düzenle" : "Yeni Koleksiyon"}
              </h2>
              <button
                onClick={() => setIsFormOpen(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <h3 className="font-medium text-gray-900">Temel Bilgiler</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Kategori Adı <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder="Örn: Fıstık Ezmesi"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    URL Slug <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 text-sm">/koleksiyon/</span>
                    <input
                      type="text"
                      value={formData.slug}
                      onChange={(e) => setFormData(prev => ({ ...prev, slug: generateSlug(e.target.value) }))}
                      className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      placeholder="fistik-ezmesi"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Açıklama
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder="Kategori açıklaması..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Üst Kategori
                  </label>
                  <select
                    value={formData.parent_id || ""}
                    onChange={(e) => setFormData(prev => ({ ...prev, parent_id: e.target.value || null }))}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    {parentOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Image */}
              <div className="space-y-4">
                <h3 className="font-medium text-gray-900">Görsel</h3>
                
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-primary/50 transition-colors">
                  {formData.image ? (
                    <div className="relative inline-block">
                      <img 
                        src={formData.image} 
                        alt="Preview" 
                        className="max-h-48 rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, image: "" }))}
                        className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])}
                        disabled={uploading}
                      />
                      <ImageIcon className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">
                        {uploading ? "Yükleniyor..." : "Görsel yüklemek için tıklayın"}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">PNG, JPG, WebP - Max 5MB</p>
                    </label>
                  )}
                </div>
              </div>

              {/* SEO */}
              <div className="space-y-4">
                <h3 className="font-medium text-gray-900">SEO Ayarları</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    SEO Başlığı
                  </label>
                  <input
                    type="text"
                    value={formData.seo_title}
                    onChange={(e) => setFormData(prev => ({ ...prev, seo_title: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder="Fistik Ezmesi | Celebix E-ticaret"
                    maxLength={60}
                  />
                  <p className="text-xs text-gray-400 mt-1">{formData.seo_title.length}/60 karakter</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Meta Açıklama
                  </label>
                  <textarea
                    value={formData.seo_description}
                    onChange={(e) => setFormData(prev => ({ ...prev, seo_description: e.target.value }))}
                    rows={2}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    placeholder="En taze fıstık ezmesi çeşitleri..."
                    maxLength={160}
                  />
                  <p className="text-xs text-gray-400 mt-1">{formData.seo_description.length}/160 karakter</p>
                </div>
              </div>

              {/* Settings */}
              <div className="space-y-4">
                <h3 className="font-medium text-gray-900">Ayarlar</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Sıralama
                    </label>
                    <input
                      type="number"
                      value={formData.sort_order}
                      onChange={(e) => setFormData(prev => ({ ...prev, sort_order: parseInt(e.target.value) || 0 }))}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      min={0}
                    />
                  </div>

                  <div className="flex items-center gap-3 h-full pt-5">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.is_active}
                        onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                        className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary"
                      />
                      <span className="text-sm text-gray-700">Aktif</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Kaydediliyor...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Kaydet
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-white rounded-2xl p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Kategoriyi Sil</h3>
                <p className="text-sm text-gray-500">Bu işlem geri alınamaz</p>
              </div>
            </div>
            <p className="text-gray-600 mb-6">
              <strong>{deleteConfirm.name}</strong> kategorisini silmek istediğinizden emin misiniz?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                İptal
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Sil
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-slide-up z-50 ${
          toast.type === "success" ? "bg-green-500 text-white" :
          toast.type === "error" ? "bg-red-500 text-white" :
          "bg-blue-500 text-white"
        }`}>
          {toast.type === "success" && <Check className="w-4 h-4" />}
          {toast.type === "error" && <AlertCircle className="w-4 h-4" />}
          {toast.message}
        </div>
      )}
    </div>
  );
}
