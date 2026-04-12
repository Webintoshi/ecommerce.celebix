"use client";

import { useEffect, useMemo, useState } from "react";
import type { ElementType, ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  Clock,
  FileText,
  Package,
  Plus,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Users,
  Wifi,
} from "lucide-react";
import { motion } from "framer-motion";
import LiveVisitors from "@/components/admin/LiveVisitors";
import AbandonedCartsWidget from "@/components/admin/AbandonedCartsWidget";
import ActivityFeed from "@/components/admin/ActivityFeed";
import {
  type DashboardBootstrapData,
  type DashboardLowStockProduct,
  type DashboardRecentOrder,
  type DashboardStats,
  type LiveAnalyticsSnapshot,
} from "@/lib/admin-data-types";
import { fetchAdminJson } from "@/lib/admin-client-fetch";
import { cn } from "@/lib/utils";

interface StatConfig {
  key: keyof DashboardStats;
  title: string;
  icon: ElementType;
  format: (value: number) => string;
  trend?: { value: string; isPositive: boolean };
  href: string;
}

const ANIMATION_CONFIG = {
  stagger: 0.06,
  duration: 0.4,
  ease: [0.22, 1, 0.36, 1] as const,
};

const STAT_CONFIGS: StatConfig[] = [
  {
    key: "totalProducts",
    title: "Toplam Ürün",
    icon: Package,
    format: (v) => v.toLocaleString("tr-TR"),
    trend: { value: "+12%", isPositive: true },
    href: "/admin/urunler",
  },
  {
    key: "totalOrders",
    title: "Toplam Sipariş",
    icon: ShoppingCart,
    format: (v) => v.toLocaleString("tr-TR"),
    trend: { value: "+8%", isPositive: true },
    href: "/admin/siparisler",
  },
  {
    key: "pendingOrders",
    title: "Bekleyen Sipariş",
    icon: Clock,
    format: (v) => v.toLocaleString("tr-TR"),
    href: "/admin/siparisler",
  },
  {
    key: "totalRevenue",
    title: "Toplam Ciro",
    icon: TrendingUp,
    format: (v) => `₺${v.toLocaleString("tr-TR")}`,
    trend: { value: "+24%", isPositive: true },
    href: "/admin/analizler",
  },
  {
    key: "lowStockProducts",
    title: "Düşük Stok",
    icon: AlertTriangle,
    format: (v) => v.toLocaleString("tr-TR"),
    href: "/admin/urunler",
  },
];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Günaydın";
  if (hour < 18) return "İyi günler";
  return "İyi akşamlar";
}

function formatDateTR(): string {
  return new Date().toLocaleDateString("tr-TR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function getOrderStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pending: "border-slate-200 bg-slate-100/90 text-slate-700",
    processing: "border-orange-200 bg-orange-100/90 text-orange-700",
    shipped: "border-sky-200 bg-sky-100/90 text-sky-700",
    delivered: "border-emerald-200 bg-emerald-100/90 text-emerald-700",
    cancelled: "border-rose-200 bg-rose-100/90 text-rose-700",
  };

  return colors[status] || "border-slate-200 bg-slate-100/90 text-slate-700";
}

function getOrderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "Bekliyor",
    processing: "İşleniyor",
    shipped: "Kargoda",
    delivered: "Teslim Edildi",
    cancelled: "İptal Edildi",
  };

  return labels[status] || status;
}

function AnimatedCounter({
  value,
  formatter,
}: {
  value: number;
  formatter: (v: number) => string;
}) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const duration = 600;
    const steps = 25;
    const increment = value / steps;
    let current = 0;
    let step = 0;

    const timer = window.setInterval(() => {
      step += 1;
      current = Math.min(Math.round(increment * step), value);
      setDisplayValue(current);

      if (step >= steps) {
        window.clearInterval(timer);
      }
    }, duration / steps);

    return () => window.clearInterval(timer);
  }, [value]);

  return <span>{formatter(displayValue)}</span>;
}

