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
  TriangleAlert,
} from "lucide-react";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import { fetchCmsPages, resolveManagedCmsPages } from "@/lib/cms-pages";

function resolvePageState(hasContent: boolean, status: "published" | "draft" | "archived" | null) {
  if (status === "published" && hasContent) {
    return {
      badgeLabel: "Yayında",
      badgeClassName:
        "border-emerald-200 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
    };
  }

  if (status) {
    return {
      badgeLabel: status === "archived" ? "Arşivde" : "Taslak",
      badgeClassName:
        status === "archived"
          ? "border-stone-200 bg-stone-100 text-stone-700 ring-1 ring-stone-100"
          : "border-amber-200 bg-amber-50 text-amber-800 ring-1 ring-amber-100",
    };
  }

  return {
    badgeLabel: "Hazır değil",
    badgeClassName: "border-stone-200 bg-stone-100 text-stone-700 ring-1 ring-stone-100",
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

  const cards = useMemo(() => resolveManagedCmsPages(pages), [pages]);
  const readyCount = cards.filter((entry) => entry.page?.status === "published" && entry.page.content?.trim()).length;
  const draftCount = cards.filter((entry) => entry.page && entry.page.status !== "published").length;
  const missingCount = cards.length - readyCount - draftCount;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fffaf2_0%,#f7efe2_45%,#f4ecdf_100%)] p-6 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="overflow-hidden rounded-[28px] border border-stone-200/80 bg-white/85 p-6 shadow-[0_20px_60px_-30px_rgba(120,78,33,0.45)] backdrop-blur md:p-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl space-y-4">
              <span className="inline-flex w-fit items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-amber-800">
                Kurumsal sayfalar
              </span>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-stone-900 md:text-4xl">
                  Kurumsal Sayfalar
                </h1>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[420px]">
              <MetricCard label="Yayında" value={readyCount} tone="emerald" />
              <MetricCard label="Taslak" value={draftCount} tone="amber" />
              <MetricCard label="İçerik bekliyor" value={missingCount} tone="stone" />
            </div>
          </div>
        </section>

        {loading ? <LoadingState /> : null}

        {!loading && error ? <ErrorState message={error} /> : null}

        {!loading && !error ? (
          <section className="grid gap-5 xl:grid-cols-3">
            {cards.map((entry) => {
              const hasContent = Boolean(entry.page?.content?.trim());
              const state = resolvePageState(hasContent, entry.page?.status ?? null);

              return (
                <article
                  key={entry.slug}
                  className="group relative overflow-hidden rounded-[24px] border border-stone-200/80 bg-white/90 p-6 shadow-[0_18px_40px_-32px_rgba(120,78,33,0.55)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-[0_24px_50px_-30px_rgba(120,78,33,0.45)]"
                >
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-300 via-orange-200 to-stone-200" />

                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-orange-50 text-amber-700 shadow-sm">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div>
                        <span className="inline-flex rounded-full bg-stone-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                          /{entry.slug}
                        </span>
                        <h2 className="mt-3 text-xl font-semibold text-stone-900">{entry.name}</h2>
                        <p className="mt-2 text-sm leading-6 text-stone-600">{entry.description}</p>
                      </div>
                    </div>

                    <span
                      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${state.badgeClassName}`}
                    >
                      {state.badgeLabel}
                    </span>
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <InfoPill label="Yol" value={`/${entry.slug}`} />
                    <InfoPill
                      label="Son güncelleme"
                      value={
                        entry.page?.updatedAt
                          ? entry.page.updatedAt.toLocaleDateString("tr-TR")
                          : "Henüz içerik girilmedi"
                      }
                    />
                  </div>

                  <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-stone-100 pt-5">
                    {entry.page?.status === "published" && hasContent ? (
                      <Link
                        href={`${STORE_RUNTIME.storefrontUrl.replace(/\/$/, "")}/${entry.slug}`}
                        target="_blank"
                        className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:border-amber-300 hover:text-stone-900"
                      >
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        Önizle
                      </Link>
                    ) : null}
                    <Link
                      href={`/admin/cms/sayfalar/${entry.slug}`}
                      className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-800"
                    >
                      <FileEdit className="h-4 w-4" />
                      {entry.page ? "Düzenle" : "İçerik gir"}
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
        <h2 className="mt-5 text-xl font-semibold text-stone-900">Sayfalar yükleniyor</h2>
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
        <h2 className="mt-5 text-xl font-semibold text-stone-900">Sayfalar yüklenemedi</h2>
        <p className="mt-2 max-w-lg text-sm leading-6 text-stone-600">{message}</p>
        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-800">
          <Clock3 className="h-4 w-4" />
          Veri akışı değişmedi; yalnızca görünüm yeniden düzenlendi.
        </div>
      </div>
    </section>
  );
}
