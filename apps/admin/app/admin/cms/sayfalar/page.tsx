"use client";

import { useEffect, useState } from "react";
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
  Archive,
} from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { fetchCmsPages } from "@/lib/cms-pages";
import type { CmsPage } from "@/types/cms";

function StatusBadge({ status }: { status: CmsPage["status"] }) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
        status === "published"
          ? "bg-green-50 text-green-700"
          : status === "draft"
            ? "bg-yellow-50 text-yellow-700"
            : "bg-gray-50 text-gray-700"
      }`}
    >
      {status === "published" && <CheckCircle2 className="h-3 w-3" />}
      {status === "draft" && <FileEdit className="h-3 w-3" />}
      {status === "archived" && <Archive className="h-3 w-3" />}
      {status === "published" ? "Yayında" : status === "draft" ? "Taslak" : "Arşivlendi"}
    </div>
  );
}

export default function PagesListingPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [pages, setPages] = useState<CmsPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadPages() {
      try {
        setLoading(true);
        setError(null);
        const nextPages = await fetchCmsPages();

        if (mounted) {
          setPages(nextPages);
        }
      } catch (fetchError) {
        if (mounted) {
          setError(fetchError instanceof Error ? fetchError.message : "Sayfalar yüklenemedi");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadPages();

    return () => {
      mounted = false;
    };
  }, []);

  const filteredPages = pages.filter((page) => {
    const query = searchTerm.toLowerCase();
    return page.title.toLowerCase().includes(query) || page.slug.toLowerCase().includes(query);
  });

  return (
    <div className="min-h-screen space-y-8 bg-gray-50/50 p-6 md:p-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Kurumsal Sayfalar</h1>
          <p className="mt-1 text-sm text-gray-500">
            Hakkımızda, iletişim ve özel içerik sayfalarını buradan yönetin.
          </p>
        </div>
        <Link
          href="/admin/cms/sayfalar/yeni"
          className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-gray-800"
        >
          <Plus className="h-4 w-4" />
          Yeni Sayfa Ekle
        </Link>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Sayfalarda ara..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="w-full rounded-lg border border-gray-200 py-2 pl-10 pr-4 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Sayfa Adı</th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Bağlantı</th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Durum</th>
                <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Son Güncelleme</th>
                <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-500">
                    Sayfalar yükleniyor...
                  </td>
                </tr>
              )}

              {!loading && error && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm text-red-600">
                    {error}
                  </td>
                </tr>
              )}

              {!loading && !error && filteredPages.map((page) => (
                <tr key={page.id} className="group transition-colors hover:bg-gray-50/50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-400">
                        <FileText className="h-4 w-4" />
                      </div>
                      <span className="font-medium text-gray-900">{page.title}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">/{page.slug}</code>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={page.status} />
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <Clock className="h-3 w-3 opacity-50" />
                      {format(page.updatedAt, "d MMM yyyy", { locale: tr })}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/${page.slug}`}
                        target="_blank"
                        className="rounded-lg p-2 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-900"
                        title="Görüntüle"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                      <Link
                        href={`/admin/cms/sayfalar/${page.id}`}
                        className="rounded-lg p-2 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-900"
                        title="Düzenle"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Link>
                      <button
                        type="button"
                        disabled
                        className="rounded-lg p-2 text-gray-300"
                        title="Silme yakında eklenecek"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && !error && filteredPages.length === 0 && (
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
