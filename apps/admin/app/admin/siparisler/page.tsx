"use client";

import { useEffect, useMemo, useState } from "react";
import { ORDER_STATUS_CONFIG } from "@/types/order";
import type { Order, OrderStatus } from "@/types/order";
import {
  Activity,
  Calendar,
  ChevronDown,
  Clock,
  Download,
  Eye,
  FileText,
  ListFilter,
  MapPin,
  Package,
  Search,
  Trash2,
  User,
  X,
} from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { fetchAdminJson } from "@/lib/admin-client-fetch";
import { cn } from "@/lib/utils";

function transformOrder(dbOrder: Record<string, unknown>): Order {
  return {
    id: dbOrder.id as string,
    orderNumber: dbOrder.order_number as string,
    userId: (dbOrder.user_id as string) || "",
    customerEmail: (dbOrder.customer_email as string) || "",
    items: ((dbOrder.items as Record<string, unknown>[]) || []).map((item) => ({
      productId: item.product_id as string,
      variantId: item.variant_id as string,
      productName: item.product_name as string,
      variantName: item.variant_name as string,
      price: Number(item.price) || 0,
      quantity: Number(item.quantity) || 0,
      total: Number(item.total) || 0,
    })),
    subtotal: Number(dbOrder.subtotal) || 0,
    shipping: Number(dbOrder.shipping_cost) || 0,
    discount: Number(dbOrder.discount) || 0,
    total: Number(dbOrder.total) || 0,
    status: ((dbOrder.status as OrderStatus) || "pending") as OrderStatus,
    paymentStatus: (dbOrder.payment_status as Order["paymentStatus"]) || "pending",
    paymentMethod: (dbOrder.payment_method as Order["paymentMethod"]) || "credit-card",
    shippingAddress: (dbOrder.shipping_address as Order["shippingAddress"]) || {
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      address: "",
      city: "",
      district: "",
      postalCode: "",
    },
    shippingInfo: {
      method: "standard",
      company: "",
      trackingNumber: "",
      cost: 0,
    },
    createdAt: new Date(dbOrder.created_at as string),
    updatedAt: new Date(dbOrder.updated_at as string),
  };
}

type SortOption = "newest" | "oldest" | "highest" | "lowest";

const sortOptions: { value: SortOption; label: string }[] = [
  { value: "newest", label: "En yeni" },
  { value: "oldest", label: "En eski" },
  { value: "highest", label: "Tutar: yüksekten düşüğe" },
  { value: "lowest", label: "Tutar: düşükten yükseğe" },
];

const FILTERABLE_STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
];

const ANIMATION_EASE = [0.22, 1, 0.36, 1] as const;

const STATUS_COLOR_MAP: Record<string, string> = {
  yellow: "border-amber-200 bg-amber-100/90 text-amber-700",
  blue: "border-sky-200 bg-sky-100/90 text-sky-700",
  purple: "border-violet-200 bg-violet-100/90 text-violet-700",
  indigo: "border-indigo-200 bg-indigo-100/90 text-indigo-700",
  green: "border-emerald-200 bg-emerald-100/90 text-emerald-700",
  red: "border-rose-200 bg-rose-100/90 text-rose-700",
  orange: "border-orange-200 bg-orange-100/90 text-orange-700",
};

const PAYMENT_STATUS_LABELS: Record<Order["paymentStatus"], string> = {
  pending: "Ödeme bekleniyor",
  processing: "Ödeme işleniyor",
  completed: "Ödeme tamamlandı",
  failed: "Ödeme hatası",
  refunded: "Ödeme iade edildi",
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
  }).format(price);
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function getPaymentMethodIcon(method: string) {
  const icons: Record<string, string> = {
    cod: "💵",
    bank_transfer: "🏦",
    credit_card: "💳",
    paytr: "💳",
    iyzico: "💳",
    stripe: "💳",
  };

  return icons[method] || "💳";
}

