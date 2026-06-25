"use client";

import { useState, useEffect } from "react";
import type { ElementType } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Palette,
  Ruler,
  Weight,
  Box,
  Pencil,
  Trash2,
  Loader2,
  Search,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { VariantAttribute } from "@/types/variant-attributes";

const ICON_MAP: Record<string, ElementType> = {
  renk: Palette,
  beden: Ruler,
  gramaj: Weight,
  default: Box,
};

const ANIMATION_EASE = [0.22, 1, 0.36, 1] as const;

function getAttributeTone(slug: string) {
  if (slug === "renk") {
    return {
      icon: "border-rose-200/60 bg-gradient-to-br from-rose-50 to-white text-rose-700",
      badge: "border-rose-200/60 bg-rose-50 text-rose-700",
    };
  }

  if (slug === "beden") {
    return {
      icon: "border-sky-200/60 bg-gradient-to-br from-sky-50 to-white text-sky-700",
      badge: "border-sky-200/60 bg-sky-50 text-sky-700",
    };
  }

  if (slug === "gramaj") {
    return {
      icon: "border-amber-200/60 bg-gradient-to-br from-amber-50 to-white text-amber-700",
      badge: "border-amber-200/60 bg-amber-50 text-amber-700",
    };
  }

  return {
    icon: "border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] text-[var(--admin-accent)]",
    badge: "border-[var(--admin-border)] bg-[var(--admin-accent-soft)] text-[var(--admin-accent-hover)]",
  };
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 p-5 md:p-6">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="animate-pulse rounded-[26px] border border-[var(--admin-border)] bg-white/80 p-5"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-[#f3e6d9]" />
              <div className="space-y-3">
                <div className="h-4 w-36 rounded-full bg-[#ecdccc]" />
                <div className="h-3 w-24 rounded-full bg-[#f0e4d9]" />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="h-11 w-24 rounded-2xl bg-[#f3e6d9]" />
              <div className="h-11 w-20 rounded-2xl bg-[#f8dfdc]" />
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <div className="h-8 w-24 rounded-full bg-[#f0e4d9]" />
            <div className="h-8 w-28 rounded-full bg-[#f0e4d9]" />
            <div className="h-8 w-20 rounded-full bg-[#f0e4d9]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function VariantAttributesPage() {
  const router = useRouter();
  const [attributes, setAttributes] = useState<VariantAttribute[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [expandedAttribute, setExpandedAttribute] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchAttributes();
  }, []);

  const fetchAttributes = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/admin/variant-attributes?withValues=true");
      const data = await response.json();

      if (data.success) {
        setAttributes(data.attributes);
      } else {
        toast.error(data.error || "Nitelikler yüklenirken hata oluştu");
      }
    } catch (error) {
      toast.error("Nitelikler yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Bu niteliği silmek istediğinize emin misiniz? Bu işlem geri alınamaz.")) {
      return;
    }

    try {
      setDeleteLoading(id);
      const response = await fetch(`/api/admin/variant-attributes?id=${id}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (data.success) {
        toast.success("Nitelik başarıyla silindi");
        setAttributes((prev) => prev.filter((attr) => attr.id !== id));
      } else {
        toast.error(data.error || "Silme işlemi başarısız");
      }
    } catch (error) {
      toast.error("Silme işlemi sırasında hata oluştu");
    } finally {
      setDeleteLoading(null);
    }
  };

  const getIcon = (slug: string) => {
    return ICON_MAP[slug] || ICON_MAP.default;
  };

  const toggleExpand = (id: string) => {
    setExpandedAttribute(expandedAttribute === id ? null : id);
  };

  const filteredAttributes = searchQuery.trim()
    ? attributes.filter(
        (attribute) =>
          attribute.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          attribute.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (attribute.values || []).some((value) =>
            value.value.toLowerCase().includes(searchQuery.toLowerCase())
          )
      )
    : attributes;

  const totalValues = attributes.reduce((sum, attribute) => sum + (attribute.values?.length || 0), 0);
  const colorValueCount = attributes.reduce(
    (sum, attribute) => sum + (attribute.values?.filter((value) => Boolean(value.color_code)).length || 0),
    0
  );
  const imageValueCount = attributes.reduce(
    (sum, attribute) => sum + (attribute.values?.filter((value) => Boolean(value.image_url)).length || 0),
    0
  );
  const activeAttributes = attributes.filter((attribute) => attribute.is_active !== false).length;

  return (
    <main
      role="main"
      aria-busy={loading}
      className="min-h-screen bg-gradient-to-br from-[#faf8f5] via-[#f5efe8] to-[#efe5dc]"
    >
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="hidden" />
        <div className="hidden" />
        <div className="hidden" />
      </div>

      <div className="relative mx-auto max-w-[1600px] px-4 py-6 md:px-6 md:py-8 lg:px-8">
        <div className="space-y-8">
          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: ANIMATION_EASE }}
            className="overflow-hidden rounded-[30px] border border-[var(--admin-border)] bg-white shadow-[var(--shadow-md)]"
          >
            <div className="border-b border-[var(--admin-border)] px-6 py-6 md:px-8 md:py-7">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                <div className="space-y-0">
                  <div className="inline-flex w-fit items-center rounded-full border border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--admin-accent)]">
                    Nitelikler
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 xl:justify-end">
                  <Link
                    href="/admin/urunler/nitelikler/yeni"
                    className="inline-flex items-center gap-2 rounded-2xl bg-[var(--admin-accent)] px-5 py-3 text-sm font-semibold text-white shadow-[var(--shadow-md)] transition hover:translate-y-[-1px] hover:bg-[var(--admin-accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)]"
                  >
                    <Plus className="h-4 w-4" />
                    Yeni Nitelik
                  </Link>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-px bg-gradient-to-r from-[#f0ddd0] via-[#f7ebe2] to-[#f0ddd0] md:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: "Toplam nitelik",
                  value: attributes.length.toLocaleString("tr-TR"),
                },
                {
                  label: "Toplam değer",
                  value: totalValues.toLocaleString("tr-TR"),
                },
                {
                  label: "Renk tabanlı",
                  value: colorValueCount.toLocaleString("tr-TR"),
                },
                {
                  label: "Görselli değer",
                  value: imageValueCount.toLocaleString("tr-TR"),
                },
              ].map((metric) => (
                <div key={metric.label} className="border border-white/70 bg-white/70 px-5 py-5 backdrop-blur-sm md:px-6">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">{metric.label}</p>
                  <p className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-stone-950 md:text-[30px]">{metric.value}</p>
                </div>
              ))}
            </div>
          </motion.section>

          <section className="rounded-[30px] border border-[var(--admin-border)] bg-gradient-to-br from-white/95 via-[#fffdfa] to-[#f6eee6] p-5 shadow-[0_24px_55px_rgba(98,64,33,0.09)] md:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <h2 className="text-xl font-semibold tracking-[-0.03em] text-[var(--admin-heading)]">Nitelik Özeti</h2>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#7d6a5d]">
                <span className="rounded-full border border-[#ebdccc] bg-white px-3 py-1.5 shadow-sm">
                  Aktif nitelik: {activeAttributes}
                </span>
                <span className="rounded-full border border-[#ebdccc] bg-white px-3 py-1.5 shadow-sm">
                  Metin dışı değer: {(colorValueCount + imageValueCount).toLocaleString("tr-TR")}
                </span>
              </div>
            </div>
          </section>

          <section className="rounded-[30px] border border-[var(--admin-border)] bg-gradient-to-br from-white/95 via-[#fffdfa] to-[#f6eee6] p-5 shadow-[0_24px_55px_rgba(98,64,33,0.09)] md:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-2">
                <h2 className="text-xl font-semibold tracking-[-0.03em] text-[var(--admin-heading)]">Nitelik listesi</h2>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#7d6a5d]">
                <span className="rounded-full border border-[#ebdccc] bg-white px-3 py-1.5 shadow-sm">
                  Görünen sonuç: {filteredAttributes.length.toLocaleString("tr-TR")}
                </span>
              </div>
            </div>

            <div className="mt-5 rounded-[26px] border border-[#efdfd1] bg-gradient-to-r from-[#fffaf6] to-white p-3 shadow-inner sm:p-4">
              <label htmlFor="attribute-search" className="relative block">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#b08d73]" />
                <input
                  id="attribute-search"
                  type="text"
                  placeholder="Nitelik ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-[20px] border border-[var(--admin-border)] bg-white pl-11 pr-4 py-3 text-sm text-[var(--admin-heading)] shadow-[var(--shadow-md)] outline-none transition placeholder:text-[var(--admin-text-muted)] focus:border-[var(--admin-accent-border)] focus:ring-4 focus:ring-[var(--admin-accent)]/15"
                />
              </label>
            </div>
          </section>

          {loading ? (
            <section className="rounded-[30px] border border-[#eadbcd] bg-white/85 shadow-[0_24px_55px_rgba(98,64,33,0.08)]">
              <LoadingSkeleton />
            </section>
          ) : filteredAttributes.length === 0 ? (
            <section className="rounded-[30px] border border-[var(--admin-border)] bg-white p-10 text-center shadow-[0_24px_55px_rgba(98,64,33,0.08)]">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[28px] bg-gradient-to-br from-[#fff0e3] to-[#f6deca] shadow-[var(--shadow-md)]">
                <Box className="h-9 w-9 text-[var(--admin-accent)]" />
              </div>
              <div className="mx-auto mt-6 max-w-xl space-y-3">
                <h3 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--admin-heading)]">
                  {attributes.length === 0 ? "Henüz nitelik eklenmemiş" : "Aramanızla eşleşen nitelik bulunamadı"}
                </h3>
                <p className="text-sm leading-7 text-[var(--admin-text-secondary)]">
                  {attributes.length === 0
                    ? "Varyant yapınızı kurmak için ilk nitelik grubunu ekleyin. Renk, beden, gramaj veya benzeri tüm değer kümeleri bu alandan yönetilir."
                    : "Farklı bir nitelik adı veya değer deneyin. Liste davranışı değişmeden yalnızca mevcut sonuçlar filtrelenir."}
                </p>
              </div>
              <Link
                href="/admin/urunler/nitelikler/yeni"
                className="mt-6 inline-flex items-center gap-2 rounded-[20px] bg-gradient-to-r from-[#FF6A00] to-[#e85a00] px-5 py-3 text-sm font-semibold text-white shadow-[var(--shadow-md)] transition hover:translate-y-[-1px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)]"
              >
                <Plus className="h-4 w-4" />
                İlk Niteliği Ekle
              </Link>
            </section>
          ) : (
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredAttributes.map((attribute, index) => {
                const Icon = getIcon(attribute.slug);
                const isExpanded = expandedAttribute === attribute.id;
                const values = attribute.values || [];
                const tone = getAttributeTone(attribute.slug);
                const previewValues = values.slice(0, 6);
                const hiddenValues = values.slice(6);
                const hasVisualValues = values.some((value) => value.image_url || value.color_code);

                return (
                  <motion.article
                    key={attribute.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.03, ease: ANIMATION_EASE }}
                    className={cn(
                      "overflow-hidden rounded-[28px] border bg-white shadow-[0_18px_55px_rgba(72,36,8,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_60px_rgba(72,36,8,0.12)]",
                      isExpanded ? "border-[var(--admin-accent-border)] ring-2 ring-[#FF6A00]/12" : "border-[var(--admin-border)]"
                    )}
                  >
                    <div className="border-b border-[#f0e1d5] px-5 py-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className={cn("flex h-12 w-12 items-center justify-center rounded-2xl border shadow-sm", tone.icon)}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="truncate text-lg font-semibold tracking-[-0.02em] text-[var(--admin-heading)]">
                                {attribute.name}
                              </h3>
                              <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]", tone.badge)}>
                                {attribute.is_active !== false ? "Aktif" : "Pasif"}
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[#776557]">
                              <span className="rounded-full bg-white/80 px-3 py-1 font-medium text-[#5c4738] shadow-sm">
                                /{attribute.slug}
                              </span>
                              <span className="rounded-full border border-[#eadfd5] bg-[#faf6f1] px-3 py-1 text-xs font-medium">
                                {values.length} değer
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => router.push(`/admin/urunler/nitelikler/${attribute.id}/duzenle`)}
                            aria-label={`${attribute.name} niteliğini düzenle`}
                            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#ead9cb] bg-white text-[#654c3c] shadow-sm transition hover:border-[var(--admin-accent-border)] hover:text-[var(--admin-accent)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)]"
                            title="Düzenle"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(attribute.id)}
                            disabled={deleteLoading === attribute.id}
                            aria-label={`${attribute.name} niteliğini sil`}
                            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#f1d3d0] bg-white text-[#9f4940] shadow-sm transition hover:border-[#d96457] hover:bg-[#fff5f4] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-200 disabled:cursor-not-allowed disabled:opacity-60"
                            title="Sil"
                          >
                            {deleteLoading === attribute.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 p-5">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-[22px] border border-stone-200 bg-white/85 p-4 shadow-sm">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">Toplam değer</p>
                          <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[var(--admin-heading)]">
                            {values.length.toLocaleString("tr-TR")}
                          </p>
                        </div>
                        <div className="rounded-[22px] border border-stone-200 bg-white/85 p-4 shadow-sm">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">Ön izleme tipi</p>
                          <p className="mt-2 text-sm font-semibold text-[#5c4738]">
                            {hasVisualValues ? "Görsel destekli" : "Metin tabanlı"}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8c7768]">
                            Değer Ön İzlemesi
                          </p>
                          {hiddenValues.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => toggleExpand(attribute.id)}
                              aria-expanded={isExpanded}
                              aria-label={
                                isExpanded
                                  ? `${attribute.name} niteliğinin kalan değerlerini gizle`
                                  : `${attribute.name} niteliğinin ${hiddenValues.length} değer daha göster`
                              }
                              className="inline-flex items-center gap-2 rounded-full border border-[#ead9cb] bg-white px-3 py-1.5 text-xs font-medium text-[#654c3c] shadow-sm transition hover:border-[var(--admin-accent-border)] hover:text-[var(--admin-accent)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)]"
                            >
                              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              {isExpanded ? "Daha az göster" : `+${hiddenValues.length} değer`}
                            </button>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {previewValues.map((value) => (
                            <span
                              key={value.id}
                              className="inline-flex items-center gap-2 rounded-xl border border-[#eadfd5] bg-white px-3 py-2 text-sm text-[#5c4738] shadow-sm"
                            >
                              {value.image_url ? (
                                <img
                                  src={value.image_url}
                                  alt={value.value}
                                  className="h-5 w-5 rounded object-cover border border-stone-200"
                                />
                              ) : value.color_code ? (
                                <span
                                  className="h-3.5 w-3.5 rounded-full border border-stone-200"
                                  style={{ backgroundColor: value.color_code }}
                                />
                              ) : null}
                              {value.value}
                            </span>
                          ))}
                        </div>

                        {isExpanded && hiddenValues.length > 0 ? (
                          <div className="rounded-[22px] border border-dashed border-[#ead8c8] bg-[#FCFDFE] p-4">
                            <div className="flex flex-wrap gap-2 pt-1">
                              {hiddenValues.map((value) => (
                                <span
                                  key={value.id}
                                  className="inline-flex items-center gap-2 rounded-xl border border-[#eadfd5] bg-white px-3 py-2 text-sm text-[#5c4738] shadow-sm"
                                >
                                  {value.image_url ? (
                                    <img
                                      src={value.image_url}
                                      alt={value.value}
                                      className="h-5 w-5 rounded object-cover border border-stone-200"
                                    />
                                  ) : value.color_code ? (
                                    <span
                                      className="h-3.5 w-3.5 rounded-full border border-stone-200"
                                      style={{ backgroundColor: value.color_code }}
                                    />
                                  ) : null}
                                  {value.value}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </motion.article>
                );
              })}
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
