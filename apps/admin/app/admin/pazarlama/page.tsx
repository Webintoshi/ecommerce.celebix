"use client";

import { useEffect, useState } from "react";
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

const CHANNEL_ICON: Record<Channel["id"], typeof Mail> = {
  email: Mail,
  whatsapp: MessageCircle,
  phone: Phone,
};

const CHANNEL_TONE: Record<Channel["id"], string> = {
  email: "border-[var(--admin-border)] bg-[var(--admin-accent-soft)] text-[var(--admin-accent)]",
  whatsapp: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white text-emerald-600",
  phone: "border-[var(--admin-border)] bg-gradient-to-br from-[#f8f2ec] to-white text-[var(--admin-text-secondary)]",
};

const INSIGHT_BADGE: Record<Insight["type"], string> = {
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  info: "border-[var(--admin-border)] bg-[#fff5ec] text-[var(--admin-accent-hover)]",
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(value || 0);
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
        throw new Error(result?.error || "Pazarlama verileri alinamadi.");
      }

      setData({
        stats: result.stats,
        channels: result.channels,
        insights: result.insights,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Beklenmeyen bir hata olustu.");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  const stats = data?.stats || {
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

  return (
    <div className="admin-page-root px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-[32px] border border-[var(--admin-border)] bg-white p-6 shadow-[var(--shadow-md)] md:p-8">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="inline-flex w-fit items-center rounded-full border border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] px-5 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--admin-accent-hover)]">
              Pazarlama Merkezi
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/admin/musteriler/segmentler"
                className="inline-flex items-center gap-2 rounded-2xl border border-[var(--admin-border)] bg-white px-4 py-3 text-sm font-medium text-[var(--admin-text-secondary)] shadow-sm transition-all hover:border-[var(--admin-accent-border)] hover:bg-[var(--admin-accent-soft)] hover:text-[var(--admin-accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.16)]"
              >
                <Users2 className="h-4 w-4" />
                Segmentler
              </Link>
              <Link
                href="/admin/pazarlama/email"
                className="inline-flex items-center gap-2 rounded-2xl bg-[var(--admin-accent)] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(255,106,0,0.18)] transition hover:translate-y-[-1px] hover:bg-[var(--admin-accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]"
              >
                <Target className="h-4 w-4" />
                Kampanya Olustur
              </Link>
              <button
                onClick={loadOverview}
                className="inline-flex items-center gap-2 rounded-2xl border border-[var(--admin-border)] bg-white px-4 py-3 text-sm font-medium text-[var(--admin-text-secondary)] shadow-sm transition-all hover:border-[var(--admin-accent-border)] hover:bg-[var(--admin-accent-soft)] hover:text-[var(--admin-accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.16)]"
                aria-label="Pazarlama verilerini yenile"
              >
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                Yenile
              </button>
            </div>
          </div>
          <div className="hidden" />
        </section>

        {error && <div className="rounded-[24px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Toplam Müşteri" value={`${stats.totalCustomers}`} note={`Son 30 gün: ${stats.newCustomers30d}`} icon={Users} tone="border-[var(--admin-border)] bg-[var(--admin-accent-soft)] text-[var(--admin-accent)]" />
          <StatCard title="Aylik Ciro" value={formatCurrency(stats.monthRevenue)} note={`${stats.revenueChange >= 0 ? "+" : ""}%${stats.revenueChange} gecen aya gore`} icon={TrendingUp} tone="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white text-emerald-600" />
          <StatCard title="Toplam Ciro" value={formatCurrency(stats.totalRevenue)} note={`VIP musteri: ${stats.vipCustomers}`} icon={BarChart3} tone="border-amber-200 bg-gradient-to-br from-amber-50 to-white text-amber-600" />
          <StatCard title="Iletisim Kapsamasi" value={`${stats.emailReachable + stats.phoneReachable}`} note={`Eksik bilgi: ${stats.contactMissing}`} icon={Mail} tone="border-[var(--admin-border)] bg-gradient-to-br from-[#f8f2ec] to-white text-[var(--admin-text-secondary)]" />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-[-0.02em] text-[var(--admin-heading)]">Pazarlama Kanallari</h2>
              <span className="rounded-full border border-[var(--admin-border)] bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">
                {data?.channels.length || 0} kanal
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {(data?.channels || []).map((channel) => {
                const Icon = CHANNEL_ICON[channel.id];
                return (
                  <Link
                    key={channel.id}
                    href={channel.href}
                    className="group flex flex-col justify-between rounded-[28px] border border-[var(--admin-border)] bg-white/95 p-6 shadow-[var(--shadow-md)] transition-all hover:-translate-y-1 hover:border-[var(--admin-accent-border)] hover:bg-white hover:shadow-[var(--shadow-md)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.16)]"
                  >
                    <div>
                      <div className={cn("mb-6 flex h-14 w-14 items-center justify-center rounded-[20px] border shadow-sm", CHANNEL_TONE[channel.id])}>
                        <Icon className="h-6 w-6" />
                      </div>
                      <h3 className="text-lg font-semibold tracking-[-0.02em] text-[var(--admin-heading)]">{channel.title}</h3>
                      <p className="mt-3 text-sm leading-6 text-[#7d6959]">{channel.description}</p>
                    </div>
                    <div className="mt-6 flex items-center justify-between rounded-[20px] border border-[var(--admin-border)] bg-[#FCFDFE] px-4 py-3">
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a7c67]">{channel.metric}</span>
                      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--admin-border)] bg-white text-[var(--admin-text-secondary)] transition-all group-hover:border-[var(--admin-accent-border)] group-hover:text-[var(--admin-accent-hover)]">
                        <ArrowRight className="h-4 w-4" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-[-0.02em] text-[var(--admin-heading)]">Oneriler</h2>
              <span className="rounded-full border border-[var(--admin-border)] bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">
                {data?.insights.length || 0} sinyal
              </span>
            </div>

            <div className="space-y-4">
              {(data?.insights || []).map((insight) => (
                <div key={insight.id} className="rounded-[26px] border border-[var(--admin-border)] bg-white/95 p-5 shadow-[var(--shadow-md)]">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-sm font-semibold text-[var(--admin-heading)]">{insight.title}</span>
                    <div className={cn("rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em]", INSIGHT_BADGE[insight.type])}>
                      {insight.change}
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="text-2xl font-bold tracking-[-0.03em] text-[var(--admin-heading)]">{insight.value}</div>
                    <div className="mt-1 text-xs text-[#8c7564]">{insight.subValue}</div>
                  </div>
                  <Link
                    href={insight.actionHref}
                    className="mt-5 inline-flex w-full items-center justify-center rounded-2xl border border-[var(--admin-border)] bg-[#FCFDFE] px-4 py-3 text-sm font-semibold text-[var(--admin-text-secondary)] transition-all hover:border-[var(--admin-accent-border)] hover:bg-[var(--admin-accent-soft)] hover:text-[var(--admin-accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.16)]"
                  >
                    {insight.actionLabel}
                  </Link>
                </div>
              ))}

              <div className="relative overflow-hidden rounded-[30px] border border-[var(--admin-border)] bg-gradient-to-r from-[#2f241d] via-[#4f3829] to-[#694833] p-6 text-white shadow-[var(--shadow-md)]">
                <div className="relative z-10">
                  <div className="mb-3 inline-flex items-center rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#ffd2af]">
                    Canli Segment Fikri
                  </div>
                  <h4 className="text-lg font-semibold tracking-[-0.02em]">Yeni musteri grubunu tekrar satin alma akisina alin</h4>
                  <p className="mt-3 text-sm leading-6 text-[#f6ddcb]">
                    Son 30 gunde gelen yeni musterileri ayri bir segmente alip WhatsApp ve e-posta kombinasyonu ile sicak bir geri donus akisi baslatin.
                  </p>
                  <Link
                    href="/admin/musteriler/segmentler"
                    className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-[var(--admin-heading)] shadow-[0_16px_35px_rgba(255,255,255,0.16)] transition hover:bg-[#fff5ec] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/25"
                  >
                    Segmentlere Git
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
                <div className="hidden" />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  note,
  icon: Icon,
  tone,
}: {
  title: string;
  value: string;
  note: string;
  icon: typeof Users;
  tone: string;
}) {
  return (
    <div className="rounded-[28px] border border-[var(--admin-border)] bg-white/95 p-6 shadow-[var(--shadow-md)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#9a7c67]">{title}</p>
          <p className="mt-2 text-3xl font-bold tracking-[-0.03em] text-[var(--admin-heading)]">{value}</p>
        </div>
        <div className={cn("flex h-12 w-12 items-center justify-center rounded-[18px] border shadow-sm", tone)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-5 inline-flex rounded-full border border-[var(--admin-border)] bg-[#FCFDFE] px-3 py-1.5 text-xs font-semibold text-[#7d6959]">
        {note}
      </div>
    </div>
  );
}
