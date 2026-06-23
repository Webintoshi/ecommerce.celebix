"use client";

import type { ComponentType, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Activity,
  Archive,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Eye,
  ListChecks,
  Package,
  Percent,
  Plus,
  ShoppingBag,
  Sparkles,
  Truck,
  Users,
} from "lucide-react";
import { Line, LineChart, ResponsiveContainer, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import type {
  DashboardAnalysisSummaryItem,
  DashboardBootstrapData,
  DashboardCustomerActivity,
  DashboardLowStockProduct,
  DashboardOverviewCard,
  DashboardPerformancePoint,
  DashboardRecentOrder,
} from "@/lib/admin-data-types";
import { cn } from "@/lib/utils";
import type { TimeRange } from "@/types/analytics";

const PERIODS: Array<{ label: string; value: TimeRange }> = [
  { label: "Bugün", value: "today" },
  { label: "Bu hafta", value: "week" },
  { label: "Bu ay", value: "month" },
  { label: "Son 90 gün", value: "quarter" },
];

const TOSHI_PROMPTS = [
  "Satışları artırmak için öneriler sun",
  "En çok satan ürünleri göster",
  "Kampanya performansını analiz et",
  "Bugünkü siparişleri özetle",
];

const TOSHI_MASCOT_SRC = "/branding/toshi-mascot-launcher.png";

const SURFACE =
  "rounded-[12px] border border-[rgba(215,221,231,0.82)] bg-[rgba(255,255,255,0.86)] shadow-none";

const SUBTLE_SURFACE =
  "rounded-[12px] border border-[rgba(226,231,238,0.78)] bg-[rgba(255,255,255,0.62)]";

const KPI_TONES: Record<
  DashboardOverviewCard["tone"],
  {
    iconShell: string;
    spark: string;
    valueClassName: string;
  }
> = {
  orange: {
    iconShell:
      "border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] text-[var(--admin-accent-hover)]",
    spark: "#FF6A00",
    valueClassName: "text-[var(--admin-heading)]",
  },
  emerald: {
    iconShell:
      "border-[rgba(22,163,74,0.18)] bg-[var(--admin-success-soft)] text-[var(--admin-success)]",
    spark: "#16A34A",
    valueClassName: "text-[var(--admin-heading)]",
  },
  violet: {
    iconShell:
      "border-[rgba(139,92,246,0.18)] bg-[var(--admin-purple-soft)] text-[var(--admin-purple)]",
    spark: "#8B5CF6",
    valueClassName: "text-[var(--admin-heading)]",
  },
  amber: {
    iconShell:
      "border-[rgba(255,106,0,0.16)] bg-[rgba(255,241,232,0.92)] text-[var(--admin-accent-hover)]",
    spark: "#FF9F0A",
    valueClassName: "text-[var(--admin-heading)]",
  },
};

function openToshi(prompt?: string) {
  window.dispatchEvent(
    new CustomEvent("celebix:toshi-open", {
      detail: prompt ? { prompt } : undefined,
    }),
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCompactValue(value: number) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString("tr-TR", {
      maximumFractionDigits: 1,
    })} Mn`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toLocaleString("tr-TR", {
      maximumFractionDigits: 1,
    })} B`;
  }

  return value.toLocaleString("tr-TR");
}

function formatDelta(change: number) {
  if (change === 0) {
    return {
      label: "Değişim yok",
      compactLabel: "Sabit",
      positive: null as boolean | null,
    };
  }

  const rounded = Number.isInteger(change)
    ? change.toString()
    : change.toLocaleString("tr-TR", { maximumFractionDigits: 1 });

  return {
    label: `%${rounded}`,
    compactLabel: `%${rounded}`,
    positive: change > 0,
  };
}

function formatRelativeTime(dateString: string) {
  const timestamp = new Date(dateString).getTime();
  const diffMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));

  if (diffMinutes < 1) return "az önce";
  if (diffMinutes < 60) return `${diffMinutes} dk önce`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} saat önce`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} gün önce`;

  return new Date(dateString).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
  });
}