function getPaymentMethodName(method: string | undefined) {
  const names: Record<string, string> = {
    cod: "Kapıda ödeme",
    bank_transfer: "Havale/EFT",
    credit_card: "Kredi kartı",
    paytr: "PAYTR",
    iyzico: "İyzico",
    stripe: "Stripe",
  };

  return names[method || ""] || method || "Bilinmiyor";
}

function SummaryCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: string;
}) {
  return (
    <div className={cn("border border-white/70 bg-white/70 px-5 py-5 backdrop-blur-sm md:px-6", tone)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-gray-950 md:text-[30px]">{value}</p>
      <p className="mt-1 text-sm text-gray-600">{hint}</p>
    </div>
  );
}

function StatsCard({
  title,
  value,
  icon: Icon,
  tone,
}: {
  title: string;
  value: string;
  icon: typeof Package;
  tone: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: ANIMATION_EASE }}
      className="overflow-hidden rounded-[28px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] shadow-[0_18px_55px_rgba(0,0,0,0.08)]"
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-600">{title}</p>
            <p className="mt-2 text-[30px] font-semibold tracking-[-0.05em] text-gray-950">{value}</p>
          </div>
          <div className={cn("flex h-12 w-12 items-center justify-center rounded-2xl border bg-gradient-to-br shadow-sm", tone)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function OrdersLoadingState() {
  return (
    <div className="space-y-3 p-5 md:p-6">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="animate-pulse rounded-[24px] border border-[#FE6100]/8 bg-white/80 p-5"
        >
          <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[1.25fr_0.8fr_0.95fr_0.6fr_0.3fr] xl:items-center">
            <div className="space-y-3">
              <div className="h-4 w-32 rounded-full bg-gray-200" />
              <div className="h-3 w-48 rounded-full bg-gray-100" />
              <div className="h-3 w-40 rounded-full bg-gray-100" />
            </div>
            <div className="space-y-3">
              <div className="h-7 w-24 rounded-full bg-gray-200" />
              <div className="h-3 w-32 rounded-full bg-gray-100" />
            </div>
            <div className="space-y-3">
              <div className="h-3 w-24 rounded-full bg-gray-100" />
              <div className="h-3 w-40 rounded-full bg-gray-100" />
            </div>
            <div className="space-y-3 xl:text-right">
              <div className="h-4 w-24 rounded-full bg-gray-200 xl:ml-auto" />
              <div className="h-3 w-16 rounded-full bg-gray-100 xl:ml-auto" />
            </div>
            <div className="flex gap-2 xl:justify-end">
              <div className="h-10 w-10 rounded-2xl bg-gray-100" />
              <div className="h-10 w-10 rounded-2xl bg-gray-100" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [currentPage, setCurrentPage] = useState(1);

  const ITEMS_PER_PAGE = 10;

  const loadOrders = async () => {
    setLoading(true);
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
      setErrorMessage(error instanceof Error ? error.message : "Siparişler yüklenemedi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const filteredOrders = orders
    .filter((order) => {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch =
        order.orderNumber.toLowerCase().includes(searchLower) ||
        `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`
          .toLowerCase()
          .includes(searchLower) ||
        order.customerEmail?.toLowerCase().includes(searchLower);
      const matchesStatus = statusFilter === "all" || order.status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "newest":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "oldest":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "highest":
          return b.total - a.total;
        case "lowest":
          return a.total - b.total;
        default:
          return 0;
      }
    });

  const totalPages = Math.ceil(filteredOrders.length / ITEMS_PER_PAGE);
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const stats = {
    total: orders.length,
    pending: orders.filter((o) => o.status === "pending").length,
    today: orders.filter((o) => {
      const today = new Date();
      const orderDate = new Date(o.createdAt);
      return (
        orderDate.getDate() === today.getDate() &&
        orderDate.getMonth() === today.getMonth() &&
        orderDate.getFullYear() === today.getFullYear()
      );
    }).length,
    revenue: orders.reduce((sum, o) => sum + o.total, 0),
  };

  const statusTabs = useMemo(
    () => [
      { value: "all", label: "Tümü", count: orders.length },
      ...FILTERABLE_STATUSES.map((status) => ({
        value: status,
        label: ORDER_STATUS_CONFIG[status].label,
        count: orders.filter((order) => order.status === status).length,
      })),
    ],
    [orders]
  );

  const handleDelete = async (orderId: string, orderNumber: string) => {
    if (!confirm(`#${orderNumber} siparişini silmek istediğinizden emin misiniz?`)) return;

    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, { method: "DELETE" });
      if (res.ok) {
        await loadOrders();
      } else {
        alert("Sipariş silinirken bir hata oluştu.");
      }
    } catch (error) {
      console.error("Failed to delete order:", error);
    }
  };

  const hasActiveFilters = Boolean(searchQuery.trim()) || statusFilter !== "all";
  const visibleStart = filteredOrders.length === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const visibleEnd = Math.min(currentPage * ITEMS_PER_PAGE, filteredOrders.length);

  return (
    <main
      role="main"
      aria-busy={loading}
      className="min-h-screen bg-gradient-to-br from-[#faf8f5] via-[#f5f0eb] to-[#f0e8e0]"
    >
      <div className="mx-auto max-w-[1600px] px-4 py-6 md:px-6 md:py-8 lg:px-8">
        <div className="space-y-8">
          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: ANIMATION_EASE }}
            className="overflow-hidden rounded-[30px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] shadow-[0_24px_80px_rgba(254,97,0,0.12)]"
          >
            <div className="border-b border-[#FE6100]/8 px-6 py-6 md:px-8 md:py-7">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                <div className="max-w-3xl space-y-4">
                  <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#FE6100]/20 bg-gradient-to-r from-[#FE6100]/10 to-[#FF8B3D]/5 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#FE6100]">
                    <FileText className="h-3.5 w-3.5" />
                    Sipariş Operasyonları
                  </div>

                  <div>
                    <h1 className="text-3xl font-semibold tracking-[-0.04em] text-gray-950 md:text-[40px]">
                      Siparişler
                    </h1>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600 md:text-[15px]">
                      Tüm sipariş akışını tek görünümde yönetin; filtreleyin, önceliklendirin ve her siparişin
                      durumunu net bir operasyon ekranında takip edin.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs font-medium">
                    <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/50 bg-gradient-to-r from-amber-50 to-orange-50 px-3 py-1.5 text-amber-800">
                      <Calendar className="h-3.5 w-3.5" />
                      Bugün {stats.today.toLocaleString("tr-TR")} yeni sipariş
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-[#FE6100]/15 bg-gradient-to-r from-[#fff4ea] to-white px-3 py-1.5 text-[#FE6100]">
                      <Activity className="h-3.5 w-3.5" />
                      {filteredOrders.length.toLocaleString("tr-TR")} sonuç görüntüleniyor
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/50 bg-gradient-to-r from-emerald-50 to-teal-50 px-3 py-1.5 text-emerald-700">
                      <Clock className="h-3.5 w-3.5" />
                      {stats.pending.toLocaleString("tr-TR")} sipariş işlem bekliyor
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 xl:justify-end">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-2xl border border-[#FE6100]/15 bg-white px-4 py-2.5 text-sm font-medium text-[#FE6100] shadow-sm transition-all hover:border-[#FE6100]/25 hover:bg-[#faf5f0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FE6100]/30"
                  >
                    <Download className="h-4 w-4" />
                    Dışa Aktar
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-px bg-gradient-to-r from-[#FE6100]/10 via-[#FF8B3D]/5 to-[#FE6100]/10 md:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                label="Toplam Sipariş"
                value={stats.total.toLocaleString("tr-TR")}
                hint="Tüm sipariş kayıtları"
                tone=""
              />
              <SummaryCard
                label="Bugünkü Sipariş"
                value={stats.today.toLocaleString("tr-TR")}
                hint="Son 24 saatte oluşan sipariş"
                tone=""
              />
              <SummaryCard
                label="Bekleyen İşlem"
                value={stats.pending.toLocaleString("tr-TR")}
                hint="Operasyon bekleyen sipariş"
                tone=""
              />
              <SummaryCard
                label="Toplam Ciro"
                value={formatPrice(stats.revenue)}
                hint="Siparişlerden oluşan toplam tutar"
                tone=""
              />
            </div>
          </motion.section>

          {errorMessage ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: ANIMATION_EASE }}
              aria-live="assertive"
              className="rounded-[24px] border border-rose-200 bg-gradient-to-r from-rose-50 to-red-50 px-5 py-4 text-sm font-medium text-rose-700 shadow-sm"
            >
              {errorMessage}
            </motion.div>
          ) : null}

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatsCard
              title="Toplam sipariş"
              value={stats.total.toLocaleString("tr-TR")}
              icon={Package}
              tone="border-[#FE6100]/15 from-[#fff2e8] to-white text-[#FE6100]"
            />
            <StatsCard
              title="Bugünkü sipariş"
              value={stats.today.toLocaleString("tr-TR")}
              icon={Calendar}
              tone="border-emerald-200/60 from-emerald-50 to-white text-emerald-700"
            />
            <StatsCard
              title="Bekleyen sipariş"
              value={stats.pending.toLocaleString("tr-TR")}
              icon={Clock}
              tone="border-amber-200/60 from-amber-50 to-white text-amber-700"
            />
            <StatsCard
              title="Toplam ciro"
              value={formatPrice(stats.revenue)}
              icon={Activity}
              tone="border-slate-200 from-slate-50 to-white text-slate-700"
            />
          </section>

          <section
            aria-labelledby="orders-filters-title"
            className="rounded-[30px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] p-5 shadow-[0_18px_55px_rgba(0,0,0,0.08)] md:p-6"
          >
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#FE6100]">
                    Filtreler ve Sıralama
                  </p>
                  <h2 id="orders-filters-title" className="mt-1 text-xl font-semibold tracking-[-0.03em] text-gray-950">
                    Siparişleri daraltın ve önceliklendirin
                  </h2>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[#FE6100]/12 bg-white px-3 py-2 text-sm font-medium text-gray-600">
                  <ListFilter className="h-4 w-4 text-[#FE6100]" />
                  {filteredOrders.length.toLocaleString("tr-TR")} kayıt bulundu
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(240px,0.35fr)]">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Sipariş numarası, müşteri adı veya e-posta ile ara"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    aria-label="Sipariş numarası veya müşteri ile sipariş ara"
                    className="w-full rounded-2xl border border-[#FE6100]/12 bg-white/85 py-3 pl-11 pr-11 text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-[#FE6100] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#FE6100]/20"
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      aria-label="Aramayı temizle"
                      className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FE6100]/20"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>

                <div className="relative">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    aria-label="Siparişleri sıralama biçimi"
                    className="w-full appearance-none rounded-2xl border border-[#FE6100]/12 bg-white/85 px-4 py-3 pr-10 text-sm text-gray-900 shadow-sm transition-all focus:border-[#FE6100] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#FE6100]/20"
                  >
                    {sortOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {statusTabs.map((status) => (
                  <button
                    key={status.value}
                    type="button"
                    onClick={() => {
                      setStatusFilter(status.value);
                      setCurrentPage(1);
                    }}
                    aria-pressed={statusFilter === status.value}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FE6100]/20",
                      statusFilter === status.value
                        ? "border-[#FE6100]/20 bg-gradient-to-r from-[#FE6100] to-[#E85A00] text-white shadow-[0_10px_20px_rgba(254,97,0,0.18)]"
                        : "border-[#FE6100]/10 bg-white text-gray-600 hover:border-[#FE6100]/20 hover:text-[#FE6100]"
                    )}
                  >
                    <span>{status.label}</span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-semibold",
                        statusFilter === status.value ? "bg-white/15 text-white" : "bg-gray-100 text-gray-500"
                      )}
                    >
                      {status.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-[30px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] shadow-[0_24px_80px_rgba(254,97,0,0.1)]">
            <div className="border-b border-[#FE6100]/8 px-5 py-5 md:px-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#FE6100]">
                    Sipariş Tablosu
                  </p>
                  <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-gray-950">
                    Sipariş listesi
                  </h2>
                </div>
                <div className="text-sm text-gray-500">
                  {loading ? "Siparişler hazırlanıyor" : `${visibleStart}-${visibleEnd} / ${filteredOrders.length} sipariş`}
                </div>
              </div>
            </div>

            {loading ? (
              <OrdersLoadingState />
            ) : paginatedOrders.length > 0 ? (
              <>
                <div className="hidden border-b border-[#FE6100]/8 bg-[#fff8f3]/80 px-6 py-3 xl:grid xl:grid-cols-[1.25fr_0.8fr_0.95fr_0.6fr_0.3fr] xl:gap-4">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Sipariş / Müşteri</span>
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Durum</span>
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Teslimat / Ürün</span>
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 xl:text-right">Tutar</span>
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 xl:text-right">Eylem</span>
                </div>

                <div className="space-y-3 p-5 md:p-6">
                  {paginatedOrders.map((order) => {
                    const statusConfig = ORDER_STATUS_CONFIG[order.status];
                    const StatusIcon = statusConfig.icon;
                    const firstItem = order.items[0];
                    const remainingItems = Math.max(order.items.length - 1, 0);

                    return (
                      <motion.article
                        key={order.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, ease: ANIMATION_EASE }}
                        className="rounded-[26px] border border-white/70 bg-white/80 p-5 shadow-sm transition-all duration-200 hover:border-[#FE6100]/12 hover:bg-white hover:shadow-[0_18px_35px_rgba(254,97,0,0.08)]"
                      >
                        <div className="flex flex-col gap-5 xl:grid xl:grid-cols-[1.25fr_0.8fr_0.95fr_0.6fr_0.3fr] xl:items-center xl:gap-4">
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
                              <Link
                                href={`/admin/siparisler/${order.id}`}
                                className="text-base font-semibold tracking-[-0.02em] text-gray-950 transition-colors hover:text-[#FE6100] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FE6100]/20"
                              >
                                #{order.orderNumber}
                              </Link>
                              <span className="text-gray-300">•</span>
                              <span>{formatDate(order.createdAt)}</span>
                              <span className="text-gray-300">•</span>
                              <span>{formatTime(order.createdAt)}</span>
                            </div>

                            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                              <span className="inline-flex items-center gap-1.5">
                                <User className="h-4 w-4 text-[#FE6100]" />
                                <span className="font-medium text-gray-800">
                                  {order.shippingAddress.firstName} {order.shippingAddress.lastName}
                                </span>
                              </span>
                              <span className="inline-flex items-center gap-1.5 text-gray-500">
                                <FileText className="h-4 w-4 text-gray-400" />
                                {order.customerEmail || "E-posta bilgisi yok"}
                              </span>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold",
                                STATUS_COLOR_MAP[statusConfig.color] || STATUS_COLOR_MAP.yellow
                              )}
                            >
                              <StatusIcon className="h-3.5 w-3.5" />
                              {statusConfig.label}
                            </span>
                            <p className="text-sm text-gray-600">{statusConfig.description}</p>
                            <span className="inline-flex items-center gap-2 rounded-full border border-[#FE6100]/10 bg-[#fff7f2] px-3 py-1.5 text-xs font-medium text-gray-600">
                              <span>{getPaymentMethodIcon(order.paymentMethod)}</span>
                              {getPaymentMethodName(order.paymentMethod)}
                            </span>
                            <p className="text-xs text-gray-500">{PAYMENT_STATUS_LABELS[order.paymentStatus]}</p>
                          </div>

                          <div className="space-y-3 text-sm text-gray-600">
                            <div className="inline-flex items-center gap-1.5">
                              <MapPin className="h-4 w-4 text-[#FE6100]" />
                              <span>{order.shippingAddress.city || "Şehir bilgisi yok"}</span>
                            </div>
                            <div className="inline-flex items-center gap-1.5">
                              <Package className="h-4 w-4 text-[#FE6100]" />
                              <span>
                                {firstItem?.productName || "Ürün bilgisi yok"}
                                {remainingItems > 0 ? ` + ${remainingItems} ürün` : ""}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500">Toplam {order.items.length} ürün kalemi</p>
                          </div>

                          <div className="space-y-1 xl:text-right">
                            <p className="text-xl font-semibold tracking-[-0.03em] text-gray-950">
                              {formatPrice(order.total)}
                            </p>
                            {order.discount > 0 ? (
                              <p className="text-xs font-medium text-emerald-700">
                                İndirim: {formatPrice(order.discount)}
                              </p>
                            ) : (
                              <p className="text-xs text-gray-400">İndirim uygulanmadı</p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 xl:justify-end">
                            <Link
                              href={`/admin/siparisler/${order.id}`}
                              aria-label={`#${order.orderNumber} sipariş detayını görüntüle`}
                              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#FE6100]/10 bg-white text-gray-500 shadow-sm transition-all hover:border-[#FE6100]/20 hover:text-[#FE6100] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FE6100]/20"
                            >
                              <Eye className="h-5 w-5" />
                            </Link>
                            <button
                              type="button"
                              onClick={() => handleDelete(order.id, order.orderNumber)}
                              aria-label={`#${order.orderNumber} siparişini sil`}
                              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-rose-100 bg-white text-gray-500 shadow-sm transition-all hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
                            >
                              <Trash2 className="h-5 w-5" />
                            </button>
                          </div>
                        </div>
                      </motion.article>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="px-6 py-16 text-center">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#fff3e9] to-white text-[#FE6100] shadow-sm">
                  <Package className="h-9 w-9" />
                </div>
                <p className="mt-5 text-lg font-semibold text-gray-950">
                  {hasActiveFilters ? "Sonuç bulunamadı" : "Henüz sipariş bulunmuyor"}
                </p>
                <p className="mt-2 text-sm text-gray-500">
                  {hasActiveFilters
                    ? "Arama veya filtre kriterlerini değiştirerek tekrar deneyin."
                    : "İlk sipariş oluşturulduğunda bu alan otomatik olarak güncellenecek."}
                </p>
              </div>
            )}

            {!loading && filteredOrders.length > 0 && totalPages > 1 ? (
              <div className="border-t border-[#FE6100]/8 bg-[#fff8f3]/80 px-5 py-4 md:px-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-gray-500">
                    <span className="font-semibold text-gray-900">{visibleStart}</span>
                    {" - "}
                    <span className="font-semibold text-gray-900">{visibleEnd}</span>
                    {" / "}
                    <span className="font-semibold text-gray-900">{filteredOrders.length}</span> sipariş
                  </p>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      disabled={currentPage === 1}
                      className="inline-flex items-center rounded-2xl border border-[#FE6100]/12 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-all hover:border-[#FE6100]/20 hover:text-[#FE6100] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FE6100]/20"
                    >
                      Önceki
                    </button>

                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, index) => {
                        let pageNumber;
                        if (totalPages <= 5) {
                          pageNumber = index + 1;
                        } else if (currentPage <= 3) {
                          pageNumber = index + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNumber = totalPages - 4 + index;
                        } else {
                          pageNumber = currentPage - 2 + index;
                        }

                        return (
                          <button
                            key={pageNumber}
                            type="button"
                            onClick={() => setCurrentPage(pageNumber)}
                            className={cn(
                              "inline-flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FE6100]/20",
                              currentPage === pageNumber
                                ? "bg-gradient-to-r from-[#FE6100] to-[#E85A00] text-white shadow-[0_10px_20px_rgba(254,97,0,0.18)]"
                                : "border border-[#FE6100]/12 bg-white text-gray-700 hover:border-[#FE6100]/20 hover:text-[#FE6100]"
                            )}
                          >
                            {pageNumber}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                      disabled={currentPage === totalPages}
                      className="inline-flex items-center rounded-2xl border border-[#FE6100]/12 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-all hover:border-[#FE6100]/20 hover:text-[#FE6100] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FE6100]/20"
                    >
                      Sonraki
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
