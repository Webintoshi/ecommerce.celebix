"use client";

import { useEffect, useMemo, useState } from "react";
import type { ElementType, ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  FileEdit,
  Loader2,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import {
  POLICY_PAGE_DEFINITIONS,
  type PolicyPageDefinition,
} from "@celebix/platform-config/src/policy-pages";
import { AdminEmptyState, AdminPageHeader, AdminPageShell } from "@/components/admin/AdminPageShell";
import { fetchCmsPages } from "@/lib/cms-pages";
import { cn } from "@/lib/utils";
import type { CmsPage } from "@/types/cms";

type PolicyCardState = PolicyPageDefinition & {
  page: CmsPage | null;
};

type PolicyTone = "success" | "warning" | "neutral";

function resolvePolicyState(page: CmsPage | null) {
  const hasContent = Boolean(page?.content?.trim());
  const isPublished = page?.status === "published";

  if (isPublished && hasContent) {
    return {
      label: "Yayında",
      tone: "success" as PolicyTone,
      detail: "Footer ve storefront üzerinde görünür.",
    };
  }

  if (page) {
    return {
      label: "Taslak",
      tone: "warning" as PolicyTone,
      detail: "İçerik tamamlanınca yayına alınabilir.",
    };
  }

  return {
    label: "Hazır değil",
    tone: "neutral" as PolicyTone,
    detail: "Henüz oluşturulmadı.",
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

  const policyRows = useMemo<PolicyCardState[]>(
    () =>
      POLICY_PAGE_DEFINITIONS.map((definition) => ({
        ...definition,
        page: pages.find((page) => page.slug === definition.slug) ?? null,
      })),
    [pages],
  );

  const publishedCount = policyRows.filter(
    (policy) => policy.page?.status === "published" && policy.page.content.trim(),
  ).length;
  const draftCount = policyRows.filter((policy) => policy.page && policy.page.status !== "published").length;
  const pendingCount = policyRows.length - publishedCount - draftCount;

  return (
    <main className="min-h-screen bg-[#F9F9F9] pb-8 text-[#111827]">
      <div className="mx-auto w-full max-w-none space-y-4 px-4 sm:px-5 xl:px-6">
        <AdminPageShell>
          <AdminPageHeader
            sectionLabel="CMS"
            title="Politikalar"
            description="Yasal ve operasyonel politika içeriklerini yönetin."
            metrics={
              <>
                <MetricCell label="Yayında" value={publishedCount} detail="politika" icon={CheckCircle2} />
                <MetricCell label="Taslak" value={draftCount} detail="çalışma" icon={FileEdit} />
                <MetricCell label="Eksik" value={pendingCount} detail="içerik" icon={Clock3} />
              </>
            }
          />

          {loading ? <LoadingState /> : null}
          {!loading && error ? <ErrorState message={error} /> : null}

          {!loading && !error ? (
            <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-3 xl:px-5">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#4B5563]">
                    Politika listesi
                  </h2>
                  <p className="mt-1 text-xs font-medium text-[#6B7280]">
                    Yayın, içerik ve güncelleme durumu tek akışta.
                  </p>
                </div>
                <span className="rounded-[8px] bg-white px-3 py-1.5 text-xs font-semibold text-[#6B7280]">
                  {policyRows.length} politika
                </span>
              </div>

              {policyRows.length === 0 ? (
                <div className="p-5">
                  <AdminEmptyState
                    icon={<ShieldCheck className="h-7 w-7" />}
                    title="Politika kaydı bulunmuyor"
                    description="Politika tanımları eklendiğinde burada görünür."
                    className="border-[#DCE3EC] bg-[#F9F9F9]"
                  />
                </div>
              ) : (
                <div className="divide-y divide-[#E1E7EF]">
                  {policyRows.map((policy) => {
                    const state = resolvePolicyState(policy.page);
                    const isPreviewable = policy.page?.status === "published" && policy.page.content.trim();

                    return (
                      <article
                        key={policy.slug}
                        className="grid gap-4 px-4 py-4 transition hover:bg-[#FFF8F3] min-[940px]:grid-cols-[minmax(260px,1fr)_130px_190px_auto] min-[940px]:items-center xl:px-5"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold text-[#FF6A00]">/{policy.slug}</span>
                            <StatusText tone={state.tone}>{state.label}</StatusText>
                          </div>
                          <h3 className="mt-2 truncate text-base font-semibold tracking-[-0.02em] text-[#111827]">
                            {policy.name}
                          </h3>
                          <p className="mt-1 line-clamp-1 text-sm font-medium text-[#6B7280]">{policy.description}</p>
                        </div>

                        <InfoCell label="Durum" value={state.label} danger={state.tone === "warning"} />
                        <InfoCell
                          label="Yayın notu"
                          value={state.detail}
                        />

                        <div className="flex flex-wrap gap-2 min-[940px]:justify-end">
                          {isPreviewable ? (
                            <Link
                              href={`/${policy.slug}`}
                              target="_blank"
                              className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#4B5563] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.16)]"
                            >
                              Önizle
                              <ArrowUpRight className="h-4 w-4" />
                            </Link>
                          ) : null}
                          <Link
                            href={`/admin/cms/politikalar/${policy.slug}`}
                            className={cn(
                              "inline-flex h-10 items-center justify-center gap-2 rounded-[8px] px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]",
                              policy.page
                                ? "border border-[#DCE3EC] bg-white text-[#4B5563] hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04]"
                                : "bg-[#FF6A00] text-white shadow-[0_10px_24px_rgba(255,106,0,0.16)] hover:bg-[#E85D04]",
                            )}
                          >
                            <FileEdit className="h-4 w-4" />
                            {policy.page ? "Düzenle" : "İçerik gir"}
                          </Link>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          ) : null}
        </AdminPageShell>
      </div>
    </main>
  );
}

function MetricCell({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: number;
  detail: string;
  icon: ElementType;
}) {
  return (
    <div className="min-h-[92px] bg-white px-4 py-3.5 xl:px-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6B7280]">{label}</p>
        <Icon className="h-4 w-4 text-[#9CA3AF]" />
      </div>
      <div className="mt-3 flex items-end gap-2">
        <p className="text-3xl font-semibold tracking-[-0.04em] text-[#111827]">{value}</p>
        <span className="pb-1 text-sm font-medium text-[#6B7280]">{detail}</span>
      </div>
    </div>
  );
}

function StatusText({ tone, children }: { tone: PolicyTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "text-xs font-semibold",
        tone === "success" && "text-emerald-700",
        tone === "warning" && "text-[#E85D04]",
        tone === "neutral" && "text-[#6B7280]",
      )}
    >
      {children}
    </span>
  );
}

function InfoCell({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9CA3AF]">{label}</p>
      <p className={cn("mt-1 truncate text-sm font-semibold text-[#111827]", danger && "text-[#E85D04]")}>{value}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <section className="flex min-h-[260px] items-center justify-center border-y border-[#E1E7EF] bg-[#F9F9F9] text-sm font-semibold text-[#6B7280]">
      <Loader2 className="mr-3 h-5 w-5 animate-spin text-[#FF6A00]" />
      Politikalar yükleniyor
    </section>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <section className="border-y border-rose-200 bg-rose-50 px-5 py-6">
      <div className="flex items-start gap-3 text-rose-700">
        <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <h2 className="text-base font-semibold text-[#111827]">Politikalar yüklenemedi</h2>
          <p className="mt-1 text-sm font-medium leading-6">{message}</p>
        </div>
      </div>
    </section>
  );
}
