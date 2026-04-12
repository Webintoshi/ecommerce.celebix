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
import { cn } from "@/lib/utils";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatDate(value: string | null) {
  if (!value) return "Henuz senkron yapilmadi";
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

const INPUT_CLASS =
  "w-full rounded-2xl border border-[#eadccd] bg-white px-4 py-3 text-sm text-[#2f241d] shadow-sm outline-none transition placeholder:text-[#a08e82] focus:border-[#FE6100]/40 focus:ring-4 focus:ring-[#FE6100]/15";

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
        throw new Error(result?.error || "Muhasebe verileri alinamadi.");
      }
      setOverview(result.overview as AccountingOverviewData);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Muhasebe verileri yuklenemedi.");
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
        throw new Error(result?.error || "Fatura olusturma basarisiz.");
      }
      closeInvoiceDialog();
      await fetchOverview();
    } catch (actionError) {
      alert(actionError instanceof Error ? actionError.message : "Islem basarisiz.");
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
        throw new Error(result?.error || "Senkronizasyon baslatilamadi.");
      }
      await fetchOverview();
    } catch (actionError) {
      window.alert(actionError instanceof Error ? actionError.message : "Senkronizasyon hatasi.");
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
        throw new Error(result?.error || "Tahsilat uzlastirma basarisiz.");
      }
      window.alert(`Tahsilat uzlastirma tamamlandi. Saglayici sayisi: ${result.result.totalProviders}`);
      await fetchOverview();
    } catch (actionError) {
      window.alert(actionError instanceof Error ? actionError.message : "Uzlastirma basarisiz.");
    } finally {
      setBusyAction(null);
    }
  };

  const hasErrors = overview.syncStatus.failedQueue > 0;
  const hasPending = overview.syncStatus.pendingQueue > 0;

  return (
    <div className="min-h-screen bg-[#f6efe7] px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-[32px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdf9] to-[#f8efe6] p-6 shadow-[0_24px_80px_rgba(120,74,32,0.10)] md:p-8">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="inline-flex w-fit items-center rounded-full border border-[#FE6100]/18 bg-gradient-to-r from-[#FE6100]/10 to-[#FFB067]/10 px-5 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-[#C54E00]">
              Muhasebe
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={fetchOverview}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-2xl border border-[#eadccd] bg-white px-4 py-3 text-sm font-medium text-[#7b6656] shadow-sm transition-all hover:border-[#FE6100]/25 hover:bg-[#fff8f1] hover:text-[#C54E00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/16 disabled:opacity-60"
              >
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                Yenile
              </button>
              <Link
                href="/admin/muhasebe/fatura-entegrasyonu"
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#FE6100] to-[#E45700] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_rgba(254,97,0,0.22)] transition hover:translate-y-[-1px] hover:from-[#f15c00] hover:to-[#d84f00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/18"
              >
                <ReceiptText className="h-4 w-4" />
                Entegrasyonlar
              </Link>
            </div>
          </div>
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#FE6100]/10 blur-3xl" />
        </section>

        {error && (
          <div className="flex items-center gap-2 rounded-[24px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
          <StatCard title="Bugun" subtitle={`${overview.today.invoiceCount} fatura adayi`} value={formatCurrency(overview.today.invoicedAmount)} icon={Wallet} loading={loading} color="orange" />
          <StatCard title="Entegrasyonlar" subtitle="Aktif baglanti" value={`${overview.syncStatus.activeConnections}`} icon={BadgeCheck} loading={loading} color="green" />
          <StatCard title="Acik Tahsilatlar" subtitle={`${overview.openReceivables.orderCount} siparis`} value={formatCurrency(overview.openReceivables.amount)} icon={BanknoteArrowDown} loading={loading} color="amber" />
          <StatCard title="KDV Ozeti" subtitle={`%${overview.vatSummary.rate} oran`} value={formatCurrency(overview.vatSummary.taxAmount)} icon={TrendingUp} loading={loading} color="stone" />
          <StatCard title="Son Senkron" subtitle={`${overview.syncStatus.pendingQueue} bekleyen, ${overview.syncStatus.failedQueue} hatali`} value={formatDate(overview.syncStatus.lastSyncAt)} icon={Clock} loading={loading} color={hasErrors ? "red" : hasPending ? "amber" : "stone"} isDate />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <section className="xl:col-span-2 rounded-[30px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfa] to-[#faf4ed] p-6 shadow-[0_18px_55px_rgba(0,0,0,0.08)]">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-[18px] border border-[#FE6100]/12 bg-gradient-to-br from-[#fff2e8] to-white text-[#FE6100] shadow-sm">
                <FilePlus2 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold text-[#2f241d]">Hizli Islemler</h2>
                <p className="text-sm text-[#7d6959]">Gunluk muhasebe akisina hizli gecisler</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <QuickActionButton title="Fatura Kes" description="Siparis ID girerek faturayi hemen kuyrukla." icon={ReceiptText} onClick={openInvoiceDialog} color="orange" />
              <QuickActionButton title="Gider Ekle" description="Gider girisini entegrasyon ekranindan yonet." icon={Wallet} href="/admin/muhasebe/fatura-entegrasyonu" color="green" />
              <QuickActionButton title="Tahsilat Kaydet" description="Saglayicilardan tahsilatlari cek ve eslestir." icon={BanknoteArrowDown} loading={busyAction === "reconcile"} onClick={reconcilePayments} color="amber" />
              <QuickActionButton title="Musteri Cari Ac" description="Musteri hesabini acip gecmis siparisleri incele." icon={Users} href="/admin/musteriler" color="stone" />
            </div>
          </section>

          <section className="rounded-[30px] border border-[#eadccd] bg-white/92 p-6 shadow-[0_18px_45px_rgba(99,67,37,0.08)]">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-[18px] border border-[#e9d7c5] bg-gradient-to-br from-[#fff5ec] to-white text-[#c96a2b] shadow-sm">
                <RefreshCw className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold text-[#2f241d]">Senkron Durumu</h2>
                <p className="text-sm text-[#7d6959]">Baglanti ve kuyruk gorunumu</p>
              </div>
            </div>

            <div className="space-y-3">
              <SyncRow label="Aktif Baglanti" value={overview.syncStatus.activeConnections} />
              <SyncRow label="Bekleyen" value={overview.syncStatus.pendingQueue} tone={hasPending ? "amber" : "default"} />
              <SyncRow label="Hatali" value={overview.syncStatus.failedQueue} tone={hasErrors ? "red" : "default"} />
            </div>

            <button
              onClick={runSync}
              disabled={busyAction === "sync"}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#FE6100] to-[#E45700] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_rgba(254,97,0,0.22)] transition hover:translate-y-[-1px] hover:from-[#f15c00] hover:to-[#d84f00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/18 disabled:opacity-60"
            >
              {busyAction === "sync" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Senkronu Calistir
            </button>
          </section>
        </div>

        <Dialog open={showInvoiceDialog} onOpenChange={setShowInvoiceDialog}>
          <DialogContent className="sm:max-w-md rounded-[28px] border border-[#eadccd] bg-[#fffdfa] shadow-[0_24px_70px_rgba(99,67,37,0.16)]">
            <DialogHeader>
              <div className="mb-2 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-[18px] border border-[#FE6100]/12 bg-gradient-to-br from-[#fff2e8] to-white text-[#FE6100] shadow-sm">
                  <ReceiptText className="h-5 w-5" />
                </div>
                <DialogTitle className="text-xl font-bold text-[#2f241d]">Fatura Kes</DialogTitle>
              </div>
              <DialogDescription className="text-[#7d6959]">
                Fatura kesmek istediginiz siparisin ID numarasini girin.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <label className="mb-2 block text-sm font-medium text-[#6e5b4e]">Siparis ID</label>
              <input
                type="text"
                value={invoiceOrderId}
                onChange={(e) => setInvoiceOrderId(e.target.value)}
                placeholder="Orn: 12345"
                className={INPUT_CLASS}
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
                className="rounded-2xl border border-[#eadccd] bg-white px-5 py-2.5 text-sm font-medium text-[#6e5b4e] shadow-sm transition-all hover:border-[#FE6100]/20 hover:bg-[#fff7f1] hover:text-[#C54E00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/16"
              >
                Iptal
              </button>
              <button
                onClick={createInvoiceQuickly}
                disabled={busyAction === "create_invoice" || !invoiceOrderId.trim()}
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#FE6100] to-[#E45700] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_35px_rgba(254,97,0,0.22)] transition hover:translate-y-[-1px] hover:from-[#f15c00] hover:to-[#d84f00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/18 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busyAction === "create_invoice" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Isleniyor...
                  </>
                ) : (
                  <>
                    <ReceiptText className="h-4 w-4" />
                    Fatura Olustur
                  </>
                )}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <section className="overflow-hidden rounded-[30px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfa] to-[#faf4ed] shadow-[0_24px_80px_rgba(254,97,0,0.10)]">
          <div className="flex items-center justify-between gap-4 border-b border-[#f1e5d9] px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-[18px] border border-[#e9d7c5] bg-gradient-to-br from-[#fff5ec] to-white text-[#c96a2b] shadow-sm">
                <Package className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold text-[#2f241d]">Acik Tahsilat Listesi</h2>
                <p className="text-sm text-[#7d6959]">Odemesi tamamlanmamis siparisler</p>
              </div>
            </div>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-700">
              {overview.openReceivables.orderCount} siparis
            </span>
          </div>

          <div className="overflow-x-auto">
            {overview.openReceivables.orders.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#fff2e8] to-white text-[#FE6100] shadow-sm">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-[#2f241d]">Tum tahsilatlar tamamlanmis</h3>
                <p className="mt-1 text-sm text-[#7d6959]">Acik tahsilat bulunmuyor.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-[#fff8f3]/85">
                  <tr>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">Siparis</th>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">Odeme Durumu</th>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">Tutar</th>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">Tarih</th>
                    <th className="px-6 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">Islem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f2e7dc]">
                  {overview.openReceivables.orders.map((order) => (
                    <tr key={order.id} className="transition-colors hover:bg-[#fffaf5]">
                      <td className="px-6 py-4">
                        <Link className="inline-flex items-center gap-1 font-medium text-[#C54E00] hover:text-[#a94500]" href={`/admin/siparisler/${order.id}`}>
                          #{order.orderNumber}
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
                          <AlertCircle className="h-3 w-3" />
                          {order.paymentStatus}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-semibold text-[#2f241d]">{formatCurrency(order.total)}</td>
                      <td className="px-6 py-4 text-[#6e5b4e]">{new Date(order.createdAt).toLocaleDateString("tr-TR")}</td>
                      <td className="px-6 py-4 text-right">
                        <Link href={`/admin/siparisler/${order.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-[#C54E00] hover:text-[#a94500]">
                          Detay
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({
  title,
  subtitle,
  value,
  icon: Icon,
  loading,
  isDate = false,
  color = "stone",
}: {
  title: string;
  subtitle: string;
  value: string;
  icon: ElementType;
  loading?: boolean;
  isDate?: boolean;
  color?: "orange" | "green" | "amber" | "stone" | "red";
}) {
  const colorStyles = {
    orange: "border-[#FE6100]/12 bg-gradient-to-br from-[#fff2e8] to-white text-[#FE6100]",
    green: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white text-emerald-600",
    amber: "border-amber-200 bg-gradient-to-br from-amber-50 to-white text-amber-600",
    stone: "border-[#eadccd] bg-gradient-to-br from-[#f8f2ec] to-white text-[#7b6656]",
    red: "border-rose-200 bg-gradient-to-br from-rose-50 to-white text-rose-600",
  };

  return (
    <div className="rounded-[28px] border border-[#eadccd] bg-white/92 p-5 shadow-[0_18px_40px_rgba(99,67,37,0.08)] transition-all hover:-translate-y-0.5 hover:shadow-[0_24px_55px_rgba(254,97,0,0.10)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#9a7c67]">{title}</p>
          {loading ? (
            <div className="h-7 w-28 animate-pulse rounded-xl bg-[#f2e7dc]" />
          ) : (
            <p className={cn("font-bold tracking-[-0.03em] text-[#2f241d]", isDate ? "text-sm leading-6" : "text-2xl")}>
              {value}
            </p>
          )}
          <p className="mt-2 text-xs text-[#8c7564]">{subtitle}</p>
        </div>
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border shadow-sm", colorStyles[color])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function QuickActionButton({
  title,
  description,
  icon: Icon,
  loading,
  onClick,
  href,
  color = "stone",
}: {
  title: string;
  description: string;
  icon: ElementType;
  loading?: boolean;
  onClick?: () => void;
  href?: string;
  color?: "orange" | "green" | "amber" | "stone";
}) {
  const colorStyles = {
    orange: "border-[#FE6100]/12 bg-gradient-to-br from-[#fff2e8] to-white text-[#FE6100]",
    green: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white text-emerald-600",
    amber: "border-amber-200 bg-gradient-to-br from-amber-50 to-white text-amber-600",
    stone: "border-[#eadccd] bg-gradient-to-br from-[#f8f2ec] to-white text-[#7b6656]",
  };

  const className =
    "group block rounded-[24px] border border-[#eadccd] bg-white/95 p-5 text-left shadow-[0_16px_35px_rgba(99,67,37,0.06)] transition-all hover:-translate-y-1 hover:border-[#FE6100]/18 hover:bg-white hover:shadow-[0_24px_50px_rgba(254,97,0,0.10)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FE6100]/16";

  const content = (
    <div className="flex items-start gap-4">
      <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border shadow-sm", colorStyles[color])}>
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[#2f241d]">{title}</span>
          {href && <ArrowRight className="h-4 w-4 text-[#a08e82] transition group-hover:text-[#C54E00]" />}
        </div>
        <p className="mt-2 text-sm leading-6 text-[#7d6959]">{description}</p>
      </div>
    </div>
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

function SyncRow({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "amber" | "red" }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-[20px] p-4",
        tone === "amber" && "bg-amber-50",
        tone === "red" && "bg-rose-50",
        tone === "default" && "bg-[#fdf8f3]"
      )}
    >
      <span className={cn("text-sm", tone === "amber" ? "text-amber-700" : tone === "red" ? "text-rose-700" : "text-[#6e5b4e]")}>{label}</span>
      <span className={cn("font-semibold", tone === "amber" ? "text-amber-800" : tone === "red" ? "text-rose-800" : "text-[#2f241d]")}>{value}</span>
    </div>
  );
}
