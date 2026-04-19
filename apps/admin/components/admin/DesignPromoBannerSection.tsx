"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  Image as ImageIcon,
  Loader2,
  Monitor,
  Palette,
  Plus,
  Save,
  Smartphone,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

interface PromoBanner {
  id: number;
  image: string;
  mobileImage?: string;
  title: string;
  subtitle: string;
  buttonText: string;
  buttonLink: string;
  order: number;
  badge?: string;
  color?: string;
  imageStats?: ImageStats;
  mobileImageStats?: ImageStats;
}

interface ImageStats {
  format: string;
  width: number;
  height: number;
  originalSize: number;
  processedSize: number;
  savings: number;
}

const BADGE_OPTIONS = [
  { value: "", label: "Rozet Yok" },
  { value: "Cok Satan", label: "Cok Satan" },
  { value: "Yeni", label: "Yeni" },
  { value: "Organik", label: "Organik" },
  { value: "Favori", label: "Favori" },
  { value: "Indirim", label: "Indirim" },
  { value: "Kampanya", label: "Kampanya" },
  { value: "Premium", label: "Premium" },
];

const COLOR_OPTIONS = [
  { value: "from-amber-500 to-orange-600", label: "Turuncu / Amber" },
  { value: "from-emerald-500 to-teal-600", label: "Yesil / Teal" },
  { value: "from-rose-500 to-pink-600", label: "Pembe / Rose" },
  { value: "from-blue-500 to-indigo-600", label: "Mavi / Indigo" },
  { value: "from-violet-500 to-purple-600", label: "Mor / Violet" },
  { value: "from-primary to-primary/80", label: "Celebix Kirmizi" },
  { value: "from-cyan-500 to-blue-600", label: "Turkuaz / Mavi" },
  { value: "from-lime-500 to-green-600", label: "Limon Yesili" },
];

