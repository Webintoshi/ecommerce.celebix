"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  Upload,
  X,
  Save,
  Image as ImageIcon,
  Package,
  Sparkles,
  Zap,
  Leaf,
  Check,
  RefreshCw,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import Link from "next/link";
import { Product, ProductVariant, NutritionalInfo, ProductCategory, ProductSubcategory } from "@/types/product";
import { fetchCategories } from "@/lib/categories";
import { buildGeneratedSku } from "@/lib/sku";
import {
  isSupportedImageMimeType,
  SUPPORTED_IMAGE_ACCEPT,
  SUPPORTED_IMAGE_FORMATS_WITH_GIF_LABEL,
} from "@celebix/platform-config/src/image-formats";
import { extractPlainTextFromProductDescription } from "@celebix/platform-config/src/product-description-rich-text";

interface CategoryOption {
  value: string;
  label: string;
  subcategories: { value: string; label: string }[];
}

const PREDEFINED_TAGS = [
  "doğal", "vegan", "glutensiz", "sekersiz", "organik", "sporcu", "enerji",
  "kalp dostu", "bağışıklık", "kahvaltı", "atıştırmalık", "kavrulmuş",
  "çiğ", "balli", "hurmalı", "kakaolu", "sütlü", "keto",
  "yüksek protein", "antioksidan", "omega-3", "E vitamini"
];

interface ProductFormProps {
  productId?: string;
}

