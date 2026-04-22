"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CircleAlert,
  Eye,
  MessageSquare,
  Package,
  Percent,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Truck,
  Users,
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
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type DashboardAnalysisSummaryItem,
  type DashboardBootstrapData,
  type DashboardCustomerActivity,
  type DashboardLowStockProduct,
  type DashboardOverviewCard,
  type DashboardPerformancePoint,
  type DashboardRecentOrder,
} from "@/lib/admin-data-types";
import { fetchAdminJson } from "@/lib/admin-client-fetch";
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
  "Stokta azalan ürünleri göster",
  "Kampanya performansını analiz et",
  "Bugünkü siparişleri özetle",
  "En çok satan ürünleri çıkar",
];

const CARD_STYLES = {
  surface:
    "rounded-[28px] border border-[#ecdacb] bg-white shadow-[0_14px_34px_rgba(65,40,16,0.06)]",
  muted:
    "rounded-[24px] border border-[#efe0d2] bg-[linear-gradient(180deg,#fffcf9_0%,#fff8f2_100%)] shadow-[0_12px_26px_rgba(111,84,54,0.06)]",
} as const;

const KPI_TONE_CLASSES: Record<
  DashboardOverviewCard["tone"],
  { icon: string; accent: string; spark: string; delta: string }
> = {
  orange: {
    icon: "border-[#ffd9bd] bg-[#fff3e8] text-[#e26a1a]",
    accent: "from-[#fff4ea] to-white",
    spark: "#ff7a1a",
    delta: "text-[#d65d09]",
  },
  emerald: {
    icon: "border-emerald-200 bg-emerald-50 text-emerald-700",
    accent: "from-emerald-50 to-white",
    spark: "#22c55e",
    delta: "text-emerald-700",
  },
  violet: {
    icon: "border-violet-200 bg-violet-50 text-violet-700",
    accent: "from-violet-50 to-white",
    spark: "#6d5dfc",
    delta: "text-violet-700",
  },
  amber: {
    icon: "border-amber-200 bg-amber-50 text-amber-700",
    accent: "from-amber-50 to-white",
    spark: "#f59e0b",
    delta: "text-amber-700",
  },
};

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
    return `${(value / 1_000_000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} Mn`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} B`;
  }

  return value.toLocaleString("tr-TR");
}

function formatDelta(change: number) {
  if (change === 0) {
    return { label: "Şimdi", positive: true };
  }

  const rounded = Number.isInteger(change)
    ? change.toString()
    : change.toLocaleString("tr-TR", { maximumFractionDigits: 1 });

  return {
    label: `%${rounded}`,
    positive: change >= 0,
  };
}

function formatActivityTime(dateString: string) {
  const timestamp = new Date(dateString).getTime();
  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(0, Math.floor(diffMs / (60 * 1000)));

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

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "TS";
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function getOrderStatusMeta(status: string) {
  const statusMap: Record<string, { label: string; className: string }> = {
    pending: {
      label: "Beklemede",
      className: "border-slate-200 bg-slate-100 text-slate-700",
    },
    processing: {
      label: "Hazırlanıyor",
      className: "border-amber-200 bg-amber-100 text-amber-700",
    },
    shipped: {
      label: "Kargoda",
      className: "border-sky-200 bg-sky-100 text-sky-700",
    },
    delivered: {
      label: "Teslim Edildi",
      className: "border-emerald-200 bg-emerald-100 text-emerald-700",
    },
    cancelled: {
      label: "İptal Edildi",
      className: "border-rose-200 bg-rose-100 text-rose-700",
    },
  };

  return (
    statusMap[status] || {
      label: status,
      className: "border-slate-200 bg-slate-100 text-slate-700",
    }
  );
}

function getAnalysisMeta(key: DashboardAnalysisSummaryItem["key"]) {
  switch (key) {
    case "visitors":
      return {
        icon: Users,
        shell: "border-violet-200 bg-violet-50 text-violet-700",
      };
    case "pageViews":
      return {
        icon: Eye,
        shell: "border-sky-200 bg-sky-50 text-sky-700",
      };
    case "addToCart":
      return {
        icon: ShoppingCart,
        shell: "border-amber-200 bg-amber-50 text-amber-700",
      };
    case "purchases":
      return {
        icon: ShoppingBag,
        shell: "border-[#ffd7ba] bg-[#fff3e8] text-[#d65d09]",
      };
    default:
      return {
        icon: Activity,
        shell: "border-slate-200 bg-slate-50 text-slate-700",
      };
  }
}

function getActivityMeta(type: DashboardCustomerActivity["type"]) {
  switch (type) {
    case "order":
      return {
        badge: "bg-[#ffe3ce] text-[#cf5f11]",
      };
    case "review":
      return {
        badge: "bg-violet-100 text-violet-700",
      };
    case "customer":
      return {
        badge: "bg-emerald-100 text-emerald-700",
      };
    default:
      return {
        badge: "bg-slate-100 text-slate-700",
      };
  }
}

function openToshi(prompt?: string) {
  window.dispatchEvent(
    new CustomEvent("celebix:toshi-open", {
      detail: prompt ? { prompt } : undefined,
    }),
  );
}

function MiniSparkline({
  values,
  color,
}: {
  values: number[];
  color: string;
}) {
  const points = useMemo(() => {
    if (!values || values.length < 2) return "";

    const width = 92;
    const height = 36;
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;

    return values
      .map((value, index) => {
        const x = (index / (values.length - 1)) * width;
        const y = height - ((value - min) / range) * (height - 4) - 2;
        return `${x},${y}`;
      })
      .join(" ");
  }, [values]);

  if (!points) {
    return null;
  }

  return (
    <svg viewBox="0 0 92 36" className="h-9 w-[92px]" aria-hidden="true">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

function DashboardCard({
  title,
  description,
  action,
  className,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn(CARD_STYLES.surface, className)}>
      <div className="flex items-start justify-between gap-4 border-b border-[#f0e2d5] px-5 py-5 md:px-6">
        <div>
          <h2 className="text-[1.08rem] font-semibold tracking-[-0.03em] text-[#20150e]">{title}</h2>
          {description ? <p className="mt-1 text-sm text-[#7d6758]">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="px-5 py-5 md:px-6 md:py-6">{children}</div>
    </section>
  );
}

function DashboardHeader({
  selectedPeriod,
  onPeriodChange,
}: {
  selectedPeriod: TimeRange;
  onPeriodChange: (value: TimeRange) => void;
}) {
  return (
    <section className={cn(CARD_STYLES.surface, "px-5 py-5 md:px-6 md:py-6")}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-[2rem] font-semibold tracking-[-0.06em] text-[#17110d] md:text-[2.2rem]">
            Genel Bakış
          </h1>
          <p className="mt-2 max-w-2xl text-[0.98rem] text-[#756455]">
            Mağazanızın performansına genel bir bakış. Trendleri, riskleri ve operasyonel akışı tek
            ekranda izleyin.
          </p>
        </div>

        <label className="inline-flex min-h-[54px] items-center gap-3 rounded-[20px] border border-[#eadccd] bg-[#fffdfa] px-4 py-3 text-sm font-medium text-[#3d2d20] shadow-[0_8px_22px_rgba(70,44,18,0.05)]">
          <CalendarDays className="h-4.5 w-4.5 text-[#c96b21]" />
          <select
            value={selectedPeriod}
            onChange={(event) => onPeriodChange(event.target.value as TimeRange)}
            className="bg-transparent pr-2 text-sm font-medium outline-none"
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
  const tone = KPI_TONE_CLASSES[card.tone];
  const delta = formatDelta(card.change);
  const DeltaIcon = delta.positive ? ArrowUpRight : ArrowDownRight;
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
        CARD_STYLES.surface,
        "group block overflow-hidden bg-[linear-gradient(180deg,#fffdfa_0%,#fff8f2_100%)] p-5 transition-transform duration-200 hover:-translate-y-0.5",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className={cn("flex h-12 w-12 items-center justify-center rounded-[18px] border", tone.icon)}>
            <Icon className="h-5 w-5" />
          </div>
          <p className="mt-4 text-sm font-medium text-[#7a6656]">{card.label}</p>
          <p className="mt-2 text-[1.8rem] font-semibold tracking-[-0.05em] text-[#1c140e]">
            {formatMetricValue(card.value, card.format)}
          </p>
        </div>

        <div className="flex flex-col items-end gap-3">
          {card.trend.length > 1 ? <MiniSparkline values={card.trend} color={tone.spark} /> : null}

          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold",
              delta.positive
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-rose-200 bg-rose-50 text-rose-700",
            )}
          >
            {card.change !== 0 ? <DeltaIcon className="h-3.5 w-3.5" /> : null}
            {delta.label}
          </span>
        </div>
      </div>
    </Link>
  );
}

function KpiRow({
  cards,
  isRefreshing,
}: {
  cards: DashboardOverviewCard[];
  isRefreshing: boolean;
}) {
  if (isRefreshing) {
    return (
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[168px] rounded-[28px]" />
        ))}
      </section>
    );
  }

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <KpiCard key={card.key} card={card} />
      ))}
    </section>
  );
}

function PerformanceChartCard({
  points,
  currentLabel,
  previousLabel,
  currentRevenue,
  previousRevenue,
}: {
  points: DashboardPerformancePoint[];
  currentLabel: string;
  previousLabel: string;
  currentRevenue: number;
  previousRevenue: number;
}) {
  return (
    <DashboardCard
      title="Satışlar"
      description="Gelir trendini mevcut dönem ve geçen dönem karşılaştırmasıyla izleyin."
      action={
        <div className="flex items-center gap-3 text-xs font-medium text-[#8b7462]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#ff6f12]" />
            {currentLabel}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#cdb7a7]" />
            {previousLabel}
          </span>
        </div>
      }
      className="min-h-[420px]"
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={cn(CARD_STYLES.muted, "px-4 py-4")}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b46d33]">
              {currentLabel}
            </p>
            <p className="mt-2 text-[1.65rem] font-semibold tracking-[-0.05em] text-[#1d150f]">
              {formatCurrency(currentRevenue)}
            </p>
          </div>
          <div className={cn(CARD_STYLES.muted, "px-4 py-4")}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8a7564]">
              {previousLabel}
            </p>
            <p className="mt-2 text-[1.65rem] font-semibold tracking-[-0.05em] text-[#1d150f]">
              {formatCurrency(previousRevenue)}
            </p>
          </div>
        </div>

        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 10, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="dashboardRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ff7a1a" stopOpacity={0.26} />
                  <stop offset="95%" stopColor="#ff7a1a" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#f1e4d8" vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#8a7564", fontSize: 12 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#8a7564", fontSize: 12 }}
                tickFormatter={formatCompactValue}
              />
              <Tooltip
                cursor={{ stroke: "#ffe2cd", strokeWidth: 1, strokeDasharray: "4 4" }}
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) {
                    return null;
                  }

                  const point = payload[0]?.payload as DashboardPerformancePoint;

                  return (
                    <div className="rounded-[20px] border border-[#edd9c8] bg-white px-4 py-3 shadow-[0_18px_38px_rgba(60,36,15,0.12)]">
                      <p className="text-sm font-semibold text-[#241911]">{label}</p>
                      <div className="mt-3 space-y-2 text-sm text-[#6e5c4d]">
                        <div className="flex items-center justify-between gap-6">
                          <span className="inline-flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-[#ff7a1a]" />
                            Bu dönem
                          </span>
                          <span className="font-medium text-[#1f150e]">
                            {formatCurrency(point.currentRevenue)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-6">
                          <span className="inline-flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-[#cdb7a7]" />
                            Geçen dönem
                          </span>
                          <span className="font-medium text-[#1f150e]">
                            {formatCurrency(point.previousRevenue)}
                          </span>
                        </div>
                        <div className="pt-1 text-xs text-[#8a7564]">
                          Sipariş: {point.currentOrders.toLocaleString("tr-TR")} /{" "}
                          {point.previousOrders.toLocaleString("tr-TR")}
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="previousRevenue"
                stroke="#cdb7a7"
                strokeWidth={2}
                fill="transparent"
                strokeDasharray="6 6"
              />
              <Area
                type="monotone"
                dataKey="currentRevenue"
                stroke="#ff7a1a"
                strokeWidth={3}
                fill="url(#dashboardRevenue)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </DashboardCard>
  );
}

function AnalysisSummaryCard({ items }: { items: DashboardAnalysisSummaryItem[] }) {
  return (
    <DashboardCard
      title="Analiz Özeti"
      description="Müşteri yolculuğunun en kritik sinyallerini hızlıca tarayın."
      className="h-full"
    >
      <div className="space-y-3">
        {items.map((item) => {
          const meta = getAnalysisMeta(item.key);
          const Icon = meta.icon;
          const delta = formatDelta(item.change);

          return (
            <div
              key={item.key}
              className="flex items-center justify-between gap-4 rounded-[22px] border border-[#f0e2d5] bg-[#fffdfa] px-4 py-3.5"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className={cn("flex h-11 w-11 items-center justify-center rounded-[16px] border", meta.shell)}>
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[#35261b]">{item.label}</p>
                  <p className="mt-1 text-[1.2rem] font-semibold tracking-[-0.04em] text-[#18110c]">
                    {item.value.toLocaleString("tr-TR")}
                  </p>
                </div>
              </div>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold",
                  delta.positive
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-rose-200 bg-rose-50 text-rose-700",
                )}
              >
                {item.change !== 0 ? (
                  delta.positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />
                ) : null}
                {delta.label}
              </span>
            </div>
          );
        })}
      </div>
    </DashboardCard>
  );
}

function ToshiOverviewCard() {
  return (
    <DashboardCard
      title="Toshi AI Asistan"
      description="Mağaza verilerini yorumlamak ve hızlı aksiyon almak için Toshi’yi kullanın."
      className="h-full"
    >
      <div className="flex h-full flex-col gap-4">
        <div className="rounded-[24px] border border-[#ffd9bd] bg-[linear-gradient(135deg,#fff8f1_0%,#fff3e9_100%)] px-4 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-[linear-gradient(135deg,#ff7a1a_0%,#fe6100_100%)] text-white shadow-[0_12px_26px_rgba(254,97,0,0.2)]">
              <Sparkles className="h-4.5 w-4.5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#23170f]">Merhaba! Size nasıl yardımcı olayım?</p>
              <p className="mt-1 text-sm leading-6 text-[#725f51]">
                Satış, stok, kampanya ve operasyon verilerini Toshi ile birkaç saniyede yorumlayın.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2.5">
          {TOSHI_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => openToshi(prompt)}
              className="flex min-h-[50px] w-full items-center justify-between gap-3 rounded-[18px] border border-[#efdfd1] bg-white px-4 py-3 text-left text-sm font-medium text-[#413024] transition-colors hover:border-[#ffd4b2] hover:bg-[#fffaf5]"
            >
              <span className="truncate">{prompt}</span>
              <ArrowRight className="h-4 w-4 flex-shrink-0 text-[#d26a1b]" />
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => openToshi()}
          className="mt-auto inline-flex min-h-[54px] items-center justify-center gap-2 rounded-[18px] bg-[linear-gradient(135deg,#fe6100_0%,#ff7a1a_100%)] px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_30px_rgba(254,97,0,0.22)] transition-transform hover:-translate-y-0.5"
        >
          <Sparkles className="h-4.5 w-4.5" />
          Toshi ile Sohbete Başla
        </button>
      </div>
    </DashboardCard>
  );
}

function RecentOrdersCard({ orders }: { orders: DashboardRecentOrder[] }) {
  return (
    <DashboardCard
      title="Son Siparişler"
      description="En son gelen siparişleri durumlarıyla birlikte takip edin."
      action={
        <Link
          href="/admin/siparisler"
          className="inline-flex items-center gap-2 rounded-[16px] border border-[#efdfd1] bg-white px-3 py-2 text-sm font-medium text-[#4c382a] transition-colors hover:border-[#ffd4b2] hover:text-[#d06516]"
        >
          Tüm Siparişler
        </Link>
      }
    >
      <div className="space-y-3">
        {orders.length > 0 ? (
          orders.map((order) => {
            const status = getOrderStatusMeta(order.status);

            return (
              <Link
                key={order.id}
                href={`/admin/siparisler/${order.id}`}
                className="block rounded-[22px] border border-[#f0e2d5] bg-[#fffdfa] px-4 py-4 transition-colors hover:border-[#ffd4b2] hover:bg-[#fffcf9]"
              >
                <div className="flex flex-col gap-3 xl:grid xl:grid-cols-[1.1fr_1.2fr_0.8fr_0.9fr_0.3fr] xl:items-center">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#a07d66]">
                      Sipariş No
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[#23170f]">#{order.orderNumber}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#a07d66]">
                      Müşteri
                    </p>
                    <p className="mt-1 text-sm text-[#2e2118]">
                      {order.customerName || `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`.trim()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#a07d66]">Tutar</p>
                    <p className="mt-1 text-sm font-semibold text-[#23170f]">{formatCurrency(order.total)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#a07d66]">Durum</p>
                    <span className={cn("mt-1 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", status.className)}>
                      {status.label}
                    </span>
                  </div>
                  <div className="hidden xl:flex xl:justify-end">
                    <ArrowRight className="h-4.5 w-4.5 text-[#b18769]" />
                  </div>
                </div>
              </Link>
            );
          })
        ) : (
          <div className="rounded-[22px] border border-dashed border-[#efdfd1] bg-[#fffcf9] px-5 py-10 text-center">
            <ShoppingBag className="mx-auto h-8 w-8 text-[#df8c52]" />
            <p className="mt-3 text-sm text-[#756455]">Henüz sipariş görünmüyor.</p>
          </div>
        )}
      </div>
    </DashboardCard>
  );
}

function LowStockProductsCard({ products }: { products: DashboardLowStockProduct[] }) {
  return (
    <DashboardCard
      title="Stokta Azalan Ürünler"
      description="Kritik stok seviyesine yaklaşan ürünleri erkenden görün."
      action={
        <Link
          href="/admin/urunler"
          className="inline-flex items-center gap-2 rounded-[16px] border border-[#efdfd1] bg-white px-3 py-2 text-sm font-medium text-[#d06516] transition-colors hover:border-[#ffd4b2]"
        >
          Tümünü Gör
        </Link>
      }
    >
      <div className="space-y-3">
        {products.length > 0 ? (
          products.slice(0, 5).map((product) => (
            <Link
              key={product.id}
              href={`/admin/urunler/${product.id}/duzenle`}
              className="flex items-center gap-3 rounded-[22px] border border-[#f0e2d5] bg-[#fffdfa] px-4 py-3.5 transition-colors hover:border-[#ffd4b2] hover:bg-[#fffcf9]"
            >
              <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-[16px] border border-[#f2e5da] bg-[#f8f1ea]">
                {product.imageUrl ? (
                  <Image src={product.imageUrl} alt={product.name} fill className="object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[#ce6b1f]">
            <Package className="h-5 w-5" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[#20150d]">{product.name}</p>
                <p className="mt-1 truncate text-xs text-[#826c5d]">
                  {product.sku ? `Stok Kodu: ${product.sku}` : product.variantName || "Varsayılan varyant"}
                </p>
              </div>
              <span className="inline-flex rounded-full bg-[#fff0e5] px-2.5 py-1 text-xs font-semibold text-[#d65d09]">
                {(product.stock || 0).toLocaleString("tr-TR")} adet kaldı
              </span>
            </Link>
          ))
        ) : (
          <div className="rounded-[22px] border border-dashed border-emerald-200 bg-emerald-50/60 px-5 py-10 text-center">
            <Package className="mx-auto h-8 w-8 text-emerald-500" />
            <p className="mt-3 text-sm text-[#57695e]">Kritik stokta ürün bulunmuyor.</p>
          </div>
        )}
      </div>
    </DashboardCard>
  );
}

function CustomerActivityCard({ activities }: { activities: DashboardCustomerActivity[] }) {
  return (
    <DashboardCard
      title="Müşteri Aktiviteleri"
      description="Son müşteri hareketlerini ve yeni talepleri tek akışta izleyin."
      action={
        <Link
          href="/admin/musteriler"
          className="inline-flex items-center gap-2 rounded-[16px] border border-[#efdfd1] bg-white px-3 py-2 text-sm font-medium text-[#d06516] transition-colors hover:border-[#ffd4b2]"
        >
          Tüm Aktiviteler
        </Link>
      }
    >
      <div className="space-y-3">
        {activities.length > 0 ? (
          activities.map((activity) => {
            const meta = getActivityMeta(activity.type);
            return (
              <Link
                key={activity.id}
                href={activity.href}
                className="flex items-start gap-3 rounded-[22px] border border-[#f0e2d5] bg-[#fffdfa] px-4 py-3.5 transition-colors hover:border-[#ffd4b2] hover:bg-[#fffcf9]"
              >
                <div className={cn("flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold", meta.badge)}>
                  {getInitials(activity.customerName)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#20150d]">{activity.customerName}</p>
                      <p className="mt-1 text-sm text-[#7e685a]">{activity.summary}</p>
                    </div>
                    <span className="whitespace-nowrap text-xs text-[#a07d66]">
                      {formatActivityTime(activity.createdAt)}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })
        ) : (
          <div className="rounded-[22px] border border-dashed border-[#efdfd1] bg-[#fffcf9] px-5 py-10 text-center">
            <MessageSquare className="mx-auto h-8 w-8 text-[#df8c52]" />
            <p className="mt-3 text-sm text-[#756455]">Henüz müşteri aktivitesi görünmüyor.</p>
          </div>
        )}
      </div>
    </DashboardCard>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-[112px] rounded-[28px]" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[168px] rounded-[28px]" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.85fr)_minmax(320px,0.9fr)]">
        <Skeleton className="h-[430px] rounded-[28px]" />
        <Skeleton className="h-[430px] rounded-[28px]" />
        <Skeleton className="h-[430px] rounded-[28px]" />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Skeleton className="h-[430px] rounded-[28px]" />
        <Skeleton className="h-[430px] rounded-[28px]" />
        <Skeleton className="h-[430px] rounded-[28px]" />
      </div>
    </div>
  );
}

function DashboardContentSkeleton() {
  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.85fr)_minmax(320px,0.9fr)]">
        <Skeleton className="h-[430px] rounded-[28px]" />
        <Skeleton className="h-[430px] rounded-[28px]" />
        <Skeleton className="h-[430px] rounded-[28px]" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.05fr)]">
        <Skeleton className="h-[430px] rounded-[28px]" />
        <Skeleton className="h-[430px] rounded-[28px]" />
        <Skeleton className="h-[430px] rounded-[28px]" />
      </div>
    </>
  );
}

export default function AdminDashboardClient({
  initialData,
  initialError = "",
}: {
  initialData: DashboardBootstrapData;
  initialError?: string;
}) {
  const [dashboard, setDashboard] = useState<DashboardBootstrapData>(initialData);
  const [selectedPeriod, setSelectedPeriod] = useState<TimeRange>(initialData.overview.timeRange || "week");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState(initialError);

  const refreshDashboard = useCallback(
    async (timeRange: TimeRange) => {
      try {
        setIsRefreshing(true);
        setErrorMessage("");

        const response = await fetchAdminJson<{
          success: boolean;
          data: DashboardBootstrapData;
        }>(`/api/admin/dashboard-bootstrap?timeRange=${timeRange}`, { timeoutMs: 12000 });

        if (response.success && response.data) {
          setDashboard(response.data);
        } else {
          setErrorMessage("Dashboard verileri şu anda yenilenemedi.");
        }
      } catch (error) {
        console.error("Failed to refresh dashboard:", error);
        setErrorMessage("Dashboard verileri alınırken bir sorun oluştu. Lütfen tekrar deneyin.");
      } finally {
        setIsRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (selectedPeriod === dashboard.overview.timeRange) {
      return;
    }

    void refreshDashboard(selectedPeriod);
  }, [refreshDashboard, selectedPeriod]);

  if (!dashboard) {
    return <DashboardSkeleton />;
  }

  return (
    <main role="main" aria-busy={isRefreshing} className="mx-auto max-w-[1560px] px-3 py-4 md:px-5 md:py-6 lg:px-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="space-y-4 md:space-y-5"
      >
        <DashboardHeader selectedPeriod={selectedPeriod} onPeriodChange={setSelectedPeriod} />

        {errorMessage ? (
          <div className="flex items-start gap-3 rounded-[22px] border border-[#ffd9bd] bg-[#fff6ef] px-4 py-3 text-sm text-[#8b4b16]">
            <CircleAlert className="mt-0.5 h-4.5 w-4.5 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        ) : null}

        <KpiRow cards={dashboard.overview.cards} isRefreshing={isRefreshing} />

        {isRefreshing ? <DashboardContentSkeleton /> : null}

        {!isRefreshing ? (
          <>
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.85fr)_minmax(320px,0.9fr)]">
              <PerformanceChartCard
                points={dashboard.performance.chart}
                currentLabel={dashboard.performance.currentLabel}
                previousLabel={dashboard.performance.previousLabel}
                currentRevenue={dashboard.performance.currentRevenue}
                previousRevenue={dashboard.performance.previousRevenue}
              />
              <AnalysisSummaryCard items={dashboard.analysisSummary.items} />
              <ToshiOverviewCard />
            </section>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.05fr)]">
              <RecentOrdersCard orders={dashboard.recentOrders} />
              <LowStockProductsCard products={dashboard.lowStockProducts} />
              <CustomerActivityCard activities={dashboard.customerActivities} />
            </section>
          </>
        ) : null}
      </motion.div>
    </main>
  );
}
