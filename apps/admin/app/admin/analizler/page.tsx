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
  { label: "Bugun", value: "today" },
  { label: "Bu Hafta", value: "week" },
  { label: "Bu Ay", value: "month" },
  { label: "Yil", value: "year" },
];

const ANIMATION_EASE = [0.22, 1, 0.36, 1] as const;

function formatCurrency(value: number) {
  return `₺${value.toLocaleString("tr-TR")}`;
}

function formatLastUpdated(date: Date | null) {
  if (!date) return "Veri aliniyor";
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
        throw new Error(jsonData?.error || "Veri yuklenemedi");
      }
      setData(jsonData as DashboardData);
      setLastUpdatedAt(new Date());
    } catch (err) {
      console.error("Analytics fetch error:", err);
      setError("Veriler yuklenirken bir hata olustu");
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(123,17,19,0.08),_transparent_28%),linear-gradient(180deg,#fbfbfa_0%,#f4f2ef_100%)]">
      <div className="mx-auto max-w-[1600px] px-4 py-6 md:px-6 md:py-8 lg:px-8">
        <div className="space-y-8">
          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: ANIMATION_EASE }}
            className="overflow-hidden rounded-[30px] border border-black/5 bg-white/85 shadow-[0_24px_80px_rgba(17,24,39,0.08)] backdrop-blur"
          >
            <div className="border-b border-black/5 px-6 py-5 md:px-8 md:py-6">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                <div className="space-y-4">
                  <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
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
                          Magazanizin gelir, donusum ve canli trafik sinyallerini sade ama premium
                          bir yuzeyde izleyin.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-gray-500">
                      <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5 text-gray-700">
                        <CalendarRange className="h-3.5 w-3.5" />
                        Son guncelleme {formatLastUpdated(lastUpdatedAt)}
                      </div>
                      <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700">
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                        </span>
                        Canli akis {formatLastUpdated(lastLiveUpdatedAt)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3 xl:items-end">
                  <div className="flex flex-wrap items-center gap-2 rounded-[22px] border border-black/5 bg-[#f6f4f1] p-1.5 shadow-inner">
                    {PERIODS.map((period) => {
                      const active = selectedPeriod === period.value;
                      return (
                        <button
                          key={period.value}
                          onClick={() => setSelectedPeriod(period.value)}
                          className={cn(
                            "rounded-2xl px-4 py-2 text-sm font-medium transition-all duration-200",
                            active
                              ? "bg-gray-950 text-white shadow-[0_10px_30px_rgba(17,24,39,0.18)]"
                              : "text-gray-600 hover:bg-white hover:text-gray-900"
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
                      className="inline-flex items-center gap-2 rounded-2xl border border-black/10 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-all hover:border-black/15 hover:bg-gray-50 hover:text-gray-950 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Download className="h-4 w-4" />
                      CSV indir
                    </button>
                    <button
                      onClick={() => handleExport("json")}
                      disabled={loading || !data}
                      className="inline-flex items-center gap-2 rounded-2xl bg-gray-950 px-4 py-2.5 text-sm font-medium text-white shadow-[0_16px_30px_rgba(17,24,39,0.18)] transition-all hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Download className="h-4 w-4" />
                      JSON indir
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-px bg-black/5 md:grid-cols-3 xl:grid-cols-4">
              <HeaderMetric
                label="Canli ziyaretci"
                value={liveVisitors.toLocaleString("tr-TR")}
                hint="Anlık trafik"
              />
              <HeaderMetric
                label="Ort. siparis"
                value={formatCurrency(stats.avgOrderValue || 0)}
                hint="Secili donem"
              />
              <HeaderMetric
                label="Sayfa goruntuleme"
                value={pageViewCount.toLocaleString("tr-TR")}
                hint="Canli populer sayfalar"
              />
              <HeaderMetric
                label="Sepet aksiyonu"
                value={addToCartCount.toLocaleString("tr-TR")}
                hint="Son 24 saat"
                className="md:col-span-3 xl:col-span-1"
              />
            </div>
          </motion.section>

          {error ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: ANIMATION_EASE }}
              className="rounded-[24px] border border-rose-200 bg-rose-50/90 px-5 py-4 text-sm font-medium text-rose-700 shadow-sm"
            >
              {error}
            </motion.div>
          ) : null}

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
              accent="slate"
            />
            <KpiCard
              index={2}
              title="Toplam Müşteri"
              value={(stats.customers || 0).toLocaleString("tr-TR")}
              change={stats.customersChange}
              icon={Users}
              loading={loading}
              accent="sand"
            />
            <KpiCard
              index={3}
              title="Dönüşüm Oranı"
              value={`%${stats.conversionRate || 0}`}
              change={stats.conversionChange}
              icon={TrendingUp}
              loading={loading}
              accent="emerald"
            />
          </section>

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
}: {
  label: string;
  value: string;
  hint: string;
  className?: string;
}) {
  return (
    <div className={cn("bg-white/70 px-6 py-5 md:px-8", className)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-gray-950">{value}</p>
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
  accent: "burgundy" | "slate" | "sand" | "emerald";
  index: number;
}) {
  const isPositive = change >= 0;

  const accentStyles = {
    burgundy: "from-[#7b1113]/14 via-[#7b1113]/6 to-transparent text-[#7b1113]",
    slate: "from-gray-900/12 via-gray-900/5 to-transparent text-gray-800",
    sand: "from-amber-200/30 via-stone-200/30 to-transparent text-stone-700",
    emerald: "from-emerald-500/14 via-emerald-500/5 to-transparent text-emerald-700",
  }[accent];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, delay: index * 0.06, ease: ANIMATION_EASE }}
      className="group relative overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-[0_18px_55px_rgba(17,24,39,0.06)]"
    >
      <div className={cn("absolute inset-x-0 top-0 h-24 bg-gradient-to-br", accentStyles)} />
      <div className="relative p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-black/5 bg-white/80 text-gray-700 shadow-sm transition-transform duration-300 group-hover:scale-[1.04]">
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">{title}</p>
              <h3 className="mt-2 text-[30px] font-semibold tracking-[-0.05em] text-gray-950">
                {loading ? <span className="text-gray-300">...</span> : value}
              </h3>
            </div>
          </div>

          {!loading ? (
            <div
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold",
                isPositive ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
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
      className="overflow-hidden rounded-[30px] border border-black/5 bg-white shadow-[0_24px_80px_rgba(17,24,39,0.06)]"
    >
      <div className="border-b border-black/5 px-6 py-6 md:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex w-fit items-center gap-2 rounded-full bg-gray-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-600">
              Gelir trendi
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.04em] text-gray-950 md:text-[30px]">
                Donemsel gelir akisi
              </h2>
              <p className="mt-2 text-sm leading-6 text-gray-600 md:text-[15px]">
                {selectedPeriod === "today"
                  ? "Bugun icindeki siparis ve gelir hareketlerini izleyin."
                  : "Secili zaman araliginda gelir performansinizin nasil sekillendigini gorun."}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <InsightPill label="Toplam gelir" value={formatCurrency(stats.revenue || 0)} />
            <InsightPill label="Ort. siparis" value={formatCurrency(stats.avgOrderValue || 0)} />
            <InsightPill label="Sipariş" value={(stats.orders || 0).toLocaleString("tr-TR")} />
          </div>
        </div>
      </div>

      <div className="px-4 pb-4 pt-6 md:px-6 md:pb-6">
        <div className="h-[360px] rounded-[26px] border border-black/5 bg-[linear-gradient(180deg,rgba(123,17,19,0.035),rgba(255,255,255,0))] p-4 md:p-6">
          {loading ? (
            <ChartSkeleton />
          ) : trendData.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center rounded-[22px] border border-dashed border-gray-200 bg-white/70 px-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                <TrendingUp className="h-6 w-6" />
              </div>
              <p className="mt-4 text-base font-medium text-gray-900">Veri bulunmuyor</p>
              <p className="mt-1 max-w-sm text-sm text-gray-500">
                Secili donem icin henuz gosterilecek gelir trendi olusmadi.
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ left: 8, right: 8, top: 12, bottom: 4 }}>
                <defs>
                  <linearGradient id="analyticsRevenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7B1113" stopOpacity={0.22} />
                    <stop offset="45%" stopColor="#7B1113" stopOpacity={0.08} />
                    <stop offset="100%" stopColor="#7B1113" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#ebe7e2" strokeDasharray="3 6" />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "#7a7a7a" }}
                  dy={12}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "#7a7a7a" }}
                  tickFormatter={(value) => `₺${value}`}
                  width={62}
                />
                <Tooltip
                  cursor={{ stroke: "#7B1113", strokeOpacity: 0.12, strokeWidth: 1 }}
                  contentStyle={{
                    background: "rgba(17, 24, 39, 0.96)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "18px",
                    boxShadow: "0 20px 60px rgba(17,24,39,0.25)",
                  }}
                  labelStyle={{ color: "rgba(255,255,255,0.72)", marginBottom: 8 }}
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
                  strokeWidth={2.5}
                  fill="url(#analyticsRevenueFill)"
                  dot={false}
                  activeDot={{ r: 4, fill: "#7B1113", stroke: "#fff", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function InsightPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-black/5 bg-[#f7f5f2] px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400">{label}</p>
      <p className="mt-2 text-lg font-semibold tracking-[-0.03em] text-gray-950">{value}</p>
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
      tone: "bg-[#f8efef] text-[#7b1113]",
    },
    {
      label: "Desktop",
      value: liveData?.devices.desktop || 0,
      icon: Monitor,
      tone: "bg-gray-100 text-gray-700",
    },
    {
      label: "Tablet",
      value: liveData?.devices.tablet || 0,
      icon: Tablet,
      tone: "bg-emerald-50 text-emerald-700",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.48, delay: 0.24, ease: ANIMATION_EASE }}
      className="overflow-hidden rounded-[30px] border border-black/5 bg-white shadow-[0_24px_80px_rgba(17,24,39,0.06)]"
    >
      <div className="border-b border-black/5 px-6 py-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-400">
              Canli trafik
            </p>
            <h3 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-gray-950">
              Anlık ziyaretçiler
            </h3>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
            <Wifi className="h-3.5 w-3.5" />
            {formatLastUpdated(lastLiveUpdatedAt)}
          </div>
        </div>
      </div>

      <div className="space-y-6 p-6">
        <div className="rounded-[28px] bg-[linear-gradient(135deg,rgba(123,17,19,0.08),rgba(17,24,39,0.02))] p-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-600">Online kisi</p>
              <div className="mt-2 flex items-end gap-2">
                <span className="text-5xl font-semibold tracking-[-0.06em] text-gray-950">
                  {liveVisitors}
                </span>
                <span className="pb-1 text-sm text-gray-500">aktif</span>
              </div>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/85 px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
              Bot filtresi acik
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {devices.map((device) => {
            const Icon = device.icon;
            const ratio = liveDeviceTotal > 0 ? (device.value / liveDeviceTotal) * 100 : 0;

            return (
              <div key={device.label} className="rounded-[22px] border border-black/5 bg-[#faf9f7] p-4">
                <div className={cn("flex h-10 w-10 items-center justify-center rounded-2xl", device.tone)}>
                  <Icon className="h-[18px] w-[18px]" />
                </div>
                <p className="mt-4 text-lg font-semibold tracking-[-0.03em] text-gray-950">
                  {device.value}
                </p>
                <p className="text-xs font-medium text-gray-500">{device.label}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-200">
                  <div className="h-full rounded-full bg-gray-900" style={{ width: `${ratio}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <MiniStat title="Sayfa goruntuleme" value={pageViewCount.toLocaleString("tr-TR")} icon={Eye} />
          <MiniStat title="Sepete ekleme" value={addToCartCount.toLocaleString("tr-TR")} icon={CreditCard} />
        </div>

        <div className="rounded-[24px] border border-black/5 bg-[#faf9f7] p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">Anlık popüler sayfalar</p>
            <p className="text-xs font-medium text-gray-400">Top 3</p>
          </div>

          {liveData && topPagesAvailable(liveData) ? (
            <div className="space-y-2">
              {liveData.topPages.slice(0, 3).map((page, index) => (
                <div
                  key={page.url}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-3 shadow-sm ring-1 ring-black/5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                      {index + 1}
                    </div>
                    <span className="truncate text-sm font-medium text-gray-700">
                      {formatTopPageLabel(page.url)}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-gray-950">{page.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white/70 px-4 py-5 text-sm text-gray-500">
              Detayli sayfa dagilimi su an kullanilabilir degil.
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
      className="overflow-hidden rounded-[30px] border border-black/5 bg-white shadow-[0_24px_80px_rgba(17,24,39,0.06)]"
    >
      <div className="border-b border-black/5 px-6 py-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-400">
          Sepet performansi
        </p>
        <h3 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-gray-950">
          Kurtarma potansiyeli
        </h3>
      </div>

      <div className="space-y-5 p-6">
        <div className="grid grid-cols-2 gap-3">
          <CartValueCard
            title="Kayip ciro"
            value={loading ? "..." : formatCurrency(abandonedCartStats.totalValue)}
            tone="rose"
          />
          <CartValueCard
            title="Kurtarilan"
            value={loading ? "..." : formatCurrency(recoveredRevenue)}
            tone="emerald"
          />
        </div>

        <div className="rounded-[24px] bg-[#faf9f7] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-600">Kurtarma orani</p>
              <p className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-gray-950">
                %{abandonedCartStats.recoveryRate.toFixed(1)}
              </p>
            </div>
            <div className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm ring-1 ring-black/5">
              {abandonedCartStats.recoveredCount}/{abandonedCartStats.totalCount} sepet
            </div>
          </div>

          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#7b1113_0%,#be5b50_100%)]"
              style={{ width: `${Math.min(abandonedCartStats.recoveryRate, 100)}%` }}
            />
          </div>
        </div>

        <div className="rounded-[24px] border border-black/5 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">24 saat aksiyon akisi</p>
            <span
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold",
                conversionRate >= 30
                  ? "bg-emerald-50 text-emerald-700"
                  : conversionRate >= 15
                    ? "bg-amber-50 text-amber-700"
                    : "bg-rose-50 text-rose-700"
              )}
            >
              %{conversionRate} donusum
            </span>
          </div>

          <div className="space-y-4">
            <ProgressRow label="Sepete ekleme" value={addToCartCount} width={100} tone="amber" />
            <ProgressRow
              label="Satin alma"
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
  return (
    <div
      className={cn(
        "rounded-[24px] p-4",
        tone === "rose"
          ? "bg-[linear-gradient(135deg,rgba(244,63,94,0.10),rgba(255,255,255,0.85))]"
          : "bg-[linear-gradient(135deg,rgba(16,185,129,0.10),rgba(255,255,255,0.85))]"
      )}
    >
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-gray-950">{value}</p>
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
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium text-gray-600">{label}</span>
        <span className="font-semibold text-gray-950">{value.toLocaleString("tr-TR")}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-gray-200">
        <div
          className={cn(
            "h-full rounded-full",
            tone === "amber"
              ? "bg-[linear-gradient(90deg,#f59e0b_0%,#ea580c_100%)]"
              : "bg-[linear-gradient(90deg,#10b981_0%,#0f766e_100%)]"
          )}
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
}: {
  title: string;
  value: string;
  icon: ElementType;
}) {
  return (
    <div className="rounded-[22px] border border-black/5 bg-[#faf9f7] p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-gray-700 shadow-sm ring-1 ring-black/5">
        <Icon className="h-[18px] w-[18px]" />
      </div>
      <p className="mt-4 text-sm font-medium text-gray-500">{title}</p>
      <p className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-gray-950">{value}</p>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="flex h-full animate-pulse flex-col justify-between rounded-[22px] bg-white/70 p-4 md:p-6">
      <div className="grid grid-cols-3 gap-3">
        <div className="h-4 rounded-full bg-gray-200" />
        <div className="h-4 rounded-full bg-gray-100" />
        <div className="h-4 rounded-full bg-gray-100" />
      </div>
      <div className="mt-6 flex h-full items-end gap-3">
        {Array.from({ length: 9 }).map((_, index) => (
          <div
            key={index}
            className="flex-1 rounded-t-[18px] bg-[linear-gradient(180deg,rgba(123,17,19,0.24),rgba(123,17,19,0.06))]"
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
