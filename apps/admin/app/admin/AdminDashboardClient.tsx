"use client";

import { useEffect, useMemo, useState } from "react";
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
  icon: React.ElementType;
  gradient: string;
  format: (value: number) => string;
  trend?: { value: string; isPositive: boolean };
  href: string;
}

const ANIMATION_CONFIG = {
  stagger: 0.08,
  duration: 0.5,
  ease: [0.34, 1.56, 0.64, 1] as const,
};

const STAT_CONFIGS: StatConfig[] = [
  {
    key: "totalProducts",
    title: "Toplam Ürün",
    icon: Package,
    gradient: "from-violet-500 via-purple-500 to-fuchsia-500",
    format: (v) => v.toLocaleString("tr-TR"),
    trend: { value: "+12%", isPositive: true },
    href: "/admin/urunler",
  },
  {
    key: "totalOrders",
    title: "Toplam Sipariş",
    icon: ShoppingCart,
    gradient: "from-blue-500 via-indigo-500 to-violet-500",
    format: (v) => v.toLocaleString("tr-TR"),
    trend: { value: "+8%", isPositive: true },
    href: "/admin/siparisler",
  },
  {
    key: "pendingOrders",
    title: "Bekleyen",
    icon: Clock,
    gradient: "from-amber-500 via-orange-500 to-red-500",
    format: (v) => v.toLocaleString("tr-TR"),
    href: "/admin/siparisler",
  },
  {
    key: "totalRevenue",
    title: "Toplam Satış",
    icon: TrendingUp,
    gradient: "from-emerald-500 via-teal-500 to-cyan-500",
    format: (v) => `₺${v.toLocaleString("tr-TR")}`,
    trend: { value: "+24%", isPositive: true },
    href: "/admin/analizler",
  },
  {
    key: "lowStockProducts",
    title: "Düşük Stok",
    icon: AlertTriangle,
    gradient: "from-rose-500 via-pink-500 to-rose-400",
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
    pending: "bg-amber-100 text-amber-700 border-amber-200",
    processing: "bg-blue-100 text-blue-700 border-blue-200",
    shipped: "bg-purple-100 text-purple-700 border-purple-200",
    delivered: "bg-emerald-100 text-emerald-700 border-emerald-200",
    cancelled: "bg-rose-100 text-rose-700 border-rose-200",
  };
  return colors[status] || "bg-gray-100 text-gray-700 border-gray-200";
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

function StatCard({
  config,
  value,
  index,
}: {
  config: StatConfig;
  value: number;
  index: number;
}) {
  const Icon = config.icon;
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
        <div className="group relative overflow-hidden rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200/60 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-gray-200/50">
          <div
            className={cn(
              "absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br opacity-10 blur-3xl transition-opacity duration-500 group-hover:opacity-20",
              config.gradient
            )}
          />

          <div className="relative flex items-start justify-between">
            <div
              className={cn(
                "flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg transition-transform duration-300 group-hover:scale-110",
                config.gradient
              )}
            >
              <Icon className="h-6 w-6" />
            </div>

            {config.trend ? (
              <div
                className={cn(
                  "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                  config.trend.isPositive
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-rose-50 text-rose-700"
                )}
              >
                <TrendIcon className="h-3 w-3" />
                {config.trend.value}
              </div>
            ) : null}
          </div>

          <div className="relative mt-4">
            <p className="text-sm font-medium text-gray-500">{config.title}</p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-gray-900">
              <AnimatedCounter value={value} formatter={config.format} />
            </p>
          </div>

          <div className="absolute bottom-4 right-4 translate-x-2 translate-y-2 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100">
            <ArrowUpRight className="h-5 w-5 text-gray-400" />
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
      className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            {greeting}!
          </h1>
          <Sparkles className="h-6 w-6 text-amber-400" />
        </div>
        <p className="mt-1 flex items-center gap-2 text-gray-500">
          <Calendar className="h-4 w-4" />
          {date}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onRefresh}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-gray-600 shadow-sm ring-1 ring-gray-200 transition-all duration-200 hover:bg-gray-50 hover:text-gray-900 active:scale-95"
        >
          <RefreshCw className={cn("h-5 w-5", isRefreshing && "animate-spin")} />
        </button>

        <Link
          href="/admin/urunler/yeni"
          className="flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-gray-900/20 transition-all duration-200 hover:bg-gray-800 hover:shadow-xl hover:shadow-gray-900/30 active:scale-95"
        >
          <Plus className="h-4 w-4" />
          Yeni Ürün
        </Link>
      </div>
    </motion.div>
  );
}

