"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  Ban,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Copy,
  Eye,
  Filter,
  GripVertical,
  Loader2,
  MoreHorizontal,
  Package2,
  Plus,
  Printer,
  RefreshCcw,
  Search,
  SlidersHorizontal,
  Truck,
  XCircle,
} from "lucide-react";
import type { CheckedState } from "@radix-ui/react-checkbox";
import { fetchAdminJson } from "@/lib/admin-client-fetch";
import { cn } from "@/lib/utils";
import { AdminDataTable } from "@/components/admin/AdminPageShell";
import { AdminTopbarBridge } from "@/components/admin/AdminTopbarChrome";
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
  salesChannel?: string;
};

type SortOption = "newest" | "oldest" | "highest" | "lowest";
type DateRangeOption = "all" | "today" | "last7" | "last30" | "thisMonth";
type FulfillmentState = "none" | "waiting" | "preparing" | "shipped" | "delivered";
type ActiveFilterKey = "search" | "status" | "date" | "payment" | "fulfillment";
type OrderColumnKey =
  | "order"
  | "date"
  | "customer"
  | "status"
  | "payment"
  | "total"
  | "channel";
type BulkAction =
  | ""
  | "confirm"
  | "prepare"
  | "ship"
  | "deliver"
  | "cancel"
  | "export";

const ITEMS_PER_PAGE_OPTIONS = [10, 20, 50];

const DEFAULT_VISIBLE_COLUMNS: Record<OrderColumnKey, boolean> = {
  order: true,
  date: true,
  customer: true,
  status: true,
  payment: true,
  total: true,
  channel: true,
};

const ORDER_TABLE_COLUMNS: { key: OrderColumnKey; label: string }[] = [
  { key: "order", label: "Sipariş" },
  { key: "date", label: "Tarih" },
  { key: "customer", label: "Müşteri" },
  { key: "status", label: "Sipariş Durumu" },
  { key: "payment", label: "Ödeme Durumu" },
  { key: "total", label: "Toplam Tutar" },
  { key: "channel", label: "Satış Kanalı" },
];

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
  confirmed: "border-[#FFD7BF] bg-[#FFF1E8] text-[#E85D04]",
  preparing: "border-[#FFD7BF] bg-[#FFF1E8] text-[#E85D04]",
  shipped: "border-[#FFD7BF] bg-[#FFF1E8] text-[#E85D04]",
  delivered: "border-[#BBF7D0] bg-[#EAF8EF] text-[#15803D]",
  cancelled: "border-[#FECACA] bg-[#FDECEC] text-[#DC2626]",
  refunded: "border-[#FFD7BF] bg-[#FFF1E8] text-[#E85D04]",
};

const PAYMENT_STATUS_STYLES: Record<PaymentStatus, string> = {
  pending: "border-[#FDE68A] bg-[#FFF7E8] text-[#B45309]",
  processing: "border-[#FFD7BF] bg-[#FFF1E8] text-[#E85D04]",
  completed: "border-[#BBF7D0] bg-[#EAF8EF] text-[#15803D]",
  failed: "border-[#FECACA] bg-[#FDECEC] text-[#DC2626]",
  refunded: "border-[#FFD7BF] bg-[#FFF1E8] text-[#E85D04]",
};

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Ödeme Bekleniyor",
  processing: "İşleniyor",
  completed: "Başarılı",
  failed: "Başarısız",
  refunded: "İade edildi",
};

