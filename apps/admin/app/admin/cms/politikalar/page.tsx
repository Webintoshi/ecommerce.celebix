"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileText, FileEdit, CheckCircle2, ArrowRight } from "lucide-react";
import {
  POLICY_PAGE_DEFINITIONS,
  type PolicyPageDefinition,
} from "@celebix/platform-config/src/policy-pages";
import { fetchCmsPages } from "@/lib/cms-pages";
import type { CmsPage } from "@/types/cms";

type PolicyCardState = PolicyPageDefinition & {
  page: CmsPage | null;
};

function resolvePolicyState(page: CmsPage | null) {
  const hasContent = Boolean(page?.content?.trim());
  const isPublished = page?.status === "published";

  if (isPublished && hasContent) {
    return {
      badgeLabel: "Yayında",
      badgeClassName: "bg-green-50 text-green-700",
      description: "Footerda görünür ve storefrontda yayınlanır.",
    };
  }

  if (page) {
    return {
      badgeLabel: "Taslak",
      badgeClassName: "bg-amber-50 text-amber-700",
      description: "İçerik yazılmadan footerda görünmez.",
    };
  }

  return {
    badgeLabel: "Hazır değil",
    badgeClassName: "bg-gray-100 text-gray-600",
    description: "Henüz oluşturulmadı. İçerik girildiğinde aktif olur.",
  };
}

export default function PolicyPagesListingPage() {
  const [pages, setPages] = useState<CmsPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadPages() {
      try {
        setLoading(true);
        setError(null);
        const nextPages = await fetchCmsPages({ includePolicyPages: true });

        if (mounted) {
          setPages(nextPages);
        }
      } catch (fetchError) {
        if (mounted) {
          setError(fetchError instanceof Error ? fetchError.message : "Politikalar yuklenemedi");
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

  const policyCards = useMemo<PolicyCardState[]>(
    () =>
      POLICY_PAGE_DEFINITIONS.map((definition) => ({
        ...definition,
        page: pages.find((page) => page.slug === definition.slug) ?? null,
      })),
    [pages],
  );

  return (
    <div className="min-h-screen space-y-8 bg-gray-50/50 p-6 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Politikalar</h1>
        <p className="mt-1 text-sm text-gray-500">
          Mağaza footerında gösterilecek hukuk metinlerini buradan yazın. İçeriği olmayan politikalar storefrontda görünmez.
        </p>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
          Politikalar yükleniyor...
        </div>
      ) : null}

      {!loading && error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-10 text-center text-sm text-red-700 shadow-sm">
          {error}
        </div>
      ) : null}

      {!loading && !error ? (
        <div className="grid gap-5 xl:grid-cols-2">
          {policyCards.map((policy) => {
            const state = resolvePolicyState(policy.page);

            return (
              <article
                key={policy.slug}
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 text-gray-500">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">{policy.name}</h2>
                      <p className="mt-1 text-sm text-gray-500">{policy.description}</p>
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
                  <span>Slug: /{policy.slug}</span>
                  {policy.page?.updatedAt ? (
                    <span>Son güncelleme: {policy.page.updatedAt.toLocaleDateString("tr-TR")}</span>
                  ) : (
                    <span>Henüz içerik girilmedi</span>
                  )}
                </div>

                <div className="mt-5 flex items-center justify-end gap-3">
                  {policy.page?.status === "published" && policy.page.content.trim() ? (
                    <Link
                      href={`/${policy.slug}`}
                      target="_blank"
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-900 hover:text-gray-900"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Önizle
                    </Link>
                  ) : null}
                  <Link
                    href={`/admin/cms/politikalar/${policy.slug}`}
                    className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
                  >
                    <FileEdit className="h-4 w-4" />
                    {policy.page ? "Düzenle" : "İçerik Gir"}
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
