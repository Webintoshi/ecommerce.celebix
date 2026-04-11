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
}

const ANIMATION_CONFIG = {
  stagger: 0.06,
  duration: 0.4,
  ease: [0.22, 1, 0.36, 1] as const,
};

const STAT_CONFIGS: StatConfig[] = [
  {
    key: "totalProducts",
    title: "Ürün",
    icon: Package,
    format: (v) => v.toLocaleString("tr-TR"),
    trend: { value: "+12%", isPositive: true },
    href: "/admin/urunler",
  },
  {
    key: "totalOrders",
    title: "Sipariş",
    icon: ShoppingCart,
    format: (v) => v.toLocaleString("tr-TR"),
    trend: { value: "+8%", isPositive: true },
    href: "/admin/siparisler",
  },
  {
    key: "pendingOrders",
    title: "Bekleyen",
    icon: Clock,
    format: (v) => v.toLocaleString("tr-TR"),
    href: "/admin/siparisler",
  },
  {
    key: "totalRevenue",
    title: "Satış",
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
    pending: "bg-gray-100 text-gray-600",
    processing: "bg-orange-100 text-orange-700",
    shipped: "bg-gray-100 text-gray-600",
    delivered: "bg-green-100 text-green-700",
    cancelled: "bg-red-100 text-red-700",
  };
  return colors[status] || "bg-gray-100 text-gray-600";
}

function getOrderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "Bekliyor",
    processing: "İşleniyor",
    shipped: "Kargoda",
    delivered: "Teslim",
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
    const duration = 600;
    const steps = 25;
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
      <Link href={config.href}>
        <div className="group rounded-2xl bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] border border-gray-200/60 transition-all duration-200 hover:shadow-md hover:bg-gray-50/50">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-600">
                <config.icon className="h-5 w-5" />
              </div>
              {config.trend ? (
                <div
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                    config.trend.isPositive
                      ? "bg-green-100/80 text-green-700"
                      : "bg-red-100/80 text-red-700"
                  )}
                >
                  <TrendIcon className="h-3 w-3" />
                  {config.trend.value}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-5">
            <p className="text-3xl font-semibold text-gray-900 tracking-tight">
              <AnimatedCounter value={value} formatter={config.format} />
            </p>
            <p className="mt-1.5 text-sm font-medium text-gray-500">{config.title}</p>
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
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: ANIMATION_CONFIG.ease }}
      className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">{greeting}</h1>
        <p className="mt-1 flex items-center gap-2 text-sm text-gray-500">
          <Calendar className="h-4 w-4" />
          {date}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onRefresh}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
        </button>

        <Link
          href="/admin/urunler/yeni"
          className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
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
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.3,
            delay: 0.15 + index * 0.04,
            ease: ANIMATION_CONFIG.ease,
          }}
        >
          <Link
            href={action.href}
            className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] border border-gray-200/60 transition-all duration-200 hover:shadow-md hover:bg-gray-50/50"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-600">
              <action.icon className="h-5 w-5" />
            </div>
            <span className="text-sm font-semibold text-gray-700">{action.label}</span>
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
}: {
  title: string;
  icon: ElementType;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] border border-gray-200/60 overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100/80 px-6 py-4">
        <div className="flex items-center gap-2.5">
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
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          Tümü
        </Link>
      }
    >
      <div className="space-y-2">
        {orders.length > 0 ? (
          orders.map((order, index) => (
            <motion.div
              key={order.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: index * 0.03 }}
            >
              <Link href={`/admin/siparisler/${order.id}`}>
                <div className="group flex items-center gap-4 rounded-lg p-3 transition-colors hover:bg-gray-50">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100 text-sm font-medium text-gray-600">
                    #{order.orderNumber?.slice(-3) || "---"}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {order.shippingAddress?.firstName || "Müşteri"}{" "}
                      {order.shippingAddress?.lastName || ""}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(order.createdAt).toLocaleDateString("tr-TR")}
                    </p>
                  </div>

                  <div
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-medium",
                      getOrderStatusColor(order.status)
                    )}
                  >
                    {getOrderStatusLabel(order.status)}
                  </div>

                  <p className="text-sm font-medium text-gray-900">
                    ₺{Number(order.total).toLocaleString("tr-TR")}
                  </p>
                </div>
              </Link>
            </motion.div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <ShoppingCart className="h-8 w-8 text-gray-300" />
            <p className="mt-2 text-sm text-gray-500">Henüz sipariş yok</p>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function LowStockCard({ products }: { products: DashboardLowStockProduct[] }) {
  return (
    <SectionCard title="Düşük Stok" icon={AlertTriangle}>
      <div className="space-y-2">
        {products.length > 0 ? (
          products.slice(0, 5).map((product, index) => {
            const lowStockVariant = product.variants?.find((variant) => variant.stock < 10);
            const stockLevel = lowStockVariant?.stock || 0;

            return (
              <motion.div
                key={product.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: index * 0.03 }}
              >
                <Link href={`/admin/urunler/${product.id}/duzenle`}>
                  <div className="group flex items-center gap-4 rounded-lg p-3 transition-colors hover:bg-gray-50">
                    <div
                      className={cn(
                        "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-sm font-medium",
                        stockLevel <= 3
                          ? "bg-red-100 text-red-700"
                          : stockLevel <= 6
                            ? "bg-orange-100 text-orange-700"
                            : "bg-yellow-100 text-yellow-700"
                      )}
                    >
                      {stockLevel}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{product.name}</p>
                      <p className="text-xs text-gray-500">{lowStockVariant?.name || "Varsayılan"}</p>
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Package className="h-8 w-8 text-gray-300" />
            <p className="mt-2 text-sm text-gray-500">Tüm ürünler yeterli stokta</p>
          </div>
        )}
      </div>

      {products.length > 0 ? (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <Link
            href="/admin/urunler"
            className="flex items-center justify-center gap-1 rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
          >
            Tüm ürünleri gör
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
    <div className="min-h-screen bg-[#F5F5F7]">
      <div className="mx-auto max-w-[1600px] p-6 md:p-8">
        <div className="space-y-8">
          <DashboardHeader onRefresh={() => void refreshDashboard()} isRefreshing={isRefreshing} />

          {errorMessage ? (
            <div className="rounded-lg bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
              {errorMessage}
            </div>
          ) : null}

          <QuickActions />

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
            {STAT_CONFIGS.map((config, index) => (
              <StatCard
                key={config.key}
                config={config}
                value={stats[config.key]}
                index={index}
              />
            ))}
          </div>

          <            motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.35 }}
            className="grid grid-cols-1 gap-6 lg:grid-cols-3 items-start"
          >
            <LiveVisitors data={liveData} />
            <AbandonedCartsWidget data={liveData} />
            <ActivityFeed data={liveData} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.45 }}
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
