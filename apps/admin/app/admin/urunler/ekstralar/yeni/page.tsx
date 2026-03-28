// =====================================================
// ADMIN - CREATE NEW CUSTOMIZATION SCHEMA
// /admin/urunler/ekstralar/yeni
// =====================================================

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import Link from "next/link";
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
    <div className="container mx-auto py-8 px-4 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link href="/admin/urunler/ekstralar">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Yeni Kişiselleştirme Şeması
          </h1>
          <p className="text-gray-600">
            Ürün kişiselleştirme için yeni bir şema oluşturun
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>Temel Bilgiler</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">
                Şema Adı <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                placeholder="Örn: Telefon Kılıfı Kişiselleştirme"
                {...register("name", { onChange: handleNameChange })}
              />
              {errors.name && (
                <p className="text-sm text-red-500">{errors.name.message}</p>
              )}
            </div>

            {/* Slug */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="slug">
                  URL Slug <span className="text-red-500">*</span>
                </Label>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={autoSlug}
                    onCheckedChange={setAutoSlug}
                    id="auto-slug"
                  />
                  <Label htmlFor="auto-slug" className="text-sm text-gray-600">
                    Otomatik oluştur
                  </Label>
                </div>
              </div>
              <Input
                id="slug"
                placeholder="telefon-kilifi-kisisellestirme"
                {...register("slug")}
                disabled={autoSlug}
              />
              <p className="text-sm text-gray-500">
                URL-friendly benzersiz tanımlayıcı. Sadece küçük harf, rakam ve tire.
              </p>
              {errors.slug && (
                <p className="text-sm text-red-500">{errors.slug.message}</p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Açıklama</Label>
              <Textarea
                id="description"
                placeholder="Bu şemanın amacını ve kullanım alanını açıklayın..."
                rows={3}
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
              <Label htmlFor="submitText">Buton Metni</Label>
              <Input
                id="submitText"
                placeholder="Sepete Ekle"
                {...register("settings.submit_button_text")}
              />
              <p className="text-sm text-gray-500">
                Formdaki gönder butonunda görünecek metin.
              </p>
            </div>

            {/* Success Message */}
            <div className="space-y-2">
              <Label htmlFor="successMessage">Başarı Mesajı</Label>
              <Input
                id="successMessage"
                placeholder="Ürün sepete eklendi"
                {...register("settings.success_message")}
              />
              <p className="text-sm text-gray-500">
                Ürün sepete eklendikten sonra gösterilecek mesaj.
              </p>
            </div>

            {/* Settings */}
            <div className="space-y-4 pt-4 border-t border-gray-100">
              <h3 className="font-medium text-gray-900">Görünüm Ayarları</h3>
              
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Özet Göster</Label>
                  <p className="text-sm text-gray-500">
                    Seçimlerin özetini formun altında göster
                  </p>
                </div>
                <Switch
                  defaultChecked={true}
                  onCheckedChange={(checked) => setValue("settings.show_summary", checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Fiyat Detayını Göster</Label>
                  <p className="text-sm text-gray-500">
                    Fiyat hesaplama detayını göster
                  </p>
                </div>
                <Switch
                  defaultChecked={true}
                  onCheckedChange={(checked) => setValue("settings.show_price_breakdown", checked)}
                />
              </div>
            </div>

            {/* Submit */}
            <div className="flex items-center justify-end gap-4 pt-4 border-t border-gray-100">
              <Link href="/admin/urunler/ekstralar">
                <Button type="button" variant="outline">
                  İptal
                </Button>
              </Link>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-amber-600 hover:bg-amber-700"
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
  );
}