function formatOrderMeta(dateString: string) {
  return new Date(dateString).toLocaleString("tr-TR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "TS";

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function getPeriodLabel(value: TimeRange) {
  return PERIODS.find((period) => period.value === value)?.label ?? "Bu hafta";
}

function getOverviewCard(
  cards: DashboardOverviewCard[],
  key: DashboardOverviewCard["key"],
) {
  return cards.find((card) => card.key === key) ?? null;
}

function getOrderStatusMeta(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    pending: {
      label: "Beklemede",
      className: "border-[var(--admin-border)] bg-[var(--admin-bg)] text-[var(--admin-text-secondary)]",
    },
    processing: {
      label: "Hazırlanıyor",
      className:
        "border-[var(--admin-accent-border)] bg-[rgba(255,241,232,0.72)] text-[var(--admin-accent-hover)]",
    },
    shipped: {
      label: "Kargoda",
      className: "border-[rgba(59,130,246,0.18)] bg-[var(--admin-info-soft)] text-[var(--admin-info)]",
    },
    delivered: {
      label: "Teslim Edildi",
      className:
        "border-[rgba(22,163,74,0.18)] bg-[var(--admin-success-soft)] text-[var(--admin-success)]",
    },
    cancelled: {
      label: "İptal Edildi",
      className:
        "border-[rgba(239,68,68,0.18)] bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]",
    },
  };

  return (
    map[status] || {
      label: status,
      className: "border-[var(--admin-border)] bg-[var(--admin-bg)] text-[var(--admin-text-secondary)]",
    }
  );
}

function getActivityBadge(type: DashboardCustomerActivity["type"]) {
  switch (type) {
    case "order":
      return "bg-[rgba(255,241,232,0.92)] text-[var(--admin-accent-hover)]";
    case "review":
      return "bg-[var(--admin-purple-soft)] text-[var(--admin-purple)]";
    case "customer":
      return "bg-[var(--admin-success-soft)] text-[var(--admin-success)]";
    default:
      return "bg-[var(--admin-bg)] text-[var(--admin-text-secondary)]";
  }
}

function getAnalysisMeta(key: DashboardAnalysisSummaryItem["key"]) {
  switch (key) {
    case "visitors":
      return {
        icon: Activity,
        shell: "bg-[var(--admin-purple-soft)] text-[var(--admin-purple)]",
      };
    case "pageViews":
      return {
        icon: Activity,
        shell: "bg-[var(--admin-info-soft)] text-[var(--admin-info)]",
      };
    case "addToCart":
      return {
        icon: ShoppingBag,
        shell: "bg-[rgba(255,241,232,0.92)] text-[var(--admin-accent-hover)]",
      };
    case "purchases":
      return {
        icon: Sparkles,
        shell: "bg-[var(--admin-success-soft)] text-[var(--admin-success)]",
      };
    default:
      return {
        icon: Activity,
        shell: "bg-[var(--admin-bg)] text-[var(--admin-text-secondary)]",
      };
  }
}

function deriveToshiHighlight(dashboard: DashboardBootstrapData) {
  const pendingCard = getOverviewCard(dashboard.overview.cards, "pending");
  const revenueCard = getOverviewCard(dashboard.overview.cards, "revenue");

  if (dashboard.lowStockProducts.length > 0) {
    return {
      title: `Stokta azalan ${dashboard.lowStockProducts.length} ürün var.`,
      description: "Kritik seviyeleri hemen gözden geçirin.",
      prompt: "Stokta azalan ürünleri göster",
      icon: Package,
    };
  }

  if ((pendingCard?.value ?? 0) > 0) {
    return {
      title: `${pendingCard?.value.toLocaleString("tr-TR")} bekleyen sipariş var.`,
      description: "Hazırlık ve kargo akışını hızlandırın.",
      prompt: "Bugünkü siparişleri özetle",
      icon: Truck,
    };
  }

  if ((revenueCard?.change ?? 0) < 0) {
    return {
      title: "Ciro trendi zayıflıyor.",
      description: "Kampanya ve ürün performansını birlikte değerlendirin.",
      prompt: "Kampanya performansını analiz et",
      icon: Activity,
    };
  }

  return {
    title: "Mağaza görünümü stabil.",
    description: "Hızlı fırsatları ve öne çıkan ürünleri birlikte gözden geçirin.",
    prompt: "Satışları artırmak için öneriler sun",
    icon: Sparkles,
  };
}

function MiniSparkline({
  values,
  color,
}: {
  values: number[];
  color: string;
}) {
  if (!values || values.length < 2) {
    return null;
  }

  const width = 84;
  const height = 32;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * (height - 6) - 3;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-8 w-[84px]" aria-hidden="true">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

function DashboardCard({
  title,
  action,
  className,
  bodyClassName,
  children,
}: {
  title: string;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn(SURFACE, "overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-3 px-4 pb-0 pt-4 md:px-5 md:pt-5">
        <h2 className="text-[0.98rem] font-semibold tracking-[-0.025em] text-[var(--admin-heading)]">
          {title}
        </h2>
        {action}
      </div>
      <div className={cn("px-4 py-4 md:px-5 md:py-5", bodyClassName)}>{children}</div>
    </section>
  );
}

function DashboardTopStrip({
  dashboard,
  selectedPeriod,
  onPeriodChange,
}: {
  dashboard: DashboardBootstrapData;
  selectedPeriod: TimeRange;
  onPeriodChange: (value: TimeRange) => void;
}) {
  const ordersCard = getOverviewCard(dashboard.overview.cards, "orders");
  const revenueCard = getOverviewCard(dashboard.overview.cards, "revenue");
  const pendingCard = getOverviewCard(dashboard.overview.cards, "pending");

  const chips = [
    `${ordersCard?.value.toLocaleString("tr-TR") ?? "0"} sipariş`,
    `${formatCurrency(revenueCard?.value ?? 0)} satış`,
    `${pendingCard?.value.toLocaleString("tr-TR") ?? "0"} bekleyen`,
    `${dashboard.liveData.abandonedCarts.count.toLocaleString("tr-TR")} terk sepet`,
  ];

  const quickActions = [
    { label: "Ürün ekle", href: "/admin/urunler/yeni", icon: Plus, primary: true },
    { label: "Siparişleri görüntüle", href: "/admin/siparisler", icon: ShoppingBag },
    { label: "Terk sepetleri gör", href: "/admin/siparisler/sepet-terk", icon: Archive },
    { label: "Mağazayı görüntüle", href: STORE_RUNTIME.storefrontUrl, icon: Eye, external: true },
  ];

  return (
    <section className="grid gap-4 border-b border-[rgba(226,231,238,0.72)] pb-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:pb-5">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--admin-accent-hover)]">
          Günlük kontrol merkezi
        </p>
        <h1 className="mt-3 text-[1.95rem] font-semibold tracking-[-0.05em] text-[var(--admin-heading)] md:text-[2.35rem]">
          Mağaza özeti
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--admin-text-secondary)] md:text-[15px]">
          Satış, sipariş, stok ve müşteri sinyallerini tek ekranda takip edin; aksiyon gerektiren alanlara hızlıca geçin.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <span
              key={chip}
              className="inline-flex min-h-[28px] items-center rounded-[10px] bg-white/70 px-2.5 py-1 text-[12px] font-semibold text-[var(--admin-text-secondary)] ring-1 ring-[rgba(226,231,238,0.72)]"
            >
              {chip}
            </span>
          ))}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap md:max-w-[720px] md:justify-end">
        <label className="inline-flex min-h-[42px] items-center gap-2 rounded-[12px] border border-[rgba(215,221,231,0.82)] bg-white/80 px-3.5 py-2 text-sm font-semibold text-[var(--admin-heading)]">
          <CalendarDays className="h-4.5 w-4.5 text-[var(--admin-accent-hover)]" />
          <span className="sr-only">{getPeriodLabel(selectedPeriod)} özeti</span>
          <select
            value={selectedPeriod}
            onChange={(event) => onPeriodChange(event.target.value as TimeRange)}
            className="bg-transparent pr-3 text-sm font-semibold outline-none"
            aria-label="Dashboard dönem seçici"
          >
            {PERIODS.map((period) => (
              <option key={period.value} value={period.value}>
                {period.label}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {quickActions.map((action) => {
            const ActionIcon = action.icon;
            const className = cn(
              "inline-flex min-h-[42px] items-center justify-center gap-2 rounded-[12px] border px-3.5 text-sm font-semibold transition-colors",
              action.primary
                ? "border-[var(--admin-accent)] bg-[var(--admin-accent)] text-white hover:bg-[var(--admin-accent-hover)]"
                : "border-[rgba(215,221,231,0.82)] bg-white/80 text-[var(--admin-text)] hover:border-[var(--admin-accent-border)] hover:text-[var(--admin-accent-hover)]",
            );

            if (action.external) {
              return (
                <a key={action.label} href={action.href} target="_blank" rel="noreferrer" className={className}>
                  <ActionIcon className="h-4 w-4" />
                  <span>{action.label}</span>
                </a>
              );
            }

            return (
              <Link key={action.label} href={action.href} className={className}>
                <ActionIcon className="h-4 w-4" />
                <span>{action.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

type DashboardMetric = {
  key: string;
  label: string;
  value: ReactNode;
  href: string;
  context: string;
  tone: DashboardOverviewCard["tone"];
  icon: ComponentType<{ className?: string }>;
  trend?: number[];
  delta?: ReturnType<typeof formatDelta>;
};

function buildDashboardMetrics(dashboard: DashboardBootstrapData): DashboardMetric[] {
  const ordersCard = getOverviewCard(dashboard.overview.cards, "orders");
  const revenueCard = getOverviewCard(dashboard.overview.cards, "revenue");
  const abandonedCount = dashboard.liveData.abandonedCarts.count;
  const abandonedTotal = dashboard.liveData.abandonedCarts.total;
  const lowStockCount = dashboard.stats.lowStockProducts || dashboard.lowStockProducts.length;

  return [
    {
      key: "revenue",
      label: "Satış",
      value: formatCurrency(revenueCard?.value ?? dashboard.stats.totalRevenue),
      href: revenueCard?.href ?? "/admin/analizler",
      context: `${getPeriodLabel(dashboard.overview.timeRange)} toplamı`,
      tone: "orange",
      icon: Activity,
      trend: revenueCard?.trend,
      delta: formatDelta(revenueCard?.change ?? 0),
    },
    {
      key: "orders",
      label: "Siparişler",
      value: (ordersCard?.value ?? dashboard.stats.totalOrders).toLocaleString("tr-TR"),
      href: ordersCard?.href ?? "/admin/siparisler",
      context: "Yeni ve açık siparişler",
      tone: "emerald",
      icon: ShoppingBag,
      trend: ordersCard?.trend,
      delta: formatDelta(ordersCard?.change ?? 0),
    },
    {
      key: "abandoned",
      label: "Terk sepetler",
      value: abandonedCount.toLocaleString("tr-TR"),
      href: "/admin/siparisler/sepet-terk",
      context: `${formatCurrency(abandonedTotal)} potansiyel`,
      tone: "amber",
      icon: Archive,
    },
    {
      key: "low-stock",
      label: "Düşük stok",
      value: lowStockCount.toLocaleString("tr-TR"),
      href: "/admin/urunler",
      context: lowStockCount > 0 ? "Kontrol bekliyor" : "Kritik ürün yok",
      tone: "amber",
      icon: Package,
    },
    {
      key: "visitors",
      label: "Canlı ziyaretçi",
      value: dashboard.liveData.liveVisitors.toLocaleString("tr-TR"),
      href: "/admin/analizler",
      context: "Şu an mağazada",
      tone: "violet",
      icon: Users,
    },
  ];
}

function KpiCard({ metric }: { metric: DashboardMetric }) {
  const tone = KPI_TONES[metric.tone];
  const DeltaIcon = metric.delta?.positive === false ? ArrowDownRight : ArrowUpRight;
  const Icon = metric.icon;

  return (
    <Link
      href={metric.href}
      className={cn(
        "group flex min-h-[112px] flex-col border-b border-r border-[rgba(226,231,238,0.82)] bg-white/50 p-4 transition-colors hover:bg-white/80 active:bg-white md:p-5",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-[11px] border",
            tone.iconShell,
          )}
        >
          <Icon className="h-4.5 w-4.5" />
        </div>
        {metric.trend && metric.trend.length > 1 ? (
          <div className="translate-x-1 translate-y-0.5 opacity-90">
            <MiniSparkline values={metric.trend} color={tone.spark} />
          </div>
        ) : (
          <span className="rounded-full bg-[var(--admin-muted-surface)] px-2 py-1 text-[11px] font-semibold text-[var(--admin-text-muted)]">
            Anlık
          </span>
        )}
      </div>

      <div className="mt-4">
        <p className="text-[12px] font-medium leading-5 text-[var(--admin-text-secondary)]">
          {metric.label}
        </p>
        <p
          className={cn(
            "mt-1.5 truncate text-[1.32rem] font-semibold tracking-[-0.045em] md:text-[1.46rem]",
            tone.valueClassName,
          )}
        >
          {metric.value}
        </p>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
        {metric.delta ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[12px] font-semibold",
              metric.delta.positive === null
                ? "text-[var(--admin-text-secondary)]"
                : metric.delta.positive
                  ? "text-[var(--admin-success)]"
                  : "text-[var(--admin-danger)]",
            )}
          >
            {metric.delta.positive !== null ? <DeltaIcon className="h-3.5 w-3.5" /> : null}
            {metric.delta.compactLabel}
          </span>
        ) : null}
        <span className="min-w-0 truncate text-[11px] text-[var(--admin-text-muted)]">
          {metric.context}
        </span>
      </div>
    </Link>
  );
}

function KpiGrid({
  dashboard,
  isRefreshing,
}: {
  dashboard: DashboardBootstrapData;
  isRefreshing: boolean;
}) {
  if (isRefreshing) {
    return (
      <section className="grid grid-cols-1 gap-0 overflow-hidden rounded-[12px] border border-[rgba(215,221,231,0.82)] bg-white/70 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-[112px] rounded-none" />
        ))}
      </section>
    );
  }

  const metrics = buildDashboardMetrics(dashboard);

  return (
    <section className="grid grid-cols-1 gap-0 overflow-hidden rounded-[12px] border border-[rgba(215,221,231,0.82)] bg-white/70 sm:grid-cols-2 xl:grid-cols-5">
      {metrics.map((metric) => (
        <KpiCard key={metric.key} metric={metric} />
      ))}
    </section>
  );
}

function SalesChartCard({
  points,
  currentLabel,
  previousLabel,
  currentRevenue,
  previousRevenue,
  currentOrders,
}: {
  points: DashboardPerformancePoint[];
  currentLabel: string;
  previousLabel: string;
  currentRevenue: number;
  previousRevenue: number;
  currentOrders: number;
}) {
  const revenueDelta = formatDelta(
    previousRevenue === 0 ? 0 : ((currentRevenue - previousRevenue) / previousRevenue) * 100,
  );

  return (
    <DashboardCard
      title="Satışlar"
      action={
        <span className="inline-flex min-h-[34px] items-center rounded-full border border-[var(--admin-border)] bg-[rgba(247,248,250,0.84)] px-3 py-1 text-[12px] font-semibold text-[var(--admin-text-secondary)]">
          {currentLabel}
        </span>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-4 text-[12px] font-medium text-[var(--admin-text-secondary)]">
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--admin-accent)]" />
            {currentLabel}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--admin-text-muted)]" />
            {previousLabel}
          </span>
        </div>

        {points.length > 0 ? (
          <div className="h-[238px] md:h-[270px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 10, right: 4, left: -22, bottom: 6 }}>
                <CartesianGrid stroke="rgba(231,234,240,0.9)" vertical={false} strokeDasharray="4 4" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#9CA3AF", fontSize: 12 }}
                  dy={8}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#9CA3AF", fontSize: 12 }}
                  tickFormatter={formatCompactValue}
                  width={46}
                />
                <Tooltip
                  cursor={{ stroke: "#E7EAF0", strokeWidth: 1.2 }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload || payload.length === 0) {
                      return null;
                    }

                    const point = payload[0]?.payload as DashboardPerformancePoint;

                    return (
                      <div className="rounded-[16px] border border-[var(--admin-border)] bg-white px-3.5 py-3 shadow-[var(--shadow-md)]">
                        <p className="text-sm font-semibold text-[var(--admin-heading)]">{label}</p>
                        <div className="mt-3 space-y-2 text-sm text-[var(--admin-text-secondary)]">
                          <div className="flex items-center justify-between gap-6">
                            <span className="inline-flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full bg-[var(--admin-accent)]" />
                              {currentLabel}
                            </span>
                            <span className="font-semibold text-[var(--admin-heading)]">
                              {formatCurrency(point.currentRevenue)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-6">
                            <span className="inline-flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full bg-[var(--admin-text-muted)]" />
                              {previousLabel}
                            </span>
                            <span className="font-semibold text-[var(--admin-heading)]">
                              {formatCurrency(point.previousRevenue)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="previousRevenue"
                  stroke="#9CA3AF"
                  strokeWidth={2}
                  strokeDasharray="6 6"
                  dot={false}
                  activeDot={{ r: 3, fill: "#9CA3AF" }}
                />
                <Line
                  type="monotone"
                  dataKey="currentRevenue"
                  stroke="#FF6A00"
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 4, fill: "#FF6A00" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-[238px] items-center justify-center rounded-[20px] border border-dashed border-[var(--admin-border)] bg-[rgba(247,248,250,0.72)]">
            <p className="text-sm text-[var(--admin-text-secondary)]">Grafik verisi bulunamadı.</p>
          </div>
        )}

        <div className={cn(SUBTLE_SURFACE, "flex items-end justify-between gap-4 px-4 py-4")}>
          <div>
            <p className="text-[12px] font-medium text-[var(--admin-text-secondary)]">Toplam Ciro</p>
            <p className="mt-2 text-[1.55rem] font-semibold tracking-[-0.05em] text-[var(--admin-heading)]">
              {formatCurrency(currentRevenue)}
            </p>
          </div>
          <div className="text-right">
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[12px] font-semibold",
                revenueDelta.positive === null
                  ? "text-[var(--admin-text-secondary)]"
                  : revenueDelta.positive
                    ? "text-[var(--admin-success)]"
                    : "text-[var(--admin-danger)]",
              )}
            >
              {revenueDelta.positive !== null ? (
                revenueDelta.positive ? (
                  <ArrowUpRight className="h-3.5 w-3.5" />
                ) : (
                  <ArrowDownRight className="h-3.5 w-3.5" />
                )
              ) : null}
              {revenueDelta.compactLabel}
            </span>
            <p className="mt-2 text-[12px] text-[var(--admin-text-secondary)]">
              {currentOrders.toLocaleString("tr-TR")} sipariş
            </p>
          </div>
        </div>
      </div>
    </DashboardCard>
  );
}

