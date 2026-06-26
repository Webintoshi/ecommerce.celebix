"use client";

import { useEffect, useMemo, useState } from "react";
import type { ElementType } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Box,
  ChevronDown,
  ChevronUp,
  ImageIcon,
  Layers3,
  Loader2,
  Palette,
  Pencil,
  Plus,
  Ruler,
  Search,
  Settings2,
  SlidersHorizontal,
  Trash2,
  Type,
  Weight,
} from "lucide-react";
import { toast } from "sonner";

import { AdminEmptyState, AdminLoadingState, AdminPageHeader } from "@/components/admin/AdminPageShell";
import { cn } from "@/lib/utils";
import type { VariantAttribute, VariantAttributeValue } from "@/types/variant-attributes";

const ICON_MAP: Record<string, ElementType> = {
  renk: Palette,
  beden: Ruler,
  gramaj: Weight,
  default: Box,
};

function getIcon(slug: string) {
  return ICON_MAP[slug] || ICON_MAP.default;
}

function getAttributeMode(values: VariantAttributeValue[]) {
  if (values.some((value) => Boolean(value.image_url))) {
    return {
      label: "Görsel",
      icon: ImageIcon,
    };
  }

  if (values.some((value) => Boolean(value.color_code))) {
    return {
      label: "Renk",
      icon: Palette,
    };
  }

  return {
    label: "Metin",
    icon: Type,
  };
}

