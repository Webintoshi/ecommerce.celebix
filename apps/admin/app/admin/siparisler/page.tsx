"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  Ban,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Copy,
  Eye,
  Filter,
  Loader2,
  ListChecks,
  MapPin,
  MoreHorizontal,
  Package2,
  Printer,
  RefreshCcw,
  Search,
  ShoppingBag,
  Truck,
  UserRound,
  XCircle,
} from "lucide-react";
import type { CheckedState } from "@radix-ui/react-checkbox";
import { fetchAdminJson } from "@/lib/admin-client-fetch";
import { cn } from "@/lib/utils";
import {
  ORDER_STATUS_CONFIG,
  type Order,
  type OrderStatus,
  type PaymentStatus,
} from "@/types/order";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

type DisplayAddress = Order["shippingAddress"] & {
  email?: string;
  address?: string;
  addressLine?: string;
};

type DisplayOrderItem = Order["items"][number] & {
  imageUrl?: string | null;
};

type DisplayOrder = Omit<Order, "items" | "shippingAddress"> & {
  items: DisplayOrderItem[];
  shippingAddress: DisplayAddress;
};

type SortOption = "newest" | "oldest" | "highest" | "lowest";
type DateRangeOption = "all" | "today" | "last7" | "last30" | "thisMonth";
type FulfillmentState = "none" | "waiting" | "preparing" | "shipped" | "delivered";
type ActiveFilterKey = "search" | "status" | "date" | "payment" | "fulfillment";
type BulkAction =
  | ""
  | "confirm"
  | "prepare"
  | "ship"
  | "deliver"
  | "cancel"
  | "export";

const ITEMS_PER_PAGE_OPTIONS = [10, 20, 50];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "En yeni" },
  { value: "oldest", label: "En eski" },
  { value: "highest", label: "Tutar: yüksekten düşüğe" },
  { value: "lowest", label: "Tutar: düşükten yükseğe" },
];

const DATE_RANGE_OPTIONS: { value: DateRangeOption; label: string }[] = [
  { value: "all", label: "Tüm zamanlar" },
  { value: "today", label: "Bugün" },
  { value: "last7", label: "Son 7 gün" },
  { value: "last30", label: "Son 30 gün" },
  { value: "thisMonth", label: "Bu ay" },
];

const PAYMENT_FILTER_OPTIONS: { value: PaymentStatus | "all"; label: string }[] = [
  { value: "all", label: "Tüm ödemeler" },
  { value: "pending", label: "Ödeme bekleniyor" },
  { value: "processing", label: "İşleniyor" },
  { value: "completed", label: "Başarılı" },
  { value: "failed", label: "Başarısız" },
  { value: "refunded", label: "İade edildi" },
];

const FULFILLMENT_FILTER_OPTIONS: { value: FulfillmentState | "all"; label: string }[] = [
  { value: "all", label: "Tüm operasyonlar" },
  { value: "waiting", label: "Bekliyor" },
  { value: "preparing", label: "Hazırlanıyor" },
  { value: "shipped", label: "Kargolandı" },
  { value: "delivered", label: "Teslim edildi" },
  { value: "none", label: "Yok" },
];

const BULK_ACTION_OPTIONS: { value: BulkAction; label: string }[] = [
  { value: "", label: "Seçili işlemler" },
  { value: "confirm", label: "Durumu onaylandı yap" },
  { value: "prepare", label: "Durumu hazırlanıyor yap" },
  { value: "ship", label: "Durumu kargolandı yap" },
  { value: "deliver", label: "Durumu teslim edildi yap" },
  { value: "cancel", label: "Durumu iptal yap" },
  { value: "export", label: "Seçilileri dışa aktar" },
];

const ORDER_STATUS_SEQUENCE: OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
];

const ORDER_STATUS_STYLES: Record<OrderStatus, string> = {
  pending: "border-[#FDE68A] bg-[#FFF7E8] text-[#B45309]",
  confirmed: "border-[#BFDBFE] bg-[#EAF2FF] text-[#2563EB]",
  preparing: "border-[#D8B4FE] bg-[#F3EEFF] text-[#7C3AED]",
  shipped: "border-[#C7D2FE] bg-[#EEF2FF] text-[#4F46E5]",
  delivered: "border-[#BBF7D0] bg-[#EAF8EF] text-[#15803D]",
  cancelled: "border-[#FECACA] bg-[#FDECEC] text-[#DC2626]",
  refunded: "border-[#FFD7BF] bg-[#FFF1E8] text-[#E85D04]",
};

const PAYMENT_STATUS_STYLES: Record<PaymentStatus, string> = {
  pending: "border-[#FDE68A] bg-[#FFF7E8] text-[#B45309]",
  processing: "border-[#BFDBFE] bg-[#EAF2FF] text-[#2563EB]",
  completed: "border-[#BBF7D0] bg-[#EAF8EF] text-[#15803D]",
  failed: "border-[#FECACA] bg-[#FDECEC] text-[#DC2626]",
  refunded: "border-[#FFD7BF] bg-[#FFF1E8] text-[#E85D04]",
};

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Bekliyor",
  processing: "İşleniyor",
  completed: "Başarılı",
  failed: "Başarısız",
  refunded: "İade edildi",
};

const FULFILLMENT_STATUS_META: Record<
  FulfillmentState,
  { label: string; className: string }
> = {
  none: {
    label: "Yok",
    className: "border-[#E5E7EB] bg-[#F9FAFB] text-[#6B7280]",
  },
  waiting: {
    label: "Bekliyor",
    className: "border-[#BFDBFE] bg-[#EAF2FF] text-[#2563EB]",
  },
  preparing: {
    label: "Hazırlanıyor",
    className: "border-[#FDE68A] bg-[#FFF7E8] text-[#B45309]",
  },
  shipped: {
    label: "Kargolandı",
    className: "border-[#DDD6FE] bg-[#F3EEFF] text-[#7C3AED]",
  },
  delivered: {
    label: "Teslim edildi",
    className: "border-[#BBF7D0] bg-[#EAF8EF] text-[#15803D]",
  },
};