function HeroMetric({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  icon: ElementType;
  tone: string;
}) {
  return (
    <div className="border border-white/70 bg-white/70 px-5 py-5 backdrop-blur-sm md:px-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
            {label}
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-gray-950 md:text-[30px]">
            {value}
          </p>
          <p className="mt-1 text-sm text-gray-600">{hint}</p>
        </div>
        <div className={cn("flex h-11 w-11 items-center justify-center rounded-2xl border shadow-sm", tone)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  config,
  value,
  index,
}: {
  config: StatConfig;
  value: number;
  index: number;
}) {
  const TrendIcon = config.trend?.isPositive ? ArrowUpRight : ArrowDownRight;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: ANIMATION_CONFIG.duration,
        delay: index * ANIMATION_CONFIG.stagger,
        ease: ANIMATION_CONFIG.ease,
      }}
    >
      <Link
        href={config.href}
        className="group block overflow-hidden rounded-[28px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfa] to-[#faf4ee] shadow-[0_18px_55px_rgba(0,0,0,0.08)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_65px_rgba(254,97,0,0.14)]"
      >
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#FE6100]/15 bg-gradient-to-br from-[#FE6100] to-[#E85A00] text-white shadow-[0_12px_24px_rgba(254,97,0,0.25)] transition-transform duration-300 group-hover:scale-[1.04]">
                <config.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">{config.title}</p>
                <p className="mt-2 text-[30px] font-semibold tracking-[-0.05em] text-gray-950">
                  <AnimatedCounter value={value} formatter={config.format} />
                </p>
              </div>
            </div>

            {config.trend ? (
              <div
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold",
                  config.trend.isPositive
                    ? "border-emerald-200 bg-gradient-to-r from-emerald-100 to-teal-50 text-emerald-700"
                    : "border-rose-200 bg-gradient-to-r from-rose-100 to-pink-50 text-rose-700"
                )}
              >
                <TrendIcon className="h-3.5 w-3.5" />
                {config.trend.value}
              </div>
            ) : (
              <div className="inline-flex items-center rounded-full border border-[#FE6100]/12 bg-[#faf3ed] px-3 py-1.5 text-xs font-semibold text-[#FE6100]">
                Canlı
              </div>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function QuickActions() {
  const actions = [
    {
      icon: FileText,
      label: "Siparişler",
      description: "Açık ve yeni siparişleri yönetin",
      href: "/admin/siparisler",
      tone: "from-[#fff4ea] to-white text-[#FE6100] border-[#FE6100]/15",
    },
    {
      icon: Package,
      label: "Ürünler",
      description: "Katalog, fiyat ve stok düzenleyin",
      href: "/admin/urunler",
      tone: "from-amber-50 to-white text-amber-700 border-amber-200/60",
    },
    {
      icon: Users,
      label: "Müşteriler",
      description: "Müşteri hareketlerini inceleyin",
      href: "/admin/musteriler",
      tone: "from-emerald-50 to-white text-emerald-700 border-emerald-200/60",
    },
    {
      icon: ShoppingCart,
      label: "Terk Edilen Sepetler",
      description: "Geri kazanım fırsatlarını takip edin",
      href: "/admin/siparisler/sepet-terk",
      tone: "from-rose-50 to-white text-rose-700 border-rose-200/60",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-4">
      {actions.map((action, index) => (
        <motion.div
          key={action.label}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.3,
            delay: 0.12 + index * 0.04,
            ease: ANIMATION_CONFIG.ease,
          }}
        >
          <Link
            href={action.href}
            className="group block overflow-hidden rounded-[28px] border border-[#FE6100]/10 bg-white/80 p-5 shadow-[0_16px_40px_rgba(0,0,0,0.06)] backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_55px_rgba(254,97,0,0.12)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-2xl border bg-gradient-to-br shadow-sm",
                    action.tone
                  )}
                >
                  <action.icon className="h-5 w-5" />
                </div>
                <p className="mt-4 text-base font-semibold tracking-[-0.02em] text-gray-950">
                  {action.label}
                </p>
                <p className="mt-1 text-sm leading-6 text-gray-600">{action.description}</p>
              </div>
              <ArrowUpRight className="h-4 w-4 text-gray-400 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[#FE6100]" />
            </div>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}

function SectionCard({
  title,
  icon: Icon,
  children,
  action,
  eyebrow,
}: {
  title: string;
  icon: ElementType;
  children: ReactNode;
  action?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="overflow-hidden rounded-[30px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] shadow-[0_24px_80px_rgba(254,97,0,0.1)]">
      <div className="border-b border-[#FE6100]/8 px-6 py-5 md:px-7">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#FE6100]/15 bg-gradient-to-br from-[#fff1e7] to-white text-[#FE6100] shadow-sm">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              {eyebrow ? (
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#FE6100]">
                  {eyebrow}
                </p>
              ) : null}
              <h3 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-gray-950">{title}</h3>
            </div>
          </div>
          {action}
        </div>
      </div>
      <div className="p-6 md:p-7">{children}</div>
    </div>
  );
}

