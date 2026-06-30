"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  GripVertical,
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
  { value: "from-orange-500 to-orange-600", label: "Mor / Violet" },
  { value: "from-primary to-primary/80", label: "Celebix Kirmizi" },
  { value: "from-cyan-500 to-blue-600", label: "Turkuaz / Mavi" },
  { value: "from-lime-500 to-green-600", label: "Limon Yesili" },
];

function normalizeBannerOrder(banners: PromoBanner[]) {
  return [...banners]
    .sort((left, right) => {
      const leftOrder = typeof left.order === "number" ? left.order : Number.MAX_SAFE_INTEGER;
      const rightOrder = typeof right.order === "number" ? right.order : Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    })
    .map((banner, index) => ({
      ...banner,
      order: index + 1,
    }));
}

function normalizeLoadedBanners(payload: unknown): PromoBanner[] {
  const rawBanners = Array.isArray((payload as { banners?: unknown[] } | null)?.banners)
    ? ((payload as { banners: unknown[] }).banners as PromoBanner[])
    : [];

  return normalizeBannerOrder(
    rawBanners.map((banner, index) => ({
      ...banner,
      id: typeof banner.id === "number" ? banner.id : Date.now() + index,
      image: banner.image || "",
      mobileImage: banner.mobileImage || "",
      title: banner.title || `Banner ${index + 1}`,
      subtitle: banner.subtitle || "",
      buttonText: banner.buttonText || "Incele",
      buttonLink: banner.buttonLink || "/koleksiyon",
      order: typeof banner.order === "number" ? banner.order : index + 1,
      badge: banner.badge || "",
      color: banner.color || "from-primary to-primary/80",
      imageStats: banner.imageStats,
      mobileImageStats: banner.mobileImageStats,
    })),
  );
}

function summarizeBanner(banner: PromoBanner) {
  return {
    title: banner.title.trim() || "Baslik yok",
    badges: [
      banner.image ? "Masaustu hazir" : "Masaustu eksik",
      banner.mobileImage ? "Mobil hazir" : "Mobil otomatik",
      banner.badge ? `Rozet: ${banner.badge}` : "Rozet yok",
    ],
  };
}

type SortablePromoBannerCardProps = {
  banner: PromoBanner;
  index: number;
  isExpanded: boolean;
  activeImageTab: "desktop" | "mobile";
  isUploading: boolean;
  isOptimizing: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onTabChange: (tab: "desktop" | "mobile") => void;
  onUpdateBanner: (field: keyof PromoBanner, value: string | number | ImageStats | undefined) => void;
  onUpload: (event: React.ChangeEvent<HTMLInputElement>, type: "desktop" | "mobile") => void;
  onOptimize: (type: "desktop" | "mobile") => void;
  onClearOptimizedStats: (type: "desktop" | "mobile") => void;
};

