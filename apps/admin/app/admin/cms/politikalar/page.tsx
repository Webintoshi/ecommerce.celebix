"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileEdit,
  FileText,
  Loader2,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
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
      badgeClassName:
        "border-emerald-200 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
      description: "Footer'da görünür ve storefront'ta yayınlanır.",
    };
  }

  if (page) {
    return {
      badgeLabel: "Taslak",
      badgeClassName: "border-amber-200 bg-amber-50 text-amber-800 ring-1 ring-amber-100",
      description: "İçerik yazılmadan footer'da görünmez.",
    };
  }

  return {
    badgeLabel: "Hazır değil",
    badgeClassName: "border-stone-200 bg-stone-100 text-stone-700 ring-1 ring-stone-100",
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
          setError(fetchError instanceof Error ? fetchError.message : "Politikalar yüklenemedi");
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

  const publishedCount = policyCards.filter(
    (policy) => policy.page?.status === "published" && policy.page.content.trim(),
  ).length;
  const draftCount = policyCards.filter((policy) => policy.page && policy.page.status !== "published").length;
  const pendingCount = policyCards.length - publishedCount - draftCount;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fffaf2_0%,#f6ede0_48%,#f3ebdf_100%)] p-6 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[28px] border border-stone-200/80 bg-white/85 p-6 shadow-[0_20px_60px_-30px_rgba(120,78,33,0.45)] backdrop-blur md:p-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl space-y-4">
              <span className="inline-flex w-fit items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-amber-800">
                Politikalar
              </span>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-stone-900 md:text-4xl">
                  Politika Sayfaları
                </h1>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[420px]">
              <MetricCard label="Yayında" value={publishedCount} tone="emerald" />
              <MetricCard label="Taslak" value={draftCount} tone="amber" />
              <MetricCard label="Eksik" value={pendingCount} tone="stone" />
            </div>
          </div>
        </section>

        {loading ? <LoadingState /> : null}

        {!loading && error ? <ErrorState message={error} /> : null}

        {!loading && !error ? (
          <section className="grid gap-5 xl:grid-cols-2">
            {policyCards.map((policy) => {
              const state = resolvePolicyState(policy.page);

              return (
                <article
                  key={policy.slug}
                  className="group relative overflow-hidden rounded-[24px] border border-stone-200/80 bg-white/90 p-6 shadow-[0_18px_40px_-32px_rgba(120,78,33,0.55)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-[0_24px_50px_-30px_rgba(120,78,33,0.45)]"
                >
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-300 via-orange-200 to-stone-200" />

                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-orange-50 text-amber-700 shadow-sm">
                        <ShieldCheck className="h-5 w-5" />
                      </div>
                      <div>
                        <span className="inline-flex rounded-full bg-stone-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                          /{policy.slug}
                        </span>
                        <h2 className="mt-3 text-xl font-semibold text-stone-900">{policy.name}</h2>
                        <p className="mt-2 text-sm leading-6 text-stone-600">{policy.description}</p>
                      </div>
                    </div>

                    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${state.badgeClassName}`}>
                      {state.badgeLabel}
                    </span>
                  </div>

                  <div className="mt-6 rounded-2xl border border-stone-200 bg-[linear-gradient(135deg,#fffdf8_0%,#f8f1e7_100%)] p-4">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                      Yayın durumu
                    </div>
                    <p className="text-sm leading-6 text-stone-700">{state.description}</p>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <InfoPill label="Yol" value={`/${policy.slug}`} />
                    <InfoPill
                      label="Son güncelleme"
                      value={policy.page?.updatedAt ? policy.page.updatedAt.toLocaleDateString("tr-TR") : "Henüz içerik girilmedi"}
                    />
                  </div>

                  <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-stone-100 pt-5">
                    {policy.page?.status === "published" && policy.page.content.trim() ? (
                      <Link
                        href={`/${policy.slug}`}
                        target="_blank"
                        className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:border-amber-300 hover:text-stone-900"
                      >
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        Önizle
                      </Link>
                    ) : null}
                    <Link
                      href={`/admin/cms/politikalar/${policy.slug}`}
                      className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-800"
                    >
                      <FileEdit className="h-4 w-4" />
                      {policy.page ? "Düzenle" : "İçerik gir"}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </article>
              );
            })}
          </section>
        ) : null}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "amber" | "stone";
}) {
  const toneStyles = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    stone: "border-stone-200 bg-stone-100 text-stone-700",
  };

  return (
    <div className={`rounded-2xl border px-4 py-4 ${toneStyles[tone]}`}>
      <div className="text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em]">{label}</div>
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50/70 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">{label}</div>
      <div className="mt-1 text-sm text-stone-700">{value}</div>
    </div>
  );
}

function LoadingState() {
  return (
    <section className="rounded-[24px] border border-stone-200/80 bg-white/90 p-10 shadow-[0_18px_40px_-32px_rgba(120,78,33,0.45)]">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-700">
          <Loader2 className="h-7 w-7 animate-spin" />
        </div>
        <h2 className="mt-5 text-xl font-semibold text-stone-900">Politikalar yükleniyor</h2>
      </div>
    </section>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <section className="rounded-[24px] border border-rose-200 bg-rose-50/90 p-10 shadow-[0_18px_40px_-32px_rgba(120,78,33,0.35)]">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-rose-200 bg-white text-rose-600">
          <TriangleAlert className="h-7 w-7" />
        </div>
        <h2 className="mt-5 text-xl font-semibold text-stone-900">Politikalar yüklenemedi</h2>
        <p className="mt-2 max-w-lg text-sm leading-6 text-stone-600">{message}</p>
        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-800">
          <Clock3 className="h-4 w-4" />
          Veri akışı korunur; yalnızca yönetim arayüzü yenilendi.
        </div>
      </div>
    </section>
  );
}