function RecentOrdersCard({ orders }: { orders: DashboardRecentOrder[] }) {
  return (
    <SectionCard
      eyebrow="Operasyon"
      title="Son Siparişler"
      icon={ShoppingCart}
      action={
        <Link
          href="/admin/siparisler"
          className="inline-flex items-center gap-2 rounded-2xl border border-[#FE6100]/12 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-[#FE6100]/20 hover:text-[#FE6100]"
        >
          Tümünü Gör
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      }
    >
      <div className="space-y-3">
        {orders.length > 0 ? (
          orders.map((order, index) => (
            <motion.div
              key={order.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.03 }}
            >
              <Link href={`/admin/siparisler/${order.id}`}>
                <div className="group flex items-center gap-4 rounded-[24px] border border-transparent bg-white/70 p-4 transition-all duration-200 hover:border-[#FE6100]/12 hover:bg-white hover:shadow-[0_16px_30px_rgba(254,97,0,0.08)]">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border border-[#FE6100]/12 bg-gradient-to-br from-[#fff1e7] to-white text-sm font-semibold text-[#FE6100]">
                    #{order.orderNumber?.slice(-3) || "---"}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-950">
                      {order.shippingAddress?.firstName || "Müşteri"} {order.shippingAddress?.lastName || ""}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {new Date(order.createdAt).toLocaleDateString("tr-TR")}
                    </p>
                  </div>

                  <div
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-semibold",
                      getOrderStatusColor(order.status)
                    )}
                  >
                    {getOrderStatusLabel(order.status)}
                  </div>

                  <p className="text-sm font-semibold text-gray-950">
                    ₺{Number(order.total).toLocaleString("tr-TR")}
                  </p>
                </div>
              </Link>
            </motion.div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center rounded-[24px] border border-dashed border-[#FE6100]/18 bg-gradient-to-b from-[#fff7f2] to-white px-6 py-12 text-center">
            <ShoppingCart className="h-8 w-8 text-[#FE6100]/40" />
            <p className="mt-3 text-sm font-medium text-gray-600">Henüz sipariş bulunmuyor.</p>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function LowStockCard({ products }: { products: DashboardLowStockProduct[] }) {
  return (
    <SectionCard eyebrow="Stok Takibi" title="Düşük Stok Uyarıları" icon={AlertTriangle}>
      <div className="space-y-3">
        {products.length > 0 ? (
          products.slice(0, 5).map((product, index) => {
            const lowStockVariant = product.variants?.find((variant) => variant.stock < 10);
            const stockLevel = lowStockVariant?.stock || 0;

            return (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.03 }}
              >
                <Link href={`/admin/urunler/${product.id}/duzenle`}>
                  <div className="group flex items-center gap-4 rounded-[24px] border border-transparent bg-white/70 p-4 transition-all duration-200 hover:border-[#FE6100]/12 hover:bg-white hover:shadow-[0_16px_30px_rgba(254,97,0,0.08)]">
                    <div
                      className={cn(
                        "flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border text-sm font-semibold shadow-sm",
                        stockLevel <= 3
                          ? "border-rose-200 bg-rose-100 text-rose-700"
                          : stockLevel <= 6
                            ? "border-orange-200 bg-orange-100 text-orange-700"
                            : "border-amber-200 bg-amber-100 text-amber-700"
                      )}
                    >
                      {stockLevel}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-950">{product.name}</p>
                      <p className="mt-1 text-xs text-gray-500">{lowStockVariant?.name || "Varsayılan varyant"}</p>
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center rounded-[24px] border border-dashed border-emerald-200 bg-gradient-to-b from-emerald-50/70 to-white px-6 py-12 text-center">
            <Package className="h-8 w-8 text-emerald-400" />
            <p className="mt-3 text-sm font-medium text-gray-600">Tüm ürünler yeterli stok seviyesinde.</p>
          </div>
        )}
      </div>

      {products.length > 0 ? (
        <div className="mt-5 border-t border-[#FE6100]/8 pt-5">
          <Link
            href="/admin/urunler"
            className="inline-flex w-full items-center justify-center gap-2 rounded-[22px] bg-gradient-to-r from-[#FE6100] to-[#E85A00] px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_30px_rgba(254,97,0,0.22)] transition-all hover:from-[#E85A00] hover:to-[#D94F00]"
          >
            Tüm Ürünleri Gör
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      ) : null}
    </SectionCard>
  );
}

export default function AdminDashboardClient({
  initialData,
  initialError = "",
}: {
  initialData: DashboardBootstrapData;
  initialError?: string;
}) {
  const [stats, setStats] = useState<DashboardStats>(initialData.stats);
  const [recentOrders, setRecentOrders] = useState<DashboardRecentOrder[]>(initialData.recentOrders);
  const [lowStockProducts, setLowStockProducts] = useState<DashboardLowStockProduct[]>(
    initialData.lowStockProducts
  );
  const [liveData, setLiveData] = useState<LiveAnalyticsSnapshot>(initialData.liveData);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState(initialError);

  const applyBootstrapData = (data: DashboardBootstrapData) => {
    setStats(data.stats);
    setRecentOrders(data.recentOrders);
    setLowStockProducts(data.lowStockProducts);
    setLiveData(data.liveData);
  };

  const refreshDashboard = async () => {
    try {
      setIsRefreshing(true);
      setErrorMessage("");

      const response = await fetchAdminJson<{
        success: boolean;
        data: DashboardBootstrapData;
      }>("/api/admin/dashboard-bootstrap", { timeoutMs: 12000 });

      if (response.success && response.data) {
        applyBootstrapData(response.data);
      } else {
        setErrorMessage("Panel verileri şu anda yenilenemedi.");
      }
    } catch (error) {
      console.error("Failed to refresh dashboard:", error);
      setErrorMessage("Panel verileri şu anda geç geliyor. Lütfen tekrar deneyin.");
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const refreshLiveData = async () => {
      try {
        const response = await fetchAdminJson<{
          success: boolean;
          data: LiveAnalyticsSnapshot;
        }>("/api/analytics/live", { timeoutMs: 8000 });

        if (isMounted && response.success && response.data) {
          setLiveData(response.data);
        }
      } catch (error) {
        console.error("Failed to refresh live analytics:", error);
      }
    };

    const interval = window.setInterval(() => {
      void refreshLiveData();
    }, 20000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, []);

  const greeting = useMemo(() => getGreeting(), []);
  const currentDate = useMemo(() => formatDateTR(), []);
  const liveDeviceTotal = liveData.devices.mobile + liveData.devices.desktop + liveData.devices.tablet;
  const topPageCount = liveData.topPages[0]?.count || 0;
  const totalAbandonedValue = Number(liveData.abandonedCarts.total || 0);

  return (
    <motion.main
      role="main"
      aria-busy={isRefreshing}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative min-h-screen overflow-hidden bg-[#f7f0e8]"
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 right-[-120px] h-[420px] w-[420px] rounded-full bg-gradient-to-br from-[#FE6100]/16 via-[#FFB067]/10 to-transparent blur-3xl" />
        <div className="absolute left-[-100px] top-[28%] h-[320px] w-[320px] rounded-full bg-gradient-to-tr from-amber-200/30 via-orange-100/14 to-transparent blur-3xl" />
        <div className="absolute bottom-[-140px] right-[20%] h-[340px] w-[340px] rounded-full bg-gradient-to-tl from-rose-100/20 via-[#FE6100]/8 to-transparent blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-[1600px] px-4 py-6 md:px-6 md:py-8 lg:px-8">
        <div className="space-y-8">
          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: ANIMATION_CONFIG.ease }}
            className="overflow-hidden rounded-[30px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] shadow-[0_24px_80px_rgba(254,97,0,0.12)]"
          >
            <div className="border-b border-[#FE6100]/8 px-6 py-6 md:px-8 md:py-7">
              <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
                <div className="max-w-3xl space-y-4">
                  <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#FE6100]/20 bg-gradient-to-r from-[#FE6100]/10 to-[#FF8B3D]/5 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#FE6100]">
                    <Sparkles className="h-3.5 w-3.5" />
                    Yönetim Merkezi
                  </div>

                  <div>
                    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                      <div>
                        <h1 className="text-3xl font-semibold tracking-[-0.04em] text-gray-950 md:text-[40px]">
                          {greeting}, yönetim ekibi
                        </h1>
                        <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600 md:text-[15px]">
                          Sipariş, stok ve canlı mağaza hareketlerini tek görünümde izleyin; kritik
                          aksiyonları daha hızlı alın ve operasyon ritmini gün boyu koruyun.
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-medium">
                      <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/50 bg-gradient-to-r from-amber-50 to-orange-50 px-3 py-1.5 text-amber-800">
                        <Calendar className="h-3.5 w-3.5" />
                        {currentDate}
                      </div>
                      <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/50 bg-gradient-to-r from-emerald-50 to-teal-50 px-3 py-1.5 text-emerald-700">
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                        </span>
                        Canlı izleme aktif
                      </div>
                      <div className="inline-flex items-center gap-2 rounded-full border border-[#FE6100]/15 bg-gradient-to-r from-[#fff4ea] to-white px-3 py-1.5 text-[#FE6100]">
                        <Wifi className="h-3.5 w-3.5" />
                        {liveData.liveVisitors.toLocaleString("tr-TR")} aktif ziyaretçi
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 xl:justify-end">
                  <button
                    type="button"
                    onClick={() => void refreshDashboard()}
                    className="inline-flex items-center gap-2 rounded-2xl border border-[#FE6100]/15 bg-white px-4 py-2.5 text-sm font-medium text-[#FE6100] shadow-sm transition-all hover:border-[#FE6100]/25 hover:bg-[#faf5f0]"
                  >
                    <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
                    Verileri Yenile
                  </button>

                  <Link
                    href="/admin/urunler/yeni"
                    className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#FE6100] to-[#E85A00] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_16px_30px_rgba(254,97,0,0.25)] transition-all hover:from-[#E85A00] hover:to-[#D94F00]"
                  >
                    <Plus className="h-4 w-4" />
                    Yeni Ürün Ekle
                  </Link>
                </div>
              </div>

              <div className="mt-6">
                <QuickActions />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-px bg-gradient-to-r from-[#FE6100]/10 via-[#FF8B3D]/5 to-[#FE6100]/10 md:grid-cols-2 2xl:grid-cols-4">
              <HeroMetric
                label="Canlı Ziyaretçi"
                value={liveData.liveVisitors.toLocaleString("tr-TR")}
                hint="Anlık mağaza trafiği"
                icon={Wifi}
                tone="border-emerald-200/60 bg-gradient-to-br from-emerald-50 to-white text-emerald-700"
              />
              <HeroMetric
                label="Sepete Ekleme"
                value={liveData.today.addToCart.toLocaleString("tr-TR")}
                hint="Bugün gerçekleşen aksiyon"
                icon={ShoppingCart}
                tone="border-amber-200/60 bg-gradient-to-br from-amber-50 to-white text-amber-700"
              />
              <HeroMetric
                label="Terk Edilen Sepet"
                value={liveData.abandonedCarts.count.toLocaleString("tr-TR")}
                hint={`Toplam potansiyel ${`₺${totalAbandonedValue.toLocaleString("tr-TR")}`}`}
                icon={AlertTriangle}
                tone="border-rose-200/60 bg-gradient-to-br from-rose-50 to-white text-rose-700"
              />
              <HeroMetric
                label="İzlenen Sayfa"
                value={topPageCount.toLocaleString("tr-TR")}
                hint="Öne çıkan sayfa görüntülemesi"
                icon={Activity}
                tone="border-[#FE6100]/15 bg-gradient-to-br from-[#fff4ea] to-white text-[#FE6100]"
              />
            </div>
          </motion.section>

          {errorMessage ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: ANIMATION_CONFIG.ease }}
              aria-live="assertive"
              className="rounded-[24px] border border-rose-200 bg-gradient-to-r from-rose-50 to-red-50 px-5 py-4 text-sm font-medium text-rose-700 shadow-sm"
            >
              {errorMessage}
            </motion.div>
          ) : null}

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            {STAT_CONFIGS.map((config, index) => (
              <StatCard key={config.key} config={config} value={stats[config.key]} index={index} />
            ))}
          </section>

          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.35, ease: ANIMATION_CONFIG.ease }}
            className="grid grid-cols-1 gap-6 xl:grid-cols-2 2xl:grid-cols-3"
          >
            <LiveVisitors data={liveData} />
            <AbandonedCartsWidget data={liveData} />
            <ActivityFeed data={liveData} />
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.45, ease: ANIMATION_CONFIG.ease }}
            className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]"
          >
            <div className="space-y-6">
              <RecentOrdersCard orders={recentOrders} />
            </div>

            <div className="space-y-6">
              <LowStockCard products={lowStockProducts} />

              <SectionCard eyebrow="Canlı Özet" title="Mağaza Nabzı" icon={TrendingUp}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-[24px] border border-[#FE6100]/10 bg-gradient-to-br from-[#fff3e9] to-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#FE6100]">
                      Cihaz Dağılımı
                    </p>
                    <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-gray-950">
                      {liveDeviceTotal.toLocaleString("tr-TR")}
                    </p>
                    <p className="mt-1 text-sm text-gray-600">Toplam izlenen aktif cihaz</p>
                  </div>

                  <div className="rounded-[24px] border border-emerald-200/60 bg-gradient-to-br from-emerald-50 to-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                      Satın Alma
                    </p>
                    <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-gray-950">
                      {liveData.today.purchases.toLocaleString("tr-TR")}
                    </p>
                    <p className="mt-1 text-sm text-gray-600">Bugünkü tamamlanan işlem</p>
                  </div>

                  <div className="rounded-[24px] border border-amber-200/60 bg-gradient-to-br from-amber-50 to-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                      Mobil Trafik
                    </p>
                    <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-gray-950">
                      {liveData.devices.mobile.toLocaleString("tr-TR")}
                    </p>
                    <p className="mt-1 text-sm text-gray-600">Mobil cihazdan gelen ziyaretçi</p>
                  </div>

                  <div className="rounded-[24px] border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">
                      Masaüstü Trafik
                    </p>
                    <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-gray-950">
                      {liveData.devices.desktop.toLocaleString("tr-TR")}
                    </p>
                    <p className="mt-1 text-sm text-gray-600">Masaüstünden gelen ziyaretçi</p>
                  </div>
                </div>
              </SectionCard>
            </div>
          </motion.section>
        </div>
      </div>
    </motion.main>
  );
}
