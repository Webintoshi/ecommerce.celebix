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
  email: "border-[#FE6100]/12 bg-gradient-to-br from-[#fff2e8] to-white text-[#FE6100]",
  whatsapp: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white text-emerald-600",
  phone: "border-[#eadccd] bg-gradient-to-br from-[#f8f2ec] to-white text-[#7b6656]",
};

const INSIGHT_BADGE: Record<Insight["type"], string> = {
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  info: "border-[#f0cfb2] bg-[#fff5ec] text-[#c96a2b]",
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
    <div className="min-h-screen bg-[#f6efe7] px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-[32px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdf9] to-[#f8efe6] p-6 shadow-[0_24px_80px_rgba(120,74,32,0.10)] md:p-8">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="inline-flex w-fit items-center rounded-full border border-[#FE6100]/18 bg-gradient-to-r from-[#FE6100]/10 to-[#FFB067]/10 px-5 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-[#C54E00]">
              Pazarlama Merkezi
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/admin/musteriler/segmentler"
                className="inline-flex items-center gap-2 rounded-2xl border border-[#eadccd] bg-white px-4 py-3 text-sm font-medium text-[#7b6656] shadow-sm transition-all hover:border-[#FE6100]/25 hover:bg-[#fff8f1] hover:text-[#C54E00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/16"
              >
                <Users2 className="h-4 w-4" />
                Segmentler
              </Link>
              <Link
                href="/admin/pazarlama/email"
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#FE6100] to-[#E45700] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_rgba(254,97,0,0.22)] transition hover:translate-y-[-1px] hover:from-[#f15c00] hover:to-[#d84f00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/18"
              >
                <Target className="h-4 w-4" />
                Kampanya Olustur
              </Link>
              <button
                onClick={loadOverview}
                className="inline-flex items-center gap-2 rounded-2xl border border-[#eadccd] bg-white px-4 py-3 text-sm font-medium text-[#7b6656] shadow-sm transition-all hover:border-[#FE6100]/25 hover:bg-[#fff8f1] hover:text-[#C54E00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/16"
                aria-label="Pazarlama verilerini yenile"
              >
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                Yenile
              </button>
            </div>
          </div>
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#FE6100]/10 blur-3xl" />
        </section>

        {error && <div className="rounded-[24px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Toplam Müşteri" value={`${stats.totalCustomers}`} note={`Son 30 gün: ${stats.newCustomers30d}`} icon={Users} tone="border-[#FE6100]/12 bg-gradient-to-br from-[#fff2e8] to-white text-[#FE6100]" />
          <StatCard title="Aylik Ciro" value={formatCurrency(stats.monthRevenue)} note={`${stats.revenueChange >= 0 ? "+" : ""}%${stats.revenueChange} gecen aya gore`} icon={TrendingUp} tone="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white text-emerald-600" />
          <StatCard title="Toplam Ciro" value={formatCurrency(stats.totalRevenue)} note={`VIP musteri: ${stats.vipCustomers}`} icon={BarChart3} tone="border-amber-200 bg-gradient-to-br from-amber-50 to-white text-amber-600" />
          <StatCard title="Iletisim Kapsamasi" value={`${stats.emailReachable + stats.phoneReachable}`} note={`Eksik bilgi: ${stats.contactMissing}`} icon={Mail} tone="border-[#eadccd] bg-gradient-to-br from-[#f8f2ec] to-white text-[#7b6656]" />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#2f241d]">Pazarlama Kanallari</h2>
              <span className="rounded-full border border-[#eadccd] bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">
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
                    className="group flex flex-col justify-between rounded-[28px] border border-[#eadccd] bg-white/95 p-6 shadow-[0_18px_40px_rgba(99,67,37,0.08)] transition-all hover:-translate-y-1 hover:border-[#FE6100]/18 hover:bg-white hover:shadow-[0_24px_55px_rgba(254,97,0,0.10)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/16"
                  >
                    <div>
                      <div className={cn("mb-6 flex h-14 w-14 items-center justify-center rounded-[20px] border shadow-sm", CHANNEL_TONE[channel.id])}>
                        <Icon className="h-6 w-6" />
                      </div>
                      <h3 className="text-lg font-semibold tracking-[-0.02em] text-[#2f241d]">{channel.title}</h3>
                      <p className="mt-3 text-sm leading-6 text-[#7d6959]">{channel.description}</p>
                    </div>
                    <div className="mt-6 flex items-center justify-between rounded-[20px] border border-[#f1e5d9] bg-[#fdf8f3] px-4 py-3">
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a7c67]">{channel.metric}</span>
                      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#eadccd] bg-white text-[#7b6656] transition-all group-hover:border-[#FE6100]/20 group-hover:text-[#C54E00]">
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
              <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#2f241d]">Oneriler</h2>
              <span className="rounded-full border border-[#eadccd] bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">
                {data?.insights.length || 0} sinyal
              </span>
            </div>

            <div className="space-y-4">
              {(data?.insights || []).map((insight) => (
                <div key={insight.id} className="rounded-[26px] border border-[#eadccd] bg-white/95 p-5 shadow-[0_16px_35px_rgba(99,67,37,0.08)]">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-sm font-semibold text-[#2f241d]">{insight.title}</span>
                    <div className={cn("rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em]", INSIGHT_BADGE[insight.type])}>
                      {insight.change}
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="text-2xl font-bold tracking-[-0.03em] text-[#2f241d]">{insight.value}</div>
                    <div className="mt-1 text-xs text-[#8c7564]">{insight.subValue}</div>
                  </div>
                  <Link
                    href={insight.actionHref}
                    className="mt-5 inline-flex w-full items-center justify-center rounded-2xl border border-[#eadccd] bg-[#fdf8f3] px-4 py-3 text-sm font-semibold text-[#6e5b4e] transition-all hover:border-[#FE6100]/20 hover:bg-[#fff7f1] hover:text-[#C54E00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/16"
                  >
                    {insight.actionLabel}
                  </Link>
                </div>
              ))}

              <div className="relative overflow-hidden rounded-[30px] border border-[#FE6100]/10 bg-gradient-to-r from-[#2f241d] via-[#4f3829] to-[#694833] p-6 text-white shadow-[0_24px_70px_rgba(47,36,29,0.22)]">
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
                    className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-[#3d2b1f] shadow-[0_16px_35px_rgba(255,255,255,0.16)] transition hover:bg-[#fff5ec] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/25"
                  >
                    Segmentlere Git
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
                <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-[#FE6100]/25 blur-3xl" />
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
    <div className="rounded-[28px] border border-[#eadccd] bg-white/95 p-6 shadow-[0_18px_40px_rgba(99,67,37,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#9a7c67]">{title}</p>
          <p className="mt-2 text-3xl font-bold tracking-[-0.03em] text-[#2f241d]">{value}</p>
        </div>
        <div className={cn("flex h-12 w-12 items-center justify-center rounded-[18px] border shadow-sm", tone)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-5 inline-flex rounded-full border border-[#f1e5d9] bg-[#fdf8f3] px-3 py-1.5 text-xs font-semibold text-[#7d6959]">
        {note}
      </div>
    </div>
  );
}
