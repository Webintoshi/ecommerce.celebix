"use client";

import type { ComponentType, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  CircleAlert,
  Package,
  Percent,
  ShoppingBag,
  Sparkles,
  Truck,
} from "lucide-react";
import { Line, LineChart, ResponsiveContainer, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
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
  "rounded-[24px] border border-[var(--admin-border)] bg-[var(--admin-surface)] shadow-[0_10px_22px_rgba(17,24,39,0.05)]";

const SUBTLE_SURFACE =
  "rounded-[18px] border border-[var(--admin-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,248,250,0.96)_100%)]";

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

function formatMetricValue(value: number, format: DashboardOverviewCard["format"]) {
  if (format === "currency") {
    return formatCurrency(value);
  }

  if (format === "percent") {
    return `%${value.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}`;
  }

  return value.toLocaleString("tr-TR");
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
  children,
}: {
  title: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn(SURFACE, "overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-3 px-4 pb-0 pt-4 md:px-5 md:pt-5">
        <h2 className="text-[1.05rem] font-semibold tracking-[-0.03em] text-[var(--admin-heading)]">
          {title}
        </h2>
        {action}
      </div>
      <div className="px-4 py-4 md:px-5 md:py-5">{children}</div>
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
    `${formatCurrency(revenueCard?.value ?? 0)} ciro`,
    `${pendingCard?.value.toLocaleString("tr-TR") ?? "0"} bekleyen`,
  ];

  return (
    <section className={cn(SURFACE, "px-4 py-4 md:px-5")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--admin-text-muted)]">
            {getPeriodLabel(selectedPeriod)} özeti
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <span
                key={chip}
                className="inline-flex min-h-[34px] items-center rounded-full border border-[var(--admin-border)] bg-[rgba(247,248,250,0.84)] px-3 py-1.5 text-[12px] font-medium text-[var(--admin-text-secondary)]"
              >
                {chip}
              </span>
            ))}
          </div>
        </div>

        <label className="inline-flex min-h-[48px] items-center gap-3 rounded-[16px] border border-[var(--admin-border)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--admin-heading)] shadow-[0_6px_18px_rgba(17,24,39,0.04)]">
          <CalendarDays className="h-4.5 w-4.5 text-[var(--admin-accent-hover)]" />
          <select
            value={selectedPeriod}
            onChange={(event) => onPeriodChange(event.target.value as TimeRange)}
            className="bg-transparent pr-4 text-sm font-medium outline-none"
            aria-label="Dashboard dönem seçici"
          >
            {PERIODS.map((period) => (
              <option key={period.value} value={period.value}>
                {period.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}

function KpiCard({ card }: { card: DashboardOverviewCard }) {
  const tone = KPI_TONES[card.tone];
  const delta = formatDelta(card.change);
  const DeltaIcon = delta.positive === false ? ArrowDownRight : ArrowUpRight;
  const Icon =
    card.key === "orders"
      ? ShoppingBag
      : card.key === "revenue"
        ? Activity
        : card.key === "conversion"
          ? Percent
          : Truck;

  return (
    <Link
      href={card.href}
      className={cn(
        SURFACE,
        "group flex min-h-[168px] flex-col p-4 transition-transform duration-200 active:scale-[0.985] md:min-h-[176px] md:p-5",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-[14px] border",
            tone.iconShell,
          )}
        >
          <Icon className="h-4.5 w-4.5" />
        </div>
        {card.trend.length > 1 ? (
          <div className="translate-x-1 translate-y-0.5 opacity-90">
            <MiniSparkline values={card.trend} color={tone.spark} />
          </div>
        ) : (
          <span className="text-[11px] font-medium text-[var(--admin-text-muted)]">Anlık takip</span>
        )}
      </div>

      <div className="mt-4">
        <p className="text-[13px] font-medium leading-5 text-[var(--admin-text-secondary)]">
          {card.label}
        </p>
        <p
          className={cn(
            "mt-2 text-[1.55rem] font-semibold tracking-[-0.05em] md:text-[1.72rem]",
            tone.valueClassName,
          )}
        >
          {formatMetricValue(card.value, card.format)}
        </p>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        <span
          className={cn(
            "inline-flex items-center gap-1 text-[12px] font-semibold",
            delta.positive === null
              ? "text-[var(--admin-text-secondary)]"
              : delta.positive
                ? "text-[var(--admin-success)]"
                : "text-[var(--admin-danger)]",
          )}
        >
          {delta.positive !== null ? <DeltaIcon className="h-3.5 w-3.5" /> : null}
          {delta.compactLabel}
        </span>
        <span className="text-[11px] text-[var(--admin-text-muted)]">
          {delta.positive === null
            ? "Önceki dönemle aynı"
            : delta.positive
              ? "Önceki döneme göre artış"
              : "Önceki döneme göre düşüş"}
        </span>
      </div>
    </Link>
  );
}

function KpiGrid({
  cards,
  isRefreshing,
}: {
  cards: DashboardOverviewCard[];
  isRefreshing: boolean;
}) {
  if (isRefreshing) {
    return (
      <section className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[168px] rounded-[24px]" />
        ))}
      </section>
    );
  }

  return (
    <section className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
      {cards.map((card) => (
        <KpiCard key={card.key} card={card} />
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
    <DashboardCard title="Toshi AI Asistan" className="h-full">
      <div className="flex h-full flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-full border border-[var(--admin-border)] bg-white shadow-[0_8px_18px_rgba(17,24,39,0.06)]">
            <Image src={TOSHI_MASCOT_SRC} alt="Toshi" fill className="object-contain p-1.5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--admin-heading)]">Öneriler ve hızlı aksiyonlar</p>
            <p className="mt-1 text-sm leading-6 text-[var(--admin-text-secondary)]">
              Mağazanız için kritik sinyalleri yorumlar, hızlı aksiyon yolları açarım.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => openToshi(highlight.prompt)}
          className="flex min-h-[72px] items-center justify-between gap-3 rounded-[18px] border border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] px-4 py-3 text-left transition-colors active:bg-[rgba(255,241,232,0.84)]"
        >
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[14px] bg-white text-[var(--admin-accent-hover)]">
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

        <div className="divide-y divide-[rgba(231,234,240,0.88)] rounded-[18px] border border-[var(--admin-border)] bg-white">
          {TOSHI_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => openToshi(prompt)}
              className="flex min-h-[54px] w-full items-center justify-between gap-3 px-4 py-3 text-left text-[14px] font-medium text-[var(--admin-heading)] transition-colors active:bg-[rgba(247,248,250,0.78)]"
            >
              <span className="min-w-0 truncate">{prompt}</span>
              <ChevronRight className="h-4.5 w-4.5 flex-shrink-0 text-[var(--admin-text-muted)]" />
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => openToshi()}
          className="mt-auto inline-flex min-h-[54px] items-center justify-center gap-2 rounded-[18px] bg-[var(--admin-accent)] px-4 py-3 text-sm font-semibold text-white shadow-[var(--shadow-md)] transition-transform active:scale-[0.985]"
        >
          <Sparkles className="h-4.5 w-4.5" />
          Toshi ile Sohbete Başla
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
    <section className="hidden gap-3 xl:grid xl:grid-cols-4">
      {items.map((item) => {
        const meta = getAnalysisMeta(item.key);
        const Icon = meta.icon as ComponentType<{ className?: string }>;
        const delta = formatDelta(item.change);

        return (
          <div key={item.key} className={cn(SUBTLE_SURFACE, "px-4 py-4")}>
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
      <Skeleton className="h-[86px] rounded-[24px]" />
      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[168px] rounded-[24px]" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)]">
        <Skeleton className="h-[420px] rounded-[24px]" />
        <Skeleton className="h-[420px] rounded-[24px]" />
      </div>
      <div className="grid gap-4">
        <Skeleton className="h-[330px] rounded-[24px]" />
        <Skeleton className="h-[280px] rounded-[24px]" />
        <Skeleton className="h-[280px] rounded-[24px]" />
      </div>
    </div>
  );
}

function DashboardContentSkeleton() {
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)]">
        <Skeleton className="h-[420px] rounded-[24px]" />
        <Skeleton className="h-[420px] rounded-[24px]" />
      </div>
      <div className="hidden gap-3 xl:grid xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[132px] rounded-[18px]" />
        ))}
      </div>
      <div className="grid gap-4">
        <Skeleton className="h-[330px] rounded-[24px]" />
        <Skeleton className="h-[280px] rounded-[24px]" />
        <Skeleton className="h-[280px] rounded-[24px]" />
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
      className="mx-auto max-w-[1560px] px-3 py-4 md:px-5 md:py-6 lg:px-8"
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

        <KpiGrid cards={dashboard.overview.cards} isRefreshing={isRefreshing} />

        {isRefreshing ? (
          <DashboardContentSkeleton />
        ) : (
          <>
            <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)]">
              <SalesChartCard
                points={dashboard.performance.chart}
                currentLabel={dashboard.performance.currentLabel}
                previousLabel={dashboard.performance.previousLabel}
                currentRevenue={dashboard.performance.currentRevenue}
                previousRevenue={dashboard.performance.previousRevenue}
                currentOrders={dashboard.performance.currentOrders}
              />
              <ToshiCard dashboard={dashboard} />
            </section>

            <InsightsStrip items={dashboard.analysisSummary.items} />

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <RecentOrdersCard orders={dashboard.recentOrders} />
              <LowStockProductsCard products={dashboard.lowStockProducts} />
            </section>

            <CustomerActivityCard activities={dashboard.customerActivities} />
          </>
        )}
      </motion.div>
    </main>
  );
}