export default function ProductForm({ productId }: ProductFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);

  // Load categories from database
  useEffect(() => {
    async function loadCategories() {
      try {
        const cats = await fetchCategories();
        const mapped: CategoryOption[] = cats.map(cat => ({
          value: cat.slug,
          label: cat.name,
          subcategories: []
        }));
        setCategories(mapped);
      } catch (error) {
        console.error("Failed to load categories:", error);
      } finally {
        setLoadingCategories(false);
      }
    }
    loadCategories();
  }, []);

  // Get subcategories for selected category
  const categorySubcategories = categories.find(c => c.value === formData.category)?.subcategories || [];

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    shortDescription: "",
    category: "" as ProductCategory | "",
    subcategory: "" as ProductSubcategory | "",
    tags: [] as string[],
    nutritionalInfo: {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
      sugar: 0,
    } as NutritionalInfo,
    vegan: true,
    glutenFree: true,
    sugarFree: true,
    highProtein: true,
    rating: 5,
    reviewCount: 0,
    featured: false,
    new: true,
    isActive: true,
  });

  // Use a stable ID for the initial variant to avoid hydration mismatch
  const [variants, setVariants] = useState<ProductVariant[]>(() => [
    {
      id: `variant-${Date.now()}`,
      name: "Varsayılan Varyant",
      weight: 0,
      price: 0,
      stock: 50,
      sku: buildGeneratedSku(),
    },
  ]);

  const [images, setImages] = useState<string[]>([]);
  const [deletedImages, setDeletedImages] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);

  const loadProductData = useCallback(async () => {
    if (productId) {
      setLoading(true);
      try {
        // Fetch from API instead of static data
        const res = await fetch(`/api/products?id=${productId}`);
        const data = await res.json();

        if (data.success && data.product) {
          const product = data.product;
          setFormData({
            name: product.name || "",
            slug: product.slug || "",
            description: product.description || "",
            shortDescription: product.short_description || "",
            category: product.category || "",
            subcategory: product.subcategory || "",
            tags: product.tags || [],
            nutritionalInfo: {
              calories: 0,
              protein: 0,
              carbs: 0,
              fat: 0,
              fiber: 0,
              sugar: 0,
            },
            vegan: true,
            glutenFree: true,
            sugarFree: true,
            highProtein: true,
            rating: 5,
            reviewCount: 0,
            featured: product.is_featured || false,
            new: product.is_new || false,
            isActive: product.is_active !== false,
          });

          // Map variants from database format
          if (product.variants && product.variants.length > 0) {
            setVariants(product.variants.map((v: Record<string, unknown>) => ({
              id: v.id as string,
              name: v.name as string || "",
              weight: parseInt(String(v.weight) || "0"),
              price: Number(v.price) || 0,
              originalPrice: Number(v.original_price) || 0,
              stock: Number(v.stock) || 0,
              sku: v.sku as string || "",
            })));
          }

          setImages(product.images || []);
        }
      } catch (error) {
        console.error("Failed to load product:", error);
      } finally {
        setLoading(false);
      }
    }
  }, [productId]);

  useEffect(() => {
    loadProductData();
  }, [loadProductData]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleFiles = async (files: FileList) => {
    const fileArray = Array.from(files).filter(f => f.type.startsWith('image/'));

    if (fileArray.length === 0) return;

    // Check if adding would exceed limit
    if (images.length + fileArray.length > 6) {
      toast.error('En fazla 6 görsel ekleyebilirsiniz');
      return;
    }

    setSaving(true);
    setUploadProgress(10);

    // Validate files first
    const validFiles = fileArray.filter(file => {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name} dosya boyutu çok büyük (maksimum 5MB)`);
        return false;
      }
      if (!isSupportedImageMimeType(file.type, file.name)) {
        toast.error(`${file.name} formatı desteklenmiyor (${SUPPORTED_IMAGE_FORMATS_WITH_GIF_LABEL})`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) {
      setSaving(false);
      setUploadProgress(0);
      return;
    }

    // Parallel upload with Promise.all
    const uploadPromises = validFiles.map(async (file) => {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder', 'products');

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        const result = await response.json();
        
        console.log('ProductForm - Upload result:', result);

        if (result.success && result.url) {
          return { success: true, url: result.url };
        }
        return { success: false, error: result.error || 'Görsel yüklenemedi' };
      } catch (error) {
        console.error('Upload error:', error);
        return { success: false, error: 'Görsel yüklenirken hata oluştu' };
      }
    });

    // Wait for all uploads to complete
    const results = await Promise.all(uploadPromises);

    // Add successful uploads to images
    const newImages = results.filter(r => r.success).map(r => (r as { success: true; url: string }).url);
    const failedCount = results.filter(r => !r.success).length;

    setImages(prev => {
      const updated = [...prev, ...newImages];
      return updated.slice(0, 6); // Limit to 6 images
    });

    setUploadProgress(100);

    if (newImages.length > 0) {
      toast.success(`${newImages.length} görsel başarıyla yüklendi`);
    }

    if (failedCount > 0) {
      toast.error(`${failedCount} görsel yüklenemedi`);
    }

    // Reset progress after a short delay
    setTimeout(() => {
      setUploadProgress(0);
      setSaving(false);
    }, 500);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
  };

  const removeImage = async (index: number) => {
    setImages(prev => {
      const removedImage = prev[index];

      // Uploaded product assets are deleted by their R2 object key.
      try {
        const parsedUrl = new URL(removedImage);
        const key = parsedUrl.pathname.replace(/^\/+/, "");
        if (key.startsWith("products/")) {
          setDeletedImages(deleted => [...deleted, key]);
        }
      } catch {
        // Ignore non-URL image entries.
      }

      return prev.filter((_, i) => i !== index);
    });
  };

  const addVariant = () => {
    setVariants(prev => [...prev, {
      id: `variant-${Date.now()}`,
      name: `${prev.length + 1}. Varyant`,
      weight: 0,
      price: 0,
      stock: 50,
      sku: buildGeneratedSku(),
    }]);
  };

  const removeVariant = (index: number) => {
    if (variants.length > 1) {
      setVariants(prev => prev.filter((_, i) => i !== index));
    }
  };

  const updateVariant = (index: number, field: keyof ProductVariant, value: string | number) => {
    setVariants(prev => prev.map((v, i) =>
      i === index ? { ...v, [field]: value } : v
    ));
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

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    // Only generate slug if creating new product or if user hasn't manually edited slug yet (simplification)
    // For now, let's only auto-generate slug if it's not a productId present
    if (!productId) {
      setFormData(prev => ({ ...prev, name, slug: generateSlug(name) }));
    } else {
      setFormData(prev => ({ ...prev, name }));
    }
  };

  const toggleTag = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.includes(tag)
        ? prev.tags.filter(t => t !== tag)
        : [...prev.tags, tag],
    }));
  };

  const addCustomTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const input = e.target as HTMLInputElement;
      const tag = input.value.trim().toLowerCase();
      if (tag && !formData.tags.includes(tag)) {
        setFormData(prev => ({ ...prev, tags: [...prev.tags, tag] }));
      }
      input.value = '';
      e.preventDefault(); // Prevent form submission
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Ürün adı gereklidir';
    }

    if (!formData.slug.trim()) {
      newErrors.slug = 'Slug gereklidir';
    }

    if (!extractPlainTextFromProductDescription(formData.description).trim()) {
      newErrors.description = 'Açıklama gereklidir';
    }

    if (!formData.category) {
      newErrors.category = 'Kategori seçilmelidir';
    }

    if (!formData.subcategory) {
      newErrors.subcategory = 'Alt kategori seçilmelidir';
    }

    if (variants.length === 0) {
      newErrors.variants = 'En az bir varyant gerekli';
    } else {
      variants.forEach((v, i) => {
        if (!v.name.trim()) {
          newErrors[`variant_${i}_name`] = 'Varyant adı gereklidir';
        }
        if (!v.price || v.price <= 0) {
          newErrors[`variant_${i}_price`] = 'Fiyat geçersiz';
        }
      });
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      toast.error('Lütfen zorunlu alanları doldurun');
      return;
    }

    setSaving(true);

    try {
      // API için ürün verisi hazırla
      const productData = {
        name: formData.name,
        slug: formData.slug,
        description: formData.description,
        short_description: formData.shortDescription,
        category: formData.category,
        subcategory: formData.subcategory,
        images: images,
        tags: formData.tags,
        is_featured: formData.featured,
        is_new: formData.new,
        is_active: formData.isActive,
        rating: formData.rating,
        review_count: formData.reviewCount,
        // Varyantları API formatına çevir (id hariç - Supabase otomatik atar)
        variants: variants.map(v => ({
          name: v.name,
          weight: Number(v.weight),
          price: Number(v.price),
          original_price: v.originalPrice ? Number(v.originalPrice) : null,
          stock: Number(v.stock) || 0,
          sku: v.sku || null,
        })),
      };

      // API'ye gönder
      const url = '/api/products';
      const method = productId ? 'PUT' : 'POST';

      const requestBody: any = {
        id: productId,
        ...productData,
      };

      // Sadece güncelleme (PUT) sırasında silinen görselleri gönder
      if (productId && deletedImages.length > 0) {
        requestBody.deleted_images = deletedImages;
      }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Ürün kaydedilemedi');
      }

      toast.success(productId ? 'Ürün başarıyla güncellendi!' : 'Ürün başarıyla eklendi!');

      // Form state'ini sıfırla
      setDeletedImages([]);

      router.push('/admin/urunler');
      router.refresh();
    } catch (error) {
      console.error('Save error:', error);
      toast.error(error instanceof Error ? error.message : 'Bir hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <form onSubmit={handleSubmit} className="container mx-auto max-w-none px-4 py-8 md:px-6 md:py-10 2xl:px-8 2xl:py-12">
        {/* Header Section */}
        <div className="mb-10 flex flex-col justify-between gap-6 xl:flex-row xl:items-center">
          <div className="space-y-2">
            <h1 className="text-4xl font-black text-gray-900 tracking-tight">
              {productId ? "Ürünü Düzenle" : "Yeni Ürün Ekle"}
            </h1>
            <p className="text-gray-500 font-medium">
              Katalogunuza yeni bir ürün ekleyin veya mevcut olanı güncelleyin.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/admin/urunler"
              className="px-6 py-3 bg-white border border-gray-100 text-gray-600 rounded-[8px] font-bold hover:bg-gray-50 transition-all shadow-sm"
            >
              Vazgeç
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-8 py-3 bg-gray-900 text-white rounded-[8px] font-bold hover:bg-gray-800 transition-all shadow-lg shadow-gray-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  KAYDEDİLİYOR...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  DEĞİŞİKLİKLERİ KAYDET
                </>
              )}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 2xl:grid-cols-12 2xl:gap-10">
          <div className="space-y-8 2xl:col-span-8 2xl:space-y-10">

            {/* Basic Information Section */}
            <div className="bg-white rounded-[12px] border border-gray-100 shadow-sm overflow-hidden group hover:shadow-md transition-all">
              <div className="px-8 py-6 border-b border-gray-50 flex items-center gap-4 bg-[var(--admin-bg)]">
                <div className="w-10 h-10 bg-blue-600 text-white rounded-[8px] flex items-center justify-center shadow-lg shadow-blue-600/20 group-hover:scale-110 transition-transform">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 leading-none">Temel Bilgiler</h2>
                  <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-1">Gerekli Bilgileri Doldurun</p>
                </div>
              </div>

              <div className="p-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">
                      Ürün Adı <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={handleNameChange}
                      placeholder="Örn: Şekersiz Fıstık Ezmesi"
                      className={cn(
                        "w-full px-5 py-4 bg-white border border-gray-200 rounded-[8px] focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all text-sm font-medium shadow-sm",
                        errors.name && "border-rose-200 bg-rose-50/30"
                      )}
                      required
                    />
                    {errors.name && (
                      <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest ml-1">{errors.name}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">
                      URL Slug <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.slug}
                      onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                      placeholder="sekersiz-fistik-ezmesi"
                      className={cn(
                        "w-full px-5 py-4 bg-white border border-gray-200 rounded-[8px] focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all text-sm font-mono shadow-sm",
                        errors.slug && "border-rose-200 bg-rose-50/30"
                      )}
                      required
                    />
                    {errors.slug && (
                      <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest ml-1">{errors.slug}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">
                    Kısa Açıklama <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    value={formData.shortDescription}
                    onChange={(e) => setFormData(prev => ({ ...prev, shortDescription: e.target.value }))}
                    placeholder="Ürünün arama sonuçlarında görünecek kısa özeti..."
                    rows={2}
                    className="w-full px-5 py-4 bg-white border border-gray-200 rounded-[8px] focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all text-sm font-medium resize-none shadow-sm"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">
                    Ürün Açıklaması <span className="text-rose-500">*</span>
                  </label>
                  <RichTextEditor
                    value={formData.description}
                    onChange={(description) =>
                      setFormData((prev) => ({ ...prev, description }))
                    }
                    placeholder="Ürün hakkında detaylı bilgi, başlıklar, listeler ve kullanım önerilerini girin..."
                    error={errors.description}
                    minHeightClassName="min-h-[240px]"
                  />
                  {errors.description && (
                    <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest ml-1">{errors.description}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">
                      Kategori <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative group">
                      <select
                        value={formData.category}
                        onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value as ProductCategory | "", subcategory: "" }))}
                        className={cn(
                          "w-full appearance-none px-5 py-4 bg-white border border-gray-200 rounded-[8px] focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all text-sm font-bold cursor-pointer shadow-sm",
                          errors.category && "border-rose-200 bg-rose-50/30"
                        )}
                        required
                      >
                        <option value="">{loadingCategories ? "Yükleniyor..." : "Kategori Seçin"}</option>
                        {categories.map(cat => (
                          <option key={cat.value} value={cat.value}>{cat.label}</option>
                        ))}
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>
                    {errors.category && (
                      <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest ml-1">{errors.category}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">
                      Alt Kategori <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative group">
                      <select
                        value={formData.subcategory}
                        onChange={(e) => setFormData(prev => ({ ...prev, subcategory: e.target.value as ProductSubcategory | "" }))}
                        disabled={!formData.category}
                        className={cn(
                          "w-full appearance-none px-5 py-4 bg-white border border-gray-200 rounded-[8px] focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all text-sm font-bold cursor-pointer shadow-sm",
                          !formData.category && "opacity-50 cursor-not-allowed",
                          errors.subcategory && "border-rose-200 bg-rose-50/30"
                        )}
                        required
                      >
                        <option value="">{formData.category ? "Alt Kategori Seçin" : "Önce kategori seçin"}</option>
                        {categorySubcategories.map(sub => (
                          <option key={sub.value} value={sub.value}>{sub.label}</option>
                        ))}
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>
                    {errors.subcategory && (
                      <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest ml-1">{errors.subcategory}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">
                    Etiketler
                  </label>
                  <div className="relative group">
                    <Sparkles className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-600 transition-colors" />
                    <input
                      type="text"
                      placeholder="Yeni etiket ekle ve Enter'a bas..."
                      onKeyPress={addCustomTag}
                      className="w-full pl-11 pr-4 py-4 bg-white border border-gray-200 rounded-[8px] focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none transition-all text-sm font-medium shadow-sm"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {PREDEFINED_TAGS.map(tag => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className={cn(
                          "px-4 py-2 rounded-[8px] text-xs font-bold transition-all flex items-center gap-2",
                          formData.tags.includes(tag)
                            ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                            : "bg-white border border-gray-100 text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                        )}
                      >
                        {formData.tags.includes(tag) ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3 opacity-50" />}
                        {tag.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Image Upload Section */}
                <div className="bg-white rounded-[12px] border border-gray-100 shadow-sm overflow-hidden group hover:shadow-md transition-all">
                  <div className="px-8 py-6 border-b border-gray-50 flex items-center gap-4 bg-[var(--admin-bg)]">
                    <div className="w-10 h-10 bg-amber-500 text-white rounded-[8px] flex items-center justify-center shadow-lg shadow-amber-500/20 group-hover:scale-110 transition-transform">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900 leading-none">Ürün Görselleri</h2>
                      <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-1">Görsel Yönetimi</p>
                    </div>
                  </div>

                  <div className="p-8">
                    <div
                      onDragOver={handleDrag}
                      onDragEnter={handleDrag}
                      onDragLeave={handleDrag}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={cn(
                        "relative border-2 border-dashed rounded-[12px] p-12 transition-all cursor-pointer group/upload overflow-hidden",
                        dragActive ? "border-amber-500 bg-amber-50/50" : "border-gray-100 hover:border-amber-200 hover:bg-[var(--admin-bg)]"
                      )}
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleImageUpload}
                        className="hidden"
                        multiple
                        accept={SUPPORTED_IMAGE_ACCEPT}
                      />

                      <div className="flex flex-col items-center gap-4 text-center">
                        <div className="w-16 h-16 bg-white rounded-[8px] shadow-xl flex items-center justify-center group-hover/upload:scale-110 group-hover/upload:rotate-3 transition-all duration-500">
                          <Upload className="w-8 h-8 text-amber-500" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-lg font-bold text-gray-900">Görselleri Sürükleyin veya Tıklayın</p>
                          <p className="text-sm text-gray-400 font-medium">{SUPPORTED_IMAGE_FORMATS_WITH_GIF_LABEL} (Max. 5MB)</p>
                        </div>
                      </div>

                      {uploadProgress > 0 && uploadProgress < 100 && (
                        <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-gray-100">
                          <div
                            className="h-full bg-amber-500 transition-all duration-300"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                      )}
                    </div>

                    {images.length > 0 && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
                        {images.map((img, idx) => (
                          <div key={idx} className="group/img relative aspect-square rounded-[8px] overflow-hidden bg-gray-50 border border-gray-100 hover:shadow-xl transition-all">
                            <img src={img} alt="" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); removeImage(idx); }}
                                className="p-2 bg-white/20 backdrop-blur-md rounded-[8px] text-white hover:bg-rose-500 transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Variants Section */}
                <div className="bg-white rounded-[12px] border border-gray-100 shadow-sm overflow-hidden group hover:shadow-md transition-all">
                  <div className="px-8 py-6 border-b border-gray-50 flex items-center justify-between bg-[var(--admin-bg)]">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-indigo-600 text-white rounded-[8px] flex items-center justify-center shadow-lg shadow-indigo-600/20 group-hover:scale-110 transition-transform">
                        <Zap className="w-5 h-5" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-gray-900 leading-none">Varyantlar</h2>
                        <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-1">Ebat ve Fiyat Yönetimi</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={addVariant}
                      className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-[8px] text-xs font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5 inline-block mr-1" />
                      YENİ EKLE
                    </button>
                  </div>

                  <div className="p-8 space-y-6">
                    <p className="text-xs font-medium text-gray-500">
                      Gramaj ve birim alanlari bu formdan kaldirildi. Gerekiyorsa varyant nitelikleri uzerinden tanimlayin.
                    </p>
                    {variants.map((variant, index) => (
                      <div key={variant.id} className="group/variant relative p-6 bg-[var(--admin-bg)] rounded-[8px] border border-transparent hover:border-indigo-100 hover:bg-white hover:shadow-xl transition-all">
                        {variants.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeVariant(index)}
                            className="absolute -top-3 -right-3 w-8 h-8 bg-white text-rose-500 rounded-[8px] shadow-lg border border-gray-100 flex items-center justify-center opacity-0 group-hover/variant:opacity-100 transition-all hover:bg-rose-500 hover:text-white"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                          <div className="md:col-span-5 space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Varyant Adı</label>
                            <input
                              type="text"
                              value={variant.name}
                              onChange={(e) => updateVariant(index, 'name', e.target.value)}
                              placeholder="Örn: 2'li Avantaj Paketi"
                              className={cn(
                                "w-full px-4 py-3 bg-white border border-gray-200 rounded-[8px] focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all text-sm font-bold shadow-sm",
                                errors[`variant_${index}_name`] && "border-rose-500 bg-rose-50/30"
                              )}
                              required
                            />
                            {errors[`variant_${index}_name`] && (
                              <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest">{errors[`variant_${index}_name`]}</p>
                            )}
                          </div>
                          <div className="md:col-span-2 space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Fiyat (₺)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={variant.price}
                              onChange={(e) => updateVariant(index, 'price', parseFloat(e.target.value) || 0)}
                              className={cn(
                                "w-full px-4 py-3 bg-white border border-gray-200 rounded-[8px] focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all text-sm font-bold text-indigo-600 shadow-sm",
                                errors[`variant_${index}_price`] && "border-rose-500 bg-rose-50/30"
                              )}
                              required
                            />
                            {errors[`variant_${index}_price`] && (
                              <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest">{errors[`variant_${index}_price`]}</p>
                            )}
                          </div>
                          <div className="md:col-span-2 space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Stok</label>
                            <input
                              type="number"
                              value={variant.stock}
                              onChange={(e) => updateVariant(index, 'stock', parseInt(e.target.value) || 0)}
                              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-[8px] focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all text-sm font-mono shadow-sm"
                              required
                            />
                          </div>
                          <div className="md:col-span-3 space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Barkod/SKU</label>
                            <input
                              type="text"
                              value={variant.sku}
                              onChange={(e) => updateVariant(index, 'sku', e.target.value)}
                              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-[8px] focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all text-[10px] font-mono shadow-sm"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar Section */}
          <div className="space-y-8 2xl:col-span-4 2xl:space-y-10">
            {/* Status & Properties */}
            <div className="bg-white rounded-[12px] border border-gray-100 shadow-sm overflow-hidden group hover:shadow-md transition-all">
              <div className="px-8 py-6 border-b border-gray-50 flex items-center gap-4 bg-[var(--admin-bg)]">
                <div className="w-10 h-10 bg-orange-600 text-white rounded-[8px] flex items-center justify-center shadow-lg shadow-orange-600/20 group-hover:scale-110 transition-transform">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 leading-none">Ürün Durumu</h2>
                  <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-1">Görünürlük Ayarları</p>
                </div>
              </div>
              <div className="p-8 space-y-4">
                <div className="flex items-center justify-between p-4 bg-green-50 rounded-[8px] hover:bg-green-100 transition-colors cursor-pointer group/toggle"
                  onClick={() => setFormData(prev => ({ ...prev, isActive: !prev.isActive }))}>
                  <div className="flex items-center gap-3">
                    <div className={cn("w-2 h-2 rounded-full", formData.isActive ? "bg-green-600 animate-pulse" : "bg-gray-300")} />
                    <span className="text-sm font-bold text-gray-700">Ürünü Aktif Et</span>
                  </div>
                  <div className={cn(
                    "w-12 h-6 rounded-full transition-all relative",
                    formData.isActive ? "bg-green-600 shadow-inner" : "bg-gray-200"
                  )}>
                    <div className={cn(
                      "absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all",
                      formData.isActive ? "translate-x-6" : "translate-x-0"
                    )} />
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-[8px] hover:bg-gray-100 transition-colors cursor-pointer group/toggle"
                  onClick={() => setFormData(prev => ({ ...prev, featured: !prev.featured }))}>
                  <div className="flex items-center gap-3">
                    <div className={cn("w-2 h-2 rounded-full", formData.featured ? "bg-orange-600 animate-pulse" : "bg-gray-300")} />
                    <span className="text-sm font-bold text-gray-700">Öne Çıkar</span>
                  </div>
                  <div className={cn(
                    "w-12 h-6 rounded-full transition-all relative",
                    formData.featured ? "bg-orange-600 shadow-inner" : "bg-gray-200"
                  )}>
                    <div className={cn(
                      "absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all",
                      formData.featured ? "translate-x-6" : "translate-x-0"
                    )} />
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-[8px] hover:bg-gray-100 transition-colors cursor-pointer group/toggle"
                  onClick={() => setFormData(prev => ({ ...prev, new: !prev.new }))}>
                  <div className="flex items-center gap-3">
                    <div className={cn("w-2 h-2 rounded-full", formData.new ? "bg-blue-600 animate-pulse" : "bg-gray-300")} />
                    <span className="text-sm font-bold text-gray-700">Yeni Ürün</span>
                  </div>
                  <div className={cn(
                    "w-12 h-6 rounded-full transition-all relative",
                    formData.new ? "bg-blue-600 shadow-inner" : "bg-gray-200"
                  )}>
                    <div className={cn(
                      "absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all",
                      formData.new ? "translate-x-6" : "translate-x-0"
                    )} />
                  </div>
                </div>
              </div>
            </div>

            {/* Product Features */}
            <div className="bg-white rounded-[12px] border border-gray-100 shadow-sm overflow-hidden group hover:shadow-md transition-all">
              <div className="px-8 py-6 border-b border-gray-50 flex items-center gap-4 bg-[var(--admin-bg)]">
                <div className="w-10 h-10 bg-emerald-500 text-white rounded-[8px] flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:scale-110 transition-transform">
                  <Leaf className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 leading-none">Özellikler</h2>
                  <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-1">Ürün Nitelikleri</p>
                </div>
              </div>
              <div className="p-8 grid grid-cols-2 gap-4">
                {[
                  { id: 'vegan', label: 'VEGAN' },
                  { id: 'glutenFree', label: 'GLUTENSİZ' },
                  { id: 'sugarFree', label: 'ŞEKERSİZ' },
                  { id: 'highProtein', label: 'YÜKSEK PROTEİN' }
                ].map((feat) => (
                  <button
                    key={feat.id}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, [feat.id]: !prev[feat.id as keyof typeof prev] }))}
                    className={cn(
                      "flex flex-col items-center justify-center p-4 rounded-[8px] border transition-all gap-2",
                      formData[feat.id as keyof typeof formData]
                        ? "bg-emerald-50 border-emerald-100 text-emerald-700 shadow-sm"
                        : "bg-white border-gray-100 text-gray-400 grayscale opacity-60 hover:grayscale-0 hover:opacity-100"
                    )}
                  >
                    <Check className={cn("w-4 h-4 transition-all", formData[feat.id as keyof typeof formData] ? "scale-100 opacity-100" : "scale-0 opacity-0")} />
                    <span className="text-[10px] font-black uppercase tracking-widest">{feat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Nutritional Info */}
            <div className="bg-white rounded-[12px] border border-gray-100 shadow-sm overflow-hidden group hover:shadow-md transition-all">
              <div className="px-8 py-6 border-b border-gray-50 flex items-center gap-4 bg-[var(--admin-bg)]">
                <div className="w-10 h-10 bg-rose-500 text-white rounded-[8px] flex items-center justify-center shadow-lg shadow-rose-500/20 group-hover:scale-110 transition-transform">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 leading-none">Besin Bilgileri</h2>
                  <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-1">100g Değerleri</p>
                </div>
              </div>
              <div className="p-8">
                <div className="grid grid-cols-2 gap-6">
                  {[
                    { id: 'calories', label: 'KALORİ' },
                    { id: 'protein', label: 'PROTEİN (g)' },
                    { id: 'carbs', label: 'KARB (g)' },
                    { id: 'fat', label: 'YAĞ (g)' },
                    { id: 'fiber', label: 'LİF (g)' },
                    { id: 'sugar', label: 'ŞEKER (g)' }
                  ].map((item) => (
                    <div key={item.id} className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{item.label}</label>
                      <input
                        type="number"
                        value={formData.nutritionalInfo[item.id as keyof NutritionalInfo]}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          nutritionalInfo: { ...prev.nutritionalInfo, [item.id]: parseInt(e.target.value) || 0 }
                        }))}
                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-[8px] focus:border-rose-500 focus:ring-4 focus:ring-rose-50 outline-none transition-all text-sm font-bold shadow-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Ratings Summary */}
            <div className="bg-white rounded-[12px] border border-gray-100 shadow-sm overflow-hidden group hover:shadow-md transition-all">
              <div className="px-8 py-6 border-b border-gray-50 flex items-center gap-4 bg-[var(--admin-bg)]">
                <div className="w-10 h-10 bg-amber-400 text-white rounded-[8px] flex items-center justify-center shadow-lg shadow-amber-400/20 group-hover:scale-110 transition-transform">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 leading-none">Değerlendirme</h2>
                  <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest mt-1">Müşteri Geri Bildirimi</p>
                </div>
              </div>
              <div className="p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Yıldız Puanı (0-5)</label>
                  <input
                    type="number"
                    min="0"
                    max="5"
                    step="0.1"
                    value={formData.rating}
                    onChange={(e) => setFormData(prev => ({ ...prev, rating: parseFloat(e.target.value) || 5 }))}
                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-[8px] focus:border-amber-500 focus:ring-4 focus:ring-amber-50 outline-none transition-all text-lg font-black text-amber-500 shadow-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Yorum Sayısı</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.reviewCount}
                    onChange={(e) => setFormData(prev => ({ ...prev, reviewCount: parseInt(e.target.value) || 0 }))}
                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-[8px] focus:border-amber-500 focus:ring-4 focus:ring-amber-50 outline-none transition-all text-sm font-bold shadow-sm"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
