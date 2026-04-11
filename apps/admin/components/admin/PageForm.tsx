"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Save,
  ArrowLeft,
  Eye,
  Settings,
  FileText,
  Clock,
  Globe,
  CheckCircle2,
  FileEdit,
  Archive,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import type { CmsPage } from "@/types/cms";

interface PageFormProps {
  initialData?: CmsPage;
  template?: {
    title: string;
    slug: string;
    metaTitle?: string;
    metaDescription?: string;
    schemaType?: string;
    icon?: string;
    sortOrder?: number;
  };
  lockTitle?: boolean;
  lockSlug?: boolean;
  backHref?: string;
  formTitle?: string;
  formDescription?: string;
}

const DEFAULT_FORM_DATA: CmsPage = {
  id: "",
  title: "",
  slug: "",
  content: "",
  status: "published",
  metaTitle: "",
  metaDescription: "",
  updatedAt: new Date(),
};

export function PageForm({
  initialData,
  template,
  lockTitle = false,
  lockSlug = false,
  backHref = "/admin/cms/sayfalar",
  formTitle,
  formDescription,
}: PageFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const pageBaseUrl = `${STORE_RUNTIME.storefrontUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}/`;
  const [formData, setFormData] = useState<CmsPage>(
    initialData || {
      ...DEFAULT_FORM_DATA,
      title: template?.title || DEFAULT_FORM_DATA.title,
      slug: template?.slug || DEFAULT_FORM_DATA.slug,
      metaTitle: template?.metaTitle || DEFAULT_FORM_DATA.metaTitle,
      metaDescription: template?.metaDescription || DEFAULT_FORM_DATA.metaDescription,
    },
  );

  function generateSlug(title: string) {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);

    try {
      const payload = {
        name: formData.title.trim(),
        slug: formData.slug.trim(),
        seo_title: formData.metaTitle.trim() || null,
        seo_description: formData.metaDescription.trim() || null,
        content: formData.content,
        status: formData.status,
        is_active: formData.status === "published",
        schema_type: template?.schemaType,
        icon: template?.icon,
        sort_order: template?.sortOrder,
      };

      const response = await fetch("/api/pages", {
        method: initialData ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          initialData
            ? { id: initialData.id, ...payload }
            : payload,
        ),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Sayfa kaydedilemedi");
      }

      toast.success(initialData ? "Sayfa guncellendi" : "Sayfa olusturuldu");
      router.push(backHref);
      router.refresh();
    } catch (error) {
      console.error("CMS page save error:", error);
      toast.error(error instanceof Error ? error.message : "Sayfa kaydedilemedi");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="space-y-8" onSubmit={handleSubmit}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href={backHref}
            className="rounded-lg border border-transparent p-2 transition-colors hover:border-gray-200 hover:bg-white"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              {formTitle || (initialData ? "Sayfayi Duzenle" : "Yeni Sayfa Ekle")}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {formDescription || "Bu sabit sayfanin icerigini, SEO metinlerini ve yayin durumunu yonetin."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowPreview((prev) => !prev)}
            className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
              showPreview
                ? "border-gray-300 bg-gray-100 text-gray-900"
                : "border-gray-200 bg-white text-gray-600 shadow-sm hover:border-gray-900 hover:text-gray-900"
            }`}
          >
            <Eye className="h-4 w-4" />
            {showPreview ? "Duzenlemeye Don" : "Onizleme"}
          </button>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-6 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {initialData ? "Degisiklikleri Kaydet" : "Yayinla"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {showPreview ? (
            <div className="min-h-[600px] rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
              <h1 className="mb-4 text-3xl font-bold text-gray-900">
                {formData.title || "Basliksiz Sayfa"}
              </h1>
              <p className="mb-6 text-sm text-gray-500">{pageBaseUrl}{formData.slug}</p>
              <div
                className="prose prose-neutral max-w-none text-gray-700 [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-bold [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold [&_ol]:pl-6 [&_ul]:pl-6"
                dangerouslySetInnerHTML={{
                  __html: formData.content || "<p>Henuz icerik girilmedi.</p>",
                }}
              />
            </div>
          ) : (
            <>
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-100 bg-gray-50/50 p-6">
                  <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                    <FileText className="h-4 w-4 text-gray-500" />
                    Sayfa Tanimi
                  </h3>
                </div>

                <div className="space-y-6 p-6">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Sayfa Basligi</label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(event) => {
                        if (lockTitle) {
                          return;
                        }

                        const nextTitle = event.target.value;
                        setFormData((prev) => ({
                          ...prev,
                          title: nextTitle,
                          slug: initialData || lockSlug ? prev.slug : generateSlug(nextTitle),
                        }));
                      }}
                      placeholder="Orn: Hakkimizda"
                      disabled={lockTitle}
                      className="w-full rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Baglanti (Slug)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">{pageBaseUrl}</span>
                      <input
                        type="text"
                        value={formData.slug}
                        onChange={(event) => {
                          if (lockSlug) {
                            return;
                          }

                          setFormData((prev) => ({ ...prev, slug: event.target.value }));
                        }}
                        disabled={lockSlug}
                        className="w-full rounded-lg border border-gray-200 py-2 pl-24 pr-4 font-mono text-sm transition-all focus:outline-none focus:ring-2 focus:ring-gray-900"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">İçerik</label>
                    <RichTextEditor
                      value={formData.content}
                      onChange={(value) => setFormData((prev) => ({ ...prev, content: value }))}
                      placeholder="Bu sayfanin govde icerigini baslik, liste ve paragraflarla birlikte buraya girin..."
                      minHeightClassName="min-h-[320px]"
                    />
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-100 bg-gray-50/50 p-6">
                  <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                    <Globe className="h-4 w-4 text-gray-500" />
                    SEO Ayarları
                  </h3>
                </div>

                <div className="space-y-4 p-6">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Meta Basligi</label>
                    <input
                      type="text"
                      value={formData.metaTitle}
                      onChange={(event) => setFormData((prev) => ({ ...prev, metaTitle: event.target.value }))}
                      placeholder="Maksimum 60 karakter"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Meta Aciklamasi</label>
                    <textarea
                      rows={3}
                      value={formData.metaDescription}
                      onChange={(event) => setFormData((prev) => ({ ...prev, metaDescription: event.target.value }))}
                      placeholder="Maksimum 160 karakter"
                      className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="space-y-6">
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 bg-gray-50/50 p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <Settings className="h-4 w-4 text-gray-500" />
                Durum ve Yayin
              </h3>
            </div>
            <div className="space-y-3 p-4">
              {[
                { value: "published", label: "Yayinda", icon: CheckCircle2, color: "border-green-200 bg-green-50 text-green-700" },
                { value: "draft", label: "Taslak", icon: FileEdit, color: "border-yellow-200 bg-yellow-50 text-yellow-700" },
                { value: "archived", label: "Arsivlendi", icon: Archive, color: "border-gray-200 bg-gray-50 text-gray-700" },
              ].map((statusOption) => (
                <button
                  key={statusOption.value}
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, status: statusOption.value as CmsPage["status"] }))}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-all ${
                    formData.status === statusOption.value
                      ? `${statusOption.color} font-medium shadow-sm`
                      : "border-gray-200 bg-white text-gray-500 hover:border-gray-900 hover:text-gray-900"
                  }`}
                >
                  <statusOption.icon className={`h-4 w-4 ${formData.status === statusOption.value ? "" : "opacity-50"}`} />
                  {statusOption.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-blue-900">
              <Clock className="h-4 w-4" />
              Son Guncelleme
            </h4>
            <p className="text-xs text-blue-700">
              {initialData ? format(initialData.updatedAt, "d MMMM yyyy HH:mm", { locale: tr }) : "Henuz kaydedilmedi"}
            </p>
          </div>
        </div>
      </div>
    </form>
  );
}