function SortablePromoBannerCard({
  banner,
  index,
  isExpanded,
  activeImageTab,
  isUploading,
  isOptimizing,
  onToggle,
  onRemove,
  onTabChange,
  onUpdateBanner,
  onUpload,
  onOptimize,
  onClearOptimizedStats,
}: SortablePromoBannerCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: banner.id,
  });
  const summary = summarizeBanner(banner);
  const currentImage = activeImageTab === "mobile" ? banner.mobileImage : banner.image;
  const currentStats = activeImageTab === "mobile" ? banner.mobileImageStats : banner.imageStats;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`overflow-hidden rounded-[12px] border border-[var(--admin-border)] bg-white shadow-sm ${
        isDragging ? "shadow-[0_24px_48px_rgba(73,44,23,0.18)]" : ""
      }`}
    >
      <div className="flex items-center gap-3 border-b border-[#f0e4d8] bg-[#F9FAFB] px-4 py-4 md:px-5">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={onToggle}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-[#fff3e8] text-sm font-semibold text-[var(--admin-accent-hover)]">
            {index + 1}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-semibold text-[var(--admin-heading)]">{summary.title}</span>
              <span className="rounded-full bg-[#f6ede5] px-2.5 py-1 text-[11px] font-medium text-[#8d7462]">
                Sira {banner.order}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-2">
              {summary.badges.map((badge) => (
                <span
                  key={badge}
                  className="rounded-full border border-[var(--admin-border)] bg-white px-2.5 py-1 text-[11px] text-[var(--admin-text-secondary)]"
                >
                  {badge}
                </span>
              ))}
            </div>
          </div>
          <ChevronDown
            className={`h-5 w-5 shrink-0 text-[#9d816d] transition-transform ${
              isExpanded ? "rotate-180" : ""
            }`}
          />
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onRemove}
            className="rounded-[8px] p-2 text-[#b8977f] transition-colors hover:bg-red-50 hover:text-red-600"
            aria-label={`Banner ${index + 1} sil`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="cursor-grab rounded-[8px] p-2 text-[#b8977f] transition-colors hover:bg-[#f7efe8] hover:text-[var(--admin-text-secondary)] active:cursor-grabbing"
            aria-label={`Banner ${index + 1} sirala`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-5 w-5" />
          </button>
        </div>
      </div>

      {isExpanded ? (
        <div className="space-y-5 p-5">
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-[8px] bg-[#f5eee7] p-1">
              <button
                type="button"
                onClick={() => onTabChange("desktop")}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                  activeImageTab === "desktop"
                    ? "bg-white text-[var(--admin-heading)] shadow-sm"
                    : "text-[var(--admin-text-secondary)] hover:text-[var(--admin-heading)]"
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <Monitor className="h-4 w-4" />
                  Masaustu
                </span>
              </button>
              <button
                type="button"
                onClick={() => onTabChange("mobile")}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                  activeImageTab === "mobile"
                    ? "bg-white text-[var(--admin-heading)] shadow-sm"
                    : "text-[var(--admin-text-secondary)] hover:text-[var(--admin-heading)]"
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <Smartphone className="h-4 w-4" />
                  Mobil
                </span>
              </button>
            </div>

            <div className="group/upload relative aspect-[16/9] overflow-hidden rounded-[8px] border-2 border-dashed border-[var(--admin-border)] bg-[#faf5ef] transition-colors hover:border-[var(--admin-accent-border)]">
              {currentImage ? (
                <>
                  <Image
                    src={currentImage}
                    alt="Banner Preview"
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 60vw"
                    unoptimized
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover/upload:opacity-100">
                    <label className="cursor-pointer rounded-[8px] bg-white px-4 py-2 text-sm font-medium text-[var(--admin-heading)] shadow-lg hover:bg-[#f8f3ed]">
                      Degistir
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={(event) => onUpload(event, activeImageTab)}
                      />
                    </label>
                  </div>
                </>
              ) : (
                <label className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center">
                  {isUploading ? (
                    <Loader2 className="h-8 w-8 animate-spin text-[#b8977f]" />
                  ) : (
                    <>
                      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-[8px] bg-white">
                        {activeImageTab === "mobile" ? (
                          <Smartphone className="h-6 w-6 text-[#c8b5a7]" />
                        ) : (
                          <ImageIcon className="h-6 w-6 text-[#c8b5a7]" />
                        )}
                      </div>
                      <span className="text-sm font-medium text-[var(--admin-text-secondary)]">
                        {activeImageTab === "mobile" ? "Mobil gorsel yukle" : "Masaustu gorsel yukle"}
                      </span>
                    </>
                  )}
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={(event) => onUpload(event, activeImageTab)}
                  />
                </label>
              )}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="veya gorsel URL'si girin"
                value={currentImage || ""}
                onChange={(event) =>
                  onUpdateBanner(activeImageTab === "mobile" ? "mobileImage" : "image", event.target.value)
                }
                className="flex-1 rounded-[8px] border border-[var(--admin-border)] bg-white px-3 py-2.5 text-xs focus:border-[var(--admin-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--admin-accent)]/10"
              />
              {currentImage && !currentStats ? (
                <button
                  type="button"
                  onClick={() => onOptimize(activeImageTab)}
                  disabled={isOptimizing}
                  className="inline-flex items-center gap-1 rounded-[8px] bg-gradient-to-r from-orange-500 to-orange-600 px-3 py-2 text-xs font-medium text-white transition-all hover:from-orange-600 hover:to-orange-700 disabled:opacity-50"
                  title="Gorseli optimize et"
                >
                  {isOptimizing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Zap className="h-3.5 w-3.5" />
                  )}
                  Optimize
                </button>
              ) : null}
            </div>

            {currentStats ? (
              <div className="flex items-center justify-between rounded-[8px] border border-green-200 bg-green-50 p-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-100">
                    <Sparkles className="h-4 w-4 text-green-600" />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-green-800">{currentStats.format.toUpperCase()}</div>
                    <div className="text-xs text-green-600">{currentStats.savings}% tasarruf</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onClearOptimizedStats(activeImageTab)}
                  className="rounded-lg p-1 text-green-600 hover:bg-green-100 hover:text-green-800"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--admin-heading)]">
                <Sparkles className="h-3.5 w-3.5" />
                Rozet
              </label>
              <select
                value={banner.badge || ""}
                onChange={(event) => onUpdateBanner("badge", event.target.value)}
                className="w-full rounded-[8px] border border-[var(--admin-border)] bg-white px-3 py-2.5 text-sm focus:border-[var(--admin-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--admin-accent)]/10"
              >
                {BADGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--admin-heading)]">
                <Palette className="h-3.5 w-3.5" />
                Renk
              </label>
              <select
                value={banner.color || "from-primary to-primary/80"}
                onChange={(event) => onUpdateBanner("color", event.target.value)}
                className="w-full rounded-[8px] border border-[var(--admin-border)] bg-white px-3 py-2.5 text-sm focus:border-[var(--admin-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--admin-accent)]/10"
              >
                {COLOR_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-[var(--admin-heading)]">Baslik</label>
              <input
                type="text"
                value={banner.title}
                onChange={(event) => onUpdateBanner("title", event.target.value)}
                className="w-full rounded-[8px] border border-[var(--admin-border)] bg-white px-3 py-2.5 text-sm focus:border-[var(--admin-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--admin-accent)]/10"
                placeholder="Orn: Dogal fistik ezmesi"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-[var(--admin-heading)]">Aciklama</label>
              <input
                type="text"
                value={banner.subtitle}
                onChange={(event) => onUpdateBanner("subtitle", event.target.value)}
                className="w-full rounded-[8px] border border-[var(--admin-border)] bg-white px-3 py-2.5 text-sm focus:border-[var(--admin-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--admin-accent)]/10"
                placeholder="Orn: Her gun taze"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--admin-heading)]">Buton metni</label>
              <input
                type="text"
                value={banner.buttonText}
                onChange={(event) => onUpdateBanner("buttonText", event.target.value)}
                className="w-full rounded-[8px] border border-[var(--admin-border)] bg-white px-3 py-2.5 text-sm focus:border-[var(--admin-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--admin-accent)]/10"
                placeholder="Incele"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--admin-heading)]">Link</label>
              <input
                type="text"
                value={banner.buttonLink}
                onChange={(event) => onUpdateBanner("buttonLink", event.target.value)}
                className="w-full rounded-[8px] border border-[var(--admin-border)] bg-white px-3 py-2.5 text-sm focus:border-[var(--admin-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--admin-accent)]/10"
                placeholder="/kategori-slug"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function DesignPromoBannerSection() {
  const [banners, setBanners] = useState<PromoBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [optimizing, setOptimizing] = useState<Record<string, boolean>>({});
  const [activeImageTab, setActiveImageTab] = useState<Record<number, "desktop" | "mobile">>({});
  const [expandedBannerId, setExpandedBannerId] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

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

      setBanners(normalizeLoadedBanners(data.setting?.value));
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
      const normalizedBanners = normalizeBannerOrder(banners);
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "promo_banners",
          value: { banners: normalizedBanners },
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Promosyon banner ayarlari kaydedilemedi.");
      }

      setBanners(normalizedBanners);
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

    setBanners((prev) => normalizeBannerOrder([...prev, newBanner]));
    setActiveImageTab((prev) => ({ ...prev, [newBanner.id]: "desktop" }));
    setExpandedBannerId(newBanner.id);
  }

  function handleRemoveBanner(id: number) {
    setBanners((prev) => normalizeBannerOrder(prev.filter((banner) => banner.id !== id)));
    setExpandedBannerId((current) => (current === id ? null : current));
  }

  function handleUpdateBanner(
    id: number,
    field: keyof PromoBanner,
    value: string | number | ImageStats | undefined,
  ) {
    setBanners((prev) =>
      prev.map((banner) => (banner.id === id ? { ...banner, [field]: value } : banner)),
    );
  }

  async function handleFileUpload(
    event: React.ChangeEvent<HTMLInputElement>,
    bannerId: number,
    type: "desktop" | "mobile",
  ) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

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

      handleUpdateBanner(
        bannerId,
        type === "desktop" ? "imageStats" : "mobileImageStats",
        stats,
      );

      toast.success(`${type === "desktop" ? "Masaustu" : "Mobil"} gorsel yuklendi.`);
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Görsel yuklenirken hata olustu.");
    } finally {
      setUploading((prev) => ({ ...prev, [`${bannerId}-${type}`]: false }));
      event.target.value = "";
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
      handleUpdateBanner(bannerId, type === "desktop" ? "imageStats" : "mobileImageStats", {
        format: data.format,
        width: data.width,
        height: data.height,
        originalSize: data.originalSize,
        processedSize: data.processedSize,
        savings: data.savings,
      });

      toast.success("Görsel optimize edildi.");
    } catch (error) {
      console.error("Optimize error:", error);
      toast.error("Görsel optimize edilirken hata olustu.");
    } finally {
      setOptimizing((prev) => ({ ...prev, [`${bannerId}-${type}`]: false }));
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    setBanners((prev) => {
      const oldIndex = prev.findIndex((banner) => banner.id === active.id);
      const newIndex = prev.findIndex((banner) => banner.id === over.id);

      if (oldIndex === -1 || newIndex === -1) {
        return prev;
      }

      return normalizeBannerOrder(arrayMove(prev, oldIndex, newIndex));
    });
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--admin-accent)]">
            Kampanya
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--admin-heading)]">
            Kampanya kartları
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--admin-text-secondary)]">
            Kartı seç, görseli ve sıralamayı düzenle.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-[#FF6A00] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(255,106,0,0.16)] transition hover:bg-[#E85D04] disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Kaydet
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={banners.map((banner) => banner.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-4">
            {banners.map((banner, index) => (
              <SortablePromoBannerCard
                key={banner.id}
                banner={banner}
                index={index}
                isExpanded={expandedBannerId === banner.id}
                activeImageTab={activeImageTab[banner.id] || "desktop"}
                isUploading={Boolean(uploading[`${banner.id}-${activeImageTab[banner.id] || "desktop"}`])}
                isOptimizing={Boolean(optimizing[`${banner.id}-${activeImageTab[banner.id] || "desktop"}`])}
                onToggle={() =>
                  setExpandedBannerId((current) => (current === banner.id ? null : banner.id))
                }
                onRemove={() => handleRemoveBanner(banner.id)}
                onTabChange={(tab) => setActiveImageTab((prev) => ({ ...prev, [banner.id]: tab }))}
                onUpdateBanner={(field, value) => handleUpdateBanner(banner.id, field, value)}
                onUpload={(event, type) => void handleFileUpload(event, banner.id, type)}
                onOptimize={(type) => void handleOptimizeImage(banner.id, type)}
                onClearOptimizedStats={(type) =>
                  handleUpdateBanner(
                    banner.id,
                    type === "desktop" ? "imageStats" : "mobileImageStats",
                    undefined,
                  )
                }
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {banners.length < 6 ? (
        <button
          type="button"
          onClick={handleAddBanner}
          className="flex w-full items-center justify-center gap-2 rounded-[8px] border border-dashed border-[#FFD1B5] bg-[#FFF8F3] py-3 text-sm font-semibold text-[#E85D04] transition hover:bg-[#FFF1E8]"
        >
          <Plus className="h-5 w-5" />
          Banner ekle
        </button>
      ) : null}
    </div>
  );
}