function transformOrder(dbOrder: Record<string, unknown>): DisplayOrder {
  const shippingAddress = (dbOrder.shipping_address as Record<string, unknown>) || {};

  return {
    id: String(dbOrder.id || ""),
    orderNumber: String(dbOrder.order_number || ""),
    userId: String(dbOrder.user_id || ""),
    customerEmail: String(dbOrder.customer_email || "") || undefined,
    items: ((dbOrder.items as Record<string, unknown>[]) || []).map((item) => ({
      productId: String(item.product_id || ""),
      variantId: String(item.variant_id || ""),
      productName: String(item.product_name || ""),
      variantName: String(item.variant_name || ""),
      price: Number(item.price) || 0,
      quantity: Number(item.quantity) || 0,
      total: Number(item.total) || 0,
      imageUrl:
        typeof item.image_url === "string"
          ? item.image_url
          : typeof item.product_image === "string"
            ? item.product_image
            : typeof item.thumbnail === "string"
              ? item.thumbnail
              : null,
    })),
    subtotal: Number(dbOrder.subtotal) || 0,
    shipping: Number(dbOrder.shipping_cost) || 0,
    discount: Number(dbOrder.discount) || 0,
    total: Number(dbOrder.total) || 0,
    status: ((dbOrder.status as OrderStatus) || "pending") as OrderStatus,
    paymentStatus:
      ((dbOrder.payment_status as PaymentStatus) || "pending") as PaymentStatus,
    paymentMethod:
      (dbOrder.payment_method as Order["paymentMethod"]) || "credit-card",
    shippingAddress: {
      id: String(shippingAddress.id || ""),
      title: String(shippingAddress.title || ""),
      company: typeof shippingAddress.company === "string" ? shippingAddress.company : undefined,
      firstName: String(shippingAddress.firstName || shippingAddress.first_name || ""),
      lastName: String(shippingAddress.lastName || shippingAddress.last_name || ""),
      phone: String(shippingAddress.phone || ""),
      city: String(shippingAddress.city || ""),
      district: String(shippingAddress.district || ""),
      neighborhood:
        typeof shippingAddress.neighborhood === "string"
          ? shippingAddress.neighborhood
          : undefined,
      addressLine: String(
        shippingAddress.addressLine || shippingAddress.address_line || shippingAddress.address || ""
      ),
      address: typeof shippingAddress.address === "string" ? shippingAddress.address : undefined,
      addressLine2:
        typeof shippingAddress.addressLine2 === "string"
          ? shippingAddress.addressLine2
          : undefined,
      postalCode:
        typeof shippingAddress.postalCode === "string"
          ? shippingAddress.postalCode
          : typeof shippingAddress.postal_code === "string"
            ? shippingAddress.postal_code
            : undefined,
      country: typeof shippingAddress.country === "string" ? shippingAddress.country : undefined,
      isDefault: Boolean(shippingAddress.isDefault || shippingAddress.is_default),
      email:
        typeof shippingAddress.email === "string"
          ? shippingAddress.email
          : undefined,
    },
    shippingInfo: {
      method:
        dbOrder.shipping_method === "express" || dbOrder.shipping_method === "standard"
          ? (dbOrder.shipping_method as "standard" | "express")
          : "standard",
      company: String(dbOrder.shipping_company || ""),
      trackingNumber:
        typeof dbOrder.tracking_number === "string"
          ? dbOrder.tracking_number
          : undefined,
      estimatedDelivery:
        typeof dbOrder.estimated_delivery === "string"
          ? new Date(dbOrder.estimated_delivery)
          : undefined,
      cost: Number(dbOrder.shipping_cost) || 0,
    },
    createdAt: new Date(String(dbOrder.created_at || new Date().toISOString())),
    updatedAt: new Date(String(dbOrder.updated_at || new Date().toISOString())),
    notes: typeof dbOrder.notes === "string" ? dbOrder.notes : undefined,
    couponCode:
      typeof dbOrder.coupon_code === "string" ? dbOrder.coupon_code : undefined,
  };
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfNextMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function formatPrice(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getCustomerName(order: DisplayOrder) {
  const firstName = order.shippingAddress.firstName?.trim();
  const lastName = order.shippingAddress.lastName?.trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  return fullName || "Müşteri bilgisi yok";
}

function getCustomerEmail(order: DisplayOrder) {
  return (
    order.customerEmail?.trim() ||
    order.shippingAddress.email?.trim() ||
    "E-posta bilgisi yok"
  );
}

function getLocationLabel(order: DisplayOrder) {
  const city = order.shippingAddress.city?.trim();
  const district = order.shippingAddress.district?.trim();
  if (city && district) return `${city} / ${district}`;
  return city || district || "Konum bilgisi yok";
}

function getFulfillmentState(status: OrderStatus): FulfillmentState {
  if (status === "preparing") return "preparing";
  if (status === "shipped") return "shipped";
  if (status === "delivered") return "delivered";
  if (status === "cancelled" || status === "refunded") return "none";
  return "waiting";
}

function getFulfillmentLabel(status: OrderStatus) {
  return FULFILLMENT_STATUS_META[getFulfillmentState(status)];
}

function matchesDateRange(order: DisplayOrder, range: DateRangeOption) {
  if (range === "all") return true;

  const now = new Date();
  const orderTime = order.createdAt.getTime();
  const todayStart = startOfDay(now);
  const tomorrowStart = addDays(todayStart, 1);

  if (range === "today") {
    return orderTime >= todayStart.getTime() && orderTime < tomorrowStart.getTime();
  }

  if (range === "last7") {
    const start = startOfDay(addDays(now, -6));
    return orderTime >= start.getTime() && orderTime < tomorrowStart.getTime();
  }

  if (range === "last30") {
    const start = startOfDay(addDays(now, -29));
    return orderTime >= start.getTime() && orderTime < tomorrowStart.getTime();
  }

  const monthStart = startOfMonth(now);
  const nextMonthStart = startOfNextMonth(now);
  return orderTime >= monthStart.getTime() && orderTime < nextMonthStart.getTime();
}

function getPeriodComparison(range: "last7" | "last30" | "today") {
  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrowStart = addDays(todayStart, 1);

  if (range === "today") {
    return {
      currentStart: todayStart,
      currentEnd: tomorrowStart,
      previousStart: addDays(todayStart, -1),
      previousEnd: todayStart,
    };
  }

  if (range === "last7") {
    return {
      currentStart: startOfDay(addDays(now, -6)),
      currentEnd: tomorrowStart,
      previousStart: startOfDay(addDays(now, -13)),
      previousEnd: startOfDay(addDays(now, -6)),
    };
  }

  return {
    currentStart: startOfDay(addDays(now, -29)),
    currentEnd: tomorrowStart,
    previousStart: startOfDay(addDays(now, -59)),
    previousEnd: startOfDay(addDays(now, -29)),
  };
}

function countOrdersBetween(
  orders: DisplayOrder[],
  start: Date,
  end: Date,
  field: "count" | "revenue" = "count"
) {
  const scoped = orders.filter((order) => {
    const time = order.createdAt.getTime();
    return time >= start.getTime() && time < end.getTime();
  });

  if (field === "revenue") {
    return scoped.reduce((sum, order) => sum + order.total, 0);
  }

  return scoped.length;
}

function getChangePercent(current: number, previous: number) {
  if (previous === 0) {
    if (current === 0) return 0;
    return 100;
  }

  return ((current - previous) / previous) * 100;
}

function formatChangePercent(value: number) {
  const absolute = Math.abs(value);
  if (!Number.isFinite(absolute)) return "%0";
  return `%${absolute.toFixed(0)}`;
}

function getOptionLabel<T extends string>(
  options: readonly { value: T; label: string }[],
  value: T,
) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\n");

  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function exportOrdersCsv(orders: DisplayOrder[]) {
  const rows = [
    [
      "Sipariş No",
      "Tarih",
      "Müşteri",
      "E-posta",
      "Durum",
      "Ödeme",
      "Fulfillment",
      "Ürün",
      "Şehir",
      "Tutar",
    ],
    ...orders.map((order) => [
      order.orderNumber,
      `${formatDate(order.createdAt)} ${formatTime(order.createdAt)}`,
      getCustomerName(order),
      getCustomerEmail(order),
      ORDER_STATUS_CONFIG[order.status].label,
      PAYMENT_STATUS_LABELS[order.paymentStatus],
      getFulfillmentLabel(order.status).label,
      order.items.map((item) => item.productName).join(" | "),
      getLocationLabel(order),
      order.total.toFixed(2),
    ]),
  ];

  downloadCsv("siparisler.csv", rows);
}

function MetricCard({
  title,
  value,
  icon: Icon,
  tone,
  context,
  delta,
}: {
  title: string;
  value: string;
  icon: typeof ShoppingBag;
  tone: string;
  context: string;
  delta?: number | null;
}) {
  const isPositive = (delta ?? 0) >= 0;

  return (
    <div className="rounded-[26px] border border-[#E7EAF0] bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <p className="text-sm font-medium text-[#6B7280]">{title}</p>
          <div className="flex items-end gap-3">
            <p className="text-[1.75rem] font-semibold tracking-[-0.04em] text-[#1F2937]">
              {value}
            </p>
            {typeof delta === "number" ? (
              <span
                className={cn(
                  "inline-flex rounded-full border px-2 py-1 text-xs font-semibold",
                  isPositive
                    ? "border-[#BBF7D0] bg-[#EAF8EF] text-[#16A34A]"
                    : "border-[#FECACA] bg-[#FDECEC] text-[#EF4444]"
                )}
              >
                {isPositive ? "↑" : "↓"} {formatChangePercent(delta)}
              </span>
            ) : null}
          </div>
          <p className="text-xs font-medium text-[#6B7280]">{context}</p>
        </div>
        <div
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-[1.1rem] border",
            tone
          )}
        >
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}

function ToolbarMetaChip({
  icon: Icon,
  label,
  value,
  toneClassName,
}: {
  icon: typeof ShoppingBag;
  label: string;
  value: string;
  toneClassName: string;
}) {
  return (
    <div className="inline-flex min-h-[54px] items-center gap-3 rounded-[20px] border border-[#E7EAF0] bg-white px-3.5 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border",
          toneClassName,
        )}
      >
        <Icon className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9CA3AF]">
          {label}
        </p>
        <p className="mt-1 truncate text-sm font-semibold text-[#1F2937]">{value}</p>
      </div>
    </div>
  );
}

function StatusChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-[42px] shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium whitespace-nowrap transition-all",
        active
          ? "border-[#FFD7BF] bg-[#FFF1E8] text-[#E85D04] shadow-[0_10px_22px_rgba(255,106,0,0.12)]"
          : "border-[#E7EAF0] bg-white text-[#374151] hover:border-[#FFD7BF] hover:text-[#E85D04]"
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-xs font-semibold",
          active ? "bg-white text-[#E85D04]" : "bg-[#F3F4F6] text-[#6B7280]"
        )}
      >
        {count}
      </span>
    </button>
  );
}

function ActiveFilterChip({
  label,
  onClear,
}: {
  label: string;
  onClear: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="inline-flex min-h-[34px] items-center gap-2 rounded-full border border-[#E7EAF0] bg-white px-3 py-1.5 text-xs font-medium text-[#374151] transition-colors hover:border-[#FFD7BF] hover:text-[#E85D04]"
      aria-label={`${label} filtresini kaldır`}
    >
      <span className="truncate">{label}</span>
      <XCircle className="h-3.5 w-3.5 text-[#9CA3AF]" />
    </button>
  );
}

function ToneBadge({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        className
      )}
    >
      {label}
    </span>
  );
}

function OrdersPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-[26px] border border-[#E7EAF0] bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="w-full space-y-3">
                <Skeleton className="h-4 w-28 bg-[#EEF1F4]" />
                <Skeleton className="h-9 w-24 bg-[#EEF1F4]" />
                <Skeleton className="h-3 w-32 bg-[#EEF1F4]" />
              </div>
              <Skeleton className="h-14 w-14 rounded-[1.1rem] bg-[#EEF1F4]" />
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-[28px] border border-[#E7EAF0] bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_220px_190px_auto_auto]">
          <Skeleton className="h-12 rounded-2xl bg-[#EEF1F4]" />
          <Skeleton className="h-12 rounded-2xl bg-[#EEF1F4]" />
          <Skeleton className="h-12 rounded-2xl bg-[#EEF1F4]" />
          <Skeleton className="h-12 rounded-2xl bg-[#EEF1F4]" />
          <Skeleton className="h-12 rounded-2xl bg-[#EEF1F4]" />
        </div>

        <div className="mt-6 space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="rounded-[22px] border border-[#EEF1F4] bg-white px-4 py-4"
            >
              <div className="grid gap-4 xl:grid-cols-[32px_minmax(0,1.6fr)_minmax(0,0.95fr)_minmax(0,0.95fr)_minmax(0,1.1fr)_minmax(0,0.7fr)_84px] xl:items-center">
                <Skeleton className="h-5 w-5 rounded bg-[#EEF1F4]" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-40 bg-[#EEF1F4]" />
                  <Skeleton className="h-3 w-52 bg-[#EEF1F4]" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-6 w-24 rounded-full bg-[#EEF1F4]" />
                  <Skeleton className="h-3 w-28 bg-[#EEF1F4]" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-6 w-20 rounded-full bg-[#EEF1F4]" />
                  <Skeleton className="h-6 w-24 rounded-full bg-[#EEF1F4]" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full rounded-xl bg-[#EEF1F4]" />
                  <Skeleton className="h-3 w-24 bg-[#EEF1F4]" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-5 w-20 bg-[#EEF1F4]" />
                  <Skeleton className="h-3 w-24 bg-[#EEF1F4]" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-10 w-10 rounded-xl bg-[#EEF1F4]" />
                  <Skeleton className="h-10 w-10 rounded-xl bg-[#EEF1F4]" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  hasFilters,
  onReset,
}: {
  hasFilters: boolean;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full border border-[#FFD7BF] bg-[#FFF1E8] text-[#FF6A00]">
        <Package2 className="h-9 w-9" />
      </div>
      <h3 className="mt-5 text-xl font-semibold text-[#1F2937]">
        {hasFilters ? "Sonuç bulunamadı" : "Henüz sipariş bulunmuyor"}
      </h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-[#6B7280]">
        {hasFilters
          ? "Arama, tarih veya durum filtrelerini değiştirerek tekrar deneyin."
          : "İlk sipariş oluştuğunda bu alan otomatik olarak sipariş operasyon merkezine dönüşecek."}
      </p>
      {hasFilters ? (
        <Button
          type="button"
          variant="secondary"
          className="mt-5"
          onClick={onReset}
        >
          Filtreleri temizle
        </Button>
      ) : null}
    </div>
  );
}

function RowActionMenu({
  order,
  onQuickStatusChange,
}: {
  order: DisplayOrder;
  onQuickStatusChange: (orderId: string, status: OrderStatus) => Promise<void>;
}) {
  const customerEmail = getCustomerEmail(order);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`#${order.orderNumber} için daha fazla işlem`}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#E7EAF0] bg-white text-[#6B7280] transition-colors hover:border-[#FFD7BF] hover:text-[#E85D04]"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 rounded-2xl border-[#E7EAF0] bg-white p-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.12)]"
      >
        <DropdownMenuItem
          className="rounded-xl px-3 py-2.5 text-[#374151]"
          onClick={() => navigator.clipboard.writeText(order.orderNumber)}
        >
          <Copy className="mr-2 h-4 w-4" />
          Sipariş numarasını kopyala
        </DropdownMenuItem>
        <DropdownMenuItem
          className="rounded-xl px-3 py-2.5 text-[#374151]"
          onClick={() => window.open(`/admin/siparisler/${order.id}/yazdir`, "_blank")}
        >
          <Printer className="mr-2 h-4 w-4" />
          Yazdır
        </DropdownMenuItem>
        {customerEmail !== "E-posta bilgisi yok" ? (
          <DropdownMenuItem
            className="rounded-xl px-3 py-2.5 text-[#374151]"
            onClick={() => navigator.clipboard.writeText(customerEmail)}
          >
            <Copy className="mr-2 h-4 w-4" />
            E-postayı kopyala
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator className="bg-[#EEF1F4]" />
        {order.status !== "confirmed" ? (
          <DropdownMenuItem
            className="rounded-xl px-3 py-2.5 text-[#374151]"
            onClick={() => onQuickStatusChange(order.id, "confirmed")}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Onaylandı yap
          </DropdownMenuItem>
        ) : null}
        {order.status !== "preparing" ? (
          <DropdownMenuItem
            className="rounded-xl px-3 py-2.5 text-[#374151]"
            onClick={() => onQuickStatusChange(order.id, "preparing")}
          >
            <Package2 className="mr-2 h-4 w-4" />
            Hazırlanıyor yap
          </DropdownMenuItem>
        ) : null}
        {order.status !== "shipped" ? (
          <DropdownMenuItem
            className="rounded-xl px-3 py-2.5 text-[#374151]"
            onClick={() => onQuickStatusChange(order.id, "shipped")}
          >
            <Truck className="mr-2 h-4 w-4" />
            Kargolandı yap
          </DropdownMenuItem>
        ) : null}
        {order.status !== "cancelled" ? (
          <DropdownMenuItem
            className="rounded-xl px-3 py-2.5 text-[#EF4444]"
            onClick={() => onQuickStatusChange(order.id, "cancelled")}
          >
            <Ban className="mr-2 h-4 w-4" />
            Siparişi iptal et
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function OrderListRow({
  order,
  checked,
  onCheckedChange,
  onQuickStatusChange,
}: {
  order: DisplayOrder;
  checked: boolean;
  onCheckedChange: (checked: CheckedState) => void;
  onQuickStatusChange: (orderId: string, status: OrderStatus) => Promise<void>;
}) {
  const statusMeta = ORDER_STATUS_CONFIG[order.status];
  const paymentClass = PAYMENT_STATUS_STYLES[order.paymentStatus];
  const fulfillmentMeta = getFulfillmentLabel(order.status);
  const primaryItem = order.items[0];
  const otherItemsCount = Math.max(order.items.length - 1, 0);
  const customerEmail = getCustomerEmail(order);

  return (
    <article
      aria-selected={checked}
      className={cn(
        "border-b border-[#EEF1F4] px-4 py-4 transition-colors md:px-6",
        checked ? "bg-[#FFF8F3]" : "hover:bg-[#FBFCFD]",
      )}
    >
      <div className="grid gap-4 xl:grid-cols-[32px_minmax(0,1.65fr)_minmax(0,0.95fr)_minmax(0,0.95fr)_minmax(0,1.15fr)_minmax(0,0.72fr)_92px] xl:items-center">
        <div className="flex items-start pt-1">
          <Checkbox
            checked={checked}
            onCheckedChange={onCheckedChange}
            className="h-5 w-5 rounded-md border-[#D1D5DB] data-[state=checked]:border-[#FF6A00] data-[state=checked]:bg-[#FF6A00]"
            aria-label={`#${order.orderNumber} siparişini seç`}
          />
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-[#6B7280]">
            <Link
              href={`/admin/siparisler/${order.id}`}
              className="text-base font-semibold tracking-[-0.02em] text-[#1F2937] transition-colors hover:text-[#E85D04]"
            >
              #{order.orderNumber}
            </Link>
            <span className="text-[#D1D5DB]">•</span>
            <span>{formatDate(order.createdAt)}</span>
            <span className="text-[#D1D5DB]">•</span>
            <span>{formatTime(order.createdAt)}</span>
          </div>

          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-sm font-medium text-[#374151]">
              <UserRound className="h-4 w-4 text-[#9CA3AF]" />
              <span>{getCustomerName(order)}</span>
            </div>
            <div className="text-sm text-[#6B7280]">{customerEmail}</div>
          </div>
        </div>

        <div className="space-y-2">
          <ToneBadge
            label={statusMeta.label}
            className={ORDER_STATUS_STYLES[order.status]}
          />
          <p className="text-sm text-[#6B7280]">{statusMeta.description}</p>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">
              Ödeme
            </span>
            <div>
              <ToneBadge
                label={PAYMENT_STATUS_LABELS[order.paymentStatus]}
                className={paymentClass}
              />
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">
              Fulfillment
            </span>
            <div>
              <ToneBadge
                label={fulfillmentMeta.label}
                className={fulfillmentMeta.className}
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[1rem] border border-[#E7EAF0] bg-[#F7F8FA]">
            {primaryItem?.imageUrl ? (
              <div
                className="h-full w-full bg-cover bg-center"
                style={{ backgroundImage: `url(${primaryItem.imageUrl})` }}
              />
            ) : (
              <Package2 className="h-6 w-6 text-[#9CA3AF]" />
            )}
          </div>

          <div className="min-w-0 space-y-1.5">
            <p className="line-clamp-2 text-sm font-medium leading-5 text-[#374151]">
              {primaryItem?.productName || "Ürün bilgisi yok"}
              {primaryItem?.variantName ? ` · ${primaryItem.variantName}` : ""}
            </p>
            <div className="inline-flex items-center gap-1.5 text-xs text-[#6B7280]">
              <MapPin className="h-3.5 w-3.5 text-[#FF6A00]" />
              <span>{getLocationLabel(order)}</span>
            </div>
            <p className="text-xs text-[#9CA3AF]">
              {primaryItem ? `${primaryItem.quantity} adet` : "0 adet"}
              {otherItemsCount > 0 ? ` · +${otherItemsCount} ürün kalemi` : " · 1 ürün kalemi"}
            </p>
          </div>
        </div>

        <div className="space-y-1 xl:text-right">
          <p className="text-lg font-semibold tracking-[-0.03em] text-[#1F2937]">
            {formatPrice(order.total)}
          </p>
          {order.discount > 0 ? (
            <p className="text-xs font-medium text-[#16A34A]">
              {formatPrice(order.discount)} indirim uygulandı
            </p>
          ) : (
            <p className="text-xs text-[#9CA3AF]">İndirim uygulanmadı</p>
          )}
        </div>

        <div className="flex items-center justify-start gap-2 xl:justify-end">
          <Link
            href={`/admin/siparisler/${order.id}`}
            aria-label={`#${order.orderNumber} detayını görüntüle`}
            className={cn(
              buttonVariants({ variant: "secondary", size: "sm" }),
              "h-10 w-10 rounded-xl border-[#E7EAF0] px-0 text-[#374151] shadow-none hover:border-[#FFD7BF] hover:bg-[#FFF8F3] hover:text-[#E85D04]"
            )}
          >
            <Eye className="h-4 w-4" />
          </Link>
          <RowActionMenu order={order} onQuickStatusChange={onQuickStatusChange} />
        </div>
      </div>
    </article>
  );
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<DisplayOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [dateRange, setDateRange] = useState<DateRangeOption>("all");
  const [paymentFilter, setPaymentFilter] = useState<PaymentStatus | "all">("all");
  const [fulfillmentFilter, setFulfillmentFilter] = useState<FulfillmentState | "all">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<BulkAction>("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isBulkRunning, setIsBulkRunning] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const loadOrders = async () => {
    setErrorMessage("");
    try {
      const data = await fetchAdminJson<{
        success: boolean;
        orders: Record<string, unknown>[];
      }>("/api/orders", { timeoutMs: 12000 });

      if (!data.success) {
        throw new Error("Siparişler yüklenemedi.");
      }

      setOrders((data.orders || []).map(transformOrder));
      setLastUpdatedAt(new Date());
    } catch (error) {
      console.error("Failed to load orders:", error);
      setErrorMessage(
        error instanceof Error ? error.message : "Siparişler yüklenemedi."
      );
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void loadOrders();
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadOrders();
  };

  const handleResetFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setDateRange("all");
    setPaymentFilter("all");
    setFulfillmentFilter("all");
    setSortBy("newest");
    setCurrentPage(1);
  };

  const baseFilteredOrders = useMemo(() => {
    const searchLower = searchQuery.trim().toLowerCase();

    return orders.filter((order) => {
      const fullName = getCustomerName(order).toLowerCase();
      const email = getCustomerEmail(order).toLowerCase();
      const searchMatches =
        searchLower.length === 0 ||
        order.orderNumber.toLowerCase().includes(searchLower) ||
        fullName.includes(searchLower) ||
        email.includes(searchLower);

      const dateMatches = matchesDateRange(order, dateRange);
      const paymentMatches =
        paymentFilter === "all" || order.paymentStatus === paymentFilter;
      const fulfillmentMatches =
        fulfillmentFilter === "all" ||
        getFulfillmentState(order.status) === fulfillmentFilter;

      return searchMatches && dateMatches && paymentMatches && fulfillmentMatches;
    });
  }, [dateRange, fulfillmentFilter, orders, paymentFilter, searchQuery]);

  const statusTabs = useMemo(() => {
    const counts = ORDER_STATUS_SEQUENCE.map((status) => ({
      value: status,
      label: ORDER_STATUS_CONFIG[status].label,
      count: baseFilteredOrders.filter((order) => order.status === status).length,
    }));

    return [
      {
        value: "all" as const,
        label: "Tümü",
        count: baseFilteredOrders.length,
      },
      ...counts,
    ];
  }, [baseFilteredOrders]);

  const filteredOrders = useMemo(() => {
    const scoped = baseFilteredOrders.filter((order) =>
      statusFilter === "all" ? true : order.status === statusFilter
    );

    return [...scoped].sort((left, right) => {
      switch (sortBy) {
        case "oldest":
          return left.createdAt.getTime() - right.createdAt.getTime();
        case "highest":
          return right.total - left.total;
        case "lowest":
          return left.total - right.total;
        case "newest":
        default:
          return right.createdAt.getTime() - left.createdAt.getTime();
      }
    });
  }, [baseFilteredOrders, sortBy, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [currentPage, filteredOrders, pageSize]);

  const pageOrderIds = paginatedOrders.map((order) => order.id);
  const selectedOnPageCount = pageOrderIds.filter((id) => selectedIds.includes(id)).length;
  const pageSelectionState: CheckedState =
    pageOrderIds.length === 0
      ? false
      : selectedOnPageCount === 0
        ? false
        : selectedOnPageCount === pageOrderIds.length
          ? true
          : "indeterminate";

  const visibleStart = filteredOrders.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const visibleEnd = Math.min(currentPage * pageSize, filteredOrders.length);
  const hasSelection = selectedIds.length > 0;

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    statusFilter !== "all" ||
    dateRange !== "all" ||
    paymentFilter !== "all" ||
    fulfillmentFilter !== "all";

  const totalOrders = orders.length;
  const todayComparison = getPeriodComparison("today");
  const last7Comparison = getPeriodComparison("last7");
  const last30Comparison = getPeriodComparison("last30");

  const totalOrdersDelta = getChangePercent(
    countOrdersBetween(orders, last7Comparison.currentStart, last7Comparison.currentEnd),
    countOrdersBetween(orders, last7Comparison.previousStart, last7Comparison.previousEnd)
  );

  const todayOrders = countOrdersBetween(
    orders,
    todayComparison.currentStart,
    todayComparison.currentEnd
  );
  const todayOrdersDelta = getChangePercent(
    todayOrders,
    countOrdersBetween(orders, todayComparison.previousStart, todayComparison.previousEnd)
  );

  const pendingActionableOrders = orders.filter((order) =>
    ["pending", "confirmed", "preparing", "shipped"].includes(order.status)
  );
  const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0);
  const revenueDelta = getChangePercent(
    countOrdersBetween(
      orders,
      last30Comparison.currentStart,
      last30Comparison.currentEnd,
      "revenue"
    ),
    countOrdersBetween(
      orders,
      last30Comparison.previousStart,
      last30Comparison.previousEnd,
      "revenue"
    )
  );

  const activeFilterChips = useMemo(
    () =>
      [
        searchQuery.trim()
          ? {
              key: "search" as const,
              label: `Arama: ${searchQuery.trim()}`,
            }
          : null,
        statusFilter !== "all"
          ? {
              key: "status" as const,
              label: `Durum: ${ORDER_STATUS_CONFIG[statusFilter].label}`,
            }
          : null,
        dateRange !== "all"
          ? {
              key: "date" as const,
              label: `Tarih: ${getOptionLabel(DATE_RANGE_OPTIONS, dateRange)}`,
            }
          : null,
        paymentFilter !== "all"
          ? {
              key: "payment" as const,
              label: `Ödeme: ${getOptionLabel(PAYMENT_FILTER_OPTIONS, paymentFilter)}`,
            }
          : null,
        fulfillmentFilter !== "all"
          ? {
              key: "fulfillment" as const,
              label: `Operasyon: ${getOptionLabel(FULFILLMENT_FILTER_OPTIONS, fulfillmentFilter)}`,
            }
          : null,
      ].filter((item): item is { key: ActiveFilterKey; label: string } => item !== null),
    [dateRange, fulfillmentFilter, paymentFilter, searchQuery, statusFilter],
  );

  const activeFilterCount = activeFilterChips.length;

  const clearActiveFilter = (key: ActiveFilterKey) => {
    switch (key) {
      case "search":
        setSearchQuery("");
        break;
      case "status":
        setStatusFilter("all");
        break;
      case "date":
        setDateRange("all");
        break;
      case "payment":
        setPaymentFilter("all");
        break;
      case "fulfillment":
        setFulfillmentFilter("all");
        break;
    }

    setCurrentPage(1);
  };

  const handleTogglePageSelection = (checked: CheckedState) => {
    if (checked) {
      setSelectedIds((current) => [...new Set([...current, ...pageOrderIds])]);
      return;
    }

    setSelectedIds((current) => current.filter((id) => !pageOrderIds.includes(id)));
  };

  const handleToggleOrderSelection = (orderId: string, checked: CheckedState) => {
    setSelectedIds((current) => {
      if (checked) {
        return [...new Set([...current, orderId])];
      }

      return current.filter((id) => id !== orderId);
    });
  };

  const updateOrderStatus = async (orderId: string, status: OrderStatus) => {
    try {
      await fetchAdminJson(`/api/admin/orders/${orderId}/status`, {
        timeoutMs: 12000,
        init: {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      });

      await loadOrders();
    } catch (error) {
      console.error("Failed to update order status:", error);
      window.alert(
        error instanceof Error ? error.message : "Sipariş durumu güncellenemedi."
      );
    }
  };

  const runBulkAction = async () => {
    if (!bulkAction || selectedIds.length === 0) return;

    if (bulkAction === "export") {
      exportOrdersCsv(filteredOrders.filter((order) => selectedIds.includes(order.id)));
      return;
    }

    const statusMap: Record<Exclude<BulkAction, "" | "export">, OrderStatus> = {
      confirm: "confirmed",
      prepare: "preparing",
      ship: "shipped",
      deliver: "delivered",
      cancel: "cancelled",
    };

    const nextStatus = statusMap[bulkAction as Exclude<BulkAction, "" | "export">];
    if (!nextStatus) return;

    setIsBulkRunning(true);
    try {
      await Promise.all(
        selectedIds.map((orderId) =>
          fetchAdminJson(`/api/admin/orders/${orderId}/status`, {
            timeoutMs: 12000,
            init: {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: nextStatus }),
            },
          })
        )
      );

      setSelectedIds([]);
      setBulkAction("");
      await loadOrders();
    } catch (error) {
      console.error("Failed to run bulk action:", error);
      window.alert(
        error instanceof Error ? error.message : "Toplu işlem sırasında hata oluştu."
      );
    } finally {
      setIsBulkRunning(false);
    }
  };

  const paginationNumbers = useMemo(() => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    if (currentPage <= 3) {
      return [1, 2, 3, 4, 5];
    }

    if (currentPage >= totalPages - 2) {
      return Array.from({ length: 5 }, (_, index) => totalPages - 4 + index);
    }

    return Array.from({ length: 5 }, (_, index) => currentPage - 2 + index);
  }, [currentPage, totalPages]);

  return (
    <main className="min-h-screen bg-[#F7F8FA]">
      <div className="mx-auto max-w-[1600px] px-3 py-4 md:px-5 md:py-6 lg:px-8">
        <div className="space-y-6">
          {loading ? (
            <OrdersPageSkeleton />
          ) : (
            <>
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  title="Toplam Sipariş"
                  value={totalOrders.toLocaleString("tr-TR")}
                  icon={ShoppingBag}
                  tone="border-[#FFD7BF] bg-[#FFF1E8] text-[#FF6A00]"
                  context="Son 7 güne göre"
                  delta={totalOrdersDelta}
                />
                <MetricCard
                  title="Bugünkü Sipariş"
                  value={todayOrders.toLocaleString("tr-TR")}
                  icon={CalendarRange}
                  tone="border-[#BFDBFE] bg-[#EAF2FF] text-[#3B82F6]"
                  context={`Dün: ${countOrdersBetween(
                    orders,
                    todayComparison.previousStart,
                    todayComparison.previousEnd
                  ).toLocaleString("tr-TR")}`}
                  delta={todayOrdersDelta}
                />
                <MetricCard
                  title="Bekleyen İşlem"
                  value={pendingActionableOrders.length.toLocaleString("tr-TR")}
                  icon={ListChecks}
                  tone="border-[#FDE68A] bg-[#FFF7E8] text-[#F59E0B]"
                  context={`Onay ${orders.filter((order) => order.status === "confirmed").length} · Hazırlık ${orders.filter((order) => order.status === "preparing").length} · Kargo ${orders.filter((order) => order.status === "shipped").length}`}
                />
                <MetricCard
                  title="Toplam Ciro"
                  value={formatPrice(totalRevenue)}
                  icon={CircleDollarSign}
                  tone="border-[#BBF7D0] bg-[#EAF8EF] text-[#16A34A]"
                  context={`Son 30 gün: ${formatPrice(
                    countOrdersBetween(
                      orders,
                      last30Comparison.currentStart,
                      last30Comparison.currentEnd,
                      "revenue"
                    )
                  )}`}
                  delta={revenueDelta}
                />
              </section>

              <section className="rounded-[28px] border border-[#E7EAF0] bg-white shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
                <div className="border-b border-[#EEF1F4] bg-[linear-gradient(180deg,#FFFFFF_0%,#FBFCFD_100%)] px-4 py-4 md:px-6">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex min-h-[30px] items-center rounded-full border border-[#FFD7BF] bg-[#FFF1E8] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#E85D04]">
                            Sipariş akışı
                          </span>
                          {lastUpdatedAt ? (
                            <span className="text-xs font-medium text-[#9CA3AF]">
                              Son yenileme: {formatDate(lastUpdatedAt)} · {formatTime(lastUpdatedAt)}
                            </span>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap gap-2.5">
                          <ToolbarMetaChip
                            icon={ShoppingBag}
                            label="Görünür kayıt"
                            value={filteredOrders.length.toLocaleString("tr-TR")}
                            toneClassName="border-[#DCE9FF] bg-[#F1F6FF] text-[#2563EB]"
                          />
                          <ToolbarMetaChip
                            icon={ClipboardList}
                            label="Bu sayfa"
                            value={filteredOrders.length === 0 ? "0" : `${visibleStart}-${visibleEnd}`}
                            toneClassName="border-[#FFD7BF] bg-[#FFF1E8] text-[#E85D04]"
                          />
                          <ToolbarMetaChip
                            icon={Filter}
                            label="Aktif filtre"
                            value={activeFilterCount > 0 ? `${activeFilterCount} filtre` : "Temiz"}
                            toneClassName="border-[#E6DCF9] bg-[#F3EEFF] text-[#7C3AED]"
                          />
                        </div>

                        {activeFilterCount > 0 ? (
                          <div className="flex flex-wrap items-center gap-2">
                            {activeFilterChips.map((filter) => (
                              <ActiveFilterChip
                                key={filter.key}
                                label={filter.label}
                                onClear={() => clearActiveFilter(filter.key)}
                              />
                            ))}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 rounded-full px-3 text-xs font-semibold text-[#6B7280] hover:bg-[#FFF8F3] hover:text-[#E85D04]"
                              onClick={handleResetFilters}
                            >
                              Tümünü temizle
                            </Button>
                          </div>
                        ) : (
                          <p className="text-sm text-[#6B7280]">
                            Arama ve durum filtreleri temiz. Liste tüm operasyon akışını gösteriyor.
                          </p>
                        )}
                      </div>

                      <Button
                        type="button"
                        variant="secondary"
                        className="min-h-[44px] gap-2 self-start rounded-2xl border-[#E7EAF0] px-4 text-[#374151] shadow-none hover:border-[#FFD7BF] hover:bg-[#FFF8F3] hover:text-[#E85D04]"
                        onClick={handleRefresh}
                      >
                        {isRefreshing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCcw className="h-4 w-4" />
                        )}
                        Yenile
                      </Button>
                    </div>

                    <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_220px_190px_auto_auto]">
                      <label className="relative block">
                        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(event) => {
                            setSearchQuery(event.target.value);
                            setCurrentPage(1);
                          }}
                          placeholder="Sipariş numarası, müşteri adı veya e-posta ile ara"
                          className="h-12 w-full rounded-2xl border border-[#E7EAF0] bg-white pl-11 pr-4 text-sm text-[#1F2937] placeholder:text-[#9CA3AF] focus:border-[#FFD7BF] focus:outline-none focus:ring-4 focus:ring-[#FFF1E8]"
                        />
                      </label>

                      <div className="relative">
                        <CalendarRange className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
                        <select
                          value={dateRange}
                          onChange={(event) => {
                            setDateRange(event.target.value as DateRangeOption);
                            setCurrentPage(1);
                          }}
                          className="h-12 w-full appearance-none rounded-2xl border border-[#E7EAF0] bg-white pl-11 pr-10 text-sm text-[#374151] focus:border-[#FFD7BF] focus:outline-none focus:ring-4 focus:ring-[#FFF1E8]"
                        >
                          {DATE_RANGE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
                      </div>

                      <div className="relative">
                        <select
                          value={sortBy}
                          onChange={(event) => setSortBy(event.target.value as SortOption)}
                          className="h-12 w-full appearance-none rounded-2xl border border-[#E7EAF0] bg-white px-4 pr-10 text-sm text-[#374151] focus:border-[#FFD7BF] focus:outline-none focus:ring-4 focus:ring-[#FFF1E8]"
                        >
                          {SORT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
                      </div>

                      <Button
                        type="button"
                        variant="secondary"
                        className={cn(
                          "justify-center gap-2 rounded-2xl border-[#E7EAF0] shadow-none hover:border-[#FFD7BF] hover:bg-[#FFF8F3] hover:text-[#E85D04]",
                          showAdvancedFilters || activeFilterCount > 0
                            ? "border-[#FFD7BF] bg-[#FFF1E8] text-[#E85D04]"
                            : ""
                        )}
                        onClick={() => setShowAdvancedFilters((current) => !current)}
                        aria-expanded={showAdvancedFilters}
                        aria-controls="orders-advanced-filters"
                      >
                        <Filter className="h-4 w-4" />
                        Filtreler
                        {activeFilterCount > 0 ? (
                          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-[11px] font-semibold text-[#E85D04]">
                            {activeFilterCount}
                          </span>
                        ) : null}
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        className="justify-center gap-2 rounded-2xl"
                        onClick={() => exportOrdersCsv(filteredOrders)}
                      >
                        <ArrowDownToLine className="h-4 w-4" />
                        Dışa aktar
                      </Button>
                    </div>

                    {showAdvancedFilters ? (
                      <div
                        id="orders-advanced-filters"
                        className="grid gap-3 rounded-[22px] border border-[#EEF1F4] bg-[#FBFCFD] p-3 md:grid-cols-2"
                      >
                        <div className="relative">
                          <select
                            value={paymentFilter}
                            onChange={(event) => {
                              setPaymentFilter(event.target.value as PaymentStatus | "all");
                              setCurrentPage(1);
                            }}
                            className="h-11 w-full appearance-none rounded-2xl border border-[#E7EAF0] bg-white px-4 pr-10 text-sm text-[#374151] focus:border-[#FFD7BF] focus:outline-none focus:ring-4 focus:ring-[#FFF1E8]"
                          >
                            {PAYMENT_FILTER_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
                        </div>

                        <div className="relative">
                          <select
                            value={fulfillmentFilter}
                            onChange={(event) => {
                              setFulfillmentFilter(
                                event.target.value as FulfillmentState | "all"
                              );
                              setCurrentPage(1);
                            }}
                            className="h-11 w-full appearance-none rounded-2xl border border-[#E7EAF0] bg-white px-4 pr-10 text-sm text-[#374151] focus:border-[#FFD7BF] focus:outline-none focus:ring-4 focus:ring-[#FFF1E8]"
                          >
                            {FULFILLMENT_FILTER_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
                        </div>
                      </div>
                    ) : null}

                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                      <div className="-mx-1 overflow-x-auto pb-1">
                        <div className="flex min-w-max gap-2 px-1 xl:min-w-0 xl:flex-wrap">
                          {statusTabs.map((tab) => (
                            <StatusChip
                              key={tab.value}
                              label={tab.label}
                              count={tab.count}
                              active={statusFilter === tab.value}
                              onClick={() => {
                                setStatusFilter(tab.value as OrderStatus | "all");
                                setCurrentPage(1);
                              }}
                            />
                          ))}
                        </div>
                      </div>
                      <p className="text-sm font-medium text-[#6B7280]">
                        {filteredOrders.length.toLocaleString("tr-TR")} kayıt bulundu
                      </p>
                    </div>
                  </div>
                </div>

                <div className="border-b border-[#EEF1F4] bg-[#FBFCFD] px-4 py-3 md:px-6">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={pageSelectionState}
                          onCheckedChange={handleTogglePageSelection}
                          className="h-5 w-5 rounded-md border-[#D1D5DB] data-[state=checked]:border-[#FF6A00] data-[state=checked]:bg-[#FF6A00]"
                          aria-label="Bu sayfadaki siparişleri seç"
                        />
                        <span className="text-sm font-medium text-[#374151]">
                          {hasSelection
                            ? `${selectedIds.length} sipariş seçildi`
                            : "Bu sayfadaki siparişleri seç"}
                        </span>
                      </div>

                      {hasSelection ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedIds([]);
                              setBulkAction("");
                            }}
                            className="inline-flex h-10 items-center rounded-xl border border-[#E7EAF0] bg-white px-3 text-sm font-medium text-[#6B7280] transition-colors hover:border-[#FFD7BF] hover:text-[#E85D04]"
                          >
                            Seçimi temizle
                          </button>
                          <div className="relative">
                            <select
                              value={bulkAction}
                              onChange={(event) => setBulkAction(event.target.value as BulkAction)}
                              className="h-10 appearance-none rounded-xl border border-[#E7EAF0] bg-white px-3 pr-9 text-sm text-[#374151] focus:border-[#FFD7BF] focus:outline-none focus:ring-4 focus:ring-[#FFF1E8]"
                            >
                              {BULK_ACTION_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            disabled={selectedIds.length === 0 || !bulkAction}
                            loading={isBulkRunning}
                            className="rounded-xl"
                            onClick={runBulkAction}
                          >
                            Uygula
                          </Button>
                        </div>
                      ) : (
                        <p className="text-sm text-[#6B7280]">
                          Çoklu durum güncelleme ve dışa aktarma için seçim yapın.
                        </p>
                      )}
                    </div>

                    <p className="text-sm text-[#6B7280]">
                      {visibleStart}-{visibleEnd} / {filteredOrders.length} sipariş
                    </p>
                  </div>
                </div>

                {errorMessage ? (
                  <div
                    role="alert"
                    className="border-b border-[#FECACA] bg-[#FDECEC] px-4 py-3 text-sm font-medium text-[#B91C1C] md:px-6"
                  >
                    {errorMessage}
                  </div>
                ) : null}

                {filteredOrders.length === 0 ? (
                  <EmptyState hasFilters={hasActiveFilters} onReset={handleResetFilters} />
                ) : (
                  <>
                    <div className="hidden border-b border-[#EEF1F4] bg-[#FBFCFD] px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-[#9CA3AF] xl:grid xl:grid-cols-[32px_minmax(0,1.65fr)_minmax(0,0.95fr)_minmax(0,0.95fr)_minmax(0,1.15fr)_minmax(0,0.72fr)_92px] xl:gap-4 md:px-6">
                      <span />
                      <span>Sipariş / Müşteri</span>
                      <span>Durum</span>
                      <span>Ödeme / Fulfillment</span>
                      <span>Ürün / Teslimat</span>
                      <span>Tutar</span>
                      <span className="text-right">Aksiyonlar</span>
                    </div>

                    <div>
                      {paginatedOrders.map((order) => (
                        <OrderListRow
                          key={order.id}
                          order={order}
                          checked={selectedIds.includes(order.id)}
                          onCheckedChange={(checked) =>
                            handleToggleOrderSelection(order.id, checked)
                          }
                          onQuickStatusChange={updateOrderStatus}
                        />
                      ))}
                    </div>

                    <div className="flex flex-col gap-4 border-t border-[#EEF1F4] bg-[#FBFCFD] px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
                      <div className="flex items-center gap-3 text-sm text-[#6B7280]">
                        <span>Sayfa başına</span>
                        <div className="relative">
                          <select
                            value={pageSize}
                            onChange={(event) => {
                              setPageSize(Number(event.target.value));
                              setCurrentPage(1);
                            }}
                            className="h-10 appearance-none rounded-xl border border-[#E7EAF0] bg-white px-3 pr-8 text-sm text-[#374151] focus:border-[#FFD7BF] focus:outline-none focus:ring-4 focus:ring-[#FFF1E8]"
                          >
                            {ITEMS_PER_PAGE_OPTIONS.map((size) => (
                              <option key={size} value={size}>
                                {size}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
                        </div>
                        <span>kayıt</span>
                      </div>

                      <div className="flex items-center gap-2 self-end md:self-auto">
                        <button
                          type="button"
                          onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                          disabled={currentPage === 1}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#E7EAF0] bg-white text-[#6B7280] transition-colors hover:border-[#FFD7BF] hover:text-[#E85D04] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>

                        <div className="flex items-center gap-1">
                          {paginationNumbers.map((pageNumber) => (
                            <button
                              key={pageNumber}
                              type="button"
                              onClick={() => setCurrentPage(pageNumber)}
                              className={cn(
                                "inline-flex h-10 min-w-10 items-center justify-center rounded-xl px-3 text-sm font-semibold transition-colors",
                                pageNumber === currentPage
                                  ? "bg-[#FF6A00] text-white shadow-[0_12px_24px_rgba(255,106,0,0.18)]"
                                  : "border border-[#E7EAF0] bg-white text-[#374151] hover:border-[#FFD7BF] hover:text-[#E85D04]"
                              )}
                            >
                              {pageNumber}
                            </button>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setCurrentPage((page) => Math.min(totalPages, page + 1))
                          }
                          disabled={currentPage === totalPages}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#E7EAF0] bg-white text-[#6B7280] transition-colors hover:border-[#FFD7BF] hover:text-[#E85D04] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
