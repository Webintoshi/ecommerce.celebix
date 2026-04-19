"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  GripVertical,
  Image as ImageIcon,
  Loader2,
  Plus,
  Save,
  Smartphone,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

interface HeroOverlay {
  title: string;
  subtitle: string;
  ctaText: string;
  ctaLink: string;
  position: "left" | "center" | "right";
}

interface HeroVideo {
  desktop: string;
  mobile: string;
  poster: string;
}

interface HeroSlide {
  id: number;
  desktop: string;
  mobile: string;
  tablet?: string;
  alt: string;
  link?: string;
  transition?: "fade" | "slide" | "zoom" | "blur";
  overlay?: HeroOverlay;
  video?: HeroVideo;
}

interface HeroSettings {
  slides: HeroSlide[];
}

const DEFAULT_OVERLAY: HeroOverlay = {
  title: "",
  subtitle: "",
  ctaText: "",
  ctaLink: "",
  position: "left",
};

function createEmptySlide(): HeroSlide {
  return {
    id: Date.now(),
    desktop: "",
    mobile: "",
    alt: "",
    link: "",
    transition: "fade",
    overlay: { ...DEFAULT_OVERLAY },
  };
}

function normalizeSettings(payload: unknown): HeroSlide[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const slides = (payload as HeroSettings).slides;
  return Array.isArray(slides) ? slides : [];
}

