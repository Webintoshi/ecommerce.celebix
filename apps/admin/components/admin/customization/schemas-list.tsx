"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import type { CustomizationSchema } from "@/types/product-customization";
import { toast } from "sonner";
import { Copy, Edit3, Eye, Layers, Plus, Search, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SchemaWithCounts extends CustomizationSchema {
  step_count: number;
  product_count: number;
  category_count?: number;
}

interface CustomizationSchemasListProps {
  schemas: SchemaWithCounts[];
}

function getAssignmentCount(schema: SchemaWithCounts) {
  return (schema.product_count || 0) + (schema.category_count || 0);
}

function getAssignmentDetail(schema: SchemaWithCounts) {
  const productCount = schema.product_count || 0;
  const categoryCount = schema.category_count || 0;

  if (!productCount && !categoryCount) {
    return "Atama yok";
  }

  return `${productCount.toLocaleString("tr-TR")} ürün / ${categoryCount.toLocaleString("tr-TR")} kategori`;
}

function formatSchemaDate(value?: string | null) {
  if (!value) {
    return "Tarih yok";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Tarih yok";
  }

  return date.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function CustomizationSchemasList({ schemas }: CustomizationSchemasListProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteSchema, setDeleteSchema] = useState<SchemaWithCounts | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [localSchemas, setLocalSchemas] = useState<SchemaWithCounts[]>(schemas);

  const filteredSchemas = useMemo(() => {
    const query = searchQuery.toLocaleLowerCase("tr-TR").trim();

    return localSchemas.filter((schema) => {
      if (!query) {
        return true;
      }

      return (
        schema.name.toLocaleLowerCase("tr-TR").includes(query) ||
        schema.slug.toLocaleLowerCase("tr-TR").includes(query) ||
        schema.description?.toLocaleLowerCase("tr-TR").includes(query)
      );
    });
  }, [localSchemas, searchQuery]);

  const handleToggleActive = async (schema: SchemaWithCounts) => {
    try {
      const response = await fetch("/api/admin/customization/schemas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: schema.id, is_active: !schema.is_active }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result?.error || "Şema durumu güncellenemedi");
      }

      setLocalSchemas((prev) =>
        prev.map((current) =>
          current.id === schema.id ? { ...current, is_active: !current.is_active } : current,
        ),
      );
      toast.success(schema.is_active ? "Şema pasife alındı" : "Şema aktifleştirildi");
    } catch (error) {
      console.error("Error toggling schema:", error);
      toast.error("İşlem sırasında bir hata oluştu");
    }
  };

  const handleDuplicate = async (schema: SchemaWithCounts) => {
    try {
      const response = await fetch("/api/admin/customization/schemas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "duplicate", schemaId: schema.id }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result?.error || "Kopyalama sırasında bir hata oluştu");
      }

      toast.success("Şema başarıyla kopyalandı");
      router.refresh();
    } catch (error) {
      console.error("Error duplicating schema:", error);
      toast.error("Kopyalama sırasında bir hata oluştu");
    }
  };

  const handleDelete = async () => {
    if (!deleteSchema) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/admin/customization/schemas?id=${deleteSchema.id}`, {
        method: "DELETE",
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result?.error || "Silme işlemi başarısız");
      }

      setLocalSchemas((prev) => prev.filter((schema) => schema.id !== deleteSchema.id));
      toast.success("Şema başarıyla silindi");
    } catch (error) {
      console.error("Error deleting schema:", error);
      toast.error("Silme sırasında bir hata oluştu");
    } finally {
      setIsDeleting(false);
      setDeleteSchema(null);
    }
  };

  const activeSchemas = localSchemas.filter((schema) => schema.is_active).length;
  const filteredAssignments = filteredSchemas.reduce(
    (accumulator, schema) => accumulator + getAssignmentCount(schema),
    0,
  );

  if (localSchemas.length === 0) {
    return (
      <section className="rounded-[12px] border border-[#DCE3EC] bg-white px-6 py-14 text-center shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[16px] bg-[#FFF1E8] text-[var(--admin-accent)]">
          <Layers className="h-8 w-8" />
        </div>
        <h2 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-[#111827]">Henüz ekstra yok</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#6B7280]">
          Ürünlere ekstra seçim alanları eklemek için ilk şemanızı oluşturun.
        </p>
        <Link
          href="/admin/urunler/ekstralar/yeni"
          className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-[var(--admin-accent)] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(255,106,0,0.20)] transition hover:bg-[var(--admin-accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]"
        >
          <Plus className="h-4 w-4" />
          Yeni Ekstra
        </Link>
      </section>
    );
  }

  return (
    <>
      <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
        <div className="grid gap-3 border-b border-[#DCE3EC] bg-[#F9F9F9] p-4 min-[1180px]:grid-cols-[minmax(0,1fr)_auto] min-[1180px]:items-center">
          <label htmlFor="schema-search" className="relative block min-w-0 max-w-2xl">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7B8797]" />
            <input
              id="schema-search"
              type="search"
              placeholder="Ekstra veya bağlantı ara"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="h-11 w-full rounded-[10px] border border-[#DCE3EC] bg-white py-2 pl-11 pr-4 text-sm font-medium text-[#111827] outline-none transition placeholder:text-[#8B95A5] focus:border-[var(--admin-accent-border)] focus:ring-4 focus:ring-[rgba(255,106,0,0.14)]"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#6B7280]">
            <span className="inline-flex h-10 items-center rounded-[10px] border border-[#DCE3EC] bg-white px-3">
              {filteredSchemas.length.toLocaleString("tr-TR")} şema
            </span>
            <span className="inline-flex h-10 items-center rounded-[10px] border border-[#DCE3EC] bg-white px-3">
              {activeSchemas.toLocaleString("tr-TR")} aktif
            </span>
            <span className="inline-flex h-10 items-center rounded-[10px] border border-[#DCE3EC] bg-white px-3">
              {filteredAssignments.toLocaleString("tr-TR")} atama
            </span>
          </div>
        </div>

        {filteredSchemas.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[14px] bg-[#FFF1E8] text-[var(--admin-accent)]">
              <Search className="h-7 w-7" />
            </div>
            <h2 className="mt-5 text-xl font-semibold tracking-[-0.03em] text-[#111827]">Eşleşen ekstra yok</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#6B7280]">
              Farklı bir şema adı, bağlantı veya açıklama ile tekrar arayın.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden min-[1180px]:block">
              <div className="grid grid-cols-[minmax(240px,1.5fr)_120px_96px_132px_124px_184px] items-center gap-4 border-b border-[#DCE3EC] bg-[#EEF3F7] px-5 py-3 text-sm font-semibold text-[#4B5563]">
                <span>Ekstra</span>
                <span>Durum</span>
                <span>Adım</span>
                <span>Atama</span>
                <span>Güncelleme</span>
                <span className="text-right">İşlemler</span>
              </div>

              <div className="divide-y divide-[#E1E7EF]">
                {filteredSchemas.map((schema) => {
                  const assignmentCount = getAssignmentCount(schema);
                  const latestDate = schema.updated_at || schema.created_at;

                  return (
                    <div
                      key={schema.id}
                      className="grid grid-cols-[minmax(240px,1.5fr)_120px_96px_132px_124px_184px] items-center gap-4 px-5 py-4 text-sm transition hover:bg-[#FFF8F3]"
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/admin/urunler/ekstralar/${schema.id}`}
                          className="block truncate text-base font-semibold tracking-[-0.02em] text-[#111827] transition hover:text-[var(--admin-accent-hover)]"
                        >
                          {schema.name}
                        </Link>
                        <div className="mt-1 flex min-w-0 items-center gap-2 text-xs font-medium text-[#6B7280]">
                          <span className="truncate">/{schema.slug}</span>
                          {schema.description ? (
                            <>
                              <span className="text-[#CBD5E1]">•</span>
                              <span className="truncate">{schema.description}</span>
                            </>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "h-2.5 w-2.5 rounded-full",
                            schema.is_active ? "bg-[var(--admin-accent)]" : "bg-[#CBD5E1]",
                          )}
                        />
                        <span
                          className={cn(
                            "font-semibold",
                            schema.is_active ? "text-[var(--admin-accent-hover)]" : "text-[#6B7280]",
                          )}
                        >
                          {schema.is_active ? "Aktif" : "Pasif"}
                        </span>
                      </div>

                      <div>
                        <p className="text-lg font-semibold tracking-[-0.03em] text-[#111827]">
                          {schema.step_count.toLocaleString("tr-TR")}
                        </p>
                        <p className="text-xs font-medium text-[#6B7280]">alan</p>
                      </div>

                      <div>
                        <p className="text-lg font-semibold tracking-[-0.03em] text-[#111827]">
                          {assignmentCount.toLocaleString("tr-TR")}
                        </p>
                        <p className="truncate text-xs font-medium text-[#6B7280]">{getAssignmentDetail(schema)}</p>
                      </div>

                      <span className="text-sm font-medium text-[#6B7280]">{formatSchemaDate(latestDate)}</span>

                      <div className="flex items-center justify-end gap-2">
                        <Switch
                          checked={schema.is_active}
                          onCheckedChange={() => handleToggleActive(schema)}
                          aria-label={`${schema.name} şemasını ${schema.is_active ? "pasife al" : "aktifleştir"}`}
                        />
                        <Link
                          href={`/admin/urunler/ekstralar/${schema.id}/onizleme`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#DCE3EC] bg-white text-[#6B7280] transition hover:border-[var(--admin-accent-border)] hover:text-[var(--admin-accent-hover)]"
                          aria-label={`${schema.name} ön izle`}
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                        <Link
                          href={`/admin/urunler/ekstralar/${schema.id}`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#DCE3EC] bg-white text-[#1F2937] transition hover:border-[var(--admin-accent-border)] hover:text-[var(--admin-accent-hover)]"
                          aria-label={`${schema.name} düzenle`}
                        >
                          <Edit3 className="h-4 w-4" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => void handleDuplicate(schema)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#DCE3EC] bg-white text-[#6B7280] transition hover:border-[var(--admin-accent-border)] hover:text-[var(--admin-accent-hover)]"
                          aria-label={`${schema.name} kopyala`}
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteSchema(schema)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#FECACA] bg-white text-[#EF4444] transition hover:bg-[#FEF2F2]"
                          aria-label={`${schema.name} sil`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="divide-y divide-[#E1E7EF] min-[1180px]:hidden">
              {filteredSchemas.map((schema) => {
                const assignmentCount = getAssignmentCount(schema);
                const latestDate = schema.updated_at || schema.created_at;

                return (
                  <article key={schema.id} className="space-y-4 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/admin/urunler/ekstralar/${schema.id}`}
                          className="block truncate text-base font-semibold tracking-[-0.02em] text-[#111827]"
                        >
                          {schema.name}
                        </Link>
                        <p className="mt-1 truncate text-xs font-medium text-[#6B7280]">/{schema.slug}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "h-2.5 w-2.5 rounded-full",
                            schema.is_active ? "bg-[var(--admin-accent)]" : "bg-[#CBD5E1]",
                          )}
                        />
                        <span className="text-sm font-semibold text-[#4B5563]">
                          {schema.is_active ? "Aktif" : "Pasif"}
                        </span>
                      </div>
                    </div>

                    {schema.description ? (
                      <p className="text-sm leading-6 text-[#6B7280]">{schema.description}</p>
                    ) : null}

                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9CA3AF]">Adım</p>
                        <p className="mt-1 font-semibold text-[#111827]">{schema.step_count.toLocaleString("tr-TR")}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9CA3AF]">Atama</p>
                        <p className="mt-1 font-semibold text-[#111827]">{assignmentCount.toLocaleString("tr-TR")}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9CA3AF]">Tarih</p>
                        <p className="mt-1 font-semibold text-[#111827]">{formatSchemaDate(latestDate)}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Switch
                        checked={schema.is_active}
                        onCheckedChange={() => handleToggleActive(schema)}
                        aria-label={`${schema.name} şemasını ${schema.is_active ? "pasife al" : "aktifleştir"}`}
                      />
                      <Link
                        href={`/admin/urunler/ekstralar/${schema.id}`}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#1F2937]"
                      >
                        <Edit3 className="h-4 w-4" />
                        Düzenle
                      </Link>
                      <Link
                        href={`/admin/urunler/ekstralar/${schema.id}/onizleme`}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#6B7280]"
                      >
                        <Eye className="h-4 w-4" />
                        Ön izle
                      </Link>
                      <button
                        type="button"
                        onClick={() => void handleDuplicate(schema)}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#6B7280]"
                      >
                        <Copy className="h-4 w-4" />
                        Kopyala
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteSchema(schema)}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-[8px] border border-[#FECACA] bg-white px-3 text-sm font-semibold text-[#EF4444]"
                      >
                        <Trash2 className="h-4 w-4" />
                        Sil
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>

      <AlertDialog open={!!deleteSchema} onOpenChange={() => setDeleteSchema(null)}>
        <AlertDialogContent className="rounded-[12px] border-[#FECACA] bg-white shadow-[0_24px_70px_rgba(15,23,42,0.18)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-semibold tracking-[-0.03em] text-[#111827]">
              Şemayı silmek istediğinize emin misiniz?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-6 text-[#6B7280]">
              <strong>{deleteSchema?.name}</strong> şeması kalıcı olarak silinecektir. Bu işlem geri alınamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isDeleting}
              className="rounded-[8px] border-[#DCE3EC] text-[#4B5563] hover:border-[var(--admin-accent-border)] hover:text-[var(--admin-accent-hover)]"
            >
              İptal
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
              disabled={isDeleting}
              className="rounded-[8px] bg-[#EF4444] text-white hover:bg-[#DC2626]"
            >
              {isDeleting ? "Siliniyor..." : "Evet, Sil"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
