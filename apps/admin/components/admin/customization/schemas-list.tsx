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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { CustomizationSchema } from "@/types/product-customization";
import { toast } from "sonner";
import {
  Copy,
  Edit,
  Eye,
  Layers,
  MoreVertical,
  Package,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface SchemaWithCounts extends CustomizationSchema {
  step_count: number;
  product_count: number;
  category_count?: number;
}

interface CustomizationSchemasListProps {
  schemas: SchemaWithCounts[];
}

const ANIMATION_EASE = [0.22, 1, 0.36, 1] as const;

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
    (accumulator, schema) => accumulator + (schema.product_count || 0) + (schema.category_count || 0),
    0,
  );

  if (localSchemas.length === 0) {
    return (
      <section className="rounded-[30px] border border-[var(--admin-border)] bg-white p-10 text-center shadow-[0_24px_55px_rgba(98,64,33,0.08)]">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[28px] bg-gradient-to-br from-[#fff0e3] to-[#f6deca] shadow-[var(--shadow-md)]">
          <Layers className="h-9 w-9 text-[var(--admin-accent)]" />
        </div>
        <div className="mx-auto mt-6 max-w-xl space-y-3">
          <h3 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--admin-heading)]">Henüz şema oluşturulmadı</h3>
          <p className="text-sm leading-7 text-[var(--admin-text-secondary)]">
            Ürünlere ekstra seçim alanları eklemek için ilk şemanızı oluşturun. Oluşturulan şemalar ürün ve kategori bazında atanabilir.
          </p>
        </div>
        <Link
          href="/admin/urunler/ekstralar/yeni"
          className="mt-6 inline-flex items-center gap-2 rounded-[20px] bg-gradient-to-r from-[#FF6A00] to-[#e85a00] px-5 py-3 text-sm font-semibold text-white shadow-[var(--shadow-md)] transition hover:translate-y-[-1px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)]"
        >
          <Plus className="h-4 w-4" />
          İlk Şemayı Oluştur
        </Link>
      </section>
    );
  }

  return (
    <>
      <section className="rounded-[30px] border border-[var(--admin-border)] bg-gradient-to-br from-white/95 via-[#fffdfa] to-[#f6eee6] p-5 shadow-[0_24px_55px_rgba(98,64,33,0.09)] md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#ad7c56]">Tarama ve düzenleme</p>
            <h2 className="text-xl font-semibold tracking-[-0.03em] text-[var(--admin-heading)]">Şema listesi</h2>
            <p className="text-sm leading-6 text-[#786658]">
              Şemaları ad, bağlantı ve açıklama üzerinden filtreleyin; durumu yönetin, ön izleyin ve ilgili akışa geçin.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#7d6a5d]">
            <span className="rounded-full border border-[#ebdccc] bg-white px-3 py-1.5 shadow-sm">
              Aktif şema: {activeSchemas}
            </span>
            <span className="rounded-full border border-[#ebdccc] bg-white px-3 py-1.5 shadow-sm">
              Görünen atama: {filteredAssignments}
            </span>
          </div>
        </div>

        <div className="mt-5 rounded-[26px] border border-[#efdfd1] bg-gradient-to-r from-[#fffaf6] to-white p-3 shadow-inner sm:p-4">
          <div className="relative max-w-xl">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#b08d73]" />
            <Input
              placeholder="Şema ara..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full rounded-[20px] border border-[var(--admin-border)] bg-white pl-11 pr-4 py-3 text-sm text-[var(--admin-heading)] shadow-[var(--shadow-md)] outline-none transition placeholder:text-[var(--admin-text-muted)] focus:border-[var(--admin-accent-border)] focus:ring-4 focus:ring-[var(--admin-accent)]/15"
            />
          </div>
        </div>
      </section>

      {filteredSchemas.length === 0 ? (
        <section className="rounded-[30px] border border-dashed border-[#ead8c8] bg-gradient-to-br from-white via-[#fffdfa] to-[#f8efe6] p-10 text-center shadow-[0_24px_55px_rgba(98,64,33,0.08)]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[24px] bg-[#fff1e7] text-[var(--admin-accent)] shadow-sm">
            <Search className="h-7 w-7" />
          </div>
          <h3 className="mt-5 text-lg font-semibold text-[var(--admin-heading)]">Aramanızla eşleşen şema bulunamadı</h3>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#7a6859]">
            Farklı bir şema adı, açıklama veya bağlantı deneyin. Liste davranışı değişmeden yalnızca mevcut sonuçlar filtrelenir.
          </p>
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredSchemas.map((schema, index) => {
            const assignmentCount = (schema.product_count || 0) + (schema.category_count || 0);

            return (
              <motion.article
                key={schema.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: index * 0.04, ease: ANIMATION_EASE }}
                className={cn(
                  "overflow-hidden rounded-[28px] border bg-white shadow-[0_18px_55px_rgba(72,36,8,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_60px_rgba(72,36,8,0.12)]",
                  schema.is_active ? "border-[var(--admin-border)]" : "border-[#efe3d8] opacity-85"
                )}
              >
                <div className="border-b border-[#f0e1d5] px-5 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-lg font-semibold tracking-[-0.02em] text-[var(--admin-heading)]">
                          {schema.name}
                        </h3>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]",
                            schema.is_active
                              ? "border-emerald-200 bg-emerald-100/90 text-emerald-700"
                              : "border-stone-200 bg-stone-100/90 text-stone-600"
                          )}
                        >
                          {schema.is_active ? "Aktif" : "Pasif"}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-[#776557]">/{schema.slug}</p>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-10 w-10 rounded-2xl border border-[#ead9cb] bg-white p-0 text-[#6d5849] shadow-sm transition hover:border-[var(--admin-accent-border)] hover:text-[var(--admin-accent)]"
                          aria-label={`${schema.name} şeması için işlemleri aç`}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="rounded-2xl border-[var(--admin-border)] bg-white shadow-[0_24px_55px_rgba(72,36,8,0.12)]">
                        <Link href={`/admin/urunler/ekstralar/${schema.id}`}>
                          <DropdownMenuItem className="cursor-pointer rounded-xl text-[#4f3d31] focus:bg-[#fff3e8] focus:text-[var(--admin-accent-hover)]">
                            <Edit className="mr-2 h-4 w-4" />
                            Düzenle
                          </DropdownMenuItem>
                        </Link>
                        <Link href={`/admin/urunler/ekstralar/${schema.id}/onizleme`}>
                          <DropdownMenuItem className="cursor-pointer rounded-xl text-[#4f3d31] focus:bg-[#fff3e8] focus:text-[var(--admin-accent-hover)]">
                            <Eye className="mr-2 h-4 w-4" />
                            Ön izleme
                          </DropdownMenuItem>
                        </Link>
                        <DropdownMenuItem onClick={() => handleDuplicate(schema)} className="cursor-pointer rounded-xl text-[#4f3d31] focus:bg-[#fff3e8] focus:text-[var(--admin-accent-hover)]">
                          <Copy className="mr-2 h-4 w-4" />
                          Kopyala
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setDeleteSchema(schema)}
                          className="cursor-pointer rounded-xl text-rose-600 focus:bg-rose-50 focus:text-rose-600"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Sil
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <div className="space-y-4 p-5">
                  <p className="min-h-[48px] text-sm leading-6 text-[#6c5748]">
                    {schema.description?.trim() || "Bu şema için henüz açıklama eklenmedi."}
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-[22px] border border-stone-200 bg-white/85 p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">Adım sayısı</p>
                      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[var(--admin-heading)]">{schema.step_count}</p>
                    </div>
                    <div className="rounded-[22px] border border-stone-200 bg-white/85 p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">Toplam atama</p>
                      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[var(--admin-heading)]">{assignmentCount}</p>
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-[#eadfd5] bg-[#FCFDFE] p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-[#4f3d31]">Yayın durumu</p>
                        <p className="mt-1 text-sm text-[#7a6859]">
                          {schema.is_active ? "Şema şu anda kullanımda." : "Şema geçici olarak pasif durumda."}
                        </p>
                      </div>
                      <Switch
                        checked={schema.is_active}
                        onCheckedChange={() => handleToggleActive(schema)}
                        aria-label={`${schema.name} şemasını ${schema.is_active ? "pasife al" : "aktifleştir"}`}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Link href={`/admin/urunler/ekstralar/${schema.id}`} className="flex-1">
                      <Button className="h-11 w-full rounded-2xl bg-[var(--admin-accent)] text-white shadow-[var(--shadow-md)] hover:bg-[var(--admin-accent-hover)]">
                        Düzenle
                      </Button>
                    </Link>
                    <Link href={`/admin/urunler/ekstralar/${schema.id}/onizleme`} className="flex-1">
                      <Button variant="outline" className="h-11 w-full rounded-2xl border-[#ead9cb] bg-white text-[#6d5849] shadow-sm hover:border-[var(--admin-accent-border)] hover:text-[var(--admin-accent)]">
                        Ön İzle
                      </Button>
                    </Link>
                  </div>

                  <div className="rounded-[22px] border border-[#eadfd5] bg-white/85 p-4 shadow-sm">
                    <div className="flex items-center gap-2 text-sm font-medium text-[#6d5849]">
                      <ShieldCheck className="h-4 w-4 text-[var(--admin-accent)]" />
                      Kullanım notu
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#7a6859]">
                      Şemayı aktifleştirmek, ürün ve kategori eşleşmelerinde görünürlüğü doğrudan etkiler.
                    </p>
                  </div>
                </div>
              </motion.article>
            );
          })}
        </section>
      )}

      <AlertDialog open={!!deleteSchema} onOpenChange={() => setDeleteSchema(null)}>
        <AlertDialogContent className="rounded-[28px] border-[#efd9d3] bg-gradient-to-br from-white via-[#fffdfa] to-[#fbf1ef] shadow-[0_34px_90px_rgba(52,34,18,0.28)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-semibold tracking-[-0.03em] text-[#2f1e18]">
              Şemayı silmek istediğinize emin misiniz?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-6 text-[#7e675d]">
              <strong>{deleteSchema?.name}</strong> şeması kalıcı olarak silinecektir. Bu işlem geri alınamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting} className="rounded-2xl border-[#ead9cb] text-[#654c3c] hover:border-[var(--admin-accent-border)] hover:text-[var(--admin-accent)]">
              İptal
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="rounded-2xl bg-gradient-to-r from-[#d55649] to-[#c44639] text-white shadow-[0_18px_30px_rgba(213,86,73,0.24)] hover:from-[#c94a3d] hover:to-[#b63d32]"
            >
              {isDeleting ? "Siliniyor..." : "Evet, Sil"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