export function DesignPromoBannerSection() {
  const [banners, setBanners] = useState<PromoBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [optimizing, setOptimizing] = useState<Record<string, boolean>>({});
  const [activeImageTab, setActiveImageTab] = useState<Record<number, "desktop" | "mobile">>({});

  useEffect(() => {
    void loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);

    try {
      const res = await fetch("/api/settings?key=promo_banners", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Promosyon banner ayarlari yuklenemedi.");
      }

      setBanners(data.setting?.value?.banners ?? []);
    } catch (error) {
      console.error("Error loading settings:", error);
      toast.error("Ayarlar yuklenirken bir hata olustu.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "promo_banners",
          value: { banners },
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Promosyon banner ayarlari kaydedilemedi.");
      }

      toast.success("Promosyon banner ayarlari kaydedildi.");
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("Kaydedilirken bir hata olustu.");
    } finally {
      setSaving(false);
    }
  }

  function handleAddBanner() {
    const newBanner: PromoBanner = {
      id: Date.now(),
      image: "",
      mobileImage: "",
      title: "Yeni Baslik",
      subtitle: "Yeni Alt Baslik",
      buttonText: "Incele",
      buttonLink: "/koleksiyon",
      order: banners.length + 1,
      badge: "Yeni",
      color: "from-primary to-primary/80",
    };

    setBanners((prev) => [...prev, newBanner]);
    setActiveImageTab((prev) => ({ ...prev, [newBanner.id]: "desktop" }));
  }

  function handleRemoveBanner(id: number) {
    setBanners((prev) => prev.filter((banner) => banner.id !== id));
  }

  function handleUpdateBanner(id: number, field: keyof PromoBanner, value: string | number) {
    setBanners((prev) => prev.map((banner) => (banner.id === id ? { ...banner, [field]: value } : banner)));
  }

  async function handleFileUpload(
    e: React.ChangeEvent<HTMLInputElement>,
    bannerId: number,
    type: "desktop" | "mobile",
  ) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading((prev) => ({ ...prev, [`${bannerId}-${type}`]: true }));

    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", "promo-banners");

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Görsel yuklenemedi.");
      }

      handleUpdateBanner(bannerId, type === "desktop" ? "image" : "mobileImage", data.url);

      const stats: ImageStats = {
        format: data.format,
        width: data.width,
        height: data.height,
        originalSize: data.originalSize,
        processedSize: data.processedSize,
        savings: data.savings,
      };

      setBanners((prev) =>
        prev.map((banner) =>
          banner.id === bannerId
            ? {
                ...banner,
                ...(type === "desktop" ? { imageStats: stats } : { mobileImageStats: stats }),
              }
            : banner,
        ),
      );

      toast.success(`${type === "desktop" ? "Masaustu" : "Mobil"} gorsel yuklendi.`);
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Görsel yuklenirken hata olustu.");
    } finally {
      setUploading((prev) => ({ ...prev, [`${bannerId}-${type}`]: false }));
    }
  }

  async function handleOptimizeImage(bannerId: number, type: "desktop" | "mobile") {
    const banner = banners.find((entry) => entry.id === bannerId);
    const imageUrl = type === "desktop" ? banner?.image : banner?.mobileImage;

    if (!imageUrl) {
      toast.error("Optimize edilecek gorsel bulunamadi.");
      return;
    }

    setOptimizing((prev) => ({ ...prev, [`${bannerId}-${type}`]: true }));

    try {
      const res = await fetch("/api/upload/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl, folder: "promo-banners" }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Görsel optimize edilemedi.");
      }

      handleUpdateBanner(bannerId, type === "desktop" ? "image" : "mobileImage", data.url);

      const stats: ImageStats = {
        format: data.format,
        width: data.width,
        height: data.height,
        originalSize: data.originalSize,
        processedSize: data.processedSize,
        savings: data.savings,
      };

      setBanners((prev) =>
        prev.map((banner) =>
          banner.id === bannerId
            ? {
                ...banner,
                ...(type === "desktop" ? { imageStats: stats } : { mobileImageStats: stats }),
              }
            : banner,
        ),
      );

      toast.success("Görsel optimize edildi.");
    } catch (error) {
      console.error("Optimize error:", error);
      toast.error("Görsel optimize edilirken hata olustu.");
    } finally {
      setOptimizing((prev) => ({ ...prev, [`${bannerId}-${type}`]: false }));
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-[#efe3d7] pb-5 md:flex-row md:items-start md:justify-between">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#FE6100]">Promosyon banner</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#2f241d]">Orta alan kampanya kartlari</h2>
          <p className="mt-2 text-sm leading-6 text-[#7b685b]">
            Banner gorsellerini, rozetini, rengini ve butonunu ayni kart uzerinden yonetin.
          </p>
        </div>
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#2f241d] to-[#4a3629] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#241a15] disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Promosyon Banner Kaydet
        </button>
      </div>

      <div className="rounded-[24px] border border-[#ecdccd] bg-[#fff9f4] px-4 py-4 text-sm leading-6 text-[#7b685b]">
        Her banner bir kampanya kutusu gibi calisir. Once gorseli secin, sonra baslik, rozet ve buton ayarlarini doldurun.
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {banners.map((banner, index) => (
          <div
            key={banner.id}
            className="flex h-full flex-col overflow-hidden rounded-[28px] border border-[#eadccd] bg-white shadow-sm"
          >
            <div className="flex items-center justify-between border-b border-[#f0e4d8] bg-[#fcf7f1] px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#FE6100]/10 text-sm font-bold text-[#FE6100]">
                  {index + 1}
                </span>
                <span className="text-sm font-semibold text-[#2f241d]">Banner</span>
              </div>
              <button
                onClick={() => handleRemoveBanner(banner.id)}
                className="rounded-xl p-2 text-[#b8977f] transition-colors hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-1 flex-col space-y-5 p-5">
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-xl bg-[#f5eee7] p-1">
                  <button
                    onClick={() => setActiveImageTab((prev) => ({ ...prev, [banner.id]: "desktop" }))}
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                      (activeImageTab[banner.id] || "desktop") === "desktop"
                        ? "bg-white text-[#2f241d] shadow-sm"
                        : "text-[#7b685b] hover:text-[#2f241d]"
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Monitor className="h-4 w-4" />
                      Masaustu
                    </span>
                  </button>
                  <button
                    onClick={() => setActiveImageTab((prev) => ({ ...prev, [banner.id]: "mobile" }))}
                    className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                      activeImageTab[banner.id] === "mobile"
                        ? "bg-white text-[#2f241d] shadow-sm"
                        : "text-[#7b685b] hover:text-[#2f241d]"
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Smartphone className="h-4 w-4" />
                      Mobil
                    </span>
                  </button>
                </div>

                <div className="group/upload relative aspect-[4/5] overflow-hidden rounded-2xl border-2 border-dashed border-[#e7d6c8] bg-[#faf5ef] transition-colors hover:border-[#FE6100]/40">
                  {(activeImageTab[banner.id] === "mobile" ? banner.mobileImage : banner.image) ? (
                    <>
                      <Image
                        src={activeImageTab[banner.id] === "mobile" ? banner.mobileImage! : banner.image}
                        alt="Banner Preview"
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 33vw"
                        unoptimized
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover/upload:opacity-100">
                        <label className="cursor-pointer rounded-xl bg-white px-4 py-2 text-sm font-medium text-[#2f241d] shadow-lg hover:bg-[#f8f3ed]">
                          Degistir
                          <input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            onChange={(e) =>
                              void handleFileUpload(e, banner.id, activeImageTab[banner.id] || "desktop")
                            }
                          />
                        </label>
                      </div>
                    </>
                  ) : (
                    <label className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center">
                      {uploading[`${banner.id}-${activeImageTab[banner.id] || "desktop"}`] ? (
                        <Loader2 className="h-8 w-8 animate-spin text-[#b8977f]" />
                      ) : (
                        <>
                          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white">
                            <ImageIcon className="h-6 w-6 text-[#c8b5a7]" />
                          </div>
                          <span className="text-sm font-medium text-[#7b685b]">
                            {(activeImageTab[banner.id] || "desktop") === "mobile"
                              ? "Mobil gorsel yukle"
                              : "Masaustu gorsel yukle"}
                          </span>
                        </>
                      )}
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={(e) =>
                          void handleFileUpload(e, banner.id, activeImageTab[banner.id] || "desktop")
                        }
                      />
                    </label>
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="veya gorsel URL'si girin"
                    value={activeImageTab[banner.id] === "mobile" ? banner.mobileImage || "" : banner.image}
                    onChange={(e) =>
                      handleUpdateBanner(
                        banner.id,
                        activeImageTab[banner.id] === "mobile" ? "mobileImage" : "image",
                        e.target.value,
                      )
                    }
                    className="flex-1 rounded-xl border border-[#e7d6c8] bg-white px-3 py-2.5 text-xs focus:border-[#FE6100]/40 focus:outline-none focus:ring-2 focus:ring-[#FE6100]/10"
                  />
                  {(activeImageTab[banner.id] === "desktop" ? banner.image : banner.mobileImage) &&
                  !(activeImageTab[banner.id] === "desktop" ? banner.imageStats : banner.mobileImageStats) ? (
                    <button
                      onClick={() =>
                        void handleOptimizeImage(banner.id, activeImageTab[banner.id] || "desktop")
                      }
                      disabled={optimizing[`${banner.id}-${activeImageTab[banner.id] || "desktop"}`]}
                      className="inline-flex items-center gap-1 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 px-3 py-2 text-xs font-medium text-white transition-all hover:from-violet-600 hover:to-purple-700 disabled:opacity-50"
                      title="Görseli optimize et"
                    >
                      {optimizing[`${banner.id}-${activeImageTab[banner.id] || "desktop"}`] ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Zap className="h-3.5 w-3.5" />
                      )}
                      Optimize
                    </button>
                  ) : null}
                </div>

                {(activeImageTab[banner.id] === "desktop" ? banner.imageStats : banner.mobileImageStats) ? (
                  <div className="flex items-center justify-between rounded-xl border border-green-200 bg-green-50 p-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-100">
                        <Sparkles className="h-4 w-4 text-green-600" />
                      </div>
                      <div>
                        <div className="text-xs font-medium text-green-800">
                          {(activeImageTab[banner.id] === "desktop" ? banner.imageStats : banner.mobileImageStats)?.format.toUpperCase()}
                        </div>
                        <div className="text-xs text-green-600">
                          {(activeImageTab[banner.id] === "desktop"
                            ? banner.imageStats
                            : banner.mobileImageStats)?.savings ?? 0}
                          % tasarruf
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setBanners((prev) =>
                          prev.map((entry) =>
                            entry.id === banner.id
                              ? {
                                  ...entry,
                                  ...(activeImageTab[banner.id] === "desktop"
                                    ? { imageStats: undefined }
                                    : { mobileImageStats: undefined }),
                                }
                              : entry,
                          ),
                        );
                      }}
                      className="rounded-lg p-1 text-green-600 hover:bg-green-100 hover:text-green-800"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-[#2f241d]">
                    <Sparkles className="h-3.5 w-3.5" />
                    Rozet
                  </label>
                  <select
                    value={banner.badge || ""}
                    onChange={(e) => handleUpdateBanner(banner.id, "badge", e.target.value)}
                    className="w-full rounded-xl border border-[#e7d6c8] bg-white px-3 py-2.5 text-sm focus:border-[#FE6100]/40 focus:outline-none focus:ring-2 focus:ring-[#FE6100]/10"
                  >
                    {BADGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-[#2f241d]">
                    <Palette className="h-3.5 w-3.5" />
                    Renk
                  </label>
                  <select
                    value={banner.color || "from-primary to-primary/80"}
                    onChange={(e) => handleUpdateBanner(banner.id, "color", e.target.value)}
                    className="w-full rounded-xl border border-[#e7d6c8] bg-white px-3 py-2.5 text-sm focus:border-[#FE6100]/40 focus:outline-none focus:ring-2 focus:ring-[#FE6100]/10"
                  >
                    {COLOR_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex-1 space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[#2f241d]">Baslik</label>
                  <input
                    type="text"
                    value={banner.title}
                    onChange={(e) => handleUpdateBanner(banner.id, "title", e.target.value)}
                    className="w-full rounded-xl border border-[#e7d6c8] bg-white px-3 py-2.5 text-sm focus:border-[#FE6100]/40 focus:outline-none focus:ring-2 focus:ring-[#FE6100]/10"
                    placeholder="Orn: Dogal fistik ezmesi"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[#2f241d]">Aciklama</label>
                  <input
                    type="text"
                    value={banner.subtitle}
                    onChange={(e) => handleUpdateBanner(banner.id, "subtitle", e.target.value)}
                    className="w-full rounded-xl border border-[#e7d6c8] bg-white px-3 py-2.5 text-sm focus:border-[#FE6100]/40 focus:outline-none focus:ring-2 focus:ring-[#FE6100]/10"
                    placeholder="Orn: Her gun taze"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[#2f241d]">Buton metni</label>
                    <input
                      type="text"
                      value={banner.buttonText}
                      onChange={(e) => handleUpdateBanner(banner.id, "buttonText", e.target.value)}
                      className="w-full rounded-xl border border-[#e7d6c8] bg-white px-3 py-2.5 text-sm focus:border-[#FE6100]/40 focus:outline-none focus:ring-2 focus:ring-[#FE6100]/10"
                      placeholder="Incele"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[#2f241d]">Link</label>
                    <input
                      type="text"
                      value={banner.buttonLink}
                      onChange={(e) => handleUpdateBanner(banner.id, "buttonLink", e.target.value)}
                      className="w-full rounded-xl border border-[#e7d6c8] bg-white px-3 py-2.5 text-sm focus:border-[#FE6100]/40 focus:outline-none focus:ring-2 focus:ring-[#FE6100]/10"
                      placeholder="/kategori-slug"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#2f241d]">Siralama</label>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, banners.length)}
                  value={banner.order}
                  onChange={(e) => handleUpdateBanner(banner.id, "order", parseInt(e.target.value, 10) || 1)}
                  className="w-20 rounded-xl border border-[#e7d6c8] bg-white px-3 py-2.5 text-center text-sm focus:border-[#FE6100]/40 focus:outline-none focus:ring-2 focus:ring-[#FE6100]/10"
                />
              </div>
            </div>
          </div>
        ))}

        {banners.length < 6 ? (
          <button
            onClick={handleAddBanner}
            className="flex min-h-[420px] flex-col items-center justify-center gap-3 rounded-[28px] border-2 border-dashed border-[#e7d6c8] font-medium text-[#7b685b] transition-all hover:border-[#FE6100]/40 hover:bg-[#fff7f0] hover:text-[#C54E00]"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f7efe8]">
              <Plus className="h-8 w-8" />
            </div>
            <span>Yeni Banner Ekle</span>
            <span className="text-xs text-[#9d816d]">Maksimum 6 banner</span>
          </button>
        ) : null}
      </div>

      {banners.length > 0 ? (
        <div className="flex items-start gap-3 rounded-[24px] border border-blue-100 bg-blue-50 p-4">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-100">
            <Smartphone className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <h4 className="text-sm font-medium text-blue-900">Mobil gorsel onerisi</h4>
            <p className="mt-1 text-xs text-blue-700">
              Mobil cihazlarda daha temiz bir gorunum icin ayri mobil gorsel kullanin. Mobil gorsel yoksa masaustu gorseli kullanilir.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
