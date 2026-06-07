"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  Activity,
  AlertCircle,
  Eye,
  ExternalLink,
  Globe,
  MousePointerClick,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type AvailabilityStatus =
  | "available"
  | "partial"
  | "unconfigured"
  | "unauthorized"
  | "website-not-found"
  | "error";

type SummaryMetricRow = {
  label: string;
  path: string;
  visitors: number;
  pageviews: number;
};

type ReferrerRow = {
  source: string;
  visitors: number;
  pageviews: number;
};

type AnalyticsSummary = {
  source: "umami";
  availability: {
    status: AvailabilityStatus;
    message: string | null;
  };
  activeUsers: number | null;
  visitorsToday: number | null;
  pageviewsToday: number | null;
  visitors7d: number | null;
  pageviews7d: number | null;
  topPages: SummaryMetricRow[];
  topProducts: SummaryMetricRow[];
  referrers: ReferrerRow[];
  website: {
    name: string;
    domain: string;
    configuredDomains: string[];
    recordFound: boolean | null;
    matchesConfiguredDomain: boolean | null;
    duplicateCount: number | null;
  };
  updatedAt: string;
};

type SummaryResponse = {
  success?: boolean;
  data?: AnalyticsSummary;
  error?: string;
};

const POLL_INTERVAL_MS = 30_000;

function formatNumber(value: number | null) {
  if (value === null) {
    return "Bekleniyor";
  }

  return value.toLocaleString("tr-TR");
}

function formatUpdatedAt(value: string | null) {
  if (!value) {
    return "Veri aliniyor";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Veri aliniyor";
  }

  return date.toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusMeta(status: AvailabilityStatus) {
  switch (status) {
    case "available":
      return {
        label: "Canli",
        variant: "default" as const,
      };
    case "partial":
      return {
        label: "Kismi",
        variant: "secondary" as const,
      };
    case "unconfigured":
      return {
        label: "Eksik Kurulum",
        variant: "secondary" as const,
      };
    case "unauthorized":
    case "website-not-found":
    case "error":
      return {
        label: "Dikkat",
        variant: "destructive" as const,
      };
    default:
      return {
        label: "Durum Bilinmiyor",
        variant: "secondary" as const,
      };
  }
}

function buildStoreLink(domain: string, path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `https://${domain}${normalizedPath}`;
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Activity;
  label: string;
  value: number | null;
  hint: string;
}) {
  return (
    <Card className="border-[rgba(148,163,184,0.22)] bg-white/90">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardDescription>{label}</CardDescription>
            <CardTitle className="text-3xl font-semibold">{formatNumber(value)}</CardTitle>
          </div>
          <div className="rounded-2xl bg-[#f6efe9] p-3 text-[#8b5e3c]">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 text-sm text-[var(--admin-text-secondary)]">
        {hint}
      </CardContent>
    </Card>
  );
}

function MetricTable({
  title,
  description,
  rows,
  domain,
  emptyState,
}: {
  title: string;
  description: string;
  rows: SummaryMetricRow[];
  domain: string;
  emptyState: string;
}) {
  return (
    <Card className="border-[rgba(148,163,184,0.22)] bg-white/90">
      <CardHeader>
        <CardTitle className="text-xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--admin-border)] bg-[#fcfaf8] px-4 py-6 text-sm text-[var(--admin-text-secondary)]">
            {emptyState}
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <div
                key={`${row.path}-${row.label}`}
                className="flex items-center justify-between gap-4 rounded-2xl border border-[rgba(148,163,184,0.16)] bg-[#fcfaf8] px-4 py-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="truncate font-medium text-[var(--admin-heading)]">{row.label}</div>
                  <div className="flex items-center gap-2 text-xs text-[var(--admin-text-secondary)]">
                    <span className="truncate">{row.path}</span>
                    <Link
                      href={buildStoreLink(domain, row.path)}
                      target="_blank"
                      className="inline-flex items-center gap-1 whitespace-nowrap text-[#8b5e3c] hover:text-[#6f472c]"
                    >
                      Ac
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold text-[var(--admin-heading)]">
                    {formatNumber(row.pageviews)}
                  </div>
                  <div className="text-xs text-[var(--admin-text-secondary)]">
                    {formatNumber(row.visitors)} ziyaretci
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReferrerTable({
  rows,
}: {
  rows: ReferrerRow[];
}) {
  return (
    <Card className="border-[rgba(148,163,184,0.22)] bg-white/90">
      <CardHeader>
        <CardTitle className="text-xl">Referrer ve Kaynaklar</CardTitle>
        <CardDescription>Son 7 gunde en cok trafik getiren kaynaklar.</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--admin-border)] bg-[#fcfaf8] px-4 py-6 text-sm text-[var(--admin-text-secondary)]">
            Referrer ozeti henuz alinmadi veya Umami bu aralikta kaynak verisi dondurmedi.
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <div
                key={row.source}
                className="flex items-center justify-between gap-4 rounded-2xl border border-[rgba(148,163,184,0.16)] bg-[#fcfaf8] px-4 py-3"
              >
                <div className="min-w-0 truncate font-medium text-[var(--admin-heading)]">{row.source}</div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold text-[var(--admin-heading)]">
                    {formatNumber(row.pageviews)}
                  </div>
                  <div className="text-xs text-[var(--admin-text-secondary)]">
                    {formatNumber(row.visitors)} ziyaretci
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="h-40 animate-pulse rounded-[22px] border border-[rgba(148,163,184,0.16)] bg-white/80"
        />
      ))}
    </div>
  );
}

