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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  createSchemaRequestSchema,
  generateSlug,
} from "@/lib/validations/product-customization";
import type { CreateSchemaRequest } from "@/types/product-customization";

export default function NewSchemaPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [autoSlug, setAutoSlug] = useState(true);
  const warmFieldClassName =
    "border-[#e7d8ca] bg-white/90 shadow-[0_10px_25px_rgba(120,78,44,0.08)] transition focus-visible:border-[var(--admin-accent-border)] focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.15)]";

  const {
    register,
    handleSubmit,
    setValue,
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
    <main className="min-h-screen bg-gradient-to-br from-[#faf8f5] via-[#f5efe8] to-[#efe5dc]">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="hidden" />
        <div className="hidden" />
        <div className="hidden" />
      </div>

      <div className="relative mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-8 lg:px-8">
        <div className="space-y-6">
          <section className="overflow-hidden rounded-[30px] border border-[var(--admin-border)] bg-white shadow-[var(--shadow-md)]">
            <div className="border-b border-[var(--admin-border)] px-5 py-5 md:px-8 md:py-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3 md:gap-4">
                  <div className="space-y-3">
                    <div className="inline-flex w-fit items-center rounded-full border border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--admin-accent)]">
                      Yeni ekstra semasi
                    </div>
                    <h1 className="sr-only">Yeni Kişiselleştirme Şeması</h1>
                    <p className="max-w-2xl text-sm leading-6 text-[#786658]">
                      Yeni sema icin temel alanlari, URL kimligini ve gorunum davranislarini sicak panel stiliyle hazirlayin.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#7d6a5d]">
                  <span className="rounded-full border border-[#ebdccc] bg-white px-3 py-1.5 shadow-sm">
                    Slug modu: {autoSlug ? "Otomatik" : "Manuel"}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <form onSubmit={handleSubmit(onSubmit)}>
            <Card className="rounded-[30px] border border-[var(--admin-border)] bg-gradient-to-br from-white/95 via-[#fffdfa] to-[#f6eee6] shadow-[0_24px_55px_rgba(98,64,33,0.09)]">
              <CardHeader className="border-b border-[#efdfd1] px-5 py-5 md:px-6">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--admin-accent)]">Kurulum</p>
                  <CardTitle className="text-xl text-[var(--admin-heading)]">Temel bilgiler</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 px-5 py-5 md:px-6 md:py-6">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name" className="text-[#5f4636]">
                Şema Adı <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                placeholder="Örn: Telefon Kılıfı Kişiselleştirme"
                className={warmFieldClassName}
                {...register("name", { onChange: handleNameChange })}
              />
              {errors.name && (
                <p className="text-sm text-red-500">{errors.name.message}</p>
              )}
            </div>

            {/* Slug */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="slug" className="text-[#5f4636]">
                  URL Slug <span className="text-red-500">*</span>
                </Label>
                <div className="flex items-center gap-2 rounded-full border border-[#ebdccc] bg-white px-3 py-1.5 shadow-sm">
                  <Switch
                    checked={autoSlug}
                    onCheckedChange={setAutoSlug}
                    id="auto-slug"
                    className="data-[state=checked]:bg-[var(--admin-accent)]"
                  />
                  <Label htmlFor="auto-slug" className="text-sm text-[#7d6a5d]">
                    Otomatik oluştur
                  </Label>
                </div>
              </div>
              <Input
                id="slug"
                placeholder="telefon-kilifi-kisisellestirme"
                className={warmFieldClassName}
                {...register("slug")}
                disabled={autoSlug}
              />
              <p className="text-sm text-[#8b6d58]">
                URL-friendly benzersiz tanımlayıcı. Sadece küçük harf, rakam ve tire.
              </p>
              {errors.slug && (
                <p className="text-sm text-red-500">{errors.slug.message}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description" className="text-[#5f4636]">Açıklama</Label>
              <Textarea
                id="description"
                placeholder="Bu şemanın amacını ve kullanım alanını açıklayın..."
                rows={3}
                className={warmFieldClassName}
                {...register("description")}
              />
              {errors.description && (
                <p className="text-sm text-red-500">
                  {errors.description.message}
                </p>
              )}
            </div>

            {/* Submit Button Text */}
            <div className="space-y-2">
              <Label htmlFor="submitText" className="text-[#5f4636]">Buton Metni</Label>
              <Input
                id="submitText"
                placeholder="Sepete Ekle"
                className={warmFieldClassName}
                {...register("settings.submit_button_text")}
              />
              <p className="text-sm text-[#8b6d58]">
                Formdaki gönder butonunda görünecek metin.
              </p>
            </div>

            {/* Success Message */}
            <div className="space-y-2">
              <Label htmlFor="successMessage" className="text-[#5f4636]">Başarı Mesajı</Label>
              <Input
                id="successMessage"
                placeholder="Ürün sepete eklendi"
                className={warmFieldClassName}
                {...register("settings.success_message")}
              />
              <p className="text-sm text-[#8b6d58]">
                Ürün sepete eklendikten sonra gösterilecek mesaj.
              </p>
            </div>

            {/* Settings */}
            <div className="rounded-[26px] border border-[#efdfd1] bg-gradient-to-r from-[#fffaf6] to-white p-4 shadow-inner">
              <div className="space-y-4">
                <h3 className="font-medium text-[var(--admin-heading)]">Görünüm Ayarları</h3>
              
                <div className="flex items-start justify-between gap-4 rounded-2xl border border-[var(--admin-border)] bg-white/90 px-4 py-3 shadow-sm">
                  <div>
                    <Label className="text-base text-[var(--admin-heading)]">Özet Göster</Label>
                    <p className="text-sm text-[#8b6d58]">
                      Seçimlerin özetini formun altında göster
                    </p>
                  </div>
                  <Switch
                    defaultChecked={true}
                    onCheckedChange={(checked) => setValue("settings.show_summary", checked)}
                    className="data-[state=checked]:bg-[var(--admin-accent)]"
                  />
                </div>

                <div className="flex items-start justify-between gap-4 rounded-2xl border border-[var(--admin-border)] bg-white/90 px-4 py-3 shadow-sm">
                  <div>
                    <Label className="text-base text-[var(--admin-heading)]">Fiyat Detayını Göster</Label>
                    <p className="text-sm text-[#8b6d58]">
                      Fiyat hesaplama detayını göster
                    </p>
                  </div>
                  <Switch
                    defaultChecked={true}
                    onCheckedChange={(checked) => setValue("settings.show_price_breakdown", checked)}
                    className="data-[state=checked]:bg-[var(--admin-accent)]"
                  />
                </div>
              </div>
            </div>

            {/* Submit */}
            <div className="flex flex-col-reverse gap-3 border-t border-[#efdfd1] pt-5 sm:flex-row sm:items-center sm:justify-end">
              <Link href="/admin/urunler/ekstralar">
                <Button type="button" variant="outline" className="w-full rounded-2xl border-[var(--admin-accent-border)] bg-white px-5 py-3 text-[var(--admin-accent-hover)] shadow-sm transition hover:border-[var(--admin-accent-border)] hover:bg-[var(--admin-accent-soft)] focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)] sm:w-auto">
                  İptal
                </Button>
              </Link>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-2xl bg-[var(--admin-accent)] px-5 py-3 text-white shadow-[var(--shadow-md)] transition hover:bg-[var(--admin-accent-hover)] focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)] sm:w-auto"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Oluşturuluyor...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Devam Et
                  </>
                )}
              </Button>
            </div>
              </CardContent>
            </Card>
          </form>
        </div>
      </div>
    </main>
  );
}
