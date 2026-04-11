"use client";

import { useEffect, useMemo, useState } from "react";
import type { ElementType, ReactNode } from "react";
import Link from "next/link";
import {
  Package,
  ShoppingCart,
  TrendingUp,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  AlertTriangle,
  Sparkles,
  Calendar,
  Plus,
  FileText,
  RefreshCw,
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
  accent: "accent" | "neutral" | "warning" | "success" | "danger";
}

const ANIMATION_CONFIG = {
  stagger: 0.08,
  duration: 0.5,
  ease: [0.34, 1.56, 0.64, 1] as const,
};

const SURFACE_CLASS =
  "rounded-[26px] border border-[#2B2B2B]/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(255,255,255,0.82))] shadow-[0_18px_50px_rgba(43,43,43,0.06)] backdrop-blur";

const STAT_CONFIGS: StatConfig[] = [
  {
    key: "totalProducts",
    title: "Toplam Ürün",
    icon: Package,
    format: (v) => v.toLocaleString("tr-TR"),
    trend: { value: "+12%", isPositive: true },
    href: "/admin/urunler",
    accent: "neutral",
  },
  {
    key: "totalOrders",
    title: "Toplam Sipariş",
    icon: ShoppingCart,
    format: (v) => v.toLocaleString("tr-TR"),
    trend: { value: "+8%", isPositive: true },
    href: "/admin/siparisler",
    accent: "accent",
  },
  {
    key: "pendingOrders",
    title: "Bekleyen",
    icon: Clock,
    format: (v) => v.toLocaleString("tr-TR"),
    href: "/admin/siparisler",
    accent: "warning",
  },
  {
    key: "totalRevenue",
    title: "Toplam Satış",
    icon: TrendingUp,
    format: (v) => `₺${v.toLocaleString("tr-TR")}`,
    trend: { value: "+24%", isPositive: true },
    href: "/admin/analizler",
    accent: "success",
  },
  {
    key: "lowStockProducts",
    title: "Düşük Stok",
    icon: AlertTriangle,
    format: (v) => v.toLocaleString("tr-TR"),
    href: "/admin/urunler",
    accent: "danger",
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
    pending: "border-amber-200 bg-amber-50 text-amber-700",
    processing: "border-[#FE6100]/20 bg-[#FE6100]/10 text-[#C74C00]",
    shipped: "border-[#2B2B2B]/12 bg-[#2B2B2B]/6 text-[#2B2B2B]",
    delivered: "border-emerald-200 bg-emerald-50 text-emerald-700",
    cancelled: "border-rose-200 bg-rose-50 text-rose-700",
  };
  return colors[status] || "border-[#2B2B2B]/10 bg-[#2B2B2B]/5 text-[#2B2B2B]/70";
}

function getOrderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "Bekliyor",
    processing: "İşleniyor",
    shipped: "Kargoda",
    delivered: "Teslim Edildi",
    cancelled: "İptal",
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
    const duration = 800;
    const steps = 30;
    const increment = value / steps;
    let current = 0;
    let step = 0;

    const timer = window.setInterval(() => {
      step++;
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

function AccentIcon({ icon: Icon, accent }: { icon: ElementType; accent: StatConfig["accent"] }) {
  const accents = {
    accent: "bg-[#FE6100] text-white shadow-[0_12px_24px_rgba(254,97,0,0.24)]",
    neutral: "bg-[#2B2B2B] text-white shadow-[0_12px_24px_rgba(43,43,43,0.16)]",
    warning: "bg-amber-500 text-white shadow-[0_12px_24px_rgba(245,158,11,0.18)]",
    success: "bg-emerald-500 text-white shadow-[0_12px_24px_rgba(16,185,129,0.18)]",
    danger: "bg-rose-500 text-white shadow-[0_12px_24px_rgba(244,63,94,0.18)]",
  };

  return (
    <div className={cn("flex h-12 w-12 items-center justify-center rounded-2xl", accents[accent])}>
      <Icon className="h-5 w-5" />
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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: ANIMATION_CONFIG.duration,
        delay: index * ANIMATION_CONFIG.stagger,
        ease: ANIMATION_CONFIG.ease,
      }}
    >
      <Link href={config.href}>
        <div
          className={cn(
            SURFACE_CLASS,
            "group relative overflow-hidden p-6 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_54px_rgba(43,43,43,0.08)]"
          )}
        >
          <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(254,97,0,0.00),rgba(254,97,0,0.34),rgba(254,97,0,0.00))]" />
          <div className="flex items-start justify-between gap-4">
            <AccentIcon icon={config.icon} accent={config.accent} />

            {config.trend ? (
              <div
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
                  config.trend.isPositive
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-rose-200 bg-rose-50 text-rose-700"
                )}
              >
                <TrendIcon className="h-3 w-3" />
                {config.trend.value}
              </div>
            ) : null}
          </div>

          <div className="mt-5 space-y-1">
            <p className="text-sm font-medium text-[#2B2B2B]/56">{config.title}</p>
            <p className="text-[34px] font-semibold tracking-[-0.05em] text-[#2B2B2B]">
              <AnimatedCounter value={value} formatter={config.format} />
            </p>
          </div>

          <div className="mt-5 flex items-center justify-between text-xs text-[#2B2B2B]/42">
            <span>Detaya git</span>
            <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function DashboardHeader({
  onRefresh,
  isRefreshing,
}: {
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  const greeting = useMemo(() => getGreeting(), []);
  const date = useMemo(() => formatDateTR(), []);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: ANIMATION_CONFIG.ease }}
      className={cn(SURFACE_CLASS, "overflow-hidden p-6 md:p-8")}
    >
      <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top_left,rgba(254,97,0,0.11),transparent_56%)]" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#FE6100]/15 bg-[#FE6100]/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#FE6100]">
            <Sparkles className="h-3.5 w-3.5" />
            Yönetim görünümü
          </div>

          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-[-0.05em] text-[#2B2B2B] md:text-[40px]">
                {greeting}
              </h1>
              <Sparkles className="h-5 w-5 text-[#FE6100]" />
            </div>
            <p className="mt-2 flex items-center gap-2 text-sm text-[#2B2B2B]/58 md:text-[15px]">
              <Calendar className="h-4 w-4 text-[#FE6100]" />
              {date}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onRefresh}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#2B2B2B]/10 bg-white/80 text-[#2B2B2B]/72 transition-all duration-200 hover:border-[#FE6100]/20 hover:text-[#FE6100] active:scale-95"
          >
            <RefreshCw className={cn("h-5 w-5", isRefreshing && "animate-spin")} />
          </button>

          <Link
            href="/admin/urunler/yeni"
            className="inline-flex items-center gap-2 rounded-2xl bg-[#2B2B2B] px-5 py-3 text-sm font-medium text-white shadow-[0_14px_28px_rgba(43,43,43,0.16)] transition-all duration-200 hover:bg-[#1f1f1f] active:scale-95"
          >
            <Plus className="h-4 w-4 text-[#FE6100]" />
            Yeni Ürün
          </Link>
        </div>
      </div>
    </motion.div>
  );
}

