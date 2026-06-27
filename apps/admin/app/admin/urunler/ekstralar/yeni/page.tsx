// =====================================================
// ADMIN - CREATE NEW CUSTOMIZATION SCHEMA
// /admin/urunler/ekstralar/yeni
// =====================================================

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { AdminPageHeader } from "@/components/admin/AdminPageShell";
import { PublishStatusSwitch } from "@/components/admin/PublishStatusSwitch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Save, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import {
  createSchemaRequestSchema,
  generateSlug,
} from "@/lib/validations/product-customization";
import type { CreateSchemaRequest } from "@/types/product-customization";

const FORM_ID = "new-extra-schema-form";

export default function NewSchemaPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [autoSlug, setAutoSlug] = useState(true);
  const fieldClassName =
    "h-11 rounded-[10px] border-[#DCE3EC] bg-white text-sm font-medium text-[#111827] shadow-none transition placeholder:text-[#8B95A5] focus-visible:border-[var(--admin-accent-border)] focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.14)]";
  const labelClassName = "text-sm font-semibold text-[#374151]";
  const helperClassName = "text-xs font-medium leading-5 text-[#6B7280]";
  const errorClassName = "text-xs font-semibold text-[#EF4444]";

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateSchemaRequest>({
    resolver: zodResolver(createSchemaRequestSchema),
    defaultValues: {
      settings: {
        show_summary: true,
        show_price_breakdown: true,
        allow_multiple: false,
        submit_button_text: "Sepete Ekle",
        success_message: "Ürün sepete eklendi",
      },
    },
  });
  const currentName = watch("name");
  const showSummary = watch("settings.show_summary");
  const showPriceBreakdown = watch("settings.show_price_breakdown");

  // Auto-generate slug from name
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setValue("name", newName);
    if (autoSlug) {
      setValue("slug", generateSlug(newName));
    }
  };

  const onSubmit = async (data: CreateSchemaRequest) => {
    setIsSubmitting(true);
    try {
      // Generate slug if not provided
      const slug = data.slug || generateSlug(data.name);

      const response = await fetch("/api/admin/customization/schemas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: data.name,
          description: data.description,
          slug,
          settings: data.settings || {},
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        if (String(result?.error || "").includes("23505")) {
          toast.error("Bu slug zaten kullanılıyor. Lütfen farklı bir isim deneyin.");
        } else {
          throw new Error(result?.error || "Şema oluşturulamadı");
        }
        return;
      }

      toast.success("Şema başarıyla oluşturuldu");
      router.push(`/admin/urunler/ekstralar/${result.schema.id}`);
    } catch (error) {
      console.error("Error creating schema:", error);
      toast.error("Şema oluşturulurken bir hata oluştu");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#F9F9F9] pb-8 text-[var(--admin-heading)]">
      <div className="mx-auto w-full max-w-none space-y-4 px-4 sm:px-5 xl:px-6">
        <AdminPageHeader
          sectionLabel="Katalog"
          title="Yeni Ekstra"
          description="Ürünlerde kullanılacak ekstra seçim akışını oluşturun."
          actions={
            <>
              <Link
                href="/admin/urunler/ekstralar"
                className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[#DCE3EC] bg-white px-4 text-sm font-semibold text-[#374151] transition hover:border-[var(--admin-accent-border)] hover:text-[var(--admin-accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.16)]"
              >
                İptal
              </Link>
              <button
                type="submit"
                form={FORM_ID}
                disabled={isSubmitting}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-[var(--admin-accent)] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(255,106,0,0.20)] transition hover:bg-[var(--admin-accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Kaydediliyor
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Devam Et
                  </>
                )}
              </button>
            </>
          }
        />

        <form id={FORM_ID} onSubmit={handleSubmit(onSubmit)} className="grid gap-4 min-[1180px]:grid-cols-[minmax(0,1fr)_360px]">
          <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
            <div className="border-b border-[#DCE3EC] bg-[#EEF3F7] px-5 py-4">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#4B5563]">Temel bilgiler</h2>
            </div>

            <div className="grid gap-5 p-5 xl:grid-cols-2 xl:p-6">
              <div className="space-y-2 xl:col-span-2">
                <Label htmlFor="name" className={labelClassName}>
                  Ekstra adı <span className="text-[#EF4444]">*</span>
                </Label>
                <Input
                  id="name"
                  placeholder="Örn: Telefon kılıfı kişiselleştirme"
                  className={fieldClassName}
                  {...register("name", { onChange: handleNameChange })}
                />
                {errors.name ? <p className={errorClassName}>{errors.name.message}</p> : null}
              </div>

              <div className="space-y-2 xl:col-span-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <Label htmlFor="slug" className={labelClassName}>
                    Bağlantı adı <span className="text-[#EF4444]">*</span>
                  </Label>
                  <div
                    className="inline-flex w-fit items-center gap-2 rounded-[10px] border border-[#DCE3EC] bg-white px-3 py-2 text-xs font-semibold text-[#6B7280]"
                  >
                    <PublishStatusSwitch
                      checked={autoSlug}
                      onChange={(checked) => {
                        setAutoSlug(checked);
                        if (checked) {
                          setValue("slug", generateSlug(currentName || ""));
                        }
                      }}
                      id="auto-slug"
                      aria-label="Bağlantı adını otomatik oluştur"
                      labelVisible={false}
                    />
                    <Label htmlFor="auto-slug" className="cursor-pointer text-xs font-semibold text-[#6B7280]">
                      Otomatik
                    </Label>
                  </div>
                </div>
                <Input
                  id="slug"
                  placeholder="telefon-kilifi-kisisellestirme"
                  className={fieldClassName}
                  {...register("slug")}
                  readOnly={autoSlug}
                />
                <p className={helperClassName}>Küçük harf, rakam ve tire kullanılır.</p>
                {errors.slug ? <p className={errorClassName}>{errors.slug.message}</p> : null}
              </div>

              <div className="space-y-2 xl:col-span-2">
                <Label htmlFor="description" className={labelClassName}>
                  Açıklama
                </Label>
                <Textarea
                  id="description"
                  placeholder="Kısa kullanım notu"
                  rows={3}
                  className={`${fieldClassName} min-h-[96px] resize-none py-3`}
                  {...register("description")}
                />
                {errors.description ? <p className={errorClassName}>{errors.description.message}</p> : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="submitText" className={labelClassName}>
                  Buton metni
                </Label>
                <Input
                  id="submitText"
                  placeholder="Sepete Ekle"
                  className={fieldClassName}
                  {...register("settings.submit_button_text")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="successMessage" className={labelClassName}>
                  Başarı mesajı
                </Label>
                <Input
                  id="successMessage"
                  placeholder="Ürün sepete eklendi"
                  className={fieldClassName}
                  {...register("settings.success_message")}
                />
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
              <div className="border-b border-[#DCE3EC] bg-[#EEF3F7] px-5 py-4">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-[var(--admin-accent)]" />
                  <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#4B5563]">Görünüm</h2>
                </div>
              </div>

              <div className="divide-y divide-[#E1E7EF]">
                <div className="flex items-center justify-between gap-4 px-5 py-4">
                  <span>
                    <Label htmlFor="show-summary" className="block cursor-pointer text-sm font-semibold text-[#111827]">
                      Özet
                    </Label>
                    <span className="mt-1 block text-xs font-medium text-[#6B7280]">Seçimleri form altında göster.</span>
                  </span>
                  <PublishStatusSwitch
                    id="show-summary"
                    checked={showSummary ?? true}
                    onChange={(checked) => setValue("settings.show_summary", checked, { shouldDirty: true })}
                    aria-label="Özet göster"
                    labelVisible={false}
                  />
                </div>

                <div className="flex items-center justify-between gap-4 px-5 py-4">
                  <span>
                    <Label htmlFor="show-price-breakdown" className="block cursor-pointer text-sm font-semibold text-[#111827]">
                      Fiyat detayı
                    </Label>
                    <span className="mt-1 block text-xs font-medium text-[#6B7280]">Hesaplama satırlarını göster.</span>
                  </span>
                  <PublishStatusSwitch
                    id="show-price-breakdown"
                    checked={showPriceBreakdown ?? true}
                    onChange={(checked) => setValue("settings.show_price_breakdown", checked, { shouldDirty: true })}
                    aria-label="Fiyat detayını göster"
                    labelVisible={false}
                  />
                </div>
              </div>
            </section>

            <section className="rounded-[12px] border border-[#DCE3EC] bg-white p-5 text-sm font-medium leading-6 text-[#6B7280] shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
              <p className="font-semibold text-[#111827]">Sonraki adım</p>
              <p className="mt-1">Kaydettikten sonra ekstra alanlarını ve seçeneklerini düzenleme ekranında ekleyebilirsiniz.</p>
            </section>
          </aside>
        </form>
      </div>
    </main>
  );
}
