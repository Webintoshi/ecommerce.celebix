"use client";

import { useState } from "react";
import Link from "next/link";
import {
    Plus,
    Search,
    Edit2,
    Trash2,
    ExternalLink,
    FileText,
    Clock,
    CheckCircle2,
    FileEdit,
    Archive
} from "lucide-react";
import { getCmsPages } from "@/lib/cms";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

export default function PagesListingPage() {
    const [searchTerm, setSearchTerm] = useState("");
    const pages = getCmsPages();

    const filteredPages = pages.filter(page =>
        page.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        page.slug.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-gray-50/50 p-6 md:p-8 space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Kurumsal Sayfalar</h1>
                    <p className="text-sm text-gray-500 mt-1">Hakkımızda, İletişim gibi statik içeriklerinizi yönetin.</p>
                </div>
                <Link
                    href="/admin/cms/sayfalar/yeni"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors shadow-sm"
                >
                    <Plus className="w-4 h-4" />
                    Yeni Sayfa Ekle
                </Link>
            </div>

            {/* Search */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Sayfalarda ara..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all text-sm"
                    />
                </div>
            </div>

            {/* Pages Table */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Sayfa Adı</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Bağlantı (Slug)</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Durum</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Son Güncelleme</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">İşlemler</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredPages.map((page) => (
                                <tr key={page.id} className="hover:bg-gray-50/50 transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400">
                                                <FileText className="w-4 h-4" />
                                            </div>
                                            <span className="font-medium text-gray-900">{page.title}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <code className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                                            /{page.slug}
                                        </code>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${page.status === "published"
                                            ? "bg-green-50 text-green-700"
                                            : page.status === "draft"
                                                ? "bg-yellow-50 text-yellow-700"
                                                : "bg-gray-50 text-gray-700"
                                            }`}>
                                            {page.status === "published" && <CheckCircle2 className="w-3 h-3" />}
                                            {page.status === "draft" && <FileEdit className="w-3 h-3" />}
                                            {page.status === "archived" && <Archive className="w-3 h-3" />}
                                            {page.status === "published" ? "Yayında" : page.status === "draft" ? "Taslak" : "Arşivlendi"}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600">
                                        <div className="flex items-center gap-2">
                                            <Clock className="w-3 h-3 opacity-50" />
                                            {format(page.updatedAt, "d MMM yyyy", { locale: tr })}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <Link
                                                href={`/${page.slug}`}
                                                target="_blank"
                                                className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
                                                title="Görüntüle"
                                            >
                                                <ExternalLink className="w-4 h-4" />
                                            </Link>
                                            <Link
                                                href={`/admin/cms/sayfalar/${page.id}`}
                                                className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
                                                title="Düzenle"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </Link>
                                            <button
                                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                title="Sil"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredPages.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                                        Henüz sayfa bulunmuyor veya arama kriterlerine uygun sonuç yok.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