function QuickActions() {
  const actions = [
    { icon: FileText, label: "Siparişler", href: "/admin/siparisler" },
    { icon: Package, label: "Ürünler", href: "/admin/urunler" },
    { icon: Users, label: "Müşteriler", href: "/admin/musteriler" },
    { icon: ShoppingCart, label: "Sepetler", href: "/admin/siparisler/sepet-terk" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {actions.map((action, index) => (
        <motion.div
          key={action.label}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            duration: 0.4,
            delay: 0.24 + index * 0.05,
            ease: ANIMATION_CONFIG.ease,
          }}
        >
          <Link
            href={action.href}
            className={cn(
              SURFACE_CLASS,
              "group flex items-center gap-3 p-4 transition-all duration-200 hover:border-[#FE6100]/18 hover:bg-white/95"
            )}
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#2B2B2B] text-white transition-colors duration-200 group-hover:bg-[#FE6100]">
              <action.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#2B2B2B]">{action.label}</p>
              <p className="text-xs text-[#2B2B2B]/46">Hızlı erişim</p>
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
  className,
  action,
}: {
  title: string;
  icon: ElementType;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <div className={cn(SURFACE_CLASS, "overflow-hidden", className)}>
      <div className="flex items-center justify-between border-b border-[#2B2B2B]/7 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#FE6100]/10 text-[#FE6100]">
            <Icon className="h-[18px] w-[18px]" />
          </div>
          <h3 className="font-semibold text-[#2B2B2B]">{title}</h3>
        </div>
        {action}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function RecentOrdersCard({ orders }: { orders: DashboardRecentOrder[] }) {
  return (
    <SectionCard
      title="Son Siparişler"
      icon={ShoppingCart}
      action={
        <Link
          href="/admin/siparisler"
          className="text-sm font-medium text-[#2B2B2B]/52 transition-colors hover:text-[#FE6100]"
        >
          Tümünü gör
        </Link>
      }
    >
      <div className="space-y-3">
        {orders.length > 0 ? (
          orders.map((order, index) => (
            <motion.div
              key={order.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: index * 0.05 }}
            >
              <Link href={`/admin/siparisler/${order.id}`}>
                <div className="group flex items-center gap-4 rounded-[20px] border border-transparent bg-white/62 px-4 py-3 transition-all duration-200 hover:border-[#FE6100]/14 hover:bg-white/92">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-[#F2F1F8] text-sm font-semibold text-[#2B2B2B] ring-1 ring-[#2B2B2B]/6">
                    #{order.orderNumber?.slice(-3) || "---"}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-[#2B2B2B]">
                      {order.shippingAddress?.firstName || "Müşteri"}{" "}
                      {order.shippingAddress?.lastName || ""}
                    </p>
                    <p className="text-sm text-[#2B2B2B]/52">
                      {new Date(order.createdAt).toLocaleDateString("tr-TR")}
                    </p>
                  </div>

                  <div
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium",
                      getOrderStatusColor(order.status)
                    )}
                  >
                    {getOrderStatusLabel(order.status)}
                  </div>

                  <div className="text-right">
                    <p className="font-semibold text-[#2B2B2B]">
                      ₺{Number(order.total).toLocaleString("tr-TR")}
                    </p>
                  </div>

                  <ArrowUpRight className="h-[18px] w-[18px] flex-shrink-0 text-[#2B2B2B]/28 transition-colors group-hover:text-[#FE6100]" />
                </div>
              </Link>
            </motion.div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#F2F1F8] text-[#2B2B2B]/42">
              <ShoppingCart className="h-8 w-8" />
            </div>
            <p className="text-[#2B2B2B]/56">Henüz sipariş yok</p>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function LowStockCard({ products }: { products: DashboardLowStockProduct[] }) {
  return (
    <SectionCard title="Düşük Stok Uyarısı" icon={AlertTriangle}>
      <div className="space-y-3">
        {products.length > 0 ? (
          products.slice(0, 5).map((product, index) => {
            const lowStockVariant = product.variants?.find((variant) => variant.stock < 10);
            const stockLevel = lowStockVariant?.stock || 0;

            return (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
              >
                <Link href={`/admin/urunler/${product.id}/duzenle`}>
                  <div className="group flex items-center gap-4 rounded-[20px] border border-transparent bg-white/62 px-4 py-3 transition-all duration-200 hover:border-[#FE6100]/14 hover:bg-white/92">
                    <div
                      className={cn(
                        "flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl text-sm font-semibold",
                        stockLevel <= 3
                          ? "bg-rose-50 text-rose-700"
                          : stockLevel <= 6
                            ? "bg-amber-50 text-amber-700"
                            : "bg-[#FE6100]/10 text-[#C74C00]"
                      )}
                    >
                      {stockLevel}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-[#2B2B2B]">{product.name}</p>
                      <p className="text-sm text-[#2B2B2B]/52">{lowStockVariant?.name || "Varsayılan"}</p>
                    </div>

                    <div
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-medium",
                        stockLevel <= 3
                          ? "bg-rose-50 text-rose-700"
                          : stockLevel <= 6
                            ? "bg-amber-50 text-amber-700"
                            : "bg-[#FE6100]/10 text-[#C74C00]"
                      )}
                    >
                      {stockLevel <= 3 ? "Kritik" : stockLevel <= 6 ? "Acil" : "Düşük"}
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <Package className="h-8 w-8" />
            </div>
            <p className="text-[#2B2B2B]/56">Tüm ürünler yeterli stokta</p>
          </div>
        )}
      </div>

      {products.length > 0 ? (
        <div className="mt-4 border-t border-[#2B2B2B]/7 pt-4">
          <Link
            href="/admin/urunler"
            className="flex items-center justify-center gap-2 rounded-2xl bg-[#2B2B2B] py-3 text-sm font-medium text-white transition-all hover:bg-[#1f1f1f]"
          >
            Tüm ürünleri görüntüle
            <ArrowUpRight className="h-4 w-4 text-[#FE6100]" />
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

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(254,97,0,0.09),transparent_24%),linear-gradient(180deg,#F7F5FB_0%,#F2F1F8_46%,#ECEAF4_100%)]">
      <div className="mx-auto max-w-[1600px] p-6 md:p-8">
        <div className="space-y-8">
          <DashboardHeader onRefresh={() => void refreshDashboard()} isRefreshing={isRefreshing} />

          {errorMessage ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm font-medium text-amber-800 shadow-sm">
              {errorMessage}
            </div>
          ) : null}

          <QuickActions />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {STAT_CONFIGS.map((config, index) => (
              <StatCard key={config.key} config={config} value={stats[config.key]} index={index} />
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="grid grid-cols-1 gap-6 lg:grid-cols-3"
          >
            <LiveVisitors data={liveData} />
            <AbandonedCartsWidget data={liveData} />
            <ActivityFeed data={liveData} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="grid grid-cols-1 gap-6 lg:grid-cols-5"
          >
            <div className="lg:col-span-3">
              <RecentOrdersCard orders={recentOrders} />
            </div>
            <div className="lg:col-span-2">
              <LowStockCard products={lowStockProducts} />
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