function getSortedValues(values: VariantAttributeValue[] = []) {
  return [...values].sort((left, right) => left.display_order - right.display_order);
}

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase("tr-TR");
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

  const filteredAttributes = useMemo(() => {
    const query = normalizeSearch(searchQuery);

    if (!query) {
      return attributes;
    }

    return attributes.filter((attribute) => {
      const values = attribute.values || [];

      return (
        normalizeSearch(attribute.name).includes(query) ||
        normalizeSearch(attribute.slug).includes(query) ||
        values.some((value) => normalizeSearch(value.value).includes(query))
      );
    });
  }, [attributes, searchQuery]);

  const stats = useMemo(() => {
    const totalValues = attributes.reduce((sum, attribute) => sum + (attribute.values?.length || 0), 0);
    const visualValueCount = attributes.reduce(
      (sum, attribute) =>
        sum +
        (attribute.values?.filter((value) => Boolean(value.color_code) || Boolean(value.image_url)).length || 0),
      0,
    );
    const activeAttributes = attributes.filter((attribute) => attribute.is_active !== false).length;

    return {
      activeAttributes,
      totalAttributes: attributes.length,
      totalValues,
      visualValueCount,
    };
  }, [attributes]);

  const toggleExpand = (id: string) => {
    setExpandedAttribute((current) => (current === id ? null : id));
  };

  return (
    <div aria-busy={loading} className="min-h-screen bg-[#F9F9F9] pb-8 text-[var(--admin-heading)]">
      <div className="mx-auto w-full max-w-none space-y-4 px-4 sm:px-5 xl:px-6">
        <AdminPageHeader
          sectionLabel="Katalog"
          title="Nitelikler"
          description="Ürün varyantlarında kullanılan seçenek ve değerleri yönetin."
          actions={
            <Link
              href="/admin/urunler/nitelikler/yeni"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-[var(--admin-accent)] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(255,106,0,0.20)] transition hover:bg-[var(--admin-accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]"
            >
              <Plus className="h-4 w-4" />
              Yeni Nitelik
            </Link>
          }
          metrics={
            <>
              {[
                { label: "Toplam", value: stats.totalAttributes, detail: "nitelik", icon: SlidersHorizontal },
                { label: "Aktif", value: stats.activeAttributes, detail: "kullanımda", icon: Settings2 },
                { label: "Değer", value: stats.totalValues, detail: "seçenek", icon: Layers3 },
                { label: "Görsel", value: stats.visualValueCount, detail: "renk/görsel", icon: Palette },
              ].map((metric) => {
                const Icon = metric.icon;

                return (
                  <div key={metric.label} className="min-h-[92px] bg-white px-4 py-3.5 xl:px-5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6B7280]">
                        {metric.label}
                      </p>
                      <Icon className="h-4 w-4 text-[#9CA3AF]" />
                    </div>
                    <div className="mt-3 flex items-end gap-2">
                      <p className="text-3xl font-semibold tracking-[-0.04em] text-[#111827]">
                        {metric.value.toLocaleString("tr-TR")}
                      </p>
                      <span className="pb-1 text-sm font-medium text-[#6B7280]">{metric.detail}</span>
                    </div>
                  </div>
                );
              })}
            </>
          }
        />

        <section className="grid gap-3 border-b border-[#E1E7EF] bg-[#F9F9F9] pb-4 min-[1180px]:grid-cols-[minmax(0,1fr)_auto] min-[1180px]:items-center">
          <label htmlFor="attribute-search" className="relative block min-w-0">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7B8797]" />
            <input
              id="attribute-search"
              type="text"
              placeholder="Nitelik veya değer ara"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="h-11 w-full rounded-[10px] border border-[#DCE3EC] bg-white py-3 pl-11 pr-4 text-sm font-medium text-[#111827] outline-none transition placeholder:text-[#8B95A5] focus:border-[var(--admin-accent-border)] focus:ring-4 focus:ring-[rgba(255,106,0,0.14)]"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#6B7280]">
            <span className="inline-flex h-10 items-center rounded-[10px] border border-[#DCE3EC] bg-white px-3">
              {filteredAttributes.length.toLocaleString("tr-TR")} sonuç
            </span>
            <span className="inline-flex h-10 items-center rounded-[10px] border border-[#DCE3EC] bg-white px-3">
              {stats.visualValueCount.toLocaleString("tr-TR")} renk/görsel değer
            </span>
          </div>
        </section>

        {loading ? (
          <AdminLoadingState label="Nitelikler hazırlanıyor" className="min-h-[320px]" />
        ) : filteredAttributes.length === 0 ? (
          <AdminEmptyState
            icon={<Box className="h-7 w-7" />}
            title={attributes.length === 0 ? "Henüz nitelik bulunmuyor" : "Eşleşen nitelik bulunamadı"}
            description={
              attributes.length === 0
                ? "İlk nitelik eklendiğinde varyant seçenekleri bu alanda listelenecek."
                : "Arama metnini değiştirerek nitelik adı, slug veya değer içinde tekrar deneyin."
            }
            action={
              <Link
                href="/admin/urunler/nitelikler/yeni"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-[var(--admin-accent)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--admin-accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]"
              >
                <Plus className="h-4 w-4" />
                Yeni Nitelik
              </Link>
            }
          />
        ) : (
          <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[#DCE3EC] bg-[#EEF3F7] px-5 py-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#4B5563]">Nitelik listesi</h2>
                <p className="mt-1 text-xs font-medium text-[#6B7280]">
                  Değer ön izlemesi, görünüm tipi ve işlemler aynı satırda.
                </p>
              </div>
              <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#6B7280]">
                {filteredAttributes.length.toLocaleString("tr-TR")} kayıt
              </span>
            </div>

            <div className="divide-y divide-[#E7EAF0]">
              {filteredAttributes.map((attribute) => {
                const values = getSortedValues(attribute.values || []);
                const previewValues = values.slice(0, 8);
                const hiddenValues = values.slice(8);
                const isExpanded = expandedAttribute === attribute.id;
                const mode = getAttributeMode(values);
                const ModeIcon = mode.icon;
                const Icon = getIcon(attribute.slug);

                return (
                  <article key={attribute.id} className="bg-white px-5 py-4 transition hover:bg-[#FFF8F3]">
                    <div className="grid gap-4 min-[1180px]:grid-cols-[minmax(240px,0.95fr)_120px_minmax(280px,1.25fr)_150px_160px] min-[1180px]:items-center">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-[#DCE3EC] bg-[#F9F9F9] text-[#4B5563]">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <h3 className="truncate text-base font-semibold tracking-[-0.02em] text-[#111827]">
                              {attribute.name}
                            </h3>
                            <span
                              className={cn(
                                "inline-flex items-center text-xs font-semibold",
                                attribute.is_active !== false ? "text-[#109A48]" : "text-[#9CA3AF]",
                              )}
                            >
                              {attribute.is_active !== false ? "Aktif" : "Pasif"}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-xs font-medium text-[#8B95A5]">/{attribute.slug}</p>
                        </div>
                      </div>

                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8B95A5]">Değer</p>
                        <p className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[#111827]">
                          {values.length.toLocaleString("tr-TR")}
                        </p>
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap gap-2">
                          {previewValues.length > 0 ? (
                            previewValues.map((value) => (
                              <span
                                key={value.id}
                                className="inline-flex min-h-8 max-w-[180px] items-center gap-2 rounded-[8px] border border-[#E1E7EF] bg-[#F9F9F9] px-2.5 text-xs font-semibold text-[#4B5563]"
                              >
                                {value.image_url ? (
                                  <img
                                    src={value.image_url}
                                    alt={value.value}
                                    className="h-4 w-4 shrink-0 rounded border border-[#DCE3EC] object-cover"
                                  />
                                ) : value.color_code ? (
                                  <span
                                    className="h-3.5 w-3.5 shrink-0 rounded-full border border-[#DCE3EC]"
                                    style={{ backgroundColor: value.color_code }}
                                  />
                                ) : null}
                                <span className="truncate">{value.value}</span>
                              </span>
                            ))
                          ) : (
                            <span className="text-sm font-medium text-[#8B95A5]">Değer girilmemiş</span>
                          )}
                        </div>

                        {isExpanded && hiddenValues.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {hiddenValues.map((value) => (
                              <span
                                key={value.id}
                                className="inline-flex min-h-8 max-w-[180px] items-center gap-2 rounded-[8px] border border-[#E1E7EF] bg-white px-2.5 text-xs font-semibold text-[#4B5563]"
                              >
                                {value.image_url ? (
                                  <img
                                    src={value.image_url}
                                    alt={value.value}
                                    className="h-4 w-4 shrink-0 rounded border border-[#DCE3EC] object-cover"
                                  />
                                ) : value.color_code ? (
                                  <span
                                    className="h-3.5 w-3.5 shrink-0 rounded-full border border-[#DCE3EC]"
                                    style={{ backgroundColor: value.color_code }}
                                  />
                                ) : null}
                                <span className="truncate">{value.value}</span>
                              </span>
                            ))}
                          </div>
                        ) : null}

                        {hiddenValues.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => toggleExpand(attribute.id)}
                            aria-expanded={isExpanded}
                            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--admin-accent-hover)] transition hover:text-[var(--admin-accent)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.14)]"
                          >
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            {isExpanded ? "Gizle" : `+${hiddenValues.length} değer`}
                          </button>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2 text-sm font-semibold text-[#4B5563]">
                        <ModeIcon className="h-4 w-4 text-[#8B95A5]" />
                        {mode.label}
                      </div>

                      <div className="flex items-center justify-start gap-2 min-[1180px]:justify-end">
                        <button
                          type="button"
                          onClick={() => router.push(`/admin/urunler/nitelikler/${attribute.id}/duzenle`)}
                          aria-label={`${attribute.name} niteliğini düzenle`}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] border border-[#DCE3EC] bg-white text-[#1F2937] transition hover:border-[var(--admin-accent-border)] hover:text-[var(--admin-accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.14)]"
                          title="Düzenle"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(attribute.id)}
                          disabled={deleteLoading === attribute.id}
                          aria-label={`${attribute.name} niteliğini sil`}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] border border-[#FFD0CA] bg-white text-[#FF3B30] transition hover:bg-[#FFF4F2] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-100 disabled:cursor-not-allowed disabled:opacity-60"
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
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