function QuickActions() {
  const actions = [
    { icon: FileText, label: "Siparişler", href: "/admin/siparisler", color: "bg-blue-500" },
    { icon: Package, label: "Ürünler", href: "/admin/urunler", color: "bg-violet-500" },
    { icon: Users, label: "Müşteriler", href: "/admin/musteriler", color: "bg-emerald-500" },
    { icon: ShoppingCart, label: "Sepetler", href: "/admin/siparisler/sepet-terk", color: "bg-amber-500" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {actions.map((action, index) => (
        <motion.div
          key={action.label}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            duration: 0.4,
            delay: 0.3 + index * 0.05,
            ease: ANIMATION_CONFIG.ease,
          }}
        >
          <Link
            href={action.href}
            className="group flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200/60 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg text-white", action.color)}>
              <action.icon className="h-5 w-5" />
            </div>
            <span className="font-medium text-gray-700">{action.label}</span>
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
  icon: React.ElementType;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200/60",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-gray-400" />
          <h3 className="font-semibold text-gray-900">{title}</h3>
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
          className="text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
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
                <div className="group flex items-center gap-4 rounded-xl p-3 transition-all duration-200 hover:bg-gray-50">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gray-100 to-gray-200 text-sm font-bold text-gray-700">
                    #{order.orderNumber?.slice(-3) || "---"}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-gray-900">
                      {order.shippingAddress?.firstName || "Müşteri"}{" "}
                      {order.shippingAddress?.lastName || ""}
                    </p>
                    <p className="text-sm text-gray-500">
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
                    <p className="font-semibold text-gray-900">
                      ₺{Number(order.total).toLocaleString("tr-TR")}
                    </p>
                  </div>

                  <ArrowUpRight className="h-5 w-5 flex-shrink-0 text-gray-300 transition-colors group-hover:text-gray-500" />
                </div>
              </Link>
            </motion.div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
              <ShoppingCart className="h-8 w-8 text-gray-400" />
            </div>
            <p className="text-gray-500">Henüz sipariş yok</p>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function LowStockCard({ products }: { products: DashboardLowStockProduct[] }) {
  return (
    <SectionCard
      title="Düşük Stok Uyarısı"
      icon={AlertTriangle}
      className="border-l-4 border-l-rose-500"
    >
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
                  <div className="group flex items-center gap-4 rounded-xl p-3 transition-all duration-200 hover:bg-rose-50/50">
                    <div
                      className={cn(
                        "flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full",
                        stockLevel <= 3
                          ? "bg-rose-100 text-rose-700"
                          : stockLevel <= 6
                            ? "bg-amber-100 text-amber-700"
                            : "bg-orange-100 text-orange-700"
                      )}
                    >
                      <span className="text-sm font-bold">{stockLevel}</span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-gray-900">{product.name}</p>
                      <p className="text-sm text-gray-500">{lowStockVariant?.name || "Varsayilan"}</p>
                    </div>

                    <div
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-medium",
                        stockLevel <= 3
                          ? "bg-rose-100 text-rose-700"
                          : stockLevel <= 6
                            ? "bg-amber-100 text-amber-700"
                            : "bg-orange-100 text-orange-700"
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
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <Package className="h-8 w-8 text-emerald-600" />
            </div>
            <p className="text-gray-500">Tüm ürünler yeterli stokta</p>
          </div>
        )}
      </div>

      {products.length > 0 ? (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <Link
            href="/admin/urunler"
            className="flex items-center justify-center gap-2 rounded-lg bg-gray-50 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
          >
            Tüm ürünleri görüntüle
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

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="p-6 md:p-8">
        <div className="mx-auto max-w-[1600px] space-y-8">
          <DashboardHeader onRefresh={() => void refreshDashboard()} isRefreshing={isRefreshing} />

          {errorMessage ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              {errorMessage}
            </div>
          ) : null}

          <QuickActions />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {STAT_CONFIGS.map((config, index) => (
              <StatCard
                key={config.key}
                config={config}
                value={stats[config.key]}
                index={index}
              />
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
