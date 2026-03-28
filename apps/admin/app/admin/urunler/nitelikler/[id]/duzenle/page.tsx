"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  Plus,
  X,
  Loader2,
  AlertCircle,
  Check,
  Palette,
  Trash2,
  Upload,
  ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { VariantAttribute, VariantAttributeValue } from "@/types/variant-attributes";

interface ValueInput extends VariantAttributeValue {
  isNew?: boolean;
  isDeleted?: boolean;
}

export default function EditVariantAttributePage() {
  const router = useRouter();
  const params = useParams();
  const attributeId = params.id as string;

  const [attribute, setAttribute] = useState<VariantAttribute | null>(null);
  const [name, setName] = useState("");
  const [values, setValues] = useState<ValueInput[]>([]);
  const [displayType, setDisplayType] = useState<"text" | "color" | "image">("text");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploadingValueId, setUploadingValueId] = useState<string | null>(null);

  useEffect(() => {
    fetchAttribute();
  }, [attributeId]);

  const fetchAttribute = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/admin/variant-attributes?id=${attributeId}&withValues=true`
      );
      const data = await response.json();

      if (data.success && data.attribute) {
        setAttribute(data.attribute);
        setName(data.attribute.name);
        const existingValues = data.attribute.values || [];
        setValues(existingValues.map((v: VariantAttributeValue) => ({ ...v })));
        
        // Determine display type
        const hasColor = existingValues.some((v: VariantAttributeValue) => v.color_code);
        const hasImage = existingValues.some((v: VariantAttributeValue) => v.image_url);
        if (hasImage) setDisplayType("image");
        else if (hasColor) setDisplayType("color");
        else setDisplayType("text");
      } else {
        toast.error("Nitelik yüklenirken hata oluştu");
        router.push("/admin/urunler/nitelikler");
      }
    } catch (error) {
      toast.error("Nitelik yüklenirken hata oluştu");
      router.push("/admin/urunler/nitelikler");
    } finally {
      setLoading(false);
    }
  };

  const addValue = () => {
    const newValue: ValueInput = {
      id: `new-${Date.now()}`,
      attribute_id: attributeId,
      value: "",
      color_code: "",
      image_url: "",
      display_order: values.length,
      is_active: true,
      isNew: true,
    };
    setValues((prev) => [...prev, newValue]);
  };

  const removeValue = (id: string) => {
    const value = values.find((v) => v.id === id);
    if (value?.isNew) {
      setValues((prev) => prev.filter((v) => v.id !== id));
    } else {
      setValues((prev) =>
        prev.map((v) => (v.id === id ? { ...v, isDeleted: true } : v))
      );
    }
  };

  const updateValue = (id: string, field: keyof ValueInput, value: string) => {
    setValues((prev) =>
      prev.map((v) => (v.id === id ? { ...v, [field]: value } : v))
    );
  };

  const handleDisplayTypeChange = (type: "text" | "color" | "image") => {
    setDisplayType(type);
    // Clear other type values when switching
    setValues((prev) =>
      prev.map((v) => ({
        ...v,
        color_code: type === "color" ? v.color_code : "",
        image_url: type === "image" ? v.image_url : "",
      }))
    );
  };

  const handleImageUpload = async (valueId: string, file: File) => {
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Sadece JPEG, PNG, WebP ve GIF dosyaları yüklenebilir");
      return;
    }

    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error("Dosya boyutu en fazla 2MB olabilir");
      return;
    }

    try {
      setUploadingValueId(valueId);
      
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "variant-attributes");
      formData.append("thumbnail", "false");

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        updateValue(valueId, "image_url", data.url);
        toast.success("Görsel yüklendi");
      } else {
        toast.error(data.error || "Görsel yüklenemedi");
      }
    } catch (error) {
      toast.error("Görsel yüklenirken hata oluştu");
    } finally {
      setUploadingValueId(null);
    }
  };

  const removeImage = (valueId: string) => {
    updateValue(valueId, "image_url", "");
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = "Nitelik adı gereklidir";
    }

    const activeValues = values.filter((v) => !v.isDeleted && v.value.trim());
    if (activeValues.length === 0) {
      newErrors.values = "En az bir değer girilmelidir";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    setSaving(true);

    try {
      const newValues = values.filter((v) => v.isNew && !v.isDeleted && v.value.trim());
      for (const value of newValues) {
        await fetch("/api/admin/variant-attributes/values", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            attribute_id: attributeId,
            value: value.value,
            color_code: displayType === "color" ? value.color_code : null,
            image_url: displayType === "image" ? value.image_url : null,
          }),
        });
      }

      const deletedValues = values.filter((v) => v.isDeleted && !v.isNew);
      for (const value of deletedValues) {
        await fetch(`/api/admin/variant-attributes/values?id=${value.id}`, {
          method: "DELETE",
        });
      }

      const existingValues = values.filter((v) => !v.isNew && !v.isDeleted);
      for (const value of existingValues) {
        await fetch("/api/admin/variant-attributes/values", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: value.id,
            value: value.value,
            color_code: displayType === "color" ? value.color_code : null,
            image_url: displayType === "image" ? value.image_url : null,
          }),
        });
      }

      await fetch("/api/admin/variant-attributes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: attributeId,
          name: name.trim(),
        }),
      });

      toast.success("Nitelik başarıyla güncellendi");
      router.push("/admin/urunler/nitelikler");
    } catch (error) {
      toast.error("Güncelleme sırasında hata oluştu");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAttribute = async () => {
    if (!confirm("Bu niteliği silmek istediğinize emin misiniz?")) return;

    try {
      const response = await fetch(
        `/api/admin/variant-attributes?id=${attributeId}`,
        { method: "DELETE" }
      );
      const data = await response.json();

      if (data.success) {
        toast.success("Nitelik silindi");
        router.push("/admin/urunler/nitelikler");
      } else {
        toast.error(data.error || "Silme başarısız");
      }
    } catch (error) {
      toast.error("Silme sırasında hata oluştu");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const activeValues = values.filter((v) => !v.isDeleted);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/admin/urunler/nitelikler"
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </Link>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Nitelik Düzenle</h1>
                <p className="text-sm text-gray-500">"{attribute?.name}" niteliğini düzenliyorsunuz</p>
              </div>
            </div>
            <button
              onClick={handleDeleteAttribute}
              className="flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg font-medium transition-colors text-sm"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Sil</span>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <form onSubmit={handleSubmit} className="max-w-5xl mx-auto space-y-6">
          {/* Nitelik Bilgileri */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h2 className="font-semibold text-gray-900">Nitelik Bilgileri</h2>
            </div>
            
            <div className="p-4 sm:p-6 space-y-6">
              {/* Nitelik Adı */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nitelik Adı <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Örn: Renk, Beden, Gramaj"
                  className={cn(
                    "w-full px-4 py-3 bg-white border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all",
                    errors.name ? "border-red-300" : "border-gray-200"
                  )}
                />
                {errors.name && (
                  <p className="mt-1 text-sm text-red-500">{errors.name}</p>
                )}
              </div>

              {/* Görünüm Tipi Seçimi */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Değer Görünümü
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => handleDisplayTypeChange("text")}
                    className={cn(
                      "flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left",
                      displayType === "text"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-gray-200 hover:border-gray-300"
                    )}
                  >
                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-lg font-bold">
                      Aa
                    </div>
                    <div>
                      <p className="font-medium">Sadece Metin</p>
                      <p className="text-xs text-gray-500">Yazı olarak göster</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDisplayTypeChange("color")}
                    className={cn(
                      "flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left",
                      displayType === "color"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-gray-200 hover:border-gray-300"
                    )}
                  >
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-400 to-blue-400 flex items-center justify-center">
                      <Palette className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="font-medium">Renk Kodu</p>
                      <p className="text-xs text-gray-500">Renk seçici ile</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDisplayTypeChange("image")}
                    className={cn(
                      "flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left",
                      displayType === "image"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-gray-200 hover:border-gray-300"
                    )}
                  >
                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                      <ImageIcon className="w-5 h-5 text-gray-600" />
                    </div>
                    <div>
                      <p className="font-medium">Görsel</p>
                      <p className="text-xs text-gray-500">Resim yükle</p>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Değerler */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Değerler</h2>
              <span className="text-sm text-gray-500">{activeValues.length} değer</span>
            </div>

            <div className="p-4 sm:p-6">
              {errors.values && (
                <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {errors.values}
                </div>
              )}

              <div className="space-y-3">
                {values.map((value, index) => {
                  if (value.isDeleted) return null;

                  return (
                    <div 
                      key={value.id} 
                      className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg group hover:bg-gray-100 transition-colors"
                    >
                      <span className="text-sm text-gray-400 w-6 text-center flex-shrink-0">
                        {index + 1}
                      </span>

                      {/* Görsel */}
                      {displayType === "image" && (
                        <div className="flex-shrink-0">
                          {value.image_url ? (
                            <div className="relative">
                              <img
                                src={value.image_url}
                                alt={value.value}
                                className="w-12 h-12 rounded-lg object-cover border border-gray-200"
                              />
                              <button
                                type="button"
                                onClick={() => removeImage(value.id)}
                                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 shadow-sm"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <label className="w-12 h-12 bg-white border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors">
                              {uploadingValueId === value.id ? (
                                <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                              ) : (
                                <Upload className="w-5 h-5 text-gray-400" />
                              )}
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleImageUpload(value.id, file);
                                }}
                                disabled={uploadingValueId === value.id}
                              />
                            </label>
                          )}
                        </div>
                      )}

                      {/* Renk Kodu */}
                      {displayType === "color" && (
                        <div className="flex-shrink-0">
                          <input
                            type="color"
                            value={value.color_code || "#000000"}
                            onChange={(e) => updateValue(value.id, "color_code", e.target.value)}
                            className="w-10 h-10 rounded-lg cursor-pointer border border-gray-200 p-1 bg-white"
                          />
                        </div>
                      )}

                      {/* Metin Input */}
                      <input
                        type="text"
                        value={value.value}
                        onChange={(e) => updateValue(value.id, "value", e.target.value)}
                        placeholder={`Değer ${index + 1}`}
                        className="flex-1 min-w-0 px-3 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      />

                      {/* Sil Butonu */}
                      <button
                        type="button"
                        onClick={() => removeValue(value.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={addValue}
                className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-primary hover:text-primary transition-colors"
              >
                <Plus className="w-4 h-4" />
                Değer Ekle
              </button>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4">
            <Link
              href="/admin/urunler/nitelikler"
              className="px-6 py-2.5 text-gray-700 hover:bg-gray-100 rounded-lg font-medium transition-colors"
            >
              İptal
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              {saving ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
