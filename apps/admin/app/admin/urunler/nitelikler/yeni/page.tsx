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
import {
  isSupportedImageMimeType,
  SUPPORTED_IMAGE_ACCEPT,
  SUPPORTED_IMAGE_FORMATS_WITH_GIF_LABEL,
} from "@celebix/platform-config/src/image-formats";

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

    if (!isSupportedImageMimeType(file.type, file.name)) {
      toast.error(`Sadece ${SUPPORTED_IMAGE_FORMATS_WITH_GIF_LABEL} dosyaları yüklenebilir`);
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

  const inputBaseClassName =
    "w-full rounded-2xl border bg-white/90 px-4 py-3 text-sm text-stone-900 shadow-[0_10px_25px_rgba(120,78,44,0.08)] outline-none transition-all placeholder:text-stone-400 focus:border-[#FE6100]/40 focus:ring-4 focus:ring-[#FE6100]/15";

  const selectedCardClassName =
    "border-[#FE6100]/30 bg-gradient-to-br from-[#fff3e8] to-white text-[#8b4b20] shadow-[0_18px_35px_rgba(254,97,0,0.12)]";

  const idleCardClassName =
    "border-[#eadccd] bg-white/85 text-stone-700 hover:border-[#FE6100]/20 hover:bg-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/15";

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#faf8f5] via-[#f5efe8] to-[#efe5dc]">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-20 right-[-8rem] h-[22rem] w-[22rem] rounded-full bg-[#FE6100]/10 blur-3xl" />
        <div className="absolute left-[-6rem] top-[30%] h-[18rem] w-[18rem] rounded-full bg-amber-200/30 blur-3xl" />
        <div className="absolute bottom-[-6rem] right-[18%] h-[18rem] w-[18rem] rounded-full bg-orange-100/40 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-[1600px] px-4 py-6 md:px-6 md:py-8 lg:px-8">
        <form onSubmit={handleSubmit} className="mx-auto max-w-5xl space-y-6">
          <section className="overflow-hidden rounded-[30px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfa] to-[#faf4ed] shadow-[0_24px_80px_rgba(254,97,0,0.12)]">
            <div className="border-b border-[#FE6100]/8 px-5 py-5 md:px-8 md:py-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3 md:gap-4">
                  <Link
                    href="/admin/urunler/nitelikler"
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-stone-200 bg-white text-stone-500 shadow-sm transition-all hover:border-[#FE6100]/20 hover:bg-[#fff7f1] hover:text-[#C94E00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Link>
                  <div className="space-y-3">
                    <div className="inline-flex w-fit items-center rounded-full border border-[#FE6100]/20 bg-gradient-to-r from-[#FE6100]/10 to-[#FF8B3D]/5 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#FE6100]">
                      Yeni nitelik
                    </div>
                    <h1 className="sr-only">Yeni Nitelik</h1>
                    <p className="max-w-2xl text-sm leading-6 text-[#786658]">
                      Varyantlarda kullanilacak nitelik grubunu, gorunum tipini ve degerlerini tek akista hazirlayin.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#7d6a5d]">
                  <span className="rounded-full border border-[#ebdccc] bg-white px-3 py-1.5 shadow-sm">
                    Görünüm: {displayType === "text" ? "Metin" : displayType === "color" ? "Renk" : "Görsel"}
                  </span>
                  <span className="rounded-full border border-[#ebdccc] bg-white px-3 py-1.5 shadow-sm">
                    Dolu deger: {values.filter((v) => v.value.trim()).length}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className="space-y-6">
              <section className="rounded-[30px] border border-[#ecdccd] bg-gradient-to-br from-white/95 via-[#fffdfa] to-[#f6eee6] p-5 shadow-[0_24px_55px_rgba(98,64,33,0.09)] md:p-6">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#FE6100]">Temel ayarlar</p>
                    <h2 className="mt-1 text-xl font-semibold text-[#2f241d]">Nitelik bilgileri</h2>
                  </div>
                </div>

                <div className="space-y-6">
              {/* Nitelik Adı */}
              <div>
                <label className="mb-2 block text-sm font-medium text-[#5f4636]">
                  Nitelik Adı <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Örn: Renk, Beden, Gramaj"
                  className={cn(
                    inputBaseClassName,
                    errors.name ? "border-red-300 focus:border-red-400 focus:ring-red-100" : "border-[#e7d8ca]"
                  )}
                />
                {errors.name && (
                  <p className="mt-1 text-sm text-red-500">{errors.name}</p>
                )}
              </div>

              {/* Görünüm Tipi Seçimi */}
              <div>
                <label className="mb-3 block text-sm font-medium text-[#5f4636]">
                  Değer Görünümü
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => handleDisplayTypeChange("text")}
                    className={cn(
                      "flex items-center gap-3 rounded-[24px] border p-4 text-left transition-all",
                      displayType === "text" ? selectedCardClassName : idleCardClassName
                    )}
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f7ede4] text-lg font-bold text-[#8b5e3c]">
                      Aa
                    </div>
                    <div>
                      <p className="font-medium">Sadece Metin</p>
                      <p className="text-xs text-stone-500">Yazi olarak goster</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDisplayTypeChange("color")}
                    className={cn(
                      "flex items-center gap-3 rounded-[24px] border p-4 text-left transition-all",
                      displayType === "color" ? selectedCardClassName : idleCardClassName
                    )}
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-400 to-amber-500 shadow-sm">
                      <Palette className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="font-medium">Renk Kodu</p>
                      <p className="text-xs text-stone-500">Renk secici ile</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDisplayTypeChange("image")}
                    className={cn(
                      "flex items-center gap-3 rounded-[24px] border p-4 text-left transition-all",
                      displayType === "image" ? selectedCardClassName : idleCardClassName
                    )}
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f7ede4]">
                      <ImageIcon className="w-5 h-5 text-[#8b5e3c]" />
                    </div>
                    <div>
                      <p className="font-medium">Görsel</p>
                      <p className="text-xs text-stone-500">Resim yukle</p>
                    </div>
                  </button>
                </div>
              </div>
                </div>
              </section>
            </div>

            <section className="rounded-[30px] border border-[#ecdccd] bg-gradient-to-br from-white/95 via-[#fffdfa] to-[#f6eee6] p-5 shadow-[0_24px_55px_rgba(98,64,33,0.09)] md:p-6">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#FE6100]">Liste</p>
                  <h2 className="mt-1 text-xl font-semibold text-[#2f241d]">Degerler</h2>
                </div>
                <span className="w-fit rounded-full border border-[#ebdccc] bg-white px-3 py-1.5 text-xs font-medium text-[#7d6a5d] shadow-sm">
                  {values.filter((v) => v.value.trim()).length} dolu alan
                </span>
              </div>

              <div className="rounded-[26px] border border-[#efdfd1] bg-gradient-to-r from-[#fffaf6] to-white p-3 shadow-inner sm:p-4">
              {errors.values && (
                <div className="mb-4 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {errors.values}
                </div>
              )}

              <div className="space-y-3">
                {values.map((value, index) => (
                  <div 
                    key={value.id} 
                    className="group flex flex-col gap-3 rounded-[24px] border border-[#ecdccd] bg-white/90 p-3 shadow-sm transition-all hover:border-[#FE6100]/18 hover:bg-white sm:flex-row sm:items-center"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#f8eee5] text-sm font-semibold text-[#8d796a]">
                      {index + 1}
                    </span>

                    {/* Görsel */}
                    {displayType === "image" && (
                      <div className="shrink-0">
                        {value.imageUrl ? (
                          <div className="relative">
                            <img
                              src={value.imageUrl}
                              alt={value.value}
                              className="h-14 w-14 rounded-2xl border border-[#eadccd] object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => removeImage(value.id)}
                              className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow-sm transition hover:bg-red-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-100"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <label className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-[#d9b99f] bg-[#fffaf6] transition-colors hover:border-[#FE6100]/40 hover:bg-[#fff3ea] focus-within:ring-4 focus-within:ring-[#FE6100]/15">
                            {uploadingValueId === value.id ? (
                              <Loader2 className="h-5 w-5 animate-spin text-stone-400" />
                            ) : (
                              <Upload className="h-5 w-5 text-stone-400" />
                            )}
                            <input
                              type="file"
                              accept={SUPPORTED_IMAGE_ACCEPT}
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
                      <div className="shrink-0">
                        <input
                          type="color"
                          value={value.colorCode || "#000000"}
                          onChange={(e) => updateValue(value.id, "colorCode", e.target.value)}
                          className="h-11 w-11 cursor-pointer rounded-2xl border border-[#e7d8ca] bg-white p-1 shadow-sm outline-none transition focus-visible:ring-4 focus-visible:ring-[#FE6100]/15"
                        />
                      </div>
                    )}

                    {/* Metin Input */}
                    <input
                      type="text"
                      value={value.value}
                      onChange={(e) => updateValue(value.id, "value", e.target.value)}
                      placeholder={`Değer ${index + 1}`}
                      className={cn(inputBaseClassName, "min-w-0 flex-1")}
                    />

                    {/* Sil Butonu */}
                    <button
                      type="button"
                      onClick={() => removeValue(value.id)}
                      className="inline-flex h-11 w-11 items-center justify-center self-end rounded-2xl text-stone-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-100 sm:self-auto sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addValue}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-[24px] border-2 border-dashed border-[#d9b99f] bg-white/70 px-4 py-3 text-sm font-semibold text-[#8b6d58] transition hover:border-[#FE6100]/35 hover:bg-[#fff7f1] hover:text-[#C94E00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/15"
              >
                <Plus className="w-4 h-4" />
                Değer Ekle
              </button>
              </div>
            </section>
          </div>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
            <Link
              href="/admin/urunler/nitelikler"
              className="inline-flex items-center justify-center rounded-2xl border border-[#FE6100]/15 bg-white px-6 py-3 text-sm font-semibold text-[#8a4b22] shadow-sm transition hover:border-[#FE6100]/30 hover:bg-[#fff7f1] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20"
            >
              İptal
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#FE6100] to-[#E45700] px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_rgba(254,97,0,0.24)] transition hover:translate-y-[-1px] hover:from-[#f05c00] hover:to-[#d84f00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/20 disabled:pointer-events-none disabled:opacity-60"
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
    </main>
  );
}
