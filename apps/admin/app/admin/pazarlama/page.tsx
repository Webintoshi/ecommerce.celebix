"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Mail,
  MessageCircle,
  Phone,
  RefreshCw,
  Target,
  TrendingUp,
  Users,
  Users2,
} from "lucide-react";
import { AdminEmptyState, AdminPageHeader, AdminPageShell } from "@/components/admin/AdminPageShell";
import { cn } from "@/lib/utils";

type Channel = {
  id: "email" | "whatsapp" | "phone";
  title: string;
  description: string;
  href: string;
  metric: string;
};

type Insight = {
  id: string;
  title: string;
  value: number;
  subValue: string;
  change: string;
  actionLabel: string;
  actionHref: string;
  type: "warning" | "success" | "info";
};

type MarketingOverview = {
  stats: {
    totalCustomers: number;
    emailReachable: number;
    phoneReachable: number;
    vipCustomers: number;
    newCustomers30d: number;
    totalRevenue: number;
    monthRevenue: number;
    revenueChange: number;
    customerChange: number;
    contactMissing: number;
  };
  channels: Channel[];
  insights: Insight[];
};

type MetricItem = {
  label: string;
  value: string;
  detail: string;
  icon: typeof Users;
};

const DEFAULT_STATS: MarketingOverview["stats"] = {
  totalCustomers: 0,
  emailReachable: 0,
  phoneReachable: 0,
  vipCustomers: 0,
  newCustomers30d: 0,
  totalRevenue: 0,
  monthRevenue: 0,
  revenueChange: 0,
  customerChange: 0,
  contactMissing: 0,
};

const CHANNEL_ICON: Record<Channel["id"], typeof Mail> = {
  email: Mail,
  whatsapp: MessageCircle,
  phone: Phone,
};

const CHANNEL_LABEL: Record<Channel["id"], string> = {
  email: "E-posta",
  whatsapp: "WhatsApp",
  phone: "Telefon",
};

