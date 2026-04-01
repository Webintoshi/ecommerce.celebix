"use client";

import { useState, useEffect } from "react";
import { ORDER_STATUS_CONFIG } from "@/types/order";
import type { Order, OrderStatus } from "@/types/order";
import {
  Search,
  Package,
  Calendar,
  User,
  MapPin,
  ChevronDown,
  MoreHorizontal,
  FileText,
  Truck,
  CheckCircle2,
  Clock,
  X,
  Download,
  Trash2,
  Eye,
} from "lucide-react";
import Link from "next/link";
import { fetchAdminJson } from "@/lib/admin-client-fetch";

function transformOrder(dbOrder: Record<string, unknown>): Order {
  return {
    id: dbOrder.id as string,
    orderNumber: dbOrder.order_number as string,
    userId: dbOrder.user_id as string || "",
    customerEmail: dbOrder.customer_email as string || "",
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
    status: (dbOrder.status as OrderStatus) || "pending",
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
  { value: "newest", label: "En Yeni" },
  { value: "oldest", label: "En Eski" },
  { value: "highest", label: "En Yüksek Tutar" },
  { value: "lowest", label: "En Düşük Tutar" },
];

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
        throw new Error("Siparisler yuklenemedi.");
      }

      setOrders((data.orders || []).map(transformOrder));
    } catch (error) {
      console.error("Failed to load orders:", error);
      setErrorMessage(error instanceof Error ? error.message : "Siparisler yuklenemedi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  // Filter and sort
  const filteredOrders = orders
    .filter((order) => {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch =
        order.orderNumber.toLowerCase().includes(searchLower) ||
        `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`.toLowerCase().includes(searchLower) ||
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

  // Pagination
  const totalPages = Math.ceil(filteredOrders.length / ITEMS_PER_PAGE);
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Stats
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

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
      minimumFractionDigits: 2,
    }).format(price);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("tr-TR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(date));
  };

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  };

  const getPaymentMethodIcon = (method: string) => {
    const icons: Record<string, string> = {
      cod: "💵",
      bank_transfer: "🏦",
      credit_card: "💳",
      paytr: "💳",
      iyzico: "💳",
      stripe: "💳",
    };
    return icons[method] || "💳";
  };

  const getPaymentMethodName = (method: string | undefined) => {
    const names: Record<string, string> = {
      cod: "Kapıda Ödeme",
      bank_transfer: "Havale/EFT",
      credit_card: "Kredi Kartı",
      paytr: "PAYTR",
      iyzico: "İyzico",
      stripe: "Stripe",
    };
    return names[method || ''] || method || 'Bilinmiyor';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Siparişler</h1>
          <p className="text-sm text-gray-500 mt-1">Tüm siparişlerinizi yönetin ve takip edin</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors">
            <Download className="w-4 h-4" />
            Dışa Aktar
          </button>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          {errorMessage}
        </div>
      ) : null}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Toplam Sipariş</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Bugün</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.today}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Bekleyen</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.pending}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Toplam Ciro</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{formatPrice(stats.revenue)}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Sipariş no veya müşteri ara..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-11 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-white transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 rounded-full transition-colors"
              >
                <X className="w-3.5 h-3.5 text-gray-400" />
              </button>
            )}
          </div>

          {/* Status Filter */}
          <div className="flex flex-wrap gap-2">
            {[
              { value: "all", label: "Tümü", count: orders.length },
              { value: "pending", label: "Beklemede", count: orders.filter((o) => o.status === "pending").length },
              { value: "confirmed", label: "Onaylandı", count: orders.filter((o) => o.status === "confirmed").length },
              { value: "preparing", label: "Hazırlanıyor", count: orders.filter((o) => o.status === "preparing").length },
              { value: "shipped", label: "Kargoda", count: orders.filter((o) => o.status === "shipped").length },
              { value: "delivered", label: "Teslim", count: orders.filter((o) => o.status === "delivered").length },
            ].map((status) => (
              <button
                key={status.value}
                onClick={() => {
                  setStatusFilter(status.value);
                  setCurrentPage(1);
                }}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  statusFilter === status.value
                    ? "bg-primary text-white shadow-md shadow-primary/20"
                    : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                }`}
              >
                {status.label}
                <span className={`ml-2 ${statusFilter === status.value ? "text-white/80" : "text-gray-400"}`}>
                  {status.count}
                </span>
              </button>
            ))}
          </div>

          {/* Sort */}
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="appearance-none pl-4 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer min-w-[140px]"
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Orders List */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-block w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-gray-500">Yükleniyor...</p>
          </div>
        ) : paginatedOrders.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {paginatedOrders.map((order, index) => {
              const statusConfig = ORDER_STATUS_CONFIG[order.status];
              const StatusIcon = statusConfig.icon;
              
              // Zebra striping - alternating rows (more visible)
              const isEven = index % 2 === 0;
              const bgColor = isEven ? "bg-white" : "bg-blue-50";

              return (
                <div
                  key={order.id}
                  className={`${bgColor} p-5 hover:bg-gray-100 transition-colors group`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                    {/* Left: Order Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <Link
                          href={`/admin/siparisler/${order.id}`}
                          className="font-bold text-gray-900 hover:text-primary transition-colors"
                        >
                          #{order.orderNumber}
                        </Link>
                        <span className="text-sm text-gray-400">•</span>
                        <span className="text-sm text-gray-500">{formatDate(order.createdAt)}</span>
                        <span className="text-sm text-gray-400">{formatTime(order.createdAt)}</span>
                      </div>

                      <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                        <User className="w-4 h-4 text-gray-400" />
                        <span className="font-medium">
                          {order.shippingAddress.firstName} {order.shippingAddress.lastName}
                        </span>
                        <span className="text-gray-300">|</span>
                        <MapPin className="w-4 h-4 text-gray-400" />
                        <span>{order.shippingAddress.city}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${statusConfig.color}`}
                        >
                          <StatusIcon className="w-3.5 h-3.5" />
                          {statusConfig.label}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-lg">
                          <span>{getPaymentMethodIcon(order.paymentMethod)}</span>
                          {getPaymentMethodName(order.paymentMethod)}
                        </span>
                        <span className="text-xs text-gray-400">
                          {order.items.length} ürün
                        </span>
                      </div>
                    </div>

                    {/* Right: Price & Actions */}
                    <div className="flex items-center justify-between lg:justify-end gap-6">
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900">{formatPrice(order.total)}</p>
                        {order.discount > 0 && (
                          <p className="text-xs text-green-600">
                            İndirim: {formatPrice(order.discount)}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <Link
                          href={`/admin/siparisler/${order.id}`}
                          className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-xl transition-colors"
                          title="Detay Gör"
                        >
                          <Eye className="w-5 h-5" />
                        </Link>
                        <button
                          onClick={() => handleDelete(order.id, order.orderNumber)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                          title="Sil"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-12 text-center text-gray-500">
            <Package className="w-16 h-16 mx-auto mb-4 text-gray-200" />
            <p className="text-lg font-medium mb-1">
              {searchQuery || statusFilter !== "all" ? "Sonuç bulunamadı" : "Henüz sipariş yok"}
            </p>
            <p className="text-sm">
              {searchQuery || statusFilter !== "all"
                ? "Farklı arama kriterleri deneyin"
                : "İlk siparişiniz geldiğinde burada görünecek"}
            </p>
          </div>
        )}

        {/* Pagination */}
        {!loading && filteredOrders.length > 0 && totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              <span className="font-medium text-gray-900">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span>
              {" - "}
              <span className="font-medium text-gray-900">
                {Math.min(currentPage * ITEMS_PER_PAGE, filteredOrders.length)}
              </span>
              {" / "}
              <span className="font-medium text-gray-900">{filteredOrders.length}</span> sipariş
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Önceki
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-9 h-9 rounded-xl text-sm font-medium transition-colors ${
                        currentPage === pageNum
                          ? "bg-primary text-white"
                          : "text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Sonraki
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
