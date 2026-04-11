"use client";

import { useState, useEffect, useCallback } from "react";
import type { ElementType } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarRange,
  CreditCard,
  Download,
  DollarSign,
  Eye,
  Loader2,
  Monitor,
  ShoppingBag,
  Sparkles,
  Tablet,
  TrendingUp,
  Users,
  Wifi,
} from "lucide-react";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { AnalyticsStats, TimeRange } from "@/types/analytics";

interface DashboardData {
  success?: boolean;
  stats: AnalyticsStats;
  trendData: { date: string; revenue: number; orders: number }[];
  abandonedCartStats: {
    totalValue: number;
    recoveryRate: number;
    recoveredCount: number;
    totalCount: number;
  };
}

interface LiveAnalyticsData {
  liveVisitors: number;
  devices: {
    mobile: number;
    desktop: number;
    tablet: number;
  };
  topPages: Array<{ url: string; count: number }>;
  today: {
    addToCart: number;
    purchases: number;
  };
}

const PERIODS: Array<{ label: string; value: TimeRange }> = [
  { label: "Bugün", value: "today" },
  { label: "Bu Hafta", value: "week" },
  { label: "Bu Ay", value: "month" },
  { label: "Yıl", value: "year" },
];

const ANIMATION_EASE = [0.22, 1, 0.36, 1] as const;

function formatCurrency(value: number) {
  return `₺${value.toLocaleString("tr-TR")}`;
}

