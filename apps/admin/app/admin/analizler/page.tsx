"use client";

import { useState, useEffect, useCallback } from "react";
import {
  DollarSign,
  ShoppingBag,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  TrendingUp,
  CreditCard,
  Eye,
  Loader2,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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

export default function AnalyticsPage() {
  const [selectedPeriod, setSelectedPeriod] = useState<TimeRange>("week");
  const [loading, setLoading] = useState(true);
  const [liveVisitors, setLiveVisitors] = useState(0);
  const [data, setData] = useState<DashboardData | null>(null);
  const [liveData, setLiveData] = useState<LiveAnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          return;
        }

        const heartbeatRes = await fetch("/api/analytics/heartbeat", { cache: "no-store" });
        const heartbeatResult = await heartbeatRes.json();
        setLiveVisitors(heartbeatResult.visitors || 0);
        setLiveData(null);
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

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Genel Bakış</h1>
          <p className="text-sm text-gray-500 mt-1">
            Mağazanızın performans metrikleri ve büyüme verileri.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-gray-200 shadow-sm">
          {[
            { label: "Bugün", value: "today" },
            { label: "Bu Hafta", value: "week" },
            { label: "Bu Ay", value: "month" },
            { label: "Yıl", value: "year" },
          ].map((period) => (
            <button
              key={period.value}
              onClick={() => setSelectedPeriod(period.value as TimeRange)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                selectedPeriod === period.value
                  ? "bg-gray-900 text-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {period.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Toplam Gelir"
          value={`₺${(stats.revenue || 0).toLocaleString("tr-TR")}`}
          change={stats.revenueChange}
          icon={DollarSign}
          loading={loading}
        />
        <KpiCard
          title="Siparişler"
          value={(stats.orders || 0).toString()}
          change={stats.ordersChange}
          icon={ShoppingBag}
          loading={loading}
        />
        <KpiCard
          title="Toplam Müşteri"
          value={(stats.customers || 0).toString()}
          change={stats.customersChange}
          icon={Users}
          loading={loading}
        />
        <KpiCard
          title="Dönüşüm Oranı"
          value={`%${stats.conversionRate || 0}`}
          change={stats.conversionChange}
          icon={TrendingUp}
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-base font-semibold text-gray-900">Gelir Analizi</h3>
              <p className="text-xs text-gray-500">Zaman içindeki brüt satış performansı</p>
            </div>
            <button
              onClick={() => handleExport("csv")}
              className="text-gray-400 hover:text-gray-900 transition-colors"
              disabled={loading}
            >
              <Download className="w-4 h-4" />
            </button>
          </div>

          <div className="h-[300px] w-full">
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
              </div>
            ) : trendData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-500">
                <p>Seçili dönemde veri bulunmuyor</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#111827" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#111827" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: "#6b7280" }}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: "#6b7280" }}
                    tickFormatter={(value) => `₺${value}`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#111827",
                      border: "none",
                      borderRadius: "8px",
                      color: "#fff",
                    }}
                    itemStyle={{ color: "#fff" }}
                    formatter={(value: any) => [`₺${Number(value).toLocaleString("tr-TR")}`, "Gelir"]}
                    labelStyle={{ display: "none" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#111827"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorRevenue)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900">Canlı Ziyaretçi</h3>
              <div className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-gray-900">{liveVisitors}</span>
              <span className="text-sm text-gray-500">kişi online</span>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="bg-gray-50 rounded-lg p-2 border border-gray-100 text-center">
                <p className="text-[11px] text-gray-500">Mobil</p>
                <p className="text-sm font-semibold text-gray-900">{liveData?.devices.mobile || 0}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2 border border-gray-100 text-center">
                <p className="text-[11px] text-gray-500">Desktop</p>
                <p className="text-sm font-semibold text-gray-900">{liveData?.devices.desktop || 0}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2 border border-gray-100 text-center">
                <p className="text-[11px] text-gray-500">Tablet</p>
                <p className="text-sm font-semibold text-gray-900">{liveData?.devices.tablet || 0}</p>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <div className="flex-1 bg-gray-50 rounded-lg p-3 border border-gray-100">
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                  <Eye className="w-3 h-3" /> Sayfa Görüntüleme
                </div>
                <div className="font-semibold text-gray-900">{pageViewCount}</div>
              </div>
              <div className="flex-1 bg-gray-50 rounded-lg p-3 border border-gray-100">
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                  <CreditCard className="w-3 h-3" /> Sepete Ekleme
                </div>
                <div className="font-semibold text-gray-900">{addToCartCount}</div>
              </div>
            </div>

            {topPages.length > 0 && (
              <div className="mt-4 border-t border-gray-100 pt-3 space-y-1">
                <p className="text-xs text-gray-500 font-medium">Anlık Popüler Sayfalar</p>
                {topPages.slice(0, 3).map((page) => (
                  <div key={page.url} className="flex items-center justify-between text-xs">
                    <span className="text-gray-700 truncate pr-2">{page.url}</span>
                    <span className="font-semibold text-gray-900">{page.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-semibold text-gray-900">Sepet Performansı</h3>
              <button className="text-xs font-medium text-blue-600 hover:text-blue-700">
                Detay
              </button>
            </div>

            <div className="space-y-4 mt-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-500">Kurtarma Oranı</span>
                  <span className="font-medium text-gray-900">
                    {abandonedCartStats.recoveryRate.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{ width: `${Math.min(abandonedCartStats.recoveryRate, 100)}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <p className="text-xs text-gray-500">Kayıp Ciro</p>
                  <p className="text-lg font-semibold text-red-600">
                    ₺{abandonedCartStats.totalValue.toLocaleString("tr-TR", { minimumFractionDigits: 0 })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">Kurtarılan</p>
                  <p className="text-lg font-semibold text-green-600">
                    ₺
                    {Math.round(
                      abandonedCartStats.totalValue * (abandonedCartStats.recoveryRate / 100)
                    ).toLocaleString("tr-TR", { minimumFractionDigits: 0 })}
                  </p>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-3 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500">Sepete Ekleme (24s)</p>
                  <p className="text-base font-semibold text-gray-900">{addToCartCount}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">Satın Alma (24s)</p>
                  <p className="text-base font-semibold text-gray-900">{purchaseCount}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  title,
  value,
  change,
  icon: Icon,
  loading,
}: {
  title: string;
  value: string;
  change: number;
  icon: React.ElementType;
  loading: boolean;
}) {
  const isPositive = change >= 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div className="p-2 bg-gray-50 rounded-lg text-gray-600">
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Icon className="w-5 h-5" />}
        </div>
        {!loading && (
          <div
            className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
              isPositive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}
          >
            {isPositive ? (
              <ArrowUpRight className="w-3 h-3" />
            ) : (
              <ArrowDownRight className="w-3 h-3" />
            )}
            <span>%{Math.abs(change)}</span>
          </div>
        )}
      </div>
      <div className="mt-4">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <h3 className="text-2xl font-bold text-gray-900 mt-1">{loading ? "..." : value}</h3>
      </div>
    </div>
  );
}
