"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    CheckCircle2,
    CircleAlert,
    Printer,
    Download,
    Loader2,
    RefreshCw,
} from "lucide-react";
import type { OrderActivityLog as OrderActivityLogType, OrderStatus } from "@/types/order";
import {
    OrderStatusSection,
    OrderActivityLog,
    CustomerInfoCard,
    ShippingInfoCard,
    InternalNotes,
    OrderItemsList,
} from "@/components/admin/order-detail";
import type { AccountingOrderSnapshot } from "@/types/accounting";
import type { OrderItemCustomization } from "@/types/product-customization";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import "./print.css";

interface Order {
    id: string;
    order_number: string;
    status: OrderStatus;
    payment_method: string;
    payment_status: string;
    subtotal: number;
    shipping_cost: number;
    discount: number;
    total: number;
    notes?: string;
    internal_notes?: string;
    shipping_carrier?: string;
    tracking_number?: string;
    estimated_delivery?: string;
    shipping_address?: {
        firstName?: string;
        lastName?: string;
        address?: string;
        city?: string;
        country?: string;
        phone?: string;
        email?: string;
    };
    billing_address?: unknown;
    created_at: string;
    updated_at: string;
}

interface OrderItem {
    id: string;
    product_name: string;
    variant_name?: string;
    price: number;
    quantity: number;
    total: number;
    customizations?: OrderItemCustomization[];
    product?: {
        id?: string;
        images?: string[];
        category?: string;
        slug?: string;
    };
}

interface Customer {
    id: string;
    email: string;
    phone?: string;
    first_name?: string;
    last_name?: string;
    total_orders?: number;
    total_spent?: number;
}

interface CustomerOrder {
    id: string;
    order_number: string;
    status: string;
    total: number;
    created_at: string;
}

interface OrderDetailClientProps {
    order: Order;
    items: OrderItem[];
    activityLogs: OrderActivityLogType[];
    customer: Customer | null;
    customerOrders: CustomerOrder[];
    paymentMethodName: string;
    statusConfig: { label: string; color: string };
    accountingSnapshot: AccountingOrderSnapshot | null;
}


