"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileText, FileEdit, CheckCircle2, ArrowRight } from "lucide-react";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import { fetchCmsPages, resolveManagedCmsPages } from "@/lib/cms-pages";

function resolvePageState(hasContent: boolean, status: "published" | "draft" | "archived" | null) {
  if (status === "published" && hasContent) {
    return {
      badgeLabel: "Yayinda",
      badgeClassName: "bg-green-50 text-green-700",
      description: "Storefrontta yayinda gorunur.",
    };
  }

  if (status) {
    return {
      badgeLabel: status === "archived" ? "Arsivde" : "Taslak",
      badgeClassName: status === "archived" ? "bg-gray-100 text-gray-600" : "bg-amber-50 text-amber-700",
      description: "İçerik yayınlanana kadar storefrontta ana içerik olarak kullanılmaz.",
    };
  }

  return {
    badgeLabel: "Hazir degil",
    badgeClassName: "bg-gray-100 text-gray-600",
    description: "Bu sabit sayfa icin henuz icerik girilmedi.",
  };
}

export default function PagesListingPage() {
  const [pages, setPages] = useState<Awaited<ReturnType<typeof fetchCmsPages>>>([]);
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
          setError(fetchError instanceof Error ? fetchError.message : "Sayfalar yuklenemedi");
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

  const cards = useMemo(() => resolveManagedCmsPages(pages), [pages]);

  return (
    <div className="min-h-screen space-y-8 bg-gray-50/50 p-6 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Kurumsal Sayfalar</h1>
        <p className="mt-1 text-sm text-gray-500">
          Ortak adminde yalnızca mağaza içeriği gireceğiniz sabit sayfalar yer alır. Yeni sayfa oluşturma kapatıldı.
        </p>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
          Sayfalar yukleniyor...
        </div>
      ) : null}

      {!loading && error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-10 text-center text-sm text-red-700 shadow-sm">
          {error}
        </div>
      ) : null}

      {!loading && !error ? (
        <div className="grid gap-5 xl:grid-cols-3">
          {cards.map((entry) => {
            const hasContent = Boolean(entry.page?.content?.trim());
            const state = resolvePageState(hasContent, entry.page?.status ?? null);

            return (
              <article
                key={entry.slug}
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 text-gray-500">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">{entry.name}</h2>
                      <p className="mt-1 text-sm text-gray-500">{entry.description}</p>
                    </div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${state.badgeClassName}`}>
                    {state.badgeLabel}
                  </span>
                </div>

                <div className="mt-5 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                  {state.description}
                </div>

                <div className="mt-5 flex items-center justify-between text-xs text-gray-500">
                  <span>Slug: /{entry.slug}</span>
                  {entry.page?.updatedAt ? (
                    <span>Son guncelleme: {entry.page.updatedAt.toLocaleDateString("tr-TR")}</span>
                  ) : (
                    <span>Henuz icerik girilmedi</span>
                  )}
                </div>

                <div className="mt-5 flex items-center justify-end gap-3">
                  {entry.page?.status === "published" && hasContent ? (
                    <Link
                      href={`${STORE_RUNTIME.storefrontUrl.replace(/\/$/, "")}/${entry.slug}`}
                      target="_blank"
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-900 hover:text-gray-900"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Önizle
                    </Link>
                  ) : null}
                  <Link
                    href={`/admin/cms/sayfalar/${entry.slug}`}
                    className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
                  >
                    <FileEdit className="h-4 w-4" />
                    {entry.page ? "Duzenle" : "İçerik Gir"}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