export function DesignHeroBannerSection() {
  const [slides, setSlides] = useState<HeroSlide[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);

    try {
      const res = await fetch("/api/settings?key=hero_banners", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Hero banner ayarlari yuklenemedi");
      }

      setSlides(normalizeSettings(data.setting?.value));
    } catch (error) {
      console.error("Error loading hero banner settings:", error);
      toast.error(error instanceof Error ? error.message : "Ayarlar yuklenirken bir hata olustu.");
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
          key: "hero_banners",
          value: { slides },
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Hero banner ayarlari kaydedilemedi");
      }

      toast.success("Hero banner ayarlari kaydedildi.");
    } catch (error) {
      console.error("Error saving hero banner settings:", error);
      toast.error(error instanceof Error ? error.message : "Kaydedilirken bir hata olustu.");
    } finally {
      setSaving(false);
    }
  }

  function handleAddSlide() {
    setSlides((prev) => [...prev, createEmptySlide()]);
  }

  function handleRemoveSlide(id: number) {
    setSlides((prev) => prev.filter((slide) => slide.id !== id));
  }

  function handleUpdateSlide<K extends keyof HeroSlide>(id: number, field: K, value: HeroSlide[K]) {
    setSlides((prev) =>
      prev.map((slide) => (slide.id === id ? { ...slide, [field]: value } : slide)),
    );
  }

  function handleUpdateOverlay(
    id: number,
    field: keyof HeroOverlay,
    value: HeroOverlay[keyof HeroOverlay],
  ) {
    setSlides((prev) =>
      prev.map((slide) => {
        if (slide.id !== id) return slide;
        return {
          ...slide,
          overlay: {
            ...(slide.overlay ?? DEFAULT_OVERLAY),
            [field]: value,
          },
        };
      }),
    );
  }

  async function handleFileUpload(
    e: React.ChangeEvent<HTMLInputElement>,
    slideId: number,
    type: "desktop" | "mobile",
  ) {
    const file = e.target.files?.[0];
    if (!file) return;

    const uploadKey = `${slideId}-${type}`;
    setUploading((prev) => ({ ...prev, [uploadKey]: true }));

    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", "hero-banners");

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok || !data.success || !data.url) {
        throw new Error(data.error || "Görsel yuklenemedi");
      }

      handleUpdateSlide(slideId, type, String(data.url));
      toast.success("Görsel yuklendi.");
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(error instanceof Error ? error.message : "Görsel yuklenirken hata olustu.");
    } finally {
      setUploading((prev) => ({ ...prev, [uploadKey]: false }));
      e.target.value = "";
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#FE6100]">Hero banner</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#2f241d]">Ana sayfa ust manseti</h2>
          <p className="mt-2 text-sm leading-6 text-[#7b685b]">
            Masaustu ve mobil gorselleri, baslik metnini ve buton yonlendirmesini ayni yerde duzenleyin.
          </p>
        </div>
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#2f241d] to-[#4a3629] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#241a15] disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Hero Banner Kaydet
        </button>
      </div>

      <div className="rounded-[24px] border border-[#ecdccd] bg-[#fff9f4] px-4 py-4 text-sm leading-6 text-[#7b685b]">
        Baslangic icin once gorseli secin, sonra isterseniz baslik ve buton metni ekleyin. Her slayt ayri kampanya gibi calisir.
      </div>

      <div className="space-y-6">
        {slides.map((slide, index) => (
          <div
            key={slide.id}
            className="overflow-hidden rounded-[28px] border border-[#eadccd] bg-white shadow-sm"
          >
            <div className="flex items-center justify-between border-b border-[#f0e4d8] bg-[#fcf7f1] px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="cursor-grab text-[#b8977f] hover:text-[#7b685b]">
                  <GripVertical className="h-5 w-5" />
                </div>
                <span className="text-sm font-semibold text-[#2f241d]">Slayt {index + 1}</span>
              </div>
              <button
                onClick={() => handleRemoveSlide(slide.id)}
                className="rounded-xl p-2 text-[#b8977f] transition-colors hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-8 p-6 lg:grid-cols-2">
              <div className="space-y-3">
                <label className="block text-sm font-medium text-[#2f241d]">
                  Masaustu gorseli
                </label>
                <div className="group/upload relative aspect-[16/9] overflow-hidden rounded-2xl border-2 border-dashed border-[#e7d6c8] bg-[#faf5ef] transition-colors hover:border-[#FE6100]/40">
                  {slide.desktop ? (
                    <>
                      <Image
                        src={slide.desktop}
                        alt="Desktop Preview"
                        fill
                        className="object-cover"
                        unoptimized
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover/upload:opacity-100">
                        <label className="cursor-pointer rounded-xl bg-white px-4 py-2 text-sm font-medium text-[#2f241d] transition-colors hover:bg-[#f8f3ed]">
                          Degistir
                          <input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            onChange={(e) => void handleFileUpload(e, slide.id, "desktop")}
                          />
                        </label>
                      </div>
                    </>
                  ) : (
                    <label className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center">
                      {uploading[`${slide.id}-desktop`] ? (
                        <Loader2 className="h-8 w-8 animate-spin text-[#b8977f]" />
                      ) : (
                        <>
                          <ImageIcon className="mb-2 h-8 w-8 text-[#c8b5a7]" />
                          <span className="text-sm text-[#7b685b]">Görsel Yukle</span>
                        </>
                      )}
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={(e) => void handleFileUpload(e, slide.id, "desktop")}
                      />
                    </label>
                  )}
                </div>
                <UrlInput
                  placeholder="veya gorsel URL'si yapistir"
                  onAdd={(value) => handleUpdateSlide(slide.id, "desktop", value)}
                />
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-medium text-[#2f241d]">
                  Mobil gorseli
                </label>
                <div className="group/upload relative aspect-[4/5] max-w-[240px] overflow-hidden rounded-2xl border-2 border-dashed border-[#e7d6c8] bg-[#faf5ef] transition-colors hover:border-[#FE6100]/40 md:max-w-full md:aspect-video">
                  {slide.mobile ? (
                    <>
                      <Image
                        src={slide.mobile}
                        alt="Mobile Preview"
                        fill
                        className="object-cover"
                        unoptimized
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover/upload:opacity-100">
                        <label className="cursor-pointer rounded-xl bg-white px-4 py-2 text-sm font-medium text-[#2f241d] transition-colors hover:bg-[#f8f3ed]">
                          Degistir
                          <input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            onChange={(e) => void handleFileUpload(e, slide.id, "mobile")}
                          />
                        </label>
                      </div>
                    </>
                  ) : (
                    <label className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center">
                      {uploading[`${slide.id}-mobile`] ? (
                        <Loader2 className="h-8 w-8 animate-spin text-[#b8977f]" />
                      ) : (
                        <>
                          <Smartphone className="mb-2 h-8 w-8 text-[#c8b5a7]" />
                          <span className="text-sm text-[#7b685b]">Mobil gorsel yukle</span>
                        </>
                      )}
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={(e) => void handleFileUpload(e, slide.id, "mobile")}
                      />
                    </label>
                  )}
                </div>
                <UrlInput
                  placeholder="veya mobil gorsel URL'si yapistir"
                  onAdd={(value) => handleUpdateSlide(slide.id, "mobile", value)}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 lg:col-span-2 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#2f241d]">
                    Görsel aciklamasi
                  </label>
                  <input
                    type="text"
                    value={slide.alt}
                    onChange={(e) => handleUpdateSlide(slide.id, "alt", e.target.value)}
                    placeholder="Orn: Ana sayfa kampanya gorseli"
                    className="w-full rounded-xl border border-[#e7d6c8] bg-white px-3 py-2.5 focus:border-[#FE6100]/40 focus:outline-none focus:ring-2 focus:ring-[#FE6100]/10"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#2f241d]">
                    Tiklaninca gidecek sayfa
                  </label>
                  <input
                    type="text"
                    value={slide.link || ""}
                    onChange={(e) => handleUpdateSlide(slide.id, "link", e.target.value)}
                    placeholder="/urunler/fistik-ezmesi"
                    className="w-full rounded-xl border border-[#e7d6c8] bg-white px-3 py-2.5 focus:border-[#FE6100]/40 focus:outline-none focus:ring-2 focus:ring-[#FE6100]/10"
                  />
                </div>
              </div>

              <div className="lg:col-span-2">
                <label className="mb-2 block text-sm font-medium text-[#2f241d]">
                  Gecis efekti
                </label>
                <div className="flex flex-wrap gap-2">
                  {(["fade", "slide", "zoom", "blur"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleUpdateSlide(slide.id, "transition", type)}
                      className={`rounded-xl px-4 py-2 text-sm font-medium capitalize transition-all ${
                        slide.transition === type
                          ? "bg-[#2f241d] text-white"
                          : "bg-[#f7efe8] text-[#7b685b] hover:bg-[#efe2d6]"
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl bg-[#faf5ef] p-5 lg:col-span-2">
                <h4 className="mb-3 text-sm font-semibold text-[#2f241d]">
                  Gorselin ustundeki yazilar
                </h4>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[#2f241d]">
                      Baslik
                    </label>
                    <input
                      type="text"
                      value={slide.overlay?.title || ""}
                      onChange={(e) => handleUpdateOverlay(slide.id, "title", e.target.value)}
                      placeholder="Dogal lezzetin yeni yuzü"
                      className="w-full rounded-xl border border-[#e7d6c8] bg-white px-3 py-2.5 focus:border-[#FE6100]/40 focus:outline-none focus:ring-2 focus:ring-[#FE6100]/10"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[#2f241d]">
                      Aciklama
                    </label>
                    <input
                      type="text"
                      value={slide.overlay?.subtitle || ""}
                      onChange={(e) => handleUpdateOverlay(slide.id, "subtitle", e.target.value)}
                      placeholder="Katkisiz, taze ve guvenilir"
                      className="w-full rounded-xl border border-[#e7d6c8] bg-white px-3 py-2.5 focus:border-[#FE6100]/40 focus:outline-none focus:ring-2 focus:ring-[#FE6100]/10"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[#2f241d]">
                      Buton metni
                    </label>
                    <input
                      type="text"
                      value={slide.overlay?.ctaText || ""}
                      onChange={(e) => handleUpdateOverlay(slide.id, "ctaText", e.target.value)}
                      placeholder="Kesfet"
                      className="w-full rounded-xl border border-[#e7d6c8] bg-white px-3 py-2.5 focus:border-[#FE6100]/40 focus:outline-none focus:ring-2 focus:ring-[#FE6100]/10"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[#2f241d]">
                      Buton linki
                    </label>
                    <input
                      type="text"
                      value={slide.overlay?.ctaLink || ""}
                      onChange={(e) => handleUpdateOverlay(slide.id, "ctaLink", e.target.value)}
                      placeholder="/urunler"
                      className="w-full rounded-xl border border-[#e7d6c8] bg-white px-3 py-2.5 focus:border-[#FE6100]/40 focus:outline-none focus:ring-2 focus:ring-[#FE6100]/10"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-[#2f241d]">
                      Yazinin duracagi taraf
                    </label>
                    <div className="flex gap-2">
                      {(["left", "center", "right"] as const).map((pos) => (
                        <button
                          key={pos}
                          type="button"
                          onClick={() => handleUpdateOverlay(slide.id, "position", pos)}
                          className={`rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                            slide.overlay?.position === pos
                              ? "bg-[#FE6100] text-white"
                              : "border border-[#e7d6c8] bg-white text-[#7b685b] hover:bg-[#f8f3ed]"
                          }`}
                        >
                          {pos === "left" ? "Sol" : pos === "center" ? "Orta" : "Sag"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

        <button
          onClick={handleAddSlide}
          className="flex w-full items-center justify-center gap-2 rounded-[24px] border-2 border-dashed border-[#e7d6c8] py-4 font-medium text-[#7b685b] transition-all hover:border-[#FE6100]/40 hover:bg-[#fff7f0] hover:text-[#C54E00]"
        >
          <Plus className="h-5 w-5" />
          Yeni Slayt Ekle
        </button>
      </div>
    </div>
  );
}

function UrlInput({ placeholder, onAdd }: { placeholder: string; onAdd: (value: string) => void }) {
  const [value, setValue] = useState("");

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        className="flex-1 rounded-xl border border-[#e7d6c8] bg-white px-3 py-2.5 text-sm focus:border-[#FE6100]/40 focus:outline-none focus:ring-2 focus:ring-[#FE6100]/10"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) {
            onAdd(value.trim());
            setValue("");
          }
        }}
      />
      <button
        type="button"
        className="rounded-xl bg-[#f7efe8] px-4 py-2.5 text-sm font-medium text-[#7b685b] hover:bg-[#efe2d6]"
        onClick={() => {
          if (!value.trim()) return;
          onAdd(value.trim());
          setValue("");
        }}
      >
        Ekle
      </button>
    </div>
  );
}
