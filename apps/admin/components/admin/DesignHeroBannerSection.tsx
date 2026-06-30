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
  if (!Array.isArray(slides)) {
    return [];
  }

  return slides.map((slide, index) => ({
    ...slide,
    id: typeof slide.id === "number" ? slide.id : Date.now() + index,
    desktop: slide.desktop || "",
    mobile: slide.mobile || "",
    alt: slide.alt || "",
    link: slide.link || "",
    transition: slide.transition || "fade",
    overlay: {
      ...DEFAULT_OVERLAY,
      ...(slide.overlay || {}),
    },
  }));
}

function getSlideSummary(slide: HeroSlide, index: number) {
  const title = slide.overlay?.title?.trim() || slide.alt.trim() || `Slayt ${index + 1}`;
  const badges = [
    slide.desktop ? "Masaustu hazir" : "Masaustu eksik",
    slide.mobile ? "Mobil hazir" : "Mobil eksik",
    slide.overlay?.title?.trim() || slide.overlay?.subtitle?.trim() ? "Metin var" : "Metin yok",
  ];

  return {
    title,
    badges,
  };
}

type SortableHeroSlideCardProps = {
  index: number;
  slide: HeroSlide;
  isExpanded: boolean;
  isUploadingDesktop: boolean;
  isUploadingMobile: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onUpload: (event: React.ChangeEvent<HTMLInputElement>, type: "desktop" | "mobile") => void;
  onUpdateSlide: <K extends keyof HeroSlide>(field: K, value: HeroSlide[K]) => void;
  onUpdateOverlay: (
    field: keyof HeroOverlay,
    value: HeroOverlay[keyof HeroOverlay],
  ) => void;
};

