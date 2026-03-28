"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getCategoryById, addCategory, updateCategory } from "@/lib/categories";
import { CategoryFormData, CategoryInfo } from "@/types/category";
import { ArrowLeft, Save, X, Upload, Image as ImageIcon, FolderOpen } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface CategoryFormProps {
  categoryId?: string;
}

export default function CategoryForm({ categoryId }: CategoryFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [existingCategory, setExistingCategory] = useState<CategoryInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const existingCat = categoryId 
          ? await getCategoryById(categoryId) 
          : Promise.resolve(null);
        setExistingCategory(existingCat);
      } catch (error) {
        console.error("Failed to load data:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [categoryId]);

  const [formData, setFormData] = useState<CategoryFormData>({
    id: existingCategory?.id || "",
    name: existingCategory?.name || "",
    slug: existingCategory?.slug || "",
    description: existingCategory?.description || "",
    image: existingCategory?.image || "",
    icon: existingCategory?.icon || "🥜",
  });

  // Parent category feature disabled - requires database update
  // const [parentId, setParentId] = useState<string>("");

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
    setFormData({ ...formData, name });
    if (!formData.slug || formData.slug === generateSlug(formData.name)) {
      setFormData(prev => ({ ...prev, slug: generateSlug(name) }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.slug) {
      alert("Lütfen kategori adı giriniz!");
      return;
    }

    try {
      setLoading(true);
      
      console.log("Saving category:", formData);
      
      if (categoryId) {
        await updateCategory(categoryId, formData);
      } else {
        await addCategory(formData);
      }

      router.push("/admin/urunler/koleksiyonlar");
    } catch (error: any) {
      console.error("Error saving category:", error);
      alert("Kategori kaydedilirken bir hata oluştu: " + (error?.message || "Bilinmeyen hata"));
    } finally {
      setLoading(false);
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
      }
    } catch (error) {
      console.error("Upload failed:", error);
    } finally {
      setUploading(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      await handleImageUpload(files[0]);
    }
  };

  const handleRemoveImage = () => {
    setFormData({ ...formData, image: "" });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/urunler/koleksiyonlar"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">
            {categoryId ? "Koleksiyonu Düzenle" : "Yeni Koleksiyon Ekle"}
          </h1>
        </div>
        <button
          type="submit"
          disabled={loading || uploading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {loading ? "Kaydediliyor..." : "Kaydet"}
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="xl:col-span-2 space-y-6">
          {/* Basic Info */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Temel Bilgiler</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">
                  Koleksiyon Adı <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                  placeholder="Örn: Fıstık Ezmesi"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">
                  URL Slug <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs md:text-sm">
                    /koleksiyon/
                  </span>
                  <input
                    type="text"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    className="w-full pl-28 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-xs md:text-sm font-mono"
                    placeholder="fistik-ezmesi"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Parent category disabled until database update */}
            {/* {parentCategories.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">
                  Ana Koleksiyon (Opsiyonel)
                </label>
                <select
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                >
                  <option value="">Ana Koleksiyon Yok</option>
                  {parentCategories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
            )} */}

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">
                Açıklama
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm resize-none"
                placeholder="Koleksiyon açıklaması..."
              />
            </div>
          </div>

          {/* Image Upload */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Görsel</h2>
            
            {formData.image ? (
              <div className="relative">
                <img
                  src={formData.image}
                  alt={formData.name}
                  className="w-full h-48 md:h-64 object-cover rounded-lg"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="absolute top-2 right-2 p-2 bg-white/90 rounded-full shadow hover:bg-red-50 hover:text-red-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
                  dragActive 
                    ? "border-blue-500 bg-blue-50" 
                    : "border-gray-300 hover:border-gray-400"
                )}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])}
                />
                <div className="flex flex-col items-center gap-3">
                  {uploading ? (
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                  ) : (
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                      <Upload className="w-6 h-6 text-gray-400" />
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      Görseli buraya sürükleyin veya tıklayın
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      PNG, JPG, WebP - Maksimum 5MB
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">
                Veya Görsel URL Girin
              </label>
              <input
                type="url"
                value={formData.image}
                onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                placeholder="https://example.com/image.jpg"
              />
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Icon */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 space-y-4">
            <h3 className="text-base font-semibold text-gray-900">İkon</h3>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Emoji İkon
              </label>
              <input
                type="text"
                value={formData.icon}
                onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-2xl text-center"
                maxLength={2}
                placeholder="🥜"
              />
              <div className="mt-3 grid grid-cols-6 gap-1.5">
                {["🥜", "🌰", "🥑", "🍫", "🥛", "🌱", "🍯", "🌿", "🎯", "🎨", "💚", "🥗"].map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setFormData({ ...formData, icon: emoji })}
                    className={cn(
                      "p-2 text-xl rounded-lg transition-colors",
                      formData.icon === emoji
                        ? "bg-blue-600 text-white"
                        : "hover:bg-gray-100"
                    )}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Tips */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 md:p-6">
            <h3 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
              <FolderOpen className="w-4 h-4" />
              İpuçları
            </h3>
            <ul className="text-xs text-blue-800 space-y-1.5">
              <li>• Slug URL için kullanılır</li>
              <li>• Görsel boyutu en az 800x600 olmalı</li>
              <li>• Ana koleksiyon ile alt koleksiyon oluşturabilirsiniz</li>
            </ul>
          </div>
        </div>
      </div>
    </form>
  );
}