function ToshiCard({ dashboard }: { dashboard: DashboardBootstrapData }) {
  const highlight = deriveToshiHighlight(dashboard);
  const HighlightIcon = highlight.icon;

  return (
    <DashboardCard title="Toshi önerileri" className="h-full" bodyClassName="pt-3">
      <div className="flex h-full flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-full border border-[rgba(226,231,238,0.82)] bg-white">
            <Image src={TOSHI_MASCOT_SRC} alt="Toshi" fill className="object-contain p-1.5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--admin-heading)]">Akıllı kontrol listesi</p>
            <p className="mt-1 text-[13px] leading-5 text-[var(--admin-text-secondary)]">
              Kritik sinyalleri kısa önerilere çevirir.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => openToshi(highlight.prompt)}
          className="flex min-h-[68px] items-center justify-between gap-3 rounded-[12px] border border-[rgba(255,215,191,0.76)] bg-[rgba(255,241,232,0.68)] px-3.5 py-3 text-left transition-colors active:bg-[rgba(255,241,232,0.84)]"
        >
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] bg-white/80 text-[var(--admin-accent-hover)]">
              <HighlightIcon className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--admin-heading)]">{highlight.title}</p>
              <p className="mt-1 text-[13px] leading-5 text-[var(--admin-text-secondary)]">
                {highlight.description}
              </p>
            </div>
          </div>
          <ArrowRight className="h-4.5 w-4.5 flex-shrink-0 text-[var(--admin-accent-hover)]" />
        </button>

        <div className="divide-y divide-[rgba(231,234,240,0.82)]">
          {TOSHI_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => openToshi(prompt)}
              className="flex min-h-[48px] w-full items-center justify-between gap-3 rounded-[10px] px-2 py-2.5 text-left text-[13px] font-medium text-[var(--admin-heading)] transition-colors hover:bg-white/75 active:bg-white"
            >
              <span className="min-w-0 truncate">{prompt}</span>
              <ChevronRight className="h-4.5 w-4.5 flex-shrink-0 text-[var(--admin-text-muted)]" />
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => openToshi()}
          className="mt-auto inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[12px] border border-[rgba(215,221,231,0.82)] bg-white/80 px-4 py-2.5 text-sm font-semibold text-[var(--admin-heading)] transition-colors hover:border-[var(--admin-accent-border)] hover:text-[var(--admin-accent-hover)] active:bg-white"
        >
          <Sparkles className="h-4.5 w-4.5" />
          Toshi ile konuş
        </button>
      </div>
    </DashboardCard>
  );
}