export default function AnalyticsPageClient() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadSummary = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/analytics/summary", {
        cache: "no-store",
      });
      const payload = (await response.json()) as SummaryResponse;

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || "Analitik verileri alinamadi.");
      }

      setError(null);
      startTransition(() => {
        setSummary(payload.data || null);
      });
    } catch (fetchError) {
      console.error("Admin analytics summary fetch failed:", fetchError);
      setError("Analitik verileri su anda alinamadi. Biraz sonra tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const run = async () => {
      if (!isMounted) {
        return;
      }

      await loadSummary();
    };

    void run();
    const interval = window.setInterval(() => {
      void loadSummary();
    }, POLL_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [loadSummary]);

  const statusMeta = useMemo(
    () => getStatusMeta(summary?.availability.status || "partial"),
    [summary?.availability.status],
  );

  return (
    <div className="admin-page-root">
      <div className="mx-auto max-w-[1480px] px-4 py-5 md:px-6 md:py-7 lg:px-8">
        <div className="space-y-6">
          <section className="overflow-hidden rounded-[32px] border border-[rgba(148,163,184,0.18)] bg-[linear-gradient(135deg,#fff7ef_0%,#fffdf9_55%,#f7f4ef_100%)] px-5 py-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] md:px-7 md:py-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                  <Badge variant="secondary">Veri kaynagi: Umami</Badge>
                  <Badge variant="secondary">Magaza: derycraft.com.tr</Badge>
                </div>
                <div className="space-y-2">
                  <h1 className="text-3xl font-semibold tracking-tight text-[var(--admin-heading)] md:text-4xl">
                    Magaza Analitigi
                  </h1>
                  <p className="max-w-2xl text-sm leading-6 text-[var(--admin-text-secondary)] md:text-base">
                    DeryCraft storefront trafik verileri yalnızca server-side Umami adapter üzerinden
                    okunur. Browser tarafına token taşınmaz ve bu ekran yalnızca store-scope özet gösterir.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-2xl border border-[rgba(148,163,184,0.16)] bg-white/80 px-4 py-3 text-sm text-[var(--admin-text-secondary)]">
                  Son güncelleme:{" "}
                  <span className="font-medium text-[var(--admin-heading)]">
                    {formatUpdatedAt(summary?.updatedAt || null)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setLoading(true);
                    void loadSummary();
                  }}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-2xl border border-[rgba(148,163,184,0.18)] bg-white px-4 py-3 text-sm font-medium text-[var(--admin-heading)] transition hover:bg-[#fcfaf8]",
                    (loading || isPending) && "cursor-wait opacity-70",
                  )}
                >
                  <RefreshCw className={cn("h-4 w-4", (loading || isPending) && "animate-spin")} />
                  Yenile
                </button>
              </div>
            </div>
          </section>

          {summary?.availability.message ? (
            <section
              className={cn(
                "flex items-start gap-3 rounded-[24px] border px-4 py-4 text-sm",
                summary.availability.status === "available"
                  ? "border-[rgba(34,197,94,0.22)] bg-[rgba(240,253,244,0.85)] text-[#166534]"
                  : summary.availability.status === "partial" || summary.availability.status === "unconfigured"
                    ? "border-[rgba(245,158,11,0.22)] bg-[rgba(255,251,235,0.9)] text-[#92400e]"
                    : "border-[rgba(239,68,68,0.2)] bg-[rgba(254,242,242,0.92)] text-[#991b1b]",
              )}
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{summary.availability.message}</span>
            </section>
          ) : null}

          {error ? (
            <section className="rounded-[24px] border border-[rgba(239,68,68,0.18)] bg-[rgba(254,242,242,0.92)] px-4 py-4 text-sm text-[#991b1b]">
              {error}
            </section>
          ) : null}

          {loading && !summary ? (
            <LoadingState />
          ) : (
            <>
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <MetricCard
                  icon={Users}
                  label="Anlık Kullanıcı"
                  value={summary?.activeUsers ?? null}
                  hint="Son 5 dakikadaki aktif ziyaretçi sayısı."
                />
                <MetricCard
                  icon={Globe}
                  label="Bugünkü Ziyaretçi"
                  value={summary?.visitorsToday ?? null}
                  hint="İstanbul zaman dilimine göre bugünün tekil ziyaretçileri."
                />
                <MetricCard
                  icon={Eye}
                  label="Bugünkü Sayfa Görüntüleme"
                  value={summary?.pageviewsToday ?? null}
                  hint="Bugün alınan toplam pageview sayısı."
                />
                <MetricCard
                  icon={MousePointerClick}
                  label="Son 7 Gün Ziyaretçi"
                  value={summary?.visitors7d ?? null}
                  hint="Son 7 günlük rolling tekil ziyaretçi toplamı."
                />
                <MetricCard
                  icon={Activity}
                  label="Son 7 Gün Pageview"
                  value={summary?.pageviews7d ?? null}
                  hint="Son 7 gündeki toplam pageview sayısı."
                />
              </section>

              <section className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
                <Card className="border-[rgba(148,163,184,0.22)] bg-white/90">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <CardTitle className="text-xl">Website Kaydi ve Scope</CardTitle>
                        <CardDescription>
                          Bu ekran yalnızca derycraft.com.tr Umami website kaydına bağlıdır.
                        </CardDescription>
                      </div>
                      <div className="rounded-2xl bg-[#f6efe9] p-3 text-[#8b5e3c]">
                        <ShieldCheck className="h-5 w-5" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-3 pt-0 md:grid-cols-2">
                    <div className="rounded-2xl border border-[rgba(148,163,184,0.16)] bg-[#fcfaf8] px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-[var(--admin-text-secondary)]">
                        Website
                      </div>
                      <div className="mt-2 text-lg font-semibold text-[var(--admin-heading)]">
                        {summary?.website.name || "DeryCraft 2"}
                      </div>
                      <div className="mt-1 text-sm text-[var(--admin-text-secondary)]">
                        {summary?.website.domain || "derycraft.com.tr"}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-[rgba(148,163,184,0.16)] bg-[#fcfaf8] px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-[var(--admin-text-secondary)]">
                        Kayit Durumu
                      </div>
                      <div className="mt-2 text-lg font-semibold text-[var(--admin-heading)]">
                        {summary?.website.recordFound === true
                          ? "Kayit dogrulandi"
                          : summary?.website.recordFound === false
                            ? "Kayit bulunamadi"
                            : "API ile henuz dogrulanmadi"}
                      </div>
                      <div className="mt-1 text-sm text-[var(--admin-text-secondary)]">
                        Domain eslesmesi:{" "}
                        {summary?.website.matchesConfiguredDomain === true
                          ? "dogru"
                          : summary?.website.matchesConfiguredDomain === false
                            ? "uyusmuyor"
                            : "bilinmiyor"}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-[rgba(148,163,184,0.16)] bg-[#fcfaf8] px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-[var(--admin-text-secondary)]">
                        Configured Domains
                      </div>
                      <div className="mt-2 text-sm font-medium text-[var(--admin-heading)]">
                        {(summary?.website.configuredDomains || []).join(", ") || "derycraft.com.tr"}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-[rgba(148,163,184,0.16)] bg-[#fcfaf8] px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-[var(--admin-text-secondary)]">
                        Duplicate Kayit Kontrolu
                      </div>
                      <div className="mt-2 text-lg font-semibold text-[var(--admin-heading)]">
                        {summary?.website.duplicateCount === null
                          ? "Dogrulanamadi"
                          : summary?.website.duplicateCount === 1
                            ? "Tek kayit"
                            : `${summary?.website.duplicateCount} kayıt`}
                      </div>
                      <div className="mt-1 text-sm text-[var(--admin-text-secondary)]">
                        Umami websites listesi uzerinden kontrol edilir.
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <ReferrerTable rows={summary?.referrers || []} />
              </section>

              <section className="grid gap-4 xl:grid-cols-2">
                <MetricTable
                  title="En Çok Gezilen Sayfalar"
                  description="Son 7 günde öne çıkan storefront sayfaları."
                  rows={summary?.topPages || []}
                  domain={summary?.website.domain || "derycraft.com.tr"}
                  emptyState="Top page listesi henüz dolmadı veya Umami bu aralıkta path verisi döndürmedi."
                />
                <MetricTable
                  title="En Çok Görüntülenen Ürünler"
                  description="PDP path filtrelemesi ile çıkarılan en yoğun ürün sayfaları."
                  rows={summary?.topProducts || []}
                  domain={summary?.website.domain || "derycraft.com.tr"}
                  emptyState="Ürün/PDP trafik listesi henüz dolmadı."
                />
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
