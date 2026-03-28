"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ElementType } from "react";
import {
  BadgeCheck,
  BanknoteArrowDown,
  Clock,
  FilePlus2,
  Loader2,
  Package,
  ReceiptText,
  RefreshCw,
  TrendingUp,
  Users,
  Wallet,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  X,
} from "lucide-react";
import type { AccountingOverviewData } from "@/types/accounting";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatDate(value: string | null) {
  if (!value) return "Henüz senkron yapılmadı";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Bilinmiyor";
  return date.toLocaleString("tr-TR");
}

const EMPTY_OVERVIEW: AccountingOverviewData = {
  today: {
    invoiceCount: 0,
    syncedCount: 0,
    queuedCount: 0,
    invoicedAmount: 0,
  },
  openReceivables: {
    orderCount: 0,
    amount: 0,
    orders: [],
  },
  vatSummary: {
    rate: 20,
    taxBase: 0,
    taxAmount: 0,
    grossAmount: 0,
  },
  syncStatus: {
    activeConnections: 0,
    pendingQueue: 0,
    failedQueue: 0,
    lastSyncAt: null,
  },
};

export default function MuhasebePage() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<AccountingOverviewData>(EMPTY_OVERVIEW);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [invoiceOrderId, setInvoiceOrderId] = useState("");

  const fetchOverview = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/accounting/overview", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result?.error || "Muhasebe verileri alınamadı.");
      }
      setOverview(result.overview as AccountingOverviewData);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Muhasebe verileri yüklenemedi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const openInvoiceDialog = () => {
    setInvoiceOrderId("");
    setShowInvoiceDialog(true);
  };

  const closeInvoiceDialog = () => {
    setShowInvoiceDialog(false);
    setInvoiceOrderId("");
  };

  const createInvoiceQuickly = async () => {
    if (!invoiceOrderId.trim()) return;

    setBusyAction("create_invoice");
    try {
      const response = await fetch("/api/admin/accounting/invoices/create-from-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: invoiceOrderId.trim() }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result?.error || "Fatura oluşturma başarısız.");
      }
      closeInvoiceDialog();
      await fetchOverview();
    } catch (actionError) {
      alert(actionError instanceof Error ? actionError.message : "İşlem başarısız.");
    } finally {
      setBusyAction(null);
    }
  };

  const runSync = async () => {
    setBusyAction("sync");
    try {
      const response = await fetch("/api/admin/accounting/sync/run", { method: "POST" });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result?.error || "Senkronizasyon başlatılamadı.");
      }
      await fetchOverview();
    } catch (actionError) {
      window.alert(actionError instanceof Error ? actionError.message : "Senkronizasyon hatası.");
    } finally {
      setBusyAction(null);
    }
  };

  const reconcilePayments = async () => {
    setBusyAction("reconcile");
    try {
      const response = await fetch("/api/admin/accounting/payments/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result?.error || "Tahsilat uzlaştırma başarısız.");
      }
      window.alert(`Tahsilat uzlaştırma tamamlandı. Sağlayıcı sayısı: ${result.result.totalProviders}`);
      await fetchOverview();
    } catch (actionError) {
      window.alert(actionError instanceof Error ? actionError.message : "Uzlaştırma başarısız.");
    } finally {
      setBusyAction(null);
    }
  };

  const hasErrors = overview.syncStatus.failedQueue > 0;
  const hasPending = overview.syncStatus.pendingQueue > 0;

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Muhasebe</h1>
          <p className="text-sm text-gray-500 mt-1">Fatura, tahsilat ve KDV takibini tek ekrandan yönetin.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchOverview}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Yenile
          </button>
          <Link
            href="/admin/muhasebe/fatura-entegrasyonu"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-medium hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
          >
            <ReceiptText className="w-4 h-4" />
            Entegrasyonlar
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard
          title="Bugün"
          subtitle={`${overview.today.invoiceCount} fatura adayı`}
          value={formatCurrency(overview.today.invoicedAmount)}
          icon={Wallet}
          loading={loading}
          color="blue"
        />
        <StatCard
          title="Entegrasyonlar"
          subtitle="Aktif bağlantı"
          value={`${overview.syncStatus.activeConnections}`}
          icon={BadgeCheck}
          loading={loading}
          color="green"
        />
        <StatCard
          title="Açık Tahsilatlar"
          subtitle={`${overview.openReceivables.orderCount} sipariş`}
          value={formatCurrency(overview.openReceivables.amount)}
          icon={BanknoteArrowDown}
          loading={loading}
          color="amber"
        />
        <StatCard
          title="KDV Özeti"
          subtitle={`%${overview.vatSummary.rate} oran`}
          value={formatCurrency(overview.vatSummary.taxAmount)}
          icon={TrendingUp}
          loading={loading}
          color="purple"
        />
        <StatCard
          title="Son Senkron"
          subtitle={`${overview.syncStatus.pendingQueue} bekleyen, ${overview.syncStatus.failedQueue} hatalı`}
          value={formatDate(overview.syncStatus.lastSyncAt)}
          icon={Clock}
          loading={loading}
          color={hasErrors ? "red" : hasPending ? "amber" : "gray"}
          isDate
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <FilePlus2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Hızlı İşlemler</h2>
                <p className="text-sm text-gray-500">Sık kullanılan muhasebe işlemleri</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <QuickActionButton
              title="Fatura Kes"
              description="Sipariş ID girerek faturayı hemen kuyrukla"
              icon={ReceiptText}
              onClick={openInvoiceDialog}
              color="blue"
            />
            <QuickActionButton
              title="Gider Ekle"
              description="Gider girişini entegrasyon ekranından yönet"
              icon={Wallet}
              href="/admin/muhasebe/fatura-entegrasyonu"
              color="green"
            />
            <QuickActionButton
              title="Tahsilat Kaydet"
              description="Sağlayıcılardan tahsilatları çek ve eşleştir"
              icon={BanknoteArrowDown}
              loading={busyAction === "reconcile"}
              onClick={reconcilePayments}
              color="amber"
            />
            <QuickActionButton
              title="Müşteri Cari Aç"
              description="Müşteri hesabını açıp geçmiş siparişleri incele"
              icon={Users}
              href="/admin/musteriler"
              color="purple"
            />
          </div>
        </div>

        {/* Sync Status Card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Senkron Durumu</h2>
              <p className="text-sm text-gray-500">Son güncelleme ve kuyruk</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
              <span className="text-sm text-gray-600">Aktif Bağlantı</span>
              <span className="font-semibold text-gray-900">{overview.syncStatus.activeConnections}</span>
            </div>
            <div className={`flex items-center justify-between p-4 rounded-xl ${hasPending ? "bg-amber-50" : "bg-gray-50"}`}>
              <span className={`text-sm ${hasPending ? "text-amber-700" : "text-gray-600"}`}>Bekleyen</span>
              <span className={`font-semibold ${hasPending ? "text-amber-800" : "text-gray-900"}`}>{overview.syncStatus.pendingQueue}</span>
            </div>
            <div className={`flex items-center justify-between p-4 rounded-xl ${hasErrors ? "bg-red-50" : "bg-gray-50"}`}>
              <span className={`text-sm ${hasErrors ? "text-red-700" : "text-gray-600"}`}>Hatalı</span>
              <span className={`font-semibold ${hasErrors ? "text-red-800" : "text-gray-900"}`}>{overview.syncStatus.failedQueue}</span>
            </div>
          </div>

          <button
            onClick={runSync}
            disabled={busyAction === "sync"}
            className="mt-6 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-white font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {busyAction === "sync" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Senkronu Çalıştır
          </button>
        </div>
      </div>

      {/* Invoice Dialog */}
      <Dialog open={showInvoiceDialog} onOpenChange={setShowInvoiceDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                <ReceiptText className="w-5 h-5 text-blue-600" />
              </div>
              <DialogTitle className="text-xl font-bold text-gray-900">Fatura Kes</DialogTitle>
            </div>
            <DialogDescription className="text-gray-500">
              Fatura kesmek istediğiniz siparişin ID numarasını girin.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sipariş ID
            </label>
            <input
              type="text"
              value={invoiceOrderId}
              onChange={(e) => setInvoiceOrderId(e.target.value)}
              placeholder="örn: 12345"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              onKeyDown={(e) => {
                if (e.key === "Enter" && invoiceOrderId.trim()) {
                  createInvoiceQuickly();
                }
              }}
            />
          </div>
          <DialogFooter className="gap-2">
            <button
              onClick={closeInvoiceDialog}
              className="px-5 py-2.5 border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
            >
              İptal
            </button>
            <button
              onClick={createInvoiceQuickly}
              disabled={busyAction === "create_invoice" || !invoiceOrderId.trim()}
              className="px-5 py-2.5 bg-primary text-white rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {busyAction === "create_invoice" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  İşleniyor...
                </>
              ) : (
                <>
                  <ReceiptText className="w-4 h-4" />
                  Fatura Oluştur
                </>
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Open Receivables Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <Package className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Açık Tahsilat Listesi</h2>
              <p className="text-sm text-gray-500">Ödemesi tamamlanmamış siparişler</p>
            </div>
          </div>
          <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-medium">
            {overview.openReceivables.orderCount} sipariş
          </span>
        </div>

        <div className="overflow-x-auto">
          {overview.openReceivables.orders.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-1">Tüm tahsilatlar tamamlanmış</h3>
              <p className="text-sm text-gray-500">Açık tahsilat bulunmuyor.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sipariş</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ödeme Durumu</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tutar</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tarih</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {overview.openReceivables.orders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <Link
                        className="font-medium text-primary hover:underline flex items-center gap-1"
                        href={`/admin/siparisler/${order.id}`}
                      >
                        #{order.orderNumber}
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                        <AlertCircle className="w-3 h-3" />
                        {order.paymentStatus}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-semibold text-gray-900">{formatCurrency(order.total)}</td>
                    <td className="px-6 py-4 text-gray-500">{new Date(order.createdAt).toLocaleDateString("tr-TR")}</td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/admin/siparisler/${order.id}`}
                        className="inline-flex items-center gap-1 text-sm text-primary hover:underline font-medium"
                      >
                        Detay
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// Stat Card Component
function StatCard({
  title,
  subtitle,
  value,
  icon: Icon,
  loading,
  isDate = false,
  color = "gray",
}: {
  title: string;
  subtitle: string;
  value: string;
  icon: ElementType;
  loading?: boolean;
  isDate?: boolean;
  color?: "blue" | "green" | "amber" | "purple" | "red" | "gray";
}) {
  const colorStyles = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    amber: "bg-amber-50 text-amber-600",
    purple: "bg-purple-50 text-purple-600",
    red: "bg-red-50 text-red-600",
    gray: "bg-gray-100 text-gray-600",
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
          {loading ? (
            <div className="h-7 w-24 rounded-lg bg-gray-100 animate-pulse" />
          ) : (
            <p className={`font-bold text-gray-900 truncate ${isDate ? "text-sm" : "text-xl"}`}>{value}</p>
          )}
          <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${colorStyles[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

// Quick Action Button Component
function QuickActionButton({
  title,
  description,
  icon: Icon,
  loading,
  onClick,
  href,
  color = "gray",
}: {
  title: string;
  description: string;
  icon: ElementType;
  loading?: boolean;
  onClick?: () => void;
  href?: string;
  color?: "blue" | "green" | "amber" | "purple" | "red" | "gray";
}) {
  const colorStyles = {
    blue: "bg-blue-50 text-blue-600 group-hover:bg-blue-100",
    green: "bg-green-50 text-green-600 group-hover:bg-green-100",
    amber: "bg-amber-50 text-amber-600 group-hover:bg-amber-100",
    purple: "bg-purple-50 text-purple-600 group-hover:bg-purple-100",
    red: "bg-red-50 text-red-600 group-hover:bg-red-100",
    gray: "bg-gray-100 text-gray-600 group-hover:bg-gray-200",
  };

  const className = `group block rounded-xl border border-gray-200 p-4 hover:border-primary/30 hover:shadow-md transition-all ${href ? "" : "text-left w-full"}`;

  const content = (
    <>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${colorStyles[color]}`}>
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Icon className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900">{title}</span>
            {href && <ArrowRight className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />}
          </div>
          <p className="text-sm text-gray-500 mt-1 line-clamp-2">{description}</p>
        </div>
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button onClick={onClick} disabled={loading} className={className}>
      {content}
    </button>
  );
}
