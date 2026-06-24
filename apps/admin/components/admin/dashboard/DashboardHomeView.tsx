"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  Activity,
  Archive,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Globe2,
  ListChecks,
  Package,
  ShoppingBag,
  Sparkles,
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

const SURFACE =
  "rounded-[12px] border border-[rgba(215,221,231,0.82)] bg-[rgba(255,255,255,0.86)] shadow-none";

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
      "border-[rgba(255,106,0,0.18)] bg-[var(--admin-accent-soft)] text-[var(--admin-accent-hover)]",
    spark: "#FF6A00",
    valueClassName: "text-[var(--admin-heading)]",
  },
  amber: {
    iconShell:
      "border-[rgba(255,106,0,0.16)] bg-[rgba(255,241,232,0.92)] text-[var(--admin-accent-hover)]",
    spark: "#FF9F0A",
    valueClassName: "text-[var(--admin-heading)]",
  },
};

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

function formatPercentValue(value: number) {
  return `%${value.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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

function getAnalyticsPeriodLabel(value: TimeRange) {
  switch (value) {
    case "today":
      return "Bugün";
    case "week":
      return "Son 7 Gün";
    case "month":
      return "Bu Ay";
    case "quarter":
      return "Son 90 Gün";
    default:
      return getPeriodLabel(value);
  }
}

function getOverviewCard(
  cards: DashboardOverviewCard[],
  key: DashboardOverviewCard["key"],
) {
  return cards.find((card) => card.key === key) ?? null;
}

function getAnalysisItem(
  items: DashboardAnalysisSummaryItem[],
  key: DashboardAnalysisSummaryItem["key"],
) {
  return items.find((item) => item.key === key) ?? null;
}

function getStorefrontDisplayHost() {
  const domain = STORE_RUNTIME.storefrontDomain?.trim();

  if (domain && !domain.includes("localhost")) {
    return domain;
  }

  try {
    return new URL(STORE_RUNTIME.storefrontUrl).hostname;
  } catch {
    return STORE_RUNTIME.storefrontUrl.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  }
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

function DashboardActionRail({
  selectedPeriod,
  onPeriodChange,
  placement = "topbar",
}: {
  selectedPeriod: TimeRange;
  onPeriodChange: (value: TimeRange) => void;
  placement?: "topbar" | "mobile";
}) {
  const compact = placement === "mobile";

  return (
    <div
      aria-label="Panel filtreleri"
      className={cn(
        "min-w-0 bg-white",
        compact
          ? "sticky top-[max(0.45rem,env(safe-area-inset-top))] z-20 mb-3 rounded-[18px] border border-[var(--admin-border)] p-3 shadow-[var(--shadow-xs)] backdrop-blur-xl min-[1025px]:hidden"
          : "w-full border-b border-[rgba(226,231,238,0.92)] py-3",
      )}
    >
      <div
        className={cn(
          "mx-auto flex min-w-0 items-center gap-2",
          compact ? "flex-wrap" : "max-w-[1560px] justify-between",
        )}
      >
        <div
          className={cn(
            "flex min-w-0 flex-wrap items-center gap-2",
            compact ? "w-full" : "flex-1",
          )}
        >
          <label className="relative inline-flex min-h-[42px] flex-1 items-center gap-2 rounded-[7px] border border-[rgba(215,221,231,0.9)] bg-white px-3.5 py-1.5 text-[14px] font-semibold text-[var(--admin-heading)] shadow-[0_1px_2px_rgba(17,24,39,0.03)] sm:flex-none">
            <ShoppingBag className="h-4.5 w-4.5 text-[var(--admin-text-muted)]" />
            <span className="sr-only">Satış kanalı</span>
            <select
              className="min-w-0 appearance-none bg-transparent pr-8 text-[14px] font-semibold outline-none"
              aria-label="Satış kanalı seçici"
              defaultValue="all"
            >
              <option value="all">Tüm Satış Kanalları</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-[var(--admin-text-muted)]" />
          </label>
          <label className="relative inline-flex min-h-[42px] flex-1 items-center gap-2 rounded-[7px] border border-[rgba(215,221,231,0.9)] bg-white px-3.5 py-1.5 text-[14px] font-semibold text-[var(--admin-heading)] shadow-[0_1px_2px_rgba(17,24,39,0.03)] sm:flex-none">
            <CalendarDays className="h-4 w-4 text-[var(--admin-accent-hover)]" />
            <span className="sr-only">{getAnalyticsPeriodLabel(selectedPeriod)} özeti</span>
            <select
              value={selectedPeriod}
              onChange={(event) => onPeriodChange(event.target.value as TimeRange)}
              className="min-w-0 appearance-none bg-transparent pr-8 text-[14px] font-semibold outline-none"
              aria-label="Panel dönem seçici"
            >
              {PERIODS.map((period) => (
                <option key={period.value} value={period.value}>
                  {getAnalyticsPeriodLabel(period.value)}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-[var(--admin-text-muted)]" />
          </label>
          <span className="inline-flex min-h-[42px] flex-1 items-center gap-2 rounded-[7px] px-2 text-[14px] font-semibold text-[var(--admin-text-secondary)] sm:flex-none">
            <ArrowDownRight className="h-4.5 w-4.5 rotate-45 text-[var(--admin-text-muted)]" />
            Önceki döneme göre
          </span>
        </div>
        <div
          className={cn(
            "flex min-w-0 items-center gap-2",
            compact ? "w-full justify-end" : "shrink-0 justify-end",
          )}
        >
          <span className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-[7px] border border-[rgba(215,221,231,0.9)] bg-white text-[var(--admin-text-secondary)] shadow-[0_1px_2px_rgba(17,24,39,0.03)]">
            <ListChecks className="h-5 w-5" />
          </span>
          <span className="inline-flex min-h-[42px] items-center gap-3 rounded-[7px] border border-[rgba(215,221,231,0.9)] bg-white px-3.5 text-[14px] font-semibold text-[var(--admin-heading)] shadow-[0_1px_2px_rgba(17,24,39,0.03)]">
            <span className="relative inline-flex h-5 w-5 items-center justify-center rounded-full bg-[rgba(226,231,238,0.82)]">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--admin-text-muted)]" />
            </span>
            Ziyaretçi Yok
            <ArrowRight className="h-4.5 w-4.5 text-[var(--admin-text-muted)]" />
          </span>
        </div>
      </div>
    </div>
  );
}

function DashboardTopbarActionsPortal({
  selectedPeriod,
  onPeriodChange,
}: {
  selectedPeriod: TimeRange;
  onPeriodChange: (value: TimeRange) => void;
}) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    let animationFrame = 0;

    const syncTarget = () => {
      const nextTarget = document.getElementById("admin-dashboard-topbar-actions");
      setTarget((currentTarget) => (currentTarget === nextTarget ? currentTarget : nextTarget));
    };

    syncTarget();
    animationFrame = window.requestAnimationFrame(syncTarget);

    const observer = new MutationObserver(syncTarget);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, []);

  return (
    <>
      {target
        ? createPortal(
            <DashboardActionRail
              selectedPeriod={selectedPeriod}
              onPeriodChange={onPeriodChange}
            />,
            target,
          )
        : null}
      <DashboardActionRail
        selectedPeriod={selectedPeriod}
        onPeriodChange={onPeriodChange}
        placement="mobile"
      />
    </>
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
      label: "Toplam Satış",
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
      label: "Sipariş sayısı",
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
        "group flex min-h-[94px] flex-col border-b border-r border-[rgba(226,231,238,0.82)] bg-white/48 p-3.5 transition-colors hover:bg-white/82 active:bg-white md:p-4",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-[10px] border",
            tone.iconShell,
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        {metric.trend && metric.trend.length > 1 ? (
          <div className="hidden translate-x-1 opacity-90 md:block">
            <MiniSparkline values={metric.trend} color={tone.spark} />
          </div>
        ) : (
          <span className="rounded-full bg-[var(--admin-muted-surface)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--admin-text-muted)]">
            Anlık
          </span>
        )}
      </div>

      <div className="mt-3">
        <p className="truncate text-[12px] font-semibold leading-5 text-[var(--admin-text-secondary)]">
          {metric.label}
        </p>
        <p
          className={cn(
            "mt-0.5 truncate text-[1.28rem] font-semibold tracking-[-0.045em] md:text-[1.38rem]",
            tone.valueClassName,
          )}
        >
          {metric.value}
        </p>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-2">
        {metric.delta ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[11.5px] font-semibold",
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
      <section className="grid min-w-0 grid-cols-1 gap-0 overflow-hidden rounded-[12px] border border-[rgba(215,221,231,0.82)] bg-white/66 sm:grid-cols-2 lg:grid-cols-3 min-[1360px]:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-[96px] rounded-none" />
        ))}
      </section>
    );
  }

  const metrics = buildDashboardMetrics(dashboard);

  return (
    <section className="grid min-w-0 grid-cols-1 gap-0 overflow-hidden rounded-[12px] border border-[rgba(215,221,231,0.82)] bg-white/66 sm:grid-cols-2 lg:grid-cols-3 min-[1360px]:grid-cols-5">
      {metrics.map((metric) => (
        <KpiCard key={metric.key} metric={metric} />
      ))}
    </section>
  );
}

function SalesChartCard({ dashboard }: { dashboard: DashboardBootstrapData }) {
  const points = dashboard.performance.chart;
  const currentLabel = dashboard.performance.currentLabel;
  const previousLabel = dashboard.performance.previousLabel;
  const currentRevenue = dashboard.performance.currentRevenue;
  const previousRevenue = dashboard.performance.previousRevenue;
  const currentOrders = dashboard.performance.currentOrders;
  const previousOrders = dashboard.performance.previousOrders;
  const conversionCard = getOverviewCard(dashboard.overview.cards, "conversion");
  const visitorsItem = getAnalysisItem(dashboard.analysisSummary.items, "visitors");
  const chartPoints =
    points.length > 0
      ? points
      : ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].map((label) => ({
          label,
          currentRevenue: 0,
          previousRevenue: 0,
          currentOrders: 0,
          previousOrders: 0,
        }));
  const revenueDelta = formatDelta(
    previousRevenue === 0 ? 0 : ((currentRevenue - previousRevenue) / previousRevenue) * 100,
  );
  const ordersDelta = formatDelta(
    previousOrders === 0 ? 0 : ((currentOrders - previousOrders) / previousOrders) * 100,
  );
  const visitorDelta = formatDelta(visitorsItem?.change ?? 0);
  const conversionDelta = formatDelta(conversionCard?.change ?? 0);
  const visitors = visitorsItem?.value ?? dashboard.liveData.liveVisitors;
  const hasSalesData = chartPoints.some((point) => point.currentRevenue > 0 || point.currentOrders > 0);
  const metrics = [
    {
      label: "Toplam Satış",
      value: formatCurrency(currentRevenue),
      delta: revenueDelta,
      active: true,
    },
    {
      label: "Sipariş Sayısı",
      value: currentOrders.toLocaleString("tr-TR"),
      delta: ordersDelta,
    },
    {
      label: "Oturum Sayısı",
      value: visitors.toLocaleString("tr-TR"),
      delta: visitorDelta,
    },
    {
      label: "Dönüşüm Oranı",
      value: formatPercentValue(conversionCard?.value ?? 0),
      delta: conversionDelta,
    },
    {
      label: "İadeler",
      value: formatCurrency(0),
      delta: formatDelta(0),
    },
  ];

  return (
    <section className="overflow-hidden rounded-[8px] border border-[rgba(218,224,233,0.9)] bg-[var(--admin-bg)] shadow-none">
      <div className="overflow-x-auto">
        <div className="grid min-w-[850px] grid-cols-5 divide-x divide-[rgba(218,224,233,0.92)] bg-[rgba(246,247,249,0.92)] min-[1180px]:min-w-0">
          {metrics.map((metric) => {
            const MetricDeltaIcon = metric.delta.positive === false ? ArrowDownRight : ArrowUpRight;
            const isReturnsMetric = metric.label === "İadeler";

            return (
              <div key={metric.label} className="relative min-h-[82px] px-4 py-4 min-[1180px]:px-5">
                {metric.active ? (
                  <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-[var(--admin-accent)]" />
                ) : null}
                <div className="flex h-full min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold tracking-[-0.015em] text-[var(--admin-text-secondary)] min-[1180px]:text-[15px]">
                      {metric.label}
                    </p>
                    <div className="mt-2 flex min-w-0 items-center gap-2">
                      <p className="truncate text-[1.45rem] font-semibold tracking-[-0.055em] text-[var(--admin-heading)] min-[1180px]:text-[1.58rem]">
                        {metric.value}
                      </p>
                      <span
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1 rounded-[4px] bg-[rgba(255,255,255,0.55)] px-2 py-1 text-[12px] font-semibold",
                          metric.delta.positive === null
                            ? "text-[var(--admin-text-secondary)]"
                            : metric.delta.positive
                              ? "text-[var(--admin-success)]"
                              : "text-[var(--admin-danger)]",
                        )}
                      >
                        {metric.delta.positive !== null ? <MetricDeltaIcon className="h-3.5 w-3.5" /> : null}
                        {metric.delta.positive === null ? formatPercentValue(0) : metric.delta.compactLabel}
                      </span>
                    </div>
                  </div>
                  {isReturnsMetric ? (
                    <span
                      aria-hidden="true"
                      className="-mr-0.5 mt-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[rgba(218,224,233,0.95)] bg-[rgba(255,255,255,0.58)] text-[var(--admin-text-secondary)]"
                    >
                      <ArrowRight className="h-4.5 w-4.5" />
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="relative border-t border-[rgba(226,231,238,0.92)] bg-[var(--admin-bg)] px-4 pb-5 pt-4 md:px-6 md:pb-6">
        <div className="mb-3 flex items-center justify-between gap-3 text-[12px] font-medium text-[var(--admin-text-secondary)]">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[var(--admin-accent)]" />
            {currentLabel}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[rgba(148,163,184,0.76)]" />
            {previousLabel}
          </span>
        </div>
        <div className="relative h-[360px] min-h-[360px] md:h-[430px] min-[1360px]:h-[520px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartPoints} margin={{ top: 14, right: 18, left: 0, bottom: 10 }}>
              <CartesianGrid stroke="rgba(226,231,238,0.95)" vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#7B8494", fontSize: 12, fontWeight: 600 }}
                dy={10}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#7B8494", fontSize: 12, fontWeight: 600 }}
                tickFormatter={(value) => `${formatCompactValue(Number(value))} ₺`}
                width={58}
              />
              <Tooltip
                cursor={{ stroke: "#DCE2EA", strokeWidth: 1.2 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) {
                    return null;
                  }

                  const point = payload[0]?.payload as DashboardPerformancePoint;

                  return (
                    <div className="rounded-[10px] border border-[var(--admin-border)] bg-white px-3.5 py-3 shadow-[var(--shadow-md)]">
                      <p className="text-sm font-semibold text-[var(--admin-heading)]">{label}</p>
                      <div className="mt-3 space-y-2 text-sm text-[var(--admin-text-secondary)]">
                        <div className="flex items-center justify-between gap-6">
                          <span>{currentLabel}</span>
                          <span className="font-semibold text-[var(--admin-heading)]">
                            {formatCurrency(point.currentRevenue)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-6">
                          <span>{previousLabel}</span>
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
                stroke="rgba(148,163,184,0.5)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3, fill: "#94A3B8" }}
              />
              <Line
                type="monotone"
                dataKey="currentRevenue"
                stroke="#FF6A00"
                strokeWidth={3.2}
                dot={false}
                activeDot={{ r: 4, fill: "#FF6A00" }}
              />
            </LineChart>
          </ResponsiveContainer>
          {!hasSalesData ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center">
              <span className="rounded-[7px] border border-[var(--admin-border)] bg-white/92 px-3 py-2 text-[12px] font-semibold text-[var(--admin-text-secondary)] shadow-[var(--shadow-xs)]">
                Bu dönem için satış verisi yok.
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function SalesChannelsOverview({ dashboard }: { dashboard: DashboardBootstrapData }) {
  const revenueDelta = formatDelta(
    dashboard.performance.previousRevenue === 0
      ? 0
      : ((dashboard.performance.currentRevenue - dashboard.performance.previousRevenue) /
          dashboard.performance.previousRevenue) *
          100,
  );
  const channels = [
    {
      label: getStorefrontDisplayHost(),
      value: formatCurrency(dashboard.performance.currentRevenue),
      delta: revenueDelta,
      icon: Globe2,
    },
    {
      label: "Pazaryeri",
      value: formatCurrency(0),
      delta: formatDelta(0),
      icon: ShoppingBag,
    },
    {
      label: "Manuel Sipariş",
      value: formatCurrency(0),
      delta: formatDelta(0),
      icon: Users,
    },
  ];

  return (
    <section className="rounded-[8px] border border-[rgba(226,231,238,0.9)] bg-[rgba(248,250,252,0.58)] px-3 py-3 md:px-4 md:py-4">
      <div className="grid gap-3 md:grid-cols-3">
        {channels.map((channel) => {
          const ChannelIcon = channel.icon;

          return (
            <div
              key={channel.label}
              className="min-h-[126px] rounded-[7px] border border-[rgba(226,231,238,0.92)] bg-white px-5 py-4 shadow-[0_1px_2px_rgba(17,24,39,0.02)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[7px] border border-[rgba(226,231,238,0.92)] bg-white text-[var(--admin-text-secondary)]">
                    <ChannelIcon className="h-5 w-5" />
                  </span>
                  <p className="truncate text-[15px] font-semibold text-[var(--admin-text-secondary)]">
                    {channel.label}
                  </p>
                </div>
                <span className="rounded-[4px] bg-[rgba(248,250,252,0.94)] px-2 py-1 text-[12px] font-semibold text-[var(--admin-text-secondary)]">
                  {channel.delta.positive === null ? formatPercentValue(0) : channel.delta.compactLabel}
                </span>
              </div>
              <p className="mt-5 text-[1.55rem] font-semibold tracking-[-0.055em] text-[var(--admin-heading)]">
                {channel.value}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function BestSellersPanel({ dashboard }: { dashboard: DashboardBootstrapData }) {
  const hasOrders = dashboard.performance.currentOrders > 0 && dashboard.recentOrders.length > 0;

  return (
    <section className="min-h-[420px] rounded-[8px] border border-[rgba(226,231,238,0.9)] bg-white px-5 py-5 md:px-8 md:py-7">
      <div className="flex items-center justify-between gap-3 border-b border-[rgba(226,231,238,0.92)] pb-5">
        <h2 className="text-[1.15rem] font-semibold tracking-[-0.035em] text-[var(--admin-heading)]">
          En Çok Satanlar
        </h2>
        <button
          type="button"
          className="inline-flex min-h-[40px] items-center gap-2 rounded-[7px] border border-[rgba(215,221,231,0.92)] bg-white px-3.5 text-[14px] font-semibold text-[var(--admin-heading)] shadow-[0_1px_2px_rgba(17,24,39,0.03)]"
        >
          Ürünler
          <ChevronDown className="h-4 w-4 text-[var(--admin-text-muted)]" />
        </button>
      </div>

      {hasOrders ? (
        <div className="divide-y divide-[rgba(226,231,238,0.86)]">
          {dashboard.recentOrders.slice(0, 5).map((order) => (
            <Link
              key={order.id}
              href={`/admin/siparisler/${order.id}`}
              className="flex items-center justify-between gap-4 py-4"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--admin-heading)]">
                  Sipariş #{order.orderNumber}
                </p>
                <p className="mt-1 truncate text-[12px] text-[var(--admin-text-secondary)]">
                  {formatOrderMeta(order.createdAt)}
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold text-[var(--admin-heading)]">
                {formatCurrency(order.total)}
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex min-h-[330px] flex-col items-center justify-center text-center">
          <div className="relative h-[104px] w-[156px]">
            <span className="absolute left-8 top-7 h-12 w-12 rounded-[8px] bg-[rgba(255,106,0,0.08)]" />
            <span className="absolute left-16 top-12 h-12 w-20 rounded-[8px] border border-[rgba(226,231,238,0.82)] bg-white shadow-[0_12px_28px_rgba(17,24,39,0.08)]" />
            <span className="absolute left-2 top-3 h-12 w-[126px] rounded-[8px] border border-[rgba(226,231,238,0.78)] bg-white shadow-[0_10px_22px_rgba(17,24,39,0.06)]" />
            <span className="absolute left-5 top-7 h-8 w-8 rounded-[6px] bg-[rgba(255,106,0,0.08)]" />
            <span className="absolute left-16 top-8 h-2 w-[70px] rounded-full bg-[rgba(226,231,238,0.92)]" />
            <span className="absolute left-16 top-12 h-2 w-[50px] rounded-full bg-[rgba(226,231,238,0.92)]" />
          </div>
          <p className="mt-4 text-[1.05rem] font-semibold tracking-[-0.025em] text-[var(--admin-heading)]">
            Seçilen tarihte henüz satışınız bulunmamaktadır
          </p>
          <p className="mt-3 max-w-[30rem] text-sm leading-6 text-[var(--admin-text-secondary)]">
            Çok satanlar listesini görebilmek için lütfen farklı bir tarih seçiniz.
          </p>
        </div>
      )}
    </section>
  );
}

function GrowthMetricsPanel({ dashboard }: { dashboard: DashboardBootstrapData }) {
  const addToCart = dashboard.liveData.today.addToCart;
  const purchases = dashboard.liveData.today.purchases;
  const averageOrderValue =
    dashboard.performance.currentOrders > 0
      ? dashboard.performance.currentRevenue / dashboard.performance.currentOrders
      : 0;
  const averageProductRevenue =
    dashboard.stats.totalProducts > 0 ? dashboard.stats.totalRevenue / dashboard.stats.totalProducts : 0;
  const averageCartSize = purchases > 0 ? addToCart / purchases : 0;
  const rows = [
    {
      label: "Ort. İade Oranı",
      value: formatPercentValue(0),
      delta: formatDelta(0),
    },
    {
      label: "Ort. Ürün Fiyatı",
      value: formatCurrency(averageProductRevenue),
      delta: formatDelta(0),
    },
    {
      label: "Ort. Sipariş Tutarı",
      value: formatCurrency(averageOrderValue),
      delta: formatDelta(0),
    },
    {
      label: "Ort. Sepet Büyüklüğü",
      value: averageCartSize.toLocaleString("tr-TR", {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      }),
      delta: formatDelta(0),
    },
  ];

  return (
    <section className="rounded-[8px] border border-[rgba(226,231,238,0.9)] bg-white px-5 py-5 md:px-8 md:py-7">
      <h2 className="border-b border-[rgba(226,231,238,0.92)] pb-5 text-[1.15rem] font-semibold tracking-[-0.035em] text-[var(--admin-heading)]">
        Büyüme Metrikleri
      </h2>
      <div className="divide-y divide-[rgba(226,231,238,0.86)]">
        {rows.map((row) => (
          <div key={row.label} className="py-6">
            <div className="flex items-start justify-between gap-4">
              <p className="text-[15px] font-semibold text-[var(--admin-text-secondary)]">{row.label}</p>
              <span className="rounded-[4px] bg-[rgba(248,250,252,0.94)] px-2 py-1 text-[12px] font-semibold text-[var(--admin-text-secondary)]">
                {row.delta.positive === null ? formatPercentValue(0) : row.delta.compactLabel}
              </span>
            </div>
            <p className="mt-4 text-[1.6rem] font-semibold tracking-[-0.055em] text-[var(--admin-heading)]">
              {row.value}
            </p>
          </div>
        ))}
      </div>
    </section>
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
          <p className="mt-3 text-sm text-[var(--admin-text-secondary)]">Henüz sipariş yok.</p>
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
          <p className="mt-3 text-sm text-[var(--admin-text-secondary)]">Kritik stok yok.</p>
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
          <p className="text-[13px] font-medium text-[var(--admin-text-secondary)]">Terk sepet</p>
          <p className="mt-2 text-[2rem] font-semibold tracking-[-0.055em] text-[var(--admin-heading)]">
            {count.toLocaleString("tr-TR")}
          </p>
          <p className="mt-1 text-sm text-[var(--admin-text-secondary)]">
            {count > 0 ? `${formatCurrency(total)} potansiyel` : "Terk sepet yok."}
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
      description: `${pendingOrders.toLocaleString("tr-TR")} bekleyen`,
      href: "/admin/siparisler",
      active: pendingOrders > 0,
      icon: ShoppingBag,
    },
    {
      title: "Düşük stok uyarılarını kapat",
      description: `${lowStockCount.toLocaleString("tr-TR")} ürün`,
      href: "/admin/urunler",
      active: lowStockCount > 0,
      icon: Package,
    },
    {
      title: "Terk sepet fırsatlarını incele",
      description: `${abandonedCount.toLocaleString("tr-TR")} sepet`,
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
          <p className="mt-3 text-sm text-[var(--admin-text-secondary)]">Aktivite yok.</p>
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
    <div className="space-y-5">
      <Skeleton className="h-[540px] rounded-[8px]" />
      <Skeleton className="h-[160px] rounded-[8px]" />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.48fr)]">
        <Skeleton className="h-[430px] rounded-[8px]" />
        <Skeleton className="h-[430px] rounded-[8px]" />
      </div>
    </div>
  );
}

function DashboardContentSkeleton() {
  return (
    <>
      <Skeleton className="h-[540px] rounded-[8px]" />
      <Skeleton className="h-[160px] rounded-[8px]" />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.48fr)]">
        <Skeleton className="h-[430px] rounded-[8px]" />
        <Skeleton className="h-[430px] rounded-[8px]" />
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
    return (
      <>
        <DashboardTopbarActionsPortal
          selectedPeriod={selectedPeriod}
          onPeriodChange={onPeriodChange}
        />
        <DashboardSkeleton />
      </>
    );
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
        <DashboardTopbarActionsPortal
          selectedPeriod={selectedPeriod}
          onPeriodChange={onPeriodChange}
        />

        {errorMessage ? (
          <div className="flex items-start gap-3 rounded-[18px] border border-[rgba(239,68,68,0.18)] bg-[var(--admin-danger-soft)] px-4 py-3 text-sm text-[var(--admin-danger)]">
            <CircleAlert className="mt-0.5 h-4.5 w-4.5 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        ) : null}

        {isRefreshing ? (
          <DashboardContentSkeleton />
        ) : (
          <>
            <SalesChartCard dashboard={dashboard} />
            <SalesChannelsOverview dashboard={dashboard} />
            <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.48fr)]">
              <BestSellersPanel dashboard={dashboard} />
              <GrowthMetricsPanel dashboard={dashboard} />
            </section>
          </>
        )}
      </motion.div>
    </main>
  );
}