function formatLastUpdated(date: Date | null) {
  if (!date) return "Veri alınıyor";
  return date.toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTopPageLabel(url: string) {
  if (!url || url === "/") return "Ana Sayfa";
  return url.length > 26 ? `${url.slice(0, 26)}...` : url;
}

export default function AnalyticsPage() {
  const [selectedPeriod, setSelectedPeriod] = useState<TimeRange>("week");
  const [loading, setLoading] = useState(true);
  const [liveVisitors, setLiveVisitors] = useState(0);
  const [data, setData] = useState<DashboardData | null>(null);
  const [liveData, setLiveData] = useState<LiveAnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [lastLiveUpdatedAt, setLastLiveUpdatedAt] = useState<Date | null>(null);

  const fetchAnalyticsData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/dashboard?timeRange=${selectedPeriod}`, {
        cache: "no-store",
      });
      const jsonData = await res.json();
      if (!res.ok || !jsonData?.success) {
        throw new Error(jsonData?.error || "Veri yüklenemedi");
      }
      setData(jsonData as DashboardData);
      setLastUpdatedAt(new Date());
    } catch (err) {
      console.error("Analytics fetch error:", err);
      setError("Veriler yüklenirken bir hata oluştu");
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod]);

  useEffect(() => {
    const fetchLiveData = async () => {
      try {
        const res = await fetch("/api/analytics/live", { cache: "no-store" });
        const result = await res.json();

        if (res.ok && result?.success && result?.data) {
          setLiveVisitors(result.data.liveVisitors || 0);
          setLiveData(result.data as LiveAnalyticsData);
          setLastLiveUpdatedAt(new Date());
          return;
        }

        const heartbeatRes = await fetch("/api/analytics/heartbeat", { cache: "no-store" });
        const heartbeatResult = await heartbeatRes.json();
        setLiveVisitors(heartbeatResult.visitors || 0);
        setLiveData(null);
        setLastLiveUpdatedAt(new Date());
      } catch {
        setLiveVisitors(0);
        setLiveData(null);
      }
    };

    fetchLiveData();
    const interval = setInterval(fetchLiveData, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchAnalyticsData();
  }, [fetchAnalyticsData]);

  const handleExport = async (format: "json" | "csv") => {
    if (!data) return;

    if (format === "json") {
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rapor_${selectedPeriod}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const headers = "Tarih,Gelir,Sipariş\n";
      const rows = data.trendData.map((d) => `${d.date},${d.revenue},${d.orders}`).join("\n");
      const blob = new Blob([headers + rows], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rapor_${selectedPeriod}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const stats = data?.stats || {
    revenue: 0,
    orders: 0,
    customers: 0,
    conversionRate: 0,
    avgOrderValue: 0,
    revenueChange: 0,
    ordersChange: 0,
    customersChange: 0,
    conversionChange: 0,
  };

  const trendData = data?.trendData || [];
  const abandonedCartStats = data?.abandonedCartStats || {
    totalValue: 0,
    recoveryRate: 0,
    recoveredCount: 0,
    totalCount: 0,
  };
  const topPages = liveData?.topPages || [];
  const addToCartCount = liveData?.today?.addToCart || 0;
  const purchaseCount = liveData?.today?.purchases || 0;
  const pageViewCount = topPages.reduce((sum, page) => sum + page.count, 0);
  const liveDeviceTotal =
    (liveData?.devices.mobile || 0) +
    (liveData?.devices.desktop || 0) +
    (liveData?.devices.tablet || 0);
  const recoveredRevenue = Math.round(
    abandonedCartStats.totalValue * (abandonedCartStats.recoveryRate / 100)
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#faf8f5] via-[#f5f0eb] to-[#f0e8e0]">
      {/* Warm ambient background shapes */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-gradient-to-br from-[#7b1113]/10 via-[#a52a2a]/5 to-transparent rounded-full blur-3xl" />
        <div className="absolute top-1/3 -left-20 w-72 h-72 bg-gradient-to-tr from-amber-200/20 via-orange-100/10 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-gradient-to-tl from-rose-100/20 via-[#7b1113]/5 to-transparent rounded-full blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-[1600px] px-4 py-6 md:px-6 md:py-8 lg:px-8">
        <div className="space-y-8">
          {/* Hero Header with warm tones */}
          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: ANIMATION_EASE }}
            className="overflow-hidden rounded-[30px] border border-[#7b1113]/10 bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] shadow-[0_24px_80px_rgba(123,17,19,0.12)]"
          >
            <div className="border-b border-[#7b1113]/8 px-6 py-5 md:px-8 md:py-6">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                <div className="space-y-4">
                  <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#7b1113]/20 bg-gradient-to-r from-[#7b1113]/10 to-[#a52a2a]/5 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#7b1113]">
                    <Sparkles className="h-3.5 w-3.5" />
                    Analytics Suite
                  </div>

                  <div className="max-w-3xl space-y-3">
                    <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                      <div>
                        <h1 className="text-3xl font-semibold tracking-[-0.04em] text-gray-950 md:text-[40px]">
                          Analizler
                        </h1>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600 md:text-[15px]">
                          Mağazanızın gelir, dönüşüm ve canlı trafik sinyallerini sade ama premium
                          bir yüzeyde izleyin.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
                      <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/50 px-3 py-1.5 text-amber-800">
                        <CalendarRange className="h-3.5 w-3.5" />
                        Son güncelleme {formatLastUpdated(lastUpdatedAt)}
                      </div>
                      <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/50 px-3 py-1.5 text-emerald-700">
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                        </span>
                        Canlı akış {formatLastUpdated(lastLiveUpdatedAt)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3 xl:items-end">
                  <div className="flex flex-wrap items-center gap-2 rounded-[22px] border border-[#7b1113]/10 bg-gradient-to-r from-[#faf5f0] to-[#f5ebe3] p-1.5 shadow-inner">
                    {PERIODS.map((period) => {
                      const active = selectedPeriod === period.value;
                      return (
                        <button
                          key={period.value}
                          onClick={() => setSelectedPeriod(period.value)}
                          className={cn(
                            "rounded-2xl px-4 py-2 text-sm font-medium transition-all duration-200",
                            active
                              ? "bg-gradient-to-r from-[#7b1113] to-[#8b2224] text-white shadow-[0_10px_30px_rgba(123,17,19,0.25)]"
                              : "text-gray-600 hover:bg-white hover:text-[#7b1113]"
                          )}
                        >
                          {period.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => handleExport("csv")}
                      disabled={loading || !data}
                      className="inline-flex items-center gap-2 rounded-2xl border border-[#7b1113]/15 bg-white px-4 py-2.5 text-sm font-medium text-[#7b1113] shadow-sm transition-all hover:bg-[#faf5f0] hover:border-[#7b1113]/25 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Download className="h-4 w-4" />
                      CSV indir
                    </button>
                    <button
                      onClick={() => handleExport("json")}
                      disabled={loading || !data}
                      className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#7b1113] to-[#8b2224] px-4 py-2.5 text-sm font-medium text-white shadow-[0_16px_30px_rgba(123,17,19,0.25)] transition-all hover:from-[#8b2224] hover:to-[#9b3335] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Download className="h-4 w-4" />
                      JSON indir
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Header metrics with warm backgrounds */}
            <div className="grid grid-cols-1 gap-px bg-gradient-to-r from-[#7b1113]/10 via-[#a52a2a]/5 to-[#7b1113]/10 md:grid-cols-3 xl:grid-cols-4">
              <HeaderMetric
                label="Canlı ziyaretçi"
                value={liveVisitors.toLocaleString("tr-TR")}
                hint="Anlık trafik"
                tone="emerald"
              />
              <HeaderMetric
                label="Ort. sipariş"
                value={formatCurrency(stats.avgOrderValue || 0)}
                hint="Seçili dönem"
                tone="amber"
              />
              <HeaderMetric
                label="Sayfa görüntüleme"
                value={pageViewCount.toLocaleString("tr-TR")}
                hint="Canlı popüler sayfalar"
                tone="rose"
              />
              <HeaderMetric
                label="Sepet aksiyonu"
                value={addToCartCount.toLocaleString("tr-TR")}
                hint="Son 24 saat"
                tone="burgundy"
                className="md:col-span-3 xl:col-span-1"
              />
            </div>
          </motion.section>

          {error ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: ANIMATION_EASE }}
              className="rounded-[24px] border border-rose-200 bg-gradient-to-r from-rose-50 to-red-50 px-5 py-4 text-sm font-medium text-rose-700 shadow-sm"
            >
              {error}
            </motion.div>
          ) : null}

          {/* KPI Cards with color accents */}
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              index={0}
              title="Toplam Gelir"
              value={formatCurrency(stats.revenue || 0)}
              change={stats.revenueChange}
              icon={DollarSign}
              loading={loading}
              accent="burgundy"
            />
            <KpiCard
              index={1}
              title="Siparişler"
              value={(stats.orders || 0).toLocaleString("tr-TR")}
              change={stats.ordersChange}
              icon={ShoppingBag}
              loading={loading}
              accent="amber"
            />
            <KpiCard
              index={2}
              title="Toplam Müşteri"
              value={(stats.customers || 0).toLocaleString("tr-TR")}
              change={stats.customersChange}
              icon={Users}
              loading={loading}
              accent="emerald"
            />
            <KpiCard
              index={3}
              title="Dönüşüm Oranı"
              value={`%${stats.conversionRate || 0}`}
              change={stats.conversionChange}
              icon={TrendingUp}
              loading={loading}
              accent="blue"
            />
          </section>

          {/* Main content grid */}
          <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(360px,0.95fr)]">
            <RevenueCard
              loading={loading}
              trendData={trendData}
              stats={stats}
              selectedPeriod={selectedPeriod}
            />

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-1">
              <LiveSnapshotCard
                liveVisitors={liveVisitors}
                liveData={liveData}
                pageViewCount={pageViewCount}
                addToCartCount={addToCartCount}
                liveDeviceTotal={liveDeviceTotal}
                lastLiveUpdatedAt={lastLiveUpdatedAt}
              />
              <CartRecoveryCard
                loading={loading}
                abandonedCartStats={abandonedCartStats}
                recoveredRevenue={recoveredRevenue}
                addToCartCount={addToCartCount}
                purchaseCount={purchaseCount}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function HeaderMetric({
  label,
  value,
  hint,
  className,
  tone = "slate",
}: {
  label: string;
  value: string;
  hint: string;
  className?: string;
  tone?: "slate" | "burgundy" | "amber" | "emerald" | "rose" | "blue";
}) {
  const toneStyles = {
    slate: "from-gray-50 to-white",
    burgundy: "from-[#faf0f0] via-[#fdf5f3] to-white",
    amber: "from-amber-50 via-orange-50/50 to-white",
    emerald: "from-emerald-50 via-teal-50/50 to-white",
    rose: "from-rose-50 via-pink-50/50 to-white",
    blue: "from-blue-50 via-indigo-50/50 to-white",
  };

  const valueColors = {
    slate: "text-gray-950",
    burgundy: "text-[#7b1113]",
    amber: "text-amber-700",
    emerald: "text-emerald-700",
    rose: "text-rose-700",
    blue: "text-blue-700",
  };

  return (
    <div className={cn("bg-gradient-to-br px-6 py-5 md:px-8", toneStyles[tone], className)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">{label}</p>
      <p className={cn("mt-2 text-2xl font-semibold tracking-[-0.04em]", valueColors[tone])}>{value}</p>
      <p className="mt-1 text-sm text-gray-500">{hint}</p>
    </div>
  );
}

function KpiCard({
  title,
  value,
  change,
  icon: Icon,
  loading,
  accent,
  index,
}: {
  title: string;
  value: string;
  change: number;
  icon: ElementType;
  loading: boolean;
  accent: "burgundy" | "amber" | "emerald" | "blue" | "slate";
  index: number;
}) {
  const isPositive = change >= 0;

  const accentStyles = {
    burgundy: {
      gradient: "from-[#7b1113]/20 via-[#a52a2a]/10 to-[#faf0f0]/50",
      iconBg: "bg-gradient-to-br from-[#7b1113] to-[#8b2224] text-white",
      iconColor: "",
      border: "border-[#7b1113]/15",
    },
    amber: {
      gradient: "from-amber-400/20 via-orange-300/10 to-amber-50/50",
      iconBg: "bg-gradient-to-br from-amber-500 to-orange-500 text-white",
      iconColor: "",
      border: "border-amber-400/30",
    },
    emerald: {
      gradient: "from-emerald-400/20 via-teal-300/10 to-emerald-50/50",
      iconBg: "bg-gradient-to-br from-emerald-500 to-teal-500 text-white",
      iconColor: "",
      border: "border-emerald-400/30",
    },
    blue: {
      gradient: "from-blue-400/20 via-indigo-300/10 to-blue-50/50",
      iconBg: "bg-gradient-to-br from-blue-500 to-indigo-500 text-white",
      iconColor: "",
      border: "border-blue-400/30",
    },
    slate: {
      gradient: "from-gray-400/15 via-slate-300/10 to-gray-50/50",
      iconBg: "bg-gradient-to-br from-gray-700 to-slate-600 text-white",
      iconColor: "",
      border: "border-gray-300/50",
    },
  };

  const style = accentStyles[accent];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, delay: index * 0.06, ease: ANIMATION_EASE }}
      className={cn(
        "group relative overflow-hidden rounded-[28px] border bg-gradient-to-br shadow-[0_18px_55px_rgba(0,0,0,0.08)]",
        style.border,
        style.gradient
      )}
    >
      <div className="relative p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <div className={cn(
              "flex h-12 w-12 items-center justify-center rounded-2xl shadow-lg transition-transform duration-300 group-hover:scale-[1.08]",
              style.iconBg
            )}>
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">{title}</p>
              <h3 className="mt-2 text-[30px] font-semibold tracking-[-0.05em] text-gray-950">
                {loading ? <span className="text-gray-300">...</span> : value}
              </h3>
            </div>
          </div>

          {!loading ? (
            <div
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold",
                isPositive 
                  ? "bg-gradient-to-r from-emerald-100 to-teal-50 text-emerald-700 border border-emerald-200/50" 
                  : "bg-gradient-to-r from-rose-100 to-pink-50 text-rose-700 border border-rose-200/50"
              )}
            >
              {isPositive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              %{Math.abs(change)}
            </div>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}

function RevenueCard({
  loading,
  trendData,
  stats,
  selectedPeriod,
}: {
  loading: boolean;
  trendData: Array<{ date: string; revenue: number; orders: number }>;
  stats: AnalyticsStats;
  selectedPeriod: TimeRange;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.48, delay: 0.18, ease: ANIMATION_EASE }}
      className="overflow-hidden rounded-[30px] border border-[#7b1113]/10 bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] shadow-[0_24px_80px_rgba(123,17,19,0.1)]"
    >
      <div className="border-b border-[#7b1113]/8 px-6 py-6 md:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex w-fit items-center gap-2 rounded-full bg-gradient-to-r from-[#faf0f0] to-[#fdf5f3] border border-[#7b1113]/15 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#7b1113]">
              Gelir trendi
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.04em] text-gray-950 md:text-[30px]">
                Dönemsel gelir akışı
              </h2>
              <p className="mt-2 text-sm leading-6 text-gray-600 md:text-[15px]">
                {selectedPeriod === "today"
                  ? "Bugün içindeki sipariş ve gelir hareketlerini izleyin."
                  : "Seçili zaman aralığında gelir performansınızın nasıl şekillendiğini görün."}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <InsightPill label="Toplam gelir" value={formatCurrency(stats.revenue || 0)} tone="burgundy" />
            <InsightPill label="Ort. sipariş" value={formatCurrency(stats.avgOrderValue || 0)} tone="amber" />
            <InsightPill label="Sipariş" value={(stats.orders || 0).toLocaleString("tr-TR")} tone="emerald" />
          </div>
        </div>
      </div>

      <div className="px-4 pb-4 pt-6 md:px-6 md:pb-6">
        <div className="h-[360px] rounded-[26px] border border-[#7b1113]/10 bg-gradient-to-b from-[#faf0f0]/60 via-white/40 to-white p-4 md:p-6">
          {loading ? (
            <ChartSkeleton />
          ) : trendData.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center rounded-[22px] border border-dashed border-[#7b1113]/20 bg-gradient-to-b from-[#faf5f0]/70 to-white px-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#faf0f0] to-white text-[#7b1113]">
                <TrendingUp className="h-6 w-6" />
              </div>
              <p className="mt-4 text-base font-medium text-gray-900">Veri bulunmuyor</p>
              <p className="mt-1 max-w-sm text-sm text-gray-500">
                Seçili dönem için henüz gösterilecek gelir trendi oluşmadı.
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ left: 8, right: 8, top: 12, bottom: 4 }}>
                <defs>
                  <linearGradient id="analyticsRevenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7B1113" stopOpacity={0.35} />
                    <stop offset="30%" stopColor="#7B1113" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#7B1113" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#ebe0d8" strokeDasharray="3 6" />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "#8a7a70" }}
                  dy={12}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "#8a7a70" }}
                  tickFormatter={(value) => `₺${value}`}
                  width={62}
                />
                <Tooltip
                  cursor={{ stroke: "#7B1113", strokeOpacity: 0.2, strokeWidth: 1 }}
                  contentStyle={{
                    background: "linear-gradient(135deg, rgba(123,17,19,0.98), rgba(139,34,36,0.98))",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: "18px",
                    boxShadow: "0 20px 60px rgba(123,17,19,0.35)",
                  }}
                  labelStyle={{ color: "rgba(255,255,255,0.8)", marginBottom: 8 }}
                  itemStyle={{ color: "#ffffff" }}
                  formatter={(value, name) => {
                    const numericValue = Number(value || 0);
                    if (name === "revenue") {
                      return [formatCurrency(numericValue), "Gelir"];
                    }
                    return [numericValue.toLocaleString("tr-TR"), "Sipariş"];
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#7B1113"
                  strokeWidth={3}
                  fill="url(#analyticsRevenueFill)"
                  dot={false}
                  activeDot={{ r: 5, fill: "#7B1113", stroke: "#fff", strokeWidth: 3 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function InsightPill({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "burgundy" | "amber" | "emerald" }) {
  const toneStyles = {
    slate: "from-gray-100 to-gray-50 border-gray-200 text-gray-700",
    burgundy: "from-[#faf0f0] to-[#fdf5f3] border-[#7b1113]/15 text-[#7b1113]",
    amber: "from-amber-50 to-orange-50/70 border-amber-200/50 text-amber-700",
    emerald: "from-emerald-50 to-teal-50/70 border-emerald-200/50 text-emerald-700",
  };

  return (
    <div className={cn("rounded-[22px] border bg-gradient-to-br px-4 py-3", toneStyles[tone])}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] opacity-70">{label}</p>
      <p className="mt-2 text-lg font-semibold tracking-[-0.03em]">{value}</p>
    </div>
  );
}

function LiveSnapshotCard({
  liveVisitors,
  liveData,
  pageViewCount,
  addToCartCount,
  liveDeviceTotal,
  lastLiveUpdatedAt,
}: {
  liveVisitors: number;
  liveData: LiveAnalyticsData | null;
  pageViewCount: number;
  addToCartCount: number;
  liveDeviceTotal: number;
  lastLiveUpdatedAt: Date | null;
}) {
  const devices = [
    {
      label: "Mobil",
      value: liveData?.devices.mobile || 0,
      icon: Eye,
      tone: "from-[#faf0f0] to-[#fdf5f3] border-[#7b1113]/15 text-[#7b1113]",
      barColor: "bg-[#7b1113]",
    },
    {
      label: "Desktop",
      value: liveData?.devices.desktop || 0,
      icon: Monitor,
      tone: "from-gray-50 to-slate-50 border-gray-200 text-gray-700",
      barColor: "bg-gray-600",
    },
    {
      label: "Tablet",
      value: liveData?.devices.tablet || 0,
      icon: Tablet,
      tone: "from-emerald-50 to-teal-50 border-emerald-200/50 text-emerald-700",
      barColor: "bg-emerald-500",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.48, delay: 0.24, ease: ANIMATION_EASE }}
      className="overflow-hidden rounded-[30px] border border-[#7b1113]/10 bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] shadow-[0_24px_80px_rgba(123,17,19,0.1)]"
    >
      <div className="border-b border-[#7b1113]/8 px-6 py-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#7b1113]">
              Canlı trafik
            </p>
            <h3 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-gray-950">
              Anlık ziyaretçiler
            </h3>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
            <Wifi className="h-3.5 w-3.5" />
            {formatLastUpdated(lastLiveUpdatedAt)}
          </div>
        </div>
      </div>

      <div className="space-y-6 p-6">
        {/* Live visitors big number */}
        <div className="rounded-[28px] border border-[#7b1113]/10 bg-gradient-to-br from-[#faf0f0] via-[#fdf5f3] to-white p-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-[#7b1113]/70">Online kişi</p>
              <div className="mt-2 flex items-end gap-2">
                <span className="text-5xl font-semibold tracking-[-0.06em] text-[#7b1113]">
                  {liveVisitors}
                </span>
                <span className="pb-1 text-sm text-[#7b1113]/60">aktif</span>
              </div>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/80 border border-emerald-200/50 px-3 py-1.5 text-xs font-medium text-emerald-700 shadow-sm">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
              Bot filtresi açık
            </div>
          </div>
        </div>

        {/* Device breakdown */}
        <div className="grid grid-cols-3 gap-3">
          {devices.map((device) => {
            const Icon = device.icon;
            const ratio = liveDeviceTotal > 0 ? (device.value / liveDeviceTotal) * 100 : 0;

            return (
              <div key={device.label} className={cn("rounded-[22px] border bg-gradient-to-br p-4", device.tone)}>
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-sm">
                  <Icon className="h-5 w-5" />
                </div>
                <p className="mt-4 text-lg font-semibold tracking-[-0.03em]">
                  {device.value}
                </p>
                <p className="text-xs font-medium opacity-70">{device.label}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/10">
                  <div className={cn("h-full rounded-full", device.barColor)} style={{ width: `${ratio}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Mini stats */}
        <div className="grid grid-cols-2 gap-3">
          <MiniStat title="Sayfa görüntüleme" value={pageViewCount.toLocaleString("tr-TR")} icon={Eye} tone="amber" />
          <MiniStat title="Sepete ekleme" value={addToCartCount.toLocaleString("tr-TR")} icon={CreditCard} tone="emerald" />
        </div>

        {/* Top pages */}
        <div className="rounded-[24px] border border-[#7b1113]/10 bg-gradient-to-b from-[#faf5f0]/70 to-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-[#7b1113]">Anlık popüler sayfalar</p>
            <p className="text-xs font-medium text-[#7b1113]/50">Top 3</p>
          </div>

          {liveData && topPagesAvailable(liveData) ? (
            <div className="space-y-2">
              {liveData.topPages.slice(0, 3).map((page, index) => (
                <div
                  key={page.url}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-3 shadow-sm border border-[#7b1113]/8"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#faf0f0] to-white text-[#7b1113] text-xs font-semibold">
                      {index + 1}
                    </div>
                    <span className="truncate text-sm font-medium text-gray-700">
                      {formatTopPageLabel(page.url)}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-[#7b1113]">{page.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[#7b1113]/20 bg-white/70 px-4 py-5 text-sm text-gray-500 text-center">
              Detaylı sayfa dağılımı şu an kullanılabilir değil.
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function CartRecoveryCard({
  loading,
  abandonedCartStats,
  recoveredRevenue,
  addToCartCount,
  purchaseCount,
}: {
  loading: boolean;
  abandonedCartStats: {
    totalValue: number;
    recoveryRate: number;
    recoveredCount: number;
    totalCount: number;
  };
  recoveredRevenue: number;
  addToCartCount: number;
  purchaseCount: number;
}) {
  const conversionRate =
    addToCartCount > 0 ? Math.round((purchaseCount / addToCartCount) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.48, delay: 0.3, ease: ANIMATION_EASE }}
      className="overflow-hidden rounded-[30px] border border-[#7b1113]/10 bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] shadow-[0_24px_80px_rgba(123,17,19,0.1)]"
    >
      <div className="border-b border-[#7b1113]/8 px-6 py-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#7b1113]">
          Sepet performansı
        </p>
        <h3 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-gray-950">
          Kurtarma potansiyeli
        </h3>
      </div>

      <div className="space-y-5 p-6">
        <div className="grid grid-cols-2 gap-3">
          <CartValueCard
            title="Kayıp ciro"
            value={loading ? "..." : formatCurrency(abandonedCartStats.totalValue)}
            tone="rose"
          />
          <CartValueCard
            title="Kurtarılan"
            value={loading ? "..." : formatCurrency(recoveredRevenue)}
            tone="emerald"
          />
        </div>

        <div className="rounded-[24px] border border-[#7b1113]/10 bg-gradient-to-b from-[#faf5f0]/70 to-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-[#7b1113]/70">Kurtarma oranı</p>
              <p className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-[#7b1113]">
                %{abandonedCartStats.recoveryRate.toFixed(1)}
              </p>
            </div>
            <div className="rounded-full bg-white border border-[#7b1113]/10 px-3 py-1.5 text-xs font-semibold text-[#7b1113] shadow-sm">
              {abandonedCartStats.recoveredCount}/{abandonedCartStats.totalCount} sepet
            </div>
          </div>

          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[#7b1113]/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#7b1113] to-[#c44536]"
              style={{ width: `${Math.min(abandonedCartStats.recoveryRate, 100)}%` }}
            />
          </div>
        </div>

        <div className="rounded-[24px] border border-[#7b1113]/10 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-[#7b1113]">24 saat aksiyon akışı</p>
            <span
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold",
                conversionRate >= 30
                  ? "bg-gradient-to-r from-emerald-100 to-teal-50 text-emerald-700 border border-emerald-200/50"
                  : conversionRate >= 15
                    ? "bg-gradient-to-r from-amber-100 to-orange-50 text-amber-700 border border-amber-200/50"
                    : "bg-gradient-to-r from-rose-100 to-pink-50 text-rose-700 border border-rose-200/50"
              )}
            >
              %{conversionRate} dönüşüm
            </span>
          </div>

          <div className="space-y-4">
            <ProgressRow label="Sepete ekleme" value={addToCartCount} width={100} tone="amber" />
            <ProgressRow
              label="Satın alma"
              value={purchaseCount}
              width={Math.max(6, conversionRate)}
              tone="emerald"
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function CartValueCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: string;
  tone: "rose" | "emerald";
}) {
  const toneStyles = {
    rose: "from-rose-50 via-pink-50/70 to-white border-rose-200/50",
    emerald: "from-emerald-50 via-teal-50/70 to-white border-emerald-200/50",
  };

  const valueColors = {
    rose: "text-rose-600",
    emerald: "text-emerald-600",
  };

  return (
    <div
      className={cn(
        "rounded-[24px] border bg-gradient-to-br p-4",
        toneStyles[tone]
      )}
    >
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className={cn("mt-3 text-2xl font-semibold tracking-[-0.04em]", valueColors[tone])}>{value}</p>
    </div>
  );
}

function ProgressRow({
  label,
  value,
  width,
  tone,
}: {
  label: string;
  value: number;
  width: number;
  tone: "amber" | "emerald";
}) {
  const barStyles = {
    amber: "bg-gradient-to-r from-amber-400 to-orange-500",
    emerald: "bg-gradient-to-r from-emerald-400 to-teal-500",
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium text-gray-600">{label}</span>
        <span className="font-semibold text-[#7b1113]">{value.toLocaleString("tr-TR")}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-gray-200">
        <div
          className={cn("h-full rounded-full", barStyles[tone])}
          style={{ width: `${Math.min(width, 100)}%` }}
        />
      </div>
    </div>
  );
}

function MiniStat({
  title,
  value,
  icon: Icon,
  tone = "slate",
}: {
  title: string;
  value: string;
  icon: ElementType;
  tone?: "slate" | "amber" | "emerald" | "burgundy";
}) {
  const toneStyles = {
    slate: "from-gray-50 to-white border-gray-200",
    amber: "from-amber-50 to-orange-50/70 border-amber-200/50",
    emerald: "from-emerald-50 to-teal-50/70 border-emerald-200/50",
    burgundy: "from-[#faf0f0] to-[#fdf5f3] border-[#7b1113]/15",
  };

  const iconColors = {
    slate: "text-gray-600",
    amber: "text-amber-600",
    emerald: "text-emerald-600",
    burgundy: "text-[#7b1113]",
  };

  return (
    <div className={cn("rounded-[22px] border bg-gradient-to-br p-4", toneStyles[tone])}>
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-sm">
        <Icon className={cn("h-5 w-5", iconColors[tone])} />
      </div>
      <p className="mt-4 text-sm font-medium text-gray-600">{title}</p>
      <p className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-gray-950">{value}</p>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="flex h-full animate-pulse flex-col justify-between rounded-[22px] bg-gradient-to-b from-[#faf0f0]/70 to-white p-4 md:p-6">
      <div className="grid grid-cols-3 gap-3">
        <div className="h-4 rounded-full bg-[#7b1113]/20" />
        <div className="h-4 rounded-full bg-[#7b1113]/10" />
        <div className="h-4 rounded-full bg-[#7b1113]/10" />
      </div>
      <div className="mt-6 flex h-full items-end gap-3">
        {Array.from({ length: 9 }).map((_, index) => (
          <div
            key={index}
            className="flex-1 rounded-t-[18px] bg-gradient-to-t from-[#7b1113]/30 to-[#7b1113]/10"
            style={{ height: `${35 + ((index * 9) % 45)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function topPagesAvailable(liveData: LiveAnalyticsData | null) {
  return Boolean(liveData?.topPages && liveData.topPages.length > 0);
}