function ListHeaderAction({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-[32px] items-center text-[13px] font-semibold text-[var(--admin-accent-hover)]"
    >
      Tümünü Gör
    </Link>
  );
}

function RecentOrdersCard({ orders }: { orders: DashboardRecentOrder[] }) {
  return (
    <DashboardCard title="Son Siparişler" action={<ListHeaderAction href="/admin/siparisler" />}>
      {orders.length > 0 ? (
        <div className="divide-y divide-[rgba(231,234,240,0.88)]">
          {orders.map((order) => {
            const status = getOrderStatusMeta(order.status);
            const customerName =
              order.customerName ||
              `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`.trim();

            return (
              <Link
                key={order.id}
                href={`/admin/siparisler/${order.id}`}
                className="flex items-center gap-3 py-4 first:pt-0 last:pb-0 active:opacity-80"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-[var(--admin-heading)]">
                        #{order.orderNumber}
                      </p>
                      <p className="mt-1 text-[12px] text-[var(--admin-text-muted)]">
                        {formatOrderMeta(order.createdAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[14px] font-semibold text-[var(--admin-heading)]">
                        {formatCurrency(order.total)}
                      </p>
                      <span
                        className={cn(
                          "mt-1 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                          status.className,
                        )}
                      >
                        {status.label}
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 text-[14px] font-medium text-[var(--admin-text)]">
                    {customerName}
                  </p>
                  <p className="mt-1 text-[12px] text-[var(--admin-text-secondary)]">
                    Sipariş detayını aç
                  </p>
                </div>
                <ChevronRight className="h-4.5 w-4.5 flex-shrink-0 text-[var(--admin-text-muted)]" />
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="rounded-[18px] border border-dashed border-[var(--admin-border)] bg-[rgba(247,248,250,0.78)] px-5 py-10 text-center">
          <ShoppingBag className="mx-auto h-8 w-8 text-[var(--admin-text-muted)]" />
          <p className="mt-3 text-sm text-[var(--admin-text-secondary)]">Henüz sipariş görünmüyor.</p>
        </div>
      )}
    </DashboardCard>
  );
}

function LowStockProductsCard({ products }: { products: DashboardLowStockProduct[] }) {
  return (
    <DashboardCard title="Stokta Azalan Ürünler" action={<ListHeaderAction href="/admin/urunler" />}>
      {products.length > 0 ? (
        <div className="divide-y divide-[rgba(231,234,240,0.88)]">
          {products.slice(0, 5).map((product) => {
            const stock = product.stock || 0;
            const critical = stock <= 3;

            return (
              <Link
                key={product.id}
                href={`/admin/urunler/${product.id}/duzenle`}
                className="flex items-center gap-3 py-3.5 first:pt-0 last:pb-0 active:opacity-80"
              >
                <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-[14px] border border-[var(--admin-border)] bg-[rgba(247,248,250,0.86)]">
                  {product.imageUrl ? (
                    <Image src={product.imageUrl} alt={product.name} fill className="object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[var(--admin-text-secondary)]">
                      <Package className="h-4.5 w-4.5" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-[var(--admin-heading)]">
                    {product.name}
                  </p>
                  <p className="mt-1 truncate text-[12px] text-[var(--admin-text-secondary)]">
                    {product.sku
                      ? `SKU: ${product.sku}`
                      : product.variantName || "Varsayılan varyant"}
                  </p>
                </div>
                <span
                  className={cn(
                    "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                    critical
                      ? "border-[rgba(239,68,68,0.18)] bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]"
                      : "border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] text-[var(--admin-accent-hover)]",
                  )}
                >
                  {stock.toLocaleString("tr-TR")} adet kaldı
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="rounded-[18px] border border-dashed border-[rgba(22,163,74,0.2)] bg-[var(--admin-success-soft)] px-5 py-10 text-center">
          <Package className="mx-auto h-8 w-8 text-[var(--admin-success)]" />
          <p className="mt-3 text-sm text-[var(--admin-text-secondary)]">
            Kritik stokta ürün bulunmuyor.
          </p>
        </div>
      )}
    </DashboardCard>
  );
}

function AbandonedCartsCard({ dashboard }: { dashboard: DashboardBootstrapData }) {
  const count = dashboard.liveData.abandonedCarts.count;
  const total = dashboard.liveData.abandonedCarts.total;

  return (
    <DashboardCard title="Terk Sepetler" action={<ListHeaderAction href="/admin/siparisler/sepet-terk" />}>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div>
          <p className="text-[13px] font-medium text-[var(--admin-text-secondary)]">
            Kurtarma fırsatı
          </p>
          <p className="mt-2 text-[2rem] font-semibold tracking-[-0.055em] text-[var(--admin-heading)]">
            {count.toLocaleString("tr-TR")}
          </p>
          <p className="mt-1 text-sm text-[var(--admin-text-secondary)]">
            {count > 0
              ? `${formatCurrency(total)} potansiyel sepet değeri takipte.`
              : "Aktif terk sepet sinyali yok."}
          </p>
        </div>
        <Link
          href="/admin/siparisler/sepet-terk"
          className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-[14px] border border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] px-3.5 text-sm font-semibold text-[var(--admin-accent-hover)] transition-colors hover:bg-white"
        >
          <Archive className="h-4 w-4" />
          Listeyi aç
        </Link>
      </div>
    </DashboardCard>
  );
}

function TodoCard({ dashboard }: { dashboard: DashboardBootstrapData }) {
  const pendingCard = getOverviewCard(dashboard.overview.cards, "pending");
  const pendingOrders = pendingCard?.value ?? dashboard.stats.pendingOrders;
  const abandonedCount = dashboard.liveData.abandonedCarts.count;
  const lowStockCount = dashboard.stats.lowStockProducts || dashboard.lowStockProducts.length;

  const tasks = [
    {
      title: "Bekleyen siparişleri kontrol et",
      description: `${pendingOrders.toLocaleString("tr-TR")} sipariş hazırlık bekliyor.`,
      href: "/admin/siparisler",
      active: pendingOrders > 0,
      icon: ShoppingBag,
    },
    {
      title: "Düşük stok uyarılarını kapat",
      description: `${lowStockCount.toLocaleString("tr-TR")} ürün için stok kontrolü gerekli.`,
      href: "/admin/urunler",
      active: lowStockCount > 0,
      icon: Package,
    },
    {
      title: "Terk sepet fırsatlarını incele",
      description: `${abandonedCount.toLocaleString("tr-TR")} sepet kurtarma için hazır.`,
      href: "/admin/siparisler/sepet-terk",
      active: abandonedCount > 0,
      icon: Archive,
    },
  ];

  const activeTasks = tasks.filter((task) => task.active);
  const visibleTasks = activeTasks.length > 0 ? activeTasks : tasks.slice(0, 2);

  return (
    <DashboardCard title="Yapılacaklar" action={<ListChecks className="h-4.5 w-4.5 text-[var(--admin-accent-hover)]" />}>
      <div className="space-y-1">
        {activeTasks.length === 0 ? (
          <div className="mb-2 flex items-start gap-3 rounded-[12px] border border-[rgba(22,163,74,0.18)] bg-[var(--admin-success-soft)] px-3.5 py-3">
            <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 shrink-0 text-[var(--admin-success)]" />
            <div>
              <p className="text-sm font-semibold text-[var(--admin-heading)]">Bugün kritik aksiyon yok.</p>
              <p className="mt-1 text-[13px] leading-5 text-[var(--admin-text-secondary)]">
                Sipariş, stok ve terk sepet sinyalleri sakin görünüyor.
              </p>
            </div>
          </div>
        ) : null}

        {visibleTasks.map((task) => {
          const TaskIcon = task.icon;

          return (
            <Link
              key={task.title}
              href={task.href}
              className="flex min-h-[62px] items-center gap-3 rounded-[10px] px-2.5 py-2.5 transition-colors hover:bg-white/75 active:bg-white"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--admin-muted-surface)] text-[var(--admin-text-secondary)]">
                <TaskIcon className="h-4.5 w-4.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-[var(--admin-heading)]">{task.title}</span>
                <span className="mt-1 block truncate text-[12px] text-[var(--admin-text-secondary)]">
                  {task.description}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[var(--admin-text-muted)]" />
            </Link>
          );
        })}
      </div>
    </DashboardCard>
  );
}

function StoreStatusCard({ dashboard }: { dashboard: DashboardBootstrapData }) {
  const statusItems = [
    {
      label: "Admin çalışma durumu",
      value: "Sağlıklı",
      tone: "success",
    },
    {
      label: "Canlı ziyaretçi",
      value: dashboard.liveData.liveVisitors.toLocaleString("tr-TR"),
      tone: "info",
    },
    {
      label: "Toplam ürün",
      value: dashboard.stats.totalProducts.toLocaleString("tr-TR"),
      tone: "neutral",
    },
    {
      label: "Düşük stok",
      value: (dashboard.stats.lowStockProducts || dashboard.lowStockProducts.length).toLocaleString("tr-TR"),
      tone: dashboard.lowStockProducts.length > 0 ? "warning" : "success",
    },
  ];

  return (
    <DashboardCard title="Mağaza Durumu" action={<ListHeaderAction href="/admin/analizler" />}>
      <div className="divide-y divide-[rgba(231,234,240,0.82)]">
        {statusItems.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <p className="text-[13px] font-medium text-[var(--admin-text-secondary)]">{item.label}</p>
            <p
              className={cn(
                "text-sm font-semibold tracking-[-0.015em]",
                item.tone === "success" && "text-[var(--admin-success)]",
                item.tone === "warning" && "text-[var(--admin-warning)]",
                item.tone === "info" && "text-[var(--admin-info)]",
                item.tone === "neutral" && "text-[var(--admin-heading)]",
              )}
            >
              {item.value}
            </p>
          </div>
        ))}
      </div>
    </DashboardCard>
  );
}

function CustomerActivityCard({ activities }: { activities: DashboardCustomerActivity[] }) {
  return (
    <DashboardCard title="Müşteri Aktiviteleri" action={<ListHeaderAction href="/admin/musteriler" />}>
      {activities.length > 0 ? (
        <div className="divide-y divide-[rgba(231,234,240,0.88)]">
          {activities.map((activity) => (
            <Link
              key={activity.id}
              href={activity.href}
              className="flex items-start gap-3 py-3.5 first:pt-0 last:pb-0 active:opacity-80"
            >
              <div
                className={cn(
                  "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-[13px] font-semibold",
                  getActivityBadge(activity.type),
                )}
              >
                {getInitials(activity.customerName)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-[var(--admin-heading)]">
                      {activity.customerName}
                    </p>
                    <p className="mt-1 text-[13px] leading-5 text-[var(--admin-text-secondary)]">
                      {activity.summary}
                    </p>
                  </div>
                  <span className="whitespace-nowrap text-[12px] text-[var(--admin-text-muted)]">
                    {formatRelativeTime(activity.createdAt)}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-[18px] border border-dashed border-[var(--admin-border)] bg-[rgba(247,248,250,0.78)] px-5 py-10 text-center">
          <Activity className="mx-auto h-8 w-8 text-[var(--admin-text-muted)]" />
          <p className="mt-3 text-sm text-[var(--admin-text-secondary)]">
            Henüz müşteri aktivitesi görünmüyor.
          </p>
        </div>
      )}
    </DashboardCard>
  );
}

function InsightsStrip({ items }: { items: DashboardAnalysisSummaryItem[] }) {
  if (!items.length) {
    return null;
  }

  return (
    <section className="hidden overflow-hidden rounded-[12px] border border-[rgba(215,221,231,0.82)] bg-white/60 xl:grid xl:grid-cols-4">
      {items.map((item) => {
        const meta = getAnalysisMeta(item.key);
        const Icon = meta.icon as ComponentType<{ className?: string }>;
        const delta = formatDelta(item.change);

        return (
          <div key={item.key} className="border-r border-[rgba(226,231,238,0.82)] px-4 py-4 last:border-r-0">
            <div className="flex items-start justify-between gap-3">
              <span className={cn("flex h-10 w-10 items-center justify-center rounded-[14px]", meta.shell)}>
                <Icon className="h-4.5 w-4.5" />
              </span>
              <span
                className={cn(
                  "text-[11px] font-semibold",
                  delta.positive === null
                    ? "text-[var(--admin-text-secondary)]"
                    : delta.positive
                      ? "text-[var(--admin-success)]"
                      : "text-[var(--admin-danger)]",
                )}
              >
                {delta.compactLabel}
              </span>
            </div>
            <p className="mt-4 text-[12px] font-medium text-[var(--admin-text-secondary)]">
              {item.label}
            </p>
            <p className="mt-2 text-[1.25rem] font-semibold tracking-[-0.04em] text-[var(--admin-heading)]">
              {item.value.toLocaleString("tr-TR")}
            </p>
          </div>
        );
      })}
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4 md:space-y-5">
      <Skeleton className="h-[126px] rounded-[12px]" />
      <div className="grid grid-cols-1 gap-0 overflow-hidden rounded-[12px] border border-[rgba(215,221,231,0.82)] sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-[112px] rounded-none" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
        <div className="space-y-4">
          <Skeleton className="h-[330px] rounded-[12px]" />
          <Skeleton className="h-[260px] rounded-[12px]" />
          <Skeleton className="h-[260px] rounded-[12px]" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-[220px] rounded-[12px]" />
          <Skeleton className="h-[260px] rounded-[12px]" />
          <Skeleton className="h-[220px] rounded-[12px]" />
        </div>
      </div>
    </div>
  );
}

function DashboardContentSkeleton() {
  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
        <div className="space-y-4">
          <Skeleton className="h-[330px] rounded-[12px]" />
          <Skeleton className="h-[250px] rounded-[12px]" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-[220px] rounded-[12px]" />
          <Skeleton className="h-[260px] rounded-[12px]" />
          <Skeleton className="h-[220px] rounded-[12px]" />
        </div>
      </div>
      <div className="hidden overflow-hidden rounded-[12px] border border-[rgba(215,221,231,0.82)] xl:grid xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[124px] rounded-none" />
        ))}
      </div>
    </>
  );
}

export function DashboardHomeView({
  dashboard,
  selectedPeriod,
  onPeriodChange,
  isRefreshing,
  errorMessage,
}: {
  dashboard: DashboardBootstrapData | null;
  selectedPeriod: TimeRange;
  onPeriodChange: (value: TimeRange) => void;
  isRefreshing: boolean;
  errorMessage?: string;
}) {
  if (!dashboard) {
    return <DashboardSkeleton />;
  }

  return (
    <main
      role="main"
      aria-busy={isRefreshing}
      className="mx-auto max-w-[1560px] px-0 pb-4 md:pb-6"
    >
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="space-y-4 md:space-y-5"
      >
        <DashboardTopStrip
          dashboard={dashboard}
          selectedPeriod={selectedPeriod}
          onPeriodChange={onPeriodChange}
        />

        {errorMessage ? (
          <div className="flex items-start gap-3 rounded-[18px] border border-[rgba(239,68,68,0.18)] bg-[var(--admin-danger-soft)] px-4 py-3 text-sm text-[var(--admin-danger)]">
            <CircleAlert className="mt-0.5 h-4.5 w-4.5 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        ) : null}

        <KpiGrid dashboard={dashboard} isRefreshing={isRefreshing} />

        {isRefreshing ? (
          <DashboardContentSkeleton />
        ) : (
          <>
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
              <div className="grid gap-4">
                <RecentOrdersCard orders={dashboard.recentOrders} />
                <AbandonedCartsCard dashboard={dashboard} />
                <CustomerActivityCard activities={dashboard.customerActivities} />
                <SalesChartCard
                  points={dashboard.performance.chart}
                  currentLabel={dashboard.performance.currentLabel}
                  previousLabel={dashboard.performance.previousLabel}
                  currentRevenue={dashboard.performance.currentRevenue}
                  previousRevenue={dashboard.performance.previousRevenue}
                  currentOrders={dashboard.performance.currentOrders}
                />
              </div>
              <aside className="grid content-start gap-4">
                <StoreStatusCard dashboard={dashboard} />
                <LowStockProductsCard products={dashboard.lowStockProducts} />
                <TodoCard dashboard={dashboard} />
                <ToshiCard dashboard={dashboard} />
              </aside>
            </section>

            <InsightsStrip items={dashboard.analysisSummary.items} />
          </>
        )}
      </motion.div>
    </main>
  );
}
