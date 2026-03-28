"use client";

import { useState } from "react";
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
    Archive
} from "lucide-react";
import Link from "next/link";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import { CmsPage } from "@/types/cms";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

interface PageFormProps {
    initialData?: CmsPage;
}

export function PageForm({ initialData }: PageFormProps) {
    const [loading, setLoading] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const pageBaseUrl = `${STORE_RUNTIME.storefrontUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}/`;
    const [formData, setFormData] = useState<Partial<CmsPage>>(
        initialData || {
            title: "",
            slug: "",
            content: "",
            status: "published",
            metaTitle: "",
            metaDescription: ""
        }
    );

    const generateSlug = (title: string) => {
        return title
            .toLowerCase()
            .trim()
            .replace(/[^\w\s-]/g, "")
            .replace(/[\s_-]+/g, "-")
            .replace(/^-+|-+$/g, "");
    };


    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        // Simulate API call
        await new Promise((resolve) => setTimeout(resolve, 1000));
        setLoading(false);
        alert("Sayfa başarıyla kaydedildi.");
    };

    return (
        <div className="space-y-8">
            {/* Top Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link
                        href="/admin/cms/sayfalar"
                        className="p-2 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-gray-200"
                    >
                        <ArrowLeft className="w-5 h-5 text-gray-600" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
                            {initialData ? "Sayfayı Düzenle" : "Yeni Sayfa Ekle"}
                        </h1>
                        <p className="text-sm text-gray-500 mt-1">Hakkımızda, İletişim gibi içerikleri yönetin.</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => setShowPreview(!showPreview)}
                        className={`inline-flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium transition-all ${showPreview ? "bg-gray-100 border-gray-300 text-gray-900" : "bg-white border-gray-200 text-gray-600 hover:border-gray-900 hover:text-gray-900 shadow-sm"
                            }`}
                    >
                        <Eye className="w-4 h-4" />
                        {showPreview ? "Düzenlemeye Dön" : "Önizleme"}
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="inline-flex items-center gap-2 px-6 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors shadow-sm disabled:opacity-50"
                    >
                        {loading ? (
                            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        ) : (
                            <Save className="w-4 h-4" />
                        )}
                        {initialData ? "Değişiklikleri Kaydet" : "Yayınla"}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    {showPreview ? (
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 min-h-[600px] prose prose-gray max-w-none">
                            <h1 className="text-3xl font-bold mb-6">{formData.title || "Başlıksız Sayfa"}</h1>
                            <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
                                {formData.content || "Henüz içerik girilmedi..."}
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Main Content Card */}
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-gray-500" />
                                        Sayfa İçeriği
                                    </h3>
                                </div>
                                <div className="p-6 space-y-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Sayfa Başlığı</label>
                                        <input
                                            type="text"
                                            value={formData.title}
                                            onChange={(e) => {
                                                const newTitle = e.target.value;
                                                setFormData(prev => ({
                                                    ...prev,
                                                    title: newTitle,
                                                    slug: !initialData ? generateSlug(newTitle) : prev.slug
                                                }));
                                            }}
                                            placeholder="Örn: Hakkımızda"
                                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all text-sm font-medium"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Bağlantı (Slug)</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">{pageBaseUrl}</span>
                                            <input
                                                type="text"
                                                value={formData.slug}
                                                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                                                className="w-full pl-24 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all text-sm font-mono"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">İçerik</label>
                                        <textarea
                                            rows={15}
                                            value={formData.content}
                                            onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                                            placeholder="Sayfa içeriğini buraya girin..."
                                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all text-sm resize-none font-mono"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* SEO Card */}
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                                    <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                                        <Globe className="w-4 h-4 text-gray-500" />
                                        SEO Ayarları
                                    </h3>
                                </div>
                                <div className="p-6 space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Meta Başlığı</label>
                                        <input
                                            type="text"
                                            value={formData.metaTitle}
                                            onChange={(e) => setFormData({ ...formData, metaTitle: e.target.value })}
                                            placeholder="Maksimum 60 karakter..."
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Meta Açıklaması</label>
                                        <textarea
                                            rows={2}
                                            value={formData.metaDescription}
                                            onChange={(e) => setFormData({ ...formData, metaDescription: e.target.value })}
                                            placeholder="Maksimum 160 karakter..."
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all text-sm resize-none"
                                        />
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    {/* Status Style Card */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                                <Settings className="w-4 h-4 text-gray-500" />
                                Durum ve Yayın
                            </h3>
                        </div>
                        <div className="p-4 space-y-3">
                            {[
                                { value: "published", label: "Yayında", icon: CheckCircle2, color: "text-green-600 bg-green-50 border-green-200" },
                                { value: "draft", label: "Taslak", icon: FileEdit, color: "text-yellow-600 bg-yellow-50 border-yellow-200" },
                                { value: "archived", label: "Arşivlendi", icon: Archive, color: "text-gray-600 bg-gray-50 border-gray-200" }
                            ].map((status) => (
                                <button
                                    key={status.value}
                                    type="button"
                                    onClick={() => setFormData({ ...formData, status: status.value as CmsPage["status"] })}
                                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-all text-sm ${formData.status === status.value
                                        ? `${status.color} shadow-sm font-medium`
                                        : "bg-white border-gray-200 text-gray-500 hover:border-gray-900 hover:text-gray-900"
                                        }`}
                                >
                                    <status.icon className={`w-4 h-4 ${formData.status === status.value ? "" : "opacity-50"}`} />
                                    {status.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                        <h4 className="text-xs font-semibold text-blue-900 uppercase flex items-center gap-2 mb-2">
                            <Clock className="w-4 h-4" />
                            Son Güncelleme
                        </h4>
                        <p className="text-xs text-blue-700">
                            {initialData ? format(initialData.updatedAt, "d MMMM yyyy HH:mm", { locale: tr }) : "Henüz kaydedilmedi"}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