const ORDER_TABLE_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Oluşturuldu",
  confirmed: "Onaylandı",
  preparing: "Hazırlanıyor",
  shipped: "Kargolandı",
  delivered: "Teslim edildi",
  cancelled: "İptal",
  refunded: "İade",
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
    className: "border-[#FFD7BF] bg-[#FFF1E8] text-[#E85D04]",
  },
  preparing: {
    label: "Hazırlanıyor",
    className: "border-[#FDE68A] bg-[#FFF7E8] text-[#B45309]",
  },
  shipped: {
    label: "Kargolandı",
    className: "border-[#FFD7BF] bg-[#FFF1E8] text-[#E85D04]",
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
    salesChannel:
      typeof dbOrder.sales_channel === "string"
        ? dbOrder.sales_channel
        : typeof dbOrder.channel === "string"
          ? dbOrder.channel
          : typeof dbOrder.source === "string"
            ? dbOrder.source
            : typeof dbOrder.order_source === "string"
              ? dbOrder.order_source
              : undefined,
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

function getSalesChannelLabel(order: DisplayOrder) {
  const rawChannel = order.salesChannel?.trim();
  if (rawChannel) return rawChannel;
  if (order.paymentMethod === "cash-on-delivery") return "Manuel Sipariş";
  return "Online Mağaza";
}

function formatOrderDateLabel(date: Date) {
  const today = startOfDay(new Date()).getTime();
  const target = startOfDay(date).getTime();
  if (target === today) return "Bugün";
  return formatDate(date);
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

function TableHeaderCell({
  children,
  sortable = false,
  active = false,
  onClick,
  className,
}: {
  children: ReactNode;
  sortable?: boolean;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const content = (
    <>
      <span>{children}</span>
      {sortable ? (
        <ChevronDown
          className={cn(
            "h-4 w-4 transition-colors",
            active ? "text-[#E85D04]" : "text-[#8A94A6]",
          )}
        />
      ) : null}
    </>
  );

  return (
    <th
      scope="col"
      className={cn(
        "whitespace-nowrap px-4 py-3 text-left text-[14px] font-semibold text-[#5E6878]",
        className,
      )}
    >
      {sortable && onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="inline-flex items-center gap-2 transition-colors hover:text-[#E85D04]"
        >
          {content}
        </button>
      ) : (
        <span className="inline-flex items-center gap-2">{content}</span>
      )}
    </th>
  );
}

function ColumnSettingsMenu({
  visibleColumns,
  onToggleColumn,
}: {
  visibleColumns: Record<OrderColumnKey, boolean>;
  onToggleColumn: (column: OrderColumnKey) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Tablo sütunlarını düzenle"
          className="inline-flex h-11 w-11 items-center justify-center rounded-[7px] border border-[#E1E6EF] bg-white text-[#6B7280] shadow-[0_1px_2px_rgba(17,24,39,0.025)] transition-colors hover:border-[#FFD7BF] hover:bg-[#FFF8F3] hover:text-[#E85D04]"
        >
          <SlidersHorizontal className="h-5 w-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[280px] rounded-[12px] border-[#E1E6EF] bg-white p-2 shadow-[0_18px_48px_rgba(15,23,42,0.14)]"
      >
        {ORDER_TABLE_COLUMNS.map((column) => {
          const enabled = visibleColumns[column.key];

          return (
            <DropdownMenuItem
              key={column.key}
              onSelect={(event) => {
                event.preventDefault();
                onToggleColumn(column.key);
              }}
              className="flex cursor-pointer items-center gap-3 rounded-[8px] px-3 py-2.5 text-[14px] font-semibold text-[#1F2937] focus:bg-[#FFF8F3] focus:text-[#E85D04]"
            >
              <GripVertical className="h-4 w-4 shrink-0 text-[#8A94A6]" />
              <span className="min-w-0 flex-1 truncate">{column.label}</span>
              <span
                aria-hidden="true"
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors",
                  enabled ? "bg-[#FF6A00]" : "bg-[#D6DEE8]",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-[0_1px_3px_rgba(15,23,42,0.24)] transition-transform",
                    enabled ? "translate-x-[18px]" : "translate-x-0.5",
                  )}
                />
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
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
    <div>
      <div className="border-b border-[#E8EDF4] px-4 py-5 md:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row">
            <Skeleton className="h-11 w-full rounded-[7px] bg-[#EEF1F4] sm:max-w-[420px]" />
            <Skeleton className="h-11 w-28 rounded-[7px] bg-[#EEF1F4]" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-11 w-11 rounded-[7px] bg-[#EEF1F4]" />
            <Skeleton className="h-11 w-11 rounded-[7px] bg-[#EEF1F4]" />
          </div>
        </div>
      </div>

      <div className="max-w-full overflow-x-auto">
        <div className="min-w-[1180px]">
          <div className="grid grid-cols-[48px_150px_130px_260px_170px_190px_150px_190px_104px] bg-[#EEF2F6] px-4 py-3">
            {Array.from({ length: 9 }).map((_, index) => (
              <Skeleton key={index} className="h-5 w-20 rounded bg-[#E1E6EF]" />
            ))}
          </div>
          {Array.from({ length: 5 }).map((_, rowIndex) => (
            <div
              key={rowIndex}
              className="grid grid-cols-[48px_150px_130px_260px_170px_190px_150px_190px_104px] border-b border-[#EEF1F4] px-4 py-4"
            >
              {Array.from({ length: 9 }).map((__, cellIndex) => (
                <Skeleton
                  key={cellIndex}
                  className={cn(
                    "h-6 rounded bg-[#EEF1F4]",
                    cellIndex === 0 ? "w-5" : "w-24",
                    cellIndex === 3 ? "w-44" : "",
                  )}
                />
              ))}
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
  visibleColumns,
}: {
  order: DisplayOrder;
  checked: boolean;
  onCheckedChange: (checked: CheckedState) => void;
  onQuickStatusChange: (orderId: string, status: OrderStatus) => Promise<void>;
  visibleColumns: Record<OrderColumnKey, boolean>;
}) {
  const paymentClass = PAYMENT_STATUS_STYLES[order.paymentStatus];
  const customerEmail = getCustomerEmail(order);
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <tr
      aria-selected={checked}
      className={cn(
        "border-b border-[#EEF1F4] text-[14px] transition-colors last:border-b-0",
        checked ? "bg-[#FFF8F3]" : "bg-white hover:bg-[#FFFCF9]",
      )}
    >
      <td className="w-12 px-4 py-4 align-middle">
        <Checkbox
          checked={checked}
          onCheckedChange={onCheckedChange}
          className="h-5 w-5 rounded-md border-[#D7DEE8] data-[state=checked]:border-[#FF6A00] data-[state=checked]:bg-[#FF6A00]"
          aria-label={`#${order.orderNumber} siparişini seç`}
        />
      </td>

      {visibleColumns.order ? (
        <td className="min-w-[150px] px-4 py-4 align-middle">
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/siparisler/${order.id}`}
              className="font-semibold tracking-[-0.01em] text-[#111827] transition-colors hover:text-[#E85D04]"
            >
              {order.orderNumber}
            </Link>
            {order.couponCode ? (
              <span className="rounded-[6px] border border-[#FFD7BF] bg-[#FFF1E8] px-2 py-0.5 text-[11px] font-semibold text-[#E85D04]">
                Kupon
              </span>
            ) : null}
          </div>
        </td>
      ) : null}

      {visibleColumns.date ? (
        <td className="min-w-[130px] px-4 py-4 align-middle">
          <div className="space-y-1">
            <p className="font-semibold text-[#1F2937]">{formatOrderDateLabel(order.createdAt)}</p>
            <p className="text-[13px] font-medium text-[#6B7280]">{formatTime(order.createdAt)}</p>
          </div>
        </td>
      ) : null}

      {visibleColumns.customer ? (
        <td className="min-w-[260px] px-4 py-4 align-middle">
          <div className="min-w-0 space-y-1">
            <p className="max-w-[260px] truncate font-semibold text-[#1F2937]">
              {getCustomerName(order)}
            </p>
            <p className="max-w-[260px] truncate text-[13px] font-medium text-[#6B7280]">
              {customerEmail}
            </p>
          </div>
        </td>
      ) : null}

      {visibleColumns.status ? (
        <td className="min-w-[170px] px-4 py-4 align-middle">
          <ToneBadge
            label={ORDER_TABLE_STATUS_LABELS[order.status]}
            className={ORDER_STATUS_STYLES[order.status]}
          />
        </td>
      ) : null}

      {visibleColumns.payment ? (
        <td className="min-w-[190px] px-4 py-4 align-middle">
          <ToneBadge
            label={PAYMENT_STATUS_LABELS[order.paymentStatus]}
            className={paymentClass}
          />
        </td>
      ) : null}

      {visibleColumns.total ? (
        <td className="min-w-[150px] px-4 py-4 align-middle">
          <div className="space-y-1">
            <p className="font-semibold text-[#111827]">{formatPrice(order.total)}</p>
            <p className="text-[13px] font-semibold text-[#E85D04]">
              {itemCount.toLocaleString("tr-TR")} ürün
            </p>
          </div>
        </td>
      ) : null}

      {visibleColumns.channel ? (
        <td className="min-w-[190px] px-4 py-4 align-middle">
          <div className="inline-flex min-w-0 items-center gap-2 text-[#1F2937]">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] border border-[#E1E6EF] bg-[#F9F9F9] text-[#6B7280]">
              <ClipboardList className="h-4 w-4" />
            </span>
            <span className="max-w-[140px] truncate font-semibold">
              {getSalesChannelLabel(order)}
            </span>
          </div>
        </td>
      ) : null}

      <td className="w-[104px] px-4 py-4 align-middle">
        <div className="flex items-center justify-end gap-2">
          <Link
            href={`/admin/siparisler/${order.id}`}
            aria-label={`#${order.orderNumber} detayını görüntüle`}
            className={cn(
              buttonVariants({ variant: "secondary", size: "sm" }),
              "h-9 w-9 rounded-[7px] border-[#E1E6EF] bg-white px-0 text-[#6B7280] shadow-none hover:border-[#FFD7BF] hover:bg-[#FFF8F3] hover:text-[#E85D04]"
            )}
          >
            <Eye className="h-4 w-4" />
          </Link>
          <RowActionMenu order={order} onQuickStatusChange={onQuickStatusChange} />
        </div>
      </td>
    </tr>
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
  const [pageSize, setPageSize] = useState(20);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<BulkAction>("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [visibleColumns, setVisibleColumns] =
    useState<Record<OrderColumnKey, boolean>>(DEFAULT_VISIBLE_COLUMNS);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isBulkRunning, setIsBulkRunning] = useState(false);

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

  const handleToggleColumn = (column: OrderColumnKey) => {
    setVisibleColumns((current) => {
      const visibleCount = Object.values(current).filter(Boolean).length;
      if (current[column] && visibleCount <= 1) {
        return current;
      }

      return {
        ...current,
        [column]: !current[column],
      };
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
    <main className="min-h-screen bg-[#F9F9F9]">
      <AdminTopbarBridge
        title="Siparişler"
        subtitle="Sipariş, ödeme ve teslimat akışını yönetin."
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              className="h-11 gap-2 rounded-[7px] border-[#E1E6EF] bg-white px-4 text-[14px] font-semibold text-[#1F2937] shadow-none hover:border-[#FFD7BF] hover:bg-[#FFF8F3] hover:text-[#E85D04]"
              onClick={() => exportOrdersCsv(filteredOrders)}
            >
              <ArrowDownToLine className="h-4.5 w-4.5 text-[#6B7280]" />
              Dışa Aktar
            </Button>
            <Link
              href="/admin/siparisler/hizli-siparis"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-[7px] bg-[#FF6A00] px-4 text-[14px] font-semibold text-white shadow-[0_12px_24px_rgba(255,106,0,0.16)] transition-colors hover:bg-[#E85D04] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.18)]"
            >
              <Plus className="h-4.5 w-4.5" />
              Sipariş Oluştur
            </Link>
          </>
        }
      />
      <div className="w-full px-0 py-3 md:py-5">
        <section className="min-w-0">
          {loading ? (
            <OrdersPageSkeleton />
          ) : (
            <AdminDataTable className="rounded-none border-0 bg-transparent shadow-none">
              <div className="border-b border-[#E1E6EF] bg-[#F9F9F9] px-0 py-4 md:py-5">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-3 min-[1180px]:flex-row min-[1180px]:items-center min-[1180px]:justify-between">
                    <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
                      <label className="relative block w-full sm:max-w-[420px]">
                        <Search className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-[#7B8797]" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(event) => {
                            setSearchQuery(event.target.value);
                            setCurrentPage(1);
                          }}
                          placeholder="Tabloda arama yapın"
                          className="h-11 w-full rounded-[7px] border border-[#E1E6EF] bg-white pl-11 pr-4 text-[14px] font-medium text-[#111827] outline-none transition placeholder:text-[#7B8797] focus:border-[#FFD7BF] focus:ring-4 focus:ring-[#FFF1E8]"
                        />
                      </label>

                      <Button
                        type="button"
                        variant="secondary"
                        className={cn(
                          "h-11 justify-center gap-2 rounded-[7px] border-[#E1E6EF] bg-white px-4 text-[14px] font-semibold text-[#1F2937] shadow-none hover:border-[#FFD7BF] hover:bg-[#FFF8F3] hover:text-[#E85D04]",
                          showAdvancedFilters || activeFilterCount > 0
                            ? "border-[#FFD7BF] bg-[#FFF1E8] text-[#E85D04]"
                            : "",
                        )}
                        onClick={() => setShowAdvancedFilters((current) => !current)}
                        aria-expanded={showAdvancedFilters}
                        aria-controls="orders-advanced-filters"
                      >
                        <Filter className="h-4.5 w-4.5" />
                        Filtre
                        {activeFilterCount > 0 ? (
                          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-[11px] font-semibold text-[#E85D04]">
                            {activeFilterCount}
                          </span>
                        ) : null}
                      </Button>
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-11 w-11 rounded-[7px] border-[#E1E6EF] bg-white px-0 text-[#6B7280] shadow-none hover:border-[#FFD7BF] hover:bg-[#FFF8F3] hover:text-[#E85D04]"
                        onClick={handleRefresh}
                        aria-label="Sipariş listesini yenile"
                      >
                        {isRefreshing ? (
                          <Loader2 className="h-4.5 w-4.5 animate-spin" />
                        ) : (
                          <RefreshCcw className="h-4.5 w-4.5" />
                        )}
                      </Button>
                      <ColumnSettingsMenu
                        visibleColumns={visibleColumns}
                        onToggleColumn={handleToggleColumn}
                      />
                    </div>
                  </div>

                  {showAdvancedFilters ? (
                    <div
                      id="orders-advanced-filters"
                      className="grid gap-3 border-y border-[#E1E6EF] bg-[#F9F9F9] py-3 md:grid-cols-2 xl:grid-cols-5"
                    >
                      <div className="relative">
                        <select
                          value={statusFilter}
                          onChange={(event) => {
                            setStatusFilter(event.target.value as OrderStatus | "all");
                            setCurrentPage(1);
                          }}
                          className="h-11 w-full appearance-none rounded-[7px] border border-[#E1E6EF] bg-white px-3 pr-9 text-[14px] font-medium text-[#374151] outline-none focus:border-[#FFD7BF] focus:ring-4 focus:ring-[#FFF1E8]"
                        >
                          <option value="all">Tüm durumlar</option>
                          {ORDER_STATUS_SEQUENCE.map((status) => (
                            <option key={status} value={status}>
                              {ORDER_TABLE_STATUS_LABELS[status]}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7B8797]" />
                      </div>

                      <div className="relative">
                        <CalendarRange className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7B8797]" />
                        <select
                          value={dateRange}
                          onChange={(event) => {
                            setDateRange(event.target.value as DateRangeOption);
                            setCurrentPage(1);
                          }}
                          className="h-11 w-full appearance-none rounded-[7px] border border-[#E1E6EF] bg-white pl-9 pr-9 text-[14px] font-medium text-[#374151] outline-none focus:border-[#FFD7BF] focus:ring-4 focus:ring-[#FFF1E8]"
                        >
                          {DATE_RANGE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7B8797]" />
                      </div>

                      <div className="relative">
                        <select
                          value={paymentFilter}
                          onChange={(event) => {
                            setPaymentFilter(event.target.value as PaymentStatus | "all");
                            setCurrentPage(1);
                          }}
                          className="h-11 w-full appearance-none rounded-[7px] border border-[#E1E6EF] bg-white px-3 pr-9 text-[14px] font-medium text-[#374151] outline-none focus:border-[#FFD7BF] focus:ring-4 focus:ring-[#FFF1E8]"
                        >
                          {PAYMENT_FILTER_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7B8797]" />
                      </div>

                      <div className="relative">
                        <select
                          value={fulfillmentFilter}
                          onChange={(event) => {
                            setFulfillmentFilter(
                              event.target.value as FulfillmentState | "all",
                            );
                            setCurrentPage(1);
                          }}
                          className="h-11 w-full appearance-none rounded-[7px] border border-[#E1E6EF] bg-white px-3 pr-9 text-[14px] font-medium text-[#374151] outline-none focus:border-[#FFD7BF] focus:ring-4 focus:ring-[#FFF1E8]"
                        >
                          {FULFILLMENT_FILTER_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7B8797]" />
                      </div>

                      <div className="relative">
                        <select
                          value={sortBy}
                          onChange={(event) => setSortBy(event.target.value as SortOption)}
                          className="h-11 w-full appearance-none rounded-[7px] border border-[#E1E6EF] bg-white px-3 pr-9 text-[14px] font-medium text-[#374151] outline-none focus:border-[#FFD7BF] focus:ring-4 focus:ring-[#FFF1E8]"
                        >
                          {SORT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7B8797]" />
                      </div>
                    </div>
                  ) : null}

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
                        className="h-8 rounded-[7px] px-3 text-xs font-semibold text-[#6B7280] hover:bg-[#FFF8F3] hover:text-[#E85D04]"
                        onClick={handleResetFilters}
                      >
                        Tümünü temizle
                      </Button>
                    </div>
                  ) : null}

                  {hasSelection ? (
                    <div className="flex flex-col gap-3 rounded-[10px] border border-[#FFD7BF] bg-[#FFF8F3] p-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-[#1F2937]">
                          {selectedIds.length} sipariş seçildi
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedIds([]);
                            setBulkAction("");
                          }}
                          className="inline-flex h-9 items-center rounded-[7px] border border-[#FFD7BF] bg-white px-3 text-sm font-semibold text-[#E85D04] transition-colors hover:bg-[#FFF1E8]"
                        >
                          Seçimi temizle
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <div className="relative">
                          <select
                            value={bulkAction}
                            onChange={(event) => setBulkAction(event.target.value as BulkAction)}
                            className="h-9 appearance-none rounded-[7px] border border-[#FFD7BF] bg-white px-3 pr-9 text-sm text-[#374151] outline-none focus:border-[#E85D04] focus:ring-4 focus:ring-[#FFF1E8]"
                          >
                            {BULK_ACTION_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7B8797]" />
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          disabled={selectedIds.length === 0 || !bulkAction}
                          loading={isBulkRunning}
                          className="h-9 rounded-[7px] bg-[#FF6A00] px-4 text-white hover:bg-[#E85D04]"
                          onClick={runBulkAction}
                        >
                          Uygula
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              {errorMessage ? (
                <div
                  role="alert"
                  className="border-b border-[#FECACA] bg-[#FDECEC] px-4 py-3 text-sm font-medium text-[#B91C1C] md:px-5"
                >
                  {errorMessage}
                </div>
              ) : null}

              {filteredOrders.length === 0 ? (
                <EmptyState hasFilters={hasActiveFilters} onReset={handleResetFilters} />
              ) : (
                <>
                  <div className="max-w-full overflow-x-auto">
                    <table className="w-full min-w-[1180px] border-collapse">
                      <thead className="bg-[#EEF2F6]">
                        <tr>
                          <th scope="col" className="w-12 px-4 py-3 text-left">
                            <Checkbox
                              checked={pageSelectionState}
                              onCheckedChange={handleTogglePageSelection}
                              className="h-5 w-5 rounded-md border-[#D7DEE8] bg-white data-[state=checked]:border-[#FF6A00] data-[state=checked]:bg-[#FF6A00]"
                              aria-label="Bu sayfadaki siparişleri seç"
                            />
                          </th>
                          {visibleColumns.order ? (
                            <TableHeaderCell
                              sortable
                              className="w-[150px]"
                              onClick={() =>
                                setSortBy(sortBy === "newest" ? "oldest" : "newest")
                              }
                              active={sortBy === "newest" || sortBy === "oldest"}
                            >
                              Sipariş
                            </TableHeaderCell>
                          ) : null}
                          {visibleColumns.date ? (
                            <TableHeaderCell
                              sortable
                              className="w-[130px]"
                              onClick={() =>
                                setSortBy(sortBy === "newest" ? "oldest" : "newest")
                              }
                              active={sortBy === "newest" || sortBy === "oldest"}
                            >
                              Tarih
                            </TableHeaderCell>
                          ) : null}
                          {visibleColumns.customer ? (
                            <TableHeaderCell className="w-[260px]">Müşteri</TableHeaderCell>
                          ) : null}
                          {visibleColumns.status ? (
                            <TableHeaderCell className="w-[170px]">
                              Sipariş Durumu
                            </TableHeaderCell>
                          ) : null}
                          {visibleColumns.payment ? (
                            <TableHeaderCell className="w-[190px]">
                              Ödeme Durumu
                            </TableHeaderCell>
                          ) : null}
                          {visibleColumns.total ? (
                            <TableHeaderCell
                              sortable
                              className="w-[150px]"
                              onClick={() =>
                                setSortBy(sortBy === "highest" ? "lowest" : "highest")
                              }
                              active={sortBy === "highest" || sortBy === "lowest"}
                            >
                              Toplam Tutar
                            </TableHeaderCell>
                          ) : null}
                          {visibleColumns.channel ? (
                            <TableHeaderCell className="w-[190px]">Satış Kanalı</TableHeaderCell>
                          ) : null}
                          <th scope="col" className="w-[104px] px-4 py-3 text-right">
                            <span className="sr-only">Aksiyonlar</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedOrders.map((order) => (
                          <OrderListRow
                            key={order.id}
                            order={order}
                            checked={selectedIds.includes(order.id)}
                            visibleColumns={visibleColumns}
                            onCheckedChange={(checked) =>
                              handleToggleOrderSelection(order.id, checked)
                            }
                            onQuickStatusChange={updateOrderStatus}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-col gap-4 border-t border-[#E1E6EF] bg-[#F9F9F9] px-0 py-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex flex-wrap items-center gap-3 text-[14px] font-medium text-[#5E6878]">
                      <span>Satır Adedi:</span>
                      <div className="relative">
                        <select
                          value={pageSize}
                          onChange={(event) => {
                            setPageSize(Number(event.target.value));
                            setCurrentPage(1);
                          }}
                          className="h-9 appearance-none rounded-[7px] border border-[#E1E6EF] bg-white px-3 pr-8 text-[14px] font-semibold text-[#1F2937] outline-none focus:border-[#FFD7BF] focus:ring-4 focus:ring-[#FFF1E8]"
                        >
                          {ITEMS_PER_PAGE_OPTIONS.map((size) => (
                            <option key={size} value={size}>
                              {size}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7B8797]" />
                      </div>
                      <span>
                        {visibleStart} - {visibleEnd} / {filteredOrders.length} Sipariş
                      </span>
                    </div>

                    <div className="flex items-center gap-2 self-end md:self-auto">
                      <button
                        type="button"
                        onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                        disabled={currentPage === 1}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-[7px] border border-[#E1E6EF] bg-white text-[#6B7280] transition-colors hover:border-[#FFD7BF] hover:text-[#E85D04] disabled:cursor-not-allowed disabled:opacity-40"
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
                              "inline-flex h-9 min-w-9 items-center justify-center rounded-[7px] px-3 text-sm font-semibold transition-colors",
                              pageNumber === currentPage
                                ? "bg-[#FF6A00] text-white shadow-[0_10px_20px_rgba(255,106,0,0.16)]"
                                : "border border-[#E1E6EF] bg-white text-[#374151] hover:border-[#FFD7BF] hover:text-[#E85D04]",
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
                        className="inline-flex h-9 w-9 items-center justify-center rounded-[7px] border border-[#E1E6EF] bg-white text-[#6B7280] transition-colors hover:border-[#FFD7BF] hover:text-[#E85D04] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </AdminDataTable>
          )}
        </section>
      </div>
    </main>
  );
}