function SortableHeroSlideCard({
  index,
  slide,
  isExpanded,
  isUploadingDesktop,
  isUploadingMobile,
  onToggle,
  onRemove,
  onUpload,
  onUpdateSlide,
  onUpdateOverlay,
}: SortableHeroSlideCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slide.id,
  });
  const summary = getSlideSummary(slide, index);

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
                {slide.transition}
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
            aria-label={`Slayt ${index + 1} sil`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="cursor-grab rounded-[8px] p-2 text-[#b8977f] transition-colors hover:bg-[#f7efe8] hover:text-[var(--admin-text-secondary)] active:cursor-grabbing"
            aria-label={`Slayt ${index + 1} sirala`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-5 w-5" />
          </button>
        </div>
      </div>

      {isExpanded ? (
        <div className="grid grid-cols-1 gap-8 p-6 lg:grid-cols-2">
          <div className="space-y-3">
            <label className="block text-sm font-medium text-[var(--admin-heading)]">Masaustu gorseli</label>
            <div className="group/upload relative aspect-[16/9] overflow-hidden rounded-[8px] border-2 border-dashed border-[var(--admin-border)] bg-[#faf5ef] transition-colors hover:border-[var(--admin-accent-border)]">
              {slide.desktop ? (
                <>
                  <Image src={slide.desktop} alt="Desktop Preview" fill className="object-cover" unoptimized />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover/upload:opacity-100">
                    <label className="cursor-pointer rounded-[8px] bg-white px-4 py-2 text-sm font-medium text-[var(--admin-heading)] transition-colors hover:bg-[#f8f3ed]">
                      Degistir
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={(event) => onUpload(event, "desktop")}
                      />
                    </label>
                  </div>
                </>
              ) : (
                <label className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center">
                  {isUploadingDesktop ? (
                    <Loader2 className="h-8 w-8 animate-spin text-[#b8977f]" />
                  ) : (
                    <>
                      <ImageIcon className="mb-2 h-8 w-8 text-[#c8b5a7]" />
                      <span className="text-sm text-[var(--admin-text-secondary)]">Görsel yukle</span>
                    </>
                  )}
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={(event) => onUpload(event, "desktop")}
                  />
                </label>
              )}
            </div>
            <UrlInput
              placeholder="veya gorsel URL'si yapistir"
              onAdd={(value) => onUpdateSlide("desktop", value)}
            />
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-[var(--admin-heading)]">Mobil gorseli</label>
            <div className="group/upload relative aspect-[4/5] max-w-[240px] overflow-hidden rounded-[8px] border-2 border-dashed border-[var(--admin-border)] bg-[#faf5ef] transition-colors hover:border-[var(--admin-accent-border)] md:max-w-full md:aspect-video">
              {slide.mobile ? (
                <>
                  <Image src={slide.mobile} alt="Mobile Preview" fill className="object-cover" unoptimized />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover/upload:opacity-100">
                    <label className="cursor-pointer rounded-[8px] bg-white px-4 py-2 text-sm font-medium text-[var(--admin-heading)] transition-colors hover:bg-[#f8f3ed]">
                      Degistir
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={(event) => onUpload(event, "mobile")}
                      />
                    </label>
                  </div>
                </>
              ) : (
                <label className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center">
                  {isUploadingMobile ? (
                    <Loader2 className="h-8 w-8 animate-spin text-[#b8977f]" />
                  ) : (
                    <>
                      <Smartphone className="mb-2 h-8 w-8 text-[#c8b5a7]" />
                      <span className="text-sm text-[var(--admin-text-secondary)]">Mobil gorsel yukle</span>
                    </>
                  )}
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={(event) => onUpload(event, "mobile")}
                  />
                </label>
              )}
            </div>
            <UrlInput
              placeholder="veya mobil gorsel URL'si yapistir"
              onAdd={(value) => onUpdateSlide("mobile", value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:col-span-2 md:grid-cols-2">
            <div>
                <label className="mb-1 block text-sm font-medium text-[var(--admin-heading)]">Görsel aciklamasi</label>
              <input
                type="text"
                value={slide.alt}
                onChange={(event) => onUpdateSlide("alt", event.target.value)}
                placeholder="Orn: Ana sayfa kampanya gorseli"
                className="w-full rounded-[8px] border border-[var(--admin-border)] bg-white px-3 py-2.5 focus:border-[var(--admin-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--admin-accent)]/10"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--admin-heading)]">Tiklaninca gidecek sayfa</label>
              <input
                type="text"
                value={slide.link || ""}
                onChange={(event) => onUpdateSlide("link", event.target.value)}
                placeholder="/urunler/fistik-ezmesi"
                className="w-full rounded-[8px] border border-[var(--admin-border)] bg-white px-3 py-2.5 focus:border-[var(--admin-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--admin-accent)]/10"
              />
            </div>
          </div>

          <div className="lg:col-span-2">
            <label className="mb-2 block text-sm font-medium text-[var(--admin-heading)]">Gecis efekti</label>
            <div className="flex flex-wrap gap-2">
              {(["fade", "slide", "zoom", "blur"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => onUpdateSlide("transition", type)}
                  className={`rounded-[8px] px-4 py-2 text-sm font-medium capitalize transition-all ${
                    slide.transition === type
                      ? "bg-[#2f241d] text-white"
                      : "bg-[#f7efe8] text-[var(--admin-text-secondary)] hover:bg-[#efe2d6]"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[8px] bg-[#faf5ef] p-5 lg:col-span-2">
            <h4 className="mb-3 text-sm font-semibold text-[var(--admin-heading)]">Gorselin ustundeki yazilar</h4>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--admin-heading)]">Baslik</label>
                <input
                  type="text"
                  value={slide.overlay?.title || ""}
                  onChange={(event) => onUpdateOverlay("title", event.target.value)}
                  placeholder="Dogal lezzetin yeni yuzu"
                  className="w-full rounded-[8px] border border-[var(--admin-border)] bg-white px-3 py-2.5 focus:border-[var(--admin-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--admin-accent)]/10"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--admin-heading)]">Aciklama</label>
                <input
                  type="text"
                  value={slide.overlay?.subtitle || ""}
                  onChange={(event) => onUpdateOverlay("subtitle", event.target.value)}
                  placeholder="Katkisiz, taze ve guvenilir"
                  className="w-full rounded-[8px] border border-[var(--admin-border)] bg-white px-3 py-2.5 focus:border-[var(--admin-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--admin-accent)]/10"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--admin-heading)]">Buton metni</label>
                <input
                  type="text"
                  value={slide.overlay?.ctaText || ""}
                  onChange={(event) => onUpdateOverlay("ctaText", event.target.value)}
                  placeholder="Kesfet"
                  className="w-full rounded-[8px] border border-[var(--admin-border)] bg-white px-3 py-2.5 focus:border-[var(--admin-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--admin-accent)]/10"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--admin-heading)]">Buton linki</label>
                <input
                  type="text"
                  value={slide.overlay?.ctaLink || ""}
                  onChange={(event) => onUpdateOverlay("ctaLink", event.target.value)}
                  placeholder="/urunler"
                  className="w-full rounded-[8px] border border-[var(--admin-border)] bg-white px-3 py-2.5 focus:border-[var(--admin-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--admin-accent)]/10"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-[var(--admin-heading)]">Yazinin duracagi taraf</label>
                <div className="flex gap-2">
                  {(["left", "center", "right"] as const).map((position) => (
                    <button
                      key={position}
                      type="button"
                      onClick={() => onUpdateOverlay("position", position)}
                      className={`rounded-[8px] px-4 py-2 text-sm font-medium transition-all ${
                        slide.overlay?.position === position
                          ? "bg-[var(--admin-accent)] text-white"
                          : "border border-[var(--admin-border)] bg-white text-[var(--admin-text-secondary)] hover:bg-[#f8f3ed]"
                      }`}
                    >
                      {position === "left" ? "Sol" : position === "center" ? "Orta" : "Sag"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function DesignHeroBannerSection() {
  const [slides, setSlides] = useState<HeroSlide[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [expandedSlideId, setExpandedSlideId] = useState<number | null>(null);

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
    const newSlide = createEmptySlide();
    setSlides((prev) => [...prev, newSlide]);
    setExpandedSlideId(newSlide.id);
  }

  function handleRemoveSlide(id: number) {
    setSlides((prev) => prev.filter((slide) => slide.id !== id));
    setExpandedSlideId((current) => (current === id ? null : current));
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
        if (slide.id !== id) {
          return slide;
        }

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
    event: React.ChangeEvent<HTMLInputElement>,
    slideId: number,
    type: "desktop" | "mobile",
  ) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

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
      event.target.value = "";
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    setSlides((prev) => {
      const oldIndex = prev.findIndex((slide) => slide.id === active.id);
      const newIndex = prev.findIndex((slide) => slide.id === over.id);

      if (oldIndex === -1 || newIndex === -1) {
        return prev;
      }

      return arrayMove(prev, oldIndex, newIndex);
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
            Manşet
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[var(--admin-heading)]">
            Ana sayfa manşeti
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--admin-text-secondary)]">
            Slaytı seç, görseli düzenle, kaydet.
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
        <SortableContext items={slides.map((slide) => slide.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-4">
            {slides.map((slide, index) => (
              <SortableHeroSlideCard
                key={slide.id}
                index={index}
                slide={slide}
                isExpanded={expandedSlideId === slide.id}
                isUploadingDesktop={Boolean(uploading[`${slide.id}-desktop`])}
                isUploadingMobile={Boolean(uploading[`${slide.id}-mobile`])}
                onToggle={() =>
                  setExpandedSlideId((current) => (current === slide.id ? null : slide.id))
                }
                onRemove={() => handleRemoveSlide(slide.id)}
                onUpload={(event, type) => void handleFileUpload(event, slide.id, type)}
                onUpdateSlide={(field, value) => handleUpdateSlide(slide.id, field, value)}
                onUpdateOverlay={(field, value) => handleUpdateOverlay(slide.id, field, value)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <button
        type="button"
        onClick={handleAddSlide}
        className="flex w-full items-center justify-center gap-2 rounded-[8px] border border-dashed border-[#FFD1B5] bg-[#FFF8F3] py-3 text-sm font-semibold text-[#E85D04] transition hover:bg-[#FFF1E8]"
      >
        <Plus className="h-5 w-5" />
        Slayt ekle
      </button>
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
        className="flex-1 rounded-[8px] border border-[var(--admin-border)] bg-white px-3 py-2.5 text-sm focus:border-[var(--admin-accent-border)] focus:outline-none focus:ring-2 focus:ring-[var(--admin-accent)]/10"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && value.trim()) {
            onAdd(value.trim());
            setValue("");
          }
        }}
      />
      <button
        type="button"
        className="rounded-[8px] bg-[#f7efe8] px-4 py-2.5 text-sm font-medium text-[var(--admin-text-secondary)] hover:bg-[#efe2d6]"
        onClick={() => {
          if (!value.trim()) {
            return;
          }

          onAdd(value.trim());
          setValue("");
        }}
      >
        Ekle
      </button>
    </div>
  );
}