const INSIGHT_TONE: Record<Insight["type"], string> = {
  warning: "text-amber-700",
  success: "text-emerald-700",
  info: "text-[#E85D04]",
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatSignedPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}%${value}`;
}

function metricPercent(part: number, total: number): string {
  if (total <= 0) return "%0";
  return `%${Math.round((part / total) * 100)}`;
}

export default function MarketingPage() {
  const [data, setData] = useState<MarketingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/marketing/overview", { cache: "no-store" });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result?.error || "Pazarlama verileri alınamadı.");
      }

      setData({
        stats: result.stats,
        channels: result.channels,
        insights: result.insights,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu.");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  const stats = data?.stats || DEFAULT_STATS;
  const reachableTotal = stats.emailReachable + stats.phoneReachable;

  const metrics = useMemo<MetricItem[]>(
    () => [
      {
        label: "Toplam müşteri",
        value: stats.totalCustomers.toLocaleString("tr-TR"),
        detail: `Son 30 gün ${stats.newCustomers30d.toLocaleString("tr-TR")}`,
        icon: Users,
      },
      {
        label: "Erişim kapsamı",
        value: reachableTotal.toLocaleString("tr-TR"),
        detail: `${metricPercent(reachableTotal, stats.totalCustomers)} erişilebilir`,
        icon: Mail,
      },
      {
        label: "Aylık ciro",
        value: formatCurrency(stats.monthRevenue),
        detail: `${formatSignedPercent(stats.revenueChange)} önceki aya göre`,
        icon: TrendingUp,
      },
      {
        label: "Eksik iletişim",
        value: stats.contactMissing.toLocaleString("tr-TR"),
        detail: `VIP ${stats.vipCustomers.toLocaleString("tr-TR")}`,
        icon: BarChart3,
      },
    ],
    [reachableTotal, stats],
  );

  return (
    <main aria-busy={loading} className="min-h-screen bg-[#F9F9F9] pb-8 text-[#111827]">
      <div className="mx-auto w-full max-w-none space-y-4 px-4 sm:px-5 xl:px-6">
        <AdminPageShell>
          <AdminPageHeader
            sectionLabel="Pazarlama"
            title="Pazarlama"
            description="Kanal, segment ve kampanya akışını yönetin."
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={loadOverview}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#4B5563] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FFF1E8]"
                >
                  <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                  Yenile
                </button>
                <Link
                  href="/admin/musteriler/segmentler"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm font-semibold text-[#4B5563] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FFF1E8]"
                >
                  <Users2 className="h-4 w-4" />
                  Segmentler
                </Link>
                <Link
                  href="/admin/pazarlama/email"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-[#FF6A00] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(255,106,0,0.18)] transition hover:bg-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)]"
                >
                  <Target className="h-4 w-4" />
                  Kampanya Oluştur
                </Link>
              </div>
            }
            metrics={
              <>
                {metrics.map((metric) => (
                  <MetricCell key={metric.label} {...metric} loading={loading} />
                ))}
              </>
            }
          />

          {error ? (
            <div aria-live="assertive" className="border-y border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {error}
            </div>
          ) : null}

          <section className="grid gap-4 min-[1180px]:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.8fr)]">
            <div className="overflow-hidden border-y border-[#DCE3EC] bg-white min-[760px]:rounded-[12px] min-[760px]:border">
              <SectionHeader
                title="Kanallar"
                summary={`${(data?.channels.length || 0).toLocaleString("tr-TR")} kanal`}
              />

              <div className="hidden grid-cols-[minmax(0,1fr)_150px_40px] border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#4B5563] min-[880px]:grid">
                <span>Kanal</span>
                <span className="text-right">Erişim</span>
                <span />
              </div>

              <div className="divide-y divide-[#E1E6EF]">
                {loading && !data ? (
                  <>
                    <ChannelSkeleton />
                    <ChannelSkeleton />
                    <ChannelSkeleton />
                  </>
                ) : null}

                {!loading && data?.channels.length === 0 ? (
                  <AdminEmptyState
                    title="Kanal bulunamadı"
                    description="Kanal verisi geldiğinde burada listelenecek."
                    className="m-4 border-[#DCE3EC] bg-[#F9F9F9]"
                  />
                ) : null}

                {(data?.channels || []).map((channel) => (
                  <ChannelRow key={channel.id} channel={channel} />
                ))}
              </div>
            </div>

            <div className="overflow-hidden border-y border-[#DCE3EC] bg-white min-[760px]:rounded-[12px] min-[760px]:border">
              <SectionHeader
                title="Sinyaller"
                summary={`${(data?.insights.length || 0).toLocaleString("tr-TR")} öneri`}
              />

              <div className="divide-y divide-[#E1E6EF]">
                {loading && !data ? (
                  <>
                    <InsightSkeleton />
                    <InsightSkeleton />
                    <InsightSkeleton />
                  </>
                ) : null}

                {!loading && data?.insights.length === 0 ? (
                  <AdminEmptyState
                    title="Sinyal yok"
                    description="Öneriler veri geldikçe listelenecek."
                    className="m-4 border-[#DCE3EC] bg-[#F9F9F9]"
                  />
                ) : null}

                {(data?.insights || []).map((insight) => (
                  <InsightRow key={insight.id} insight={insight} />
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-px overflow-hidden border-y border-[#DCE3EC] bg-[#DCE3EC] min-[760px]:rounded-[12px] min-[760px]:border min-[1180px]:grid-cols-3">
            <QuickLink
              title="Şans Çarkı"
              detail="Etkileşim"
              href="/admin/indirimler/sans-carki"
            />
            <QuickLink
              title="E-posta Kampanyaları"
              detail={`${stats.emailReachable.toLocaleString("tr-TR")} müşteri`}
              href="/admin/pazarlama/email"
            />
            <QuickLink
              title="Müşteri Segmentleri"
              detail="Hedef kitle"
              href="/admin/musteriler/segmentler"
            />
          </section>
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
  loading,
}: MetricItem & {
  loading: boolean;
}) {
  return (
    <div className="min-h-[92px] bg-white px-4 py-3.5 xl:px-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6B7280]">{label}</p>
          {loading ? (
            <div className="mt-3 h-7 w-24 animate-pulse rounded-[8px] bg-[#E7EAF0]" />
          ) : (
            <p className="mt-3 truncate text-3xl font-semibold leading-none tracking-[-0.04em] text-[#111827]">{value}</p>
          )}
        </div>
        <Icon className="h-4 w-4 shrink-0 text-[#9CA3AF]" />
      </div>
      <p className="mt-2 truncate text-sm font-medium text-[#6B7280]">{detail}</p>
    </div>
  );
}

function SectionHeader({
  title,
  summary,
}: {
  title: string;
  summary: string;
}) {
  return (
    <div className="flex min-h-[52px] items-center justify-between gap-3 border-b border-[#E1E6EF] bg-white px-4">
      <h2 className="text-base font-semibold tracking-[-0.02em] text-[#111827]">{title}</h2>
      <span className="text-sm font-semibold text-[#6B7280]">{summary}</span>
    </div>
  );
}

function ChannelRow({ channel }: { channel: Channel }) {
  const Icon = CHANNEL_ICON[channel.id];

  return (
    <Link
      href={channel.href}
      className="group grid gap-3 bg-white px-4 py-3.5 transition hover:bg-[#FFF8F3] min-[880px]:grid-cols-[minmax(0,1fr)_150px_40px] min-[880px]:items-center"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-[#DCE3EC] bg-[#F9F9F9] text-[#FF6A00]">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-[#111827]">{channel.title}</h3>
            <span className="text-xs font-semibold text-[#E85D04]">
              {CHANNEL_LABEL[channel.id]}
            </span>
          </div>
          <p className="mt-1 line-clamp-1 text-xs font-medium text-[#6B7280]">{channel.description}</p>
        </div>
      </div>

      <div className="text-sm font-semibold text-[#374151] min-[880px]:text-right">{channel.metric}</div>
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#DCE3EC] bg-white text-[#6B7280] transition group-hover:border-[#FFD1B5] group-hover:text-[#E85D04]">
        <ArrowRight className="h-4 w-4" />
      </span>
    </Link>
  );
}

function InsightRow({ insight }: { insight: Insight }) {
  return (
    <Link
      href={insight.actionHref}
      className="group block bg-white px-4 py-3.5 transition hover:bg-[#FFF8F3]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-[#111827]">{insight.title}</h3>
          <p className="mt-1 line-clamp-1 text-xs font-medium text-[#6B7280]">{insight.subValue}</p>
        </div>
        <span className={cn("shrink-0 text-sm font-semibold", INSIGHT_TONE[insight.type])}>{insight.change}</span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <span className="text-2xl font-semibold leading-none tracking-[-0.04em] text-[#111827]">
          {insight.value.toLocaleString("tr-TR")}
        </span>
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-[#6B7280] transition group-hover:text-[#E85D04]">
          {insight.actionLabel}
          <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}

function QuickLink({
  title,
  detail,
  href,
}: {
  title: string;
  detail: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 bg-white px-4 py-3 text-left transition hover:bg-[#FFF8F3] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FFF1E8]"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-[#111827]">{title}</span>
        <span className="mt-0.5 block truncate text-xs font-medium text-[#6B7280]">{detail}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-[#FF6A00]" />
    </Link>
  );
}

function ChannelSkeleton() {
  return (
    <div className="grid gap-3 px-4 py-3.5 min-[880px]:grid-cols-[minmax(0,1fr)_150px_40px] min-[880px]:items-center">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 animate-pulse rounded-[8px] bg-[#E7EAF0]" />
        <div className="min-w-0 flex-1">
          <div className="h-4 w-40 animate-pulse rounded bg-[#E7EAF0]" />
          <div className="mt-2 h-3 w-64 max-w-full animate-pulse rounded bg-[#EEF3F7]" />
        </div>
      </div>
      <div className="h-4 w-24 animate-pulse rounded bg-[#E7EAF0] min-[880px]:ml-auto" />
      <div className="h-9 w-9 animate-pulse rounded-[8px] bg-[#EEF3F7]" />
    </div>
  );
}

function InsightSkeleton() {
  return (
    <div className="px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="h-4 w-40 animate-pulse rounded bg-[#E7EAF0]" />
          <div className="mt-2 h-3 w-56 max-w-full animate-pulse rounded bg-[#EEF3F7]" />
        </div>
        <div className="h-4 w-20 animate-pulse rounded bg-[#E7EAF0]" />
      </div>
      <div className="mt-4 h-8 w-16 animate-pulse rounded bg-[#E7EAF0]" />
    </div>
  );
}
