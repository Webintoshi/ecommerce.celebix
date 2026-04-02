"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageForm } from "@/components/admin/PageForm";
import { fetchCmsPage } from "@/lib/cms-pages";
import type { CmsPage } from "@/types/cms";

export default function EditStaticPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [page, setPage] = useState<CmsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadPage() {
      try {
        setLoading(true);
        setError(null);
        const nextPage = await fetchCmsPage(id);

        if (mounted) {
          setPage(nextPage);
        }
      } catch (fetchError) {
        if (mounted) {
          setError(fetchError instanceof Error ? fetchError.message : "Sayfa yüklenemedi");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadPage();

    return () => {
      mounted = false;
    };
  }, [id]);

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        {loading && (
          <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
            Sayfa yükleniyor...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-10 text-center shadow-sm">
            <p className="text-sm font-medium text-red-700">{error}</p>
            <Link
              href="/admin/cms/sayfalar"
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100"
            >
              <ArrowLeft className="h-4 w-4" />
              Sayfa listesine dön
            </Link>
          </div>
        )}

        {!loading && !error && !page && (
          <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
            Aradığınız sayfa bulunamadı.
          </div>
        )}

        {!loading && !error && page && <PageForm initialData={page} />}
      </div>
    </div>
  );
}
