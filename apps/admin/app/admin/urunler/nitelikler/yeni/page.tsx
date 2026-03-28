"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  Plus,
  X,
  Loader2,
  AlertCircle,
  Check,
  Palette,
  ImageIcon,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ValueInput {
  id: string;
  value: string;
  colorCode: string;
  imageUrl: string;
}

export default function NewVariantAttributePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [values, setValues] = useState<ValueInput[]>([
    { id: "1", value: "", colorCode: "", imageUrl: "" },
  ]);
  const [displayType, setDisplayType] = useState<"text" | "color" | "image">("text");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploadingValueId, setUploadingValueId] = useState<string | null>(null);

  const addValue = () => {
    setValues((prev) => [
      ...prev,
      { id: Date.now().toString(), value: "", colorCode: "", imageUrl: "" },
    ]);
  };

  const removeValue = (id: string) => {
    if (values.length <= 1) {
      toast.error("En az bir değer olmalıdır");
      return;
    }
    setValues((prev) => prev.filter((v) => v.id !== id));
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
        colorCode: type === "color" ? v.colorCode : "",
        imageUrl: type === "image" ? v.imageUrl : "",
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
        updateValue(valueId, "imageUrl", data.url);
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
    updateValue(valueId, "imageUrl", "");
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = "Nitelik adı gereklidir";
    }

    const validValues = values.filter((v) => v.value.trim());
    if (validValues.length === 0) {
      newErrors.values = "En az bir değer girilmelidir";
    }

    // Aynı değer kontrolü
    const valueSet = new Set<string>();
    let hasDuplicate = false;
    for (const v of values) {
      if (v.value.trim()) {
        if (valueSet.has(v.value.trim().toLowerCase())) {
          hasDuplicate = true;
          break;
        }
        valueSet.add(v.value.trim().toLowerCase());
      }
    }
    if (hasDuplicate) {
      newErrors.values = "Aynı değer birden fazla kez eklenemez";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    setLoading(true);

    try {
      const validValues = values
        .filter((v) => v.value.trim())
        .map((v) => v.value.trim());

      const colorCodes: Record<string, string> = {};
      if (displayType === "color") {
        values.forEach((v) => {
          if (v.value.trim() && v.colorCode) {
            colorCodes[v.value.trim()] = v.colorCode;
          }
        });
      }

      const imageUrls: Record<string, string> = {};
      if (displayType === "image") {
        values.forEach((v) => {
          if (v.value.trim() && v.imageUrl) {
            imageUrls[v.value.trim()] = v.imageUrl;
          }
        });
      }

      const response = await fetch("/api/admin/variant-attributes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          values: validValues,
          colorCodes,
          imageUrls,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success("Nitelik başarıyla oluşturuldu");
        router.push("/admin/urunler/nitelikler");
      } else {
        toast.error(data.error || "Nitelik oluşturulamadı");
      }
    } catch (error) {
      toast.error("Bir hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/admin/urunler/nitelikler"
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Yeni Nitelik</h1>
              <p className="text-sm text-gray-500">Ürün varyantları için yeni bir nitelik grubu oluşturun</p>
            </div>
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
              <span className="text-sm text-gray-500">{values.filter((v) => v.value.trim()).length} değer</span>
            </div>

            <div className="p-4 sm:p-6">
              {errors.values && (
                <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {errors.values}
                </div>
              )}

              <div className="space-y-3">
                {values.map((value, index) => (
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
                        {value.imageUrl ? (
                          <div className="relative">
                            <img
                              src={value.imageUrl}
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
                          value={value.colorCode || "#000000"}
                          onChange={(e) => updateValue(value.id, "colorCode", e.target.value)}
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
                ))}
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
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              {loading ? "Kaydediliyor..." : "Kaydet"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
