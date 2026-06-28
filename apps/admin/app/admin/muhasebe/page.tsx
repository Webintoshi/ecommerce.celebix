"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ElementType, ReactNode } from "react";
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  BanknoteArrowDown,
  CheckCircle2,
  Clock,
  Loader2,
  ReceiptText,
  RefreshCw,
  Users,
  Wallet,
} from "lucide-react";
import type { AccountingOverviewData } from "@/types/accounting";
import { AdminPageHeader, AdminPageShell } from "@/components/admin/AdminPageShell";
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
  if (!value) return "Henüz senkron yok";
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
  "h-11 w-full rounded-[8px] border border-[#DCE3EC] bg-white px-3 text-sm text-[#111827] outline-none transition placeholder:text-[#8B95A5] focus:border-[#FFD1B5] focus:ring-4 focus:ring-[rgba(255,106,0,0.14)]";

const SECONDARY_BUTTON =
  "inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border border-[#DCE3EC] bg-white px-4 text-sm font-semibold text-[#374151] transition hover:border-[#FFD1B5] hover:bg-[#FFF8F3] hover:text-[#E85D04] disabled:cursor-not-allowed disabled:opacity-55";

const PRIMARY_BUTTON =
  "inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-[#FF6A00] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(255,106,0,0.16)] transition hover:bg-[#E85D04] disabled:cursor-not-allowed disabled:opacity-55";

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
    <main className="min-h-screen bg-[#F9F9F9] pb-8 text-[#111827]">
      <div className="mx-auto w-full max-w-none space-y-4 px-4 sm:px-5 xl:px-6">
        <AdminPageShell>
          <AdminPageHeader
            sectionLabel="Muhasebe"
            title="Muhasebe"
            actions={
              <>
                <button type="button" onClick={fetchOverview} disabled={loading} className={SECONDARY_BUTTON}>
                  <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                  Yenile
                </button>
                <button type="button" onClick={runSync} disabled={busyAction === "sync"} className={SECONDARY_BUTTON}>
                  {busyAction === "sync" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Senkron
                </button>
                <Link href="/admin/muhasebe/fatura-entegrasyonu" className={PRIMARY_BUTTON}>
                  <ReceiptText className="h-4 w-4" />
                  Entegrasyonlar
                </Link>
              </>
            }
            metrics={
              <>
                <MetricCell
                  label="Bugün"
                  value={loading ? "..." : formatCurrency(overview.today.invoicedAmount)}
                  detail={`${overview.today.invoiceCount} fatura`}
                  icon={Wallet}
                />
                <MetricCell
                  label="Açık tahsilat"
                  value={loading ? "..." : formatCurrency(overview.openReceivables.amount)}
                  detail={`${overview.openReceivables.orderCount} sipariş`}
                  icon={BanknoteArrowDown}
                />
                <MetricCell
                  label="Bağlantı"
                  value={loading ? "..." : overview.syncStatus.activeConnections.toLocaleString("tr-TR")}
                  detail="aktif entegrasyon"
                  icon={BadgeCheck}
                />
                <MetricCell
                  label="Kuyruk"
                  value={loading ? "..." : (overview.syncStatus.pendingQueue + overview.syncStatus.failedQueue).toLocaleString("tr-TR")}
                  detail={`${overview.syncStatus.pendingQueue} bekleyen, ${overview.syncStatus.failedQueue} hatalı`}
                  icon={Clock}
                  tone={hasErrors ? "danger" : hasPending ? "warning" : "neutral"}
                />
              </>
            }
          />

          {error && (
            <div className="flex items-center gap-2 rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
            <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
              <div className="grid gap-3 border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-3 min-[820px]:grid-cols-[minmax(0,1fr)_auto] min-[820px]:items-center xl:px-5">
                <div>
                  <h2 className="text-sm font-semibold text-[#111827]">Günlük akış</h2>
                  <p className="mt-1 text-xs font-medium text-[#6B7280]">Fatura, tahsilat ve müşteri geçişleri</p>
                </div>
                <span className="w-fit rounded-[8px] bg-white px-3 py-1.5 text-xs font-semibold text-[#6B7280]">
                  {formatDate(overview.syncStatus.lastSyncAt)}
                </span>
              </div>

              <div className="divide-y divide-[#DCE3EC]">
                <ActionRow title="Fatura kes" value="Sipariş ID ile kuyrukla" icon={ReceiptText} onClick={openInvoiceDialog} />
                <ActionRow title="Gider akışı" value="Entegrasyon ekranı" icon={Wallet} href="/admin/muhasebe/fatura-entegrasyonu" />
                <ActionRow
                  title="Tahsilat eşleştir"
                  value={busyAction === "reconcile" ? "İşleniyor" : "Sağlayıcı kayıtlarını kontrol et"}
                  icon={BanknoteArrowDown}
                  loading={busyAction === "reconcile"}
                  onClick={reconcilePayments}
                />
                <ActionRow title="Müşteri cari" value="Müşteri listesine git" icon={Users} href="/admin/musteriler" />
              </div>
            </section>

            <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
              <div className="border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-3 xl:px-5">
                <h2 className="text-sm font-semibold text-[#111827]">Senkron durumu</h2>
              </div>
              <div className="divide-y divide-[#DCE3EC]">
                <SyncRow label="Aktif bağlantı" value={overview.syncStatus.activeConnections} />
                <SyncRow label="Bekleyen" value={overview.syncStatus.pendingQueue} tone={hasPending ? "amber" : "default"} />
                <SyncRow label="Hatalı" value={overview.syncStatus.failedQueue} tone={hasErrors ? "red" : "default"} />
              </div>
            </section>
          </div>

          <Dialog open={showInvoiceDialog} onOpenChange={setShowInvoiceDialog}>
            <DialogContent className="rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_18px_44px_rgba(15,23,42,0.10)] sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-lg font-semibold text-[#111827]">Fatura kes</DialogTitle>
                <DialogDescription className="text-sm text-[#6B7280]">Sipariş ID girin.</DialogDescription>
              </DialogHeader>
              <div className="py-3">
                <label className="mb-2 block text-sm font-semibold text-[#374151]">Sipariş ID</label>
                <input
                  type="text"
                  value={invoiceOrderId}
                  onChange={(e) => setInvoiceOrderId(e.target.value)}
                  placeholder="Örn: 12345"
                  className={INPUT_CLASS}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && invoiceOrderId.trim()) {
                      createInvoiceQuickly();
                    }
                  }}
                />
              </div>
              <DialogFooter className="gap-2">
                <button onClick={closeInvoiceDialog} className={SECONDARY_BUTTON}>
                  İptal
                </button>
                <button
                  onClick={createInvoiceQuickly}
                  disabled={busyAction === "create_invoice" || !invoiceOrderId.trim()}
                  className={PRIMARY_BUTTON}
                >
                  {busyAction === "create_invoice" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ReceiptText className="h-4 w-4" />}
                  Oluştur
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <section className="overflow-hidden rounded-[12px] border border-[#DCE3EC] bg-white shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
            <div className="grid gap-3 border-b border-[#DCE3EC] bg-[#EEF3F7] px-4 py-3 min-[820px]:grid-cols-[minmax(0,1fr)_auto] min-[820px]:items-center xl:px-5">
              <div>
                <h2 className="text-sm font-semibold text-[#111827]">Açık tahsilatlar</h2>
              </div>
              <span className="w-fit rounded-[8px] bg-white px-3 py-1.5 text-xs font-semibold text-[#6B7280]">
                {overview.openReceivables.orderCount} sipariş
              </span>
            </div>

            <div className="overflow-x-auto">
              {overview.openReceivables.orders.length === 0 ? (
                <div className="px-6 py-14 text-center">
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-[14px] border border-[#FFD1B5] bg-[#FFF3EA] text-[#FF6A00]">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-[#111827]">Açık tahsilat yok</h3>
                  <p className="mt-1 text-sm text-[#6B7280]">Ödemesi bekleyen sipariş görünmüyor.</p>
                </div>
              ) : (
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-[#EEF3F7]">
                    <tr>
                      <TableHead>Sipariş</TableHead>
                      <TableHead>Ödeme</TableHead>
                      <TableHead>Tutar</TableHead>
                      <TableHead>Tarih</TableHead>
                      <TableHead className="text-right">İşlem</TableHead>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DCE3EC]">
                    {overview.openReceivables.orders.map((order) => (
                      <tr key={order.id} className="transition-colors hover:bg-[#FFF8F3]">
                        <td className="px-4 py-4 xl:px-5">
                          <Link
                            className="inline-flex items-center gap-1 font-semibold text-[#E85D04] hover:text-[#B64A00]"
                            href={`/admin/siparisler/${order.id}`}
                          >
                            #{order.orderNumber}
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        </td>
                        <td className="px-4 py-4 font-medium text-[#B45309] xl:px-5">{order.paymentStatus}</td>
                        <td className="px-4 py-4 font-semibold text-[#111827] xl:px-5">{formatCurrency(order.total)}</td>
                        <td className="px-4 py-4 text-[#6B7280] xl:px-5">{new Date(order.createdAt).toLocaleDateString("tr-TR")}</td>
                        <td className="px-4 py-4 text-right xl:px-5">
                          <Link href={`/admin/siparisler/${order.id}`} className="font-semibold text-[#E85D04] hover:text-[#B64A00]">
                            Detay
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </AdminPageShell>
      </div>
    </main>
  );
}

function MetricCell({
  label,
  value,
  detail,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  icon: ElementType;
  tone?: "neutral" | "warning" | "danger";
}) {
  return (
    <div className="min-h-[92px] bg-white px-4 py-3.5 xl:px-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6B7280]">{label}</p>
        <Icon className={cn("h-4 w-4", tone === "danger" ? "text-red-500" : tone === "warning" ? "text-amber-500" : "text-[#FF6A00]")} />
      </div>
      <p className="mt-3 truncate text-2xl font-semibold tracking-[-0.04em] text-[#111827]">{value}</p>
      <p className="mt-1 truncate text-xs font-medium text-[#6B7280]">{detail}</p>
    </div>
  );
}

function ActionRow({
  title,
  value,
  icon: Icon,
  onClick,
  href,
  loading,
}: {
  title: string;
  value: string;
  icon: ElementType;
  onClick?: () => void;
  href?: string;
  loading?: boolean;
}) {
  const content = (
    <>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-[#FFD1B5] bg-[#FFF3EA] text-[#FF6A00]">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[#111827]">{title}</span>
        <span className="mt-0.5 block truncate text-xs font-medium text-[#6B7280]">{value}</span>
      </span>
      {href ? <ArrowRight className="h-4 w-4 text-[#8B95A5]" /> : null}
    </>
  );

  const className =
    "flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[#FFF8F3] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.14)] xl:px-5";

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} disabled={loading} className={className}>
      {content}
    </button>
  );
}

function TableHead({ children, className }: { children: ReactNode; className?: string }) {
  return <th className={cn("px-4 py-3 text-left text-xs font-semibold text-[#4B5563] xl:px-5", className)}>{children}</th>;
}

function SyncRow({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "amber" | "red" }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between px-4 py-3 xl:px-5",
        tone === "amber" && "bg-amber-50",
        tone === "red" && "bg-rose-50",
        tone === "default" && "bg-white",
      )}
    >
      <span className={cn("text-sm font-medium", tone === "amber" ? "text-amber-700" : tone === "red" ? "text-rose-700" : "text-[#6B7280]")}>{label}</span>
      <span className={cn("font-semibold", tone === "amber" ? "text-amber-800" : tone === "red" ? "text-rose-800" : "text-[#111827]")}>{value}</span>
    </div>
  );
}