export function OrderDetailClient({
    order,
    items,
    activityLogs,
    customer,
    customerOrders,
    paymentMethodName,
    statusConfig,
    accountingSnapshot,
}: OrderDetailClientProps) {
    const router = useRouter();
    const [, startTransition] = useTransition();
    const [isAccountingActionLoading, setIsAccountingActionLoading] = useState(false);

    const [notes, setNotes] = useState(
        activityLogs.filter(
            (log) => log.action === "note_added" || log.action === "note_updated"
        )
    );
    const [logs, setLogs] = useState<OrderActivityLogType[]>(activityLogs);

    // Format activity logs for display
    const formattedLogs = logs.map((log) => ({
        ...log,
        adminName: log.adminName || "Admin",
    }));

    // Handle status change
    const handleStatusChange = async (newStatus: OrderStatus) => {
        const response = await fetch(`/api/admin/orders/${order.id}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus }),
        });

        if (response.ok) {
            // Add new activity log
            const newLog: OrderActivityLogType = {
                id: crypto.randomUUID(),
                orderId: order.id,
                action: "status_changed",
                oldValue: order.status,
                newValue: newStatus,
                adminName: "Admin",
                createdAt: new Date(),
            };
            setLogs([newLog, ...logs]);

            // Refresh page data
            startTransition(() => {
                router.refresh();
            });
        }
    };

    // Handle tracking update
    const handleTrackingUpdate = async (data: { carrier: string; trackingNumber: string }) => {
        const response = await fetch(`/api/admin/orders/${order.id}/shipping`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });

        if (response.ok) {
            const newLog: OrderActivityLogType = {
                id: crypto.randomUUID(),
                orderId: order.id,
                action: "shipping_updated",
                newValue: data,
                adminName: "Admin",
                createdAt: new Date(),
            };
            setLogs([newLog, ...logs]);

            startTransition(() => {
                router.refresh();
            });
        }
    };

    // Handle note add
    const handleAddNote = async (text: string) => {
        const response = await fetch(`/api/admin/orders/${order.id}/notes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, adminName: "Admin" }),
        });

        if (response.ok) {
            const { activityLog } = await response.json();
            const newLog: OrderActivityLogType = {
                ...activityLog,
                orderId: order.id,
                adminName: "Admin",
                createdAt: new Date(activityLog.createdAt),
            };
            setNotes([newLog, ...notes]);
            setLogs([newLog, ...logs]);
        }
    };

    // Handle note update
    const handleUpdateNote = async (noteId: string, text: string) => {
        const response = await fetch(`/api/admin/orders/${order.id}/notes`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ noteId, text }),
        });

        if (response.ok) {
            setNotes(
                notes.map((n) =>
                    n.id === noteId
                        ? { ...n, newValue: { text } }
                        : n
                )
            );
        }
    };

    // Handle note delete
    const handleDeleteNote = async (noteId: string) => {
        const response = await fetch(`/api/admin/orders/${order.id}/notes?noteId=${noteId}`, {
            method: "DELETE",
        });

        if (response.ok) {
            setNotes(notes.filter((n) => n.id !== noteId));
        }
    };

    const formattedDate = (() => {
        try {
            const date = new Date(order.created_at);
            if (isNaN(date.getTime())) return "Bilinmiyor";
            return date.toLocaleDateString("tr-TR", {
                day: "2-digit",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
            });
        } catch {
            return "Bilinmiyor";
        }
    })();

    const accountingStatusLabel: Record<string, string> = {
        idle: "Henüz Kuyruğa Alınmadı",
        queued: "Kuyrukta",
        syncing: "Senkron Ediliyor",
        synced: "Senkronlandı",
        failed: "Hata",
        manual_action_required: "Manuel Müdahale Gerekli",
    };

    const headerStatClass =
        "rounded-[12px] border border-[var(--admin-border)] bg-white px-4 py-3 shadow-sm backdrop-blur";

    const triggerInvoiceCreation = async () => {
        setIsAccountingActionLoading(true);
        try {
            const response = await fetch("/api/admin/accounting/invoices/create-from-order", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId: order.id }),
            });
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result?.error || "Fatura islemi basarisiz.");
            }
            window.alert("Fatura adayi olusturuldu ve senkron tetiklendi.");
            startTransition(() => {
                router.refresh();
            });
        } catch (error) {
            window.alert(error instanceof Error ? error.message : "Fatura olusturulamadi.");
        } finally {
            setIsAccountingActionLoading(false);
        }
    };

    return (
        <main className="min-h-screen bg-gradient-to-br from-[#faf7f2] via-[#f5eee7] to-[#ece0d3] text-stone-900">
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
                <div className="hidden" />
                <div className="hidden" />
                <div className="hidden" />
            </div>

            <div className="relative mx-auto max-w-none px-4 py-6 md:px-6 md:py-8 lg:px-8">
                <div className="space-y-6 animate-in fade-in duration-500">
            {/* Print Header - Only visible when printing */}
            <div className="hidden print:block text-center mb-6 pb-4 border-b-2 border-black">
                <h1 className="text-2xl font-bold">{STORE_RUNTIME.name}</h1>
                <p className="text-sm mt-1">Sipariş #{order.order_number}</p>
                <p className="text-sm text-gray-600">{formattedDate}</p>
            </div>

                    {/* Top Navigation & Status */}
                    <section className="overflow-hidden rounded-[12px] border border-[var(--admin-border)] bg-gradient-to-br from-white via-[#fffdfb] to-[#faf4ee] shadow-[var(--shadow-xs)] no-print">
                        <div className="flex flex-col gap-5 border-b border-[var(--admin-border)] px-5 py-5 md:px-8 md:py-6 xl:flex-row xl:items-center xl:justify-between">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                                <div className="space-y-3">
                                    <div className="flex flex-wrap items-center gap-3">
                                        <div className="inline-flex w-fit items-center rounded-full border border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--admin-accent)]">
                                            Sipariş Detayı
                                        </div>
                                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${statusConfig.color}`}>
                                            {statusConfig.label}
                                        </span>
                                    </div>
                                    <div>
                                        <h1 className="text-2xl font-semibold tracking-[-0.03em] text-stone-950 md:text-[2rem]">
                                            #{order.order_number}
                                        </h1>
                                        <p className="mt-1 text-sm text-stone-500 md:text-base">{formattedDate}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                                <Link
                                    href={`/admin/siparisler/${order.id}/yazdir`}
                                    target="_blank"
                                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border border-[var(--admin-accent-border)] bg-white px-4 py-3 text-sm font-medium text-[var(--admin-accent-hover)] shadow-sm transition-all hover:border-[var(--admin-accent-border)] hover:bg-[var(--admin-accent-soft)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)]"
                                >
                                    <Printer className="h-4 w-4" />
                                    Yazdır
                                </Link>
                                <button
                                    onClick={() => {
                                        alert("Fatura indiriliyor...");
                                    }}
                                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] bg-gradient-to-r from-[#FF6A00] to-[#d95a00] px-4 py-3 text-sm font-semibold text-white shadow-[var(--shadow-xs)] transition-all hover:from-[#f56a12] hover:to-[#c94d00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)]"
                                >
                                    <Download className="h-4 w-4" />
                                    Fatura
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-px bg-[#EEF1F4] md:grid-cols-3">
                            <div className={headerStatClass}>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">Ödeme</p>
                                <p className="mt-2 text-base font-semibold text-stone-900">{paymentMethodName}</p>
                            </div>
                            <div className={headerStatClass}>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">Sipariş Toplamı</p>
                                <p className="mt-2 text-base font-semibold text-stone-900">₺{order.total.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            </div>
                            <div className={headerStatClass}>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9a7c67]">Son Güncelleme</p>
                                <p className="mt-2 text-base font-semibold text-stone-900">
                                    {order.updated_at
                                        ? new Date(order.updated_at).toLocaleDateString("tr-TR", {
                                              day: "2-digit",
                                              month: "long",
                                              year: "numeric",
                                          })
                                        : "-"}
                                </p>
                            </div>
                        </div>
                    </section>

            {/* Timeline & Quick Actions - Combined */}
            <OrderStatusSection
                currentStatus={order.status}
                orderId={order.id}
                orderNumber={order.order_number}
                customerEmail={order.shipping_address?.email}
                customerPhone={order.shipping_address?.phone}
                onStatusChange={handleStatusChange}
            />

            {/* Accounting Snapshot */}
                    <div className="rounded-[12px] border border-[var(--admin-border)] bg-white p-4 shadow-[0_18px_50px_rgba(148,101,63,0.08)] backdrop-blur md:p-5">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                                <div className="inline-flex items-center rounded-full border border-[var(--admin-border)] bg-[#f9f2eb] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--admin-text-secondary)]">
                                    Muhasebe Durumu
                                </div>
                                <p className="mt-3 text-sm font-semibold text-stone-900">Fatura entegrasyonu ve senkron bilgisi</p>
                                <p className="text-xs text-stone-500">İşlem akışı korunarak görsel yüzey yenilendi.</p>
                    </div>
                    <button
                        onClick={triggerInvoiceCreation}
                        disabled={isAccountingActionLoading}
                                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] bg-gradient-to-r from-[#4b3529] to-[#2f241d] px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(75,53,41,0.2)] transition-all hover:from-[#5b4032] hover:to-[#3b2a21] disabled:opacity-60"
                    >
                        {isAccountingActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Fatura Kes
                    </button>
                </div>

                        <div className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-2 xl:grid-cols-5">
                            <div className="rounded-[12px] border border-[#f0e3d6] bg-[#fcf8f4] px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9a7c67]">Ödeme Yöntemi</p>
                        <p className="mt-2 font-semibold text-stone-900">{paymentMethodName}</p>
                    </div>
                            <div className="rounded-[12px] border border-[#f0e3d6] bg-[#fcf8f4] px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9a7c67]">Senkron Durumu</p>
                        <p className="mt-2 flex items-center gap-2 font-semibold text-stone-900">
                            {accountingSnapshot?.syncStatus === "synced" ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            ) : (
                                <CircleAlert className="w-4 h-4 text-amber-500" />
                            )}
                            {accountingStatusLabel[accountingSnapshot?.syncStatus || "idle"]}
                        </p>
                    </div>
                            <div className="rounded-[12px] border border-[#f0e3d6] bg-[#fcf8f4] px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9a7c67]">Sağlayıcı</p>
                        <p className="mt-2 font-semibold text-stone-900">{accountingSnapshot?.provider || "-"}</p>
                    </div>
                            <div className="rounded-[12px] border border-[#f0e3d6] bg-[#fcf8f4] px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9a7c67]">Fatura Numarası</p>
                        <p className="mt-2 font-semibold text-stone-900">{accountingSnapshot?.invoiceNo || "-"}</p>
                    </div>
                            <div className="rounded-[12px] border border-[#f0e3d6] bg-[#fcf8f4] px-4 py-3 md:col-span-2 xl:col-span-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9a7c67]">Fatura Linki</p>
                        {accountingSnapshot?.invoiceUrl ? (
                            <a
                                href={accountingSnapshot.invoiceUrl}
                                target="_blank"
                                rel="noreferrer"
                                        className="mt-2 block break-all text-sm font-semibold text-[var(--admin-accent-hover)] hover:text-[#a84300]"
                            >
                                Görüntüle
                            </a>
                        ) : (
                                    <p className="mt-2 font-semibold text-stone-900">-</p>
                        )}
                    </div>
                </div>

                {accountingSnapshot?.lastError && (
                            <div className="mt-4 rounded-[8px] border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
                        {accountingSnapshot.lastError}
                    </div>
                )}
            </div>

            {/* Order Items - Full Width */}
            <OrderItemsList
                items={items}
                subtotal={order.subtotal}
                shippingCost={order.shipping_cost}
                discount={order.discount}
                total={order.total}
            />

            {/* Middle Section: Customer & Shipping - More Compact */}
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 xl:gap-5">
                {/* Customer Info - Takes 2 columns on large screens */}
                {customer && (
                    <div className="lg:col-span-2">
                        <CustomerInfoCard
                            customer={{
                                id: customer.id,
                                firstName: customer.first_name,
                                lastName: customer.last_name,
                                email: customer.email,
                                phone: customer.phone,
                                totalOrders: customer.total_orders,
                                totalSpent: customer.total_spent,
                            }}
                            customerOrders={customerOrders.map((o) => ({
                                id: o.id,
                                orderNumber: o.order_number,
                                status: o.status,
                                total: o.total,
                                createdAt: o.created_at,
                            }))}
                        />
                    </div>
                )}

                {/* Shipping Info - Compact */}
                <div className="lg:col-span-1">
                    <ShippingInfoCard
                        trackingNumber={order.tracking_number}
                        carrier={order.shipping_carrier}
                        estimatedDelivery={order.estimated_delivery}
                        shippingAddress={order.shipping_address}
                        onTrackingUpdate={handleTrackingUpdate}
                    />
                </div>
            </div>

            {/* Bottom Section: Activity Log & Notes - Side by Side with better use of space */}
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:gap-5">
                {/* Activity Log */}
                <OrderActivityLog activities={formattedLogs} />

                {/* Internal Notes */}
                <InternalNotes
                    notes={notes.map((n) => ({
                        id: n.id,
                        text: typeof n.newValue === "object" && n.newValue !== null && "text" in n.newValue ? String((n.newValue as { text?: string }).text || "") : "",
                        adminName: n.adminName,
                        createdAt: new Date(n.createdAt),
                    }))}
                    customerNote={order.notes}
                    onAddNote={handleAddNote}
                    onUpdateNote={handleUpdateNote}
                    onDeleteNote={handleDeleteNote}
                    currentAdminName="Admin"
                />
            </div>

            {/* Print Footer - Only visible when printing */}
            <div className="hidden print:block text-center mt-6 pt-4 border-t border-gray-300 text-xs text-gray-500">
                <p>{STORE_RUNTIME.name} | {STORE_RUNTIME.storefrontUrl.replace(/^https?:\/\//, "")}</p>
                <p>Bu belge bilgisayar ortamında otomatik olarak üretilmiştir.</p>
            </div>
                </div>
            </div>
        </main>
    );
}
